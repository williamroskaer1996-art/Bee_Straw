-- Bee Straw database (Supabase / Postgres).
-- Run once in the Supabase SQL editor. Everyone can read stories; only signed-in people can add,
-- and only to their own straws. Locations are stored rounded to 0.01° (about 1 km) to protect homes.

-- People -----------------------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default 'Beekeeper' check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

-- First name only from Google, otherwise "Beekeeper". Email addresses are never shown.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(split_part(new.raw_user_meta_data->>'full_name', ' ', 1), ''), 'Beekeeper'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Straws (one per printed straw = one Straw Story) ---------------------------------------------
create table if not exists public.straws (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  lat numeric(5,2) not null check (lat between -90 and 90),
  lon numeric(6,2) not null check (lon between -180 and 180),
  place_name text check (char_length(place_name) <= 80),
  printer text check (char_length(printer) <= 60),
  install_month smallint check (install_month between 0 and 11),
  fuse_line_mm numeric(4,2),
  predicted_release_months numeric(4,1),
  actual_release_months numeric(4,1),
  weather_source text check (weather_source in ('live', 'example')),
  created_at timestamptz not null default now()
);

-- Check-ins -------------------------------------------------------------------------------------
-- stage: 0 Printed, 1 Installed, 2 Bees seen, 3 Sealed, 4 Month 3, 5 Month 6, 6 Winter,
--        7 New bees out, 8 Released, 9 Gone
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  straw_id uuid not null references public.straws on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  stage smallint not null check (stage between 0 and 9),
  bees text check (bees in ('Yes', 'Not yet', 'Not sure')),
  cap text check (cap in ('Yes', 'No', 'Holes in it')),
  standing text check (standing in ('Upright', 'Leaning', 'Fallen')),
  note text check (char_length(note) <= 500),
  photo_path text,
  created_at timestamptz not null default now()
);

-- Comments --------------------------------------------------------------------------------------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  straw_id uuid not null references public.straws on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

-- Print file requests ("Email me when it's ready"), private to each user ----------------------------
create table if not exists public.print_file_requests (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  printer text check (char_length(printer) <= 60),
  created_at timestamptz not null default now()
);

create index if not exists checkins_straw_idx on public.checkins (straw_id, created_at);
create index if not exists comments_straw_idx on public.comments (straw_id, created_at);

-- Row level security ------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.straws enable row level security;
alter table public.checkins enable row level security;
alter table public.comments enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for update using (auth.uid() = id);

drop policy if exists "straws readable" on public.straws;
create policy "straws readable" on public.straws for select using (true);
drop policy if exists "add own straw" on public.straws;
create policy "add own straw" on public.straws for insert with check (auth.uid() = user_id);
drop policy if exists "edit own straw" on public.straws;
create policy "edit own straw" on public.straws for update using (auth.uid() = user_id);
drop policy if exists "delete own straw" on public.straws;
create policy "delete own straw" on public.straws for delete using (auth.uid() = user_id);

alter table public.print_file_requests enable row level security;
drop policy if exists "own print request" on public.print_file_requests;
create policy "own print request" on public.print_file_requests for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "checkins readable" on public.checkins;
create policy "checkins readable" on public.checkins for select using (true);
drop policy if exists "check in on own straw" on public.checkins;
create policy "check in on own straw" on public.checkins for insert with check (
  auth.uid() = user_id and exists (select 1 from public.straws s where s.id = straw_id and s.user_id = auth.uid())
);
drop policy if exists "delete own checkin" on public.checkins;
create policy "delete own checkin" on public.checkins for delete using (auth.uid() = user_id);

drop policy if exists "comments readable" on public.comments;
create policy "comments readable" on public.comments for select using (true);
drop policy if exists "add own comment" on public.comments;
create policy "add own comment" on public.comments for insert with check (auth.uid() = user_id);
drop policy if exists "delete own comment" on public.comments;
create policy "delete own comment" on public.comments for delete using (auth.uid() = user_id);

-- Feed: one row per straw with its latest check-in and counts ----------------------------------------
create or replace view public.story_feed with (security_invoker = true) as
select s.id, s.lat, s.lon, s.place_name, s.printer, s.predicted_release_months, s.actual_release_months, s.created_at,
       p.display_name,
       coalesce(last.stage, 0) as stage, last.note as last_note, last.created_at as last_at, last.photo_path as last_photo,
       (select count(*) from public.checkins c where c.straw_id = s.id) as checkin_count,
       (select count(*) from public.comments m where m.straw_id = s.id) as comment_count
from public.straws s
left join public.profiles p on p.id = s.user_id
left join lateral (
  select c.stage, c.note, c.created_at, c.photo_path from public.checkins c
  where c.straw_id = s.id order by c.created_at desc limit 1
) last on true;

-- Photos ----------------------------------------------------------------------------------------------
-- Public bucket; each person can only upload into a folder named after their own user id.
insert into storage.buckets (id, name, public) values ('checkin-photos', 'checkin-photos', true)
on conflict (id) do nothing;

drop policy if exists "upload own photos" on storage.objects;
create policy "upload own photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'checkin-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "delete own photos" on storage.objects;
create policy "delete own photos" on storage.objects for delete to authenticated
  using (bucket_id = 'checkin-photos' and (storage.foldername(name))[1] = auth.uid()::text);

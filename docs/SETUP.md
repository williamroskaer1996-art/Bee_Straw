# Setting up the Bee Straw website

The site in `site/` is plain HTML, CSS and JavaScript. It runs without any keys in **preview mode**: example stories, example climates when live weather is unavailable, and sign-in that saves nothing. Each step below switches on one real service. All keys go in `site/assets/js/config.js`.

## 1. Publish on GitHub Pages

1. In the repository on GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Merge the work into `main`. The workflow `.github/workflows/pages.yml` publishes `site/` on every push to `main` that touches it.
3. The site appears at `https://williamroskaer1996-art.github.io/Bee_Straw/`.

Live weather (Open-Meteo) starts working here: it needs no key. Open-Meteo is free for non-commercial use.

## 2. Accounts and Community (Supabase, free tier)

1. Create a project at [supabase.com](https://supabase.com). Pick an **EU region** (for example Frankfurt), so personal data stays in the EU.
2. **SQL editor → New query**: paste all of `supabase/schema.sql` and run it. This creates the tables, the privacy rules (row level security) and the photo bucket.
3. **Project Settings → API**: copy the **Project URL** and the **anon public key** into `config.js` as `supabaseUrl` and `supabaseAnonKey`. The anon key is meant to be public; the rules in `schema.sql` decide who can read and write.
4. **Authentication → URL Configuration**: set **Site URL** to the Pages address from step 1 and add it under **Redirect URLs**.
5. **Email sign-in** works straight away (Supabase sends the magic link). For real use, add your own SMTP sender under **Authentication → Emails**: the built-in sender only allows a few emails per hour.
6. **Google sign-in**:
   1. In [Google Cloud Console](https://console.cloud.google.com): create a project, then **APIs & Services → OAuth consent screen** (External, app name "Bee Straw", your email).
   2. **Credentials → Create credentials → OAuth client ID → Web application**. Under **Authorised redirect URIs** add the callback shown in Supabase under **Authentication → Providers → Google** (it looks like `https://<project>.supabase.co/auth/v1/callback`).
   3. Paste the Google **Client ID** and **Client secret** into that Supabase Google provider and switch it on.

What is stored: a first name (from Google) or "Beekeeper", straws with their location **rounded to 0.01° (about 1 km)**, check-ins, comments and photos. Email addresses are never shown on the site.

## 3. Google Maps (optional)

1. In Google Cloud Console: enable the **Maps JavaScript API** and the **Geocoding API**, and set up billing (Google gives a monthly free allowance).
2. **Credentials → Create credentials → API key**. Restrict it: **Application restrictions → Websites** → your Pages address; **API restrictions** → the two APIs above.
3. Create a **Map ID** under **Google Maps Platform → Map management** (vector, for the draggable pin).
4. Put the key in `config.js` as `googleMapsApiKey`. If the Map ID is not `beestraw`, change `mapId` in `assets/js/build.js`.

Without a key, Build your straw uses the built-in preview map.

## Before going public

- The decay estimate on Build your straw is a simplified, literature-based model (`assets/js/build.js`), labelled "model output, uncalibrated". Have it checked against the full decay engine.
- Photos on the home page are CC BY 2.0 by Orangeaurochs via Wikimedia Commons, credited on the page.
- Add a privacy notice and a short moderation plan for Community before opening sign-ups.

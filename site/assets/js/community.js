// Community: Straw Stories feed, map, story view and check-in form.
// Front end only: stories are examples, and posting asks the visitor to sign in (accounts come later).
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  if (!$("stories")) return;
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Stage order matches the install guide's check-ins.
  const STAGES = ["Printed", "Installed", "Bees seen", "Sealed", "Month 3", "Month 6", "Winter", "New bees out", "Released", "Gone"];
  const FILTERS = [
    { id: "all", label: "All", test: () => true },
    { id: "nesting", label: "Nesting", test: (s) => s.stage >= 1 && s.stage <= 3 },
    { id: "waiting", label: "Waiting for spring", test: (s) => s.stage >= 4 && s.stage <= 6 },
    { id: "out", label: "New bees out", test: (s) => s.stage === 7 },
    { id: "released", label: "Released", test: (s) => s.stage >= 8 }
  ];

  // Example stories. Not real people. Locations are rounded to ~1 km.
  const STORIES = [
    { id: "anna", who: "Anna", place: "Utrecht, NL", lat: 52.09, lon: 5.12, printer: "Prusa MK4", stage: 2, predicted: 13.0, actual: null,
      entries: [
        { stage: 0, when: "28 Feb", text: "Printed in two parts. The push-fit joint clicked in first time." },
        { stage: 1, when: "12 Mar", text: "In the ground by the herb bed, facing south-east." },
        { stage: 2, when: "8 Apr", text: "First bee went in this morning!" }
      ],
      comments: [{ who: "Jonas", text: "Same here, mine took 3 weeks to get the first visitor." }] },
    { id: "jonas", who: "Jonas", place: "Aarhus, DK", lat: 56.15, lon: 10.21, printer: "Bambu Lab P1S", stage: 3, predicted: 13.0, actual: null,
      entries: [
        { stage: 1, when: "2 Apr", text: "Installed next to the allotment shed." },
        { stage: 2, when: "29 Apr", text: "Pollen at the entrance." },
        { stage: 3, when: "6 Jun", text: "Mud cap is on. Tube sealed." }
      ],
      comments: [] },
    { id: "sofie", who: "Sofie", place: "Gent, BE", lat: 51.05, lon: 3.72, printer: "Creality K1", stage: 5, predicted: 13.0, actual: null,
      entries: [
        { stage: 1, when: "15 Mar", text: "Installed in the school garden with my class." },
        { stage: 3, when: "1 Jun", text: "Sealed. The kids are counting the days." },
        { stage: 5, when: "10 Sep", text: "Gave it a gentle nudge: still firm. The bulb looks rougher." }
      ],
      comments: [{ who: "Luca", text: "Love that a class is following it." }] },
    { id: "luca", who: "Luca", place: "Bologna, IT", lat: 44.49, lon: 11.34, printer: "Prusa Core One", stage: 9, predicted: 13.0, actual: 10.0,
      entries: [
        { stage: 1, when: "20 Feb", text: "Installed under the olive tree." },
        { stage: 3, when: "18 Apr", text: "Sealed after a busy month." },
        { stage: 8, when: "22 Dec", text: "Released at month 10, earlier than predicted. Wet autumn." },
        { stage: 9, when: "5 Mar", text: "New bees came out of the fallen tube anyway." }
      ],
      comments: [{ who: "Bee Straw team", text: "Thanks Luca, this is exactly the data we need. Your soil looks faster than the model." }] },
    { id: "marta", who: "Marta", place: "Kraków, PL", lat: 50.06, lon: 19.94, printer: "Ender-3 V3", stage: 1, predicted: 13.0, actual: null,
      entries: [{ stage: 1, when: "10 Apr", text: "Installed facing south-east, near the lavender." }],
      comments: [] },
    { id: "erik", who: "Erik", place: "Uppsala, SE", lat: 59.86, lon: 17.64, printer: "Voron 2.4", stage: 6, predicted: 14.4, actual: null,
      entries: [
        { stage: 1, when: "18 Apr", text: "Installed. Ground still cold." },
        { stage: 3, when: "20 Jul", text: "Sealed late in the season." },
        { stage: 6, when: "14 Jan", text: "Still standing after a hard winter and −18 °C." }
      ],
      comments: [] }
  ];

  // ---------- Map (same projection as the Build preview map)
  const BOX = { lon0: -11, lon1: 31, lat0: 35, lat1: 71, w: 420, h: 360 };
  const px = (lon) => ((lon - BOX.lon0) / (BOX.lon1 - BOX.lon0)) * BOX.w;
  const py = (lat) => ((BOX.lat1 - lat) / (BOX.lat1 - BOX.lat0)) * BOX.h;
  function drawMap(list) {
    let g = "";
    for (let lon = -10; lon <= 30; lon += 10) g += '<line x1="' + px(lon) + '" y1="0" x2="' + px(lon) + '" y2="' + BOX.h + '"/>';
    for (let lat = 40; lat <= 70; lat += 10) g += '<line x1="0" y1="' + py(lat) + '" x2="' + BOX.w + '" y2="' + py(lat) + '"/><text x="4" y="' + (py(lat) - 4) + '">' + lat + "°N</text>";
    const dots = list.map((s) =>
      '<g class="cm-dot' + (s.stage >= 8 ? " done" : "") + '" data-id="' + s.id + '" tabindex="0" role="button" aria-label="' + esc(s.who + ", " + s.place + ": " + STAGES[s.stage]) + '">' +
      '<circle cx="' + px(s.lon) + '" cy="' + py(s.lat) + '" r="7"/><text x="' + (px(s.lon) + 11) + '" y="' + (py(s.lat) + 4) + '">' + esc(s.place.split(",")[0]) + "</text></g>").join("");
    $("community-map").innerHTML =
      '<svg class="pm" viewBox="0 0 ' + BOX.w + " " + BOX.h + '" role="img" aria-label="Map of Straw Stories across Europe"><rect class="pm-bg" width="' + BOX.w + '" height="' + BOX.h + '"/><g class="pm-grid">' + g + "</g>" + dots + "</svg>" +
      '<p class="pm-note">Example stories. Live site: Google Maps.</p>';
  }
  $("community-map").addEventListener("click", (e) => { const d = e.target.closest(".cm-dot"); if (d) openStory(d.dataset.id); });
  $("community-map").addEventListener("keydown", (e) => { const d = e.target.closest(".cm-dot"); if (d && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openStory(d.dataset.id); } });

  // ---------- Data: real stories from Supabase when accounts are on, otherwise the examples
  const AUTH = window.BeeAuth || { enabled: false, onChange: function () {} };
  const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const photoUrl = (path) => (path && AUTH.client ? AUTH.client.storage.from("checkin-photos").getPublicUrl(path).data.publicUrl : null);
  function fromExample(s) {
    const last = s.entries[s.entries.length - 1];
    return Object.assign({}, s, { example: true, lastWhen: last.when, lastText: last.text, photo: null, checkinCount: s.entries.length, commentCount: s.comments.length });
  }
  function fromRow(r) {
    return { id: r.id, who: r.display_name || "Beekeeper", place: r.place_name || "Somewhere in Europe", lat: +r.lat, lon: +r.lon, printer: r.printer || "",
      stage: r.stage, predicted: r.predicted_release_months != null ? +r.predicted_release_months : null, actual: r.actual_release_months != null ? +r.actual_release_months : null,
      lastWhen: fmtDate(r.last_at || r.created_at), lastText: r.last_note || STAGES[r.stage], photo: photoUrl(r.last_photo),
      checkinCount: +r.checkin_count, commentCount: +r.comment_count, example: false, entries: null, comments: null };
  }
  let stories = STORIES.map(fromExample);
  let showingExamples = true;
  function loadFeed() {
    if (!AUTH.client) { renderFeed(); return; }
    AUTH.client.from("story_feed").select("*").order("created_at", { ascending: false }).limit(200).then(function (r) {
      if (r.error || !r.data || !r.data.length) { stories = STORIES.map(fromExample); showingExamples = true; }
      else { stories = r.data.map(fromRow); showingExamples = false; }
      renderFeed();
    });
  }

  // ---------- Feed
  let filter = "all";
  function timeline(stage) {
    let t = "";
    for (let k = 1; k < STAGES.length; k++) t += '<i class="' + (k < stage ? "done" : k === stage ? "now" : "") + '"></i>';
    return '<div class="timeline" role="img" aria-label="Stage: ' + STAGES[stage] + '">' + t + "</div>";
  }
  const photoBox = (cls, url) => url ? '<div class="' + cls + '"><img src="' + esc(url) + '" alt="" loading="lazy"></div>' : '<div class="' + cls + '"><span class="mono">photo</span></div>';
  function renderFeed() {
    const list = stories.filter(FILTERS.find((f) => f.id === filter).test);
    $("stories-label").textContent = showingExamples ? "Latest stories · examples" : "Latest stories";
    $("stories").innerHTML = list.length ? list.map((s) =>
      '<button class="story" type="button" data-id="' + esc(s.id) + '">' + photoBox("story-photo", s.photo) +
      '<div class="body"><div class="meta"><span>' + esc(s.who + " · " + s.place) + '</span><span class="mono">' + esc(s.lastWhen) + "</span></div>" +
      "<h3>" + esc(s.lastText) + "</h3>" + timeline(s.stage) +
      '<div class="meta"><span>' + STAGES[s.stage] + "</span><span>" + s.checkinCount + (s.checkinCount === 1 ? " check-in" : " check-ins") + (s.commentCount ? " · " + s.commentCount + " comment" + (s.commentCount > 1 ? "s" : "") : "") + "</span></div></div></button>"
    ).join("") : '<p class="muted">No stories at this stage yet.</p>';
    drawMap(list);
    $("story-count").textContent = list.length + (list.length === 1 ? " story" : " stories");
  }
  $("community-filters").innerHTML = FILTERS.map((f) => '<button type="button" class="chip" data-f="' + f.id + '" aria-pressed="' + (f.id === filter) + '">' + f.label + "</button>").join("");
  $("community-filters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]"); if (!b) return;
    filter = b.dataset.f;
    $("community-filters").querySelectorAll("[data-f]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.f === filter)));
    renderFeed();
  });
  $("stories").addEventListener("click", (e) => { const c = e.target.closest(".story"); if (c) openStory(c.dataset.id); });

  // ---------- Story view
  const storyDlg = $("story");
  function loadDetails(s) {
    if (s.example || s.entries) return Promise.resolve(s);
    return Promise.all([
      AUTH.client.from("checkins").select("stage, note, photo_path, created_at").eq("straw_id", s.id).order("created_at"),
      AUTH.client.from("comments").select("body, created_at, profiles(display_name)").eq("straw_id", s.id).order("created_at")
    ]).then(function (r) {
      s.entries = (r[0].data || []).map((c) => ({ stage: c.stage, when: fmtDate(c.created_at), text: c.note || STAGES[c.stage], photo: photoUrl(c.photo_path) }));
      s.comments = (r[1].data || []).map((c) => ({ who: (c.profiles && c.profiles.display_name) || "Beekeeper", text: c.body }));
      return s;
    });
  }
  function openStory(id) {
    const s = stories.find((x) => x.id === id); if (!s) return;
    $("story-body").innerHTML = '<p class="muted">Loading story…</p>';
    storyDlg.showModal();
    loadDetails(s).then(renderStory);
  }
  function renderStory(s) {
    const pred = s.predicted != null ? s.predicted.toFixed(1) + " months" : "–";
    const timing = s.actual != null && s.predicted != null
      ? "<dt>Predicted release</dt><dd>" + pred + "</dd><dt>Actual release</dt><dd>" + s.actual.toFixed(1) + " months</dd><dt>Difference</dt><dd>" + (s.actual - s.predicted > 0 ? "+" : "") + (s.actual - s.predicted).toFixed(1) + " months</dd>"
      : "<dt>Predicted release</dt><dd>" + pred + "</dd><dt>Actual release</dt><dd>" + (s.actual != null ? s.actual.toFixed(1) + " months" : "not yet") + "</dd>";
    $("story-body").innerHTML =
      '<div class="story-head"><div><span class="label">Straw Story' + (s.example ? " · example" : "") + '</span><h2 id="story-title">' + esc(s.who + " · " + s.place) + '</h2><p class="muted">' + esc((s.printer ? s.printer + " · " : "") + STAGES[s.stage]) + "</p></div></div>" +
      timeline(s.stage) + '<dl class="kv">' + timing + "</dl>" +
      '<p class="muted" style="font-size:.85rem">Every released straw tells us how fast that soil really is. This is how the model learns.</p>' +
      '<ol class="entries">' + (s.entries.length ? s.entries.slice().reverse().map((en) =>
        "<li>" + photoBox("entry-photo", en.photo) + '<div><div class="meta"><strong>' + STAGES[en.stage] + '</strong><span class="mono">' + esc(en.when) + "</span></div><p>" + esc(en.text) + "</p></div></li>").join("") : '<li class="muted">No check-ins yet.</li>') + "</ol>" +
      '<div class="comments"><h3>Comments</h3><div id="comment-list">' + (s.comments.length ? s.comments.map((c) => "<p><strong>" + esc(c.who) + "</strong> " + esc(c.text) + "</p>").join("") : '<p class="muted">No comments yet.</p>') + "</div>" +
      '<form class="comment-form" id="comment-form"><label class="sr-only" for="comment-text">Write a comment</label><input id="comment-text" type="text" maxlength="1000" placeholder="Write a comment"><button class="btn small" type="submit">Post</button></form><p class="muted" id="comment-status" role="status" style="font-size:.85rem"></p></div>';
    $("comment-form").addEventListener("submit", function (e) {
      e.preventDefault();
      const text = $("comment-text").value.trim(); if (!text) return;
      if (s.example) { $("comment-status").textContent = "This is an example story, so comments can't be added here."; return; }
      AUTH.require("Sign in to comment on Straw Stories.", function () {
        AUTH.client.from("comments").insert({ straw_id: s.id, body: text }).then(function (r) {
          if (r.error) { $("comment-status").textContent = "Couldn't post: " + r.error.message; return; }
          s.comments = null; s.entries = null; s.commentCount++;
          loadDetails(s).then(renderStory); renderFeed();
        });
      });
    });
  }
  storyDlg.querySelector("[data-close]").addEventListener("click", () => storyDlg.close());
  storyDlg.addEventListener("click", (e) => { if (e.target === storyDlg) storyDlg.close(); });
  window.BeeCommunity = { openStory: function (id) { loadFeedThen(function () { openStory(id); }); } };
  function loadFeedThen(cb) {
    if (!AUTH.client) { cb(); return; }
    AUTH.client.from("story_feed").select("*").order("created_at", { ascending: false }).limit(200).then(function (r) {
      if (!r.error && r.data && r.data.length) { stories = r.data.map(fromRow); showingExamples = false; }
      renderFeed(); cb();
    });
  }

  // ---------- Check-in form (what's happening + three taps + optional photo)
  const checkDlg = $("checkin");
  const QUESTIONS = [
    { id: "bees", q: "Bees going in and out?", a: ["Yes", "Not yet", "Not sure"] },
    { id: "cap", q: "Mud cap on the entrance?", a: ["Yes", "No", "Holes in it"] },
    { id: "stand", q: "Is it still standing?", a: ["Upright", "Leaning", "Fallen"] }
  ];
  let myStraws = [];
  function openCheckin() {
    const chips = (name, opts) => '<div class="chips">' + opts.map((o) => '<label class="chip"><input type="radio" name="' + name + '" value="' + esc(o.v) + '"><span>' + esc(o.l) + "</span></label>").join("") + "</div>";
    $("checkin-qs").innerHTML =
      '<div class="q" id="checkin-straw-row" hidden><label for="checkin-straw" class="muted" style="font-size:.9rem">Which straw?</label><select id="checkin-straw"></select></div>' +
      '<fieldset class="q"><legend>What’s happening?</legend>' + chips("stage", STAGES.slice(1).map((l, i) => ({ v: String(i + 1), l: l }))) + "</fieldset>" +
      QUESTIONS.map((q) => '<fieldset class="q"><legend>' + q.q + "</legend>" + chips(q.id, q.a.map((a) => ({ v: a, l: a }))) + "</fieldset>").join("");
    $("checkin-photo-preview").innerHTML = ""; $("checkin-photo").value = ""; $("checkin-note").value = ""; $("checkin-status").textContent = "";
    if (AUTH.user && AUTH.client) loadMyStraws();
    checkDlg.showModal();
  }
  function loadMyStraws() {
    return AUTH.client.from("straws").select("id, place_name, created_at").eq("user_id", AUTH.user.id).order("created_at", { ascending: false }).then(function (r) {
      myStraws = r.data || [];
      const row = $("checkin-straw-row");
      if (!row) return;
      if (myStraws.length > 1) {
        row.hidden = false;
        $("checkin-straw").innerHTML = myStraws.map((x) => '<option value="' + x.id + '">' + esc((x.place_name || "My straw") + " · " + fmtDate(x.created_at)) + "</option>").join("");
      }
      if (!myStraws.length) $("checkin-status").textContent = "You don't have a straw yet. Start your story on the Build page first.";
    });
  }
  $("checkin-photo").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0]; const box = $("checkin-photo-preview");
    box.innerHTML = "";
    if (!f || !f.type.startsWith("image/")) return;
    const img = document.createElement("img"); img.alt = "Your photo"; img.src = URL.createObjectURL(f); box.appendChild(img);
  });
  // Shrink photos to at most 1600 px before upload.
  function shrink(file) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(resolve, "image/jpeg", 0.85);
      };
      img.onerror = function () { resolve(file); };
      img.src = URL.createObjectURL(file);
    });
  }
  $("checkin-form").addEventListener("submit", function (e) {
    e.preventDefault();
    const form = e.target, val = (n) => { const x = form.querySelector('input[name="' + n + '"]:checked'); return x ? x.value : null; };
    const stage = val("stage");
    if (!stage) { $("checkin-status").textContent = "Pick what's happening first."; return; }
    const data = { stage: +stage, bees: val("bees"), cap: val("cap"), standing: val("stand"), note: $("checkin-note").value.trim() || null };
    const file = $("checkin-photo").files && $("checkin-photo").files[0];
    AUTH.require("Sign in to save your check-in to your Straw Story.", function (user) {
      if (!checkDlg.open) checkDlg.showModal();
      (myStraws.length ? Promise.resolve() : loadMyStraws()).then(function () {
        if (!myStraws.length) { $("checkin-status").textContent = "You don't have a straw yet. Start your story on the Build page first."; return; }
        const strawId = myStraws.length > 1 ? $("checkin-straw").value : myStraws[0].id;
        $("checkin-status").textContent = "Saving…";
        const upload = file ? shrink(file).then(function (blob) {
          const path = user.id + "/" + Date.now() + ".jpg";
          return AUTH.client.storage.from("checkin-photos").upload(path, blob, { contentType: "image/jpeg" }).then((r) => { if (r.error) throw r.error; return path; });
        }) : Promise.resolve(null);
        upload.then(function (path) {
          return AUTH.client.from("checkins").insert(Object.assign({ straw_id: strawId, photo_path: path }, data));
        }).then(function (r) {
          if (r && r.error) throw r.error;
          if (data.stage === 8) {
            const straw = myStraws.find((x) => x.id === strawId);
            const months = (Date.now() - new Date(straw.created_at).getTime()) / (30.44 * 864e5);
            return AUTH.client.from("straws").update({ actual_release_months: Math.round(months * 10) / 10 }).eq("id", strawId);
          }
        }).then(function () {
          $("checkin-status").textContent = "Saved. Thank you!";
          setTimeout(function () { checkDlg.close(); }, 900);
          loadFeed();
        }).catch(function (err) { $("checkin-status").textContent = "Couldn't save: " + err.message; });
      });
    });
  });
  checkDlg.querySelector("[data-close]").addEventListener("click", () => checkDlg.close());
  document.querySelectorAll("[data-checkin]").forEach((b) => b.addEventListener("click", openCheckin));

  // Reload when accounts connect or someone signs in/out.
  let lastUser;
  AUTH.onChange(function (u) { const key = (AUTH.client ? "db:" : "") + (u ? u.id : ""); if (key === lastUser) return; lastUser = key; myStraws = []; loadFeed(); });
  renderFeed();
})();

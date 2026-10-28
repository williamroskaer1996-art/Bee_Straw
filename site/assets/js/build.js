// Build your straw: place → site → decay preview → printer → download.
// The decay estimate uses published PHA decay rates and the pin's own weather, not Mateo's full engine:
//   wear per day = 0.6 µm/day/face at 25 °C (range 0.3–1.4), halved per 10 °C colder (Q10 = 2, assumed),
//   ×1.5 because every fuse line is quenched [assumed from literature], counted only on days the soil is wet.
// The fuse is a graded gyroid: sheets thick on one side, thin on the other (thin = 0.67 × thick, as in the
// course fuse, 0.20 → 0.133 mm). The thick sheets are sized to be worn through from both faces 12 months
// after installing, so the straw lets go then; the thin side goes first, so it tips that way.
// Every number it shows is model output, uncalibrated.
(function () {
  "use strict";
  const CFG = window.BEESTRAW_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  if (!$("build-map")) return;

  // ---------- Example climates (used when live weather is unavailable; values are illustrative)
  // t: mean soil temp °C, a: seasonal amplitude °C, w: mean share of wet days, wa: extra wetness in winter.
  const EXAMPLES = [
    { name: "De Bilt, NL", lat: 52.10, lon: 5.18, t: 10.6, a: 7.0, w: 0.62, wa: 0.15, rain: 830, soil: "Sandy loam" },
    { name: "Aarhus, DK", lat: 56.16, lon: 10.20, t: 8.6, a: 7.5, w: 0.58, wa: 0.15, rain: 680, soil: "Loam" },
    { name: "Uppsala, SE", lat: 59.86, lon: 17.64, t: 6.6, a: 9.5, w: 0.50, wa: 0.10, rain: 560, soil: "Clay" },
    { name: "Munich, DE", lat: 48.14, lon: 11.58, t: 9.4, a: 9.0, w: 0.60, wa: 0.05, rain: 960, soil: "Gravelly loam" },
    { name: "Kraków, PL", lat: 50.06, lon: 19.94, t: 9.0, a: 10.0, w: 0.55, wa: 0.08, rain: 680, soil: "Loess" },
    { name: "Lyon, FR", lat: 45.76, lon: 4.84, t: 12.5, a: 9.0, w: 0.50, wa: 0.15, rain: 830, soil: "Alluvial loam" },
    { name: "Bologna, IT", lat: 44.49, lon: 11.34, t: 14.4, a: 10.0, w: 0.42, wa: 0.22, rain: 700, soil: "Silty clay" },
    { name: "Valencia, ES", lat: 39.47, lon: -0.38, t: 18.3, a: 7.5, w: 0.27, wa: 0.15, rain: 450, soil: "Calcareous loam" }
  ];

  // ---------- Decay model
  const R25 = 0.6;          // µm/day/face at 25 °C, wet soil [literature, engine default]
  const Q10 = 2;            // [assumed]
  const QUENCH = 1.5;       // quenched fuse lines wear faster [assumed from literature]
  const TARGET = 12;        // months from installing until the straw lets go (William, 28 Oct 2026)
  const RATIO = 0.133 / 0.2; // thin side / thick side sheet thickness, as in the course fuse
  const THINNEST_PRINTED = 0.10; // mm: thinner than any single line we have printed (Plate 4) [measured]
  const DAYS_PER_MONTH = 30.44;

  function rate(tSoil) { return tSoil <= 4 ? 0 : QUENCH * R25 * Math.pow(Q10, (tSoil - 25) / 10); }

  // Monthly climate (12 × {t, wet}) from an example's parameters.
  function exampleMonths(e) {
    const out = [];
    for (let m = 0; m < 12; m++) {
      const t = e.t + e.a * Math.cos((2 * Math.PI * (m - 6.5)) / 12);
      const wet = Math.min(0.95, Math.max(0.05, e.w + e.wa * Math.cos((2 * Math.PI * (m - 0.5)) / 12)));
      out.push({ t: t, wet: wet });
    }
    return out;
  }
  // Daily wear dose series (µm/face) from a start month over n months.
  function cumulative(months, startMonth, nMonths) {
    const cum = [0];
    let d = 0;
    const days = Math.round(nMonths * DAYS_PER_MONTH);
    for (let i = 0; i < days; i++) {
      const m = (startMonth + Math.floor(i / DAYS_PER_MONTH)) % 12;
      d += rate(months[m].t) * months[m].wet;
      cum.push(d);
    }
    return cum;
  }
  function doseAt(cum, month) { return cum[Math.min(cum.length - 1, Math.round(month * DAYS_PER_MONTH))]; }
  function releaseMonth(cum, threshold) {
    for (let i = 0; i < cum.length; i++) if (cum[i] >= threshold) return i / DAYS_PER_MONTH;
    return Infinity;
  }
  const DE_BILT = { lat: 52.10, lon: 5.18 };
  const PIN_KEY = "beestraw-pin"; // last pin, remembered in this browser

  // ---------- State
  const state = { site: null, climate: null, source: "example", install: 2, month: 0, result: null, dir: "" };

  // ---------- Map: Google Maps when a key is set, otherwise a satellite map (Leaflet), otherwise a preview map
  const mapEl = $("build-map");
  let gmap = null, gmarker = null;
  function loadGoogle() {
    if (!CFG.googleMapsApiKey) return Promise.reject(new Error("no key"));
    return new Promise(function (resolve, reject) {
      window.__beeMapsReady = resolve;
      const s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(CFG.googleMapsApiKey) + "&callback=__beeMapsReady&v=weekly&libraries=marker";
      s.async = true; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function initGoogle() {
    mapEl.innerHTML = "";
    gmap = new google.maps.Map(mapEl, { center: { lat: 50, lng: 9 }, zoom: 4, mapTypeId: "hybrid", streetViewControl: false, mapId: "beestraw",
      draggableCursor: "crosshair", draggingCursor: "grabbing", clickableIcons: false });
    gmarker = new google.maps.marker.AdvancedMarkerElement({ map: gmap, gmpDraggable: true });
    gmap.addListener("click", function (e) { setPlace(e.latLng.lat(), e.latLng.lng(), null); });
    gmarker.addListener("dragend", function () { const p = gmarker.position; setPlace(p.lat, p.lng, null); });
  }
  // Satellite map without a key: Leaflet with Esri World Imagery. Rejects if the tiles can't load
  // (for example inside a sandboxed preview), so the preview map takes over.
  let lmap = null, lmarker = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function initLeaflet() {
    return new Promise(function (resolve, reject) {
      mapEl.innerHTML = "";
      lmap = L.map(mapEl, { center: [50, 9], zoom: 4, zoomControl: true, attributionControl: true, maxZoom: 20 });
      // detectRetina: sharper imagery on high-density screens (requests one zoom level deeper).
      const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 20, maxNativeZoom: 19, detectRetina: true, attribution: "Imagery © Esri, Maxar, Earthstar Geographics"
      });
      const labels = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, opacity: 0.85 });
      let loaded = 0, failed = 0, done = false;
      sat.on("tileload", function () { loaded++; if (!done) { done = true; resolve(); } });
      const fail = function (why) { done = true; if (lmap) lmap.remove(); lmap = null; lmarker = null; reject(new Error(why)); };
      sat.on("tileerror", function () { failed++; if (!done && failed >= 6 && loaded === 0) fail("tiles blocked"); });
      setTimeout(function () { if (!done) fail("timeout"); }, 6000);
      sat.addTo(lmap); labels.addTo(lmap);
      lmap.layers = { base: { Satellite: sat }, overlay: { Labels: labels } };
      lmarker = L.marker([50, 9], { draggable: true, keyboard: true, title: "Your straw", alt: "Your straw" });
      lmap.on("click", function (e) { setPlace(e.latlng.lat, e.latlng.lng, null); });
      lmarker.on("dragend", function () { const p = lmarker.getLatLng(); setPlace(p.lat, p.lng, null); });
    });
  }

  // AlphaEarth layer over the map (needs the Earth Engine connector, see docs/SETUP.md).
  function addAlphaEarthLayer() {
    if (!CFG.alphaEarthEndpoint) return;
    fetch(CFG.alphaEarthEndpoint + "?tiles=1").then((r) => r.json()).then(function (d) {
      if (!d.urlFormat) return;
      const name = "AlphaEarth " + d.year;
      if (lmap) {
        const ae = L.tileLayer(d.urlFormat, { maxZoom: 19, opacity: 0.8, attribution: "AlphaEarth Foundations Satellite Embedding, Google and Google DeepMind" });
        lmap.layers.overlay[name] = ae;
        L.control.layers(lmap.layers.base, lmap.layers.overlay, { collapsed: false }).addTo(lmap);
      } else if (gmap) {
        const layer = new google.maps.ImageMapType({ name: name, tileSize: new google.maps.Size(256, 256), opacity: 0.8,
          getTileUrl: (c, z) => d.urlFormat.replace("{x}", c.x).replace("{y}", c.y).replace("{z}", z) });
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "btn small secondary map-toggle"; btn.textContent = "Show " + name;
        btn.addEventListener("click", function () {
          const on = gmap.overlayMapTypes.getLength() > 0;
          if (on) gmap.overlayMapTypes.clear(); else gmap.overlayMapTypes.push(layer);
          btn.textContent = (on ? "Show " : "Hide ") + name;
        });
        gmap.controls[google.maps.ControlPosition.TOP_RIGHT].push(btn);
      }
    }).catch(function () { /* connector not reachable: map works without the layer */ });
  }

  // Preview map: equirectangular Europe, lon −11…31, lat 35…71.
  const BOX = { lon0: -11, lon1: 31, lat0: 35, lat1: 71, w: 420, h: 360 };
  const px = (lon) => ((lon - BOX.lon0) / (BOX.lon1 - BOX.lon0)) * BOX.w;
  const py = (lat) => ((BOX.lat1 - lat) / (BOX.lat1 - BOX.lat0)) * BOX.h;
  function initPreviewMap() {
    $("map-hint").textContent = "Preview map: click to place a pin, or pick an example town.";
    let g = "";
    for (let lon = -10; lon <= 30; lon += 10) g += '<line x1="' + px(lon) + '" y1="0" x2="' + px(lon) + '" y2="' + BOX.h + '"/><text x="' + (px(lon) + 3) + '" y="' + (BOX.h - 6) + '">' + Math.abs(lon) + "°" + (lon < 0 ? "W" : "E") + "</text>";
    for (let lat = 40; lat <= 70; lat += 10) g += '<line x1="0" y1="' + py(lat) + '" x2="' + BOX.w + '" y2="' + py(lat) + '"/><text x="4" y="' + (py(lat) - 4) + '">' + lat + "°N</text>";
    let dots = "";
    EXAMPLES.forEach(function (e, i) {
      dots += '<g class="pm-site" data-i="' + i + '" tabindex="0" role="button" aria-label="' + e.name + '"><circle cx="' + px(e.lon) + '" cy="' + py(e.lat) + '" r="5"/></g>';
    });
    mapEl.innerHTML =
      '<svg class="pm" viewBox="0 0 ' + BOX.w + " " + BOX.h + '" role="img" aria-label="Map of Europe. Click to place your pin.">' +
      '<rect class="pm-bg" width="' + BOX.w + '" height="' + BOX.h + '"/><g class="pm-grid">' + g + "</g>" + dots +
      '<g id="pm-pin" hidden><line class="pm-stem" x1="0" y1="0" x2="0" y2="-18"/><circle class="pm-head" cx="0" cy="-22" r="7"/><circle class="pm-foot" r="2.5"/></g></svg>' +
      '<p class="pm-note">Preview map. The live site shows a satellite map.</p>';
    const svg = mapEl.querySelector("svg");
    svg.addEventListener("click", function (e) {
      const site = e.target.closest(".pm-site");
      if (site) { const ex = EXAMPLES[+site.dataset.i]; setPlace(ex.lat, ex.lon, ex.name); return; }
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      const lon = BOX.lon0 + (p.x / BOX.w) * (BOX.lon1 - BOX.lon0), lat = BOX.lat1 - (p.y / BOX.h) * (BOX.lat1 - BOX.lat0);
      setPlace(lat, lon, null);
    });
    svg.addEventListener("keydown", function (e) {
      const site = e.target.closest(".pm-site");
      if (site && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); const ex = EXAMPLES[+site.dataset.i]; setPlace(ex.lat, ex.lon, ex.name); }
    });
  }
  function movePin(lat, lon, zoom) {
    if (gmarker) { gmarker.position = { lat: lat, lng: lon }; if (zoom) { gmap.panTo({ lat: lat, lng: lon }); if (gmap.getZoom() < 15) gmap.setZoom(16); } return; }
    if (lmarker) { lmarker.setLatLng([lat, lon]).addTo(lmap); if (zoom) lmap.setView([lat, lon], Math.max(lmap.getZoom(), 16)); return; }
    const pin = $("pm-pin");
    if (pin) { pin.removeAttribute("hidden"); pin.setAttribute("transform", "translate(" + px(lon) + " " + py(lat) + ")"); }
  }

  const escHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // ---------- Address search with suggestions
  // Photon (OpenStreetMap, komoot) suggests streets, addresses and places as you type; Open-Meteo's
  // place search is the fallback. Results near the current map view rank first.
  const input = $("address"), list = $("address-list");
  let suggestions = [], active = -1, typingTimer = 0, queryToken = 0, shownFor = "";
  function mapCenter() {
    if (lmap) { const c = lmap.getCenter(); return { lat: c.lat, lon: c.lng }; }
    if (gmap) { const c = gmap.getCenter(); return { lat: c.lat(), lon: c.lng() }; }
    return state.site ? { lat: state.site.lat, lon: state.site.lon } : DE_BILT;
  }
  function photon(q, signal) {
    const c = mapCenter();
    return fetch("https://photon.komoot.io/api/?limit=6&lang=en&q=" + encodeURIComponent(q) + "&lat=" + c.lat.toFixed(3) + "&lon=" + c.lon.toFixed(3), { signal: signal })
      .then((r) => r.json())
      .then((d) => (d.features || []).map(function (f) {
        const p = f.properties || {}, g = f.geometry && f.geometry.coordinates;
        const street = p.street ? p.street + (p.housenumber ? " " + p.housenumber : "") : "";
        const main = p.name && p.name !== street ? p.name : street || p.city || p.name || "";
        const sub = [p.name && street && p.name !== street ? street : "", p.postcode, p.city !== main ? p.city : "", p.country].filter(Boolean).join(", ");
        return { main: main, sub: sub, lat: g && g[1], lon: g && g[0], label: [main, p.city !== main ? p.city : "", p.countrycode].filter(Boolean).join(", ") };
      }).filter((x) => x.main && Number.isFinite(x.lat)));
  }
  function openMeteoPlaces(q, signal) {
    return fetch(CFG.geocodeApi + "?count=6&language=en&name=" + encodeURIComponent(q), { signal: signal }).then((r) => r.json()).then((d) => (d.results || []).map((g) => ({
      main: g.name, sub: [g.admin1, g.country].filter(Boolean).join(", "), lat: g.latitude, lon: g.longitude, label: g.name + (g.country_code ? ", " + g.country_code : "")
    })));
  }
  // Street-level matches (Photon) first, then towns (Open-Meteo), without near-duplicates.
  const inEurope = (x) => x.lat > 34 && x.lat < 72 && x.lon > -25 && x.lon < 45;
  function merge(addresses, places) {
    const out = addresses.slice();
    // Towns: European ones first, otherwise in the service's own order (by size).
    places.slice().sort((a, b) => inEurope(b) - inEurope(a)).forEach(function (p) {
      if (!out.some((o) => Math.abs(o.lat - p.lat) < 0.02 && Math.abs(o.lon - p.lon) < 0.02 && o.main === p.main)) out.push(p);
    });
    return out.slice(0, 6);
  }
  // Calls onUpdate(items, done) as each service answers. Returns a function that cancels the search.
  function lookupLive(q, onUpdate) {
    const ctrl = window.AbortController ? new AbortController() : null, signal = ctrl ? ctrl.signal : undefined;
    let addresses = null, places = null, finished = 0, cancelled = false;
    const update = function () { finished++; if (!cancelled) onUpdate(merge(addresses || [], places || []), finished === 2); };
    photon(q, signal).then((r) => { addresses = r; }, () => { addresses = []; }).then(update);
    openMeteoPlaces(q, signal).then((r) => { places = r; }, () => { places = []; }).then(update);
    return function () { cancelled = true; if (ctrl) ctrl.abort(); };
  }
  // For Enter/Find without a suggestion: wait for both services, or 1.5 s after the first answer.
  function lookup(q) {
    return new Promise(function (resolve) {
      let best = [], timer = 0;
      lookupLive(q, function (items, done) {
        if (items.length) best = items;
        if (done) { clearTimeout(timer); resolve(best); }
        else if (items.length && !timer) timer = setTimeout(function () { resolve(best); }, 1500);
      });
    });
  }
  function showList(items, emptyText) {
    suggestions = items; active = -1;
    if (!items.length && !emptyText) { closeList(); return; }
    list.innerHTML = items.length
      ? items.map((it, i) => '<li role="option" id="sugg-' + i + '" aria-selected="false" data-i="' + i + '"><span class="s-main">' + escHtml(it.main) + '</span>' + (it.sub ? '<span class="s-sub">' + escHtml(it.sub) + "</span>" : "") + "</li>").join("")
      : '<li class="s-empty" role="option" aria-disabled="true">' + escHtml(emptyText) + "</li>";
    list.hidden = false; input.setAttribute("aria-expanded", "true");
  }
  function closeList() { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; }
  function highlight(i) {
    active = i;
    list.querySelectorAll("[role=option]").forEach((li, k) => li.setAttribute("aria-selected", String(k === i)));
    if (i >= 0) { input.setAttribute("aria-activedescendant", "sugg-" + i); const li = $("sugg-" + i); if (li) li.scrollIntoView({ block: "nearest" }); }
  }
  function choose(it) {
    closeList();
    input.value = it.label;
    setPlace(it.lat, it.lon, it.label, { zoom: true });
  }
  let cancelSearch = function () {};
  input.addEventListener("input", function () {
    clearTimeout(typingTimer);
    cancelSearch();
    const q = input.value.trim();
    if (q.length < 2) { closeList(); return; }
    const t = ++queryToken;
    typingTimer = setTimeout(function () {
      // Keep the list while the visitor keeps typing the same thing; otherwise don't show old matches.
      if (!suggestions.length || q.toLowerCase().indexOf(shownFor.toLowerCase()) !== 0) showList([], "Searching…");
      cancelSearch = lookupLive(q, function (items, done) {
        if (t !== queryToken || input.value.trim() !== q) return;
        if (items.length) { showList(items, ""); shownFor = q; }
        else if (done) showList([], "No matches. Try a town name, or click the map.");
      });
    }, 220);
  });
  input.addEventListener("keydown", function (e) {
    if (list.hidden || !suggestions.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); highlight((active + 1) % suggestions.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlight((active - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(suggestions[active]); }
    else if (e.key === "Escape") { e.preventDefault(); closeList(); }
  });
  // pointerdown (not click) so the choice lands before the input loses focus
  list.addEventListener("pointerdown", function (e) {
    const li = e.target.closest("li[data-i]"); if (!li) return;
    e.preventDefault(); choose(suggestions[+li.dataset.i]);
  });
  input.addEventListener("blur", function () { setTimeout(closeList, 120); });
  $("build-search").addEventListener("submit", function (e) {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    if (!list.hidden && suggestions.length) { choose(suggestions[Math.max(0, active)]); return; }
    cancelSearch();
    setStatus("Looking up “" + q + "”…");
    const local = EXAMPLES.find((x) => x.name.toLowerCase().indexOf(q.toLowerCase()) === 0);
    lookup(q).then(function (items) {
      if (items.length) choose(items[0]);
      else if (local) setPlace(local.lat, local.lon, local.name, { zoom: true });
      else setStatus("We couldn't find that place. Try a town name, or click the map.");
    }).catch(function () {
      if (local) setPlace(local.lat, local.lon, local.name, { zoom: true });
      else setStatus("We couldn't look that up here. Click the map, or try one of the example towns.");
    });
  });

  // ---------- Use my location
  $("locate").addEventListener("click", function () {
    if (!navigator.geolocation) { setStatus("Your browser can't share its location. Search or click the map instead."); return; }
    setStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(function (pos) {
      setPlace(pos.coords.latitude, pos.coords.longitude, "Your location", { zoom: true });
    }, function (err) {
      setStatus(err.code === 1 ? "Location was not shared. Search or click the map instead." : "Couldn't find your location. Search or click the map instead.");
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });

  // ---------- Weather
  function fmtCoord(lat, lon) {
    return Math.abs(lat).toFixed(2) + "° " + (lat >= 0 ? "N" : "S") + " · " + Math.abs(lon).toFixed(2) + "° " + (lon >= 0 ? "E" : "W");
  }
  function blendExample(lat, lon) {
    let ws = 0; const acc = { t: 0, a: 0, w: 0, wa: 0, rain: 0 }; let near = EXAMPLES[0], nd = Infinity;
    EXAMPLES.forEach(function (e) {
      const d = Math.hypot(e.lat - lat, (e.lon - lon) * Math.cos((lat * Math.PI) / 180)) + 0.05;
      if (d < nd) { nd = d; near = e; }
      const w = 1 / (d * d); ws += w;
      acc.t += w * e.t; acc.a += w * e.a; acc.w += w * e.w; acc.wa += w * e.wa; acc.rain += w * e.rain;
    });
    return { t: acc.t / ws, a: acc.a / ws, w: acc.w / ws, wa: acc.wa / ws, rain: acc.rain / ws, soil: near.soil, near: near, exact: nd < 0.1 };
  }
  function climateWindowEnd() { const end = new Date(); end.setUTCDate(end.getUTCDate() - 7); return end; }
  function fetchClimate(lat, lon) {
    const end = climateWindowEnd();
    const start = new Date(end); start.setUTCFullYear(end.getUTCFullYear() - (CFG.weatherYears || 5));
    const iso = (d) => d.toISOString().slice(0, 10);
    const base = CFG.weatherApi + "?latitude=" + lat.toFixed(3) + "&longitude=" + lon.toFixed(3) + "&start_date=" + iso(start) + "&end_date=" + iso(end) + "&timezone=UTC&daily=";
    const withSoil = "temperature_2m_mean,precipitation_sum,soil_temperature_0_to_7cm_mean,soil_moisture_0_to_7cm_mean";
    const get = (vars) => fetch(base + vars).then((r) => r.json()).then(function (d) { if (d.error || !d.daily) throw new Error(d.reason || "no data"); return d.daily; });
    return get(withSoil).catch(() => get("temperature_2m_mean,precipitation_sum")).then(climateFromDaily);
  }
  // Daily series → 12 monthly {t, wet} + summary.
  // Wet day [assumed]: topsoil moisture in the upper half of this place's own usual range
  // (between its 5th and 95th percentile over the years fetched). A fixed threshold mostly reflected the
  // weather model's soil type: 0.25 m³/m³ marked De Bilt wet on 100 % of days and Munich on 3 %, although
  // Munich had more rain (Open-Meteo, Jul–Oct 2026). Without soil data: ≥ 2 mm of rain over the last 3 days.
  const WET_POSITION = 0.5;
  function percentile(values, q) {
    const v = values.filter((x) => x != null).sort((a, b) => a - b);
    if (!v.length) return null;
    return v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
  }
  function climateFromDaily(d) {
    const months = Array.from({ length: 12 }, () => ({ t: 0, wet: 0, n: 0 }));
    let rain = 0; const years = d.time.length / 365.25;
    const soilT = d.soil_temperature_0_to_7cm_mean, air = d.temperature_2m_mean, p = d.precipitation_sum;
    let soilM = d.soil_moisture_0_to_7cm_mean;
    const lo = soilM ? percentile(soilM, 0.05) : null, hi = soilM ? percentile(soilM, 0.95) : null;
    if (lo == null || hi == null || hi - lo < 0.01) soilM = null;
    const wetFrom = soilM ? lo + WET_POSITION * (hi - lo) : null;
    for (let i = 0; i < d.time.length; i++) {
      const m = +d.time[i].slice(5, 7) - 1;
      const t = soilT && soilT[i] != null ? soilT[i] : air[i];
      if (t == null) continue;
      let wet;
      if (soilM && soilM[i] != null) wet = soilM[i] >= wetFrom ? 1 : 0;
      else wet = ((p[i] || 0) + (p[i - 1] || 0) + (p[i - 2] || 0)) >= 2 ? 1 : 0;
      months[m].t += t; months[m].wet += wet; months[m].n++;
      rain += p[i] || 0;
    }
    const out = months.map((x) => ({ t: x.n ? x.t / x.n : 0, wet: x.n ? x.wet / x.n : 0 }));
    const meanT = out.reduce((s, x) => s + x.t, 0) / 12, meanW = out.reduce((s, x) => s + x.wet, 0) / 12;
    return { months: out, meanT: meanT, wetShare: meanW, rain: rain / years, soil: null, soilData: !!soilM, wetFrom: wetFrom };
  }

  // ---------- Place → everything
  let placeToken = 0;
  // opts.zoom: also move the map to the place (search, location, start). Clicks and drags leave the map still.
  function setPlace(lat, lon, name, opts) {
    const token = ++placeToken;
    state.autoInstall = true;
    movePin(lat, lon, !!(opts && opts.zoom));
    state.site = { lat: lat, lon: lon, name: name || "Your pin" };
    try { localStorage.setItem(PIN_KEY, JSON.stringify(state.site)); } catch (e) { /* storage blocked */ }
    $("site-name").textContent = state.site.name;
    $("site-coord").textContent = Math.abs(lat).toFixed(5) + "° " + (lat >= 0 ? "N" : "S") + " · " + Math.abs(lon).toFixed(5) + "° " + (lon >= 0 ? "E" : "W");
    loadFingerprint(lat, lon, token);
    setStatus("Reading weather for this spot…");
    $("flow-site").classList.add("on"); $("flow-preview").classList.add("on");
    state.soil = null;
    fetchClimate(lat, lon).then(function (c) {
      if (token !== placeToken) return;
      state.climate = c; state.source = "live";
      c.soil = soilText(lat, lon);
      render();
    }).catch(function () {
      if (token !== placeToken) return;
      const b = blendExample(lat, lon);
      state.climate = { months: exampleMonths(b), meanT: b.t, wetShare: exampleMonths(b).reduce((s, x) => s + x.wet, 0) / 12, rain: b.rain, soil: soilText(lat, lon) };
      state.source = "example";
      render();
    });
    loadSoil(lat, lon, token);
  }

  // ---------- Soil texture from SoilGrids (ISRIC, 250 m, topsoil 0–5 cm). Slow (often 20–40 s), so it fills in later.
  // Shown for information; it does not change the decay estimate yet.
  function usdaTexture(sand, silt, clay) {
    if (silt + 1.5 * clay < 15) return "Sand";
    if (silt + 2 * clay < 30) return "Loamy sand";
    if ((clay >= 7 && clay < 20 && sand > 52) || (clay < 7 && silt < 50)) return "Sandy loam";
    if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) return "Loam";
    if ((silt >= 50 && clay >= 12 && clay < 27) || (silt >= 50 && silt < 80 && clay < 12)) return "Silt loam";
    if (silt >= 80 && clay < 12) return "Silt";
    if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) return "Sandy clay loam";
    if (clay >= 35 && sand > 45) return "Sandy clay";
    if (clay >= 27 && clay < 40 && sand > 20) return "Clay loam";
    if (clay >= 27 && clay < 40) return "Silty clay loam";
    if (clay >= 40 && silt >= 40) return "Silty clay";
    return "Clay";
  }
  function soilText(lat, lon) {
    if (state.soil && state.soil.label) return state.soil.label;
    if (state.soil && state.soil.loading) return "Reading soil map…";
    return blendExample(lat, lon).soil + " (example)";
  }
  // Answers are remembered per ~1 km square; requests wait until the pin has stopped moving for a moment,
  // to stay gentle on the free service.
  let soilTimer = 0, soilCtrl = null;
  function loadSoil(lat, lon, token) {
    clearTimeout(soilTimer);
    if (soilCtrl) { soilCtrl.abort(); soilCtrl = null; }
    const key = "beestraw-soil-v1-" + lat.toFixed(2) + "," + lon.toFixed(2);
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { /* storage blocked */ }
    if (cached) { state.soil = cached; return; }
    state.soil = { loading: true };
    const finish = function () {
      if (token !== placeToken || !state.climate) return;
      state.climate.soil = state.soil.label;
      paintSiteCard();
    };
    soilTimer = setTimeout(function () {
      if (token !== placeToken) return;
      const url = "https://rest.isric.org/soilgrids/v2.0/properties/query?lon=" + lon.toFixed(4) + "&lat=" + lat.toFixed(4) +
        "&property=clay&property=sand&property=silt&depth=0-5cm&value=mean";
      const ctrl = window.AbortController ? new AbortController() : null;
      soilCtrl = ctrl;
      const timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 60000);
      fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
        if (!r.ok) throw new Error("soil service " + r.status);
        return r.json();
      }).then(function (d) {
        if (token !== placeToken) return;
        const v = {};
        (d.properties && d.properties.layers || []).forEach(function (l) {
          const m = l.depths && l.depths[0] && l.depths[0].values && l.depths[0].values.mean;
          if (m != null) v[l.name] = m / ((l.unit_measure && l.unit_measure.d_factor) || 10);
        });
        if (v.clay == null || v.sand == null || v.silt == null) {
          // Built-up areas and water are not on the soil map.
          state.soil = { label: "Not on the soil map here · example: " + blendExample(lat, lon).soil, unmapped: true };
        } else {
          const k = 100 / (v.clay + v.sand + v.silt), clay = v.clay * k, sand = v.sand * k, silt = v.silt * k;
          state.soil = { label: usdaTexture(sand, silt, clay) + " · " + Math.round(clay) + " % clay, " + Math.round(sand) + " % sand", clay: clay, sand: sand, silt: silt };
        }
        try { localStorage.setItem(key, JSON.stringify(state.soil)); } catch (e) { /* storage blocked */ }
      }).catch(function () {
        if (token !== placeToken) return;
        state.soil = { label: "Soil map didn't answer · example: " + blendExample(lat, lon).soil };
      }).then(function () { clearTimeout(timer); finish(); });
    }, 1200);
  }
  function setStatus(t) { $("site-status").textContent = t; }

  // AlphaEarth fingerprint of the area around the pin.
  // Order: the Earth Engine connector if configured, otherwise the public dataset read in the browser
  // (alphaearth.js), otherwise a generated placeholder that is labelled as such.
  let aeOverlay = null, aeControl = null, aeVisible = false;
  function drawFingerprint(canvas, data) {
    const tmp = document.createElement("canvas");
    tmp.width = data.size; tmp.height = data.size;
    tmp.getContext("2d").putImageData(new ImageData(data.rgba, data.size, data.size), 0, 0);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
    const k = canvas.width / data.size, cx = (data.pin.x + 0.5) * k, cy = (data.pin.y + 0.5) * k;
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.strokeRect(cx - 4, cy - 4, 8, 8);
    ctx.strokeStyle = "#101218"; ctx.lineWidth = 1; ctx.strokeRect(cx - 5.5, cy - 5.5, 11, 11);
    return tmp.toDataURL("image/png");
  }
  function showAlphaEarthOnMap(url, bounds) {
    if (!lmap || !window.L) return;
    if (aeOverlay) aeOverlay.remove();
    aeOverlay = L.imageOverlay(url, bounds, { opacity: 0.8, className: "ae-overlay", interactive: false });
    if (!aeControl) {
      const Ctl = L.Control.extend({
        onAdd: function () {
          const b = L.DomUtil.create("button", "ae-toggle");
          b.type = "button"; b.textContent = "Show AlphaEarth";
          b.setAttribute("aria-pressed", "false");
          L.DomEvent.disableClickPropagation(b);
          L.DomEvent.on(b, "click", function () {
            aeVisible = !aeVisible;
            b.setAttribute("aria-pressed", String(aeVisible));
            b.textContent = aeVisible ? "Hide AlphaEarth" : "Show AlphaEarth";
            if (aeOverlay) { if (aeVisible) aeOverlay.addTo(lmap); else aeOverlay.remove(); }
          });
          return b;
        }
      });
      aeControl = new Ctl({ position: "topright" }).addTo(lmap);
    }
    if (aeVisible) aeOverlay.addTo(lmap);
  }
  function loadFingerprint(lat, lon, token) {
    const canvas = $("site-tile"), note = $("site-tile-note");
    const placeholder = function (why) {
      if (window.BeeTiles) window.BeeTiles.drawTile(canvas, Math.round((lat * 1000 + lon * 37) * 7) >>> 0, true);
      note.textContent = why || "AlphaEarth fingerprint of your place. Placeholder image: the AlphaEarth data couldn't be loaded.";
      if (aeOverlay) { aeOverlay.remove(); aeOverlay = null; }
    };
    const caption = (year, metres) => "AlphaEarth " + year + ": " + metres + " × " + metres + " m around your pin, each square 10 m. Colours show 3 of the 64 numbers that describe each square.";
    if (CFG.alphaEarthEndpoint) {
      note.textContent = "Reading AlphaEarth…";
      fetch(CFG.alphaEarthEndpoint + "?lat=" + lat.toFixed(5) + "&lon=" + lon.toFixed(5))
        .then((r) => r.json())
        .then(function (d) {
          if (token !== placeToken) return;
          if (!d.png) throw new Error(d.error || "no image");
          const img = new Image();
          img.onload = function () {
            const ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
            ctx.strokeRect(canvas.width / 2 - 3, canvas.height / 2 - 3, 6, 6);
          };
          img.src = d.png;
          state.embedding = d.vector || null;
          note.textContent = caption(d.year, d.sizeMeters);
        })
        .catch(function () { if (token === placeToken) placeholder(); });
      return;
    }
    if (!window.BeeAlphaEarth) { placeholder(); return; }
    // Grey "loading" state until the real data arrives (a few seconds, ~2 MB).
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--surface") || "#f4f5f8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    note.textContent = "Reading AlphaEarth for this spot… (about 2 MB, a few seconds)";
    window.BeeAlphaEarth.fingerprint(lat, lon).then(function (d) {
      if (token !== placeToken) return;
      const url = drawFingerprint(canvas, d);
      note.textContent = caption(d.year, d.metres);
      showAlphaEarthOnMap(url, d.bounds);
    }).catch(function (e) {
      if (token !== placeToken) return;
      placeholder(/no data/.test(e.message) ? e.message + " Placeholder image." : null);
    });
  }

  // ---------- Render site card + decay
  function paintSiteCard() {
    const c = state.climate;
    $("site-kv").innerHTML =
      "<dt>Rain</dt><dd>" + Math.round(c.rain) + " mm/yr</dd>" +
      "<dt>Mean soil temperature</dt><dd>" + c.meanT.toFixed(1) + " °C</dd>" +
      "<dt>Days the soil is wet</dt><dd>" + Math.round(c.wetShare * 100) + " %</dd>" +
      "<dt>Soil</dt><dd></dd>";
    $("site-kv").lastElementChild.textContent = c.soil;
    setStatus(state.source === "live"
      ? "Weather: Open-Meteo, last " + (CFG.weatherYears || 5) + " years" + (c.soilData ? ", with topsoil moisture." : ".") +
        (state.soil && state.soil.clay != null ? " Soil: SoilGrids (ISRIC), topsoil 0–5 cm." : state.soil && state.soil.loading ? " Soil map can take up to a minute." : "")
      : "Live weather isn't available here, so this uses an example climate for the region.");
  }
  function render() {
    const c = state.climate;
    paintSiteCard();

    if (state.autoInstall) {
      state.install = recommendedInstallMonth(c); state.autoInstall = false;
      $("install-month").value = String(state.install);
    }
    $("install-hint").textContent = "Suggested for your climate: install by " + when(phenology(c).install) + ".";
    $("tune-cal").textContent = "Wear rates: published PHA decay in wet soil (0.6 µm a day per face at 25 °C, halved per 10 °C colder), ×1.5 for quenched lines, on the days your soil is wet" +
      (state.source === "live" ? "." : " (example climate here).");
    const cum = cumulative(c.months, state.install, 24);
    // µm per face at 12 months, aimed just past it: where winter soil is ≤ 4 °C wear stops, and a fuse sized
    // exactly to this dose would already be worn through when wear stops in autumn.
    const dose = doseAt(cum, TARGET) + 0.01;
    const thick = Math.max(0.01, 2 * dose / 1000), thin = RATIO * thick; // mm: worn through from both faces
    const goneAt = (t) => releaseMonth(cum, t * 1000 / 2);
    const rel = goneAt(thick), thinGone = goneAt(thin);
    state.result = { cum: cum, thick: thick, thin: thin, release: rel, thinGone: thinGone };

    // Your dates, in the same words as the install guide
    const ph = phenology(c), installDay = Math.max(ph.install, state.install * DAYS_PER_MONTH), relDay = installDay + rel * DAYS_PER_MONTH;
    state.newOut = (ph.next - installDay) / DAYS_PER_MONTH;
    $("date-install").textContent = when(installDay);
    $("date-nest").textContent = when(ph.emerge) + " → " + when(ph.nestEnd);
    $("date-out").textContent = when(ph.next) + ", next year";
    $("date-release").textContent = isFinite(rel) ? when(relDay) + (relDay >= 365 ? ", next year" : "") + " · about " + Math.round(rel) + " months" : "may stand longer than 2 years";
    $("tune-thick").textContent = thick.toFixed(2) + " mm";
    $("tune-thin").textContent = thin.toFixed(2) + " mm";
    $("tune-thin-gone").textContent = isFinite(thinGone) ? "~" + thinGone.toFixed(1) + " months" : "over 24 months";
    $("tune-release").textContent = isFinite(rel) ? "~" + rel.toFixed(1) + " months" : "over 24 months";
    $("tune-note").textContent = "The fuse sheets are sized to your weather so the straw lets go about 12 months after you install it. The thin side goes first, so it tips that way." +
      (thin < THINNEST_PRINTED ? " Here the sheets come out thinner than any line we've printed; printing them at real size is still being tested." : "");
    drawChart();
    $("decay-month").max = 18;
    setMonth(+$("decay-month").value);
    renderGuide();
    if (window.BeeSlicer) window.BeeSlicer.update({ fuse: { thick: thick, thin: thin } });
  }

  // Chart: fuse left (%) over 18 months
  // Share of fuse material left: sheets graded linearly from thick (one side) to thin (the other),
  // each worn from both faces by the same depth.
  function remaining(m) {
    const r = state.result, d2 = 2 * doseAt(r.cum, m) / 1000;
    let left = 0, all = 0;
    for (let k = 0; k <= 40; k++) { const t = r.thick + (r.thin - r.thick) * k / 40; left += Math.max(0, t - d2); all += t; }
    return left / all;
  }
  function drawChart() {
    const W = 420, Hh = 150, L = 34, B = 24, T = 10, Rr = 10;
    const x = (m) => L + (m / 18) * (W - L - Rr), y = (f) => T + (1 - f) * (Hh - T - B);
    let d = "", area = "M" + x(0) + " " + y(0);
    for (let m = 0; m <= 18; m += 0.25) { const f = remaining(m); d += (m ? "L" : "M") + x(m).toFixed(1) + " " + y(f).toFixed(1); area += "L" + x(m).toFixed(1) + " " + y(f).toFixed(1); }
    area += "L" + x(18) + " " + y(0) + "Z";
    let grid = "";
    [0, 0.5, 1].forEach((f) => { grid += '<line class="ch-grid" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y(f) + '" y2="' + y(f) + '"/><text class="ch-lab" x="' + (L - 6) + '" y="' + (y(f) + 4) + '" text-anchor="end">' + f * 100 + "%</text>"; });
    [0, 3, 6, 9, 12, 15, 18].forEach((m) => { grid += '<text class="ch-lab" x="' + x(m) + '" y="' + (Hh - 6) + '" text-anchor="middle">' + m + "</text>"; });
    const rel = state.result.release, thinGone = state.result.thinGone, out = state.newOut;
    const relMark = isFinite(rel) && rel <= 18 ? '<line class="ch-rel" x1="' + x(rel) + '" x2="' + x(rel) + '" y1="' + T + '" y2="' + y(0) + '"/><text class="ch-lab strong" x="' + (x(rel) + 4) + '" y="' + (T + 10) + '">lets go</text>' : "";
    const thinMark = isFinite(thinGone) && thinGone <= 18 ? '<line class="ch-must" x1="' + x(thinGone) + '" x2="' + x(thinGone) + '" y1="' + (T + 16) + '" y2="' + y(0) + '"/><text class="ch-lab" x="' + (x(thinGone) - 4) + '" y="' + (T + 26) + '" text-anchor="end">thin side gone</text>' : "";
    const outMark = isFinite(out) && out <= 18 ? '<line class="ch-out" x1="' + x(out) + '" x2="' + x(out) + '" y1="' + (T + 32) + '" y2="' + y(0) + '"/><text class="ch-lab" x="' + (x(out) + 4) + '" y="' + (T + 42) + '">new bees out</text>' : "";
    $("decay-chart").innerHTML =
      '<rect class="ch-season" x="' + x(0) + '" y="' + T + '" width="' + (x(4) - x(0)) + '" height="' + (y(0) - T) + '"/><text class="ch-lab" x="' + (x(0) + 4) + '" y="' + (T + 10) + '">nesting</text>' +
      grid + '<path class="ch-area" d="' + area + '"/><path class="ch-line" d="' + d + '"/>' + thinMark + outMark + relMark +
      '<circle id="ch-dot" class="ch-dot" r="4"/>';
    state.chartX = x; state.chartY = y;
  }

  // ---------- Decay figure (illustration from the estimate above, in the site's line style)
  // Left: the fuse seen from above, cut through the middle: gyroid sheets (cell 6 mm) between the Ø8 bore and the
  // Ø20 outside, drawn at their thickness (×8), thick on one side and thin on the other, thinning month by month.
  // Right: the whole straw from the side (10 cm in the soil, fuse just under the soil line, 50 cm above),
  // tipping towards the thin side when the fuse lets go. Not a structural simulation.
  const DIRS = { E: 0, SE: 45, S: 90, SW: 135, W: 180, NW: -135, N: -90, NE: -45 };
  const DIR_NAMES = { N: "north", NE: "north-east", E: "east", SE: "south-east", S: "south", SW: "south-west", W: "west", NW: "north-west" };
  let gyroidSlice = null;
  function sliceSegments() { // marching squares on a 0.25 mm grid, local x: thick (−x) → thin (+x)
    if (gyroidSlice) return gyroidSlice;
    const k = 2 * Math.PI / 6, h = 0.25, n = 42, Z = 1.0 * k, out = [];
    const f = (x, y) => Math.sin(x * k) * Math.cos(y * k) + Math.sin(y * k) * Math.cos(Z) + Math.sin(Z) * Math.cos(x * k);
    for (let j = -n; j < n; j++) for (let i = -n; i < n; i++) {
      const x0 = i * h, y0 = j * h, v = [f(x0, y0), f(x0 + h, y0), f(x0 + h, y0 + h), f(x0, y0 + h)];
      const P = [[x0, y0], [x0 + h, y0], [x0 + h, y0 + h], [x0, y0 + h]], cut = [];
      for (let e = 0; e < 4; e++) { const a = v[e], b = v[(e + 1) % 4]; if ((a > 0) !== (b > 0)) { const t = a / (a - b), p = P[e], q = P[(e + 1) % 4]; cut.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } }
      for (let c = 0; c + 1 < cut.length; c += 2) {
        const a = cut[c], b = cut[c + 1], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, r = Math.hypot(mx, my);
        if (r > 4.3 && r < 9.7) out.push([a[0], a[1], b[0], b[1], mx]);
      }
    }
    return (gyroidSlice = out);
  }
  function drawFuse(m) {
    const r = state.result; if (!r) return;
    const d2 = 2 * doseAt(r.cum, m) / 1000, ang = DIRS[state.dir] != null ? DIRS[state.dir] : 0, S = 8, TS = 20, cx = 116, cy = 126; // TS: sheets drawn 20× thicker
    let ghost = "", live = "";
    sliceSegments().forEach(function (q) {
      const t = r.thick + (r.thin - r.thick) * (q[4] + 10) / 20, left = t - d2; // local x −10 (thick) … +10 (thin)
      const seg = 'x1="' + (q[0] * S).toFixed(1) + '" y1="' + (q[1] * S).toFixed(1) + '" x2="' + (q[2] * S).toFixed(1) + '" y2="' + (q[3] * S).toFixed(1) + '"';
      ghost += "<line " + seg + ' stroke-width="' + (t * TS).toFixed(2) + '"/>';
      if (left > 0) live += "<line " + seg + ' stroke-width="' + (left * TS).toFixed(2) + '"/>';
    });
    const rad = ang * Math.PI / 180, at = (rr) => [cx + rr * Math.cos(rad), cy + rr * Math.sin(rad)];
    const thinLab = at(10 * S + 14), thickLab = at(-(10 * S + 14));
    const gone = isFinite(r.release) && m >= r.release, thinOut = isFinite(r.thinGone) && m >= r.thinGone;
    let g = '<text class="ff-lab" x="14" y="22">fuse from above</text>' +
      '<text class="ff-lab strong" x="14" y="38">fuse left ' + Math.round(remaining(m) * 100) + ' %</text>' +
      '<text class="ff-lab" x="14" y="242">sheets drawn 20× thicker</text>' +
      '<g class="ff-north"><path d="M190 30 l5 -12 l5 12 z"/><text class="ff-lab" x="195" y="42" text-anchor="middle">N</text></g>' +
      '<g transform="translate(' + cx + " " + cy + ") rotate(" + ang + ')">' +
        '<circle class="ff-ring" r="' + 10 * S + '"/><circle class="ff-ring" r="' + 4 * S + '"/>' +
        '<g class="ff-ghost">' + ghost + '</g><g class="ff-live">' + live + "</g>" +
      "</g>" +
      '<text class="ff-lab" x="' + thinLab[0].toFixed(1) + '" y="' + (thinLab[1] + 4).toFixed(1) + '" text-anchor="middle">thin</text>' +
      '<text class="ff-lab" x="' + thickLab[0].toFixed(1) + '" y="' + (thickLab[1] + 4).toFixed(1) + '" text-anchor="middle">thick</text>';
    // Side view: soil at y 150; the straw 12 wide (Ø20, not to scale), 50 cm above with a break, 10 cm below.
    const X = 330, Y = 150, w = 6;
    const tilt = gone ? Math.min(84, (m - r.release) * 168 + 10) : thinOut ? 3 : 0;
    const fuseOp = Math.max(0.15, remaining(m)).toFixed(2);
    g += '<line class="ff-div" x1="226" y1="16" x2="226" y2="224"/>' +
      '<text class="ff-lab" x="240" y="22">from the side</text>' +
      '<path class="ff-soil" d="M236 ' + Y + ' H410"/><text class="ff-lab" x="' + (X - 12) + '" y="' + (Y - 6) + '" text-anchor="end">soil line</text>' +
      '<path class="ff-hatch" d="M246 ' + (Y + 14) + ' l10 -8 M276 ' + (Y + 16) + ' l10 -8 M352 ' + (Y + 14) + ' l10 -8 M382 ' + (Y + 16) + ' l10 -8"/>' +
      '<path class="ff-straw" d="M' + (X - w) + " " + (Y + 14) + " V" + (Y + 64) + " L" + X + " " + (Y + 74) + " L" + (X + w) + " " + (Y + 64) + " V" + (Y + 14) + '"/>' +
      '<rect class="ff-fuse" x="' + (X - w) + '" y="' + (Y + 1) + '" width="' + 2 * w + '" height="12" style="opacity:' + fuseOp + '"/>' +
      '<text class="ff-lab" x="' + (X - 12) + '" y="' + (Y + 11) + '" text-anchor="end">fuse</text>' +
      '<text class="ff-lab" x="' + (X - 12) + '" y="' + (Y + 52) + '" text-anchor="end">10 cm</text>' +
      '<g transform="rotate(' + tilt.toFixed(1) + " " + (X + w) + " " + (Y + 1) + ')">' +
        '<path class="ff-straw" d="M' + (X - w) + " " + (Y + 1) + " V" + (Y - 52) + " M" + (X + w) + " " + (Y + 1) + " V" + (Y - 52) +
          " M" + (X - w) + " " + (Y - 62) + " V" + (Y - 120) + " H" + (X + w) + " V" + (Y - 62) + " M" + (X - w) + " " + (Y + 1) + " H" + (X + w) + '"/>' +
        '<path class="ff-break" d="M' + (X - 12) + " " + (Y - 50) + " l24 -6 M" + (X - 12) + " " + (Y - 58) + " l24 -6" + '"/>' +
        '<path class="ff-mark" d="M' + (X + w + 3) + " " + (Y - 14) + " h9 m-3 -3 l3 3 l-3 3" + '"/>' +
        (tilt < 20 ? '<text class="ff-lab" x="' + (X + 16) + '" y="' + (Y - 84) + '">50 cm</text>' : "") +
      "</g>" +
      '<text class="ff-lab' + (gone ? " strong" : "") + '" x="240" y="242">' + (gone ? "let go: tipped to the thin side" : thinOut ? "thin side gone: starts to lean" : "thin side →") + "</text>" +
      (state.dir ? '<text class="ff-lab" x="240" y="256">thin side faces ' + DIR_NAMES[state.dir] + "</text>" : "");
    $("fuse-fig").innerHTML = g;
  }
  function setMonth(m) {
    state.month = m;
    const r = state.result; if (!r) return;
    const f = remaining(m), gone = m >= r.release;
    drawFuse(m);
    $("decay-label").textContent = m;
    $("decay-state").textContent = m === 0 ? "Installed" : gone ? "Let go: the straw has tipped over" : m >= r.thinGone ? "Thin side gone: it leans that way" : m <= 4 ? "Nesting season" : "Bees develop inside";
    const dot = $("ch-dot");
    if (dot && state.chartX) { dot.setAttribute("cx", state.chartX(m)); dot.setAttribute("cy", state.chartY(f)); }
  }
  $("decay-month").addEventListener("input", (e) => setMonth(+e.target.value));
  // Fall direction (optional): the thin side of the fuse is turned towards it when installing.
  const compass = $("fall-dir");
  if (compass) compass.addEventListener("click", function (e) {
    const b = e.target.closest("button[data-dir]"); if (!b) return;
    state.dir = b.dataset.dir;
    compass.querySelectorAll("button[data-dir]").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    $("fall-dir-note").textContent = state.dir ? "Turn the arrow on the straw towards the " + DIR_NAMES[state.dir] + " when you install it." : "Any direction: turn the arrow away from paths and plants.";
    if (state.result) { setMonth(state.month || 0); renderGuide(); }
  });
  $("install-month").addEventListener("change", function (e) { state.install = +e.target.value; if (state.climate) render(); });


  // ---------- Install guide (per location)
  // Phenology is a rough estimate [assumed]: red mason bees emerge when daily mean temperatures reach
  // about 8 °C in the topsoil; install ~3 weeks before; nesting lasts ~8 weeks; the new bees overwinter in the tube
  // and emerge ~12 months later.
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const SHORT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function emergenceDay(months) {
    for (let d = 0; d < 200; d++) {
      const f = (d - 15) / DAYS_PER_MONTH, m0 = Math.floor(f), u = f - m0;
      const a = months[(m0 + 12) % 12].t, b = months[(m0 + 13) % 12].t;
      if (a + (b - a) * u >= 8) return Math.max(35, d);
    }
    return 140;
  }
  function when(day) {
    day = ((day % 365) + 365) % 365;
    const m = Math.min(11, Math.floor(day / DAYS_PER_MONTH)), within = day - m * DAYS_PER_MONTH;
    return (within < 10 ? "early " : within < 20 ? "mid-" : "late ") + MONTHS[m];
  }
  function phenology(c) {
    const emerge = emergenceDay(c.months);
    return { emerge: emerge, install: emerge - 21, nestEnd: emerge + 63, cocoons: emerge + 150, next: emerge + 365 };
  }
  function recommendedInstallMonth(c) {
    return Math.max(0, Math.min(4, Math.floor(phenology(c).install / DAYS_PER_MONTH)));
  }
  function renderGuide() {
    const c = state.climate, r = state.result, site = state.site; if (!c || !r || !window.BeeGuide) return;
    const ph = phenology(c);
    const installDay = Math.max(ph.install, state.install * DAYS_PER_MONTH);
    const relDay = isFinite(r.release) ? installDay + r.release * DAYS_PER_MONTH : Infinity;
    $("guide-sub").textContent = "Made for " + (site.name === "Your pin" ? "your pin" : site.name) + ". Dates are estimates from your climate" + (state.source === "live" ? "." : " (example climate here).");
    window.BeeGuide.render($("guide-pages"), {
      place: site.name, coord: fmtCoord(site.lat, site.lon),
      species: site.lat < 46
        ? "For the red mason bee (<i>Osmia bicornis</i>) and the horned mason bee (<i>O. cornuta</i>), which flies a few weeks earlier."
        : "For the red mason bee (<i>Osmia bicornis</i>).",
      install: installDay, emerge: ph.emerge, nestEnd: ph.nestEnd, next: ph.next,
      relDay: isFinite(relDay) ? relDay : ph.next + 60, releaseMonths: r.release,
      early: isFinite(relDay) && relDay < ph.next, example: state.source !== "live",
      dir: state.dir ? DIR_NAMES[state.dir] : ""
    });
  }
  $("guide-pdf").addEventListener("click", function () { renderGuide(); window.print(); });

  // ---------- Printers
  // height: max build height (mm); bed: build plate X × Y (mm); the straw is ~281 mm, so shorter printers print it in two push-fit parts.
  const PRINTERS = [
    { id: "um-s5", name: "Ultimaker S5", fw: "Ultimaker (Griffin)", fil: 2.85, height: 300, bed: [330, 240], file: ".gcode", tested: true },
    { id: "prusa-mk4", name: "Prusa MK4 / MK4S", fw: "Prusa (Marlin)", fil: 1.75, height: 220, bed: [250, 210], file: ".bgcode" },
    { id: "prusa-core1", name: "Prusa Core One", fw: "Prusa (Marlin)", fil: 1.75, height: 270, bed: [250, 220], file: ".bgcode" },
    { id: "bambu-x1", name: "Bambu Lab X1 / P1S", fw: "Bambu", fil: 1.75, height: 250, bed: [256, 256], file: ".gcode.3mf" },
    { id: "bambu-a1", name: "Bambu Lab A1", fw: "Bambu", fil: 1.75, height: 256, bed: [256, 256], file: ".gcode.3mf" },
    { id: "ender3v3", name: "Creality Ender-3 V3", fw: "Marlin", fil: 1.75, height: 250, bed: [220, 220], file: ".gcode" },
    { id: "k1", name: "Creality K1", fw: "Klipper", fil: 1.75, height: 250, bed: [220, 220], file: ".gcode" },
    { id: "neptune4", name: "Elegoo Neptune 4", fw: "Klipper", fil: 1.75, height: 265, bed: [225, 225], file: ".gcode" },
    { id: "voron24", name: "Voron 2.4 (350)", fw: "Klipper", fil: 1.75, height: 340, bed: [350, 350], file: ".gcode" }
  ];
  const sel = $("printer");
  sel.innerHTML = '<option value="">Choose your printer</option>' + PRINTERS.map((p) => '<option value="' + p.id + '">' + p.name + (p.tested ? " (tested)" : "") + "</option>").join("") + '<option value="other">My printer isn’t listed</option>';
  sel.addEventListener("change", function () {
    const p = PRINTERS.find((x) => x.id === sel.value);
    $("flow-printer").classList.toggle("on", !!sel.value);
    if (window.BeeSlicer) window.BeeSlicer.update({ printer: p || PRINTERS[0] });
    if (!p) {
      $("printer-kv").hidden = true;
      $("printer-note").textContent = sel.value === "other" ? "Tell us which printer you have. Printer profiles come from the community." : "";
      $("material-diam").textContent = "";
      return;
    }
    $("printer-kv").hidden = false;
    $("printer-kv").innerHTML =
      "<dt>Firmware</dt><dd>" + p.fw + "</dd><dt>Filament</dt><dd>" + p.fil + " mm</dd>" +
      "<dt>Print</dt><dd>" + (p.height >= 285 ? "One piece" : "Two parts, push-fit") + "</dd><dt>File</dt><dd>" + p.file + "</dd>";
    $("printer-note").textContent = p.tested ? "Tested on our lab printer." : "Not tested yet. Your Straw Story helps us confirm this profile.";
    $("material-diam").textContent = "Your printer needs " + p.fil + " mm.";
  });

  // ---------- Actions that need an account (see auth.js)
  const AUTH = window.BeeAuth;
  if (AUTH) {
    AUTH.actions.download = function (user) {
      if (!AUTH.client) { $("get-status").textContent = "Preview: accounts are not switched on yet, so we can't save this."; return; }
      const p = PRINTERS.find((x) => x.id === sel.value);
      AUTH.client.from("print_file_requests").upsert({ printer: p ? p.name : null }).then(function (r) {
        $("get-status").textContent = r.error ? "Couldn't save: " + r.error.message
          : "Done. We'll email " + (user && user.email ? user.email : "you") + " when the print file" + (p ? " for the " + p.name : "") + " is ready.";
      });
    };
    AUTH.actions["create-story"] = function () {
      if (!AUTH.client || !state.site || !state.result) { $("get-status").textContent = "Preview: accounts are not switched on yet, so stories can't be saved."; return; }
      const p = PRINTERS.find((x) => x.id === sel.value);
      $("get-status").textContent = "Saving your straw…";
      AUTH.client.from("straws").insert({
        lat: Math.round(state.site.lat * 100) / 100, lon: Math.round(state.site.lon * 100) / 100,
        place_name: state.site.name === "Your pin" ? null : state.site.name.slice(0, 80),
        printer: p ? p.name : null, install_month: state.install,
        fuse_line_mm: Math.round(state.result.thick * 100) / 100, // thick-side sheet
        predicted_release_months: isFinite(state.result.release) ? Math.round(state.result.release * 10) / 10 : null,
        weather_source: state.source
      }).select("id").single().then(function (r) {
        if (r.error) { $("get-status").textContent = "Couldn't save: " + r.error.message; return; }
        return AUTH.client.from("checkins").insert({ straw_id: r.data.id, stage: 0, note: "Printed and ready to install." }).then(function () {
          $("get-status").textContent = "Your Straw Story has started.";
          location.hash = "#community";
          if (window.BeeCommunity) window.BeeCommunity.openStory(r.data.id);
        });
      });
    };
  }

  // ---------- Start
  // The map is set up only once Build is on screen: a map made inside a hidden view measures 0 × 0 and
  // loads almost no tiles. Later visits re-measure it.
  const buildView = mapEl.closest("[data-view]");
  function whenShown() {
    return new Promise(function (resolve) {
      if (!buildView.hidden) return resolve();
      const mo = new MutationObserver(function () { if (!buildView.hidden) { mo.disconnect(); resolve(); } });
      mo.observe(buildView, { attributes: true, attributeFilter: ["hidden"] });
    });
  }
  new MutationObserver(function () {
    if (buildView.hidden || !lmap) return;
    lmap.invalidateSize();
    if (state.site) lmap.setView([state.site.lat, state.site.lon], lmap.getZoom(), { animate: false });
  }).observe(buildView, { attributes: true, attributeFilter: ["hidden"] });
  // Start where the visitor last put their pin (this browser only), otherwise at De Bilt.
  function lastPin() {
    try {
      const p = JSON.parse(localStorage.getItem(PIN_KEY) || "null");
      if (p && isFinite(p.lat) && isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180) return p;
    } catch (e) { /* storage blocked */ }
    return null;
  }
  loadGoogle().then(whenShown).then(initGoogle)
    .catch(function () { return loadLeaflet().then(whenShown).then(initLeaflet); })
    .then(addAlphaEarthLayer, initPreviewMap)
    .then(function () {
      const p = lastPin() || EXAMPLES[0];
      setPlace(p.lat, p.lon, String(p.name || "Your pin").slice(0, 80), { zoom: true });
    });
})();

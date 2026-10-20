// Build your straw: place → site → decay preview → printer → download.
// The decay preview is a simplified, literature-based estimate, not Mateo's full engine:
//   wear per day = 0.6 µm/day/face at 25 °C (range 0.3–1.4), halved per 10 °C colder (Q10 = 2, assumed),
//   counted only on days the soil is wet. Calibrated so the standard fuse at De Bilt releases at 13.0 months
//   (the straw fuse study), using De Bilt weather from the same source as the pin, so places are compared
//   like with like. Every number it shows is model output, uncalibrated.
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
  const T0 = 0.25;          // standard fuse line, mm
  const TARGET = 13;        // months
  const MIN_LINE = 0.15, MAX_LINE = 0.40; // printable fuse lines, mm [assumed from Plate 4 range]
  const DAYS_PER_MONTH = 30.44;

  function rate(tSoil) { return tSoil <= 4 ? 0 : R25 * Math.pow(Q10, (tSoil - 25) / 10); }

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
  // Calibration: threshold for the standard fuse = De Bilt dose at 13.0 months from the same install month.
  // Live pins are compared with live De Bilt weather (same source, same years, same wet rule);
  // example climates with the example De Bilt climate.
  const DE_BILT = { lat: 52.10, lon: 5.18 };
  let reference = null; // live De Bilt climate, once loaded
  function calibration(startMonth, source) {
    const months = source === "live" && reference ? reference.months : exampleMonths(EXAMPLES[0]);
    return doseAt(cumulative(months, startMonth, 14), TARGET);
  }

  // ---------- State
  const state = { site: null, climate: null, source: "example", install: 2, month: 0, result: null };

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
  // Live De Bilt reference, cached in the browser for a month (per data window).
  function loadReference() {
    if (reference) return Promise.resolve(reference);
    const key = "beestraw-ref-v2-" + climateWindowEnd().toISOString().slice(0, 7);
    try { const c = JSON.parse(localStorage.getItem(key) || "null"); if (c && c.months) { reference = c; return Promise.resolve(c); } } catch (e) { /* storage blocked */ }
    return fetchClimate(DE_BILT.lat, DE_BILT.lon).then(function (c) {
      reference = { months: c.months, soilData: c.soilData };
      try { localStorage.setItem(key, JSON.stringify(reference)); } catch (e) { /* storage blocked */ }
      return reference;
    });
  }
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
    $("site-name").textContent = state.site.name;
    $("site-coord").textContent = Math.abs(lat).toFixed(5) + "° " + (lat >= 0 ? "N" : "S") + " · " + Math.abs(lon).toFixed(5) + "° " + (lon >= 0 ? "E" : "W");
    loadFingerprint(lat, lon, token);
    setStatus("Reading weather for this spot…");
    $("flow-site").classList.add("on"); $("flow-preview").classList.add("on");
    state.soil = null;
    fetchClimate(lat, lon).then(function (c) {
      if (token !== placeToken) return;
      // A pin at De Bilt is its own reference.
      if (!reference && Math.abs(lat - DE_BILT.lat) < 0.01 && Math.abs(lon - DE_BILT.lon) < 0.01) reference = { months: c.months, soilData: c.soilData };
      // Wait for the De Bilt reference, but never let it block the result.
      return loadReference().catch(function () { return null; }).then(function () {
        if (token !== placeToken) return;
        state.climate = c; state.source = "live";
        c.soil = soilText(lat, lon);
        render();
      });
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

  // AlphaEarth fingerprint of the area around the pin, from the Earth Engine connector.
  // Without the connector a generated placeholder is shown and labelled as such.
  function loadFingerprint(lat, lon, token) {
    const canvas = $("site-tile"), note = $("site-tile-note");
    const placeholder = function () {
      if (window.BeeTiles) window.BeeTiles.drawTile(canvas, Math.round((lat * 1000 + lon * 37) * 7) >>> 0, true);
      note.textContent = "AlphaEarth fingerprint of your place. Placeholder image until the Earth Engine connector is switched on.";
    };
    if (!CFG.alphaEarthEndpoint) { placeholder(); return; }
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
        note.textContent = "AlphaEarth " + d.year + ": " + d.sizeMeters + " × " + d.sizeMeters + " m around your pin, each pixel 10 m. Colours show 3 of the 64 numbers that describe each square.";
      })
      .catch(function () { if (token === placeToken) placeholder(); });
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
    const H = calibration(state.install, state.source);
    $("tune-cal").textContent = state.source === "live"
      ? (reference ? "Compared with De Bilt weather from the same source, where the standard straw lets go at 13 months." : "Compared with an example De Bilt climate: live De Bilt weather couldn't be loaded.")
      : "Compared with an example De Bilt climate.";
    const cum = cumulative(c.months, state.install, 24);
    const std = releaseMonth(cum, H);
    // Aim just past the dose at 13 months: in cold climates decay pauses over winter, so the fuse
    // reaching that dose early (in autumn) would mean an early release.
    let line = T0 * (doseAt(cum, TARGET) + 0.01) / H;
    const clamped = line < MIN_LINE ? "min" : line > MAX_LINE ? "max" : "";
    line = Math.min(MAX_LINE, Math.max(MIN_LINE, line));
    const threshold = H * (line / T0);
    const rel = releaseMonth(cum, threshold);
    state.result = { cum: cum, threshold: threshold, release: rel, line: line, std: std, clamped: clamped };

    $("tune-line").textContent = line.toFixed(2) + " mm";
    $("tune-release").textContent = isFinite(rel) ? "~" + rel.toFixed(1) + " months" : "over 24 months";
    $("tune-std").textContent = isFinite(std) ? std.toFixed(1) + " months" : "over 24 months";
    $("tune-note").textContent = clamped === "min"
      ? "Decay here is fast. Even the thinnest printable fuse may let go early, so check it in spring."
      : clamped === "max"
      ? "Decay here is slow. Even the thickest fuse line may outlast one season."
      : "The fuse lines are set so the nest lets go about 13 months after you install it.";
    drawChart();
    $("decay-month").max = 18;
    setMonth(+$("decay-month").value);
    renderGuide();
  }

  // Chart: fuse left (%) over 18 months
  function remaining(m) { const r = state.result; return Math.max(0, 1 - doseAt(r.cum, m) / r.threshold); }
  function drawChart() {
    const W = 420, Hh = 150, L = 34, B = 24, T = 10, Rr = 10;
    const x = (m) => L + (m / 18) * (W - L - Rr), y = (f) => T + (1 - f) * (Hh - T - B);
    let d = "", area = "M" + x(0) + " " + y(0);
    for (let m = 0; m <= 18; m += 0.25) { const f = remaining(m); d += (m ? "L" : "M") + x(m).toFixed(1) + " " + y(f).toFixed(1); area += "L" + x(m).toFixed(1) + " " + y(f).toFixed(1); }
    area += "L" + x(18) + " " + y(0) + "Z";
    let grid = "";
    [0, 0.5, 1].forEach((f) => { grid += '<line class="ch-grid" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y(f) + '" y2="' + y(f) + '"/><text class="ch-lab" x="' + (L - 6) + '" y="' + (y(f) + 4) + '" text-anchor="end">' + f * 100 + "%</text>"; });
    [0, 3, 6, 9, 12, 15, 18].forEach((m) => { grid += '<text class="ch-lab" x="' + x(m) + '" y="' + (Hh - 6) + '" text-anchor="middle">' + m + "</text>"; });
    const rel = state.result.release;
    const relMark = isFinite(rel) && rel <= 18 ? '<line class="ch-rel" x1="' + x(rel) + '" x2="' + x(rel) + '" y1="' + T + '" y2="' + y(0) + '"/><text class="ch-lab strong" x="' + (x(rel) + 4) + '" y="' + (T + 10) + '">lets go</text>' : "";
    $("decay-chart").innerHTML =
      '<rect class="ch-season" x="' + x(0) + '" y="' + T + '" width="' + (x(4) - x(0)) + '" height="' + (y(0) - T) + '"/><text class="ch-lab" x="' + (x(0) + 4) + '" y="' + (T + 10) + '">nesting</text>' +
      '<line class="ch-must" x1="' + x(11) + '" x2="' + x(11) + '" y1="' + T + '" y2="' + y(0) + '"/><text class="ch-lab" x="' + (x(11) - 4) + '" y="' + (T + 10) + '" text-anchor="end">must stand</text>' +
      grid + '<path class="ch-area" d="' + area + '"/><path class="ch-line" d="' + d + '"/>' + relMark +
      '<circle id="ch-dot" class="ch-dot" r="4"/>';
    state.chartX = x; state.chartY = y;
  }

  // Straw drawing at month m (stand-in until the simulation animation is added)
  function setMonth(m) {
    state.month = m;
    const r = state.result; if (!r) return;
    const f = remaining(m), gone = m >= r.release;
    const tilt = gone ? Math.min(32, (m - r.release + 1) * 12) : 0;
    const sw = (0.6 + 2.2 * f).toFixed(2), op = (0.25 + 0.75 * f).toFixed(2);
    let gy = "";
    for (let k = -3; k <= 3; k++) gy += '<path d="M' + (140 + k * 5) + ' 134 q 6 7 0 14 q -6 7 0 14" class="st-gyroid" stroke-width="' + (sw / 2).toFixed(2) + '" opacity="' + op + '"/>';
    $("straw").innerHTML =
      '<rect class="st-soil" x="0" y="140" width="420" height="80"/><line class="st-soil-line" x1="0" y1="140" x2="420" y2="140"/>' +
      '<text class="st-lab" x="8" y="134">soil line</text>' +
      '<path class="st-part" d="M134 210 L140 222 L146 210 L146 166 L134 166 Z"/><text class="st-lab" x="156" y="204">stake</text>' +
      '<circle class="st-fuse" cx="140" cy="148" r="15" stroke-width="' + sw + '" opacity="' + op + '"' + (f < 1 ? ' stroke-dasharray="4 3"' : "") + "/>" + gy +
      '<text class="st-lab accent" x="160" y="162">fuse · ' + Math.round(f * 100) + " % left</text>" +
      '<g transform="rotate(' + -tilt + ' 140 132)">' +
      '<path class="st-part" d="M134 132 L134 112 Q134 100 146 100 L150 100"/><path class="st-part" d="M146 132 L146 116 Q146 112 150 112"/>' +
      '<rect class="st-tube" x="150" y="100" width="210" height="12" rx="3"/><line class="st-bore" x1="154" y1="106" x2="356" y2="106"/>' +
      '<text class="st-lab" x="170" y="92">nest tube · 15 cm · bore Ø8</text><text class="st-lab" x="320" y="128">entrance</text></g>';
    $("decay-label").textContent = m;
    $("decay-state").textContent = m === 0 ? "Installed" : gone ? "Released: the nest has let go" : m >= 11 ? "Fuse is thin, release is near" : m <= 4 ? "Nesting season" : "Bees develop inside";
    const dot = $("ch-dot");
    if (dot && state.chartX) { dot.setAttribute("cx", state.chartX(m)); dot.setAttribute("cy", state.chartY(f)); }
  }
  $("decay-month").addEventListener("input", (e) => setMonth(+e.target.value));
  $("install-month").addEventListener("change", function (e) { state.install = +e.target.value; if (state.climate) render(); });


  // ---------- Install guide (per location)
  // Phenology is a rough estimate [assumed]: red mason bees emerge when daily mean temperatures reach
  // about 8 °C in the topsoil; install ~3 weeks before; nesting lasts ~8 weeks; the new bees overwinter in the tube
  // and emerge ~12 months later. That is why the fuse should hold for ~13 months.
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
    const c = state.climate, r = state.result, site = state.site; if (!c || !r) return;
    const ph = phenology(c);
    const installDay = Math.max(ph.install, state.install * DAYS_PER_MONTH);
    const relDay = installDay + (isFinite(r.release) ? r.release * DAYS_PER_MONTH : 999);
    const early = relDay < ph.next;
    const species = site.lat < 46
      ? "Red mason bee (<i>Osmia bicornis</i>) and the horned mason bee (<i>Osmia cornuta</i>), which flies a few weeks earlier"
      : "Red mason bee (<i>Osmia bicornis</i>)";
    $("guide-sub").textContent = "Made for " + site.name + " (" + fmtCoord(site.lat, site.lon) + "). Dates are estimates from your climate" + (state.source === "live" ? "." : " (example climate in this preview).");

    // Calendar: 14 months from the install month
    const startM = Math.floor(installDay / DAYS_PER_MONTH) % 12;
    let cal = "", lab = "";
    for (let k = 0; k < 14; k++) {
      const mi = Math.floor(installDay / DAYS_PER_MONTH) + k, a0 = mi * DAYS_PER_MONTH, a1 = a0 + DAYS_PER_MONTH;
      const overlaps = (x0, x1) => x0 < a1 && x1 > a0;
      const cls = overlaps(ph.next, ph.next + 30) ? "emerge" : overlaps(ph.emerge, ph.nestEnd) ? "nest" : overlaps(ph.nestEnd, ph.next) ? "dev" : "";
      cal += '<span class="' + cls + '"></span>';
      lab += "<span>" + SHORT[(startM + k) % 12] + "</span>";
    }
    const top = (n, t) => '<div class="gp-top"><span>Bee Straw · install guide</span><span>' + n + " / 4 · " + t + "</span></div>";
    const foot = '<p class="foot">' + esc(site.name) + " · " + fmtCoord(site.lat, site.lon) + " · dates are model estimates, uncalibrated</p>";

    $("guide-pages").innerHTML =
      // 1 Overview
      '<article class="gp">' + top(1, "Your year") +
      "<h3>Your straw at " + esc(site.name) + "</h3>" +
      "<p>For: " + species + ". These bees fly in spring, lay eggs in tubes, and their young stay inside until next spring.</p>" +
      '<dl class="when">' +
      "<dt>Install by</dt><dd><strong>" + when(installDay) + "</strong>, before the first bees fly</dd>" +
      "<dt>Bees fly</dt><dd>" + when(ph.emerge) + " to " + when(ph.nestEnd) + "</dd>" +
      "<dt>Tube sealed</dt><dd>by " + when(ph.nestEnd) + ": a mud cap closes the entrance</dd>" +
      "<dt>Inside</dt><dd>young bees grow over summer and sleep in cocoons through winter</dd>" +
      "<dt>New bees out</dt><dd>" + when(ph.next) + ", next year</dd>" +
      "<dt>Nest lets go</dt><dd>" + (isFinite(r.release) ? when(relDay) + ", about " + r.release.toFixed(0) + " months after installing" : "more than 2 years: the fuse may be too thick here") + "</dd>" +
      "</dl>" +
      '<div class="calendar" aria-hidden="true">' + cal + '</div><div class="cal-lab" aria-hidden="true">' + lab + "</div>" +
      '<div class="legend"><span><i style="background:var(--ink)"></i>bees nesting</span><span><i style="background:var(--line-strong)"></i>young inside</span><span><i style="background:var(--muted)"></i>new bees emerge</span></div>' +
      (early ? "<p><strong>Note:</strong> in this climate the fuse may let go before the new bees are out. If the tube falls early, leave it where it lies; the bees can still get out.</p>" : "") +
      foot + "</article>" +
      // 2 Install
      '<article class="gp">' + top(2, "Install") +
      "<h3>Put it in the ground</h3>" +
      "<ol>" +
      "<li><strong>Pick the spot.</strong> Sunny in the morning, facing south-east, out of strong wind. Flowers within about 300 m, and bare, damp clay soil nearby: the bees build their walls from mud.</li>" +
      "<li><strong>Push the stake in</strong> until the fuse bulb sits just under the soil. The soil line is where the bulb meets the bend.</li>" +
      "<li><strong>Bend the joint by hand</strong> to 90°, slowly, until the nest tube is level.</li>" +
      "<li><strong>Point the entrance</strong> south-east, tilted very slightly down so rain runs out.</li>" +
      "<li><strong>Press the soil</strong> firmly around the stake. Water it once if the ground is dry.</li>" +
      "<li><strong>Take a photo</strong> and start your Straw Story (optional).</li>" +
      "</ol>" +
      "<p>Don't move the straw once it's in. The timer works because the fuse stays in the same soil.</p>" +
      foot + "</article>" +
      // 3 Check-ins
      '<article class="gp">' + top(3, "Check-ins") +
      "<h3>What to look for, and when</h3>" +
      '<dl class="when">' +
      "<dt>" + when(installDay) + "</dt><dd><strong>Installed.</strong> Photo of the straw in place.</dd>" +
      "<dt>" + when(ph.emerge) + " → " + when(ph.nestEnd) + "</dt><dd><strong>Once a week.</strong> Bees going in and out? Pollen or mud at the entrance?</dd>" +
      "<dt>" + when(ph.nestEnd) + "</dt><dd><strong>Sealed.</strong> A mud cap closes the tube. Photo of the cap.</dd>" +
      "<dt>Month 3 and 6</dt><dd><strong>Standing?</strong> Photo from the side, so we can see the angle.</dd>" +
      "<dt>Winter</dt><dd><strong>After hard frost or storms.</strong> Still standing? Leave it alone.</dd>" +
      "<dt>" + when(ph.next) + "</dt><dd><strong>New bees out.</strong> Holes in the mud cap mean they made it.</dd>" +
      "<dt>" + (isFinite(r.release) ? when(relDay) : "Later") + "</dt><dd><strong>Let go.</strong> Photo of the tube on the ground, and the date it fell.</dd>" +
      "</dl>" +
      "<p>Each check-in takes three taps and an optional photo in your Straw Story. Every upload helps us predict decay better for places like yours.</p>" +
      foot + "</article>" +
      // 4 End of life
      '<article class="gp">' + top(4, "The end") +
      "<h3>When it lets go</h3>" +
      "<p>The fuse just under the soil slowly wears away in the damp ground. When it is gone, the nest tube tips over onto the soil.</p>" +
      "<ul>" +
      "<li><strong>Leave it where it falls.</strong> On the ground the tube is in soil contact too, and breaks down over the following seasons.</li>" +
      "<li><strong>Nothing to collect.</strong> allPHA is made by microbes and is broken down by microbes in soil.</li>" +
      "<li><strong>Fell early?</strong> If the new bees aren't out yet, lay the tube in a sheltered spot with the entrance free. Tell us in your story: it helps fix the timing.</li>" +
      "<li><strong>Still standing at month 16?</strong> Note it in your story. Your soil may be drier or colder than the model thought.</li>" +
      "</ul>" +
      "<h3>Next season</h3>" +
      "<p>Print a new straw for next spring and put it in a fresh spot a few metres away. A fresh nest each year is what keeps mites and mould from building up.</p>" +
      foot + "</article>";
  }
  $("guide-pdf").addEventListener("click", function () { renderGuide(); window.print(); });

  // ---------- Printers
  // height: max build height (mm); the straw is ~281 mm, so shorter printers print it in two push-fit parts.
  const PRINTERS = [
    { id: "um-s5", name: "Ultimaker S5", fw: "Ultimaker (Griffin)", fil: 2.85, height: 300, file: ".gcode", tested: true },
    { id: "prusa-mk4", name: "Prusa MK4 / MK4S", fw: "Prusa (Marlin)", fil: 1.75, height: 220, file: ".bgcode" },
    { id: "prusa-core1", name: "Prusa Core One", fw: "Prusa (Marlin)", fil: 1.75, height: 270, file: ".bgcode" },
    { id: "bambu-x1", name: "Bambu Lab X1 / P1S", fw: "Bambu", fil: 1.75, height: 250, file: ".gcode.3mf" },
    { id: "bambu-a1", name: "Bambu Lab A1", fw: "Bambu", fil: 1.75, height: 256, file: ".gcode.3mf" },
    { id: "ender3v3", name: "Creality Ender-3 V3", fw: "Marlin", fil: 1.75, height: 250, file: ".gcode" },
    { id: "k1", name: "Creality K1", fw: "Klipper", fil: 1.75, height: 250, file: ".gcode" },
    { id: "neptune4", name: "Elegoo Neptune 4", fw: "Klipper", fil: 1.75, height: 265, file: ".gcode" },
    { id: "voron24", name: "Voron 2.4 (350)", fw: "Klipper", fil: 1.75, height: 340, file: ".gcode" }
  ];
  const sel = $("printer");
  sel.innerHTML = '<option value="">Choose your printer</option>' + PRINTERS.map((p) => '<option value="' + p.id + '">' + p.name + (p.tested ? " (tested)" : "") + "</option>").join("") + '<option value="other">My printer isn’t listed</option>';
  sel.addEventListener("change", function () {
    const p = PRINTERS.find((x) => x.id === sel.value);
    $("flow-printer").classList.toggle("on", !!sel.value);
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
    AUTH.actions.download = function () {
      $("get-status").textContent = "Print files are on their way: we're turning our tested generator into one that writes files for every printer. Start your Straw Story and we'll let you know when yours is ready.";
    };
    AUTH.actions["create-story"] = function () {
      if (!AUTH.client || !state.site || !state.result) { $("get-status").textContent = "Preview: accounts are not switched on yet, so stories can't be saved."; return; }
      const p = PRINTERS.find((x) => x.id === sel.value);
      $("get-status").textContent = "Saving your straw…";
      AUTH.client.from("straws").insert({
        lat: Math.round(state.site.lat * 100) / 100, lon: Math.round(state.site.lon * 100) / 100,
        place_name: state.site.name === "Your pin" ? null : state.site.name.slice(0, 80),
        printer: p ? p.name : null, install_month: state.install,
        fuse_line_mm: Math.round(state.result.line * 100) / 100,
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
  loadGoogle().then(initGoogle)
    .catch(function () { return loadLeaflet().then(initLeaflet); })
    .then(addAlphaEarthLayer, initPreviewMap)
    .then(function () {
      const e = EXAMPLES[0];
      setPlace(e.lat, e.lon, e.name, { zoom: true });
    });
})();

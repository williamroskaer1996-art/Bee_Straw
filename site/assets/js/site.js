// Bee Straw site — routing, placeholder satellite tiles, example content, sign-in dialog.
(function () {
  "use strict";

  // ---- Placeholder false-colour tiles.
  // Stand-in for AlphaEarth imagery (3 of 64 embedding dimensions shown as R, G, B).
  function rng(seed) {
    return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  }
  function smoothNoise(r, w, h, cells) {
    const g = [];
    for (let i = 0; i <= cells; i++) { g[i] = []; for (let j = 0; j <= cells; j++) g[i][j] = r(); }
    const s = (t) => t * t * (3 - 2 * t);
    return function (x, y) {
      const fx = (x / w) * cells, fy = (y / h) * cells, i = Math.floor(fx), j = Math.floor(fy), u = s(fx - i), v = s(fy - j);
      const a = g[i][j], b = g[i + 1][j], c = g[i][j + 1], d = g[i + 1][j + 1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  function drawTile(canvas, seed, fields) {
    const ctx = canvas.getContext("2d"), w = canvas.width, h = canvas.height, r = rng(seed);
    const n = [smoothNoise(r, w, h, 4), smoothNoise(r, w, h, 7), smoothNoise(r, w, h, 12)];
    const plots = [];
    if (fields) for (let k = 0; k < 8; k++) plots.push([r() * w, r() * h, 0.1 * w + r() * 0.4 * w, 0.1 * h + r() * 0.35 * h, r()]);
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let a = n[0](x, y), b = n[1](x, y), c = n[2](x, y);
        for (const p of plots) if (x > p[0] && x < p[0] + p[2] && y > p[1] && y < p[1] + p[3]) { a = (a + p[4]) / 2; b = 1 - b * 0.6; }
        const i = (y * w + x) * 4;
        img.data[i] = 60 + a * 180; img.data[i + 1] = 50 + b * 170; img.data[i + 2] = 80 + c * 160; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  function makeCanvas(w, h, seed, fields, className) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    if (className) c.className = className;
    c.setAttribute("aria-hidden", "true");
    drawTile(c, seed, fields);
    return c;
  }

  window.BeeTiles = { drawTile: drawTile };

  // ---- Home mosaic: real AlphaEarth 2025 images (bands A01/A16/A09) of European landscapes,
  // rendered once with tools/render_ae_mosaic.js. Big tiles show ~10 km, small ones ~5 km, at 40 m per pixel.
  const mosaic = document.getElementById("mosaic");
  if (mosaic) {
    const PLACES = [
      ["flevoland", "Flevoland polders, NL", true], ["po", "Po delta, IT", false], ["almeria", "Greenhouses, Almería, ES", false],
      ["olive", "Olive groves, Jaén, ES", true], ["alps", "Bernese Alps, CH", false], ["fjord", "Sognefjord, NO", false],
      ["jutland", "Farmland, Jutland, DK", false], ["paris", "Paris, FR", false], ["venice", "Venice lagoon, IT", false],
      ["rhine", "Rhine valley, DE", false], ["puszta", "Great Plain, HU", false], ["highlands", "Scottish Highlands, UK", false],
      ["bulbs", "Bulb fields, Lisse, NL", false], ["dalarna", "Forest and lakes, Dalarna, SE", false], ["camargue", "Camargue, FR", false],
      ["iceland", "South Iceland", false], ["wadden", "Wadden Sea coast, NL", false], ["debilt", "De Bilt, NL", false]
    ];
    PLACES.forEach(function (pl) {
      const fig = document.createElement("figure");
      fig.className = "ae-tile" + (pl[2] ? " big" : "");
      fig.innerHTML = '<img src="assets/img/ae/' + pl[0] + '.jpg" alt="AlphaEarth view of ' + pl[1] + '" loading="lazy" width="' + (pl[2] ? 256 : 128) + '" height="' + (pl[2] ? 256 : 128) + '"><figcaption>' + pl[1] + "</figcaption>";
      mosaic.appendChild(fig);
    });
  }

  // ---- How it works carousel (scroll-snap track + tabs)
  const track = document.getElementById("hiw-track");
  if (track) {
    const tabs = Array.from(document.querySelectorAll(".hiw-tabs [role=tab]"));
    const slides = Array.from(track.children);
    let current = 0;
    const go = (i) => { i = Math.max(0, Math.min(slides.length - 1, i)); track.scrollTo({ left: slides[i].offsetLeft - track.offsetLeft, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); mark(i); };
    const mark = (i) => {
      current = i;
      tabs.forEach((t, k) => { t.setAttribute("aria-selected", k === i ? "true" : "false"); t.tabIndex = k === i ? 0 : -1; });
      document.getElementById("hiw-count").textContent = i + 1 + " / " + slides.length;
      document.getElementById("hiw-prev").disabled = i === 0;
      document.getElementById("hiw-next").disabled = i === slides.length - 1;
    };
    tabs.forEach((t, k) => {
      t.addEventListener("click", () => go(k));
      t.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const n = current + (e.key === "ArrowRight" ? 1 : -1); go(n); tabs[Math.max(0, Math.min(tabs.length - 1, n))].focus(); }
      });
    });
    document.getElementById("hiw-prev").addEventListener("click", () => go(current - 1));
    document.getElementById("hiw-next").addEventListener("click", () => go(current + 1));
    // Sync the tabs when the visitor swipes; wait until scrolling settles so button clicks aren't undone mid-scroll.
    let settle = 0;
    track.addEventListener("scroll", () => { clearTimeout(settle); settle = setTimeout(() => { const i = Math.round(track.scrollLeft / track.clientWidth); if (i !== current) mark(i); }, 140); }, { passive: true });
    mark(0);

    const tiles = document.getElementById("hiw-tiles");
    ["almeria", "po", "flevoland", "alps", "paris", "venice", "jutland", "fjord"].forEach(function (id) {
      const im = document.createElement("img");
      im.src = "assets/img/ae/" + id + ".jpg"; im.alt = ""; im.loading = "lazy";
      tiles.appendChild(im);
    });
    // Slide 1: satellite tiles around De Bilt (same imagery as the Build map), loaded when the section comes near.
    const map = document.getElementById("hiw-map");
    const PIN = { lat: 52.1, lon: 5.18 }, Z = 17, T = 100, CX = 200, CY = 150; // tile size in view units; pin tip at (CX, CY)
    function drawMap() {
      const n = Math.pow(2, Z), xf = (PIN.lon + 180) / 360 * n;
      const yf = (1 - Math.asinh(Math.tan(PIN.lat * Math.PI / 180)) / Math.PI) / 2 * n;
      const mPerUnit = 40075016.7 * Math.cos(PIN.lat * Math.PI / 180) / n / T;
      let h = '<g class="m-img">';
      for (let tx = Math.floor(xf - CX / T); tx <= Math.floor(xf + (400 - CX) / T); tx++)
        for (let ty = Math.floor(yf - CY / T); ty <= Math.floor(yf + (260 - CY) / T); ty++)
          h += '<image href="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + Z + "/" + ty + "/" + tx +
            '" x="' + (CX + (tx - xf) * T).toFixed(2) + '" y="' + (CY + (ty - yf) * T).toFixed(2) + '" width="' + (T + 0.4) + '" height="' + (T + 0.4) + '" preserveAspectRatio="none"/>';
      h += '</g><g class="m-grid">';
      for (let x = 40; x < 400; x += 80) h += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="260"/>';
      for (let y = 30; y < 260; y += 80) h += '<line x1="0" y1="' + y + '" x2="400" y2="' + y + '"/>';
      const bar = 100 / mPerUnit; // 100 m
      h += '</g><g class="m-scale"><rect x="14" y="226" width="' + (bar + 46).toFixed(1) + '" height="20" rx="3"/><line x1="22" y1="240" x2="' + (22 + bar).toFixed(1) + '" y2="240"/><line x1="22" y1="235" x2="22" y2="240"/><line x1="' + (22 + bar).toFixed(1) + '" y1="235" x2="' + (22 + bar).toFixed(1) + '" y2="240"/><text x="' + (28 + bar).toFixed(1) + '" y="241">100 m</text></g>';
      h += '<text class="m-attr" x="384" y="249" text-anchor="end">Imagery © Esri</text>';
      h += '<circle class="m-ring" cx="' + CX + '" cy="' + CY + '" r="22"/>';
      h += '<g class="m-pin"><ellipse class="m-shadow" cx="' + CX + '" cy="' + CY + '" rx="7" ry="2.5"/><path class="m-drop" d="M' + CX + " " + CY + " C" + (CX - 3) + " " + (CY - 9) + " " + (CX - 12) + " " + (CY - 16) + " " + (CX - 12) + " " + (CY - 26) +
        " A12 12 0 1 1 " + (CX + 12) + " " + (CY - 26) + " C" + (CX + 12) + " " + (CY - 16) + " " + (CX + 3) + " " + (CY - 9) + " " + CX + " " + CY + 'Z"/><circle class="m-dot" cx="' + CX + '" cy="' + (CY - 26) + '" r="4.5"/></g>';
      h += '<g class="m-lab"><line x1="' + (CX + 12) + '" y1="' + (CY - 32) + '" x2="' + (CX + 36) + '" y2="' + (CY - 62) + '"/><rect x="' + (CX + 28) + '" y="' + (CY - 84) + '" width="156" height="22" rx="3"/><text x="' + (CX + 36) + '" y="' + (CY - 69) + '">52.1000° N · 5.1800° E</text></g>';
      map.innerHTML = h;
    }
    if ("IntersectionObserver" in window) {
      let drawn = false;
      new IntersectionObserver(function (es, io) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          if (!drawn) { drawn = true; drawMap(); }
          if (e.intersectionRatio > 0.5) { requestAnimationFrame(() => map.classList.add("in")); io.disconnect(); }
        });
      }, { rootMargin: "300px 0px", threshold: [0, 0.6] }).observe(map);
    } else { drawMap(); map.classList.add("in"); }

    // Slide 3: the monthly inputs of the decay model. Live De Bilt data if Build already cached it in this browser,
    // otherwise the example De Bilt climate (same formula as build.js).
    let months = null, live = false;
    try {
      const keys = Object.keys(localStorage).filter((k) => k.indexOf("beestraw-ref-v2-") === 0).sort();
      const c = keys.length ? JSON.parse(localStorage.getItem(keys[keys.length - 1])) : null;
      if (c && c.months && c.months.length === 12) { months = c.months; live = true; }
    } catch (e) { /* storage blocked */ }
    if (!months) months = Array.from({ length: 12 }, (_, m) => ({
      t: 10.6 + 7.0 * Math.cos((2 * Math.PI * (m - 6.5)) / 12),
      wet: Math.min(0.95, Math.max(0.05, 0.62 + 0.15 * Math.cos((2 * Math.PI * (m - 0.5)) / 12)))
    }));
    const rate = (t) => (t <= 4 ? 0 : 0.6 * Math.pow(2, (t - 25) / 10)); // µm/day at wet soil (build.js)
    const X0 = 46, X1 = 356, Y0 = 46, Y1 = 186, TMAX = 25;
    const mx = (i) => X0 + (i + 0.5) * (X1 - X0) / 12, ty = (t) => Y1 - Math.max(0, t) / TMAX * (Y1 - Y0), wy = (f) => Y1 - f * (Y1 - Y0);
    let w = '<g class="c-grid">';
    [0, 5, 10, 15, 20, 25].forEach((t) => { w += '<line x1="' + X0 + '" y1="' + ty(t) + '" x2="' + X1 + '" y2="' + ty(t) + '"/><text class="d-lab" x="' + (X0 - 6) + '" y="' + (ty(t) + 3.5) + '" text-anchor="end">' + t + "</text>"; });
    [0, 50, 100].forEach((f) => { w += '<text class="d-lab" x="' + (X1 + 6) + '" y="' + (wy(f / 100) + 3.5) + '">' + f + "</text>"; });
    w += '</g><line class="c-axis" x1="' + X0 + '" y1="' + Y1 + '" x2="' + X1 + '" y2="' + Y1 + '"/>';
    w += '<text class="d-lab" x="' + (X0 - 6) + '" y="' + (Y0 - 12) + '" text-anchor="end">°C</text><text class="d-lab" x="' + (X1 + 6) + '" y="' + (Y0 - 12) + '">% wet</text>';
    // 4 °C: no wear below
    w += '<line class="c-cold" x1="' + X0 + '" y1="' + ty(4) + '" x2="' + X1 + '" y2="' + ty(4) + '"/><text class="d-lab c-note" x="' + mx(6) + '" y="' + (ty(4) + 13) + '" text-anchor="middle">4 °C · no wear below</text>';
    const line = (fn) => months.map((m, i) => (i ? "L" : "M") + mx(i).toFixed(1) + " " + fn(m).toFixed(1)).join(" ");
    w += '<path class="c-wet" d="' + line((m) => wy(m.wet)) + '"/>';
    w += '<path class="c-temp" d="' + line((m) => ty(m.t)) + '"/>';
    months.forEach((m, i) => { w += '<circle class="c-wetpt" cx="' + mx(i).toFixed(1) + '" cy="' + wy(m.wet).toFixed(1) + '" r="2.6"/><circle class="c-tpt" cx="' + mx(i).toFixed(1) + '" cy="' + ty(m.t).toFixed(1) + '" r="2.6"/>'; });
    // Wear strip: warm × wet, relative to the busiest month
    const wear = months.map((m) => rate(m.t) * m.wet), top = Math.max.apply(null, wear) || 1, cw = (X1 - X0) / 12;
    "JFMAMJJASOND".split("").forEach((c, i) => {
      w += '<text class="d-lab" x="' + mx(i).toFixed(1) + '" y="' + (Y1 + 14) + '" text-anchor="middle">' + c + "</text>";
      w += '<rect class="c-wear" x="' + (X0 + i * cw + 1).toFixed(1) + '" y="' + (Y1 + 24) + '" width="' + (cw - 2).toFixed(1) + '" height="10" style="opacity:' + (0.08 + 0.92 * wear[i] / top).toFixed(2) + '"/>';
    });
    w += '<text class="d-lab" x="' + (X0 - 6) + '" y="' + (Y1 + 33) + '" text-anchor="end">wear</text>';
    // Legend and source
    w += '<line class="c-temp" x1="' + X0 + '" y1="18" x2="' + (X0 + 18) + '" y2="18"/><text class="d-lab" x="' + (X0 + 24) + '" y="21.5">soil temp. 0–7 cm</text>';
    w += '<line class="c-wet" x1="' + (X0 + 160) + '" y1="18" x2="' + (X0 + 178) + '" y2="18"/><text class="d-lab" x="' + (X0 + 184) + '" y="21.5">wet days</text>';
    w += '<text class="d-lab c-src" x="' + X1 + '" y="' + (Y1 + 58) + '" text-anchor="end">' + (live ? "Open-Meteo · De Bilt · 5-year monthly means" : "Example climate · De Bilt · model input") + "</text>";
    document.getElementById("hiw-weather").innerHTML = w;
  }

  // ---- Build step bar: sticks under the header, jumps to each step and marks the one in view.
  const header = document.querySelector(".site-header");
  const setHeaderH = () => document.documentElement.style.setProperty("--hdr", (header ? header.offsetHeight : 0) + "px");
  setHeaderH(); addEventListener("resize", setHeaderH);
  const flow = document.getElementById("flowbar");
  if (flow) {
    const steps = Array.from(flow.querySelectorAll("a[data-step]"));
    flow.addEventListener("click", function (e) {
      const a = e.target.closest("a[data-step]"); if (!a) return;
      e.preventDefault(); // keep #build in the address bar
      const t = document.getElementById(a.dataset.step);
      if (t) t.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    });
    let ticking = false;
    const markCurrent = function () {
      ticking = false;
      let cur = steps[0];
      if (flow.offsetParent === null) return; // Build is hidden: nothing to measure
      steps.forEach(function (a) { const t = document.getElementById(a.dataset.step); if (t && t.getBoundingClientRect().top < innerHeight * 0.45) cur = a; });
      steps.forEach(function (a) { if (a === cur) a.setAttribute("aria-current", "step"); else a.removeAttribute("aria-current"); });
    };
    addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(markCurrent); } }, { passive: true });
    markCurrent();
    new MutationObserver(function () { requestAnimationFrame(markCurrent); }).observe(flow.closest("[data-view]"), { attributes: true, attributeFilter: ["hidden"] });
  }

  // ---- Routing: #home, #about, #build, #community
  const views = Array.from(document.querySelectorAll("[data-view]"));
  const links = Array.from(document.querySelectorAll(".site-nav a"));
  function show(name, scroll) {
    if (!views.some(function (v) { return v.dataset.view === name; })) name = "home";
    views.forEach(function (v) { v.hidden = v.dataset.view !== name; });
    links.forEach(function (a) { a.setAttribute("aria-current", a.getAttribute("href") === "#" + name ? "page" : "false"); });
    const title = { home: "Bee Straw", about: "About · Bee Straw", build: "Build your straw · Bee Straw", community: "Community · Bee Straw" };
    document.title = title[name];
    if (scroll) window.scrollTo(0, 0);
  }
  document.addEventListener("click", function (e) {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const name = a.getAttribute("href").slice(1);
    if (!views.some(function (v) { return v.dataset.view === name; })) return;
    e.preventDefault();
    try { history.replaceState(null, "", "#" + name); } catch (err) { /* sandboxed preview */ }
    show(name, true);
  });
  window.addEventListener("hashchange", function () {
    const name = location.hash.slice(1);
    if (views.some(function (v) { return v.dataset.view === name; })) show(name, true);
  });
  const start = location.hash.slice(1);
  const target = start && document.getElementById(start);
  const inView = target && target.closest("[data-view]");
  show(inView && !target.matches("[data-view]") ? inView.dataset.view : start || "home", false);
  if (inView && !target.matches("[data-view]")) target.scrollIntoView();

  document.getElementById("year").textContent = new Date().getFullYear();
})();

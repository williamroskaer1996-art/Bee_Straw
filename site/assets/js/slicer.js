// Print preview: the straw's toolpaths on your printer's build plate, like a slicer preview.
// The worker (slicer-worker.js) writes stand-in G-code and reads it back; this file draws it with three.js.
// API: window.BeeSlicer.update({ printer, fuse: { thick, thin } }) — build.js calls it when the printer or the tuning changes.
(function () {
  "use strict";
  const root = document.getElementById("slicer");
  if (!root) return;
  const LIBS = ["https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js",
    "https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js"];
  const DENSITY = 1.25; // g/cm³, PHA [assumed]
  const DEFAULT = { id: "um-s5", name: "Ultimaker S5", fil: 2.85, height: 300, bed: [330, 240] };
  const $ = (id) => document.getElementById(id);
  const wrap = $("slicer-view"), canvas = $("slicer-canvas"), slider = $("slicer-layer"), status = $("slicer-status");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");

  const opts = { printer: DEFAULT, fuse: { thick: 0.2, thin: 0.133 } };
  let started = false, libs = null, worker = null, jobId = 0, data = null;
  let three = null; // { renderer, scene, camera, controls, plateGroup, paths, top }

  function loadScript(src) {
    return new Promise(function (res, rej) { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Couldn't load " + src)); document.head.appendChild(s); });
  }
  function loadLibs() {
    if (!libs) libs = (window.THREE ? Promise.resolve() : loadScript(LIBS[0])).then(() => (window.THREE.OrbitControls ? null : loadScript(LIBS[1])))
      .catch(function (e) { libs = null; throw e; }); // try again on the next run
    return libs;
  }

  // Colours from the page's own tokens, so light and dark themes match.
  function token(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    const m = /^#([0-9a-f]{6})$/i.exec(v);
    if (m) { const n = parseInt(m[1], 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
    const r = /rgba?\(([^)]+)\)/.exec(v); if (r) { const p = r[1].split(",").map(parseFloat); return [p[0] / 255, p[1] / 255, p[2] / 255]; }
    return token("", fallback);
  }
  function palette() {
    // order = TYPES in the worker: outer wall, inner walls, joint, fuse, skin, brim; then the background (fuse shading)
    const ink = token("--ink", "#101218"), bg = token("--bg", "#ffffff"), outer = ink.map((c, i) => c * 0.7 + bg[i] * 0.3); // a little lighter, so the shading reads
    return [outer, token("--muted", "#5d6170"), token("--focus", "#2f6fed"), token("--straw", "#c98a00"), token("--muted", "#5d6170"), token("--line-strong", "#c9ccd4"), bg];
  }

  // ---------- Scene
  function initThree() {
    const T = window.THREE;
    const renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(32, 1, 1, 5000);
    const controls = new T.OrbitControls(camera, canvas);
    controls.enableDamping = !reduce.matches; controls.dampingFactor = 0.12;
    controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 40; controls.maxDistance = 2000;
    controls.addEventListener("change", requestRender);
    controls.addEventListener("end", requestRender); // one more frame when the drag ends
    three = { T: T, renderer: renderer, scene: scene, camera: camera, controls: controls, plateGroup: null, paths: null, top: null };
    new ResizeObserver(resize).observe(wrap);
    resize();
  }
  let renderQueued = false;
  function requestRender() { if (!renderQueued) { renderQueued = true; requestAnimationFrame(renderNow); } }
  function renderNow() { renderQueued = false; if (!three) return; three.controls.update(); three.renderer.render(three.scene, three.camera); }
  // Resize only when the size really changes (resizing clears the canvas), then draw straight away.
  let lastW = 0, lastH = 0;
  function resize() {
    if (!three) return;
    const w = canvas.clientWidth, h = Math.round(Math.max(300, Math.min(560, w * 0.62))); // canvas = the box minus padding
    if (!w || (w === lastW && h === lastH)) return;
    lastW = w; lastH = h;
    three.renderer.setSize(w, h, false); canvas.style.height = h + "px";
    three.camera.aspect = w / h; three.camera.updateProjectionMatrix(); renderNow();
  }

  function buildPlate(p) {
    const T = three.T, g = new T.Group(), bx = p.bed[0], by = p.bed[1], H = p.height;
    const c = (rgb) => new T.Color(rgb[0], rgb[1], rgb[2]);
    const plate = new T.Mesh(new T.PlaneGeometry(bx, by), new T.MeshBasicMaterial({ color: c(token("--bg", "#ffffff")) }));
    plate.rotation.x = -Math.PI / 2; plate.position.y = -0.05; g.add(plate);
    const fine = [], bold = [];
    for (let x = -bx / 2; x <= bx / 2 + 1e-6; x += 10) (Math.round(x + bx / 2) % 50 === 0 ? bold : fine).push(x, 0, -by / 2, x, 0, by / 2);
    for (let y = -by / 2; y <= by / 2 + 1e-6; y += 10) (Math.round(y + by / 2) % 50 === 0 ? bold : fine).push(-bx / 2, 0, y, bx / 2, 0, y);
    const lines = (arr, rgb, op) => { const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(arr, 3)); return new T.LineSegments(geo, new T.LineBasicMaterial({ color: c(rgb), transparent: op < 1, opacity: op })); };
    g.add(lines(fine, token("--line", "#e3e5ea"), 1));
    g.add(lines(bold, token("--line-strong", "#c9ccd4"), 1));
    const box = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(bx, H, by)), new T.LineBasicMaterial({ color: c(token("--line-strong", "#c9ccd4")), transparent: true, opacity: 0.7 }));
    box.position.y = H / 2; g.add(box);
    // origin marker: front-left corner
    g.add(lines([-bx / 2, 0.1, by / 2, -bx / 2 + 20, 0.1, by / 2, -bx / 2, 0.1, by / 2, -bx / 2, 0.1, by / 2 - 20], token("--ink", "#101218"), 1));
    return g;
  }
  // Frame the part(s) so the full height is in view, with some of the plate around them.
  function frame(p, partH) {
    const d = Math.max(partH * 3.4, 170); // close on the part; the plate fills the background
    const v = new three.T.Vector3(-0.5, 0.42, 0.76).normalize().multiplyScalar(d);
    three.controls.target.set(0, partH * 0.45, 0);
    three.camera.position.set(v.x, v.y + partH * 0.45, v.z);
    three.controls.update();
  }

  function showData(d) {
    const T = three.T;
    if (three.plateGroup) { three.scene.remove(three.plateGroup); three.plateGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    three.plateGroup = buildPlate(opts.printer); three.scene.add(three.plateGroup);
    if (three.paths) { three.scene.remove(three.paths, three.top); three.paths.geometry.dispose(); three.paths.material.dispose(); three.top.material.dispose(); }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(d.pos, 3));
    geo.setAttribute("color", new T.BufferAttribute(d.col, 3));
    three.paths = new T.LineSegments(geo, new T.LineBasicMaterial({ vertexColors: true }));
    three.top = new T.LineSegments(geo, new T.LineBasicMaterial({ color: new T.Color(0xe5484d) })); // current layer
    three.scene.add(three.paths, three.top);
    if (!data || data.printerId !== opts.printer.id) frame(opts.printer, Math.max.apply(null, d.parts.map((q) => q.h)));
    d.printerId = opts.printer.id;
    const first = !data;
    data = d;
    slider.max = d.layerZ.length; slider.disabled = false;
    if (first && !reduce.matches) playIn(); else setLayer(d.layerZ.length);
    stats(d);
  }
  function setLayer(n) {
    if (!data) return;
    n = Math.max(1, Math.min(data.layerZ.length, n | 0));
    slider.value = n;
    three.paths.geometry.setDrawRange(0, data.layerStart[n] * 2);
    three.top.geometry = three.paths.geometry; // shares buffers; draw range set per render below
    three.top.onBeforeRender = function () { three.paths.geometry.setDrawRange(data.layerStart[n - 1] * 2, (data.layerStart[n] - data.layerStart[n - 1]) * 2); };
    three.top.onAfterRender = function () { three.paths.geometry.setDrawRange(0, data.layerStart[n] * 2); };
    three.top.visible = n < data.layerZ.length;
    $("slicer-layer-n").textContent = n.toLocaleString("en-GB") + " / " + data.layerZ.length.toLocaleString("en-GB");
    $("slicer-layer-z").textContent = "z " + data.layerZ[n - 1].toFixed(1) + " mm · " + (data.layerZone[n - 1] || "");
    requestRender();
  }
  let playing = 0;
  function playIn() {
    const N = data.layerZ.length, t0 = performance.now(), dur = 2200;
    cancelAnimationFrame(playing);
    const tick = (t) => { const u = Math.min(1, (t - t0) / dur); setLayer(Math.max(1, Math.round(N * (1 - Math.pow(1 - u, 3))))); if (u < 1) playing = requestAnimationFrame(tick); };
    playing = requestAnimationFrame(tick);
  }
  slider.addEventListener("input", function () { cancelAnimationFrame(playing); setLayer(+slider.value); });
  slider.addEventListener("change", requestRender); // and when the slider is let go
  document.addEventListener("visibilitychange", function () { if (!document.hidden) requestRender(); });

  function fmtTime(s) { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return (h ? h + " h " : "") + m + " min"; }
  function stats(d) {
    const p = opts.printer, f = opts.fuse;
    const grams = d.filament * Math.PI * p.fil * p.fil / 4 / 1000 * DENSITY;
    $("slicer-kv").innerHTML =
      "<dt>Printer</dt><dd>" + p.name + " · " + p.bed[0] + " × " + p.bed[1] + " × " + p.height + " mm</dd>" +
      "<dt>Part</dt><dd>Fuse section of the Ø20 straw · " + Math.round(d.parts[0].h) + " mm tall</dd>" +
      "<dt>Layers</dt><dd>" + d.layerZ.length.toLocaleString("en-GB") + " · 0.1 mm in the fuse, 0.2 mm in the straw</dd>" +
      "<dt>Fuse sheets</dt><dd>" + f.thick.toFixed(2) + " mm thick side → " + f.thin.toFixed(2) + " mm thin side (tuned for your site)</dd>" +
      "<dt>Filament</dt><dd>" + (d.filament / 1000).toFixed(2) + " m · ≈ " + Math.round(grams) + " g of " + p.fil + " mm allPHA</dd>" +
      "<dt>Print time</dt><dd>≈ " + fmtTime(d.time) + " + heating</dd>";
  }

  // ---------- Jobs
  function run() {
    if (!started) return;
    const id = ++jobId, p = opts.printer;
    status.textContent = "Slicing your straw…"; status.hidden = false;
    clearTimeout(slow);
    slow = setTimeout(function () { if (id === jobId && !status.hidden && status.textContent === "Slicing your straw…") status.textContent = "The preview is taking long. Reload the page to try again."; }, 25000);
    loadLibs().then(function () {
      if (!three) {
        try { initThree(); }
        catch (e) { status.textContent = "Your browser couldn't start the 3D preview (WebGL is turned off or not supported)."; clearTimeout(slow); return; }
      }
      if (!worker) {
        worker = new Worker("assets/js/slicer-worker.js");
        worker.onmessage = function (ev) {
          if (ev.data.id !== jobId) return;
          try { showData(ev.data); status.hidden = true; } catch (e) { status.textContent = "The preview couldn't be drawn in this browser."; }
        };
        worker.onerror = function () { status.textContent = "The preview couldn't be made in this browser."; };
      }
      worker.postMessage({ id: id, printer: { name: p.name, fil: p.fil }, cx: p.bed[0] / 2, cy: p.bed[1] / 2,
        fuse: opts.fuse, palette: palette() });
    }).catch(function () { status.textContent = "The 3D preview needs a connection to load. Try again later."; });
  }
  let timer = 0, slow = 0;
  function update(o) {
    let changed = false;
    if (o.printer && o.printer.id !== opts.printer.id) { opts.printer = o.printer; changed = true; }
    if (o.fuse && Math.abs(o.fuse.thick - opts.fuse.thick) > 0.004) { opts.fuse = o.fuse; changed = true; }
    if (changed && started) { clearTimeout(timer); timer = setTimeout(run, 350); }
  }
  // Start as soon as Build is on screen (three.js is ~600 kB, so not on page load).
  const view = root.closest("[data-view]");
  function start() { if (!started && !view.hidden) { started = true; run(); } }
  new MutationObserver(start).observe(view, { attributes: true, attributeFilter: ["hidden"] });
  start();
  // Re-colour when the theme changes.
  const dark = matchMedia("(prefers-color-scheme: dark)"), recolour = function () { if (started) run(); };
  if (dark.addEventListener) dark.addEventListener("change", recolour); else if (dark.addListener) dark.addListener(recolour);

  window.BeeSlicer = { update: update };
})();

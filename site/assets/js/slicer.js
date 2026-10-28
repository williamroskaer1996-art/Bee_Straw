// Print preview: the straw's toolpaths on your printer's build plate, like a slicer preview.
// The worker (slicer-worker.js) writes stand-in G-code and reads it back; this file draws the toolpaths itself on a
// plain 2D canvas (a small perspective camera, no WebGL): a WebGL canvas went blank in Safari between frames.
// API: window.BeeSlicer.update({ printer, fuse: { thick, thin } }) — build.js calls it when the printer or the tuning changes.
(function () {
  "use strict";
  const root = document.getElementById("slicer");
  if (!root) return;
  const VERSION = "20261028c"; // keep in step with the ?v= on the script tags in index.html
  const DENSITY = 1.25; // g/cm³, PHA [assumed]
  const DEFAULT = { id: "um-s5", name: "Ultimaker S5", fil: 2.85, height: 300, bed: [330, 240] };
  const T_OUTER = 0, T_INNER = 1, T_FUSE = 3, T_SKIN = 4, T_BRIM = 5; // line types, as in the worker
  const $ = (id) => document.getElementById(id);
  const wrap = $("slicer-view"), canvas = $("slicer-canvas"), slider = $("slicer-layer"), status = $("slicer-status");
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");

  const opts = { printer: DEFAULT, fuse: { thick: 0.2, thin: 0.133 } };
  let started = false, worker = null, jobId = 0, data = null, layer = 1;

  // Colours from the page's own tokens, so light and dark themes match.
  function token(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    const m = /^#([0-9a-f]{6})$/i.exec(v);
    if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
    const r = /rgba?\(([^)]+)\)/.exec(v); if (r) return r[1].split(",").slice(0, 3).map(parseFloat);
    return token("", fallback);
  }
  const rgb = (c) => "rgb(" + c.map((x) => Math.round(Math.min(255, Math.max(0, x)))).join(",") + ")";
  const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  let colours = null;
  function makeColours() {
    const ink = token("--ink", "#101218"), bg = token("--bg", "#ffffff"), white = [255, 255, 255];
    const wall = mix(ink, bg, 0.3), inner = token("--muted", "#5d6170"), straw = token("--straw", "#c98a00");
    const shade = (c, lit, band) => rgb(c.map((x) => x * (0.8 + 0.2 * lit) + (255 - x) * (0.32 * lit + band))); // towards white when lit
    colours = { bg: rgb(bg), line: rgb(token("--line", "#e3e5ea")), lineStrong: rgb(token("--line-strong", "#c9ccd4")), ink: rgb(ink),
      brim: rgb(token("--line-strong", "#c9ccd4")), top: "#e5484d",
      wall: (lit, band) => shade(wall, lit, band), inner: (lit, band) => shade(inner, lit, band),
      fuse: (k) => rgb(mix(bg, straw, 0.35 + 0.65 * k / 4)), white: white };
  }

  // ---------- Camera: orbits a target point; drag to turn, wheel or pinch to zoom
  const cam = { az: -0.58, pol: 1.14, dist: 200, ty: 25 };
  let W = 0, H = 0, dpr = 1;
  function viewBasis() {
    const sp = Math.sin(cam.pol), e = [cam.dist * sp * Math.sin(cam.az), cam.ty + cam.dist * Math.cos(cam.pol), cam.dist * sp * Math.cos(cam.az)];
    let f = [-e[0], cam.ty - e[1], -e[2]]; const fl = Math.hypot(f[0], f[1], f[2]); f = f.map((x) => x / fl);
    let r = [-f[2], 0, f[0]]; const rl = Math.hypot(r[0], r[2]) || 1; r = r.map((x) => x / rl); // f × up
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return { e: e, f: f, r: r, u: u, focal: (H / 2) / Math.tan(16 * Math.PI / 180) };
  }
  function frame(partH) { cam.az = -0.58; cam.pol = 1.14; cam.dist = Math.max(partH * 3.4, 170); cam.ty = partH * 0.45; }

  // ---------- Drawing
  let queued = false;
  function requestRender() { if (!queued) { queued = true; requestAnimationFrame(draw); } }
  function resize() {
    const w = canvas.clientWidth, h = Math.round(Math.max(300, Math.min(560, w * 0.62)));
    dpr = Math.min(2, devicePixelRatio || 1);
    if (!w || (W === Math.round(w * dpr) && H === Math.round(h * dpr))) return;
    W = canvas.width = Math.round(w * dpr); H = canvas.height = Math.round(h * dpr); canvas.style.height = h + "px";
    requestRender();
  }
  function draw() {
    queued = false;
    if (!W || !colours) return;
    const v = viewBasis(), e = v.e, f = v.f, r = v.r, u = v.u, cx = W / 2, cy = H / 2, focal = v.focal;
    const P = (x, y, z) => { const dx = x - e[0], dy = y - e[1], dz = z - e[2], zc = dx * f[0] + dy * f[1] + dz * f[2]; return zc < 1 ? null : [cx + (dx * r[0] + dy * r[1] + dz * r[2]) / zc * focal, cy - (dx * u[0] + dy * u[1] + dz * u[2]) / zc * focal]; };
    const seg = (path, a, b) => { if (a && b) { path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]); } };
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";
    // Build plate, 10 mm grid, build volume and the origin corner (front left)
    const p = opts.printer, bx = p.bed[0] / 2, by = p.bed[1] / 2, ph = p.height;
    const c4 = [P(-bx, 0, by), P(bx, 0, by), P(bx, 0, -by), P(-bx, 0, -by)];
    if (c4.every(Boolean)) { ctx.fillStyle = colours.bg; ctx.beginPath(); c4.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill(); }
    const fine = new Path2D(), bold = new Path2D(), box = new Path2D();
    for (let x = -bx; x <= bx + 1e-6; x += 10) seg(Math.round(x + bx) % 50 === 0 ? bold : fine, P(x, 0, -by), P(x, 0, by));
    for (let y = -by; y <= by + 1e-6; y += 10) seg(Math.round(y + by) % 50 === 0 ? bold : fine, P(-bx, 0, y), P(bx, 0, y));
    [[-bx, -by], [bx, -by], [bx, by], [-bx, by]].forEach(function (q, i, a) { const n = a[(i + 1) % 4]; seg(box, P(q[0], ph, q[1]), P(n[0], ph, n[1])); seg(box, P(q[0], 0, q[1]), P(q[0], ph, q[1])); });
    ctx.lineWidth = dpr * 0.8; ctx.strokeStyle = colours.line; ctx.stroke(fine); ctx.strokeStyle = colours.lineStrong; ctx.stroke(bold); ctx.stroke(box);
    const o = new Path2D(); seg(o, P(-bx, 0.1, by), P(-bx + 20, 0.1, by)); seg(o, P(-bx, 0.1, by), P(-bx, 0.1, by - 20));
    ctx.lineWidth = dpr * 1.4; ctx.strokeStyle = colours.ink; ctx.stroke(o);
    if (!data) return;
    // Toolpaths up to the chosen layer, bottom to top, in chunks of layers (so higher layers paint over lower ones).
    // Walls facing away from the camera are skipped (they would be hidden); inner walls show only on the last layer drawn.
    const pos = data.pos, types = data.types, widths = data.widths, ls = data.layerStart, L = [-0.6, 0.8]; // light from front left
    ctx.lineWidth = dpr * 0.9;
    let buckets = new Map();
    const bucket = (key, colour) => { let b = buckets.get(key); if (!b) { b = { path: new Path2D(), colour: colour }; buckets.set(key, b); } return b.path; };
    const flush = () => { buckets.forEach((b) => { ctx.strokeStyle = b.colour; ctx.stroke(b.path); }); buckets = new Map(); };
    for (let li = 0; li < layer; li++) {
      const last = li === layer - 1, top = last && layer < ls.length - 1, band = li % 2 ? 0.07 : 0; // top: highlighted current layer
      for (let i = ls[li]; i < ls[li + 1]; i++) {
        const t = types[i], k = i * 6;
        if (t === T_INNER && !last) continue;
        const x0 = pos[k], y0 = pos[k + 1], z0 = pos[k + 2], x1 = pos[k + 3], y1 = pos[k + 4], z1 = pos[k + 5];
        let path;
        if (top) path = bucket("top", colours.top);
        else if (t === T_FUSE) path = bucket("f" + widths[i], colours.fuse(widths[i]));
        else if (t === T_BRIM) path = bucket("b", colours.brim);
        else {
          const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, rl = Math.hypot(mx, mz) || 1;
          if (!last && (mx * (e[0] - mx) + mz * (e[2] - mz)) / rl < 0) continue; // faces away
          const lit = Math.round(Math.max(0, (mx * L[0] - mz * L[1]) / rl) * 6) / 6;
          path = bucket((t === T_OUTER || t === T_SKIN ? "w" : "i") + lit + band, (t === T_OUTER || t === T_SKIN ? colours.wall : colours.inner)(lit, band));
        }
        seg(path, P(x0, y0, z0), P(x1, y1, z1));
      }
      if (li % 8 === 7 || li === layer - 1) flush();
    }
  }

  // Turn and zoom with mouse, pen or touch
  const pointers = new Map(); let pinch = 0;
  canvas.addEventListener("pointerdown", function (ev) { canvas.setPointerCapture(ev.pointerId); pointers.set(ev.pointerId, [ev.clientX, ev.clientY]); pinch = 0; });
  canvas.addEventListener("pointermove", function (ev) {
    if (!pointers.has(ev.pointerId)) return;
    const prev = pointers.get(ev.pointerId); pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pointers.size === 1) {
      cam.az -= (ev.clientX - prev[0]) * 0.008;
      cam.pol = Math.min(1.52, Math.max(0.12, cam.pol - (ev.clientY - prev[1]) * 0.008));
    } else if (pointers.size === 2) {
      const a = [...pointers.values()], d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
      if (pinch) cam.dist = Math.min(1500, Math.max(40, cam.dist * pinch / d));
      pinch = d;
    }
    requestRender();
  });
  const up = (ev) => { pointers.delete(ev.pointerId); pinch = 0; };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", function (ev) { ev.preventDefault(); cam.dist = Math.min(1500, Math.max(40, cam.dist * Math.exp(ev.deltaY * 0.0012))); requestRender(); }, { passive: false });

  function showData(d) {
    if (!data || data.printerId !== opts.printer.id) frame(Math.max.apply(null, d.parts.map((q) => q.h)));
    d.printerId = opts.printer.id;
    const first = !data;
    data = d;
    slider.max = d.layerZ.length; slider.disabled = false;
    if (first && !reduce.matches) playIn(); else setLayer(d.layerZ.length);
    stats(d);
  }
  function setLayer(n) {
    if (!data) return;
    layer = n = Math.max(1, Math.min(data.layerZ.length, n | 0));
    slider.value = n;
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
    makeColours(); resize(); requestRender();
    if (!worker) {
      try { worker = new Worker("assets/js/slicer-worker.js?v=" + VERSION); }
      catch (e) { status.textContent = "The preview couldn't be made in this browser."; clearTimeout(slow); return; }
      worker.onmessage = function (ev) {
        if (ev.data.id !== jobId) return;
        try { showData(ev.data); status.hidden = true; } catch (e) { status.textContent = "The preview couldn't be drawn in this browser."; }
      };
      worker.onerror = function () { status.textContent = "The preview couldn't be made in this browser."; };
    }
    worker.postMessage({ id: id, printer: { name: p.name, fil: p.fil }, cx: p.bed[0] / 2, cy: p.bed[1] / 2, fuse: opts.fuse });
  }
  let timer = 0, slow = 0;
  function update(o) {
    let changed = false;
    if (o.printer && o.printer.id !== opts.printer.id) { opts.printer = o.printer; changed = true; }
    if (o.fuse && Math.abs(o.fuse.thick - opts.fuse.thick) > 0.004) { opts.fuse = o.fuse; changed = true; }
    if (changed && started) { clearTimeout(timer); timer = setTimeout(run, 350); }
  }
  // Start as soon as Build is on screen.
  const view = root.closest("[data-view]");
  function start() { if (!started && !view.hidden) { started = true; run(); } }
  new MutationObserver(start).observe(view, { attributes: true, attributeFilter: ["hidden"] });
  start();
  // Re-colour when the theme changes.
  const dark = matchMedia("(prefers-color-scheme: dark)"), recolour = function () { if (started) run(); };
  if (dark.addEventListener) dark.addEventListener("change", recolour); else if (dark.addListener) dark.addListener(recolour);

  if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap); else addEventListener("resize", resize);
  window.BeeSlicer = { update: update };
})();

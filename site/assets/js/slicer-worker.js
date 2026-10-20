// Print preview worker: writes stand-in G-code for the straw, then reads it back into toolpaths for the viewer.
//
// The generator is a simplified JavaScript version of the course generator (gh_1_coupons.py + gh_2_gcode.py):
// the straw is printed upright with the entrance on the bed, no supports. Zones from the bed up:
// nest tube (Ø11, bore Ø8) → nest bottom (inner cone, closed roof) → bend joint (Ø14 bulge, 6 straw units, one thin
// line) → tube → fuse bulb (Ø20 gyroid, cell 3 mm) → tube → stake (pointed tip). Wall = n concentric circles of width
// W / n; joint and fuse every 0.1 mm, tubes on a 0.2 mm grid; 20-line brim. Not printable: no printer header,
// temperatures, retraction or pre-flight check. The viewer only needs readG(), so real G-code drops straight in.
"use strict";

const TYPES = ["WALL-OUTER", "WALL-INNER", "JOINT", "FUSE", "SKIN", "BRIM"];
const SPEED = { "WALL-OUTER": 25, "WALL-INNER": 35, JOINT: 25, FUSE: 15, SKIN: 30, BRIM: 25 }; // mm/s
const TRAVEL = 150, MIN_LAYER_TIME = 10, LINE = 0.4;

// ---------- Geometry (mm, z from the bed = entrance)
const RO = 5.5, RI = 4.0;                        // tube: Ø11 outside, Ø8 bore
const NEST_END = 142, CONE_END = 146, ROOF_END = 148, J0 = 150;
const H1 = 2 / Math.tan(50 * Math.PI / 180), H2 = 2 / Math.tan(40 * Math.PI / 180), UNIT = H1 + H2;
const JL = 1.5 + 6 * UNIT + 1.5;                 // 45° cone out, 6 units, 45° cone in
const TUBE1 = J0 + JL, FUSE0 = TUBE1 + 10, FUSE1 = FUSE0 + 20, STAKE0 = FUSE1 + 4, TOTAL = 281, TIP0 = TOTAL - 10;
const SPLIT = TUBE1;                             // two-part split above the joint (push-fit joint not designed yet)

function zoneAt(z) {
  if (z < NEST_END) return "nest tube";
  if (z < ROOF_END) return "nest bottom";
  if (z < J0) return "tube";
  if (z < TUBE1) return "bend joint";
  if (z < FUSE0) return "tube";
  if (z < FUSE1) return "fuse bulb";
  if (z < STAKE0) return "tube";
  return "stake";
}
function jointR(u) {
  if (u < 1.5) return RO + u;
  if (u < 1.5 + 6 * UNIT) { const k = (u - 1.5) % UNIT; return k < H1 ? 7 - 2 * (k / H1) : 5 + 2 * ((k - H1) / H2); }
  return 7 - (u - 1.5 - 6 * UNIT);
}
// Loops for one layer at height z of the full straw: [{type, r}] circles plus fuse polylines.
function layerPaths(z, fuseLine) {
  const out = [];
  const wall = (ro, ri) => {
    const W = ro - ri, n = Math.max(1, Math.round(W / LINE)), w = W / n;
    for (let k = n - 1; k >= 0; k--) out.push({ type: k === n - 1 ? "WALL-OUTER" : "WALL-INNER", r: ri + (k + 0.5) * w, w: w });
  };
  if (z < NEST_END) wall(RO, RI);
  else if (z < CONE_END) wall(RO, Math.max(0.2, RI - (z - NEST_END)));
  else if (z < ROOF_END) { for (let r = RO - LINE / 2; r > 0.1; r -= LINE) out.push({ type: r > RO - LINE ? "WALL-OUTER" : "SKIN", r: r, w: LINE }); }
  else if (z < J0) wall(RO, RI);
  else if (z < TUBE1) { const w = 0.25; out.push({ type: "JOINT", r: jointR(z - J0) - w / 2, w: w }); }
  else if (z < FUSE0) wall(RO, RI);
  else if (z < FUSE1) {
    const u = (z - FUSE0) / 20, R = RO + (10 - RO) * Math.pow(Math.sin(Math.PI * u), 2);
    if (u < 0.12 || u > 0.88) wall(R, RI);       // solid where the bulb meets the pipe
    else { out.push({ type: "WALL-INNER", r: RI + fuseLine / 2, w: fuseLine }); out.push({ type: "FUSE", gyroid: true, R: R, w: fuseLine }); }
  } else if (z < STAKE0) wall(RO, RI);
  else if (z < TIP0) wall(RO, RI);
  else { const ro = RO - (RO - 0.6) * (z - TIP0) / (TOTAL - TIP0); wall(ro, Math.max(0, ro - 1.5)); }
  return out;
}
function layerHeight(z) { const zn = zoneAt(z); return zn === "bend joint" || zn === "fuse bulb" || zn === "nest bottom" ? 0.1 : 0.2; }

// Gyroid zero set (sin X cos Y + sin Y cos Z + sin Z cos X = 0, cell 3 mm) traced with marching squares on a
// 0.2 mm grid, kept between the bore and the bulb surface, chained into polylines.
function gyroidPolylines(z, R, rMin) {
  const s = 2 * Math.PI / 3, h = 0.2, n = Math.ceil(R / h), N = 2 * n + 1;
  const Z = z * s, sz = Math.sin(Z), cz = Math.cos(Z);
  const f = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const X = (i - n) * h * s, Y = (j - n) * h * s;
    f[j * N + i] = Math.sin(X) * Math.cos(Y) + Math.sin(Y) * cz + sz * Math.cos(X);
  }
  const pt = new Map(), adj = new Map();
  const edgePoint = (id, i0, j0, i1, j1) => {
    if (!pt.has(id)) { const a = f[j0 * N + i0], b = f[j1 * N + i1], t = a / (a - b); pt.set(id, [((i0 + (i1 - i0) * t) - n) * h, ((j0 + (j1 - j0) * t) - n) * h]); }
    return id;
  };
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  const inside = (p) => { const r = Math.hypot(p[0], p[1]); return r > rMin && r < R - 0.15; };
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const v0 = f[j * N + i], v1 = f[j * N + i + 1], v2 = f[(j + 1) * N + i + 1], v3 = f[(j + 1) * N + i];
    const c = (v0 > 0 ? 1 : 0) | (v1 > 0 ? 2 : 0) | (v2 > 0 ? 4 : 0) | (v3 > 0 ? 8 : 0);
    if (c === 0 || c === 15) continue;
    const e = [], B = (j * N + i) * 2;
    if ((v0 > 0) !== (v1 > 0)) e.push(edgePoint(B, i, j, i + 1, j));                       // bottom
    if ((v1 > 0) !== (v2 > 0)) e.push(edgePoint(((j * N) + i + 1) * 2 + 1, i + 1, j, i + 1, j + 1)); // right
    if ((v3 > 0) !== (v2 > 0)) e.push(edgePoint(((j + 1) * N + i) * 2, i, j + 1, i + 1, j + 1));     // top
    if ((v0 > 0) !== (v3 > 0)) e.push(edgePoint(B + 1, i, j, i, j + 1));                   // left
    if (e.length === 2) { if (inside(pt.get(e[0])) && inside(pt.get(e[1]))) link(e[0], e[1]); }
    else if (e.length === 4) { link(e[0], e[1]); link(e[2], e[3]); }
  }
  const seen = new Set(), lines = [];
  const walk = (start) => {
    const line = [start]; seen.add(start);
    let cur = start;
    for (;;) { const nx = (adj.get(cur) || []).find((k) => !seen.has(k)); if (nx === undefined) break; seen.add(nx); line.push(nx); cur = nx; }
    return line;
  };
  adj.forEach((nb, k) => { if (nb.length === 1 && !seen.has(k)) lines.push(walk(k)); }); // open ends first
  adj.forEach((nb, k) => { if (!seen.has(k)) { const l = walk(k); l.push(l[0]); lines.push(l); } }); // closed loops
  return lines.filter((l) => l.length > 1).map((l) => l.map((k) => pt.get(k)));
}

// ---------- Writer
function writeG(o) {
  const fil = o.printer.fil, area = Math.PI * fil * fil / 4;
  const parts = o.split
    ? [{ z0: 0, z1: SPLIT, x: o.cx - 22, y: o.cy }, { z0: SPLIT, z1: TOTAL, x: o.cx + 22, y: o.cy }]
    : [{ z0: 0, z1: TOTAL, x: o.cx, y: o.cy }];
  // per-part layer tops, merged into one list of print heights
  const plan = parts.map(function (p) { const zs = []; let z = 0; while (z < p.z1 - p.z0 - 1e-6) { z += layerHeight(p.z0 + z + 0.05); zs.push(+z.toFixed(2)); } return zs; });
  const heights = Array.from(new Set([].concat.apply([], plan))).sort((a, b) => a - b);
  const sets = plan.map((zs) => new Set(zs));
  const g = [";FLAVOR:Marlin", ";Bee Straw print preview: an illustration from a simplified generator, NOT for printing",
    ";PRINTER:" + o.printer.name, ";FILAMENT_DIAMETER:" + fil, ";LAYER_COUNT:" + heights.length, "M82", "G92 E0"];
  let E = 0, last = null;
  const f = (v) => v.toFixed(3);
  const move = (x, y) => { g.push("G0 F" + TRAVEL * 60 + " X" + f(x) + " Y" + f(y)); last = [x, y]; };
  const extrude = (x, y, w, h, sp) => { E += Math.hypot(x - last[0], y - last[1]) * w * h / area; g.push("G1 F" + sp * 60 + " X" + f(x) + " Y" + f(y) + " E" + E.toFixed(5)); last = [x, y]; };
  const circle = (cx, cy, r, w, h, sp, seg) => {
    const k0 = Math.random() * Math.PI * 2;
    move(cx + r * Math.cos(k0), cy + r * Math.sin(k0));
    for (let k = 1; k <= seg; k++) { const a = k0 + k / seg * Math.PI * 2; extrude(cx + r * Math.cos(a), cy + r * Math.sin(a), w, h, sp); }
  };
  let prev = 0;
  heights.forEach(function (z, li) {
    g.push(";LAYER:" + li);
    g.push("G0 Z" + z.toFixed(2));
    parts.forEach(function (p, pi) {
      if (!sets[pi].has(z)) return;
      const zFull = p.z0 + z - 0.05, h = +(z - prev).toFixed(2) || 0.2;
      g.push(";ZONE:" + zoneAt(zFull));
      if (li === 0) { g.push(";TYPE:BRIM"); for (let k = 0; k < 20; k++) circle(p.x, p.y, RO + LINE * (k + 0.5), LINE, h, SPEED.BRIM, 64); }
      let type = null;
      layerPaths(zFull, o.fuseLine).forEach(function (q) {
        if (q.type !== type) { type = q.type; g.push(";TYPE:" + type); }
        if (q.gyroid) gyroidPolylines(zFull, q.R, RI + q.w).forEach(function (l) {
          move(p.x + l[0][0], p.y + l[0][1]);
          for (let k = 1; k < l.length; k++) extrude(p.x + l[k][0], p.y + l[k][1], q.w, h, SPEED.FUSE);
        });
        else circle(p.x, p.y, q.r, q.w, h, SPEED[q.type], Math.max(16, Math.min(72, Math.round(q.r * 9))));
      });
    });
    prev = z;
  });
  g.push("M107", ";END");
  return { text: g.join("\n"), parts: parts.map((p) => ({ x: p.x, y: p.y, h: p.z1 - p.z0 })) };
}

// ---------- Reader: G-code text → line segments per layer with type, plus filament and time estimates.
function readG(text, palette, light) {
  const pos = [], col = [], layerStart = [], layerZ = [], layerZone = [];
  let x = 0, y = 0, z = 0, e = 0, F = 1500, type = 0, eTotal = 0, time = 0, layerTime = 0, layerOpen = false;
  const typeIndex = {}; TYPES.forEach((t, i) => (typeIndex[t] = i));
  const closeLayer = () => { if (layerOpen) time += Math.max(MIN_LAYER_TIME, layerTime); layerTime = 0; };
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (L.charCodeAt(0) === 59) { // ';'
      if (L.startsWith(";LAYER:")) { closeLayer(); layerOpen = true; layerStart.push(pos.length / 6); layerZ.push(z); layerZone.push(""); }
      else if (L.startsWith(";TYPE:")) { const t = L.slice(6).trim(); type = t in typeIndex ? typeIndex[t] : 1; }
      else if (L.startsWith(";ZONE:")) { const zn = L.slice(6).trim(), k = layerZone.length - 1; if (k >= 0 && layerZone[k].split(" + ").indexOf(zn) < 0) layerZone[k] += (layerZone[k] ? " + " : "") + zn; }
      continue;
    }
    const c = L.charCodeAt(0) === 71 ? L.split(";")[0].split(" ") : null; // 'G'
    if (!c || (c[0] !== "G0" && c[0] !== "G1")) { if (c && c[0] === "G92") e = 0; continue; }
    let nx = x, ny = y, nz = z, ne = e;
    for (let k = 1; k < c.length; k++) {
      const w = c[k], v = parseFloat(w.slice(1));
      switch (w[0]) { case "X": nx = v; break; case "Y": ny = v; break; case "Z": nz = v; break; case "E": ne = v; break; case "F": F = v; break; }
    }
    const d = Math.hypot(nx - x, ny - y, nz - z);
    if (d > 0) layerTime += d / (F / 60);
    if (ne > e + 1e-7 && d > 0) {
      eTotal += ne - e;
      if (layerZ.length) layerZ[layerZ.length - 1] = nz;
      const p = palette[type] || palette[1];
      // shade by which way the toolpath faces (fake light from front-left), so round walls read as round
      const mx = (x + nx) / 2 - light.cx, my = (y + ny) / 2 - light.cy, r = Math.hypot(mx, my) || 1;
      const lit = Math.max(0, (mx * light.dx + my * light.dy) / r);
      const band = layerStart.length % 2 ? 0.07 : 0; // alternate layers slightly, so layer lines show
      pos.push(x - light.cx, nz, light.cy - y, nx - light.cx, nz, light.cy - ny); // three.js: y up, bed centre at 0
      // light shading towards white (works for dark and light ink alike)
      const q = [0, 1, 2].map((c) => Math.min(1, p[c] * (0.8 + 0.2 * lit) + (1 - p[c]) * (0.32 * lit + band)));
      for (let k = 0; k < 2; k++) col.push(q[0], q[1], q[2]);
    }
    x = nx; y = ny; z = nz; e = ne;
  }
  closeLayer();
  layerStart.push(pos.length / 6);
  return { pos: new Float32Array(pos), col: new Float32Array(col), layerStart: layerStart, layerZ: layerZ, layerZone: layerZone, filament: eTotal, time: time };
}

self.onmessage = function (ev) {
  const o = ev.data, t0 = Date.now();
  const w = writeG(o);
  const r = readG(w.text, o.palette, { cx: o.cx, cy: o.cy, dx: -0.6, dy: 0.8 });
  self.postMessage({ id: o.id, pos: r.pos, col: r.col, layerStart: r.layerStart, layerZ: r.layerZ, layerZone: r.layerZone,
    filament: r.filament, time: r.time, bytes: w.text.length, parts: w.parts, ms: Date.now() - t0 }, [r.pos.buffer, r.col.buffer]);
};

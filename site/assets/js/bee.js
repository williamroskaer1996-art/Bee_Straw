// "One bee visits": a red mason bee (Osmia bicornis, female) drawn in code, flying over the homepage.
// Choreography (once per visit): enters from the right, lands on the AlphaEarth mosaic and walks a few
// steps, then circles and rests on "Build your straw", grooming now and then. A pointer coming close makes
// her take off and land elsewhere for a while. Reduced motion: she simply sits on the button.
// Rendering: one fixed canvas over the page (pointer-events: none); only redrawn while the home view is visible.
(function () {
  "use strict";
  const home = document.querySelector('[data-view="home"]');
  const button = home && home.querySelector('.btn-row .btn');
  const mosaic = document.getElementById("mosaic");
  if (!home || !button || !mosaic) return;

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const small = () => innerWidth < 640;
  let seen = false;
  try { seen = sessionStorage.getItem("beestraw-bee") === "1"; } catch (e) { /* storage blocked */ }

  // ---------- Canvas
  const cv = document.createElement("canvas");
  cv.className = "bee-canvas";
  cv.setAttribute("aria-hidden", "true");
  document.body.appendChild(cv);
  const ctx = cv.getContext("2d");
  let dpr = 1, vw = 0, vh = 0;
  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1); vw = innerWidth; vh = innerHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    cv.style.width = vw + "px"; cv.style.height = vh + "px";
  }
  resize();
  addEventListener("resize", function () { resize(); wake(); });

  // ---------- Seeded randomness (stable fuzz)
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // ---------- Body sprite: abdomen, thorax and head with hair, prerendered once (bee faces +x)
  const S = 3;              // sprite resolution (px per unit)
  const BW = 46, BH = 30;   // sprite size in units, centred on (0,0)
  const body = document.createElement("canvas");
  body.width = BW * S; body.height = BH * S;
  (function paintBody() {
    const b = body.getContext("2d");
    b.scale(S, S); b.translate(BW / 2, BH / 2);
    const hair = (cx, cy, rx, ry, n, cols, len) => {
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
        const x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r;
        const dir = Math.atan2(y - cy, (x - cx) * 0.6) + (rnd() - 0.5) * 0.9;
        const l = len * (0.5 + rnd() * 0.7);
        b.strokeStyle = cols[(rnd() * cols.length) | 0];
        b.lineWidth = 0.35 + rnd() * 0.3;
        b.beginPath(); b.moveTo(x, y); b.lineTo(x + Math.cos(dir) * l, y + Math.sin(dir) * l); b.stroke();
      }
    };
    // Abdomen: dense red-orange hair, darker towards the tip
    let g = b.createRadialGradient(-9, -2, 1, -10, 0, 13);
    g.addColorStop(0, "#e0904c"); g.addColorStop(0.65, "#c06a2c"); g.addColorStop(1, "#6e3a1a");
    b.fillStyle = g; b.beginPath(); b.ellipse(-10, 0, 12.5, 8.6, 0, 0, Math.PI * 2); b.fill();
    b.strokeStyle = "rgba(90,50,20,0.35)"; b.lineWidth = 0.6;
    for (let k = 0; k < 4; k++) { b.beginPath(); b.ellipse(-5 - k * 4.2, 0, 2.2, 8 - k * 0.9, 0, -Math.PI / 2, Math.PI / 2); b.stroke(); }
    hair(-10, 0, 12.5, 8.6, 900, ["#eda060", "#d27a36", "#b05e26", "#e4925a"], 1.6);
    hair(-19, 0, 3.5, 4.5, 90, ["#5a3418", "#3e2412"], 1.2);
    // Thorax: grey-brown fuzz
    g = b.createRadialGradient(2, -2, 0.5, 3, 0, 8);
    g.addColorStop(0, "#8a6a4c"); g.addColorStop(0.7, "#5a4230"); g.addColorStop(1, "#2e2219");
    b.fillStyle = g; b.beginPath(); b.ellipse(3, 0, 7.4, 7.0, 0, 0, Math.PI * 2); b.fill();
    hair(3, 0, 7.4, 7.0, 520, ["#a88a68", "#7a5e44", "#4e3b2b", "#b89a76"], 1.5);
    // Head: dark, with dark hair, compound eyes and small horns (female)
    g = b.createRadialGradient(12, -1.5, 0.5, 12, 0, 6.5);
    g.addColorStop(0, "#3a332d"); g.addColorStop(1, "#141210");
    b.fillStyle = g; b.beginPath(); b.ellipse(12.2, 0, 5.2, 6.1, 0, 0, Math.PI * 2); b.fill();
    hair(12, 0, 5, 6, 160, ["#2c2620", "#46392c", "#1a1714"], 0.9);
    b.fillStyle = "#221d19";
    [-1, 1].forEach((s) => { b.beginPath(); b.ellipse(12.5, s * 4.2, 3.4, 2.1, s * 0.25, 0, Math.PI * 2); b.fill(); });
    b.fillStyle = "rgba(255,255,255,0.55)";
    [-1, 1].forEach((s) => { b.beginPath(); b.ellipse(13.4, s * 4.6, 0.9, 0.5, 0, 0, Math.PI * 2); b.fill(); });
    b.strokeStyle = "#0e0c0a"; b.lineWidth = 0.7;
    [-1, 1].forEach((s) => { b.beginPath(); b.moveTo(16.4, s * 1.2); b.lineTo(17.6, s * 1.9); b.stroke(); });
  })();

  // ---------- Drawing one frame of the bee (local units; 1 unit ≈ 1 px at scale 1)
  // st: { flap (0..1 phase), wingsOut (0..1), gait (phase), walking (0..1), groom (0..1), z (altitude px) }
  function drawWing(len, wid, angle, alpha, fore) {
    ctx.save();
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, "rgba(120,110,100,0.55)"); g.addColorStop(1, "rgba(200,205,215,0.35)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(wid * 0.9, len * 0.25, wid * 0.8, len * 0.95, wid * 0.1, len);
    ctx.bezierCurveTo(-wid * 0.5, len * 0.9, -wid * 0.4, len * 0.3, 0, 0);
    ctx.fill();
    ctx.strokeStyle = "rgba(60,50,40,0.45)"; ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.quadraticCurveTo(wid * 0.55, len * 0.4, wid * 0.4, len * 0.85);
    if (fore) { ctx.moveTo(wid * 0.2, len * 0.25); ctx.lineTo(-wid * 0.2, len * 0.6); }
    ctx.stroke();
    ctx.restore();
  }
  function leg(x, y, side, phase, lift, a1, a2, l1, l2) {
    // two segments from the body outwards; phase swings it forward/back, lift shortens it
    const sw = Math.sin(phase) * 0.35;
    const t1 = (a1 + sw) * side, t2 = (a2 + sw * 0.6) * side;
    const k = 1 - lift * 0.25;
    const x1 = x + Math.cos(t1) * l1 * k, y1 = y + Math.sin(t1) * l1 * k;
    const x2 = x1 + Math.cos(t2) * l2 * k, y2 = y1 + Math.sin(t2) * l2 * k;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function drawBee(x, y, heading, scale, st) {
    // Shadow: softer and further away the higher she is
    const z = st.z, sOff = 4 + z * 0.35, sA = Math.max(0.06, 0.28 - z * 0.004), sR = 14 + z * 0.08;
    ctx.save();
    ctx.translate(x + sOff * 0.5, y + sOff);
    ctx.rotate(heading);
    ctx.scale(scale, scale);
    const sg = ctx.createRadialGradient(-2, 0, 1, -2, 0, sR);
    sg.addColorStop(0, "rgba(16,18,24," + sA + ")"); sg.addColorStop(1, "rgba(16,18,24,0)");
    ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(-2, 0, sR * 1.4, sR * 0.85, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y - z * 0.15);
    ctx.rotate(heading);
    const lift = 1 + z * 0.002;
    ctx.scale(scale * lift, scale * lift);

    // Legs (dark, tucked in flight)
    ctx.strokeStyle = "#2a2019"; ctx.lineWidth = 1.1; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const tuck = 1 - st.wingsOut * 0.7, wk = st.walking;
    [-1, 1].forEach(function (s) {
      // tripod gait: front+back of one side move with the middle of the other
      const ph = st.gait + (s > 0 ? 0 : Math.PI);
      leg(6, 2.5 * s, s, (ph) * wk, 0, 0.9 * tuck + 0.2, 0.35, 6 * tuck + 2, 6 * tuck + 2);
      leg(3, 4 * s, s, (ph + Math.PI) * wk, 0, 1.6, 2.2 - 0.6 * tuck, 6.5 * tuck + 2, 7 * tuck + 2);
      leg(-1, 4 * s, s, (ph) * wk, 0, 2.2, 2.7, 7.5 * tuck + 2, 9 * tuck + 2);
    });
    // Front legs grooming the antennae
    if (st.groom > 0) {
      const gph = st.groomPhase;
      [-1, 1].forEach(function (s) {
        ctx.beginPath(); ctx.moveTo(8, 3 * s);
        ctx.lineTo(13 + Math.sin(gph) * 2, (5 + Math.cos(gph) * 1.5) * s * (1 - st.groom * 0.3));
        ctx.lineTo(18 + Math.sin(gph + 1) * 2.5, (3 + Math.cos(gph) * 2) * s);
        ctx.stroke();
      });
    }

    ctx.drawImage(body, -BW / 2, -BH / 2, BW, BH);

    // Antennae (elbowed), moving while grooming
    ctx.strokeStyle = "#141210"; ctx.lineWidth = 0.9;
    [-1, 1].forEach(function (s) {
      const wig = Math.sin(st.time * 3 + s) * 0.08 + (st.groom ? Math.sin(st.groomPhase * 2) * 0.25 : 0);
      ctx.beginPath(); ctx.moveTo(16.5, 1.5 * s);
      ctx.lineTo(20, (3.6 + wig * 6) * s);
      ctx.quadraticCurveTo(24, (5 + wig * 8) * s, 26.5, (8 + wig * 8) * s);
      ctx.stroke();
    });

    const out = st.wingsOut;
    // Wings, drawn for the right side and mirrored for the left. Angle 0 = straight out to the side,
    // π/2 = folded back along the abdomen (how a resting bee holds them, on top of her body).
    const wing = function (theta, alpha, fore) {
      [1, -1].forEach(function (s) {
        ctx.save();
        if (s < 0) ctx.scale(1, -1);
        ctx.translate(fore ? 3 : 1, 2.2);
        drawWing(fore ? 19 : 14, fore ? 6.2 : 4.6, theta, alpha, fore);
        ctx.restore();
      });
    };
    if (out < 0.5) {
      wing(Math.PI / 2 - 0.12, 0.85, false);
      wing(Math.PI / 2 - 0.2, 0.9, true);
    } else {
      // flapping: a soft blur across the stroke plus the current position
      const lo = 0.15, hi = 1.25;
      for (let k = 0; k < 5; k++) wing(lo + (hi - lo) * (k / 4), 0.11, true);
      const cur = lo + (hi - lo) * (0.5 + 0.5 * Math.sin(st.flap * Math.PI * 2));
      wing(cur + 0.3, 0.28, false);
      wing(cur, 0.4, true);
    }
    ctx.restore();
  }

  // ---------- Places she can land, in viewport coordinates (recomputed every frame so scrolling is fine)
  function spotOnButton() {
    const r = button.getBoundingClientRect();
    return { el: button, fx: 0.78, fy: 0.12 };
  }
  function spotOnMosaic(prefer) {
    const tiles = Array.from(mosaic.querySelectorAll(".ae-tile")).filter((t) => t.getBoundingClientRect().width > 0);
    if (!tiles.length) return spotOnButton();
    const t = prefer ? tiles[0] : tiles[(Math.random() * tiles.length) | 0];
    return { el: t, fx: 0.35 + Math.random() * 0.3, fy: 0.35 + Math.random() * 0.3 };
  }
  function spotPos(sp) {
    const r = sp.el.getBoundingClientRect();
    return { x: r.left + r.width * sp.fx, y: r.top + r.height * sp.fy, rect: r };
  }

  // ---------- State
  const B = {
    x: vw + 60, y: 260, vx: -1, vy: 0, heading: Math.PI, z: 60,
    mode: "idle",      // idle | fly | land | walk | rest | leave
    spot: null, plan: [], timer: 0, walkTarget: null,
    flap: 0, wingsOut: 1, gait: 0, walking: 0, groom: 0, groomPhase: 0, nextGroom: 3, time: 0, orbit: null
  };
  const scale = () => (small() ? 0.75 : 1);
  if (/beedebug/.test(location.search)) window.__bee = B; // for automated visual checks

  function flyTo(spot, opts) {
    B.mode = "fly"; B.spot = spot; B.orbit = opts && opts.orbit ? { t: 0 } : null;
    button.classList.remove("bee-on");
  }
  function settle() {
    // pin her to the element she landed on, so she scrolls with it
    const p = spotPos(B.spot);
    B.spot.fx = (B.x - p.rect.left) / p.rect.width; B.spot.fy = (B.y - p.rect.top) / p.rect.height;
    if (B.spot.el === button) button.classList.add("bee-on");
  }

  // ---------- Simulation
  let last = 0, raf = 0, running = false, pointer = { x: -999, y: -999 }, flees = 0;
  addEventListener("pointermove", function (e) { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });

  function step(dt) {
    B.time += dt;
    const sc = scale();
    if (B.mode === "fly") {
      const tp = spotPos(B.spot);
      let tx = tp.x, ty = tp.y;
      if (B.orbit && B.orbit.t < 1) { // one loose loop before approaching
        B.orbit.t += dt / 3.4;
        const a = B.orbit.t * Math.PI * 2;
        tx = tp.x + Math.cos(a) * 110 * sc; ty = Math.max(60, tp.y - 80 * sc + Math.sin(a) * 60 * sc); // stay on screen
      }
      const dx = tx - B.x, dy = ty - B.y, d = Math.hypot(dx, dy);
      const maxV = 190 * sc, arrive = 170 * sc;
      const want = d < arrive && !(B.orbit && B.orbit.t < 1) ? maxV * (d / arrive) : maxV;
      // organic wobble across the direction of travel
      const nx = -dy / (d || 1), ny = dx / (d || 1), wob = Math.sin(B.time * 2.6) * 26 + Math.sin(B.time * 1.1) * 18;
      const dvx = (dx / (d || 1)) * want + nx * wob * Math.min(1, d / 120) - B.vx;
      const dvy = (dy / (d || 1)) * want + ny * wob * Math.min(1, d / 120) - B.vy;
      const acc = 2.2;
      B.vx += dvx * Math.min(1, acc * dt); B.vy += dvy * Math.min(1, acc * dt);
      B.x += B.vx * dt; B.y += B.vy * dt;
      const sp = Math.hypot(B.vx, B.vy);
      if (sp > 20) B.heading = lerpAngle(B.heading, Math.atan2(B.vy, B.vx), Math.min(1, 2.5 * dt));
      B.z += ((d < 40 ? 6 + d * 0.4 : 40) - B.z) * Math.min(1, 1.5 * dt);
      B.wingsOut = Math.min(1, B.wingsOut + dt * 6);
      if (d < 4 * sc + 2 && !(B.orbit && B.orbit.t < 1)) { B.mode = "land"; B.timer = 0.9; }
    } else if (B.mode === "land") {
      B.timer -= dt; const tp = spotPos(B.spot);
      B.x += (tp.x - B.x) * Math.min(1, 5 * dt); B.y += (tp.y - B.y) * Math.min(1, 5 * dt);
      B.vx = B.vy = 0; B.z += (0 - B.z) * Math.min(1, 5 * dt);
      if (B.timer <= 0) { B.z = 0; B.wingsOut = 0; settle(); next(); }
    } else if (B.mode === "walk") {
      const p = spotPos(B.spot), t = B.walkTarget;
      const tx = p.rect.left + p.rect.width * t.fx, ty = p.rect.top + p.rect.height * t.fy;
      B.x = p.x; B.y = p.y;
      const dx = tx - B.x, dy = ty - B.y, d = Math.hypot(dx, dy);
      B.heading = lerpAngle(B.heading, Math.atan2(dy, dx), Math.min(1, 2 * dt));
      const v = 14 * sc;
      B.walkTime -= dt;
      if (d > 1.5 && B.walkTime > 0) {
        // step straight at the target; the heading only follows for the look (no circling)
        const k = Math.min(v * dt, d) / d, mx = dx * k, my = dy * k;
        B.spot.fx += mx / p.rect.width; B.spot.fy += my / p.rect.height;
        B.walking = Math.min(1, B.walking + dt * 3); B.gait += dt * 9;
      } else { B.walking = Math.max(0, B.walking - dt * 5); B.timer -= dt; if (B.timer <= 0) next(); }
      const q = spotPos(B.spot); B.x = q.x; B.y = q.y;
    } else if (B.mode === "rest") {
      const p = spotPos(B.spot); B.x = p.x; B.y = p.y;
      B.walking = Math.max(0, B.walking - dt * 5);
      B.nextGroom -= dt;
      if (B.nextGroom <= 0 && B.groom === 0) { B.groom = 1; B.groomTime = 2.2; }
      if (B.groom) { B.groomPhase += dt * 8; B.groomTime -= dt; if (B.groomTime <= 0) { B.groom = 0; B.nextGroom = 5 + Math.random() * 4; } }
      if (B.timer > 0) { B.timer -= dt; if (B.timer <= 0) next(); }
      // a pointer coming close makes her take off
      if (Math.hypot(pointer.x - B.x, pointer.y - B.y) < 70 * sc && flees < 6) {
        flees++;
        B.plan = [{ mode: "fly", spot: spotOnMosaic(false) }, { mode: "walk" }, { mode: "rest", time: 6 + Math.random() * 4 }, { mode: "fly", spot: spotOnButton(), orbit: true }, { mode: "rest" }];
        next();
      }
    } else if (B.mode === "leave") {
      B.vx += (500 - B.vx) * Math.min(1, 2 * dt); B.vy += (-200 - B.vy) * Math.min(1, 2 * dt);
      B.x += B.vx * dt; B.y += B.vy * dt; B.z = 40; B.wingsOut = 1;
      B.heading = lerpAngle(B.heading, Math.atan2(B.vy, B.vx), Math.min(1, 6 * dt));
    }
    if (B.wingsOut > 0.5) B.flap = (B.flap + dt * 9) % 1; // visual flap cycle (the blur does the rest)
  }
  function next() {
    const n = B.plan.shift();
    if (!n) { B.mode = "rest"; B.timer = 0; return; }
    if (n.mode === "fly") { B.wingsOut = 1; flyTo(n.spot, { orbit: n.orbit }); }
    else if (n.mode === "walk") {
      B.mode = "walk"; B.timer = 1.2; B.walkTime = 9;
      B.walkTarget = { fx: Math.min(0.85, Math.max(0.15, B.spot.fx + (Math.random() - 0.5) * 0.25)), fy: Math.min(0.85, Math.max(0.15, B.spot.fy + (Math.random() - 0.5) * 0.25)) };
    } else if (n.mode === "rest") { B.mode = "rest"; B.timer = n.time || 0; }
  }
  const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; return a + d * t; };

  // ---------- Loop
  function visible() { return !home.hidden && document.visibilityState === "visible"; }
  function frame(t) {
    raf = 0;
    if (!visible()) { running = false; ctx.clearRect(0, 0, cv.width, cv.height); return; }
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016); last = t;
    if (!reduce.matches) step(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    if (B.mode !== "idle" && B.x > -80 && B.x < vw + 80 && B.y > -80 && B.y < vh + 80) {
      drawBee(B.x, B.y, B.heading, scale(), B);
    }
    if (B.mode === "leave" && B.x > vw + 80) { B.mode = "idle"; }
    raf = requestAnimationFrame(frame);
  }
  function wake() { if (!running && visible()) { running = true; last = 0; raf = requestAnimationFrame(frame); } }
  document.addEventListener("visibilitychange", wake);
  new MutationObserver(wake).observe(home, { attributes: true, attributeFilter: ["hidden"] });

  // ---------- Start
  function restOnButton() {
    B.spot = spotOnButton(); const p = spotPos(B.spot);
    B.x = p.x; B.y = p.y; B.z = 0; B.wingsOut = 0; B.heading = -2.4; B.mode = "rest"; B.timer = 0;
    button.classList.add("bee-on");
  }
  function begin() {
    if (reduce.matches || seen) { restOnButton(); wake(); return; }
    try { sessionStorage.setItem("beestraw-bee", "1"); } catch (e) { /* storage blocked */ }
    const r = mosaic.getBoundingClientRect();
    B.x = vw + 50; B.y = Math.max(80, Math.min(vh - 80, r.top + 60)); B.vx = -170; B.vy = 20; B.heading = Math.PI; B.z = 40;
    B.plan = small()
      ? [{ mode: "fly", spot: spotOnButton() }, { mode: "rest" }]
      : [{ mode: "fly", spot: spotOnMosaic(true) }, { mode: "walk" }, { mode: "walk" }, { mode: "rest", time: 2.5 }, { mode: "fly", spot: spotOnButton(), orbit: true }, { mode: "rest" }];
    next();
    wake();
  }
  // Wait until the mosaic images have their size, then 1.2 s of stillness.
  function ready() { setTimeout(begin, 1200); }
  if (document.readyState === "complete") ready(); else addEventListener("load", ready);
})();

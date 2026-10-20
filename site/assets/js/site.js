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

  // ---- Home mosaic
  const mosaic = document.getElementById("mosaic");
  if (mosaic) {
    const layout = ["big", "", "", "big", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
    layout.forEach(function (cls, k) {
      const big = cls === "big";
      mosaic.insertBefore(makeCanvas(big ? 220 : 110, big ? 220 : 110, k * 97 + 13, k % 3 === 0, cls), mosaic.querySelector(".bee-slot"));
    });
  }

  // ---- Build: example site tile
  const siteTile = document.getElementById("site-tile");
  if (siteTile) drawTile(siteTile, 7, true);

  // ---- Community: example stories (not real people)
  const STORIES = [
    { who: "Anna · Utrecht, NL", text: "Printed it on my Prusa, first try", stage: 2, when: "Month 1", seed: 3 },
    { who: "Jonas · Aarhus, DK", text: "First mud caps this morning", stage: 3, when: "Month 3", seed: 8 },
    { who: "Sofie · Gent, BE", text: "Fuse looks half gone at month 6", stage: 5, when: "Month 6", seed: 15 },
    { who: "Luca · Bologna, IT", text: "Released at month 10, earlier than predicted", stage: 7, when: "Month 10", seed: 22 },
    { who: "Marta · Kraków, PL", text: "Installed facing south-east", stage: 1, when: "Week 1", seed: 31 },
    { who: "Erik · Uppsala, SE", text: "Still standing after a hard winter", stage: 5, when: "Month 7", seed: 40 }
  ];
  const storyList = document.getElementById("stories");
  if (storyList) {
    STORIES.forEach(function (s) {
      const el = document.createElement("article");
      el.className = "story";
      let bars = "";
      for (let k = 0; k < 8; k++) bars += '<i class="' + (k < s.stage ? "done" : k === s.stage ? "now" : "") + '"></i>';
      el.innerHTML =
        '<div class="body"><div class="meta"><span></span><span class="mono"></span></div><h3></h3>' +
        '<div class="timeline" role="img" aria-label="Story progress">' + bars + "</div>" +
        '<div class="meta"><span>Printed · Installed · Bees · M3 · M6 · M11 · Released · Gone</span></div></div>';
      el.querySelector(".meta span").textContent = s.who;
      el.querySelector(".meta .mono").textContent = s.when;
      el.querySelector("h3").textContent = s.text;
      el.insertBefore(makeCanvas(320, 200, s.seed, false), el.firstChild);
      storyList.appendChild(el);
    });
  }

  // ---- Sign-in dialog (front end only; accounts arrive in a later slice)
  const dialog = document.getElementById("signin");
  document.querySelectorAll("[data-signin]").forEach(function (b) {
    b.addEventListener("click", function () {
      const why = b.getAttribute("data-signin");
      dialog.querySelector("#signin-why").textContent = why || "Sign in to download your straw and post in Community.";
      dialog.showModal();
    });
  });
  if (dialog) {
    dialog.querySelector("[data-close]").addEventListener("click", function () { dialog.close(); });
    dialog.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      dialog.querySelector("#signin-status").textContent = "Accounts are not switched on yet. This is a preview.";
    });
    dialog.querySelector("#google").addEventListener("click", function () {
      dialog.querySelector("#signin-status").textContent = "Google sign-in is not switched on yet. This is a preview.";
    });
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
  window.addEventListener("hashchange", function () { show(location.hash.slice(1), true); });
  show(location.hash.slice(1) || "home", false);

  document.getElementById("year").textContent = new Date().getFullYear();
})();

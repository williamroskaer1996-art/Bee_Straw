// Install guide: a year spiral through the seasons and an eight-panel storyboard, made for one pin.
// Days are counted from 1 January of the install year (day 365 = 1 January the year after).
(function () {
  "use strict";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DPM = 30.44;
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function when(day) {
    day = ((day % 365) + 365) % 365;
    const m = Math.min(11, Math.floor(day / DPM)), w = day - m * DPM;
    return (w < 10 ? "early " : w < 20 ? "mid-" : "late ") + LONG[m];
  }
  function season(day) {
    const m = Math.floor((((day % 365) + 365) % 365) / DPM);
    return m === 11 || m <= 1 ? "Winter" : m <= 4 ? "Spring" : m <= 7 ? "Summer" : "Autumn";
  }

  // ---------- Year spiral
  // One turn = one year, starting at the install date and ending a little past it, when the nest lets go.
  function spiral(d) {
    const W = 520, C = W / 2, R0 = 92, R1 = 150;
    const span = Math.max(d.relDay, d.next + 30) - d.install;
    const ang = (day) => ((day % 365) / 365) * 2 * Math.PI - Math.PI / 2; // 1 January at the top
    const rad = (day) => R0 + (R1 - R0) * Math.min(1, Math.max(0, (day - d.install) / span));
    const pt = (day, dr) => { const a = ang(day), r = rad(day) + (dr || 0); return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
    const path = (a, b) => { let s = ""; for (let x = a; x <= b; x += 2) { const p = pt(x); s += (s ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); } return s; };
    // Seasons as quiet quadrant labels, months around the edge.
    let g = '<circle class="gw-ring" cx="' + C + '" cy="' + C + '" r="' + (R1 + 34) + '"/>';
    // Season names at the middle of each season (meteorological seasons: Dec–Feb, Mar–May, Jun–Aug, Sep–Nov).
    const seasons = [["Winter", 15], ["Spring", 105], ["Summer", 197], ["Autumn", 288]];
    seasons.forEach(function (s) {
      const a = ang(s[1]), r = R1 + 72;
      g += '<text class="gw-season" x="' + (C + r * Math.cos(a)).toFixed(1) + '" y="' + (C + r * Math.sin(a) + 4).toFixed(1) + '" text-anchor="middle">' + s[0] + "</text>";
    });
    [334, 59, 151, 243].forEach(function (day) { // season boundaries: 1 Dec, 1 Mar, 1 Jun, 1 Sep
      const a = ang(day);
      g += '<line class="gw-div" x1="' + (C + 60 * Math.cos(a)).toFixed(1) + '" y1="' + (C + 60 * Math.sin(a)).toFixed(1) + '" x2="' + (C + (R1 + 40) * Math.cos(a)).toFixed(1) + '" y2="' + (C + (R1 + 40) * Math.sin(a)).toFixed(1) + '"/>';
    });
    for (let m = 0; m < 12; m++) {
      const a = ang(m * DPM + 15), r = R1 + 22;
      g += '<text class="gw-month" x="' + (C + r * Math.cos(a)).toFixed(1) + '" y="' + (C + r * Math.sin(a) + 3).toFixed(1) + '" text-anchor="middle">' + MONTHS[m] + "</text>";
    }
    // Phases along the spiral
    const end = Math.max(d.relDay, d.next + 30);
    g += '<path class="gw-wait" d="' + path(d.install, d.emerge) + '"/>';
    g += '<path class="gw-nest" d="' + path(d.emerge, d.nestEnd) + '"/>';
    g += '<path class="gw-inside" d="' + path(d.nestEnd, d.next) + '"/>';
    g += '<path class="gw-out" d="' + path(d.next, Math.min(end, d.next + 30)) + '"/>';
    if (d.relDay > d.next + 30) g += '<path class="gw-wait" d="' + path(d.next + 30, d.relDay) + '"/>';
    // Markers
    const marks = [
      [d.install, "1", "Install"], [d.emerge, "2", "Bees fly"], [d.nestEnd, "3", "Sealed"], [d.next, "4", "New bees out"], [d.relDay, "5", "Lets go"]
    ];
    marks.forEach(function (m) {
      const p = pt(m[0]);
      g += '<g class="gw-mark"><circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="11"/><text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 4).toFixed(1) + '" text-anchor="middle">' + m[1] + "</text></g>";
    });
    g += '<text class="gw-centre" x="' + C + '" y="' + (C - 6) + '" text-anchor="middle">one year</text>';
    return '<svg class="gw-svg" viewBox="0 0 ' + W + " " + W + '" role="img" aria-label="Year spiral from installing to the nest letting go">' + g + "</svg>";
  }

  // ---------- Line illustrations (ink lines, the straw in the accent colour)
  const SOIL = '<path class="il-soil" d="M0 150 H240"/><path class="il-hatch" d="M14 160 l10 -8 M54 162 l10 -8 M94 160 l10 -8 M134 162 l10 -8 M174 160 l10 -8 M214 162 l10 -8"/>';
  // The straw: one Ø20 tube, 10 cm in the soil with the graded fuse just under the soil line, 50 cm above
  // (drawn shorter, with a break). The nest is the bore, entrance at the top. The arrow marks the thin side.
  function straw(x, y, opts) { // (x, y) = where the straw meets the soil line
    opts = opts || {};
    const tilt = opts.tilt || 0, fuse = opts.fuse == null ? 1 : opts.fuse, w = 5, top = y - 112;
    let s = '<g class="il-straw">';
    s += '<path d="M' + (x - w) + " " + (y + 12) + " V" + (y + 30) + " L" + x + " " + (y + 38) + " L" + (x + w) + " " + (y + 30) + " V" + (y + 12) + '"/>';
    s += '<rect class="il-fuse" x="' + (x - w) + '" y="' + (y + 1) + '" width="' + 2 * w + '" height="11" style="opacity:' + (0.25 + 0.75 * fuse) + '"' + (fuse < 1 ? ' stroke-dasharray="3 2"' : "") + "/>";
    s += '<g transform="rotate(' + tilt + " " + (x + w) + " " + (y + 1) + ')"><path d="M' + (x - w) + " " + (y + 1) + " V" + (y - 52) + " M" + (x + w) + " " + (y + 1) + " V" + (y - 52) +
      " M" + (x - w) + " " + (y - 60) + " V" + top + " M" + (x + w) + " " + (y - 60) + " V" + top + '"/><path class="il-break" d="M' + (x - 9) + " " + (y - 50) + " l18 -5 M" + (x - 9) + " " + (y - 57) + " l18 -5" + '"/>' +
      '<path class="il-arrow" d="M' + (x + w + 3) + " " + (y - 12) + " h8 m-3 -3 l3 3 l-3 3" + '"/>';
    if (opts.cap) s += '<ellipse class="il-cap" cx="' + x + '" cy="' + top + '" rx="6.5" ry="3"/>';
    if (opts.holes) s += '<circle class="il-hole" cx="' + (x - 2) + '" cy="' + top + '" r="1.6"/><circle class="il-hole" cx="' + (x + 2.5) + '" cy="' + top + '" r="1.4"/>';
    if (opts.cocoons) for (let k = 0; k < 3; k++) s += '<ellipse class="il-cocoon" cx="' + x + '" cy="' + (top + 10 + k * 13) + '" rx="2.6" ry="5.5"/>';
    s += "</g></g>";
    return s;
  }
  function bee(x, y, r) {
    r = r || 0;
    return '<g class="il-bee" transform="translate(' + x + " " + y + ") rotate(" + r + ')"><ellipse class="il-wing" cx="-2" cy="-7" rx="6" ry="4"/><ellipse class="il-wing" cx="5" cy="-7" rx="6" ry="4"/>' +
      '<ellipse class="il-body" cx="0" cy="0" rx="9" ry="5.5"/><path d="M-3 -5 V5 M2 -5.3 V5.3"/><circle class="il-head" cx="10" cy="0" r="3.5"/></g>';
  }
  const flower = (x, y, h) => '<g class="il-flower"><path d="M' + x + " " + y + " V" + (y - h) + '"/><circle cx="' + x + '" cy="' + (y - h - 5) + '" r="5"/><circle class="il-dot" cx="' + x + '" cy="' + (y - h - 5) + '" r="1.5"/><path d="M' + x + " " + (y - h / 2) + " q 7 -4 10 -10 q -7 1 -10 10" + '"/></g>';
  const sun = (x, y) => { let s = '<g class="il-sun"><circle cx="' + x + '" cy="' + y + '" r="11"/>'; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; s += '<path d="M' + (x + 16 * Math.cos(a)).toFixed(1) + " " + (y + 16 * Math.sin(a)).toFixed(1) + " L" + (x + 22 * Math.cos(a)).toFixed(1) + " " + (y + 22 * Math.sin(a)).toFixed(1) + '"/>'; } return s + "</g>"; };
  const snow = (x, y) => '<g class="il-snow"><path d="M' + x + " " + (y - 9) + " V" + (y + 9) + " M" + (x - 8) + " " + (y - 4.5) + " L" + (x + 8) + " " + (y + 4.5) + " M" + (x - 8) + " " + (y + 4.5) + " L" + (x + 8) + " " + (y - 4.5) + '"/></g>';
  const ART = {
    print: '<g class="il-ink"><rect x="58" y="22" width="124" height="122" rx="6"/><path d="M58 52 H182 M84 52 V40 H156 V52"/><rect x="108" y="52" width="24" height="12" rx="2"/><path d="M120 64 V70"/><rect x="72" y="128" width="96" height="6" rx="2"/></g>' +
      '<g class="il-straw"><rect x="113" y="92" width="14" height="36"/><rect class="il-fuse" x="113" y="106" width="14" height="8"/></g>',
    spot: SOIL + sun(196, 34) + '<g class="il-ink"><path d="M170 60 L132 98"/><path d="M132 98 l3 -11 m-3 11 l11 -3"/><text class="il-label" x="150" y="96">SE</text></g>' + flower(28, 150, 34) + flower(48, 150, 46) + flower(66, 150, 30) +
      '<g class="il-ink"><path class="il-mud" d="M150 150 q12 -10 26 -2 q10 -8 22 2"/><text class="il-label" x="150" y="138">mud</text></g>',
    install: SOIL + straw(90, 150) + '<g class="il-ink"><path d="M60 22 V50"/><path d="M53 42 l7 9 l7 -9"/><text class="il-label" x="20" y="16">push in</text>' +
      '<path d="M110 132 a18 18 0 0 1 22 -6" stroke-dasharray="3 3"/><text class="il-label" x="136" y="122">arrow = thin side</text>' +
      '<path d="M120 157 H160" stroke-dasharray="2 3"/><text class="il-label" x="164" y="160">fuse</text></g>',
    nest: SOIL + straw(70, 150) + flower(200, 150, 38) + flower(222, 150, 28) + bee(108, 26, 160) + '<g class="il-ink"><path d="M96 30 q-14 -8 -22 4" stroke-dasharray="2 3"/></g>',
    sealed: SOIL + straw(70, 150, { cap: true }) + '<g class="il-ink"><path d="M84 38 a14 14 0 1 0 0.1 0" stroke-dasharray="3 3"/><text class="il-label" x="102" y="34">mud cap</text></g>',
    winter: SOIL + straw(70, 150, { cap: true, cocoons: true }) + snow(130, 46) + snow(176, 26) + snow(206, 70) + '<g class="il-ink"><path d="M78 62 H96" stroke-dasharray="2 3"/><text class="il-label" x="100" y="66">cocoons</text></g>',
    out: SOIL + straw(70, 150, { cap: true, holes: true }) + bee(130, 30, -20) + '<g class="il-ink"><path d="M78 34 q16 -10 38 -4" stroke-dasharray="2 3"/></g>' + flower(220, 150, 30),
    letgo: SOIL + straw(90, 150, { tilt: 84, fuse: 0, cap: true, holes: true }) + '<g class="il-ink"><path d="M96 70 a60 60 0 0 1 66 30" stroke-dasharray="3 3"/><text class="il-label" x="122" y="66">tips to the arrow</text></g>'
  };

  const CAMERA = '<svg class="cam" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5h3l1.4-2h3.2L11 5h3v8H2z"/><circle cx="8" cy="9" r="2.6"/></svg>';
  function panel(n, art, title, line, chip, tag, photo) {
    return '<article class="gs-panel"><div class="gs-art"><svg viewBox="0 0 240 170" aria-hidden="true">' + art + "</svg></div>" +
      '<div class="gs-text"><div class="gs-head"><span class="gs-n">' + n + "</span><h4>" + esc(title) + "</h4></div>" +
      "<p>" + esc(line) + '</p><div class="gs-meta"><span class="gs-tag gs-' + tag.toLowerCase() + '">' + tag + '</span><span class="gs-when">' + esc(chip) + "</span>" + (photo ? '<span class="gs-photo" title="Check-in: take a photo">' + CAMERA + "photo</span>" : "") + "</div></div></article>";
  }

  // d: { place, coord, species, install, emerge, nestEnd, next, relDay, releaseMonths, early, example, dir }
  function render(el, d) {
    const relText = isFinite(d.relDay) ? when(d.relDay) : "after two years";
    const stories = [
      panel(1, ART.print, "Print your straw", "One file for your printer, with the fuse tuned for your weather.", "Before " + when(d.install), "Make", true),
      panel(2, ART.spot, "Pick the spot", "Morning sun, facing south-east. Flowers and damp mud nearby.", "Before " + when(d.install), "Make", false),
      panel(3, ART.install, "Push in, turn the arrow", "Push it in 10 cm, so the fuse sits just under the soil. Turn the arrow towards " + (d.dir ? "the " + d.dir : "where it may fall") + ".", season(d.install) + " · " + when(d.install), "Install", true),
      panel(4, ART.nest, "Bees move in", "Look for pollen and bees at the entrance.", season(d.emerge) + " · " + when(d.emerge) + " → " + when(d.nestEnd), "Watch", false),
      panel(5, ART.sealed, "Sealed with mud", "A mud cap means the nest is full.", season(d.nestEnd) + " · " + when(d.nestEnd), "Watch", true),
      panel(6, ART.winter, "Leave it alone", "Young bees sleep in cocoons through winter.", "Summer → Winter", "Wait", false),
      panel(7, ART.out, "New bees out", "Holes in the cap: they made it.", season(d.next) + " · " + when(d.next), "Watch", true),
      panel(8, ART.letgo, "Back to the soil", "The thin side goes first, so it tips the way of the arrow. Leave it where it falls; print a new one a few metres away.", season(d.relDay) + " · " + relText, "Let go", true)
    ].join("");
    el.innerHTML =
      '<section class="gw" aria-label="Your year">' +
        '<div class="gw-wheel">' + spiral(d) + "</div>" +
        '<div class="gw-side"><span class="label">' + esc(d.place) + " · " + esc(d.coord) + "</span>" +
          "<h3>Your straw's year</h3>" +
          '<p class="muted">' + d.species + "</p>" +
          '<ol class="gw-keys">' +
            '<li><span class="gw-k">1</span><b>Install</b><span>' + when(d.install) + "</span></li>" +
            '<li><span class="gw-k">2</span><b>Bees fly</b><span>' + when(d.emerge) + " → " + when(d.nestEnd) + "</span></li>" +
            '<li><span class="gw-k">3</span><b>Sealed</b><span>' + when(d.nestEnd) + "</span></li>" +
            '<li><span class="gw-k">4</span><b>New bees out</b><span>' + when(d.next) + ", next year</span></li>" +
            '<li><span class="gw-k">5</span><b>Lets go</b><span>' + relText + (isFinite(d.releaseMonths) ? ", ~" + Math.round(d.releaseMonths) + " months" : "") + "</span></li>" +
          "</ol>" +
          '<div class="gw-legend"><span><i class="lg-wait"></i>waiting</span><span><i class="lg-nest"></i>bees nesting</span><span><i class="lg-inside"></i>young inside</span><span><i class="lg-out"></i>new bees out</span></div>' +
          (d.early ? '<p class="gw-note"><b>Heads-up:</b> here the straw may let go before the new bees are out. If it falls, leave it lying with the entrance free.</p>' : "") +
        "</div>" +
      "</section>" +
      '<section class="gs" aria-label="Step by step">' + stories + "</section>" +
      '<p class="g-foot">' + CAMERA + " = a check-in for your Straw Story. Dates are model estimates, uncalibrated" + (d.example ? ", from an example climate" : "") + ".</p>";
  }

  window.BeeGuide = { render: render, when: when };
})();

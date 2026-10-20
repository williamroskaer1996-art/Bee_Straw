// AlphaEarth fingerprint straight from the public dataset, in the browser. No account or server needed.
//
// Data: the AlphaEarth Foundations Satellite Embedding dataset (Google and Google DeepMind, CC BY 4.0),
// mirrored as cloud-optimised GeoTIFFs on Source Cooperative (https://source.coop/tge-labs/aef).
// Each file covers one ~82 km UTM square at 10 m, with 64 bands stored as signed 8-bit integers
// (−128 = no data) and rows stored south to north. Only the bands and pixels needed are downloaded
// (HTTP range requests), about 2 MB for a 640 m square.
//
// Colours follow the dataset's own example: bands A01, A16, A09 as red, green, blue, −0.3 … 0.3.
(function () {
  "use strict";
  const INDEX_URL = "assets/data/aef-europe-2025.json";
  const LIB_URL = "https://cdn.jsdelivr.net/npm/geotiff@3.0.5/dist-browser/geotiff.js";
  const BANDS = [1, 16, 9]; // A01, A16, A09
  const VIS_MIN = -0.3, VIS_MAX = 0.3;
  const PX = 64;            // 64 × 64 pixels of 10 m = 640 m
  const RES = 10;

  let indexPromise = null, libPromise = null;
  const files = new Map();   // url → Promise<GeoTIFFImage>
  const results = new Map(); // "lat,lon" → result

  function loadIndex() {
    if (!indexPromise) indexPromise = fetch(INDEX_URL).then((r) => { if (!r.ok) throw new Error("index " + r.status); return r.json(); });
    return indexPromise;
  }
  function loadLib() {
    if (window.GeoTIFF) return Promise.resolve(window.GeoTIFF);
    if (!libPromise) libPromise = new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = LIB_URL; s.async = true;
      s.onload = () => (window.GeoTIFF ? resolve(window.GeoTIFF) : reject(new Error("geotiff.js missing")));
      s.onerror = () => reject(new Error("geotiff.js failed to load"));
      document.head.appendChild(s);
    });
    return libPromise;
  }

  // WGS84 → UTM (Snyder's series; better than a metre within a zone).
  function toUtm(lat, lon, epsg) {
    const zone = epsg % 100, south = Math.floor(epsg / 100) === 327;
    const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const phi = lat * Math.PI / 180, lam = lon * Math.PI / 180, lam0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * (lam - lam0);
    const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
      + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
    const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
    let y = k0 * (M + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
    if (south) y += 10000000;
    return { x: x, y: y };
  }

  // The file covering the point, preferring the point's own UTM zone where zones overlap.
  function pickTile(index, lat, lon) {
    const zone = Math.floor((lon + 180) / 6) + 1, own = (lat >= 0 ? 32600 : 32700) + zone;
    const hits = index.tiles.filter((t) => lon >= t[0] && lon <= t[2] && lat >= t[1] && lat <= t[3]);
    return hits.find((t) => t[5] === own) || hits[0] || null;
  }

  function openImage(url) {
    if (!files.has(url)) {
      const p = loadLib().then((G) => G.fromUrl(url, { allowFullFile: false })).then((tiff) => tiff.getImage(0));
      p.catch(() => files.delete(url));
      files.set(url, p);
    }
    return files.get(url);
  }

  const dequant = (q) => Math.sign(q) * (q / 127.5) ** 2;
  const toByte = (v) => Math.round(255 * Math.min(1, Math.max(0, (v - VIS_MIN) / (VIS_MAX - VIS_MIN))));

  // Returns { year, size: PX, metres, rgba (north-up, row by row), bounds: [[south, west], [north, east]] }.
  function fingerprint(lat, lon) {
    const key = lat.toFixed(4) + "," + lon.toFixed(4);
    if (results.has(key)) return Promise.resolve(results.get(key));
    return loadIndex().then(function (index) {
      const tile = pickTile(index, lat, lon);
      if (!tile) throw new Error("AlphaEarth has no data here (outside Europe or over open sea).");
      const url = index.base + tile[4] + ".tiff";
      return openImage(url).then(function (img) {
        const p = toUtm(lat, lon, tile[5]);
        const origin = img.getOrigin(); // [west edge, south edge]: rows run south → north in these files
        const col = Math.round((p.x - origin[0]) / RES), row = Math.round((p.y - origin[1]) / RES);
        const w = img.getWidth(), h = img.getHeight(), half = PX / 2;
        const x0 = Math.max(0, Math.min(w - PX, col - half)), y0 = Math.max(0, Math.min(h - PX, row - half));
        return img.readRasters({ window: [x0, y0, x0 + PX, y0 + PX], samples: BANDS, interleave: true }).then(function (ras) {
          const rgba = new Uint8ClampedArray(PX * PX * 4);
          let valid = 0;
          for (let r = 0; r < PX; r++) {
            const dstRow = PX - 1 - r; // flip so north is up
            for (let c = 0; c < PX; c++) {
              const s = (r * PX + c) * 3, d = (dstRow * PX + c) * 4;
              const q0 = ras[s], q1 = ras[s + 1], q2 = ras[s + 2];
              if (q0 === -128 || q1 === -128 || q2 === -128) { rgba[d + 3] = 0; continue; }
              rgba[d] = toByte(dequant(q0)); rgba[d + 1] = toByte(dequant(q1)); rgba[d + 2] = toByte(dequant(q2)); rgba[d + 3] = 255;
              valid++;
            }
          }
          if (!valid) throw new Error("AlphaEarth has no data here (open water).");
          const dLat = (PX * RES / 2) / 111320, dLon = dLat / Math.cos(lat * Math.PI / 180);
          const out = { year: index.year, size: PX, metres: PX * RES, rgba: rgba, bounds: [[lat - dLat, lon - dLon], [lat + dLat, lon + dLon]],
            pin: { x: col - x0, y: PX - 1 - (row - y0) } };
          results.set(key, out);
          return out;
        });
      });
    });
  }

  window.BeeAlphaEarth = { fingerprint: fingerprint, toUtm: toUtm };
})();

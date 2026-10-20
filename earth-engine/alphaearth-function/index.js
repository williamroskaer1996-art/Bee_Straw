// Bee Straw · AlphaEarth connector (Google Cloud Run function, Node 20+).
//
// GET ?lat=52.1&lon=5.18  → { year, png, sizeMeters, vector }  the area around a pin as a small RGB image
//                                                                   plus the 64 AlphaEarth numbers at the pin
// GET ?tiles=1            → { year, urlFormat }                  a map-tile URL for the AlphaEarth layer
//
// Data: GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL (CC BY 4.0). "The AlphaEarth Foundations Satellite Embedding
// dataset is produced by Google and Google DeepMind." Colours follow the dataset's own example:
// bands A01, A16, A09 as red, green, blue, stretched from −0.3 to 0.3.
//
// Environment:
//   EE_PROJECT       Google Cloud project registered for Earth Engine (required)
//   ALLOWED_ORIGINS  comma-separated site origins allowed to call this (default: *)
//   YEAR             embedding year to use (default: 2024, the latest in the dataset)
//   EE_PRIVATE_KEY   service-account key JSON, only for running outside Google Cloud
"use strict";
const functions = require("@google-cloud/functions-framework");
const ee = require("@google/earthengine");

const PROJECT = process.env.EE_PROJECT;
const YEAR = parseInt(process.env.YEAR || "2024", 10);
const ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim());
const VIS = { bands: ["A01", "A16", "A09"], min: -0.3, max: 0.3 };
const SIZE_M = 640; // square around the pin, metres
const PIXELS = 64;  // 10 m per pixel

// ---------- Earth Engine sign-in
// On Cloud Run the function's own service account is used (no key file needed).
const EE_SCOPE = "https://www.googleapis.com/auth/earthengine";
async function metadataToken() {
  const r = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=" +
    encodeURIComponent(EE_SCOPE + ",https://www.googleapis.com/auth/cloud-platform"), { headers: { "Metadata-Flavor": "Google" } });
  if (!r.ok) throw new Error("metadata token " + r.status);
  return r.json(); // { access_token, expires_in, token_type }
}
let ready = null;
function initEarthEngine() {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    if (!PROJECT) return reject(new Error("EE_PROJECT is not set"));
    const init = () => ee.initialize(null, null, resolve, (e) => reject(new Error(String(e))), null, PROJECT);
    if (process.env.EE_PRIVATE_KEY) {
      ee.data.authenticateViaPrivateKey(JSON.parse(process.env.EE_PRIVATE_KEY), init, (e) => reject(new Error(String(e))));
      return;
    }
    metadataToken().then((t) => {
      ee.data.setAuthToken("", t.token_type || "Bearer", t.access_token, t.expires_in, [], () => {}, false);
      ee.data.setAuthTokenRefresher((args, callback) => {
        metadataToken().then((n) => callback({ token_type: n.token_type, access_token: n.access_token, state: args.scope, expires_in: n.expires_in }))
          .catch((e) => callback({ error: String(e) }));
      });
      init();
    }).catch(reject);
  });
  ready.catch(() => { ready = null; }); // retry on the next request
  return ready;
}

const promisify = (fn) => new Promise((resolve, reject) => fn((value, err) => (err ? reject(new Error(String(err))) : resolve(value))));
function embeddings() {
  return ee.ImageCollection("GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL").filterDate(YEAR + "-01-01", YEAR + 1 + "-01-01").mosaic();
}

// ---------- Small caches (per instance)
let tileCache = null; // { at, body }
const pinCache = new Map();
function remember(key, value) {
  pinCache.set(key, value);
  if (pinCache.size > 500) pinCache.delete(pinCache.keys().next().value);
}

async function tiles() {
  if (tileCache && Date.now() - tileCache.at < 60 * 60 * 1000) return tileCache.body;
  const map = await promisify((cb) => embeddings().getMapId(VIS, cb));
  const body = { year: YEAR, urlFormat: map.urlFormat };
  tileCache = { at: Date.now(), body };
  return body;
}

async function pin(lat, lon) {
  const key = lat.toFixed(4) + "," + lon.toFixed(4);
  if (pinCache.has(key)) return pinCache.get(key);
  const point = ee.Geometry.Point([lon, lat]);
  const region = point.buffer(SIZE_M / 2).bounds();
  const image = embeddings();
  const [url, values] = await Promise.all([
    promisify((cb) => image.getThumbURL(Object.assign({ region, dimensions: PIXELS, format: "png" }, VIS), cb)),
    promisify((cb) => image.reduceRegion({ reducer: ee.Reducer.first(), geometry: point, scale: 10 }).evaluate(cb))
  ]);
  const auth = ee.data.getAuthToken();
  const png = await fetch(url, auth ? { headers: { Authorization: auth } } : {});
  if (!png.ok) throw new Error("thumbnail " + png.status);
  const b64 = Buffer.from(await png.arrayBuffer()).toString("base64");
  const vector = [];
  for (let i = 0; i < 64; i++) {
    const v = values && values["A" + String(i).padStart(2, "0")];
    vector.push(typeof v === "number" ? Math.round(v * 1e4) / 1e4 : null);
  }
  const body = { year: YEAR, sizeMeters: SIZE_M, png: "data:image/png;base64," + b64, vector: vector.some((v) => v === null) ? null : vector };
  remember(key, body);
  return body;
}

// ---------- HTTP
function cors(req, res) {
  const origin = req.get("origin");
  const allow = ORIGINS.includes("*") ? "*" : ORIGINS.includes(origin) ? origin : null;
  if (allow) res.set("Access-Control-Allow-Origin", allow);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return !!allow;
}

async function handler(req, res) {
  const allowed = cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET." });
  if (!allowed) return res.status(403).json({ error: "Origin not allowed." });
  const wantTiles = !!req.query.tiles;
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!wantTiles && (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -60 || lat > 80 || lon < -180 || lon > 180)) {
    return res.status(400).json({ error: "Give lat and lon as numbers, for example ?lat=52.1&lon=5.18." });
  }
  try {
    await initEarthEngine();
    if (wantTiles) {
      res.set("Cache-Control", "public, max-age=1800");
      return res.json(await tiles());
    }
    res.set("Cache-Control", "public, max-age=86400");
    return res.json(await pin(lat, lon));
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "Earth Engine request failed: " + e.message });
  }
}

functions.http("alphaearth", handler);
module.exports = { handler };

# Bee_Straw
Open-source parametric bee habitats, locally adapted with environmental data and FDM-printed in biodegradable PHA

A Bee Straw is a single 3D-printed straw for the red mason bee (*Osmia bicornis*), made of 100 % PHA: one Ø20 mm tube with a Ø8 mm bore, pushed 10 cm into the soil and standing 50 cm above it. Just under the soil line, a 15 mm section of the straw is a graded gyroid "fuse": its sheets are thick on one side and thin on the other. The sheet thickness is set from the weather at your pin and published PHA decay rates, so the fuse wears through after about 12 months. The thin side goes first, so the straw tips the way you turned it, then returns to the ground. A fresh nest every season avoids the mites and mould that build up in permanent bee hotels. All timings are model output, uncalibrated; no study has tested PHA nests with bees yet.

The project started in the TU Delft course Computational Fabrication & MetaMaterials (autumn 2026) by William Bo Roskær and Mateo Kaiser.

## What's here

| Path | What |
|---|---|
| `site/` | The website: Home, About, Build your straw (pin → site → tuned fuse → printer → install guide) and Community (Straw Stories). Plain HTML, CSS and JavaScript, no build step. |
| `site/assets/js/config.js` | Keys for Supabase (accounts) and Google Maps. Empty = preview mode. |
| `supabase/schema.sql` | Database tables, privacy rules and photo storage for accounts and Straw Stories. |
| `docs/SETUP.md` | How to publish the site and switch on accounts, Google sign-in and Google Maps. |
| `.github/workflows/pages.yml` | Publishes `site/` to GitHub Pages on pushes to `main`. |

## Run it locally

Open `site/index.html` in a browser, or serve the folder:

```bash
cd site && python3 -m http.server 8000
# then open http://localhost:8000
```

## Status and honesty

- Decay timings on the site are **model output, uncalibrated**: a simplified estimate from published PHA decay rates in wet soil and local weather. Real soils can be several times faster or slower until they are measured.
- No study has yet tested PHA nests with bees. Whether Bee Straw reduces parasites is what the field trials are for.
- Print files for home printers are in progress; only the Ultimaker S5 route has been tested.

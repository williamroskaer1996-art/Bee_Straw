# Bee_Straw
Open-source parametric bee habitats, locally adapted with environmental data and FDM-printed in biodegradable PHA

A Bee Straw is a single 3D-printed nest tube for the red mason bee (*Osmia bicornis*), made of 100 % PHA. It is pushed into the soil and lasts one nesting cycle: a thin lattice "fuse" just under the soil line slowly breaks down, and after about 13 months the nest lets go and returns to the ground. A fresh nest every season avoids the mites and mould that build up in permanent bee hotels.

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

# Roadmap and notes

## The final fuse (28 Oct 2026)

The site now shows the course's final fuse: a 15 mm graded gyroid section (cell 6 mm) of the Ø20 / Ø8 straw, just under the soil, thin side 0.67 × thick side. The bend joint and horizontal nest tube are gone. Per pin, published decay rates (0.6 µm/day/face at 25 °C, Q10 = 2, ×1.5 for quenched lines [assumed]) and the pin's weather size the thick sheets to wear through at 12 months (or when wear resumes after a winter at ≤ 4 °C). At De Bilt this gives about 0.18 / 0.12 mm, close to the simulated course fuse (0.20 / 0.133 mm). Open:

- **Timing vs. bees:** installed about 3 weeks before the bees fly, a 12-month fuse lets go a few weeks before next year's bees come out. The install guide shows a heads-up where this happens. [decide]
- **Load:** the real nest (~150 g on a 50 cm lever) will tip before the fuse is fully worn; re-run the statics check before trusting the let-go month. [to verify]
- **Home printing at real size:** 0.1–0.3 mm sheets are below a 0.4 mm nozzle line. [to verify]
- **The thin-side mark** on the printed straw (arrow or notch above the soil). [to design]
- A simulator sweep over sheet thicknesses would replace the literature-only estimate.

Things decided or noted for later. Labels: **[assumed]** design choice not yet tested, **[to verify]** needs a source or a test.

## Later: more design freedom before the G-code is made

Noted by William, 20 Oct 2026. Comes after the parametric design and the decay simulation are finished.

On **Build your straw**, before the print file is generated, people should be able to adjust their straw:

- **How many units** (nest tubes per straw or per module).
- **How tall** it is, above all the **nest height above the ground** (see below).
- Other parameters to decide with the design: tube length, bore, and which parts are fixed by biology and must stay locked.

Then, before downloading:

- **A preview of the build plate**, so people see exactly what they will print: the parts laid out on their printer's bed, split into pieces where the printer is too short.
- **How much material** it uses (grams and metres of filament, for the chosen allPHA diameter).
- **How long the print takes**, as an estimate.

Material and time can come straight from the G-code generator: it already knows every toolpath, its extrusion and its feed rate.

**Started 20 Oct 2026:** Build now has a slicer-style print preview (`site/assets/js/slicer.js`, `slicer-worker.js`): the printer's plate in 3D, toolpaths coloured by zone, a layer slider, filament, weight and time. It reads G-code, but for now the G-code comes from a simplified JavaScript stand-in for the generator (same zones, line widths and layer heights; no printer settings), labelled as an illustration. Next: feed it the real generator's G-code, and design the push-fit split for printers under 285 mm (now shown as two parts split above the bend joint).

## Nest height above the ground

Height probably has a big effect on whether bees move in [to verify]. The current bee straw holds the nest tube just above the soil line, with the fuse just under it.

- **For now:** a standard height of about **50 cm** above the ground [assumed]. 70 cm is the other option discussed.
- **Later:** height may become a **location-based parameter**. Things that could change it: local vegetation height, snow depth, flooding risk, and how *Osmia bicornis* and *O. cornuta* choose nest height [to verify in literature].
- **What it changes in the design:**
  - the fuse must stay just under the soil while the nest moves up, so a stem or post is needed between them;
  - a longer lever arm puts more load on the fuse and joint (requirements R5 and R7);
  - a taller part is harder to print, so it may be split into push-fit pieces (requirement R1);
  - 100 % allPHA (R8) rules out a wooden stake unless that requirement changes;
  - the stem is sun-exposed, so the UV wall-thickness rule (1.6–2 mm) applies.

## On hold: photoreal bee

Noted 20 Oct 2026. The home-page bee is drawn in code for now (calm version). Goal: photoreal, in the spirit of Nothing's site; a honeybee is fine.

- Keep the code for the movement; swap the drawing for five short top-down clips with transparency: fly (loop), land, walk (loop), rest and groom (loop), take off.
- Source: AI video (Kling image-to-video, first and last frame the same for loops; Veo 3 as backup), all started from one still image on a #00FF00 background. Later, our own macro footage in spring 2027.
- Either William generates the clips, or Claude runs them through Weave once the Figma account is linked to Weave (each run costs Weave credits and needs approval).
- Processing: key out the green, make the loops seamless, export WebM VP9 with alpha plus HEVC with alpha for Safari, with a fallback (about 1–2 MB in total).

## Polish list (small interactions, for the end)

Fixed on 20 Oct 2026: address suggestions while typing; no map jump when placing a pin; crosshair and closed-hand cursors; sharper satellite tiles on high-density screens; "Use my location"; suggestion list no longer hidden under the map controls on phones.

From the heuristic evaluation (NN/g heuristics, 21 Oct 2026). Fixed: blank map when arriving from Home; Build page reordered (place → site → decay → printer and print preview → download) with a sticky step bar that jumps to each step; Download says the file is coming soon and offers "Email me when it's ready"; dates first ("Install", "Lets go") with the fuse numbers under "How the fuse is tuned"; the last pin is remembered in this browser. Decided against: replacing the How-it-works carousel, and shareable pin links.

Still open from the evaluation:

- The bee rests on top of the "Build your straw" label; land on the button's edge instead.
- Mosaic place names show only on hover; show them on tap or always on phones.
- Phone menu cuts "Community" off; shorten labels or wrap.
- Decay chart labels are about 6 px on phones; larger labels on narrow screens.
- "Soil map didn't answer" and the example-climate fallback need a "Try again" link.
- A short "How the straw works" explainer and FAQ on Build (fuse, gyroid, printer not listed, drying allPHA, bending the joint, early fall).
- Cosmetic: "nesting" overlaps the 100 % point in the chart; wide gap in the print-preview numbers; About photos.
- Run a 5-user test with maker-gardeners ("find out when to install a straw in your garden and get the file for your printer").

Still to look at:

- Suggestions: show a small pin or place-type icon per row (street, town, landmark), and highlight the typed letters.
- Map: a subtle drop animation for the pin (respecting reduced motion), and a short "Pin placed" confirmation for screen readers.
- Map: remember the last pin and zoom between visits.
- Soil: SoilGrids often takes 15–60 s. Show a small progress hint in the Soil row, or move soil lookups to our own server with caching.
- Phone: make the map a little taller on small screens, and keep the search row visible while the suggestion list is open.
- Your site card: show the AlphaEarth image larger on tap.

## Notes on the decay estimate (website version)

- **Wet days** now use a relative rule: a day counts as wet when topsoil moisture is in the upper half of that place's own usual range (5th–95th percentile over the years fetched). Reason: with a fixed 0.25 m³/m³ threshold, recent Open-Meteo data marked De Bilt wet on 100 % of days and Munich on 3 %, although Munich had more rain; the fixed value mostly reflected the weather model's soil type. [assumed, to check with Mateo]
- **Calibration** now compares each live pin with live De Bilt weather from the same source, years and rule, so "13 months at De Bilt" holds for real data too. Example climates are still compared with the example De Bilt climate.
- **Soil texture** (SoilGrids) is shown but does not change the estimate yet. Linking texture to decay speed needs the burial calibration.

## Other open items

- Real print files per printer (port of the Grasshopper generator; S5 first, then a 1.75 mm Marlin printer).
- Check the website's simplified decay estimate against the full decay engine.
- Burial reference coupons in several soils, to calibrate decay speed.
- Field trial with bees, spring 2027.
- Privacy notice and moderation plan before opening Community sign-ups.
- Check Esri World Imagery terms before a large public launch.

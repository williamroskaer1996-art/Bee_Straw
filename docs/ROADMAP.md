# Roadmap and notes

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

## Polish list (small interactions, for the end)

Fixed on 20 Oct 2026: address suggestions while typing; no map jump when placing a pin; crosshair and closed-hand cursors; sharper satellite tiles on high-density screens; "Use my location"; suggestion list no longer hidden under the map controls on phones.

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

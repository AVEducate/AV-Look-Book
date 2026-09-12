# Look Book Builder — Future Work Notes

Two lists, kept separate on purpose:

1. **Web App — Future Modules & Updates** — features to build into the
   current single-file HTML app (`deploy/lookbook_builder.html`).
2. **Native App Development — Feature Inspiration** — items intended for
   a future native / Electron app version. These are nice-to-have polish
   items, often borrowed from competitor inventories. Not for the web app.

Last updated: 2026-06-08.

---

## 1. Web App — Future Modules & Updates

Things that extend the live web app. Each is scoped enough to commit to
in a single working session.

### Carried over from CLAUDE.md "What's next"

- **Look Book PDF export redesign** — light bg, canvas + table per
  preset, proper page layout. Currently uses browser print on a dark DOM
  clone. Needs a design conversation before code.
- **Layer position reset on Video Presets canvas** — a button in the
  layer properties panel + a small chip-level button. Snaps a layer back
  to its default position within the destination.
- **Electron packaging** — wrap the HTML app as a desktop binary.
  Deferred until the HTML demo is signed off.

### Carried over from in-session discussions

- **Per-card upload / download icons (Wire Mode Advanced library)** —
  small upload + download icons on each source / destination / AUX·DSM
  custom-library card. Upload accepts a card preset blob; download
  exports the card preset blob. Lets users share single library entries
  out-of-band without exporting the whole show.
- **Multi-page Advanced PDF / PNG / SVG export — alternate layouts** —
  the current export stacks all 3 pages vertically (PNG/SVG) or one per
  PDF page. Could optionally support: zip-of-files, side-by-side combined
  layout, or per-page individual downloads. Adds export-modal complexity;
  defer until users actually ask.
- **Page-tab zone Advanced-only future controls** — the cyan-framed zone
  around the PAGE 1/2/3 tabs in Wire Mode was deliberately given room
  for more controls. Candidates to drop in there when they come up:
  - Duplicate Page (clone the current page's data into the next empty one)
  - Snap-to-grid toggle (Advanced only — the user explicitly wanted no
    snap by default; toggle would be opt-in)
  - Per-page color tint / accent (for visual differentiation)
  - "Add page" button if we move beyond a fixed 3-page model
- **Patch I/O Phase 2 enhancements** — the 3-way Tools nav is wired up;
  Patch I/O exists as the System overlay. Future polish:
  - Filter / search across the I/O inventory
  - Bandwidth warning aggregator (which connectors are over capacity)
  - Per-row source preview (thumbnail when available)

---

## 2. Native App Development — Feature Inspiration

Notes from the audit of Video Preset Maker v1.43
(`videopresetmaker.netlify.app`). These are items we don't want in the
web app right now but are worth bringing into a native / app version when
that's where we're focused.

Ordered roughly by impact-to-effort ratio.

### PDF Export polish (highest value)

1. **Presets-per-page selector** — `1 / 2 / 4 / 6 / 8 / 12 / custom`.
   - 1 per page → printable show notes for the caller.
   - 4–6 per page → compact technical reference.
   - 12 per page → at-a-glance show grid.
   - Our current PDF auto-decides; user choice unlocks several use cases.
2. **Version Number field on export** — print "v3.2" in the PDF header.
   Production teams iterate look books constantly during rehearsals;
   half a day of work, saves arguments on show day.
3. **Manual Orientation toggle (Landscape / Portrait)** — manual override
   that wins over the auto >4-destinations rule. Some users want portrait
   even with 6 destinations (binders, standard paper).
4. **Order option for preset numbering** — `Left → Right` or
   `Top ↓ Bottom`. Matters when stage left/right vs row layout is the
   calling convention.

### Project metadata

5. **Show-level Notes field** — a multi-line note on the project itself
   (separate from per-preset notes). Captures operational context:
   "3-day conference, keynote 9am Mon, FOH crew is X." Add to Quick
   Setup, persist in .avlb, print in PDF header when filled.

### Preset organization

6. **Preset Highlight flag** — a star/flag toggle on the preset header
   that marks "this is the important one." Visual treatment in the
   preset table; filter target in the export modal.
7. **Preset filter on export** — `All / Main only / Highlights only`.
   Lets the user export a focused subset — e.g. just the moneymaker
   presets for a marketing one-pager. Depends on item #6 existing first.

### Explicitly rejected from the audit (don't revisit)

These were in the competitor app but don't fit our model — captured so
we don't re-evaluate them every quarter:

- **"Backup Preset" flag** — duplicates capability we already have
  (sources are Primary/Backup; Advanced Wire Mode has 3 pages that can
  be main / backup / video-only).
- **Treatments** — vague concept in the source app, no clear use case.
- **Source Short Name** — cable color + thumbnail + name already convey
  identity; another field adds entry friction without proportional value.
- **Explicit Preset Number field** — our P01 / P02 P-code scheme already
  serves the same role.

---

## How to use this file

When opening a new working session, scan list #1 for the next web-app
build. Don't pull from list #2 unless the conversation is explicitly
about native-app planning. Items move between lists if the strategy
shifts — note the move in a commit message.

When an item gets built, **delete it from this file** (don't strike-
through). Keep this list living and current; don't let it become a
graveyard of "we'll never do this."

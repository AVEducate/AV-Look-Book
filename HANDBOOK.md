# AV Look Book — working handbook

How this project is worked on, written so a fresh session (or a fresh person) can pick it up without the
conversation that produced it. CLAUDE.md holds the rules in short; this is the how. RELEASE.md is the release gate.

## 1. Where things live
- `deploy/lookbook_builder.html` — the whole app, one file. Every page change lands here. Bottom-right of the app
  shows the build stamp (`build 2026-06-16xx`); bump the stamp on every page build (letters advance: 16ke → 16kf → … → 16kz → 16la).
- `electron/` — the desktop shell. `main.js` (windows, Welcome, content updater, Send show, Report a bug),
  `package.json` (version = the tag; `build` config incl. `.avlb` file association + UTI), `build/` icons.
  Shell or bundled-file changes need a fresh install on Mac (unsigned, no shell self-update); Windows self-updates.
  Page-only changes reach installed copies through the content updater (latest full release).
- `.github/workflows/release.yml` — every `v*` tag builds Mac (arm64 + x64 DMG) and Windows (EXE), attaches the
  page + Quick Guide. Tags with a `-` publish as pre-releases (see RELEASE.md).
- `tests/` — the gate (`run_smoke.mjs`, `smoke_probe.js` = what the examples produce, `flows_probe.js` = user flows in
  Simple + Advanced, `golden/`). When a feature ships or a bug is fixed, add a check to `flows_probe.js`. `tools/` — `check_js.py`, `cdp.mjs`.
- `deploy/quick_guide.html` / `.pdf` — the 14-page Quick Guide; `docs/quick_guide.html` mirrors it.
- `site/` — website blocks (landing page HTML, download counter). `deploy/landing-*.html` are the landing sections.
- `backups/` — local snapshots (not in git). Take one before any risky page edit.
- Local scratch (build scripts, probes) lives outside the repo and is disposable; anything worth keeping goes in `tools/` or `tests/`.

## 2. Editing the page safely (the rule that prevents corruption)
Never use a text-editor replace inside JS template literals. Use a Python script with exact-match replacements and
count assertions, so the file is written only if every anchor matches exactly once:
```python
s=open(P,encoding='utf-8').read(); steps=[]
def rep(old,new,count=1,tag=''):
    n=s.count(old)
    if n!=count: print('FAIL [%s]: expected %d, found %d'%(tag,count,n)); sys.exit(1)
    steps.append((old,new))
rep("...exact current text...", "...new text...", 1, 'what')
for o,n in steps: s=s.replace(o,n)
open(P,'w',encoding='utf-8').write(s)
```
Then `python3 tools/check_js.py`. When a line is shared by several builders (the same markup in three functions),
anchor on the function name and replace the first occurrence after it, never all three.

## 3. Testing for real
- Serve the page: `python3 -m http.server 8090 --directory deploy` and open
  `http://localhost:8090/lookbook_builder.html?nocache=<anything>` in Chrome. Drive the real UI, not just the model.
- Seed a show: `lbOpenExample('general-session')` (also `awards-night`, `town-hall`); if a restore prompt appears,
  click "Start fresh"; hide `.dlg-overlay,#dlg-overlay,#qs-modal` when probing by script.
- App globals are `let`-scoped: read them with `eval('presets')`, not `window.presets`.
- Video Presets Advanced: `openFullscreen(presetId)`, `_fsSetPropTab('layers')`, `_fsSelectLayer(pid,sid,n)` (n=0 is
  the BG), `_fsAssignLayer(pid,sid,n,name)`, `_fsAssignBg(pid,sid,name)`, `closeFullscreen()`. Emulate at least 1280×900.
- Wire: `openWireMode()`, `wireSettings.wireView='advanced'|'simple'; _wireRender()`, `_wireAdvSeedFromSimple(true)`
  to fill an empty Advanced page, `closeWireMode()`. The panel `#wire-sources-panel` scrolls; `#wire-diagram-scroll`
  holds the canvas.
- The app has ONE dialog (`#dlg-overlay`, open when it has class `show`): answer it by clicking `#dlg-confirm` /
  `#dlg-cancel`. Never hide or remove it in a test, or every later confirm silently does nothing. While it is open the page hears no key
  (`_dlgKeyGuard`: only Tab / Space / Enter / Escape work, inside the dialog) and the rest of the multi-click that opened it is dropped
  (`_dlgClickGuard`), so a test that wants a page shortcut closes the dialog first; `el.click()` and a fresh single click always count.
- A real user exports the Look Book through its window (`openPdfExportModal` then `_pdfConfirmExport`), which is what
  ticks the wire sheet; a bare `exportPDF(true)` skips those options. Stub `exportPDF` to capture the HTML.
- Exports without a download: `exportPDF(true)` returns the Look Book HTML; `_doExportExcel(true)` returns the xlsx
  Blob; to read the rows, wrap `_buildXlsx` and capture its first argument.
- Test media: build a clip in-page (canvas `captureStream` + MediaRecorder) and push
  `{l, kind:'video', img:<poster>, media:{w,h,dur,fps,type,fileName}}` into `customLibrary`, then `_fsAttachBlob(name,blob)`.
  Always mute, pause every `<video>` and clear `_fsWantPlay` before leaving a page. Never leave media playing.
- Desktop shell in dev: launch Electron against `./electron` with `--remote-debugging-port=9333` and a dev userData
  (`av-look-book-dev`), never the real one; drive it with `node tools/cdp.mjs`. Never run the packaged app for tests.
- CI: after pushing a tag, poll `https://api.github.com/repos/AVEducate/AV-Look-Book/actions/runs?per_page=1`
  (parse with `json.loads(text, strict=False)`), then `releases/latest` or `releases/tags/<tag>` for assets.

## 4. Build discipline (every page build)
1. Snapshot `backups/lookbook_builder_<date>_before-<stamp>.html`.
2. Script the edit (section 2). Bump the stamp. Run `tools/check_js.py`.
3. Drive the feature in the browser, then the neighbours it could affect. Screenshots are the proof.
4. Run the gate (`node tests/run_smoke.mjs`), add a flows check for the change, regenerate goldens if the change was
   intended. Commit LOCALLY and stop: the owner tests with `Test AV Look Book.command` before anything is pushed
   (RELEASE.md, "The owner tests first"). Only after his OK: push; only on "release it": bump
   `electron/package.json`, tag, push the tag, watch CI.
5. Write the build's notes down (memory, or this file if the knowledge is durable).

## 5. Product rules that are not obvious from the code
- **P01 is the MASTER preset** (owner's rule, an old workflow: do not break it). `addPreset` deep-copies every per-preset
  field from `presets[0]` ("GLOBAL PRESET 00"): layers, colours, BGs, show mode, layer sizes, masks, AOI, POSITIONS (so
  blends and free positions set on P01 are inherited), AUX on / content / colour, opacities. Later presets are then changed
  on their own; editing P01 afterwards does not reach back. Destination name / colour edited on P01 = show-wide; on any
  other preset = that preset's override. The four Modifier switches (AOI Overlays, Blend Zones, Dead Space, Free Position)
  are NOT per preset and not in the show file: one view setting for the whole program on this computer
  (`localStorage lookbook_adv_settings`, since 2026-06-02). The owner believes they follow P01 per preset: that would be a
  NEW feature (decision pending), say so before building anything on that assumption.
- **Why Simple and Advanced exist** (owner, 2026-09-21; keep every change inside this idea). Simple is PRE-BUILT from the
  Video Presets page, for smaller shows and for a show caller or producer who does not know the hardware. Advanced is for
  the engineer: the hardware the presets page cannot know (routers, switchers, DAs, converters) is added there. Advanced
  PAGE 1 is the Simple build carried over, and it is two-way: a change on page 1 updates Simple, I/O Patch and Video
  Presets, because a source is ONE thing (name, cover, cable type, resolution) shown in several places, which is why it is
  drag-and-drop. Every page after page 1 is a CUSTOM build that feeds nothing back. Random cable colours on the first look
  at Wire are intended; a colour the user picked must never change again.
- **The Look Book prints the wire pages, not the open tab** (owner, decision 36, 2026-09-22). With Wire view =
  Advanced the book carries one sheet per Advanced page that has something on it (`_wireAdvPageUsed`), in page
  order, each titled with the page tab's own name and counted in the book's page numbers and contents rows;
  the contents label is escaped with `_esc` like every other printed name, and for a page still called "Page 2"
  the drawing frame's title block reads "Signal Flow" (`_lbWireSheetTitle`, the same test `_wireExportSheetList`
  already used) so the Look Book and the Wire tool do not print one page under two titles;
  the page the user is on is put back afterwards. Nothing drawn in Advanced = the SIMPLE drawing, never an
  "(Empty page)" sheet. Simple prints exactly what it always printed. The list is `_lbBookWireSheets(opts)`,
  next to `_wireExportSheetList`; the Wire tool's own export already worked this way.
  I/O Patch page 1 (round 16kt, decision 31): a row page 1 COPIED from the show carries `fromShow:true` (in the file); a row typed by
  hand has no flag. ONE scan, `_ioAdvScanShowRows`: a copied row whose source / destination / AUX / multiviewer is not in the show is
  marked `gone:true` (in the file) and STAYS with its data; it never becomes an I/O-only twin (`_ioAdvSyncPage1ToSimple` skips it),
  the Advanced draw dims it with a "not in the show" tag (`_ioAdvGoneRow`, CSS `.sys-row.io-gone`), the page-1 sheet of the I/O
  Excel leaves it out (`_ioAdvRowPrints`), a page copy drops it (`_ioAdvStripGone`), `_ioAdvEnsureAutoPairs` makes no B for it;
  the mark clears when an item of that name is back. Only Rebuild from Simple and the row's trash remove it. The scan runs on
  EVERY I/O Patch draw in front of the view branch of `_sysRender` (`_ioAdvFollowShow`, whatever view or page tab is open) and
  once more in `_sysExportIOExcel`. A rename is never a row that left: every label-rename path calls `_ioAdvRenameTwin`
  (`_sysApplyGlobalRename` for I/O Patch Simple, Wire and the phone card; `_fsRenameContent` for the Advanced Video Presets
  Source box; `_lbRenamedDest` for destinations). The table cell (`homeSetL`) and the Simple layer panel's Custom Name box SWAP a
  layer's content, they never rename a label. Unflagged rows of an older file whose name is a show item's own (never the twin
  page 1 made) are marked on that draw. A hand rename drops both flags (`_sysSetMetaNow`, Advanced-row branch). These writes
  are draw follow-ups (`_lbNotAChange` draw form) and never an undo step: `_ioAdvNetRebase` moves the undo safety net's open
  gesture picture along, the way `_lbStillClean` moves `t.saved`, only when that gesture had changed nothing else. A NEW way of
  taking an item out of the show needs nothing: the next draw sees it. A NEW way of RENAMING a label must call
  `_ioAdvRenameTwin`. A NEW row-making path on page 1 must decide: copied (mark it) or hand-typed. Known gap: a Wire patch tile
  built from page 1 (`_wireAdvAddPatchTile`) still takes every named row, gone ones included.
- **Looking is not a change** (owner, 2026-09-21). Save turns gold, and New / Load / close ask, ONLY after a real edit. Opening Wire,
  I/O Patch or Advanced, a Look Book with a wire sheet, zoom, tool, folded panes, page tabs and Simple / Advanced never do. View
  settings are still written to the show file; they are only left out of the unsaved comparison (`_LB_DIRTY_VIEW_KEYS`). What the app
  fills in by itself on a first look goes through `_lbNotAChange(fn)` and is written with the next save (the desktop app also writes
  it with the 30 s autosave and when the window closes). Testing it: the `unsaved:` checks in `tests/flows_probe.js`; a new
  automatic write shows up there as a gold Save after only looking. Consequence to know: in the browser edition, first-look colours
  that were never saved are picked again (new random ones) the next time the file is opened.
- **The arrow KEYS on a picked destination RESIZE it 1 px (Shift 10)**, in Simple and in Advanced: an accessibility feature
  from 2026-06-01, kept on purpose (owner 2026-09-21: "keep this the way it is"). The on-canvas ◀ ▶ are what SWAP a
  destination with its neighbour. On a blended group (one block, `_lbMvBlocks`) they are drawn on the group's OUTER
  edges, ◀ far left of the left-most member and ▶ far right of the right-most member, whichever member is picked, and
  never over the blend zone (blend-arrows, owner 2026-09-21). A destination that is not blended keeps `left:6px` / `right:6px`.
  The key resize goes through `updateScreenSize` (neighbours are pushed along) so it can
  never park a destination on another one; a burst of presses is one undo step.
- **Escape, three rules** (owner decision 5, build 16ks-esc). (i) In ANY text / number box Escape puts back the text the box had at
  focus, blurs it, commits nothing and closes nothing; Quick Setup is the one exception (it closes). (ii) Video Presets Advanced: first
  Escape clears `selLayer` / `sel` / a lit `selDSM` and the layer strip ghost (`_fsEscPicked`, `_fsEscLetGo`), the next one is `closeFullscreen()`; a fader, tick box, swatch or dropdown that holds focus is NOT a box (16ks-escfix). (iii) Idle Wire / I/O Patch: back to Video Presets, Wire's
  step-down order unchanged. One window-capture listener owns (i) and (ii) (search `16ks-esc`); a list / menu / window floating ABOVE
  the box still closes first (`_lbEscTop`, 16kp). A new text box needs nothing; a new live box is covered as long as it writes the
  show from its `input` event (16ks-escfix: the show is put back in place from the picture taken at the FIRST keystroke, `_lbEscOrig.s0`; nothing typed = nothing put back; a mouse edit made while the box kept focus is folded into that picture by `_lbEscRebase`, so it survives).
- **Date Created / Show Dates: ONE calendar** (owner, 2026-09-25, build 16kv; search `16kv-dates`). `_lbCalOpen(field)` serves every box
  with `class="lb-cal-field"` (`#qs-date` / `#wtb-date`: `data-cal="one"`; `#qs-dates` / `#wtb-dates`: `data-cal="range"`). Date Created
  stays `<input type="date">` and keeps its YYYY-MM-DD value: every reader of `#show-date` is unchanged; only the browser's picker is
  hidden (`::-webkit-calendar-picker-indicator`) and Alt + ↓ / F4 / Space (Space in Date Created only) are taken. Show Dates stays free text in `showMeta.dates`; the
  calendar writes `_lbCalText(a,b)` and reads back only that form (`_lbCalParse`); anything else typed is never touched. A pick writes
  the box and fires `input` + `change`, exactly like typing: Quick Setup applies it on Build / Update, Wire commits it through the
  `data-tb` listener (lights Save; no Undo step, like every Project Info field). Keys: `_lbCalKeys` is a window capture listener
  registered BEFORE the 16ks Escape listener and `_dlgKeyGuard`, so the calendar keeps its own keys over Quick Setup; `#lb-cal` is
  the FIRST entry of `_lbEscTop`. The Show Type box is `showMeta.format` under a new label (no migration). Excel cover:
  `_xlsxCoverInfo` prints a blank Show Dates as "CREATED <date>" and D15 as "SHOW TYPE: <format>". The three examples carry their
  date in `showMeta.dates`, `showDate` empty (the `site/packets` files still have the old form).
  16kv-fix: Cmd / Ctrl keys pressed in the calendar stop there too (no page shortcut runs behind it; s z y d n are also
  default-prevented, as in `_dlgKeyGuard`). Delete / Backspace on a `.lb-calbtn` stop (it is a Tab stop between Wire's Project
  Info boxes, which stop every key). A mousedown on a blank part of `#lb-cal` is default-prevented, so focus stays in it, and a
  key with focus on `<body>` while it is open puts focus back (`_lbCalFocusActive`). `_lbCalFitHeight` caps its height to the
  room under `_topbarSafeTop()` (a phone held sideways) and it scrolls inside. The whole-box Date Created button
  (`.lb-cal-whole`) applies only under `(pointer: coarse) and (hover: none)`: a narrow mouse window is `is-mobile` too and keeps typing.
- **The Modifiers menu** (AOI Overlays, Blend Zones, Dead Space, Free Position, Fit Canvas) opens from the MODIFIERS button
  on each preset tile only. The status-bar button that also opened it is now a greyed-out **Educator** placeholder
  (`#tb-educator`, disabled) for a future build. The switches are one session-wide view state: not per preset, not in the
  show file, all OFF at every launch (`loadAdvSettings`, a deliberate 2026-06-02 decision).
- **Dead Space feet: 16 PPI by default, 1 foot = 192 px** (owner 2026-09-21: the most common LED tile is 192 px per foot;
  it was 96 PPI / 1152 px). `_PPI`, the `setA11yPPI` fallback, `resetA11y` and the Help text all say 16 / 192. A PPI the
  user stored (`localStorage lookbook_a11y_settings`, `s.ppi`) is KEPT by `_loadPPI`: never migrate it. The left / right
  read-out drawn by `_rcDeadVis` STACKS (PX over FT) only when the gap is narrower than the one-line read-out: on screen that
  is a fixed 132 px (144 with the large-gap mark), printed it is text (44 px + 6 px a character; the Look Book passes
  `_print`). The Advanced zoom is a CSS scale of the whole tile, so zooming never changes the choice. Inline styles only:
  CSS rules with `dead-` in the selector are copied into every exported Look Book. Top / bottom gaps are left as they were.
- **Before building anything the owner recommends, check it against the rules already in place** (this section, the
  manual, the build log) and TELL HIM FIRST when it would break one or change something that was put in on purpose
  (example: the arrow-key resize of a destination was an accessibility feature added 2026-06-01, not an accident).
- **The narrow preset header (round 16kt, owner rule 2026-09-22).** When the TILE cannot give the layer strip the width it
  asks for (`--lsw`, written on `.lb-lslot` by `_lsStripHTML`), `_lbnSync` walks the header down the owner's ladder with four
  cumulative classes on `.preset-row`: `lbn-s1` the MODIFIERS button drops its word (the app's own icon-only state —
  `font-size:0`, 9 px side padding — which also has to lift the 150 px floor `.del-btn[onclick*="toggleAdvancedMenu"]` pins on
  it), `lbn-s2` pins Notes and the preset name at half (90 px and 79 px — on the Advanced page Notes may already be under 180 px before this, because the app's own `flex:0 1000 auto` lets it slide 180→90 there), `lbn-s3` Notes goes, `lbn-s4` the name goes. `.p-code`
  and the strip are never hidden and never shrunk; past step 4 the strip scrolls inside itself as before. `_lbnSync` resets
  every row to step 0 and walks UP, so the step is a pure function of the tile's width and the layer count — no hysteresis, the
  same width always gives the same answer going down and coming back up. It measures with `body.lbn-measuring` on, which takes `transition` off `.preset-header` and everything inside it for the length of the pass — without that it reads back widths that are still animating (`.p-name` is `transition:all .15s`, `.del-btn` `.18s`), which made the first cut of this change climb a rung further than it needed and give a different answer at the same width after an ordinary edit. Rungs 0 and 1 add nothing at all to the Notes box, so rung 0 is the header the build drew before the ladder existed. It runs from `renderCanvas` and `renderFullscreen`
  (same frame, before paint) and from a ResizeObserver on `#canvas-area` and `#fs-viewport` — both sized by the window and the
  side panels, NEVER by their contents, which is what stops the observer feeding itself. NOT a container query: the step
  depends on `--lsw`, which is the layer count (146 px at 4 layers, 382 at 12, 958 at 30, 1278 at 40, measured on the General Session example), and a `@container` condition
  cannot read a custom property. All lengths read are LAYOUT lengths, so the Advanced page's zoom (a transform on `#fs-world`)
  magnifies the tile without moving the ladder, and the narrower Advanced tile steps down sooner than Simple on its own.
  Note `#fs-canvas` is shrink-to-fit, so once the tile is narrow enough for the HEADER's own
  max-content to be what sizes the row, the rung changes the tile's width too: measured at 1440 the header is 826 px at
  every rung, at 1340 it is 779 px at rung 0 and 726 px from rung 1 on, and at 1260 it is 779 / 687 / 660 / 660 / 660
  px at rungs 0-4 (the 660 floor is `renderFullscreen`'s `tileW = max(640, fs-viewport.clientWidth - 52)` plus the
  tile's padding). `fsFitScreen` then re-fits. On Simple the row is min-width driven and does not move at all.
  The patch is CSS + `_lbnSync` only — `_rcPresetRow` is byte-for-byte unchanged, so no export or preset card can drift.
- **The layer strip and its ghost view (round 16ks, owner decision 10).** Every preset header (`_rcPresetRow`, so Simple and the Advanced tile)
  carries one pill between Notes and Actions: BG, L1 … Ln (`getLayerNums`, the table's L columns) for the destination picked in THAT preset
  (`_lsPicked`: `selLayer`, else an open `#layer-panel`, else `sel`). Amber = assigned, grey = empty, slow pulse = the box the user is on. A filled Ln
  calls `layerChipClick` (never a second selection path), BG picks the destination itself (the first-click branch of `screenClick`, never the
  toggle), an empty Ln goes through `_homeOpenDropdown`. `_lsGhost` ({pid,sid,n}) is EDITOR-ONLY view state: layers above n get the class
  `lb-ghost` (15 %, click-through) on the live DOM of `#canvas-area` / `#fs-canvas` only, put there after every redraw by a MutationObserver. It is
  never emitted by `_rcChip`, so the Look Book, the preset cards, the phone picture and the Display clone cannot carry it; it is not in
  `getProjectState`, not an undo step, never marks the show unsaved, never touches a layer's Level. It follows the pick on the same destination and
  ends on another destination, a cleared pick, empty canvas, Escape, or a page change (`_vpSyncTabs`, `_topbarSetActiveView`). A plain canvas pick
  never starts it. The pill lives inside today's flex:1 spacer, absolutely placed, so it can never widen the header or move Actions; it scrolls
  inside itself. Do NOT give it `scrollbar-width:thin`: in Chrome 14x a scrolled scroller with it stops hit-testing its children. The phone gets the
  old empty spacer. `.screen-res` now starts with the top-most displayed layer (`_lsTopTag`: "L3 · 1920x1080", "BG · …", nothing on an empty
  destination); it prints in the Look Book and shows on Display on purpose. There is no layer on / off switch today (`p.active` stays empty);
  `_lsLayerOff` is the one place that would read it.
  Fix round (16ks, after the attack): (1) in `#fs-canvas` only, the header's Notes group shrinks first (180 → 90 px, `flex:0 1000 auto`) and the
  slot asks for `--lsw` (`_lsNeed`); flex-basis is not part of the header's intrinsic width, so the row width and Actions never move. The gate check
  compares the header with and without those rules. (2) `_lsHold`: a click inside the ghost's own `.screen-box` holds the ghost for 500 ms when the
  pick was let go, so the second click and the dblclick of a double-click still pass through the faded layers (Destination Properties for the
  destination; on the Advanced tile the second click on the picked layer reaches that layer, not the full-screen one above). Any key, a click
  elsewhere and `_lsGhostEnd` drop the hold. An open `#screen-panel` counts in `_lsPicked` (last, after `sel`). (3) `_lsWheel` only takes the wheel
  while the pill can scroll that way; on `#fs-canvas` it always takes it (the viewport would zoom). (4) the pulse (`on` in `_lsState`) follows an
  open `#layer-panel` on the same destination. (5) a ghost that has faded something (`had`) ends when the destination has no layer left
  (`_lsAnyLayer`): Reset window › Reset Layers.
- The BG is a layer: `selLayer.n === 0` everywhere; its media, look and crop live in `layerMedia[sid][0]`.
- A layer window is the picture: Size (px) and Scale (% of the cropped source) are one thing; the aspect lock
  (`_lfxLock`, default on) keeps the shape; unlocked = stretch. No push-in zoom; a push-in is a tighter source crop.
- Router tile = video hub: `outputs[o].assignedInput` is the matrix; the routed input's name and ID follow through
  the output to the next device. Switcher tiles have `#·Source·ID` per side; ID = the output point (PRIMARY, OUT 2, BKP).
- A source rename runs through `_sysApplyGlobalRename` and reaches presets, library, Wire pages and thumbnails.
- Clip speed is a menu of fixed steps (`_FS_SPEED_STEPS`: 0, 1.0, 1.25, 1.5, 2.0, 3.0), stored as a percentage in
  `layerMedia.speed`; 0 is a real value (still frame), so never write `speed||100`. `_fsRateOf(lm)` is the one place a
  stored speed becomes a playback rate. An older show's odd value stays listed until it is changed.
- Wire cables are always orthogonal; there is no style choice anywhere, including the Look Book export window.
- No accidental overlaps (owner rule, 2026-09-21): a destination never lands on another one, Simple or Advanced, unless the user came
  through a blend control. Any code that writes a destination position, size or rotation outside a blend control brackets itself with
  `const t=_ovlBegin();` ... `_ovlEnd(t);`. A NEW overlapping pair in any preset is BLOCKED while Blend Zones and Free
  Position are both off (owner, 2026-09-21: "if its off that isnt an option, unless they are in FREE GRID then you need to ask"): the
  pre-action snapshot comes back, no undo step, one alert "Destinations can't overlap". With Free Position on, or Blend Zones on, it
  raises "Create Blend Zone?"; Cancel restores the pre-action snapshot and drops the undo step. The one geometric test is `_overlapPairsForPreset(p)`. Never call the guard on load.
- Preset Reset (owner rule, 2026-09-21): the Reset on a preset header brings THAT preset back to what Quick Setup creates, and asks
  first how far back (Reset All / Destinations / Layers / AUX, all ticked by default; the three lines are disjoint groups of per-preset
  fields, table in CLAUDE.md `_PRESET_RESET_FIELDS`). One undo step for the whole reset; nothing to do = greyed button, no step. It only
  ever writes the one preset: resetting P01 does not reach later presets, and show-wide values (destination size, the name / colour /
  rotation set on P01, AUX name / size, and P01's own `bgNames` / `dsmType` maps, which the app reads show-wide) are never touched; on P01
  the window's sentences say what stays and where to change it. The result is a clean strip, so the no-overlap guard is not involved.
  Destination Properties keeps its own quick "Reset Preset Layout" (strip only, no question).
- THE BOTTOM BAR IS ON EVERY PAGE (owner's decision 6, 2026-09-21), the way the top bar is. `--bottombar-h` (declared on `html`, 28 px; 0 for
  `body.is-mobile`, which has no bar) is the bar's height AND the gap the Advanced page (`#fs-overlay`), Wire (`#wire-overlay`) and I/O Patch
  (`.sys-overlay`) leave at the bottom: `bottom:var(--bottombar-h)`. A new full-page view must do the same. The bar is not positioned, so any
  fixed pop-up near the bottom edge draws OVER it, never behind it. Wire has no bottom strip any more: the Advanced-only I/O Tools button is
  drawn by `_wireRenderStyleBar` into `#wire-io-float` (a sibling of the scroller, outside `#wire-diagram`, so no export sees it); the phone
  keeps `#wire-style-bar-top`. TRAP: the Wire export copies every CSS rule whose selector STARTS with `:root` or `#wire-overlay` into the
  exported sheet and the Look Book, so page-only CSS must not start with either (that is why the variable sits on `html`).
- Undo restores DATA, never VIEW (owner's decision 2026-09-21: Undo / Redo NEVER change Simple / Advanced, open page tabs, zoom, pan,
  tool, folded panes, which page is open). THE ONE LIST of view keys is `_LB_VIEW_KEYS`, next to `_snapshot()`: `wireSettings`
  (wireView, wireStyle, panes, rpanes, panelCollapse, tool, zoom, alignPanelPos), `ioAdvanced` (view, page), `eachPreset` (minimized)
  and `wireSettingsUndoOnly` (sheet: the print sheet size lights Save but has never been an undo step). Three readers, no copies:
  `_dirtyStateString` (through the alias `_LB_DIRTY_VIEW_KEYS`), the undo safety net (`_lbUNStrip`, alias `_LB_UN_VIEW_KEYS`) and
  `_snapshot` / `_lbRestoreData`. A new view setting goes into that list and nowhere else, and a view switch never calls `pushUndo()`.
  The open Wire page tab (`wireAdvanced._activePageId`) cannot be a list entry, because the open page's tiles sit on `wireAdvanced`
  itself: it stays in the snapshot; after a restore the user's own tab is opened again (`_lbWirePageOpen`, the data half of
  `_wireSwitchPage`, run through `_lbNotAChange` so Undo back to the saved show reads clean from any tab), or the tab in front of it when
  that page is gone. `_lbRestoreData` (doUndo / doRedo) reads the view with `_lbViewStateGet()`, writes the data, puts the view back with
  `_lbViewStateApply()`; the `wireSettings` data keys are written IN PLACE in the key order the live object has (keeps the phone's Wire
  override attached, and the saved file reads the same again). Building page 1 on the first switch to Advanced is data, so it is a
  step (Wire: inside `_wireAdvSeedFromSimple`; I/O: `_ioSetViewNow` via `pushUndoFrom`, with `_lbKeepIfLooking()` where `pushUndo` used to run).
- An Undo press never does nothing. ONE rule, no local fixes: a step whose snapshot is the same show as the one on screen
  (`_lbSameShow`: text first, and blind to the open Wire page tab when the two were taken on different tabs) is (a) never stacked on
  an equal one (`pushUndo` / `pushUndoFrom`), (b) dropped once the action has settled (`_lbUndoTidy` -> `_lbDropEmptySteps`, called by
  the undo safety net at the end of every gesture; not while a press is held or a question is open), (c) skipped by `doUndo` /
  `doRedo`, and (d) `_syncUndoButtons` lights a button only when some step differs from the show as it stands. So an action may
  call `pushUndo()` before it knows whether anything will change, PROVIDED the change follows in the same gesture. Work that finishes
  later (a file being read) records its step when it LANDS, straight before the write: `_fsImportFiles` hands `_fsImportOne` a
  one-shot `land()` for that. `pushUndo` remembers the Redo history it clears (`_lbRedoKept`); when its step is dropped as empty and
  nothing else happened, Redo comes back. The x on an empty spare page tab touches no data (`_lbCloseChangesNothing`). Do not count
  steps with `_undoStack.length` deltas around an action that may change nothing.   <!-- 16ks-undo-docs -->
- I/O TOOLS FLOAT, THE RULES (round 16ks fix). `_wireIoFloatReserve()` is the band at the bottom of the drawing area that belongs to the
  button (its height + the 20 px under it + 12 px; 0 when it is not shown: Simple, the phone). `_wireZoomFit` takes it off the height it fits
  into and `_wireScrollToContentCenter` centres in the space above it, so anything that fits a drawing must go through those two. After a Fit
  `_wireIoFloatClearBottom` handles the drawing that is too tall even at the 25 % floor (lowest tile above the button, overflow off the top),
  and the five I/O Tools add functions call `_wireZoomFit(newTileId)` so `_wireIoFloatClearTile` scrolls the new tile into view above the
  button. A NEW add function must pass its id the same way. `_wireIoFloatPlace` centres the button on `_wireVisibleGap()` (between the two
  side panes as they are drawn NOW); one ResizeObserver (`_wireIoFloatWatch`, armed by the first `_wireRender`) keeps it there. It sets an
  inline `left`, no CSS rule, so nothing reaches an export.
- `--toolbar-h` FOLLOWS THE TOOLBAR (round 16ks fix). When `resize` fires the toolbar is still wrapped the old way and settles a frame later,
  so one measurement in the resize listener left the variable stale (Wire / I/O Patch / the Advanced page started 66 px too low after 1440 to
  1100). `_lbToolbarWatch` (a ResizeObserver on `#toolbar`, armed on load) calls `_topbarMeasureHeight` whenever the height changes; the resize
  listener also measures again on the next two frames and after 300 ms. Never cache the toolbar height anywhere else.
- WAYFINDING ON THE ADVANCED PAGE (owner decision 19, round 16kt, patch marker `16kt-way`). Four rules, in the `_way*` block in front of
  `fsSwitchPreset`. (1) Every route to + Preset goes through `actions.addPreset()`, which calls `_wayAfterAdd()` when a preset
  was really added: with the Advanced page open the new preset is OPENED there (`fsSwitchPreset`, so `fsFitScreen` centres it)
  and `_wayCardIntoView` scrolls its card into the list by that list's own `scrollTop` (never `scrollIntoView`, which also
  scrolls the Simple canvas behind the page). (2) From Wire or I/O Patch it draws `_wayNote('P06 added')`, the only toast the
  app has: ONE body-level pill, `pointer-events:none`, never focused, removed by its own Web Animation. Keep it at body level
  and out of `#canvas-area`, `#fs-canvas` and `#wire-diagram`, or an export will pick it up. (3) 1 to 9 pick a preset: Simple
  scrolls to it, Advanced opens it (`_wayPresetKey`, called inside the Advanced key handler's own text-box guard). Simple's
  branch stands down while `fsPresetId` is set, so one key is one action. (4) The crumb trail and the ◀ Preset button are
  pinned by ONE sticky rule on `#fs-toolbar>.fs-crumb` (desktop only); its side margins and flat shadow cover the scroller's
  10 px padding, because a sticky box stops at the scroller's content box. None of the four writes show data, pushes an undo
  step or lights Save: which preset is open is view state.
- A new router / switcher is placed by `_wireAdvFreeSpot` (never on another tile); a tile that grows pushes the tiles
  stacked under it down (`_wireAdvPushBelow`).
- THE NAME: the product is "AV Look Book". The page's `<title>` and every `document.title` still end in
  " — Look Book Builder" ON PURPOSE: installed desktop shells strip that exact ending to name a show in Recents
  (`electron/main.js`, `page-title-updated`) and Mac shells cannot self-update. Do not change the ending until a shell
  that accepts both has been out long enough. The file name `lookbook_builder.html` is load-bearing too (content
  updater URL, release workflow, `copy-html`).
- THE WORD "ADVANCED": on screen it means ONLY the Simple / Advanced switch (Video Presets, Wire, I/O Patch, Layer panel).
  The gear menu on a preset tile is **Modifiers** (renamed 2026-09-21; the status-bar copy of it became the greyed-out Educator placeholder the same day). Code names keep `adv` on
  purpose: `toggleAdvancedMenu`, `closeAdvancedMenu`, `actions.advancedMenu`, `toggleAdvFeature`, `#adv-menu`, `#tb-adv`,
  `.adv-item`, `data-adv`, `adv-hide-*`, `adv-free-position`, `lookbook_adv_settings`. The four switches are body classes:
  one state for every preset, per computer session (cleared on every page load and on New Show), never in the show file,
  no undo step. Fit Canvas is the only item that edits the show (one undo step; tile = that preset, Advanced page = the
  open preset, status bar = every preset).
- Exports list the BG like a layer (`BG: name (detail)`); a BG whose picture is a library clip resolves to that clip.
- I/O PATCH NOTES ARE PER ROW (owner decision 30, 2026-09-22). A source row shows and edits `sources[].notes` (`_sysGetSourceMeta` /
  `_sysSetSourceMeta`), a destination row `screens[].notes`, an AUX row `dsms[].notes`, in the Simple patch, the Video I-O Excel tab and
  the Look Book's Sources page alike (Advanced page 1 always held the source's own note). The old rule that a source which is a BG
  somewhere shows and writes the first BG destination's note is retired: LOGO's note rewrote all three LED walls. Never route a
  source's note through `_sysFindBGAssignments` again; that helper stays for Add Source's automatic BG placement only.
- **I/O Patch small rules (decision 33, 2026-09-22, build 16kt).** (1) The multiviewer row on the Simple patch is a name box
  (`_sysRowHtml`, kind `mv`, same branch as `dest` / `aux`): its rename goes through the shared blur handler -> `pushUndo` ->
  `_sysSetMeta('mv',id,'name')` -> `_lbRenamedDest` (Advanced page 1 + Wire follow in the same step). (2) "Set for all" > Type >
  "Custom..." never turns every row into an empty box: `_sysAllCustomAsk` swaps the Set-for-all chip for ONE inline
  `.sys-type-input` (kind `src-all` / `dst-all` / `adv*-all`), `_sysAllCustomCommit` (the type-box blur handler) feeds the typed
  name to `_sysApplyToAll` / `_ioAdvApplyToAll` as `{value:'Custom',customName}` (one undo step) and remembers it; empty or
  Escape = the kept chip goes back in place (`_sysAllCustomBack`), nothing written, no redraw; a commit writes the data first
  and redraws through `_sysRenderAfterPress` (at once from the keyboard; after the press that took the focus when a pointer
  is down, so the click that left the box still lands: the Advanced toggle, a row's chip, a name box). A rename follows its
  own kind: `_lbRenamedDest(old,new,kind)` -> `_ioAdvRenameTwin('mv' | 'dest')` (`_ioAdvTwinRows`: 'mv' = page-1 mvs, 'dest'
  = page-1 dests, 'dst' = both, kept for the Delete paths); the name menu's "Used in this show" lists destination names for
  a destination and multiviewer names for a multiviewer (`_sysBuildDstNameOptions(kind)`). Reset on a row whose connector /
  resolution / note are already empty changes nothing (`_sysRowResetNeeded`): no write, no unsaved mark, no undo step.
  (3) The Custom Resolution window (`_sysOpenCustomResModal`, every caller) gates Save
  with `_sysCfGate(w,h)` from `recalc()`: Save disabled + `#sys-cf-hint` while Width or Height is blank or 0. No `alert()` in
  I/O Patch windows; the one left in the page is the Excel export failure.
- **I/O Patch Simple is a CARD GRID** (owner, 2026-09-27, build 16ky; search `16ky-iogrid`; his pictures: Blackmagic Videohub
  next to his mock-ups). `_sysRender` draws it last (`_iogRender()` into `#io-grid`, before the phone hook); the old table code above it
  in `_sysRender` still runs and draws nothing (its containers `#sys-src-rows` / `#sys-dst-rows` / `#sys-mv-zone` are gone). Four
  sections (src, dst = screens + ioDests, aux = dsms, mv), each opening with an add card (since 16la-wire-mv the add cards END
  a section and complete its last row, see that entry; `.fs-src.fs-src-add.iog-add`, the Video
  Presets Advanced add card) -> `_iogAdd` = the old Add buttons (`_sysAddSource`, `_sysAddDestination` (since 16ky-r2b ALWAYS
  the Globally path: `_iogAdd('dst')` sets `_sysScope.dst` to global around it and puts it back; no `#sys-scope-dst` in the grid), `_sysAddAUX`, `_sysAddMV`; the two without an undo step are wrapped in `_sysWithUndo`). A card is Wire's
  side-panel card: the same classes and Wire's own functions for the picture (`_wireUploadThumbnail`, keys src: / dst: / dsm: only:
  the loader rewrites any other prefix, so a multiviewer or I/O-only card takes no picture), the colour row and the Cable Type button
  (`_wireCableBtnHTML` WITHOUT data-wire-origin, so a pick is the I/O Patch's own: `_sysWithUndo`, `_sysConnAsk`). Wire's card CSS
  reaches the grid through `_iogCloneWireCss` (a run-time copy of every `#wire-overlay .wire-<card part>` rule for `#io-grid`, into
  `<style id="iog-wire-css">`): NEVER add `#io-grid` parts to `#wire-overlay` rules or `:root` rules by hand, and keep
  blend / overlap / dead- / aoi / screen- / chip- names out of the grid's selectors (the Wire export and the Look Book copy those).
  The Simple table's controls sit on the card with their old classes and data-sys-* (`.sys-name-input` + `.sys-name-chev`,
  `.sys-icon-btn` reset / delete, `.sys-warn-pill`; since 16ky-r2 NO Type chip and NO `.sys-notes-input` on a card, see below), so every delegated handler and setter is
  the one the table used and page 1 follows as before. The S0 / D0 bar is `.iog-all.sys-row-global` (`_sysAllCustomAsk` looks for
  that class). A Wire card function ends in `_wireRender()`: its first line calls `_iogAfterWire()`, which redraws the grid on the
  next tick when Wire is closed and the I/O Patch is open. `_iogRender` keeps the focus (the same control of the same card, the text
  being typed; the box the focus was moving INTO gets its text selected, as a Tab leaves it, like the table's `_sysRefocusTwin`)
  and waits for a press that started inside the grid (`_sysRenderAfterPress`). The grid's Help sentences sit in I/O Patch › What it
  is: keep I/O Patch › Edit a row short (a flows check reads its first 900 characters). Menus opened from the grid take the
  Wire card's compact look (`wire-fit`) and walk with the keys (the capture keydown listener beside `_iogRender`). Advanced rows:
  `_sysRowHtml({mini})` draws `_iogMiniFor(kind,row,num)` (the item's colour or picture by NAME, the number under it) in place of
  the badge. REBASE NOTE (16kx backdrop): a kind of destination that must stay out of the grid is filtered in `_iogDests()` only.
  The flows probe reads a Simple "row" as the card (`ioSimRows` / `ioSimAll` / `ioSimIn` / `ioSimCell`, marked `16ky-iogrid:
  ADAPTED`): the checks keep their names and pass on the table too.
- **I/O Patch Simple cards: name, resolution, cable type only** (owner, 2026-09-27, build 16ky-r2; search `16ky-r2`). "this should
  stay simple just name resolution and cable type": `_iogCardHTML` draws no Type and no notes (`_iogTypeHTML` is gone) and the
  S0 / D0 bars (`_iogAllHTML`) hold Connector and Resolution only. Type and Notes are edited on the Advanced pages only (their table,
  Set-for-all rows, data, undo and the exports are untouched). NEVER clear or rewrite a stored Type or note because Simple does not
  show it. A screen becomes a Backdrop (16kx) from the Advanced Type column or Quick Setup, never from a Simple card. The flows
  checks that set or read a Type or a note on a Simple row do it on the item's Advanced page-1 row (`r2Adv` / `r2Row` / `r2P1` /
  `r2Drawn`, marked `16ky-r2: ADAPTED`); names and expectations kept.
- **I/O Patch Simple titles: own Set for all, Remove, the multiviewer picture** (owner, 2026-09-27, build 16ky-r2b; search
  `16ky-r2b`). + Add destination always adds a real destination (no Globally / Only Here switch; `_iogScopeHTML` is gone; `_sysSetScope`,
  `_sysUpdateScopePill` and the Only Here branches of `_sysAddDestination` and of the source rename / remove are kept on purpose
  although nothing sets `_sysScope` to 'local' any more, 16ky-r4fix: remove them together if the switch never comes back); + Add
  source stays I/O-only (16jh). Every section title ends with − Remove (`_iogRmHTML`): Destinations' is `_iogRmDest()` =
  `_sysOpenRemoveDestModal('dst')` (the same window, filtered: `_iogDests()` destinations + I/O-only, never AUX; called without
  an argument it lists what it always listed), AUX / DSM's is `_sysOpenRemoveAUXModal`. Every section has its own Set for all
  bar (`_IOG_ALL`: S0 src-all, D0 dst-all, A0 aux-all, M0 mv-all), Connector + Resolution only; D0 NO LONGER reaches the
  AUX / DSM outputs (the dsms line of `_sysApplyToAll`'s apply is gone); A0 / M0 go through `_iogApplyOut`, which writes each
  card with `_sysSetMeta` (the setter of a card's own pick), inside `_sysApplyToAll`'s one undo step. The multiviewer picture is
  `_IOG_MV_PIC` (Omar's 12_mv.png, area-averaged to 224 x 126, a PNG data URI): the Simple multiviewer card (`c.fixedPic`, no
  MV tag, no upload) and every Advanced multiviewer row's mini (`_iogMiniFor`), fitted with object-fit:contain on black. NEVER
  give it to another kind, and keep it out of the Look Book, the Wire sheets and the phone (since 16la-wire-mv it is picture 1
  of `_IOG_MV_PICS`, see that entry). Any list of destinations the grid
  builds goes through `_iogDests()` (16kx: a backdrop never shows). Flows checks: 16ky C and "Connector 16kw: Set for all ›
  Connector › Custom…" are RENAMED in place (their old expectations were the switch and D0 reaching AUX); two checks are
  `16ky-r2b: ADAPTED` (names and expectations kept).
- **I/O Patch Advanced page 1: a Type or note of a show item IS the item's own** (owner, 2026-09-27 ~21:40, build 16ky-r3;
  search `16ky-r3`). "Yes, page 1 sets it". `_ioP1Map(pg)` maps each page-1 row page 1 COPIED from the show (`fromShow`, not
  `gone`) to its item, by its own place among the rows of its name (screens without backdrops, `dsms`, non-`fromAdv` `ioDests`:
  the order page 1 is built in, 16kx-r2fix's rule; sources by name, a `fromAdv` source excluded; a row with a 16kt twin excluded).
  Page 1 -> item: `_ioP1ToShow(row, fields)` writes `type` / `deviceType` / `customType` / `notes` inside `_ioAdvTwinWrite` (page
  1's `seedAsked` moves along, so no "Simple changed" question), called by the Advanced row setter (`_sysSetMetaNow`, adv
  kinds), the Advanced Reset (the note) and `_ioAdvApplyToAll` (Type), in the edit's own undo step; a destination's note
  redraws the Video Presets table. Item -> page 1: `_ioP1Follow(pg)` at the end of `_ioAdvFollowShow` (every I/O Patch draw
  and the I/O Excel export), `_lbNotAChange` + `_ioAdvNetRebase` like the ghost rows: the SHOW'S value wins (an older file
  prints nothing new in the Look Book or the Video I-O tab; measured: 0 disagreeing rows in ORGILL and the three examples).
  Hand-typed page-1 rows keep the 16kt / 16ji twin rules; pages 2+ are untouched (`_ioP1Map` holds page-1 rows only; a copied
  page's rows are other objects with the same ids). (I) `_bdTypeOpts` also offers Backdrop when the trigger is `adv-dst` and
  `_ioP1Screen(id)` finds a real screen (page 1 open, the row maps to a non-backdrop screen); `_sysHandlePickCore`'s adv branch
  sends that pick to `_bdAskMake(screen.id)` and NEVER writes 'Backdrop' as a row's Type. (G) Reset on a Simple card
  (`_sysRowReset` src / dest / aux / mv, `_sysRowResetNeeded`, the iodest branch) clears the connector and a source's
  resolution only; its window says exactly that. (H) the MV delete window names + Add multiviewer. The grid numbers a
  destination card by `_bdNo(s)` (16kx-r3: without the backdrops), as the Video I-O tab and the phone do. Flows
  checks: the 16kx checks that made a backdrop from a Simple row's Type menu (`_bxMk`, `_bxRow`, `_bxTypeMenu`) go through
  page 1 (marked `16ky-r3: ADAPTED`); the checks whose expectation Omar's answers changed are renamed in place.
- **I/O Patch menus: Custom first, Clear second** (owner, 2026-09-25, build 16kw; search `16kw-menus`). Every menu with a Custom
  entry AND a Clear entry reads Custom… first, — Clear — second, then its helper rows (Paste, Used in this show, the typed names)
  and the built-in list in its order. This REPLACES the 2026-09-14 "destructive items last" menu rule for Clear. Covered:
  Connector (`_sysConnOptions`, gained Custom…), Type (`_sysTypeOptions`, gained — Clear —: value '' through the ordinary
  pick path, so type / deviceType and customType are emptied in one undo step and the page-1 / Simple twin follows),
  Resolution (`_sysBuildResOptions`), on every row, the Set-for-all rows, the Advanced pages and the phone cards (all open
  through `_sysOpenDropdown`); `openSharedResPicker` puts its optional includeClear row second (the phone's I/O cards ask
  for it through `mbIoOpenRes`, 16kw-fix, which also marks a source card's own size). Left as they were, a question for the owner: menus with only one of the two (the name pickers' "Type your own
  name…", the shared picker where it has no Clear (Quick Setup, the Wire cards, the phone's Video Presets sheets), the Advanced layer Source "— none —",
  Wire's Custom router / switcher menu). A typed connector is stored as typed in `connectorType` (v0.4.0 reads it as plain
  text: a grey "empty"-looking pill, printed in the Excel, "Cable Type" on its Wire card), remembered in
  `customTypes.connectors` (created only when a name is remembered, never on read: a look must not light Save) and offered
  from that list plus every row's typed connector (`_sysInUseConns`). `_sysConnBuiltIn` maps a built-in's value or label
  in any spelling (case, spaces, - _ . / ( )) to the built-in value. `_sysConnAsk` swaps the pill for a `.sys-conn-ask`
  box (`data-sys-field="custom-conn"`; the delegated type-box blur handler skips it); `_sysConnCommit` writes through
  `_sysConnWrite` (the pick path's setters without its redraw) inside `_sysWithUndo`, then `_sysRenderAfterPress`, so the
  click that left the box still lands. `_sysClassifyConnector` returns 'custom' for any text that is not a built-in connector in
  some spelling (`_sysConnKnown`, 16kw-fix: a typed "Cat6 tactical" or "opticalCON fibre" is grey too): `.sys-pill.custom` is white; `_wireCableSpec` returns
  `_WIRE_CABLE_CUSTOM` (#9ca3af, solid, "Custom · no colour code"); the grey arrowhead `wire-arrow-custom` joins the SVG
  defs only while a typed connector is in the show (`_wireCustomConnInUse`), so every other drawing and Look Book is byte for
  byte as before; the drawing sheet's key prints "no colour code" on such a row; typed connectors sort after the built-in
  ones in the key. Wire's Cable Type menus (`data-wire-origin="1"`) kept `_SYS_CONNECTORS` until 16kw-r2 (below).
  **16kw-fix** (search `16kw-fix`): these I/O Patch menus open, when neither side of the header has room, on the larger side
  shortened to fit (`_sysMenuFitRoom`) instead of the `_menuPlace` fallback that covered the header. The connector box gives the focus
  back to the box it went to once its redraw is done (`_sysRefocusTwin`, through `_sysRenderAfterPress(after)`). A long typed
  name fits its key row: `_wireKeyFitLabel` on the printed sheet (smaller, then "…"), the Wire export key's words moved right
  of it, an ellipsis in the in-app key. On the phone a Type menu's grey note wraps beside its label (`:has(+ .item-meta)`).
  **16kw-r2** (owner, 2026-09-26; search `16kw-r2`). (1) Every menu opens at its TOP: `_sysMenuShowCurrent` and its call in
  `_sysOpenDropdown` are gone (the current value stays marked; a low one is a scroll down). `_sysMenuFitRoom` is placement,
  not scrolling, and stays. (2) Wire's Cable Type menus (cards `src` / `dest` / `aux`, custom cards `wcustom` / `wcustomd` /
  `wcustomm`, output points `wsp`, converter and switch ports `wdev`) open `_sysConnOptions()`: Custom…, — Clear —, the typed
  names, the list. Custom… there calls `_wireConnAsk`: a `.wire-conn-ask` box in the button's place, sized from it (no type
  attribute, so `_wireAdvTabKeep` leaves its Tab alone). `_wireConnCommit` applies the I/O rules (`_sysConnBuiltIn`,
  `_sysRememberConn`, one `_sysWithUndo` step) and `_wireConnWrite` stores it where each object keeps its cable type: the
  show's source / destination / AUX `connectorType` through `_sysConnWrite` (it IS the I/O Patch field; a source's
  `wireColor` follows), a custom card's `connectorType` (a custom source's `wireColor` follows), `portConns[k]` of a source
  tile, `conn` of a device port. The data is written at once; the redraw runs on the next tick through
  `_sysRenderAfterPress(after, redraw)` (scope `#wire-overlay`), which also re-glues an open Cable Type menu and reopens a
  Wire resolution ▼ that the leaving click opened; `_wireFocusSpot` / `_wireRefocusSpot` keep a Tab. In the 90-px
  `wire-fit` menu the CUSTOM… row drops its dot and tightens its caps so it reads whole. (3) An OUTPUT's Resolution ›
  — Clear — (`_sysResClearOff(kind)`: dest, aux, mv, iodest, dst-all, adv-dst, adv-mv, advdst-all, advmv-all) stays second
  with `.sys-dd-item.disabled` (opacity .45 and cursor default, the app's disabled look: 3.7:1 on the menu),
  `aria-disabled`, the title `_SYS_OUT_RES_CLEAR_TIP` ("An output's resolution is its size"), never `.selected`, and a
  click that does nothing (the menu stays open). The menu rows have no keyboard stops, so no key reaches it. The phone's
  sheet gets the same through `openSharedResPicker({clearOff})` from `mbIoOpenRes`. Sources keep a live Clear. Before
  16kw-r2 the multiviewer's Clear and the Advanced page rows' Clear DID empty their resolution; the owner's rule greys
  them too.
  **16kw-r3fix** (2026-09-27; search `16kw-r3fix`). Round-3 fixes, each reproduced first with real input. (a) Answer 4
  in the Details key: `_wireCableKeyHTML` (the on-screen key only) shows a typed connector's name in capitals (an inline
  text-transform; the tooltip keeps the typed spelling, as the Wire card's tooltip does) and merges typed rows without
  regard to capitals (`toLowerCase`, as the menus compare), their sources added up. `_wireCableTypesInUse` and the
  printed / exported key (`_wireLegendSVG`, the sheets) are unchanged: as typed, one row per spelling (a question for
  the owner). (b) Answer 4 on the phone: `.sys-pill.custom .pill-label{text-transform:uppercase}` (the desktop header
  style already uppercases every pill). (c) Answer 1 for a typed Type: a row is not redrawn when its `.sys-type-input`
  commits (the delegated blur handler), so the ▼ beside it kept the previous name in `data-sys-custom`, which
  `_sysOpenDropdown` reads to mark the row; the handler now writes the committed name there. The phone cards' ▼
  (`renderMobileMain`) had no `data-sys-custom` at all (Custom… was always marked) and now carries it. (d) Comments
  only: the greyed Clear's contrast note reads 3.7:1.
- **16kx-backdrop** (owner, 2026-09-27; search `16kx-backdrop`) and **16kx-r2** (his four answers, same day; search `16kx-r2`). A fifth
  destination Type, `deviceType` 'Backdrop' on a `screens[]` entry (in `_SYS_DEVICE_TYPES`), for a scenic piece between the screens that
  takes no video. Stored on the destination: `bdLin` / `bdHin` = Length / Height in whole INCHES (the truth; `_bdIn` rounds to the
  nearest inch, 3" to 500'; `_bdLi` / `_bdHi` also read a round-1 show's `bdL` / `bdH` decimal feet, which the first draw turns into
  inches as a not-an-edit), `bdImg` = ONE picture (a JPEG data URL, longest side 1600 px, quality .85, `_bdImgFromFile`), `bdWas` = the
  Type it had. Shown by `_bdFtIn` as 12' 6" (inches left off at zero) through `_bdSizeTxt` / `_bdLongTxt`; typed through `_bdParse`
  (12' 6", 12'6", 12' 6, 12 6, 12'-6", 12-6, 12', 12, 12.5, 150", 6 1/2", ft / in words, curly marks) in text boxes (`_bdFmtBox`).
  `w` / `h` = inches x `_pxPerFoot()` / 12, kept in step on every draw by `_bdSyncPx` (first line of `syncCanvasSize`,
  `_lbNotAChange` + `_ioAdvNetRebase`). A screen's first size is `_bdHalf(px)`: its pixels to the nearest half foot. Made only by
  Quick Setup's row switch (`_qsBd`, `_bdQsCtl`, `_bdQsToggle` writes BACKDROP into the name box via `_bdQsAutoName` and keeps what the row read in `_bdQsPrev`, so on-then-off before Build / Update gives the name and resolution back, `_bdQsUndoOn`, `_bdQsApply`, the
  question `_bdQsGate` in `confirmQSEdit`; `_bdQsWas` keeps the names the window opened with) and the I/O Patch Type menu of a real
  screen's row on Advanced PAGE 1 (`adv-dst`, `_ioP1Screen`, since 16ky-r3; the phone's `dest` card keeps it) (`_bdTypeOpts`, `_bdAskMake` -> `_bdConvert`: `_bdAutoName` over `_bdTaken`, one undo step). `_bdMake` strips `_BD_KEYS` (BG,
  layers and what they carry, AOI, EDID note, turn) from every preset, resizes (`_sysReflowAfterResize`) and opens the row if it
  overlapped (`_bdUnblend`); `_bdConverted` drops the presets' own names for it and calls `_bdDropAdv`: on every Wire Advanced page
  (`_wireAdvEachPage`) its `adst:` / `adp:` tiles and cables go, the `rop:` output rows that fed them are spliced out
  (`_bdReleaseOut`: later rows move up, wires remapped, `outC` - 1, `_wireAdvRouterRelabel`) only on the show's own switcher (`_bdShowHub`:
  kind switcher, no patch link, titled SWITCHER I/O or with the switcher's name from Wire, its first output rows cabled one each to
  show destination / AUX tiles in the show's order) and on a patch tile; any other router or switcher keeps its rows and the port is emptied in place (`_bdFreeOut`); a patch
  tile's row named after it goes, at its own place among rows of that name; its OWN `fromShow` rows go from the I/O Patch Advanced
  pages (page 1 also unflagged ones; rows match by name, so `_bdIoMine` keeps as many rows of the name as the show still has items
  of it and drops the one at its own place in page 1's build order, `_bdOwnRank`; Edit Show Info does not pass the new name of a
  destination turning into a backdrop to the rows, `_lbRenamedDest` is skipped for it); the open Wire page's parked copy follows
  the page (`_bdParkedFollows`); page 1's `seed` / `seedAsked` of both
  lose its entry (the I/O one at its own place, `_bdSeedAt`) and take the conversion's own source-order change (`_bdSeedDropWire` / `_bdSeedDropIo` with `_bdSrcParts`), so
  neither Advanced asks "Simple changed". `_bdUnmake` gives the Type back and keeps the name (a new destination for I/O and Wire).
  Drawn by `_bdBox` from `_rcScreenBox` (every canvas: Simple, Advanced tile, preset cards, phone, Look Book) with INLINE styles only,
  so the Look Book prints it and no stylesheet rule reaches `_pdfExtractCanvasCss` (its CSS classes are `lbbd-*`, app-only). The
  Canvas size leaves it out (`_bdCanvasReport`); `_bdDrawn` keeps the drawn extent for the canvases (`_bdDrawW` / `_bdDrawH`).
  Refused by the setters (`setL`, `setBgName`, `setPColor`, `setAOI`, `setRotationSmart`, `updateScreenSize`, `fsPanelScreenSize`,
  the layer panel, the colour window, `_fsDropTarget`), no layer strip (`_lsState`), never a blend (`_ovlEnd`, `_bdDragBlocked`).
  Left out with `_bdNoBd(list)` (the SAME array when there is no backdrop): every Wire `screens` read, the I/O Patch rows /
  counts / Excel / Remove list / check / Set for all / phone cards / Look Book I/O page, Outputs and pixels; the I/O Patch numbers were
  the canvas index (D1, D3; 16kx-r2fix), and are `_bdNo` since 16kx-r3 (below). `_bdParse` refuses (null) 12 inches or more after the feet,
  a minus and a size under 3" or over 500'; `_bdAutoName` returns capitals. **16kx-r2fix** (2026-09-27, search `16kx-r2fix`): these
  last points, after three reviews of 16kx-r2.
  Excel: xf 19 (grey text on FFE3E6EA) and 20 (header, white on FF9AA1AB). Destination Properties of a backdrop is `_bdProps`.
  Help: Quick Reference and Glossary rows.
- **16kx-r3** (owner, 2026-09-27 ~23:05, his answers to the backdrop questions; search `16kx-r3`). (J) A backdrop exists ONLY in
  the Video Presets: every destination / port / output count uses `_bdNoBd(screens)` (bottom bar DESTINATIONS, the Look Book cover
  and breakdown header, the Advanced header `fs-subtitle`, the phone's Dest cell, Quick Setup's summary via `_bdQsBdN`, the connectors
  in use `_sysInUseConns`, the I/O pre-export check). (K) NO NUMBER: `_bdNo(s)` = its place among the screens that are not
  backdrops (0 for a backdrop) is THE destination number everywhere: the grid cards, the hidden Simple rows, the Video I-O tab, Remove
  Destination, the Look Book's I/O page, breakdown slot and layer strip, the Advanced list and crumb (a backdrop reads BD), the phone's
  layer rows and I/O cards. Quick Setup's rows use `_bdQsNo(i)` / `_bdQsDef(i)` (labels `#qs-sr-no-i`, default names, refreshed by
  `_bdQsRenum` from `_bdQsRefresh`); a new screen's default name counts `_bdNoBd(screens)` (openModal, `_sysAddDestination`, the
  phone's + DEST). Names already given never change. (L) `_bdDropWirePage` collects the devices that sent the backdrop a cable
  (`_bdDevOf`: `dvi:` / `dvo:` / `device:`) and `_bdDropDevs` removes each one that then sends no cable anywhere, with all its cables,
  pushing the `rop:` outputs that fed it into the same feed list as a direct feed (a device before it is looked at the same way);
  `_bdShowHub` reads a row through converters (`_bdHubEnd`) and a backup input (`_bdHubTile`: `adp:<tile>:<n>` is its tile).
  (M) `_bdMake` keeps `bdWasW` / `bdWasH` (the screen's resolution) unless `o.fresh` (Quick Setup's new rows); `_bdUnmake` and Edit
  Show Info's switch off (`_bdQsToggle`, `qsRefreshAllResBtns`) give it back. (N) `duplicateScreen` names a backdrop's copy
  `_bdAutoName('', _bdTaken(null))`. (O) `_bdAskMake` always asks; `_bdAskText(list)` says it plainly (items carry `nm`, `L`, `H`),
  also in Edit Show Info's `_bdQsGate` (which still asks only when there is content). Flows checks K1 J1 L1 M1 N1 O1 H4, phone S; the
  16kx / 16ky checks whose expectation these answers changed are renamed in place (C, D, I, L, Q5, R1, R7, I1; phone P).
- **16ky-r4fix** (2026-09-28, the fixes after the round-4 attacks; search `16ky-r4fix`). A new or unnamed destination's default
  name is its number or the next free one, NEVER a name the show has: `_r4fDestName(n, taken)`; `_r4fNewDest()` = the count of
  `_bdNoBd(screens)` + 1 against `_bdTaken(null)` (openModal, `_sysAddDestination`, the phone's `mbAddDest`); `_bdQsDef(i)` walks
  Quick Setup's rows in order (the other rows' typed names and an earlier unnamed row's default are taken; a backdrop row defaults
  to the next free BACKDROP; in Edit Show Info the AUX / DSM, I/O-only, multiviewer and preset names are taken too), and
  `qsScreenNameChange` calls `_bdQsRenum` so the placeholders follow a typed name; `_bdQsToggle` switching a row off deletes
  `_qsBd[i]` BEFORE `_bdQsUndoOn`, so the other rows' auto names count it as a screen (the only backdrop left is BACKDROP again,
  16kx-r2fix R1). Quick Setup's screen-reader labels use
  `_r4fQsAria(i)` (destination N by `_bdQsNo`, or backdrop), refreshed by `_bdQsRenum`. Flows checks A1, A2; phone T.
- **16kz-answers** (owner, 2026-09-28 ~10:15, his answers to the questions left after 16ky; search `16kz-answers`). (A) Advanced
  PAGE 1's Destinations table: D0 sets the destination rows only, A0 (`advaux-all`, drawn by `_ioAdvGlobalRowHtml('aux')` just
  above the first AUX / DSM row in `_ioAdvTable`) the AUX / DSM rows; a row is AUX / DSM when `_ioP1Map` maps it to a show `dsms`
  entry (`_kzAdvAuxRows`, page 1 only); `_ioAdvApplyToAll` filters through `_kzAdvRowsFor`; pages 2+ have no A0 (one D0 for every
  row). (B) `_ioAdvOfferResync` also returns when `_kzTypeOnly(seed|seedAsked, now)`: the fingerprints differ ONLY in a Type
  (fields 2 / 3) of items page 1 follows (`_ioP1Map`); anything else, or an item page 1 does not follow, asks as before. (C) an
  output's name: `_kzOutTaken(self)` (every other screen incl. backdrops, AUX / DSM, I/O-only, multiviewer, and the other
  outputs' per-preset `screenName` / `dsmName`; lower case) and `_kzOutRenameBlocked` ("Name in use", the box back) guard the
  I/O name boxes (blur handler, the name ▼ picks, `_sysIoDestRename`, `_kzOutOf` finds the output or the page-1 row's mirrored
  item), the phone's `mbIoSet` / `mbSetDestName` / `mbSetDsmName`, `homeSetScreenName` (the table's Enter now preventDefaults so
  the Enter that commits does not also answer the alert), AUX Properties, and Quick Setup / Edit Show Info (`_kzQsNameCommit` on
  the box's change, `_kzQsGate` in `confirmQS` / `confirmQSEdit`; a row keeping its live name is not a rename). Internal writes
  (`_sysSetMeta`, a file) are NOT guarded: a show with two of a name opens as it is. (D) `_kzAuxName()` = the label + (count + 1)
  or the next free number (addDSM, `_sysAddAUX`, the phone's `mbAddAux`, Quick Setup / Edit Show Info). (E) the Remove Source
  window's number is the card's (`_sysDiscoverSources` index). (F) `_kzLastScreen`: `_bdTypeOpts` gives Backdrop `disabled` +
  `tip` (`_sysOpenDropdown` greys it like the outputs' Resolution Clear; the grid's key walk skips it), `_bdAskMake` refuses,
  `_bdQsToggle` refuses and `_bdQsCtl` / `_bdQsRenum` grey the only screen row's switch; `_kzQsGate` refuses an all-backdrop list
  (Edit Show Info of a show that already has no screen still updates). Deleting the last screen is NOT changed (a question).
  (G) `_kzQsLead()` = the first non-backdrop row: its label is All Destinations (+ the note, `#qs-sr-sd-i`), `qsGetRes`'s default,
  `qsApplyRes`'s cascade and the summary's base follow it; `_bdQsRenum` relabels row 0 too. Flows checks Z1..Z9, phone U V W;
  renamed in place (their expectation changed): R1 Set for all › Custom… (D0 on page 1), R2 the multiviewer rename, R3 Type 16kw
  Clear, R4 16kx-r2fix ONLY ITS OWN rows (opens a show that has two IMAG), R5 16ky-r2b Set for all rows, R6 16ky-r4fix A2.
- **16kz-refresh** (owner, 2026-09-28 ~10:35, his 12 / 13 / R1-R7 and the mirrored-card mockup; search `16kz-refresh`). (H) the
  Advanced page's pills are keyboard buttons (`tabindex=0 role=button aria-haspopup`, `_sysRowHtml` for `adv-*` kinds and
  `_ioAdvGlobalRowHtml`); the grid's capture keydown handler (open / walk / pick) now also serves `#io-adv`; `_ioRenderAdvanced`
  keeps the focus across its innerHTML (`_kfSpot` / `_kfRefocus`, plus a capture blur listener `_kfBlurTo` for a redraw made
  inside a blur, the Rows box). The backup button carries `data-sys-kind/id` so it finds its twin. (I) `_wireAutoThumbHTML(name,
  colour, nf)` with `nf` (the card's upload mark / badge) lays the name out with `_nfFit` (canvas `measureText` in the page's
  own font): lines break at spaces only (one inline nowrap span a line, `<br>` between), a word too long for its line shrinks
  (13 px down to 8 px), a word too long even then breaks after its hyphens or ends in …, more than two lines end in …; the
  first line moves below the upload mark (2 px of air) and the size drops when that would reach the badge. Inline styles only
  (the picture's CSS styles every inner span: each line span repeats display:inline and the size). Not on the phone (a wider
  picture there); the Advanced mini picture uses `_nfMini`. (J) `refresh` (the number's text) on sources / screens / dsms /
  ioDests / multiviewers and on Advanced rows: `_rfOptions` (Custom…, — Clear —, `_RF_LIST`), `_rfAsk` / `_rfCommit` (the box
  in place, `_rfParse`: a positive number, up to 3 decimals, else "Not a refresh rate"), `_rfWrite`; `_ioP1Fields` has
  `refresh` (page 1's rate of a show item is the item's own, both ways, like Type and notes); `_ioAdvApplyToAll`, the twin
  functions, `_ioAdvRowUsed`, `_ioAdvRowFrom` and the Advanced Reset know it; the rate is NOT in `_ioSimpleFingerprint`. The
  Advanced grid is 10 columns (`#sys-overlay.io-advanced #io-adv .sys-row`), Refresh between Resolution and the warn pill. The
  I/O Excel: a Refresh column after Resolution on the Video I-O tab and every page tab (`_rfNum`: a number), the page tabs
  get their own column widths. The Look Book's I/O pages: `_rfLb` (only when set, so the snapshots are unchanged). The phone's
  cards: `_rfPillHTML(...,mb)` beside Resolution (44 px). R5: the Advanced Notes cell is the same `.sys-notes-input`, now
  `readonly` + `.io-note-cell` (so the checks that set its value still work); a click / Enter / Space opens `.io-note-pop`
  (`_nwOpen`, a textarea placed under the cell, `_nwCommit` one undo step when changed, `_nwCancel`, in `_lbEscTop`). R7:
  `_sysOverCable(conn,res,hz)`: with a rate `_rfOver` compares w × h × Hz with `_RF_CAP` (the refresh each cap assumes), with
  none the old pixel rule, unchanged. (K) `_iogCardHTML` and Wire's `_wireDestCardHTML_panel` / `_wireDsmCardHTML_panel` /
  custom destination and AUX cards write the info column BEFORE the thumb column for outputs (`_kmSwap`, class `iog-mirror` /
  `lbm-mirror`), `_wireNodeColorRowHTML(...,mirror)` puts the shuffle first; `_kmOn()` is false on the phone; the + Add cards of the
  output sections are NOT (16kz-fix, the owner's correction of 2026-09-28 22:00: `_iogAddHTML` as before, no `iog-add-mirror`). (L) (owner ~18:50, "all
  recommended"): `_kzDelRefused` (the only screen, `_kzLastScreen`) in `deleteScreen`, `_sysRowDelete('dest')` and `mbRemoveDest`;
  `_kzQsCountRefused` in `qsAdjust` (the rows left all backdrops); `_kzStepNoScreen` in `doUndo` / `doRedo` (a step with no screen
  while the show has one: refused, the stacks untouched); `_kzAddNameRefused` in `confirmScreen` (ADD › Destination, `_kzOutTaken`);
  `_kzWireNameRefused` in `_wireAdvSetCustomField` (a hand-made destination / AUX card renamed into a show output's name) and
  `_kzWireNewName` for a new hand-made card (today's numbering, then past show output names). Flows checks Y1..Y16, phone X1 / X2;
  renamed in place Q1..Q8 (Q8: 16kz-answers' (F) check, the count is refused at the −).
- **16kz-fix** (the fixer's round after the two attacks on 16kz-refresh, 2026-09-29; search `16kz-fix`). (K) the owner's
  correction of 22:00: `_iogAddHTML` is the pre-16kz-refresh markup again (+ box first) and the `iog-add-mirror` rule is gone;
  only the output cards are mirrored. (J R4) `_ioAdvSyncPage1ToSimple` copies `refresh` to a page-1-made source (`fromAdv`
  twin) with the other four fields; `_rfWrite('src',…)` writes a `fromAdv` source's page-1 row too (`_kxSrcRowRf`), so the
  phone's rate survives the next Advanced draw (the other fields keep the 16ji rule: page 1 wins). (J R1) the Advanced
  grid's variable columns are `minmax()` (>1100 px: 130-180 / 124-170 ×3 / 90-120, Notes `minmax(70px,1fr)`; ≤1100 px:
  112-150 / 108-150 ×3 / 84-110, Notes 64): the free space fills them first (grid "maximize tracks"), so from ~1250 px the
  widths equal 16kz-refresh's and at 1024 px every column fits. (I) `_nfFit`: the largest size at which the whole name fits
  two lines; else the largest at which line 2 ends in … after a whole word (`cut2`); `_nfMini`'s smallest size is 3 px.
  (R6) the phone's Resolution field wraps its two boxes in `.mb-io-rescol` (flex-wrap; the resolution box `flex:1 0 auto`,
  never below its text; Refresh `flex:1 0 104px`). (R5) `_nwFit` sizes the note box to the note (room above / below its
  cell) on open and on input; Enter with Shift saves; a line break in the box becomes a space. (H) `_rfCommit`'s refusal
  alert gives the focus back to the Refresh pill on OK / Escape (`onConfirm` / `onCancel`). Flows checks N1..N6, phone M1;
  renamed in place P1 (the + Add cards: Y13 turned around).
- **16la-wire-mv** (owner, 2026-09-29, after testing 16kz; search `16la-wire-mv`). (M) "the Wire still show the Destination the
  older way": in the Wire drawing a destination / AUX tile draws its picture at its RIGHT end and its name on the left. Simple:
  the node code of `_wireRenderDiagram` AND its copy in `_wireBuildExportSvg` (the Wire sheets and the Look Book's Simple Wire
  page) put the picture at x + w - 48 for `destination` / `dsm` (`_laOut`), the name stays at x + 12; a node without a picture
  is unchanged. Advanced: `_wireAdvGenericTileHTML` (only ever an OUTPUT tile: the show's destination / AUX and the hand-made
  ones) writes the info column first and the 110 x 62 slot after it; `_wireAdvThumbSvg(x,y,thumb,name,colour,w)` draws the
  native picture at x + w - 123 when w is given (the destination / AUX call passes p.w; the source call does not). The export
  clones the live drawing, so it follows. No CSS: the export copies only `:root` / `#wire-overlay` rules, the markup order
  carries the layout. Ports, cable ends, hit areas, drag (`_wireStartNodeDrag` keeps each part's offset), sizes, the phone's
  Simple drawing (it is the same drawing: a picture uploaded on the phone shows on the right too) follow by themselves. I/O-only
  destinations have no Wire tile. (N) four multiviewer pictures: `_IOG_MV_PICS` = [`_IOG_MV_PIC`, Omar's mv2 / mv3 / mv4.png,
  PIL BOX to 224 x 126, PNG, optimize: the recipe that reproduces picture 1 byte for byte]. `mvPic` (1-4) on each multiviewer:
  `_mvPicNo` reads it (anything else = none), `_mvPicRandom` (Math.random; it reads no const, the launch line runs early),
  `_mvPicSrc` (none shows picture 1). EVERY place that makes a multiviewer object writes `mvPic:_mvPicRandom()` (`_sysAddMV`,
  `_sysRender`'s put-back MV 1, the MV 1 of `_applyProjectText` for a file without one, `newShow`, the launch): a new place
  must too. `_mvPicFill` gives a random one to each multiviewer without one: in `_applyProjectText` AFTER `_captureCleanBaseline`
  (then `_recomputeDirty`: an older show reads as changed, Save lit, no undo step; the owner: "Give them a random one"), in
  the draft restore (the same) and in `_lbRestoreData` (a step without one). The three examples in `_LB_EXAMPLES` CARRY
  `"mvPic"` (drawn at random once for this build: 3 / 1 / 3), so an example opens clean (no "Leave site?") and draws no random
  number; the example PACKET files in site/packets are older saves and open as changed. The Simple card's picture is a
  button (`_mvPicThumbOpen`, `.iog-mv-cycle`): `_mvPicCycle(id)` = `_sysWithUndo(_sysSetMeta('mv',id,'mvPic',next))`,
  1 -> 2 -> 3 -> 4 -> 1, then `_sysRender` (the grid gives the focus back); Enter / Space come through the grid's capture
  keydown (a `[role=button][tabindex=0]` div is clicked). `_iogMiniFor` maps multiviewer names to their picture (a row naming
  none: picture 1). The phone, the Look Book, the Excel and Wire show no multiviewer picture (unchanged). SNAPSHOTS unchanged:
  an example draws no random number as it opens (a draw there moves every later draw of the seeded smoke run, which recoloured
  the untyped source cables of the Look Book's Wire page in a first try). A new place that draws Math.random while a show opens
  will move them again. (O) the + Add cards: `_iogSecHTML` writes the cards,
  then `_iogAddFillHTML(sec,n)`: K = max over C in 4 / 3 / 2 / 1 of need(C) = C - n % C (C when the row is full) add cards;
  card k carries `iog-add-xC` for every C with k >= need(C); four @media rules next to the `.iog-grid` column rules hide
  them (`width > 1439px`, `1099px < width <= 1439px`, `719px < width <= 1099px`, `width <= 719px`: EXACTLY the column rules'
  ranges, keep them in step). No JS on resize. `.iog-empty` spans the row under the add cards. `_iogAdd` puts the focus on the
  section's first visible add card after an add made from an add card (`_iogFocusAdd`); `_iogRefocus` does the same when the
  add card the focus was on is gone or hidden after a redraw (`_iogSpot` notes `add`). Flows checks N1..N3; renamed in place
  P1 (16ky A: the add card now follows the cards), P2 (16ky-r2b C: its name said "the first card"), P3 (16ky-r2b N3: each
  multiviewer shows its own picture, the picture is a button), P4 (16kz-fix P1: only the add cards that show are measured),
  P5 (16ky-r2 A: a multiviewer card's keys now include its picture); phone M1 (the Town Hall packet opens as changed, so New
  asks first: the check waits for Quick Setup). HELP: "Help 16kx-r3" reads a 2500-character window from the first "Advanced
  pages" after I/O Patch (inside Add & remove), so the Multiviewer row can grow by ~90 characters at most: its details are in
  What it is.
- **16la-ip** (owner, 2026-09-29 ~12:40, chosen over a new IP field; search `16la-ip`). (P) "you just put the IP address rules i
  wrote in the notes, it just auto populates there": a connector SET to NDI / ST-2110 / Dante / Ethernet (`_ipIsIpConn`:
  `_sysClassifyConnector` ndi / st2110 / dante / ethernet; Fiber and SFP / QSFP classify as fiber; a typed Custom… connector is
  custom) gives the row's NOTE the show's next free address IN THE SAME EDIT. Where: `_sysSetMetaNow` calls `_ipGive(kind,id)`
  after every connectorType write (every single-row pick: Simple cards, Advanced rows on any page, the phone's I/O cards, Wire's
  source / destination / AUX cards, Custom… typed as a built-in's name, A0 / M0 through `_iogApplyOut`); `_sysApplyToAll` (S0 /
  D0) and `_ioAdvApplyToAll` (an Advanced page's Set for all rows; A0's 'adv-aux' rows are 'adv-dst') call `_ipGiveAll` (each row
  its own, in card / row order); a Wire custom source (no note) gets its 16el `ip` (`_ipGiveCustom`, from `_wireAdvSetCustomField`
  and `_wireConnWrite`); a source tile's output point gives the tile's source one (`_ipGiveInst`, from `_wireAdvSetSrcPortConn`
  and `_wireConnWrite`). The note is written through `_sysSetMetaNow(kind,id,'notes',…)`, so page 1 (`_ioP1ToShow`), an
  I/O-only twin (`_ioAdvFollowTwinDest`) and the Video Presets Notes column (`renderTable`) follow in the same step. Numbering
  `_ipSeq`: 192.168.R.1, then .5, .10 … .250 (51 a range), R = 0 … 255. `_ipUsed`: every IPv4 in the notes of sources,
  screens, dsms, multiviewers, ioDests, presets and every Advanced page's rows, plus sources[].ip / customSources[].ip (16el);
  the first address of the sequence not in it is given. Empty note = the address; a note with text = "address · text"; a note
  with an IPv4 (`_ipFind`), or a source with its own 16el ip, gets nothing. NOTHING runs on open / load / draft restore / undo:
  an older show is not changed and does not light Save. Wire Advanced, DERIVED at draw time, never written: `_ipCell` / `_ipCellVal`
  (the router matrix and the switcher grid of `_wireAdvRouterTileHTML`): an ID cell that is not typed (`ptAuto`) shows the IP of
  the item on its cable (`_ipOfEnd`: asrc / asp -> the source; adst / adsm / adp / dst / dsm -> the destination / AUX; 16el's ip
  wins, else the first IPv4 of the note) IN PLACE OF the auto ID (16jv's OUT n / BKP, kept in the tooltip): "IP · OUT n" was
  cut after "OUT" in the printed column. `pt` keeps the auto ID, so clearing a typed ID shows the IP again. `_ipPortVal`: a
  network switch's port without a name shows the IP(s) of the items cabled to it. Both carry `data-ip-auto`; the Advanced export
  clones the live drawing, so the Wire sheets and the Look Book print them. Wire Simple's hub (`o.hub`), converters and
  everything else are untouched. 16el's Details box: `_wireIpPrefill` = `_ipNextFree()` (its old rule, the first three
  numbers of the first IP + a dot, is gone); the box shows the note's address when there is one (`data-prefill`, untouched =
  nothing stored, as before) else the next free one (`data-suggest`; Enter stores it as the source's 16el ip, one undo step).
  Flows checks P1..P3, phone check Q1. A new path that writes connectorType must call `_ipGive` (or `_ipGiveAll`), or it
  silently skips the address. Known gap, not new: a Simple card's connector pick on a source page 1 made (fromAdv: ORGILL's P1,
  LEFT SIDE, RIGHT SIDE) is put back by page 1 on the next Advanced look (page 1 wins, 16ji), its address with it.
- **16la-colour-mv** (owner, 2026-09-29 ~13:30 - 15:40; search `16la-colour-mv`, prefix `_cm`). (Q) destination / AUX colours
  work like a source's: ONE stored colour (screens[] / dsms[] `wireColor`, `_wireNodeColor`, default orange / yellow) shown by
  the I/O Patch card, the Wire card and the Wire drawing tile. The Advanced tile drew a FIXED #0e7490 / #2d8a5e colour tile and
  the t-dest / t-dsm lane border and name: positions now take `_cmTileColor` (the show item's colour, a hand-made card's own:
  its wireColor, else the old #0e7490 / #2d8a5e its card shows), `_wireAdvGenericTileHTML` takes `opts.tint` (inline border and
  name colour, like the source tile; `_cmShowColor`, show items only). A cable pick sets it: `_cmCable` from `_sysSetMetaNow`
  (dest / aux / an adv-dst row of page 1 through `_ioP1Map`), `_cmCableAll` in `_sysApplyToAll` D0 (screens, not ioDests),
  `_cmCableRows` in `_ioAdvApplyToAll` (page 1's rows); `_wireCableSpec(v).color`, nothing for Clear. An upload samples it
  (`_cmUploadColour` in `_wireUploadThumbnail`, in the upload's undo step). Nothing runs on open. The Simple export
  (`_wireBuildExportSvg`) keeps the sheet's theme colours for every node, sources too (unchanged). (R) Wire's side panel gets a
  Multiviewers pane (`_cmMvPaneHTML`, after AUX / DSM, not on the phone; its sticky header top 126 inline, collapse
  `panes.mv === false`) with `_cmMvCardHTML` (picture right, `_cmMvCycle` = `_mvPicCycle` + redraw + focus; resolution through
  `_wireSetDestField('mv', …)`; Cable Type kind 'mv', `_wireConnWrite` takes 'mv'). Drag data `wire-adv-mv:<id>`. ADVANCED: a
  destination tile of the page, `wireAdvanced.dests` entry `{ refId: 'mv:<id>' }` (`_cmIsMvRef`); positions `_cmMvAdvPos`
  (type destination, `mvRef`), the dest branch draws `_cmMvAdvTileHTML` / `_cmMvAdvThumbSvg`; `_wireAdvGetDestTemplate` returns
  the multiviewer (router cell names, IP); once per page (`_cmMvAdvDrop` moves an existing one). SIMPLE: `wireSettings.mvSimple`
  (a data key: saved, undone, compared) lists the ids dragged in, `wireLayout['mv:<id>']` their spot; `_cmMvSimpleNodes` feeds
  the hub one output each (`hout:` after the AUX, router outputs `dsmNodes.concat(_cmMvs)`), hubGeom0 / column starts stay
  without them so nothing moves; the export draws the same; Delete (`_cmSimpleMvDelete` in `_wireEscClose`) takes it off.
  `_cmMvDropTiles` (from `_sysRowDelete` 'mv') drops the tiles on every page (`_wireAdvEachPage` + `_wireAdvSweepPageWires`) and
  the Simple entry. (S1) `_iogSecHTML` writes no `.iog-empty` note. (T) `_iogAddHTML` draws the outline card (`.iog-wf*`,
  CSS next to the four @media rules; `.iog-grid>.iog-wf{display:flex}` is kept at two classes so the @media hiding rules win).
  Flows checks C1..C5 (new), A1..A6 (renamed in place), phone check QM1.
- **16la-fix** (fixer, 2026-09-30; search `16la-fix`, prefix `_fx`). The owner's answers to the IP builder's questions and the
  attacks' fixes. (U1) `_ipCell` returns the automatic label AND the IP (`OUT 1 · 192.168.0.1`, `BKP · …`, a source tile's typed port
  label `PRIMARY · …`; just the IP where the cell had none); `_ipCellVal` sets the tooltip the same and `_fxSlotStyle` a smaller
  font when the text is longer than the column (matrix 104 px, editable switcher 115, locked 137, 0.61 em a character, 6 px at least),
  so it is whole on screen and on paper. Typed cells are untouched. (U3) a hand-made destination / AUX card has its own IP
  (`customDests[].ip` / `customDsms[].ip`): Details' box `_fxIpCustomSelHTML` (16el's markup, shown for an NDI / ST-2110 / Dante cable,
  commit `_fxIpCommitCustom`, one undo step), the tile's `.wire-adv-ip` line (`opts.ip` of `_wireAdvGenericTileHTML`,
  `_fxCustomTileIp`), `_ipOfEnd` (adst: / adsm: read `t.ip` before the note), `_ipUsed` counts it, `_ipGiveCustom` runs for every
  hand-made kind in `_wireConnWrite` and `_wireAdvSetCustomField`. (U2) / (U4) unchanged. (M / R) Wire Simple (live and
  `_wireBuildExportSvg`): `_fxSimpleName` draws a name that would run into a right-end picture smaller (12 to 9 px), then cuts it after
  a whole word with …; every other name exactly as before. Removed: the `.iog-empty` rules, the `.fs-src.fs-src-add.iog-add` rules,
  `_iogSecHTML`'s empty-note argument; stale comments corrected (16el's // block is a /* */ one). Help: I/O Patch › What it is,
  › Multiviewer (MV), Wire › IP address, › Source thumbnails. Flows checks F1..F5 (new), A1 = 16la-ip's P3 renamed in place.
  Not changed (owner's questions): + Add destination still lands before the I/O-only destinations; the Simple sheet's theme
  colours; a switcher fed THROUGH a router shows no IP; the website's packets; the Quick Guide. Found in passing, also on v0.7.0:
  committing a typed router / switcher ID cell by clicking elsewhere throws a NotFoundError (the redraw runs inside the blur).
- Declined by the owner, do not resurface: mask shapes, anchor points, hardware profiles, canvas/WebGL renderer,
  interpolation filter toggles, upscale-factor notes, per-layer "sharp pixels", any licence mention.

## 6. Working with the owner
- Build what was specified; put concerns in a separate sentence, never a silent substitution.
- Ask before building when a design has more than one reasonable reading.
- Never handle GitHub logins, passwords or tokens (pushes use the owner's SSH key). Ask before downloading
  anything large. Never touch the desktop app's real data folder. Website edits: build, then stop and ask before
  saving or publishing, unless the change was directly requested.
- Memory note: the assistant's auto-memory is stored per working directory on this Mac. Start sessions from the
  same folder as before (the home folder) to keep it, and keep this handbook current so the repo alone is enough.

---
Merging several patches (lesson of build 16kp, nine click-through patches): every patch passed on its author's copy, and
11 of 93 new checks still failed on the merged page (two patches adding the same undo step, two Escape handlers closing
two things on one press, two Cmd+S handlers saving twice). Never trust "applies cleanly". Build the intermediate pages
(after patch 1, after patch 2, ...) and run the gate against each with `LB_DEPLOY=<folder> LB_HTTP=<port> LB_CDP=<port>
LB_OUT=<folder> node tests/run_smoke.mjs --flows-only --no-mobile`; the pass / fail history per check names the patch that
breaks it. A check that NEVER passes, even right after its own patch, points at the harness, not the page: the gate's
browser page must have window focus (`Emulation.setFocusEmulationEnabled`, re-applied before the flows stage) or
`el.focus()` / `el.blur()` fire no events and every "type in a field, then leave it" check silently does nothing.
`USER_MANUAL.md` is the user-facing manual (13 chapters + keyboard table); keep it in step with behaviour changes.

Phone / tablet build: read `PHONE.md` before touching anything under `initMobileShell` or the `body.is-mobile` CSS.

Reading receipt: **HANDBOOK-12G-SDI**. Report this code to the owner after reading this handbook in full.

<!-- 16kv-dates -->

<!-- 16kv-fix -->

<!-- 16kw-menus --><!-- 16kw-fix --><!-- 16kw-r2 --><!-- 16kw-r3fix --><!-- 16kx-backdrop --><!-- 16kx-r2 --><!-- 16kx-r2fix -->

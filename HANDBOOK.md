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

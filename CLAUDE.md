# Look Book Builder — Project Context

## What this is
AV Look Book (the window title still ends in "— Look Book Builder" on purpose, see HANDBOOK section 5): a single-file HTML/CSS/JS application for AV / live-event
pre-production, wrapped in an Electron desktop shell for Mac and Windows. Target users: video engineers, show callers
and producers. Three tools share one show file (`.avlb`, JSON): **Video Presets** (Simple + Advanced), **Wire**
(Simple + Advanced signal flow) and **I/O Patch** (Simple + Advanced). Exports a user can reach: the Look Book PDF,
the Excel cue sheet, the I/O Excel, the Wire drawing, and Send. (A CSV exporter exists in the code but has no button.)

## File layout
- `deploy/lookbook_builder.html` — **THE single master file** (about 2 MB). Every page change lands here. Users do NOT
  get this file when you save it: it reaches them only through a GitHub release (see "Release channels" below).
  It contains the mobile build too (gated by `body.is-mobile`).
- `electron/` — the desktop shell (Electron 33): `main.js` (Welcome window, one window per project, recents, content
  updater that pulls the page from the latest FULL release, Send show, Report a bug), `preload.js`,
  `welcome-preload.js`, `welcome.html`, `build/` icons. `package.json` version must equal the tag.
- `.github/workflows/release.yml` — builds Mac + Windows installers on every `v*` tag; tags with a `-` are pre-releases.
- `tests/` — the regression gate: `run_smoke.mjs`, `smoke_probe.js` (what each example show produces),
  `flows_probe.js` (drives the app like a user, Simple + Advanced, all three tools), `mobile_probe.js` +
  `run_mobile_stage.mjs` (the phone build at 390x844 and 844x390 with real touch taps), `golden/`.
- `tools/` — `check_js.py` (run after every page edit; give it a path to check a scratch copy), `cdp.mjs` (drive the dev shell).
- `deploy/quick_guide.html` / `.pdf` — the Quick Guide. `deploy/landing-*.html`, `site/` — website blocks, the download
  counter and the example packets (`site/packets/`).
- `backups/` — local snapshots, not in git. Snapshot before every page edit:
  `backups/lookbook_builder_<date>_before-<stamp>.html`. The page at v0.2.148 is
  `backups/lookbook_builder_2026-09-19_before-16kf.html`.
- `private/` — git-ignored; a dated copy of the assistant's memory folder lives here. The repo is PUBLIC.
- `Test AV Look Book.command` — the owner's double-click launcher for the TEST copy (dev shell from this folder, own
  data folder). He tests every change there before anything is pushed or released (RELEASE.md).
- `USER_MANUAL.md` — the user manual (what every control does, step by step), written from the 2026-09-21 click-through.
- `HANDBOOK.md` (how to work), `RELEASE.md` (the release gate), `PHONE.md` (the phone / tablet build: purpose, rules,
  traps, how it is tested). `app/` and the old Netlify site are retired.

To test, serve `deploy/` (`python3 -m http.server 8090 --directory deploy`) and open the page in Chrome. No build step.

## Top priority: avoid regressions
The recurring pain point is "fix one thing, break another." Treat this as a
first-class concern, not an afterthought.

Before any edit:
1. Snapshot the current file to `backups/lookbook_builder_<date>_<reason>.html`
2. Read the target function(s) fully — never assume structure
3. Identify every call site of anything you're changing (grep for the name)
4. State which features could be affected and how you'll verify them

After every edit:
1. Extract the `<script>` block and run `node --check` on it
2. Brace balance check + duplicate-function-name check
3. List the regression-risk surfaces and walk through them mentally
4. Present the file path for Omar to download

If a change touches a render function, DSM system, layer system, or save/load,
the verification bar is higher — those are the load-bearing systems.

## Critical safety rule (file corruption)
NEVER use Edit/str_replace inside template literal strings inside JS functions.
It silently appends instead of replacing and corrupts the file to 600KB+.

Safe pattern for editing functions:
1. Read the full function
2. Write a Python script to `/tmp/fix_<thing>.py` that does the replacement
3. Run `python3 /tmp/fix_<thing>.py`
4. Verify (node --check, brace count, dup-function check)

Use the Edit tool only for small, unambiguous, non-template-literal changes.
When in doubt, use Python.

## Architecture — 3 layers (established 2026-06-23, builds 16bq→16by)
The app is now logically separated into **data / controller / view**. The whole
point: when you change something, edit the ONE layer that owns it, then verify it
against the other two. That's how we make updates fast without "fix one, break
another." Do NOT reach across layers (e.g. a click handler writing a state array,
or a mutation manually poking the DOM).

**DATA layer — the only place state is read/written**
- State in memory: `screens[]`, `presets[]`, `dsms[]`, `sources[]`,
  `multiviewers[]`, `ioDests[]`, `customLibrary[]` + selection/flags
  (`sel`, `selLayer`, `selDSM`, `fsPresetId`, `_dsmLabel`, `_isDirty`).
- ALL writes go through a setter — never assign state from the view/controller
  directly. Setters: `setL`, `setScreenName`, `setLayerName`, `setLayerSize`,
  `setCrop`, `setAOI`, `setRotation`, `setDSMName/Type/Content/Color`,
  `setScreenColor`, `setScreenApproved`, and `setPosition` (the single write
  point for `p.positions[sid]`; accepts `(p,sid,x,y)` or `(p,sid,{x,y})`).
- Getters resolve per-preset override → global: `getScreenName`, `getDSMName`,
  `getDSMType`, etc. Resolution stays global per DSM; only name/type override.
- What an export PRINTS for a destination's BG is `_bgPrintName(p,s)` (16lh-bgtxt: the name, else Image, else Color #rrggbb, the
  layer strip's `_lsBgInfo` label), never `getBgName` alone: that one is the NAME (sources, checks).
- Persistence: `getProjectState()` (`.avlb`, **schema v3**) → `saveProject` /
  `loadProjectFile`→`_loadProjectFileOnLoad`; autosave (30s) + undo/redo
  (`pushUndo`/`doUndo`/`doRedo`, JSON snapshots of DATA: Undo / Redo never write VIEW state (Simple / Advanced,
  zoom, tool, panes, open page tabs, folded presets). THE ONE LIST of view keys is `_LB_VIEW_KEYS`, next to `_snapshot`: the unsaved
  comparison, the undo safety net and Undo all read it; `_lbViewStateGet` / `_lbViewStateApply` keep the user's view across a restore;
  a step equal to the show as it stands is dropped (`_lbSameShow`, `_lbDropEmptySteps`), see HANDBOOK). NOTE: `addPreset`,   <!-- 16ks-undo-docs -->
  `deletePreset`, `setScreenApproved` push undo INTERNALLY; `addDSM` does NOT —
  don't double-push.

**CONTROLLER layer — `actions.*` (one named fn per user operation)**
- The view calls `actions.X(...)`; each action does `[pushUndo if needed] →
  data setter/mutator → scheduleRender()`. One place to find/change an operation.
  Covers toolbar, preset-row, DSM toolbar, screen-panel show-mode, Modifiers-menu
  toggles (`toggleAdvFeature`; the menu read "Advanced" on screen until 2026-09-21, code names keep `adv`; the four switches are
  remembered on this computer between launches since 16lh-mods: `loadAdvSettings` / `_advApply`, never in the show file, the phone
  still starts them off), DSM-panel content. (Layer-properties panel buttons are wired via
  `addEventListener` in `wireEvents` — already decoupled; a valid alternative.)
- Redraw is ONE batched path: **`scheduleRender()`** (rAF-coalesced) calls
  `render()` and resyncs whichever overlay is open (`_sysRefreshIfOpen` +
  `_wireRefreshIfOpen`). Use it after a mutation instead of bare `render()` /
  `renderFullscreen()`. EXCEPTION: per-frame drag move-loops (`function mv`) and
  mobile `_mb*` stay synchronous `render()` for same-frame paint — don't convert.

**No-overlap guard (2026-09-21)** — `_ovlBegin()` / `_ovlEnd(tok)` (+ `_ovlPairs`, `_ovlNew`, `_ovlRevert`), in front of `_bgGroups`.
Bracket every writer of a destination position / size / rotation that is NOT a blend control (today: Destination Properties Apply,
`_spTool` paste / reset, `startResize`, `setDeadPx`, `_sysSetMeta` dest resolution, `_unhideScreen`, `_resizeSelDest`). New overlap with Blend Zones OFF and Free
Position OFF (body has `adv-hide-blend`, lacks `adv-free-position`) = BLOCKED: `_ovlRevert` (pre-action snapshot back, no undo step)
then ONE `showAlert` "Destinations can't overlap" (`_ovlBlockUp()` keeps a burst from raising a pile). With Free Position ON or
Blend Zones ON = the drag's "Create Blend Zone?"; Cancel = the same put-back. Owner rule 2026-09-21. Not bracketed on purpose: blend controls, load, undo / redo,
the move arrows (a swap that would overlap is greyed by `_lbMovePlan`), preset copy / paste and + Preset (they carry an existing
blend over as it is). The arrow keys ARE bracketed since 16kq (`_resizeSelDest`).

**One combined screen (16lg-blend, 2026-10-08)** — an EDGE blend group (overlapping boxes, not a full stack, no rotated member) is ONE
screen per preset: `p.combo[<master id>] = {on, ids[, keep]}`, master = first in `screens` order. `_cbNorm()` (top of `render()` /
`renderFullscreen()`) gives a NEW group `{on:true}` and drops a gone one (master layers clamped back); `_cbOpen()` before the clean
baseline gives an opened show's groups `{on:false}`. A combined master's layers stay fractions of its OWN size: never clamp a layer to
0..1 yourself, go through `_layerPosBounds` / `_cbMaxF` (they widen to the combined rectangle). A new canvas renderer must draw through
`_rcScreenBox` (it draws the slices, the see-through slaves and the master's `.cb-lay`). Read `_cbFind(p,sid)` before showing or
editing a destination's own BG / layers (a slave's are hidden and kept). 16lg-blend-fix: a drag that redraws on every mousemove must
hold `_cbHold` (as `startHomeScreenDrag` does) so passing group changes are not worked out; a group with a turned member is paused
(`_cbPause` / `_cbResume`), not dropped; a new layer on a combined master is centred on `_cbBox`. 16lg-blend-fix2: a member of a
combined screen cannot be rotated: a new rotation control must go through `setRotationSmart` (it refuses via `_cbRotLock`) and grey
itself like `_cbRotSync`; `setRotation` stays the unguarded data setter. HANDBOOK › 16lg-blend, 16lg-blend-fix, 16lg-blend-fix2.

**Looking is not a change (2026-09-21)** — the unsaved mark (`_isDirty`, the gold Save button, the New / Load / close question)
comes on ONLY for a real edit. Two rules, both next to `_dirtyStateString`: (1) view settings are SAVED as before but left out of
the comparison: `_LB_DIRTY_VIEW_KEYS` (Wire view / zoom / tool / panes / collapsed panels / Align panel place, I/O view / open page)
plus any key named `minimized`; keep that list small, `getProjectState()` is never filtered. (2) anything the app fills in BY ITSELF
(random cable colours, Wire / I/O Advanced page 1 built from Simple, the empty default pages, the default print sheet, the
"asked once" note) runs through `_lbNotAChange(fn)`: clean immediately before = the baseline is taken again immediately after, in
the same tick; already unsaved = nothing is re-captured. Replaced baselines are kept in `_savedAlso` so Undo back past a first look
still reads clean. Never wrap code that holds a user edit; a new automatic write that is not wrapped lights Save for nothing.
Draw-time follow-ups (Wire / I/O Advanced syncs that run on every draw) use the draw form `_lbNotAChange(fn,get,set)` (one small
JSON of the part per draw; the full comparison only when something was written); async fills end through `_lbNotAChangeDone`.
A rename of a destination / AUX / multiviewer carries its follow-ups in the SAME edit and undo step (`_lbRenamedDest`).

**Escape (16ks-esc, 2026-09-21)**: one `window` capture `keydown` listener next to `_lbEscTop`. Text / number box: old text back (`_lbEscOrig`,
noted on `focusin`) + an `input` event + `_lbEscRestoreShow` (puts the show back IN PLACE from `_lbEscOrig.s0`, the picture taken at the first keystroke (16ks-escfix: only typing is taken back, a mouse edit under a focused box is folded in by `_lbEscRebase`), mirrors the key list of
`_snapshot()`: keep the two lists in step) + blur, then the key stops. Advanced page: `_fsEscLetGo()` clears the pick (layer, destination, lit AUX, layer strip ghost) before `closeFullscreen`; a focused fader is not a box.
Not touched: Quick Setup, the rename / count boxes in `_LB_ESC_OWN`, SELECTs, the phone build (`is-mobile` returns first).
The Date Created / Show Dates calendar (`#lb-cal`, 16kv) keeps its own keys: `_lbCalKeys` is a window capture listener registered
BEFORE this one and `_dlgKeyGuard`; with the cursor elsewhere it is the first entry of `_lbEscTop`. Cmd / Ctrl keys pressed inside it
stop there too, and focus cannot fall out of it onto the page (16kv-fix).

**Date Created / Show Type / the calendar (16kv, 2026-09-25)** — Quick Setup "Date" is Date Created (same `#qs-date` / `#show-date`,
YYYY-MM-DD, `showDate` in the file), "Show format" is Show Type (same `showMeta.format`, placeholder "Corporate, Touring, Installation…").
Both date boxes open ONE calendar `_lbCalOpen` (one day / a start and an end); the browser picker is replaced, typing is kept. Excel
cover: blank Show Dates prints "CREATED <date>", D15 prints "SHOW TYPE: …". Examples: date in `showMeta.dates`, `showDate` "". CSS
for it lives at the end of the main style block and must not start with `:root` / `#wire-overlay` (the export copies those).

**I/O Patch menus (16kw-menus, 2026-09-25)** — the Connector, Type and Resolution menus read Custom… first, — Clear — second,
then the list, everywhere they open (rows, Set for all, Advanced pages, phone cards); this replaces "destructive last" for Clear.
Connector gained Custom… (the text stored as typed in `connectorType`, remembered in `customTypes.connectors`, a grey cable in
Wire), Type gained — Clear —. 16kw-fix: the phone's Resolution sheet reads the same way, every typed connector is grey whatever
its words, and a menu never opens over its box. 16kw-r2 (2026-09-26): every menu opens at its TOP (no scroll to the current
value); Wire's Cable Type menus read the same, Custom… typing on the card (`_wireConnAsk`); an output's Resolution Clear is
greyed out ("An output's resolution is its size"). 16kw-r3fix (2026-09-27): a typed connector reads in capitals in the Wire Details key (one row per name, whatever its
capitals; the printed key is as typed) and on the phone card's pill; a Type just typed is the marked row of its menu. Details and the menus left alone: HANDBOOK section 5.

**Backdrop (16kx-backdrop + 16kx-r2, 2026-09-27)** — a fifth destination Type (`deviceType` 'Backdrop') for a scenic piece between
the screens that takes no video. Made in Quick Setup / Edit Show Info (the switch beside a row's resolution) or the I/O Patch Type
menu of a real screen's row on Advanced PAGE 1 (after Stream; 16ky-r3, a Simple card has no Type) or the phone's destination card; it is named BACKDROP (BACKDROP 2 …, never a taken name) and becoming one removes its BG and
layers from every preset AND its Wire Advanced tiles, cables and the show switcher's row that fed it (a router or switcher added by
hand keeps its ports: the port is emptied), and its own I/O Patch Advanced rows, in one
Undo step (16kx-r3: the Type menu always asks, in plain words; a converter that fed only it goes too, freeing what fed it). Size in whole INCHES (`bdLin` / `bdHin`, read 12' 6" × 8'; a screen starts at its
pixels to the nearest half foot; `w` / `h` follow the px per foot on every draw), one picture (`bdImg`, JPEG <= 1600 px). Drawn inline
by `_bdBox` (the Display output shows it too since 16lc-fixes: `_DISP_CLEAN_CSS` leaves `.lbbd-box`'s background); left out of the Canvas size, the I/O Patch, the I/O Excel, Wire and every destination / port / output count (`_bdNoBd`); it
exists only in the Video Presets and has NO number: every destination number is `_bdNo(s)` (16kx-r3, D1 / D2 around it); a new or unnamed destination takes its number or the next
free one, never a name the show has (16ky-r4fix, `_r4fNewDest` / `_bdQsDef`); back as a
screen it gets its old resolution (`bdWasW` / `bdWasH`); ⌘D names its copy BACKDROP 2; the only screen left never
becomes one (16kz-answers: greyed "A show needs at least one screen"; Quick Setup's first screen row reads All Destinations);
Quick Setup's switch pressed on and off again gives the row back (16kx-r2fix); the cue sheet keeps
its column greyed (xf 19 / 20). Details: HANDBOOK section 5.

**I/O Patch (16ky … 16ky-r3, 2026-09-27)** — Simple is a card grid (Wire's cards, four sections, name / resolution / cable
type only; a section title holds its own Set for all and Remove). Advanced PAGE 1's Type and note of a show item ARE the
item's own, both ways, in the edit's undo step (`_ioP1ToShow`, `_ioP1Follow`: the show's value wins); pages 2+ are their own.
Reset on a Simple card clears only the cable type (and a source's resolution). 16kz-answers (2026-09-28): page 1's AUX / DSM rows have
their own Set for all (A0; D0 the destination rows); no "Simple changed" question for a Type page 1 follows; an output renamed into
a name another output has is refused ("Name in use") everywhere it can be renamed; + AUX takes the next free AUX number; Remove Source
shows the cards' numbers. 16kz-refresh (2026-09-28): a Refresh column on every Advanced page (the item's own rate on page 1, like
Type and notes; the I/O Excel, the Look Book and the phone show it; the red pill counts it, `_RF_CAP`), the Notes cell opens a box,
the Advanced rows take Tab; the output cards (grid and Wire) have their picture on the right (the + Add cards kept the + on the left in 16kz-fix; outline cards since 16la-colour-mv); a name on
a picture breaks only between words; the only screen is never deleted (every delete path, Undo / Redo too); ADD › Destination and
Wire's hand-made cards refuse a used output name. 16kz-fix (2026-09-29): the + Add cards as before, the Advanced columns shrink (1024 px fits), a source made on page 1 carries its
rate, whole words on a picture, the phone's resolution never cut, the Notes box shows the whole note. 16la-wire-mv (2026-09-29):
the Wire drawing's destination / AUX tiles have their picture on the right too (Simple, Advanced, the Wire sheets, the Look Book);
four multiviewer pictures (`mvPic` 1-4: random for a new one and, ONCE, for a show saved without one, which then reads as changed;
a click on the card's picture shows the next); the + Add cards end each section and complete its last row. 16la-ip (2026-09-29): a
connector set to NDI / ST-2110 / Dante / Ethernet gives the row's note the show's next free IP (192.168.0.1, .5, .10 …; `_ipGive`
from `_sysSetMetaNow`, `_ipGiveAll` from the Set for all paths); Wire Advanced shows an item's IP in an untyped router / switcher
ID cell and an unnamed network-switch port (`_ipCell`, `_ipPortVal`: derived, never written). 16la-colour-mv (2026-09-29): a
destination's / AUX's colour works like a source's (a cable pick or an uploaded picture sets it; `_cmCable`, `_cmUploadColour`)
and its Wire Advanced tile shows it (`_cmTileColor`); a Multiviewers pane in Wire, whose cards drag onto Advanced (a destination
tile, refId `mv:<id>`, once per page) and Simple (`wireSettings.mvSimple`: one more switcher output each); the + Add cards are
outline cards and an empty section has no note. 16la-fix (2026-09-30): an untyped Advanced ID cell shows its automatic label AND
the IP ("OUT 1 · 192.168.0.1", `_ipCell` / `_fxSlotStyle`); a hand-made destination / AUX has its own IP (`customDests[].ip`,
Details' box `_fxIpCustomSelHTML`). 16lb-simple (2026-09-30): Wire SIMPLE is a drawing the user edits (`_slb*`): the cards' Advanced
tiles with one point each, a 6-column router tile, Advanced's cables, every card drags on, tiles come off; its data is `wireSettings.simple`
(rows / off / loose / pt / routes / lay / title), derived at draw time and written only by an edit; its router is titled Generic Router until
named; page 1 is a copy of it; the old switcher code and `_fxSimpleName` are gone. Simple AND Advanced refuse a cable end let go on a point of
the same kind (output on output, input on input) with a 3 s warning by the pointer (`_wcr*`). 16ld-port (2026-09-30): a Wire tile's
port (its chip and dots, Simple and Advanced) wears its cable type's colour (`_wirePortColor`, `_wireOutConn`, `_wirePortPill`); the
tile keeps its own colour. 16ld-tools (2026-09-30): every Wire tool tile (router, switcher, I/O Patch page tile, converter,
network switch, Simple's router) has a tall title bar (`_WTL_*`, `_wtl*`): pencil first, name, a picture box on the right (upload /
replace / remove), the whole bar in the tool's colour (the picture's dominant colour, else a palette colour stored when made, else
one derived from its id; white or black ink). 16ld-fix (2026-09-30): the name shows in full (`_wtlNameHTML`, the type box over it); the picture drags the tool, a click uploads, the
keyboard reaches it; a tool from an older show settles once at its page's draw (`_wtlSettle`, `hdr`); plus the zoom floor and
Simple's deleted-item rows. 16ld-fix2 (2026-09-30, Omar "half the logo size"): the tool picture is half a tile's
(55 x 31) and the bar its old height (56 / 44: `_wtlHdr`), so an older show grows by nothing; the name at the bar's size on up to
two lines, then cut with ... and whole in its tooltip. 16lc-picsize (2026-10-02, v0.8.1, Omar "match the image size of the tiles"): every
tool but a converter has a tile's picture again (110 x 62) in an 88 bar (`_WTL_HDR`; rows 176 / 124: `_WTL_RT_TOP`, `_wtlDvTop(d)`), a
converter keeps 55 x 31 in 44 (`_wtlSmall`); `_wtlSettle` grows an older tool once and moves only a tile it would cover (16lc-fix: Simple's
router too, `_slbSettle`; a test build's hdr counts as v0.8.0 drew it, `_wtlWas`; no undo step from the opening click, `_wtlNetRebase`); every switch,
the page tabs and FIT read white / `--ss-t3` grey, no cyan; EXPORT takes Reset Layout's recipe (`lb-rl-btn`). 16lc-names (Omar "verbiage
on 2 lines"): a tool's name in an 88 bar uses up to three lines, between words / after a hyphen, smaller down to 11 px rather than
broken mid-word, ... only past that (`_wtlNmFit`, `_wtlNameRoom`; on paper fitted again, `_wtlNmPaper`); a converter's is unchanged.
16lc-midword (Omar "Break mid-word as a last resort"): only a name with a word (or a hyphen part of one) wider than the line even at
11 px is drawn at the bar's own size, a piece wider than a whole line split mid-word (`_wtlNmMid`); a name only too long keeps the
11 px cut, words whole. 16lc-midword-fix: that test and those lines measure as drawn (`_wtlNmX`: capitals, the canvas's own
letterSpacing), a no-break / full-width space ending a line is not drawn (`_wtlNmLineHTML`), the fit stops at two full lines.
16lc-onlyword (Omar "Split only the word that can't fit"): that last resort is drawn at the bar's own size only when every other
piece fits a line there, else at the largest size (down to 11 px) at which every piece that fits a line at 11 px fits whole
(`_wtlNmSize`), so only a piece too wide even at 11 px is split. 16lc-onlyword-fix: that size also keeps every such piece inside
its line at Help > Accessibility 90 % / 115 % (`_wtlNmZoomOK`, a hidden span with that zoom; not on paper, `_wtlNmPap`).
16lc-onlyword-fix2: and every line holding such a piece (`_wtlNmZoomLines`), each inside the block as drawn at that size (the tile's
1 px borders snap to whole device pixels: a 1 px-bordered replica in the same hidden box, not the room).
Details: HANDBOOK section 5
(`16ky-r3`, `16kz-answers`, `16kz-refresh`, `16kz-fix`, `16la-wire-mv`, `16la-ip`, `16la-colour-mv`, `16la-fix`, `16lb-simple`,
`16lc-fixes`, `16ld-port`, `16ld-tools`, `16ld-fix`, `16ld-fix2`, `16lc-picsize`, `16lc-fix`, `16lc-names`, `16lc-midword`,
`16lc-midword-fix`, `16lc-onlyword`, `16lc-onlyword-fix`, `16lc-onlyword-fix2`, `16lc-vpcards`, `16lc-vpvideo`, `16lc-vpaux`, `16lc-vpfinish`, `16lc-vpcards-fix`, `16lc-vpcards-fix2`, `16lc-vpcards-fix3`, `16lc-vpcards-fix4`, `16lg-blend`, `16lg-blend-fix`, `16lg-blend-fix2`, `16lh-fit`, `16lh-mods`, `16lh-bgtxt`, `16lh-fix`, `16li-bgsrc`, `16li-blendui`, `16li-print`, `16li-fix`, `16lj-followup`).

**One card (16lc-vpcards, 2026-10-06)** — the I/O Patch > Simple card (`_iogCardHTML` + `_iogSrcObj` / `_iogOutObj`) is also the card of
Wire's left panel (desktop; the phone keeps Wire's own) and of the Video Presets > Advanced left panel (Wire > Simple's sections:
`_fsPanelHTML`), at Wire's size, built by `_lbcSrcCard` / `_lbcOutCard` (only the drag differs). Its controls are the I/O Patch's
own handlers (scoped to `#wire-panel-left .iog-card` / `#fs-left-panel .iog-card` too), so a change on any page is the same change;
`_sysRender` / `_wireRender` ask the open Wire / Video Presets page to redraw (`_lbcAfterSys` / `_lbcAfterWire`). Its CSS is copied at
run time for both panels (`_lbcCloneCss`): never add `#fs-left-panel` / `#wire-panel-left` card rules to the stylesheet by hand, and
never a `#wire-overlay` part for them. Each Video Presets section ends with I/O's add card (`_fsLbcAdd` -> `_iogAddItem`); a new AUX is
on in every preset from every add. Details: HANDBOOK section 5 (`16lc-vpcards`).

**Files are sources (16lc-vpvideo, 2026-10-06)** — the Video tab's cards are Option C on the same frame (`_fsMediaCardHTML`, class `vc`;
a click on the picture plays it, on Video Presets > Advanced only). A video / picture file is a source on every page: its cover is the
picture of its I/O / Wire card and Wire tile (`_lbvCover`, via `_iogCardHTML` and `_wireSrcThumb`), Wire's panel lists it
(`_lbvWireNames`), and a drop on the Wire drawing makes it a show source. Every rename of a file must go through `_lbvMoveFile` (the
stored copy is keyed by name). Simple's content lists also show the I/O Patch's own sources (`_lbvIoItems`). Details: HANDBOOK section 5
(`16lc-vpvideo`).

**Names and AUX boxes (16lc-vpaux, 2026-10-06)** — a destination or AUX / DSM renamed from any place is renamed in every preset: every
global rename must also call `_lbxOwnNamesGo(kind,id)` (an older show's `p.screenName` / `p.dsmName` stay until then; never write a new
per-preset name on desktop). An AUX box fills with its content's picture or colour (`_lbxAuxFill`), however the content was set. The
band pill's click waits out the double-click window (`_lbxPill`); the two remove-globally buttons ask with the I/O trash's window
(`_lbxDelBody`). Desktop only (`_lbcOn`). Details: HANDBOOK section 5 (`16lc-vpaux`).

**Step D answers (16lc-vpfinish, 2026-10-07)** — never write a rule ending in `body.lbn-measuring ... *` (it restyles the whole page per
nudge). Wire > Advanced hand-made cards are I/O cards with the kinds `wcsrc` / `wcdst` / `wcaux` (`_lbfWcCard`; every I/O setter hands
them to `_lbfWc*`). An opened show has no per-preset names (`_lbfOneName`). Files sorted after every source in `_srcNameOrder` until 16lc-vpcards-fix4 switched that off (the order first seen again). A panel
card's name line goes through `_lbfFitCard` (a long word shrinks; only one too long even at the smallest size breaks, after _ or - first).
Desktop only (`_lbcOn`). Details: HANDBOOK section 5 (`16lc-vpfinish`).

**Fix round (16lc-vpcards-fix, 2026-10-07)** — SWITCHED OFF by 16lc-vpcards-fix4 (2026-10-08, `_lbnOff()` returns true): numbers are set by
order again exactly as in the v0.8.2 candidate, nothing is kept (no `ioNums` saved, read or pinned), opening writes no number and makes no B
(the I/O Patch draw makes it, right under its A) and the number box is not typed in; read `_lbnSrcMap` / `_srcNameOrder` (S), `_bdNo` (D),
`_lbnOutNo('aux', d)` (A), never a list index of your own. While it was on (16lc-vpcards-fix to -fix3): S / D / A numbers were show data
(`ioNums`), a number handed out was pinned (`_lbnPin`), opening kept every number (`_lbnOpen`; 16lc-vpcards-fix3: the automatic B made
first) and a session B took the first free number after its A (`_lbnAutoB`). Card names show as typed; a name the app makes is in capitals. A file's sources[] entry
is born with the file's colour. Desktop only (`_lbcOn`). Details: HANDBOOK section 5 (`16lc-vpcards-fix`).

**Layer strip + ghost view (round 16ks)** — `_ls*` block in front of `_rcPresetRow`: `_lsStripHTML(p)` fills the header's old flex:1 spacer,
`_lsTopTag(p,s)` prefixes `.screen-res`, `_lsGhost` is editor-only view state (class `lb-ghost` on the live DOM of `#canvas-area` / `#fs-canvas`,
re-applied after redraws by a MutationObserver; never in `_rcChip`, the show file, undo, exports or Display). Selection changes reach it through
`doSelect`, `updateLayerSelDOM` and one click / keyup listener; clicks go through `layerChipClick`, the `screenClick` first-click steps and
`_homeOpenDropdown`. Rules in HANDBOOK section 5.

**Preset Reset (2026-09-21, 16ks)** — the amber Reset on a preset header (`_rcPresetRow`, Simple and Advanced): `actions.resetPreset(pid)` →
`resetPreset` opens the ONE dialog with tick boxes (Reset All / Destinations / Layers / AUX) → `_presetResetRun(pid,parts)` (one undo
step via `_vpSnap` / `_vpPush`, none when nothing changes, `scheduleRender()`) → `_presetResetApply(p,parts)` (DATA: puts the preset back to
what `confirmQS` creates). Every per-preset field belongs to ONE group in `_PRESET_RESET_FIELDS` (+ `positions`, `layers` / `active`,
`dsmOn`, which are rebuilt); id, code, name, notes, minimized and everything show-wide are never touched (that includes `presets[0].bgNames`:
`getBgName` reads P01's names as the show-wide background names, so Reset Layers on P01 keeps them; and `presets[0].dsmType`, legacy shows
only: `_sysResolveDsmType` reads it show-wide for I/O Patch, so Reset AUX on P01 keeps it. On P01 rotation / name / colour are written to the
destination, so the window's sentences and its "Nothing to reset" note differ there: they say what stays). **A NEW per-preset field must be
added to one of those groups**, or Reset All stops meaning "as Quick Setup made it". The dialog's tick boxes are generic: `_dlgOpen`
`opts.checks=[{key,label,hint,all}]` + `opts.checksState(ticks)` → `{ok,note}`; `onConfirm(ticks)`; helpers `_dlgTicksHTML / Read / Wire / Key`
(`_dlgTicksKey` = Enter on Cancel cancels). A dialog without `opts.checks` behaves exactly as before.

**The ONE dialog is modal (2026-09-21, 16ks fix)** — while `#dlg-overlay` is shown the page hears no key. `_dlgKeyGuard` sits on WINDOW in
the capture phase, so it runs before every document-level key listener; a new page shortcut needs no dialog check of its own. The dialog's
own keys: Tab / Shift+Tab walk its boxes and buttons (every dialog), Space acts on the focused box or button (its key-up is held back too:
the Advanced page's key-up handler calls preventDefault with a clip picked, which cancels the button press), Enter and Escape travel on
untouched to `_dlgKey` and the Escape rules. An auto-repeating Enter is dropped (Enter HELD on a focused button opened the window and
answered it unseen). A text box inside a dialog is never touched. Only keys whose default would act on the page behind are
default-prevented; browser / system keys keep working. `_dlgClickGuard` drops the 2nd / 3rd click of the multi-click that OPENED the dialog
(`_dlgOpenGesture`: raised by `_dlgOpen`, lowered by the next `detail===1` click; `detail 0` = keyboard or `btn.click()` is never looked at).
Never add a time-based "ignore clicks for N ms": the phone gate taps the dialog's button the moment it appears (16 phone checks broke).

**VIEW layer — `render*` assemblers + `_rc/_rf/_fs/_lp` helpers + HTML templates**
- `renderCanvas()` → `_rcChip`/`_rcAoiOverlay`/`_rcScreenBox`/`_rcOverlapVis`/`_rcDeadVis`
  Simple's scale (16lh-fit): `vMetrics()` → `_wpfScale` = min(width fit, height fit from the tiles' MEASURED heights); `renderCanvas` →
  `_wpfDraw` draws, measures, draws again until it settles, then `vMetrics` returns exactly the drawn scale. Anything that sizes or
  maps the Simple canvas must take its scale from `vMetrics()` (never recompute `(aw-56)/canvasW`) and must not resize `#canvas-area`
  from inside it (the ResizeObserver `_wpfWatch` re-fits on its size). HANDBOOK › 16lh-fit.
  16lh-fix: a held destination drag keeps the scale and the tile width it began with (`_wpfHoldSc` / `_wpfHoldOn`, keyed by the
  drag's `_homeDragSafety` object); only a canvas grown wider than the tile's room shrinks it. Every name drawn into HTML or an
  attribute goes through `_esc` (the canvas BG tag `_rcScreenBox` bgBadge and the table's BG cell did not). HANDBOOK › 16lh-fix.
  16li-bgsrc: a destination's BG may be a SOURCE at its own size and place, `p.bgBox[sid] = {src,x,y,w,h}` (destination px), read
  ONLY through `_bgsRec(p,s)` (it holds while the BG name is `src`; a preset without its own BG takes P01's) and drawn as ONE CSS
  background by `_bgsVal` inside `_rcScreenBox` / `_cbBgCss` (every canvas), mounted in Advanced by `_bgsGeom`. Its corner handles are
  live DOM (`_bgsFrameSync`), never emitted by `_rcScreenBox`. HANDBOOK › 16li-bgsrc.
  16li-blendui: the blend PX box sits right above the red % when a BG name or a layer is drawn where it would sit centred (`_u2Place`,
  run from a MutationObserver after every canvas draw; the Look Book via `_u2LbCanvas`); never move it from a render function. HANDBOOK › 16li-blendui.
  16li-fix: a SOURCE BG's outline and handles live ONE layer above the canvas (`.bgs-wrap`, z 12, the destination picture's place and
  turn, `_bgsFrameSync`), so no neighbour, combined member or blend hatch covers them; a handle on a cut-off side works from where it
  shows. Drag-to-move is one window capture `mousedown` (`_bgsGrabDown`), live only while the outline shows, yielding to whatever is
  drawn above the BG. Its W x H IS its source's resolution: `_bgsRes` reads the source card first, `_bgsRec` syncs a box to it on every
  read, `_bgsResFollow` runs from `_sysSetSourceMeta` / the Wire card setter, `_bgsResWrite` on a resize. A top / bottom blend zone's PX
  box and red % sit at its right end (`_U2YR` / `_U2YP`); the BLEND GROUP chip at the group's bounding-box corner. HANDBOOK › 16li-fix.
  16lj-followup: a later preset that follows P01's clip BG (no fill / SOURCE box of its own, the same BG name) draws P01's cover through
  `_fuClip` (draw only: `_rcScreenBox`, `_cbBgCss`, the table and panel swatches; Advanced still mounts the clip by name). The SOURCE BG
  resize reads the drag along a turned destination's axes (`_bgsStartResize`, as `_bgsStartMove`). The SOURCE list offers Wire hand-made
  source cards ("Made in Wire"); `_bgsPick` adopts such a card into `sources[]` (`_fuWcAdopt`, same undo step) so one card holds the
  resolution. HANDBOOK › 16lj-followup.
- Exports' readable print (16li-print: `_lbpInk`, `_wireLogoWordSvg`, `_wireTbFitText`): a value the Look Book prints in a colour made
  for the white page gets an inline colour from `_lbpInk(opts)` in the Dark book (never a stylesheet rule); words drawn into the Wire
  sheet's boxes are measured with `_wireTextWidth` and fitted (smaller, then "…"), never left to run past a line. HANDBOOK › 16li-print.
- Move arrows (`_renderMoveSymbol`, blend-arrows 2026-09-21): a `.move-symbol` overlay inside the PICKED `.screen-box`. For a blend
  group (the block from `_lbMvBlocks`) the ◀ lives in its OWN `.move-symbol` overlay inside the group's left-most box and the ▶
  inside the right-most box (never offset out of the picked box: a destination removed from the preset is a ghost box that
  clips its children, and the arrow vanished with it). Inline styles only: no CSS rule, nothing reaches an export.
  (`_rcDeadVis(pos,sc,pid,_print)`: the left / right PX / FT read-out stacks when the gap is narrower than one line; feet
  default to 16 PPI, 1 foot = 192 px, a stored PPI is kept. See HANDBOOK section 5.)
- `renderFullscreen()` (Advanced) → the SAME tile as Simple: `_rcPresetRow` (so `_rcScreenBox`/`_rcChip`/`_rcOverlapVis`/
  `_rcDeadVis`), then `_fsMountVideos` + `renderFsPanel`. The old `_rf*` helpers are dead code since build 16hx.
- `renderFsPanel()` → `_fsCrumb` + `_fsSourceBlockHTML` + `_fsInfoSectionsHTML` + `_lpAdvancedSection` (the same accordion
  the Simple layer panel uses) + `_fsLookSectionsHTML` + `_fsMediaSectionHTML` + `_fsTransitionSectionHTML`. The old
  `_fsCPR`/`_fsLayerCard`/`_fsScreenCard`/`_fsBlendRow` cards are dead code since build 16hu (verified 2026-09-20;
  removal list and cascade in `private/study-2026-09-20/unused_full.json`). `initMobileShell` / `initMobileMainView`
  are self-running blocks that LOOK unreferenced: deleting them deletes the phone build.
- Each helper ≤8KB, single job. Edit a helper = safe; touching the slim assembler
  = high-risk. Markup carries classes + `data-*` and is wired by actions/
  delegation — never reaching into data/logic. Focus styling is CSS
  (`[data-fx="<accent>"]:focus`), not inline `onfocus`/`onblur`. The combinations
  table uses one delegated dispatcher (`_homeOpenDropdown`, reads `data-home-*`).

## Change → verify-across-layers workflow (the regression guard)
1. Decide which layer owns the change: a state write (data) / an operation
   (controller) / markup or styling (view).
2. Edit that ONE layer at its single source of truth (the setter / the `actions.*`
   entry / the template + CSS).
3. Verify it against the other two:
   - Data setter changed → does the controller still call it correctly, and does
     the view render the result?
   - Action changed → does it hit the right setter and call `scheduleRender()`?
   - View changed → does it still call the right action/setter; do focus/styles hold?
4. Then standard checks: `node --check`, brace balance, preview smoke test of the
   affected flow + the 3 views (Video Presets / I/O Patch / Wire) for overlay
   resync, undo/redo, and a save/load roundtrip if the change is data-shaped.
   Zero console errors.

## What's next
1. Optional: extend the `actions.*` controller seam into the remaining low-churn
   areas (table cell setters, modals) — diminishing returns; only if asked.
2. StyleSeed UI rollout (skins: Tech/Black/Raycast) — ongoing, one screen at a time.
3. Electron packaging — DONE (2026-09-11/12): shell 0.2.0 with Welcome window; see project memory.

Recently done (see project memory for detail + gotchas):
- 3-layer migration, builds 16bq→16by (Phases 0→6): one batched redraw
  (`scheduleRender`), fully-encapsulated data layer, view↔style decoupled,
  `actions.*` controller seam across the main editing surface. Full regression
  sweep passed; stale version-warn threshold fixed (16by).
- Dead-code cleanup: 45 unused JS functions + 107 unused CSS rules removed (acorn
  AST + postcss). Reports in `mockups/dead_*_report.txt`.
- Look Book PDF export redesign (2026-06-15) — light theme + per-preset
  switcher-column breakdown + auto-split pagination.

## User context (Omar)
- AV/live events background. Use production terminology freely (DSM, AUX, IMAG,
  PGM, AOI, blend zones, GPI, etc.) — don't over-explain.
- Downloads the file after every clean session. Always surface the file path.
- Explain *why*, not just what. AV analogies welcome (router matrix, runsheet,
  GPI trigger).
- Ask before building when design is ambiguous. Better to confirm than rebuild.

## Working with the file
Quick sanity checks:
```bash
# Brace balance (should match)
grep -o '{' deploy/lookbook_builder.html | wc -l
grep -o '}' deploy/lookbook_builder.html | wc -l

# File size sanity (baseline at v0.2.148: ~2.0 MB / braces 7310 each; watch
# for sudden unjustified jumps — that's the template-literal corruption signature)
ls -la deploy/lookbook_builder.html

# Duplicate function definitions (known harmless nested locals: _c, close, esc, esc2, find, mv, newPage, nl,
# pillStyle, place, union, up). `python3 tools/check_js.py` does this check and the syntax check for you.
grep -oE 'function [_a-zA-Z][_a-zA-Z0-9]*' deploy/lookbook_builder.html | sort | uniq -d

# Quick JS syntax check (extracts <script> block and runs node --check)
python3 -c "import re; src=open('deploy/lookbook_builder.html').read(); m=re.search(r'<script>(.*?)</script>', src, re.DOTALL); open('/tmp/lb_script.js','w').write(m.group(1))" && node --check /tmp/lb_script.js
```

## Release channels + regression gate (established 2026-09-19, v0.2.148)
Users must never receive a build that has not passed the gate. Two lines:
- **Stable = `release/0.8`** (v0.8.0 = build 16lb, v0.8.1 = build 16lc, 2026-10-02; v0.8.2 = builds 16ld-16lg, v0.8.3 = build 16lh, 2026-10-08; v0.8.4 = build 16li, 2026-10-09), tags without a suffix (`v0.8.5`). These reach every user (Windows self-update,
  Mac content update). Only cherry-picked bug fixes land here.
- **Development = `main`**, tags WITH a `-` (`v0.9.0-beta.1`). The workflow publishes those as pre-releases;
  both updaters ignore pre-releases, so users stay on the last full release. Bump `electron/package.json` to
  the matching `0.9.0-beta.N` before tagging.
- **Before any full release** run `node tests/run_smoke.mjs --no-mobile` (must print `SMOKE: PASS`; the phone build is FROZEN since
  2026-09-30 by the owner: no phone features, no phone checks), `python3 tools/check_js.py`, and
  open the three example shows by hand. `tests/golden/` is the behaviour of v0.8.0: a difference is a
  regression unless the change was intended, in which case regenerate with `--golden` in the same commit and say so.
- Full checklist: `RELEASE.md`. The smoke probe (`tests/smoke_probe.js`) is where new core behaviour gets a check
  added when it ships.
- **Operating manual: `HANDBOOK.md`** — where things live, the safe edit pattern, how to test in the browser and
  the dev shell, the build discipline, product rules that are not obvious from the code, and the owner's working
  rules. Read it at the start of a session. The assistant's auto-memory lives on the owner's Mac per working
  directory; the repo (CLAUDE.md + HANDBOOK.md + RELEASE.md + tests/) must be enough on its own.

<!-- Reading receipt for session start: CORE-148-LOCKED (report this code to the owner after reading this file in full) -->

<!-- 16kv-dates -->

<!-- 16kv-fix -->

<!-- 16kw-menus --><!-- 16kw-fix --><!-- 16kw-r2 --><!-- 16kw-r3fix --><!-- 16kx-backdrop --><!-- 16kx-r2 --><!-- 16kx-r2fix -->

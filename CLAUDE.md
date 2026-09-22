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
  toggles (`toggleAdvFeature`; the menu read "Advanced" on screen until 2026-09-21, code names keep `adv`), DSM-panel content. (Layer-properties panel buttons are wired via
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
- **Stable = `release/0.2`**, tags without a suffix (`v0.2.149`). These reach every user (Windows self-update,
  Mac content update). Only cherry-picked bug fixes land here.
- **Development = `main`**, tags WITH a `-` (`v0.3.0-beta.1`). The workflow publishes those as pre-releases;
  both updaters ignore pre-releases, so users stay on the last full release. Bump `electron/package.json` to
  the matching `0.3.0-beta.N` before tagging.
- **Before any full release** run `node tests/run_smoke.mjs` (must print `SMOKE: PASS`), `python3 tools/check_js.py`, and
  open the three example shows by hand. `tests/golden/` is the behaviour of v0.2.148: a difference is a
  regression unless the change was intended, in which case regenerate with `--golden` in the same commit and say so.
- Full checklist: `RELEASE.md`. The smoke probe (`tests/smoke_probe.js`) is where new core behaviour gets a check
  added when it ships.
- **Operating manual: `HANDBOOK.md`** — where things live, the safe edit pattern, how to test in the browser and
  the dev shell, the build discipline, product rules that are not obvious from the code, and the owner's working
  rules. Read it at the start of a session. The assistant's auto-memory lives on the owner's Mac per working
  directory; the repo (CLAUDE.md + HANDBOOK.md + RELEASE.md + tests/) must be enough on its own.

<!-- Reading receipt for session start: CORE-148-LOCKED (report this code to the owner after reading this file in full) -->

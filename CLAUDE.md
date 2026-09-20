# Look Book Builder — Project Context

## What this is
Single-file HTML/CSS/JS application for AV/live event production planning.
Target users: show callers and project managers in live events.
Plans screen configurations, layer assignments, DSM/AUX outputs, and preset
combinations, then exports as TSV/CSV spreadsheets and a look book PDF.

## File layout
- `deploy/lookbook_builder.html` — **THE single master file** (~1.29MB). All edits land here.
  This is also the file Netlify deploys, so the same file you're editing is the
  one users see — no separate "publish" step. **As of 2026-06-14 this file CONTAINS
  the mobile build** (gated by `body.is-mobile`); the old `lookbook_builder_v2.html`
  mobile sandbox was merged in and retired. There is now ONE working file — no more
  V1/V2 dual-file porting.
- `deploy/index.html` — separate "Guided Tour" landing page (Netlify serves it at
  the root); its CTA links to `lookbook_builder.html`. Not a copy of the app.
- `backups/` — known-good checkpoints. Snapshot here before every risky edit.
  Restore points (newest first):
  - `backups/lookbook_builder_v1-desktop-only_2026-06-14.html` — last desktop-only
    production, captured just before the mobile cutover. Restore this if the mobile
    merge ever regresses the desktop experience.
  - `backups/lookbook_builder_good_model_2026-05-19.html` — older locked-in baseline.
  ```bash
  cp backups/lookbook_builder_v1-desktop-only_2026-06-14.html deploy/lookbook_builder.html
  ```
- `exports/` — test exports (.avlb, .tsv, .csv)
- `electron/` — the AV Look Book desktop shell (Electron 33): `main.js` (Welcome window,
  one window per project, recents + thumbnails, GitHub-Release content updates),
  `preload.js` / `welcome-preload.js` bridges, `welcome.html`. Installers are built by
  `.github/workflows/release.yml` on every `v*` tag → GitHub Releases (repo AVEducate/AV-Look-Book).
- `app/` — **legacy folder, no longer in use.** The file used to live here;
  it was renamed into `backups/` on 2026-05-19 as the good-model safety net.
  Do not put new working copies here.

Open `deploy/lookbook_builder.html` directly in Chrome to test. No build step.

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
  (`pushUndo`/`doUndo`/`doRedo`, JSON snapshots). NOTE: `addPreset`,
  `deletePreset`, `setScreenApproved` push undo INTERNALLY; `addDSM` does NOT —
  don't double-push.

**CONTROLLER layer — `actions.*` (one named fn per user operation)**
- The view calls `actions.X(...)`; each action does `[pushUndo if needed] →
  data setter/mutator → scheduleRender()`. One place to find/change an operation.
  Covers toolbar, preset-row, DSM toolbar, screen-panel show-mode, advanced
  toggles, DSM-panel content. (Layer-properties panel buttons are wired via
  `addEventListener` in `wireEvents` — already decoupled; a valid alternative.)
- Redraw is ONE batched path: **`scheduleRender()`** (rAF-coalesced) calls
  `render()` and resyncs whichever overlay is open (`_sysRefreshIfOpen` +
  `_wireRefreshIfOpen`). Use it after a mutation instead of bare `render()` /
  `renderFullscreen()`. EXCEPTION: per-frame drag move-loops (`function mv`) and
  mobile `_mb*` stay synchronous `render()` for same-frame paint — don't convert.

**VIEW layer — `render*` assemblers + `_rc/_rf/_fs/_lp` helpers + HTML templates**
- `renderCanvas()` → `_rcChip`/`_rcAoiOverlay`/`_rcScreenBox`/`_rcOverlapVis`/`_rcDeadVis`
- `renderFullscreen()` → `_rfChip`/`_rfScreenBox`/`_rfOverlapHtml`/`_rfDeadHtml`
- `renderFsPanel()` → `_fsCPR`/`_fsLayerCard`/`_fsScreenCard`/`_fsBlendRow`
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

# File size sanity (baseline as of build 16by: ~1.37MB / braces 6001 each; watch
# for sudden unjustified jumps — that's the template-literal corruption signature)
ls -la deploy/lookbook_builder.html

# Duplicate function definitions (should print only known nested locals:
# esc, find, mv, newPage, nl, pillStyle, union, up)
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
- **Before any full release** run `node tests/run_smoke.mjs` (must print `SMOKE: PASS`), the syntax checks, and
  open the three example shows by hand. `tests/golden/` is the behaviour of v0.2.148: a difference is a
  regression unless the change was intended, in which case regenerate with `--golden` in the same commit and say so.
- Full checklist: `RELEASE.md`. The smoke probe (`tests/smoke_probe.js`) is where new core behaviour gets a check
  added when it ships.

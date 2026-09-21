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
  `#dlg-cancel`. Never hide or remove it in a test, or every later confirm silently does nothing.
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
- A new router / switcher is placed by `_wireAdvFreeSpot` (never on another tile); a tile that grows pushes the tiles
  stacked under it down (`_wireAdvPushBelow`).
- THE NAME: the product is "AV Look Book". The page's `<title>` and every `document.title` still end in
  " — Look Book Builder" ON PURPOSE: installed desktop shells strip that exact ending to name a show in Recents
  (`electron/main.js`, `page-title-updated`) and Mac shells cannot self-update. Do not change the ending until a shell
  that accepts both has been out long enough. The file name `lookbook_builder.html` is load-bearing too (content
  updater URL, release workflow, `copy-html`).
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
Phone / tablet build: read `PHONE.md` before touching anything under `initMobileShell` or the `body.is-mobile` CSS.

Reading receipt: **HANDBOOK-12G-SDI**. Report this code to the owner after reading this handbook in full.

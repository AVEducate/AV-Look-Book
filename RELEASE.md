# AV Look Book — how a change reaches users

Two lines, two kinds of tag. Users only ever see full releases.

| Line | Branch | Tags | Who gets it |
|---|---|---|---|
| Stable | `release/0.4` | `v0.4.1`, `v0.4.2` … (no suffix) | Every user: Windows self-update + Mac page update |
| Development | `main` | `v0.5.0-beta.1`, `v0.5.0-beta.2` … (a `-` in the tag) | Nobody automatically. Install by hand from the pre-release |

The workflow marks a tag with a `-` in it as a **pre-release**. The Windows updater and the in-app content updater
(`releases/latest`) both ignore pre-releases, so a beta never reaches a user.

## The owner tests first (rule since 2026-09-20)
Nothing is pushed, tagged or released until the owner has tried it on his own Mac and said so.
1. The change is built on `main`, checked (`tools/check_js.py`) and driven in the browser, the gate is run, and the
   work is committed LOCALLY. No `git push`, no tag.
2. The owner double-clicks **`Test AV Look Book.command`** in the repo folder. It opens the desktop app straight from
   this folder with the page in `deploy/`, using its own data folder (`av-look-book-dev`), so the installed app and
   its shows are never touched. The build stamp at the bottom right of the window must match the build under test.
3. When the owner says it works: push `main`. When he says "release it": run the gate below and tag a full release.
   If he finds a problem: fix, re-run the gate, he tests again. Users have seen nothing in the meantime.

## Day to day
- Build on `main`. Bump `electron/package.json` to the beta version (`0.5.0-beta.N`) and tag `v0.5.0-beta.N`.
- A user-facing bug: fix it on `main`, then `git cherry-pick` that one commit onto `release/0.4`, bump the patch
  version there (`0.4.1`), tag `v0.4.1`. Users get the fix and nothing else.
- Features ship in one jump: when `main` is ready, run the gate below, then tag `v0.5.0` (no suffix) from `main`,
  and cut `release/0.5` from that tag. `release/0.4` retires. (v0.4.0 shipped this way on 2026-09-25 from 16ku;
  v0.3.0 on 2026-09-22 from 16ks, lifting the 2026-09-14 freeze.)

## The release gate (before any tag without a suffix)
1. `node tests/run_smoke.mjs` prints `SMOKE: PASS`. Every difference it reports must be one we meant; if a change
   was intended, regenerate the goldens from that build (`--golden`) in the same commit and say so in the message.
2. `python3 tools/check_js.py` exits 0 (syntax, brace balance, no new duplicate function names).
3. Open the three example shows (General Session, Awards Night, Town Hall) in the app: Video Presets Simple and
   Advanced, Wire Simple and Advanced, I/O Patch, export the Look Book and the Excel, open both.
4. `electron/package.json` version matches the tag. Commit, push, tag, push the tag, watch CI go green.
5. Append the build's notes to the project memory.

## The smoke test
- `tests/smoke_probe.js` runs inside the app and snapshots the show model, every preset's layout (BG, layers,
  crops, effects, AUX), the I/O list, the Excel rows, the Look Book HTML (dates, build stamps and pictures
  normalised) and the Simple wire labels, for each example show.
- `tests/flows_probe.js` then DRIVES the app like a user on General Session, in Simple and Advanced, across Video
  Presets, Wire and I/O Patch: add / remove presets, destinations and AUX, the layer panel, media layers (lock, scale,
  source crop, corner drag), a clip BG and the timeline, source rename, pinch zoom, pinned headers, the switcher ID
  cells, the router matrix and name follow-through, devices, page copy, I/O meta and backup window, the Look Book
  through its real export window, the Excel rows, Quick Start, Help, Report a bug. Page errors are collected too.
  A check that already fails at the trusted version is a KNOWN ISSUE in the golden and is printed every run.
- `tests/mobile_probe.js` (run by `tests/run_mobile_stage.mjs`) walks the PHONE build with phone emulation and real
  touch taps, portrait and landscape: launch, Open a show file, the three examples, the preset editor (visualiser fit,
  live picture, docked panels), Wire, I/O cards, exports and windows, plus per-screen budgets for tap targets under
  44 px and text under 11 px that may never rise. See `PHONE.md`.
- `tests/run_smoke.mjs` serves `deploy/`, drives headless Chrome, runs both probes, then the phone stage
  (`--no-mobile` skips it), and diffs against `tests/golden/`.
  `--flows-only` skips the three snapshots while you work. Randomness is seeded inside the probes (the app gives an
  uncoloured source a random cable colour), and dates are normalised, so two runs of the same page always match.
  Needs Node 22 and Chrome (`LB_CHROME=/path/to/chrome` to override).
- On `release/0.4` `tests/golden/` is the behaviour of **v0.4.0**, the version users trust. On `main` it follows
  each intended change (regenerated in the same commit, named in the message). Regenerate only on purpose.

## Backups of the trusted version
- Source: tag `v0.4.0`, branch `release/0.4` (the previous trusted version: tag `v0.3.0`, branch `release/0.3`).
- Installers and page: the GitHub release for v0.4.0 (Mac arm64 / x64 DMG, Windows EXE, `lookbook_builder.html`).
- Local: the page at v0.4.0 is build 16ku (`deploy/lookbook_builder.html` at tag v0.4.0);
  `backups/lookbook_builder_2026-09-23_before-16kt.html` is the page at v0.3.0 (build 16ks) and
  `backups/lookbook_builder_2026-09-19_before-16kf.html` the page at v0.2.148.

---
Reading receipt: **GATE-BEFORE-USERS**. Report this code to the owner after reading this checklist in full.

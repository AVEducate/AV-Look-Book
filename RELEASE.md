# AV Look Book — how a change reaches users

Two lines, two kinds of tag. Users only ever see full releases.

| Line | Branch | Tags | Who gets it |
|---|---|---|---|
| Stable | `release/0.2` | `v0.2.149`, `v0.2.150` … (no suffix) | Every user: Windows self-update + Mac page update |
| Development | `main` | `v0.3.0-beta.1`, `v0.3.0-beta.2` … (a `-` in the tag) | Nobody automatically. Install by hand from the pre-release |

The workflow marks a tag with a `-` in it as a **pre-release**. The Windows updater and the in-app content updater
(`releases/latest`) both ignore pre-releases, so a beta never reaches a user.

## Day to day
- Build on `main`. Bump `electron/package.json` to the beta version (`0.3.0-beta.N`) and tag `v0.3.0-beta.N`.
- A user-facing bug: fix it on `main`, then `git cherry-pick` that one commit onto `release/0.2`, bump the patch
  version there (`0.2.149`), tag `v0.2.149`. Users get the fix and nothing else.
- Features ship in one jump: when `main` is ready, run the gate below, then tag `v0.3.0` (no suffix) from `main`,
  and cut `release/0.3` from that tag. `release/0.2` retires.

## The release gate (before any tag without a suffix)
1. `node tests/run_smoke.mjs` prints `SMOKE: PASS`. Every difference it reports must be one we meant; if a change
   was intended, regenerate the goldens from that build (`--golden`) in the same commit and say so in the message.
2. Syntax / brace / duplicate check on the page (`scratchpad/check_js.py` or the equivalent).
3. Open the three example shows (General Session, Awards Night, Town Hall) in the app: Video Presets Simple and
   Advanced, Wire Simple and Advanced, I/O Patch, export the Look Book and the Excel, open both.
4. `electron/package.json` version matches the tag. Commit, push, tag, push the tag, watch CI go green.
5. Append the build's notes to the project memory.

## The smoke test
- `tests/smoke_probe.js` runs inside the app and snapshots the show model, every preset's layout (BG, layers,
  crops, effects, AUX), the I/O list, the Excel rows, the Look Book HTML (dates, build stamps and pictures
  normalised) and the Simple wire labels, for each example show.
- `tests/run_smoke.mjs` serves `deploy/`, drives headless Chrome, runs the probe and diffs against `tests/golden/`.
  Needs Node 22 and Chrome (`LB_CHROME=/path/to/chrome` to override).
- `tests/golden/` was generated from **v0.2.148**, the version users trust. Regenerate only on purpose.

## Backups of the trusted version
- Source: tag `v0.2.148`, branch `release/0.2`.
- Installers and page: the GitHub release for v0.2.148 (Mac arm64 / x64 DMG, Windows EXE, `lookbook_builder.html`).
- Local: `backups/lookbook_builder_2026-09-19_before-16kf.html` is the page at v0.2.148.

---
Reading receipt: **GATE-BEFORE-USERS**. Report this code to the owner after reading this checklist in full.

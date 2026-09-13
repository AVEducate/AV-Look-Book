# AV Look Book — Desktop (Electron)

The desktop app is a thin Chromium shell around the single-file web app
(`../deploy/lookbook_builder.html`). It runs **online or offline** and keeps all
drafts / autosave / settings in one place.

## How it loads ("one home")
The window always opens `app://lookbook/`, an internal address served by
`main.js`. That address returns the **newest copy of the app we have**:

| Copy | Where | When it wins |
|---|---|---|
| Bundled | `app/index.html` (packed into the installer) | fresh install / offline |
| Downloaded | `<userData>/latest.html` | when its `build 2026-06-16xx` stamp is newer |

Because the origin never changes, localStorage (drafts, settings) is the same
whether the machine is online or offline.

## Updates
- **App content (the HTML)** — on launch and every 4 h, when online, the shell
  fetches `https://github.com/AVEducate/AV-Look-Book/releases/latest/download/lookbook_builder.html`.
  If the build stamp is newer it's saved and a small "Update ready — Restart now / Later"
  note appears in the window. Offline: nothing happens, nothing is shown.
- **The shell itself** — `electron-updater` + GitHub Releases (`autoUpdater` runs in
  packaged builds only). Needs code signing on macOS before it can apply updates.

## Release flow (GitHub Actions)
`.github/workflows/release.yml` builds on every `v*` tag:
```bash
# from ~/LookBook, after the HTML is committed:
git tag v0.1.0
git push origin v0.1.0
```
It produces and attaches to the GitHub Release:
- `AVLookBook-mac-arm64.dmg`, `AVLookBook-mac-x64.dmg` (versionless names → permanent `releases/latest/download/…` links)
- `AVLookBook-win-x64.exe` (NSIS installer)
- `lookbook_builder.html` (what installed apps download as a content update)

Bump `version` in `package.json` before tagging a new shell; content-only
updates just need the HTML committed + a new tag (any version bump is fine).

## Run it locally (dev)
```bash
cd electron
npm install          # first time only (downloads Electron — large)
npm start            # copies the latest HTML into app/ and opens the window
```

## Build installers locally
```bash
npm run dist:mac     # -> dist/AVLookBook-mac-<arch>.dmg   (on a Mac)
npm run dist:win     # -> dist/AVLookBook-win-x64.exe      (on Windows / CI)
```

## Code signing (later)
- macOS: Apple Developer Program ($99/yr) → signing + notarization. Until then
  users right-click → Open the first time (Gatekeeper warning).
- Windows: a code-signing cert to avoid the SmartScreen warning.
- The workflow sets `CSC_IDENTITY_AUTO_DISCOVERY=false` (unsigned) for now.

## Bridge (`window.lookbookNative`)
Exposed by `preload.js` to the web app:
`isDesktop`, `version`, `info()`, `checkForUpdates()`, `relaunch()`,
`getEntitlements()`, `activateLicense(key)` (the last two are stubs for the
free-core + paid add-ons plan — see project memory).

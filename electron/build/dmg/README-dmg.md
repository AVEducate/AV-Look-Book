# The Mac install window (DMG)

- `background.html` → `background.png` (660 x 500), `background@2x.png` (1320 x 1000), `background.tiff` (both, via
  `tiffutil -cathidpicheck background.png background@2x.png -out background.tiff`). Render the PNGs with headless Chrome
  (window 660 x 760, crop the top 500 px) or Electron (`render.js`). `preview.html` / `preview@2x.png` = a mock-up only.
- `package.json` › `build.dmg`: title "AV Look Book" (the disk name — keep it, the template below is made for it),
  background `build/dmg/background.tiff`, iconSize 96, window 660 x 528 (Finder counts the title bar; the design ends by
  y = 450 so it also fits when a user shows the path bar), icons at (190, 296) and (470, 296). Never also set
  `backgroundColor` (electron-builder refuses both).
- **Why there is a template:** electron-builder's own .DS_Store (dmgbuild) links the background in a way current macOS
  Finder ignores (blank window on macOS 26, APFS and HFS+ alike). A .DS_Store written by Finder works, so
  `DS_Store.template` is one made by Finder, and `finish-dmg.mjs` copies it into every DMG after `electron-builder --mac
  --publish never`, then refreshes the blockmaps and latest-mac.yml (the release workflow does this; see release.yml).
- **Remake the template** (only when the window size, icon places or disk name change):
  1. `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg --arm64 --publish never -c.directories.output=/tmp/dmgt`
  2. `hdiutil convert /tmp/dmgt/AVLookBook-mac-arm64.dmg -format UDRW -o /tmp/rw.dmg`
  3. `hdiutil attach /tmp/rw.dmg -readwrite -noverify -noautoopen` (NOT -nobrowse: Finder must see the disk), then
     `rm "/Volumes/AV Look Book/.DS_Store"`
  4. `osascript build/dmg/make-template.applescript` (edit the bounds / positions there first; macOS may ask to allow
     control of Finder)
  5. `cp "/Volumes/AV Look Book/.DS_Store" build/dmg/DS_Store.template` and `hdiutil detach "/Volumes/AV Look Book"`
  6. Check: `node build/dmg/finish-dmg.mjs /tmp/dmgt`, open the DMG, look at the window.

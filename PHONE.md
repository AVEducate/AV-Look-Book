# AV Look Book — the phone and tablet build

What the phone / tablet layout is for, how it is put together, what it can and cannot do, and the rules that keep
it working. Written so a fresh session (or a fresh person) can work on it from the repo alone. HANDBOOK.md is how
the project is worked on; this file is the phone build only. Written 2026-09-20 against the page at
build 16ki. Anything marked **(build 16ki)** was added or fixed in that build and is covered by the phone stage of
the gate (`tests/mobile_probe.js`). Line numbers drift, so things are named by function;
a line number is only ever "near".

## 1. Purpose and status

Owner's decisions, 2026-09-20 (as recorded that day):

> The phone / tablet version is for REVIEWING a show away from the desk. Someone receives a show file by email,
> opens it, looks (may adjust), and sends it back with Send to be reopened on the desktop. It is offline, so files
> only travel by email / the share sheet.
>
> Tablets are more likely than phones. The phone is the extreme size it must still work at.
>
> It is a stripped-down version of the DESKTOP workflow that reuses the desktop panels, not a different app.
>
> Future plan: ship it as an app for Apple and Android (App Store and Google Play) that wraps this same page so it
> scales on the device.

Status today:
- The phone build is the June 2026 prototype, merged into the one master file on 2026-06-14. Both code headers
  still call it "MOBILE SHELL (V2 prototype)". The phone JS was last worked on 2026-06-15/16; later passes
  (06-23, 08-28, 09-11, 09-15) were small fixes and CSS. Most of what the desktop gained after 2026-09-12 (Wire
  destination cards, the layer accordion, page bars, I/O Advanced, backup pairs, the BG layer, pinch zoom) was built
  without a phone pass.
- The 2026-09-20 audit (code read, a headless walk at 390×844 and 844×390, a documentation search) found that every
  screen agrees with the show data, the page never scrolls sideways, and no page errors occur. It also found the
  bugs listed in section 14, which were fixed in build 16ki.
- This supersedes the 2026-09-11 note "desktop-first; mobile is not a priority, phone app not for a while".

## 2. How a device gets the app

- **Today no real phone or tablet can load it.** The old website is retired (CLAUDE.md, "File layout"). The desktop
  shell cannot go narrower than 1024 px (`electron/main.js`, `minWidth`, near line 178). The GitHub release copy of
  the page is a file download, not a hosted page. **Phone testing therefore means emulation** (section 11).
- **Plan:** an App Store / Google Play app that wraps `deploy/lookbook_builder.html` unchanged. No wrapper exists in
  the repo yet. The comment above `shareProject` already names it as "THE SINGLE SWAP POINT" for a wrapped app's
  native save + share. That comment mentions Capacitor; no tool has been chosen.
- **Offline.** The page needs no network. A show arrives as an `.avlb` email attachment and leaves through Send.
- **Drafts.** Outside the desktop shell the page boots through `restoreAutoSave()`: if a browser draft exists it
  offers "Restore Draft". Autosave runs from `render()` and is flushed on `pagehide`. In a wrapper the draft lives in
  the app's own storage.
- The page has `<meta name="viewport" content="width=device-width, initial-scale=1">`. Never remove it: without it a
  real phone draws the desktop layout zoomed out (the 2026-06-15v bug, invisible in emulation).
- `deploy/_headers` holds Netlify cache rules from June. With the site retired they do nothing.

## 3. Detection

**The rule** (`detectMobile`, inside the self-running `initMobileShell`, near line 28800):
- `phoneLike` = the device reports `(pointer: coarse) and (hover: none)`. This does not change with rotation.
- `narrowWindow` = `window.innerWidth <= 768`. Kept so a narrow desktop window trips the phone layout for testing.
- `is-mobile` = `phoneLike OR narrowWindow`. It is set as a class on `<body>` and re-evaluated on every `resize`.
- **Force flag:** `window.LB_FORCE_MOBILE = true` (or `false`) overrides the rule. It must be set BEFORE the page
  loads to get a clean start. Read the result with `window.LB_isMobile()`.

**The CSS gates.** The class alone does not give you the phone layout:
- Three blocks are wrapped in `@media (max-width: 768px), (max-height: 600px)` (near lines 2496, 2558 and 3580):
  the toolbar strip-down, `#mobile-main` replacing the canvas / table / bottom bar, and the Wire restyle. The
  `max-height` half was added 2026-06-15 so a phone in landscape (about 900×430) keeps the phone layout.
- Quick Setup has its own width-only block, `@media (max-width: 768px)` (16ef), not tied to the class.
- Some `body.is-mobile` rules sit OUTSIDE any size gate: `#vp-tabs` hidden, 44 px minimum height on modal, dialog and
  `.sys-btn` buttons, the right-hand resolution sheet, the full-screen cable colour editor, the Wire diagram padding,
  the Wire style-bar swap, `#wire-align-panel` and `#lb-kbviz` hidden, and the Wire rotate prompt (orientation only).
- The 16gp "one menu look" for I/O pills and the combinations table is scoped `body:not(.is-mobile)`.
- The comments above both phone blocks still say "both gates must pass / narrow AND coarse", mention a "V2 PROTO"
  marker and a second file to diff against. All three statements are out of date.

**Tablets get the DESKTOP layout (build 16ki).** Through 16kh the JS rule (pointer type) and the CSS gates (size)
disagreed on every tablet: the class was on but the phone CSS was off, so a tablet showed the desktop layout with the
phone code running underneath. I/O Patch appeared to do nothing (it was redirected into the hidden `#mobile-main`),
Video Presets Advanced was blocked, a layer tap opened the old bottom sheet, and Wire was forced to Simple. This is
what the owner saw on 2026-06-23 ("the layer properties is showing the cell phone version"). Reproduced in headless
Chrome at 820×1180 and 1180×820 on 2026-09-20.

The rule now: `is-mobile` goes on for a narrow window (768 px or less), OR for a touch device ONLY when the phone CSS
will also be on (`(max-width: 768px), (max-height: 600px)`). So:
- Phone portrait and phone landscape (844×390, 932×430): phone layout, as before.
- Tablet portrait and landscape (820×1180, 1180×820): the full desktop layout; I/O Patch, Video Presets Advanced and
  Wire Advanced all work; taps and number fields work; touch-DRAG on the desktop canvas does not (it listens for
  mouse events only), which is acceptable for review.
- A small tablet (744 px wide in portrait) is phone layout in portrait and desktop layout in landscape.
- On any touch device the Load / Open control opens the plain file picker with NO file-type filter, because phone and
  tablet pickers grey out an extension they do not know (`.avlb`).
Known limit: tablet PORTRAIT is the desktop layout at about 820 px, so the toolbar wraps to two rows and the I/O Patch
Notes / Actions columns run off the right edge. Landscape is fine.

## 4. Screen map

| Screen | How you get there | Code |
|---|---|---|
| Empty state, "No Preset Yet" | No destinations and no presets. One button opens Quick Setup. **(build 16ki)** a second control, "Open a show file", sits here. | `emptyStateHTML`, `openQS` |
| Restore Draft dialog | Launch, when a browser draft exists. | `restoreAutoSave` |
| Quick Setup (new show) | From the empty state. Same desktop modal; the three example shows are here. | `openQS`, `lbOpenExample` |
| Preset list (home) | Default Video Presets view: the Show card, one card per preset (code, name, notes, pencil, four count chips: Dest / AUX / Outs / Layers), then "+ New Preset". | `renderMobileMain`, `quickGuideCardHTML`, `presetCardHTML`, `mbPresetStats` |
| Show card | Top of the list. Read-only show name, date, venue. Tap = Quick Setup in edit mode (no examples). Paper-plane = Send. **(build 16ki)** also carries "Open a show file". | `quickGuideCardHTML`, `openQSEdit`, `confirmQSEdit`, `shareProject` |
| Preset edit | Pencil on a preset card. Full screen, tool pill hidden (`body.mb-layers`). Header: back arrow, code + name, "Edit Preset" badge. | `mobileOpenPreset` → `mobileOpenLayers` → `layersViewHTML` |
| Visualiser | Sticky under the header. All destinations plus the AUX / DSM strip, drawn by the desktop helpers and scaled to the width. Display only; a tap opens the matching row. | `mbPresetVisual`, `mbVisTap`, `mbScrollToRow` |
| Destination row | Tap a wall or its row. Move Left / Right, then the real desktop Destination panel docked inline. | `mbDestRow`, `mbOpenDestInline`, `mbMoveDest` |
| Layer row | Tap a chip or a "D1·L2" row. The real desktop Layer panel, docked, with its Simple / Advanced toggle. | `mbOpenLayerInline` |
| AUX / DSM row | Tap an AUX box or row. The real desktop AUX panel, docked. | `mbDsmRow`, `mbOpenAuxInline` |
| ± buttons | Bottom of each section: − DEST / + DEST, − LAYER / + LAYER, − AUX / + AUX. | `mbAddDest`, `mbRemoveDest`, `mbAddLayerInline`, `mbRemoveLayerInline`, `mbAddAux`, `mbRemoveAux` |
| I/O Patch | Nav pill. Source cards then Destination / AUX / MV cards: name, connector, type, resolution, notes, bandwidth warning. Resolution opens a sheet from the right. | `ioViewHTML`, `ioSourceCard`, `ioDestCard`, `ioGatherDests`, `mbIoSet`, `mbIoOpenRes` |
| Wire, portrait | Nav pill while upright: "Rotate your phone". | `injectWireRotate`, `body.mb-wire-active` |
| Wire, landscape | The real desktop Wire overlay in Simple view: source / destination cards on the left (collapsible), the diagram, zoom and Fit, one-finger pan, pinch zoom. | `wrapNav`, `mbWireSetupOverlay`, `mbWireTouchStart/Move/End` |
| Cable colour editor | Tap the swatch on a Wire source card. Full screen. | `_mbOpenCableColor` |

## 5. Feature matrix: desktop against phone

BY DESIGN = an owner decision is on record. NOT BUILT YET = in scope for the purpose but missing. TO DECIDE = no
decision on record; nobody wrote down whether it was left out on purpose.

| Desktop feature | On the phone | Status |
|---|---|---|
| Open a show file | **(build 16ki)** "Open a show file" on the empty state and the Show card. Through 16kh there was no way in except Quick Setup, an example or a browser draft. | BY DESIGN (2026-09-20) |
| Send | The paper-plane shares the `.avlb` only, through the share sheet (`shareProject`). Desktop Send (`sendShow`) mails the Look Book and Excel too. | BY DESIGN |
| Save / Save As to disk | None. Autosave draft plus Send. Files travel by email / share sheet only. | BY DESIGN (2026-09-20) |
| New show or an example once a show is open | No path; only from the empty state. | TO DECIDE |
| Undo / Redo | No button. Some phone actions push an undo step, some do not (section 8). **(16kt)** No Undo control was added; instead the phone is not offered the one action it could not take back — see the Layer panel row — and the "Remove from ALL presets" window says "This cannot be undone on a phone." | TO DECIDE |
| Look Book PDF, Excel, I/O Excel, Wire drawing | No button can be reached. All four still run at phone size if called from code. | TO DECIDE |
| Help, Report a bug, Skin | No button. **(build 16ki)** the Help window's tab bar fits at phone width (it was 565 px of tabs in a 372 px box). Help text is desktop talk throughout. | TO DECIDE |
| Video Presets Simple canvas | One preset at a time in the visualiser. No drag, no resize, no overlap / dead-space / blend overlays. | BY DESIGN (2026-06-15) |
| Video Presets in landscape | Retired 2026-06-15. The edit view still draws in landscape but leaves almost no room on a phone. | BY DESIGN |
| Video Presets Advanced (engineer view: clips, timeline, speed, source crop, BG as layer 0) | Hidden and blocked (`#vp-tabs`, `_vpSetView`). Cover stills still show on the chips. | TO DECIDE (the 16ht commit says "engineer mode stays desktop-only"; no owner decision on record) |
| Layer panel, Simple and Advanced sections | The same desktop panel, docked. It always opens on Simple (`_mbLayerAdv` is never set true). **(16kt)** Simple carries ONE Remove key on the phone — "Remove from this preset" — where the desktop carries both; Advanced carries both on the phone as it always did (`_lpRemoveLocal` branches on `body.is-mobile`). | BY DESIGN (2026-06-16) |
| Destination panel (W/H, X/Y, rotation, BG, show mode) | The same desktop panel, docked. **(no-overlap guard, 2026-09-21)** Since 16kr the phone REFUSES: Apply, paste and reset that would cover another destination are put back with one alert ("Destinations can't overlap ... Blends are made in the desktop layout."), because the phone has no Modifiers menu and every modifier is off there. NOT covered on the phone: the resolution picker (`mbOpenResPicker`) and Move Left / Right (`mbMoveDest` swaps top-left corners, so two destinations of different width end up overlapping). | BY DESIGN |
| AUX / DSM panel | The same desktop panel, docked. | BY DESIGN |
| Picture follows an edit live | **(build 16ki)** the visualiser redraws after a size APPLY, a fader move or a content pick while a panel is docked. Through 16kh it stayed frozen until the panel closed. | BY DESIGN |
| Move a destination | ◀ ▶ on the selected wall in the visualiser AND Left / Right in the row. Swaps positions in every preset. | BY DESIGN (2026-06-15) |
| Add / remove destination, layer, AUX | ± pairs at the bottom of their own section. − DEST and − AUX remove the LAST one and ask first; − LAYER removes the open layer without asking; + LAYER lands on D1 unless a layer is open. | Placement BY DESIGN; which item "−" removes TO DECIDE |
| Presets: delete, duplicate, reorder | Add only ("+ New Preset" copies P01). | TO DECIDE |
| AOI, Blend, Dead space, Free position | Hidden; the Modifiers menu (the old "Advanced" gear menu) lives on the desktop preset tiles (the bottom-bar button became the greyed-out Educator placeholder in build 16kq). | TO DECIDE |
| Combinations table and stats bar | Hidden. The four count chips on each preset card stand in. | TO DECIDE |
| I/O Patch Simple | Cards using the desktop connector, type and resolution pickers. | BY DESIGN (2026-06-12) |
| I/O "Set for all", + Source / + Destination / + AUX / + MV, per-row reset and delete, name library, "Only here" rename | Absent. A rename on the phone is always global. | TO DECIDE |
| I/O-only destinations (`ioDests`) | Not listed on the cards (`ioGatherDests` reads destinations, AUX and multiviewers only). | NOT BUILT YET |
| I/O housekeeping (auto B-pairs, library sync) | The card view does not run it. It only happens as a side effect when a menu pick calls `_sysRender`. | NOT BUILT YET |
| I/O Advanced pages, backup pairs | Hidden. The source card hard-codes `backupOf=''`, so the link icon never shows. | TO DECIDE |
| Wire Simple | Landscape only. View, zoom, pan, pinch; on a source card: rename, resolution, cable type, cable colour, thumbnail. | BY DESIGN |
| Wire right panel (preset filter, Details, Project Info, logo), tool palette, align panel, Export, Reset Layout | Hidden "per the mockup". Project Info is edited through the Show card instead. | BY DESIGN |
| Move a node, draw a cable | Not possible: the desktop handlers are mouse-only. | TO DECIDE |
| Wire Advanced | Never shown; the phone always draws Simple. **(build 16ki)** this no longer changes the show's own setting. | BY DESIGN |
| Quick Setup | The same modal, wrapping at phone width (16ef). | BY DESIGN |
| App tooltips (16hi) | Off; the phone keeps native behaviour. | BY DESIGN |

## 6. Layout rules the owner set

- 2026-06-15: "as close to the desktop view as possible, not completely different workflows." And: "all this works
  on desktop so it should work here."
- 2026-06-15 (15x): no landscape for Video Presets. Portrait = the preset visualiser on top, then Destination /
  Layer / AUX property rows below; the tap decides which row opens.
- 2026-06-15 (15y): badges are orange **D**, amber **AUX**, cyan **L#**. The visualiser is sticky and tappable.
- 2026-06-15 (15z): "collapse them to just the pencil button, lets do open-one-close-others." One row open at a time.
- 2026-06-15 (15ab): move arrows live ON the visualiser and in the panel (both). Add / remove pairs sit at the bottom
  of their own section, not in one combined row. Enter commits a name.
- 2026-06-15 (15ac): the labels are "+ DEST / − DEST" and "+ AUX / − AUX".
- 2026-06-16 (16a/b): three sections, Destination / Layers / AUX, each with − and +. The property panels are the
  DESKTOP panels: "the code is all there, zero reason to make new code." They expand inline, not as a full-screen
  sheet. Layers is a flat list of every layer, labelled `D{x}·L{n}`; layers do not live inside the Destination row.
- 2026-06-16 (16e, 16h): a double-tap must never pop a floating desktop panel.
- 2026-06-16 (16g): the visualiser arrows show only on the selected destination.
- 2026-06-12: Wire is landscape only with a rotate prompt, Simple only, right panel gone, pinch zoom on. I/O cards
  reuse the exact desktop pills and pickers. The Show tile is read-only, opens Quick Setup to edit, and carries Send.
- 2026-09-07 (16dy): "I want everything to be the square shape with rounded corners, not the pill."
- Standing rule (2026-06-16): when the owner specifies a placement, build that. Put a concern in a separate
  sentence; never swap the design silently. Both recorded deviations happened on this phone work.

## 7. Architecture

- **One page, one show model.** The phone is a second view over the same data, setters and save format. Send uses
  the same `getProjectState()` as desktop Save, so everything in the show travels, including what the phone hides.
- **Two self-running blocks** at the end of the script: `initMobileShell` (detection, the Wire rotate card) and
  `initMobileMainView` (everything else, near lines 28855 to 30156).
- **`#mobile-main`** is created by `ensureContainer` and filled by `renderMobileMain`, which picks one of: I/O cards,
  nothing (Wire uses the real overlay), the empty state, the preset edit view, or the preset list.
- **Wrapped functions.** The phone hooks in by replacing four globals and keeping the originals:
  - `wrapRender`: `window.render` → original render, then `renderMobileMain`. `scheduleRender` calls `render()`, so
    every desktop redraw repaints the phone. Every phone redraw also rebuilds the hidden desktop canvas and table.
  - `wrapNav`: `openSystem`, `openWireMode`, `openVideoPresets`. On the phone, I/O Patch and Video Presets render
    into `#mobile-main` and close the overlays; Wire opens the real `#wire-overlay`, adds `body.mb-wire-active`, then
    runs `mbWireSetupOverlay` (Simple view, pinch handlers on `#wire-diagram-scroll`, one Fit).
  - `wrapLayerPanel`: `openLayerPanelWithMode`. The original is kept as `window._origOpenLayerPanelForMobile`. In the
    edit view the wrap routes to `mbOpenLayerInline`; anywhere else it opens the old `mobileLayerSheet`.
- **Desktop panels docked inline.** `mbOpenLayerInline` / `mbOpenDestInline` / `mbOpenAuxInline` all work the same
  way: mark the row active, redraw so the row contains an empty `.mb-le-panelhost[data-host=…]`, call the REAL
  desktop opener with a stand-in event (`_mbFakeE`), move the resulting `#layer-panel` / `#screen-panel` /
  `#dsm-panel` into the host, and give it the class `.mb-inline-panel` (which cancels the floating position).
- **The render-pause flag, `window._mbInlinePanelOpen`.** While it is true and one of the three panels exists,
  `renderMobileMain` returns at once, so a redraw caused by an edit cannot destroy the live, wired panel. If the flag
  is true but no panel exists, it is treated as stranded and cleared. It is cleared by `_mbInlineClose` (called from
  the desktop `closeScreenPanel` and `closeLayerPanel`, and from `_mbWatchPanelClose`, a MutationObserver, because
  the AUX panel removes itself and has no close function), by `mbCloseInlinePanel`, `mobileBackToList` and
  `mbRemoveLayerInline`. The desktop outside-click closers (near line 8762) stand down while the flag is set.
- **The picture while paused.** `mbMoveDest` refreshes only the visualiser in place (`.mb-vis` is replaced with a
  fresh `mbPresetVisual`). **(build 16ki)** the same in-place refresh follows every edit made in a docked panel.
- **State.** `_mbTool` (presets / io / wire), `_mbView` (list / layers), `_mbLayersPid`, and the three
  `window._mbActiveLayer` / `_mbActiveDest` / `_mbActiveAux`. Body classes: `is-mobile`, `mb-layers`,
  `mb-wire-active`. (`mb-detail` and `mb-view` belong to the retired landscape view.)
- **Same-frame paint.** `_mb*` handlers call `render()` directly, not `scheduleRender()`. Do not convert them
  (CLAUDE.md, controller layer).
- **I/O cards** write through the desktop `_sysSetMeta` (`mbIoSet`), open the desktop menus with `_sysOpenDropdown`,
  and open `openSharedResPicker`, which on the phone becomes `.mb-res-sheet`. The last line of `_sysRender` repaints
  the cards after a menu pick or a rename.

## 8. Load-bearing rules and known traps

1. **`initMobileShell` and `initMobileMainView` look unreferenced. They are self-running. Never delete them**:
   deleting them deletes the phone build. `mockups/dead_js_report.txt` lists both as dead; that report is wrong.
2. **`mbVisTap` depends on desktop markup it does not own.** It needs `.layer-chip` with `data-sid` and `data-lid`
   (`_rcChip`), `.screen-box` with `data-sid` (`_rcScreenBox`), and it reads the AUX id with a regex out of the
   `.dsm-box` onclick text (`dsmId:'…'`, from `renderDSMVisual`). `mbPresetVisual` also strips every `ondblclick` by
   regex. Rewrite any of those three helpers and phone taps break with no error. After touching them, tap a wall, a
   chip and an AUX box on the phone.
3. **Any new way out of the edit view must clear the pause flag.** A stranded `_mbInlinePanelOpen` once froze the
   list with the tool pill hidden (16f). The stale guard is the safety net, not the plan.
4. **Desktop panel code runs with a stand-in event on the phone.** Guard every `e.target.closest(…)` before using the
   result. An unguarded one in `openScreenPanel` made the Destination panel vanish on the phone (16cq).
5. **The Show card is not a harmless edit.** `confirmQSEdit` always calls `repackPositions` for every preset, which
   throws away `positions` and re-lays the destinations left to right in `screens[]` order, even when nothing was
   changed. On a desktop show with free-positioned walls, blend overlaps or dead-space gaps, tapping the Show card
   and confirming flattens them, and it undoes any phone Move Left / Right. Read from the code on 2026-09-20; not run.
6. **A show saved in I/O Advanced view leaves the phone cards stale.** `_sysRender` returns early when
   `ioAdvanced.view==='advanced'`, before its phone repaint. Connector and type picks and renames write the data but
   the card does not update. Resolution and notes repaint themselves. Open.
7. **The hidden-destination ghost cannot be restored on the phone.** `mbVisTap` captures the tap on any
   `.screen-box`, including the ghost, and opens the Destination panel; the ghost's own "show again" button never fires.
8. **Undo is uneven.** `mbRemoveDest` (through `deleteScreen`) and `mbRemoveAux` push an undo step; `mbAddDest`,
   `mbMoveDest` and the I/O card writes do not. Check before adding a push: `deleteScreen` and `addPreset` push
   internally, `addDSM` does not.
9. **Preset name and notes on the list write straight into `presets[]` on blur**, with no setter and no redraw, so
   the keyboard does not lose focus. The next redraw picks them up.
10. **Duplicated markup that must stay in step.** The I/O picker arrows (`chev`, `chipChev`) are defined in the
    desktop I/O builders and again in `ioSourceCard` and `ioDestCard`. The Wire style bar is drawn into both
    `#wire-io-float` (the desktop's floating holder, hidden on the phone; it replaced the `#wire-style-bar` strip in round 16ks) and `#wire-style-bar-top`, so `#wire-router-menu-btn` exists twice in Advanced: always use the
    button that was clicked, never `getElementById`.
11. **Class names built at run time look unused to a scanner**: `mb-bb-orange / amber / cyan / yellow` and
    `mb-io-dest / aux / dsm / mv`. They are live.
12. **Live things with retired names.** `.mb-detail-titlewrap`, `.mb-detail-pcode`, `.mb-detail-name`,
    `.mb-back-btn` and `.mb-mode-badge` style the header of the LIVE edit view. `reflowDetail` also re-fits Wire
    after a rotation.
13. **The phone Wire CSS reaches Advanced tiles.** `.wire-source-card` is also on every `.wire-adv-tile`. If Advanced
    ever draws while `is-mobile` is set, the tiles distort.
14. **Do not flip `is-mobile` mid-session in a test.** Overlay offsets and the toolbar height are measured for the
    layout that was active. Set the force flag before load.
15. The page-editing rule still applies here: scripted exact-match replacements, then `python3 tools/check_js.py`
    (HANDBOOK section 2).

## 9. Design standard on the phone

- **Touch targets: 44 px minimum.** The token is `--ss-touch: 44px`. Through 16kh it is applied only to modal
  buttons, dialog buttons and `.sys-btn`; the phone's own controls were sized by hand and most were under 44 px
  (tool pill 26, steppers 26, pencil and Back 34, visualiser arrows 22, panel close 22, I/O pills 38, the Wire
  resolution arrow 8). **(build 16ki)** every control a finger has to hit on the phone is at least 44 px.
- **Text inputs: 16 px minimum. (build 16ki)** iOS zooms the page when a field under 16 px takes focus. Through
  16kh every phone field was 10 to 14 px. Emulation cannot show the zoom; measure the computed font size.
- **Shape: rounded rectangles, not pills** (owner, 2026-09-07). 8 px for fields, chips and buttons, 12 px for cards,
  5 to 6 px for small badges. The phone CSS writes 8 px and 12 px as literals (about 18 and 6 times); they match
  `--ss-radius-control` and `--ss-radius-card` but do not use the tokens. Exceptions in live phone CSS: the
  empty-state start button (`.mb-empty-cta`, 999 px), the round visualiser arrows (`.mb-vis-arrow`, 50%), and the
  resolution sheet's 14 px left corners (deliberate). The 16dx note "999 px pills for chips and pickers" is superseded.
- **Shared colour tokens.** The phone CSS follows the skin through `--n-cyan` / `--n-cyan-rgb`, `--text*`,
  `--n-line`, `--n-track`, `--n-amber`, `--n-orange`, `--n-red`, `--font-mono` and `font-family: inherit`. The Show
  card reuses `.qs-panel`; the I/O cards reuse `.sys-pill`, `.sys-chip`, `.sys-name-input`; docked panels are `.pm`.
- **Hard-coded exceptions.** Card gradients (`#0f1216→#0b0d11`, `#161a22→#0b0d11` and three more), the visualiser
  background `#16181a`, text on accent `#0a0a0c`, the header strip `rgba(8,13,24,.97)`, amber / orange / red written
  as `rgba()` literals because no `-rgb` token exists for them, and the I/O section strips `#6ee7a8` and `#ff8a3d`
  (the green is the desktop I/O green on purpose, not `--n-green`).
- **Known mismatches.** Open-row borders are amber for destinations and layers and orange for AUX, the reverse of
  the badges on the same rows. Phone I/O pills keep the older 8 px pill while phone Wire shows the 16gp menu look,
  so the two tools do not match each other on a phone. The "Outs" and "Layers" count chips use different colours
  and different sums from the desktop stats bar (the comment "mirrors the desktop pills exactly" is no longer true).
- **(build 16ki) wording** found on 2026-09-20: "Click here to start" on a touch screen; the example message saying
  "Save As" and "three destinations" (Town Hall has two); a DSM badged and titled as AUX; the stale I/O empty text.
- **(build 16ki)** the visualiser fits its box (it ran 30 to 48 px past the right edge and cut the last wall), and
  the docked panel's sticky header no longer slides over the sticky visualiser (`.pm-hdr` and `.mb-vis` both pin).

## 10. Desktop-made files opened on a phone

**What shows:** every destination, every AUX / DSM, every preset with its name and notes, every layer's content,
name and size, the BG still on each wall, I/O connector / type / resolution / notes for sources, destinations, AUX
and multiviewers, the Simple wire diagram, and show name / date / venue plus Project Info (through the Show card).

**What is hidden but still in the file:** Video Presets Advanced work (clips, timeline, speed, source crops, the BG
as layer 0), AOI / blend / dead-space / free-position overlays, Wire Advanced pages, tiles and routers, the Wire
right panel, I/O Advanced pages and backup pairs, I/O-only destinations. The phone never reads them and Send carries
them back untouched, because Send serialises the whole show.

**What the phone must never change:**
- `wireSettings.wireView`. Through 16kh, opening Wire on a phone wrote `'simple'` into the show, and autosave and
  Send carried it to the desktop. **(build 16ki)** the phone draws Simple without writing the setting. Check: save a
  show in Wire Advanced, open Wire on the phone, Send, reopen on the desktop: it must still open in Advanced.
- `ioAdvanced` (view and pages), `wireAdvanced`, layer media and crops. Nothing in the phone block writes these
  today. Keep it that way.
- Destination positions, except through the Move arrows. See trap 5: the Show card breaks this rule today.
- A review edit must use the same setters as the desktop. No phone-only fields in the show file.

**Known wrinkles:** I/O notes on a BG source can show one note and write another (the card reads `meta.notes`; the
desktop shows the destination's notes for a BG). The list reads "Layers 0" for a preset whose walls show only a BG.

## 11. Testing

**Emulation recipe** (the only kind of test possible today):
1. Serve the page: `python3 -m http.server <your port> --directory deploy`.
2. Headless Chrome, muted, its own profile and debugging port. The phone run needs its OWN page load with, before
   navigation: `Emulation.setDeviceMetricsOverride` (`mobile:true`, scale 3), `Emulation.setTouchEmulationEnabled`, a
   phone or tablet user agent, and `Page.addScriptToEvaluateOnNewDocument('window.LB_FORCE_MOBILE=true')`.
3. Keep ONE DevTools socket open for the whole run; the emulation resets when it closes.
4. Tap with `Input.dispatchTouchEvent`, not a JS click, so a control buried under another layer fails the way it
   does for a finger.
5. Sizes: 390×844 and 844×390 (phone, the extreme), 375×812, and tablet sizes such as 744×1133, 820×1180 and
   1180×820. At the tablet sizes WITHOUT the force flag you get the desktop layout (section 3); with the force flag on, the class is forced but the phone CSS is still gated by size.
6. Seed with `lbOpenExample('general-session')` (also `awards-night`, `town-hall`). Answer the dialog through
   `#dlg-confirm`; never hide `#dlg-overlay`. Read globals with `eval('presets')`.
7. Traps: desktop Chrome never reports coarse + no hover, so without the force flag only a window 768 px or narrower
   trips the phone layout; an 812×375 window without the flag draws the DESKTOP layout and gives false screenshots.
   Wire in portrait shows the rotate card by design. Stub `window.dl` before calling any export. Kill Chrome and the
   server when done; never leave media playing.

**Real-device checklist** (for when the app wrapper exists):
- Opens offline, in airplane mode. An `.avlb` from Mail opens in the app. Send offers Mail and the file arrives.
- Round trip: desktop show → phone → adjust a layer → Send → desktop. Advanced work, Wire view and I/O pages intact.
- Rotate in every tool: the layout never drops to desktop; Wire re-fits; the rotate card comes and goes.
- Focus every text field: the page does not zoom. With the on-screen keyboard up, a preset name keeps focus.
- Double-tap a wall, a chip and an AUX box: no floating panel appears. Every control can be hit with a thumb;
  the notch and home-bar areas do not cover the tool pill or the ± buttons.
- A tablet in both orientations gets the desktop layout (section 3): I/O Patch opens its table, Advanced opens, Load picks a .avlb.
- A large show scrolls and edits without lag (every phone redraw also rebuilds the hidden desktop canvas).
- Colour pickers opened from the docked Destination panel and from layer Border / Shadow are usable (they are the
  floating desktop picker; only the Wire cable colour has the full-screen editor).
- After an app update the new build stamp shows; a draft from the old build restores.

**The probe, `tests/mobile_probe.js` + `tests/run_mobile_stage.mjs` (build 16ki).** Through 16kh the gate had no phone
coverage at all. `node tests/run_smoke.mjs` now runs the phone stage after the flows stage (`--no-mobile` skips it;
`node tests/run_mobile_stage.mjs` runs it alone, `--golden` rewrites `tests/golden/mobile.json`). It loads the page in
headless Chrome with phone emulation set BEFORE the page boots, uses real touch taps, rotates to landscape and back,
answers the file picker with `site/packets/Town Hall.avlb`, and takes about 70 s. 61 checks at 16ki, none failing.
Budgets: per screen, the number of tap targets under 44 px and texts under 11 px may never RISE. Coverage: phone mode on at launch with the empty state; no sideways page scroll on any screen in both orientations;
an example opens and the list equals the model; the visualiser fits its box; accordion rows and chip sizes equal the
model; a layer content change and a size APPLY reach the model AND the picture; no floating desktop panel ever
appears; add preset, + DEST, + AUX and the − confirms; a tap on a wall opens its row; Back always works and leaves
no stranded flag; Wire shows the rotate card in portrait, Simple in landscape, and leaves `wireView` alone; I/O
cards equal the model and connector / resolution / rename write through; exports still run at phone size; every
modal fits the viewport (this catches the Help tabs); counts of targets under 44 px and inputs under 16 px may
never rise; no page errors. When a phone bug is fixed, add its check here, the way `flows_probe.js` is used.

## 12. Dead and retired phone code

Verified 2026-09-20 by counting references in the page: each name below appears once (its definition) or only
inside other dead code. The owner has NOT said to remove anything. If he does: one JS-only build, tested on its own.

**Safe to remove (JS):**
- The drag / resize preview from June: `mbPipDown`, `mbPipResizeDown`, `_mbPipBegin`, `mbPipMove`, `mbPipUp`,
  `_mbPip`. Do not revive it: it writes `setLayerSize` with no aspect lock.
- Old row editors: `mbSetLayerWH`, `mbSelLayer`, `mbAddLayer`, `mbLayerSetContent`, `mbRemoveLayer`, `mbToggleRow`,
  `mbSetDestName`, `mbSetLayerName`, `mbSetDsmName`, `mbDsmSetContent`, `mbOpenResPicker`.
- Constants: `_MB_LAYER_CONTENT` (it lists NOTES and PGM, which are not in the desktop list), `ICON_EYE`, `ICON_LAYERS`.
- The retired landscape "detail" view: `detailHTML`, `tagSoloPresetRow`, `fitSoloPresetRow`, and the
  `_mbView === 'detail'` branch in `renderMobileMain`. Nothing ever sets `_mbView` to `'detail'`;
  `mobileOpenPreset` always routes to the portrait edit view.
- Stale comments: both "V2 prototype" headers (section 3), "native `<select>`" above the I/O cards (they use the
  desktop menus), "Primary/Backup type picker" (type is the machine list: PC, Mac, Camera … Custom), and the Phase 3 / 4 notes.

**Safe to remove (CSS), with two catches:** `#v2-marker` (no element is ever created), `.mb-rotate-hint`, the
`body.is-mobile.mb-detail …` and `.mb-view` rules, `.mb-le-preview`, `.mb-le-pvbox`, `.mb-le-cgrid`, `.mb-le-chip`,
`.mb-le-chips`, `.mb-le-addchip`, `.mb-le-delchip`, `.mb-le-cuehint`, `.mb-le-wh`, `.mb-le-whcol`, `.mb-le-whinput`,
`.mb-le-whx`, `.mb-le-nameinput`, `.mb-le-reschip`, `.mb-io-reschip`, `.mb-io-nameinput`, `.mb-io-typetag`.
Catch one: near neighbours are LIVE. Keep `.mb-le-chipdot`, `.mb-le-pvhint`, `.mb-rotate-text`, `.mb-rotate-sub`, the
`mb-rotate-wiggle` animation (the Wire rotate card uses them), and above all
`body.is-mobile:not(.mb-detail) #canvas-area { display:none }`, which is what hides the desktop canvas on the phone.
Catch two, recorded in the 2026-09-20 unused-code audit: the Look Book export copies the stylesheet, so removing CSS
changes `tests/golden/*.lookbook.html`; regenerate the goldens on purpose in the same commit. JS-only removal does not.

**NOT safe to remove:**
- `initMobileShell`, `initMobileMainView` (trap 1).
- `mobileLayerSheet`, `closeMobileLayerSheet`, `buildSheetBody`, `wrapLayerPanel`, `_mbDetailMode` and the
  `.mb-sheet-*` CSS. The sheet is the fallback whenever a layer panel is asked for outside the edit view, and it is
  the path a tablet takes today (section 3).
- `reflowDetail` (re-fits Wire on rotate), `mbNextEmptyLayer`, `mbColor`, `_mbOpenRows` and `_mbSelLayer` (still
  assigned by live functions), and the items in traps 11 and 12.
- The `#wire-headers` hide rule and the `#wire-style-bar-top` container are obsolete but harmless: the header band
  went at 16gh, and the top style bar is an empty box on the phone since the cable-style toggle was retired (16jg).

## 13. Open decisions

1. ~~Tablets~~ DECIDED 2026-09-20 (build 16ki): a tablet gets the desktop layout (section 3). Still open: tablet
   portrait is cramped, and touch-drag on the desktop canvas does not exist.
2. Should − DEST and − AUX remove the last item (today) or the selected one?
3. The 2026-06-15 question about the owner's screenshot where every destination read "No layers assigned": was that
   an empty preset or a read bug? Never answered.
4. Were the June I/O Patch and Wire phone passes ever approved by the owner?
5. Which of Undo, New show / examples, the four exports, Help and Report a bug should a reviewer reach?
6. Should the Show card allow changing destination / AUX / preset COUNTS on a review device at all? (Trap 5.)
7. Preset delete, duplicate and reorder on the phone.
8. + LAYER always lands on D1; − LAYER does not confirm; a new AUX is named "AUX3" with no space; an I/O name commits
   on tap-away, not Enter; an I/O rename is always global.
9. Should phone I/O pills take the 16gp menu look so I/O and Wire match?
10. Stale I/O cards on a show saved in I/O Advanced (trap 6) and the ghost that cannot be restored (trap 7).
11. Landscape editing in Video Presets on a phone has about 43 px of working room. Acceptable as view-only?
12. Moving Wire nodes by touch: wanted for review, or desktop only?
13. The wrapper: which tool, which minimum iOS / Android versions, and how an emailed `.avlb` is handed to the app.
14. Approval to remove the dead code in section 12.

## 14. Change history

| Date | Build | What |
|---|---|---|
| 2026-06-11 | — | Owner's Keynote mock-up, 7 pages (`~/Downloads/LOOK BOOK MOBILE MOCK UP.pdf`; outside the repo, not opened for this document). |
| 2026-06-12 | V2 sandbox | Three tools on the phone. Wire: overlay panels, rotate prompt, resolution sheet, cable colour editor. I/O cards on the desktop pickers. Show tile with Send (`shareProject`). |
| 2026-06-14 | cutover | The V2 sandbox merged into the one master file. `backups/lookbook_builder_v1-desktop-only_2026-06-14.html`, `…v2-retired_2026-06-14.html`. |
| 2026-06-15 | 15v, 15w | Viewport meta added: real phones had been drawing the desktop layout. Detection made rotation-proof (pointer / hover OR width); `(max-height: 600px)` added to the CSS gates. `deploy/_headers` added for Safari caching. |
| 2026-06-15 | 15x to 15ad | Video Presets redesign, five iterations: portrait visualiser + rows, tap routing, badges, pencil-only card, one row open, Enter commits, per-section ± buttons, arrows on the visualiser, + AUX through `addDSM`. |
| 2026-06-16 | 16a to 16d | Three sections; the real desktop Layer, Destination and AUX panels docked inline; the render-pause flag; outside-click and observer races fixed. |
| 2026-06-16 | 16e to 16i | Double-tap can no longer pop a floating panel (blocker, then `ondblclick` stripped). Stranded pause flag hid the tool pill: stale guard added. Sticky header and visualiser un-overlapped. Arrows only on the selected wall. Move refreshes the visualiser while a panel is docked. |
| 2026-06-23 | 16cq | Destination panel crash on the phone: `closest()` null guard in `openScreenPanel`. Close functions clear the pause flag even after a flip back to desktop. |
| 2026-08-28 | 16dw, 16dx | I/O polish, toolbar spacer leak fixed, first design sweep (card radius 12 px). |
| 2026-09-07 | 16dy | Rounded rectangles, not pills (reverses the 16dw pill move). |
| 2026-09-11 to 09-15 | 16ef, 16ei, 16ht | Quick Setup wraps at phone width; Wire thumbnail column rule; Video Presets Advanced hidden and blocked on the phone. |
| 2026-09-20 | 16kf to 16kh | Phone audit: `private/study-2026-09-20/mobile_code.md`, `mobile_gui.md`, `mobile_docs.md`. Owner's decisions in section 1. This document drafted. |
| 2026-09-20 | 16ki | Visualiser fits its box and re-fits on rotation; the picture follows every edit made in a docked panel; docked panel headers can never cover the visualiser (sticky under it in portrait, not sticky in landscape); Help tab bar scrolls by touch; wording ("Tap here to start", example message built from the show, DSM badge, I/O empty text, stat chip colours and per-preset AUX maths); Wire on the phone no longer writes `wireView` into the show; touch targets to 44 px and inputs to 16 px (phone-only CSS); "Open a show file" on the empty state and the Show card; tablets get the desktop layout; `tests/mobile_probe.js` added to the gate. |

Git history starts 2026-09-11, so the June work is not in it; the dated snapshots are in `backups/` (not in git).
Commits whose messages mention the phone: 959f23a (16ht), 7eb949a (16is), 94f3bd5 (16jj).

---
Reading receipt: **PHONE-44PX-REVIEW**. Report this code to the owner after reading this document in full.

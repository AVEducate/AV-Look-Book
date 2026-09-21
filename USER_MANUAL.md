# AV Look Book: User Manual

This manual describes build **2026-06-16kp**, written from the September 2026 click-through in which every control of the app was clicked and checked against the code and the Help. The fixes that click-through produced are part of this build.

**One mark you will see**

- **CHECK** = two testers described the same thing differently and the owner has not yet settled it. The note says what each one saw.

---

## 1. What AV Look Book is

AV Look Book is the planning tool for the video side of a live show. You describe the show once: the destinations (LED walls, projection screens, confidence monitors), the sources (cameras, PowerPoint, playback, graphics), and the looks the switcher will be asked for. The app turns that one description into everything the crew needs on paper.

One show file (.avlb) holds three tools. They are three views of the same show, not three documents:

| Tool | The question it answers | What comes out |
|---|---|---|
| **Video Presets** | What is on every screen in every look? | The Look Book PDF and the Excel cue sheet |
| **Wire** | What is plugged into what? | The wire drawing (PDF / SVG / PNG) and the operator slate pack |
| **I/O Patch** | Which connector, machine, resolution and note for every input and output? | The Excel patch book |

**How a show flows through them**

1. **Quick Setup** builds the skeleton: show name, destinations with their resolutions, AUX / DSM outputs, the number of presets.
2. **Video Presets, Simple** is where the looks are built: one tile per preset, destinations drawn to scale, layers on them, AUX outputs underneath.
3. **Video Presets, Advanced** finishes one look at a time: pixel-exact layers, real video clips with In / Out and level, and a clean Display window for a client.
4. **Wire** draws itself from the show: every source into the switcher, every destination and AUX out of it. You dress it (cable types, colours, names, layout) and, in Wire Advanced, draw the real system with routers, converters and backup runs.
5. **I/O Patch** lists every source and output that the presets use. You add connector, machine type, resolution and notes; a red pill warns when a connector cannot carry the resolution.
6. **Excel, Look Book, Send** in the top bar get the show out of the building.

Rename a source in any tool and it is renamed in all three. Add a destination anywhere and it appears everywhere.

---

## 2. Quick start

1. Press **New** (or Cmd / Ctrl + N). Quick Show Setup opens.
2. Type the **Show name** (required). Set date and venue if you have them.
3. Set **Destinations** with − / +. Click a destination row to name it and press its resolution button to pick its size.
4. Set **DSM / AUX** and **Presets** with − / +.
5. Press **Build My Show** (or Enter). P01 is the base look; the other presets start as copies of its layout.
6. In the Destination Combinations table at the bottom, type a source name in the **L1** cell of a destination row and press Enter. A layer appears on that destination in that preset.
7. Drag the layer where you want it, or double-click it and type Position and Size.
8. Press **Copy** on that tile and **Paste** on another tile to carry the look across.
9. Open **Wire**, press **Fit**, set a Cable Type on each card, type the switcher's real name.
10. Open **I/O Patch**, use the **Set for all** row for the house connector and resolution, then fix the exceptions.
11. Press **Save**. Then **Look Book** for the PDF, **Excel** for the cue sheet, or **Send** for both in one email.

Or press one of the three examples at the top of Quick Setup (General Session, Awards Night, Town Hall) and explore a finished show. Shift-click Save to make it yours.

---

## 3. Quick Setup and the toolbar

### 3.1 The top bar, left to right

The top bar is the same on every page, so adding a destination, undoing, saving and exporting work from wherever you are.

| Group | Control | What it does |
|---|---|---|
| Show | **Show name** | Names the window, the saved file and every export. Typing here is not an Undo step. |
| Canvas | **W × H** | The total canvas in pixels, calculated from your destinations (side by side, plus any blend or free position). Change the destinations, not this number. See the CHECK below. |
| Add | **+ Destination** | Opens Add Destination (3.2). From Wire and I/O Patch the window opens on top of the page. |
| Add | **+ Preset** | Adds a preset after the last one, copied from P01. Needs at least one destination. Pressed from Wire or I/O Patch it adds the preset with nothing on screen to tell you. |
| History & Presets | **Undo / Redo** | Chapter 10. |
| History & Presets | **Collapse all / Expand all** | Folds every preset tile down to its header, or opens them all. A view action; it does not mark the show unsaved. |
| Project | **Save**, **New**, **Load** | Chapter 10. |
| Export | **Excel**, **Look Book**, **Send** | Chapter 9. |
| Bottom row | **Wire · Video Presets · I/O Patch** | The tool switch. One tool is open at a time. The label on the left tells you where you are. |

> **CHECK (Canvas W × H).** The toolbar engineer reports the boxes as a read-out that accepts typing and then throws it away on the next redraw. The keys engineer reports that in Simple they take the cursor but discard every key, and that "the canvas is resized in Advanced with the canvas on Free". Both agree typing there does nothing useful in Simple today. Question 22 asks to make them plainly read-only.

### 3.2 Add Destination

1. Press **+ Destination**. The name is already selected: type over it.
2. Set **Width** and **Height** in pixels. Limits are 67 to 7680 wide and 67 to 4320 high; a value outside is pulled back to the limit, and a blank, zero or minus keeps 1920 × 1080.
3. Pick a colour: one of the eleven swatches, a hex value, **Pick…** for the full colour window (4.7), or the picture tile to upload an image as the destination's background.
4. Press **Enter** or **＋ Add Destination**. The destination is added to the right of the last one in every preset. One Undo step.

**Escape**, **Cancel** or the ✕ close the window without adding. A click outside does not close it, so a stray click cannot lose what you typed. On an empty show + Destination opens Quick Setup instead.

### 3.3 Quick Show Setup

Opens by itself on a new show, from **New**, from Cmd / Ctrl + N, and from the "Click here to start" card on an empty canvas. The cursor starts in Show name and the window opens at the top.

| Control | What it does |
|---|---|
| **Start from an example** | General Session, Awards Night, Town Hall. Asks first if the open show has unsaved changes. |
| **Show name** | Required. Without it the build will not run; the box is outlined in amber and you are told why. |
| **Date, Venue** | Date defaults to today, venue to N/A. |
| **Client, Job No, Designer, Drawn By, Project Ver, Show dates, Show format, Venue address** | Title-block and cover information. All optional; all can be changed later in Wire › Project Info. |
| **Destinations − / +** | 1 to 24. Each destination gets a row below. |
| **Destination rows** | Click a row to open it: type a name (blank = Destination 01, 02 …) and press the resolution button for the full list, with **+ Custom resolution…** at the top. |
| **Set default for all** | On: the first row's resolution is copied to every destination. Off: each keeps its own. |
| **DSM / AUX − / +** | 0 to 8 outputs, switched on in every preset. |
| **Presets − / +** | 1 to 12. P01 is the Global Preset. |
| **Canvas preview** | The total canvas the build will produce. |
| **Build My Show** (or Enter) | Creates the destinations, presets, AUX outputs and canvas. |
| **Start blank** (or Escape) | Closes the wizard and leaves an empty show. |

With a resolution list open, Escape closes the list only; the next Escape closes the wizard.

Build My Show is one Undo step: the first Undo after it takes you back to an empty canvas (Redo brings the show back).

The desktop has no "Edit Show Info" window (the phone has one). Change date, venue and the title-block fields in Wire › Project Info.

### 3.4 The status bar (Video Presets, Simple only)

| Item | Meaning |
|---|---|
| **Canvas** | Total canvas, the same number as the top bar. |
| **Presets / Destinations / AUX** | Counts for the show. |
| **Outputs** | Destinations plus the AUX outputs that are on somewhere: the physical outputs you need. |
| **Layers** | The most layers used in any single preset. Compare it with your switcher's layer budget. |
| Selection read-out | The preset, destination and size you last picked. |
| **build …** | The build stamp. Quote it in a bug report. |
| **Advanced** | The overlays menu: **AOI Overlays**, **Blend Zones**, **Dead Space**, **Free Position** (each on / off, remembered on this computer, not in the show file) and **Fit Canvas**. Every preset tile has the same menu on its own ADVANCED ▾ button. It closes when you press anywhere else. |
| **Help** | Quick Reference, Keyboard, Glossary, Vocabulary (how Look Book terms map to Aquilon, Spyder, Pixelhue, Barco) and Accessibility, plus links to Feedback and Support. On the Keyboard tab choose a Mac or PC keyboard; hover or click a shortcut to light its keys. |
| **Bug** | Downloads the show file and opens an email to AV Educate with a short form and your build stamp. Remove the attachment if you would rather not share the show. |

The Advanced page, Wire and I/O Patch cover the status bar. Go back to Video Presets Simple for Help and Bug.

---

## 4. Video Presets, Simple

Simple is where you build looks. One **preset tile** per look, stacked down the page. Each tile draws your destinations to scale, the layers on them, and the DSM / AUX outputs underneath. The **Destination Combinations** table at the bottom is the same show as a spreadsheet: type in either place, the other follows.

### 4.0 Preset 1 is the master preset

**P01 ("Global Preset") is the master that every preset created after it follows.** When you press **+ Preset**, the new preset starts as a full copy of P01 as it is at that moment: the backgrounds, the layers with their sizes and masks, the AOIs, which AUX / DSM outputs are on and what they show, and the **positions of the destinations, including any blend (overlap) or free position you set up on P01**. So if P01 has LEFT and CENTER blended, every preset you add afterwards starts with that same blend.

After that, each preset is its own: change a blend, a layer or an AUX on P03 and only P03 changes. Changing P01 later does NOT reach back into presets that already exist; it only affects presets you create from then on.

Set up P01 first (destinations in the right order, blends, the background every look shares), then add the other presets.

Two things follow the first preset in a different way:
- A destination's **name** and **colour** changed on P01 are the show-wide name and colour; changed on any other preset they belong to that preset only (4.4).
- The **Modifiers** switches (AOI Overlays, Blend Zones, Dead Space, Free Position; 4.2) are not part of any preset: they switch what you SEE and whether destinations can be dragged, for the whole program on this computer.

### 4.1 The preset tile header

| Control | What it does |
|---|---|
| Drag handle (six dots) | Drag the tile up or down to re-order presets. A line shows where it will land; it lands on that line. |
| **Code** (P01) | Up to 4 characters. Used in the table, the exports and show calling. |
| **Name**, **Notes** | Free text. Quotes and symbols are fine. |
| **ADVANCED ▾** | The tile's overlays menu (4.2). |
| **Paste** | Greyed until you copy a preset. Overwrites this preset's content and keeps this preset's own code, name and notes. No question is asked; Undo brings the old content back. |
| **Copy** | Copies this preset. The button flashes "COPIED". |
| **Reset** | Puts this preset's destinations back in a clean left-to-right strip (removes hand placement and blends in this preset only). |
| Chevron | Minimise / expand the tile. Double-clicking the empty part of the header does the same. |
| Bin | Removes the preset at once. Undo brings it back. |

Code, Name and Notes: Enter or a click away confirms, Escape cancels, and each edit is one Undo step.

### 4.2 The ADVANCED ▾ menu

Four switches for the whole page (a tick shows what is on) and one action for this tile.

- **AOI Overlays**: shows the Area of Interest tools on a selected destination.
- **Blend Zones**: lets you drag a destination sideways over its neighbour and shows the orange hatch with the overlap in pixels and percent.
- **Dead Space**: shows the blue arrow and the gap between destinations in pixels and feet.
- **Free Position**: lets you drag destinations anywhere, both axes, with red snap guides (hold Shift for no snap).
- **Fit Canvas**: slides this preset so its top-left destination sits at 0,0 and trims the canvas. If nothing needs trimming it tells you so.

### 4.3 Destinations on the canvas

**Pick.** Click a destination: orange outline, corner handles, and the move arrows ◀ ▶ on its edges. Click it again to let go. A click on its table row picks the same destination (without showing the move arrows).

**Re-order.** Press ◀ or ▶ to swap the destination with its neighbour. The order is the same in every preset. A greyed arrow means there is nothing on that side, or the neighbour is its blend partner. The arrows disappear after one move; click the destination again to get them back. Dragging the ⇅ handle of a table row also re-orders, but puts every preset back to a clean strip.

**Resize.** Drag a corner handle. Neighbours slide along, layers are kept inside, and a blend pair resizes together. With the destination picked, the arrow keys resize by 1 px (Shift = 10 px). Both change the real output resolution for the whole show. Exact numbers go in Destination Properties.

**Double-click** opens Destination Properties (4.4). **Cmd / Ctrl + D** duplicates the picked destination. Delete / Backspace never removes a destination.

**A destination fully covered by a full-screen layer cannot be clicked on the canvas.** Pick it from its table row, or open its properties with the chevron in the table's Name cell.

**A destination hidden in one preset** shows as a dashed ghost with an eye button. Press it to bring the destination back in that preset.

**Blend (Blend Zones on)**
1. Drag one destination over the next. The hatch appears with the overlap.
2. Click the PX number on the hatch and type the exact overlap.
3. Read the chip: green tick at 15 to 25 %, amber arrow below, red arrow above.
4. Double-click the hatch for the blend window: Blend Amount (px), Blend Percent, the resolution of both destinations, and **Break Blend** (pulls them apart edge to edge).

**Free Position.** Drag anywhere. If the drop makes a new overlap the app asks "Create Blend Zone?": *Add to blend* keeps it, *Cancel* puts the destination back. After a drop the layout slides back to 0,0 by itself.

**Dead Space.** Type the gap in PX or in FT on the blue arrow; the right-hand destination moves. A ⚠ marks a gap over 500 px. Feet follow the Pixel-Feet setting in Help › Accessibility, not the LED pitch.

**Area of Interest (AOI Overlays on)**
1. Pick a destination and press **A** (bottom right of the box). The red box is the AOI.
2. Drag it, drag its corners, or type X / Y / W / H under it. Each is one Undo step.
3. Hover the button group for **OFF**, **P** (paste), **C** (copy) and **↺** (back to the full destination).

While an AOI is on, the destination's own corner handles are hidden.

### 4.4 Destination Properties

Double-click a destination, or press the chevron in the table's Name cell.

- **Destination · all presets**: Width and Height (67 to 7680 × 4320) with the aspect read-out. Small tools on the right: copy, paste, reset (back to what it was when the window opened).
- **Layers · this preset**: L1 to L4 buttons open that layer's panel. **↺ Reset** puts every layer on this destination back to its default place.
- **Preset override · this preset**: **BG/Color**, **X / Y Position**, **Rotation** (any angle; a 90° turn asks whether to keep your layout or re-arrange), **EDID Note**. Each row has copy / paste / reset tools; paste acts at once.
- **Apply** (or Enter) writes the fields as one Undo step and closes the window. **Copy** duplicates the destination. **Cancel**, ✕, Escape or a click outside close without applying typed numbers.
- **Reset Preset Layout**: clean strip for this preset.
- **Show Labels / Remove Labels**: name and resolution on or off for this destination in this preset.
- **Remove from Preset**: hides the destination in this preset only (the ghost brings it back).
- **Remove Globally, All Presets**: deletes the destination from the show at once, no question. Undo brings it back.

There is no Name field here. The destination's name is typed in the table (4.8).

### 4.5 Layers

A layer is a coloured chip inside the destination. A new layer starts as a centred picture-in-picture at half the destination.

- **Click** = select (white corner handles; the table lights the same cell). **Click again** = Layer panel, Simple mode. **Double-click** = Layer panel, Advanced mode.
- **Drag** moves it; it snaps to the edges, the centre and other layers (Shift = no snap). A masked layer may hang over the edge by the masked amount.
- **Corner handles** resize; with the aspect lock on (default) the shape is kept.
- **Arrow keys** nudge 10 px, Shift 100 px. **Tab / Shift + Tab** steps through the layers of that destination. **Delete / Backspace** removes the layer from this preset.
- **↺** on the chip (shows on hover) puts size and position back to the default.

Drags, corner drags and nudges are each an Undo step that really goes back.

**The Layer panel.** The pill at the top switches **Simple / Advanced**. ✕, Escape or a click outside closes it; drag it by its title.

*Simple mode*
- **Custom name**: type a name and press Enter (or Apply). This makes a new grey library item with that name and puts it on the layer, replacing what was there.
- **Content type**: LOGO, GFX A, GFX B, PBP A, PBP B, IMAG. One click assigns and closes.
- **Other library items**: your own items first, then the built-in list. Click a row to assign. **✎** changes that item's colour everywhere. **×** (your own items only) removes the item from the library and from every layer that uses it, with no question. For a video or picture this also deletes the app's stored copy of the file.
- **Size**: Width / Height in pixels, Enter or Apply. This mode does not follow the aspect lock. **Fill** makes it full destination. **↺ Reset** = default size and place.
- **Remove from this preset**.

*Advanced mode*
- **Show Labels / Shape Only**.
- Seven sections, each with copy / paste / reset tools (paste works between layers): **Position** (X, Y), **Size** (Width, Height, the padlock keeps the shape), **Opacity** (0 to 256, or percent), **Mask** (Top / Bottom / Left / Right in pixels, up to 99 % a side), **Border** (on / off, colour, opacity, horizontal and vertical thickness), **Shadow** (on / off, colour, opacity, X and Y offset), **Effects** (Flip H, Flip V).
- With the padlock on, type a Width and the Height follows: 640 on a 16:9 layer gives 640 × 360.
- **Remove from ALL presets** (asks first).

The smallest layer is 67 × 67 px. A layer can never be bigger than its destination.

### 4.6 DSM / AUX band

Under every tile: the output boxes, and a toolbar.

- **DSM | AUX**: the word used for new outputs and in the toolbar.
- **+** adds an output, on in every preset. **−** removes the last one (asks the first time in a show).
- **Chip** (DSM 1, AUX 1 …): click = on / off for THIS preset only. Double-click = rename. (Known fault: the double-click also switches the output off and on.)
- **Box**: click selects (its table column lights), double-click opens **AUX Properties**: Name (this preset only), content (six quick buttons, the full library list, ✕ Clear), Size, **Apply** (or Enter), Cancel, **Remove AUX Globally**.
- In the table, type the content straight into the AUX column, or use its chevron.

### 4.7 The colour window

Opens from a BG/Color button, the table's BG swatch, a library ✎, a Border / Shadow swatch, or Add Destination › Pick….

Label field (BG only), colour square, hue bar, alpha bar, Hex, R G B A, eleven quick colours, **Image** (pick a picture as the background), **Apply**. ✕ or Escape closes it without applying, and leaves the panel under it open.

On the first preset the colour becomes the show-wide colour of that destination; on any other preset it is that preset's own.

Colour changes to built-in content types (PGM, CAM …) last for the session only. Your own library items keep theirs in the show file.

### 4.8 Destination Combinations table

One block per preset, one row per destination.

| Column | What you can do |
|---|---|
| ⇅ | Drag to re-order destinations (every preset goes back to a clean strip). The row lands where the line shows. |
| P# | Preset code (first row of the block). |
| BG/Color | Swatch or chevron = colour window. A second click on the chevron closes it. |
| Name | On the FIRST preset: renames the destination everywhere. On any other preset: a name for that preset only, shown on that preset's canvas and in the exports. Empty = back to the global name. Chevron = Destination Properties. |
| Notes | One note per destination, shared by every preset. |
| Red pill | Non-standard resolution. Click it: the window lists the closest standard sizes (to read, not to click) and has the "Engineer reviewed & approved" tick that clears the warning. |
| L1 to L4 (more appear as you use them) | Type a content name and Enter; empty clears the layer. Chevron = Layer panel (Simple). Double-click = Layer panel (Advanced). |
| DSM / AUX columns | Content per preset; chevron or double-click = AUX Properties. |
| ✕ | Only on the first destination row of each block. Deletes that destination from the whole show at once, no question. Undo brings it back. |

Toolbar above the table: **Add Destination**, **Add Preset**; the chevron collapses the table. Drag the grip above the title to resize the table; a single click on the grip steps through preset heights. Enter confirms a cell, Escape cancels it. A row click selects that destination and makes its preset the working one (amber bar).

### 4.9 Common jobs

**Swap two screens**
1. Click the destination.
2. Press ◀ or ▶.

**Add a PIP**
1. Type the source in the L2 cell of that destination and press Enter.
2. Drag the chip where you want it, or double-click it and type Position and Size.

**Build a projector blend**
1. ADVANCED ▾ › Blend Zones.
2. Drag the right-hand destination over the left one.
3. Click the PX number and type the overlap. Aim for the green tick.

**Same look on another preset**
1. Copy on the source tile.
2. Paste on the target tile.

**Kill a confidence monitor for one look**: click its chip in the AUX toolbar of that tile.

**Drop a screen from one look only**: double-click it › Remove from Preset.

### 4.10 Limits

- Destination order is the same in every preset; only position, rotation, visibility, name, colour and content change per preset.
- Arrow-key resize and corner drags change the real output resolution for the whole show.

---

## 5. Video Presets, Advanced (clips, timeline, Display)

Advanced shows ONE preset at a time, large, with your sources on the left, every property of the picked layer on the right, and a video timeline underneath. Use it to place a layer to the pixel, trim and level a clip, check a look with the real video playing, and send that look to a second monitor for a client. It is the same show Simple shows: nothing is a separate copy.

Open it with the **Simple / Advanced** pill at the top left of Video Presets. It opens on the preset you were last working on.

### 5.1 The page at a glance

| Area | What is there |
|---|---|
| Page bar (top) | Simple / Advanced · preset name, destination count, canvas size · **Display** · zoom −, %, +, Fit · **Export** |
| All Sources (left) | **Images** tab = the show's sources. **Video** tab = video and picture FILES you have added |
| Centre | The preset tile, exactly the tile from Simple, at the size of the window |
| Properties (right) | **Preset** tab = every preset as a thumbnail. **Layers** tab = the picked layer or background |
| Timeline (bottom) | Transport keys, ruler with In / Out, frame strip, audio waveform with the level line |

Both side panels collapse to a thin strip with the small panel key in their header, and their inner edge drags to make them wider. The page remembers this on your computer.

Zoom: −, +, the percentage goes back to 100 %, Fit fills the space with the tile. The scroll wheel zooms around the pointer; drag the dark background to pan. **Export** writes the Excel cue sheet, the same one as on Simple (chapter 9).

### 5.2 All Sources

**Images tab.** One card per source in the show (PPT A, CAM 1, LOGO …), with its resolution and connector. The **+** and the dashed "Add a source" card open the small Add a source window: type a name, pick a colour. Sources are removed in I/O Patch, not here.

**Video tab.** Video and picture files. Add them three ways: the **+**, the dashed "Add a video" card, or drag files from Finder / Explorer onto the list. MP4, MOV, WebM and pictures are accepted. The app keeps its own copy of the file; the show file only carries the name, the details and a cover picture, so show files stay small.

Each file card shows its cover, size, frame rate, length, type and whether it has audio.
- The round **play** key on a video card previews it right there (with sound). One preview at a time.
- A dimmed card that reads **relink** means the app no longer has the file (another computer, cleared storage). Click the card and pick the file again; every layer that used it comes back.
- The **×** in the corner of a card removes the file from the show. The app first tells you where it is used ("P02 LEFT LED L1, P02 CENTER LED BG"). Remove empties those layers, backgrounds and AUX, forgets their clip settings and deletes the app's copy. The original on your drive is never touched. One Undo brings all of it back.

**Using a source.** Drag a card:
- onto a **layer** in the tile: that layer now shows this source;
- onto a **destination** (anywhere that is not a layer): it becomes that destination's background (BG);
- onto a row in the **Layers** tab: same thing, handy for small layers. Dropping on an empty "L2 - drop a source" row adds a layer.

Whatever you drop on is picked, so its properties and, for a clip, the timeline are in front of you straight away. Dropping a source on an AUX box does nothing; what an AUX shows is chosen in the Simple table.

### 5.3 The centre tile

It is the Simple tile, so chapter 4 applies: destinations (pick, ◀ ▶ re-order, double-click for properties), layers (drag, corner handles, ↺), the gear menu (AOI Overlays, Blend Zones, Dead Space, Free Position, Fit Canvas), Paste / Copy / Reset / Trash, the AUX band, and the preset number, name and notes typed straight into the header. The page title and the thumbnail follow the name.

Clicking a layer picks it and opens the Layers tab on the right.

> **CHECK (second click on a layer).** The Simple chapter says a second click on a selected layer opens the Layer panel. The Advanced chapter says a second click on the picked layer lets go of it. Both engineers drove their own page; it is likely the pages differ on purpose (Advanced has the properties on the right), but neither chapter says so.

Two things from Simple are not here because only one preset is on screen: minimising a preset and dragging presets into a new order.

### 5.4 Properties › Preset tab

Every preset as a live thumbnail. Click one to bring it to the centre. The chips under a thumbnail switch that preset's AUX outputs without leaving the one you are on. **+** adds a preset (a copy of the first preset's layout) at the end of the list; the centre stays on the preset you were on.

### 5.5 Properties › Layers tab

With nothing picked you get the **overview**: each destination (click = select, double-click or the small key = Destination Properties) with its BG row and layer rows. Click a row to pick it. Rows that read "drop a source" are empty.

With a layer or a BG picked, the line at the top reads where you are (P02 · D01 · L1) and **Preset** takes you back to the overview. Each section opens and closes on its header. Most have copy, paste and reset keys in the header.

| Section | What it does |
|---|---|
| Source | The picture, and a menu to change the source (Video, Images, Common) or set it to none |
| Media Info | Read-only: kind, size, frame rate, length, codecs, audio, file name, where the file lives |
| General | Your own layer name; for a source you created: rename it everywhere, colour tag, notes (on a BG too). For a clip: **Speed** (0 = hold a still, 1.0, 1.25, 1.5, 2.0, 3.0) and **Loop** |
| Position, Size, Opacity, Mask, Border, Shadow, Effects | As in the Layer panel (4.5). For media, Size also has Scale H / V in percent of the picture |
| Filters (media) | B&W, Negative, Sepia |
| Color (media) | Hue, Saturation, Brightness, Contrast |
| Source crop (media) | A window on the source, in source pixels. With the padlock on, the layer follows the crop's shape, so a push-in is simply a tighter crop. Full picture clears it |
| Transition (clips) | Fade in and Fade out in seconds. In / Out are shown here and set on the timeline |

A background has the same sections except Position, Size, Opacity, Mask, Border, Shadow and Effects: a BG always fills its destination.

Numbers: type and press Enter, or drag the fader. Grab the knob, or press anywhere on its track.

### 5.6 The timeline

It follows the picked layer or BG when that holds a clip. Until then the keys are grey.

| Key | What it does |
|---|---|
| Left clock | Time since In |
| CLIP Stop, Play, Pause | The picked clip only. Stop returns to In |
| CLIP 30 / 20 / 10 | Jump to the last 30, 20 or 10 seconds before Out |
| In, Out, × | Mark In / Out at the playhead, frame-exact, also while it plays. × clears both and keeps the fades |
| PRESET Stop, Play, Pause | Every clip in the preset together |
| PRESET 30 / 20 / 10 | Every clip to ITS OWN last 30 / 20 / 10 seconds |
| Cover | Use the frame under the playhead as the picture Simple, the thumbnails and the exports show for this clip |
| Right clock | Time left to Out |

On the lanes: click or drag anywhere to scrub. Drag the two handles on the ruler to trim In and Out. The white line across the waveform is the **level**: bottom 0 %, middle 100 %, top 200 %. Drag it (5 % steps, hold Shift for 1 %), use the arrow keys on it for 1 % steps, double-click for 100 %. A click, a drag or a double-click on it is one Undo step. The L / R meters read the picked clip while it plays.

Picking another layer stops what was playing, unless you started playback with PRESET Play.

### 5.7 Display

1. Press **Display** and read the note.
2. Press **Open Display**. A second window opens with ONLY the open preset: no panels, no handles.
3. Drag it to the other monitor and double-click it for full screen (Esc leaves full screen).

It follows everything you do: play, pause, scrub, a different preset. If you go back to Simple it goes black until you return. Press Display again, or close the window, to end it.

It is a reference picture next to your switcher, not a playback machine: H.264 and HEVC clips play, ProRes and HAP show their cover picture.

### 5.8 Common jobs

**Put a video on a screen**
1. Video tab › **+** › pick the file.
2. Drag its card onto the layer (or onto the destination for a full-screen background).
3. Press Space to check it.

**Trim it and set the level**
1. Pick the layer.
2. Scrub to the first frame you want and press **I**.
3. Scrub to the last and press **O**.
4. Drag the white line for the level.
5. Press **Cover** on a good frame so Simple and the Look Book show something meaningful.

**Rehearse the end of a long video**
1. PRESET Play.
2. PRESET 30 (or 20 / 10). Every clip jumps to its own last seconds and keeps playing.

**A picture-in-picture to the pixel**
1. Pick the layer.
2. Size: type the width (height follows the lock).
3. Position: type X and Y.
4. Border on if you want an edge.
5. Copy the Size section, pick the matching layer on the other screen, paste.

**Push in on a camera shot or a slide**: Source crop: bring the four sides in. With the padlock on the layer takes the crop's shape.

**Swap the file for a new version**
1. Remove the old card (×).
2. Add the new file.
3. Drop it on the same layers. Undo is there if you removed the wrong one.

**Show the client**: Display › Open Display › drag the window to the second monitor › double-click it.

### 5.9 Good to know, and limits

- Files live inside the app on this computer. Open the show on another machine and the cards ask for a relink; nothing else is lost.
- The app keeps one stored copy per clip name, shared by every show on this computer. Removing a clip deletes that copy; another show that used the same name asks for a relink.
- What an AUX / DSM shows is chosen in the Simple table; Advanced switches outputs on and off and renames them.
- A full-size layer has nowhere to move: X and Y stay at 0.
- The non-standard-resolution window (the red pill) can only be opened from the Simple table.
- The 1 to 9 keys do nothing you can see in Advanced.

---

## 6. Wire, Simple

Wire Simple is the one-line drawing of your show that draws itself. Every source the show uses sits on the left, one switcher sits in the middle, every destination and every AUX / DSM output sits on the right. Each source is cabled into the switcher and each output is cabled out of it, in show order. You never draw a cable here. What you do is dress the drawing (cable types, colours, pictures, names, layout), fill in the title block, and print it.

It answers "what is plugged into the switcher and what comes out". It does not show which source is on which screen in a given look: for that, click a preset on the right (the drawing lights only what that look uses) or click a node (Details lists the presets that use it).

### 6.1 The page bar

| Control | What it does |
|---|---|
| **Simple / Advanced** | Simple is this automatic drawing. Advanced is the free-form builder (chapter 7). |
| **− / +** | Zoom out / in by 10 %, from 25 % to 300 %. The drawing stays centred. |
| **The percentage** | Click it to go back to 100 %. |
| **Fit** | Shows the whole drawing between the two side panels, including anything you dragged away. It never zooms past 100 %. |
| **Reset Layout** | Puts every moved node, the switcher and every moved cable back to the automatic layout. One Undo brings your layout back. |
| **Export** | Opens the Export window (6.5). |

Trackpad pinch, or Ctrl / Cmd + mouse wheel, zooms around the pointer. A plain two-finger scroll or wheel pans. The Space bar is not a temporary Hand tool here.

### 6.2 Left panel: the cards

Three folding lists: **All Sources**, **All Destinations**, **AUX / DSM**. Click a list's header to fold it. The small panel icon at the top right shrinks the whole panel to a strip and brings it back.

Every card has:

- **Thumbnail tile.** Until you give it a picture it shows the name on the card's colour. Click the tile to upload a picture (it is shrunk to thumbnail size). On a source, the cable colour is then matched to the picture's main colour; picture and colour are one Undo step. Hover a picture and press the **×** to remove it.
- **Colour bar** under the tile. Click it to pick any colour. On a source this is the cable colour (tile, node and cable follow). On a destination or AUX it is the colour of its node and tile.
- **Shuffle** (crossed arrows). Picks another colour from the palette.
- **Resolution.** Type it, or press the small ▼ for the list: Custom (opens the bandwidth calculator, 8.4), the resolutions already used in this show, then the standards. A source accepts any text; a destination or AUX only accepts a real size such as 1920x1080, because it resizes the screen in Video Presets too. Esc while typing puts the old value back.
- **Cable Type.** The same list as I/O Patch (HDMI, SDI, NDI, fibre …). It sets the cable's colour and line pattern on the drawing and adds the type to the Cable Colour Code on the right. "Clear" removes the type.

Source cards also have a **pencil** next to the name. It renames the source everywhere at once: every preset, I/O Patch, Video Presets, both Wire views, its thumbnail, and the place you dragged it to on this drawing. A name already in use is refused; Esc cancels. Destinations and AUX outputs have no pencil; rename them in Video Presets or I/O Patch.

Everything you change on a card is one Undo step and lights the unsaved mark.

### 6.3 The drawing

- **Click a node** to select it: its cable thickens and Details shows where it is used. **Shift-click** adds to the selection. **Drag on empty grid** to box-select. Click empty grid to clear.
- **Drag a node**, or a selected group, anywhere. Cables follow and route around other nodes.
- **The switcher**: type its real name in the box at the top (E2, Spyder, ATEM …); it prints on the sheet and is one Undo step. Drag it by its "11 IN · 5 OUT" bar. Parked over other nodes it turns see-through. Its # / Source / ID and # / Destination / ID columns fill themselves from the show; the ID cells read "—" here and cannot be typed (real port IDs are typed in Advanced).
- **Click a cable** to select it. A white handle appears at its middle: drag the handle to move that cable out of a crowded run. One Undo step.
- **Delete / Backspace do nothing here.** Simple always shows the whole show; remove a source or a screen in Video Presets or I/O Patch.
- **Tools** (left edge of the drawing): **Select** (default), **Hand** (drag anywhere to pan, even over a node), **Align** (in Simple the panel offers "Clean up", which is the same as Reset Layout, and an Undo arrow).

### 6.4 Right panel

- **Presets.** Click a preset to filter the drawing to that look: sources it does not use fade and their cables dim. Click it again, or press Esc, to show everything.
- **Details.** With nothing selected: the lane counts and the **Cable Colour Code**, one row per cable type in use; hover a row to see who uses it. With a node selected: every preset that uses it and where. A background counts. With a source on an IP cable (NDI, ST-2110, Dante) selected, an **IP Address** field appears; the next one you fill starts from the same range.
- **Project Info** is the title block of the printed sheet: Project, Date, Venue, Client, Job No, Designer, Drawn By, Project Ver, the automatic Drawn date, and your **Logo** (click the tile to upload, × to remove; the × removes it at once and Undo does not bring it back). These are the same fields as Quick Setup, so fill them in either place. **Dates, Address and Format** are for the cover tab of the Excel exports only and do not print on the drawing. Press Enter or click away to commit a field. A blank Venue reads N/A.
- Each header folds its section. On a short window Presets and Details scroll inside themselves so Project Info is never cut off.

### 6.5 Export

1. Press **Export**.
2. Choose **Format**: PDF opens the print dialog with the page size already set; SVG and PNG download at once.
3. Choose **Theme**: Light for print and email, Dark to match the app.
4. Choose **Sheet size**: Letter, Tabloid, ANSI D, ANSI E, A1, A0, landscape. The choice is saved with the show. One size for the whole export.
5. Press **Export** again.

The sheet carries the drawing, the Cable Colour Code, the title block from Project Info with your logo, and "Page 1 · Full System". The switcher prints with the same # / Source / ID columns you see on screen **(after the fix; today the print still says SLOT)**.

**Asset Pack: Download All Thumbnails (ZIP).** One ZIP with a 1920 × 1080 PNG per source, destination and AUX in three folders. Uploaded pictures are used as they are; every other tile is the name in white on the colour of its card. Hand it to the graphics and playback operators as test slates.

×, Cancel, a click outside the window, or Esc closes it without exporting. There is no Excel export from Wire.

### 6.6 Common jobs

**Dress the drawing for a show**
1. Open Wire. Press Fit.
2. On each source card set the Cable Type, then the resolution.
3. Do the same on the destination and AUX cards.
4. Type the switcher's real name in the box at the top of the switcher.
5. Drag anything that crowds; move a cable with its white handle.
6. Fill in Project Info and upload the logo.
7. Export › PDF › the sheet size your printer takes.

**Rename a source everywhere**: press the pencil on its card, type, Enter.

**Check one look**: click the preset on the right; click it again when done.

**Find where a source is used**: click its node and read Details.

**Give operators a slate for every input**: Export › Download All Thumbnails (ZIP).

### 6.7 Limits

- Simple always draws the whole show through one switcher.
- One handle per cable here; Advanced gives a handle on every straight run.
- Zoom, the chosen tool, folded sections, the layout and the sheet size are saved with the show.
- PDF goes through the print dialog, so the file is made by your system's "Save as PDF".

---

## 7. Wire, Advanced

Advanced is where you draw the system you will actually build: routers, the switcher frame, converters, DAs, network switches, backup runs, second rooms, the truck. Every cable lands on a port, names follow the cable, and each page prints as its own sheet.

Open it from **Wire**, then the **Advanced** pill. The first time, a short note explains the mode; choose **Switch to Advanced**. Tiles and cables drawn here stay here. The one thing that reaches the rest of the show is renaming a source with its pencil.

The panels, zoom, tools, Presets, Details, Project Info and Export are as in chapter 6. What is different:

- **Left panel**: drag a card onto the canvas to place it. Drag the same card twice if the machine appears twice on the drawing.
- **Canvas**: an endless grid. Tiles go anywhere.
- **I/O Tools** (bottom centre): add a router, a switcher, a converter, a network switch, or a tile built from an I/O Patch page.

### 7.1 Pages

- **Page 1 is your show.** It opens already built: every source cabled into a switcher tile, every destination and AUX cabled out of it. It takes the show name.
- The last page is always an empty spare. Use it and a new spare appears, up to 25 pages.
- **Click** a tab to open the page. **Double-click** the tab to rename it: Enter keeps the name, Escape puts the old one back and stays in Wire; a rename is one Undo step.
- On the open tab: the **copy icon** makes "<name> copy" on the spare page. The **×** closes the page; a page with anything on it asks first, and Undo brings it back. Long names are shortened on the tab so the two icons are always reachable.
- If sources, destinations or AUX change in the show after page 1 was built, opening Advanced offers **Rebuild from Simple** once. "Keep my page" leaves your drawing alone. A rebuild replaces page 1 only and can be undone.

### 7.2 Tiles

**Source tile.** Coloured in the source's cable colour. The dot on the right edge is its output.
- **+** on the top right corner adds an output point (up to six). **−** removes the last one (refused while it holds a cable).
- **Aa** shows a name box beside each point (MAIN, BACKUP, TX-2). Typing a name is one Undo step. At the third point the app asks once whether you want the name boxes.
- Select the tile and Details lists every output with its own **cable type** button. A point with no type of its own uses the source's cable type.
- The **pencil** beside the name renames the source everywhere in the show.

**Destination and AUX / DSM tiles.** The dot on the left edge is the input.
- **+** on the top left corner adds a **backup input**; the two points are then tagged PRI and BKP. Drop a second source on a tile that is already fed and the backup point appears by itself and takes the cable. A third source is refused.
- You can also pull a cable the other way: drag from the input dot back onto a source tile, a router row or a converter port.

**Custom tiles.** The **+** on each left panel heading adds a custom source, destination or AUX that exists only in Wire (a record deck, an encoder). Type its name and resolution on the card, then drag it onto the canvas. A custom source also has a cable colour and cable type; a custom destination or AUX has neither. The **×** on the card removes it together with its tiles and cables on that page; Undo brings everything back. Names are kept unique: a second "New Source" becomes "New Source 2". Custom cards belong to the page they were made on.

**Router (video hub).** Left half: inputs (# · Source · ID). Right half: outputs (Destination · ID · #). The numbered keys in the middle are the matrix panel:
1. Press an **Out** key (it blinks).
2. Press an **In** key. The route is made and the small number on the Out key shows its input. Either order works.
3. The same pair again clears the route. The same key again, or Escape, cancels the blinking key.

One input can feed many outputs; an output has one input. The routed source's name and ID follow through the output to whatever is cabled to it.

**Switcher.** The same tile without the matrix keys.

**On both:**
- **Name cell** follows what is plugged into the row. **ID cell** follows the point it is plugged to (PRIMARY, OUT 2, BKP, In 3) until you type your own; typed ID text stays through re-plugs, and clearing the box hands it back to automatic. **Tab** in an ID cell goes down the column, Shift + Tab goes up. Tab after typing in any other box moves to the next box.
- **+ In / + Out** at the bottom add a row. **×** at the end of a row removes it (refused while a cable is on it). The **pencil** in the title bar reopens the size window for a bulk resize. A tile that grows pushes the tile stacked under it down.
- Title and subtitle are yours to type. The default router subtitle keeps up with the real size until you replace it.

**Converter.** In and Out port lists, a **cable type** and a name on every port, **+ In / + Out** at the bottom, **×** on a free port. A cable leaving a port takes that port's colour and pattern. Growing it pushes the tile below it down.

**Switch (network).** One list of ports, Ethernet by default; every port is in and out. **+ Port** adds one.

**I/O Patch page tile.** Any I/O Patch Advanced page that has rows appears at the bottom of I/O Tools. The tile arrives with every input and output already named, is named after the patch page (locked, rename it in I/O Patch) and keeps the page's rows. It never lands on top of another tile.

### 7.3 Cables

- **Draw**: drag from an output dot to a destination tile, a router / switcher row or a converter port. Cables are always right-angled and hop where they cross.
- Dropping on a router or converter body lands on the row under the pointer. The same cable twice is ignored. Dropping on empty canvas does nothing.
- **Select**: click a cable. It shows a white handle on every straight run: drag a handle to move that run. **Double-click a handle** to reset the route.
- **Move an end**: drag a plugged input port to another port. **Option-drag** an output dot to move the source end.
- **Delete**: select it and press Delete or Backspace, or **double-click the cable**. (Double-clicking a cable deletes it; it does not reset its route.)
- **Colour and pattern** come from the cable type: the output point's own type first, then the source's, then the converter port's.

### 7.4 Select, move, align

- Click a tile to select it. **Shift-click** adds or removes tiles. **Drag on empty canvas** draws a selection box. Drag any selected tile and they all move.
- **Delete / Backspace** removes the selected tiles with their cables, including a backup cable. While Wire is open these keys never reach Video Presets behind it.
- **Align tool**: with a selection, a palette offers Left / Center / Right, Top / Middle / Bottom (two or more tiles), Distribute Horizontally / Vertically / Evenly (three or more), **Clean up columns** and an Undo button. Drag the palette by its header; double-click the header to dock it. Clean up columns does not move converters or network switches.
- **Reset Layout** (page bar) tidies the Advanced page into three columns, sources · routers and switchers · destinations and AUX. One Undo step; it does not touch the Simple layout **(after the fix; today it moves nothing here and silently resets the Simple drawing)**.

### 7.5 Export

As 6.5. Every page that has something on it prints as its own sheet with the page name large in the upper left corner, the title block and the cable colour key; the empty spare page is skipped. Edit buttons (+, ×, pencils, handles) never print.

### 7.6 Common jobs

**Add a router between the sources and the switcher**
1. I/O Tools › 10×10 Router (or Custom router…).
2. Drag the input end of a source's cable from the switcher row to a router In row.
3. Draw a cable from a router Out row to the switcher row.
4. Press the Out key, then the In key. The switcher row now reads the source's name through the router.

**Primary and backup to a projector**
1. Cable the primary to the destination tile.
2. Drop the backup source on the same tile. The BKP point appears and takes it.

**A laptop with two feeds**
1. Press + on its tile, then Aa.
2. Type MAIN and BACKUP.
3. Select the tile and give OUT 2 its own cable type in Details.

**A converter in line**
1. I/O Tools › Converter…, 1 in, 1 out.
2. Set 12G-SDI on the In port and HDMI 2.0 on the Out port.
3. Cable source › In, Out › destination. The cable changes colour at the converter.

**A second room**
1. Open the spare page and rename it.
2. Drag the tiles it needs. It prints as its own sheet.

### 7.7 Limits

- 25 pages. Six output points per source tile. 64 rows per side on a router or switcher, 64 ports on a converter or switch.
- A destination or AUX takes two inputs: primary and backup.
- Help cannot be opened while Wire is up; go back to Video Presets Simple.

---

## 8. I/O Patch

The I/O Patch is the engineer's patch sheet: every source and every output with its connector, machine or device type, resolution and notes, plus a red flag when a connector cannot carry the resolution. It fills itself from the show you built in Video Presets. It exports to Excel as your patch book.

Two views, chosen at the left of the page bar:

- **Simple** follows the show. Every source used in a preset (layers, backgrounds, AUX content) and every destination, AUX / DSM and multiviewer is already listed. You add the engineering detail.
- **Advanced** is a patch-book builder with pages. Page 1 is the show; pages 2 and up are free sheets for a breakout room, a rehearsal rig or a rental sub-list.

### 8.1 The page bar

| Control | What it does |
|---|---|
| Simple / Advanced | Switches the view. The first time you open Advanced, page 1 is built from the show. |
| Page tabs (Advanced only) | Click to open a page. Double-click to rename it (Enter keeps the name, Escape cancels). On the open tab: the copy icon duplicates the page, the × closes it (a page with rows asks first). |
| Export | Writes the Excel patch book (chapter 9). |

### 8.2 The columns (same for sources and outputs)

| Column | How to use it |
|---|---|
| Badge | S1, S2 … sources. D1 … destinations. A1 … AUX / DSM. IO = an I/O-only destination. MV = multiviewer. |
| Name | Type a new name and press Enter, or click the chevron for the list: "Type your own name", the names already in the show, then common names. On an output the list offers destination names only. |
| Connector | Click for the cable menu: HDMI family, DisplayPort / DVI / USB-C, 3G / 6G / 12G-SDI, NDI, ST-2110, SRT / RTMP / RTSP, Fiber, SFP, Dante, MV, Ethernet, Genlock, LTC. "Clear" empties it. A source's tile colour in Wire follows the cable you pick. |
| Type | Sources: PC, Workstation, Mac, Camera, PTZ, Media Server, Switcher, Teleprompter. Outputs: LED, Projection, Monitor, Stream. "Custom…" turns the cell into a text box; the name you type is remembered and offered in the menu from then on. |
| Resolution | Click for the list: sizes already used in the show first, then Standard HD, UHD / 4K, DCI, ultra-wide, 5K and up, LED wall sizes, SD. "Custom resolution…" opens the calculator (8.4). "Clear" empties a source's resolution. |
| Red pill | Lights up between Resolution and Notes when the connector cannot carry that resolution (3840×2160 on 3G-SDI, for example). Hover it for the reason. It compares pixel count with the connector only; frame rate and bit depth are not stored per row. |
| Notes | Free text. Enter or clicking away keeps it, Escape throws the edit away. |
| Reset (round arrow) | Asks, then clears connector and notes (and the resolution on a source). Name and type stay. |
| Trash | On a source that lives in the presets: asks, then removes it from every preset, background and AUX, and from the library. On an I/O-only row: removes it straight away. On a destination or AUX: asks, then removes it from the canvas and every preset. Undo brings any of them back **(after the fix; today these deletes are permanent)**. |

**Set for all.** The first row of each table (S0 / D0) sets the connector, type or resolution of every row under it in one go. One Undo step takes the whole change back. On the output side it sets destinations, AUX / DSM and I/O-only destinations; the multiviewer is left alone.

### 8.3 Sources, destinations, multiviewers

**Renaming a source** here is a rename everywhere: every preset layer, background and AUX, the library, Wire, and Advanced page 1. A name that is already in the show is refused with a message **(after the fix; today the two sources silently merge)**. Renaming a destination or AUX here changes its name on the canvas and in the preset table too.

**Add Source** adds an I/O-only source: it is on this sheet, in Wire and on Advanced page 1, but never in the presets or the library. Use it for a backup machine, a spare media server, a record deck. **Remove Source** lists only those I/O-only sources. A source that lives in the presets leaves with the trash on its row.

PBP and GFX travel in pairs: name a source **PBP A** or **GFX A** and its **B** appears under it. Delete the B if the show has none; it stays gone.

Destinations and AUX outputs are added and removed in Video Presets (or with + Destination in the top bar); the patch follows.

**Multiviewers.** Every show has one multiviewer row (MV 1). **Add MV** adds another; **Remove MV** opens a list to pick from. Multiviewers live only here and in the Excel export, never on the canvas. Delete the last one and a fresh MV 1 comes back. A multiviewer cannot be renamed in Simple (it can on an Advanced page).

### 8.4 Custom Resolution window (the bandwidth calculator)

Width, Height, Refresh (23.976 to 120 Hz) and 8 / 10 / 12-bit tabs. It shows total pixels, pixel rate and the bandwidth at 4:4:4 and 4:2:0, and a grid of connectors marked OK, tight or over for that signal. **Save** writes Width × Height into the row (the refresh rate and bit depth are for the calculation only). Cancel, the ×, a click outside or Escape close it without saving.

### 8.5 Advanced view

**Pages**
- **Page 1 is the show.** It starts as a copy of the Simple patch under the show's name. A source you name there also appears in Simple (as an I/O-only row) and in Wire; a destination or multiviewer you name there appears in Simple only. Nothing on any Advanced page changes the Video Presets.
- If the Simple side changed since page 1 was built, opening Advanced asks once: **Rebuild from Simple** (replaces every row on page 1) or **Keep my page**.
- **Pages 2 and up stand alone.**
- The last page is always an empty spare. As soon as it has a row, a new spare appears (25 pages maximum). There is no "add page" button.

**Tables on a page**: Sources, Destinations and Multiviewers, each with its own Set-for-all row and the same columns as Simple.

| Control | What it does |
|---|---|
| Rows box (next to the table title) | Type how many rows the table needs (up to 999) and press Enter. It adds blank rows up to that number; going down it only trims blank rows from the end, never a row with data. |
| + Add Source / + Add Destination / + Add Multiviewer | Adds one row and puts the cursor in its name box. |
| Reset | Clears connector, resolution and notes straight away. |
| Trash | Deletes the row straight away. On page 1 it also removes the I/O-only twin it created in Simple. |

**Backups.** The two-arrow icon next to a source name is the backup mark. Grey: no backup; click it to open the Backup window. Lit: this source is a primary with a backup (hover to see which). Dim and not clickable: this row is the backup of the row above it.

In the Backup window:
1. The top list shows every pair on the page; the × next to a pair splits it.
2. Pick a **Primary** and a **Backup** from the two menus. Sources already in a pair are not offered.
3. Press **Pair**. The backup moves right under its primary on the page.
4. A source missing from the page? Type it in the empty box at the bottom of the table and press Enter, or use **+ Add source**.
5. Close with the ×, Escape or a click outside.

Names ending in " A" and " B" with the same stem (PPT A / PPT B) pair by themselves. One backup per primary.

### 8.6 Common jobs

**Patch a new show**
1. Build the show in Video Presets (or Quick Setup), then open I/O Patch.
2. In "Set for all sources" pick the house connector and resolution. Do the same in "Set for all destinations".
3. Fix the exceptions row by row: cameras to SDI, the prompter, the stream AUX.
4. Set the machine type on each source and the device type on each output.
5. Clear any red pill.
6. Add Source for every backup machine that is not in a preset.
7. Export.

**Make PPT B the backup of PPT A in the patch book**
1. Advanced, page 1.
2. Click the two-arrow icon on PPT A.
3. Backup menu: PPT B.
4. Pair, then close. The Excel tab for page 1 now shows P and B.

**A sheet for the breakout room**
1. Advanced, click page 2, double-click the tab and name it.
2. Type the number of sources in the Rows box.
3. Fill the rows.
4. Export: the room gets its own tab.

### 8.7 Limits

- Rows cannot be re-ordered by hand.
- I/O-only destinations print on the Advanced page-1 tab, not on the Video I-O tab.
- A source that is a background on a destination shows that destination's note in Simple, and typing there rewrites the destination's note (an old rule; question 30).
- A destination, AUX or source removed in Video Presets can come back on the patch as an I/O-only ghost row the next time Advanced opens (open fault; question 31). Delete the ghost row in I/O Patch.

---

## 9. Exports and sending

Everything that leaves the building sits in the top bar and stays there whichever page you are on. **Export** holds Excel, Look Book and Send. Wire has its own Export button (6.5) and so does I/O Patch.

### 9.1 Look Book (the printable book)

1. Press **Look Book**. A window opens.
2. Under **Pages to include**, tick what the book should contain.
3. Under **Details**, tick what prints on the canvas pictures and tables.
4. Type a **Version** (blank = V1) and pick **Light · For Print** or **Dark · For Screen**.
5. Press **Export PDF**. The book opens in a new tab with the print dialog: choose Save as PDF, Letter, landscape. If the browser blocks the new tab the book is saved as a file instead and a message tells you so.

| Pages to include | What you get |
|---|---|
| Cover page | Show name, canvas size, number of presets / destinations / AUX, version, a notes box you can type in before printing, date. |
| Table of Contents | Every section with its real page number; each row is a link that jumps to the section. Long preset names are shortened here only. |
| Sources I/O reference | Every source with connector, name, type (a backup reads "Backup of PPT A"), resolution, notes. |
| Destinations I/O reference | Destinations, AUX / DSM and multiviewers, same columns. |
| Per-preset pages | One block per preset: the notes, the canvas exactly as the program canvas shows it, the layer resolutions, AUX / DSM content and the destination breakdown: one column per destination with the BG line first, then L1, L2 … A preset that does not fit on one page continues on the next with its header repeated. |
| Summary page | The whole show in one table: one row per preset, one column per destination, then the AUX / DSM table. |
| Wire Diagram | The wire sheet with the cable colour key and the project block. **Wire view** picks Simple or Advanced. Advanced prints only the page that is active in Wire Advanced, labelled "Page 1"; if that page was never drawn the sheet reads "(Empty page…)". |

| Details | Adds |
|---|---|
| Show AOI markers + dimensions | The AOI box on the canvas and an "AOI 1280x720" line in the breakdown. |
| Show Crop and layer FX | Under each layer: the mask per side in pixels with the visible size it leaves, then opacity, flip, border, shadow. Long lines wrap, nothing is cut. |
| Show Blend Zones | The overlaps on the canvas, a line per pair (192x1080 px, ~10 %) and the ultra-wide total of each blend group. |
| Show Dead Space | The gaps on the canvas and a line per gap in pixels and feet. |

The four Details start the way your overlays menu is set. **Version** is stamped on the cover and on the strip at the top of every page so an old printout is obvious. **Cancel**, the ✕, a click outside the window, or Esc close the window without exporting.

> **CHECK (are the Look Book window choices remembered?).** The toolbar chapter says "your choices are remembered until you close the app". The exports chapter says "choices are remembered only when you export" and that they go back to the defaults after a reload. Both agree they are not stored in the show file.

Good to know
- The Look Book does not run the Pre-Export Check (the two Excel exports do).
- The canvas on the preset pages follows the **Canvas** size in the top bar. If you added destinations and the canvas was not refitted, use ADVANCED ▾ › Fit Canvas first, or the destinations past the canvas edge are cut, on paper as on screen.
- Clip settings (In / Out, loop, speed, level, fades, look) print on the BG line. A clip on a layer prints only its name and size. EDID notes are not printed anywhere.
- The Version box belongs to the Look Book window and is not stored in the show. The Excel cover and the Wire title block use **Project Ver** from the show info instead.
- The first Look Book with a wire sheet gives each source its cable colour, the same as opening Wire does, so the show then counts as changed. Save afterwards.

### 9.2 Excel (the cue sheet)

**Excel** in the top bar, and the **Export** button at the top-right of the Video Presets tab (Simple and Advanced), both write the whole-show cue sheet, `<show>_look_book.xlsx` (Send names the same sheet `<show>_cue_sheet.xlsx`):
- **Cover** tab: show name, "CUE SHEET", venue, dates, address, format, designer, version, from the show info.
- **Cue sheet** tab: one row per preset (P#, name, notes), one column per destination and per AUX / DSM in use. Each destination cell reads top to bottom: `BG: name (detail)`, then `L1: name (visible size) · effects`, then `AOI: size @ position`. An AUX cell shows what feeds it in that preset.

The **Export** button on the I/O Patch page writes `<show>_video-io.xlsx`:
1. **Cover**: the same cover titled "I/O PATCH".
2. **Video I-O**: the Simple patch. Sources (Slot, Connector, Source Name, Type, Resolution, Notes), then Destinations, AUX and Multiviewers.
3. **One tab per Advanced page that has rows**, named after the page, with a **P/B** column marking primaries and backups.

### 9.3 The Pre-Export Check

Both Excel exports look the show over first. If everything is in order the file is written at once.
- **Errors stop the export:** blank show name, no destinations, no presets.
- **Warnings let you go on:** a destination with a non-standard size that the engineer has not approved, or one above DCI 4K; a preset with no name; a preset with nothing on it (a BG-only look such as a walk-in logo is fine **(after the fix; today it is flagged)**); a Canvas size that does not match the layout. On the I/O Patch: sources or destinations with no connector or no resolution, and a cable that cannot carry the resolution.
- **Export Anyway** writes the file. **Close**, the ✕, a click outside, or Esc go back to the show. The check never changes the show itself, and it has no "fix it" button.

### 9.4 Send

**Send** builds the hand-off in one click.
- **Desktop app:** a confirmation, then the Look Book as a real PDF, the Excel cue sheet and the show file are written to *Documents › AV Look Book › Outbox › your show*, and a new email opens with all three attached (Apple Mail on the Mac; elsewhere the mail text is on the clipboard and the folder opens so you can drag the files in).
- **Browser / phone:** the share sheet opens with the Excel cue sheet and the Look Book (an .html file that opens in any browser and prints to PDF). Where there is no share sheet the two files download and a draft email opens with a note to attach them. The show file is not included; attach the .avlb yourself if the crew needs it.

The Look Book that Send attaches is the one the Look Book window would give you, wire sheet included.

In a browser, Send and Bug open your mail program by leaving the page for a moment; with unsaved changes the browser asks "Leave site?". Save first, or answer Leave: the show stays open.

### 9.5 Common jobs

**Hand a caller the book the night before**
1. Look Book, leave the pages ticked.
2. Type the version (V2 rehearsal), choose Light.
3. Export PDF › Save as PDF.

**Give the EIC a patch list**
1. I/O Patch: fill connector and resolution until the check is quiet.
2. Export. The Video I-O tab is the list.

**Send the whole packet to the crew**
1. Save.
2. Send. Add the recipients and send.

**Pick the show up on another machine**
1. Save, move the .avlb, Load it there.
2. Video and picture files are not inside the .avlb: relink them in Video Presets Advanced, Video tab.

### 9.6 Limits

- The Look Book is built for Letter landscape. Very dense presets (8 destinations with 8 masked layers each) run to several pages per preset.
- Wire has PDF / SVG / PNG export in its own window, no Excel.

---

## 10. Saving, drafts and Undo

### 10.1 The show file

One file (.avlb) is the whole show: destinations, presets, every layer with its mask, effects and clip settings, AUX / DSM outputs, canvas size, show info, the I/O Patch (Simple and the Advanced pages), the Wire pages and their thumbnails. Video and picture files are not inside it (5.9).

| Control | What it does |
|---|---|
| **Save** | Writes the show file. The first time it asks where; after that it overwrites the same file quietly (Chrome and Edge; Safari and Firefox download a new copy each time). |
| **Shift + click Save** | Save As. Save now writes to the new file. |
| **Cmd / Ctrl + S** | Save from anywhere, including while you are typing in a box (the box is committed first). Add Shift for Save As. |
| **Load** | Opens a show file. If the open show has unsaved changes you are asked first. A damaged file, or one that is not a show, is refused with a message and your show stays as it was. |
| **New** | Asks first, clears the show, then opens Quick Setup. Cmd / Ctrl + N does the same **(after the fix; today the key opens Quick Setup over the open show and Build My Show adds to it)**. In the desktop app New opens a new window instead; every show has its own window. |

**The unsaved mark.** Save turns gold while there are changes that are not in the file. It compares the show with what was last saved, so Undo back to the saved state turns it off. It comes on within half a second of any change, including typing the show name and any edit in Wire. New, Load, an example show or closing the window ask first when it is on.

> **CHECK (what lights up).** The exports engineer found that the Save button's text turns gold and the separate "dot" element is always hidden (the Help line about a gold dot was wrong). The undo chapter still calls it "the gold dot on Save", the toolbar chapter "the Save icon lights". This manual says "Save turns gold".

Today, just looking can light it: the first time Wire (or Advanced, or a Look Book with a wire sheet) draws a show it gives every source a cable colour, and the first visit to I/O Patch Advanced builds page 1. Both are real changes to the file. Save once and it stays quiet.

### 10.2 Autosave and drafts

- **Desktop app:** the show file itself is written about every 30 seconds once the show has a file and an unsaved change, and again when the window closes. It lives in Documents › AV Look Book. If an autosave ever fails, a red note appears bottom right: save by hand.
- **Browser:** the app keeps a draft inside the browser 30 seconds after a change and again when the tab closes. Next time you open the page it asks **Restore draft** or **Start fresh**. An empty show is never offered, and the draft is safe while that question is on screen, even if you reload again before answering. A draft is a safety net, not a save: it lives in that browser on that computer only.
- A restored browser draft puts the destinations back on the plain left-to-right strip. If you built blend zones or dead space with Free Position, open the saved file instead of the draft to get them back.

### 10.3 Undo and Redo

The same history covers all three tools. Undo / Redo are in the top bar (dim when there is nothing to undo or redo), on Cmd / Ctrl + Z and Cmd / Ctrl + Shift + Z (or Cmd / Ctrl + Y), and as an arrow in the Wire Align panel. The top bar stays visible over Advanced, Wire and I/O Patch, so they are always within reach. While the cursor is in a text field, Cmd / Ctrl + Z undoes your typing inside that field; click outside the field first to undo show changes.

**One action is one step.** Today about thirty actions make no step, or make it too late to undo anything; chapter 13 lists them.
- A click that changes something: Add Destination, Add Preset, Add AUX, a pick from a menu, a toggle, Remove, Paste, Reset.
- A drag, from press to release: moving or resizing a layer, a destination, an AOI box, a Wire tile, a cable handle, a fader.
- A field, from the moment you click into it until you leave it or press Enter. Typing ten letters is one step, not ten.
- Apply in Destination Properties is one step even when it changes size, position and rotation together, and the "Keep your layout?" question that may follow belongs to the same step.
- A rename that runs through the whole show is one step and Undo puts the old name back everywhere.
- In the layer panel, a custom name, a size and Apply together are one step.

> **Arrow-key nudges of a layer are one Undo step per burst.** Nudge as many times as you like; when you pause for about half a second the burst is closed, and one Undo puts the layer back where the burst started.

**What does NOT use a step:** selecting, opening or closing a window, switching tools, switching presets in Advanced, zoom, pan, collapsing presets, opening a Wire or I/O page tab, playing a clip. Looking around never destroys your Redo.

**Not covered by Undo:** the show name, date, venue, the Project Info fields, the company logo, the canvas size and the AUX / DSM label choice. Change them back by hand. A colour change to a built-in content type is not covered either.

History holds the last 50 steps. It starts empty when a show is opened (New, Load, Restore draft) and is not stored in the file. A new change after an Undo clears Redo; to compare two versions, Shift-click Save first.

Undo restores the show, not the view: it does not scroll for you and it clears the current selection. Re-open a properties window after an Undo so it shows the restored values.

**Quirks to know**
- The first time Wire draws a show it picks cable colours; undoing back past that point lets Wire pick new colours.
- A destination dragged in the normal strip layout snaps back and still uses one (empty) step; so do Reset positions and Reset Preset Layout when nothing moved, and Cancel on "Create Blend Zone?". Press Undo once more.
- Switching Wire or I/O Patch between Simple and Advanced uses a step; Undo straight after a switch flips the view back. In Wire the zoom level rides in the step too.
- Holding an arrow key on a selected destination (resize) uses one step per pixel.
- The phone layout has no Undo button.

---

## 11. Windows, menus, Escape and Enter

Everything that opens over a page (messages, Add Destination, the colour window, the properties panels, dropdown lists, the export windows, Help) opens ABOVE the page you are on, including Wire and I/O Patch **(after the fix; today + Destination opens behind Wire and I/O Patch, and a warning raised from a Wire window can open behind that window)**.

**Closing.** A window with a dark area around it closes with a click on that dark area. Panels and lists close with a press anywhere outside **(after the fix for the overlays menu, the colour window and the Wire I/O Tools menu, which stayed open when the press landed on a destination, a layer or the drawing)**. Add Destination is the exception on purpose. Two lists are never open together; the three properties panels (Layer, Destination, AUX) are one at a time.

**Escape: one press closes one thing.**
1. If a list, a menu, a message or a window is open, Escape closes the top-most one and nothing else. A list open inside a window closes first; the next press closes the window.
2. If you are typing in a text box on a page, Escape never throws you off the page. In a rename box (Wire page, I/O page, Wire source), a Wire resolution field, an I/O note, and a Video Presets table or tile-header cell, it puts the old text back.
3. With nothing open and no text box active:
   - Video Presets Simple: lets go of the picked destination or layer.
   - Video Presets Advanced: goes back to Simple.
   - Wire: clears the picked cable, then the picked tiles, then the preset filter, then leaves Wire.
   - I/O Patch: leaves I/O Patch.

Today, Escape with a window or menu open over Advanced, Wire or I/O Patch closes the page underneath as well, and can leave the window or menu floating over Video Presets. Until the fix, close windows with their ✕ and menus with a click outside.

**Enter.**
- In any text or number box, Enter confirms what you typed (the same as clicking away).
- In Layer Properties, Enter confirms the value and the panel stays open.
- In Destination Properties and AUX Properties, Enter is Apply: the values are taken and the panel closes.
- In Add Destination, Quick Setup and the Custom router window, Enter is the main button.
- In the colour window, Enter in the name box is Apply.
- In a message, Enter is the highlighted button and Escape is Cancel.

---

## 12. Keyboard shortcuts

All single-key shortcuts are switched off while a text box, a number box or a dropdown has the focus: the key types into the box instead.

| Keys | Where | What it does |
|---|---|---|
| Cmd / Ctrl + S | everywhere | Save. Shift = Save As. Works while typing in a field |
| Cmd / Ctrl + Z | everywhere | Undo (inside a text field: undoes your typing) |
| Cmd / Ctrl + Shift + Z, Cmd / Ctrl + Y | everywhere | Redo |
| Cmd / Ctrl + N | everywhere | New show: asks first, then Quick Setup |
| Cmd / Ctrl + Shift + N | everywhere | Add a preset |
| Cmd / Ctrl + C | Video Presets, a destination picked | Copy the preset of the picked destination |
| Cmd / Ctrl + V | Video Presets, a destination picked | Paste onto the preset of the picked destination (the target keeps its number and name) |
| Cmd / Ctrl + D | Video Presets, a destination picked | Duplicate the destination |
| 1 to 9 | Video Presets Simple | Scroll to that preset |
| Arrows, Shift + Arrows, a layer picked | Video Presets, Simple and Advanced | Move the layer 10 px, 100 px |
| Arrows, Shift + Arrows, a destination picked, no layer | Video Presets Simple | Resize the destination 1 px, 10 px |
| Arrows, Shift + Arrows, a destination picked, no layer | Video Presets Advanced | Resize the destination 1 px / 10 px, as in Simple (see the note below) |
| Arrows on the level line | Advanced timeline | Level in 1 % steps |
| Tab, Shift + Tab, a layer picked | Video Presets | Next, previous layer on that destination |
| Delete / Backspace | Video Presets | Removes the picked LAYER from this preset. Never removes a destination |
| Delete / Backspace | Wire Advanced | Removes the picked tiles or the picked cable. Does nothing in Wire Simple |
| Space | Advanced | Play / pause the picked clip (every clip after PRESET Play). With no clip picked: hold Space and drag to pan |
| , and . | Advanced | One frame back / forward |
| I and O | Advanced, a clip picked | Mark In / Out at the playhead |
| [ and ] | Advanced | Previous / next preset |
| Tab, Shift + Tab in an ID cell | Wire Advanced, router or switcher | Down, up the ID column |
| Shift + click | Wire | Add a node or tile to the selection |
| Option + drag an output dot | Wire Advanced | Move the source end of a cable |
| Ctrl / Cmd + wheel, trackpad pinch | Wire, Advanced | Zoom around the pointer |
| Shift while dragging | Video Presets | No snap |
| Shift while dragging the level line | Advanced timeline | 1 % steps instead of 5 % |
| Shift + click Save | top bar | Save As |
| Enter, Escape | everywhere | Chapter 11 |

> **Arrow keys on a picked destination in Advanced do what they do in Simple:** they resize it 1 px (Shift 10 px) in one Undo step and never move it. (Open question 1 for the owner: whether the arrows should MOVE the destination instead when the canvas is on Free Position.)

---

## 13. Troubleshooting

Each item says what you see on build 2026-06-16ko and what to do. "Fixed by" names the pending patch (see BUGS.md for the number).

| What you see | Why | What to do |
|---|---|---|
| **+ Destination does nothing in Wire or I/O Patch** | The window opens behind the page | Go to Video Presets, close the hidden window with Escape, press + Destination there. Fixed by the pending patches. |
| **Escape threw me out of Advanced / Wire / I/O Patch, or left a menu floating** | Escape closes the page under whatever is open | Close windows with their ✕ and menus with a click outside; do not press Escape while typing on those pages. Fixed by the pending patches. |
| **Undo did nothing, or jumped back two edits** | The action made no Undo step, or made it after the change. Today that covers: layer drag, layer corner drag, layer nudges, destination corner drag, AOI moves and fields, preset code / name / notes, table P# and Notes, the Simple layer panel (size, Fill, list pick, remove, library ×), Show / Remove Labels, AUX + / Apply / Remove Globally, Add Destination, table and tile re-order, and almost every I/O Patch edit including deletes | Save before a risky edit. Fixed by the pending patches. |
| **I deleted CAM 1 in I/O Patch and cannot get it back** | I/O Patch deletes are permanent today | Load the last saved file. Fixed by the pending patches. |
| **I cannot click a destination; the layer gets picked instead** | A full-screen layer covers it | Click its row in the table, or the chevron in its Name cell for Destination Properties. |
| **The arrow keys changed my wall from 1920 to 1921 wide** | With a destination picked, arrows resize it 1 px for the whole show | Undo, or type the size in Destination Properties. Click empty canvas or press Escape before using the arrows for anything else. |
| **Typed 640 in Layer Properties › Size and got 640 × 640** | With the padlock on, the 67 px floor squares the layer while you type | Type the height too, or unlock first. Fixed by the pending patches. |
| **A BG colour picked on the first preset does nothing** | The first preset's own BG colour wins over the show-wide colour | Fixed by the pending patches. |
| **A preset name with a " in it reads cut** | The field cuts at the quote and the next click-away saves the cut text | Avoid " in names and notes until the fix (write 6in RISER). |
| **Dragging a row or a preset tile lands one place off** | Drop position is counted wrong | Drop one place early, or use the ◀ ▶ arrows. Fixed by the pending patches. |
| **Save is gold although I changed nothing** | Opening Wire, Advanced or I/O Patch Advanced, or exporting a Look Book with a wire sheet, assigns cable colours or builds page 1 | Save once. |
| **Save did NOT turn gold after I worked in Wire** | Wire edits do not run the unsaved check today; the app may let you close without asking | Save by hand before closing. Fixed by the pending patches. |
| **Cmd / Ctrl + S opened the browser's "Save page"** | The key is ignored while the cursor is in a field | Click outside the field, then save. Fixed by the pending patches. |
| **"Restore draft?" on every start, for an empty show** | An empty draft is always written | Answer Start fresh. Fixed by the pending patches. |
| **Restored a draft and my blends are gone** | A restored draft is put back on the plain strip on purpose | Load the saved .avlb instead. |
| **The browser asks "Leave site?" on Send or Bug** | Mail is opened by leaving the page | Save first, or answer Leave; the show stays open. |
| **Look Book: the canvas picture is cut at the right edge, contents links are dead, contents page numbers are wrong, table lines end in "…"** | Faults in the Look Book layout | Fixed by the pending patches. Until then check page numbers by hand. |
| **Look Book: destinations at the right of the canvas are missing** | The Canvas size was not refitted after adding destinations | ADVANCED ▾ › Fit Canvas, then export again. |
| **Excel check warns "P01 WALK-IN has no layers"** | The check ignores the BG | Press Export Anyway. Fixed by the pending patches. |
| **The Look Book from Send has no wire sheet** | Send builds the book without the window's options | Export the Look Book from its window and attach it yourself. Fixed by the pending patches. |
| **A video card is dim and reads "relink"** | The app's stored copy is not on this computer | Click the card and pick the file again. |
| **Display did not open** | The browser blocked the pop-up | Allow pop-ups for the page and press Display again. |
| **Display shows a still, not the video** | ProRes and HAP show their cover picture; H.264 and HEVC play | Make an H.264 reference copy. |
| **There is no way to remove a video from the Video tab** | Not built in 16ko | Today: Simple › click a layer twice › Layer panel Simple › Other library items › ×. It asks nothing and leaves BGs and AUX that used it. The pending Advanced patch adds a proper × on every card. |
| **Double-clicking a cable deleted it** | That is what it does; double-click a white handle to reset a route | Undo. |
| **Wire Advanced: a switcher row refuses × with "Port in use" but I see no cable** | A deleted destination or AUX tile left its backup cable behind | Fixed by the pending patches (the show heals the next time Wire Advanced draws, and lights Save once). |
| **Wire Advanced: I cannot close a page with a long name; × opens the next page** | The icons sit outside the tab | Rename the page shorter first. Fixed by the pending patches. |
| **Wire: Reset Layout in Advanced seemed to do nothing** | It silently reset the SIMPLE drawing | Undo at once. Fixed by the pending patches. |
| **With Wire open, Delete also removed a layer in Video Presets** | Keys reach the hidden page | Let go of the layer in Video Presets (Escape) before opening Wire. Fixed for Wire by the pending patches; not yet checked for I/O Patch. |
| **I/O Patch: renamed a source to an existing name and lost a row** | The two sources merge silently | Load the last saved file. Fixed by the pending patches. |
| **I/O Patch: a source or destination I renamed or deleted came back** | Advanced page 1 kept the old row and copied it back | Delete the ghost row. Partly fixed by the pending patches (question 31 for the rest). |
| **I/O Patch: LOGO shows the LED wall's note** | A source that is a background shows the destination's note | Do not type in that cell; it rewrites the destination's note. Question 30. |
| **A red pill in I/O Patch** | The connector cannot carry that pixel count | Change the connector or the resolution. |
| **I cannot find Help** | Advanced, Wire and I/O Patch cover the bottom bar | Go to Video Presets Simple. |
| **Typing in the Canvas W / H boxes does nothing** | The canvas is calculated from the destinations | Resize the destinations; use Fit Canvas to trim. |
| **One Undo after switching Simple / Advanced in Wire or I/O flipped the view back** | The switch itself is an Undo step | Press Undo again for your last edit. |
| **Safari / Firefox: every Save downloads a new file** | Only Chrome and Edge can overwrite quietly | Use Chrome or Edge, or the desktop app. |

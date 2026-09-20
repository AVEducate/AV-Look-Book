// AV Look Book — flows probe. Runs INSIDE the app page after tests/smoke_probe.js (tests/run_smoke.mjs evaluates it).
// Where the smoke probe snapshots what the core PRODUCES, this one DRIVES the app the way a user does, in Simple and
// Advanced, across all three tools, and asserts what happens. Every check is {name, ok, detail?}; detail only appears on
// a failure so the golden stays stable. A check that fails at the trusted version is a KNOWN ISSUE (it sits in the golden
// as ok:false) and the gate reports it every run; a check that changes state between golden and now fails the gate.
// Add a check here whenever core behaviour ships or a bug is fixed. Never leave media playing.
(async function lbFlowsProbe(){
  // deterministic run: the app gives an uncoloured source a RANDOM cable colour on first draw, and ids come from Math.random
  (function () { let a = 0x9e3779b9; Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const checks = [];
  const check = async (name, fn) => {
    try { const r = await fn(); checks.push(r === true ? { name, ok: true } : { name, ok: false, detail: String(r) }); }
    catch (e) { checks.push({ name, ok: false, detail: 'threw: ' + String((e && e.message) || e) }); }
  };
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const vis = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  const is = (got, want, label) => JSON.stringify(got) === JSON.stringify(want) ? true : (label + ': expected ' + JSON.stringify(want) + ', got ' + JSON.stringify(got));
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  // the app has ONE dialog (#dlg-overlay, shown with the class 'show'); answer it the way a user would, never remove it
  const dlgOpen = () => { const o = $('#dlg-overlay'); return !!o && o.classList.contains('show') && getComputedStyle(o).display !== 'none'; };
  const dialogText = () => dlgOpen() ? ($('#dlg-box').textContent || '').replace(/\s+/g, ' ').trim() : '';
  const okDialogs = () => { for (let i = 0; i < 4 && dlgOpen(); i++) { const b = $('#dlg-confirm'); if (b) b.click(); else break; } };
  const fakeEv = { stopPropagation(){}, preventDefault(){}, clientX: 500, clientY: 300, pageX: 500, pageY: 300, target: document.body, currentTarget: document.body };
  // downloads and mail never leave the page during a test
  const downloads = []; window.dl = function (blob, name) { downloads.push({ name: String(name), size: (blob && blob.size) || 0 }); };
  let mailHref = null; window._lbOpenMail = function (h) { mailHref = String(h); };

  // ── open the example and keep a clean copy to return to ─────────────────────────────────────────────────────────
  lbOpenExample('general-session'); await wait(1500);
  const fresh = $$('button').find(b => /start fresh/i.test(b.textContent)); if (fresh) { fresh.click(); await wait(600); }
  okDialogs(); if (typeof closeQS === 'function') { try { closeQS(); } catch (e) {} } await wait(300); okDialogs();
  const BASE = JSON.stringify(getProjectState());
  const restore = async () => { try { if (typeof closeLayerPanel === 'function') closeLayerPanel(); } catch (e) {} _applyProjectText(BASE); await wait(700); okDialogs(); await wait(150); okDialogs(); };
  const userLookBook = async () => { openPdfExportModal(); await wait(350); const real = exportPDF; let html = null; window.exportPDF = function () { html = real(true); }; try { _pdfConfirmExport(); } finally { window.exportPDF = real; } await wait(150); return html || ''; };
  const firstLayer = () => { for (const p of presets) for (const s of screens) if (getL(p.id, s.id, 1)) return { pid: p.id, sid: s.id, s }; return null; };

  // ── the show model ──────────────────────────────────────────────────────────────────────────────────────────────
  await check('example: General Session opens with 5 presets, 3 destinations, 2 AUX outputs', () => is([presets.length, screens.length, dsms.length], [5, 3, 2], 'counts'));
  await check('save / load: the show is identical after a save and a reload', async () => {
    _applyProjectText(BASE); await wait(800); okDialogs();
    const A = JSON.parse(BASE), B = getProjectState(); const bad = [];
    Object.keys(A).concat(Object.keys(B)).filter((k, i, a) => a.indexOf(k) === i).forEach(k => { if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) bad.push(k); });
    return bad.length ? 'fields changed by a reload: ' + bad.join(', ') : true;
  });
  await check('undo / redo: a layer change undoes and redoes', async () => {
    const f = firstLayer(); const before = getL(f.pid, f.sid, 1);
    pushUndo(); setL(f.pid, f.sid, 1, 'CLOCK'); scheduleRender(); await wait(150);
    doUndo(); await wait(250); const u = getL(f.pid, f.sid, 1);
    doRedo(); await wait(250); const r = getL(f.pid, f.sid, 1);
    doUndo(); await wait(250);
    return is([u, r], [before, 'CLOCK'], 'undo then redo');
  });

  // ── Video Presets, Simple ───────────────────────────────────────────────────────────────────────────────────────
  await check('Simple: one preset tile per preset and layer chips on the canvas', () => {
    const tiles = $$('.preset-row').length, chips = $$('.preset-row .layer-chip').length;
    return is([tiles, chips > 0], [presets.length, true], 'tiles / chips drawn');
  });
  await check('Simple: Add Preset adds one, Delete removes it', async () => {
    const n = presets.length; actions.addPreset(); await wait(350); okDialogs(); const added = presets.length;
    actions.deletePreset(presets[presets.length - 1].id); await wait(350); okDialogs(); await wait(250);
    return is([added, presets.length], [n + 1, n], 'preset count');
  });
  await check('Simple: copy a preset and paste it onto another', async () => {
    const a = presets[1].id, b = presets[3].id; actions.copyPreset(a); await wait(150); actions.pastePreset(b); await wait(350); okDialogs(); await wait(300);
    const A = JSON.stringify(presets.find(x => x.id === a).layers), B = JSON.stringify(presets.find(x => x.id === b).layers);
    await restore(); return A === B ? true : 'layers differ after paste';
  });
  await check('Simple: Add Destination opens its window, adds the destination, and it can be removed', async () => {
    const n = screens.length; actions.addDestination(); await wait(350); if (!vis($('#modal'))) return 'the Add Destination window did not open';
    $('#ms-n').value = 'TEST DEST'; $('#ms-w').value = '1920'; $('#ms-h').value = '1080'; confirmScreen(); await wait(450); okDialogs();
    const added = screens.length, nm = screens[screens.length - 1].name; deleteScreen(screens[screens.length - 1].id); await wait(350); okDialogs(); await wait(250);
    const out = is([added, nm, screens.length], [n + 1, 'TEST DEST', n], 'destination'); await restore(); return out;
  });
  await check('Simple: Add AUX adds an output that is on in every preset, Remove takes it away', async () => {
    const n = dsms.length; actions.addDSM(); await wait(300); const added = dsms.length; const d = dsms[dsms.length - 1]; const on = presets.every(p => getDSMOn(p.id, d.id));
    actions.removeDSM(); await wait(300); okDialogs(); await wait(250); const out = is([added, on, dsms.length], [n + 1, true, n], 'AUX'); await restore(); return out;
  });
  await check('Simple: an AUX can be switched off for one preset only', async () => {
    const p = presets[0].id, q = presets[1].id, d = dsms[0].id; const was = getDSMOn(p, d); toggleDSM(p, d); await wait(150);
    const out = is([getDSMOn(p, d), getDSMOn(q, d)], [!was, true], 'per-preset AUX'); await restore(); return out;
  });
  await check('Simple: the layer panel lists Position, Size, Opacity, Mask, Border, Shadow, Effects', async () => {
    const f = firstLayer(); openLayerPanel(fakeEv, f.pid, f.sid, 1, true); await wait(400); const pop = $('#layer-panel'); if (!pop) return 'the layer panel did not open';
    const secs = $$('.lfx-acc', pop).map(a => a.querySelector('.lfx-ttl').textContent.trim()); closeLayerPanel();
    return is(secs, ['Position', 'Size', 'Opacity', 'Mask', 'Border', 'Shadow', 'Effects'], 'sections');
  });
  await check('Simple: typing a Width in the layer panel resizes the layer and the height follows the lock', async () => {
    const f = firstLayer(); const sw = parseInt(f.s.w), sh = parseInt(f.s.h); openLayerPanel(fakeEv, f.pid, f.sid, 1, true); await wait(400);
    const w = $$('#layer-panel .lfx-acc[data-sec="size"] input[type=number]').find(i => i.dataset.dim === 'w'); if (!w) return 'no Width field';
    w.focus(); w.value = '960'; fire(w, 'input'); await wait(150); fire(w, 'change'); w.blur(); await wait(200);
    const g = _lfxGeo(f.pid, f.sid, 1, sw, sh); closeLayerPanel(); const out = is([g.w, g.h], [960, 540], 'window'); await restore(); return out;
  });
  await check('Simple: an Area of Interest can be switched on and off for a destination', async () => {
    const p = presets[1].id, s = screens[0].id; const was = !!getAOI(p, s); toggleAOI(p, s); await wait(200); const on = !!getAOI(p, s); toggleAOI(p, s); await wait(200);
    const out = is([on, !!getAOI(p, s)], [!was, was], 'AOI'); await restore(); return out;
  });

  // ── Video Presets, Advanced ─────────────────────────────────────────────────────────────────────────────────────
  // test media: a 4:3 picture with alpha and a short silent clip, both built in the page
  const cv = document.createElement('canvas'); cv.width = 800; cv.height = 600; const g2 = cv.getContext('2d'); g2.fillStyle = '#ff4e8b'; g2.beginPath(); g2.arc(400, 300, 260, 0, 6.3); g2.fill();
  customLibrary.push({ l: 'TEST 4x3', kind: 'image', img: cv.toDataURL('image/png'), media: { w: 800, h: 600, type: 'image/png', fileName: 'test_4x3.png' } });
  let clipOk = false;
  try {
    const c2 = document.createElement('canvas'); c2.width = 640; c2.height = 360; const g3 = c2.getContext('2d'); g3.fillStyle = '#10131a'; g3.fillRect(0, 0, 640, 360);
    const rec = new MediaRecorder(c2.captureStream(30), { mimeType: 'video/webm' }); const chunks = []; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.start(100); const iv = setInterval(() => { g3.fillStyle = '#2dd4bf'; g3.fillRect(Math.random() * 500, 120, 80, 120); }, 40); await wait(700); clearInterval(iv); rec.stop(); await new Promise(r => rec.onstop = r);
    customLibrary.push({ l: 'TEST CLIP', kind: 'video', img: c2.toDataURL('image/jpeg', .6), media: { w: 640, h: 360, dur: .7, fps: 30, type: 'video/webm', fileName: 'test_clip.webm' } });
    _fsAttachBlob('TEST CLIP', new Blob(chunks, { type: 'video/webm' })); clipOk = true;
  } catch (e) { clipOk = false; }
  const A = firstLayer(); const fp = () => $('#fs-props');
  const secTitles = () => $$('.lfx-acc', fp()).map(a => a.querySelector('.lfx-ttl').textContent.trim());
  const geo = () => _lfxGeo(A.pid, A.sid, 1, parseInt(A.s.w), parseInt(A.s.h));
  const num = (sec, key, attr) => $$('.lfx-acc[data-sec="' + sec + '"] input[type=number]', fp()).find(i => i.dataset[attr || 'dim'] === key);
  const mute = () => $$('video').forEach(v => { v.muted = true; });

  await check('Advanced: opens on a preset with the sources rail and the properties panel', async () => {
    openFullscreen(A.pid); await wait(700); mute();
    return is([getComputedStyle($('#fs-overlay')).display, $('#fs-left-panel').offsetWidth > 200, $('#fs-right-panel').offsetWidth > 200, document.body.classList.contains('fs-open')], ['flex', true, true, true], 'Advanced page');
  });
  await check('Advanced: both side panels collapse to a strip and come back', async () => {
    $('#fs-panel-tog-left').click(); $('#fs-panel-tog-right').click(); await wait(400); const c = [$('#fs-left-panel').offsetWidth, $('#fs-right-panel').offsetWidth];
    $('#fs-panel-tog-left').click(); $('#fs-panel-tog-right').click(); await wait(400); const o = [$('#fs-left-panel').offsetWidth > 200, $('#fs-right-panel').offsetWidth > 200];
    try { localStorage.removeItem('lb_fs_panels'); } catch (e) {} return is([c, o], [[38, 38], [true, true]], 'panel widths');
  });
  await check('Advanced: picking a plain layer shows Source, General, Position, Size, Opacity, Mask, Border, Shadow, Effects', async () => {
    _fsSelectLayer(A.pid, A.sid, 1); await wait(450);
    return is(secTitles().filter(t => t !== 'Media Info'), ['Source', 'General', 'Position', 'Size', 'Opacity', 'Mask', 'Border', 'Shadow', 'Effects'], 'sections');
  });
  await check('Advanced: a 4:3 picture dropped on a locked layer reshapes the window to 4:3', async () => {
    _fsAssignLayer(A.pid, A.sid, 1, 'TEST 4x3'); await wait(450); const g = geo(); return Math.abs(g.h / g.w - 0.75) < 0.01 ? true : 'window is ' + g.w + '×' + g.h;
  });
  await check('Advanced: a media layer adds Filters, Color and Source crop sections', () => is(secTitles().filter(t => ['Filters', 'Color', 'Source crop'].includes(t)), ['Filters', 'Color', 'Source crop'], 'media sections'));
  await check('Advanced: Filters offers B&W, Negative and Sepia', () => { const a = $('.lfx-acc[data-sec="filters"]', fp()); const t = a ? a.textContent : ''; return is([/B&W|B\s*&\s*W/i.test(t), /Negative/i.test(t), /Sepia/i.test(t)], [true, true, true], 'filter names'); });
  await check('Advanced: Width and Scale are one window (Width 960 gives Height 720 and Scale 120%)', async () => {
    const w = num('size', 'w'); w.focus(); w.value = '960'; fire(w, 'input'); await wait(150); fire(w, 'change'); w.blur(); await wait(250); const g = geo();
    return is([g.w, g.h, num('size', 'sh').value, num('size', 'sv').value], [960, 720, '120', '120'], 'size rows');
  });
  await check('Advanced: unlocking the aspect switches the layer to Stretch, locking again snaps it back', async () => {
    $('.fs-lock', fp()).click(); await wait(300); const fit = getLayerMedia(A.pid, A.sid, 1).fit; const h = num('size', 'h'); h.focus(); h.value = '1000'; fire(h, 'input'); fire(h, 'change'); h.blur(); await wait(250); const st = geo();
    $('.fs-lock', fp()).click(); await wait(300); const g = geo(); return is([fit, st.h, Math.abs(g.h / g.w - 0.75) < 0.01], ['stretch', 1000, true], 'lock');
  });
  await check('Advanced: a source crop reshapes a locked window, Full picture restores it', async () => {
    const cr = $$('.lfx-acc[data-sec="geometry"] input[type=range]', fp()).find(i => i.dataset.k === 'cr'); cr.focus(); cr.value = '400'; fire(cr, 'input'); await wait(200); fire(cr, 'change'); await wait(300);
    const c = getLayerMedia(A.pid, A.sid, 1).crop, g = geo(); $('.lfx-acc[data-sec="geometry"] .fs-geom-actions button', fp()).click(); await wait(300); const g2b = geo();
    return is([c && c.w, c && c.h, Math.abs(g.h / g.w - 1.5) < 0.02, getLayerMedia(A.pid, A.sid, 1).crop, Math.abs(g2b.h / g2b.w - 0.75) < 0.01], [400, 600, true, null, true], 'crop');
  });
  await check('Advanced: dragging a corner of a locked layer keeps its shape and the panel follows', async () => {
    const chip = $('#fs-canvas .layer-chip[data-lid="1"][data-sid="' + A.sid + '"]'); const hnd = chip && chip.querySelector('.lrh-br'); if (!hnd) return 'no corner handle'; const r = hnd.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    hnd.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
    for (let i = 1; i <= 4; i++) { window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x - i * 4, clientY: y - i })); await wait(20); }
    const g = geo(), shown = num('size', 'w').value; window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x - 16, clientY: y - 4 })); await wait(250);
    return is([Math.abs(g.h / g.w - 0.75) < 0.01, String(g.w) === shown], [true, true], 'corner drag');
  });
  if (clipOk) {
    await check('Advanced: a clip dropped on the BG selects the BG and lists it like a layer', async () => {
      _fsAssignBg(A.pid, A.sid, 'TEST CLIP'); await wait(600); mute();
      return is([selLayer && selLayer.n, getBgName(A.pid, A.sid), secTitles().includes('Transition'), secTitles().includes('Position')], [0, 'TEST CLIP', true, false], 'BG');
    });
    await check('Advanced: a video General section shows a Speed box', () => { const a = $('.lfx-acc[data-sec="general"]', fp()); return /Speed/i.test(a ? a.textContent : '') ? true : 'no Speed row'; });
    await check('Advanced: the timeline shows transport for a picked clip and Play lights a transport key', async () => {
      const bar = $('.fs-tl-bar'); if (!bar) return 'no timeline bar'; mute(); _fsPlayToggle(); await wait(500); mute();
      const lit = $$('.fs-tl-bar button.on, .fs-tl-bar .on').length; const playing = $$('video').some(v => !v.paused); _fsPauseAll(); await wait(200);
      return is([playing, lit > 0], [true, true], 'playing / a lit key');
    });
    await check('Advanced: nothing is left playing after Pause', () => { _fsPauseAll(); $$('video').forEach(v => { v.muted = true; v.pause(); }); return $$('video').every(v => v.paused) ? true : 'a clip is still playing'; });
    await check('exports: a clip BG is written as a layer with its details', () => { const i = _bgExportInfo(A.pid, A.sid); return is([i.name, /^clip 640×360/.test(i.detail)], ['TEST CLIP', true], 'BG export line'); });
    await check('Advanced: clearing the BG source removes its picture too', async () => { selLayer = { pid: A.pid, sid: A.sid, n: 0 }; const hadOwn = !!getPBg(A.pid, A.sid); _fsSwapSource(''); await wait(350); return is([hadOwn, !!getPBg(A.pid, A.sid)], [true, false], 'cover'); });
  }
  await check('Advanced: closes cleanly', async () => { try { _fsPauseAll(); } catch (e) {} closeFullscreen(); await wait(400); return is([getComputedStyle($('#fs-overlay')).display, document.body.classList.contains('fs-open')], ['none', false], 'closed'); });
  await restore();

  // ── Wire, Simple ────────────────────────────────────────────────────────────────────────────────────────────────
  const srcNames = () => (typeof _wireBuildAllSourceNames === 'function' ? _wireBuildAllSourceNames() : []);
  await check('Wire Simple: the diagram draws one switcher row per source and one card per source', async () => {
    openWireMode(); await wait(500); wireSettings.wireView = 'simple'; _wireRender(); await wait(500);
    const n = srcNames().length; const cards = $$('#wire-sources-panel .wire-pane:first-child .wire-source-card').length; const rows = $$('#wire-diagram .wire-router-tile .rc-num:not(.rc-dead)').length;
    return is([!!$('#wire-diagram svg'), cards, rows >= n], [true, n, true], 'svg / cards / rows');
  });
  await check('Wire Simple: the switcher columns read # Source ID # Destination ID', () => is($$('#wire-diagram .wire-switcher-grid .r-hdr').map(e => e.textContent.trim()), ['#', 'Source', 'ID', '#', 'Destination', 'ID'], 'headers'));
  await check('Wire: renaming a source from its card reaches every preset, the I/O list and the diagram', async () => {
    const old = srcNames()[0]; const uses = n => { let c = 0; presets.forEach(p => { Object.values(p.layers || {}).forEach(l => Object.values(l || {}).forEach(v => { if (v === n) c++; })); Object.values(p.bgNames || {}).forEach(v => { if (v === n) c++; }); Object.values(p.dsmContent || {}).forEach(v => { if (v === n) c++; }); }); return c; };
    const before = uses(old); const pen = $$('#wire-sources-panel .wire-src-pen').find(b => b.closest('.wire-source-name').textContent.trim() === old); if (!pen) return 'no rename pencil on ' + old;
    pen.click(); await wait(200); const inp = $('#wire-sources-panel .wire-src-rename'); inp.value = 'RENAMED SRC'; inp.dispatchEvent(new Event('blur')); await wait(600);
    const out = is([uses(old), uses('RENAMED SRC'), srcNames().includes('RENAMED SRC'), $$('#wire-diagram .r-static').some(e => e.textContent.trim() === 'RENAMED SRC')], [0, before, true, true], 'rename'); await restore(); openWireMode(); await wait(400); wireSettings.wireView = 'simple'; _wireRender(); await wait(400); return out;
  });
  await check('Wire: a duplicate source name is refused', async () => {
    const n = srcNames(); const pen = $$('#wire-sources-panel .wire-src-pen').find(b => b.closest('.wire-source-name').textContent.trim() === n[0]); pen.click(); await wait(200);
    const inp = $('#wire-sources-panel .wire-src-rename'); inp.value = n[1]; inp.dispatchEvent(new Event('blur')); await wait(400); const t = dialogText(); okDialogs(); await wait(200);
    return /Name in use/i.test(t) && srcNames()[0] === n[0] ? true : 'dialog said: ' + t;
  });
  await check('Wire: pinch (ctrl + wheel) zooms about the cursor, a plain wheel does not zoom', async () => {
    const sc = $('#wire-diagram-scroll'), R = sc.getBoundingClientRect(), x = R.left + R.width / 2, y = R.top + R.height / 2; _wireSetZoom(1); await wait(200);
    sc.dispatchEvent(new WheelEvent('wheel', { deltaY: -30, clientX: x, clientY: y, bubbles: true, cancelable: true })); await wait(150); const plain = _wireGetZoom();
    sc.dispatchEvent(new WheelEvent('wheel', { deltaY: -30, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true })); await wait(250); const pinched = _wireGetZoom(); _wireSetZoom(1); await wait(150);
    return is([plain, pinched > 1], [1, true], 'zoom');
  });
  await check('Wire: the All Sources header stays pinned while the cards scroll', async () => {
    const p = $('#wire-sources-panel'); p.scrollTop = 400; await wait(200); const h = $(':scope > .wire-pane > .wire-pane-hdr', p); const top = Math.round(h.getBoundingClientRect().top - p.getBoundingClientRect().top); p.scrollTop = 0; return is(top, 0, 'header offset');
  });
  await check('Wire: both side panels collapse to a strip and come back', async () => {
    _wireTogglePanelCollapse('left'); _wireTogglePanelCollapse('right'); await wait(350); const c = [$('#wire-panel-left').offsetWidth, $('#wire-panel-right').offsetWidth];
    _wireTogglePanelCollapse('left'); _wireTogglePanelCollapse('right'); await wait(350); return is([c, $('#wire-panel-left').offsetWidth, $('#wire-panel-right').offsetWidth], [[38, 38], 260, 260], 'panel widths');
  });
  await check('Wire: the Export window offers sheet sizes from Letter to ANSI E', async () => {
    openWireExportModal(); await wait(350); const m = $('#wire-export-modal'); const sizes = $$('[data-wire-sheet]', m).map(b => b.dataset.wireSheet); closeWireExportModal(); await wait(150);
    return is([vis(m) || sizes.length > 0, sizes.includes('letter'), sizes.includes('ansie')], [true, true, true], 'export window');
  });

  // ── Wire, Advanced ──────────────────────────────────────────────────────────────────────────────────────────────
  let hub = null, rt = null;
  await check('Wire Advanced: page 1 is built from the show, every source wired into the switcher', async () => {
    wireSettings.wireView = 'advanced'; _wireRender(); await wait(400); _wireAdvSeedFromSimple(true); _wireRender(); await wait(600); hub = wireAdvanced.routers[0];
    const n = srcNames().length; return is([wireAdvanced.sources.length, !!hub, hub && hub.inC, wireAdvanced.wires.length >= n], [n, true, n, true], 'seed');
  });
  await check('Wire Advanced: switcher cells read the machine in Source and leave ID blank for a single output', () => {
    const w = wireAdvanced.wires.find(x => x.fromId === 'asrc:' + wireAdvanced.sources[0].id); const i = parseInt(w.toId.split(':')[2], 10);
    return is([hub.inputs[i].name, hub.inputs[i].pt || ''], [wireAdvanced.sources[0].name, ''], 'cell');
  });
  await check('Wire Advanced: a named output point shows in the ID cell, an unnamed extra point reads OUT 2', async () => {
    const s = wireAdvanced.sources[0]; s.outC = 2; s.portLabels = true; s.portNames = ['PRIMARY', '']; _wireAdvRouterAddPort(hub.id, 'in'); await wait(250);
    wireAdvanced.wires.push({ id: 'wflow1', fromId: 'asp:' + s.id + ':1', toId: 'rip:' + hub.id + ':' + (hub.inC - 1) }); _wireRender(); await wait(400);
    const w = wireAdvanced.wires.find(x => x.fromId === 'asrc:' + s.id); const i = parseInt(w.toId.split(':')[2], 10);
    return is([hub.inputs[i].name, hub.inputs[i].pt, hub.inputs[hub.inC - 1].name, hub.inputs[hub.inC - 1].pt], [s.name, 'PRIMARY', s.name, 'OUT 2'], 'ID cells');
  });
  await check('Wire Advanced: + In adds a row, × removes a free row, × on a wired row is refused', async () => {
    const n = hub.inC; _wireAdvRouterAddPort(hub.id, 'in'); await wait(250); const added = hub.inC; _wireAdvRouterRemovePort(hub.id, 'in', hub.inC - 1); await wait(250); const removed = hub.inC;
    _wireAdvRouterRemovePort(hub.id, 'in', 0); await wait(300); const t = dialogText(); okDialogs(); await wait(150); return is([added, removed, /Port in use/i.test(t), hub.inC], [n + 1, n, true, n], 'rows');
  });
  await check('Wire Advanced: the pencil reopens the size window with the current counts, shrinking below a cable is refused', async () => {
    const pen = $('#wire-diagram .wire-router-pen'); if (!pen) return 'no pencil'; pen.click(); await wait(300); const L = $('#wire-ioc-left'), R = $('#wire-ioc-right'); const pre = [L && L.value, R && R.value];
    L.value = '1'; $('#wire-ioc-go').click(); await wait(350); const t = dialogText(); okDialogs(); await wait(150); const o = $('#wire-iocount-overlay'); if (o) o.remove();
    return is([pre, /Ports still wired/i.test(t)], [[String(hub.inC), String(hub.outC)], true], 'size window');
  });
  await check('Wire Advanced: a router draws the matrix panel with numbered In and Out keys', async () => {
    _wireAdvAddRouter(10); await wait(500); rt = wireAdvanced.routers.find(r => r !== hub); const g = $('#wire-diagram .wire-matrix-grid');
    return is([!!g, $$('.r-hdr', g).map(e => e.textContent.trim()), $$('.rt-in', g).length, $$('.rt-out', g).length], [true, ['#', 'Source', 'ID', 'In', 'Out', 'Destination', 'ID', '#'], 10, 10], 'matrix');
  });
  await check('Wire Advanced: pressing an output arms it (it blinks), pressing an input routes it, and the name follows through to the switcher', async () => {
    const s = wireAdvanced.sources[0]; wireAdvanced.wires.push({ id: 'wflow2', fromId: 'asrc:' + s.id, toId: 'rip:' + rt.id + ':0' }); _wireAdvRouterAddPort(hub.id, 'in'); await wait(250); const hi = hub.inC - 1;
    wireAdvanced.wires.push({ id: 'wflow3', fromId: 'rop:' + rt.id + ':0', toId: 'rip:' + hub.id + ':' + hi }); _wireRender(); await wait(400);
    const tile = () => $('#wire-diagram .wire-matrix-grid'); $$('.rt-out', tile())[0].click(); await wait(200); const armed = $$('.rt-out', tile())[0].classList.contains('armed') && getComputedStyle($$('.rt-out', tile())[0]).animationName === 'rtFlash';
    $$('.rt-in', tile())[0].click(); await wait(400); const badge = ($$('.rt-out', tile())[0].querySelector('.rt-src') || {}).textContent;
    return is([armed, rt.outputs[0].assignedInput, badge, hub.inputs[hi].name, hub.inputs[hi].pt], [true, 0, '1', s.name, 'PRIMARY'], 'route');
  });
  await check('Wire Advanced: one input can feed two outputs, and an output only ever has one input', async () => {
    const tile = () => $('#wire-diagram .wire-matrix-grid'); $$('.rt-out', tile())[1].click(); await wait(150); $$('.rt-in', tile())[0].click(); await wait(300);
    $$('.rt-out', tile())[1].click(); await wait(150); $$('.rt-in', tile())[3].click(); await wait(300); return is([rt.outputs[0].assignedInput, rt.outputs[1].assignedInput], [0, 3], 'matrix state');
  });
  await check('Wire Advanced: a converter and a network switch can be added and grow a port', async () => {
    const n = (wireAdvanced.devices || []).length; _wireAdvAddDevice('converter', 2, 2); _wireAdvAddDevice('switch', 8, 0); await wait(400); const d = wireAdvanced.devices[wireAdvanced.devices.length - 2]; const ins = d.ins.length; _wireAdvDeviceAddPort(d.id, 'in'); await wait(250);
    return is([wireAdvanced.devices.length, d.ins.length, $$('#wire-diagram .wire-device-tile').length], [n + 2, ins + 1, n + 2], 'devices');
  });
  await check('Wire Advanced: a page can be copied and the copy closed', async () => {
    const n = wireAdvanced._pages.length, cur = wireAdvanced._activePageId; _wireCopyPage(cur); await wait(500); okDialogs(); const copied = wireAdvanced._pages.some(p => / copy$/i.test(p.name)); const cp = wireAdvanced._pages.find(p => / copy$/i.test(p.name));
    if (cp) { _wireClosePage(cp.id); await wait(400); okDialogs(); await wait(300); } if (wireAdvanced._activePageId !== cur) { _wireSwitchPage(cur); await wait(300); }
    return is([copied, wireAdvanced._pages.some(p => / copy$/i.test(p.name))], [true, false], 'page copy');
  });
  await check('Wire: closes cleanly', async () => { closeWireMode(); await wait(300); return is(getComputedStyle($('#wire-overlay')).display, 'none', 'overlay'); });
  await restore();

  // ── I/O Patch ───────────────────────────────────────────────────────────────────────────────────────────────────
  await check('I/O Patch Simple: lists every source, destination and AUX', async () => {
    openSystem(); await wait(600); if (typeof _ioSetView === 'function') { _ioSetView('simple'); await wait(400); }
    const ov = $('#sys-overlay'); const t = ov ? (ov.textContent + ' ' + $$('input', ov).map(i => i.value).join(' | ')) : ''; const names = srcNames().concat(screens.map(s => s.name), dsms.map(d => d.name)); const missing = names.filter(n => !t.includes(n));
    return missing.length ? 'not listed: ' + missing.join(', ') : true;
  });
  await check('I/O Patch: setting a connector and resolution on a source is stored and shown', async () => {
    const n = srcNames()[0]; _sysSetSourceMeta(n, { connectorType: '12G-SDI', resolution: '3840x2160' }); _sysRender(); await wait(300); const m = _sysGetSourceMeta(n);
    return is([m.connectorType, m.resolution, /3840\s*[x×]\s*2160/.test($('#sys-overlay').innerHTML)], ['12G-SDI', '3840x2160', true], 'source meta');
  });
  await check('I/O Patch: renaming a source here also renames it in every preset', async () => {
    const old = srcNames()[0]; _sysHandleSourceRename(old, 'PATCH RENAMED', null); await wait(400); const inPresets = presets.some(p => Object.values(p.layers || {}).some(l => Object.values(l || {}).includes('PATCH RENAMED')) || Object.values(p.bgNames || {}).includes('PATCH RENAMED') || Object.values(p.dsmContent || {}).includes('PATCH RENAMED'));
    return is([srcNames().includes('PATCH RENAMED'), srcNames().includes(old), inPresets], [true, false, true], 'rename');
  });
  await check('I/O Patch Advanced: page 1 is built from the show and PBP / GFX A sources get a B backup row', async () => {
    _ioSetView('advanced'); await wait(700); okDialogs(); const pg = ioAdvanced.pages[0]; const named = pg.sources.filter(r => r.name).map(r => r.name);
    const pairs = pg.sources.filter(r => r.backupOf).length; const wantPairs = named.filter(n => /^(PBP|GFX)\s+A$/i.test(n)).length;
    return is([named.length >= srcNames().length, pairs], [true, wantPairs], 'page 1');
  });
  await check('I/O Patch Advanced: the Backup window opens for a source and closes', async () => {
    const r = ioAdvanced.pages[0].sources.find(x => x.name); _ioBackupOpen(r.id); await wait(400); const o = $('#sys-bk-overlay'); const open = vis(o); if (o) { const x = o.querySelector('.sys-modal-close'); if (x) x.click(); else o.remove(); } await wait(200);
    return is([open, !!$('#sys-bk-overlay') && vis($('#sys-bk-overlay'))], [true, false], 'backup window');
  });
  await check('I/O Patch Advanced: a page can be copied and the copy closed', async () => {
    const n = ioAdvanced.pages.length; _ioCopyPage(0); await wait(400); okDialogs(); const idx = ioAdvanced.pages.findIndex(p => / copy$/i.test(p.name)); const copied = idx >= 0; if (copied) { _ioClosePage(idx); await wait(400); okDialogs(); await wait(300); }
    return is([copied, ioAdvanced.pages.some(p => / copy$/i.test(p.name))], [true, false], 'page copy');
  });
  await check('I/O Patch: the Excel export builds a sheet', async () => { downloads.length = 0; const orig = _buildXlsx; let rows = null; window._buildXlsx = function (r) { rows = r; return orig.apply(this, arguments); }; try { _sysExportIOExcel(); await wait(400); } finally { window._buildXlsx = orig; } okDialogs(); return (rows && rows.length > 3) || downloads.length ? true : 'no sheet was built'; });
  await check('I/O Patch: closes cleanly', async () => { closeSystem(); await wait(300); return is(getComputedStyle($('#sys-overlay')).display, 'none', 'overlay'); });
  await restore();

  // ── exports, Quick Start, Help, bug report ──────────────────────────────────────────────────────────────────────
  await check('Look Book: a cover, one page per preset, the I/O reference, the wire sheet and the summary', async () => {
    const d = new DOMParser().parseFromString(await userLookBook(), 'text/html'); const t = d.body.textContent;
    return is([d.querySelectorAll('.pp-breakdown').length, !!d.querySelector('.cover'), !!d.querySelector('.summary-table'), /I\/O/i.test(t), !!d.querySelector('.wire-page')], [presets.length, true, true, true, true], 'Look Book sections');
  });
  await check('Look Book and Excel: every destination starts with a BG line', async () => {
    const html = await userLookBook(); const bgRows = (html.match(/<span class="bd-l">BG<\/span>/g) || []).length; const orig = _buildXlsx; let rows = null; window._buildXlsx = function (r) { rows = r; return orig.apply(this, arguments); }; try { _doExportExcel(true); } finally { window._buildXlsx = orig; }
    const cells = []; (rows || []).forEach(r => r.forEach(c => { if (typeof c === 'string' && /^BG: /.test(c)) cells.push(c); })); return is([bgRows, cells.length], [presets.length * screens.length, presets.length * screens.length], 'BG lines');
  });
  await check('Excel cue sheet: one row per preset under the headers', () => { const orig = _buildXlsx; let rows = null; window._buildXlsx = function (r) { rows = r; return orig.apply(this, arguments); }; try { _doExportExcel(true); } finally { window._buildXlsx = orig; } const body = (rows || []).filter(r => presets.some(p => p.code === r[0])); return is(body.length, presets.length, 'preset rows'); });
  await check('Quick Start: opens with the three example shows and closes', async () => { openQS(); await wait(400); const m = $('#qs-modal'); const open = vis(m); const ex = (m ? m.innerHTML.match(/lbOpenExample\('/g) : null) || []; closeQS(); await wait(250); return is([open, ex.length, vis($('#qs-modal'))], [true, 3, false], 'Quick Start'); });
  await check('Help: opens and closes', async () => { actions.help(); await wait(400); const t = document.body.textContent; const open = /Quick Setup|Getting Started|Help/i.test(t); closeHelp(); await wait(200); return open ? true : 'Help did not open'; });
  await check('Help text names only sections that exist today', async () => {
    actions.help(); await wait(400); const box = $$('[id*="help"]').filter(vis).sort((a, b) => b.textContent.length - a.textContent.length)[0]; const t = box ? box.textContent : ''; closeHelp(); await wait(150);
    const retired = ['Position & Size', 'Geometry', 'Lock ratio', 'Zoom %', 'Pan X', 'Slot']; const hit = retired.filter(w => t.includes(w)); return hit.length ? 'Help still says: ' + hit.join(', ') : (t.length > 500 ? true : 'could not read the Help text');
  });
  await check('Report a bug: builds an email to AV Educate with the template and the show attached', async () => {
    mailHref = null; downloads.length = 0; await reportBug(); await wait(500); const h = decodeURIComponent(mailHref || '');
    return is([/^mailto:info@aveducate\.com/i.test(mailHref || ''), /Name:/.test(h), /Bug located:/.test(h), downloads.some(d => /\.avlb$/.test(d.name))], [true, true, true, true], 'bug mail');
  });

  try { _fsPauseAll(); } catch (e) {} $$('video').forEach(v => { try { v.muted = true; v.pause(); } catch (e) {} });
  return { checks };
})

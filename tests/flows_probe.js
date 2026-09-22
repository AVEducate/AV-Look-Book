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
  // ── Duplicate destination (round 3): INSERT in the Simple section of tests/flows_probe.js, straight AFTER the check
  //    'Simple: Add Destination opens its window, adds the destination, and it can be removed'. Needs no media file.
  await check('Simple: Duplicate destination carries the clip settings (fit, In / Out, speed, level, look) and is one undo step', async () => {
    const f = firstLayer(); const n0 = screens.length; const ids = screens.map(s => s.id);
    setLayerMedia(f.pid, f.sid, 1, { in: 0.4005, out: 1.3338, level: 85, speed: 125, fit: 'fill', hue: 20, fadeIn: 1 }); setLayerMedia(f.pid, f.sid, 0, { level: 0, loop: false });
    duplicateScreen(f.sid); await wait(400); const nid = screens.map(s => s.id).find(x => !ids.includes(x)); const p = presets.find(x => x.id === f.pid);
    const src = JSON.stringify(p.layerMedia[f.sid]), dup = JSON.stringify((p.layerMedia || {})[nid] || null); const shared = !!nid && p.layerMedia[nid] === p.layerMedia[f.sid];
    doUndo(); await wait(400); const back = screens.length; await restore();
    return is([!!nid, dup === src, shared, back], [true, true, false, n0], 'copy made / clip settings equal / not the same object / undo removes the copy');
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
  await check('Simple: the layer panel title reads in full and no caption in the panel is cut off', async () => {
    const f = firstLayer(); openLayerPanel(fakeEv, f.pid, f.sid, 1, true); await wait(450); const pop = $('#layer-panel'); if (!pop) return 'the layer panel did not open';
    const h = $('.pm-hdr h3', pop); const cut = $$('*', pop).filter(el => el.children.length === 0 && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && (el.textContent || '').trim()).map(el => el.textContent.trim().slice(0, 30));
    const out = is([/^L1 · /.test(h.textContent), h.scrollWidth <= h.clientWidth + 1, cut], [true, true, []], 'title / fits / cut-off text'); closeLayerPanel(); return out;
  });
  await check('Simple: typing a Width in the layer panel resizes the layer and the height follows the lock', async () => {
    const f = firstLayer(); const sw = parseInt(f.s.w), sh = parseInt(f.s.h); openLayerPanel(fakeEv, f.pid, f.sid, 1, true); await wait(400);
    const w = $$('#layer-panel .lfx-acc[data-sec="size"] input[type=number]').find(i => i.dataset.dim === 'w'); if (!w) return 'no Width field';
    w.focus(); w.value = '960'; fire(w, 'input'); await wait(150); fire(w, 'change'); w.blur(); await wait(200);
    const g = _lfxGeo(f.pid, f.sid, 1, sw, sh); closeLayerPanel(); const out = is([g.w, g.h], [960, 540], 'window'); await restore(); return out;
  });
  await check('Simple: a masked layer can sit past the edge by the masked amount, and a Size edit leaves its position alone', async () => {
    const f = firstLayer(); const sw = parseInt(f.s.w), sh = parseInt(f.s.h); setCrop(f.pid, f.sid, 1, { t: 0, b: 0, l: 25, r: 0 }); setLayerSize(f.pid, f.sid, 1, 0.5, 0.5, 0, 0.1); scheduleRender(); await wait(200);
    openLayerPanel(fakeEv, f.pid, f.sid, 1, true); await wait(450); const pop = $('#layer-panel'); if (!pop) return 'the layer panel did not open';
    const inp = (sec, dim) => $$('.lfx-acc[data-sec="' + sec + '"] input[type=number]', pop).find(i => i.dataset.dim === dim); const x = inp('pos', 'x'); if (!x) return 'no X field';
    x.focus(); x.value = '-120'; fire(x, 'input'); fire(x, 'change'); await wait(250); const x1 = Math.round((getLayerSize(f.pid, f.sid, 1).xf || 0) * sw);
    const floor = parseInt(($$('.lfx-acc[data-sec="pos"] input[type=range]', pop).find(i => i.dataset.dim === 'x') || {}).min, 10);
    const wasLocked = _lfxLock; if (_lfxLock) { const lk = $('.fs-lock', pop); if (lk) { lk.click(); await wait(250); } }
    const hIn = inp('size', 'h'); hIn.focus(); hIn.value = '400'; fire(hIn, 'input'); fire(hIn, 'change'); await wait(250); const x2 = Math.round((getLayerSize(f.pid, f.sid, 1).xf || 0) * sw);
    const out = is([x1, x2, floor <= -120], [-120, -120, true], 'typed X / X after a Height edit / fader floor'); closeLayerPanel(); _lfxLock = wasLocked;   // the padlock is session-wide: leave it as it was for the checks that follow
    await restore(); return out;
  });
  // ── round 3: selection, keys, pop-up panels, the new-layer default and the mask limit (owner report 2026-09-21) ──
  // INSERT all five blocks, in this order, right after the check
  //   'Simple: a masked layer can sit past the edge by the masked amount, and a Size edit leaves its position alone'
  // and before 'Simple: an Area of Interest can be switched on and off for a destination'.
  // Synthetic events on purpose (the probe runs inside the page): press() sends pointerdown then click, the pair the
  // outside-click guard (window._lbPressInPopup) reads; keys go to <body> the way an unfocused page receives them.
  await check('Simple: Delete and Backspace never remove a selected destination, a selected layer still goes and comes back with one undo', async () => {
    const key = k => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    const p = presets.find(x => screens.some(s => getBgName(x.id, s.id) && getL(x.id, s.id, 1))) || presets[1]; const s = screens.find(x => getBgName(p.id, x.id) && getL(p.id, x.id, 1)) || screens[0];
    const box = $('#canvas-area .screen-box[data-pid="' + p.id + '"][data-sid="' + s.id + '"]'); if (!box) return 'no destination box on the canvas';
    doSelect(null, null); hideMoveSymbol(); selLayer = null; const n0 = screens.length;
    box.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); await wait(150); const picked = !!(sel && sel.sid === s.id);
    key('Delete'); await wait(200); const afterDel = screens.length; key('Backspace'); await wait(200); const afterBk = screens.length;
    if (afterDel !== n0 || afterBk !== n0) { await restore(); return is([picked, afterDel, afterBk], [true, n0, n0], 'picked / destinations after Delete / after Backspace'); }
    const chip = $('#canvas-area .layer-chip[data-pid="' + p.id + '"][data-sid="' + s.id + '"][data-lid="1"]'); if (!chip) { await restore(); return 'no layer chip on that destination'; }
    const was = getL(p.id, s.id, 1); chip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); await wait(150); const layerPicked = !!(selLayer && selLayer.n === 1);
    key('Backspace'); await wait(250); const gone = getL(p.id, s.id, 1); doUndo(); await wait(300); const back = getL(p.id, s.id, 1);
    const out = is([picked, afterDel, afterBk, layerPicked, gone, back], [true, n0, n0, true, null, was], 'picked / destinations after Delete / after Backspace / layer picked / layer after Backspace / after one undo');
    await restore(); return out;
  });
  await check('Simple: a click on a destination that is half out of view does not move the canvas, and click then double-click opens Destination Properties', async () => {
    const ca = $('#canvas-area'); const p = presets[1] || presets[0]; const s = screens[0];
    const box = () => $('#canvas-area .screen-box[data-pid="' + p.id + '"][data-sid="' + s.id + '"]'); if (!box()) return 'no destination box';
    doSelect(null, null); hideMoveSymbol(); ca.scrollTop = 0; ca.scrollTop += box().getBoundingClientRect().bottom - ca.getBoundingClientRect().bottom - 60; await wait(200);
    const cut = box().getBoundingClientRect().bottom > ca.getBoundingClientRect().bottom + 20; if (!cut) return 'could not park the destination half out of view';
    const top0 = Math.round(box().getBoundingClientRect().top);
    box().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); await wait(250);
    const top1 = Math.round(box().getBoundingClientRect().top), picked = !!(sel && sel.sid === s.id && sel.pid === p.id);
    box().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); box().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); box().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })); await wait(350);
    const panel = !!$('#screen-panel'), top2 = Math.round(box().getBoundingClientRect().top);
    // the table row still brings a destination that is out of view onto the canvas
    closeScreenPanel(); doSelect(null, null); hideMoveSymbol(); ca.scrollTop = 0; await wait(100); const far = presets[presets.length - 1]; doSelect(far.id, s.id); await wait(150); const followed = ca.scrollTop > 0;
    const out = is([picked, top1 - top0, top2 - top0, panel, followed], [true, 0, 0, true, true], 'picked / box moved on the click (px) / box moved after the double-click (px) / Destination Properties open / a table pick still scrolls the canvas');
    doSelect(null, null); hideMoveSymbol(); ca.scrollTop = 0; await restore(); return out;
  });
  await check('Simple: a click outside closes the Destination, Layer and AUX panels (another destination, the same destination, the toolbar), a click inside keeps them open', async () => {
    const press = el => { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); };
    const dbl = el => el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    const f = firstLayer(); if (!f) return 'no layer in the example'; const other = screens.find(x => x.id !== f.sid);
    const box = sid => $('#canvas-area .screen-box[data-pid="' + f.pid + '"][data-sid="' + sid + '"]');
    dbl(box(f.sid)); await wait(350); const destOpen = !!$('#screen-panel'); if (!destOpen) return 'Destination Properties did not open on a double-click';
    press($('#screen-panel .pm-hdr') || $('#screen-panel')); await wait(150); const destStays = !!$('#screen-panel');
    press(box(other.id)); await wait(200); const destClosed = !$('#screen-panel');
    closeScreenPanel(); doSelect(null, null); hideMoveSymbol(); selLayer = null; scheduleRender(); await wait(250);
    const chip = $('#canvas-area .layer-chip[data-pid="' + f.pid + '"][data-sid="' + f.sid + '"][data-lid="1"]'); dbl(chip); await wait(400); const layerOpen = !!$('#layer-panel');
    if (layerOpen) { press($('#layer-panel .pm-hdr') || $('#layer-panel')); await wait(150); } const layerStays = !!$('#layer-panel');
    press(box(f.sid)); await wait(200); const layerClosed = !$('#layer-panel');
    closeLayerPanel(); doSelect(null, null); hideMoveSymbol(); await wait(150);
    const aux = $('#canvas-area .dsm-box'); let auxOpen = false, auxStays = false, auxClosed = false;
    if (aux) { dbl(aux); await wait(350); auxOpen = !!$('#dsm-panel'); if (auxOpen) { press($('#dsm-panel .pm-hdr') || $('#dsm-panel')); await wait(150); } auxStays = !!$('#dsm-panel'); press($('#toolbar')); await wait(200); auxClosed = !$('#dsm-panel'); }
    const dp = $('#dsm-panel'); if (dp) dp.remove(); selDSM = null; window._lbPressInPopup = false;
    const out = is([destStays, destClosed, layerOpen, layerStays, layerClosed, auxOpen, auxStays, auxClosed], [true, true, true, true, true, true, true, true], 'Destination stays on an inside click / closes on another destination / Layer opens / stays / closes on its own destination / AUX opens / stays / closes on the toolbar');
    await restore(); return out;
  });
  await check('new layer: starts as a centred PIP at half the destination (plain = half by half, a locked picture keeps its shape), also in a slot a removed layer left behind', async () => {
    const wasLocked = _lfxLock; _lfxLock = true;
    const p = presets[0], s = screens[0], sw = parseInt(s.w), sh = parseInt(s.h);
    const geo = (pid, n) => { const g = _lfxGeo(pid, s.id, n, sw, sh); return [g.w, g.h, g.x, g.y]; };
    const free = [1, 2, 3, 4].filter(n => !getL(p.id, s.id, n)); if (free.length < 2) { _lfxLock = wasLocked; return 'the first preset has no two empty layer slots on ' + s.name; }
    const nPlain = free[free.length - 1], nPic = free[0];   // the plain source goes in the HIGHER slot: that is where the old 2 % stagger showed
    customLibrary.push({ l: 'TEST NEW 4x3', c: '#888888', kind: 'image', media: { w: 1600, h: 1200 } });
    homeSetL(p.id, s.id, nPlain, 'CAM 2'); const plain = geo(p.id, nPlain);
    homeSetL(p.id, s.id, nPic, 'TEST NEW 4x3'); const pic = geo(p.id, nPic);
    const pw = Math.round(sw / 2); let ph = Math.round(pw * 0.75), pw2 = pw; if (ph > sh) { ph = sh; pw2 = Math.round(ph / 0.75); }
    // a slot a removed layer left behind: take a layer that is NOT half-size, remove it with the key, put a new source in
    let reused = 'skipped', want = 'skipped'; const q = presets.find(x => { if (x === p) return false; const r = getLayerSize(x.id, s.id, 1); return getL(x.id, s.id, 1) && r && (r.wf !== 0.5 || r.hf !== 0.5); });
    if (q) { selLayer = { pid: q.id, sid: s.id, n: 1 }; document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })); await wait(150); homeSetL(q.id, s.id, 1, 'CAM 2'); reused = geo(q.id, 1); want = [Math.round(sw / 2), Math.round(sh / 2), Math.round(sw / 4), Math.round(sh / 4)]; }
    const out = is([plain, pic, reused], [[Math.round(sw / 2), Math.round(sh / 2), Math.round(sw / 4), Math.round(sh / 4)], [pw2, ph, Math.round((sw - pw2) / 2), Math.round((sh - ph) / 2)], want], 'plain [w,h,x,y] / locked 4:3 picture / re-used slot');
    _lfxLock = wasLocked; selLayer = null; await restore(); return out;
  });
  await check('mask: each side goes to 99 %, opposite sides never pass 99 % together (typed and pasted), one undo per edit, and the Look Book prints it', async () => {
    const f = firstLayer(); if (!f) return 'no layer in the example'; const sw = parseInt(f.s.w), sh = parseInt(f.s.h); const wasOpen = _lfxOpen.crop; _lfxOpen.crop = true;
    pushUndo(); setLayerSize(f.pid, f.sid, 1, 0.5, 0.5, 0.25, 0.25); setCrop(f.pid, f.sid, 1, { t: 0, b: 0, l: 0, r: 0 }); scheduleRender(); await wait(200);
    openLayerPanel(fakeEv, f.pid, f.sid, 1, true); await wait(450); const pop = $('#layer-panel'); if (!pop) { _lfxOpen.crop = wasOpen; return 'the layer panel did not open'; }
    const fld = d => $('.lp-cr-inp[data-dim="' + d + '"]', pop); const lw = Math.round(sw * 0.5);
    const type = async (d, v) => { const i = fld(d); i.focus(); i.value = String(v); fire(i, 'input'); await wait(120); fire(i, 'change'); i.blur(); await wait(150); return parseInt(fld(d).value, 10); };
    const lShown = await type('l', Math.round(lw * 0.9)); const c1 = getCrop(f.pid, f.sid, 1);
    const rShown = await type('r', Math.round(lw * 0.5)); const c2 = getCrop(f.pid, f.sid, 1);
    const vis = _layerVisibleSize(f.pid, f.sid, 1, sw, sh, 0.5, 0.5); const chip = $('#canvas-area .layer-chip[data-pid="' + f.pid + '"][data-sid="' + f.sid + '"][data-lid="1"]');
    doUndo(); await wait(250); const u1 = getCrop(f.pid, f.sid, 1); doRedo(); await wait(250);
    if (!$('#layer-panel')) { openLayerPanel(fakeEv, f.pid, f.sid, 1, true); await wait(450); }   // an undo closes the panel
    const keepClip = _lfxClip.crop; _lfxClip.crop = { t: 60, b: 60, l: 0, r: 0 }; _lfxSecAction('paste', 'crop'); await wait(250); const c3 = getCrop(f.pid, f.sid, 1); _lfxClip.crop = keepClip;
    closeLayerPanel(); setCrop(f.pid, f.sid, 1, { t: 0, b: 0, l: 90, r: 0 }); scheduleRender(); await wait(200);
    const html = await userLookBook(); const m = String(html).match(/(?:bd-crop|crop-line)">[^<]*\bL (\d+)px[^<]*?(\d+)\u00d7(\d+)/) || []; const lbLine = [parseInt(m[1], 10), parseInt(m[2], 10)];
    const out = is([lShown, Math.round(c1.l), rShown, Math.round(c2.l), c2.l + c2.r <= 99, vis.w >= 1, !!chip, Math.round(u1.l), Math.round(u1.r || 0), c3.t, c3.b, lbLine],
      [Math.round(lw * 0.9), 90, Math.floor(lw * 9 / 100), 90, true, true, true, 90, 0, 60, 39, [Math.round(lw * 0.9), lw - Math.round(lw * 0.9)]], 'Left field / left % / Right field gives way / left kept / pair within 99 / something still visible / chip drawn / undo takes back the Right edit only (l, r) / paste top / paste bottom / Look Book line [masked px, visible width]');
    _lfxOpen.crop = wasOpen; await restore(); return out;
  });
  await check('Simple: an Area of Interest can be switched on and off for a destination', async () => {
    const p = presets[1].id, s = screens[0].id; const was = !!getAOI(p, s); toggleAOI(p, s); await wait(200); const on = !!getAOI(p, s); toggleAOI(p, s); await wait(200);
    const out = is([on, !!getAOI(p, s)], [!was, was], 'AOI'); await restore(); return out;
  });

// round3 / dest-features: regression checks for tests/flows_probe.js. Each block FAILS on build 16kj unpatched and PASSES with patch.py applied.

// ── BLOCK 1 to 4: insert right AFTER the existing check
//    'Simple: an Area of Interest can be switched on and off for a destination'   (still the Simple section, before the Advanced test media is built)
  await check('Simple: an active Area of Interest has an Off button on the destination, and Off is one undo step', async () => {
    const p = presets[1].id, s = screens[0].id; const hid = document.body.classList.contains('adv-hide-aoi'); if (hid) toggleAdvFeature('aoi');   // the AOI buttons only draw with the AOI Overlays view on
    if (!getAOI(p, s)) toggleAOI(p, s); await wait(300);
    const btn = $('#canvas-area .screen-box[data-pid="' + p + '"][data-sid="' + s + '"] .aoi-actions.active .aoi-btn.off'); const n = _undoStack.length; let out;
    if (!btn) out = 'no Off button on the active AOI';
    else { btn.click(); await wait(300); const off = !getAOI(p, s), steps = _undoStack.length - n; doUndo(); await wait(300); out = is([off, steps, !!getAOI(p, s)], [true, 1, true], 'off after the click / undo steps / on again after Undo'); }
    if (hid) toggleAdvFeature('aoi');   // the view switch is remembered per browser: leave it as it was
    await restore(); return out;
  });
  // REPLACES (Simple section, not the no-overlap block): 'Simple: Destination Properties Apply is one undo step, Undo brings back size, position and rotation together and nothing older'
  await check('Simple: Destination Properties Apply is one undo step, Undo brings back size, position and rotation together and nothing older (the Apply lands 40 px on the neighbour: refused with no undo step while Blend Zones is off, accepted through "Add to blend" with it on)', async () => {
    const p = presets[1].id, sid = screens[0].id; const S = () => screens.find(x => x.id === sid), P = () => presets.find(x => x.id === p);
    const blendIs = () => !document.body.classList.contains('adv-hide-blend'), blendSet = on => { if (blendIs() !== on) actions.toggleAdvFeature('blend'); closeAdvancedMenu(); }; const wasBlend = blendIs(), wasFree = document.body.classList.contains('adv-free-position');
    if (wasFree) actions.toggleAdvFeature('freePos'); blendSet(false);
    pushUndo(); setL(p, sid, 2, 'CLOCK'); scheduleRender(); await wait(200);   // an older edit that Undo must NOT touch
    const fill = async () => { openScreenPanel(fakeEv, p, sid); await wait(400); const pop = $('#screen-panel'); if (!pop) return false; $('#sp-w', pop).value = '2000'; $('#sp-h', pop).value = '1200'; $('#sp-x', pop).value = '40'; $('#sp-rot', pop).value = '90'; $('#sp-apply', pop).click(); await wait(400); return true; };
    const keep = async () => { if (dlgOpen() && /Keep your layout/.test(dialogText())) { $('#dlg-confirm').click(); await wait(500); } };   // the quarter turn on a moved destination asks "Keep your layout?" first; "Keep my layout" is what okDialogs() always pressed here, and the overlap guard runs after that answer
    const n = _undoStack.length; if (!(await fill())) { blendSet(wasBlend); if (wasFree) actions.toggleAdvFeature('freePos'); return 'Destination Properties did not open'; } await keep();
    const refused = [dlgOpen() && /Destinations can.t overlap/.test(dialogText()) && !$('#dlg-cancel'), parseInt(S().w), parseInt(S().h), getRotation(p, sid), _undoStack.length - n, getL(p, sid, 2)];
    if (dlgOpen()) { ($('#dlg-cancel') || $('#dlg-confirm')).click(); await wait(400); }   // OK on the alert; on a page that still asks, Cancel (never "Add to blend")
    blendSet(true); await wait(150); await fill(); await keep(); const asked = dlgOpen() && /Create Blend Zone/.test(dialogText()); okDialogs(); await wait(400);   // Blend Zones on: "Create Blend Zone?" comes up and okDialogs() presses Add to blend, as this check always did
    const applied = [parseInt(S().w), parseInt(S().h), getRotation(p, sid)], steps = _undoStack.length - n;
    doUndo(); await wait(300); const back = [parseInt(S().w), parseInt(S().h), (P().positions[sid] || {}).x, getRotation(p, sid), getL(p, sid, 2)];
    blendSet(wasBlend); if (wasFree) actions.toggleAdvFeature('freePos'); closeAdvancedMenu();
    const out = is([refused, asked, applied, steps, back], [[true, 1920, 1080, 0, 0, 'CLOCK'], true, [2000, 1200, 90], 1, [1920, 1080, 0, 0, 'CLOCK']], 'refused with Blend Zones off (alert, W, H, rotation, undo steps, older edit) / asked with it on / applied / undo steps / after one Undo'); await restore(); return out;
  });
  await check('Simple: Destination Properties copies and pastes Size, Position and Rotation between destinations and presets, resets them, shows the aspect ratio', async () => {
    const a = { p: presets[1].id, s: screens[1].id }, b = { p: presets[2].id, s: screens[0].id }; const S = () => screens.find(x => x.id === b.s), P = () => presets.find(x => x.id === b.p);
    openScreenPanel(fakeEv, a.p, a.s); await wait(400); let pop = $('#screen-panel'); if (!pop) return 'Destination Properties did not open';
    const tool = (key, act) => $('[data-sp-key="' + key + '"][data-sp-tool="' + act + '"]', pop); if (!tool('size', 'copy') || !tool('pos', 'paste') || !tool('rot', 'reset')) { closeScreenPanel(); return 'no copy / paste / reset tools in Destination Properties'; }
    const asp = [($('#sp-aspect', pop) || {}).textContent]; $('#sp-w', pop).value = '3840'; fire($('#sp-w', pop), 'input'); asp.push($('#sp-aspect', pop).textContent);
    $('#sp-w', pop).value = '1280'; $('#sp-h', pop).value = '720'; $('#sp-x', pop).value = '0'; $('#sp-y', pop).value = '20'; $('#sp-rot', pop).value = '180';   // copy takes what the window shows
    tool('size', 'copy').click(); tool('pos', 'copy').click(); tool('rot', 'copy').click(); closeScreenPanel(); await wait(150);
    const before = JSON.stringify([S().w, S().h, P().positions[b.s], getRotation(b.p, b.s)]);
    openScreenPanel(fakeEv, b.p, b.s); await wait(400); pop = $('#screen-panel'); const n = _undoStack.length;
    tool('size', 'paste').click(); await wait(150); const s1 = _undoStack.length - n; tool('pos', 'paste').click(); await wait(150); const s2 = _undoStack.length - n; tool('rot', 'paste').click(); await wait(150); const s3 = _undoStack.length - n;
    const pasted = [parseInt(S().w), parseInt(S().h), P().positions[b.s].x, P().positions[b.s].y, getRotation(b.p, b.s)], fields = [$('#sp-w', pop).value, $('#sp-x', pop).value, $('#sp-rot', pop).value];
    tool('size', 'reset').click(); await wait(150); tool('pos', 'reset').click(); await wait(150); tool('rot', 'reset').click(); await wait(250);
    const after = JSON.stringify([S().w, S().h, P().positions[b.s], getRotation(b.p, b.s)]); closeScreenPanel();
    const out = is([asp, pasted, fields, [s1, s2, s3], after === before, _undoStack.length - n], [['Aspect 16:9', 'Aspect 32:9'], [1280, 720, 0, 20, 180], ['1280', '0', '180'], [1, 2, 3], true, 5], 'aspect / pasted / fields follow / one undo step per paste / reset returns to as-opened / five steps in all (the size reset re-centres the destination, so the position reset has nothing left to change and leaves no empty step)');
    await restore(); return out;
  });
  await check('Simple: the EDID note is kept per destination per preset, survives save and load, follows a destination copy and goes with a deleted destination', async () => {
    const p = presets[1].id, q = presets[2].id, sid = screens[0].id; const note = 'Force 1080p59.94'; const N = (pid, s) => ((presets.find(x => x.id === pid) || {}).edidNotes || {})[s];
    openScreenPanel(fakeEv, p, sid); await wait(400); const pop = $('#screen-panel'); if (!pop) return 'Destination Properties did not open';
    const f = $('#sp-edid', pop); if (!f) { closeScreenPanel(); return 'no EDID note field in Destination Properties'; }
    const n = _undoStack.length; f.value = note; $('#sp-apply', pop).click(); await wait(400); okDialogs(); const stored = [N(p, sid), N(q, sid), _undoStack.length - n];
    _applyProjectText(JSON.stringify(getProjectState())); await wait(800); okDialogs(); const reloaded = N(p, sid);
    openScreenPanel(fakeEv, p, sid); await wait(300); const shown = ($('#sp-edid') || {}).value; closeScreenPanel();
    duplicateScreen(sid); await wait(350); const copyId = screens[screens.findIndex(x => x.id === sid) + 1].id; const copied = N(p, copyId);
    deleteScreen(copyId); await wait(350); okDialogs(); await wait(200); const cleaned = !Object.prototype.hasOwnProperty.call((presets.find(x => x.id === p).edidNotes || {}), copyId);
    const out = is([stored, reloaded, shown, copied, cleaned], [[note, undefined, 1], note, note, note, true], 'stored (this preset / another preset / undo steps) / after reload / shown on reopen / on the copy / cleared on delete'); await restore(); return out;
  });


  // ── vp-simple click-through (2026-09-21): INSERT in the Simple section of tests/flows_probe.js, straight AFTER the check
  //    'Simple: the EDID note is kept per destination per preset, survives save and load, follows a destination copy and goes with a deleted destination'.
  //    Every check here FAILS on build 16ko without patch.py and PASSES with it. No media needed.
  const vpMouse = (el, type, x, y) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1 }));
  const vpDrag = async (el, dx, dy) => { const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; vpMouse(el, 'mousedown', x, y); for (let i = 1; i <= 4; i++) { vpMouse(window, 'mousemove', x + dx * i / 4, y + dy * i / 4); await wait(20); } vpMouse(window, 'mouseup', x + dx, y + dy); return el; };
  const vpUndoLen = () => _undoStack.length;
  await check('Simple: a preset name with a quote is kept whole after a redraw, a preset field edit is one undo step, and a code edit leaves the name field alone', async () => {
    const p = presets[0], old = p.name, n0 = vpUndoLen(); const nm = $('#pn-' + p.id); nm.focus(); nm.value = '6" RISER'; nm.blur(); await wait(150);
    render(); await wait(200); const shown = $('#pn-' + p.id).value, steps = vpUndoLen() - n0;
    const before = $('#pn-' + p.id); const cd = $('#pc-' + p.id); cd.focus(); cd.value = 'Z1'; cd.blur(); await wait(250); const sameField = $('#pn-' + p.id) === before;   // a rebuilt tile dropped the text typed next
    doUndo(); await wait(250); doUndo(); await wait(250); const back = presets[0].name; await restore();
    return is([shown, steps, sameField, back], ['6" RISER', 1, true, old], 'field after redraw / undo steps for the rename / name field survives a code edit / name after undo');
  });
  await check('Simple: a destination corner drag, an AOI drag, an AOI corner drag, a typed AOI field and a layer corner drag are each one undo step', async () => {
    const f = firstLayer(); const p = presets[0], s = screens[1]; const out = [];
    doSelect(p.id, s.id); await wait(250); let n = vpUndoLen(); const w0 = parseInt(s.w);
    await vpDrag($('.preset-row[data-pid="' + p.id + '"] .screen-box[data-sid="' + s.id + '"] > .rh-br'), -24, 0); await wait(300); out.push(vpUndoLen() - n, parseInt(screens[1].w) !== w0);
    doUndo(); await wait(300); out.push(parseInt(screens[1].w) === w0);
    const wasAoi = document.body.classList.contains('adv-hide-aoi'); document.body.classList.remove('adv-hide-aoi'); toggleAOI(p.id, s.id); setAOI(p.id, s.id, { x: 100, y: 100, w: 800, h: 600 }); render(); await wait(250);
    const bx = () => $('.preset-row[data-pid="' + p.id + '"] .screen-box[data-sid="' + s.id + '"]');
    n = vpUndoLen(); await vpDrag($('.aoi-drag', bx()), 20, 0); await wait(250); out.push(vpUndoLen() - n);
    n = vpUndoLen(); await vpDrag($('.aoi-box .rh-br', bx()), -12, -8); await wait(250); out.push(vpUndoLen() - n);
    n = vpUndoLen(); const fld = $('.aoi-dim-row input[data-dim="w"]', bx()); fld.value = '640'; fire(fld, 'change'); await wait(250); out.push(vpUndoLen() - n, getAOI(p.id, s.id).w);
    document.body.classList.toggle('adv-hide-aoi', wasAoi);
    selLayer = { pid: f.pid, sid: f.sid, n: 1 }; setLayerSize(f.pid, f.sid, 1, 0.5, 0.5, 0.25, 0.25); render(); await wait(300);
    n = vpUndoLen(); await vpDrag($('.preset-row[data-pid="' + f.pid + '"] .layer-chip[data-sid="' + f.sid + '"][data-lid="1"] .lrh-br'), -20, -10); await wait(300); out.push(vpUndoLen() - n);
    selLayer = null; await restore();
    return is(out, [1, true, true, 1, 1, 1, 640, 1], 'dest corner steps / resized / undo restores / AOI drag / AOI corner / AOI field steps, value / layer corner');
  });
  await check('Simple: a layer drag undoes to where the layer was, dragging a selected chip does not open the Layer panel, and arrow nudges are one undo step', async () => {
    const f = firstLayer(); setLayerSize(f.pid, f.sid, 1, 0.5, 0.5, 0.25, 0.25); selLayer = { pid: f.pid, sid: f.sid, n: 1 }; render(); await wait(300);
    const chip = () => $('.preset-row[data-pid="' + f.pid + '"] .layer-chip[data-sid="' + f.sid + '"][data-lid="1"]');
    const c = chip(); await vpDrag(c, 30, 10); c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); await wait(350);   // the browser fires this click after every drag
    const panel = !!$('#layer-panel'); closeLayerPanel(); const moved = getLayerSize(f.pid, f.sid, 1).xf;
    doUndo(); await wait(300); const back = getLayerSize(f.pid, f.sid, 1).xf;
    selLayer = { pid: f.pid, sid: f.sid, n: 1 }; const n = vpUndoLen(); const key = k => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    key('ArrowRight'); key('ArrowRight'); key('ArrowDown'); await wait(250); const steps = vpUndoLen() - n; doUndo(); await wait(250); const back2 = getLayerSize(f.pid, f.sid, 1).xf;
    selLayer = null; await restore();
    return is([panel, moved !== 0.25, back, steps, back2], [false, true, 0.25, 1, 0.25], 'panel opened by the drag / layer moved / X after undo / undo steps for three nudges / X after undoing the nudges');
  });
  await check('Simple: in the Simple layer panel a Width + Enter, Fill, a library pick, Remove from this preset and the library × are each one undo step', async () => {
    const f = firstLayer(); const out = []; const open = async () => { closeLayerPanel(); openLayerPanelSimple(fakeEv, f.pid, f.sid, 1); await wait(400); return $('#layer-panel'); };
    let pop = await open(); let n = vpUndoLen(); const w = $('.lp-w', pop); w.value = '800'; w.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(250); out.push(vpUndoLen() - n);
    n = vpUndoLen(); $('.lp-fs-btn', pop).click(); await wait(250); out.push(vpUndoLen() - n);
    pop = await open(); n = vpUndoLen(); const cur = getL(f.pid, f.sid, 1); const rowEl = $$('.lp-content-list > div', pop).find(r => r.dataset.label && r.dataset.label !== cur); rowEl.click(); await wait(300); out.push(vpUndoLen() - n);
    pop = await open(); n = vpUndoLen(); $('.lp-remove', pop).click(); await wait(300); out.push(vpUndoLen() - n, getL(f.pid, f.sid, 1)); doUndo(); await wait(300); out.push(!!getL(f.pid, f.sid, 1));
    customLibrary.push({ l: 'VP TEST ITEM', c: '#6b7280' }); n = vpUndoLen(); deleteCustomLabel('VP TEST ITEM'); await wait(200); out.push(vpUndoLen() - n);
    closeLayerPanel(); await restore();
    return is(out, [1, 1, 1, 1, null, true, 1], 'Width / Fill / library pick / Remove steps, layer gone, undo brings it back / library × steps');
  });
  await check('Simple: Show Labels / Remove Labels is one undo step, and a click on the mode already lit changes nothing', async () => {
    const p = presets[0], s = screens[0]; openScreenPanel(fakeEv, p.id, s.id); await wait(350); const n = vpUndoLen();
    $('#sp-show-show').click(); await wait(150); const idle = vpUndoLen() - n, untouched = !(p.showMode && p.showMode[s.id]);
    $('#sp-show-shape').click(); await wait(200); const steps = vpUndoLen() - n; doUndo(); await wait(250); const back = getShowMode(p.id, s.id); closeScreenPanel(); await restore();
    return is([idle, untouched, steps, back], [0, true, 1, 'show'], 'steps for the lit mode / nothing written / steps for Remove Labels / mode after undo');
  });
  await check('Simple: Add AUX (+), the AUX panel Apply and Remove AUX Globally are each one undo step', async () => {
    const out = []; let n = vpUndoLen(); const c0 = dsms.length; actions.addDSM(); await wait(250); out.push(vpUndoLen() - n, dsms.length - c0); doUndo(); await wait(250); out.push(dsms.length - c0);
    const p = presets[0], dm = dsms[0]; selDSM = { pid: p.id, dsmId: dm.id }; openDSMPanel(fakeEv, p.id, dm.id); await wait(350); n = vpUndoLen();
    $('#dsmp-name').value = 'RECORD 1'; $('#dsmp-apply').click(); await wait(250); out.push(vpUndoLen() - n, getDSMName(p.id, dm.id)); doUndo(); await wait(250); out.push(getDSMName(p.id, dm.id) !== 'RECORD 1');
    const dm2 = dsms[0]; openDSMPanel(fakeEv, p.id, dm2.id); await wait(350); n = vpUndoLen(); const c1 = dsms.length; $('#dsmp-remove').click(); await wait(250); okDialogs(); await wait(200); out.push(vpUndoLen() - n, c1 - dsms.length); doUndo(); await wait(250); out.push(dsms.length === c1);
    selDSM = null; await restore();
    return is(out, [1, 1, 0, 1, 'RECORD 1', true, 1, 1, true], '+ steps, added, undone / Apply steps, name, undone / Remove steps, removed, undone');
  });
  await check('Simple: a dragged table row or preset tile lands where the drop line shows, a drop on the near half changes nothing, and Undo puts the order back', async () => {
    const names = () => screens.map(s => s.name).join('|'), pn = () => presets.map(p => p.code).join('|'); const o = names(), po = pn(); const out = [];
    const tr = i => $$('#tbody tr[data-pid="' + presets[0].id + '"]')[i]; const cell = i => tr(i).children[0];
    const drop = async (from, to, bottom) => { screenDragStart({ dataTransfer: {} }, screens[from].id); const r = tr(to).getBoundingClientRect(); const ev = new MouseEvent('drop', { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: bottom ? r.bottom - 3 : r.top + 3 }); cell(to).dispatchEvent(ev); await wait(350); };
    let n = vpUndoLen(); await drop(0, 1, false); out.push(names() === o, vpUndoLen() - n);           // top half of the next row = stay
    await drop(0, 1, true); const s1 = screens.map(s => s.name); out.push(s1[0] === o.split('|')[1] && s1[1] === o.split('|')[0]); doUndo(); await wait(350); out.push(names() === o);
    const rowEl = i => $$('.preset-row')[i]; const pdrop = async (from, to, bottom) => { presetDragStart({ dataTransfer: {}, stopPropagation() {} }, presets[from].id); await wait(30); const r = rowEl(to).getBoundingClientRect(); presetDrop({ preventDefault() {}, stopPropagation() {}, target: rowEl(to), clientY: bottom ? r.bottom - 4 : r.top + 4 }, presets[to].id); presetDragEnd(); await wait(350); };
    n = vpUndoLen(); await pdrop(0, 1, false); out.push(pn() === po, vpUndoLen() - n);
    await pdrop(0, 1, true); const c = po.split('|'); out.push(pn() === [c[1], c[0]].concat(c.slice(2)).join('|')); doUndo(); await wait(350); out.push(pn() === po);
    await restore();
    return is(out, [true, 0, true, true, true, 0, true, true], 'row: near half stays, no undo step / far half swaps / undo / tile: near half stays, no step / far half swaps / undo');
  });
  await check('Simple: a BG colour picked on the first preset shows on the canvas even when the destination carries a BG content colour', async () => {
    const p = presets[0], s = screens[1]; const had = !!getPColor(p.id, s.id); openColorPop(fakeEv, s.id, p.id); await wait(300); cpSetFromHex('#2980b9'); cpApply(); await wait(400);
    const bg = (getComputedStyle($('.preset-row[data-pid="' + p.id + '"] .screen-box[data-sid="' + s.id + '"] .screen-inner')).backgroundColor.match(/\d+/g) || []).map(Number); closeColorPop(); await restore();
    return is([had, bg[0] < 80 && bg[2] > 150], [true, true], 'the example carries a BG colour on P01 / the canvas turned blue (got rgb ' + bg.join(',') + ')');
  });
  await check('Simple: Escape closes the colour picker and leaves the Layer panel under it open; Escape in a table cell cancels the edit', async () => {
    const f = firstLayer(); openLayerPanel(fakeEv, f.pid, f.sid, 1, true); await wait(400); const sw = $('#layer-panel .lfx-swatch'); if (!sw) return 'no colour swatch in the layer panel'; _lfxOpenColor(sw); await wait(300);
    const wasOpen = $('#color-pop').style.display === 'block'; document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await wait(250);
    const pickerOpen = $('#color-pop').style.display === 'block', panelOpen = !!$('#layer-panel'); closeColorPop(); closeLayerPanel();
    const cellIn = $('#tbody input[name="t-d-notes"]'); const old = screens[0].notes || ''; cellIn.focus(); cellIn.value = 'SHOULD NOT STICK'; cellIn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); cellIn.dispatchEvent(new Event('blur')); await wait(250);
    const kept = (screens[0].notes || '') === old; await restore();
    return is([wasOpen, pickerOpen, panelOpen, kept], [true, false, true, true], 'picker was open / picker after Escape / panel after Escape / note untouched after Escape');
  });
  await check('Simple: a table note or P# edit is one undo step, a per-preset destination name shows on that preset\'s canvas, and the blend window shows all four digits of a resolution', async () => {
    const out = []; let n = vpUndoLen(); const note = $('#tbody input[name="t-d-notes"]'); note.focus(); note.value = 'NEW NOTE'; note.blur(); await wait(250); out.push(vpUndoLen() - n, screens[0].notes);
    const others = $$('#tbody input[name="t-d-notes"]').filter(i => i.id.endsWith('-' + screens[0].id)).map(i => i.value); out.push(others.every(v => v === 'NEW NOTE'));
    const q = presets[2], s = screens[1]; homeSetScreenName(q.id, s.id, 'PANEL WALL'); render(); await wait(300);
    out.push(($('.preset-row[data-pid="' + q.id + '"] .screen-box[data-sid="' + s.id + '"] .screen-inner > .screen-lbl') || {}).textContent, ($('.preset-row[data-pid="' + presets[0].id + '"] .screen-box[data-sid="' + s.id + '"] .screen-inner > .screen-lbl') || {}).textContent === s.name);
    const p = presets[0]; initStripPositions(p.id); setPosition(p, screens[1].id, 1720, 0); const wasB = document.body.classList.contains('adv-hide-blend'); document.body.classList.remove('adv-hide-blend'); render(); await wait(250);
    openBlendPopup(p.id, screens[0].id, screens[1].id); await wait(250); const cut = $$('.blend-popup input[onchange*="setDestResFromPopup"]').filter(i => i.scrollWidth > i.clientWidth + 1).length; closeBlendPopup(); document.body.classList.toggle('adv-hide-blend', wasB);
    out.push(cut); await restore();
    return is(out, [1, 'NEW NOTE', true, 'PANEL WALL', true, 0], 'note undo steps, note / every row of that destination follows / per-preset name on its canvas, first preset keeps the global name / resolution fields cut off');
  });

  // ── Dead Space: 16 PPI default and the stacked read-out (round 16kr, dead-space, owner report 2026-09-21) ───────────
  // BLOCK A (the ds* helpers + four checks): INSERT in the Simple section of tests/flows_probe.js, BEFORE the line
  //   "// ── Video Presets, Advanced"   (later setup loads test media; these checks need none).
  // BLOCK B (one check, marked below): INSERT in the section "Video Presets canvas: blends, dead space, destination drag,
  //   Fit Canvas", straight AFTER the check 'Dead Space: a gap over 500 px carries the "Large gap, check alignment" mark, ...'.
  //   It uses the ds* helpers of Block A, which sit earlier in the same function, so Block A must go in too.
  // Every check fails on build 16kq and passes with patch.py applied (run_checks.mjs proves both). Each one puts back what it
  // touches: the Dead Space switch, the stored Pixel-Feet setting (localStorage lookbook_a11y_settings), the zoom, the show.
  // Synthetic events on purpose (the probe runs inside the page); the same flows were driven with real clicks and keys in proof.mjs.
  const dsAdv = (f, on) => { const isOn = !document.body.classList.contains('adv-hide-' + f); if (isOn !== on) actions.toggleAdvFeature(f); closeAdvancedMenu(); return isOn; };
  const dsLay = async gaps => { const p = presets[0]; let x = 0; screens.forEach((s, i) => { setPosition(p, s.id, x, 0); x += getEffectiveDims(s, p.id).w + (gaps[i] || 0); }); render(); await wait(250); if (fsPresetId) { renderFullscreen(); await wait(250); } };
  const dsGap = i => { const p = presets[0]; return p.positions[screens[i + 1].id].x - (p.positions[screens[i].id].x + getEffectiveDims(screens[i], p.id).w); };
  const dsBoxes = root => $$('.preset-row[data-pid="' + presets[0].id + '"] .dead-vis', root).filter(v => $('input[data-dir="h"]', v));
  // one word per left / right read-out, measured ON SCREEN: 'stacked' or 'one line', plus whatever is wrong with it
  const dsRead = (root, hitTest) => dsBoxes(root).map(v => {
    const l = $('.dead-label', v), ins = $$('input', l), w = $('.gap-warn', l), R = e => e.getBoundingClientRect(); const V = R(v), L = R(l), A = R(ins[0]), B = R(ins[1]);
    const t = 1.5 * Math.max(1, V.width / (v.offsetWidth || 1)), stacked = B.top >= A.bottom - t, bad = [];
    if (Math.abs((L.left + L.right) / 2 - (V.left + V.right) / 2) > t) bad.push('off centre');
    if (L.top < V.top - t || L.bottom > V.bottom + t) bad.push('outside its box');
    if (hitTest && !ins.every(i => { const r = R(i); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === i; })) bad.push('a number box is covered');
    if ((parseInt(ins[0].value, 10) > 500) !== !!(w && R(w).width > 0 && R(w).right <= L.right + t)) bad.push('large-gap mark wrong');
    if (stacked) { if (Math.abs(A.left - B.left) > t) bad.push('FT is not under PX'); if (v.offsetWidth >= 150) bad.push('stacked with room to spare'); }
    else { if (Math.abs(A.top - B.top) > t) bad.push('neither stacked nor one line'); if (L.width > V.width + t) bad.push('wider than the gap'); }
    return (stacked ? 'stacked' : 'one line') + (bad.length ? ': ' + bad.join(', ') : '');
  });
  // the Pixel-Feet DEFAULT, reached the way the Reset button reaches it; the returned function puts the user's own setting back
  const dsDefaultPPI = () => {
    const raw = localStorage.getItem(_A11Y_KEY), keep = _PPI, zoom = document.body.style.zoom, cls = ['a11y-reduce-motion', 'a11y-high-contrast'].filter(c => document.body.classList.contains(c));
    resetA11y();
    return () => { if (raw === null) localStorage.removeItem(_A11Y_KEY); else localStorage.setItem(_A11Y_KEY, raw); _PPI = keep; document.body.style.zoom = zoom; cls.forEach(c => document.body.classList.add(c)); try { _a11yReflectActive(); } catch (e) {} scheduleRender(); };
  };

  await check('Pixel-Feet: the default is 16 PPI (1 foot = 192 px), a stored 96 PPI is kept, Reset returns to 16 / 192, and Help says 192', async () => {
    const back = dsDefaultPPI(); await wait(150); const field = $('#a11y-ppi-input'), lbl = $('#a11y-px-per-ft');
    const reset = [_PPI, _pxPerFoot(), _pxToFt(576), _ftToPx(2), field.value, lbl.textContent, _a11yLoad().ppi === undefined];
    const s = _a11yLoad(); s.ppi = 96; _a11ySave(s); _loadPPI(); const stored = [_PPI, _pxPerFoot(), _pxToFt(576)];   // what a user who set 96 before the update has on disk
    field.value = ''; fire(field, 'change'); await wait(100); const empty = [_PPI, lbl.textContent];                     // an emptied field falls back to the default
    const help = ($('#help-overlay').textContent || '').replace(/\s+/g, ' '); const text = [/16 PPI/.test(help), /1 foot = 192 pixels/.test(help), /96 PPI|1,152/.test(help)];
    back(); await wait(150);
    return is({ reset, stored, empty, text }, { reset: [16, 192, '3.00', 384, '16', '192', true], stored: [96, 1152, '0.50'], empty: [16, '192'], text: [true, true, false] },
      'after Reset [PPI, px per foot, 576 px in ft, 2 ft in px, field, read-out, nothing stored] / with 96 stored / field emptied / Help text [16 PPI, 192, old numbers left]');
  });
  await check('Dead Space: a 576 px gap reads 3.00 FT, and 2 typed in FT makes the gap 384 px in one undo step', async () => {
    const back = dsDefaultPPI(); const was = dsAdv('dead', true); await dsLay([576, 3000]);
    const v = dsBoxes($('#canvas-area'))[0]; if (!v) { dsAdv('dead', was); back(); await restore(); return 'no dead-space read-out on the tile'; }
    const ins = $$('input', v); const shown = [ins[0].value, ins[1].value]; const u0 = _undoStack.length;
    ins[1].value = '2'; fire(ins[1], 'change'); await wait(300); const asked = dlgOpen(); if (asked) { $('#dlg-cancel').click(); await wait(300); }
    const g = dsGap(0), steps = _undoStack.length - u0; doUndo(); await wait(300); const undone = dsGap(0);
    dsAdv('dead', was); back(); await restore();
    return is([shown, asked, g, steps, undone], [['576', '3.00'], false, 384, 1, 576], 'PX and FT shown / a dialog came up / gap after 2 FT / undo steps / gap after undo');
  });
  await check('Dead Space: a gap too narrow for the one-line read-out stacks FT under PX (centred, inside its box, large-gap mark kept, both boxes still set the gap), a roomy gap keeps one line, and five destinations stay readable', async () => {
    const back = dsDefaultPPI(); const was = dsAdv('dead', true); const area = $('#canvas-area'); area.scrollTop = 0;
    await dsLay([576, 2000]); const three = dsRead(area, true);
    const px = $$('input', dsBoxes(area)[0])[0]; px.value = '400'; fire(px, 'change'); await wait(300); const g1 = dsGap(0);
    const ft = $$('input', dsBoxes(area)[0])[1]; ft.value = '1.5'; fire(ft, 'change'); await wait(300); const g2 = dsGap(0);
    duplicateScreen(screens[2].id); await wait(400); okDialogs(); duplicateScreen(screens[2].id); await wait(400); okDialogs();
    await dsLay([576, 192, 1000, 384]); const n = screens.length, five = dsRead(area, true);
    dsAdv('dead', was); back(); await restore();
    return is({ three, typed: [g1, g2], n, five }, { three: ['stacked', 'one line'], typed: [400, 288], n: 5, five: ['stacked', 'stacked', 'stacked', 'stacked'] },
      'three destinations, 576 and 2000 px gaps / gap after 400 PX then 1.5 FT typed in the stacked read-out / destinations / five destinations, 576 192 1000 384 px gaps');
  });
  await check('Look Book: a printed dead-space read-out stacks only when its text does not fit the gap, feet follow 192 px per foot, and no number box or large-gap mark is printed', async () => {
    const back = dsDefaultPPI(); const was = dsAdv('dead', true); await dsLay([576, 1200]);
    const keep = window._pdfOpts; let html = ''; window._pdfOpts = Object.assign({}, _pdfOptsForSend(), { showDead: true }); try { html = exportPDF(true) || ''; } finally { window._pdfOpts = keep; }
    const doc = new DOMParser().parseFromString(html, 'text/html'); const labs = $$('.pp-livecanvas .dead-label', doc);
    const kinds = labs.map(l => (/flex-direction:\s*column/.test(l.getAttribute('style') || '') ? 'stacked ' : 'one line ') + l.textContent.replace(/\s+/g, ''));
    const sum = $$('.adv-val', doc).map(e => e.textContent.trim()).filter(x => / ft$/.test(x));
    const out = is([kinds, sum, $$('.pp-livecanvas .dead-label input', doc).length, /class="gap-warn"/.test(html)], [['stacked 576PX3.00FT', 'one line 1200PX6.25FT'], ['576 px / 3.00 ft', '1200 px / 6.25 ft'], 0, false],
      'printed read-outs / Modifiers summary lines / number boxes left in print / large-gap mark in print');
    dsAdv('dead', was); back(); await restore(); return out;
  });


  // ── blend-arrows (owner 2026-09-21): the on-canvas ◀ ▶ of a BLENDED group sit on the group's OUTER edges ─────────────────────
  //    WHERE THIS BLOCK GOES: tests/flows_probe.js, in the Simple section, straight BEFORE the line
  //        "  // ── Video Presets, Advanced ───…"
  //    (it needs no media file; the third check opens the Advanced page itself and closes it again).
  //    It is self-contained: it uses only the probe's own helpers ($, $$, vis, is, wait, check, okDialogs, restore) and its own _ba* helpers.
  //    Every check puts back what it changes, in a finally block so a throw cannot leak into the next check: the Blend Zones switch, the pick,
  //    the Advanced page and the show (restore()).
  //    All three FAIL on build 16kq (an arrow sits over the blend zone) and PASS with patch.py applied.
  const _baScope = () => (fsPresetId ? '#fs-canvas' : '#canvas-area');
  const _baBox = (pid, sid) => $(_baScope() + ' .screen-box[data-pid="' + pid + '"][data-sid="' + sid + '"]');
  const _baPick = async (pid, sid) => { hideMoveSymbol(); doSelect(null, null); selLayer = null; await wait(120); _baBox(pid, sid).click(); await wait(300); };
  const _baBlend = on => { const isOn = !document.body.classList.contains('adv-hide-blend'); if (isOn !== on) toggleAdvFeature('blend'); };
  const _baTidy = async wasB => { try { hideMoveSymbol(); doSelect(null, null); if (fsPresetId) { closeFullscreen(); await wait(400); } } catch (e) {} _baBlend(wasB); await restore(); };
  const _baPress = async glyph => { const b = $$('.move-symbol button').find(x => x.textContent === glyph); if (!b || b.style.pointerEvents === 'none') return false; b.click(); await wait(450); return true; };
  // One word per arrow that does not depend on the zoom: glyph, on / grey, WHICH destination's outer edge it hugs (D1 = ids[0] …),
  // OVER-BLEND when it lies over a drawn blend zone, COVERED when a live arrow is not the top element at its own centre,
  // TIP? when its tooltip is not what _lbMoveTip gives for the picked destination.
  const _baRead = (pid, sid, ids) => {
    const R = el => el.getBoundingClientRect(), k = fsPresetId ? fsZoom : 1, near = (a, b) => Math.abs(a - b) <= 14 * k;
    const zones = $$(_baScope() + ' .overlap-vis[data-pid="' + pid + '"]').filter(vis).map(R);
    return $$('.move-symbol button').map(b => {
      const r = R(b), live = b.style.pointerEvents !== 'none', dir = b.textContent === '◀' ? 'left' : b.textContent === '▶' ? 'right' : b.textContent;
      const hug = ids.map((id, i) => { const x = R(_baBox(pid, id)); return (dir === 'left' ? near(r.left, x.left) : near(r.right, x.right)) ? 'D' + (i + 1) : ''; }).filter(Boolean).join('/');
      const over = zones.some(z => r.left < z.right && r.right > z.left && r.top < z.bottom && r.bottom > z.top);
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return b.textContent + (live ? 'on' : 'grey') + '@' + (hug || 'none') + (over ? ' OVER-BLEND' : '') + (live && top !== b ? ' COVERED' : '') + (b.title === _lbMoveTip(pid, sid, dir, live) ? '' : ' TIP?');
    }).join(' ');
  };
  await check('move arrows: on a blended pair the ◀ sits on the far left of the left member and the ▶ on the far right of the right member, whichever member is picked; no arrow lies over the blend zone, nothing covers a live arrow, and a press still moves the pair one slot in one undo step', async () => {
    await restore(); const wasB = !document.body.classList.contains('adv-hide-blend'); try { _baBlend(true); const ids = screens.map(s => s.id), [a, b, c] = ids, pid = presets[0].id;
    presets.forEach(p => { initStripPositions(p.id); setPosition(p, b, 1720, 0); }); render(); await wait(350); const zone = $$('#canvas-area .overlap-vis[data-pid="' + pid + '"]').filter(vis).length;
    await _baPick(pid, a); const fromLeft = _baRead(pid, a, ids); await _baPick(pid, b); const fromRight = _baRead(pid, b, ids);
    await _baPick(pid, c); const alone = _baRead(pid, c, ids) + ' ' + $$('.move-symbol button').map(x => [x.style.left, x.style.right, x.style.top].join('|')).join(' ');
    await _baPick(pid, b); const u0 = _undoStack.length; const pressed = await _baPress('▶'); const q = presets[0].positions; const moved = [pressed, [q[c].x, q[a].x, q[b].x], _undoStack.length - u0, _baRead(pid, b, ids)];
    doUndo(); await wait(400); const q0 = presets[0].positions; const back = [q0[a].x, q0[b].x, q0[c].x];
    return is([zone, fromLeft, fromRight, alone, moved, back], [1, '◀grey@D1 ▶on@D2', '◀grey@D1 ▶on@D2', '◀on@D3 ▶grey@D3 6px||50% |6px|50%', [true, [0, 2120, 3840], 1, '◀on@D1 ▶grey@D2'], [0, 1720, 3840]],
      'blend zones drawn / picked the LEFT member / picked the RIGHT member / a destination that is not blended (arrows + their left|right|top styles) / after ▶ [pressed, x of D3 D1 D2, undo steps, arrows] / x after Undo');
    } finally { await _baTidy(wasB); }
  });
  await check('move arrows: three blended destinations keep ◀ ▶ on the outer edges from every member (never over either blend zone) and a press moves all three as one block past a fourth destination', async () => {
    await restore(); const wasB = !document.body.classList.contains('adv-hide-blend'); try { _baBlend(true);
    actions.addDestination(); await wait(350); if (!vis($('#modal'))) return 'the Add Destination window did not open';
    $('#ms-n').value = 'FOURTH'; $('#ms-w').value = '1920'; $('#ms-h').value = '1080'; confirmScreen(); await wait(450); okDialogs(); await wait(200);
    const ids = screens.map(s => s.id), [a, b, c, d] = ids, pid = presets[0].id; if (ids.length !== 4) return 'the fourth destination was not added';
    presets.forEach(p => { initStripPositions(p.id); setPosition(p, a, 0, 0); setPosition(p, b, 1720, 0); setPosition(p, c, 3440, 0); setPosition(p, d, 5360, 0); }); render(); await wait(400);
    const zones = $$('#canvas-area .overlap-vis[data-pid="' + pid + '"]').filter(vis).length, ov0 = presets.map(p => _overlapPairsForPreset(p).size).join(','); const seen = [];
    for (const id of [a, b, c]) { await _baPick(pid, id); seen.push(_baRead(pid, id, ids)); }
    await _baPick(pid, d); const fourth = _baRead(pid, d, ids);
    await _baPick(pid, b); const u0 = _undoStack.length; const pressed = await _baPress('▶'); const q = presets[0].positions;
    const moved = [pressed, [q[d].x, q[a].x, q[b].x, q[c].x], _undoStack.length - u0, presets.map(p => _overlapPairsForPreset(p).size).join(',') === ov0, _baRead(pid, b, ids)];
    return is([zones, seen, fourth, moved], [2, ['◀grey@D1 ▶on@D3', '◀grey@D1 ▶on@D3', '◀grey@D1 ▶on@D3'], '◀on@D4 ▶grey@D4', [true, [0, 1920, 3640, 5360], 1, true, '◀on@D1 ▶grey@D3']],
      'blend zones drawn / arrows with D1, D2, D3 picked / the fourth destination (not blended) / after ▶ from the middle member [pressed, x of D4 D1 D2 D3, undo steps, blends kept, arrows]');
    } finally { await _baTidy(wasB); }
  });
  await check('move arrows: on the Advanced page a blended pair has the same outer-edge ◀ ▶ at two zoom levels, only ◀ ▶ are drawn, nothing covers the live arrow and a press moves the pair', async () => {
    await restore(); const wasB = !document.body.classList.contains('adv-hide-blend'); try { _baBlend(true); const ids = screens.map(s => s.id), [a, b, c] = ids, pid = presets[0].id;
    presets.forEach(p => { initStripPositions(p.id); setPosition(p, b, 1720, 0); }); render(); await wait(300); openFullscreen(pid); await wait(800); const out = [];
    const z1 = fsZoom; await _baPick(pid, a); out.push(_baRead(pid, a, ids), $$('.move-symbol button').length); await _baPick(pid, b); out.push(_baRead(pid, b, ids));
    fsZoomBy(-0.3); await wait(250); const z2 = fsZoom; await _baPick(pid, a); out.push(_baRead(pid, a, ids)); await _baPick(pid, b); out.push(_baRead(pid, b, ids));
    const u0 = _undoStack.length; const pressed = await _baPress('▶'); const q = presets[0].positions; out.push([pressed, [q[c].x, q[a].x, q[b].x], _undoStack.length - u0, _baRead(pid, b, ids)], Math.abs(z2 - z1) > 0.05);
    return is(out, ['◀grey@D1 ▶on@D2', 2, '◀grey@D1 ▶on@D2', '◀grey@D1 ▶on@D2', '◀grey@D1 ▶on@D2', [true, [0, 2120, 3840], 1, '◀on@D1 ▶grey@D2'], true],
      'first zoom: picked LEFT member, arrows drawn, picked RIGHT member / second zoom: LEFT, RIGHT / after ▶ [pressed, x of D3 D1 D2, undo steps, arrows] / the zoom really changed');
    } finally { await _baTidy(wasB); }
  });

  // ══ overlap-rule (2026-09-21, patch marker OVL-BLOCK-16kr) ═══════════════════════════════════════════════════════════
  // Owner rule: with Blend Zones OFF and Free Position OFF a new overlap is BLOCKED (everything back, one alert
  // "Destinations can't overlap"); with Free Position ON, or Blend Zones ON, the app asks "Create Blend Zone?" as before.
  //
  // This file has TWO parts. Paste each part where its header says.
  //   PART 1  NEW checks (2). Self-contained: their helpers start with obk and use nothing defined later in the file.
  //           INSERT in the Simple section, straight BEFORE the line
  //               // ── Video Presets, Advanced ───────────...
  //           (no media is needed and none is loaded; the modifier switches, the show and the selection are put back).
  //   PART 2  REPLACES: the corrected version of the SIX existing checks that the patch makes fail (found by running the
  //           real gate on the patched page: gate_repo_probe_on_new.log). Each one REPLACES, IN PLACE, the existing
  //           check named in the comment above it.
  //           - Five of them expected the question while every modifier is off. They live in the block that starts with
  //               // ── no-overlap guard (2026-09-21): INSERT in tests/flows_probe.js straight AFTER the check
  //             and keep using that block's helpers (ovlPairs, ovlAsked, ovlStrip, ovlTwoRows, ovlGeo, cvAdv, vpDrag);
  //             the two extra helpers (ovlBlocked, ovlShut) go straight after the line that defines ovlGeo.
  //             The sixth check of that block ('no overlap (existing behaviour, pinned): ...') is NOT touched: it still passes.
  //           - One sits in the Simple section ('Simple: Destination Properties Apply is one undo step ...'): its Apply
  //             types X = 40 on the first destination, which lands it 40 px on its neighbour; the old page asked and the
  //             check pressed "Add to blend" through okDialogs(). Its replacement is self-contained.
  // Every check below FAILS on build 16kq without patch.py and PASSES with it (proof: run_checks.mjs, results in
  // checks_old.json / checks_new.json; merged into a copy of the real probe and run through a copy of the real runner:
  // gate_merged_probe_on_new.log). The golden has to be regenerated on purpose after the merge: 6 names go, 8 arrive.

  // ── PART 1: NEW checks ─ INSERT straight BEFORE the line "// ── Video Presets, Advanced" ────────────────────────────
  const obkMods = (blend, free) => { const c = document.body.classList; const was = [!c.contains('adv-hide-blend'), c.contains('adv-free-position')]; if (was[0] !== blend) actions.toggleAdvFeature('blend'); if (was[1] !== free) actions.toggleAdvFeature('freePos'); closeAdvancedMenu(); return was; };
  const obkPairs = () => presets.map(p => [..._overlapPairsForPreset(p)].length).join(',');
  const obkStrip = async () => { presets.forEach(p => repackPositions(p.id)); render(); await wait(200); };
  const obkTitle = () => dlgOpen() ? (($('#dlg-box h3') || {}).textContent || '') : '';
  const obkShut = async () => { if (dlgOpen()) { ($('#dlg-cancel') || $('#dlg-confirm')).click(); await wait(400); } };   // Cancel on a question, OK on an alert: never "Add to blend"
  const obkTypeX = async (dx) => { const b = screens[1].id, x0 = presets[0].positions[b].x; openScreenPanel(fakeEv, presets[0].id, b); await wait(400); const pop = $('#screen-panel'); if (!pop) return false; $('#sp-x', pop).value = String(x0 + dx); $('#sp-apply', pop).click(); await wait(450); return true; };

  await check('no overlap rule: a typed X onto the neighbour is BLOCKED by one "Destinations can\'t overlap" alert while Blend Zones and Free Position are both off (the pair and the preset are named, nothing moves, no undo step, the unsaved marker does not change); it asks "Create Blend Zone?" with Free Position on, with Blend Zones on and with both on; the same on the Advanced page', async () => {
    const was = obkMods(false, false); const none = presets.map(() => 0).join(',');
    const matrix = async () => {
      const got = [];
      for (const [blend, free] of [[false, false], [false, true], [true, false], [true, true]]) {
        obkMods(blend, free); await obkStrip(); _recomputeDirty(); const b = screens[1].id, x0 = presets[0].positions[b].x, n = _undoStack.length, dirty = _isDirty;   // recompute first: opening Advanced can light the unsaved marker by itself a moment later
        if (!(await obkTypeX(-300))) { got.push('Destination Properties did not open'); continue; }
        const title = obkTitle(), text = dialogText(), buttons = $$('#dlg-box button').map(x => x.textContent.trim()).join(' / ');
        const moved = presets[0].positions[screens[1].id].x - x0;
        if (!blend && !free) { await wait(350); _recomputeDirty(); got.push([title, buttons, /LEFT LED . CENTER LED \(P01\)/.test(text) && /Nothing was changed/.test(text) && /turn on Blend Zones in Modifiers/.test(text), moved, obkPairs(), _undoStack.length - n, _isDirty === dirty]); await obkShut(); got.push([dlgOpen(), presets[0].positions[screens[1].id].x - x0, _undoStack.length - n]); }
        else { got.push([title, buttons, moved]); await obkShut(); got.push([presets[0].positions[screens[1].id].x - x0, obkPairs(), _undoStack.length - n]); }
      }
      return got;
    };
    const want = [["Destinations can't overlap", 'OK', true, 0, none, 0, true], [false, 0, 0], ['Create Blend Zone?', 'Cancel / Add to blend', -300], [0, none, 0], ['Create Blend Zone?', 'Cancel / Add to blend', -300], [0, none, 0], ['Create Blend Zone?', 'Cancel / Add to blend', -300], [0, none, 0]];
    const simple = await matrix(); openFullscreen(presets[0].id); await wait(700); const adv = await matrix(); closeFullscreen(); await wait(400);
    obkMods(was[0], was[1]); await restore();
    return is([simple, adv], [want, want], 'per page, per modifier pair (all off / Free Position / Blend Zones / both): [title, buttons, ...] then the state after the dialog was closed');
  });
  await check('no overlap rule: an arrow key held down on a destination that has a second row under it raises ONE alert, not a pile: the size goes back, OK changes nothing, no undo step is left, and a second guarded change made while the alert is still up is put back silently', async () => {
    const was = obkMods(false, false); await obkStrip(); const P = () => presets[0], A = () => screens[0], last = screens[screens.length - 1].id;
    setPosition(P(), last, 0, parseInt(A().h) + 40); render(); await wait(250);
    const geo = () => JSON.stringify([screens.map(s => [s.w, s.h]), presets.map(p => p.positions)]); const g0 = geo(), n = _undoStack.length; let opened = 0;
    const mo = new MutationObserver(() => { if ($('#dlg-overlay').classList.contains('show')) opened++; }); mo.observe($('#dlg-overlay'), { attributes: true, attributeFilter: ['class'] });
    const key = rep => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true, repeat: rep }));
    doSelect(P().id, A().id); selLayer = null; await wait(150);
    for (let i = 0; i < 12; i++) { key(i > 0); await wait(30); } await wait(400);
    const held = [obkTitle(), opened, geo() === g0];
    doSelect(P().id, A().id); selLayer = null; key(false); await wait(300);   // the selection is dropped by the put-back; pick it again and press once more UNDER the alert
    const under = [obkTitle(), opened, geo() === g0];
    await obkShut(); await wait(700); const after = [dlgOpen(), opened, geo() === g0, _undoStack.length - n]; mo.disconnect();
    await obkShut(); doSelect(null, null); obkMods(was[0], was[1]); await restore();
    return is([held, under, after], [["Destinations can't overlap", 1, true], ["Destinations can't overlap", 1, true], [false, 1, true, 0]], 'after 12 repeats [alert, times a dialog opened, everything back] / after one more press under the alert / after OK [dialog up, times opened, everything back, undo steps]');
  });


  // ── LOOKING IS NOT A CHANGE (patch unsaved-16kr, owner's decision 2026-09-21). INSERT the whole block in
  //    tests/flows_probe.js at the END of the Simple section: straight BEFORE the line
  //        "  // ── Video Presets, Advanced ──..."
  //    (not later: the Advanced section loads test media; these checks need none and never open Video Presets Advanced).
  //    Every check starts from restore() (the General Session example exactly as opened: no cable colours yet, Wire and
  //    I/O Patch Advanced page 1 not built yet), closes Wire / I/O Patch and ends on restore(). No modifier switch,
  //    _lfxLock or media is touched (the Look Book check puts window._pdfOpts back). All eight FAIL on build 16kq (looking
  //    lit Save) and pass with the patch.
  const _usMark = () => { _recomputeDirty(); return [eval('_isDirty'), $('#tb-dirty').closest('button').classList.contains('save-dirty')]; };
  const _usClean = [false, false], _usGold = [true, true];
  const _usHome = async () => { try { closeWireMode(); } catch (e) {} try { closeSystem(); } catch (e) {} await restore(); await wait(250); };
  const _usWireAdv = async () => { const b = $('#wire-overlay [onclick*="_wireSwitchToAdvanced()"]'); if (b) b.click(); await wait(400); okDialogs(); await wait(900); };

  await check('unsaved: the first look at Wire (random cable colours) leaves a clean show clean, and the colours stay in the show for the next save', async () => {
    await _usHome(); const before = _usMark(); const had = sources.filter(s => s && s.wireColor).length;
    $('#topbar-nav-wire').click(); await wait(900); const after = _usMark();
    const st = getProjectState(); const coloured = st.sources.length > 0 && st.sources.every(s => !!(s && s.wireColor)); const armed = !!eval('_autoSaveTimer');
    await _usHome(); return is([before, had, after, coloured, armed], [_usClean, 0, _usClean, true, true], 'before / colours before / after the first look / every source coloured in getProjectState / autosave armed');
  });
  await check('unsaved: Wire view settings (zoom, tool, folded panes, collapsed side panel) never light Save and are still written to the show file', async () => {
    await _usHome(); openWireMode(); await wait(800); _captureCleanBaseline(); _recomputeDirty();   /* a clean mark with Wire already open: this check is about the view settings alone */
    const press = async sel => { const b = $(sel); if (!b) throw new Error('no control: ' + sel); b.click(); await wait(200); };
    await press('#wire-overlay [onclick*="_wireZoomBy(0.1)"]'); await press('#wire-tool-hand'); await press('#wire-overlay [onclick*="_wireTogglePane(\'src\')"]');
    await press('.wire-rpane-hdr[data-rpane="info"]'); await press('#wire-overlay [onclick*="_wireTogglePanelCollapse(\'left\')"]'); await wait(500);
    const mark = _usMark(); const ws = JSON.parse(JSON.stringify(getProjectState())).wireSettings;
    const written = [ws.zoom, ws.tool, ws.panes.src, ws.rpanes.info, !!(ws.panelCollapse && ws.panelCollapse.left)];
    await _usHome(); return is([mark, written], [_usClean, [1.1, 'hand', false, false, true]], 'unsaved mark / what the show file would hold (zoom, tool, Sources pane, Info pane, left panel collapsed)');
  });
  await check('unsaved: the first look at Wire Advanced (page 1 built from Simple) and its page tabs leave the show clean, and so does Undo back past it', async () => {
    await _usHome(); openWireMode(); await wait(800); await _usWireAdv();
    const built = wireSettings.wireView === 'advanced' && wireAdvanced.routers.length === 1 && wireAdvanced.wires.length > 0; const a = _usMark();
    for (const p of ['p1', 'p2', 'p0']) { const t = $('#wire-overlay [onclick*="_wireSwitchPage(\'' + p + '\')"]'); if (!t) { await _usHome(); return 'no page tab ' + p; } t.click(); await wait(350); }
    const b = _usMark(); const st = getProjectState(); const inShow = !!st.wireAdvanced._pages[0].seed && st.wireAdvanced._activePageId === 'p0' && st.wireSettings.wireView === 'advanced';
    const marks = []; let n = eval('_undoStack').length; const steps = n; while (n-- > 0) { doUndo(); await wait(350); marks.push(_usMark()[0]); }
    await _usHome(); return is([built, a, b, inShow, steps > 0, marks.some(Boolean)], [true, _usClean, _usClean, true, true, false], 'page 1 built / mark after the first look / after the page tabs / page 1 + view in getProjectState / it recorded undo steps / any Undo lit Save');
  });
  await check('unsaved: I/O Patch Advanced (first look: page 1 built from Simple), its page tabs and the way back to Simple leave the show clean', async () => {
    await _usHome(); $('#topbar-nav-iop').click(); await wait(700); const open = _usMark();
    $('#sys-overlay [onclick*="_ioSetView(\'advanced\')"]').click(); await wait(900); okDialogs(); await wait(200);
    const built = ioAdvanced.view === 'advanced' && ioAdvanced.pages[0].dests.some(r => r && r.name === screens[0].name); const a = _usMark();
    const t2 = $('#sys-overlay [onclick*="_ioSetPage(1)"]'); if (!t2) { await _usHome(); return 'no page tab 2'; } t2.click(); await wait(350); const onPage2 = ioAdvanced.page;
    $('#sys-overlay [onclick*="_ioSetPage(0)"]').click(); await wait(350); $('#sys-overlay [onclick*="_ioSetView(\'simple\')"]').click(); await wait(500); const b = _usMark();
    const st = getProjectState(); const inShow = !!st.ioAdvanced.pages[0].seed && st.ioAdvanced.view === 'simple';
    doUndo(); await wait(350); doUndo(); await wait(350); const undone = _usMark();
    await _usHome(); return is([open, built, a, onPage2, b, inShow, undone], [_usClean, true, _usClean, 1, _usClean, true, _usClean], 'I/O open / page 1 built / mark after the first look / page 2 opened / mark back in Simple / page 1 in getProjectState / mark after Undo x2');
  });
  await check('unsaved: after the first looks a real edit still lights Save inside a second, looking again never clears it, and Undo returns to clean', async () => {
    await _usHome(); $('#topbar-nav-wire').click(); await wait(900); const looked = _usMark(); const c0 = sources[0].wireColor;
    const sh = $('#wire-sources-panel .wire-color-shuffle'); if (!sh) { await _usHome(); return 'no shuffle button on the first source card'; }
    sh.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1 })); sh.click(); window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, isPrimary: true }));
    await wait(900); const lit = [eval('_isDirty'), $('#tb-dirty').closest('button').classList.contains('save-dirty')]; const changed = sources[0].wireColor !== c0;   /* no forced re-check: the app has to notice by itself */
    $('#topbar-nav-iop').click(); await wait(600); $('#sys-overlay [onclick*="_ioSetView(\'advanced\')"]').click(); await wait(900); okDialogs(); const stillLit = _usMark();
    let n = eval('_undoStack').length; while (n-- > 0) { doUndo(); await wait(300); } await wait(400); const back = _usMark();
    await _usHome(); return is([looked, changed, lit, stillLit, back], [_usClean, true, _usGold, _usGold, _usClean], 'mark after the first look / colour changed / mark 0.9 s after the pick / mark after looking at I/O Advanced / mark after Undo');
  });
  await check('unsaved: a real change made in the very same tick as a first look is never hidden, whichever comes first', async () => {
    await _usHome(); openWireMode(); await wait(900); const lookOnly = _usMark(); await _usHome();
    setScreenName(presets[0].id, screens[0].id, 'TICK A'); openWireMode(); await wait(900); const editThenLook = _usMark(); await _usHome();
    openWireMode(); setScreenName(presets[0].id, screens[0].id, 'TICK B'); await wait(900); const lookThenEdit = _usMark(); await _usHome();
    openSystem(); await wait(500); (sources[0] || {}).notes = 'typed in the same tick'; _ioSetView('advanced'); await wait(900); const editInsideSwitch = _usMark();
    await _usHome(); return is([lookOnly, editThenLook[0], lookThenEdit[0], editInsideSwitch[0]], [_usClean, true, true, true], 'look only / edit then look / look then edit / edit right before the I/O view switch');
  });
  await check('unsaved: New after only looking asks the plain question; after a real edit it warns about unsaved changes', async () => {
    await _usHome(); openWireMode(); await wait(800); await _usWireAdv(); closeWireMode(); openSystem(); await wait(400); _ioSetView('advanced'); await wait(800); okDialogs(); closeSystem(); await wait(300);
    newShow(); await wait(450); const q1 = dialogText(); if (dlgOpen()) $('#dlg-cancel').click(); await wait(300);
    pushUndo(); setL(presets[0].id, screens[0].id, 4, 'TIMER'); scheduleRender(); await wait(300);
    newShow(); await wait(450); const q2 = dialogText(); if (dlgOpen()) $('#dlg-cancel').click(); await wait(300);
    const kept = presets.length > 0; await _usHome();
    return is([/unsaved/i.test(q1), /start a new show/i.test(q1), /unsaved/i.test(q2), kept], [false, true, true, true], '"unsaved" asked after looking / plain question asked / "unsaved" asked after an edit / the show is still open');
  });
  await check('unsaved: a Look Book with a wire sheet (Advanced, then Simple) and the Wire export window leave a clean show clean', async () => {
    await _usHome(); const keep = window._pdfOpts;
    const lookBook = async view => { openPdfExportModal(); await wait(350); const rb = $('#pdf-opt-wire-view-' + view); if (rb) rb.checked = true; const real = exportPDF; let html = ''; window.exportPDF = function () { html = real(true); }; try { _pdfConfirmExport(); } finally { window.exportPDF = real; } await wait(400); return /id="pdf-wire"/.test(html || ''); };
    let out;
    try {
      const adv = await lookBook('advanced'); const a = _usMark(); await _usHome();
      const sim = await lookBook('simple'); const b = _usMark(); const coloured = sources.length > 0 && sources.every(s => !!(s && s.wireColor)); await _usHome();
      openWireMode(); await wait(700); openWireExportModal(); await wait(300); const sheet = getProjectState().wireSettings.sheet; closeWireExportModal(); await wait(300); const c = _usMark();
      out = is([adv, a, sim, b, coloured, sheet, c], [true, _usClean, true, _usClean, true, 'letter', _usClean], 'Advanced wire sheet made / mark / Simple wire sheet made / mark / the export gave the sources their colours / default sheet written / mark after the Wire export window');
    } finally { window._pdfOpts = keep; }
    await _usHome(); return out;
  });

  // ── LOOKING IS NOT A CHANGE, second pass (patch unsaved-16kr2). INSERT the whole block in tests/flows_probe.js straight
  //    AFTER the first patch's block (flows_checks.js of patch unsaved-16kr) and BEFORE the line
  //        "  // ── Video Presets, Advanced ──..."
  //    It stands alone too (own helper names). Every check starts and ends on restore() (the General Session example as
  //    opened), closes Wire / I/O Patch / Video Presets Advanced, touches no modifier switch and no _lfxLock. The media
  //    check makes ONE silent clip on a canvas, never plays it and removes it again; the launch check opens the page in
  //    an invisible frame and removes it; window._pdfOpts and the autosave draft are put back.
  //    All ten FAIL on the merged r16kr page (first patch only) and pass with patch2.
  const _u2Gold = () => { const raw = !!eval('_isDirty'); _recomputeDirty(); return raw || !!eval('_isDirty') || $('#tb-dirty').closest('button').classList.contains('save-dirty'); };
  const _u2Home = async () => { try { _ioBackupClose(); } catch (e) {} try { closeWireExportModal(); } catch (e) {} try { closePdfExportModal(); } catch (e) {} try { closeHelp(); } catch (e) {} try { closeQS(); } catch (e) {} try { if (eval('fsPresetId') !== null) closeFullscreen(); } catch (e) {} try { closeWireMode(); } catch (e) {} try { closeSystem(); } catch (e) {} await restore(); await wait(200); };
  const _u2AsSaved = async st => { _applyProjectText(typeof st === 'string' ? st : JSON.stringify(st)); await wait(700); okDialogs(); await wait(150); okDialogs(); };   /* what Load runs with the text of a saved file */
  const _u2Saved = () => { _captureCleanBaseline(); eval('_isDirty=false'); _updateDirtyIndicator(); };   /* what Save does once the file is written */
  const _u2Answer = () => { for (let i = 0; i < 4 && dlgOpen(); i++) { const keep = /changed since/i.test(dialogText()); const b = $(keep ? '#dlg-cancel' : '#dlg-confirm'); if (b) b.click(); else break; } };   /* "Rebuild from Simple?" is answered "Keep my page": rebuilding would be a real choice */
  const _u2WireAdv = async () => { const b = $('#wire-overlay [onclick*="_wireSwitchToAdvanced()"]'); if (b) b.click(); await wait(450); _u2Answer(); await wait(800); _u2Answer(); };
  const _u2IoAdv = async () => { const b = $('#sys-overlay [onclick*="_ioSetView(\'advanced\')"]'); if (b) b.click(); await wait(600); _u2Answer(); await wait(200); };
  const _u2Rename = (to) => { const inp = $('#table-panel input[title^="Destination name"]'); if (!inp) throw new Error('no destination name field in the table'); inp.value = to; fire(inp, 'blur'); };   /* the table field commits on blur */
  const _u2Cell = nm => { for (const r of (wireAdvanced.routers || [])) for (const c of (r.outputs || [])) if (c && c.name === nm) return true; return false; };

  await check('unsaved 2: a saved show with PBP A / GFX A content stays clean when I/O Patch opens (the automatic B twin), and the twin waits in the show for the next save', async () => {
    await _u2Home(); setL(presets[0].id, screens[0].id, 1, 'PBP A'); setL(presets[0].id, screens[0].id, 2, 'GFX A'); await _u2AsSaved(getProjectState()); const opened = _u2Gold();
    clearTimeout(eval('_autoSaveTimer')); eval('_autoSaveTimer=null'); $('#topbar-nav-iop').click(); await wait(700); const looked = _u2Gold();
    const twins = ['PBP B', 'GFX B'].map(n => getProjectState().sources.some(s => s && s.name === n && !!s.autoB)); const armed = !!eval('_autoSaveTimer');
    await _u2Home(); return is([opened, looked, twins, armed], [false, false, [true, true], true], 'gold when opened / gold after ONE look at I/O Patch / PBP B and GFX B in getProjectState / autosave armed');
  });
  await check('unsaved 2: after a look at Wire, I/O Patch copies GFX B into the content library without lighting Save', async () => {
    await _u2Home(); setL(presets[0].id, screens[0].id, 1, 'GFX B'); await _u2AsSaved(getProjectState());
    $('#topbar-nav-wire').click(); await wait(800); const afterWire = _u2Gold(); $('#topbar-nav-iop').click(); await wait(700); const afterIo = _u2Gold();
    const inLib = getProjectState().customLibrary.some(c => c && c.l === 'GFX B');
    await _u2Home(); return is([afterWire, afterIo, inLib], [false, false, true], 'gold after Wire / gold after I/O Patch / GFX B in the library of getProjectState');
  });
  await check('unsaved 2: straight after launch the blank show has its MV 1 before any look, and the first look at I/O Patch leaves it clean', async () => {
    await _u2Home(); const KEY = eval('_AUTO_SAVE_KEY'); const draft = localStorage.getItem(KEY); localStorage.removeItem(KEY);
    const f = document.createElement('iframe'); f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;left:0;top:0;width:1440px;height:900px;border:0;opacity:0;pointer-events:none;z-index:-1';
    f.src = location.pathname + '?u2launch=' + Date.now(); document.body.appendChild(f); let out;
    try {
      let up = false; for (let i = 0; i < 80 && !up; i++) { await wait(250); try { up = f.contentDocument.readyState === 'complete' && typeof f.contentWindow.lbOpenExample === 'function' && f.contentWindow.eval('_savedState') !== null; } catch (e) {} }
      if (!up) out = 'the page did not start inside the frame';
      else {
        const w = f.contentWindow, d = f.contentDocument; await wait(400);
        const o = d.getElementById('dlg-overlay'); if (o && o.classList.contains('show')) { const c = d.getElementById('dlg-cancel'); if (c) c.click(); await wait(300); }   /* "Start fresh" if a draft slipped in */
        try { w.closeQS(); } catch (e) {}
        const mark = () => { const raw = !!w.eval('_isDirty'); w._recomputeDirty(); return raw || !!w.eval('_isDirty'); };
        const atLaunch = w.eval('multiviewers.map(function(m){ return m.name; })'); const blank = w.eval('screens.length+presets.length'); const g0 = mark();
        d.getElementById('topbar-nav-iop').click(); await wait(700); const g1 = mark(); const after = w.eval('multiviewers.map(function(m){ return m.name; })');
        out = is([blank, atLaunch, g0, g1, after], [0, ['MV 1'], false, false, ['MV 1']], 'destinations + presets at launch / multiviewers at launch / gold at launch / gold after ONE look at I/O Patch / multiviewers after it');
      }
    } finally { f.remove(); if (draft !== null) localStorage.setItem(KEY, draft); else localStorage.removeItem(KEY); }
    await _u2Home(); return out;
  });
  await check('unsaved 2: a show WITHOUT a multiviewer (the launch state of older builds) stays clean when I/O Patch puts MV 1 back', async () => {
    await _u2Home(); await _u2AsSaved(getProjectState()); multiviewers.length = 0; _u2Saved(); const before = _u2Gold();
    $('#topbar-nav-iop').click(); await wait(700); const after = _u2Gold(); const names = multiviewers.map(m => m.name);
    await _u2Home(); return is([before, after, names], [false, false, ['MV 1']], 'gold before / gold after ONE look at I/O Patch / multiviewers');
  });
  await check('unsaved 2: a destination renamed and saved stays clean when Wire Advanced is looked at; the switcher cell follows the rename in the same undo step', async () => {
    await _u2Home(); openWireMode(); await wait(700); await _u2WireAdv(); closeWireMode(); await wait(250); const old = screens[0].name; const had = _u2Cell(old); const looked = _u2Gold();
    _u2Rename('U2 RENAMED'); await wait(450); const lit = _u2Gold(); const follows = [screens[0].name, _u2Cell('U2 RENAMED'), _u2Cell(old)];
    _u2Saved(); $('#topbar-nav-wire').click(); await wait(500); _u2Answer(); await wait(600); const afterLook = _u2Gold(); closeWireMode(); await wait(200);
    doUndo(); await wait(400); const undone = [screens[0].name, _u2Cell(old), _u2Cell('U2 RENAMED')];
    await _u2Home(); return is([had, looked, lit, follows, afterLook, undone], [true, false, true, ['U2 RENAMED', true, false], false, [old, true, false]], 'a switcher cell showed the old name / gold after the first look / gold after the rename / name, new cell, old cell right after the rename / gold after Save + ONE look at Wire / name, old cell, new cell after ONE Undo');
  });
  await check('unsaved 2: a destination renamed and saved stays clean when I/O Patch Advanced is looked at, and the old name does not come back as an I/O-only destination', async () => {
    await _u2Home(); openSystem(); await wait(500); await _u2IoAdv(); closeSystem(); await wait(250); const old = screens[0].name; const n0 = ioDests.length; const looked = _u2Gold();
    _u2Rename('U2 RENAMED'); await wait(450); const lit = _u2Gold(); _u2Saved();
    $('#topbar-nav-iop').click(); await wait(600); _u2Answer(); await wait(300); const afterLook = _u2Gold();
    const rows = ioAdvanced.pages[0].dests.map(r => r && r.name); const out = is([looked, lit, afterLook, ioDests.length - n0, ioDests.some(d => d && d.name === old), rows.indexOf('U2 RENAMED') >= 0, rows.indexOf(old) >= 0], [false, true, false, 0, false, true, false], 'gold after the first look / gold after the rename / gold after Save + ONE look at I/O Patch Advanced / I/O-only destinations added / the old name came back / page 1 shows the new name / page 1 still shows the old name');
    await _u2Home(); return out;
  });
  await check('unsaved 2: a show file from an older build (stale switcher cell, unsettled cells, a dead cable, duplicate custom source names) stays clean through Wire Advanced and I/O Patch Advanced', async () => {
    await _u2Home(); openWireMode(); await wait(700); await _u2WireAdv(); closeWireMode(); openSystem(); await wait(500); await _u2IoAdv(); closeSystem(); await wait(200);
    const st = JSON.parse(JSON.stringify(getProjectState())); st.screens[0].name = 'U2 OLD BUILD';
    (st.wireAdvanced.routers || []).forEach(r => (r.inputs || []).concat(r.outputs || []).forEach(c => { if (c) { delete c.wireId; delete c.ptAuto; delete c.pt; } }));   /* cells an older build never settled (their auto mark is kept, so the name still follows) */
    st.wireAdvanced.customSources = [{ id: 'u2a', name: 'U2 Spare' }, { id: 'u2b', name: 'U2 Spare' }]; st.wireAdvanced.wires.push({ id: 'u2dead', fromId: 'asrc:u2gone', toId: 'adst:u2gone' });
    await _u2AsSaved(st); const opened = _u2Gold(); const gold = [];
    $('#topbar-nav-wire').click(); await wait(500); _u2Answer(); await wait(500); _u2Answer(); gold.push(_u2Gold());
    for (const p of ['p1', 'p0']) { const t = $('#wire-overlay [onclick*="_wireSwitchPage(\'' + p + '\')"]'); if (t) t.click(); await wait(350); _u2Answer(); gold.push(_u2Gold()); }
    $('#topbar-nav-iop').click(); await wait(600); _u2Answer(); await wait(200); gold.push(_u2Gold());
    const repaired = [_u2Cell('U2 OLD BUILD'), wireAdvanced.wires.some(w => w.id === 'u2dead'), wireAdvanced.customSources.map(c => c.name).join('|')];
    await _u2Home(); return is([opened, gold, repaired], [false, [false, false, false, false], [true, false, 'U2 Spare|U2 Spare 2']], 'gold when opened / gold after Wire, page tab 2, page tab 1, I/O Patch / cell follows, dead cable still there, custom source names');
  });
  await check('unsaved 2: opening the Backup window (it pairs "X A" / "X B" rows by itself) leaves a saved show clean, and a pair set by hand still lights Save', async () => {
    await _u2Home(); openSystem(); await wait(500); await _u2IoAdv(); _ioSetPage(1); await wait(250);
    const pg = ioAdvanced.pages[1]; const a = _ioAdvBlank('src'), b = _ioAdvBlank('src'), c = _ioAdvBlank('src'); a.name = 'U2 CAM A'; b.name = 'U2 CAM B'; c.name = 'U2 SPARE'; pg.sources = [a, b, c]; _sysRender(); await wait(250); _u2Saved();
    const icon = $$('#io-adv .sys-bk-btn').find(vis); if (!icon) { await _u2Home(); return 'no backup icon on the page'; } icon.click(); await wait(450);
    const opened = _u2Gold(); const paired = b.backupOf === a.id;
    _ioBkPick('bk-primary', a.id); _ioBkPick('bk-backup', c.id); await wait(150); const pb = $('#sys-bk-overlay [onclick="_ioBkCommit()"]'); if (pb) pb.click(); await wait(250);
    eval('_isDirty=false'); _recomputeDirty(); const byHand = [c.backupOf === a.id, !!eval('_isDirty')];   /* the Pair button; the exact comparison alone has to find the change */
    await _u2Home(); return is([opened, paired, byHand], [false, true, [true, true]], 'gold after opening the window / it paired A and B by itself / a pair set with the Pair button: made, and found by the exact comparison');
  });
  await check('unsaved 2: an older show whose clip lacks its codec info is opened: the info is filled in a moment later and Save stays clean', async () => {
    await _u2Home(); let clip = false;
    try {
      const c2 = document.createElement('canvas'); c2.width = 320; c2.height = 180; const g3 = c2.getContext('2d'); g3.fillStyle = '#10131a'; g3.fillRect(0, 0, 320, 180);
      const rec = new MediaRecorder(c2.captureStream(30), { mimeType: 'video/webm' }); const chunks = []; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.start(100); const iv = setInterval(() => { g3.fillStyle = '#2dd4bf'; g3.fillRect(Math.random() * 200, 40, 60, 80); }, 40); await wait(600); clearInterval(iv); rec.stop(); await new Promise(r => rec.onstop = r);
      _fsAttachBlob('U2 OLD CLIP', new Blob(chunks, { type: 'video/webm' })); clip = chunks.length > 0;
      const st = JSON.parse(JSON.stringify(getProjectState())); st.customLibrary.push({ l: 'U2 OLD CLIP', kind: 'video', c: '#334455', img: c2.toDataURL('image/jpeg', .5), media: { w: 320, h: 180, dur: .6, fps: 30, type: 'video/webm', fileName: 'u2_old_clip.webm' } });
      await _u2AsSaved(st); await wait(1600);
    } catch (e) { clip = false; }
    const it = customLibrary.find(x => x && x.l === 'U2 OLD CLIP'); const filled = !!(it && it.media && it.media.vcodec !== undefined && it.media.bitDepth !== undefined); const gold = _u2Gold();
    try { const u = eval('_fsMediaURL'), bl = eval('_fsMediaBlob'); if (u['U2 OLD CLIP']) URL.revokeObjectURL(u['U2 OLD CLIP']); delete u['U2 OLD CLIP']; delete bl['U2 OLD CLIP']; } catch (e) {}
    $$('video').forEach(v => { try { v.muted = true; v.pause(); } catch (e) {} });
    await _u2Home(); return is([clip, filled, gold], [true, true, false], 'silent test clip made / codec info filled in by the load / gold without a click');
  });
  await check('unsaved 2: visiting everything (every tool, view, page tab and window) on all three examples stays clean, as shipped and with GFX A / GFX B / PBP A / PBP B saved into them', async () => {
    await _u2Home(); const keep = window._pdfOpts; const lit = []; let steps = 0;
    const visit = async (tag) => {
      const at = async (label, fn, ms) => { try { await fn(); } catch (e) { lit.push(tag + ': ' + label + ' COULD NOT: ' + String((e && e.message) || e).slice(0, 60)); return; } await wait(ms || 220); _u2Answer(); steps++; if (_u2Gold()) { lit.push(tag + ': ' + label); _u2Saved(); } };   /* after a hit the mark is cleared so every later step is judged on its own */
      const press = sel => { const b = $$(sel).find(vis) || $(sel); if (!b) throw new Error('no control ' + sel); b.click(); };
      await at('opened', async () => {});
      await at('Video Presets Advanced', () => press('[onclick*="_vpSetView(\'advanced\')"]'), 700);
      await at('Display output note, cancelled', async () => { press('#fs-display-btn'); await wait(300); if (dlgOpen()) $('#dlg-cancel').click(); });
      await at('Video Presets Simple', () => press('[onclick*="_vpSetView(\'simple\')"]'), 400);
      await at('Wire', () => press('#topbar-nav-wire'), 700);
      await at('Wire export window, cancelled', async () => { openWireExportModal(); await wait(200); closeWireExportModal(); });
      await at('Wire Advanced', () => _u2WireAdv());
      for (const p of (wireAdvanced._pages || []).map(x => x.id).slice(1).concat(['p0'])) await at('Wire page tab ' + p, () => press('#wire-overlay [onclick*="_wireSwitchPage(\'' + p + '\')"]'), 300);
      await at('Wire Simple', () => press('#wire-overlay [onclick*="_wireSwitchToSimple()"]'), 400);
      await at('I/O Patch', () => press('#topbar-nav-iop'), 600);
      await at('I/O Patch Advanced', () => _u2IoAdv());
      for (const i of ioAdvanced.pages.map((x, k) => k).slice(1).concat([0])) await at('I/O page tab ' + (i + 1), () => press('#sys-overlay [onclick*="_ioSetPage(' + i + ')"]'));
      await at('Backup window, closed', async () => { const b = $$('#io-adv .sys-bk-btn:not(.off)').find(vis); if (b) { b.click(); await wait(250); _ioBackupClose(); } });
      await at('I/O Patch Simple', () => press('#sys-overlay [onclick*="_ioSetView(\'simple\')"]'), 400);
      await at('Wire again', () => press('#topbar-nav-wire'), 600);
      await at('I/O Patch again', () => press('#topbar-nav-iop'), 600);
      await at('Video Presets', () => press('#topbar-nav-vp'), 400);
      await at('Help, closed', async () => { openHelp(); await wait(150); closeHelp(); });
      await at('Quick Setup, cancelled', async () => { openQS(); await wait(200); $('#qs-cancel-btn').click(); });
      for (const tick of [true, false]) await at('Look Book window, wire sheet ' + (tick ? 'ticked' : 'not ticked') + ', cancelled', async () => { openPdfExportModal(); await wait(250); const cb = $('#pdf-opt-wire'); if (cb && cb.checked !== tick) cb.click(); await wait(100); closePdfExportModal(); });
      for (const view of ['simple', 'advanced']) await at('Look Book built with the ' + view + ' wire sheet', async () => { openPdfExportModal(); await wait(250); const cb = $('#pdf-opt-wire'); if (cb && !cb.checked) cb.click(); const rb = $('#pdf-opt-wire-view-' + view); if (rb) rb.checked = true; const real = exportPDF; window.exportPDF = function () { real(true); }; try { _pdfConfirmExport(); } finally { window.exportPDF = real; } }, 400);
      await at('Excel pre-export check, closed', async () => { actions.exportExcel(); await wait(300); const p = $('#validation-panel'); if (p && getComputedStyle(p).display !== 'none') { const c = $('#validation-panel .pm-btn-cancel'); if (c) c.click(); } });
    };
    try {
      for (const ex of eval('_LB_EXAMPLES')) {
        await _u2AsSaved(ex.state); await visit(ex.id + ' as shipped'); await _u2Home();
        await _u2AsSaved(ex.state); ['GFX A', 'GFX B', 'PBP A', 'PBP B'].forEach((c, i) => setL(presets[0].id, screens[0].id, i + 1, c)); await _u2AsSaved(getProjectState()); await visit(ex.id + ' + common content'); await _u2Home();
      }
    } finally { window._pdfOpts = keep; }
    await _u2Home(); return is([steps > 150, lit], [true, []], 'enough steps were really taken / the steps that lit Save');
  });

  // ── 16kr merge fixes (attacker findings, 2026-09-22). Goes AFTER the blend-arrows, dead-space and overlap-rule blocks (it uses _ba*, dsDefaultPPI and ovlShut-style helpers of its own).
  //    All three FAIL on build 16kq and on the un-fixed builder patches, and PASS on the merged page. Each puts back what it touches.
  await check('move arrows: a blended destination that is REMOVED FROM THIS PRESET and picked from its table row still shows the live ▶ on the outer edge of its partner, nothing covers it, and a press moves the pair', async () => {
    await restore(); const wasB = !document.body.classList.contains('adv-hide-blend'); try { _baBlend(true); const ids = screens.map(s => s.id), [a, b, c] = ids, pid = presets[0].id;
    presets.forEach(p => { initStripPositions(p.id); setPosition(p, b, 1720, 0); }); const p0 = presets[0]; p0.hiddenScreens = p0.hiddenScreens || {}; p0.hiddenScreens[a] = true; render(); await wait(400);
    const ghost = !!$('#canvas-area .screen-box.screen-hidden[data-pid="' + pid + '"][data-sid="' + a + '"]');
    hideMoveSymbol(); doSelect(null, null); await wait(120);
    const row = $('#table-panel tr[data-pid="' + pid + '"][data-sid="' + a + '"]'); if (!row) return 'no table row for the hidden destination';
    const td = [...row.children].find(x => !x.getAttribute('onclick') && !x.querySelector('[draggable="true"]')) || row; td.click(); await wait(400);
    const picked = !!sel && sel.sid === a, seen = _baRead(pid, a, ids);
    const pressed = await _baPress('▶'); const q = presets[0].positions; const moved = [pressed, [q[c].x, q[a].x, q[b].x]];
    return is([ghost, picked, seen, moved], [true, true, '◀grey@D1 ▶on@D2', [true, [0, 2120, 3840]]], 'drawn as a removed (dashed) box / picked from its row / arrows / after ▶ [pressed, x of D3 D1 D2]');
    } finally { await _baTidy(wasB); }
  });
  await check('Pixel-Feet: Help shows the value IN FORCE: with 96 PPI stored the field reads 96 and "1 ft = 1152 px" when Help is opened, with nothing stored it reads 16 and 192', async () => {
    const back = dsDefaultPPI(); await wait(120); const field = $('#a11y-ppi-input'), lbl = $('#a11y-px-per-ft');
    try { const s = _a11yLoad(); s.ppi = 96; _a11ySave(s); field.value = '16'; lbl.textContent = '192';   /* what the page holds right after a fresh load, before anything syncs it */
      _loadPPI(); openHelp(); await wait(250); const stored = [field.value, lbl.textContent, _pxPerFoot()]; closeHelp();
      localStorage.removeItem(_A11Y_KEY); _PPI = 16; _loadPPI(); openHelp(); await wait(250); const none = [field.value, lbl.textContent, _pxPerFoot()]; closeHelp();
      return is([stored, none], [['96', '1152', 1152], ['16', '192', 192]], 'with 96 stored [field, read-out, px per foot in force] / with nothing stored');
    } finally { try { closeHelp(); } catch (e) {} back(); await wait(150); }
  });
  await check('no overlap rule: a REFUSED change keeps the Redo history ("Nothing was changed" includes Redo): edit, Undo, then a typed X onto the neighbour is refused and Redo still brings the edit back', async () => {
    await restore(); const [a, b, c] = screens.map(s => s.id), pid = presets[0].id; try {
    pushUndo(); screens.find(s => s.id === c).name = 'REDO ME'; scheduleRender(); await wait(300); doUndo(); await wait(400); const redo0 = _redoStack.length;
    doSelect(pid, b); openScreenPanel(fakeEv, pid, b); await wait(500); const x = $('#sp-x'); if (!x) return 'Destination Properties did not open';
    x.value = '1620'; fire(x, 'input'); fire(x, 'change'); $('#sp-apply').click(); await wait(600);
    const said = []; for (let i = 0; i < 3 && dlgOpen(); i++) { const t = ($('#dlg-box h3') || {}).textContent || ''; said.push(t); (/Create Blend/.test(t) ? $('#dlg-cancel') : $('#dlg-confirm')).click(); await wait(450); }
    const xAfter = presets[0].positions[b].x, redo1 = _redoStack.length; doRedo(); await wait(400); const name = screens.find(s => s.id === c).name;
    return is([redo0, said[said.length - 1], xAfter, redo1, name], [1, "Destinations can't overlap", 1920, 1, 'REDO ME'], 'redo steps before / the last window shown / X after the refusal / redo steps after / the name after Redo');
    } finally { try { closeScreenPanel(); } catch (e) {} await restore(); }
  });

  // ── THE UNSAVED WARNING, third pass (patch unsaved-16ks3). INSERT the whole block in tests/flows_probe.js straight AFTER
  //    the second patch's block (flows_checks2.js of patch unsaved-16kr2) and BEFORE the line
  //        "  // ── Video Presets, Advanced ──..."
  //    It stands alone too (own helper names). Every check starts and ends on restore() (the General Session example as
  //    opened), closes Wire / I/O Patch / Video Presets Advanced, touches no modifier switch, no _lfxLock and no media.
  //    The Save checks stub the file picker / the download / the desktop bridge and put every one of them back; nothing
  //    leaves the page. All seven FAIL on the r16ks base4 page (first two unsaved patches only) and pass with patch3.
  const _u3Gold = () => { const raw = !!eval('_isDirty'); _recomputeDirty(); return raw || !!eval('_isDirty') || $('#tb-dirty').closest('button').classList.contains('save-dirty'); };
  const _u3Home = async () => { try { _ioBackupClose(); } catch (e) {} try { closeWireExportModal(); } catch (e) {} try { closePdfExportModal(); } catch (e) {} try { closeHelp(); } catch (e) {} try { closeQS(); } catch (e) {} try { if (eval('fsPresetId') !== null) closeFullscreen(); } catch (e) {} try { closeWireMode(); } catch (e) {} try { closeSystem(); } catch (e) {} await restore(); await wait(200); };
  const _u3AsSaved = async st => { _applyProjectText(typeof st === 'string' ? st : JSON.stringify(st)); await wait(700); okDialogs(); await wait(150); okDialogs(); };   /* what Load runs with the text of a saved file */
  const _u3Answer = () => { for (let i = 0; i < 4 && dlgOpen(); i++) { const keep = /changed since/i.test(dialogText()); const b = $(keep ? '#dlg-cancel' : '#dlg-confirm'); if (b) b.click(); else break; } };   /* "Rebuild from Simple?" is answered "Keep my page" */
  const _u3IoAdv = async () => { const b = $('#sys-overlay [onclick*="_ioSetView(\'advanced\')"]'); if (b) b.click(); await wait(600); _u3Answer(); await wait(200); };
  const _u3WireAdv = async () => { const b = $('#wire-overlay [onclick*="_wireSwitchToAdvanced()"]'); if (b) b.click(); await wait(450); _u3Answer(); await wait(800); _u3Answer(); };
  const _u3Rename = (to) => { const inp = $('#table-panel input[title^="Destination name"]'); if (!inp) throw new Error('no destination name field in the table'); inp.value = to; fire(inp, 'blur'); };   /* the table field commits on blur */
  const _u3Undo = () => eval('_undoStack.length');
  const _u3NewAsks = async () => { newShow(); await wait(450); const q = dialogText(); if (dlgOpen()) $('#dlg-cancel').click(); await wait(300); try { closeQS(); } catch (e) {} return /unsaved changes/i.test(q) ? 'unsaved' : (q ? 'plain' : 'none'); };
  /* click into a field and leave it, nothing typed: real focus + click + blur when the page has the focus, else the same events by hand */
  const _u3InOut = async el => {
    try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
    el.focus(); const real = document.activeElement === el; if (!real) { el.dispatchEvent(new FocusEvent('focus')); el.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); }
    await wait(15);
    if (real && document.activeElement === el) el.blur(); else { el.dispatchEvent(new FocusEvent('blur')); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); }
    await wait(25);
  };
  /* type into a field and leave it */
  const _u3Type = async (el, val) => { el.focus(); const real = document.activeElement === el; el.value = val; fire(el, 'input'); if (real) el.blur(); else { el.dispatchEvent(new FocusEvent('blur')); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); } await wait(25); };
  /* the show an owner's older file or a fresh Quick Setup show looks like: no AUX content object, a destination without a layer
     object, a custom machine type the file never "remembered", a blank venue, no I/O Patch Advanced block */
  const _u3OldShow = () => {
    const st = JSON.parse(BASE); const fl = firstLayer(); const nm = fl ? getL(fl.pid, fl.sid, 1) : null;
    st.presets.forEach(p => { delete p.dsmContent; }); const lastP = st.presets[st.presets.length - 1], lastS = st.screens[st.screens.length - 1]; if (lastP && lastS && lastP.layers) delete lastP.layers[lastS.id];
    st.sources = Array.isArray(st.sources) ? st.sources : []; let e = st.sources.find(s => s && s.name === nm); if (!e) { e = { name: nm }; st.sources.push(e); } e.type = 'Custom'; e.customType = 'U3 RIG';
    st.customTypes = { machines: [], devices: [] }; st.showVenue = ''; delete st.ioAdvanced;
    return { st, srcName: nm, lastP: lastP && lastP.id, lastS: lastS && lastS.id };
  };

  await check('unsaved 3: a show with no I/O Patch Advanced block (older files, launch, New): edit + Undo is the saved show again, a first look at I/O Patch Advanced + Undo too; fresh, copied and normalised pages have ONE shape', async () => {
    await _u3Home(); const st = JSON.parse(BASE); delete st.ioAdvanced; await _u3AsSaved(st); const opened = _u3Gold(); const old = screens[0].name;
    _u3Rename('U3 RENAMED'); await wait(450); const lit = _u3Gold(); doUndo(); await wait(650); const undone = [screens[0].name === old, _u3Gold()];
    doRedo(); await wait(450); const redone = _u3Gold(); doUndo(); await wait(650); const again = _u3Gold();
    await _u3AsSaved(st); $('#topbar-nav-iop').click(); await wait(600); await _u3IoAdv(); const looked = [_u3Gold(), _u3Undo() > 0];
    while (_u3Undo() > 0) { doUndo(); await wait(300); } await wait(400); const lookUndone = _u3Gold();
    const keys = o => Object.keys(o).join(','); const want = 'id,uid,name,seed,seedAsked,sources,dests,mvs';
    const fresh = keys(_ioAdvNewPage(1)), norm = keys(_ioAdvNorm({ pages: [{ name: 'x' }] }).pages[0]), dflt = _ioAdvDefault().pages.map(keys);
    await _u3AsSaved(st); openSystem(); await wait(400); await _u3IoAdv(); const n0 = ioAdvanced.pages.length; _ioCopyPage(0); await wait(300); const cp = ioAdvanced.pages[ioAdvanced.page]; const copied = [keys(cp), cp.seed, cp.seedAsked, /copy$/.test(cp.name)];
    const before = eval('_dirtyStateString()'); doUndo(); await wait(300); doRedo(); await wait(300); const roundTrip = eval('_dirtyStateString()') === before;   /* Undo + Redo of the copy gives the very same text */
    await _u3Home(); return is([opened, lit, undone, redone, again, looked, lookUndone, fresh, norm, dflt, copied, roundTrip], [false, true, [true, false], true, false, [false, true], false, want, want, [want, want, want], [want, '', '', true], true],
      'gold when opened / after the rename / name back + gold after Undo / gold after Redo / after Undo again / gold + an undo step after the first look at I/O Patch Advanced / gold after undoing the look / keys of a fresh page / of a normalised page / of the default pages / copied page: keys, seed, seedAsked, named copy / Undo + Redo of the copy is the same text');
  });

  await check('unsaved 3: an edit made while Save is still writing (file picker, the write takes 300 ms and 1000 ms) is NOT in the file, so Save stays gold and New warns; with no edit during the write Save ends clean, also when Wire is first looked at during the write', async () => {
    await _u3Home(); const own = Object.getOwnPropertyDescriptor(window, 'showSaveFilePicker'); let file = null; const out = [];
    const stub = ms => { window.showSaveFilePicker = async () => ({ createWritable: async () => { const parts = []; return { write: async b => { parts.push(b); }, close: async () => { await wait(ms); file = await new Blob(parts).text(); } }; } }); };
    try {
      for (const ms of [300, 1000]) {
        await restore(); eval('_fileHandle=null'); stub(ms); file = null;
        _u3Rename('U3 FIRST'); await wait(450); const lit = _u3Gold();
        const p = saveProject({}); await wait(60); _u3Rename('U3 SECOND'); await p; await wait(500);
        const inFile = file ? JSON.parse(file).screens[0].name : null; const gold = _u3Gold(); const asks = await _u3NewAsks();
        file = null; const p2 = saveProject({}); await p2; await wait(450); const resaved = [file ? JSON.parse(file).screens[0].name : null, _u3Gold()];   /* a second Save with no edit during the write */
        out.push([ms, lit, inFile, screens[0].name, gold, asks, resaved]);
      }
      await restore(); eval('_fileHandle=null'); stub(600); _u3Rename('U3 LOOK'); await wait(450); const pl = saveProject({}); await wait(80);
      $('#topbar-nav-wire').click(); await pl; await wait(700); const coloured = (getProjectState().sources || []).some(s => s && s.wireColor); const lookGold = _u3Gold(); closeWireMode(); await wait(200);
      out.push(['look during the write', coloured, lookGold, await _u3NewAsks()]);
    } finally { if (own) Object.defineProperty(window, 'showSaveFilePicker', own); else delete window.showSaveFilePicker; eval('_fileHandle=null'); }
    await _u3Home(); return is(out, [[300, true, 'U3 FIRST', 'U3 SECOND', true, 'unsaved', ['U3 SECOND', false]], [1000, true, 'U3 FIRST', 'U3 SECOND', true, 'unsaved', ['U3 SECOND', false]], ['look during the write', true, false, 'plain']],
      'per write time: gold after the first rename / name in the written file / name in memory / gold after the write / what New asks / second Save with no edit: name in the file, gold. Then: Wire first looked at during a 600 ms write: cable colours filled in / gold / what New asks');
  });

  await check('unsaved 3: the same on the two other write paths: a browser without the file picker (the download) and the desktop app (Save and the autosave / close hook): the edit made during the write stays unsaved, no edit ends clean', async () => {
    await _u3Home(); const out = []; let file = null;
    /* (a) the download: no picker in this browser; the anchor's click is caught so nothing is downloaded */
    let owner = window; while (owner && !Object.getOwnPropertyDescriptor(owner, 'showSaveFilePicker')) owner = Object.getPrototypeOf(owner);
    const desc = owner ? Object.getOwnPropertyDescriptor(owner, 'showSaveFilePicker') : null; const realDispatch = HTMLAnchorElement.prototype.dispatchEvent;
    try {
      if (owner) delete owner.showSaveFilePicker;
      HTMLAnchorElement.prototype.dispatchEvent = function (ev) { if (this.download && ev && ev.type === 'click') { fetch(this.href).then(r => r.text()).then(t => { file = t; }); return true; } return realDispatch.call(this, ev); };
      const noPicker = !('showSaveFilePicker' in window);
      _u3Rename('U3 FIRST'); await wait(450); saveProject({}); await wait(100); _u3Rename('U3 SECOND'); await wait(1500);   /* the old code re-baselined 1000 ms after the click */
      out.push(['download', noPicker, file ? JSON.parse(file).screens[0].name : null, _u3Gold(), await _u3NewAsks()]);
      file = null; saveProject({}); await wait(1300); out.push(['download, no edit', file ? JSON.parse(file).screens[0].name : null, _u3Gold()]);
    } finally { HTMLAnchorElement.prototype.dispatchEvent = realDispatch; if (owner && desc) Object.defineProperty(owner, 'showSaveFilePicker', desc); }
    /* (b) the desktop app: a stand-in for the bridge whose write takes 300 ms */
    await restore(); const hadNative = window.lookbookNative; const written = [];
    try {
      window.lookbookNative = { project: { save: async (json, auto) => { await wait(300); written.push({ auto: !!auto, name: JSON.parse(json).screens[0].name }); return { ok: true }; } } };
      eval("_desktopPath='/u3/test.avlb'; _desktopLastSave=0"); try { clearTimeout(eval('_autoSaveTimer')); eval('_autoSaveTimer=null'); } catch (e) {}   /* merge: an autosave armed by an earlier check must not write inside the stubbed 300 ms (it passed alone, failed in the full probe) */
      _u3Rename('U3 FIRST'); await wait(450); const p = saveProject({}); await wait(60); _u3Rename('U3 SECOND'); await p; await wait(300);
      out.push(['desktop Save', written.map(w => w.name), _u3Gold()]);
      const f1 = window.__lbFlushSave(); await wait(60); _u3Rename('U3 THIRD'); await f1; await wait(300);
      out.push(['desktop close hook', written.map(w => w.name), _u3Gold()]);
      const f2 = window.__lbFlushSave(); await f2; await wait(300); out.push(['desktop close hook, no edit', written.map(w => w.name), _u3Gold()]);
    } finally { if (hadNative === undefined) delete window.lookbookNative; else window.lookbookNative = hadNative; eval('_desktopPath=null'); try { clearTimeout(eval('_autoSaveTimer')); eval('_autoSaveTimer=null'); } catch (e) {} }
    await _u3Home(); return is(out, [['download', true, 'U3 FIRST', true, 'unsaved'], ['download, no edit', 'U3 SECOND', false], ['desktop Save', ['U3 FIRST'], true], ['desktop close hook', ['U3 FIRST', 'U3 SECOND'], true], ['desktop close hook, no edit', ['U3 FIRST', 'U3 SECOND', 'U3 THIRD'], false]],
      'download: no picker, name in the file, gold 1.5 s after the click, what New asks / download with no edit: name in the file, gold / desktop Save: names written, gold / close hook: names written, gold / close hook with no edit: names written, gold');
  });

  await check('unsaved 3: clicking into an AUX cell or an empty layer cell of the Video Presets table and leaving it writes nothing (no AUX content object, no layer object, no undo step, Save clean); typing in the same cells still is one undo step each', async () => {
    await _u3Home(); const o = _u3OldShow(); await _u3AsSaved(o.st); const opened = _u3Gold(); const u0 = _u3Undo();
    const aux = $$('#tbody input[onblur*="setDSMContent"]').find(vis); const lay = $$('#tbody input[onblur*="homeSetL(\'' + o.lastP + '\',\'' + o.lastS + '\'"]').find(vis) || null;
    if (!aux || !lay) { await _u3Home(); return 'no AUX cell / no empty layer cell in the table (' + !!aux + ', ' + !!lay + ')'; }
    await _u3InOut(aux); await wait(200); const lp = presets.find(p => p.id === o.lastP);
    const afterAux = [_u3Gold(), presets.some(p => 'dsmContent' in p), _u3Undo() - u0];
    const lay2 = $$('#tbody input[onblur*="homeSetL(\'' + o.lastP + '\',\'' + o.lastS + '\'"]').find(vis); await _u3InOut(lay2); await wait(200); try { closeLayerPanel(); } catch (e) {}
    const afterLay = [_u3Gold(), !!(lp.layers && (o.lastS in lp.layers)), _u3Undo() - u0];
    const aux2 = $$('#tbody input[onblur*="setDSMContent"]').find(vis); aux2.value = 'U3 PGM'; fire(aux2, 'blur'); await wait(300); const typedAux = [_u3Gold(), _u3Undo() - u0];
    const lay3 = $$('#tbody input[onblur*="homeSetL(\'' + o.lastP + '\',\'' + o.lastS + '\'"]').find(vis); lay3.value = 'U3 CONTENT'; fire(lay3, 'blur'); await wait(300); const typedLay = [getL(o.lastP, o.lastS, 1), _u3Undo() - u0];
    doUndo(); await wait(250); doUndo(); await wait(650); const undone = _u3Gold();   /* the app re-checks 350 ms after the redraw */
    await _u3Home(); return is([opened, afterAux, afterLay, typedAux, typedLay, undone], [false, [false, false, 0], [false, false, 0], [true, 1], ['U3 CONTENT', 2], false],
      'gold when opened / AUX cell in and out: gold, a dsmContent object appeared, undo steps / empty layer cell in and out: gold, a layer object appeared, undo steps / AUX typed: gold, undo steps / layer typed: content, undo steps / gold after two Undos');
  });

  await check('unsaved 3: I/O Patch: clicking into a custom Type field and leaving it writes nothing and records no undo step (a file that never "remembered" its custom types); a typed type name still lights Save, is remembered and is one undo step', async () => {
    await _u3Home(); const o = _u3OldShow(); await _u3AsSaved(o.st); $('#topbar-nav-iop').click(); await wait(700);
    if (ioAdvanced.view === 'advanced') { const b = $('#sys-overlay [onclick*="_ioSetView(\'simple\')"]'); if (b) b.click(); await wait(400); }
    const looked = _u3Gold(); const u0 = _u3Undo(); const field = () => $$('#sys-overlay input.sys-type-input').find(e => vis(e) && e.value === 'U3 RIG');
    const f = field(); if (!f) { await _u3Home(); return 'no custom Type field with the saved name on the page'; }
    await _u3InOut(f); await wait(250); const inOut = [_u3Gold(), (customTypes.machines || []).length, _u3Undo() - u0];
    const f2 = field(); await _u3Type(f2, 'U3 NEW RIG'); await wait(300);
    const typed = [_u3Gold(), (customTypes.machines || []).slice(), (_sysGetSourceMeta(o.srcName) || {}).customType, _u3Undo() - u0];
    const f3 = $$('#sys-overlay input.sys-type-input').find(e => vis(e) && e.value === 'U3 NEW RIG'); if (f3) { await _u3InOut(f3); await wait(200); } const again = _u3Undo() - u0;   /* leaving it a second time adds nothing */
    doUndo(); await wait(650); const undone = [(_sysGetSourceMeta(o.srcName) || {}).customType, _u3Gold()];
    await _u3Home(); return is([looked, inOut, typed, again, undone], [false, [false, 0, 0], [true, ['U3 NEW RIG'], 'U3 NEW RIG', 1], 1, ['U3 RIG', false]],
      'gold after opening I/O Patch / in and out: gold, remembered custom machine types, undo steps / typed: gold, remembered types, stored type, undo steps / undo steps after leaving it once more / after Undo: stored type, gold');
  });

  await check('unsaved 3: Wire, Project Info: clicking into Venue (and every other box) and leaving it writes nothing: a blank venue stays blank and Save stays clean; a typed venue lights Save, and deleting it again is the saved show', async () => {
    await _u3Home(); const o = _u3OldShow(); await _u3AsSaved(o.st); $('#topbar-nav-wire').click(); await wait(800);
    if (wireSettings.wireView === 'advanced') { const b = $('#wire-overlay [onclick*="_wireSwitchToSimple()"]'); if (b) b.click(); await wait(400); }
    const looked = _u3Gold(); const v = $('#wtb-venue'); if (!v || !vis(v)) { await _u3Home(); return 'no Venue box on the Wire page'; }
    await _u3InOut(v); await wait(450); const venue = [$('#show-venue').value, getProjectState().showVenue, _u3Gold()];
    for (const el of $$('#wire-title-block .wire-tb-inp[data-tb]').filter(vis)) await _u3InOut(el); await wait(450); const all = [getProjectState().showVenue, _u3Gold()];
    await _u3Type(v, 'U3 Hall'); await wait(450); const typed = [getProjectState().showVenue, _u3Gold()];
    await _u3Type(v, ''); await wait(450); const cleared = _u3Gold();
    await _u3Home(); return is([looked, venue, all, typed, cleared], [false, ['', '', false], ['', false], ['U3 Hall', true], false],
      'gold after opening Wire / Venue in and out: the field the file is written from, showVenue in getProjectState, gold / every Project Info box in and out: showVenue, gold / typed: showVenue, gold / gold after deleting it again');
  });

  await check('unsaved 3: click into EVERY visible field of every page and leave it, nothing typed (an older-style show, then the three examples): Save stays clean and no undo step is recorded', async () => {
    await _u3Home(); const hits = []; let visited = 0;
    const fields = () => $$('input,textarea').filter(e => { const t = (e.getAttribute('type') || 'text').toLowerCase(); if (e.tagName !== 'TEXTAREA' && ['text', 'number', 'search', 'tel', 'url', 'date', ''].indexOf(t) < 0) return false; if (e.disabled || e.readOnly || !vis(e)) return false; const r = e.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) { try { e.scrollIntoView({ block: 'center' }); } catch (x) {} } const r2 = e.getBoundingClientRect(); const top = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2); return !!top && (top === e || e.contains(top) || top.contains(e)); });
    const closers = () => { try { closeLayerPanel(); } catch (e) {} try { closeColorPop(); } catch (e) {} try { const p = $('#picker'); if (p && getComputedStyle(p).display !== 'none' && typeof closePicker === 'function') closePicker(); } catch (e) {} try { if (typeof _sysCloseMenu === 'function') _sysCloseMenu(); } catch (e) {} if (dlgOpen()) { const c = $('#dlg-cancel') || $('#dlg-confirm'); if (c) c.click(); } };
    const sweep = async (tag) => {
      const n = fields().length; let u = _u3Undo(); let text = eval('_dirtyStateString()');
      for (let i = 0; i < n && i < 120; i++) {
        const el = fields()[i]; if (!el) break; const what = tag + ': ' + el.tagName.toLowerCase() + (el.id ? '#' + el.id.replace(/[-_][a-z0-9]{5,}.*/i, '') : '') + '.' + String(el.className).split(/\s+/)[0] + (el.dataset && el.dataset.tb ? '[' + el.dataset.tb + ']' : '') + (el.dataset && el.dataset.sysKind ? '[' + el.dataset.sysKind + ']' : '');
        await _u3InOut(el); closers(); visited++;
        const u2 = _u3Undo(), t2 = eval('_dirtyStateString()');
        if (u2 !== u || t2 !== text) { hits.push(what + (u2 !== u ? ' (undo step)' : '') + (t2 !== text ? ' (wrote)' : '')); u = u2; text = t2; }
      }
      await wait(400); if (_u3Gold()) { hits.push(tag + ': Save is gold'); _captureCleanBaseline(); eval('_isDirty=false'); _updateDirtyIndicator(); }
    };
    const tour = async (tag) => {
      await sweep(tag + ' Video Presets');
      $('#topbar-nav-wire').click(); await wait(700); if (wireSettings.wireView === 'advanced') { $('#wire-overlay [onclick*="_wireSwitchToSimple()"]').click(); await wait(400); } await sweep(tag + ' Wire Simple');
      await _u3WireAdv(); await sweep(tag + ' Wire Advanced'); closeWireMode(); await wait(200);
      $('#topbar-nav-iop').click(); await wait(600); if (ioAdvanced.view === 'advanced') { $('#sys-overlay [onclick*="_ioSetView(\'simple\')"]').click(); await wait(400); } await sweep(tag + ' I/O Patch Simple');
      await _u3IoAdv(); await sweep(tag + ' I/O Patch Advanced'); closeSystem(); await wait(200);
      const adv = $$('[onclick*="_vpSetView(\'advanced\')"]').find(vis); if (adv) { adv.click(); await wait(700); await sweep(tag + ' Video Presets Advanced'); try { closeFullscreen(); } catch (e) {} await wait(300); }
    };
    await _u3AsSaved(_u3OldShow().st); await tour('older-style show'); await _u3Home();
    for (const ex of eval('_LB_EXAMPLES')) { await _u3AsSaved(ex.state); await tour(ex.id); await _u3Home(); }
    await _u3Home(); return is([visited > 150, hits], [true, []], 'enough fields were really visited / the fields that wrote something, recorded an undo step or lit Save');
  });

  // ── bottom bar on every page + floating I/O Tools (round 16ks, owner's decision 6) ───────────────────────────────────
  // WHERE: paste this whole block into tests/flows_probe.js straight BEFORE the line
  //   "  // ── Video Presets, Advanced ──…"
  // (the end of the Simple section: it needs no media file, and the later setup loads test media).
  // Helpers used from the top of the probe: $, $$, wait, is, vis, check, restore, okDialogs, dlgOpen, userLookBook, mailHref, downloads.
  // Own helpers are prefixed bb. Every check FAILS on build 16kq and PASSES with r16ks/bottom-bar/patch.py applied.
  // Every check leaves the app on Video Presets Simple with the base show, Wire back in Simple view, nothing open.
  // bbTap is a hit-tested click: it first asks the browser which element is on top at the control's centre. A control
  // that sits under a page (the 16kq fault: the three pages covered the bar) is reported, never clicked through.
  const bbBar = () => $('#bottom-bar').getBoundingClientRect();
  const bbOnTop = el => { if (!el) return false; const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === el || el.contains(t)); };
  const bbTap = el => { if (!bbOnTop(el)) return false; const r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 }; const t = document.elementFromPoint(o.clientX, o.clientY);
    t.dispatchEvent(new PointerEvent('pointerdown', o)); t.dispatchEvent(new MouseEvent('mousedown', o)); t.dispatchEvent(new PointerEvent('pointerup', o)); t.dispatchEvent(new MouseEvent('mouseup', o)); t.dispatchEvent(new MouseEvent('click', o)); return true; };
  const bbEsc = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
  const bbShown = s => { const e = $(s); return !!e && getComputedStyle(e).display !== 'none'; };
  const bbHelpBtn = () => $('#bottom-bar button[onclick="actions.help()"]');
  const bbWireView = async v => { if (!bbShown('#wire-overlay')) { openWireMode(); await wait(500); } if (wireSettings.wireView !== v) { if (v === 'advanced') { _wireSwitchToAdvanced(); await wait(400); if (dlgOpen()) { $('#dlg-confirm').click(); await wait(300); } await wait(600); } else { _wireSwitchToSimple(); await wait(500); } } okDialogs(); };
  const bbPages = [
    { name: 'Advanced page', ov: '#fs-overlay', open: async () => { openFullscreen(presets[0].id); await wait(800); }, close: async () => { closeFullscreen(); await wait(350); } },
    { name: 'Wire Simple', ov: '#wire-overlay', open: async () => { await bbWireView('simple'); }, close: async () => { closeWireMode(); await wait(350); } },
    { name: 'Wire Advanced', ov: '#wire-overlay', open: async () => { await bbWireView('advanced'); }, close: async () => { await bbWireView('simple'); closeWireMode(); await wait(350); } },
    { name: 'I/O Patch', ov: '#sys-overlay', open: async () => { openSystem(); await wait(700); }, close: async () => { closeSystem(); await wait(350); } },
  ];
  const bbIoBtn = () => $$('[id="wire-router-menu-btn"]').find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || null;   /* the id exists twice (the phone's top-bar copy is hidden on the desktop) */

  // ── bottom bar FIX (round 16ks, after the attack on "bottom-bar") ────────────────────────────────────────────────────
  // WHERE: paste PART 1 into tests/flows_probe.js straight AFTER the block of r16ks/bottom-bar/flows_checks.js (so still
  // BEFORE the line "  // ── Video Presets, Advanced ──…"). PART 2 (under the REPLACES header) takes the place of eight
  // of that block's nine checks, same names, so the golden gains no new name from PART 2.
  // Helpers used from the top of the probe: $, $$, wait, is, vis, check, restore, okDialogs, dlgOpen, userLookBook, mailHref, downloads.
  // Helpers used from the bottom-bar block (they stay where they are): bbBar, bbOnTop, bbTap, bbEsc, bbShown, bbHelpBtn,
  // bbWireView, bbPages, bbIoBtn. Own helpers are prefixed bf.
  // PART 1: every check FAILS on the merged base (r16ks/base4) and PASSES with r16ks/bottom-bar-fix/patch_fix.py applied.
  // EVERY check in this file closes what it opened (Wire back in Simple view, Wire / I/O Patch / the Advanced page closed)
  // and then ends on restore(), so the show is byte-identical to the base show afterwards (proved by run_checks.mjs, which
  // compares getProjectState() with BASE after every check).
  const bfHome = async () => { try { _wireCloseRouterMenu(); } catch (e) {} if (bbShown('#wire-overlay')) { await bbWireView('simple'); closeWireMode(); await wait(300); } if (bbShown('#sys-overlay')) { try { _ioSetView('simple'); } catch (e) {} closeSystem(); await wait(300); } if (bbShown('#fs-overlay')) { closeFullscreen(); await wait(300); } await restore(); };
  const bfUnder = () => { const b = bbIoBtn(); if (!b) return ['no I/O Tools button']; const r = b.getBoundingClientRect(); return $$('#wire-diagram .wire-node').filter(g => { const q = g.getBoundingClientRect(); return q.width > 0 && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top; }).map(g => String(g.getAttribute('data-node-id')).split(':')[0]); };
  const bfOff = () => { const b = bbIoBtn(); if (!b) return 999; const r = b.getBoundingClientRect(), L = $('#wire-panel-left').getBoundingClientRect(), R = $('#wire-panel-right').getBoundingClientRect(); return Math.round(Math.abs((r.left + r.right) / 2 - (L.right + R.left) / 2)); };

  // ── PART 1: new checks ───────────────────────────────────────────────────────────────────────────────────────────────

  await check('bottom bar: the Advanced page, Wire and I/O Patch end at the top of the bar, and every bar item stays on top', async () => {
    const bad = [];
    for (const p of bbPages) { await p.open(); const ov = $(p.ov).getBoundingClientRect(), bar = bbBar();
      if (!bbShown(p.ov)) bad.push(p.name + ': did not open');
      if (Math.round(ov.bottom) > Math.round(bar.top)) bad.push(p.name + ': the page reaches ' + Math.round(ov.bottom) + ' px, the bar starts at ' + Math.round(bar.top));
      if (Math.round(bar.bottom) !== window.innerHeight || Math.round(bar.height) !== 28) bad.push(p.name + ': the bar is not the 28 px strip at the bottom of the window');
      ['#bb-presets', '#bb-screens', '#bb-dsms', '#bb-outputs', '#bb-layers', '#cv-lbl', '#bb-sel', '#bb-build', '#tb-educator', '#tb-bug'].forEach(s => { if (!bbOnTop($(s))) bad.push(p.name + ': ' + s + ' is covered'); }); if (!bbOnTop(bbHelpBtn())) bad.push(p.name + ': Help is covered');
      await p.close(); }
    await bfHome(); return bad.length ? bad.join(' | ') : true;
  });
  await check('bottom bar: Help opens above each page from the bar, and Escape closes only Help', async () => {
    const bad = [];
    for (const p of bbPages) { await p.open();
      if (!bbTap(bbHelpBtn())) { bad.push(p.name + ': the Help button is covered by the page'); await p.close(); continue; } await wait(400);
      const h = $('#help-overlay'); const top = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      if (!vis(h) || !top || !h.contains(top)) bad.push(p.name + ': Help did not open above the page');
      bbEsc(); await wait(350); if (vis($('#help-overlay'))) { bad.push(p.name + ': Escape left Help open'); closeHelp(); await wait(150); }
      if (!bbShown(p.ov)) bad.push(p.name + ': Escape closed the page too'); else await p.close(); if (bbShown(p.ov)) await p.close(); }
    await bfHome(); return bad.length ? bad.join(' | ') : true;
  });
  await check('bottom bar: Bug starts the bug report from each page, and the skin menu opens upward, fully on screen and clickable', async () => {
    const bad = []; const skinBtn = $('#lb-skin-btn'); const skinCss = skinBtn ? skinBtn.style.cssText : '', skinStored = localStorage.getItem('lbSkin'), skinAttr = document.body.getAttribute('data-skin');   /* merge: put the DOM back afterwards */
    try { for (const p of bbPages) { await p.open();
      mailHref = null; downloads.length = 0; if (!bbTap($('#tb-bug'))) bad.push(p.name + ': the Bug button is covered by the page'); else { await wait(500); if (!/^mailto:info@aveducate\.com\?subject=/.test(mailHref || '') || downloads.length !== 1) bad.push(p.name + ': Bug did not start the report'); }
      /* one skin ships, so the skin button is hidden by CSS: show it for the test only, the way a build with a second skin would */
      skinBtn.style.setProperty('display', 'inline-flex', 'important'); await wait(60);
      if (!bbTap(skinBtn)) bad.push(p.name + ': the skin button is covered by the page'); else { await wait(250); const m = $('#lb-skin-menu'); const e = m && m.querySelector('button');
        if (!m) bad.push(p.name + ': the skin menu did not open'); else { const r = m.getBoundingClientRect();
          if (r.top < 0 || r.right > window.innerWidth || r.bottom > skinBtn.getBoundingClientRect().top + 8) bad.push(p.name + ': the skin menu is not fully on screen above the bar');
          if (!bbTap(e)) bad.push(p.name + ': the skin entry is covered'); else { await wait(200); if ($('#lb-skin-menu') || document.body.getAttribute('data-skin') !== 'black') bad.push(p.name + ': picking a skin did not close the menu'); } } }
      const left = $('#lb-skin-menu'); if (left) left.remove(); skinBtn.style.removeProperty('display');
      if (!bbShown(p.ov)) bad.push(p.name + ': the page closed'); else await p.close(); } }
    finally { if (skinBtn) skinBtn.style.cssText = skinCss; if (skinStored === null) localStorage.removeItem('lbSkin'); else localStorage.setItem('lbSkin', skinStored); if (skinAttr === null) document.body.removeAttribute('data-skin'); else document.body.setAttribute('data-skin', skinAttr); }
    await bfHome(); return bad.length ? bad.join(' | ') : true;
  });
  await check('bottom bar: the Presets number follows + Preset while the Advanced page is open, and the number is on screen', async () => {
    openFullscreen(presets[0].id); await wait(800); const n = presets.length; const cell = $('#bb-presets'); const seen0 = bbOnTop(cell);
    const add = $('#toolbar button[onclick="actions.addPreset()"]'); const tapped = bbTap(add); await wait(500); okDialogs(); await wait(300);
    const got = [tapped, presets.length, cell.textContent.trim(), seen0 && bbOnTop(cell), bbShown('#fs-overlay')];
    closeFullscreen(); await wait(300); await restore();
    return is(got, [true, n + 1, String(n + 1), true, true], '+ Preset clicked / presets / number in the bar / number visible / Advanced still open');
  });
  await check('Advanced: after Fit every destination is inside the canvas view, and the timeline and side panels end at the bar', async () => {
    openFullscreen(presets[0].id); await wait(800); $('#fs-zoom-widget button[onclick="fsFitScreen()"]').click(); await wait(400);
    const bar = bbBar(), vp = $('#fs-viewport').getBoundingClientRect(); const low = ['#fs-viewport', '#fs-timeline', '#fs-left-panel', '#fs-right-panel'].map(s => $(s)).filter(Boolean).reduce((m, e) => Math.max(m, e.getBoundingClientRect().bottom), 0);
    const inside = $$('#fs-canvas .screen-box').every(b => { const r = b.getBoundingClientRect(); return r.left >= vp.left - 1 && r.right <= vp.right + 1 && r.top >= vp.top - 1 && r.bottom <= vp.bottom + 1; });
    await bfHome();
    return is([inside, Math.round(low) <= Math.round(bar.top)], [true, true], 'destinations inside the view / lowest edge of the page is at or above the bar');
  });
  await check('Wire: the bottom strip is gone in Simple and Advanced, and I/O Tools floats bottom-middle of the Advanced drawing area only', async () => {
    const bad = []; const stripShown = () => { const s = $('#wire-style-bar'); return !!s && getComputedStyle(s).display !== 'none' && s.getBoundingClientRect().height > 0; };
    await bbWireView('simple'); if (stripShown()) bad.push('Simple: the strip is still there'); if (bbIoBtn()) bad.push('Simple: an I/O Tools button shows');
    if (Math.round($('#wire-diagram-scroll').getBoundingClientRect().bottom) !== Math.round(bbBar().top)) bad.push('Simple: the drawing area does not run down to the bar');
    await bbWireView('advanced'); if (stripShown()) bad.push('Advanced: the strip is still there'); const b = bbIoBtn();
    if (!b) bad.push('Advanced: no I/O Tools button'); else { const r = b.getBoundingClientRect(), sc = $('#wire-diagram-scroll').getBoundingClientRect(), bar = bbBar(); const L = $('#wire-panel-left').getBoundingClientRect(), R = $('#wire-panel-right').getBoundingClientRect();
      const cross = s => { const e = $(s); if (!e) return false; const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 && r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top; };
      if (b.closest('#wire-diagram')) bad.push('Advanced: the button is inside the drawing (#wire-diagram), exports would see it');
      if (!(r.top >= sc.top && r.bottom <= sc.bottom)) bad.push('Advanced: the button is not inside the drawing area'); if (bar.top - r.bottom < 8 || bar.top - r.bottom > 40) bad.push('Advanced: the button is ' + Math.round(bar.top - r.bottom) + ' px above the bar (8 to 40 expected)');
      if (Math.abs((r.left + r.right) / 2 - (L.right + R.left) / 2) > 2) bad.push('Advanced: the button is not in the middle of the drawing area'); if (!bbOnTop(b)) bad.push('Advanced: the button is covered');
      ['#wire-zoom-widget', '#wire-page-tabs', '#wire-tabs', '#wire-panel-left', '#wire-panel-right', '#wire-title-block', '#wire-tool-palette'].forEach(s => { if (cross(s)) bad.push('Advanced: the button covers ' + s); }); }
    await bfHome(); return bad.length ? bad.join(' | ') : true;
  });
  await check('Wire Advanced: the floating I/O Tools menu opens upward inside the window, closes on Escape and on a press outside, and an entry drops a tile', async () => {
    const bad = []; await bbWireView('advanced'); const b = bbIoBtn(); if (!b || !b.closest('#wire-io-float')) { await bfHome(); return 'I/O Tools is not the floating button'; }
    if (!bbTap(b)) bad.push('the button is covered'); await wait(300); let m = $('#wire-router-menu');
    if (!m) bad.push('the menu did not open'); else { const r = m.getBoundingClientRect(); if (r.bottom > b.getBoundingClientRect().top || r.top < 0 || r.left < 0 || r.right > window.innerWidth) bad.push('the menu is not above the button inside the window'); if (!$$('.wire-router-menu-item', m).every(bbOnTop)) bad.push('a menu entry is covered'); }
    bbEsc(); await wait(250); if ($('#wire-router-menu')) bad.push('Escape left the menu open'); if (!bbShown('#wire-overlay')) bad.push('Escape closed Wire');
    bbTap(bbIoBtn()); await wait(300); $('#wire-diagram-scroll').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 600, clientY: 300, button: 0 })); await wait(250); if ($('#wire-router-menu')) bad.push('a press on the drawing left the menu open'); window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    const n = wireAdvanced.routers.length; bbTap(bbIoBtn()); await wait(300); m = $('#wire-router-menu'); const it = m && $$('.wire-router-menu-item', m).find(x => /^10×10 Router/.test(x.textContent.trim()));
    if (!it || !bbTap(it)) bad.push('no 10×10 Router entry to click'); await wait(500); okDialogs(); if (wireAdvanced.routers.length !== n + 1) bad.push('10×10 Router did not drop a tile'); if ($('#wire-router-menu')) bad.push('the menu stayed open after a pick');
    await bfHome(); return bad.length ? bad.join(' | ') : true;
  });
  await check('Wire exports: with the floating I/O Tools button on screen, the Wire sheet and the Look Book wire sheet do not carry it', async () => {
    await bbWireView('advanced'); const b = bbIoBtn(); const floating = !!b && !!b.closest('#wire-io-float') && bbOnTop(b);
    const svg = _wireExportSheetsSvg('dark'); const lb = await userLookBook(); const leak = /id="wire-router-menu-btn"|wire-io-float|I\/O Tools/;   /* the button itself, its holder, its caption (a focus-ring CSS rule that lists #wire-router-menu-btn has always been in the Look Book) */
    try { closePdfExportModal(); } catch (e) {} await bfHome();
    return is([floating, svg.length > 2000 && !leak.test(svg), lb.length > 5000 && !leak.test(lb)], [true, true, true], 'floating button on screen / Wire sheet clean / Look Book clean');
  });
  await check('I/O Patch: the page ends at the bar, the last row scrolls clear of it, and its drop-down stays inside the window', async () => {
    const bad = [];
    for (const v of ['simple', 'advanced']) { openSystem(); await wait(600); _ioSetView(v); await wait(500); const ov = $('#sys-overlay'); ov.scrollTop = ov.scrollHeight; await wait(300); const bar = bbBar();
      if (Math.round(ov.getBoundingClientRect().bottom) > Math.round(bar.top)) bad.push(v + ': the page runs under the bar');
      const pills = $$('[data-sys-field]', v === 'advanced' ? $('#io-adv') : ov).filter(e => e.getBoundingClientRect().height > 0); const last = pills.sort((a, c) => c.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
      if (!last) { bad.push(v + ': no row control found'); continue; } if (last.getBoundingClientRect().bottom > bar.top || !bbOnTop(last)) bad.push(v + ': the last row control is not clear of the bar');
      if (bbTap(last)) { await wait(300); const dd = $('.sys-dd'); if (!dd) bad.push(v + ': the drop-down did not open'); else { const r = dd.getBoundingClientRect(); if (r.top < 0 || r.bottom > window.innerHeight) bad.push(v + ': the drop-down leaves the window'); const its = $$('.sys-dd-item', dd).filter(i => { const q = i.getBoundingClientRect(); return q.top >= r.top && q.bottom <= r.bottom; }); if (!its.length || !its.every(bbOnTop)) bad.push(v + ': a drop-down entry is covered'); } if (typeof _sysCloseMenu === 'function') _sysCloseMenu(); } }
    await bfHome(); return bad.length ? bad.join(' | ') : true;
  });


  await check('Wire Advanced: Fit, and the automatic Fit after every I/O Tools drop, keep the tiles clear of the floating I/O Tools button', async () => {
    const bad = []; await bbWireView('advanced'); const fit = () => $$('#wire-overlay button[onclick="_wireZoomFit()"]').find(vis);
    if (!bbTap(fit())) bad.push('the Fit button is covered'); await wait(500);
    { const b = bbIoBtn(), low = $$('#wire-diagram .wire-node').reduce((m, g) => Math.max(m, g.getBoundingClientRect().bottom), 0); if (!b) bad.push('no I/O Tools button'); else if (Math.round(low) > Math.round(b.getBoundingClientRect().top)) bad.push('Fit on the example show: the lowest tile ends at ' + Math.round(low) + ' px, the button starts at ' + Math.round(b.getBoundingClientRect().top)); }
    for (const re of [/^10×10 Router/, /^8×2 Switcher/, /^10×10 Router/]) { bbTap(bbIoBtn()); await wait(300); const m = $('#wire-router-menu'), it = m && $$('.wire-router-menu-item', m).find(x => re.test(x.textContent.trim()));
      if (!it || !bbTap(it)) { bad.push('no entry ' + re); continue; } await wait(800); okDialogs(); const u = bfUnder(); if (u.length) bad.push('after ' + re + ': under the button: ' + u.join(','));
      const last = wireAdvanced.routers[wireAdvanced.routers.length - 1], g = last && $$('#wire-diagram .wire-node').find(n => n.getAttribute('data-node-id') === 'router:' + last.id), b = bbIoBtn();
      if (!g || !b) { bad.push('after ' + re + ': the new tile is not on the page'); continue; } const q = g.getBoundingClientRect(), L = $('#wire-panel-left').getBoundingClientRect(), R = $('#wire-panel-right').getBoundingClientRect(), sc = $('#wire-diagram-scroll').getBoundingClientRect();
      if (!(q.left >= L.right - 1 && q.right <= R.left + 1 && q.top >= sc.top - 1 && q.bottom <= b.getBoundingClientRect().top)) bad.push('after ' + re + ': the new tile is not wholly inside the visible drawing above the button'); }
    bbTap(fit()); await wait(600); { const u = bfUnder(); if (u.length) bad.push('Fit after the drops: under the button: ' + u.join(',')); }
    await bfHome(); return bad.length ? bad.join(' | ') : true;
  });
  await check('Wire Advanced: I/O Tools stays in the middle of the visible drawing when a side pane folds, the view switches or Wire is reopened', async () => {
    const bad = []; await bbWireView('advanced'); const tog = side => $$('#wire-panel-' + side + ' .wire-panel-inline-toggle').find(vis); const folded = side => !!(wireSettings.panelCollapse && wireSettings.panelCollapse[side]);
    const step = async (what, want) => { await wait(450); const o = bfOff(); if (o > 2) bad.push(what + ': ' + o + ' px off the middle'); if (want && JSON.stringify([folded('left'), folded('right')]) !== JSON.stringify(want)) bad.push(what + ': the pane did not fold'); const b = bbIoBtn(); if (!b || !bbOnTop(b)) bad.push(what + ': the button is covered'); };
    await step('both panes open', [false, false]);
    bbTap(tog('left')); await step('left pane folded', [true, false]);
    bbTap(tog('right')); await step('both panes folded', [true, true]);
    bbTap(tog('left')); await step('right pane folded', [false, true]);
    await bbWireView('simple'); await bbWireView('advanced'); await step('after Simple and back to Advanced', [false, true]);
    closeWireMode(); await wait(300); await bbWireView('advanced'); await step('after Wire was closed and opened again', [false, true]);
    bbTap(bbIoBtn()); await wait(300); { const m = $('#wire-router-menu'), b = bbIoBtn(); if (!m) bad.push('right pane folded: the menu did not open'); else { const r = m.getBoundingClientRect(), q = b.getBoundingClientRect(); if (r.bottom > q.top || r.top < 0 || r.left < 0 || r.right > window.innerWidth || Math.abs(r.left - q.left) > 2) bad.push('right pane folded: the menu does not open upward from the moved button'); } } _wireCloseRouterMenu();
    bbTap(tog('right')); await step('right pane opened again', [false, false]);
    if (folded('left')) _wireTogglePanelCollapse('left'); if (folded('right')) _wireTogglePanelCollapse('right');
    await bfHome(); return bad.length ? bad.join(' | ') : true;
  });
  await check('top bar: Wire, I/O Patch and the Advanced page start right under the toolbar again after the toolbar changes height', async () => {
    /* the probe cannot resize the window, so it makes the toolbar wrap the way a narrow window does (a fixed width for a moment) */
    const bad = []; const tb = $('#toolbar'), was = tb.style.width; const varH = () => Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toolbar-h')) || 0);
    for (const p of bbPages.filter(x => x.name !== 'Wire Advanced')) { await p.open(); const h0 = tb.offsetHeight;
      tb.style.width = '760px'; await wait(400); const h1 = tb.offsetHeight, top1 = Math.round($(p.ov).getBoundingClientRect().top);
      if (h1 === h0) bad.push(p.name + ': the test could not make the toolbar wrap'); if (varH() !== h1 || top1 !== Math.round(tb.getBoundingClientRect().bottom)) bad.push(p.name + ': toolbar ' + h1 + ' px high, --toolbar-h ' + varH() + ', the page starts at ' + top1);
      tb.style.width = was; await wait(400); const h2 = tb.offsetHeight, top2 = Math.round($(p.ov).getBoundingClientRect().top);
      if (h2 !== h0 || varH() !== h2 || top2 !== Math.round(tb.getBoundingClientRect().bottom)) bad.push(p.name + ': after the toolbar went back: toolbar ' + h2 + ', --toolbar-h ' + varH() + ', the page starts at ' + top2);
      await p.close(); }
    tb.style.width = was; await bfHome(); return bad.length ? bad.join(' | ') : true;
  });
  await check('Help, Modifiers section: the menu is on the preset only (the sentence about a status-bar copy is gone)', async () => {
    if (!bbTap(bbHelpBtn())) return 'the Help button is covered'; await wait(400); const t = (($('#help-overlay') || {}).textContent || '').replace(/\s+/g, ' ');
    const got = [vis($('#help-overlay')), /status bar has the same menu/i.test(t), /menu at the top of a preset to switch on blend zones/.test(t)];
    bbEsc(); await wait(350); if (vis($('#help-overlay'))) { closeHelp(); await wait(150); } await bfHome();
    return is(got, [true, false, true], 'Help open / stale sentence present / corrected sentence present');
  });


// ═══ 16ks-esc: the three Escape rules (owner decision 5). New checks for tests/flows_probe.js ═══════════════════════════════
// WHERE: paste the whole "NEW CHECKS" block into the Simple section, straight BEFORE the line
//     // ── Video Presets, Advanced ───
// (the Advanced section's setup loads test media into customLibrary AFTER BASE was taken; these checks need no media and use restore()).
// Every check here FAILS on build 16kq as shipped and PASSES with patch.py (proved by run_checks.mjs against both pages, out/checks_old.json
// and out/checks_new.json). Helpers used: $, $$, wait, is, fire, vis, okDialogs, restore, firstLayer, fakeEv (all defined at the top of the probe).
// Synthetic events on purpose (the probe runs inside the page): a box is entered with el.focus() (the runner switches focus emulation on, so
// focusin fires the way it does for a user), typed into with .value + an 'input' event, and Escape is sent to the focused element, or to <body>
// when no box is active. The same flows are proved with REAL mouse and key input in walk.mjs / steps.mjs of the 16ks-esc scratch folder.
// Each check leaves the show, the selection, the modifier toggles and _lfxOpen as it found them.
//
// ── NEW CHECKS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const _ekEsc = el => (el || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
  const _ekType = (el, txt) => { el.focus(); el.value = txt; fire(el, 'input'); };
  const _ekInBox = () => { const a = document.activeElement; return !!a && a !== document.body && /^(INPUT|TEXTAREA)$/.test(a.tagName) && !/^(range|checkbox|radio|button|submit|color|file)$/.test(a.type || 'text'); };
  await check('Escape in a text box: Add Destination, Destination Properties, the AUX panel, the colour window, the Look Book window and Help stay open, the old text is back, the cursor has left the box; the next Escape closes the window', async () => {
    const f = firstLayer(); const out = {}; const snap0 = _snapshot(), undo0 = _undoStack.length;
    const one = async (label, open, boxSel, typed, isOpen, shut) => {
      open(); await wait(450); const box = $(boxSel); if (!box) { out[label] = 'no box ' + boxSel; try { shut(); } catch (e) {} return; }
      box.focus(); const old = box.value; _ekType(box, typed); _ekEsc(box); await wait(250);
      const a = [isOpen(), ($(boxSel) || {}).value === old, _ekInBox()]; _ekEsc(); await wait(300); a.push(isOpen()); try { shut(); } catch (e) {} await wait(150); out[label] = a;
    };
    await one('Add Destination', () => actions.addDestination(), '#ms-n', 'ZQ NAME', () => $('#modal').classList.contains('show'), () => closeModal());
    await one('Destination Properties', () => openScreenPanel(Object.assign({}, fakeEv), f.pid, f.sid), '#sp-w', '777', () => !!$('#screen-panel'), () => closeScreenPanel());
    await one('AUX panel', () => openDSMPanel(Object.assign({}, fakeEv), f.pid, dsms[0].id), '#dsmp-name', 'ZQ AUX', () => !!$('#dsm-panel'), () => { const d = $('#dsm-panel'); if (d) d.remove(); });
    await one('colour window', () => openColorPop(Object.assign({}, fakeEv), f.sid, f.pid), '#cp-hex', '#a1b2c3', () => vis($('#color-pop')), () => closeColorPop());
    await one('Look Book window', () => openPdfExportModal(), '#pdf-opt-version', 'ZQ', () => vis($('#pdf-export-modal')), () => closePdfExportModal());
    await one('Help', () => openHelp(), '#a11y-ppi-input', '777', () => vis($('#help-overlay')), () => closeHelp());
    const same = _snapshot() === snap0, undo = _undoStack.length - undo0, dests = screens.length; await restore();
    const want = [true, true, false, false]; const exp = {}; Object.keys(out).forEach(k => { exp[k] = want; });
    return is([out, same, undo], [exp, true, 0], '[window open after Escape in the box, old text back, cursor still in a box, window open after the next Escape] per window / show unchanged / undo steps');
  });
  await check('Escape in a live box of the Layer panel (Opacity, Mask, Width with the lock on): the show goes back exactly, the boxes next to it follow, no undo step, the panel stays open', async () => {
    const f = firstLayer(); const open0 = JSON.stringify(_lfxOpen); Object.keys(_lfxOpen).forEach(k => { _lfxOpen[k] = true; });
    openLayerPanel(Object.assign({}, fakeEv), f.pid, f.sid, 1, true); await wait(500); const pop = $('#layer-panel'); if (!pop) { Object.assign(_lfxOpen, JSON.parse(open0)); return 'the layer panel did not open'; }
    const snap0 = _snapshot(), undo0 = _undoStack.length; const res = [];
    const boxes = [['opacity', $('input.lfx-op256[type=number]', pop), '7'], ['mask top', $('.lp-cr-inp[data-dim="t"]', pop), '40'], ['width', $$('.lfx-acc[data-sec="size"] input[type=number]', pop).find(i => i.dataset.dim === 'w'), '640']];
    for (const [label, box, typed] of boxes) {
      if (!box) { res.push(label + ': no box'); continue; }
      box.focus(); const old = box.value; const hBox = $$('.lfx-acc[data-sec="size"] input[type=number]', pop).find(i => i.dataset.dim === 'h'); const h0 = hBox ? hBox.value : '';
      _ekType(box, typed); await wait(200); const live = _snapshot() !== snap0; _ekEsc(box); await wait(350);
      res.push([label, live, box.isConnected ? box.value === old : 'box redrawn', hBox && hBox.isConnected ? hBox.value === h0 : true, _snapshot() === snap0, _undoStack.length - undo0, !!$('#layer-panel'), _ekInBox()]);
    }
    closeLayerPanel(); Object.keys(_lfxOpen).forEach(k => { delete _lfxOpen[k]; }); Object.assign(_lfxOpen, JSON.parse(open0)); await restore();
    return is(res, [['opacity', true, true, true, true, 0, true, false], ['mask top', true, true, true, true, 0, true, false], ['width', true, true, true, true, 0, true, false]], '[box, typing reached the show, old text back, Height box unchanged, show identical to before, undo steps, panel open, cursor still in a box]');
  });
  await check('Escape in a page box puts the old text back and leaves the box: Show name, Wire Project Info and switcher name, I/O Patch source name; the page stays, and the next Escape on the idle page still goes back to Video Presets', async () => {
    const out = {};
    const sn = $('#show-name'); sn.focus(); const sn0 = sn.value; _ekType(sn, 'ZQ SHOW'); _ekEsc(sn); await wait(200); out.showName = [sn.value === sn0, getProjectState().showName === JSON.parse(BASE).showName, _ekInBox()];
    wireSettings.wireView = 'simple'; openWireMode(); await wait(600); const wireUp = () => getComputedStyle($('#wire-overlay')).display === 'flex';
    const wp = $('#wtb-project'); wp.focus(); const wp0 = wp.value; _ekType(wp, 'ZQ PROJECT'); _ekEsc(wp); await wait(200); out.projectInfo = [wp.value === wp0, _ekInBox(), wireUp()];
    const hub = $('#wire-overlay .wire-hub-name'); if (hub) { hub.focus(); const h0 = hub.value; _ekType(hub, 'ZQ HUB'); _ekEsc(hub); await wait(250); const hub2 = $('#wire-overlay .wire-hub-name'); out.switcherName = [(hub2 || {}).value === h0, _ekInBox(), wireUp()]; } else out.switcherName = 'no switcher name box';
    _ekEsc(); await wait(300); out.wireIdle = wireUp(); if (wireUp()) closeWireMode(); await wait(250);
    openSystem(); await wait(500); if (ioAdvanced.view !== 'simple') { _ioSetView('simple'); await wait(400); } okDialogs(); const ioUp = () => $('#sys-overlay').classList.contains('open');
    const nm = $('#sys-src-rows .sys-name-input'); if (nm) { nm.focus(); const n0 = nm.value; _ekType(nm, 'ZQ SRC'); _ekEsc(nm); await wait(250); const nm2 = $('#sys-src-rows .sys-name-input'); out.ioName = [(nm2 || {}).value === n0, _ekInBox(), ioUp()]; } else out.ioName = 'no source name box';
    _ekEsc(); await wait(300); out.ioIdle = ioUp(); if (ioUp()) closeSystem(); await wait(250); await restore();
    return is(out, { showName: [true, true, false], projectInfo: [true, false, true], switcherName: [true, false, true], wireIdle: false, ioName: [true, false, true], ioIdle: false }, '[old text back, (show name unchanged,) cursor still in a box, page still open] / page open after a bare Escape');
  });
  await check('Advanced: the first Escape lets go of the picked layer or destination and the page stays, the second goes back to Simple; a menu on top still closes first; Escape in a box keeps the pick', async () => {
    const f = firstLayer(); const up = () => !!fsPresetId && getComputedStyle($('#fs-overlay')).display !== 'none'; const open0 = JSON.stringify(_lfxOpen); Object.keys(_lfxOpen).forEach(k => { _lfxOpen[k] = true; });
    openFullscreen(f.pid); await wait(700); _fsSelectLayer(f.pid, f.sid, 1); await wait(350);
    const a = [!!selLayer, up()]; _ekEsc(); await wait(350); a.push(!!selLayer, $$('#fs-canvas .layer-chip.lsel').length, up()); _ekEsc(); await wait(400); a.push(up());
    if (!up()) { openFullscreen(f.pid); await wait(700); } _fsSetPropTab('layers'); doSelect(f.pid, f.sid); renderFullscreen(); await wait(300);
    const b = [!!sel, up()]; _ekEsc(); await wait(350); b.push(!!sel, $$('#fs-canvas .screen-box.sel').length, up()); _ekEsc(); await wait(400); b.push(up());
    if (!up()) { openFullscreen(f.pid); await wait(700); } _fsSelectLayer(f.pid, f.sid, 1); await wait(350);
    const btn = $('#fs-canvas .pr-actions button.v-cyan'); toggleAdvancedMenu({ stopPropagation() {}, currentTarget: btn, target: btn }); await wait(300);
    const c = [$('#adv-menu').classList.contains('open')]; _ekEsc(); await wait(300); c.push($('#adv-menu').classList.contains('open'), !!selLayer, up());
    const box = $('#fs-props input.lfx-op256[type=number]'); let d = 'no Opacity box'; if (box) { box.focus(); if (document.activeElement !== box) d = 'the Opacity box did not take the cursor'; const old = box.value; _ekType(box, '7'); await wait(150); _ekEsc(box); await wait(350); d = [($('#fs-props input.lfx-op256[type=number]') || {}).value === old, getLayerFx(f.pid, f.sid, 1).op, !!selLayer, up()]; }
    _ekEsc(); await wait(350); const e = [!!selLayer, up()]; _ekEsc(); await wait(400); e.push(up());
    closeAdvancedMenu(); if (fsPresetId) closeFullscreen(); selLayer = null; doSelect(null, null); hideMoveSymbol(); Object.keys(_lfxOpen).forEach(k => { delete _lfxOpen[k]; }); Object.assign(_lfxOpen, JSON.parse(open0)); await wait(300); await restore();
    return is([a, b, c, d, e], [[true, true, false, 0, true, false], [true, true, false, 0, true, false], [true, false, true, true], [true, 256, true, true], [false, true, false]],
      'layer [picked, page, picked after Esc 1, chips lit, page, page after Esc 2] / destination [same] / menu [open, open after Esc, layer still picked, page] / box [old text back, opacity in the show, layer still picked, page] / then [picked after the next Esc, page, page after one more]');
  });
// ── END OF NEW CHECKS ──────────────────────────────────────────────────────────────────────────────────────────────────────



// ═══ 16ks-escfix: checks for the three attacker defects in the Escape patch (16ks-esc). For tests/flows_probe.js ═══════════════════
// WHERE: paste the whole "NEW CHECKS (escfix)" block straight AFTER the 16ks-esc block ("// ── END OF NEW CHECKS" of escape/flows_checks.js),
// which itself sits straight BEFORE the line
//     // ── Video Presets, Advanced ───
// (no test media needed; every check ends with restore()).
// Every check here FAILS on the round-16ks base page (16kr + the four 16ks patches) and PASSES with patch_fix.py: proved by run_checks.mjs
// against both pages (out/checks_base.json, out/checks_page.json). The same flows are proved with REAL mouse and key input in proof.mjs.
// Helpers used from the top of the probe: $, $$, wait, is, fire, okDialogs, restore, firstLayer. Own helpers are prefixed _ef.
// Synthetic events on purpose (the probe runs inside the page). A mouse edit is sent the way the browser sends it: pointerdown, mousedown on the
// handle, mousemove / mouseup on window, pointerup, and NO focus change, because the real handles call preventDefault on mousedown and the
// cursor stays in the box (proof.mjs shows that with a real mouse).
// Each check leaves the show, the selection (layer, destination AND the picked AUX), the ghost view and _lfxOpen as it found them.
//
// ── NEW CHECKS (escfix) ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const _efEsc = el => (el || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
  const _efType = (el, txt) => { el.value = txt; fire(el, 'input'); };
  const _efPtr = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  const _efMouse = (el, type, x, y) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' || type === 'click' ? 0 : 1 }));
  const _efDrag = async (el, dx, dy) => { const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; _efPtr(el, 'pointerdown', x, y); _efMouse(el, 'mousedown', x, y); for (let i = 1; i <= 4; i++) { _efMouse(window, 'mousemove', x + dx * i / 4, y + dy * i / 4); await wait(20); } _efMouse(window, 'mouseup', x + dx, y + dy); _efPtr(window, 'pointerup', x + dx, y + dy); await wait(250); };
  const _efClick = async el => { const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; _efPtr(el, 'pointerdown', x, y); _efMouse(el, 'mousedown', x, y); _efMouse(el, 'mouseup', x, y); _efPtr(el, 'pointerup', x, y); _efMouse(el, 'click', x, y); await wait(300); };
  const _efLfx = () => { const o = JSON.stringify(_lfxOpen); Object.keys(_lfxOpen).forEach(k => { _lfxOpen[k] = true; }); return () => { Object.keys(_lfxOpen).forEach(k => { delete _lfxOpen[k]; }); Object.assign(_lfxOpen, JSON.parse(o)); }; };
  const _efHome = async () => { try { closeAdvancedMenu(); } catch (e) {} if (fsPresetId) closeFullscreen(); selLayer = null; doSelect(null, null); hideMoveSymbol(); try { _lsGhostEnd(); } catch (e) {} await wait(250); };
  await check('Escape in a box only takes back the TYPING: a corner-handle resize made while the cursor sat in the Width box survives (nothing typed / typed after the drag / typed in another box before the drag), and Undo still undoes that resize', async () => {
    const f = firstLayer(); const back = _efLfx(); const res = {};
    const geo = () => JSON.stringify(((presets.find(p => p.id === f.pid).layerSizes || {})[f.sid] || {})[1] || null);
    const wBox = () => $$('#fs-props .lfx-acc[data-sec="size"] input[type=number]').find(i => i.dataset.dim === 'w');
    const hnd = () => $('#fs-canvas .layer-chip.lsel .lrh-br') || $('#fs-canvas .layer-chip[data-lid="1"][data-sid="' + f.sid + '"] .lrh-br');
    const scene = async () => { await restore(); openFullscreen(f.pid); await wait(700); _fsSelectLayer(f.pid, f.sid, 1); await wait(400); updateLayerSelDOM(f.pid, f.sid, 1, true); await wait(100); return !!wBox() && !!hnd(); };
    // 1. nothing typed
    if (!(await scene())) { back(); await _efHome(); await restore(); return 'no Width box or no corner handle on the picked layer'; }
    let g0 = geo(), u0 = _undoStack.length; wBox().focus(); const inBox = document.activeElement === wBox(); await _efDrag(hnd(), -60, -30); let g1 = geo(); _efEsc(document.activeElement); await wait(400); let g2 = geo();
    const left = document.activeElement === document.body, picked = !!selLayer && !!fsPresetId; doUndo(); await wait(300);
    res.nothingTyped = [inBox, g1 !== g0, g2 === g1, left, picked, geo() === g0];
    // 2. the drag first, then typing in the same box
    if (!(await scene())) { back(); await _efHome(); await restore(); return 'scene 2 did not open'; }
    g0 = geo(); let b = wBox(); b.focus(); await _efDrag(hnd(), -60, -30); g1 = geo(); _efType(b, '640'); await wait(200); const gTyped = geo(); _efEsc(b); await wait(400);
    res.typedAfterTheDrag = [g1 !== g0, gTyped !== g1, geo() === g1];
    // 3. typing in the Opacity box, then the drag: the opacity goes back, the resize stays
    if (!(await scene())) { back(); await _efHome(); await restore(); return 'scene 3 did not open'; }
    g0 = geo(); const snap0 = _snapshot(); b = $('#fs-props input.lfx-op256[type=number]'); if (!b) { back(); await _efHome(); await restore(); return 'no Opacity box'; }
    b.focus(); _efType(b, '7'); await wait(200); const opTyped = getLayerFx(f.pid, f.sid, 1).op; await _efDrag(hnd(), -60, -30); g1 = geo(); _efEsc(b); await wait(400);
    const norm = t => { const o = JSON.parse(t); const q = o.presets.find(x => x.id === f.pid); if (q.layerSizes) { delete q.layerSizes[f.sid]; if (!Object.keys(q.layerSizes).length) delete q.layerSizes; } return JSON.stringify(o); };
    const only = norm(snap0) === norm(_snapshot());
    res.typedBeforeTheDrag = [opTyped, g1 !== g0, getLayerFx(f.pid, f.sid, 1).op, geo() === g1, only];
    back(); await _efHome(); await restore();
    return is(res, { nothingTyped: [true, true, true, true, true, true], typedAfterTheDrag: [true, true, true], typedBeforeTheDrag: [7, true, 256, true, true] },
      'nothing typed [cursor in the box, the drag resized, resize kept after Escape, cursor left, layer + page still there, Undo goes back to before the drag] / typed after the drag [drag resized, typing resized, Escape = the size after the drag] / typed before the drag [opacity typed, drag resized, opacity after Escape, resize kept, nothing else differs from the start]');
  });
  await check('Escape in a box only takes back the TYPING, other pages: the Wire - output button pressed under a typed Project box keeps its change (the old project text is back), and a destination corner drag under the Show name box keeps its size', async () => {
    const out = {}; await restore();
    // Wire Advanced
    const view0 = wireSettings.wireView; wireSettings.wireView = 'advanced'; openWireMode(); await wait(800); okDialogs();
    wireAdvanced.sources.push({ id: _wireAdvNewId('a'), name: _wireBuildAllSourceNames()[0], x: 200, y: 200, outC: 3 }); _wireRender(); await wait(500);
    const srcId = wireAdvanced.sources[wireAdvanced.sources.length - 1].id; const outC = () => (wireAdvanced.sources.find(s => s.id === srcId) || {}).outC;
    const wp = $('#wtb-project'), btn = $$('#wire-overlay .wire-src-outbtn').find(x => x.dataset.act === 'rem');
    if (!wp || !btn) { closeWireMode(); wireSettings.wireView = view0; await restore(); return 'no Project box or no - button in Wire Advanced'; }
    wp.focus(); const wp0 = wp.value; _efType(wp, wp0 + ' ZQ'); await _efClick(btn); const c1 = outC(); _efEsc(wp); await wait(350);
    out.wire = [c1, outC(), $('#wtb-project').value === wp0, document.activeElement === document.body, getComputedStyle($('#wire-overlay')).display === 'flex'];
    closeWireMode(); await wait(250); wireSettings.wireView = view0; await restore();
    // Simple: Show name + a destination corner handle
    const s = screens[screens.length - 1], p = presets[0]; hideMoveSymbol(); doSelect(null, null); selLayer = null; await wait(100); doSelect(p.id, s.id); render(); await wait(300);
    const h = $('#canvas-area .screen-box.sel .rh-br'); if (!h) { doSelect(null, null); await restore(); return 'no corner handle on the picked destination'; }
    const sz = () => parseInt(s.w) + 'x' + parseInt(s.h); const z0 = sz(); const sn = $('#show-name'); sn.focus(); await _efDrag(h, 30, 17); okDialogs(); const z1 = (() => { const t = screens[screens.length - 1]; return parseInt(t.w) + 'x' + parseInt(t.h); })();
    _efEsc(sn); await wait(350); const t2 = screens[screens.length - 1]; out.simple = [z1 !== z0, parseInt(t2.w) + 'x' + parseInt(t2.h) === z1, document.activeElement === document.body];
    doSelect(null, null); hideMoveSymbol(); await restore();
    return is(out, { wire: [2, 2, true, true, true], simple: [true, true, true] }, 'Wire [outputs after the - press, outputs after Escape, old project text back, cursor left the box, Wire still open] / Simple [the drag resized, size kept after Escape, cursor left the box]');
  });
  await check('Advanced: a fader that holds the cursor is not a text box (the first Escape lets go of the layer, the fader value stays); a lit AUX box is a pick (first Escape lets go of it, the second goes back to Simple); the layer strip ghost view ends on the same press as the pick', async () => {
    const f = firstLayer(); const back = _efLfx(); const up = () => !!fsPresetId && getComputedStyle($('#fs-overlay')).display !== 'none'; await restore(); const dsm0 = selDSM; selDSM = null;   /* the picked AUX is not part of the show: put back by hand at the end */
    // fader
    openFullscreen(f.pid); await wait(700); _fsSelectLayer(f.pid, f.sid, 1); await wait(400);
    const fd = $('#fs-props input[type=range].lfx-op256'); if (!fd) { back(); await _efHome(); await restore(); return 'no Opacity fader'; }
    fd.focus(); fd.value = '109'; fire(fd, 'input'); fire(fd, 'change'); await wait(250); const a = [document.activeElement === fd || (document.activeElement && document.activeElement.type === 'range'), getLayerFx(f.pid, f.sid, 1).op];
    _efEsc(document.activeElement); await wait(400); a.push(!!selLayer, $$('#fs-canvas .layer-chip.lsel').length, up(), getLayerFx(f.pid, f.sid, 1).op); _efEsc(); await wait(400); a.push(up());
    // AUX
    if (!up()) { openFullscreen(f.pid); await wait(700); } const ax = $('#fs-canvas .dsm-box'); let c = 'no AUX box on the Advanced page';
    if (ax) { ax.click(); await wait(400); c = [!!selDSM, $$('#fs-canvas .dsm-box.dsm-sel').length]; _efEsc(); await wait(400); c.push(!!selDSM, $$('#fs-canvas .dsm-box.dsm-sel').length, up()); _efEsc(); await wait(400); c.push(up()); }
    // layer strip: BG box = the destination + every layer see-through
    if (!up()) { openFullscreen(f.pid); await wait(700); } _fsSelectLayer(f.pid, f.sid, 1); await wait(400); let g = 'no layer strip';
    const bg = $('#fs-canvas .lb-lstrip[data-pid="' + f.pid + '"] .lb-lbox[data-n="0"]');
    if (bg) { bg.click(); await wait(400); g = [!!sel, !!_lsGhost, $$('#fs-canvas .lb-ghost').length > 0]; _efEsc(); await wait(60); g.push(!!sel, !!selLayer, !!_lsGhost, $$('#fs-canvas .lb-ghost').length, up()); _efEsc(); await wait(400); g.push(up()); }
    back(); await _efHome(); await restore(); selDSM = dsm0; if (dsm0) { scheduleRender(); renderTable(); await wait(150); }
    return is([a, c, g], [[true, 109, false, 0, true, 109, false], [true, 1, false, 0, true, false], [true, true, true, false, false, false, 0, true, false]],
      'fader [fader has the cursor, opacity, layer picked after Esc 1, chips lit, page, opacity kept, page after Esc 2] / AUX [picked, lit, picked after Esc 1, lit, page, page after Esc 2] / strip [destination picked, ghost on, layers see-through, destination after Esc 1, layer, ghost, see-through layers, page, page after Esc 2]');
  });
// ── END OF NEW CHECKS (escfix) ─────────────────────────────────────────────────────────────────────────────────────────────────



  // ── preset header Reset (16ks preset-reset, owner 2026-09-21) ───────────────────────────────────────────────────────
  // WHERE: paste this whole block into tests/flows_probe.js in the Simple section, straight BEFORE the line
  //   "// ── Video Presets, Advanced ──…"   (later setup loads test media; these checks need none).
  // The one Advanced check in here opens and closes the Advanced page itself, so it can stay in this block.
  // Every check FAILS on build 16kq (Reset re-packed the strip at once, with no window) and PASSES on the patched page.
  // Every check ends with restore(); none touches the Modifiers switches or _lfxLock; selLayer is put back to null.
  // Synthetic events on purpose (the probe runs inside the page): a tick box is clicked with el.click(), keys go to the
  // focused element. Space on a tick box is the browser's own default action and is proven with real keys in the
  // round's CDP proof (prove.mjs), not here.
  const _prBtn = (i, scope) => $((scope || '#canvas-area') + ' .preset-row[data-pid="' + presets[i].id + '"] .del-btn.h-amber');
  const _prTick = k => $('#dlg-box input[data-tick="' + k + '"]');
  const _prTicks = () => ['all', 'dest', 'layers', 'aux'].map(k => { const e = _prTick(k); return e ? e.checked : null; });
  const _prOpen = async (i, scope) => { const b = _prBtn(i, scope); if (!b) return 'no Reset button on the tile'; b.click(); await wait(300); return (dlgOpen() && _prTick('all')) ? true : 'Reset opened no window with tick boxes (it acted at once)'; };
  const _prCancel = () => { if (dlgOpen()) { const c = $('#dlg-cancel') || $('#dlg-confirm'); if (c) c.click(); } };
  const _prSort = v => Array.isArray(v) ? v.map(_prSort) : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => (o[k] = _prSort(v[k]), o), {}) : v;
  const _prJ = v => JSON.stringify(_prSort(v));
  const _PR_DEST = ['positions', 'rotations', 'aoi', 'hiddenScreens', 'screenName', 'edidNotes', 'showMode'];
  const _PR_LAY = ['layers', 'active', 'layerSizes', 'crops', 'layerFx', 'layerMedia', 'colors', 'bgs', 'bgNames', 'opacities', 'bgColors', 'layerCount'];
  const _PR_AUX = ['dsmOn', 'dsmContent', 'dsmColor', 'dsmName', 'dsmType'];
  const _prPick = (p, keys) => { const o = {}; keys.forEach(k => { if (p[k] !== undefined) o[k] = p[k]; }); return _prJ(o); };
  const _prRest = p => _prPick(p, Object.keys(p).filter(k => _PR_DEST.concat(_PR_LAY, _PR_AUX).indexOf(k) < 0));
  // what Quick Setup gives a preset for these destinations and AUX (confirmQS: layers {}, active {}, initStripPositions on an empty preset, every AUX on)
  const _prTarget = () => { const tmp = { id: '__pr_tmp__', code: 'T', name: 'T', layers: {}, active: {} }; presets.push(tmp); initStripPositions(tmp.id); presets.pop(); const on = {}; dsms.forEach(d => { on[d.id] = true; }); return { dest: _prJ({ positions: tmp.positions }), lay: _prJ({ layers: {}, active: {} }), aux: _prJ(dsms.length ? { dsmOn: on } : {}) }; };
  // make preset i differ from the Quick Setup state in every group, through the app's setters where one exists
  const _prDirty = async i => {
    const p = presets[i], a = screens[0].id, b = screens[1].id, c = screens[screens.length - 1].id, d = dsms[0];
    setPosition(p, b, Math.round(parseInt(screens[0].w) * 0.8), 40); p.rotations = {}; p.rotations[c] = 90; setAOI(p.id, a, { enabled: true, x: 100, y: 50, w: 800, h: 450 });
    p.hiddenScreens = {}; p.hiddenScreens[c] = true; setScreenName(p.id, a, 'OVERRIDE NAME'); setEdidNote(p.id, a, 'EDID 1080p59.94'); p.showMode = {}; p.showMode[b] = 'shape';
    setL(p.id, a, 1, 'CAM 1'); setL(p.id, a, 2, 'GFX A'); setLayerSize(p.id, a, 1, 0.4, 0.4, 0.1, 0.1); setCrop(p.id, a, 1, { t: 10, b: 0, l: 5, r: 0 }); setLayerFx(p.id, a, 1, { op: 128, flipH: true });
    setLayerMedia(p.id, a, 1, { in: 0.5, out: 2.5, hue: 20, fadeIn: 1 }); setPColor(p.id, b, '#224466', null); setBgName(p.id, b, 'OWN BG'); p.layerCount = 6;
    if (d) { if (!p.dsmOn) p.dsmOn = {}; p.dsmOn[d.id] = false; if (!p.dsmContent) p.dsmContent = {}; p.dsmContent[d.id] = 'PROMPTER X'; setDSMColor(p.id, d.id, '#335577'); setDSMName(p.id, d.id, 'STAGE MON'); p.dsmType = {}; p.dsmType[d.id] = 'DSM'; }
    scheduleRender(); await wait(300);
  };
  const _prOthers = i => JSON.stringify(presets.filter((_, k) => k !== i)) + JSON.stringify(screens) + JSON.stringify(dsms);

  await check('Reset (preset header): a click opens ONE window "Reset P02 WELCOME?" with Reset All / Destinations / Layers / AUX all ticked, a sentence under each, and changes nothing yet', async () => {
    await restore(); await _prDirty(1); const before = JSON.stringify(presets[1]), n0 = _undoStack.length; let out;
    try {
      const b = _prBtn(1); const tip = [/Quick Setup/.test(b.getAttribute('title') || ''), /destinations, layers, AUX/.test(b.getAttribute('aria-label') || '')];
      const o = await _prOpen(1); if (o !== true) { out = o; return out; }
      const box = $('#dlg-box'); const labels = $$('.dlg-tick-txt b', box).map(x => x.textContent.trim()); const hints = $$('.dlg-tick-txt i', box).filter(x => x.textContent.trim().length > 10).length;
      out = is([tip, $$('#dlg-overlay').length, $('h3', box).textContent, labels, _prTicks(), hints, $('#dlg-confirm').textContent.trim(), $('#dlg-confirm').disabled, !!$('#dlg-cancel'), JSON.stringify(presets[1]) === before, _undoStack.length - n0],
        [[true, true], 1, 'Reset P02 WELCOME?', ['Reset All', 'Reset Destinations', 'Reset Layers', 'Reset AUX'], [true, true, true, true], 4, 'Reset', false, true, true, 0], 'tooltip / dialogs / title / labels / ticks / sentences / confirm label / greyed / Cancel button / preset untouched / undo steps');
      return out;
    } finally { _prCancel(); await restore(); }
  });
  await check('Reset (preset header): un-ticking a child un-ticks Reset All and only that child, the last child back ticks Reset All, Reset All toggles all three, nothing ticked greys Reset', async () => {
    await restore(); await _prDirty(1); const before = JSON.stringify(presets[1]), n0 = _undoStack.length;
    try {
      const o = await _prOpen(1); if (o !== true) return o; const seen = [];
      _prTick('dest').click(); await wait(60); seen.push(_prTicks().concat($('#dlg-confirm').disabled));
      _prTick('dest').click(); await wait(60); seen.push(_prTicks());
      _prTick('all').click(); await wait(60); seen.push(_prTicks().concat($('#dlg-confirm').disabled));
      $('#dlg-confirm').click(); await wait(200); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(200);
      const stillOpen = dlgOpen(), untouched = JSON.stringify(presets[1]) === before && _undoStack.length === n0;
      _prTick('all').click(); await wait(60); seen.push(_prTicks().concat($('#dlg-confirm').disabled));
      return is([seen, stillOpen, untouched], [[[false, false, true, true, false], [true, true, true, true], [false, false, false, false, true], [true, true, true, true, false]], true, true], 'tick states / window still open after pressing the greyed Reset and Enter / preset untouched');
    } finally { _prCancel(); await restore(); }
  });
  await check('Reset (preset header): Cancel, Escape and a press outside the window leave the preset alone and record no undo step', async () => {
    await restore(); await _prDirty(1); const before = JSON.stringify(presets[1]), n0 = _undoStack.length; const got = [];
    try {
      let o = await _prOpen(1); if (o !== true) return o; $('#dlg-cancel').click(); await wait(250); got.push([dlgOpen(), JSON.stringify(presets[1]) === before, _undoStack.length - n0]);
      o = await _prOpen(1); if (o !== true) return o; _prTick('dest').focus(); _prTick('dest').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await wait(250); got.push([dlgOpen(), JSON.stringify(presets[1]) === before, _undoStack.length - n0]);
      o = await _prOpen(1); if (o !== true) return o; $('#dlg-overlay').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); await wait(250); got.push([dlgOpen(), JSON.stringify(presets[1]) === before, _undoStack.length - n0]);
      return is(got, [[false, true, 0], [false, true, 0], [false, true, 0]], 'Cancel / Escape / outside press (window open, preset untouched, undo steps)');
    } finally { _prCancel(); await restore(); }
  });
  for (const [k, label] of [['dest', 'Reset Destinations'], ['layers', 'Reset Layers'], ['aux', 'Reset AUX']]) {
    await check('Reset (preset header): ' + label + ' alone puts only that group back to the Quick Setup state, other presets untouched, one undo step that undoes and redoes', async () => {
      await restore(); await _prDirty(1); const p0 = presets[1], D = { dest: _prPick(p0, _PR_DEST), lay: _prPick(p0, _PR_LAY), aux: _prPick(p0, _PR_AUX), rest: _prRest(p0) }, T = _prTarget(), others = _prOthers(1), before = _prJ(p0), n0 = _undoStack.length;
      try {
        const o = await _prOpen(1); if (o !== true) return o; _prTick('all').click(); await wait(60); _prTick(k).click(); await wait(60); $('#dlg-confirm').click(); await wait(400);
        const p = presets[1]; const A = { dest: _prPick(p, _PR_DEST), lay: _prPick(p, _PR_LAY), aux: _prPick(p, _PR_AUX), rest: _prRest(p) }; const after = _prJ(p), steps = _undoStack.length - n0;
        doUndo(); await wait(300); const undone = _prJ(presets[1]) === before; doRedo(); await wait(300); const redone = _prJ(presets[1]) === after; doUndo(); await wait(300);
        return is([dlgOpen(), A.dest === (k === 'dest' ? T.dest : D.dest), A.lay === (k === 'layers' ? T.lay : D.lay), A.aux === (k === 'aux' ? T.aux : D.aux), A.rest === D.rest, _prOthers(1) === others, steps, undone, redone],
          [false, true, true, true, true, true, 1, true, true], 'window closed / destinations group / layers group / AUX group / code, name, notes / other presets, destinations, AUX list / undo steps / undo restores / redo re-applies');
      } finally { _prCancel(); await restore(); }
    });
  }
  await check('Reset (preset header): Reset All makes P02 equal, field by field, to a preset Quick Setup creates; P01 (the master) resets the same way, keeps the show-wide BG names and AUX / DSM types and never changes the later presets', async () => {
    await restore(); await _prDirty(1); const T = _prTarget(), base = JSON.parse(BASE).presets, n0 = _undoStack.length, others = _prOthers(1);
    try {
      let o = await _prOpen(1); if (o !== true) return o; $('#dlg-confirm').click(); await wait(400);
      const want1 = _prJ(Object.assign({ id: base[1].id, code: base[1].code, name: base[1].name, notes: base[1].notes }, JSON.parse(T.dest), JSON.parse(T.lay), JSON.parse(T.aux)));
      const got1 = _prJ(presets[1]) === want1, steps = _undoStack.length - n0, othersSame = _prOthers(1) === others;
      const row = $('#canvas-area .preset-row[data-pid="' + presets[1].id + '"]'); const drawn = [$$('.layer-chip', row).length, $$('.screen-hidden', row).length, $$('.screen-box', row).length];
      await restore(); ['colors', 'bgs', 'bgNames'].forEach(f => { if (presets[2][f]) delete presets[2][f][screens[0].id]; });   // P03 now inherits the show-wide background of the first destination, name included
      dsms[0].name = 'STAGE MON';   // a name that does not start with AUX / DSM, so the type is read from P01 (restore() puts the name back)
      await _prDirty(0); const others0 = _prOthers(0), keep = _prJ(presets[0].bgNames), keepType = _prJ(presets[0].dsmType), type0 = _sysResolveDsmType(dsms[0]), names = () => JSON.stringify(presets.slice(1).map(q => screens.map(s => getBgName(q.id, s.id)))), names0 = names(), inherits = getBgName(presets[2].id, screens[0].id); o = await _prOpen(0); if (o !== true) return o; const t0 = $('#dlg-box h3').textContent; $('#dlg-confirm').click(); await wait(400);
      const want0 = _prJ(Object.assign({ id: base[0].id, code: base[0].code, name: base[0].name, notes: base[0].notes, bgNames: JSON.parse(keep), dsmType: JSON.parse(keepType) }, JSON.parse(T.dest), JSON.parse(T.lay), JSON.parse(T.aux)));   // P01's bgNames and dsmType are show-wide values: kept on purpose
      return is([got1, steps, othersSame, drawn, t0, _prJ(presets[0]) === want0, _prOthers(0) === others0, !!inherits, names() === names0, [type0, _sysResolveDsmType(dsms[0])]], [true, 1, true, [0, 0, screens.length], 'Reset P01 WALK-IN?', true, true, true, true, ['DSM', 'DSM']], 'P02 equals Quick Setup / undo steps / others untouched / chips, ghosts, boxes drawn / P01 title / P01 equals Quick Setup + its show-wide BG names and AUX types / P02 to P05 untouched / P03 inherits a BG name from P01 / every BG name read in P02 to P05 unchanged / AUX type I/O Patch reads, before and after');
    } finally { _prCancel(); await restore(); }
  });
  await check('Reset (preset header): a show built by Quick Setup: dirty P02, Reset All, and P02 is again exactly the preset Quick Setup built (save and reload keeps it)', async () => {
    try {
      newShow(); await wait(500); okDialogs(); await wait(500); okDialogs(); if (screens.length || presets.length) return 'New Show did not clear the show';
      if (getComputedStyle($('#qs-modal')).display === 'none') { openQS(); await wait(400); }
      $('#qs-show').value = 'RESET PROOF'; fire($('#qs-show'), 'input'); qsAdjust('presets', 1); qsAdjust('dsms', 1); confirmQS(); await wait(700); okDialogs(); await wait(200);
      if (presets.length < 2 || screens.length < 2 || !dsms.length) return 'Quick Setup built ' + presets.length + ' presets / ' + screens.length + ' destinations / ' + dsms.length + ' AUX';
      const fresh1 = _prJ(presets[1]), fresh0 = _prJ(presets[0]); await _prDirty(1); if (_prJ(presets[1]) === fresh1) return 'the setup did not change the preset';
      const o = await _prOpen(1); if (o !== true) return o; const n0 = _undoStack.length; $('#dlg-confirm').click(); await wait(400); const equal = _prJ(presets[1]) === fresh1, p01 = _prJ(presets[0]) === fresh0, steps = _undoStack.length - n0;
      _applyProjectText(JSON.stringify(getProjectState())); await wait(700); okDialogs(); const reloaded = _prJ(presets[1]) === fresh1;
      const again = await _prOpen(1); const note = again === true ? [$('#dlg-confirm').disabled, /Nothing to reset/.test($('#dlg-tick-note').textContent)] : again;
      return is([equal, p01, steps, reloaded, note], [true, true, 1, true, [true, true]], 'P02 equals the Quick Setup preset / P01 untouched / undo steps / equal after save + load / a clean preset says nothing to reset');
    } finally { _prCancel(); try { closeQS(); } catch (e) {} await restore(); }
  });
  await check('Reset (preset header): nothing to reset for what is ticked greys Reset, says so and records no undo step; ticking a group with work to do makes it live', async () => {
    await restore(); setL(presets[1].id, screens[0].id, 4, 'CLOCK'); scheduleRender(); await wait(250); const before = JSON.stringify(presets[1]), n0 = _undoStack.length;
    try {
      const o = await _prOpen(1); if (o !== true) return o; _prTick('all').click(); await wait(60); _prTick('dest').click(); await wait(60);
      const a = [$('#dlg-confirm').disabled, /Nothing to reset/.test($('#dlg-tick-note').textContent)]; $('#dlg-confirm').click(); await wait(200); const open = dlgOpen();
      _prTick('layers').click(); await wait(60); const b = [$('#dlg-confirm').disabled, $('#dlg-tick-note').textContent.trim()]; _prCancel(); await wait(200);
      return is([a, open, b, JSON.stringify(presets[1]) === before, _undoStack.length - n0], [[true, true], true, [false, ''], true, 0], 'clean strip only: greyed + note / window stays open / with Reset Layers: live + no note / preset untouched / undo steps');
    } finally { _prCancel(); await restore(); }
  });
  await check('Reset (preset header): keys: Tab stays inside the window (the picked layer behind it does not change), Shift+Tab goes back, Enter = Reset, Enter on Cancel = Cancel', async () => {
    await restore(); await _prDirty(1); const p0 = presets[1], D = { dest: _prPick(p0, _PR_DEST), aux: _prPick(p0, _PR_AUX) }, n0 = _undoStack.length; const kd = (k, shift) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: !!shift, bubbles: true, cancelable: true }));
    try {
      let o = await _prOpen(1); if (o !== true) return o; await wait(80); const before = JSON.stringify(presets[1]); kd('Tab', true); const onCancel = document.activeElement.id; kd('Enter'); await wait(300);
      const cancelled = [onCancel, dlgOpen(), JSON.stringify(presets[1]) === before, _undoStack.length - n0];   // Shift+Tab from Reset = Cancel; Enter there cancels
      o = await _prOpen(1); if (o !== true) return o; await wait(80); selLayer = { pid: presets[1].id, sid: screens[0].id, n: 1 }; const f = [document.activeElement.id];
      kd('Tab'); f.push(document.activeElement.id); _prTick('all').click(); await wait(60); kd('Tab'); f.push(document.activeElement.id); kd('Tab'); f.push(document.activeElement.id); _prTick('layers').click(); await wait(60); kd('Tab', true); f.push(document.activeElement.id);
      const layerN = selLayer ? selLayer.n : null; kd('Enter'); await wait(400); const p = presets[1];
      return is([cancelled, f, layerN, dlgOpen(), _prPick(p, _PR_LAY) === _prJ({ layers: {}, active: {} }), _prPick(p, _PR_DEST) === D.dest, _prPick(p, _PR_AUX) === D.aux, _undoStack.length - n0, selLayer],
        [['dlg-cancel', false, true, 0], ['dlg-confirm', 'dlg-tick-all', 'dlg-tick-dest', 'dlg-tick-layers', 'dlg-tick-dest'], 1, false, true, true, true, 1, null], 'Enter on Cancel (focus, window, preset untouched, undo steps) / focus walk / picked layer during Tab / window closed by Enter / layers cleared / destinations kept / AUX kept / undo steps / picked layer dropped');
    } finally { _prCancel(); selLayer = null; await restore(); }
  });
  await check('Reset (preset header): the Advanced page tile has the same Reset: same window above the page, Escape closes only the window, Reset All clears the preset and redraws the tile', async () => {
    await restore(); await _prDirty(1); const T = _prTarget(), n0 = _undoStack.length;
    try {
      openFullscreen(presets[1].id); await wait(800); let o = await _prOpen(1, '#fs-overlay'); if (o !== true) return o;
      const r = $('#dlg-box').getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + 20); const above = !!(top && top.closest('#dlg-box')); const ttl = $('#dlg-box h3').textContent;
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await wait(300); const esc = [dlgOpen(), !!fsPresetId, _undoStack.length - n0];
      o = await _prOpen(1, '#fs-overlay'); if (o !== true) return o; $('#dlg-confirm').click(); await wait(500); const p = presets[1]; const row = $('#fs-overlay .preset-row[data-pid="' + p.id + '"]');
      return is([ttl, above, esc, _prPick(p, _PR_DEST) === T.dest, _prPick(p, _PR_LAY) === T.lay, _prPick(p, _PR_AUX) === T.aux, row ? $$('.layer-chip', row).length : -1, _undoStack.length - n0],
        ['Reset P02 WELCOME?', true, [false, true, 0], true, true, true, 0, 1], 'title / window above the Advanced page / Escape: window, page, undo steps / destinations / layers / AUX / chips on the Advanced tile / undo steps');
    } finally { _prCancel(); try { closeFullscreen(); } catch (e) {} await wait(300); await restore(); }
  });


  // ── the ONE dialog is modal + preset Reset on the first preset (16ks preset-reset-fix, attacker defects 1 to 4) ───────
  // WHERE: paste this whole block into tests/flows_probe.js straight AFTER the 16ks preset-reset block (it uses that
  //   block's helpers _prBtn, _prTick, _prOpen, _prCancel, _prDirty, _prTarget, _prJ, _prPick, _prOthers, _PR_*), still
  //   BEFORE the line "// ── Video Presets, Advanced ──…". The REPLACES section at the end takes the place of ONE check
  //   of that block (named there). Needs no media; the one Advanced check opens and closes the Advanced page itself.
  // Every check FAILS on the 16ks base page (r16ks/base4) and PASSES on the fixed page. Every check ends with restore(),
  // closes any dialog it opened, puts selLayer / sel back to null and touches no Modifiers switch and not _lfxLock.
  // Synthetic events on purpose (the probe runs inside the page). The guard under test sits on window in the capture
  // phase, which a bubbling synthetic key or click passes exactly like a real one; the browser's own default actions
  // (Space presses a button, Tab moves focus) are proven with real keys in the round's CDP proof (prove.mjs).
  const _pfKey = (k, o) => { const ev = new KeyboardEvent('keydown', Object.assign({ key: k, code: k === ' ' ? 'Space' : k, bubbles: true, cancelable: true }, o || {})); (document.activeElement || document.body).dispatchEvent(ev); return ev; };
  const _pfKeyUp = (k, o) => { const ev = new KeyboardEvent('keyup', Object.assign({ key: k, code: k === ' ' ? 'Space' : k, bubbles: true, cancelable: true }, o || {})); (document.activeElement || document.body).dispatchEvent(ev); return ev; };
  const _pfClick = (el, detail) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, detail: detail }));
  const _pfMeta = { metaKey: true }, _pfCtrl = { ctrlKey: true };
  // the page shortcuts that used to act behind a dialog: nudge, resize, delete, jump to preset N, paste, undo, redo, new preset, next layer
  const _pfPageKeys = async () => { for (const a of [['ArrowRight'], ['ArrowDown', { shiftKey: true }], ['3'], ['v', _pfMeta], ['v', _pfCtrl], ['z', _pfMeta], ['y', _pfCtrl], ['N', { metaKey: true, shiftKey: true }], ['Backspace'], ['Delete']]) { _pfKey(a[0], a[1]); await wait(30); } await wait(700); };
  const _pfScroll = () => { const c = $('#canvas-area'); return [c ? Math.round(c.scrollTop) : 0, Math.round((document.scrollingElement || document.body).scrollTop)]; };
  const _pfSnap = () => JSON.stringify([presets, screens, dsms]);
  // a picked layer on P02 (what the owner has when he reaches for Reset), a small layer so a nudge would show, and a copied preset so paste would show
  const _pfArm = async () => { await restore(); const p = presets[1], s = screens[0]; setL(p.id, s.id, 1, 'CAM 1'); setLayerSize(p.id, s.id, 1, 0.4, 0.4, 0.1, 0.1); copyPreset(presets[2].id); selLayer = { pid: p.id, sid: s.id, n: 1 }; sel = null; scheduleRender(); await wait(300); };
  const _pfDisarm = async () => { _prCancel(); await wait(150); _prCancel(); selLayer = null; sel = null; try { _copiedPreset = null; } catch (e) {} await restore(); };

  await check('Dialog is modal (Reset window): with a layer picked behind it, arrows, 1-9, Cmd/Ctrl+V, Cmd+Z, Ctrl+Y, Cmd+Shift+N, Backspace and Delete change nothing, record no undo step, do not scroll and keep the layer picked; ONE undo after Reset brings back the state the window opened on', async () => {
    await _pfArm();
    try {
      const o = await _prOpen(1); if (o !== true) return o; await wait(80);
      const before = _pfSnap(), n0 = _undoStack.length, sc0 = _pfScroll(), count0 = presets.length; await _pfPageKeys();
      const behind = [_pfSnap() === before, _undoStack.length - n0, _pfScroll(), presets.length - count0, !!selLayer && selLayer.n, dlgOpen()];
      $('#dlg-confirm').click(); await wait(400); const steps = _undoStack.length - n0; doUndo(); await wait(300);
      return is([behind, steps, _pfSnap() === before], [[true, 0, sc0, 0, 1, true], 1, true], 'behind the window (show untouched / undo steps / scroll / presets added / picked layer / window still open) / undo steps of the reset / one Undo = the state the window opened on');
    } finally { await _pfDisarm(); }
  });
  await check('Dialog is modal (any confirm, any alert): the same page keys do nothing behind a confirm and behind an alert, and Tab stays inside the window instead of stepping to the next layer', async () => {
    const got = [];
    try {
      for (const kind of ['confirm', 'alert']) {
        await _pfArm(); setL(presets[1].id, screens[0].id, 2, 'GFX A'); scheduleRender(); await wait(200);
        if (kind === 'confirm') showConfirm({ title: 'Gate confirm', message: 'x' }); else showAlert({ title: 'Gate alert', message: 'x' }); await wait(120);
        const before = _pfSnap(), n0 = _undoStack.length, sc0 = _pfScroll(); await _pfPageKeys(); _pfKey('Tab'); await wait(60);
        const inBox = !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#dlg-box'));
        got.push([kind, _pfSnap() === before, _undoStack.length - n0, JSON.stringify(_pfScroll()) === JSON.stringify(sc0), selLayer ? selLayer.n : null, inBox, dlgOpen()]); _prCancel(); await wait(200);
      }
      return is(got, [['confirm', true, 0, true, 1, true, true], ['alert', true, 0, true, 1, true, true]], 'kind / show untouched / undo steps / no scroll / picked layer still L1 (Tab did not step it) / focus inside the window after Tab / window still open');
    } finally { await _pfDisarm(); }
  });
  await check('Dialog is modal (its own keys still work): Escape cancels, Enter confirms, Tab and Shift+Tab walk Cancel and the main button of a plain confirm, and nothing is held back once the window is closed', async () => {
    await _pfArm(); let yes = 0, no = 0;
    try {
      showConfirm({ title: 'Gate confirm', message: 'x', onConfirm: () => { yes++; }, onCancel: () => { no++; } }); await wait(120);
      const f = [document.activeElement.id]; _pfKey('Tab'); f.push(document.activeElement.id); _pfKey('Tab'); f.push(document.activeElement.id); _pfKey('Tab', { shiftKey: true }); f.push(document.activeElement.id);
      _pfKey('Escape'); await wait(250); const afterEsc = [dlgOpen(), yes, no];
      showConfirm({ title: 'Gate confirm', message: 'x', onConfirm: () => { yes++; }, onCancel: () => { no++; } }); await wait(120); _pfKey('Enter'); await wait(250); const afterEnter = [dlgOpen(), yes, no];
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); const lay0 = JSON.stringify(presets[1].layerSizes), n0 = _undoStack.length; _pfKey('ArrowRight'); await wait(700);   // window closed: the arrow key nudges the picked layer again
      return is([f, afterEsc, afterEnter, JSON.stringify(presets[1].layerSizes) !== lay0, _undoStack.length - n0 >= 1], [['dlg-confirm', 'dlg-cancel', 'dlg-confirm', 'dlg-cancel'], [false, 0, 1], [false, 1, 1], true, true], 'focus walk / after Escape (open, confirmed, cancelled) / after Enter / arrow key moves the picked layer once the window is closed / with an undo step');
    } finally { await _pfDisarm(); }
  });
  await check('Dialog is modal (a HELD Enter never answers): Enter held down on the focused amber Reset opens the window and its auto-repeats do not answer it; a fresh Enter then resets, in one undo step', async () => {
    await restore(); await _prDirty(1); const before = JSON.stringify(presets[1]), n0 = _undoStack.length;
    try {
      const b = _prBtn(1); if (!b) return 'no Reset button on the tile'; b.focus(); b.click(); await wait(60);   // what the browser does on the first Enter key-down on a focused button
      const evs = []; for (let i = 0; i < 5; i++) { evs.push(_pfKey('Enter', { repeat: true }).defaultPrevented); await wait(35); } await wait(300);
      const held = [dlgOpen(), JSON.stringify(presets[1]) === before, _undoStack.length - n0, evs.every(Boolean)];
      _pfKey('Enter'); await wait(400);
      return is([held, dlgOpen(), JSON.stringify(presets[1]) !== before, _undoStack.length - n0], [[true, true, 0, true], false, true, 1], 'while Enter repeats (window open / preset untouched / undo steps / the repeat cannot press the focused button) / window after a fresh Enter / preset reset / undo steps');
    } finally { _prCancel(); await restore(); }
  });
  await check('Dialog is modal (Advanced page, a clip picked): Space on a dialog button is left to the button: the page neither takes the key-down (play / pan) nor cancels the key-up (which is what presses the button)', async () => {
    await restore(); const got = [];
    try {
      customLibrary.push({ l: 'GATE CLIP', kind: 'video' }); setL(presets[1].id, screens[0].id, 1, 'GATE CLIP'); openFullscreen(presets[1].id); await wait(800); selLayer = { pid: presets[1].id, sid: screens[0].id, n: 1 };
      if (!_fsTargetKey()) return 'setup: the Advanced page has no clip target';
      for (const kind of ['reset', 'alert']) {
        if (kind === 'reset') { const o = await _prOpen(1, '#fs-overlay'); if (o !== true) return o; $('#dlg-cancel').focus(); } else { showAlert({ title: 'Gate alert', message: 'x' }); await wait(120); $('#dlg-confirm').focus(); }
        const d = _pfKey(' '), u = _pfKeyUp(' '); got.push([kind, d.defaultPrevented, u.defaultPrevented, _fsSpaceDown]); _prCancel(); await wait(200);
      }
      return is(got, [['reset', false, false, false], ['alert', false, false, false]], 'kind / Space key-down taken by the page / Space key-up cancelled by the page / page pan mode on');
    } finally { _prCancel(); selLayer = null; sel = null; const i = customLibrary.findIndex(c => c && c.l === 'GATE CLIP'); if (i >= 0) customLibrary.splice(i, 1); try { closeFullscreen(); } catch (e) {} await wait(300); await restore(); }
  });
  await check('Reset (preset header): a double-click on Reset leaves the window open: the 2nd (and 3rd) click of the gesture that opened it is not for the window, whether it lands on the dimmed page or on the window\'s Reset button; a new click outside still cancels at once and a double-click inside the window is two clicks', async () => {
    await restore(); await _prDirty(1); const before = JSON.stringify(presets[1]), n0 = _undoStack.length; const got = [];
    try {
      const b = _prBtn(1); if (!b) return 'no Reset button on the tile';
      _pfClick(b, 1); await wait(120); _pfClick($('#dlg-overlay'), 2); await wait(100); got.push(dlgOpen());            // double-click, 2nd click on the dimmed page
      _pfClick($('#dlg-overlay'), 3); await wait(100); got.push(dlgOpen());                                                // triple-click
      _pfClick($('#dlg-overlay'), 1); await wait(250); got.push(dlgOpen());                                                // a NEW click outside: cancels, with no waiting time
      _pfClick(b, 1); await wait(450); _pfClick($('#dlg-confirm'), 2); await wait(300); got.push(dlgOpen(), JSON.stringify(presets[1]) === before);   // slow double-click, 2nd click lands on the window's Reset button: no reset
      _pfClick($('#dlg-tick-dest'), 1); _pfClick($('#dlg-tick-dest'), 2); await wait(100); got.push($('#dlg-tick-dest').checked);   // a double-click INSIDE the window is two clicks: un-tick, tick
      _pfClick($('#dlg-tick-dest'), 1); await wait(60); got.push($('#dlg-tick-dest').checked, $('#dlg-tick-all').checked);
      _pfClick($('#dlg-cancel'), 1); await wait(250); got.push(dlgOpen());
      return is([got, JSON.stringify(presets[1]) === before, _undoStack.length - n0], [[true, true, false, true, true, true, false, false, false], true, 0], 'open after double-click / after triple-click / after a new outside click / after a slow double-click onto Reset + preset untouched / tick box after a double-click inside / after one more click: box, Reset All / after Cancel // preset untouched / undo steps');
    } finally { _prCancel(); await restore(); }
  });
  await check('Reset (preset header) on the FIRST preset: the window promises only what a per-preset reset does: a rotation / name given on P01 stays (show-wide), the sentences and the "Nothing to reset" note say so, and P02 names what stays too', async () => {
    await restore();
    try {
      let o = await _prOpen(0); if (o !== true) return o; $('#dlg-confirm').click(); await wait(400);                        // P01 back to the Quick Setup state
      setRotation(presets[0].id, screens[0].id, 90); homeSetScreenName(presets[0].id, screens[1].id, 'MY CENTER'); scheduleRender(); await wait(300);   // on P01 the app writes these to the destination
      const wide = JSON.stringify(screens); o = await _prOpen(0); if (o !== true) return o;
      const hints = $$('#dlg-box .dlg-tick-txt i').map(x => x.textContent), note = $('#dlg-tick-note').textContent, greyed = $('#dlg-confirm').disabled; _prCancel(); await wait(250);
      const first = [greyed, /Nothing to reset/.test(note) && /whole show/.test(note) && /Destination Properties/.test(note), /Stays: a destination's size, rotation and name/.test(hints[1]) && !/placement, rotation/.test(hints[1]), /Stays: a destination's background/.test(hints[2]), /Destination Properties/.test(hints[0]), JSON.stringify(screens) === wide, screens[0].rotation, screens[1].name];
      o = await _prOpen(1); if (o !== true) return o; const h2 = $$('#dlg-box .dlg-tick-txt i').map(x => x.textContent); _prCancel(); await wait(250);
      return is([first, /placement, rotation, AOI/.test(h2[1]) && /Stays: a destination's size, and a rotation or name given on the first preset/.test(h2[1])], [[true, true, true, true, true, true, 90, 'MY CENTER'], true], 'P01: greyed / note names the whole show + Destination Properties / Destinations sentence / Layers sentence / Reset All sentence / destinations untouched by opening / rotation kept / name kept // P02 Destinations sentence');
    } finally { _prCancel(); await restore(); }
  });
  await check('Reset (preset header): Reset AUX on the FIRST preset keeps its AUX / DSM type map (a show from an older build: I/O Patch reads it show-wide), still clears P01\'s own AUX content in one undo step, and on P02 the type override is cleared as before', async () => {
    await restore(); const d = dsms[0];
    try {
      d.name = 'STAGE MON'; presets[0].dsmType = {}; presets[0].dsmType[d.id] = 'DSM'; presets[1].dsmType = {}; presets[1].dsmType[d.id] = 'DSM'; presets[0].dsmContent = {}; presets[0].dsmContent[d.id] = 'PROMPTER X'; scheduleRender(); await wait(250);
      const t0 = _sysResolveDsmType(dsms[0]), n0 = _undoStack.length; let o = await _prOpen(0); if (o !== true) return o;
      _prTick('all').click(); await wait(60); _prTick('aux').click(); await wait(60); $('#dlg-confirm').click(); await wait(400);
      const a = [t0, _sysResolveDsmType(dsms[0]), JSON.stringify(presets[0].dsmType || null), JSON.stringify(presets[0].dsmContent || null), _undoStack.length - n0];
      o = await _prOpen(0); if (o !== true) return o; _prTick('all').click(); await wait(60); _prTick('aux').click(); await wait(60); const again = [$('#dlg-confirm').disabled, /Nothing to reset/.test($('#dlg-tick-note').textContent)]; _prCancel(); await wait(250);
      o = await _prOpen(1); if (o !== true) return o; _prTick('all').click(); await wait(60); _prTick('aux').click(); await wait(60); $('#dlg-confirm').click(); await wait(400);
      const want = {}; want[d.id] = 'DSM';
      return is([a, again, JSON.stringify(presets[1].dsmType || null), _sysResolveDsmType(dsms[0])], [['DSM', 'DSM', JSON.stringify(want), 'null', 1], [true, true], 'null', 'DSM'], 'P01: type before / type after Reset AUX / P01.dsmType / P01.dsmContent / undo steps // Reset AUX again: greyed + nothing to reset // P02.dsmType after its Reset AUX / type still read show-wide');
    } finally { _prCancel(); await restore(); }
  });


  // ── LAYER STRIP (round 16ks, owner decision 10) ─────────────────────────────────────────────────────────────────
  // WHERE: paste this whole block into tests/flows_probe.js in the Simple section, straight BEFORE the line
  //   "// ── Video Presets, Advanced ──..."   (the setup right after that line loads test media; none of these checks needs
  //   media, and the one Advanced check below opens and closes the Advanced page itself, so nothing can ever play).
  // Every check FAILS on build 16kq (no strip, no ghost, no top-layer tag) and PASSES on the patched page.
  // Every check leaves the show, the selection, the panels, the a11y class and the page as it found them (restore()).
  // The probe runs inside the page, so clicks are dispatched events; each click target is first proven to be the TOP element at
  // its centre (lsTop), which is what makes a real click land there. The real-mouse proof is prove.mjs in the round folder.
  // REPLACES: nothing. No existing check in tests/flows_probe.js or tests/mobile_probe.js changes state with this patch
  //   (flows: 218 of 218 still pass, mobile: 61 of 61). The three Look Book goldens move (the top-layer tag): regenerate them.
  const lsP = i => presets[i].id, lsS = i => screens[i].id;
  const lsBox = (scope, pid, n) => $(scope + ' .preset-row[data-pid="' + pid + '"] .lb-lstrip .lb-lbox[data-n="' + n + '"]');
  const lsStrip = (scope, pid) => $(scope + ' .preset-row[data-pid="' + pid + '"] .lb-lstrip');
  const lsChip = (scope, pid, sid, n) => $(scope + ' .layer-chip[data-pid="' + pid + '"][data-sid="' + sid + '"][data-lid="' + n + '"]');
  const lsDest = (scope, pid, sid) => $(scope + ' .screen-box[data-pid="' + pid + '"][data-sid="' + sid + '"]');
  const lsTop = el => { if (!el) return false; const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === el || el.contains(t)); };
  const lsShow = (scope, pid) => { if (scope !== '#canvas-area') return; const r = $(scope + ' .preset-row[data-pid="' + pid + '"]'), ca = $('#canvas-area'); if (r && ca) ca.scrollTop += r.getBoundingClientRect().top - ca.getBoundingClientRect().top - 4; };
  const lsReveal = (scope, pid, n) => { const s = lsStrip(scope, pid), b = lsBox(scope, pid, n); if (!s || !b) return; const a = s.getBoundingClientRect(), r = b.getBoundingClientRect(); if (r.left < a.left + 2) s.scrollLeft -= (a.left - r.left + 4); else if (r.right > a.right - 2) s.scrollLeft += (r.right - a.right + 4); };
  const lsHit = async (scope, pid, n, type) => { lsShow(scope, pid); lsReveal(scope, pid, n); await wait(60); const b = lsBox(scope, pid, n); if (!b) return 'no strip box ' + n; if (!lsTop(b)) return 'strip box ' + n + ' is covered'; if (type === 'dblclick') { b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })); await wait(40); const b2 = lsBox(scope, pid, n); (b2 || b).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 })); await wait(40); (lsBox(scope, pid, n) || b).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 })); } else b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })); await wait(300); return true; };
  const lsClickEl = async el => { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })); await wait(300); };
  const lsClear = async () => { try { closeLayerPanel(); } catch (e) {} try { closeScreenPanel(); } catch (e) {} doSelect(null, null); selLayer = null; hideMoveSymbol(); render(); await wait(300); };
  const lsCase = async () => { const p = lsP(2), s = lsS(1); setL(p, s, 1, 'PPT A'); setLayerSize(p, s, 1, 0.3, 0.3, 0.06, 0.1); setL(p, s, 2, 'CLOCK'); setLayerSize(p, s, 2, 0.3, 0.3, 0.62, 0.1); setL(p, s, 3, 'CAM 2'); setLayerSize(p, s, 3, 1, 1, 0, 0); render(); await wait(350); };   // L1 and L2 are small PIPs under a full-screen L3
  const lsCss = el => { if (!el) return null; const cs = getComputedStyle(el); return [el.classList.contains('lb-ghost'), cs.opacity, cs.pointerEvents]; };
  const lsGhost = () => (typeof _lsGhost === 'undefined') ? 'no ghost state' : (_lsGhost ? { pid: _lsGhost.pid, sid: _lsGhost.sid, n: _lsGhost.n } : null);
  const lsArm = async scope => { await lsClear(); lsShow(scope, lsP(2)); await lsClickEl(lsChip(scope, lsP(2), lsS(1), 3)); const r = await lsHit(scope, lsP(2), 1); return r === true && !!lsGhost() && lsGhost() !== 'no ghost state' ? true : 'the ghost view could not be started: ' + r; };
  const lsEnded = async () => { await wait(300); return [lsGhost(), $$('.lb-ghost').length]; };

  await check('Layer strip: every preset header has BG and one box per layer column between Notes and Actions, grey and inert until a destination of that preset is picked', async () => {
    await lsClear(); const bad = [];
    presets.forEach(p => { const h = $('#canvas-area .preset-row[data-pid="' + p.id + '"] .preset-header'), s = h && h.querySelector('.lb-lstrip'); if (!s) { bad.push(p.code + ': no strip'); return; }
      const r = s.getBoundingClientRect(), n = h.querySelector('input[name="p-notes"]').getBoundingClientRect(), a = h.querySelector('.pr-actions').getBoundingClientRect();
      const labels = $$('.lb-lbox', s).map(b => b.textContent).join(' '), want = ['BG'].concat(getLayerNums(p.id).map(x => 'L' + x)).join(' ');
      if (!(r.left >= n.right - 1 && r.right <= a.left + 1)) bad.push(p.code + ': not between Notes and Actions'); if (labels !== want) bad.push(p.code + ': boxes ' + labels);
      if (!s.classList.contains('inert') || s.querySelector('.lb-lbox.has,.lb-lbox.on')) bad.push(p.code + ': not grey / inert'); });
    const b = lsBox('#canvas-area', lsP(1), 1); if (b) { b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); await wait(200); }
    return is([bad, sel, selLayer], [[], null, null], 'strips / selection after a click on an inert box');
  });
  await check('Layer strip: picking a chip lights that destination only (amber = assigned, the picked layer slow-pulses, tooltips name the content) and a plain canvas pick ghosts nothing', async () => {
    await lsClear(); const p = lsP(1), s = lsS(0); lsShow('#canvas-area', p); await lsClickEl(lsChip('#canvas-area', p, s, 1)); const st = lsStrip('#canvas-area', p); if (!st) return 'no strip in the preset header';
    const bx = $$('.lb-lbox', st); const on = bx.find(b => b.classList.contains('on')); const cs = on ? getComputedStyle(on) : null;
    const out = is([st.classList.contains('inert'), bx.map(b => b.classList.contains('has')), bx.map(b => b.title), bx.map(b => b.getAttribute('aria-label')), on && on.textContent, cs && cs.animationName, cs && cs.animationDuration, lsStrip('#canvas-area', lsP(2)).classList.contains('inert'), lsGhost(), $$('.lb-ghost').length],
      [false, [true, true, false, false, false], ['BG: LOGO', 'L1: CAM 1', 'L2: empty', 'L3: empty', 'L4: empty'], ['BG: LOGO', 'L1: CAM 1', 'L2: empty', 'L3: empty', 'L4: empty'], 'L1', 'lb-lpulse', '2s', true, null, 0], 'inert / amber / tooltips / aria-labels / pulsing box / animation / period / the next preset stays inert / ghost / ghosted elements');
    await lsClear(); return out;
  });
  await check('Layer strip: BG picks a destination that a full-screen layer covers (move arrows, no undo step, show untouched) and shows its layers at 15 %, click-through', async () => {
    await lsClear(); const p = lsP(1), s = lsS(0); lsShow('#canvas-area', p); const before = JSON.stringify(getProjectState()), u0 = _undoStack.length, d0 = _isDirty;
    const box = lsDest('#canvas-area', p, s); const r0 = box.getBoundingClientRect(); const covered = !!document.elementFromPoint(r0.left + r0.width / 2, r0.top + r0.height / 2).closest('.layer-chip');
    await lsClickEl(lsChip('#canvas-area', p, s, 1)); const viaCanvas = [sel, selLayer && selLayer.n];
    const hit = await lsHit('#canvas-area', p, 0); if (hit !== true) { await lsClear(); return hit; }
    const r = lsDest('#canvas-area', p, s).getBoundingClientRect(); const under = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 3);
    const out = is([covered, viaCanvas, sel, selLayer, !!$('#canvas-area .move-symbol'), lsGhost(), lsCss(lsChip('#canvas-area', p, s, 1)), !!under && !under.closest('.layer-chip') && !!under.closest('.screen-box'), lsBox('#canvas-area', p, 0).classList.contains('on'), _undoStack.length - u0, JSON.stringify(getProjectState()) === before, _isDirty === d0],
      [true, [null, 1], { pid: p, sid: s }, null, true, { pid: p, sid: s, n: 0 }, [true, '0.15', 'none'], true, true, 0, true, true], 'covered / canvas click picks the layer / destination picked / no layer picked / move arrows / ghost / layer style / a click now reaches the destination / BG pulses / undo steps / show unchanged / dirty flag');
    await lsClear(); return out;
  });
  await check('Layer strip: double-click on BG opens Destination Properties, double-click on a layer opens its layer panel, and the ghost stays while the panel is open', async () => {
    await restore(); await lsCase(); await lsClear(); const p = lsP(2), s = lsS(1); lsShow('#canvas-area', p); await lsClickEl(lsChip('#canvas-area', p, s, 3));
    let hit = await lsHit('#canvas-area', p, 0, 'dblclick'); if (hit !== true) { await restore(); return hit; } const sp = $('#screen-panel'); const a = [!!sp && sp.dataset.sid === s, lsGhost() && lsGhost().n]; closeScreenPanel();
    hit = await lsHit('#canvas-area', p, 1, 'dblclick'); if (hit !== true) { await restore(); return hit; } const lp = $('#layer-panel'); const b = [!!lp && lp.dataset.sid === s && lp.dataset.n === '1', lsGhost() && lsGhost().n, lsCss(lsChip('#canvas-area', p, s, 3))]; closeLayerPanel();
    await lsClear(); await restore(); return is([a, b], [[true, 0], [true, 1, [true, '0.15', 'none']]], 'BG double-click: panel, ghost / L1 double-click: panel, ghost, L3');
  });
  await check('Layer strip: a layer under a full-screen layer is picked from the strip and can be dragged on the canvas; the layers above go 15 % click-through, their Level is untouched, the ghost follows a lower pick', async () => {
    await restore(); await lsCase(); await lsClear(); const p = lsP(2), s = lsS(1), sc = '#canvas-area'; lsShow(sc, p);
    const c1 = lsChip(sc, p, s, 1); const blocked = !lsTop(c1); await lsClickEl(lsChip(sc, p, s, 3)); const before = JSON.stringify(getProjectState()), u0 = _undoStack.length;
    const hit = await lsHit(sc, p, 1); if (hit !== true) { await restore(); return hit; }
    const a = [selLayer, lsGhost(), lsCss(lsChip(sc, p, s, 1)), lsCss(lsChip(sc, p, s, 2)), lsCss(lsChip(sc, p, s, 3)), lsTop(lsChip(sc, p, s, 1)), JSON.stringify(getProjectState()) === before, _undoStack.length - u0, getLayerFx(p, s, 3).op];
    const chip = lsChip(sc, p, s, 1), r = chip.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, z0 = Object.assign({}, getLayerSize(p, s, 1));
    chip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })); for (let i = 1; i <= 5; i++) { window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x + 12 * i, clientY: y + 8 * i })); await wait(15); } window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x + 60, clientY: y + 40 })); await wait(350);
    const z1 = getLayerSize(p, s, 1); const moved = z1.xf > z0.xf + 0.01 && z1.yf > z0.yf + 0.01; const still = lsCss(lsChip(sc, p, s, 3));
    await lsHit(sc, p, 2); const g2 = lsGhost() && lsGhost().n; const l2 = lsCss(lsChip(sc, p, s, 2)); await lsClickEl(lsChip(sc, p, s, 1)); await wait(100); const follow = [selLayer && selLayer.n, lsGhost() && lsGhost().n, lsCss(lsChip(sc, p, s, 2))];
    await lsClear(); await restore();
    return is([blocked, a, moved, still, g2, l2, follow], [true, [{ pid: p, sid: s, n: 1 }, { pid: p, sid: s, n: 1 }, [false, '1', 'auto'], [true, '0.15', 'none'], [true, '0.15', 'none'], true, true, 0, 256], true, [true, '0.15', 'none'], 2, [false, '1', 'auto'], [1, 1, [true, '0.15', 'none']]],
      'L1 unreachable before / after the strip click (picked, ghost, L1, L2, L3, L1 reachable, show unchanged, undo steps, L3 Level) / dragged / L3 still ghosted after the drag / ghost on L2 / L2 solid / canvas pick of L1 moves the ghost');
  });
  await check('Layer strip: the ghost ends on another destination, on empty canvas, on a cleared selection, on Escape and when the page is left', async () => {
    await restore(); await lsCase(); const p = lsP(2), s = lsS(1), sc = '#canvas-area', out = [];
    let a = await lsArm(sc); if (a !== true) { await restore(); return a; } await lsClickEl(lsDest(sc, p, lsS(0))); out.push(await lsEnded());
    a = await lsArm(sc); if (a !== true) { await restore(); return a; } const v = $(sc + ' .preset-row[data-pid="' + p + '"] .screens-visual'); await lsClickEl(v); out.push(await lsEnded());
    a = await lsArm(sc); if (a !== true) { await restore(); return a; } await lsHit(sc, p, 0); const row = $('#tbody tr[data-pid="' + p + '"][data-sid="' + s + '"]'); row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); out.push(await lsEnded());
    a = await lsArm(sc); if (a !== true) { await restore(); return a; } document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true })); out.push(await lsEnded());
    a = await lsArm(sc); if (a !== true) { await restore(); return a; } openFullscreen(p); await wait(700); out.push(await lsEnded()); closeFullscreen(); await wait(400);
    a = await lsArm(sc); if (a !== true) { await restore(); return a; } openWireMode(); await wait(700); out.push(await lsEnded()); closeWireMode(); await wait(400);
    await lsClear(); await restore(); return is(out, [[null, 0], [null, 0], [null, 0], [null, 0], [null, 0], [null, 0]], 'ghost / ghosted elements after: another destination, empty canvas, cleared selection, Escape, Advanced opened, Wire opened');
  });
  await check('Layer strip: the ghost is never in the show file, the undo data, the Look Book or the Excel sheet, and a save + reload starts without it', async () => {
    await restore(); await lsCase(); await lsClear();
    const grab = async () => { const lb = exportPDF(true) || ''; let rows = null; const real = _buildXlsx; window._buildXlsx = function (x) { rows = JSON.stringify(x); return real.apply(this, arguments); }; try { await _doExportExcel(true); } catch (e) {} finally { window._buildXlsx = real; } return { lb, rows }; };
    const off = await grab(); const a = await lsArm('#canvas-area'); if (a !== true) { await restore(); return a; } const on = await grab(); const kept = !!lsGhost();
    const saved = JSON.stringify(getProjectState()); const trace = /lsGhost|lb-ghost|lb-lstrip/.test(saved + _snapshot() + JSON.stringify(_undoStack)) || /lb-ghost|lb-lstrip|lb-lbox/.test(on.lb);
    _applyProjectText(saved); await wait(800); okDialogs(); const after = [lsGhost(), $$('.lb-ghost').length];
    await lsClear(); await restore(); return is([on.lb === off.lb, on.rows === off.rows, kept, trace, after], [true, true, true, false, [null, 0]], 'Look Book identical / Excel rows identical / ghost still on after the exports / trace in file, undo or Look Book / ghost after the reload');
  });
  await check('Layer strip: an empty box opens the layer panel of that layer (what its table cell opens) and a pick from the list fills it', async () => {
    await restore(); await lsClear(); const p = lsP(1), s = lsS(1), sc = '#canvas-area'; lsShow(sc, p); await lsClickEl(lsChip(sc, p, s, 1));
    const hit = await lsHit(sc, p, 2); if (hit !== true) { await restore(); return hit; } const lp = $('#layer-panel'); if (!lp) { await restore(); return 'the layer panel did not open'; }
    const which = [lp.dataset.pid, lp.dataset.sid, lp.dataset.n]; const btn = $$('button', lp).find(b => b.textContent.trim() === 'IMAG'); if (!btn) { closeLayerPanel(); await restore(); return 'no IMAG button in the list'; }
    const u0 = _undoStack.length; btn.click(); await wait(450); const b2 = lsBox(sc, p, 2); const out = is([which, getL(p, s, 2), _undoStack.length - u0, b2 && b2.classList.contains('has'), b2 && b2.title], [[p, s, '2'], 'IMAG', 1, true, 'L2: IMAG'], 'panel for / assigned / undo steps / box amber / tooltip');
    await lsClear(); await restore(); return out;
  });
  await check('Layer strip: 12 layers never move the Actions group or resize the header; a long strip scrolls inside itself and brings the picked box into view', async () => {
    await restore(); await lsClear(); const p = lsP(2), s = lsS(1), sc = '#canvas-area'; lsShow(sc, p);
    const geo = () => { const h = $(sc + ' .preset-row[data-pid="' + p + '"] .preset-header'); const a = h.querySelector('.pr-actions').getBoundingClientRect(), r = h.getBoundingClientRect(); return [Math.round(a.left - r.left), Math.round(a.width), Math.round(r.width), Math.round(r.height), Math.round(h.parentElement.getBoundingClientRect().width)]; };
    const g0 = geo(); setL(p, s, 11, 'CLOCK'); setLayerSize(p, s, 11, 0.2, 0.2, 0.4, 0.6); render(); await wait(400); lsShow(sc, p); const st12 = lsStrip(sc, p); if (!st12) { await restore(); return 'no strip in the preset header'; } const n12 = $$('.lb-lbox', st12).length, g12 = geo();
    setL(p, s, 39, 'PGM'); setLayerSize(p, s, 39, 0.2, 0.2, 0.7, 0.6); render(); await wait(400); lsShow(sc, p); const g40 = geo(); const st = lsStrip(sc, p); const scrolls = st.scrollWidth > st.clientWidth + 1, inside = st.getBoundingClientRect().right <= st.closest('.preset-header').querySelector('.pr-actions').getBoundingClientRect().left + 1;
    await lsClickEl(lsChip(sc, p, s, 39)); await wait(200); const st2 = lsStrip(sc, p), on = st2.querySelector('.lb-lbox.on'); const a = st2.getBoundingClientRect(), r = on ? on.getBoundingClientRect() : null;
    const out = is([n12, g12, g40, scrolls, inside, on && on.textContent, !!r && r.left >= a.left - 1 && r.right <= a.right + 1, st2.scrollLeft > 0], [13, g0, g0, true, true, 'L39', true, true], 'boxes at 12 layers / header geometry at 12 / at 40 / scrolls / stays left of Actions / picked box / in view / scrolled there');
    await lsClear(); await restore(); return out;
  });
  await check('Layer strip: the bottom-left label of a destination names the top-most displayed layer before the unchanged resolution, on the canvas and in the Look Book', async () => {
    await restore(); await lsCase(); await lsClear(); const p = lsP(2); setL(p, lsS(2), 1, null); render(); await wait(300);
    const t = sid => (($('#canvas-area .screen-box[data-pid="' + p + '"][data-sid="' + sid + '"] .screen-inner > .screen-res') || {}).textContent || '').trim();
    const got = [t(lsS(1)), t(lsS(0)), t(lsS(2))]; const lb = exportPDF(true) || ''; const inBook = /L3 · 1920x1080/.test(lb) && /BG · 1920x1080/.test(lb);
    await restore(); return is([got, inBook], [['L3 · 1920x1080', 'L1 · 1920x1080', 'BG · 1920x1080'], true], 'labels (L3 on top / L1 / background only) / printed in the Look Book');
  });
  await check('Layer strip: reduced motion swaps the pulse for a steady outline, and the phone build gets today\'s empty spacer instead of the strip', async () => {
    await lsClear(); const p = lsP(1), s = lsS(0); lsShow('#canvas-area', p); await lsClickEl(lsChip('#canvas-area', p, s, 1)); const on = $('#canvas-area .lb-lbox.on'); if (!on) { await lsClear(); return 'no pulsing box'; }
    const had = document.body.classList.contains('a11y-reduce-motion'); document.body.classList.add('a11y-reduce-motion'); const cs = getComputedStyle(on); const calm = [cs.animationName, cs.outlineStyle]; document.body.classList.toggle('a11y-reduce-motion', had);
    const wasM = document.body.classList.contains('is-mobile'); document.body.classList.add('is-mobile'); let html = ''; try { html = _rcPresetRow(presets[0], 0.1, 300, 100); } finally { document.body.classList.toggle('is-mobile', wasM); }
    await lsClear(); return is([calm, /lb-lstrip|lb-lbox/.test(html), html.indexOf('<div style="flex:1"></div>') > 0], [['none', 'solid'], false, true], 'reduced motion: animation, outline / strip markup on the phone / the old spacer on the phone');
  });
  await check('Layer strip (Advanced page): the tile has the strip, BG picks a covered destination, a covered layer is picked with Properties on Layers, the Display output keeps the real look, leaving the page ends the ghost', async () => {
    await restore(); await lsCase(); await lsClear(); const p = lsP(2), s = lsS(1), sc = '#fs-canvas'; openFullscreen(p); await wait(900);
    const fail = async m => { try { if (_dispIsOpen()) _dispClose(); } catch (e) {} closeFullscreen(); await wait(400); await lsClear(); await restore(); return m; };
    const st = lsStrip(sc, p); if (!st) return fail('no strip in the Advanced tile'); const inert = st.classList.contains('inert');
    await lsClickEl(lsChip(sc, p, s, 3)); let hit = await lsHit(sc, p, 0); if (hit !== true) return fail(hit);
    const bg = [sel, selLayer, lsGhost(), lsCss(lsChip(sc, p, s, 3)), !!$('#fs-canvas .move-symbol')];
    hit = await lsHit(sc, p, 1); if (hit !== true) return fail(hit); const l1 = [selLayer, _fsPropTab, lsGhost(), lsCss(lsChip(sc, p, s, 1)), lsCss(lsChip(sc, p, s, 3)), lsTop(lsChip(sc, p, s, 1))];
    const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;left:-3000px;top:0;width:1280px;height:480px;border:0'; document.body.appendChild(fr); const fake = fr.contentWindow; try { Object.defineProperty(fake, 'closed', { get() { return !fr.isConnected; }, configurable: true }); } catch (e) {} fake.close = function () { fr.remove(); };
    const real = window.open; window.open = function () { return fake; }; _dispOpen(); await wait(900); window.open = real;
    const oc = fake.document.querySelector('#disp-stage .layer-chip[data-sid="' + s + '"][data-lid="3"]'); const outLook = [oc ? fake.getComputedStyle(oc).opacity : 'no chip in the output', fake.document.querySelectorAll('#disp-stage .lb-lstrip').length, lsCss(lsChip(sc, p, s, 3))[1]];
    _dispClose(); await wait(300); if (fr.isConnected) fr.remove();
    closeFullscreen(); await wait(500); const left = await lsEnded(); await lsClear(); await restore();
    return is([inert, bg, l1, outLook, left], [true, [{ pid: p, sid: s }, null, { pid: p, sid: s, n: 0 }, [true, '0.15', 'none'], true], [{ pid: p, sid: s, n: 1 }, 'layers', { pid: p, sid: s, n: 1 }, [false, '1', 'auto'], [true, '0.15', 'none'], true], ['1', 0, '0.15'], [null, 0]],
      'inert at first / BG: destination, layer, ghost, L3, move arrows / L1: layer, tab, ghost, L1, L3, L1 reachable / Display: L3 opacity in the output, strips in the output, L3 in the editor / after leaving');
  });

  // ── LAYER STRIP, attacker fixes (round 16ks) ────────────────────────────────────────────────────────────────────
  // WHERE: paste this whole block into tests/flows_probe.js straight AFTER the builder's block "LAYER STRIP (round 16ks, owner
  //   decision 10)" and BEFORE the line "// ── Video Presets, Advanced ──..." (no media is needed; the Advanced checks open and
  //   close the Advanced page themselves, so nothing can ever play). It shares no name with the builder's block (prefix lf).
  // Every check FAILS on the merged round-16ks page without patch_fix.py and PASSES with it.
  // Every check leaves the show, the selection, the panels, the page and any helper <style> as it found them (restore()).
  // The probe runs inside the page, so the pointer is simulated the way the browser delivers it: every event is sent to the element
  // that is ON TOP at that point at that moment (document.elementFromPoint skips pointer-events:none, exactly like a real click).
  // The real-mouse proof (CDP Input.dispatchMouseEvent / mouseWheel / dispatchKeyEvent) is prove_fix.mjs in the round folder.
  // REPLACES: nothing. The builder's 12 "Layer strip" checks still pass unchanged on the fixed page (run_flows_fix.mjs proves it),
  //   and the attacker reported none of them as wrong or as not restoring.
  const lfP = i => presets[i].id, lfS = i => screens[i].id;
  const lfRow = (scope, pid) => scope + ' .preset-row[data-pid="' + pid + '"]';
  const lfStrip = (scope, pid) => $(lfRow(scope, pid) + ' .lb-lstrip');
  const lfBox = (scope, pid, n) => $(lfRow(scope, pid) + ' .lb-lstrip .lb-lbox[data-n="' + n + '"]');
  const lfChip = (scope, pid, sid, n) => $(scope + ' .layer-chip[data-pid="' + pid + '"][data-sid="' + sid + '"][data-lid="' + n + '"]');
  const lfDest = (scope, pid, sid) => $(scope + ' .screen-box[data-pid="' + pid + '"][data-sid="' + sid + '"]');
  const lfShow = (scope, pid) => { if (scope !== '#canvas-area') return; const r = $(lfRow(scope, pid)), ca = $('#canvas-area'); if (r && ca) ca.scrollTop += r.getBoundingClientRect().top - ca.getBoundingClientRect().top - 4; };
  const lfGhost = () => (typeof _lsGhost === 'undefined') ? 'no ghost state' : (_lsGhost ? { pid: _lsGhost.pid, sid: _lsGhost.sid, n: _lsGhost.n } : null);
  const lfCss = el => { if (!el) return null; const cs = getComputedStyle(el); return cs.opacity + '/' + cs.pointerEvents; };
  const lfClear = async () => { try { closeLayerPanel(); } catch (e) {} try { closeScreenPanel(); } catch (e) {} doSelect(null, null); selLayer = null; hideMoveSymbol(); render(); await wait(300); };
  const lfCase = async () => { const p = lfP(2), s = lfS(1); setL(p, s, 1, 'PPT A'); setLayerSize(p, s, 1, 0.3, 0.3, 0.06, 0.1); setL(p, s, 2, 'CLOCK'); setLayerSize(p, s, 2, 0.3, 0.3, 0.62, 0.1); setL(p, s, 3, 'CAM 2'); setLayerSize(p, s, 3, 1, 1, 0, 0); render(); await wait(350); };   // L1 and L2 small PIPs under a full-screen L3
  // one click at a point: hit-test, then mousedown / mouseup / click on what is on top there
  const lfClickAt = async (x, y, detail) => { const t = document.elementFromPoint(x, y); if (!t) return null; const o = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, detail: detail || 1 }; t.dispatchEvent(new MouseEvent('mousedown', o)); t.dispatchEvent(new MouseEvent('mouseup', o)); t.dispatchEvent(new MouseEvent('click', o)); return t; };
  // a double-click at a point at human speed: click, pause (frames run, as between two real clicks), click, dblclick; each one hit-tested again
  const lfDblAt = async (x, y) => { await lfClickAt(x, y, 1); await wait(140); await lfClickAt(x, y, 2); const t = document.elementFromPoint(x, y); if (t) t.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, detail: 2 })); await wait(700); };
  const lfClickEl = async el => { const r = el.getBoundingClientRect(); await lfClickAt(r.left + r.width / 2, r.top + r.height / 2, 1); await wait(300); };
  const lfReveal = (scope, pid, n) => { const s = lfStrip(scope, pid), b = lfBox(scope, pid, n); if (!s || !b) return; const a = s.getBoundingClientRect(), r = b.getBoundingClientRect(), k = a.width / s.offsetWidth || 1; if (r.left < a.left + 2) s.scrollLeft -= (a.left - r.left) / k + 4; else if (r.right > a.right - 2) s.scrollLeft += (r.right - a.right) / k + 4; };
  const lfHit = async (scope, pid, n) => { lfShow(scope, pid); lfReveal(scope, pid, n); await wait(60); const b = lfBox(scope, pid, n); if (!b) return 'no strip box ' + n; const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (t !== b) return 'strip box ' + n + ' is not on top at its centre'; await lfClickEl(b); return true; };
  // the point inside CENTER LED that only the full-screen L3 covers (the small L1 / L2 sit in the top 40 %)
  const lfBare = (scope, pid, sid) => { const r = lfDest(scope, pid, sid).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.6 }; };
  const lfPanels = () => { const sp = $('#screen-panel'), lp = $('#layer-panel'); return [sp ? sp.dataset.sid : null, lp ? lp.dataset.n : null]; };

  await check('Layer strip fix (Advanced page): the tile header gives the strip room (Notes gives way first): BG and the first layer boxes are fully visible and on top, the header stays one line, the row and the Actions group are where they were', async () => {
    await restore(); await lfClear(); const p = lfP(2), sc = '#fs-canvas'; openFullscreen(p); await wait(1000);
    const done = async m => { const x = $('#lf-neutral'); if (x) x.remove(); closeFullscreen(); await wait(450); await lfClear(); await restore(); return m; };
    const st = lfStrip(sc, p); if (!st) return done('no strip in the Advanced tile');
    await lfClickEl(lfChip(sc, p, lfS(0), 1)); st.scrollLeft = 0; await wait(120);
    const pill = lfStrip(sc, p), a = pill.getBoundingClientRect(), h = pill.closest('.preset-header'), hr = h.getBoundingClientRect();
    const full = $$('.lb-lbox', pill).filter(b => { const r = b.getBoundingClientRect(); return r.left >= a.left - 0.5 && r.right <= a.right + 0.5 && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b; }).map(b => b.textContent);
    const wantBoxes = innerWidth >= 1440 ? 4 : 2;   /* 1440 wide: BG + 3; narrower (down to 1024x768): BG + 1 */
    const notes = h.querySelector('input[name="p-notes"]').offsetWidth, acts = h.querySelector('.pr-actions'), ar = acts.getBoundingClientRect(), mod = acts.querySelector('button'), mr = mod.getBoundingClientRect(), mt = document.elementFromPoint(mr.left + mr.width / 2, mr.top + mr.height / 2);
    const oneLine = new Set($$(':scope > div', h).filter(k => k.offsetWidth).map(k => Math.round(k.getBoundingClientRect().bottom))).size === 1;
    const geo = () => { const hh = $(lfRow(sc, p) + ' .preset-header'); return [hh.closest('.preset-row').offsetWidth, hh.offsetWidth, hh.offsetHeight, Math.round(hh.querySelector('.pr-actions').getBoundingClientRect().left - hh.getBoundingClientRect().left)]; };
    const g1 = geo(); const ns = document.createElement('style'); ns.id = 'lf-neutral';   /* the header as it was before the fix: fixed 180 px Notes, the slot takes what is left */
    ns.textContent = '#fs-canvas .preset-header>.lb-lslot{flex:1 1 0 !important}#fs-canvas .preset-header>div:has(>input[name="p-notes"]){flex:none !important;width:180px !important}'; document.head.appendChild(ns); const g0 = geo(); ns.remove();
    const hitBG = await lfHit(sc, p, 0); const afterBG = [sel && sel.sid, lfGhost() && lfGhost().n];
    return done(is([full.indexOf('BG') === 0, full.length >= wantBoxes, notes >= 88 && notes <= 181, oneLine, ar.right <= hr.right + 0.5, a.right <= ar.left + 0.5, !!mt && (mt === mod || mod.contains(mt)), g1, hitBG, afterBG],
      [true, true, true, true, true, true, true, g0, true, [lfS(0), 0]], 'BG first in view / enough boxes fully visible and on top (' + full.join(' ') + ', pill ' + pill.offsetWidth + ' px, Notes ' + notes + ' px) / Notes between 90 and 180 px / one line / Actions inside the header / pill ends before Actions / Modifiers on top / row width, header width, header height, Actions position equal to the header without the fix / a click on BG lands / it picked the destination with the ghost'));
  });
  await check('Layer strip fix: with the ghost on, a double-click on the destination (through the 15 % layers) opens Destination Properties, never a layer panel, and the ghost stays (Simple and Advanced); one click still lets go', async () => {
    await restore(); await lfCase(); await lfClear(); const p = lfP(2), s = lfS(1); let sc = '#canvas-area'; lfShow(sc, p); const out = [];
    await lfClickEl(lfChip(sc, p, s, 3)); let hit = await lfHit(sc, p, 0); if (hit !== true) { await lfClear(); await restore(); return hit; }
    let pt = lfBare(sc, p, s); await lfDblAt(pt.x, pt.y); out.push([lfPanels(), lfGhost() && lfGhost().n, lfCss(lfChip(sc, p, s, 3)), sel && sel.sid]); await lfClear();
    // a layer ghost (L1 under L3): the double-click lands on the destination too, and the ghost is still on after the double-click interval
    lfShow(sc, p); await lfClickEl(lfChip(sc, p, s, 3)); hit = await lfHit(sc, p, 1); if (hit !== true) { await lfClear(); await restore(); return hit; }
    pt = lfBare(sc, p, s); await lfDblAt(pt.x, pt.y); await wait(300); out.push([lfPanels(), lfGhost() && lfGhost().n, lfCss(lfChip(sc, p, s, 3))]);
    closeScreenPanel(); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true })); await wait(300); out.push([lfGhost(), $$('.lb-ghost').length]); await lfClear();
    // ONE click on the BG-picked destination still lets go of it, and the ghost is gone after the double-click interval
    lfShow(sc, p); await lfClickEl(lfChip(sc, p, s, 3)); await lfHit(sc, p, 0); pt = lfBare(sc, p, s); await lfClickAt(pt.x, pt.y, 1); const let1 = sel; await wait(1400); out.push([let1, lfGhost(), $$('.lb-ghost').length]);   /* merge: the hold after letting go is 1.2 s (a fresh press ends it at once) */ await lfClear();
    // Advanced
    openFullscreen(p); await wait(1000); sc = '#fs-canvas';
    await lfClickEl(lfChip(sc, p, s, 3)); hit = await lfHit(sc, p, 0); if (hit !== true) { closeFullscreen(); await wait(400); await lfClear(); await restore(); return hit; }
    pt = lfBare(sc, p, s); await lfDblAt(pt.x, pt.y); out.push([lfPanels(), lfGhost() && lfGhost().n, selLayer]); closeScreenPanel(); await lfClear(); renderFullscreen(); await wait(300);
    // Advanced: the first click of a double-click ON the picked L1 lets go of it there; the second click must still reach L1, never the full-screen L3
    await lfClickEl(lfChip(sc, p, s, 3)); hit = await lfHit(sc, p, 1); if (hit !== true) { closeFullscreen(); await wait(400); await lfClear(); await restore(); return hit; }
    const c1 = lfChip(sc, p, s, 1).getBoundingClientRect(); await lfDblAt(c1.left + c1.width / 2, c1.top + c1.height * 0.8); out.push([selLayer && selLayer.n, lfGhost() && lfGhost().n]);
    closeFullscreen(); await wait(450); await lfClear(); await restore();
    return is(out, [[[s, null], 0, '0.15/none', s], [[s, null], 1, '0.15/none'], [null, 0], [null, null, 0], [[s, null], 0, null], [1, 1]],
      'Simple BG ghost: panels [destination, layer], ghost, L3, picked / Simple L1 ghost: panels, ghost, L3 / after closing the window: ghost, ghosted / one click: picked, ghost, ghosted / Advanced BG ghost: panels, ghost, layer / Advanced double-click on L1: layer, ghost');
  });
  await check('Layer strip fix: the wheel over an overflowing pill is only taken while the pill can still scroll that way (Simple: at its end the page scrolls on; Advanced: never a canvas zoom)', async () => {
    await restore(); await lfClear(); const p = lfP(2), s = lfS(1); setL(p, s, 30, 'PGM'); setLayerSize(p, s, 30, 0.2, 0.2, 0.7, 0.6); render(); await wait(400); let sc = '#canvas-area'; lfShow(sc, p);
    const roll = (el, dy) => { const r = el.getBoundingClientRect(); let reached = false; const ca = el.closest('#canvas-area,#fs-viewport'); const on = () => { reached = true; }; ca.addEventListener('wheel', on); const ev = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: dy, deltaX: 0, clientX: r.left + 20, clientY: r.top + r.height / 2 }); el.dispatchEvent(ev); ca.removeEventListener('wheel', on); return [ev.defaultPrevented, reached, Math.round(el.scrollLeft)]; };
    let pill = lfStrip(sc, p); if (!pill) { await restore(); return 'no strip'; } const max = pill.scrollWidth - pill.clientWidth; if (max < 50) { await restore(); return 'the pill does not overflow with 30 layers (' + max + ')'; }
    pill.scrollLeft = 0; const up0 = roll(pill, -100), dn0 = roll(pill, 100); pill.scrollLeft = max; const dnEnd = roll(pill, 100), upEnd = roll(pill, -100); pill.scrollLeft = 0;
    openFullscreen(p); await wait(1000); sc = '#fs-canvas'; pill = lfStrip(sc, p); const max2 = pill.scrollWidth - pill.clientWidth; pill.scrollLeft = max2; const w0 = $(lfRow(sc, p)).getBoundingClientRect().width; const advEnd = roll(pill, 100); await wait(150); const w1 = $(lfRow(sc, p)).getBoundingClientRect().width;
    closeFullscreen(); await wait(450); await lfClear(); await restore();
    return is([up0, dn0, dnEnd, [upEnd[0], upEnd[1], upEnd[2] < max], [advEnd[0], advEnd[1]], Math.round(w0) === Math.round(w1)], [[false, true, 0], [true, false, 100], [false, true, max], [true, false, true], [true, false], true],
      'Simple, [taken, reached the page, pill scrollLeft]: wheel up at the start / wheel down at the start / wheel down at the end / wheel up at the end / Advanced wheel down at the end [taken, reached the viewport] / tile not zoomed');
  });
  await check('Layer strip fix: the pulse follows the box the user is working on: an empty box clicked while another layer is picked pulses while its content list is open, and the pulse goes back when the list closes', async () => {
    await restore(); await lfCase(); await lfClear(); const p = lfP(2), s = lfS(1), sc = '#canvas-area'; lfShow(sc, p); await lfClickEl(lfChip(sc, p, s, 3));
    const on = () => $$(lfRow(sc, p) + ' .lb-lbox.on').map(b => b.textContent); const a = [selLayer && selLayer.n, on()];
    const hit = await lfHit(sc, p, 4); if (hit !== true) { await lfClear(); await restore(); return hit; } await wait(200); const lp = $('#layer-panel'); const b = [lp && lp.dataset.n, selLayer && selLayer.n, on()];
    closeLayerPanel(); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true })); await wait(300); const c = on();
    await lfClear(); await restore(); return is([a, b, c], [[3, ['L3']], ['4', 3, ['L4']], ['L3']], 'L3 picked: layer, pulsing / empty L4 clicked: list for, picked layer, pulsing / list closed: pulsing');
  });
  await check('Layer strip fix: Reset Layers in the Reset window while the ghost is on ends the ghost cleanly (BG ghost and layer ghost): nothing stays faded and a layer added right after comes up solid', async () => {
    await restore(); await lfCase(); await lfClear(); const p = lfP(2), s = lfS(1), sc = '#canvas-area', out = [];
    const resetLayers = async () => { actions.resetPreset(p); await wait(350); if (!dlgOpen()) return 'the Reset window did not open'; const boxes = $$('#dlg-overlay input[type=checkbox]'); const lay = boxes.find(i => /Reset Layers/.test((i.closest('label') || i.parentElement).textContent)); if (!lay) return 'no Reset Layers tick';
      boxes.forEach(i => { if (i !== lay && i.checked) i.click(); }); if (!lay.checked) lay.click(); await wait(100); $('#dlg-confirm').click(); await wait(600); return true; };
    for (const n of [0, 1]) {
      lfShow(sc, p); await lfClickEl(lfChip(sc, p, s, 3)); const hit = await lfHit(sc, p, n); if (hit !== true) { await lfClear(); await restore(); return hit; } const armed = [lfGhost() && lfGhost().n, $$('#canvas-area .lb-ghost').length > 0];
      const r = await resetLayers(); if (r !== true) { okDialogs(); await lfClear(); await restore(); return r; }
      const gone = [JSON.stringify(presets.find(x => x.id === p).layers), lfGhost(), $$('.lb-ghost').length, $$(lfRow(sc, p) + ' .lb-lbox.on').filter(b => b.textContent !== 'BG').length];
      setL(p, s, 2, 'CAM 1'); setLayerSize(p, s, 2, 0.5, 0.5, 0.2, 0.2); render(); await wait(400); out.push([armed, gone, lfCss(lfChip(sc, p, s, 2))]);
      await lfClear(); await restore(); await lfCase(); await lfClear();
    }
    await lfClear(); await restore(); return is(out, [[[0, true], ['{}', null, 0, 0], '1/auto'], [[1, true], ['{}', null, 0, 0], '1/auto']], 'per ghost kind (BG, L1): armed [ghost, something faded] / after Reset Layers [layers, ghost, faded elements, pulsing layer boxes] / the layer added afterwards');
  });

// ─────────────────────────────────────────────── BLOCK A ───────────────────────────────────────────────────────────
  // ── undo 16ks: never an empty step ──────────────────────────────────────────────────────────────────────────────
  const _udLit = () => [($('#tb-undo') || { style: {} }).style.opacity === '1', ($('#tb-redo') || { style: {} }).style.opacity === '1'];
  const _udPtr = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  const _udMouse = (el, type, x, y) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1, view: window }));
  // a user's click: press, release, click (the undo safety net closes the gesture on the release)
  const _udClick = async (el, ms) => { const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; _udPtr(el, 'pointerdown', x, y); _udMouse(el, 'mousedown', x, y); _udMouse(el, 'mouseup', x, y); _udPtr(el, 'pointerup', x, y); el.click(); await wait(ms || 400); };
  const _udHome = async () => { try { closeScreenPanel(); } catch (e) {} try { closeFullscreen(); } catch (e) {} try { closeWireMode(); } catch (e) {} try { closeSystem(); } catch (e) {} okDialogs(); await restore(); };
  await check('undo: an action that changes nothing leaves no undo step and leaves Undo dim (Reset Preset Layout with nothing to reset, a preset pasted onto itself)', async () => {
    await _udHome(); const p = presets[0], s = screens[1]; const n0 = _undoStack.length, before = JSON.stringify(getProjectState()); const steps = [];
    openScreenPanel(fakeEv, p.id, s.id); await wait(400); const rl = $('#sp-reset-layout'); if (!rl) { await _udHome(); return 'no Reset Preset Layout button'; } await _udClick(rl); steps.push(_undoStack.length - n0);
    actions.copyPreset(p.id); await wait(250); const paste = $('.preset-row[data-pid="' + p.id + '"] [onclick*="actions.pastePreset"]'); if (!paste) { await _udHome(); return 'no Paste button'; } await _udClick(paste); okDialogs(); await wait(300); steps.push(_undoStack.length - n0);
    const same = JSON.stringify(getProjectState()) === before, lit = _udLit()[0]; await _udHome();
    return is([same, steps, lit], [true, [0, 0], false], 'show unchanged / undo steps after each of the two / Undo lit');
  });
  await check('undo: a press never does nothing: an empty step on top is skipped, the same step is never stacked twice, and Undo / Redo are lit only when a press will do something', async () => {
    await _udHome(); const f = firstLayer(); const before = getL(f.pid, f.sid, 1);
    pushUndo(); setL(f.pid, f.sid, 1, 'CLOCK'); scheduleRender(); await wait(150);      // one real step
    pushUndo(); pushUndo(); const stacked = _undoStack.length;                          // two actions that record a step and change nothing (no gesture, so nothing tidies them)
    doUndo(); await wait(250); const afterOne = getL(f.pid, f.sid, 1), lit1 = _udLit();   // ONE press takes the layer change back
    doRedo(); await wait(250); const redone = getL(f.pid, f.sid, 1), lit2 = _udLit();
    pushUndo(); await _udClick(document.body, 300); const lit3 = _udLit()[0], left = _undoStack.length;   // an empty step, then any click: the step is gone and Undo shows what a press would do
    doUndo(); await wait(250); await _udHome();
    return is([stacked, afterOne, lit1, redone, lit2, left, lit3], [2, before, [false, true], 'CLOCK', [true, false], 1, true], 'steps on the stack / layer after ONE Undo / lit after it / layer after Redo / lit after Redo / steps after an empty step and a click / Undo lit');
  });
  await check('undo: a click that ends up changing nothing gives Redo back (Undo, then Reset Preset Layout with nothing to reset: Redo stays lit and still works); a real change still clears Redo', async () => {
    await _udHome(); const f = firstLayer(); const p = presets[0], s = screens[1];
    pushUndo(); setL(f.pid, f.sid, 1, 'CLOCK'); scheduleRender(); await wait(150); doUndo(); await wait(250); const r0 = _redoStack.length;
    openScreenPanel(fakeEv, p.id, s.id); await wait(400); const rl = $('#sp-reset-layout'); if (!rl) { await _udHome(); return 'no Reset Preset Layout button'; }
    await _udClick(rl, 500); const kept = [_redoStack.length, _udLit()[1], _undoStack.length];
    doRedo(); await wait(250); const redone = getL(f.pid, f.sid, 1);
    doUndo(); await wait(250); const add = $('button[onclick="actions.addPreset()"]'); if (!add) { await _udHome(); return 'no + Preset button'; }
    const np = presets.length; await _udClick(add, 500); okDialogs(); await wait(200); const cleared = [presets.length - np, _redoStack.length, _udLit()[1]];
    await _udHome();
    return is([r0, kept, redone, cleared], [1, [1, true, 0], 'CLOCK', [1, 0, false]], 'Redo steps after the Undo / after the click that changed nothing: Redo steps, Redo lit, undo steps / layer after Redo / after + Preset: presets added, Redo steps, Redo lit');
  });
  await check('undo: ONE list of view keys: every key in it is left out of the undo snapshot AND of the unsaved comparison; the print sheet size is left out of Undo only', async () => {
    await _udHome(); if (typeof _LB_VIEW_KEYS !== 'object') return 'the page has no _LB_VIEW_KEYS list';
    const want = { wireSettings: ['wireView', 'wireStyle', 'panes', 'rpanes', 'panelCollapse', 'tool', 'zoom', 'alignPanelPos'], ioAdvanced: ['view', 'page'], eachPreset: ['minimized'], wireSettingsUndoOnly: ['sheet'] };
    const shared = _LB_DIRTY_VIEW_KEYS === _LB_VIEW_KEYS && _LB_UN_VIEW_KEYS === _LB_VIEW_WIRE_KEYS;
    const s0 = _snapshot(), d0 = _dirtyStateString(); const seen = [];
    const poke = (obj, k, v) => { const had = (k in obj), old = obj[k]; obj[k] = v; const r = [_snapshot() === s0, _dirtyStateString() === d0]; if (had) obj[k] = old; else delete obj[k]; return r; };
    _LB_VIEW_KEYS.wireSettings.forEach(k => seen.push(poke(wireSettings, k, { probe: 1 }).join()));
    seen.push(poke(ioAdvanced, 'view', ioAdvanced.view === 'advanced' ? 'simple' : 'advanced').join(), poke(ioAdvanced, 'page', 1).join(), poke(presets[1], 'minimized', !presets[1].minimized).join());
    const sheet = poke(wireSettings, 'sheet', 'probe-sheet'), data = poke(wireSettings, 'hub', 'PROBE HUB');
    const back = _snapshot() === s0 && _dirtyStateString() === d0; await _udHome();
    return is([JSON.stringify(_LB_VIEW_KEYS) === JSON.stringify(want), shared, seen.every(x => x === 'true,true'), sheet, data, back], [true, true, true, [true, false], [false, false], true], 'the list is the agreed one / the unsaved comparison and the undo net read the same object / every view key ignored by both / sheet: [same snapshot, same unsaved text] / a data key (switcher name): the same two / everything put back');
  });


  // ── 16ks merge fixes (re-attack findings, 2026-09-21). Goes AFTER the preset-reset and layer-strip blocks (it uses their helpers:
  //    _prOpen / _prCancel / _pfKey / _pfKeyUp, lsCase / lsClear / lsClickEl / lsChip / lsDest / lsHit / lsGhost / lsP / lsS).
  //    Every check FAILS on the page as the fix agents delivered it and PASSES on the merged page; each puts the show back.
  await check('Reset window: a Space HELD from before the window opened (auto-repeat) never answers it, and its key-up reaches the page; a Space first pressed on the window still works', async () => {
    await restore(); try { const r = await _prOpen(1); if (r !== true) return r; const n0 = _undoStack.length, snap = _snapshot();
    for (let i = 0; i < 6; i++) _pfKey(' ', { repeat: true }); await wait(80); let reached = false; const spy = e => { if (e.key === ' ') reached = true; }; document.body.addEventListener('keyup', spy); _pfKeyUp(' '); document.body.removeEventListener('keyup', spy); await wait(250);
    const held = [dlgOpen(), _snapshot() === snap, _undoStack.length - n0, reached];
    const b = $('#dlg-confirm'); b.focus(); _pfKey(' '); await wait(60); const fresh = dlgOpen();   /* a real Space on the focused button answers on key-up: the browser does that part */
    return is([held, fresh], [[true, true, 0, true], true], 'held Space [window still open, nothing reset, undo steps, key-up reached the page] / a fresh Space keeps the window until its key-up');
    } finally { _prCancel(); await wait(150); await restore(); }
  });
  await check('Reset window: the second click of a double-click on the amber Reset is dropped and the focus stays on the window\'s Reset button; the "nothing to reset" note sits OUTSIDE the scrolling tick block, next to the buttons', async () => {
    await restore(); try { const b = $('#canvas-area .preset-row[data-pid="' + presets[1].id + '"] .del-btn.h-amber'); if (!b) return 'no Reset button';
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })); await wait(250); const opened = dlgOpen();
    const ov = $('#dlg-overlay'); ov.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 })); await wait(150);
    const still = dlgOpen(), focus = document.activeElement && document.activeElement.id;
    const note = $('#dlg-tick-note'), ticks = $('#dlg-box .dlg-ticks'); const outside = !!note && !!ticks && !ticks.contains(note) && note.compareDocumentPosition(ticks) === Node.DOCUMENT_POSITION_PRECEDING;
    return is([opened, still, focus, outside], [true, true, 'dlg-confirm', true], 'window opened / still open after the dropped click / focus / the note follows the tick block');
    } finally { _prCancel(); await wait(150); await restore(); }
  });
  await check('undo: a folded preset that is deleted comes back FOLDED after Undo, and a preset folded after + Preset comes back folded after Undo / Redo', async () => {
    await restore(); try { const p2 = presets[1].id, n0 = presets.length; actions.toggleMinimize(p2); await wait(200); const foldedBefore = !!presets[1].minimized;
    actions.deletePreset(p2); await wait(200); okDialogs(); await wait(300); const deleted = presets.length === n0 - 1 && !presets.some(p => p.id === p2);
    doUndo(); await wait(400); const back = presets.some(p => p.id === p2), stillFolded = !!(presets.find(p => p.id === p2) || {}).minimized;
    actions.addPreset(); await wait(300); const pn = presets[presets.length - 1].id; actions.toggleMinimize(pn); await wait(200); doUndo(); await wait(300); doRedo(); await wait(400);
    const again = !!(presets.find(p => p.id === pn) || {}).minimized;
    return is([foldedBefore, deleted, back, stillFolded, again], [true, true, true, true, true], 'P2 folded before the delete / deleted / back after Undo / still folded / a new preset folded then Undo + Redo: still folded');
    } finally { await restore(); }
  });
  await check('layer strip: inside the hold after letting go of a ghosted destination, a FRESH click (click count 1) on a still-faded layer picks that layer, and a slow double-click (click count 2 after 700 ms) still keeps the ghost and lands on the destination', async () => {
    await restore(); try { await lsCase(); const sc = '#canvas-area', p = lsP(2), s = lsS(1);
    const go = async () => { await lsClear(); await lsClickEl(lsChip(sc, p, s, 3)); const r = await lsHit(sc, p, 0, 'click'); if (r !== true) throw new Error('BG: ' + r); await wait(200); };
    const at = el => { const r = el.getBoundingClientRect(); return { clientX: r.left + r.width / 2 + 40, clientY: r.top + r.height / 2 + 30 }; };
    const press = (el, o, detail) => { el.dispatchEvent(new MouseEvent('mousedown', Object.assign({ bubbles: true, cancelable: true, button: 0, detail }, o))); el.dispatchEvent(new MouseEvent('mouseup', Object.assign({ bubbles: true, cancelable: true, button: 0, detail }, o))); el.dispatchEvent(new MouseEvent('click', Object.assign({ bubbles: true, cancelable: true, button: 0, detail }, o))); };
    await go(); const dest = lsDest(sc, p, s), o = at(dest); const ghostOn = !!lsGhost() && $$('.lb-ghost').length >= 3;
    press(dest, o, 1); await wait(120);   /* lets go of the destination: the hold starts */
    const under = document.elementFromPoint(o.clientX, o.clientY); press(under, o, 1); await wait(350);   /* a FRESH press 120 ms later, on what the pointer is over (the faded L3 is click-through: the destination) */
    const fresh = [selLayer ? selLayer.n : null, lsGhost()];
    await go(); const dest2 = lsDest(sc, p, s), o2 = at(dest2); press(dest2, o2, 1); await wait(700);
    const under2 = document.elementFromPoint(o2.clientX, o2.clientY); press(under2, o2, 2); under2.dispatchEvent(new MouseEvent('dblclick', Object.assign({ bubbles: true, cancelable: true, button: 0, detail: 2 }, o2))); await wait(500);
    const slow = [!!$('#screen-panel'), !!$('#layer-panel'), !!lsGhost()];
    return is([ghostOn, fresh, slow], [true, [3, null], [true, false, true]], 'ghost on / fresh click: [picked layer, ghost] / slow double-click: [Destination Properties open, layer panel open, ghost kept]');
    } finally { try { closeScreenPanel(); } catch (e) {} try { closeLayerPanel(); } catch (e) {} await lsClear(); await restore(); }
  });
  await check('unsaved 4: a save that ends while a name box is focused (desktop close hook / autosave) does not hide that box\'s next commit: the rename lights Save on its own, arms the autosave and records its undo step', async () => {
    await restore(); const hadNative = window.lookbookNative; let written = 0; try {
      window.lookbookNative = { project: { save: async () => { await wait(300); written++; return { ok: true }; } } }; eval("_desktopPath='/u4/test.avlb'; _desktopLastSave=0"); try { clearTimeout(eval('_autoSaveTimer')); eval('_autoSaveTimer=null'); } catch (e) {}
      const p = presets[0].id, a = screens[0].id, b = screens[1].id; homeSetScreenName(p, a, 'U4 FIRST'); renderTable(); await wait(500); const gold1 = !!eval('_isDirty');
      const inp = $('#tbody input[id="tsn-' + p + '-' + b + '"]') || $$('#tbody input').find(i => i.value === getScreenName(p, b)); if (!inp) return 'no name box for destination 2'; inp.focus(); await wait(100);
      await window.__lbFlushSave(); await wait(400); const cleanAfterWrite = [!!eval('_isDirty'), written, document.activeElement === inp];
      const n0 = _undoStack.length; inp.value = 'U4 SECOND'; fire(inp, 'input'); fire(inp, 'change'); fire(inp, 'blur'); await wait(700);
      const after = [!!eval('_isDirty'), screens[1].name, _undoStack.length - n0, !!eval('_autoSaveTimer')];   /* read raw: a forced re-check would hide the bug */
      return is([gold1, cleanAfterWrite, after], [true, [false, 1, true], [true, 'U4 SECOND', 1, true]], 'first rename gold / after the write [gold, files written, box still focused] / second rename [gold on its own, name, undo steps, autosave armed]');
    } finally { if (hadNative === undefined) delete window.lookbookNative; else window.lookbookNative = hadNative; eval('_desktopPath=null'); try { clearTimeout(eval('_autoSaveTimer')); eval('_autoSaveTimer=null'); } catch (e) {} await restore(); }
  });
  await check('unsaved 4: a write still running when another show is opened never re-baselines the new show; typing "NA" into a blank Venue box is a real edit', async () => {
    await restore(); const hadNative = window.lookbookNative; try {
      window.lookbookNative = { project: { save: async () => { await wait(900); return { ok: true }; } } }; eval("_desktopPath='/u4/test.avlb'; _desktopLastSave=0");
      homeSetScreenName(presets[0].id, screens[0].id, 'U4 OLD'); renderTable(); await wait(300); const pending = saveProject({}); await wait(120);
      await restore(); await wait(200); const beforeEnd = !!eval('_isDirty'); await pending; await wait(300); _recomputeDirty(); const afterEnd = [!!eval('_isDirty'), screens[0].name !== 'U4 OLD'];
      const sv = $('#show-venue'); sv.value = ''; _captureCleanBaseline(); _recomputeDirty(); const blank = !!eval('_isDirty'); sv.value = 'NA'; _recomputeDirty(); const na = !!eval('_isDirty'); sv.value = 'N/A'; _recomputeDirty(); const real = !!eval('_isDirty');
      return is([beforeEnd, afterEnd, blank, na, real], [false, [false, true], false, true, false], 'new show clean while the old write runs / after the write ends [clean, it is the new show] / blank venue clean / "NA" typed = unsaved / the app\'s own "N/A" = clean');
    } finally { if (hadNative === undefined) delete window.lookbookNative; else window.lookbookNative = hadNative; eval('_desktopPath=null'); await restore(); }
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
// ── BLOCK 5: insert right AFTER the existing check
//    'Advanced: both side panels collapse to a strip and come back'   (Advanced is open on A.pid, no layer picked yet; the check changes nothing in the show)
  await check('Advanced: a destination row in the Layers overview selects the destination, a double-click or its button opens Destination Properties', async () => {
    const tab = _fsPropTab; _fsSetPropTab('layers'); if (selLayer) _fsClearLayer(); doSelect(null, null); await wait(300);
    const rows = $$('#fs-toolbar .fs-drow-h'); if (rows.length !== screens.length) { _fsSetPropTab(tab); return 'overview rows: ' + rows.length; }
    rows[0].click(); await wait(200); const picked = !!sel && sel.pid === A.pid && sel.sid === screens[0].id, lit = $$('#fs-toolbar .fs-drow-h.sel').length, box = !!$('#fs-canvas .screen-box.sel[data-sid="' + screens[0].id + '"]');
    rows[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 })); await wait(400); let pop = $('#screen-panel'); const byDbl = !!pop && pop.dataset.pid === A.pid && pop.dataset.sid === screens[0].id; closeScreenPanel();
    const btn = $$('#fs-toolbar .fs-drow-prop')[1]; if (btn) btn.click(); await wait(400); pop = $('#screen-panel'); const byBtn = !!pop && pop.dataset.sid === screens[1].id; closeScreenPanel();
    const asp = ($('#fs-toolbar .fs-drow-asp') || {}).textContent;
    hideMoveSymbol(); doSelect(null, null); _fsSetPropTab(tab); await wait(150);
    return is([picked, lit, box, byDbl, byBtn, asp], [true, 1, true, true, true, '16:9'], 'selected / one row lit / canvas box lit / opens on double-click / opens from the button / aspect');
  });
  await check('Advanced: the move arrows re-order destinations exactly as in Simple, and no two destinations ever land on the same spot', async () => {
    const pid = A.pid, p = () => presets.find(x => x.id === pid); const sid = screens[1].id, n0 = screens.length; const names0 = screens.map(s => s.name);
    _execMove(pid, sid, 'left'); await wait(500); const spots = screens.map(s => { const q = (p().positions || {})[s.id] || {}; return q.x + ',' + q.y; }); const names1 = screens.map(s => s.name);
    const out = is([screens.length, new Set(spots).size, names1[0], names1[1]], [n0, n0, names0[1], names0[0]], 'destinations / distinct positions / new first / new second'); doUndo(); await wait(500); return out;
  });
  await check('Advanced: + Destination opens its window ABOVE the Advanced page and adds the destination', async () => {
    const n0 = screens.length; actions.addDestination(); await wait(400); const m = $('#modal'), ov = $('#fs-overlay'); const zi = e => parseInt(getComputedStyle(e).zIndex, 10) || 0;
    const shown = m.classList.contains('show'), above = zi(m) > zi(ov); const r = $('#ms-n').getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const reachable = !!top && (top === $('#ms-n') || m.contains(top));
    $('#ms-n').value = 'ADV TEST DEST'; confirmScreen(); await wait(600); okDialogs(); const added = screens.length, drawn = $$('#fs-canvas .screen-box').length;
    const out = is([shown, above, reachable, added, drawn], [true, true, true, n0 + 1, n0 + 1], 'window shown / above Advanced / clickable / destinations / drawn in Advanced'); doUndo(); await wait(500); return out;
  });
// vp-advanced click-through (2026-09-21): new checks for tests/flows_probe.js. Each one FAILS on build 16ko as shipped and
// PASSES with patch.py (A*) / patch_shared.py (S*). Synthetic events on purpose (the probe runs inside the page).
// Helpers used: $, $$, wait, is, fire, okDialogs, dialogText, and the section's own A / mute / clipOk. No restore() in here: the
// Advanced section's test media lives in customLibrary AFTER BASE was taken, so restore() would delete it. Each check sets an undo
// bookmark (pushUndo) and walks back to it instead.

// ═══ BLOCK 1 ═══ INSERT straight AFTER the check
//   'Advanced: + Destination opens its window ABOVE the Advanced page and adds the destination'
// (Advanced is open on A.pid, nothing picked yet; every check here leaves the show as it found it.)
  await check('Advanced: Esc closes the window, menu or field on top and never the Advanced page under it; with nothing open it still goes back to Simple', async () => {
    const esc = t => (t || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const open = () => getComputedStyle($('#fs-overlay')).display !== 'none';
    actions.addDestination(); await wait(400); $('#ms-n').focus(); esc($('#ms-n')); await wait(250); const stayed = $('#modal').classList.contains('show') && open(); esc(); await wait(400); const afterWindow = [stayed && (getComputedStyle($('#modal')).display === 'none' || !$('#modal').classList.contains('show')), open()];   /* 16ks-esc: Escape in the Name box leaves the box, the next Escape closes the window */
    if (!open()) { openFullscreen(A.pid); await wait(600); }
    const btn = $('#fs-canvas .pr-actions button.v-cyan'); toggleAdvancedMenu({ stopPropagation() {}, currentTarget: btn, target: btn }); await wait(300); esc(); await wait(300); const afterMenu = [$('#adv-menu').classList.contains('open'), open()];
    if (!open()) { openFullscreen(A.pid); await wait(600); }
    const nm = $('#fs-canvas input.p-name'); nm.focus(); esc(nm); await wait(300); const afterField = open();
    if (!open()) { openFullscreen(A.pid); await wait(600); }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); esc(); await wait(400); const bare = open();
    if (!open()) { openFullscreen(A.pid); await wait(700); mute(); }
    return is([afterWindow, afterMenu, afterField, bare], [[true, true], [false, true], true, false], 'window closed + page stays / menu closed + page stays / page stays after Esc in a field / bare Esc leaves Advanced');
  });
  await check('Advanced: an arrow key with a destination selected resizes it like Simple and never slides it onto its neighbour', async () => {
    const s = screens[1], p = presets.find(x => x.id === A.pid); const x0 = ((p.positions || {})[s.id] || {}).x, w0 = parseInt(s.w); const u0 = _undoStack.length;
    doSelect(A.pid, s.id); selLayer = null; document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); await wait(350);
    const q = presets.find(x => x.id === A.pid); const x1 = ((q.positions || {})[s.id] || {}).x, w1 = parseInt(screens[1].w), steps = _undoStack.length - u0;
    while (_undoStack.length > u0) { doUndo(); await wait(250); } doSelect(null, null);
    return is([w1 - w0, x1 === x0, steps], [1, true, 1], 'width grew by / position untouched / undo steps');
  });
  await check('Advanced: a preset renamed in the tile shows in the page title and on its preset card at once', async () => {
    const p = presets.find(x => x.id === A.pid), old = p.name; const inp = $('#fs-canvas input.p-name'); if (!inp) return 'no Name field in the Advanced tile';
    inp.value = 'RENAME CHECK'; inp.dispatchEvent(new FocusEvent('blur')); inp.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); await wait(300);
    const got = [$('#fs-title').textContent.includes('RENAME CHECK'), ($('#fs-preset-list .fs-pcard.on .fs-pcard-name') || {}).textContent];
    presets.find(x => x.id === A.pid).name = old; renderFullscreen(); renderTable(); await wait(200);
    return is(got, [true, 'RENAME CHECK'], 'page title / preset card');
  });
  await check('Advanced: pressing a fader track in Properties keeps the panel under the pointer, the drag follows and lands as one undo step', async () => {
    const b0 = _undoStack.length; pushUndo(); setLayerSize(A.pid, A.sid, 1, 0.5, 0.5, 0, 0); _fsSelectLayer(A.pid, A.sid, 1); await wait(400);
    if (!$('#fs-props .lfx-acc[data-sec="pos"]').classList.contains('open')) _lfxToggleSec('pos'); await wait(150);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const f = $('#fs-props .lfx-acc[data-sec="pos"] input[type=range]'); if (!f) return 'no X fader'; const u0 = _undoStack.length;
    f.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); f.value = '300'; fire(f, 'input'); await wait(150); const kept = f.isConnected;
    if (kept) { f.value = '420'; fire(f, 'input'); fire(f, 'change'); } window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await wait(250);
    const x = _lfxGeo(A.pid, A.sid, 1, parseInt(A.s.w), parseInt(A.s.h)).x, steps = _undoStack.length - u0;
    _lfxSnap = null; while (_undoStack.length > b0) { doUndo(); await wait(250); } _fsClearLayer(); await wait(200); mute();
    return is([kept, x, steps], [true, 420, 1], 'fader survives the first step / X after the drag / undo steps');
  });
  await check('Advanced: Colour tag and Notes work when the BG is picked', async () => {
    const b0 = _undoStack.length; pushUndo(); _fsAssignBg(A.pid, A.sid, 'TEST 4x3'); await wait(400);
    _fsSetContentNotes('bg note'); _fsSetContentColor('#123abc'); _lfxCommit(); await wait(150); const me = customLibrary.find(c => c.l === 'TEST 4x3'); const got = [me.notes || '', me.c];
    _lfxSnap = null; while (_undoStack.length > b0) { doUndo(); await wait(250); } _fsClearLayer(); await wait(200); mute();
    return is(got, ['bg note', '#123abc'], 'notes / colour tag');
  });
  await check('Advanced: a Video card has a remove button; Remove asks first, empties every layer and BG that used the file with their clip settings, and one Undo brings it all back', async () => {
    const name = clipOk ? 'TEST CLIP' : 'TEST 4x3'; const b0 = _undoStack.length; pushUndo();
    homeSetL(A.pid, A.sid, 2, name); _fsAssignBg(A.pid, screens[1].id, name); setLayerMedia(A.pid, A.sid, 2, { hue: 20 }); _fsClearLayer(); _fsSetSrcTab('video'); await wait(400); mute();
    const back0 = async () => { while (_undoStack.length > b0) { doUndo(); await wait(250); } _fsSetSrcTab('images'); _fsClearLayer(); await wait(300); mute(); };
    const card = $$('#fs-source-list .fs-src-media').find(c => c.dataset.src === name); const x = card && card.querySelector('.fs-src-x'); if (!x) { await back0(); return 'no remove button on the Video card'; }
    const u0 = _undoStack.length; x.click(); await wait(350); const asked = /Remove/.test(dialogText()) && /2 places/.test(dialogText()); okDialogs(); await wait(600);
    const p = () => presets.find(q => q.id === A.pid); const gone = [customLibrary.some(c => c.l === name), getL(A.pid, A.sid, 2), (p().bgNames || {})[screens[1].id] || null, !!((p().layerMedia || {})[A.sid] || {})[2], _undoStack.length - u0];
    doUndo(); await wait(700); mute(); const back = [customLibrary.some(c => c.l === name), getL(A.pid, A.sid, 2), (p().bgNames || {})[screens[1].id], !clipOk || !!_fsMediaUrl(name)];
    await back0();
    return is([asked, gone, back], [true, [false, null, null, false, 1], [true, name, name, true]], 'asked with the use count / after Remove (in library, L2, BG, clip settings, undo steps) / after one Undo (in library, L2, BG, file attached)');
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
// ═══ BLOCK 3 (goes with patch_shared.py, the tile code Simple and Advanced share) ═══ INSERT straight AFTER the check
//   'Advanced: dragging a corner of a locked layer keeps its shape and the panel follows'
  await check('Advanced: dragging a layer, dragging its corner and nudging it with the arrow keys are each one undo step that really goes back', async () => {
    const b0 = _undoStack.length; pushUndo(); _fsClearLayer(); setLayerSize(A.pid, A.sid, 1, 0.4, 0.4, 0.1, 0.1); renderFullscreen(); await wait(300); mute();
    const geo = () => { const g = _lfxGeo(A.pid, A.sid, 1, parseInt(A.s.w), parseInt(A.s.h)); return g.x + ',' + g.y + ',' + g.w + ',' + g.h; };
    const drag = async (el, dx, dy) => { const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })); for (let i = 1; i <= 5; i++) { window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x + dx * i / 5, clientY: y + dy * i / 5 })); await wait(15); } window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x + dx, clientY: y + dy })); await wait(300); };
    const chip = () => $('#fs-canvas .layer-chip[data-pid="' + A.pid + '"][data-sid="' + A.sid + '"][data-lid="1"]'); const res = [];
    let g0 = geo(), u0 = _undoStack.length; await drag(chip(), 30, 10); let moved = geo() !== g0; let st = _undoStack.length - u0; if (st) { doUndo(); await wait(350); } res.push([moved, st, geo() === g0]);
    setLayerSize(A.pid, A.sid, 1, 0.4, 0.4, 0.1, 0.1); selLayer = { pid: A.pid, sid: A.sid, n: 1 }; renderFullscreen(); await wait(250); updateLayerSelDOM(A.pid, A.sid, 1, true); const h = $('#fs-canvas .layer-chip.lsel .lrh-br'); if (!h) { while (_undoStack.length > b0) { doUndo(); await wait(200); } return 'no corner handle on the picked layer'; }
    g0 = geo(); u0 = _undoStack.length; await drag(h, -20, -12); moved = geo() !== g0; st = _undoStack.length - u0; if (st) { doUndo(); await wait(350); } res.push([moved, st, geo() === g0]);
    setLayerSize(A.pid, A.sid, 1, 0.4, 0.4, 0.1, 0.1); selLayer = { pid: A.pid, sid: A.sid, n: 1 }; g0 = geo(); u0 = _undoStack.length; window._lbNudgeAt = 0; const k = key => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); k('ArrowRight'); k('ArrowRight'); k('ArrowDown'); await wait(300);
    moved = geo() !== g0; st = _undoStack.length - u0; if (st) { doUndo(); await wait(350); } res.push([moved, st, geo() === g0]);
    while (_undoStack.length > b0) { doUndo(); await wait(250); } _fsClearLayer(); await wait(200); mute();
    return is(res, [[true, 1, true], [true, 1, true], [true, 1, true]], 'for a move, a corner drag and three arrow presses: [it moved, undo steps, one Undo restores it]');
  });
    await check('Advanced: a clip dropped on the BG selects the BG and lists it like a layer', async () => {
      _fsAssignBg(A.pid, A.sid, 'TEST CLIP'); await wait(600); mute();
      return is([selLayer && selLayer.n, getBgName(A.pid, A.sid), secTitles().includes('Transition'), secTitles().includes('Position')], [0, 'TEST CLIP', true, false], 'BG');
    });
    await check('Advanced: Speed is a menu of fixed steps (0, 1.0, 1.25, 1.5, 2.0, 3.0), a pick sets the clip rate, 0 holds a still frame', async () => {
      const acc = $('.lfx-acc[data-sec="general"]', fp()); if (!$('.fs-speedpill', fp())) return 'no Speed menu in General';
      if (!vis($('.fs-speedpill', fp()))) { acc.querySelector('.lfx-head, .lfx-ttl, button').click(); await wait(350); }
      const open = async () => { $('.fs-speedpill', fp()).click(); await wait(250); return $$('.sys-dd .sys-dd-item'); };
      const labels = (await open()).map(i => i.textContent.trim()); $('.fs-speedpill', fp()).click(); await wait(200);
      const pick = async label => { const it = (await open()).find(i => i.textContent.trim().indexOf(label) === 0); if (!it) return 'no ' + label; it.click(); await wait(400); mute(); const lm = getLayerMedia(A.pid, A.sid, 0); return [lm.speed, $$('video').some(v => v.playbackRate === _fsRateOf(lm)), $('.fs-speedpill .pill-label', fp()).textContent]; };
      const a = await pick('1.25'), b = await pick('0'); const v = $$('video').find(x => x.playbackRate === 0); const t0 = v ? v.currentTime : -1; _fsPlayToggle(); await wait(450); mute(); const t1 = v ? v.currentTime : -2; _fsPauseAll(); await wait(200);
      const c = await pick('1.0');
      return is([labels, a, b, t1 === t0, c], [['0still frame', '1.0normal', '1.25', '1.5', '2.0', '3.0'], [125, true, '1.25'], [0, true, '0'], true, [100, true, '1.0']], 'speed menu');
    });
    await check('Advanced: the timeline shows transport for a picked clip and Play lights a transport key', async () => {
      const bar = $('.fs-tl-bar'); if (!bar) return 'no timeline bar'; mute(); _fsPlayToggle(); await wait(500); mute();
      const lit = $$('.fs-tl-bar button.on, .fs-tl-bar .on').length; const playing = $$('video').some(v => !v.paused); _fsPauseAll(); await wait(200);
      return is([playing, lit > 0], [true, true], 'playing / a lit key');
    });
    await check('Advanced: the transport strip keeps every key and both clocks inside it (it tightens, then wraps, never cuts)', () => {
      const bar = $('.fs-tl-bar'); if (!bar) return 'no transport strip'; const br = bar.getBoundingClientRect(); const out = [...bar.children].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > br.right + 1 || r.left < br.left - 1); }).map(e => e.id || e.className);
      return is([out, bar.scrollWidth <= bar.clientWidth + 1, !!$('#fs-tl-rem'), !!$('#fs-tl-in'), !!$('#fs-tl-p10')], [[], true, true, true, true], 'parts outside the strip / no sideways overflow / count-down clock / Mark In / Preset 10');
    });
    await check('Advanced: the Preset group has its own 30 / 20 / 10 and they move every clip to its last seconds', async () => {
      const keys = ['fs-tl-p30', 'fs-tl-p20', 'fs-tl-p10'].map(id => $('#' + id)); if (keys.some(k => !k)) return 'no Preset 30 / 20 / 10 keys'; const after = $('#fs-tl-ppause'); const placed = keys[0].getBoundingClientRect().left >= after.getBoundingClientRect().right - 1;
      _fsPauseAll(); await wait(150); const vids = Object.keys(_fsVideoEls).map(k => _fsVideoEls[k]).filter(v => isFinite(v.duration) && v.duration > 0); if (!vids.length) return 'no clip mounted';
      vids.forEach(v => { v.currentTime = 0; }); await wait(250); keys[2].click(); await wait(350);
      const want = vids.map(v => Math.max(0, v.duration - 10)); const got = vids.map(v => v.currentTime); const ok = got.every((t, i) => Math.abs(t - want[i]) < 0.08);
      return is([placed, ok, vids.every(v => v.paused)], [true, true, true], 'placed after the Preset keys / every clip at its last 10 s (clips shorter than 10 s go to their start) / still paused');
    });
    // ── clip transport (round 3): INSERT inside the `if (clipOk) {` block of tests/flows_probe.js, straight AFTER the check
    //    'Advanced: the timeline shows transport for a picked clip and Play lights a transport key'
    //    and BEFORE 'Advanced: nothing is left playing after Pause' (that check then also covers these).
    //    At that point TEST CLIP (0.7 s, 30 fps) sits on the BG of A and the BG is the picked layer.
    const ctFr = t => t == null ? null : Math.round((t - 0.0005) * 30 * 1000) / 1000;   // seconds -> frame number, whole = frame-exact
    const ctLm = () => getLayerMedia(A.pid, A.sid, 0);
    const ctKey = (k, target) => (target || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    const ctPark = async f => { _fsPauseAll(); const v = _fsVideoEls[_fsTargetKey()]; v.currentTime = 0; await wait(150); for (let i = 0; i < f; i++) _fsStepFrame(1); await wait(200); };   // park the playhead on frame f the way , and . do
    await check('Advanced: Mark In / Mark Out (strip buttons and the I / O keys) land on the playhead frame, work while the clip plays, Clear removes both and keeps the fades, each is one undo step', async () => {
      selLayer = { pid: A.pid, sid: A.sid, n: 0 }; renderFullscreen(); await wait(400); mute(); _fsPauseAll();
      const bi = $('#fs-tl-in'), bo = $('#fs-tl-out'), bx = $('#fs-tl-clr'); if (!bi || !bo || !bx) return 'no In / Out / Clear buttons in the transport strip';
      if (![bi, bo, bx].every(b => b.tagName === 'BUTTON' && !!b.title) || bi.disabled || bo.disabled) return 'In / Out / Clear must be real buttons with tooltips, live when a clip is picked';
      setLayerMedia(A.pid, A.sid, 0, { in: 0, out: null, fadeIn: 1 });
      await ctPark(5); bi.click(); await wait(200); const a = ctLm();                      // In at frame 5 by button
      await ctPark(13); ctKey('o'); await wait(200); const b = ctLm();                     // Out at frame 13 by key
      const lit = [$('#fs-tl-in').classList.contains('on'), $('#fs-tl-out').classList.contains('on')];
      const tmp = document.createElement('input'); document.body.appendChild(tmp); tmp.focus(); ctKey('i', tmp); ctKey('o', tmp); tmp.remove(); const typed = ctLm();   // typing never marks
      doUndo(); await wait(300); const u1 = ctLm(); doUndo(); await wait(300); const u2 = ctLm(); doRedo(); await wait(250); doRedo(); await wait(300); const r2 = ctLm(); mute();
      $('#fs-tl-clr').click(); await wait(250); const c = ctLm();
      _fsStop(); await wait(150); mute(); $('#fs-tl-play').click(); const v = _fsVideoEls[_fsTargetKey()]; for (let i = 0; i < 40 && v.currentTime < 0.12; i++) await wait(25); mute(); ctKey('i'); const stillPlaying = !!v && !v.paused; const fly = ctLm(); _fsPauseAll(); await wait(150);
      setLayerMedia(A.pid, A.sid, 0, { in: 0, out: null, fadeIn: 0 }); _fsTlSync(); renderFsPanel(true);
      return is([ctFr(a.in), a.out, ctFr(b.in), ctFr(b.out), lit, [ctFr(typed.in), ctFr(typed.out)], [ctFr(u1.in), u1.out], [u2.in, u2.out], [ctFr(r2.in), ctFr(r2.out)], [c.in, c.out, c.fadeIn], stillPlaying, fly.in > 0 && Number.isInteger(ctFr(fly.in))],
        [5, null, 5, 13, [true, true], [5, 13], [5, null], [0, null], [5, 13], [0, null, 1], true, true], 'in / out after each step');
    });
    await check('Advanced: the Transition copy / paste / reset act on the fades only, In / Out stay with the timeline', async () => {
      selLayer = { pid: A.pid, sid: A.sid, n: 0 }; _lfxOpen.transition = true; renderFsPanel(true); await wait(300);
      setLayerMedia(A.pid, A.sid, 0, { in: 5 / 30 + 0.0005, out: 13 / 30 + 0.0005, fadeIn: 1, fadeOut: .5 }); _fsSecAction('copy', 'transition');
      setLayerMedia(A.pid, A.sid, 0, { in: 2 / 30 + 0.0005, out: 10 / 30 + 0.0005, fadeIn: 0, fadeOut: 0 }); renderFsPanel(true); await wait(250);
      const tools = lbl => $('.lfx-acc[data-sec="transition"] .lfx-tools button[aria-label="' + lbl + '"]', fp()); if (!tools('Paste section') || !tools('Reset section')) return 'no Transition header tools';
      tools('Paste section').click(); await wait(350); const p = ctLm();
      tools('Reset section').click(); await wait(350); const r = ctLm();
      setLayerMedia(A.pid, A.sid, 0, { in: 0, out: null, fadeIn: 0, fadeOut: 0 }); _fsTlSync(); renderFsPanel(true); await wait(200);
      return is([[p.fadeIn, p.fadeOut, ctFr(p.in), ctFr(p.out)], [r.fadeIn, r.fadeOut, ctFr(r.in), ctFr(r.out)]], [[1, .5, 2, 10], [0, 0, 2, 10]], 'after paste / after reset');
    });
    await check('Advanced: with the Preset transport active a scrub moves every clip in the preset, with the Clip transport only the picked clip', async () => {
      const was = getL(A.pid, A.sid, 1); setL(A.pid, A.sid, 1, 'TEST CLIP'); selLayer = { pid: A.pid, sid: A.sid, n: 0 }; renderFullscreen(); await wait(700); mute();
      const kBg = 'BG:' + A.pid + ':' + A.sid, kL = _fsLayerKey(A.pid, A.sid, 1); if (!_fsVideoEls[kBg] || !_fsVideoEls[kL]) { setL(A.pid, A.sid, 1, was); renderFullscreen(); return 'two clips did not mount'; }
      const scrub = async f => { const tr = $('#fs-timeline .fs-tl-track.video'); const r = tr.getBoundingClientRect(); const x = r.left + r.width * f, y = r.top + r.height / 2; tr.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })); window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y })); await wait(250); };
      const t = () => [_fsVideoEls[kBg].currentTime, _fsVideoEls[kL].currentTime]; const dur = _fsVideoEls[kBg].duration;
      $('#fs-tl-pplay').click(); await wait(150); mute(); $('#fs-tl-ppause').click(); await wait(150); await scrub(0.6); const p = t();
      $('#fs-tl-play').click(); await wait(120); mute(); $('#fs-tl-pause').click(); await wait(150); await scrub(0.2); const c = t();
      _fsPauseAll(); $$('video').forEach(v2 => { v2.muted = true; v2.pause(); }); setL(A.pid, A.sid, 1, was); selLayer = { pid: A.pid, sid: A.sid, n: 0 }; renderFullscreen(); await wait(500); mute();
      const near = (x, want) => Math.abs(x - want) < 0.05;
      return is([near(p[0], dur * .6), near(p[1], dur * .6), near(c[0], dur * .2), near(c[1], dur * .6)], [true, true, true, true], 'Preset scrub BG / layer, then Clip scrub BG / layer (layer must stay)');
    });
    await check('Advanced: Level moves in 1% steps with Shift-drag and with the arrow keys on the level line, a plain drag keeps the 5% detents, arrows do not nudge the destination', async () => {
      selLayer = { pid: A.pid, sid: A.sid, n: 0 }; setLayerMedia(A.pid, A.sid, 0, { level: 100 }); renderFullscreen(); await wait(400); mute(); _fsTlSync();
      const line = () => $('#fs-timeline .fs-tl-vol'); if (!line()) return 'no level line';
      const dragBy = async (dy, shift) => { const el = line(), r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top; el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, shiftKey: shift })); for (let i = 1; i <= Math.abs(dy); i++) window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y + Math.sign(dy) * i, shiftKey: shift })); window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y + dy, shiftKey: shift })); await wait(200); };
      await dragBy(-3, true); const fine = ctLm().level; doUndo(); await wait(300); const undone = ctLm().level; mute();
      await dragBy(-9, false); const coarse = ctLm().level;
      if (!sel) sel = { pid: A.pid, sid: A.sid }; const pos = () => JSON.stringify(presets.find(x => x.id === A.pid).positions || {}); const p0 = pos();
      line().focus(); ctKey('ArrowUp', line()); ctKey('ArrowUp', line()); ctKey('ArrowDown', line()); await wait(200); const keyed = ctLm().level; const p1 = pos();
      setLayerMedia(A.pid, A.sid, 0, { level: 100 }); _fsTlSync();
      return is([fine, undone, coarse % 5 === 0 && coarse > 100, keyed - coarse, p0 === p1], [103, 100, true, 1, true], 'Shift-drag 3 px up / undo / plain drag / Up Up Down / destination position unchanged');
    });
// ═══ BLOCK 2 ═══ INSERT inside the `if (clipOk) { … }` group, straight AFTER the check
//   'Advanced: Level moves in 1% steps with Shift-drag and with the arrow keys on the level line, a plain drag keeps the 5% detents, arrows do not nudge the destination'
// (the BG of A holds TEST CLIP and is picked, the level line is on screen).
    await check('Advanced: a click, a drag and a double-click on the Level line are each at most one undo step, and one Undo goes back', async () => {
      selLayer = { pid: A.pid, sid: A.sid, n: 0 }; setLayerMedia(A.pid, A.sid, 0, { level: 60 }); renderFullscreen(); await wait(400); mute(); _fsTlSync();
      const el = $('#fs-timeline .fs-tl-vol'); if (!el) return 'no level line'; const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; const u0 = _undoStack.length;
      const press = () => { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })); window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y })); };
      press(); press(); el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: x, clientY: y })); await wait(250);
      const lvl = getLayerMedia(A.pid, A.sid, 0).level, steps = _undoStack.length - u0; doUndo(); await wait(300); const undone = getLayerMedia(A.pid, A.sid, 0).level; mute();
      while (_undoStack.length > u0) { doUndo(); await wait(200); } setLayerMedia(A.pid, A.sid, 0, { level: 100 }); _fsTlSync();
      return is([lvl, steps <= 2, undone !== 100], [100, true, true], 'level after the double-click / no more than two undo steps for the whole gesture (it was three) / one Undo leaves 100');
    });

    await check('Advanced: stepping to a preset that holds video with nothing picked wakes the Preset transport', async () => {
      const i = presets.findIndex(p => p.id === A.pid); const d = presets[i + 1] ? 1 : -1; if (!presets[i + d]) return 'no neighbour preset';
      _fsPauseAll(); fsNavPreset(d); await wait(600); const away = [Object.keys(_fsVideoEls).length, $('#fs-tl-pplay').disabled];
      fsNavPreset(-d); await wait(700); mute(); const back = [fsPresetId === A.pid, _fsTargetKey(), Object.keys(_fsVideoEls).length > 0, $('#fs-tl-pplay').disabled, $('#fs-tl-pstop').disabled];
      selLayer = { pid: A.pid, sid: A.sid, n: 0 }; _fsSetPropTab('layers'); renderFullscreen(); await wait(500); mute(); _fsPauseAll();
      return is([away, back], [[0, true], [true, '', true, false, false]], 'away (videos, greyed) / back (on preset, nothing picked, has video, Play greyed, Stop greyed)');
    });

    await check('Advanced: nothing is left playing after Pause', () => { _fsPauseAll(); $$('video').forEach(v => { v.muted = true; v.pause(); }); return $$('video').every(v => v.paused) ? true : 'a clip is still playing'; });
    await check('exports: a clip BG is written as a layer with its details', () => { const i = _bgExportInfo(A.pid, A.sid); return is([i.name, /^clip 640×360/.test(i.detail)], ['TEST CLIP', true], 'BG export line'); });
    await check('Advanced: clearing the BG source removes its picture too', async () => { selLayer = { pid: A.pid, sid: A.sid, n: 0 }; const hadOwn = !!getPBg(A.pid, A.sid); _fsSwapSource(''); await wait(350); return is([hadOwn, !!getPBg(A.pid, A.sid)], [true, false], 'cover'); });
  }
  await check('Advanced: a Display button sits left of Zoom, shows the format note first, and Cancel opens nothing', async () => {
    const b = $('#fs-display-btn'), z = $('#fs-zoom-widget'); if (!b || !z) return 'no Display button'; const before = JSON.stringify(getProjectState()), dirty = _isDirty;
    const left = b.getBoundingClientRect().right <= z.getBoundingClientRect().left + 1 && b.nextElementSibling === z; b.click(); await wait(350);
    const t = dialogText(); const asked = dlgOpen() && /Display output/i.test(t) && /H\.264/.test(t) && /ProRes/.test(t); const c = $('#dlg-cancel'); if (c) c.click(); await wait(300);
    return is([left, /Display/.test(b.textContent), asked, _dispIsOpen(), b.classList.contains('on'), JSON.stringify(getProjectState()) === before, _isDirty === dirty], [true, true, true, false, false, true, true], 'place / label / note / window / lit / show unchanged / dirty flag');
  });
  await check('Advanced: a blocked Display window says so and leaves the button unlit; an open one mirrors the preset with its information and without controls, and closes with the button', async () => {
    const real = window.open; let fake = null; window.open = function () { return null; }; _dispOpen(); await wait(300); const blockedMsg = /blocked/i.test(dialogText()); okDialogs(); await wait(200); const litWhenBlocked = $('#fs-display-btn').classList.contains('on');
    const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;left:-3000px;top:0;width:1280px;height:480px;border:0'; document.body.appendChild(fr); fake = fr.contentWindow; try { Object.defineProperty(fake, 'closed', { get() { return !fr.isConnected; }, configurable: true }); } catch (e) {} fake.close = function () { fr.remove(); };
    window.open = function () { return fake; }; _dispOpen(); await wait(900); window.open = real;
    const st = fake.document.getElementById('disp-stage'); const shown = st ? st.querySelectorAll('.screen-box').length : 0; const vis = q => st ? [...st.querySelectorAll(q)].filter(e => fake.getComputedStyle(e).display !== 'none').length : -1;
    const lit = $('#fs-display-btn').classList.contains('on'); const dressing = vis('.rh,.lrh,.lc-reset,.chip-x,.aoi-actions,.aoi-btn,.move-symbol,button,select'); const edVis = q => $$('#fs-canvas ' + q).filter(e => getComputedStyle(e).display !== 'none').length; const info = [vis('.screen-lbl') === edVis('.screen-lbl') && edVis('.screen-lbl') > 0, vis('.screen-box .screen-res') === edVis('.screen-box .screen-res'), vis('.chip-res') === edVis('.chip-res')];   /* the output shows exactly the labels the editor shows */ const vids = fake.document.querySelectorAll('video').length;
    $('#fs-display-btn').click(); await wait(500); const closed = !_dispIsOpen() && !$('#fs-display-btn').classList.contains('on'); if (fr.isConnected) fr.remove();
    return is([blockedMsg, litWhenBlocked, shown, lit, dressing, info, vids, closed], [true, false, screens.length, true, 0, [true, true, true], 0, true], 'blocked note / lit when blocked / destinations shown / lit / controls visible / names, resolutions and layer sizes shown / video elements in the output / closes');
  });
  await check('Advanced: closes cleanly', async () => { try { _fsPauseAll(); } catch (e) {} closeFullscreen(); await wait(400); return is([getComputedStyle($('#fs-overlay')).display, document.body.classList.contains('fs-open')], ['none', false], 'closed'); });
  await restore();
  // ── Video Presets canvas: blends, dead space, destination drag, Fit Canvas (round 3, adv-canvas) ──────────────────
  // INSERT AFTER the check 'Advanced: closes cleanly' and the `await restore();` that follows it (before "// ── Wire, Simple").
  // The three cv* helpers below belong to these checks. Overlay switches (Blend Zones / Dead Space / Free Position) are
  // session-wide and saved in localStorage, so every check puts them back the way it found them.
  const cvAdv = (f, on) => { const isOn = f === 'freePos' ? document.body.classList.contains('adv-free-position') : !document.body.classList.contains('adv-hide-' + f); if (isOn !== on) actions.toggleAdvFeature(f); closeAdvancedMenu(); return isOn; };
  const cvLay = async (a, c, r) => { const p = presets[0]; setPosition(p, screens[0].id, a[0], a[1]); setPosition(p, screens[1].id, c[0], c[1]); setPosition(p, screens[2].id, r[0], r[1]); render(); await wait(200); };
  const cvMouse = (el, type, x, y, o) => el.dispatchEvent(new MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1 }, o || {})));

  await check('Blend Zones: a top / bottom overlap reads on height (100 px of 1080 = 9%), and a typed PX moves the lower destination in one undo step', async () => {
    const was = cvAdv('blend', true);
    await cvLay([0, 0], [0, 980], [3840, 0]);
    const ov = $('#canvas-area .overlap-vis'); if (!ov) { cvAdv('blend', was); await restore(); return 'no overlap drawn'; }
    const inp = $('input', ov), chip = $$('.blend-label', ov).pop();
    const shown = [inp.value, parseInt(chip.textContent)];
    const u0 = _undoStack.length; inp.value = '216'; fire(inp, 'change'); await wait(250);
    const moved = presets[0].positions[screens[1].id], steps = _undoStack.length - u0;
    doUndo(); await wait(250); const back = presets[0].positions[screens[1].id];
    cvAdv('blend', was); await restore();
    return is([shown, [moved.x, moved.y], steps, [back.x, back.y]], [['100', 9], [0, 864], 1, [0, 980]], 'label / typed 216 px / undo steps / after undo');
  });
  await check('Blend popup: a rotated pair reads % on the effective width (216 px of 1080 = 20%), typing 25% gives 270 px, and the 15-25% guidance and caption show', async () => {
    const pid = presets[0].id; setRotation(pid, screens[0].id, 90); setRotation(pid, screens[1].id, 90);
    await cvLay([0, 0], [1080 - 216, 0], [4000, 0]);
    openBlendPopup(pid, screens[0].id, screens[1].id); await wait(200);
    const pop = $('#blend-popup'); if (!pop) { await restore(); return 'popup did not open'; }
    const pct = $('#blend-popup-pct', pop), g = $('#blend-popup-guide', pop);
    const seen = [pct.value, g ? g.textContent : null, /Recommended: 15-25% of output width\. Hold Shift to disable snap/.test(pop.textContent)];
    pct.value = '25'; fire(pct, 'change'); await wait(300);
    const p = presets[0], px = p.positions[screens[0].id].x + getEffectiveDims(screens[0], pid).w - p.positions[screens[1].id].x;
    closeBlendPopup(); await restore();
    return is([seen, px], [['20', '✓', true], 270], 'popup % / tick / caption, then px after 25%');
  });
  await check('Blend Zones: the % chip reads green tick at 15-25%, amber up-arrow under 15%, red down-arrow over 25%', async () => {
    const was = cvAdv('blend', true); const got = [];
    for (const x of [1620, 1820, 1320]) { await cvLay([0, 0], [x, 0], [4000, 0]); const chip = $$('#canvas-area .overlap-vis .blend-label').pop(); got.push(chip ? (chip.dataset.guide || 'none') + ' ' + chip.textContent.trim() : 'no chip'); }
    cvAdv('blend', was); await restore();
    return is(got, ['ok 16%✓', 'low 5%↑', 'high 31%↓'], '300 / 100 / 600 px of 1920');
  });
  await check('Dead Space: a gap over 500 px carries the "Large gap, check alignment" mark, a 300 px gap does not, and the mark stays out of the printed Look Book', async () => {
    const was = cvAdv('dead', true);
    await cvLay([0, 0], [1920, 0], [3840 + 900, 0]); const big = $('#canvas-area .dead-label .gap-warn');
    const printed = /gap-warn|⚠/.test(_pdfStaticizeAdv(_rcDeadVis(presets[0].positions, 0.2, presets[0].id)));
    await cvLay([0, 0], [1920, 0], [3840 + 300, 0]); const small = $('#canvas-area .dead-label .gap-warn');
    cvAdv('dead', was); await restore();
    return is([big ? big.title : null, !!small, printed], ['Large gap, check alignment', false, false], '900 px mark / 300 px mark / in print');
  });
  // ── BLOCK B: INSERT straight AFTER the check 'Dead Space: a gap over 500 px carries the "Large gap, check alignment" mark, ...' ──
  await check('Advanced: the dead-space read-out makes the same choice at 100% and zoomed in (narrow gap stacked, roomy gap one line), stays centred on the gap, and a typed PX still sets the gap', async () => {
    const back = dsDefaultPPI(); const was = dsAdv('dead', true); await dsLay([576, 2000]);
    openFullscreen(presets[0].id); await wait(700); okDialogs(); renderFullscreen(); await wait(300); const fs = $('#fs-canvas');
    const z1 = Math.round(fsZoom * 100), a = dsRead(fs, false);
    for (let i = 0; i < 4; i++) fsZoomBy(0.15); await wait(250); const z2 = Math.round(fsZoom * 100), b = dsRead(fs, false);
    const px = $$('input', dsBoxes(fs)[0])[0]; px.value = '384'; fire(px, 'change'); await wait(350); const g = dsGap(0), c = dsRead(fs, false);
    fsZoomReset(); closeFullscreen(); await wait(400); okDialogs(); dsAdv('dead', was); back(); await restore();
    return is({ zoomedIn: z2 > z1, a, b, g, c }, { zoomedIn: true, a: ['stacked', 'one line'], b: ['stacked', 'one line'], g: 384, c: ['stacked', 'one line'] },
      'zoom went up / read-outs at the first zoom / at the second zoom / gap after 384 typed in PX / read-outs after');
  });
  await check('Advanced: dragging a destination in Free Position does not pan the view, and the red snap guide sits on the snapped edge', async () => {
    const was = cvAdv('freePos', true);
    await cvLay([0, 0], [1920, 0], [3840 + 400, 0]);
    openFullscreen(presets[0].id); await wait(700); $$('video').forEach(v => { v.muted = true; });
    const box = $('#fs-canvas .screen-box[data-sid="' + screens[2].id + '"]'); const r = box.getBoundingClientRect();
    const sc = parseFloat((box.getAttribute('onmousedown').match(/,([0-9.]+)\)$/) || [])[1]), x0 = r.left + r.width / 2, y0 = r.top + r.height / 2, dx = -400 * sc * fsZoom;
    const pan0 = [fsPanX, fsPanY];
    cvMouse(box, 'mousedown', x0, y0); const panning = _fsPanning;
    for (let i = 1; i <= 4; i++) { cvMouse(window, 'mousemove', x0 + dx * i / 4, y0); await wait(30); }
    const guide = $$('.home-snap-guide').map(g => g.getBoundingClientRect()).find(q => q.width <= 2);
    const edge = $('#fs-canvas .screen-box[data-sid="' + screens[1].id + '"]').getBoundingClientRect().right;
    cvMouse(window, 'mouseup', x0 + dx, y0); await wait(300); okDialogs();
    const out = [panning, [fsPanX, fsPanY].join() === pan0.join(), presets[0].positions[screens[2].id].x, guide ? Math.abs(guide.left - edge) <= 2 : 'no guide'];
    try { _fsPauseAll(); } catch (e) {} closeFullscreen(); await wait(400); cvAdv('freePos', was); await restore();
    return is(out, [false, true, 3840, true], 'panning / pan unchanged / snapped X / guide within 2 px of the edge');
  });
  await check('Free Position: a drop slides the layout back to 0,0 in the same undo step as the drag (Fit Canvas after a drop)', async () => {
    const was = cvAdv('freePos', true);
    await cvLay([500, 300], [2420, 300], [4340, 300]);
    const box = $('#canvas-area .screen-box[data-sid="' + screens[2].id + '"]'); const r = box.getBoundingClientRect(), x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    const u0 = _undoStack.length;
    cvMouse(box, 'mousedown', x0, y0); for (let i = 1; i <= 4; i++) { cvMouse(window, 'mousemove', x0 + i * 10, y0, { shiftKey: true }); await wait(30); }
    cvMouse(window, 'mouseup', x0 + 40, y0); await wait(350); okDialogs();
    const a = presets[0].positions[screens[0].id], cv = [$('#cv-w').value > 5760, $('#cv-h').value], steps = _undoStack.length - u0;
    doUndo(); await wait(250); const b = presets[0].positions[screens[0].id];
    cvAdv('freePos', was); await restore();
    return is([[a.x, a.y], cv, steps, [b.x, b.y]], [[0, 0], [true, '1080'], 1, [500, 300]], 'LEFT after drop / canvas / undo steps / LEFT after undo');
  });
  await check('Advanced: the Advanced menu has Fit Canvas, it slides the open preset to 0,0 and trims the canvas in one undo step', async () => {
    await cvLay([500, 300], [2420, 300], [4340, 300]);
    openFullscreen(presets[0].id); await wait(700); $$('video').forEach(v => { v.muted = true; });
    const item = $('#adv-menu [data-adv-act="fit"]'); let out;
    if (!item) out = 'no Fit Canvas item in the Advanced menu';
    else {
      const u0 = _undoStack.length; item.click(); await wait(350);
      const p = presets[0], pos = screens.map(s => p.positions[s.id].x + ',' + p.positions[s.id].y), cv = $('#cv-w').value + 'x' + $('#cv-h').value, steps = _undoStack.length - u0;
      doUndo(); await wait(250); const b = presets[0].positions[screens[0].id];
      out = is([pos, cv, steps, [b.x, b.y]], [['0,0', '1920,0', '3840,0'], '5760x1080', 1, [500, 300]], 'positions / canvas / undo steps / after undo');
    }
    try { _fsPauseAll(); } catch (e) {} closeFullscreen(); await wait(400); await restore();
    return out;
  });
  await check('Modifiers: the preset tile button reads MODIFIERS and hangs the menu; the status bar holds a greyed-out Educator that does nothing; the page switch still reads Advanced', async () => {
    closeAdvancedMenu(); const tile = $('.preset-row .pr-actions button[onclick*="toggleAdvancedMenu"]'), menu = $('#adv-menu'), edu = $('#tb-educator'); if (!tile || !menu) return 'no Modifiers button on the preset tile'; if (!edu) return 'no Educator placeholder in the status bar';
    const word = b => [...b.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    const tileOk = [word(tile), /^Modifiers/.test(tile.getAttribute('aria-label') || ''), /^Modifiers: options you switch on or off/.test(tile.title), tile.scrollWidth <= tile.clientWidth + 1];
    edu.click(); await wait(200); const eduOk = [edu.textContent.trim(), edu.disabled, menu.classList.contains('open'), !!$('#tb-adv'), edu.getBoundingClientRect().right <= innerWidth];
    tile.click(); await wait(250); const hung = menu.classList.contains('open'); const items = $$('#adv-menu .adv-item .lbl').map(x => x.textContent.trim()); closeAdvancedMenu(); await wait(150);
    const pageSwitch = $$('[data-vp-view="advanced"]').map(b => b.textContent.trim()).filter((t, i, a) => a.indexOf(t) === i);
    return is({ tileOk, eduOk, hung, items, pageSwitch }, { tileOk: ['Modifiers', true, true, true], eduOk: ['Educator', true, false, false, true], hung: true, items: ['AOI Overlays', 'Blend Zones', 'Dead Space', 'Free Position', 'Fit Canvas'], pageSwitch: ['Advanced'] }, 'tile / Educator [label, disabled, menu opened by it, old button still there, inside the window] / menu / items / page switch');
  });
  await check('Modifiers: Help and the Look Book window point at "Modifiers ▾", nothing on screen still says "Advanced ▾" or "Advanced menu"', async () => {
    openHelp(); await wait(350); const h = $('#help-overlay'); const ht = h ? h.textContent : ''; const helpOpen = vis(h); closeHelp(); await wait(200);
    openPdfExportModal(); await wait(350); const m = $('#pdf-export-modal'); const hint = ((m ? m.textContent : '').match(/Defaults follow[^.]*\./) || [''])[0]; closePdfExportModal(); await wait(200);
    const old = $$('button, [title], [aria-label]').filter(el => /Advanced (features|view options|menu)|Advanced\s*▾/.test((el.title || '') + ' ' + (el.getAttribute('aria-label') || ''))).length;
    return is([helpOpen, /Preset tile . Modifiers . menu/.test(ht), /Open the Modifiers ▾ menu/.test(ht), /Modifiers ▾ Dead Space/.test(ht), /Advanced\s*▾/.test(ht), /Simple vs Advanced/.test(ht), /Modifiers ▾/.test(hint), /Advanced/.test(hint), old],
      [true, true, true, true, false, true, true, false, 0], 'Help open / section title / turn-it-on row / dead-space pointer / old word in Help / Wire "Simple vs Advanced" kept / Look Book hint new / hint old / old tooltips left');
  });
  await check('Modifiers: a switch is ONE state for every preset on this computer, not a preset setting: no undo step, show stays clean, nothing in the show file', async () => {
    closeAdvancedMenu(); const was = !document.body.classList.contains('adv-hide-blend'); if (was) toggleAdvFeature('blend');
    const before = JSON.stringify(getProjectState()), u0 = _undoStack.length, dirty0 = _isDirty; const tiles = $$('.preset-row .pr-actions button[onclick*="toggleAdvancedMenu"]'); if (tiles.length < 2) return 'needs two preset tiles';
    tiles[0].click(); await wait(200); $('#adv-menu [data-adv="blend"]').click(); await wait(250); const closed = !$('#adv-menu').classList.contains('open');
    tiles[1].click(); await wait(200); const tickOnOtherTile = $('#adv-menu [data-adv="blend"]').classList.contains('on'); closeAdvancedMenu();
    const out = [closed, tickOnOtherTile, !document.body.classList.contains('adv-hide-blend'), !$('#tb-adv'), _undoStack.length - u0, _isDirty === dirty0, JSON.stringify(getProjectState()) === before, /blend/.test(localStorage.getItem('lookbook_adv_settings') || '')];
    toggleAdvFeature('blend'); if (was) toggleAdvFeature('blend'); closeAdvancedMenu(); await wait(150);
    return is(out, [true, true, true, true, 0, true, true, true], 'menu closes on a pick / tick shows from another tile / blend view on / no status-bar Modifiers button / undo steps / dirty unchanged / show unchanged / kept in this browser only');
  });
  await check('Destination drag ends when the mouse-up is lost (the button was released outside the window)', async () => {
    const was = cvAdv('freePos', true);
    await cvLay([0, 0], [1920, 0], [3840, 0]);
    const box = $('#canvas-area .screen-box[data-sid="' + screens[2].id + '"]'); const r = box.getBoundingClientRect(), x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    cvMouse(box, 'mousedown', x0, y0); for (let i = 1; i <= 3; i++) { cvMouse(window, 'mousemove', x0 + i * 10, y0, { shiftKey: true }); await wait(30); }
    const held = presets[0].positions[screens[2].id].x;
    cvMouse(window, 'mousemove', x0 + 35, y0, { buttons: 0, shiftKey: true }); await wait(30);
    cvMouse(window, 'mousemove', x0 + 90, y0, { shiftKey: true }); await wait(60);
    const after = presets[0].positions[screens[2].id].x;
    cvMouse(window, 'mouseup', x0 + 90, y0); await wait(250); okDialogs();
    cvAdv('freePos', was); await restore();
    return held > 3840 && after === held ? true : 'the destination kept following the pointer after the button was released: X ' + held + ' -> ' + after;
  });

  // ── Wire, Simple ────────────────────────────────────────────────────────────────────────────────────────────────
  const srcNames = () => (typeof _wireBuildAllSourceNames === 'function' ? _wireBuildAllSourceNames() : []);
  // ── no-overlap guard (2026-09-21): INSERT in tests/flows_probe.js straight AFTER the check
  //    'Destination drag ends when the mouse-up is lost (the button was released outside the window)' (it uses cvAdv / cvMouse from that section).
  //    Checks 1 to 5 FAIL on build 16kp without patch.py and PASS with it. Check 6 only PINS behaviour that already exists.
  const ovlPairs = () => [..._overlapPairsForPreset(presets[0])].map(k => k.split('|').map(id => screens.findIndex(s => s.id === id) + 1).sort().join('+')).sort().join(',');
  const ovlAsked = () => dlgOpen() && /Create Blend Zone/.test(dialogText());
  const ovlStrip = async () => { presets.forEach(p => repackPositions(p.id)); render(); await wait(200); };
  const ovlTwoRows = async () => { await ovlStrip(); const last = screens[screens.length - 1]; setPosition(presets[0], last.id, 0, parseInt(screens[0].h) + 40); render(); await wait(200); };
  const ovlGeo = () => JSON.stringify(screens.map(s => [parseInt(s.w), parseInt(s.h), presets[0].positions[s.id], getRotation(presets[0].id, s.id), _screenHidden(presets[0], s.id)]));
  // Add these two helpers straight after the existing line  "const ovlGeo = () => JSON.stringify(...)":
  const ovlBlocked = () => dlgOpen() && /Destinations can.t overlap/.test(dialogText()) && !$('#dlg-cancel');
  const ovlShut = async () => { if (dlgOpen()) { ($('#dlg-cancel') || $('#dlg-confirm')).click(); await wait(400); } };   // Cancel on a question, OK on an alert: never "Add to blend"

  // REPLACES: 'no overlap: a typed X in Destination Properties that lands on the neighbour asks "Create Blend Zone?"; Cancel puts it back with no undo step; Add to blend is ONE undo step, marks the show unsaved and survives save + reload without a question'
  await check('no overlap: a typed X in Destination Properties that lands on the neighbour is BLOCKED while Blend Zones is off (nothing moves, no undo step); with Blend Zones on it asks "Create Blend Zone?"; Cancel puts it back with no undo step; Add to blend is ONE undo step, marks the show unsaved and survives save + reload without a question', async () => {
    await ovlStrip(); const b = screens[1].id; const X = () => presets[0].positions[b].x; const x0 = X(), n = _undoStack.length;
    const apply = async () => { openScreenPanel(fakeEv, presets[0].id, b); await wait(400); const pop = $('#screen-panel'); if (!pop) return false; $('#sp-x', pop).value = String(x0 - 300); $('#sp-apply', pop).click(); await wait(400); return true; };
    const wasOff = cvAdv('blend', false), wasFree = cvAdv('freePos', false);
    if (!(await apply())) { cvAdv('blend', wasOff); cvAdv('freePos', wasFree); return 'Destination Properties did not open'; }
    if (!ovlBlocked()) { const got = dialogText().slice(0, 60) || 'no dialog'; await ovlShut(); cvAdv('blend', wasOff); cvAdv('freePos', wasFree); await restore(); return 'not blocked with Blend Zones off: ' + got + ' (overlaps now: ' + ovlPairs() + ')'; }
    const blocked = [X(), ovlPairs(), _undoStack.length - n]; await ovlShut();
    cvAdv('blend', true); await wait(150);
    await apply(); if (!ovlAsked()) { const got = ovlPairs(); await ovlShut(); cvAdv('blend', wasOff); cvAdv('freePos', wasFree); await restore(); return 'no question with Blend Zones on: destination 2 went 300 px over destination 1 silently (overlaps now: ' + got + ')'; }
    $('#dlg-cancel').click(); await wait(400); const cancel = [X(), ovlPairs(), _undoStack.length - n];
    await apply(); const asked2 = ovlAsked(); $('#dlg-confirm').click(); await wait(700); const add = [X(), ovlPairs(), _undoStack.length - n, _isDirty];
    doUndo(); await wait(300); const undone = [X(), ovlPairs()]; doRedo(); await wait(300);
    _applyProjectText(JSON.stringify(getProjectState())); await wait(800); const onLoad = [ovlAsked() || ovlBlocked(), ovlPairs()]; okDialogs();
    cvAdv('blend', wasOff); cvAdv('freePos', wasFree);
    await restore(); return is([blocked, asked2, cancel, add, undone, onLoad], [[x0, '', 0], true, [x0, '', 0], [x0 - 300, '1+2', 1, true], [x0, ''], [false, '1+2']], 'blocked with Blend Zones off (X, overlaps, undo steps) / asked again with it on / after Cancel (X, overlaps, undo steps) / after Add to blend (X, overlaps, undo steps, unsaved) / after Undo / after save + reload (dialog, overlaps)');
  });
  // REPLACES: 'no overlap: a typed Rotation whose tilted footprint reaches the neighbour asks; Cancel takes the rotation back with no undo step; a 90 degree turn on a clean strip still re-packs without a question'
  await check('no overlap: a typed Rotation whose tilted footprint reaches the neighbour is BLOCKED while Blend Zones is off (rotation back, no undo step) and asks with Blend Zones on; Cancel takes the rotation back with no undo step; a 90 degree turn on a clean strip still re-packs without a question or an alert', async () => {
    await ovlStrip(); const a = screens[0].id, n = _undoStack.length;
    const rot = async v => { openScreenPanel(fakeEv, presets[0].id, a); await wait(400); const pop = $('#screen-panel'); if (!pop) return false; $('#sp-rot', pop).value = String(v); $('#sp-apply', pop).click(); await wait(400); return true; };
    const wasOff = cvAdv('blend', false), wasFree = cvAdv('freePos', false);
    if (!(await rot(30))) { cvAdv('blend', wasOff); cvAdv('freePos', wasFree); return 'Destination Properties did not open'; }
    if (!ovlBlocked()) { const got = dialogText().slice(0, 60) || 'no dialog'; await ovlShut(); cvAdv('blend', wasOff); cvAdv('freePos', wasFree); await restore(); return 'not blocked with Blend Zones off: ' + got + ' (overlaps now: ' + ovlPairs() + ')'; }
    const blocked = [getRotation(presets[0].id, a), ovlPairs(), _undoStack.length - n]; await ovlShut();
    await rot(90); const quiet = [dlgOpen(), getRotation(presets[0].id, a), ovlPairs()]; okDialogs(); await restore(); await ovlStrip(); const n2 = _undoStack.length;
    cvAdv('blend', true); await wait(150); await rot(30);
    if (!ovlAsked()) { const got = ovlPairs(); await ovlShut(); cvAdv('blend', wasOff); cvAdv('freePos', wasFree); await restore(); return 'no question with Blend Zones on: the 30 degree footprint went over the neighbour silently (overlaps now: ' + got + ')'; }
    $('#dlg-cancel').click(); await wait(400); const cancel = [getRotation(presets[0].id, a), ovlPairs(), _undoStack.length - n2];
    cvAdv('blend', wasOff); cvAdv('freePos', wasFree);
    await restore(); return is([blocked, quiet, cancel], [[0, '', 0], [false, 90, ''], [0, '', 0]], 'blocked with Blend Zones off (rotation, overlaps, undo steps) / 90 on a clean strip (dialog, rotation, overlaps) / with Blend Zones on, after Cancel (rotation, overlaps, undo steps)');
  });
  // REPLACES: 'no overlap: a pasted position that sits on another destination asks; Cancel puts it back with no undo step and the panel closes'
  await check('no overlap: a pasted position that sits on another destination is BLOCKED while Blend Zones is off and asks with Blend Zones on; either way it is back where it was with no undo step and the panel closes', async () => {
    const out = []; const wasOff = cvAdv('blend', false), wasFree = cvAdv('freePos', false);
    for (const blendOn of [false, true]) {
      cvAdv('blend', blendOn); await ovlStrip(); const a = screens[0].id, c = screens[2].id, n0 = () => _undoStack.length; const x0 = presets[0].positions[c].x;
      openScreenPanel(fakeEv, presets[0].id, a); await wait(400); let pop = $('#screen-panel'); if (!pop) { cvAdv('blend', wasOff); cvAdv('freePos', wasFree); return 'Destination Properties did not open'; }
      $('[data-sp-key="pos"][data-sp-tool="copy"]', pop).click(); closeScreenPanel(); await wait(150);
      openScreenPanel(fakeEv, presets[0].id, c); await wait(400); pop = $('#screen-panel'); const n = n0();
      $('[data-sp-key="pos"][data-sp-tool="paste"]', pop).click(); await wait(400);
      const saw = ovlBlocked() ? 'blocked' : ovlAsked() ? 'asked' : 'silent ' + ovlPairs(); await ovlShut();
      out.push([saw, presets[0].positions[c].x === x0, ovlPairs(), n0() - n, !!$('#screen-panel')]); closeScreenPanel(); await restore();
    }
    cvAdv('blend', wasOff); cvAdv('freePos', wasFree);
    return is(out, [['blocked', true, '', 0, false], ['asked', true, '', 0, false]], 'Blend Zones off / on: [what came up, X back, overlaps, undo steps, panel still open]');
  });
  // REPLACES: 'no overlap: with a second row under destination 1, a height change (corner handle, typed H, I/O Patch resolution) that would drop the row onto the strip asks each time, and Cancel puts every destination back'
  await check('no overlap: with a second row under destination 1, a height change (corner handle, typed H, I/O Patch resolution) that would drop the row onto the strip is BLOCKED each time while Blend Zones is off and asks each time with Blend Zones on; every destination is back afterwards with no undo step', async () => {
    const out = []; const wasOff = cvAdv('blend', false), wasFree = cvAdv('freePos', false);
    const run = async (label, blendOn, act) => {
      cvAdv('blend', blendOn); await ovlTwoRows(); const g0 = ovlGeo(), n = _undoStack.length; await act(); await wait(450);
      const saw = ovlBlocked() ? 'blocked' : ovlAsked() ? 'asked' : 'silent ' + (ovlPairs() || 'no overlap'); await ovlShut();
      out.push([label, blendOn ? 'on' : 'off', saw, ovlGeo() === g0, _undoStack.length - n]); doSelect(null, null); await restore();
    };
    for (const blendOn of [false, true]) {
      await run('corner handle', blendOn, async () => { doSelect(presets[0].id, screens[0].id); await wait(250); await vpDrag($('.preset-row[data-pid="' + presets[0].id + '"] .screen-box[data-sid="' + screens[0].id + '"] > .rh-tr'), 0, 14); });
      await run('typed H', blendOn, async () => { openScreenPanel(fakeEv, presets[0].id, screens[0].id); await wait(400); const pop = $('#screen-panel'); $('#sp-h', pop).value = String(parseInt(screens[0].h) - 80); $('#sp-apply', pop).click(); });
      await run('I/O Patch resolution', blendOn, async () => { _sysSetMeta('dest', screens[0].id, 'resolution', parseInt(screens[0].w) + 'x' + (parseInt(screens[0].h) - 80)); });
    }
    cvAdv('blend', wasOff); cvAdv('freePos', wasFree);
    const want = []; for (const m of [['off', 'blocked'], ['on', 'asked']]) for (const l of ['corner handle', 'typed H', 'I/O Patch resolution']) want.push([l, m[0], m[1], true, 0]);
    return is(out, want, 'per path and Blend Zones state: [path, Blend Zones, what came up, everything back, undo steps left]');
  });
  // REPLACES: 'no overlap: a wider Dead Space value that pushes a destination onto the next one asks, and so does putting a removed destination back into a slot that was taken; Cancel undoes both'
  await check('no overlap: a wider Dead Space value that pushes a destination onto the next one, and putting a removed destination back into a slot that was taken, are both BLOCKED while Blend Zones is off and both ask with Blend Zones on; everything is back afterwards with no undo step', async () => {
    const out = []; const wasOff = cvAdv('blend', false), wasFree = cvAdv('freePos', false), wasDead = cvAdv('dead', true); const P = () => presets[0], w = i => parseInt(screens[i].w);
    for (const blendOn of [false, true]) {
      cvAdv('blend', blendOn); await ovlStrip();
      setPosition(P(), screens[1].id, w(0) + 100, P().positions[screens[1].id].y); setPosition(P(), screens[2].id, w(0) + 100 + w(1), P().positions[screens[2].id].y); render(); await wait(300);
      const inp = $$('.preset-row[data-pid="' + P().id + '"] input').find(i => /setDeadPx/.test(i.getAttribute('onchange') || '')); if (!inp) { cvAdv('dead', wasDead); cvAdv('blend', wasOff); cvAdv('freePos', wasFree); await restore(); return 'no dead-space box on the tile'; }
      const g0 = ovlGeo(), n = _undoStack.length; inp.value = '600'; fire(inp, 'change'); await wait(400);
      const dead = ovlBlocked() ? 'blocked' : ovlAsked() ? 'asked' : 'silent ' + ovlPairs(); await ovlShut();
      out.push(['dead space', blendOn ? 'on' : 'off', dead, ovlGeo() === g0, _undoStack.length - n]);
      await restore(); await ovlStrip(); const hid = screens[1].id; P().hiddenScreens = {}; P().hiddenScreens[hid] = true; setPosition(P(), screens[2].id, P().positions[hid].x, P().positions[hid].y); render(); await wait(250);
      const g1 = ovlGeo(), n1 = _undoStack.length; _unhideScreen(P().id, hid); await wait(400);
      const unhide = ovlBlocked() ? 'blocked' : ovlAsked() ? 'asked' : 'silent ' + ovlPairs(); await ovlShut();
      out.push(['put back into preset', blendOn ? 'on' : 'off', unhide, ovlGeo() === g1, _undoStack.length - n1]); await restore();
    }
    cvAdv('dead', wasDead); cvAdv('blend', wasOff); cvAdv('freePos', wasFree);
    return is(out, [['dead space', 'off', 'blocked', true, 0], ['put back into preset', 'off', 'blocked', true, 0], ['dead space', 'on', 'asked', true, 0], ['put back into preset', 'on', 'asked', true, 0]], 'per action and Blend Zones state: [action, Blend Zones, what came up, everything back, undo steps left]');
  });
  await check('no overlap (existing behaviour, pinned): a Free Position drop on a neighbour asks and Cancel puts it back; the Blend Zones sideways drag and the blend PX box blend without a question; a typed Width on a strip, Add Destination, Duplicate and Fit Canvas make no overlap and ask nothing', async () => {
    await ovlStrip(); const wasF = cvAdv('freePos', true); const pid = presets[0].id; const boxOf = i => $('.preset-row[data-pid="' + pid + '"] .screen-box[data-sid="' + screens[i].id + '"]');
    const dragLeft = async (i, frac) => { const el = boxOf(i), r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height * 0.8; cvMouse(el, 'mousedown', x, y); for (let k = 1; k <= 5; k++) { cvMouse(window, 'mousemove', x - r.width * frac * k / 5, y, { shiftKey: true }); await wait(25); } cvMouse(window, 'mouseup', x - r.width * frac, y); await wait(350); };
    const x0 = presets[0].positions[screens[1].id].x; await dragLeft(1, 0.4); const free = [ovlAsked()]; if (dlgOpen()) { $('#dlg-cancel').click(); await wait(350); } free.push(presets[0].positions[screens[1].id].x === x0, ovlPairs());
    cvAdv('freePos', false); const wasB = cvAdv('blend', true); await wait(250); await dragLeft(1, 0.25); const side = [dlgOpen(), ovlPairs()]; okDialogs();
    const px = $$('.preset-row[data-pid="' + pid + '"] input').find(i => /setBlendPx/.test(i.getAttribute('onchange') || '')); let box = 'no PX box';
    if (px) { px.value = '200'; fire(px, 'change'); await wait(350); box = [dlgOpen(), ovlPairs()]; okDialogs(); }
    cvAdv('blend', wasB); cvAdv('freePos', wasF); await ovlStrip();
    openScreenPanel(fakeEv, presets[0].id, screens[0].id); await wait(400); $('#sp-w', $('#screen-panel')).value = String(parseInt(screens[0].w) + 500); $('#sp-apply', $('#screen-panel')).click(); await wait(400); const wide = [dlgOpen(), ovlPairs()]; okDialogs();
    actions.addDestination(); await wait(300); $('#ms-n').value = 'OVL ADD'; confirmScreen(); await wait(400); const added = [dlgOpen(), ovlPairs()]; okDialogs();
    duplicateScreen(screens[0].id); await wait(400); const dup = [dlgOpen(), ovlPairs()]; okDialogs();
    presets.forEach(p => screens.forEach(s => { const q = p.positions[s.id]; if (q) setPosition(p, s.id, q.x + 300, q.y + 120); })); fitCanvasTrim(presets[0].id); await wait(300); const fit = [dlgOpen(), ovlPairs()]; okDialogs();
    await restore(); return is([free, side, box, wide, added, dup, fit], [[true, true, ''], [false, '1+2'], [false, '1+2'], [false, ''], [false, ''], [false, ''], [false, '']], 'Free Position drop (asked, back after Cancel, overlaps) / Blend Zones drag / PX box / typed Width / Add Destination / Duplicate / Fit Canvas, each (question, overlaps)');
  });
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
  // ── Wire SIMPLE click-through (wire-simple): INSERT in tests/flows_probe.js straight AFTER the check
  //    'Wire: the Export window offers sheet sizes from Letter to ANSI E' (Wire is open in Simple at that point; every
  //    check below re-opens it anyway). Helpers used: $, $$, wait, is, vis, restore, okDialogs, dlgOpen, srcNames.
  //    Every one FAILS on build 16ko and PASSES with clickthrough/wire-simple/patch.py applied.
  const wsOpen = async () => { if (getComputedStyle($('#wire-overlay')).display !== 'flex') { openWireMode(); await wait(450); } if (wireSettings.wireView !== 'simple') { wireSettings.wireView = 'simple'; _wireRender(); await wait(300); } };
  const wsWireUp = () => getComputedStyle($('#wire-overlay')).display === 'flex';
  const wsEsc = el => (el || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
  await check('Wire: Esc closes the Export window, a cable-type menu, the resolution menu, Help or a dialog first, never the Wire page under it', async () => {
    const bad = [];
    await wsOpen(); openWireExportModal(); await wait(250); wsEsc(); await wait(250); if (!wsWireUp()) bad.push('Export window: Wire closed'); if (vis($('#wire-export-modal'))) bad.push('Export window stayed open'); closeWireExportModal();
    await wsOpen(); $('#wire-sources-panel .wire-cable-btn').click(); await wait(250); wsEsc(); await wait(250); if (!wsWireUp()) bad.push('cable-type menu: Wire closed'); if ($$('.sys-dd').some(vis)) bad.push('cable-type menu stayed open'); if (typeof _sysCloseMenu === 'function') _sysCloseMenu();
    await wsOpen(); $('#wire-sources-panel .wire-res-dropdown-btn').click(); await wait(250); wsEsc(); await wait(250); if (!wsWireUp()) bad.push('resolution menu: Wire closed'); if ($('.shared-res-dd')) bad.push('resolution menu stayed open'); closeSharedResPicker();
    await wsOpen(); actions.help(); await wait(300); wsEsc(); await wait(300); if (!wsWireUp()) bad.push('Help: Wire closed'); try { closeHelp(); } catch (e) {}
    await wsOpen(); showAlert({ variant: 'info', title: 'Esc test', message: 'x' }); await wait(250); wsEsc(); await wait(300); if (!wsWireUp()) bad.push('dialog: Wire closed'); okDialogs();
    /* and with nothing open the documented cascade still runs: preset filter first, then leave Wire */
    await wsOpen(); _wireSelectPreset(presets[0].id); await wait(200); wsEsc(); await wait(200); if (_wireState.activePreset !== null || !wsWireUp()) bad.push('cascade: the first Esc did not just clear the preset filter'); wsEsc(); await wait(250); if (wsWireUp()) bad.push('cascade: the second Esc did not leave Wire');
    await wsOpen(); return bad.length ? bad.join(' | ') : true;
  });
  await check('Wire: Esc in the rename field or a resolution field cancels the typing and leaves the Wire page open', async () => {
    await wsOpen(); const n = srcNames(); const pen = $$('#wire-sources-panel .wire-src-pen')[0]; pen.click(); await wait(200);
    const inp = $('#wire-sources-panel .wire-src-rename'); inp.value = 'ESC TEST NAME'; wsEsc(inp); await wait(350); const a = [wsWireUp(), srcNames()[0] === n[0]];
    await wsOpen(); const res = $('#wire-sources-panel .wire-source-res'); const was = res.value; res.focus(); res.value = '999x999'; wsEsc(res); await wait(350);
    const meta = _wireGetSourceMeta(srcNames()[0]); const out = is([a, wsWireUp(), meta.resolution === was], [[true, true], true, true], 'rename [Wire open, name kept] / Wire open after Esc in resolution / old resolution kept');
    await restore(); await wsOpen(); return out;
  });
  await check('Wire: + Destination opens ABOVE the Wire page and the new destination lands in the Wire panel', async () => {
    await wsOpen(); const n = screens.length; actions.addDestination(); await wait(350); const m = $('#modal'); const f = $('#ms-n'); const r = f.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const reach = !!top && m.contains(top); f.value = 'WIRE STACK DEST'; $('#ms-w').value = '1920'; $('#ms-h').value = '1080'; confirmScreen(); await wait(500); okDialogs(); await wait(300);
    const listed = $$('#wire-sources-panel .wire-source-name').some(e => /WIRE STACK DEST/.test(e.textContent));
    const out = is([reach, screens.length, listed], [true, n + 1, true], 'window reachable over Wire / destination count / listed in Wire'); await restore(); await wsOpen(); return out;
  });
  await check('Wire: an edit made on a card (cable colour) lights the unsaved mark without leaving Wire', async () => {
    await restore(); await wsOpen(); await wait(500); _captureCleanBaseline(); _recomputeDirty(); const before = _isDirty;   /* opening Wire gives uncoloured sources a cable colour: start from a clean mark */
    _wireRandomizeSourceColor(srcNames()[0]); await wait(700); const after = _isDirty;
    await restore(); await wsOpen(); return is([before, after], [false, true], 'unsaved mark before / after');
  });
  await check('Wire: one source thumbnail upload is ONE undo step (picture and sampled colour together)', async () => {
    await wsOpen(); const name = srcNames()[0]; const cv = document.createElement('canvas'); cv.width = 64; cv.height = 36; const x = cv.getContext('2d'); x.fillStyle = '#d81e28'; x.fillRect(0, 0, 64, 36);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png')); const realClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () { if (this.type !== 'file') return realClick.call(this); const dt = new DataTransfer(); dt.items.add(new File([blob], 't.png', { type: 'image/png' })); this.files = dt.files; this.dispatchEvent(new Event('change')); };
    const u0 = _undoStack.length; try { _wireUploadThumbnail('src:' + name); await wait(900); } finally { HTMLInputElement.prototype.click = realClick; }
    const steps = _undoStack.length - u0; const has = !!wireThumbnails['src:' + name]; doUndo(); await wait(400); const left = !!wireThumbnails['src:' + name];
    await restore(); await wsOpen(); return is([has, steps, left], [true, 1, false], 'uploaded / undo steps / picture left after one undo');
  });
  await check('Wire Simple: moving a cable by its handle is one undo step, and Reset Layout puts the cable back', async () => {
    await wsOpen(); _wireSetZoom(1); await wait(200); const p = $('#wire-diagram .wire-edge[data-edge-key^="simple:hout:0"]'); const key = p.getAttribute('data-edge-key');
    _wireState.selectedNodes.clear(); _wireState.selectedEdgeKey = key; _wireRender(); await wait(250); const h = $('#wire-diagram .wire-mid-handle'); if (!h) return 'no handle on the selected cable';
    const r = h.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; const u0 = _undoStack.length;
    h.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: x + 20, clientY: y + 24, bubbles: true })); window.dispatchEvent(new MouseEvent('mousemove', { clientX: x + 30, clientY: y + 36, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: x + 30, clientY: y + 36, bubbles: true })); await wait(300);
    const moved = Math.round(_wireGetEdgeOffset(key)), steps = _undoStack.length - u0; _wireResetLayout(); await wait(300); const afterReset = Math.round(_wireGetEdgeOffset(key));
    doUndo(); await wait(300); const undone = Math.round(_wireGetEdgeOffset(key)); await restore(); await wsOpen();
    return is([moved !== 0, steps, afterReset, undone === moved], [true, 1, 0, true], 'moved / undo steps / offset after Reset Layout / undo of the reset brings it back');
  });
  await check('Wire Simple: typing the switcher name is one undo step', async () => {
    await wsOpen(); const inp = $('#wire-diagram .wire-hub-name'); const u0 = _undoStack.length; inp.value = 'E2 MAIN'; inp.dispatchEvent(new Event('change', { bubbles: true })); await wait(300);
    const steps = _undoStack.length - u0, named = _wireHubName(); doUndo(); await wait(350); const back = _wireHubName(); await restore(); await wsOpen();
    return is([named, steps, back], ['E2 MAIN', 1, ''], 'name / undo steps / name after undo');
  });
  await check('Wire Simple: a source that was dragged keeps its place (and its cable route) when it is renamed', async () => {
    await wsOpen(); const old = srcNames()[0]; pushUndo(); wireLayout['src:' + old] = { x: -120, y: -60 }; _wireSetEdgeOffset('simple:src:' + old + '→hin:0', 22); _wireRender(); await wait(250);
    const pen = $$('#wire-sources-panel .wire-src-pen').find(b => b.closest('.wire-source-name').textContent.trim() === old); pen.click(); await wait(200);
    const inp = $('#wire-sources-panel .wire-src-rename'); inp.value = 'MOVED AND RENAMED'; inp.dispatchEvent(new Event('blur')); await wait(600);
    const g = $$('#wire-diagram .wire-node').find(n => n.getAttribute('data-node-id') === 'src:MOVED AND RENAMED'); const rc = g ? g.querySelector('rect') : null;
    const out = is([rc ? [+rc.getAttribute('x'), +rc.getAttribute('y')] : null, _wireGetEdgeOffset('simple:src:MOVED AND RENAMED→hin:0'), Object.keys(wireLayout).includes('src:' + old)], [[-120, -60], 22, false], 'node place / cable offset / old key left behind');
    await restore(); await wsOpen(); return out;
  });
  await check('Wire Details: a BG counts as use, for the source and for the destination', async () => {
    await wsOpen(); const sid = screens[0].id; const p = presets[presets.length - 1]; pushUndo(); const nm = 'BG ONLY SRC'; p.bgNames = p.bgNames || {}; p.bgNames[sid] = nm; _wireRender(); await wait(200);
    _wireState.selectedNodes.clear(); _wireSelectNode('src:' + nm, false); await wait(250); const srcTxt = $('#wire-details').textContent.replace(/\s+/g, ' ');
    _wireSelectNode('dst:' + sid, false); await wait(250); const dstTxt = $('#wire-details').textContent.replace(/\s+/g, ' ');
    await restore(); await wsOpen(); return is([/Active in 1 preset/.test(srcTxt), dstTxt.includes(nm)], [true, true], 'source Details counts the BG / destination Details lists the BG');
  });
  await check('Wire Simple: Fit brings a node that was dragged far away back on screen', async () => {
    await wsOpen(); const nm = srcNames()[0]; pushUndo(); wireLayout['src:' + nm] = { x: -900, y: -1100 }; _wireRender(); await wait(200); _wireZoomFit(); await wait(450);
    const g = $$('#wire-diagram .wire-node').find(n => n.getAttribute('data-node-id') === 'src:' + nm); const r = g.getBoundingClientRect(); const sc = $('#wire-diagram-scroll').getBoundingClientRect();
    const L = $('#wire-panel-left').getBoundingClientRect().right, R = $('#wire-panel-right').getBoundingClientRect().left;
    const ok = r.left >= L - 1 && r.right <= R + 1 && r.top >= sc.top - 1 && r.bottom <= sc.bottom + 1; await restore(); await wsOpen(); _wireZoomFit(); await wait(200); _wireSetZoom(1);
    return ok ? true : 'the moved node sits at ' + Math.round(r.left) + ',' + Math.round(r.top) + ' outside the drawing area after Fit';
  });
  await check('Wire export: the printed Simple switcher reads ID over its columns, like the screen (no SLOT)', async () => {
    await wsOpen(); const svg = _wireExportSheetsSvg('light'); return is([(svg.match(/>SLOT</g) || []).length, (svg.match(/>ID</g) || []).length], [0, 2], 'SLOT cells / ID cells on the sheet');
  });
  await check('Wire Asset Pack: a destination tile and an AUX tile use the colour of their card', async () => {
    await wsOpen(); const realClick = HTMLAnchorElement.prototype.click; let zip = null; HTMLAnchorElement.prototype.click = function () { if (this.download && /thumbnails\.zip$/.test(this.download)) { zip = fetch(this.href).then(r => r.blob()); return; } return realClick.call(this); };
    try { await _wireDownloadAllThumbnails(); } finally { HTMLAnchorElement.prototype.click = realClick; } if (!zip) return 'no ZIP was produced';
    const buf = new Uint8Array(await (await zip).arrayBuffer()), dv = new DataView(buf.buffer); let o = 0; const px = {};
    while (o + 30 < buf.length && dv.getUint32(o, true) === 0x04034b50) { const sz = dv.getUint32(o + 18, true), nl = dv.getUint16(o + 26, true), el = dv.getUint16(o + 28, true); const name = new TextDecoder().decode(buf.slice(o + 30, o + 30 + nl)); const kind = /^destinations\//.test(name) ? 'dest' : (/^aux-dsm\//.test(name) ? 'aux' : '');
      if (kind && !px[kind]) { const bm = await createImageBitmap(new Blob([buf.slice(o + 30 + nl + el, o + 30 + nl + el + sz)], { type: 'image/png' })); const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height; const x = cv.getContext('2d'); x.drawImage(bm, 0, 0); const d = x.getImageData(5, 5, 1, 1).data; px[kind] = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join(''); }
      o += 30 + nl + el + sz; }
    return is([px.dest, px.aux], [_wireNodeColor('dest', screens[0].id).toLowerCase(), _wireNodeColor('dsm', dsms[0].id).toLowerCase()], 'first destination tile / first AUX tile');
  });
  await check('Help: the Wire section describes the switcher in the middle, not "lines showing what feeds what"', async () => {
    actions.help(); await wait(300); if (typeof helpTab === 'function') helpTab('ref'); await wait(200); const t = ($('#help-overlay') || document.body).textContent; closeHelp(); await wait(150);
    return is([/lines showing what feeds what/.test(t), /the switcher in the middle/.test(t)], [false, true], 'old sentence / new sentence');
  });
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
  await check('Wire Advanced: a tile that grows pushes the tile stacked under it down by the same amount', async () => {
    const gap = () => rt.y - _wireAdvTileBottom('router:' + hub.id); const g0 = gap(), y0 = rt.y, n = hub.inC; _wireAdvRouterAddPort(hub.id, 'in'); await wait(300); const g1 = gap(), moved = rt.y - y0;
    _wireAdvRouterRemovePort(hub.id, 'in', hub.inC - 1); await wait(300); return is([g0 >= 0, g1, moved, hub.inC], [true, g0, 44, n], 'gap kept / moved / rows');
  });
  await check('Wire Advanced: a new router or switcher never lands on another tile', async () => {
    const hits = () => { const R = []; const add = (id, k, e) => { const r = _wireAdvNodeRect(id); if (r) R.push({ k, x: r.x, y: r.y, w: r.w, h: r.h + (e || 0) }); };
      wireAdvanced.sources.forEach(o => add('asrc:' + o.id, 'source')); wireAdvanced.dests.forEach(o => add('adst:' + o.id, 'destination')); wireAdvanced.dsms.forEach(o => add('adsm:' + o.id, 'aux'));
      wireAdvanced.routers.forEach(o => add('router:' + o.id, o.kind || 'router', 36)); (wireAdvanced.devices || []).forEach(o => add('device:' + o.id, 'device'));
      const h = []; for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i], b = R[j]; if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) h.push(a.k + ' on ' + b.k); } return h; };
    const n = wireAdvanced.routers.length; _wireAdvAddSwitcher('PLACEMENT TEST', 4, 2); await wait(400); _wireAdvAddRouterAsym(6, 2); await wait(400); const h1 = hits(), added = wireAdvanced.routers.length - n;
    wireAdvanced.routers.splice(n, added); _wireRender(); await wait(300);
    return is([added, h1], [2, []], 'tiles added / overlaps');
  });
  await check('Wire Advanced: a page can be copied and the copy closed', async () => {
    const n = wireAdvanced._pages.length, cur = wireAdvanced._activePageId; _wireCopyPage(cur); await wait(500); okDialogs(); const copied = wireAdvanced._pages.some(p => / copy$/i.test(p.name)); const cp = wireAdvanced._pages.find(p => / copy$/i.test(p.name));
    if (cp) { _wireClosePage(cp.id); await wait(400); okDialogs(); await wait(300); } if (wireAdvanced._activePageId !== cur) { _wireSwitchPage(cur); await wait(300); }
    return is([copied, wireAdvanced._pages.some(p => / copy$/i.test(p.name))], [true, false], 'page copy');
  });
// round3 / wire-io — regression checks for tests/flows_probe.js. Each block FAILS on build 16kk unpatched and PASSES with patch.py applied.
//
// ═══ BLOCK 1, 2, 3, 4: insert right AFTER the check
//     'Wire Advanced: a page can be copied and the copy closed'
//     (so BEFORE 'Wire: closes cleanly'; Wire is open in Advanced, `hub` is the seeded switcher; the section's own restore() follows).

  await check('Wire export: the stacked SVG follows the chosen sheet size, no overlap (Letter, Tabloid, ANSI E; one and three pages)', async () => {
    const keep = wireSettings.sheet || 'letter', real = window._wireExportSheetList, bad = [];
    try {
      for (const k of ['letter', 'tabloid', 'ansie']) for (const n of [1, 3]) {
        _setWireExportSheet(k); const one = real('light')[0]; window._wireExportSheetList = () => Array(n).fill(one);
        const root = new DOMParser().parseFromString(_wireExportSheetsSvg('light'), 'image/svg+xml').documentElement; window._wireExportSheetList = real;
        const sp = _WIRE_SHEETS[k], w = Math.round(1600 * sp.w / 11), h = Math.round(1131 * sp.h / 8.5), num = (e, a) => parseFloat(e.getAttribute(a));
        const kids = [...root.children].filter(e => e.tagName.toLowerCase() === 'svg').map(e => [num(e, 'x'), num(e, 'y'), num(e, 'width'), num(e, 'height')]);
        const want = Array.from({ length: n }, (_, i) => [0, i * (h + 28), w, h]);
        const r = is([num(root, 'width'), num(root, 'height'), kids], [w, n * h + (n - 1) * 28, want], k + ' x' + n); if (r !== true) bad.push(r);
      }
    } finally { window._wireExportSheetList = real; _setWireExportSheet(keep); }
    return bad.length ? bad.join(' | ') : true;
  });
  await check('Wire export: the PNG is rendered at the chosen sheet size (Tabloid one page = 4946 x 2928) and a huge stack stays under the pixel cap', async () => {
    const keep = wireSettings.sheet || 'letter', realList = window._wireExportSheetList, realClick = HTMLAnchorElement.prototype.click; let got = null;
    try {
      _setWireExportSheet('tabloid'); const one = realList('light')[0]; window._wireExportSheetList = () => [one];
      const p = new Promise(res => { HTMLAnchorElement.prototype.click = function () { if (/\.png$/i.test(this.download || '')) res(this.href); else realClick.call(this); }; setTimeout(() => res(null), 8000); });
      _wireExportPng('light'); const href = await p; if (!href) return 'no PNG came out'; const bmp = await createImageBitmap(await (await fetch(href)).blob()); got = [bmp.width, bmp.height]; bmp.close();
    } finally { HTMLAnchorElement.prototype.click = realClick; window._wireExportSheetList = realList; _setWireExportSheet(keep); okDialogs(); }
    const cap = (typeof _wirePngScale === 'function') ? (() => { const s = _wirePngScale(6400, 6 * 4524 + 5 * 28); return 6400 * s <= 16384 && (6 * 4524 + 140) * s <= 16384 && s < 2; })() : 'no cap';
    return is([got, cap], [[4946, 2928], true], 'png size / cap');
  });
  await check('Wire Advanced: an ID typed on an empty row stays when a cable is plugged, swapped and pulled; an untouched ID still follows the cable; clearing it goes back to auto', async () => {
    const cellEl = (side, i) => $$('#wire-diagram input.r-slot').find(e => (e.getAttribute('onchange') || '').includes("'" + hub.id + "', '" + side + "', " + i + ','));
    _wireAdvRouterAddPort(hub.id, 'in'); _wireAdvRouterAddPort(hub.id, 'in'); await wait(300); const a = hub.inC - 2, b = hub.inC - 1;
    const el = cellEl('in', a); if (!el) return 'no ID box on the new row'; el.value = 'Card 1 / SDI 2'; fire(el, 'change'); await wait(250); const typed = hub.inputs[a].pt;
    const repoint = () => { hub = wireAdvanced.routers.find(r => r.id === hub.id) || hub; if (rt) rt = wireAdvanced.routers.find(r => r.id === rt.id) || rt; };   // undo / redo swap the whole wireAdvanced object
    doUndo(); await wait(250); repoint(); const undone = hub.inputs[a].pt || ''; doRedo(); await wait(250); repoint(); _wireRender(); await wait(250); const A2 = hub.inputs[a], B2 = hub.inputs[b]; const redone = A2.pt;
    const s0 = wireAdvanced.sources[0], s1 = wireAdvanced.sources[1], keep = [s0.outC, s0.portLabels, s0.portNames]; s0.outC = 2; s0.portLabels = true; s0.portNames = ['PRIMARY', ''];
    const plug = (id, from, i) => { wireAdvanced.wires.push({ id, fromId: from, toId: 'rip:' + hub.id + ':' + i }); _wireRender(); }, pull = id => { const k = wireAdvanced.wires.findIndex(w => w.id === id); if (k >= 0) wireAdvanced.wires.splice(k, 1); _wireRender(); };
    plug('wkeepA', 'asrc:' + s1.id, a); plug('wkeepB', 'asp:' + s0.id + ':1', b); await wait(300); const plugged = [A2.pt, A2.name, B2.pt];
    pull('wkeepA'); plug('wkeepA2', 'asp:' + s0.id + ':1', a); await wait(300); const swapped = [A2.pt, A2.name];
    pull('wkeepA2'); pull('wkeepB'); await wait(300); const pulled = [A2.pt, B2.pt || ''];
    plug('wkeepA3', 'asp:' + s0.id + ':1', a); await wait(200); const e2 = cellEl('in', a); e2.value = ''; fire(e2, 'change'); await wait(250); const cleared = hub.inputs[a].pt;
    pull('wkeepA3'); _wireAdvRouterRemovePort(hub.id, 'in', hub.inC - 1); _wireAdvRouterRemovePort(hub.id, 'in', hub.inC - 1); s0.outC = keep[0]; s0.portLabels = keep[1]; s0.portNames = keep[2]; _wireRender(); await wait(300);
    return is([typed, undone, redone, plugged, swapped, pulled, cleared], ['Card 1 / SDI 2', '', 'Card 1 / SDI 2', ['Card 1 / SDI 2', s1.name, 'OUT 2'], ['Card 1 / SDI 2', s0.name], ['Card 1 / SDI 2', ''], 'OUT 2'], 'ID cell');
  });
  await check('Wire Advanced: Tab in an ID cell commits it and lands in the next ID cell of the same column, Shift+Tab goes back up', async () => {
    const cellEl = (side, i) => $$('#wire-diagram input.r-slot').find(e => (e.getAttribute('onchange') || '').includes("'" + hub.id + "', '" + side + "', " + i + ','));
    const where = () => { const m = /'(in|out)',\s*(\d+)/.exec((document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('onchange')) || ''); return m ? m[1] + m[2] : 'nowhere'; };
    const tab = shift => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', shiftKey: !!shift, bubbles: true, cancelable: true }));
    const type = t => { document.activeElement.select(); document.execCommand('insertText', false, t); };
    const keep = [hub.inputs[0].pt, hub.inputs[0].ptAuto, hub.inputs[1].pt, hub.inputs[1].ptAuto], u0 = _undoStack.length;
    const c0 = cellEl('in', 0); if (!c0) return 'no ID box'; c0.focus(); type('A1'); tab(false); await wait(250); const at1 = where(), pt0 = hub.inputs[0].pt;
    type('A2'); tab(true); await wait(250); const at2 = where(), pt1 = hub.inputs[1].pt; const steps = _undoStack.length - u0;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    hub.inputs[0].pt = keep[0]; hub.inputs[0].ptAuto = keep[1]; hub.inputs[1].pt = keep[2]; hub.inputs[1].ptAuto = keep[3]; _wireRender(); await wait(250);
    return is([at1, pt0, at2, pt1, steps], ['in1', 'A1', 'in0', 'A2', 2], 'Tab down the ID column');
  });

// wire-advanced click-through (2026-09-21) — regression checks for tests/flows_probe.js.
// Every block FAILS on build 16ko unpatched and PASSES with patch.py applied (proved with runflows.mjs, see the report).
//
// INSERT all blocks, in this order, right AFTER the check
//     'Wire Advanced: Tab in an ID cell commits it and lands in the next ID cell of the same column, Shift+Tab goes back up'
// and BEFORE 'Wire: closes cleanly'. Wire is open in Advanced on page 1 at that point, `hub` is the seeded switcher and the
// section's own restore() follows 'Wire: closes cleanly'. Each block works on a spare page and leaves page 1 active.
// Synthetic events on purpose (the probe runs inside the page); keys go to <body> the way an unfocused page receives them.

  const _waKey = (k, target) => (target || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const _waWireUp = () => getComputedStyle($('#wire-overlay')).display === 'flex';
  const _waSpare = async () => { const p = wireAdvanced._pages[wireAdvanced._pages.length - 1]; _wireSwitchPage(p.id); await wait(250); return p; };
  const _waHome = async () => { if (!_waWireUp()) { openWireMode(); await wait(300); } _wireState.selectedNodes = new Set(); _wireState.selectedEdgeKey = null; const cur = wireAdvanced._activePageId; if (cur !== wireAdvanced._pages[0].id) { ['sources', 'dests', 'dsms', 'routers', 'devices', 'wires', 'customSources', 'customDests', 'customDsms'].forEach(k => { wireAdvanced[k] = []; }); _wireSwitchPage(wireAdvanced._pages[0].id); await wait(250); } while (wireAdvanced._pages.length > 3 && !_wireAdvPageUsed(wireAdvanced._pages[wireAdvanced._pages.length - 1].id) && !_wireAdvPageUsed(wireAdvanced._pages[wireAdvanced._pages.length - 2].id)) { const gone = wireAdvanced._pages.pop(); delete wireAdvanced._pageData[gone.id]; } _wireRender(); hub = wireAdvanced.routers.find(r => r.id === hub.id) || hub; };

  await check('Wire Advanced: an edit lights the Save indicator (the show knows it is dirty without a trip through Video Presets)', async () => {
    await _waSpare(); _captureCleanBaseline(); _recomputeDirty(); const before = _isDirty;
    _wireAdvAddCustomDest(); await wait(700); const lit = _isDirty;
    await _waHome(); return is([before, lit], [false, true], 'dirty before / after adding a custom destination');
  });
  await check('Wire Advanced: renaming a page is one undo step, Escape in the name box cancels and leaves Wire open, no page error', async () => {
    const p = await _waSpare(); const old = p.name, u0 = _undoStack.length; let errs = 0; const onErr = () => { errs++; }; window.addEventListener('error', onErr);
    _wireBeginRenamePage(p.id); await wait(80); let box = $('#wire-page-rename-input'); if (!box) { window.removeEventListener('error', onErr); return 'no rename box'; }
    box.value = 'TRUCK'; box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(250); const named = p.name, steps = _undoStack.length - u0;
    _wireBeginRenamePage(p.id); await wait(80); box = $('#wire-page-rename-input'); box.value = 'XXXX'; box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await wait(250);
    const afterEsc = p.name, up = _waWireUp(); window.removeEventListener('error', onErr);
    const pg = wireAdvanced._pages.find(x => x.id === p.id); if (pg) pg.name = old; await _waHome();
    return is([named, steps, afterEsc, up, errs], ['TRUCK', 1, 'TRUCK', true, 0], 'name after Enter / undo steps / name after Escape / Wire still open / page errors');
  });
  await check('Wire Advanced: the copy and close icons stay inside the tab when the page name is long', async () => {
    const p0 = wireAdvanced._pages[0], keep = p0.name; p0.name = 'GENERAL SESSION MAIN ROOM COPY'; _wireRender(); await wait(200);
    const tab = $$('#wire-page-tabs button').find(b => b.querySelector('span[title="Close this page"]')); if (!tab) { p0.name = keep; _wireRender(); return 'no active tab'; }
    const tr = tab.getBoundingClientRect(); const out = $$('span[onclick]', tab).map(s => s.getBoundingClientRect()).filter(r => r.right > tr.right + 0.5 || r.width === 0).length;
    const x = tab.querySelector('span[title="Close this page"]').getBoundingClientRect(); const top = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2); const hit = !!top && !!top.closest('span[title="Close this page"]');
    p0.name = keep; _wireRender(); await wait(150); return is([out, hit], [0, true], 'icons outside the tab / the close icon is the top element at its own centre');
  });
  await check('Wire Advanced: Escape closes what is on top first (cable menu, export window, an armed matrix key); only a bare Escape closes Wire', async () => {
    await _waSpare(); _wireAdvAddDevice('converter', 1, 1); await wait(300); const btn = $('#wire-diagram .wire-device-tile .dv-conn'); if (!btn) { await _waHome(); return 'no cable type button'; }
    btn.click(); await wait(200); const menuOpen = !!$('.sys-dd'); _waKey('Escape'); await wait(200); const a = [!$('.sys-dd'), _waWireUp()]; if (!_waWireUp()) { _sysCloseMenu(); openWireMode(); await wait(300); }
    openWireExportModal(); await wait(250); _waKey('Escape'); await wait(200); const b = [getComputedStyle($('#wire-export-modal')).display === 'none', _waWireUp()]; if (!_waWireUp()) { closeWireExportModal(); openWireMode(); await wait(300); }
    _wireAdvAddRouterAsym(2, 2); await wait(400); const k = $('#wire-diagram .rt-out'); if (k) k.click(); await wait(150); _waKey('Escape'); await wait(200); const c2 = [!_wireRtArmed, _waWireUp()]; _wireRtArmed = null; if (!_waWireUp()) { openWireMode(); await wait(300); }
    await _waHome(); return is([menuOpen, a, b, c2], [true, [true, true], [true, true], [true, true]], 'menu opened / [menu closed, Wire open] / [export closed, Wire open] / [key disarmed, Wire open]');
  });
  await check('Wire Advanced: with Wire open, Delete removes the selected tile and never the layer selected in Video Presets behind it', async () => {
    const f = firstLayer(); const was = getL(f.pid, f.sid, 1); await _waSpare();
    wireAdvanced.dests.push({ id: 'waKeyD', refId: screens[0].id, x: 600, y: 100 }); _wireState.selectedNodes = new Set(['adst:waKeyD']); _wireRender(); await wait(200);
    selLayer = { pid: f.pid, sid: f.sid, n: 1 }; const u0 = _undoStack.length; _waKey('Delete'); await wait(300);
    const out = [wireAdvanced.dests.length, getL(f.pid, f.sid, 1), _undoStack.length - u0]; selLayer = null; if (getL(f.pid, f.sid, 1) !== was) { setL(f.pid, f.sid, 1, was); scheduleRender(); }
    await _waHome(); return is(out, [0, was, 1], 'tiles left / the layer behind / undo steps');
  });
  await check('Wire Advanced: the size window sits under the app dialog, so "Invalid size" can be answered', async () => {
    _wireAdvAddRouterCustom(); await wait(200); const l = $('#wire-ioc-left'); if (!l) return 'no size window'; l.value = '99'; $('#wire-ioc-go').click(); await wait(250);
    const ok = $('#dlg-confirm'), r = ok.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const onTop = dlgOpen() && !!top && (top === ok || ok.contains(top));
    okDialogs(); await wait(150); const o = $('#wire-iocount-overlay'); if (o) $('#wire-ioc-cancel').click(); await wait(150);
    return is(onTop, true, 'the OK button of the alert is the top element');
  });
  await check('Wire Advanced: deleting a destination tile takes its BACKUP cable too, the switcher row is free again', async () => {
    await _waSpare(); _wireAdvAddSwitcher('WA TEST', 2, 2); await wait(400); const r = wireAdvanced.routers[wireAdvanced.routers.length - 1];
    wireAdvanced.dests.push({ id: 'waBk', refId: screens[0].id, x: 1500, y: 0, inC: 2 }); wireAdvanced.wires.push({ id: 'waW1', fromId: 'rop:' + r.id + ':0', toId: 'adst:waBk' }, { id: 'waW2', fromId: 'rop:' + r.id + ':1', toId: 'adp:waBk:1' });
    _wireState.selectedNodes = new Set(['adst:waBk']); _wireRender(); await wait(200); _wireAdvDeleteSelected(); await wait(250); const left = wireAdvanced.wires.length;
    _wireAdvRouterRemovePort(r.id, 'out', 1); await wait(250); const refused = /Port in use/i.test(dialogText()); okDialogs(); await wait(100);
    await _waHome(); return is([left, refused], [0, false], 'cables left in the data / "Port in use" on the freed row');
  });
  await check('Wire Advanced: typing an output point name is one undo step', async () => {
    await _waSpare(); wireAdvanced.sources.push({ id: 'waPn', name: srcNames()[0], x: 100, y: 100, outC: 2, portLabels: true, portNames: ['', ''] }); _wireRender(); await wait(250);
    const box = $('.wire-srcport-name[data-src-id="waPn"][data-port="1"]'); if (!box) { await _waHome(); return 'no name box'; } const u0 = _undoStack.length;
    box.value = 'BACKUP'; fire(box, 'change'); await wait(250); const steps = _undoStack.length - u0; await _waHome(); return is(steps, 1, 'undo steps');
  });
  await check('Wire Advanced: a converter that grows pushes the tile under it down, an I/O Patch page tile never lands on another tile', async () => {
    await _waSpare(); wireAdvanced.devices.push({ id: 'waV1', kind: 'converter', name: '', x: 420, y: 260, ins: [{ conn: '', name: '' }, { conn: '', name: '' }], outs: [{ conn: '', name: '' }] }, { id: 'waV2', kind: 'switch', name: '', x: 420, y: 460, ins: [{ conn: 'Ethernet', name: '' }], outs: [] }); _wireRender(); await wait(200);
    for (let i = 0; i < 4; i++) _wireAdvDeviceAddPort('waV1', 'in'); await wait(250); const a = _wireAdvNodeRect('device:waV1'), b = _wireAdvNodeRect('device:waV2'); const overlap = a.y + a.h > b.y;
    await _waHome(); const keep = JSON.stringify(ioAdvanced.pages[1]); const pg = ioAdvanced.pages[1]; pg.sources = [{ name: 'WA SRV 1' }, { name: 'WA SRV 2' }]; pg.dests = [{ name: 'WA LED' }];
    const n = wireAdvanced.routers.length; _wireAdvAddPatchTile(1); await wait(400); const L = _wireAdvTileList(), me = L.find(t => t.id === 'router:' + wireAdvanced.routers[wireAdvanced.routers.length - 1].id);
    const hits = (wireAdvanced.routers.length === n + 1) ? L.filter(t => t !== me && me.x < t.x + t.w && me.x + me.w > t.x && me.y < t.y + t.h && me.y + me.h > t.y).length : -1;
    wireAdvanced.routers.splice(n); ioAdvanced.pages[1] = JSON.parse(keep); _wireRender(); await wait(250); hub = wireAdvanced.routers.find(r => r.id === hub.id) || hub;
    return is([overlap, hits], [false, 0], 'converter overlaps the switch below / tiles under the new patch tile');
  });
  await check('Wire Advanced: a custom destination reads by name in Details and in the switcher cell; removing a custom source card takes its tiles', async () => {
    await _waSpare(); _wireAdvAddCustomDest(); const cd = wireAdvanced.customDests[wireAdvanced.customDests.length - 1]; cd.name = 'WA RECORD'; _wireAdvAddSwitcher('WA TEST', 2, 2); await wait(400); const r = wireAdvanced.routers[wireAdvanced.routers.length - 1];
    wireAdvanced.dests.push({ id: 'waCd', refId: cd.id, x: 1500, y: 300 }); wireAdvanced.wires.push({ id: 'waW9', fromId: 'rop:' + r.id + ':0', toId: 'adst:waCd' }); _wireState.selectedNodes = new Set(['adst:waCd']); _wireRender(); await wait(250);
    const det = /WA RECORD/.test($('#wire-details').textContent), cell = r.outputs[0].name;
    _wireAdvAddCustomSource(); const cs = wireAdvanced.customSources[wireAdvanced.customSources.length - 1]; wireAdvanced.sources.push({ id: 'waCs', name: cs.name, x: 0, y: 900 }); wireAdvanced.wires.push({ id: 'waW8', fromId: 'asrc:waCs', toId: 'rip:' + r.id + ':1' }); _wireRender(); await wait(200);
    _wireAdvDeleteCustom('src', cs.id); await wait(250); const tileLeft = wireAdvanced.sources.some(s => s.id === 'waCs'), cableLeft = wireAdvanced.wires.some(w => w.id === 'waW8');
    await _waHome(); return is([det, cell, tileLeft, cableLeft], [true, 'WA RECORD', false, false], 'Details names it / switcher cell / tile left / cable left');
  });
  await check('Wire Advanced: Reset Layout tidies the Advanced page and leaves the Simple layout alone; the default router subtitle follows its size', async () => {
    await _waSpare(); wireLayout['src:' + srcNames()[0]] = { x: 555, y: 444 }; wireAdvanced.sources.push({ id: 'waR1', name: srcNames()[0], x: 100, y: 100 }, { id: 'waR2', name: srcNames()[1], x: -400, y: 900 }); _wireRender(); await wait(200);
    _wireResetLayout(); await wait(400); const kept = !!wireLayout['src:' + srcNames()[0]], lined = wireAdvanced.sources.length === 2 && wireAdvanced.sources[0].x === wireAdvanced.sources[1].x; delete wireLayout['src:' + srcNames()[0]];
    _wireAdvAddRouterAsym(2, 2); await wait(400); const r = wireAdvanced.routers[wireAdvanced.routers.length - 1]; _wireAdvRouterAddPort(r.id, 'in'); await wait(250); const label = r.label;
    await _waHome(); return is([kept, lined, label], [true, true, 'UNTITLED 3X2 ENGINEERING RACK'], 'Simple layout kept / stray tile back in its column / subtitle');
  });
  await check('Wire Advanced: Tab out of a typed name cell lands in the next text box instead of nowhere', async () => {
    await _waSpare(); _wireAdvAddRouterAsym(2, 2); await wait(400); const cell = $('#wire-diagram .wire-matrix-grid .rc input:not(.r-slot)'); if (!cell) { await _waHome(); return 'no name cell'; }
    cell.focus(); cell.select(); document.execCommand('insertText', false, 'CAM 7'); cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true })); cell.blur(); await wait(300);
    const ae = document.activeElement; const on = !!ae && ae.tagName === 'INPUT' && !!ae.closest('#wire-diagram'); if (ae && ae.blur) ae.blur();
    const typed = wireAdvanced.routers[wireAdvanced.routers.length - 1].inputs[0].name; await _waHome(); return is([typed, on], ['CAM 7', true], 'name stored / focus is in a text box on the canvas');
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
  await check('I/O Patch Advanced: the banner says page 1 feeds Simple and Wire, other pages stand alone', async () => {
    const hint = () => ($('#io-adv .io-adv-bar .hint') || {}).textContent || ''; const p1 = hint(); _ioSetPage(1); await wait(400); const p2 = hint(); _ioSetPage(0); await wait(400);
    const foot = $$('#io-adv .sys-section-footer .hint').map(e => e.textContent);
    return is([/^Page 1 starts as a copy/.test(p1) && /A source you name here also appears in Simple and in Wire/.test(p1) && /destination or multiviewer you name here appears in Simple\./.test(p1), /^A standalone page/.test(p2), /standalone patch/i.test(p1 + p2), foot.filter(t => /in Wire/.test(t)).length], [true, true, false, 1], 'banner');
  });
  await check('I/O Patch Advanced: a browser draft keeps the Advanced pages (rows on page 2 survive an autosave)', async () => {
    const pg = ioAdvanced.pages[1]; if (!pg) return 'no page 2'; const before = JSON.stringify(pg.sources); const r = _ioAdvBlank('src'); r.name = 'DRAFT TEST SOURCE'; pg.sources.push(r);
    _writeAutoSaveNow(); let saved = null; try { saved = JSON.parse(localStorage.getItem('avlb_autosave') || 'null'); } catch (e) {}
    const kept = !!(saved && saved.ioAdvanced && saved.ioAdvanced.pages && saved.ioAdvanced.pages[1] && saved.ioAdvanced.pages[1].sources.some(x => x.name === 'DRAFT TEST SOURCE'));
    pg.sources = JSON.parse(before); _writeAutoSaveNow(); return kept ? true : 'the draft has no I/O Advanced pages in it';
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
  // ── I/O Patch click-through (2026-09-21): INSERT in tests/flows_probe.js straight AFTER the check
  //    'I/O Patch: closes cleanly' (the `await restore();` that follows it can stay where it is). Every check below opens
  //    the I/O Patch itself, restores the show and closes the page again. No media. Each one FAILS on build 16ko without
  //    the io-patch patch and PASSES with it.
  const ioEsc = el => (el || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  const ioOpenSimple = async () => { openSystem(); await wait(500); if (ioAdvanced.view !== 'simple') { _ioSetView('simple'); await wait(400); } okDialogs(); };
  const ioRow = name => $$('#sys-src-rows .sys-row').find(r => ($('.sys-name-input', r) || {}).value === name);
  const ioPick = async (pill, re) => { _sysOpenDropdown(pill); await wait(150); const it = $$('.sys-dd .sys-dd-item').find(i => re.test(i.textContent.trim())); if (!it) { _sysCloseMenu(); return false; } it.click(); await wait(300); return true; };
  await check('I/O Patch: a connector pick, a custom resolution, a note and a typed rename are each ONE undo step', async () => {
    await restore(); await ioOpenSimple(); const n = srcNames()[0]; const before = JSON.stringify(_sysGetSourceMeta(n)); const out = [];
    const u0 = _undoStack.length; if (!await ioPick($('[data-sys-field="connector"]', ioRow(n)), /^3G-SDI/)) return 'no 3G-SDI in the connector menu';
    out.push(_undoStack.length - u0); doUndo(); await wait(300); out.push(JSON.stringify(_sysGetSourceMeta(n)) === before);
    const u1 = _undoStack.length; await ioPick($('[data-sys-field="resolution"]', ioRow(n)), /^Custom resolution/); $('#sys-cf-w').value = '5000'; $('#sys-cf-h').value = '1200'; $('#sys-cf-save').click(); await wait(300);
    out.push(_undoStack.length - u1); doUndo(); await wait(300); out.push(JSON.stringify(_sysGetSourceMeta(n)) === before);
    const u2 = _undoStack.length; const nt = $('.sys-notes-input', ioRow(n)); nt.focus(); nt.value = 'UNDO NOTE'; fire(nt, 'change'); nt.blur(); await wait(200);
    out.push(_undoStack.length - u2); doUndo(); await wait(300); out.push(JSON.stringify(_sysGetSourceMeta(n)) === before);
    const u3 = _undoStack.length; const nm = $('.sys-name-input', ioRow(n)); nm.focus(); nm.value = 'UNDO RENAMED'; nm.blur(); await wait(400);
    out.push(_undoStack.length - u3); doUndo(); await wait(400); out.push(srcNames()[0] === n && !srcNames().includes('UNDO RENAMED'));
    closeSystem(); await restore(); return is(out, [1, true, 1, true, 1, true, 1, true], 'undo steps / state back, for connector, custom resolution, note, rename');
  });
  await check('I/O Patch: deleting a source from its row is one undo step and Undo puts it back in every preset', async () => {
    await restore(); await ioOpenSimple(); const f = firstLayer(); const n = getL(f.pid, f.sid, 1); const refs = () => JSON.stringify(presets.map(p => p.layers)).split(JSON.stringify(n)).length - 1; const r0 = refs(), u0 = _undoStack.length;
    $('[data-sys-action="delete"]', ioRow(n)).click(); await wait(250); const go = $('#sys-confirm-go'); if (!go) return 'no confirm window'; go.click(); await wait(400); const gone = refs();
    const steps = _undoStack.length - u0; doUndo(); await wait(400); const back = refs(); closeSystem(); await restore();
    return is([gone, steps, back], [0, 1, r0], 'layer references after delete / undo steps / after undo');
  });
  await check('I/O Patch: Add Source and Add MV are undo steps', async () => {
    await restore(); await ioOpenSimple(); const s0 = sources.length, m0 = multiviewers.length, u0 = _undoStack.length;
    _sysAddSource(); await wait(200); _sysAddMV(); await wait(200); const steps = _undoStack.length - u0; doUndo(); await wait(300); doUndo(); await wait(300);
    const out = is([steps, sources.length, multiviewers.length], [2, s0, m0], 'undo steps / sources / multiviewers after two undos'); closeSystem(); await restore(); return out;
  });
  await check('I/O Patch: Escape closes the menu, the window or the field on top, never the page underneath', async () => {
    await restore(); await ioOpenSimple(); const open = () => $('#sys-overlay').classList.contains('open'); const n = srcNames()[0]; const out = [];
    _sysOpenDropdown($('[data-sys-field="connector"]', ioRow(n))); await wait(150); ioEsc(); await wait(200); out.push(!$('.sys-dd'), open()); if (!open()) { _sysCloseMenu(); openSystem(); await wait(400); }
    await ioPick($('[data-sys-field="resolution"]', ioRow(n)), /^Custom resolution/); $('#sys-cf-w').focus(); ioEsc($('#sys-cf-w')); await wait(200); const stayed = !!$('#sys-cf-overlay') && open(); ioEsc(); await wait(200); out.push(stayed && !$('#sys-cf-overlay'), open()); if (!open()) { openSystem(); await wait(400); }   /* 16ks-esc: Escape in the Width box leaves the box, the next Escape closes the window */
    const nt = $('.sys-notes-input', ioRow(n)); const was = nt.value; nt.focus(); nt.value = was + ' typed then Escape'; ioEsc(nt); await wait(200); out.push(open(), (_sysGetSourceMeta(n).notes || '') !== was + ' typed then Escape'); if (!open()) { openSystem(); await wait(400); }
    _ioSetView('advanced'); await wait(700); okDialogs(); _ioRenamePage(1); await wait(200); const inp = $('#io-page-rename'); if (!inp) return 'the page name box did not open'; ioEsc(inp); await wait(250); out.push(open());
    ioEsc(); await wait(250); out.push(open());   // nothing on top: Escape closes the I/O Patch, as the Help says
    closeSystem(); await restore(); return is(out, [true, true, true, true, true, true, true, false], 'menu closed / page open, window closed / page open, page open / note not kept, page open after a page-rename Escape, page closed by a bare Escape');
  });
  await check('I/O Patch: a source cannot take a name that is already in the show', async () => {
    await restore(); await ioOpenSimple(); const a = srcNames()[0], b = srcNames()[2], n0 = srcNames().length; const nm = $('.sys-name-input', ioRow(a)); nm.focus(); nm.value = b; nm.blur(); await wait(400);
    const said = /already a source/i.test(dialogText()); okDialogs(); await wait(200); const dup = sources.filter(s => s && s.name === b).length;
    const out = is([said, srcNames().length, srcNames()[0], dup], [true, n0, a, 1], 'refused with a message / source count / first source / entries named ' + b); closeSystem(); await restore(); return out;
  });
  await check('I/O Patch: a source renamed or deleted in Simple does not come back as a ghost row after Advanced is opened', async () => {
    await restore(); await ioOpenSimple(); _ioSetView('advanced'); await wait(700); okDialogs(); _ioSetView('simple'); await wait(400); const a = srcNames()[0], b = srcNames()[3];
    const nm = $('.sys-name-input', ioRow(a)); nm.focus(); nm.value = 'GHOST TEST'; nm.blur(); await wait(400);
    $('[data-sys-action="delete"]', ioRow(b)).click(); await wait(250); $('#sys-confirm-go').click(); await wait(400);
    _ioSetView('advanced'); await wait(800); const cancel = $('#dlg-cancel'); if (dlgOpen() && cancel) cancel.click(); await wait(300); const names = srcNames(); const p1 = ioAdvanced.pages[0].sources.map(r => r.name);
    closeSystem(); await restore(); return is([names.includes(a), names.includes(b), p1.includes('GHOST TEST'), p1.includes(a), p1.includes(b)], [false, false, true, false, false], 'old name back in Simple / deleted source back in Simple / page 1 has the new name / page 1 still has the old name / page 1 still has the deleted source');
  });
  await check('I/O Patch: + Destination from the top bar opens ABOVE the I/O Patch page and adds the destination', async () => {
    await restore(); await ioOpenSimple(); const n0 = screens.length; actions.addDestination(); await wait(400); const m = $('#modal'); if (!vis(m)) { closeSystem(); return 'the Add Destination window did not open'; }
    const r = $('#ms-n').getBoundingClientRect(); const top = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)); const above = !!top && m.contains(top);   // the name box of the window must be the top element, not the I/O Patch page
    $('#ms-n').value = 'IO STACK TEST'; $('#ms-w').value = '1920'; $('#ms-h').value = '1080'; confirmScreen(); await wait(450); okDialogs(); const listed = $$('#sys-dst-rows .sys-name-input').some(i => i.value === 'IO STACK TEST');
    closeSystem(); const out = is([above, screens.length, listed], [true, n0 + 1, true], 'window on top / destinations / listed in the patch'); await restore(); return out;
  });
  await check('I/O Patch: the destination name menu offers destination names only', async () => {
    await restore(); await ioOpenSimple(); const chev = $('#sys-dst-rows .sys-name-chev'); _sysOpenDropdown(chev); await wait(150); const items = $$('.sys-dd .sys-dd-item').map(i => ($('.item-text', i) || i).textContent.trim()); _sysCloseMenu();
    const wrong = srcNames().filter(n => items.includes(n) && !screens.concat(dsms).some(d => d.name === n)); closeSystem(); return wrong.length ? 'source names offered as destination names: ' + wrong.join(', ') : true;
  });
  await check('I/O Patch: clicking in and out of a Notes box writes nothing (a BG source keeps its own note)', async () => {
    await restore(); await ioOpenSimple(); const n = srcNames().find(x => _sysFindBGAssignments(x).length && (_sysGetSourceMeta(x).notes || '')); if (!n) { closeSystem(); return 'the example has no BG source with a note'; }
    const own = _sysGetSourceMeta(n).notes; const d0 = _isDirty; _isDirty = false; const nt = $('.sys-notes-input', ioRow(n)); nt.focus(); nt.blur(); await wait(200); const out = is([_sysGetSourceMeta(n).notes, _isDirty], [own, false], 'source note / show marked changed'); _isDirty = d0; closeSystem(); await restore(); return out;
  });
  await check('I/O Patch: Set for all destinations also sets the I/O-only destination rows under it', async () => {
    await restore(); ioDests.push({ id: uid(), name: 'IO ONLY TEST', connectorType: '', deviceType: '', customType: '', w: 1920, h: 1080, notes: '' }); await ioOpenSimple();
    await ioPick($('#sys-dst-rows .sys-row-global [data-sys-field="connector"]'), /^HDMI 2\.1/); const got = [screens[0].connectorType, (ioDests[0] || {}).connectorType]; closeSystem(); await restore(); return is(got, ['HDMI 2.1', 'HDMI 2.1'], 'first destination / I/O-only destination');
  });
  await check('Look Book: a cover, one page per preset, the I/O reference, the wire sheet and the summary', async () => {
    const d = new DOMParser().parseFromString(await userLookBook(), 'text/html'); const t = d.body.textContent;
    return is([d.querySelectorAll('.pp-breakdown').length, !!d.querySelector('.cover'), !!d.querySelector('.summary-table'), /I\/O/i.test(t), !!d.querySelector('.wire-page')], [presets.length, true, true, true, true], 'Look Book sections');
  });
// ═══ BLOCK 5: insert right AFTER the check
//     'Look Book: a cover, one page per preset, the I/O reference, the wire sheet and the summary'

  await check('Look Book: a backup source prints Backup of <primary> in the I/O reference Type column, its primary and the others keep their plain type', async () => {
    openSystem(); await wait(400); _ioSetView('advanced'); await wait(500); const p0 = ioAdvanced.pages[0], rowB = p0.sources.find(r => r.name === 'PPT B'), prim = rowB && _ioBkPrimaryOf(p0.sources, rowB);
    _ioSetView('simple'); await wait(300); closeSystem(); await wait(300);
    const d = new DOMParser().parseFromString(await userLookBook(), 'text/html'); const typeOf = nm => { const c = [...d.querySelectorAll('td.io-name-cell')].find(x => x.textContent.trim() === nm); return c ? c.nextElementSibling.textContent.trim() : 'row missing'; };
    const got = [prim ? prim.name : 'not paired', typeOf('PPT B'), typeOf('PPT A'), typeOf('CAM 1')]; await restore();
    return is(got, ['PPT A', 'PC · Backup of PPT A', 'PC', 'Camera'], 'Type column');
  });
  await check('Look Book window: no Wire style choice, the Simple / Advanced view choice stays, the wire sheet is orthogonal', async () => {
    openPdfExportModal(); await wait(300); const seen = [$$('input[name="pdf-opt-wire-style"]').length, $$('input[name="pdf-opt-wire-view"]').length, /wire style/i.test($('#pdf-export-modal').textContent)]; closePdfExportModal(); await wait(150);
    await userLookBook(); return is([seen, window._pdfOpts.wireStyle], [[0, 2, false], 'orthogonal'], 'export window');
  });
  await check('Look Book and Excel: every destination starts with a BG line', async () => {
    const html = await userLookBook(); const bgRows = (html.match(/<span class="bd-l">BG<\/span>/g) || []).length; const orig = _buildXlsx; let rows = null; window._buildXlsx = function (r) { rows = r; return orig.apply(this, arguments); }; try { _doExportExcel(true); } finally { window._buildXlsx = orig; }
    const cells = []; (rows || []).forEach(r => r.forEach(c => { if (typeof c === 'string' && /^BG: /.test(c)) cells.push(c); })); return is([bgRows, cells.length], [presets.length * screens.length, presets.length * screens.length], 'BG lines');
  });
  await check('Excel cue sheet: one row per preset under the headers', () => { const orig = _buildXlsx; let rows = null; window._buildXlsx = function (r) { rows = r; return orig.apply(this, arguments); }; try { _doExportExcel(true); } finally { window._buildXlsx = orig; } const body = (rows || []).filter(r => presets.some(p => p.code === r[0])); return is(body.length, presets.length, 'preset rows'); });
  // ── Excel cover. INSERT all of this right after the check 'Excel cue sheet: one row per preset under the headers'. ──
  // The home-made zip is STORE-only (no compression), so the workbook reads back with plain byte slicing. Returns {sheets:[names], part(name)->xml text, doc(name)->XML document}.
  const xlRead = async blob => {
    const u = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(u.buffer), td = new TextDecoder(), parts = {}; let o = 0;
    while (o + 30 <= u.length && dv.getUint32(o, true) === 0x04034b50) {
      const method = dv.getUint16(o + 8, true), size = dv.getUint32(o + 18, true), nl = dv.getUint16(o + 26, true), el = dv.getUint16(o + 28, true);
      if (method !== 0) throw new Error('zip entry is compressed, the reader expects STORE');
      parts[td.decode(u.subarray(o + 30, o + 30 + nl))] = td.decode(u.subarray(o + 30 + nl + el, o + 30 + nl + el + size)); o += 30 + nl + el + size;
    }
    const doc = n => new DOMParser().parseFromString(parts[n] || '<x/>', 'application/xml');
    const sheets = [...doc('xl/workbook.xml').getElementsByTagName('sheet')].map(s => s.getAttribute('name'));
    const cell = (sheetNo, ref) => { const c = [...doc('xl/worksheets/sheet' + sheetNo + '.xml').getElementsByTagName('c')].find(x => x.getAttribute('r') === ref); return c ? { text: c.textContent, s: +(c.getAttribute('s') || 0) } : null; };
    const st = doc('xl/styles.xml'); const xfs = [...st.getElementsByTagName('cellXfs')[0].getElementsByTagName('xf')], fills = [...st.getElementsByTagName('fills')[0].getElementsByTagName('fill')], fonts = [...st.getElementsByTagName('fonts')[0].getElementsByTagName('font')];
    const fillOf = (sheetNo, ref) => { const c = cell(sheetNo, ref); if (!c) return 'none'; const f = fills[+xfs[c.s].getAttribute('fillId')].getElementsByTagName('fgColor')[0]; return f ? f.getAttribute('rgb') : 'none'; };
    const fontOf = (sheetNo, ref) => { const c = cell(sheetNo, ref); if (!c) return ''; const f = fonts[+xfs[c.s].getAttribute('fontId')]; const g = t => f.getElementsByTagName(t)[0]; return g('name').getAttribute('val') + ' ' + g('sz').getAttribute('val') + (g('b') ? ' bold' : ''); };
    const alignOf = (sheetNo, ref) => { const c = cell(sheetNo, ref); const a = c && xfs[c.s].getElementsByTagName('alignment')[0]; return a ? [a.getAttribute('horizontal'), a.getAttribute('vertical'), a.getAttribute('wrapText')] : []; };
    return { parts, sheets, cell, fillOf, fontOf, alignOf, merges: n => [...doc('xl/worksheets/sheet' + n + '.xml').getElementsByTagName('mergeCell')].map(m => m.getAttribute('ref')) };
  };
  const XL_COVER_MERGES = ['C5:F7', 'D8:E8', 'C9:F10', 'D11:E11', 'C12:F13', 'D15:E15', 'D21:E21', 'D22:E22'];
  const xlText = (wb, refs) => refs.map(r => { const c = wb.cell(1, r); return c ? c.text : null; });
  await check('Excel cue sheet: the first tab is the Cover (show info in the owner\'s cells, merged, black and white frame), the cue sheet is the second tab', async () => {
    document.getElementById('show-venue').value = 'Grand Ballroom'; showMeta.designer = 'Omar'; showMeta.projectVer = 'V3';
    setShowMeta('dates', 'April 8-10, 2026'); setShowMeta('address', '701 Convention Plaza, St. Louis, MO 63101'); setShowMeta('format', '3840x2160 - 59.94p');
    const show = document.getElementById('show-name').value; const wb = await xlRead(_doExportExcel(true)); const x = wb.parts['xl/worksheets/sheet1.xml'] || '';
    const order = ['<sheetPr>', '<sheetFormatPr', '<cols>', '<sheetData>', '<mergeCells', '<printOptions', '<pageMargins', '<pageSetup'].map(t => x.indexOf(t));
    const body = [...new DOMParser().parseFromString(wb.parts['xl/worksheets/sheet2.xml'] || '<x/>', 'application/xml').getElementsByTagName('c')].filter(c => /^A\d+$/.test(c.getAttribute('r')) && presets.some(p => p.code === c.textContent)).length;
    const out = is({ tabs: wb.sheets, text: xlText(wb, ['C5', 'D8', 'C9', 'D11', 'C12', 'D15', 'D21', 'D22']), merges: wb.merges(1), fills: ['A2', 'H3', 'A4', 'H16', 'A17', 'H18', 'B4', 'G16', 'C4', 'A1', 'A19'].map(r => wb.fillOf(1, r)),
      fonts: [wb.fontOf(1, 'C5'), wb.fontOf(1, 'D8'), wb.fontOf(1, 'C9'), wb.fontOf(1, 'D11'), wb.fontOf(1, 'C12'), wb.fontOf(1, 'D15'), wb.fontOf(1, 'D21'), wb.fontOf(1, 'D22')], align: wb.alignOf(1, 'C5'),
      xmlOrder: order.every(p => p >= 0) && order.every((p, i) => !i || p > order[i - 1]), print: [/<pageSetup orientation="portrait" fitToWidth="1"/.test(x), /horizontalCentered="1"/.test(x), /left="0.7" right="0.7" top="0.75" bottom="0.75"/.test(x)], presetRowsOnTab2: body },
    { tabs: ['Cover', show.slice(0, 31)], text: [show.toUpperCase(), 'CUE SHEET', 'GRAND BALLROOM', 'APRIL 8-10, 2026', '701 CONVENTION PLAZA, ST. LOUIS, MO 63101', 'FORMAT: 3840X2160 - 59.94P', 'OMAR', 'VERSION 3'], merges: XL_COVER_MERGES,
      fills: ['FF000000', 'FF000000', 'FF000000', 'FF000000', 'FF000000', 'FF000000', 'FFFFFFFF', 'FFFFFFFF', 'none', 'none', 'none'],
      fonts: ['Arial 30 bold', 'Arial 12 bold', 'Arial 18 bold', 'Arial 10', 'Arial 9', 'Arial 11 bold', 'Arial 10 bold', 'Arial 10'], align: ['center', 'center', null],
      xmlOrder: true, print: [true, true, true], presetRowsOnTab2: presets.length }, 'cover workbook');
    await restore(); return out;
  });
  await check('Excel cover: blank show info falls back (the single show date written out, N/A venue / address / format / designer lines empty, VERSION 1) and the merges stay', async () => {
    document.getElementById('show-venue').value = 'N/A'; document.getElementById('show-date').value = '2026-04-08'; showMeta = _showMetaFrom(null);
    const wb = await xlRead(_doExportExcel(true));
    const out = is({ tab: wb.sheets[0], text: xlText(wb, ['D8', 'C9', 'D11', 'C12', 'D15', 'D21', 'D22']), merges: wb.merges(1) }, { tab: 'Cover', text: ['CUE SHEET', '', 'APRIL 8, 2026', '', '', '', 'VERSION 1'], merges: XL_COVER_MERGES }, 'blank cover');
    await restore(); return out;
  });
  await check('I/O Patch Excel: opens on the Cover titled I/O PATCH, Video I-O is the second tab', async () => {
    const real = window.dl; let got = null; window.dl = function (b) { got = b; }; try { _sysExportIOExcel(); await wait(400); } finally { window.dl = real; } okDialogs();
    if (!got) return 'the I/O export produced no file'; const wb = await xlRead(got);
    return is({ tabs: wb.sheets.slice(0, 2), title: xlText(wb, ['D8'])[0], show: xlText(wb, ['C5'])[0], a2: wb.fillOf(1, 'A2'), b4: wb.fillOf(1, 'B4'), merges: wb.merges(1).length, tab2merges: wb.merges(2).length },
      { tabs: ['Cover', 'Video I-O'], title: 'I/O PATCH', show: document.getElementById('show-name').value.toUpperCase(), a2: 'FF000000', b4: 'FFFFFFFF', merges: 8, tab2merges: 0 }, 'I/O workbook');
  });
  await check('show info: Show dates / Venue address / Show format edit in Wire Project Info and Quick Setup in step, save with the show, load blank from an old show, and stay off the Wire sheet and the Look Book', async () => {
    openWireMode(); await wait(600); const d0 = _dirtyStateString(); const set = (id, v) => { const el = $(id); if (!el) return false; el.value = v; fire(el, 'change'); return true; };
    if (!set('#wtb-dates', 'April 8-10, 2026') || !set('#wtb-address', 'ZZTOP 701 Convention Plaza ' + 'X'.repeat(140)) || !set('#wtb-format', 'ZZFMT 3840x2160')) { closeWireMode(); return 'Wire Project Info has no Dates / Address / Format fields'; }
    setShowMeta('client', 'ZZCLIENT'); const afterWire = [showMeta.dates, showMeta.address.length, showMeta.format]; const dirty = _dirtyStateString() !== d0;   /* typing a cover field marks the show unsaved, like the other Project Info fields */
    const wireSheet = String(_wireSheetSvg('<g/>', { theme: 'light', pageLabel: 'Page 1', title: 'x' }) || ''); closeWireMode(); await wait(300);
    openQSEdit(); await wait(400); const inQS = [$('#qs-dates') && $('#qs-dates').value, $('#qs-format') && $('#qs-format').value]; if ($('#qs-format')) $('#qs-format').value = 'ZZFMT 1080p59.94'; confirmQS(); await wait(700); okDialogs(); await wait(200);
    openWireMode(); await wait(500); const backInWire = $('#wtb-format').value; closeWireMode(); await wait(300);
    const saved = getProjectState(); const lb = await userLookBook(); const old = JSON.parse(JSON.stringify(saved)); ['dates', 'address', 'format'].forEach(k => delete old.showMeta[k]);
    showMeta = _showMetaFrom(null); _applyProjectText(JSON.stringify(saved)); await wait(700); okDialogs(); const reloaded = [showMeta.dates, showMeta.format];
    _applyProjectText(JSON.stringify(old)); await wait(700); okDialogs(); const fromOld = [showMeta.dates, showMeta.address, showMeta.format];
    const out = is({ afterWire, dirty, inQS, backInWire, reloaded, fromOld, wireSheetPrintsClient: /ZZCLIENT/.test(wireSheet), onWireSheet: /ZZTOP|ZZFMT|April 8-10/.test(wireSheet), onLookBook: /ZZTOP|ZZFMT|April 8-10/.test(lb) },
      { afterWire: ['April 8-10, 2026', 120, 'ZZFMT 3840x2160'], dirty: true, inQS: ['April 8-10, 2026', 'ZZFMT 3840x2160'], backInWire: 'ZZFMT 1080p59.94', reloaded: ['April 8-10, 2026', 'ZZFMT 1080p59.94'], fromOld: ['', '', ''], wireSheetPrintsClient: true, onWireSheet: false, onLookBook: false }, 'show info');
    await restore(); return out;
  });
  await check('Quick Start: opens with the three example shows and closes', async () => { openQS(); await wait(400); const m = $('#qs-modal'); const open = vis(m); const ex = (m ? m.innerHTML.match(/lbOpenExample\('/g) : null) || []; closeQS(); await wait(250); return is([open, ex.length, vis($('#qs-modal'))], [true, 3, false], 'Quick Start'); });
  await check('Help: opens and closes', async () => { actions.help(); await wait(400); const t = document.body.textContent; const open = /Quick Setup|Getting Started|Help/i.test(t); closeHelp(); await wait(200); return open ? true : 'Help did not open'; });
  await check('Help text names only sections that exist today', async () => {
    actions.help(); await wait(400); const box = $$('[id*="help"]').filter(vis).sort((a, b) => b.textContent.length - a.textContent.length)[0]; const t = box ? box.textContent : ''; closeHelp(); await wait(150);
    const retired = ['Position & Size', 'Geometry', 'Lock ratio', 'Zoom %', 'Pan X', 'Slot']; const hit = retired.filter(w => t.includes(w)); return hit.length ? 'Help still says: ' + hit.join(', ') : (t.length > 500 ? true : 'could not read the Help text');
  });
  // ── stacking / focus / keys audit (patch 16kp-sfk) ─────────────────────────────────────────────────────────────
  // INSERT these blocks in tests/flows_probe.js straight AFTER the check 'Help text names only sections that exist today'
  // (the last section, where Help is tested) and before 'name: Help and the Look Book cover say AV Look Book, ...'.
  // Synthetic events on purpose (the probe runs inside the page). Escape is sent to the focused element, or to <body>
  // when nothing has the focus, the way the browser routes a real key. Every block closes what it opened and leaves the
  // app on Video Presets Simple.
  await check('Stacking: + Destination opens ABOVE the Wire page and above the I/O Patch page, and its colour window above it', async () => {
    const onTop = el => { const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 30)); return !!t && el.contains(t); };
    const out = [];
    for (const open of [() => openWireMode(), () => openSystem()]) {
      open(); await wait(500); actions.addDestination(); await wait(350); const m = $('#mbox');
      const modalTop = vis(m) && onTop(m); openModalColorPicker(); await wait(300); const cp = $('#color-pop'); const cpTop = vis(cp) && onTop(cp);
      closeColorPop(); closeModal(); await wait(150); out.push(modalTop, cpTop);
    }
    closeSystem(); closeWireMode(); await wait(300);
    return is(out, [true, true, true, true], 'Wire: window on top / colour window on top / I/O Patch: window on top / colour window on top');
  });
  await check('Escape: a window open over Advanced, Wire or I/O Patch closes alone and the page stays open', async () => {
    const esc = () => (document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    // Advanced: the Add Destination window (focus sits in its Name field: the first Escape leaves the field, the next one closes the window)
    openFullscreen(presets[1].id); await wait(600); actions.addDestination(); await wait(300); esc(); await wait(300); const stayed = $('#modal').classList.contains('show'); esc(); await wait(300);
    const a = [stayed && !$('#modal').classList.contains('show'), !!fsPresetId];
    // Advanced: the preset's Advanced menu (focus nowhere)
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); const ab = $('#fs-overlay button[onclick="toggleAdvancedMenu(event)"]'); if (ab) ab.click(); await wait(250); esc(); await wait(300);
    const b = [!$('#adv-menu').classList.contains('open'), !!fsPresetId]; closeAdvancedMenu(); if (fsPresetId) closeFullscreen(); await wait(300);
    // Wire: a cable type list
    openWireMode(); await wait(600); const cb = $('#wire-overlay .wire-cable-btn'); if (!cb) { closeWireMode(); return 'no cable type button in Wire'; }
    _sysOpenDropdown(cb); await wait(250); const listOpen = !!$('.sys-dd'); esc(); await wait(300);
    const c = [listOpen, !$('.sys-dd'), getComputedStyle($('#wire-overlay')).display !== 'none']; _sysCloseMenu(); closeWireMode(); await wait(300);
    // I/O Patch: the Look Book export window
    openSystem(); await wait(500); openPdfExportModal(); await wait(300); esc(); await wait(300);
    const e = [getComputedStyle($('#pdf-export-modal')).display === 'none', $('#sys-overlay').classList.contains('open')]; closePdfExportModal(); closeSystem(); await wait(300);
    return is([a, b, c, e], [[true, true], [true, true], [true, true, true], [true, true]], 'Advanced + Add Destination [closed, page open] / Advanced + menu / Wire + list [opened, closed, page open] / I/O + Look Book window');
  });
  await check('Escape: closes the Look Book export window, the Wire export window, the Pre-Export Check and the colour window', async () => {
    const esc = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const hidden = el => !el || getComputedStyle(el).display === 'none';
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    openPdfExportModal(); await wait(300); esc(); await wait(250); const pdf = hidden($('#pdf-export-modal')); closePdfExportModal();
    openWireMode(); await wait(500); openWireExportModal(); await wait(300); esc(); await wait(250); const wx = [hidden($('#wire-export-modal')), getComputedStyle($('#wire-overlay')).display !== 'none']; closeWireExportModal(); closeWireMode(); await wait(300);
    const vp = $('#validation-panel'), vb = $('#validation-backdrop'); vp.innerHTML = '<div style="padding:20px">probe</div>'; vp.style.display = 'block'; vb.style.display = 'block'; await wait(100); esc(); await wait(250);
    const val = [hidden(vp), hidden(vb)]; vp.style.display = 'none'; vb.style.display = 'none';
    const f = firstLayer(); openColorPop(Object.assign({}, fakeEv), f.sid, f.pid); await wait(300); const cpOpen = !hidden($('#color-pop')); esc(); await wait(250); const cp = hidden($('#color-pop')); closeColorPop();
    return is([pdf, wx, val, cpOpen, cp], [true, [true, true], [true, true], true, true], 'Look Book window closed / Wire export [closed, Wire still open] / Pre-Export Check [panel, backdrop] / colour window opened / closed');
  });
  await check('Escape typed in a text field never closes Advanced, Wire or I/O Patch', async () => {
    const escIn = el => { el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); };
    openFullscreen(presets[1].id); await wait(600); const n = $('#fs-viewport input.p-name') || $('#show-name'); escIn(n); await wait(300); const a = !!fsPresetId; n.blur(); if (fsPresetId) closeFullscreen(); await wait(300);
    openWireMode(); await wait(600); const w = $('#wtb-project'); escIn(w); await wait(300); const b = getComputedStyle($('#wire-overlay')).display !== 'none'; w.blur(); closeWireMode(); await wait(300);
    openSystem(); await wait(500); const s = $('#sys-overlay input.sys-notes-input') || $('#sys-overlay input'); escIn(s); await wait(300); const c = $('#sys-overlay').classList.contains('open'); s.blur(); closeSystem(); await wait(300);
    return is([a, b, c], [true, true, true], 'Advanced still open / Wire still open / I/O Patch still open');
  });
  await check('Advanced: [ ] and the arrow keys typed in a dropdown or a text area do not change the preset or nudge the layer', async () => {
    const pid = presets[1].id; openFullscreen(pid); await wait(600); const f = firstLayer();
    const host = $('#fs-right-panel') || $('#fs-overlay'); const sel = document.createElement('select'); sel.innerHTML = '<option>a</option><option>b</option>'; const ta = document.createElement('textarea'); host.appendChild(sel); host.appendChild(ta);
    const key = (el, k) => { el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); };
    const geo = () => JSON.stringify(getLayerSize(f.pid, f.sid, 1) || {}); selLayer = { pid: f.pid, sid: f.sid, n: 1 }; const g0 = geo();
    key(sel, ']'); await wait(200); const p1 = fsPresetId; key(ta, '['); await wait(200); const p2 = fsPresetId;
    const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }); ta.focus(); ta.dispatchEvent(ev); await wait(200); const blocked = ev.defaultPrevented; const g1 = geo();
    sel.remove(); ta.remove(); selLayer = null; if (fsPresetId) closeFullscreen(); await wait(300); const out = is([p1, p2, blocked, g1 === g0], [pid, pid, false, true], 'preset after ] in a dropdown / after [ in a text area / arrow key taken away from the text area / layer untouched'); await restore(); return out;
  });
  await check('Layer Properties: a Width TYPED digit by digit (6, 64, 640) keeps the shape with the lock on (640 x 360, not 640 x 640)', async () => {
    const f = firstLayer(); const sw = parseInt(f.s.w), sh = parseInt(f.s.h); const wasLocked = _lfxLock; _lfxLock = true;
    openLayerPanel(fakeEv, f.pid, f.sid, 1, true); await wait(450);
    const w = $$('#layer-panel .lfx-acc[data-sec="size"] input[type=number]').find(i => i.dataset.dim === 'w'); if (!w) { closeLayerPanel(); _lfxLock = wasLocked; return 'no Width field'; }
    w.focus(); for (const v of ['6', '64', '640']) { w.value = v; fire(w, 'input'); await wait(80); } fire(w, 'change'); w.blur(); await wait(200);
    const g = _lfxGeo(f.pid, f.sid, 1, sw, sh); closeLayerPanel(); _lfxLock = wasLocked; const out = is([g.w, g.h], [640, 360], 'window after typing 640'); await restore(); return out;
  });
  await check('Keys: an arrow nudge of a picked layer is one undo step; Advanced on Lock resizes a picked destination and never moves it', async () => {
    const key = (k, shift) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: !!shift, bubbles: true, cancelable: true }));
    const f = firstLayer(); setLayerSize(f.pid, f.sid, 1, 0.5, 0.5, 0.1, 0.1); scheduleRender(); await wait(200);
    doSelect(null, null); selLayer = { pid: f.pid, sid: f.sid, n: 1 }; const u0 = _undoStack.length; const x0 = getLayerSize(f.pid, f.sid, 1).xf;
    key('ArrowRight'); await wait(200); const moved = Math.round((getLayerSize(f.pid, f.sid, 1).xf - x0) * parseInt(f.s.w)); const steps = _undoStack.length - u0;
    doUndo(); await wait(250); const back = Math.round((getLayerSize(f.pid, f.sid, 1).xf - x0) * parseInt(f.s.w)); selLayer = null;
    openFullscreen(f.pid); await wait(600); fsCanvasLocked = true; sel = { pid: f.pid, sid: f.sid }; const p = presets.find(x => x.id === f.pid); const pos0 = JSON.stringify(p.positions[f.sid]); const w0 = parseInt(f.s.w); const u1 = _undoStack.length;
    key('ArrowRight'); await wait(250); const s2 = screens.find(x => x.id === f.sid); const res = [JSON.stringify(p.positions[f.sid]) === pos0, parseInt(s2.w) - w0, _undoStack.length - u1];
    sel = null; if (fsPresetId) closeFullscreen(); await wait(300); const out = is([moved, steps, back, res], [10, 1, 0, [true, 1, 1]], 'layer moved px / undo steps / px after one undo / Advanced on Lock [position untouched, width +px, undo steps]'); await restore(); return out;
  });
  await check('name: Help and the Look Book cover say AV Look Book, the window title keeps the ending the desktop app reads', async () => {
    actions.help(); await wait(300); const h = $$('h3').find(x => /· Help$/.test(x.textContent.trim())); const ht = h ? h.textContent.trim() : ''; closeHelp(); await wait(150);
    const d = new DOMParser().parseFromString(await userLookBook(), 'text/html'); const brand = ((d.querySelector('.brand') || {}).textContent || '').trim();
    return is([ht, brand, / — Look Book Builder$/.test(document.title)], ['AV Look Book · Help', 'AV Look Book', true], 'name');
  });
  await check('Report a bug: builds an email to AV Educate with the template and the show attached', async () => {
    mailHref = null; downloads.length = 0; await reportBug(); await wait(500); const h = decodeURIComponent(mailHref || '');
    return is([/^mailto:info@aveducate\.com/i.test(mailHref || ''), /Name:/.test(h), /Bug located:/.test(h), downloads.some(d => /\.avlb$/.test(d.name))], [true, true, true, true], 'bug mail');
  });

  // ── shell-toolbar click-through (2026-09-21): INSERT in tests/flows_probe.js straight AFTER the check
  //    'Report a bug: builds an email to AV Educate with the template and the show attached' (the last check of the file,
  //    before the "_fsPauseAll" clean-up line). Every block fails on build 16ko without patch.py and passes with it.
  //    Helpers used: $, $$, wait, is, vis, restore, okDialogs, dlgOpen, dialogText (all defined at the top of the probe).
  const _stKey = (key, o, target) => (target || document.body).dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, o || {})));
  const _stTop = el => { if (!el) return false; const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === el || el.contains(t)); };

  await check('toolbar: + Destination opens ABOVE Wire and above I/O Patch, and its colour picker above that', async () => {
    const seen = [];
    for (const [open, close] of [[openWireMode, closeWireMode], [openSystem, closeSystem]]) {
      open(); await wait(700); actions.addDestination(); await wait(350); const win = _stTop($('#ms-n'));
      openModalColorPicker(); await wait(250); const pick = _stTop($('#color-pop')); if (typeof closeColorPop === 'function') closeColorPop(); closeModal(); close(); await wait(350); seen.push(win, pick);
    }
    actions.addDestination(); await wait(300); const home = _stTop($('#ms-n')); closeModal();
    return is(seen.concat(home), [true, true, true, true, true], 'Wire window / Wire picker / I/O window / I/O picker / Video Presets window on top');
  });
  await check('toolbar: Add Destination is one undo step and is held to the size limits (67 to 7680 wide, 67 to 4320 high)', async () => {
    const n = screens.length, u = _undoStack.length; actions.addDestination(); await wait(300); $('#ms-n').value = 'LIMIT TEST'; $('#ms-w').value = '99999'; $('#ms-h').value = '-5'; confirmScreen(); await wait(450); okDialogs();
    const s = screens[screens.length - 1]; const got = [screens.length, s.w, s.h, _undoStack.length - u]; doUndo(); await wait(400); const back = screens.length; await restore();
    return is(got.concat(back), [n + 1, 7680, 1080, 1, n], 'count / width / height / undo steps / count after Undo');
  });
  await check('keys: Cmd+N on an open show goes through New (asks first), and Build My Show then makes a NEW show instead of adding to the open one', async () => {
    _stKey('n', { metaKey: true }); await wait(350); const asked = dlgOpen() && /new show|unsaved/i.test(dialogText()); const qsEarly = vis($('#qs-modal'));
    if (!asked) { closeQS(); await restore(); return 'Cmd+N opened Quick Setup over the open show without asking (Build My Show would add 4 destinations and a second P01 to it)'; }
    okDialogs(); await wait(900); const cleared = screens.length === 0 && presets.length === 0 && vis($('#qs-modal'));
    $('#qs-show').value = 'KEY NEW SHOW'; confirmQS(); await wait(600); okDialogs(); const out = is([qsEarly, cleared, screens.length, presets.length, presets.filter(p => p.code === 'P01').length], [false, true, 4, 1, 1], 'Quick Setup before the answer / cleared first / destinations / presets / P01 count');
    await restore(); return out;
  });
  await check('Quick Setup: opens at the top with the cursor in Show name; Escape with a resolution list open closes the list only, the next Escape closes the wizard', async () => {
    openQS(); await wait(300); $('#qs-modal').scrollTop = 9999; closeQS(); openQS(); await wait(350); const top = $('#qs-modal').scrollTop, focus = (document.activeElement || {}).id;
    qsOpenResPicker({ stopPropagation() {} }, 0); await wait(300); const listOpen = $$('.shared-res-dd').length; _stKey('Escape', {}, $('#qs-res-0')); await wait(250);
    const listAfter = $$('.shared-res-dd').length, qsAfter = vis($('#qs-modal')); if (typeof closeSharedResPicker === 'function') closeSharedResPicker();
    _stKey('Escape'); await wait(250); const qsEnd = vis($('#qs-modal')); closeQS();
    return is([top, focus, listOpen, listAfter, qsAfter, qsEnd], [0, 'qs-show', 1, 0, true, false], 'scroll / cursor / list open / list after Escape / wizard after 1st Escape / wizard after 2nd');
  });
  await check('Escape closes the Look Book window, the Pre-Export Check and Add Destination (cursor outside the fields), and lets go of a picked layer', async () => {
    openPdfExportModal(); await wait(300); _stKey('Escape'); await wait(200); const lb = vis($('#pdf-export-modal')); closePdfExportModal();
    runExportWithValidation(function () {}, '_doExportExcel', function () { return { errors: [], warnings: ['test warning'] }; }); await wait(250); const was = vis($('#validation-panel')); _stKey('Escape'); await wait(200); const pre = vis($('#validation-panel')) || vis($('#validation-backdrop'));
    $('#validation-panel').style.display = 'none'; $('#validation-backdrop').style.display = 'none';
    actions.addDestination(); await wait(300); if (document.activeElement) document.activeElement.blur(); _stKey('Escape'); await wait(200); const add = $('#modal').classList.contains('show'); closeModal();
    const f = firstLayer(); selLayer = { pid: f.pid, sid: f.sid, n: 1 }; updateLayerSelDOM(f.pid, f.sid, 1, true); _stKey('Escape'); await wait(200); const held = !!selLayer, lit = $$('.layer-chip.lsel').length; selLayer = null; await restore();
    return is([lb, was, pre, add, held, lit], [false, true, false, false, false, 0], 'Look Book open / check opened / check open after Escape / Add Destination open / layer still picked / chips lit');
  });
  await check('keys: Cmd+S saves while the cursor is in the Show name field, and saves once (not twice) outside a field', async () => {
    const real = window.saveProject; let calls = 0; window.saveProject = function () { calls++; };
    try { const f = $('#show-name'); f.focus(); _stKey('s', { metaKey: true }, f); await wait(150); const inField = calls; f.blur(); _stKey('s', { metaKey: true }); await wait(150); return is([inField, calls], [1, 2], 'saves from the field / total after one more outside'); }
    finally { window.saveProject = real; }
  });
  await check('draft: a show with nothing in it is never offered as a draft, a real show still is', async () => {
    const KEY = 'avlb_autosave'; let old = null; try { old = localStorage.getItem(KEY); } catch (e) { return 'no localStorage in this run'; }
    const empty = { screens: [], presets: [], dsms: [], sources: [], ioDests: [], customLibrary: [], showName: '', _savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(empty)); restoreAutoSave(); await wait(300); const offeredEmpty = dlgOpen(); if (offeredEmpty) { $('#dlg-cancel').click(); await wait(900); }
    const st = JSON.parse(BASE); localStorage.setItem(KEY, JSON.stringify(Object.assign({}, st, { _savedAt: Date.now() }))); restoreAutoSave(); await wait(300); const offeredReal = dlgOpen() && /Restore Draft/i.test(dialogText());
    if (dlgOpen()) { $('#dlg-cancel').click(); await wait(900); } if (old === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, old);
    return is([offeredEmpty, offeredReal], [false, true], 'empty show offered / real show offered');
  });
  await check('Help keyboard map: the 1 – 9 row lights nine keys, Scroll wheel reads as a mouse action, and the Cmd+N line says what the key does', async () => {
    actions.help(); helpTab('kbd'); await wait(350); const rows = $$('#hpanel-kbd .kbv-sc'); const nine = rows.find(r => /^1\s/.test(r.children[0].textContent.trim())), wheel = rows.find(r => /Scroll wheel/.test(r.children[0].textContent));
    const newRow = rows.find(r => /\+ N$/.test(r.children[0].textContent.trim()) && !/Shift/.test(r.children[0].textContent)); if (!nine || !wheel || !newRow) { closeHelp(); return 'a keyboard row is missing'; }
    nine.click(); await wait(100); const lit = $$('#kbv-board .kbv-key.on').length; nine.click(); wheel.click(); await wait(100); const hint = $('#kbv-hint').textContent; wheel.click(); const txt = newRow.children[1].textContent; closeHelp(); await wait(150);
    return is([lit, /mouse action/.test(hint), /Quick Show Setup/.test(txt) && !/new project wizard/.test(txt)], [9, true, true], 'keys lit / wheel is a mouse row / Cmd+N text');
  });
  await check('unsaved marker: Collapse all and Expand all leave a saved show clean', async () => {
    await restore(); _captureCleanBaseline(); _recomputeDirty(); const before = _isDirty; actions.collapseAll(); await wait(250); _recomputeDirty(); const a = _isDirty; actions.expandAll(); await wait(250); _recomputeDirty(); const b = _isDirty; await restore();
    return is([before, a, b], [false, false, false], 'unsaved before / after Collapse all / after Expand all');
  });
  await check('keys: in the Advanced page an arrow does to a picked destination exactly what it does in Simple (resizes it 1 px, never moves it as well, one undo step); in Simple an arrow nudge of a layer is one undo step', async () => {
    const p = presets[0], s = screens[0]; openFullscreen(p.id); await wait(700); doSelect(p.id, s.id); selLayer = null; const w0 = parseInt(s.w), x0 = ((p.positions || {})[s.id] || { x: 0 }).x, u0 = _undoStack.length;
    _stKey('ArrowRight'); await wait(300); const s1 = screens.find(x => x.id === s.id), p1 = presets.find(x => x.id === p.id); const adv = [parseInt(s1.w) - w0, ((p1.positions || {})[s.id] || { x: 0 }).x - x0, _undoStack.length - u0];
    closeFullscreen(); await wait(400); await restore();
    const f = firstLayer(); setLayerSize(f.pid, f.sid, 1, 0.5, 0.5, 0.25, 0.25); doSelect(null, null); selLayer = { pid: f.pid, sid: f.sid, n: 1 }; const sw = parseInt(f.s.w); const lx = () => Math.round((getLayerSize(f.pid, f.sid, 1).xf || 0) * sw);
    const a = lx(), u1 = _undoStack.length; _stKey('ArrowRight'); await wait(250); const b = lx(), steps = _undoStack.length - u1; doUndo(); await wait(350); const c = lx(); selLayer = null; await restore();
    return is([adv, b - a, steps, c - a], [[1, 0, 1], 10, 1, 0], 'Advanced [resize, move, undo steps] / Simple nudge px / undo steps / px after Undo');   /* merge decision 16kp: Advanced follows Simple (owner: "everything Simple can do, Advanced should do"); three patches had proposed three different rules */
  });
  // ── move arrows on a selected destination (round 4, on-canvas ◀ ▶ only: the arrow KEYS stay the 1 px resize, owner 2026-09-21) ──
  const _mvFmt = () => $$('.move-symbol button').map(b => b.textContent + (b.style.pointerEvents === 'none' ? 'grey' : 'on')).join(' ');
  const _mvBox = (pid, sid) => $((fsPresetId ? '#fs-canvas' : '#canvas-area') + ' .screen-box[data-pid="' + pid + '"][data-sid="' + sid + '"]');
  const _mvPick = async (pid, sid) => { hideMoveSymbol(); doSelect(null, null); selLayer = null; await wait(120); _mvBox(pid, sid).click(); await wait(250); };
  const _mvPress = async glyph => { const b = $$('.move-symbol button').find(x => x.textContent === glyph); if (!b || b.style.pointerEvents === 'none') return false; b.click(); await wait(450); return true; };
  const _mvShow = () => JSON.stringify({ screens, presets });
  const _mvOverlaps = () => presets.map(p => _overlapPairsForPreset(p).size).join(',');
  await check('move arrows: a swap never parks a destination on top of another, with unequal widths, a dead space and a preset that has its own order; the dead space keeps its slot', async () => {
    await restore(); screens[1].w = 3840; presets.forEach(p => { delete p.positions; initStripPositions(p.id); }); const [a, b, c] = screens.map(s => s.id);
    presets.forEach((p, i) => { if (i === 1) { setPosition(p, a, 0, 0); setPosition(p, c, 1920, 0); setPosition(p, b, 3840, 0); } else setPosition(p, c, 6260, 0); }); render(); await wait(350);
    await _mvPick(presets[0].id, a); const pressed = await _mvPress('▶'); const q = presets[0].positions, q2 = presets[1].positions;
    const out = is([pressed, _mvOverlaps(), [q[b].x, q[a].x, q[c].x], [q2[b].x, q2[c].x, q2[a].x], screens.map(s => s.id).join()], [true, '0,0,0,0,0', [0, 3840, 6260], [0, 3840, 5760], [b, a, c].join()], 'pressed / overlaps per preset / P01 x / P02 x / list order');
    hideMoveSymbol(); doSelect(null, null); await restore(); return out;
  });
  await check('move arrows: a blended pair moves as one block from either member and never swaps with its partner; a destination alone on a second row is greyed both ways and a press on it adds no undo step', async () => {
    await restore(); const [a, b, c] = screens.map(s => s.id); const pid = presets[0].id; presets.forEach(p => { initStripPositions(p.id); setPosition(p, b, 1720, 0); }); render(); await wait(300);
    await _mvPick(pid, a); const left = _mvFmt(); const ov0 = _mvOverlaps(); await _mvPress('▶'); const q = presets[0].positions; const blend = [left, [q[c].x, q[a].x, q[b].x], _mvOverlaps() === ov0, screens.map(s => s.id).join() === [c, a, b].join()];
    await _mvPick(pid, b); const right = _mvFmt();
    await restore(); presets.forEach(p => { initStripPositions(p.id); setPosition(p, c, 0, 1080); }); render(); await wait(300);
    await _mvPick(pid, c); const lone = _mvFmt(); const u0 = _undoStack.length, s0 = _mvShow(); _execMove(pid, c, 'right'); await wait(400); const idle = _undoStack.length === u0 && _mvShow() === s0;
    hideMoveSymbol(); doSelect(null, null); await restore();
    return is([blend, right, lone, idle], [['◀grey ▶on', [0, 2120, 3840], true, true], '◀on ▶grey', '◀grey ▶grey', true], 'blend [arrows on the LEFT member, x after ▶, blends kept, list order] / arrows on the right member / alone on row 2 / no phantom undo step');
  });
  await check('move arrows: a pick from the Simple table row or the Advanced destination row shows the arrows, picking elsewhere moves them, un-picking removes them', async () => {
    await restore(); const pid = presets[0].id; hideMoveSymbol(); doSelect(null, null); const out = [];
    const cell = $('#tbody tr[data-pid="' + pid + '"][data-sid="' + screens[1].id + '"]').children[5]; _mvBox(pid, screens[0].id).click(); await wait(200); cell.click(); await wait(250);
    out.push(_mvFmt(), $$('.move-symbol').length, ($('.move-symbol') && $('.move-symbol').closest('.screen-box').dataset.sid) === screens[1].id); cell.click(); await wait(200); out.push(_mvFmt());
    openFullscreen(pid); await wait(700); const tab = _fsPropTab; _fsSetPropTab('layers'); if (selLayer) _fsClearLayer(); doSelect(null, null); await wait(300);
    const row = $$('#fs-toolbar .fs-drow-h[data-sid]').find(r => r.dataset.sid === screens[2].id); if (row) row.click(); await wait(300); out.push(_mvFmt());
    hideMoveSymbol(); doSelect(null, null); _fsSetPropTab(tab); closeFullscreen(); await wait(400); await restore();
    return is(out, ['◀on ▶on', 1, true, '', '◀on ▶grey'], 'Simple row pick / one arrow pair / on the row\'s destination / after un-pick / Advanced row pick (last destination)');
  });
  await check('move arrows: a swap carries everything stored per destination in every preset, the table order follows, Undo and Redo are exact and a save + reload keeps it (pins existing behaviour)', async () => {
    await restore(); const p1 = presets[1], sid = screens[1].id; toggleAOI(p1.id, sid); setAOI(p1.id, sid, { x: 100, y: 100, w: 800, h: 600 }); setScreenName(presets[2].id, sid, 'ZZ OVERRIDE'); presets[3].hiddenScreens = presets[3].hiddenScreens || {}; presets[3].hiddenScreens[screens[0].id] = true; render(); await wait(300);
    const sig = () => { const o = {}; presets.forEach(p => screens.forEach(s => { const r = {}; Object.keys(p).forEach(k => { const v = p[k]; if (k !== 'positions' && v && typeof v === 'object' && !Array.isArray(v) && Object.prototype.hasOwnProperty.call(v, s.id)) r[k] = v[s.id]; }); o[p.id + s.id] = r; })); return JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]])); };
    const g0 = sig(), s0 = _mvShow(), names = screens.map(s => s.name); await _mvPick(presets[0].id, sid); await _mvPress('◀'); const s1 = _mvShow();
    const rows = $$('#tbody tr[data-pid="' + presets[0].id + '"]').map(r => screens.find(s => s.id === r.dataset.sid).name);
    const kept = sig() === g0; doUndo(); await wait(400); const undone = _mvShow() === s0; doRedo(); await wait(400); const redone = _mvShow() === s1;
    const saved = JSON.stringify(getProjectState()); _applyProjectText(saved); await wait(700); okDialogs(); const reloaded = JSON.stringify(getProjectState().screens) + JSON.stringify(getProjectState().presets) === JSON.stringify(JSON.parse(saved).screens) + JSON.stringify(JSON.parse(saved).presets);
    hideMoveSymbol(); doSelect(null, null); await restore();
    return is([kept, rows, undone, redone, reloaded], [true, [names[1], names[0], names[2]], true, true, true], 'per-destination data untouched / table rows / undo / redo / save + reload');
  });
  await check('move arrows: the phone arrows use the same swap (unequal widths never overlap, one undo step)', async () => {
    await restore(); screens[1].w = 3840; presets.forEach(p => { delete p.positions; initStripPositions(p.id); }); render(); await wait(300); const u0 = _undoStack.length;
    mbMoveDest(screens[0].id, 1); await wait(400); const out = is([_mvOverlaps(), _undoStack.length - u0, presets[0].positions[screens[0].id].x], ['0,0,0,0,0', 1, 0], 'overlaps per preset / undo steps / the wide destination now starts at'); await restore(); return out;
  });
  await check('Modifiers menu (preset tile) closes on a click on a layer chip, and its button still toggles it', async () => {
    const btn = $('.preset-row .pr-actions button[onclick*="toggleAdvancedMenu"]'), menu = $('#adv-menu'); if (!btn) return 'no Modifiers button on the preset tile'; btn.click(); await wait(250); const opened = menu.classList.contains('open'); const chip = $('.preset-row .layer-chip'); if (!chip) { closeAdvancedMenu(); return 'no layer chip on the canvas'; }
    chip.click(); await wait(250); const after = menu.classList.contains('open'); closeAdvancedMenu(); btn.click(); await wait(200); const t1 = menu.classList.contains('open'); btn.click(); await wait(200); const t2 = menu.classList.contains('open');
    closeAdvancedMenu(); try { closeLayerPanel(); } catch (e) {} selLayer = null; await restore();
    return is([opened, after, t1, t2], [true, false, true, false], 'opened / open after the chip click / button opens / button closes');
  });
  // ── exports-send (click-through 2026-09-21). INSERT in tests/flows_probe.js straight AFTER the check
  //    'Report a bug: builds an email to AV Educate with the template and the show attached' (the last check, before the
  //    closing "try { _fsPauseAll(); }" line). Uses the probe's own helpers: $, $$, wait, is, fire, vis, firstLayer, restore,
  //    okDialogs, dialogText, dlgOpen, userLookBook, downloads, mailHref. Needs no media. Each check FAILS on build 16ko
  //    and PASSES with exports-send/patch.py applied.
  // the printed Look Book, laid out the way the print window lays it out (its own script runs, the print call is taken out)
  const lbRender = async (html) => {
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;left:-4000px;top:0;width:1300px;height:900px;border:0;visibility:hidden';
    f.srcdoc = String(html).replace('setTimeout(()=>window.print(), 800);', ''); document.body.appendChild(f);
    await new Promise(r => { f.onload = r; setTimeout(r, 4000); }); await wait(500); return f;
  };
  await check('Keys: an arrow key on a picked destination resizes it 1 px and pushes the destinations to its right along, so nothing ever overlaps; a burst is one undo step; Advanced does the same', async () => {
    await restore(); const A = () => screens[0], B = () => screens[1], P0 = () => presets[0]; const x = id => (P0().positions[id] || {}).x, ov = () => presets.map(q => _overlapPairsForPreset(q).size).join(',');
    const run = async () => { doSelect(P0().id, A().id); selLayer = null; await wait(150); const w0 = parseInt(A().w), bx0 = x(B().id), u0 = _undoStack.length; for (let i = 0; i < 3; i++) { _stKey('ArrowRight'); await wait(60); } await wait(250);
      const got = [parseInt(A().w) - w0, x(B().id) - bx0, ov(), _undoStack.length - u0]; doUndo(); await wait(350); got.push(parseInt(A().w) - w0, x(B().id) - bx0); doSelect(null, null); return got; };
    const simple = await run(); await wait(800); openFullscreen(P0().id); await wait(700); const adv = await run(); closeFullscreen(); await wait(400); await restore();
    const want = [3, 3, presets.map(() => 0).join(','), 1, 0, 0]; return is([simple, adv], [want, want], '[width +px, neighbour moved px, overlaps per preset, undo steps, width after Undo, neighbour after Undo] in Simple / in Advanced');
  });
  await check('Look Book: every contents row jumps to its section and prints the real page number, rows are one line high', async () => {
    window._pdfOpts = null; const f = await lbRender(await userLookBook()); const d = f.contentDocument; const pages = [...d.querySelectorAll('.page')];
    const rows = [...d.querySelectorAll('.toc-row')].map(a => { const t = d.getElementById((a.getAttribute('href') || '').slice(1)); const pg = t ? (t.classList.contains('page') ? t : t.closest('.page')) : null; return { label: a.querySelector('.toc-name').textContent, printed: a.querySelector('.toc-row .toc-page').textContent.trim(), real: pg ? String(pages.indexOf(pg) + 1) : 'no target', h: Math.round(a.getBoundingClientRect().height) }; });
    const bad = rows.filter(r => r.printed !== r.real).map(r => r.label + ' prints ' + r.printed + ', is on ' + r.real); const tall = rows.filter(r => r.h > 40).length; f.remove();
    return is([rows.length > 5, bad, tall], [true, [], 0], 'rows found / wrong or dead rows / rows taller than one line');
  });
  await check('Look Book: the Canvas Visual stays inside the page margins on every preset page', async () => {
    window._pdfOpts = null; const f = await lbRender(await userLookBook()); const d = f.contentDocument;
    const out = [...d.querySelectorAll('.page .canvas-vis')].map(c => Math.round(c.getBoundingClientRect().right - c.closest('.page').getBoundingClientRect().right + 30)).filter(px => px > 1); const n = d.querySelectorAll('.page .canvas-vis').length; f.remove();
    return is([n >= presets.length, out], [true, []], 'canvas frames found / px past the right margin');
  });
  await check('Look Book: a preset name with < > & prints in full in the page header, and crop / FX lines are not cut', async () => {
    const f0 = firstLayer(); const p = presets.find(x => x.id === f0.pid); p.name = 'Q&A <Panel> wide'; setCrop(f0.pid, f0.sid, 1, { t: 10, b: 5, l: 25, r: 3 }); setLayerFx(f0.pid, f0.sid, 1, { op: 128, flipH: true, edge: { on: true, w: 6, color: '#ff4e8b' }, shadow: { on: true, x: 8, y: 8, blur: 12 } });
    window._pdfOpts = null; openPdfExportModal(); await wait(300); $('#pdf-opt-crop').checked = true; const real = exportPDF; let html = ''; window.exportPDF = function () { html = real(true); }; try { _pdfConfirmExport(); } finally { window.exportPDF = real; } await wait(150);
    const f = await lbRender(html); const d = f.contentDocument; const hdr = [...d.querySelectorAll('.preset-page .ph-name')].map(e => e.textContent).filter(t => /Q&A/.test(t));
    const cut = [...d.querySelectorAll('.bd-crop,.bd-row,.bd-dest')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim().slice(0, 24)); f.remove(); window._pdfOpts = null; await restore();
    return is([hdr.length > 0 && hdr.every(t => t === 'Q&A <Panel> wide'), cut], [true, []], 'header text / cut lines');
  });
  await check('Exports: Esc closes the Look Book window, and closes the Pre-Export Check without closing the I/O Patch page under it', async () => {
    const esc = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    openPdfExportModal(); await wait(250); esc(); await wait(200); const lbOpen = getComputedStyle($('#pdf-export-modal')).display !== 'none'; closePdfExportModal();
    openSystem(); await wait(600); const nm = presets[1].name; presets[1].name = ''; runExportWithValidation(function () {}, '_doExportExcel'); await wait(250); const shown = getComputedStyle($('#validation-panel')).display !== 'none';
    esc(); await wait(250); const panelOpen = getComputedStyle($('#validation-panel')).display !== 'none', dim = getComputedStyle($('#validation-backdrop')).display !== 'none', ioOpen = $('#sys-overlay').classList.contains('open');
    $('#validation-panel').style.display = 'none'; $('#validation-backdrop').style.display = 'none'; presets[1].name = nm; if (ioOpen) closeSystem(); await wait(250);
    return is([lbOpen, shown, panelOpen, dim, ioOpen], [false, true, false, false, true], 'Look Book window open after Esc / check shown / check open after Esc / dim layer left / I/O Patch still open');
  });
  await check('Pre-Export Check: a BG-only preset (walk-in logo, full-bleed playback) is not called empty, a preset with nothing on it is', async () => {
    const before = validateProject().warnings.filter(w => /P01|P05/.test(w) && /no layers|no BG/.test(w));
    actions.addPreset(); await wait(350); okDialogs(); const np = presets[presets.length - 1]; screens.forEach(s => { setBgName(np.id, s.id, ''); if (np.bgs) delete np.bgs[s.id]; getLayerNums(np.id).forEach(n => setL(np.id, s.id, n, null)); });
    const bare = screens.every(s => !getBgName(np.id, s.id)); const flagged = validateProject().warnings.some(w => w.indexOf('Preset ' + np.code + ' ') === 0 && /no BG and no layers|no layers/.test(w)); await restore();
    return is([before, bare ? flagged : true], [[], true], 'BG-only presets flagged / an empty preset flagged');
  });
  await check('Browser draft: while the Restore Draft question is unanswered the autosave leaves the stored draft alone, then writes again once it is answered', async () => {
    const KEY = 'avlb_autosave'; const keep = localStorage.getItem(KEY); const mark = JSON.stringify({ screens: [{ id: 'keepme', name: 'DRAFT', w: 1920, h: 1080 }], presets: [], _savedAt: Date.now() }); localStorage.setItem(KEY, mark);
    restoreAutoSave(); await wait(300); const asked = /Restore Draft/i.test(dialogText()); _writeAutoSaveNow(); const untouched = localStorage.getItem(KEY) === mark;
    const c = $('#dlg-cancel'); if (c) c.click(); await wait(1600); if (dlgOpen()) { const c2 = $('#dlg-cancel'); if (c2) c2.click(); await wait(900); } _writeAutoSaveNow(); const writesAgain = localStorage.getItem(KEY) !== mark;
    if (keep === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, keep);
    return is([asked, untouched, dlgOpen(), writesAgain], [true, true, false, true], 'prompt shown / draft untouched while it is up / prompt closed / autosave writes afterwards');
  });
  await check('Save: Cmd / Ctrl + S saves while the cursor is in a text field (once, and the field is committed first)', async () => {
    const real = window.saveProject; let calls = 0, hadFocus = null; window.saveProject = function () { calls++; hadFocus = document.activeElement && document.activeElement.id; };
    const inp = $('#show-name'); inp.focus(); const ev = new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true }); inp.dispatchEvent(ev); await wait(150);
    window.saveProject = real; inp.blur(); return is([calls, ev.defaultPrevented, hadFocus === 'show-name'], [1, true, false], 'save calls / browser Save Page blocked / field still focused at save time');
  });
  await check('Open: a show file with a blank name clears the name field instead of keeping the previous show\'s name', async () => {
    const st = JSON.parse(BASE); st.showName = ''; _applyProjectText(JSON.stringify(st)); await wait(700); okDialogs(); const got = $('#show-name').value; await restore();
    return is([got, $('#show-name').value], ['', JSON.parse(BASE).showName], 'name after opening the blank-name file / after restoring');
  });
  await check('Send: attaches the Look Book the window builds (wire sheet included) plus the cue sheet, and the mail draft goes through the mail seam', async () => {
    const hadShare = navigator.share, hadCan = navigator.canShare; let shared = null; const had = window._pdfOpts; window._pdfOpts = null;
    navigator.canShare = function () { return true; }; navigator.share = async function (d) { shared = d; };
    await sendShow(); await wait(400); const lb = shared && (shared.files || []).find(f => /\.html$/.test(f.name)); const xl = shared && (shared.files || []).find(f => /\.xlsx$/.test(f.name)); const html = lb ? await lb.text() : '';
    let mailed = 'Send still opens the mail draft with window.location, not through _lbOpenMail';
    if (/_lbOpenMail\(/.test(String(sendShow))) { navigator.canShare = function () { return false; }; mailHref = null; downloads.length = 0; await sendShow(); await wait(400); mailed = (/^mailto:\?subject=Look%20Book/.test(mailHref || '') && downloads.length === 2) ? true : ('mail href ' + mailHref + ', downloads ' + downloads.length); }
    delete navigator.share; delete navigator.canShare; if (hadShare && !navigator.share) navigator.share = hadShare; if (hadCan && !navigator.canShare) navigator.canShare = hadCan; window._pdfOpts = had;
    return is([!!xl, /id="pdf-wire"/.test(html), /id="pdf-cover"/.test(html), window._pdfOpts === had, mailed], [true, true, true, true, true], 'cue sheet attached / wire sheet in the sent Look Book / cover / window options left alone / mail fallback');
  });
  // ── UNDO / UNSAVED-CHANGES AUDIT (2026-09-21). INSERT the whole block in tests/flows_probe.js straight AFTER the LAST
  //    check, 'Report a bug: builds an email to AV Educate with the template and the show attached', and BEFORE the
  //    closing "try { _fsPauseAll(); } ..." line. (Not earlier: one check opens Advanced, and the Simple tile count check
  //    near the top counts the tiles Advanced leaves in the page.) Every check closes what it opened and ends on
  //    restore(). They drive the page with the events a user produces (pointerdown / mouse / click / input / change /
  //    keydown), because the undo safety net listens to those. The 'view-only clicks' check passes on the old page too:
  //    it is the guard that keeps the net from ever recording a step for a view change.
  try { closeFullscreen(); } catch (e) {} try { closeWireMode(); } catch (e) {} try { closeSystem(); } catch (e) {} await restore();
  const _uaLen = () => eval('_undoStack').length;
  const _uaSnap = () => _snapshot();
  const _uaPtr = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  const _uaMouse = (el, type, x, y) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1, view: window }));
  // one step recorded, Undo gives back exactly the state from before, Redo the state from after
  const _uaOneStep = async (before, n0, label) => {
    const after = _uaSnap(), steps = _uaLen() - n0; if (after === before) return label + ': the action changed nothing';
    doUndo(); await wait(300); const undone = _uaSnap() === before; doRedo(); await wait(300); const redone = _uaSnap() === after;
    return is([steps, undone, redone], [1, true, true], label + ' (undo steps / undo restores / redo re-applies)');
  };

  await check('undo: Add Destination (its window, the Add button) is one undo step', async () => {
    await restore(); const before = _uaSnap(), n0 = _uaLen(); actions.addDestination(); await wait(350); if (!vis($('#modal'))) return 'the Add Destination window did not open';
    $('#ms-n').value = 'UNDO DEST'; $('#ms-w').value = '1920'; $('#ms-h').value = '1080'; $('#modal button[onclick="confirmScreen()"]').click(); await wait(500); okDialogs(); await wait(200);
    const out = await _uaOneStep(before, n0, 'Add Destination'); await restore(); return out;
  });
  await check('undo: Add AUX (+) is one undo step', async () => {
    await restore(); const before = _uaSnap(), n0 = _uaLen(); const b = $('.preset-row [onclick*="actions.addDSM()"]'); if (!b) return 'no + AUX button'; b.click(); await wait(450);
    const out = await _uaOneStep(before, n0, 'Add AUX'); await restore(); return out;
  });
  await check('undo: layer panel "Remove from this preset" is one undo step', async () => {
    await restore(); const f = firstLayer(); const before = _uaSnap(), n0 = _uaLen(); openLayerPanel(fakeEv, f.pid, f.sid, 1, false); await wait(450); const b = $('#layer-panel .lp-remove'); if (!b) return 'no Remove button in the Simple layer panel';
    b.click(); await wait(450); if (getL(f.pid, f.sid, 1)) return 'the layer is still there';
    const out = await _uaOneStep(before, n0, 'Remove from this preset'); await restore(); return out;
  });
  await check('undo: picking content from the layer panel list is one undo step', async () => {
    await restore(); const f = firstLayer(); const before = _uaSnap(), n0 = _uaLen(); openLayerPanel(fakeEv, f.pid, f.sid, 1, false); await wait(450);
    const row = $$('#layer-panel [data-label]').find(r => r.dataset.label === 'TIMER' && !r.classList.contains('lp-color-swatch') && !r.classList.contains('lp-del')); if (!row) return 'no TIMER row in the list';
    row.click(); await wait(450); if (getL(f.pid, f.sid, 1) !== 'TIMER') return 'the pick did not land';
    const out = await _uaOneStep(before, n0, 'list pick'); await restore(); return out;
  });
  await check('undo: a layer dragged on the canvas goes back to where it started', async () => {
    await restore(); const f = firstLayer(); setLayerSize(f.pid, f.sid, 1, 0.3, 0.3, 0.1, 0.1); scheduleRender(); await wait(350);
    const chip = $('.preset-row[data-pid="' + f.pid + '"] .layer-chip[data-sid="' + f.sid + '"][data-lid="1"]'); if (!chip) return 'no chip'; chip.scrollIntoView({ block: 'center' }); await wait(200);
    const r = chip.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; const before = _uaSnap(), n0 = _uaLen(), x0 = getLayerSize(f.pid, f.sid, 1).xf;
    _uaPtr(chip, 'pointerdown', x, y); _uaMouse(chip, 'mousedown', x, y);
    for (let i = 1; i <= 6; i++) { _uaMouse(window, 'mousemove', x + i * 8, y + i * 4); await wait(20); }
    _uaMouse(window, 'mouseup', x + 48, y + 24); _uaPtr(window, 'pointerup', x + 48, y + 24); await wait(450);
    if (getLayerSize(f.pid, f.sid, 1).xf === x0) return 'the drag did not move the layer';
    const out = await _uaOneStep(before, n0, 'layer drag'); await restore(); return out;
  });
  await check('undo: an arrow-key nudge burst is one undo step and Undo puts the layer back', async () => {
    await restore(); const f = firstLayer(); setLayerSize(f.pid, f.sid, 1, 0.3, 0.3, 0.1, 0.1); scheduleRender(); await wait(300); selLayer = { pid: f.pid, sid: f.sid, n: 1 };
    const before = _uaSnap(), n0 = _uaLen();
    for (let i = 0; i < 3; i++) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); await wait(40); }
    await wait(800); const out = await _uaOneStep(before, n0, 'nudge'); selLayer = null; await restore(); return out;
  });
  await check('undo: a preset name typed in the preset header is one undo step', async () => {
    await restore(); const p = presets[0]; const inp = $('#pn-' + p.id); if (!inp) return 'no preset name field'; const before = _uaSnap(), n0 = _uaLen();
    fire(inp, 'input'); inp.value = 'UNDO NAME'; inp.dispatchEvent(new Event('blur')); fire(inp, 'change'); await wait(450);
    if (presets[0].name !== 'UNDO NAME') return 'the name did not commit';
    const out = await _uaOneStep(before, n0, 'preset name'); await restore(); return out;
  });
  await check('undo: AUX panel Apply (name and size) is one undo step', async () => {
    await restore(); const p = presets[0], d = dsms[0]; const before = _uaSnap(), n0 = _uaLen(); openDSMPanel(fakeEv, p.id, d.id); await wait(450); if (!$('#dsm-panel')) return 'the AUX panel did not open';
    $('#dsmp-name').value = 'UNDO AUX'; $('#dsmp-w').value = '1280'; $('#dsmp-apply').click(); await wait(450); const pn = $('#dsm-panel'); if (pn) pn.remove();
    const out = await _uaOneStep(before, n0, 'AUX Apply'); await restore(); return out;
  });
  await check('undo: I/O Patch Simple "+ Source" is one undo step and arms the autosave', async () => {
    await restore(); openSystem(); await wait(700); if (ioAdvanced.view !== 'simple') { _ioSetView('simple'); await wait(500); } okDialogs();
    clearTimeout(eval('_autoSaveTimer')); eval('_autoSaveTimer=null'); const before = _uaSnap(), n0 = _uaLen(); const b = $('#sys-overlay [onclick*="_sysAddSource()"]'); if (!b) { closeSystem(); return 'no + Source button'; }
    b.click(); await wait(450); const armed = !!eval('_autoSaveTimer'); const out = await _uaOneStep(before, n0, '+ Source'); closeSystem(); await restore(); return out === true ? is(armed, true, 'autosave armed') : out;
  });
  await check('undo: view-only clicks (Collapse all, Expand all, Wire zoom) record no undo step and keep Redo', async () => {
    await restore(); pushUndo(); setL(presets[0].id, screens[0].id, 4, 'TIMER'); scheduleRender(); await wait(200); doUndo(); await wait(300); const n0 = _uaLen(), r0 = eval('_redoStack').length;
    $('[onclick*="actions.collapseAll"]').click(); await wait(250); $('[onclick*="actions.expandAll"]').click(); await wait(250);
    openWireMode(); await wait(700); const z = $('#wire-overlay [onclick*="_wireZoomBy(0.1)"]'); if (z) z.click(); await wait(300); closeWireMode(); await wait(300);
    const out = is([_uaLen() - n0, eval('_redoStack').length], [0, r0], 'undo steps added / redo steps kept'); await restore(); return out;
  });
  await check('unsaved dot: typing the show name lights it without any other action', async () => {
    await restore(); await wait(500); if (eval('_isDirty')) return 'the show is already marked unsaved after a reload'; const sn = $('#show-name'), was = sn.value;
    sn.value = was + ' X'; fire(sn, 'input'); fire(sn, 'change'); await wait(900); const lit = eval('_isDirty') && !!$('#tb-dirty').closest('button').classList.contains('save-dirty');
    sn.value = was; fire(sn, 'input'); fire(sn, 'change'); await wait(200); await restore(); return is(lit, true, 'unsaved dot');
  });
  await check('Advanced: the Opacity fader is not rebuilt under the pointer on its first move and records one undo step', async () => {
    await restore(); const f = firstLayer(); openFullscreen(f.pid); await wait(700); _fsSelectLayer(f.pid, f.sid, 1); await wait(450);
    const acc = $('#fs-props .lfx-acc[data-sec="op"]'); if (acc && !acc.classList.contains('open')) { _lfxToggleSec('op'); await wait(300); } if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const fad = $('#fs-props input[type=range].lfx-op256'); if (!fad) { closeFullscreen(); return 'no Opacity fader'; } const before = _uaSnap(), n0 = _uaLen(); const r = fad.getBoundingClientRect();
    _uaPtr(fad, 'pointerdown', r.left + 100, r.top + 5); if (fad.getAttribute('onpointerdown')) { /* inline handler ran with the event above */ }
    fad.value = '128'; fire(fad, 'input'); await wait(60); const alive = fad.isConnected; fad.value = '96'; fire(fad, 'input'); fire(fad, 'change'); _uaPtr(window, 'pointerup', r.left + 60, r.top + 5); await wait(450);
    const op = getLayerFx(f.pid, f.sid, 1).op; const step = alive ? await _uaOneStep(before, n0, 'fader') : 'skipped'; closeFullscreen(); await wait(300); await restore();
    return alive ? (step === true ? is(op, 96, 'opacity after the second move') : step) : 'the panel was rebuilt under the fader on its first move (the fader element was replaced)';
  });
  await check('Show card edit (phone Quick Setup edit): confirming with nothing changed keeps a free layout', async () => {
    await restore(); const p = presets[0], s = screens[1]; setPosition(p, s.id, 2500, 300); const want = JSON.stringify(p.positions);
    openQSEdit(); await wait(450); confirmQSEdit(); await wait(450); okDialogs(); try { closeQS(); } catch (e) {} await wait(250);
    const out = is(JSON.stringify(presets[0].positions), want, 'positions after an unchanged Show card edit'); await restore(); return out;
  });

// ─────────────────────────────────────────────── BLOCK B ───────────────────────────────────────────────────────────
  // ── undo 16ks: Undo / Redo restore DATA only, the view stays where the user is ──────────────────────────────────
  await _udHome();
  // the user's view, read the way Save reads it (the phone keeps the real Wire view behind a toJSON)
  const _udView = () => { const w = JSON.parse(JSON.stringify(wireSettings)); return JSON.stringify([w.wireView, w.zoom, w.tool, w.panes, w.rpanes, w.panelCollapse, wireAdvanced._activePageId, ioAdvanced.view, ioAdvanced.page, presets.filter(p => p.minimized).map(p => p.id)]); };
  const _udWireAdv = async () => { if (getComputedStyle($('#wire-overlay')).display !== 'flex') { openWireMode(); await wait(500); } if (wireSettings.wireView !== 'advanced') { _wireSwitchToAdvanced(); await wait(350); if (dlgOpen()) { $('#dlg-confirm').click(); await wait(700); } } okDialogs(); };
  const _udIoAdv = async () => { if (!$('#sys-overlay').classList.contains('open')) { openSystem(); await wait(600); } if (ioAdvanced.view !== 'advanced') { _ioSetView('advanced'); await wait(700); } okDialogs(); await wait(200); };
  const _udMark = () => { _recomputeDirty(); return eval('_isDirty'); };
  await check('undo: a Simple / Advanced switch in Wire or I/O Patch is not an undo step and keeps Redo; only the first switch, the one that builds page 1, is a step', async () => {
    await _udHome(); const f = firstLayer(); const out = [];
    openWireMode(); await wait(500); let n = _undoStack.length; await _udWireAdv(); out.push(_undoStack.length - n);                       // Wire: first switch builds page 1
    pushUndo(); setL(f.pid, f.sid, 1, 'CLOCK'); scheduleRender(); await wait(150); doUndo(); await wait(250); n = _undoStack.length; let r = _redoStack.length;
    _wireSwitchToSimple(); await wait(400); _wireSwitchToAdvanced(); await wait(500); okDialogs(); await wait(200); out.push(_undoStack.length - n, _redoStack.length === r && r > 0);
    closeWireMode(); await wait(300); openSystem(); await wait(600); if (ioAdvanced.view !== 'simple') { _ioSetView('simple'); await wait(300); }
    n = _undoStack.length; _ioSetView('advanced'); await wait(700); okDialogs(); out.push(_undoStack.length - n);                                // I/O Patch: first switch builds page 1
    pushUndo(); setL(f.pid, f.sid, 1, 'TIMER'); scheduleRender(); await wait(150); doUndo(); await wait(250); n = _undoStack.length; r = _redoStack.length;
    _ioSetView('simple'); await wait(400); _ioSetView('advanced'); await wait(500); okDialogs(); await wait(200); out.push(_undoStack.length - n, _redoStack.length === r && r > 0);
    await _udHome();
    return is(out, [1, 0, true, 1, 0, true], 'Wire first switch / later switches / Redo kept / I/O first switch / later switches / Redo kept');
  });
  await check('undo: Undo and Redo never change the view: Wire stays in Advanced on page 2 at 150 % with the Hand tool and a folded pane, I/O Patch stays in Advanced on page 2, a folded preset stays folded', async () => {
    await _udHome(); const f = firstLayer(); const was = getL(f.pid, f.sid, 1);
    pushUndo(); setL(f.pid, f.sid, 1, 'CLOCK'); scheduleRender(); await wait(200);                  // a data step recorded in the default view
    await _udWireAdv(); _wireSwitchPage(wireAdvanced._pages[1].id); _wireSetZoom(1.5); _wireSetTool('hand'); _wireTogglePane('src'); await wait(300); closeWireMode(); await wait(300);
    await _udIoAdv(); _ioSetPage(1); await wait(300); closeSystem(); await wait(300);
    actions.toggleMinimize(presets[2].id); await wait(250);
    const v0 = _udView(), views = []; let presses = 0;
    while (_undoStack.length && presses < 8) { doUndo(); await wait(300); presses++; views.push(_udView() === v0); }
    const back = getL(f.pid, f.sid, 1); while (_redoStack.length && presses < 16) { doRedo(); await wait(300); presses++; views.push(_udView() === v0); }
    const again = getL(f.pid, f.sid, 1), wantView = JSON.parse(v0); _wireSetTool('select'); await _udHome();
    return is([back, again, views.every(Boolean), wantView[0], wantView[1], wantView[6] !== 'p0', wantView[7], wantView[8]], [was, 'CLOCK', true, 'advanced', 1.5, true, 'advanced', 1], 'layer after Undo to the bottom / after Redo to the top / view identical after every press / the view it held');
  });
  await check('undo: closing a page that holds something, in Wire and in I/O Patch: Undo brings the page back and leaves you where you are; Redo closes it again and lands on a page that exists', async () => {
    await _udHome(); await _udWireAdv(); const out = []; const p1 = wireAdvanced._pages[1].id;
    _wireSwitchPage(p1); await wait(300); _wireAdvAddRouter(4); await wait(500); okDialogs(); await wait(200);                           // page 2 holds a router: closing it is a real change and asks first
    _wireClosePage(p1); await wait(400); const asked = /Close /.test(dialogText()); okDialogs(); await wait(400); const afterClose = wireAdvanced._activePageId;
    doUndo(); await wait(400); out.push(asked, wireAdvanced._activePageId === afterClose, wireAdvanced._pages.some(x => x.id === p1));           // page 2 is back, the user stays on page 1
    _wireSwitchPage(p1); await wait(300); const routerBack = wireAdvanced.routers.length; doRedo(); await wait(400); out.push(routerBack, wireAdvanced._pages.some(x => x.id === wireAdvanced._activePageId), wireAdvanced._pages.some(x => x.id === p1), !!$('#wire-page-tabs button, #wire-tabs button'));
    closeWireMode(); await wait(300); await _udIoAdv();
    ioAdvanced.pages[1].sources[0].name = 'UD ROW'; _ioSetPage(1); await wait(300); const uid = ioAdvanced.pages[1].uid; _ioClosePage(1); await wait(400); okDialogs(); await wait(400);
    doUndo(); await wait(400); out.push(ioAdvanced.page, ioAdvanced.pages.some(x => x.uid === uid));                                   // page 2 is back, the user stays on page 1
    _ioSetPage(ioAdvanced.pages.findIndex(x => x.uid === uid)); await wait(300); doRedo(); await wait(400); out.push(ioAdvanced.page, ioAdvanced.pages.some(x => x.uid === uid), ioAdvanced.view);
    await _udHome();
    return is(out, [true, true, true, 1, true, false, true, 0, true, 0, false, 'advanced'], 'Wire: asked first / tab unchanged by Undo / page back / its router back / Redo lands on a page that exists / page gone / tabs drawn; I/O: tab after Undo / page back / tab after Redo / page gone / still Advanced');
  });
  await check('undo: Undo on a Wire Advanced page whose tiles the Undo removes leaves you on that page, empty, at your zoom', async () => {
    await _udHome(); await _udWireAdv(); const p1 = wireAdvanced._pages[1].id; _wireSwitchPage(p1); await wait(300); _wireSetZoom(1); await wait(200);
    _wireAdvAddRouter(4); await wait(500); okDialogs(); const added = wireAdvanced.routers.length; _wireSetZoom(1.5); await wait(300);
    doUndo(); await wait(500); const out = [added, wireAdvanced._activePageId === p1, wireAdvanced.routers.length, wireSettings.zoom, wireSettings.wireView, $$('#wire-diagram .wire-router, #wire-diagram [data-node-id^="router:"]').length];
    doRedo(); await wait(400); out.push(wireAdvanced.routers.length, wireSettings.zoom); await _udHome();
    return is(out, [1, true, 0, 1.5, 'advanced', 0, 1, 1.5], 'router added / still on page 2 / routers after Undo / zoom / view / router tiles drawn / routers after Redo / zoom');
  });
  await check('undo: Undo back to the saved show from Wire Advanced page 2 leaves you on page 2 and turns the unsaved mark off; Redo lights it again, still on page 2', async () => {
    await _udHome(); await _udWireAdv(); await wait(300); const clean0 = _udMark(); const p0 = wireAdvanced._pages[0].id, p1 = wireAdvanced._pages[1].id;
    if (wireAdvanced._activePageId !== p0) { _wireSwitchPage(p0); await wait(300); } const hub = wireAdvanced.routers[0]; if (!hub) { await _udHome(); return 'page 1 has no switcher tile'; } const x0 = hub.x;
    pushUndo(); hub.x = x0 + 40; _wireRender(); await wait(250); const lit = _udMark();                                     // a real edit on page 1
    _wireSwitchPage(p1); await wait(350); doUndo(); await wait(450);
    const at = wireAdvanced._activePageId === p1, xBack = (((wireAdvanced._pageData || {})[p0] || {}).routers || [{}])[0].x === x0, off = _udMark();
    doRedo(); await wait(450); const at2 = wireAdvanced._activePageId === p1, on = _udMark(); await _udHome();
    return is([clean0, lit, at, xBack, off, at2, on], [false, true, true, true, false, true, true], 'unsaved after the first look / after the edit / still on page 2 after Undo / the page-1 tile is back where it was / unsaved after Undo / still on page 2 after Redo / unsaved after Redo');
  });
  await check('undo: an empty step recorded on one Wire Advanced page is still recognised as empty from another page (steps are compared blind to the open tab); a real step recorded there is kept and still undoes', async () => {
    await _udHome(); await _udWireAdv(); await wait(300); const p0 = wireAdvanced._pages[0].id, p1 = wireAdvanced._pages[1].id; if (wireAdvanced._activePageId !== p0) { _wireSwitchPage(p0); await wait(300); }
    await _udClick(document.body, 300); const n0 = _undoStack.length;
    pushUndo(); _wireSwitchPage(p1); await wait(300); await _udClick(document.body, 300); const emptyLeft = _undoStack.length - n0;          // recorded on page 1, nothing changed, looked at from page 2
    _wireSwitchPage(p0); await wait(300); const hub = wireAdvanced.routers[0]; if (!hub) { await _udHome(); return 'page 1 has no switcher tile'; } const x0 = hub.x;
    pushUndo(); hub.x = x0 + 40; _wireRender(); await wait(200); _wireSwitchPage(p1); await wait(300); await _udClick(document.body, 300); const realLeft = _undoStack.length - n0, lit = _udLit()[0];
    doUndo(); await wait(400); const back = (((wireAdvanced._pageData || {})[p0] || {}).routers || [{}])[0].x === x0, at = wireAdvanced._activePageId === p1; await _udHome();
    return is([emptyLeft, realLeft, lit, back, at], [0, 1, true, true, true], 'empty step left after looking from page 2 / real step left / Undo lit / ONE Undo from page 2 puts the page-1 tile back / still on page 2');
  });
  await check('undo: the x on an empty spare page tab (Wire Advanced page 3 and page 2, I/O Patch Advanced last page) only opens the tab in front: no undo step, nothing in the show changes, Redo is kept', async () => {
    await _udHome(); const f = firstLayer(); await _udIoAdv(); closeSystem(); await wait(300); await _udWireAdv(); const out = []; const pagesOf = () => JSON.stringify([wireAdvanced._pages, ioAdvanced.pages]);   // both page 1s are built first: building one is a real step and would clear Redo
    pushUndo(); setL(f.pid, f.sid, 1, 'CLOCK'); scheduleRender(); await wait(150); doUndo(); await wait(250);                          // something to Redo
    for (const k of [2, 1]) {
      const pg = wireAdvanced._pages[k], front = wireAdvanced._pages[k - 1].id; _wireSwitchPage(pg.id); await wait(350); const n = _undoStack.length, r = _redoStack.length, before = pagesOf();
      const x = $('#wire-overlay [onclick*="_wireClosePage(\'' + pg.id + '\')"]'); if (!x) { await _udHome(); return 'no x on Wire page ' + (k + 1); } await _udClick(x, 500); const asked = dlgOpen(); okDialogs(); await wait(300);
      out.push([asked, _undoStack.length - n, _redoStack.length - r, pagesOf() === before, wireAdvanced._activePageId === front]);
    }
    closeWireMode(); await wait(300); await _udIoAdv(); const last = ioAdvanced.pages.length - 1; _ioSetPage(last); await wait(350); const n = _undoStack.length, r = _redoStack.length, before = pagesOf();
    const ix = $('#sys-overlay [onclick*="_ioClosePage(' + last + ')"]'); if (!ix) { await _udHome(); return 'no x on the last I/O page'; } await _udClick(ix, 500); const asked = dlgOpen(); okDialogs(); await wait(300);
    out.push([asked, _undoStack.length - n, _redoStack.length - r, pagesOf() === before, ioAdvanced.page === last - 1]);
    doRedo(); await wait(300); out.push(getL(f.pid, f.sid, 1)); await _udHome();
    const want = [false, 0, 0, true, true];
    return is(out, [want, want, want, 'CLOCK'], 'Wire page 3, Wire page 2, I/O last page: [asked / undo steps added / Redo steps lost / pages unchanged / the tab in front is open]; then Redo still brings the layer change back');
  });
  await check('undo: a picture imported on the Advanced page is ONE undo step of its own, recorded when the picture lands: Undo takes back the picture and nothing else; a file that cannot be read leaves no step', async () => {
    await _udHome(); const f = firstLayer(); const was = getL(f.pid, f.sid, 1);
    pushUndo(); setL(f.pid, f.sid, 1, 'CLOCK'); scheduleRender(); await wait(150);                                                    // the action before the import
    openFullscreen(presets[0].id); await wait(700);
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 18; cv.getContext('2d').fillRect(0, 0, 32, 18); const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const good = new File([blob], 'UD PIC.png', { type: 'image/png' }), bad = new File(['not a picture'], 'UD BAD.png', { type: 'image/png' });
    // what the hidden file input does when the user has picked a file: its change event (a gesture of its own for the undo safety net); the OS file window is never opened
    const pick = async file => { let inp = $('#fs-media-file'); if (!inp) { const c = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function () {}; try { _fsPickMedia(); } finally { HTMLInputElement.prototype.click = c; } inp = $('#fs-media-file'); }
      const dt = new DataTransfer(); dt.items.add(file); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); await wait(300); for (let i = 0; i < 40 && $('#fs-source-list.fs-importing'); i++) await wait(100); await wait(500); };
    const n0 = _undoStack.length, lib0 = customLibrary.length; const warn = console.warn; console.warn = function () {};
    try { await pick(bad); } finally { console.warn = warn; } const afterBad = [_undoStack.length - n0, customLibrary.length - lib0];
    await pick(good); const afterGood = [_undoStack.length - n0, customLibrary.length - lib0, customLibrary.some(c => c.l === 'UD PIC')];
    doUndo(); await wait(400); const one = [customLibrary.length - lib0, getL(f.pid, f.sid, 1)];
    doUndo(); await wait(400); const two = getL(f.pid, f.sid, 1);
    try { await _mdbDel('UD PIC'); } catch (e) {} try { closeFullscreen(); } catch (e) {} await wait(300); await _udHome();
    return is([afterBad, afterGood, one, two], [[0, 0], [1, 1, true], [0, 'CLOCK'], was], 'after the unreadable file: [undo steps, library entries] / after the picture: [undo steps, library entries, it is in the library] / after ONE Undo: [library entries, the layer changed before the import] / after a second Undo: that layer');
  });

  try { _fsPauseAll(); } catch (e) {} $$('video').forEach(v => { try { v.muted = true; v.pause(); } catch (e) {} });
  return { checks };
})

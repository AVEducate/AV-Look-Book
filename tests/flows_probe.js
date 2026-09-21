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
  await check('Simple: Destination Properties Apply is one undo step, Undo brings back size, position and rotation together and nothing older', async () => {
    const p = presets[1].id, sid = screens[0].id; const S = () => screens.find(x => x.id === sid), P = () => presets.find(x => x.id === p);
    pushUndo(); setL(p, sid, 2, 'CLOCK'); scheduleRender(); await wait(200);   // an older edit that Undo must NOT touch
    openScreenPanel(fakeEv, p, sid); await wait(400); const pop = $('#screen-panel'); if (!pop) return 'Destination Properties did not open';
    const n = _undoStack.length; $('#sp-w', pop).value = '2000'; $('#sp-h', pop).value = '1200'; $('#sp-x', pop).value = '40'; $('#sp-rot', pop).value = '90';
    $('#sp-apply', pop).click(); await wait(400); okDialogs(); await wait(300);
    const applied = [parseInt(S().w), parseInt(S().h), getRotation(p, sid)], steps = _undoStack.length - n;
    doUndo(); await wait(300); const back = [parseInt(S().w), parseInt(S().h), (P().positions[sid] || {}).x, getRotation(p, sid), getL(p, sid, 2)];
    const out = is([applied, steps, back], [[2000, 1200, 90], 1, [1920, 1080, 0, 0, 'CLOCK']], 'applied / undo steps / after one Undo'); await restore(); return out;
  });
  await check('Simple: Destination Properties copies and pastes Size, Position and Rotation between destinations and presets, resets them, shows the aspect ratio', async () => {
    const a = { p: presets[1].id, s: screens[1].id }, b = { p: presets[2].id, s: screens[0].id }; const S = () => screens.find(x => x.id === b.s), P = () => presets.find(x => x.id === b.p);
    openScreenPanel(fakeEv, a.p, a.s); await wait(400); let pop = $('#screen-panel'); if (!pop) return 'Destination Properties did not open';
    const tool = (key, act) => $('[data-sp-key="' + key + '"][data-sp-tool="' + act + '"]', pop); if (!tool('size', 'copy') || !tool('pos', 'paste') || !tool('rot', 'reset')) { closeScreenPanel(); return 'no copy / paste / reset tools in Destination Properties'; }
    const asp = [($('#sp-aspect', pop) || {}).textContent]; $('#sp-w', pop).value = '3840'; fire($('#sp-w', pop), 'input'); asp.push($('#sp-aspect', pop).textContent);
    $('#sp-w', pop).value = '1280'; $('#sp-h', pop).value = '720'; $('#sp-x', pop).value = '300'; $('#sp-y', pop).value = '20'; $('#sp-rot', pop).value = '180';   // copy takes what the window shows
    tool('size', 'copy').click(); tool('pos', 'copy').click(); tool('rot', 'copy').click(); closeScreenPanel(); await wait(150);
    const before = JSON.stringify([S().w, S().h, P().positions[b.s], getRotation(b.p, b.s)]);
    openScreenPanel(fakeEv, b.p, b.s); await wait(400); pop = $('#screen-panel'); const n = _undoStack.length;
    tool('size', 'paste').click(); await wait(150); const s1 = _undoStack.length - n; tool('pos', 'paste').click(); await wait(150); const s2 = _undoStack.length - n; tool('rot', 'paste').click(); await wait(150); const s3 = _undoStack.length - n;
    const pasted = [parseInt(S().w), parseInt(S().h), P().positions[b.s].x, P().positions[b.s].y, getRotation(b.p, b.s)], fields = [$('#sp-w', pop).value, $('#sp-x', pop).value, $('#sp-rot', pop).value];
    tool('size', 'reset').click(); await wait(150); tool('pos', 'reset').click(); await wait(150); tool('rot', 'reset').click(); await wait(250);
    const after = JSON.stringify([S().w, S().h, P().positions[b.s], getRotation(b.p, b.s)]); closeScreenPanel();
    const out = is([asp, pasted, fields, [s1, s2, s3], after === before, _undoStack.length - n], [['Aspect 16:9', 'Aspect 32:9'], [1280, 720, 300, 20, 180], ['1280', '300', '180'], [1, 2, 3], true, 6], 'aspect / pasted / fields follow / one undo step per paste / reset returns to as-opened / six steps in all');
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
    actions.addDestination(); await wait(400); esc($('#ms-n')); await wait(400); const afterWindow = [getComputedStyle($('#modal')).display === 'none' || !$('#modal').classList.contains('show'), open()];
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
    await ioPick($('[data-sys-field="resolution"]', ioRow(n)), /^Custom resolution/); ioEsc($('#sys-cf-w')); await wait(200); out.push(!$('#sys-cf-overlay'), open()); if (!open()) { openSystem(); await wait(400); }
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
    // Advanced: the Add Destination window (focus sits in its Name field)
    openFullscreen(presets[1].id); await wait(600); actions.addDestination(); await wait(300); esc(); await wait(300);
    const a = [!$('#modal').classList.contains('show'), !!fsPresetId];
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
  await check('Advanced overlays menu (status bar) closes on a click on a layer chip, and its button still toggles it', async () => {
    const btn = $('#tb-adv'), menu = $('#adv-menu'); btn.click(); await wait(250); const opened = menu.classList.contains('open'); const chip = $('.preset-row .layer-chip'); if (!chip) { closeAdvancedMenu(); return 'no layer chip on the canvas'; }
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
  try { _fsPauseAll(); } catch (e) {} $$('video').forEach(v => { try { v.muted = true; v.pause(); } catch (e) {} });
  return { checks };
})

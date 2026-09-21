// AV Look Book — phone probe. Runs INSIDE the app page, in a page that was LOADED with phone emulation
// (tests/run_mobile_stage.mjs: 390x844 mobile:true, touch, a phone user agent, window.LB_FORCE_MOBILE=true before boot).
// Same rules as tests/flows_probe.js: it DRIVES the phone build the way a finger does and asserts what happens. Every
// check is {name, ok, detail?}; detail only appears on a failure so the golden stays stable. A check that fails at the
// trusted version is a KNOWN ISSUE (ok:false in the golden) and the gate reports it every run; a check that changes
// state between golden and now fails the gate.
// Taps that matter are REAL touch events: the probe asks the runner for them through window.lbRunner (a DevTools
// binding), after checking that the control is really the top element under the finger, so a control buried under
// another layer fails here the way it fails on a phone. The runner also rotates the phone and answers the file picker.
// Budgets are counts, not pass / fail: tap targets under 44 px and texts under 11 px on each screen. The runner fails
// the gate only when a count RISES. Add a check here whenever phone behaviour ships or a phone bug is fixed.
(async function lbMobileProbe(cfg){
  // deterministic run: ids and first-draw cable colours come from Math.random
  (function () { let a = 0x9e3779b9; Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  cfg = cfg || {}; const PORTRAIT = cfg.portrait || [390, 844], LANDSCAPE = cfg.landscape || [844, 390];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms) => { const t = Date.now(); for (;;) { let v = false; try { v = fn(); } catch (e) {} if (v) return true; if (Date.now() - t > (ms || 1500)) return false; await wait(50); } };
  const checks = [], budgets = {};
  const check = async (name, fn) => {
    try { const r = await fn(); checks.push(r === true ? { name, ok: true } : { name, ok: false, detail: String(r) }); }
    catch (e) { checks.push({ name, ok: false, detail: 'threw: ' + String((e && e.message) || e) }); }
  };
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const vis = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  const shown = el => { try { if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false; } catch (e) {} const r = el.getBoundingClientRect(); return r.width > 0.5 && r.height > 0.5; };
  const is = (got, want, label) => JSON.stringify(got) === JSON.stringify(want) ? true : (label + ': expected ' + JSON.stringify(want) + ', got ' + JSON.stringify(got));
  const desc = el => { if (!el) return 'nothing'; let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; const c = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.'); return c ? s + '.' + c : s; };
  const txt = el => (el ? el.textContent || '' : '').replace(/\s+/g, ' ').trim();
  const R = n => Math.round(n);
  // the app has ONE dialog (#dlg-overlay, shown with the class 'show'); answer it the way a user would, never remove it
  const dlgOpen = () => { const o = $('#dlg-overlay'); return !!o && o.classList.contains('show') && getComputedStyle(o).display !== 'none'; };
  const dialogText = () => dlgOpen() ? txt($('#dlg-box')) : '';
  const okDialogs = () => { for (let i = 0; i < 4 && dlgOpen(); i++) { const b = $('#dlg-confirm'); if (b) b.click(); else break; } };
  // downloads and mail never leave the page during a test
  const downloads = []; window.dl = function (blob, name) { downloads.push({ name: String(name), size: (blob && blob.size) || 0 }); };
  window._lbOpenMail = function () {};

  // ── the runner's hands ──────────────────────────────────────────────────────────────────────────────────────────
  let seq = 0; const pend = {}; const hasRunner = typeof window.lbRunner === 'function';
  window.__lbRunnerDone = (id, result, error) => { const f = pend[id]; delete pend[id]; if (f) f(error ? { error: error } : result); };
  const runner = (op, args) => new Promise(res => { if (!hasRunner) return res({ error: 'no runner' }); const id = ++seq; pend[id] = res; setTimeout(() => { if (pend[id]) { delete pend[id]; res({ error: 'the runner did not answer "' + op + '" within 10 s' }); } }, 10000); window.lbRunner(JSON.stringify({ id, op, args: args || {} })); });
  const section = s => runner('where', { text: 'mobile: ' + s });
  // where a finger would land on el, or a sentence saying why it cannot: off screen, or another element is on top
  const aim = async (el, block) => {
    if (!el) return 'the control is not there';
    el.scrollIntoView({ block: block || 'center', inline: 'nearest' });
    let last = null; for (let i = 0; i < 20; i++) { await wait(60); const b = el.getBoundingClientRect(); const k = R(b.left) + ',' + R(b.top); if (k === last) break; last = k; }   // let a smooth scroll settle
    const b = el.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2;
    if (b.width < 1 || b.height < 1) return desc(el) + ' has no size on screen';
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return desc(el) + ' is off screen at ' + R(x) + ',' + R(y) + ' (the phone is ' + innerWidth + 'x' + innerHeight + ')';
    const top = document.elementFromPoint(x, y);
    if (!top || !(top === el || el.contains(top) || top.contains(el))) return desc(el) + ' is covered by ' + desc(top) + ' at ' + R(x) + ',' + R(y);
    return { x, y };
  };
  const tap = async (el, block) => { const p = await aim(el, block); if (typeof p === 'string') return p; if (!hasRunner) { el.click(); await wait(300); return true; } const r = await runner('tap', p); await wait(300); return r && r.error ? 'the tap failed: ' + r.error : true; };
  const rotate = async wh => { await runner('size', { w: wh[0], h: wh[1] }); await until(() => innerWidth === wh[0], 2500); await wait(600); };

  // ── measuring ───────────────────────────────────────────────────────────────────────────────────────────────────
  const userScrollsX = el => { for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) { if (/(auto|scroll)/.test(getComputedStyle(p).overflowX) && p.scrollWidth > p.clientWidth + 2) return p; } return null; };
  const clippedAway = el => { const r = el.getBoundingClientRect(); for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (/(hidden|clip)/.test(cs.overflowX + cs.overflowY)) { const pr = p.getBoundingClientRect(); if (r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom) return true; } } return false; };
  const TAPPABLE = 'button,a[href],input,select,textarea,[onclick],[role="button"],.clickable,.sys-dd-item,summary';
  // budgets: what a thumb and an eye meet on this screen. Recorded, and compared by the runner (a count may only fall).
  const budget = (key, scopes) => {
    const seen = new Set(); let smallTaps = 0, smallText = 0;
    scopes.map(s => $(s)).filter(Boolean).forEach(root => [root].concat($$('*', root)).forEach(el => {
      if (seen.has(el)) return; seen.add(el);
      if (/^(SCRIPT|STYLE|TEMPLATE|OPTION)$/.test(el.tagName) || el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg') return;
      if (!shown(el) || clippedAway(el)) return;
      if (el.matches(TAPPABLE) && !el.disabled && getComputedStyle(el).pointerEvents !== 'none') { const r = el.getBoundingClientRect(); if (r.width < 44 || r.height < 44) smallTaps++; }
      let own = ''; if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) own = el.value || el.placeholder || ''; else el.childNodes.forEach(n => { if (n.nodeType === 3) own += n.nodeValue; });
      if (own.replace(/\s+/g, '').length && parseFloat(getComputedStyle(el).fontSize) < 11) smallText++;
    }));
    budgets[key] = { smallTaps, smallText };
  };
  // sideways page scroll, noted on every screen and asserted once per orientation at the end
  const side = { portrait: [], landscape: [] }, sideSeen = { portrait: [], landscape: [] };
  const noteSide = screen => { const o = innerWidth > innerHeight ? 'landscape' : 'portrait'; sideSeen[o].push(screen); const de = document.documentElement; const w = Math.max(de.scrollWidth, document.body.scrollWidth); if (w > innerWidth) side[o].push(screen + ' (' + w + ' px wide in a ' + innerWidth + ' px phone)'); };
  // a modal fits when its box is inside the phone, a box taller than the phone can be scrolled, and no control is cut off sideways
  const fits = (box, opts) => {
    opts = opts || {}; if (!box || !vis(box)) return 'the window is not open';
    const b = box.getBoundingClientRect(); const bad = [];
    if (b.left < -1 || b.right > innerWidth + 1) bad.push('the box spans ' + R(b.left) + '…' + R(b.right) + ' in a ' + innerWidth + ' px phone');
    if (b.height > innerHeight + 1) { let sc = false; for (let p = box; p && p !== document.documentElement; p = p.parentElement) { if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) { sc = true; break; } } if (!sc) bad.push('the box is ' + R(b.height) + ' px tall and cannot be scrolled'); }
    $$(TAPPABLE, box).filter(el => shown(el) && !(opts.skip && el.matches(opts.skip))).forEach(el => {
      if (userScrollsX(el)) return; const r = el.getBoundingClientRect(); let lim = { l: 0, r: innerWidth, by: 'the phone' };
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { if (/(hidden|clip)/.test(getComputedStyle(p).overflowX)) { const pr = p.getBoundingClientRect(); if (pr.right < lim.r) lim = { l: lim.l, r: pr.right, by: desc(p) }; if (pr.left > lim.l) lim.l = pr.left; } }
      if (r.right > lim.r + 1 || r.left < lim.l - 1) bad.push(desc(el) + ' "' + txt(el).slice(0, 20) + '" spans ' + R(r.left) + '…' + R(r.right) + ', cut at ' + R(lim.r) + ' by ' + lim.by);
    });
    return bad.length ? bad.slice(0, 4).join('; ') : true;
  };
  // a floating desktop panel on a phone is a bug: every docked panel carries .mb-inline-panel
  const floated = []; const notePanels = when => ['layer-panel', 'screen-panel', 'dsm-panel'].forEach(id => { const p = document.getElementById(id); if (p && !p.classList.contains('mb-inline-panel')) floated.push('#' + id + ' floating ' + when); });

  // ── the model, read the way the phone views should show it ──────────────────────────────────────────────────────
  const layerNums = (pid, sid) => getLayerNums(pid).filter(n => getL(pid, sid, n));
  const modelCards = () => presets.map(p => [p.code || '', p.name || '', 'Dest ' + screens.length, 'AUX ' + dsms.length, 'Outs ' + (screens.length + dsms.length), 'Layers ' + screens.reduce((a, s) => a + layerNums(p.id, s.id).length, 0)].join(' | '));
  const domCards = () => $$('#mobile-main .mb-preset-card').map(c => [txt($('.mb-preset-pcode', c)), $('.mb-preset-name', c).value].concat($$('.mb-bb-cell', c).map(x => txt($('.mb-bb-label', x)) + ' ' + txt($('strong', x)))).join(' | '));
  const modelRows = p => {
    const rows = [];
    screens.forEach(s => { const n = layerNums(p.id, s.id).length; rows.push('d | ' + getScreenName(p.id, s.id) + ' | ' + s.w + '×' + s.h + ' | ' + (n ? n + (n === 1 ? ' layer' : ' layers') : 'No layers assigned')); });
    screens.forEach((s, i) => layerNums(p.id, s.id).forEach(n => { const z = getLayerSize(p.id, s.id, n); rows.push('L | D' + (i + 1) + '·L' + n + ' | ' + ((z && z.name) || getL(p.id, s.id, n))); }));
    dsms.forEach(d => rows.push('a | ' + getDSMName(p.id, d.id) + ' | ' + d.w + '×' + d.h + ' | ' + (getDSMContent(p.id, d.id) || 'No content')));
    return rows;
  };
  const domRows = () => $$('#mobile-main .mb-le-row').map(r => { const k = r.dataset.key || ''; const name = txt($('.mb-le-name', r));
    if (k[0] === 'L') return 'L | ' + txt($('.mb-le-icon.layer', r)) + ' | ' + name;
    return k[0] + ' | ' + name + ' | ' + txt($('.mb-le-res', r)) + ' | ' + txt($('.mb-le-sum', r)); });
  const modelChip = (p, s, n) => { const z = getLayerSize(p.id, s.id, n), wf = z ? z.wf : 0.5, hf = z ? z.hf : 0.5, cr = getCrop(p.id, s.id, n) || {}; const lw = R(parseInt(s.w) * wf), lh = R(parseInt(s.h) * hf);
    return Math.max(0, lw - R(lw * (cr.l || 0) / 100) - R(lw * (cr.r || 0) / 100)) + 'x' + Math.max(0, lh - R(lh * (cr.t || 0) / 100) - R(lh * (cr.b || 0) / 100)); };
  const modelChips = p => { const o = []; screens.forEach(s => layerNums(p.id, s.id).forEach(n => o.push(s.id + ':' + n + ' ' + modelChip(p, s, n)))); return o.sort(); };
  const domChips = () => $$('#mobile-main .mb-vis .layer-chip[data-sid][data-lid]').map(c => c.dataset.sid + ':' + c.dataset.lid + ' ' + txt($('.chip-res', c))).sort();
  const chipOf = (sid, n) => $('#mobile-main .mb-vis .layer-chip[data-sid="' + sid + '"][data-lid="' + n + '"]');
  // the visualiser fits when its last destination ends inside the box and the box has nothing to scroll sideways
  const visFit = () => { const v = $('#mobile-main .mb-vis'); if (!v) return 'no visualiser'; v.scrollLeft = 0; const vr = v.getBoundingClientRect(); const boxes = $$('.screen-box', v); if (!boxes.length) return 'no destinations drawn';
    const right = Math.max.apply(null, boxes.map(b => b.getBoundingClientRect().right)); const bad = [];
    if (right > vr.right + 0.5) bad.push('the last destination ends at ' + R(right) + ' px, the box ends at ' + R(vr.right) + ' px (' + R(right - vr.right) + ' px cut off)');
    if (v.scrollWidth > v.clientWidth + 1) bad.push('the box scrolls sideways (' + v.scrollWidth + ' px of picture in ' + v.clientWidth + ' px)');
    return bad.length ? bad.join('; ') : true; };
  // a point of a wall that a finger can reach: inside the visualiser box, on the wall itself and not on a layer chip lying on it
  const wallSpot = () => { const v = $('#mobile-main .mb-vis'); if (!v) return null; v.scrollLeft = 0; const vr = v.getBoundingClientRect();
    for (const box of $$('.screen-box[data-sid]', v)) { const r = box.getBoundingClientRect(); for (const fy of [0.12, 0.3, 0.5, 0.7, 0.88]) for (const fx of [0.5, 0.2, 0.8]) { const x = r.left + r.width * fx, y = r.top + r.height * fy; if (x < vr.left || x > vr.right) continue; const top = document.elementFromPoint(x, y); if (top && box.contains(top) && !top.closest('.layer-chip') && !top.closest('button')) return { x, y, sid: box.dataset.sid }; } }
    return null; };
  const toList = async () => { if ($('#mobile-main .mb-back-btn')) { mobileBackToList(); await wait(300); } };
  const openEdit = async pid => { mobileOpenLayers(pid); await wait(250); };
  const EXAMPLES = [['town-hall', 'Town Hall'], ['awards-night', 'Awards Night'], ['general-session', 'General Session']];

  // ── launch ──────────────────────────────────────────────────────────────────────────────────────────────────────
  await section('launch'); await wait(400);
  const fresh = $$('button').find(b => /start fresh/i.test(b.textContent)); if (fresh) { fresh.click(); await wait(600); }   // a leftover draft (never in the runner's clean profile)
  await check('runner: real touch taps are available (the probe is driven by tests/run_mobile_stage.mjs)', () => hasRunner ? true : 'window.lbRunner is missing: taps fall back to JS clicks, which cannot see a buried control');
  await check('launch: phone mode is on (body.is-mobile, LB_isMobile(), a ' + PORTRAIT.join('x') + ' touch screen)', () => is([document.body.classList.contains('is-mobile'), typeof LB_isMobile === 'function' && LB_isMobile(), innerWidth, innerHeight, navigator.maxTouchPoints > 0], [true, true, PORTRAIT[0], PORTRAIT[1], true], 'phone mode'));
  await check('launch: the empty state shows with its start button and no show is loaded', () => is([vis($('#mobile-main .mb-empty')), vis($('#mobile-main .mb-empty-cta')), screens.length, presets.length, dlgOpen()], [true, true, 0, 0, false], 'empty state / start button / destinations / presets / a dialog'));
  noteSide('launch'); budget('launch', ['#mobile-main', '#topbar-nav-center']);
  await check('launch: a tap on the start button opens Quick Setup with the three example shows', async () => {
    const t = await tap($('#mobile-main .mb-empty-cta')); if (t !== true) return t; await until(() => vis($('#qs-modal')), 1500);
    return is([vis($('#qs-modal')), ($('#qs-modal').innerHTML.match(/lbOpenExample\('/g) || []).length], [true, 3], 'Quick Setup / examples');
  });
  await check('modal: Quick Setup fits the phone and no control is cut off', () => fits($('#qs-modal > div') || $('#qs-modal')));
  noteSide('Quick Setup'); budget('quick-setup', ['#qs-modal']);
  closeQS(); await wait(300);

  // ── Open a show file ────────────────────────────────────────────────────────────────────────────────────────────
  await section('open a show file');
  const findOpen = root => root ? $$('button,[role="button"],label,a', root).find(el => el !== root && shown(el) && /\bopen\b/i.test([typeof el.className === 'string' ? el.className : '', el.getAttribute('aria-label') || '', el.title || '', el.textContent || ''].join(' ')) && !/example/i.test(el.textContent || '')) : null;
  const townHallLoaded = () => $('#show-name').value === 'Town Hall' && screens.length === 2 && presets.length === 5 && dsms.length === 2;
  const pickThrough = async el => { const p = await aim(el); if (typeof p === 'string') return p; const r = await runner('chooseFile', p); if (!r || r.error) return 'the runner could not answer the picker: ' + (r && r.error); if (!r.opened) return 'the tap did not raise the file picker'; await wait(300); okDialogs(); await until(townHallLoaded, 2500); okDialogs(); return true; };
  await check('open: the empty state has an Open-a-show-file control', () => findOpen($('#mobile-main .mb-empty')) ? true : 'the empty state offers only "' + txt($('#mobile-main .mb-empty-cta')) + '": there is no way to open a show file');
  await check('open: a tap on the empty-state Open control raises the file picker and the chosen show loads (Town Hall: 2 destinations, 5 presets, 2 AUX)', async () => {
    const el = findOpen($('#mobile-main .mb-empty')); if (!el) return 'no Open control on the empty state';
    const t = await pickThrough(el); if (t !== true) return t; return is([$('#show-name').value, screens.length, presets.length, dsms.length], ['Town Hall', 2, 5, 2], 'loaded show');
  });
  await check('open: a show file put into the app\'s own file input loads at phone size (Town Hall: 2 destinations, 5 presets, 2 AUX)', async () => {
    newShow(); await wait(400); okDialogs(); await wait(300); closeQS(); await wait(300); if (screens.length || presets.length) return 'New Show did not clear the show';
    const r = await runner('setFiles', { selector: '#load-file-input' }); if (!r || r.error || !r.found) return 'no #load-file-input to put the file into' + (r && r.error ? ' (' + r.error + ')' : '');
    await until(townHallLoaded, 2500); okDialogs(); await wait(300);
    return is([$('#show-name').value, screens.length, presets.length, dsms.length, $$('#mobile-main .mb-preset-card').length], ['Town Hall', 2, 5, 2, 5], 'loaded show / cards');
  });
  await check('open: the Show card has an Open-a-show-file control', () => { const card = $('#mobile-main .mb-guide-card'); if (!card) return 'no Show card'; return findOpen(card) ? true : 'the Show card carries only Send (' + $$('button', card).map(b => b.getAttribute('aria-label') || b.title).join(', ') + ')'; });
  await check('open: a tap on the Show-card Open control raises the file picker and the file replaces the open show', async () => {
    const el = findOpen($('#mobile-main .mb-guide-card')); if (!el) return 'no Open control on the Show card';
    $('#show-name').value = 'CHANGED BY THE TEST'; const t = await pickThrough(el); if (t !== true) return t; return is([$('#show-name').value, screens.length, presets.length], ['Town Hall', 2, 5], 'loaded show');
  });

  // ── the three examples: list, visualiser, accordion, chips ──────────────────────────────────────────────────────
  for (const [id, name] of EXAMPLES) {
    await section('example ' + name);
    await check('example ' + name + ': opens from its dialog, the dialog fits the phone, and the preset list equals the model (codes, names, Dest / AUX / Outs / Layers)', async () => {
      await toList(); lbOpenExample(id); await until(dlgOpen, 1500);
      for (let i = 0; i < 3 && dlgOpen() && !/ is open/.test(dialogText()); i++) { $('#dlg-confirm').click(); await wait(350); }   // "Unsaved changes" comes first when the last show was edited
      const said = dialogText(), fit = fits($('#dlg-box'));
      const t = await tap($('#dlg-confirm')); if (t !== true) return t; await until(() => !dlgOpen(), 1500); await wait(300);
      if (id === 'general-session') { noteSide('example dialog'); }
      return is([said.indexOf(name + ' is open') >= 0, fit, domCards()], [true, true, modelCards()], 'dialog / dialog fits / cards');
    });
    if (id === 'general-session') { noteSide('preset list'); budget('preset-list', ['#mobile-main', '#topbar-nav-center']); }
    const fitBad = [], rowBad = [], chipBad = []; let opened = 0;
    for (const p of presets.slice()) {
      await openEdit(p.id); if (!$('#mobile-main .mb-vis')) { fitBad.push(p.code + ': the edit view did not open'); continue; } opened++;
      const f = visFit(); if (f !== true) fitBad.push(p.code + ': ' + f);
      const r = is(domRows(), modelRows(p), p.code); if (r !== true) rowBad.push(r);
      const c = is(domChips(), modelChips(p), p.code); if (c !== true) chipBad.push(c);
    }
    noteSide('preset edit, ' + name); await toList();
    await check('example ' + name + ': the visualiser fits its box on every preset (last destination inside .mb-vis, no sideways scrollbar)', () => fitBad.length ? fitBad[0] + (fitBad.length > 1 ? ' (and ' + (fitBad.length - 1) + ' more presets)' : '') : (opened === presets.length ? true : 'only ' + opened + ' presets opened'));
    await check('example ' + name + ': the accordion rows equal the model on every preset (destinations, D·L layers, AUX / DSM content)', () => rowBad.length ? rowBad.join(' || ') : (opened ? true : 'no preset opened'));
    await check('example ' + name + ': every chip size in the visualiser equals getLayerSize x destination size', () => chipBad.length ? chipBad.join(' || ') : (opened ? true : 'no preset opened'));
  }

  // ── editing a preset on General Session ─────────────────────────────────────────────────────────────────────────
  await section('preset edit');
  const BASE = JSON.stringify(getProjectState());
  const restore = async () => { try { okDialogs(); if (typeof closeHelp === 'function') closeHelp(); } catch (e) {} try { openVideoPresets(); } catch (e) {} await wait(200); await toList(); _applyProjectText(BASE); await wait(600); okDialogs(); await wait(150); okDialogs(); };
  const P = () => presets[1];                       // P02: one layer on every wall
  const Lsid = () => screens[1].id;                 // the layer used for the size / content checks: P02 · D2 · L1 (LOWER 3RD, 1920x238)
  await check('edit: a tap on a preset\'s pencil opens it with Back, the visualiser and the Destinations / Layers / AUX rows', async () => {
    const t = await tap($$('#mobile-main .mb-preset-card .mb-action-edit')[1]); if (t !== true) return t; await until(() => $('#mobile-main .mb-vis'), 1500);
    return is([vis($('#mobile-main .mb-back-btn')), vis($('#mobile-main .mb-vis')), document.body.classList.contains('mb-layers'), txt($('#mobile-main .mb-detail-pcode')), $$('#mobile-main .mb-le-row[data-key^="d:"]').length, $$('#mobile-main .mb-le-layerrow').length, $$('#mobile-main .mb-le-row[data-key^="a:"]').length],
      [true, true, true, P().code, screens.length, screens.reduce((a, s) => a + layerNums(P().id, s.id).length, 0), dsms.length], 'edit view');
  });
  noteSide('preset edit'); budget('preset-edit', ['#mobile-main']);
  await check('edit: a tap on a wall in the visualiser opens its destination row with the docked Destination panel', async () => {
    const free = wallSpot(); if (!free) return 'no wall in the visualiser has a spot that is not under a layer chip'; const sid = free.sid;
    await runner('tap', { x: free.x, y: free.y }); await until(() => $('#screen-panel'), 1500); await wait(450); notePanels('after a wall tap');
    const row = $('#mobile-main .mb-le-row.open'); const pop = $('#screen-panel');
    return is([window._mbActiveDest, row && row.dataset.key, !!pop && pop.classList.contains('mb-inline-panel'), !!pop && !!pop.closest('.mb-le-panelhost'), window._mbInlinePanelOpen], [sid, 'd:' + sid, true, true, true], 'active wall / open row / docked / in its row / flag');
  });
  budget('destination-panel', ['#mobile-main']); noteSide('destination panel');
  await check('edit: a double tap on a wall never pops a floating desktop panel', async () => {
    const p = wallSpot(); if (!p) return 'no wall in the visualiser has a spot that is not under a layer chip';
    await runner('tap', p); await wait(60); await runner('tap', p); await wait(600); notePanels('after a double tap on a wall');
    const loose = ['layer-panel', 'screen-panel', 'dsm-panel'].filter(id => { const e = document.getElementById(id); return e && !e.classList.contains('mb-inline-panel'); }); return is(loose, [], 'floating panels');
  });
  await check('edit: a tap on a layer chip in the visualiser opens its layer row with the docked Layer panel (Simple)', async () => {
    if (window._mbInlinePanelOpen) { mbCloseInlinePanel(); await wait(250); }
    const chip = chipOf(Lsid(), 1); const t = await tap(chip); if (t !== true) return t; await until(() => $('#layer-panel'), 1500); await wait(450); notePanels('after a chip tap');
    const pop = $('#layer-panel'), row = $('#mobile-main .mb-le-layerrow.open');
    return is([JSON.stringify(window._mbActiveLayer), row && row.dataset.key, !!pop && pop.classList.contains('mb-inline-panel'), !!pop && !!$('.lp-w', pop) && !!$('.lp-apply', pop), !!$('#screen-panel')], [JSON.stringify({ sid: Lsid(), n: 1 }), 'L:' + Lsid() + ':1', true, true, false], 'active layer / open row / docked / Simple size fields / Destination panel left behind');
  });
  budget('layer-panel', ['#mobile-main']); noteSide('layer panel');
  let applied = false;
  await check('layer: Size 960 x 540 + APPLY updates the model and the docked panel stays open', async () => {
    const pop = $('#layer-panel'); if (!pop) return 'the layer panel is not open'; if (($('.lp-name', pop) || {}).value) return 'this layer has a custom name, APPLY would rename it';
    const w = $('.lp-w', pop), h = $('.lp-h', pop); w.value = '960'; h.value = '540';
    const t = await tap($('.lp-apply', pop)); if (t !== true) return t; await wait(500); const z = getLayerSize(P().id, Lsid(), 1) || {}; applied = z.wf === 0.5 && z.hf === 0.5;
    return is([z.wf, z.hf, !!$('#layer-panel'), window._mbInlinePanelOpen], [0.5, 0.5, true, true], 'wf / hf / panel open / flag');
  });
  await check('layer: after APPLY the visualiser shows the new size while the panel is still open (chip reads 960x540)', async () => {
    if (!applied) return 'APPLY did not reach the model'; if (!$('#layer-panel')) return 'the panel closed';
    await wait(300); const c = chipOf(Lsid(), 1); return is([txt($('.chip-res', c)), !!$('#layer-panel')], ['960x540', true], 'chip text / panel open');
  });
  await check('layer: the docked panel header never covers the visualiser while the page scrolls', async () => {
    const host = $('#mobile-main'), pop = $('#layer-panel'); if (!pop) return 'the layer panel is not open'; const hdr = $('.pm-hdr', pop); if (!hdr) return 'the docked panel has no header';
    let hit = null; const max = host.scrollHeight - host.clientHeight;
    for (let st = 0; st <= max && !hit; st += 40) {
      host.scrollTop = st; await wait(40); const v = $('#mobile-main .mb-vis').getBoundingClientRect();
      for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.1, 0.5, 0.9]) { const x = v.left + v.width * fx, y = v.top + v.height * fy; const top = document.elementFromPoint(x, y); if (top && !top.closest('.mb-vis') && top.closest('#layer-panel')) { hit = 'scrolled ' + st + ' px: ' + desc(top.closest('.pm-hdr') || top) + ' is drawn over the visualiser at ' + R(x) + ',' + R(y) + ' (visualiser ' + R(v.top) + '…' + R(v.bottom) + ', panel header ' + R(hdr.getBoundingClientRect().top) + '…' + R(hdr.getBoundingClientRect().bottom) + ')'; break; } if (hit) break; }
    }
    host.scrollTop = 0; await wait(100); return hit || true;
  });
  await check('layer: a content pick in the docked panel writes through to the model, the layer row and the visualiser', async () => {
    const pop = $('#layer-panel'); if (!pop) return 'the layer panel is not open'; const was = getL(P().id, Lsid(), 1);
    const btn = $$('.lp-common-btn', pop).find(b => txt(b) === 'IMAG' && txt(b) !== was) || $$('.lp-common-btn', pop).find(b => txt(b) !== was); const want = txt(btn);
    const t = await tap(btn); if (t !== true) return t; await until(() => getL(P().id, Lsid(), 1) === want, 1500); await wait(400); notePanels('after a content pick');
    const row = $('#mobile-main .mb-le-row[data-key="L:' + Lsid() + ':1"]'), c = chipOf(Lsid(), 1);
    return is([getL(P().id, Lsid(), 1), txt($('.mb-le-name', row)), c ? txt(c).indexOf(want) === 0 : false, c ? txt($('.chip-res', c)) : '', window._mbInlinePanelOpen && !$('#layer-panel')], [want, want, true, modelChip(P(), screens[1], 1), false], 'model / row / chip content / chip size once the panel has closed / stranded flag');
  });
  await check('add: + DEST adds a destination to the model, the accordion and the visualiser', async () => {
    if (window._mbInlinePanelOpen) { mbCloseInlinePanel(); await wait(250); }
    const n = screens.length; const t = await tap($('#mobile-main .mb-le-addbtn.dest:not(.rem)')); if (t !== true) return t; await until(() => screens.length === n + 1, 1500); await wait(300);
    return is([screens.length, $$('#mobile-main .mb-le-row[data-key^="d:"]').length, $$('#mobile-main .mb-vis .screen-box[data-sid]').length, presets.every(p => p.positions && p.positions[screens[n].id])], [n + 1, n + 1, n + 1, true], 'model / rows / walls / a position in every preset');
  });
  await check('visualiser: still fits its box after + DEST (four walls)', () => screens.length === 4 ? visFit() : 'the fourth destination was not added');
  noteSide('preset edit after + DEST');
  await check('remove: − DEST asks to confirm, Cancel keeps the destination, Remove deletes it from every preset', async () => {
    const n = screens.length, sid = screens[n - 1].id; let t = await tap($('#mobile-main .mb-le-addbtn.dest.rem')); if (t !== true) return t; await until(dlgOpen, 1500);
    const asked = /Remove destination\?/.test(dialogText()), fit = fits($('#dlg-box')); t = await tap($('#dlg-cancel')); if (t !== true) return t; await wait(350); const kept = screens.length;
    t = await tap($('#mobile-main .mb-le-addbtn.dest.rem')); if (t !== true) return t; await until(dlgOpen, 1500); t = await tap($('#dlg-confirm')); if (t !== true) return t; await until(() => screens.length === n - 1, 1500); await wait(300);
    return is([asked, fit, kept, screens.length, $$('#mobile-main .mb-le-row[data-key^="d:"]').length, presets.some(p => p.positions && p.positions[sid])], [true, true, n, n - 1, n - 1, false], 'asked / dialog fits / after Cancel / after Remove / rows / left in a preset');
  });
  await check('add: + AUX adds an output that is on in every preset and drawn in the visualiser', async () => {
    const n = dsms.length, drawn = $$('#mobile-main .mb-vis .dsm-box').length; const t = await tap($('#mobile-main .mb-le-addbtn.aux:not(.rem)')); if (t !== true) return t; await until(() => dsms.length === n + 1, 1500); await wait(300); const d = dsms[dsms.length - 1];
    return is([dsms.length, presets.every(p => getDSMOn(p.id, d.id)), $$('#mobile-main .mb-le-row[data-key^="a:"]').length, $$('#mobile-main .mb-vis .dsm-box').length], [n + 1, true, n + 1, drawn + 1], 'model / on everywhere / rows / boxes drawn');
  });
  await check('aux: a tap on an AUX row docks the AUX panel in the row', async () => {
    const head = $('#mobile-main .mb-le-row[data-key^="a:"] .mb-le-head'); const t = await tap(head); if (t !== true) return t; await until(() => $('#dsm-panel'), 1500); await wait(400); notePanels('after an AUX row tap');
    const pop = $('#dsm-panel'); const out = is([!!pop && pop.classList.contains('mb-inline-panel'), !!pop && !!pop.closest('.mb-le-panelhost'), window._mbActiveAux], [true, true, dsms[0].id], 'docked / in its row / active AUX');
    budget('aux-panel', ['#mobile-main']); noteSide('AUX panel'); mbCloseInlinePanel(); await wait(300); return out;
  });
  await check('remove: − AUX asks to confirm, Cancel keeps the AUX, Remove deletes it', async () => {
    const n = dsms.length; let t = await tap($('#mobile-main .mb-le-addbtn.aux.rem')); if (t !== true) return t; await until(dlgOpen, 1500);
    const asked = /Remove AUX\?/.test(dialogText()); t = await tap($('#dlg-cancel')); if (t !== true) return t; await wait(350); const kept = dsms.length;
    t = await tap($('#mobile-main .mb-le-addbtn.aux.rem')); if (t !== true) return t; await until(dlgOpen, 1500); t = await tap($('#dlg-confirm')); if (t !== true) return t; await until(() => dsms.length === n - 1, 1500); await wait(300);
    return is([asked, kept, dsms.length, $$('#mobile-main .mb-le-row[data-key^="a:"]').length], [true, n, n - 1, n - 1], 'asked / after Cancel / after Remove / rows');
  });
  await check('back: Back returns to the list from a docked Destination, Layer and AUX panel, no panel flag is stranded and the next preset opens', async () => {
    const bad = []; const kinds = [['Destination', () => $('#mobile-main .mb-le-row[data-key^="d:"] .mb-le-head'), 'screen-panel'], ['Layer', () => $('#mobile-main .mb-le-layerrow .mb-le-head'), 'layer-panel'], ['AUX', () => $('#mobile-main .mb-le-row[data-key^="a:"] .mb-le-head'), 'dsm-panel']];
    for (let i = 0; i < kinds.length; i++) {
      const [label, head, id] = kinds[i]; await toList(); await openEdit(P().id);
      let t = await tap(head()); if (t !== true) { bad.push(label + ': ' + t); continue; } await until(() => document.getElementById(id), 1500); await wait(300); notePanels('from the ' + label + ' row'); if (!document.getElementById(id)) { bad.push(label + ': its panel did not dock'); continue; }
      t = await tap($('#mobile-main .mb-back-btn'), 'start'); if (t !== true) { bad.push(label + ': Back ' + t); mobileBackToList(); await wait(300); continue; } await until(() => $('#mobile-main .mb-preset-list'), 1500); await wait(250);
      const state = is([!!$('#mobile-main .mb-preset-list'), window._mbInlinePanelOpen, window._mbActiveDest, window._mbActiveLayer, window._mbActiveAux, ['layer-panel', 'screen-panel', 'dsm-panel'].filter(x => document.getElementById(x)), document.body.classList.contains('mb-layers')], [true, false, null, null, null, [], false], label); if (state !== true) bad.push(state);
      // the list must not be frozen: the next pencil opens its preset
      t = await tap($$('#mobile-main .mb-preset-card .mb-action-edit')[i]); if (t !== true) { bad.push(label + ': next pencil ' + t); continue; } await until(() => $('#mobile-main .mb-vis'), 1500); if (txt($('#mobile-main .mb-detail-pcode')) !== presets[i].code) bad.push(label + ': the next preset did not open');
    }
    await toList(); return bad.length ? bad.join(' || ') : true;
  });
  await check('add: + New Preset adds one preset and its card', async () => {
    const n = presets.length; const t = await tap($('#mobile-main .mb-preset-add')); if (t !== true) return t; await until(() => presets.length === n + 1, 1500); await wait(300); okDialogs();
    return is([presets.length, $$('#mobile-main .mb-preset-card').length, domCards()], [n + 1, n + 1, modelCards()], 'presets / cards / list');
  });
  await restore();

  // ── Wire ────────────────────────────────────────────────────────────────────────────────────────────────────────
  await section('Wire');
  const savedView = () => JSON.parse(JSON.stringify(getProjectState())).wireSettings.wireView;    // what Save, Send and the autosave would write
  const advTiles = () => $$('#wire-overlay .wire-adv-tile').filter(shown).length;
  await check('Wire portrait: a tap on Wire shows the rotate card over the tool, and the tool pill still works', async () => {
    let t = await tap($('#topbar-nav-wire')); if (t !== true) return t; await until(() => document.body.classList.contains('mb-wire-active'), 1500); await wait(500);
    const card = $('#mb-wire-rotate'), r = card ? card.getBoundingClientRect() : { width: 0, height: 0 }; noteSide('Wire, rotate card'); budget('wire-portrait', ['#mb-wire-rotate', '#topbar-nav-center']);
    const seen = [document.body.classList.contains('mb-wire-active'), vis(card), /Rotate your phone/.test(txt(card)), r.width >= innerWidth - 1 && r.height > innerHeight * 0.8];
    t = await tap($('#topbar-nav-vp')); if (t !== true) return 'behind the rotate card, ' + t; await wait(500);
    return is([seen, document.body.classList.contains('mb-wire-active'), getComputedStyle($('#wire-overlay')).display, !!$('#mobile-main .mb-preset-list')], [[true, true, true, true], false, 'none', true], 'card / Wire left / overlay / list back');
  });
  await rotate(LANDSCAPE);
  await check('Wire landscape: the rotate card is gone and the diagram draws in Simple, fitted, with no Advanced tabs', async () => {
    const t = await tap($('#topbar-nav-wire')); if (t !== true) return t; await until(() => $('#wire-diagram svg'), 2000); await wait(800);
    const sc = $('#wire-diagram-scroll'), r = sc.getBoundingClientRect(); noteSide('Wire, diagram'); budget('wire-landscape', ['#wire-overlay']);
    return is([innerWidth, vis($('#mb-wire-rotate')), !!$('#wire-diagram svg'), wireSettings.wireView, advTiles(), $$('#wire-tabs, #wire-page-tabs').filter(shown).length, _wireGetZoom() > 0 && _wireGetZoom() <= 1, r.width > innerWidth * 0.6 && r.height > 120, $$('#wire-sources-panel .wire-source-card').length > 0],
      [LANDSCAPE[0], false, true, 'simple', 0, 0, true, true, true], 'width / rotate card / svg / view / Advanced tiles / Advanced tabs / zoom fitted / diagram area / source cards');
  });
  openVideoPresets(); await wait(400);
  // a show that was SAVED in Wire Advanced on the desktop, with tiles on its page
  let ADV = null;
  try { wireSettings.wireView = 'advanced'; _wireAdvSeedFromSimple(true); const st = JSON.parse(JSON.stringify(getProjectState())); st.wireSettings.wireView = 'advanced'; if ((st.wireAdvanced.sources || []).length) ADV = JSON.stringify(st); } catch (e) { ADV = null; }
  await restore();
  await check('Wire: a show saved in Advanced is shown in Simple on the phone (no Advanced tiles or tabs on screen)', async () => {
    if (!ADV) return 'could not build a show saved in Advanced'; _applyProjectText(ADV); await wait(600); okDialogs(); if (savedView() !== 'advanced') return 'the test show did not load as Advanced';
    const t = await tap($('#topbar-nav-wire')); if (t !== true) return t; await until(() => $('#wire-diagram svg'), 2000); await wait(900);
    return is([!!$('#wire-diagram svg'), advTiles(), $$('#wire-tabs, #wire-page-tabs').filter(shown).length, $$('#wire-sources-panel .wire-source-card').length > 0], [true, 0, 0, true], 'svg / Advanced tiles / Advanced tabs / Simple source cards');
  });
  await check('Wire: opening Wire on the phone does NOT change the saved view of a show saved in Advanced (wireSettings.wireView stays "advanced" for Save, Send and the autosave)', async () => {
    if (!ADV) return 'could not build a show saved in Advanced'; const open = savedView(); let draft = null; try { _writeAutoSaveNow(); draft = JSON.parse(localStorage.getItem('avlb_autosave') || 'null').wireSettings.wireView; } catch (e) { draft = 'unreadable'; }
    const t = await tap($('#topbar-nav-vp')); if (t !== true) return t; await wait(500); const closed = savedView();
    return is([open, draft, closed], ['advanced', 'advanced', 'advanced'], 'saved view while Wire is open / in the autosave draft / after leaving Wire');
  });
  try { localStorage.removeItem('avlb_autosave'); } catch (e) {}
  await rotate(PORTRAIT); await restore();

  // ── I/O Patch ───────────────────────────────────────────────────────────────────────────────────────────────────
  await section('I/O Patch');
  const srcNames = () => _sysDiscoverSources();
  const pillText = (card, field) => txt($('[data-sys-field="' + field + '"] .pill-label', card));
  await check('I/O: a tap on I/O Patch shows one card per source, destination, AUX and multiviewer, equal to the model', async () => {
    const t = await tap($('#topbar-nav-iop')); if (t !== true) return t; await until(() => $('#mobile-main .mb-io'), 1500); await wait(400);
    const src = $$('#mobile-main .mb-io-src').map(c => $('.mb-io-syname', c).value + ' | ' + pillText(c, 'connector') + ' | ' + pillText(c, 'resolution'));
    const wantSrc = srcNames().map(n => { const m = _sysGetSourceMeta(n) || {}; return n + ' | ' + (m.connectorType || '— Set type —') + ' | ' + (m.resolution ? String(m.resolution).replace('x', '×') : '— Set resolution —'); });
    const dst = $$('#mobile-main .mb-io-card:not(.mb-io-src)').map(c => txt($('.mb-io-badge', c)) + ' | ' + (($('.mb-io-syname', c) || {}).value || txt($('.mb-io-name', c))) + ' | ' + pillText(c, 'resolution'));
    const res = v => v ? String(v).replace('x', '×') : '— Set resolution —';
    const wantDst = screens.map((s, i) => 'D' + (i + 1) + ' | ' + s.name + ' | ' + res(s.w + 'x' + s.h)).concat(dsms.map((d, i) => 'A' + (i + 1) + ' | ' + d.name + ' | ' + res(d.w + 'x' + d.h)), multiviewers.map(m => 'MV | ' + m.name + ' | ' + res(m.resolution)));
    return is([src, dst, getComputedStyle($('#sys-overlay')).display === 'none' || !$('#sys-overlay').classList.contains('open')], [wantSrc, wantDst, true], 'source cards / destination cards / desktop overlay closed');
  });
  noteSide('I/O Patch'); budget('io-patch', ['#mobile-main', '#topbar-nav-center']);
  await check('I/O: a connector picked on a source card is stored and shown, and the menu fits the phone', async () => {
    const name = srcNames()[0]; let t = await tap($('#mobile-main .mb-io-src [data-sys-field="connector"]')); if (t !== true) return t; await until(() => $('.sys-dd .sys-dd-item'), 1500); await wait(200);
    const dd = $('.sys-dd'), r = dd.getBoundingClientRect(), inside = r.left >= -1 && r.right <= innerWidth + 1; budget('io-connector-menu', ['.sys-dd']);
    const item = $$('.sys-dd .sys-dd-item').find(i => txt(i) === '12G-SDI'); t = await tap(item); if (t !== true) return t; await until(() => (_sysGetSourceMeta(name) || {}).connectorType === '12G-SDI', 1500); await wait(300);
    return is([inside, _sysGetSourceMeta(name).connectorType, pillText($('#mobile-main .mb-io-src'), 'connector'), !!$('.sys-dd')], [true, '12G-SDI', '12G-SDI', false], 'menu inside the phone / stored / shown / menu closed');
  });
  await check('I/O: a resolution picked from the side sheet is stored and shown, and the sheet fits the phone', async () => {
    const name = srcNames()[0]; let t = await tap($('#mobile-main .mb-io-src [data-sys-field="resolution"]')); if (t !== true) return t; await until(() => $('.shared-res-dd .sys-dd-item'), 1500); await wait(350);
    const sh = $('.shared-res-dd'), r = sh.getBoundingClientRect(); const sheet = [sh.classList.contains('mb-res-sheet'), r.left >= -1 && r.right <= innerWidth + 1]; budget('io-resolution-sheet', ['.shared-res-dd']);
    const item = $$('.sys-dd-item', sh).find(i => /^3840\s*[x×]\s*2160/.test(txt(i))); t = await tap(item); if (t !== true) return t; await until(() => (_sysGetSourceMeta(name) || {}).resolution === '3840x2160', 1500); await wait(300);
    return is([sheet, _sysGetSourceMeta(name).resolution, pillText($('#mobile-main .mb-io-src'), 'resolution'), !!$('.shared-res-dd'), !!$('#mobile-main .mb-io-src .mb-io-warnpill')], [[true, true], '3840x2160', '3840×2160', false, false], 'side sheet / stored / shown / sheet closed / bandwidth warning on 12G');
  });
  await check('I/O: a source renamed on its card (typed, then a tap away) is renamed in every preset', async () => {
    const uses = n => { let c = 0; presets.forEach(p => { Object.values(p.layers || {}).forEach(l => Object.values(l || {}).forEach(v => { if (v === n) c++; })); Object.values(p.bgNames || {}).forEach(v => { if (v === n) c++; }); Object.values(p.dsmContent || {}).forEach(v => { if (v === n) c++; }); }); return c; };
    const old = srcNames().find(n => uses(n) > 0); if (!old) return 'no source is used in a preset'; const before = uses(old);
    const inp = $$('#mobile-main .mb-io-src .mb-io-syname').find(i => i.value === old); let t = await tap(inp); if (t !== true) return t; if (document.activeElement !== inp) return 'the tap did not put the cursor in the name field';
    inp.select(); const ty = await runner('type', { text: 'PHONE RENAMED' }); if (ty && ty.error) return 'typing failed: ' + ty.error; await wait(150);
    t = await tap($('#mobile-main .mb-io-section')); if (t !== true) return t; await until(() => srcNames().includes('PHONE RENAMED'), 1500); await wait(300); okDialogs();
    return is([srcNames().includes('PHONE RENAMED'), srcNames().includes(old), uses(old), uses('PHONE RENAMED'), $$('#mobile-main .mb-io-src .mb-io-syname').some(i => i.value === 'PHONE RENAMED')], [true, false, 0, before, true], 'new name listed / old name gone / old uses / new uses / card');
  });
  await restore();

  // ── exports called directly (the phone has no Export button today), and the windows a phone user can meet ─────────
  await section('exports and windows');
  const exportAnyway = async () => { const p = $('#validation-panel'); if (!vis(p)) return [true, null]; const fit = fits($('.pm', p) || p); const b = $$('button', p).find(x => /export anyway/i.test(x.textContent)); if (!b) return [fit, 'the Pre-Export Check has errors: ' + txt(p).slice(0, 120)]; const t = await tap(b); await wait(500); return [fit, t === true ? null : t]; };
  await check('exports: the Excel cue sheet runs at phone size (the Pre-Export Check fits and Export Anyway delivers the .xlsx)', async () => {
    downloads.length = 0; actions.exportExcel(); await wait(500); const [fit, err] = await exportAnyway(); if (err) return err; await until(() => downloads.length, 2000);
    return is([fit, downloads.map(d => /look_book\.xlsx$/.test(d.name) && d.size > 2000)], [true, [true]], 'check window fits / file');
  });
  await check('exports: the I/O Excel runs at phone size', async () => {
    downloads.length = 0; runExportWithValidation(_sysExportIOExcel, '_sysExportIOExcel', _sysValidateIO); await wait(500); const [fit, err] = await exportAnyway(); if (err) return err; await until(() => downloads.length, 2000);
    return is([fit, downloads.map(d => /video-io\.xlsx$/.test(d.name) && d.size > 2000)], [true, [true]], 'check window fits / file');
  });
  { const p = $('#validation-panel'); if (p) p.style.display = 'none'; const bd = $('#validation-backdrop'); if (bd) bd.style.display = 'none'; }
  await check('exports: the Look Book builds a cover and one page per preset at phone size, from a window that fits the phone', async () => {
    openPdfExportModal(); await wait(400); const m = $('#pdf-export-modal'); const fit = fits($('.pm', m) || m.firstElementChild); noteSide('Look Book window'); budget('lookbook-window', ['#pdf-export-modal']);
    const real = exportPDF; let html = null; window.exportPDF = function () { html = real(true); }; try { _pdfConfirmExport(); } finally { window.exportPDF = real; } await wait(200);
    const d = new DOMParser().parseFromString(html || '', 'text/html');
    return is([fit, d.querySelectorAll('.pp-breakdown').length, !!d.querySelector('.cover'), vis($('#pdf-export-modal'))], [true, presets.length, true, false], 'window fits / preset pages / cover / window closed');
  });
  await check('exports: the Wire drawing builds at phone size, and the Wire export window fits the phone', async () => {
    const svg = _wireExportSheetsSvg('light'); openWireExportModal(); await wait(400); const m = $('#wire-export-modal'); const fit = fits($('.pm', m) || m.firstElementChild); budget('wire-export-window', ['#wire-export-modal']); closeWireExportModal(); await wait(200);
    return is([typeof svg === 'string' && svg.indexOf('<svg') >= 0 && svg.length > 5000, fit, vis($('#wire-export-modal'))], [true, true, false], 'drawing / window fits / window closed');
  });
  await check('modal: Help fits the phone', async () => { actions.help(); await wait(450); const o = $('#help-overlay'); noteSide('Help'); budget('help', ['#help-overlay']); return fits($('.pm', o), { skip: '.help-tab' }); });
  await check('modal: every Help tab can be reached on the phone, and a tap on the last one opens it', async () => {
    const o = $('#help-overlay'); if (!vis(o)) return 'Help is not open'; const tabs = $$('.help-tab', o); if (tabs.length < 5) return 'expected 5 Help tabs, found ' + tabs.length; const lost = [];
    for (const tb of tabs) { const sc = userScrollsX(tb); if (sc) { sc.scrollLeft = Math.max(0, tb.offsetLeft - 20); await wait(120); } const p = await aimNoScroll(tb); if (p !== true) lost.push(txt(tb) + ': ' + p); }
    if (lost.length) return lost.join(' || ');
    const last = tabs[tabs.length - 1]; const t = await tap(last, 'nearest'); if (t !== true) return t; await wait(300); return is(last.classList.contains('active'), true, 'last tab active');
  });
  async function aimNoScroll(el) { const b = el.getBoundingClientRect(); if (b.left < -1 || b.right > innerWidth + 1) return 'spans ' + R(b.left) + '…' + R(b.right) + ' in a ' + innerWidth + ' px phone and its bar cannot be swiped'; const x = b.left + b.width / 2, y = b.top + b.height / 2; const top = document.elementFromPoint(x, y); if (!top || !(top === el || el.contains(top))) return 'covered or cut off at ' + R(x) + ',' + R(y) + ' (by ' + desc(top) + ')';
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { if (/(hidden|clip)/.test(getComputedStyle(p).overflowX)) { const pr = p.getBoundingClientRect(); if (b.right > pr.right + 1) return 'spans ' + R(b.left) + '…' + R(b.right) + ', cut at ' + R(pr.right) + ' by ' + desc(p) + ', and its bar cannot be swiped'; } } return true; }
  closeHelp(); await wait(300);
  await check('modal: Quick Setup opened from the Show card fits the phone', async () => {
    try { openVideoPresets(); } catch (e) {} await wait(300); await toList(); const t = await tap($('#mobile-main .mb-guide-card .qs-panel-body') || $('#mobile-main .mb-guide-card')); if (t !== true) return t; await until(() => vis($('#qs-modal')), 1500); await wait(300);
    const out = fits($('#qs-modal > div') || $('#qs-modal')); budget('quick-setup-edit', ['#qs-modal']); closeQS(); await wait(300); return out;
  });

  // ── landscape ───────────────────────────────────────────────────────────────────────────────────────────────────
  await section('landscape'); await restore(); await rotate(LANDSCAPE);
  await check('landscape: phone mode stays on after the phone is rotated and the preset list still equals the model', () => is([document.body.classList.contains('is-mobile'), innerWidth, innerHeight, domCards()], [true, LANDSCAPE[0], LANDSCAPE[1], modelCards()], 'phone mode / width / height / cards'));
  noteSide('preset list'); budget('landscape-preset-list', ['#mobile-main', '#topbar-nav-center']);
  await check('landscape: the visualiser fits its box on every preset of General Session', async () => {
    const bad = []; for (const p of presets.slice()) { await openEdit(p.id); const f = visFit(); if (f !== true) bad.push(p.code + ': ' + f); } return bad.length ? bad[0] + (bad.length > 1 ? ' (and ' + (bad.length - 1) + ' more presets)' : '') : true;
  });
  await openEdit(P().id); noteSide('preset edit'); budget('landscape-preset-edit', ['#mobile-main']);
  await check('landscape: a layer row docks its panel and Back still works', async () => {
    await openEdit(P().id); mbOpenLayerInline(Lsid(), 1); await wait(450); notePanels('in landscape'); const pop = $('#layer-panel'); const docked = !!pop && pop.classList.contains('mb-inline-panel'); noteSide('layer panel');
    const t = await tap($('#mobile-main .mb-back-btn'), 'start'); if (t !== true) { await toList(); return t; } await until(() => $('#mobile-main .mb-preset-list'), 1500);
    return is([docked, !!$('#mobile-main .mb-preset-list'), window._mbInlinePanelOpen], [true, true, false], 'docked / list back / flag');
  });
  await check('landscape: I/O Patch cards equal the model count', async () => {
    await toList(); const t = await tap($('#topbar-nav-iop')); if (t !== true) return t; await until(() => $('#mobile-main .mb-io'), 1500); await wait(300); noteSide('I/O Patch'); budget('landscape-io-patch', ['#mobile-main', '#topbar-nav-center']);
    const out = is([$$('#mobile-main .mb-io-src').length, $$('#mobile-main .mb-io-card:not(.mb-io-src)').length], [srcNames().length, screens.length + dsms.length + multiviewers.length], 'source cards / destination cards'); openVideoPresets(); await wait(300); return out;
  });
  await rotate(PORTRAIT);

  // ── asserted once, over everything the run met ──────────────────────────────────────────────────────────────────
  await check('panels: no floating desktop panel appeared on the phone at any point (every Destination / Layer / AUX panel carried .mb-inline-panel)', () => floated.length ? floated.join(' || ') : true);
  await check('portrait: the page never scrolls sideways on any screen', () => side.portrait.length ? side.portrait.join(' || ') : (sideSeen.portrait.length >= 12 ? true : 'only ' + sideSeen.portrait.length + ' screens were measured'));
  await check('landscape: the page never scrolls sideways on any screen', () => side.landscape.length ? side.landscape.join(' || ') : (sideSeen.landscape.length >= 5 ? true : 'only ' + sideSeen.landscape.length + ' screens were measured'));

  await restore(); $$('video,audio').forEach(v => { try { v.muted = true; v.pause(); } catch (e) {} });
  return { checks, budgets, screens: sideSeen };
})

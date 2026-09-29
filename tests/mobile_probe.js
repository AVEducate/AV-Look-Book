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
  // 16kw-r2 W: NEW
  // 16kw-r2: Omar's answer 2 on the phone (Wire is landscape only there), with REAL taps and typing. FAILS on the 16kw-fix page
  //   (the Cable Type menu has no Custom…), PASSES on 16kw-r2. Undo puts the show back for the checks after it.
  await check('Wire 16kw-r2 landscape: a source card\'s Cable Type menu reads Custom… first, — Clear — second, then the list; Custom… turns the button into a box on the card (the keyboard in it); LEMO 3B typed and a tap on the drawing stores it (the show\'s connectorType), the card shows it and its cable turns grey; Undo takes it back', async () => {
    const tidy = () => { try { _sysCloseMenu(); } catch (e) {} };
    try {
    const out = {}; const btn = () => $$('#wire-sources-panel .wire-cable-btn[data-sys-kind="src"]').find(b => b.dataset.sysId === 'PPT B');
    const rows = () => { const m = $$('.sys-dd').filter(e => e.getBoundingClientRect().width > 0).pop(); return m ? [...m.children].map(c => (c.classList.contains('sys-dd-group') ? '## ' : '') + txt($('.item-text', c) || c)) : []; };
    if (!$('#wire-diagram svg')) return 'Wire is not open in landscape';
    const c0 = (_sysGetSourceMeta('PPT B') || {}).connectorType;
    let t = await tap(btn()); if (t !== true) return t; await until(() => $('.sys-dd .sys-dd-item'), 1500); await wait(250);
    out.menu = rows().slice(0, 3);
    t = await tap($$('.sys-dd .sys-dd-item').find(i => /^Custom…$/.test(txt($('.item-text', i) || i)))); if (t !== true) return t; await until(() => $('.wire-conn-ask input'), 1500); await wait(200);
    const box = $('.wire-conn-ask input'); out.box = [!!box, document.activeElement === box, box ? box.placeholder : null];
    const ty = await runner('type', { text: 'LEMO 3B' }); if (ty && ty.error) return 'typing failed: ' + ty.error; await wait(200);
    t = await tap($('#wire-diagram-scroll')); if (t !== true) return t; await until(() => (_sysGetSourceMeta('PPT B') || {}).connectorType === 'LEMO 3B', 2500); await wait(700);
    const e = $$('#wire-diagram path.wire-edge').find(p => p.dataset.from === 'src:PPT B');
    out.stored = [(_sysGetSourceMeta('PPT B') || {}).connectorType, txt(btn()), !$('.wire-conn-ask'), e ? /156,\s*163,\s*175/.test(e.getAttribute('stroke') || '') : null];
    doUndo(); await wait(600); out.undo = [(_sysGetSourceMeta('PPT B') || {}).connectorType === c0, txt(btn())];
    return is(out, { menu: ['Custom…', '— Clear —', '## HDMI'], box: [true, true, 'Type name…'], stored: ['LEMO 3B', 'LEMO 3B', true, true], undo: [true, c0] },
      'the Cable Type menu [first rows] / the box [there, the keyboard in it, placeholder] / after LEMO 3B + a tap on the drawing [stored, card, box gone, grey cable] / Undo [back, card]');
    } finally { tidy(); await wait(200); }
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
  // 16kw-menus P: NEW
  // 16kw-fix: REVISES the builder's block P. Its last part said "the Resolution sheet reads as before (Custom first, no Clear)";
  //   the phone's I/O Resolution sheet now reads + Custom resolution…, — Clear — like the Connector and Type menus (attacker
  //   finding: Omar's "always Custom then clear" covers the phone cards, and the in-app Help says the three menus match). Only
  //   the name and that last expectation changed (and a tidy-up when it ends, so a failing run leaves no menu open); every tap is
  //   the builder's.
  await check('I/O 16kw: on a source card the Connector menu reads Custom… first, — Clear — second, then the list (25 rows) and the Type menu Custom…, — Clear —, then the list (10 rows); Connector › Custom… turns the pill into a box on the card, LEMO typed and a tap away stores it and the card shows it; the next card\'s Connector menu offers LEMO right after Clear; Type › — Clear — empties the type; the Resolution sheet reads + Custom resolution… first and — Clear — second, like the other two', async () => {
    const tidy = () => { try { closeSharedResPicker(); } catch (e) {} try { _sysCloseMenu(); } catch (e) {} };   /* 16kw-fix: a failing run must not leave a sheet or a menu over the next checks */
    try {
    const rows = () => { const m = $$('.sys-dd').filter(e => e.getBoundingClientRect().width > 0).pop(); return m ? [...m.children].map(c => (c.classList.contains('sys-dd-group') ? '## ' : '') + txt($('.item-text', c) || c)) : []; };
    const item = re => $$('.sys-dd .sys-dd-item').find(i => re.test(txt($('.item-text', i) || i)));
    const cards = () => $$('#mobile-main .mb-io-src'); const out = {};
    if (!$('#mobile-main .mb-io')) { const t0 = await tap($('#topbar-nav-iop')); if (t0 !== true) return t0; await until(() => $('#mobile-main .mb-io'), 1500); await wait(300); }
    const name0 = $('.mb-io-syname', cards()[0]).value, name1 = $('.mb-io-syname', cards()[1]).value;
    let t = await tap($('[data-sys-field="connector"]', cards()[0])); if (t !== true) return t; await until(() => $('.sys-dd .sys-dd-item'), 1500); await wait(200);
    const conn = rows(); out.conn = [conn.slice(0, 3), conn.filter(r => !/^## /.test(r)).length];
    t = await tap(item(/^Custom…$/)); if (t !== true) return t; await until(() => $('#mobile-main .sys-conn-ask input'), 1500); await wait(150);
    const box = $('#mobile-main .sys-conn-ask input'); out.box = [!!box, document.activeElement === box, box ? box.placeholder : null];
    const ty = await runner('type', { text: 'LEMO' }); if (ty && ty.error) return 'typing failed: ' + ty.error; await wait(150);
    t = await tap($('#mobile-main .mb-io-section')); if (t !== true) return t; await until(() => (_sysGetSourceMeta(name0) || {}).connectorType === 'LEMO', 2500); await wait(500);
    out.stored = [(_sysGetSourceMeta(name0) || {}).connectorType, pillText(cards()[0], 'connector'), !$('#mobile-main .sys-conn-ask')];
    t = await tap($('[data-sys-field="connector"]', cards()[1])); if (t !== true) return t; await until(() => $('.sys-dd .sys-dd-item'), 1500); await wait(200);
    out.offered = rows().slice(0, 4); t = await tap(item(/^LEMO$/)); if (t !== true) return t; await until(() => (_sysGetSourceMeta(name1) || {}).connectorType === 'LEMO', 1500); await wait(300);
    out.picked = (_sysGetSourceMeta(name1) || {}).connectorType;
    t = await tap($('[data-sys-field="src-type"]', cards()[0])); if (t !== true) return t; await until(() => $('.sys-dd .sys-dd-item'), 1500); await wait(200);
    const type = rows(); out.type = [type.slice(0, 3), type.filter(r => !/^## /.test(r)).length];
    t = await tap(item(/^— Clear —$/)); if (t !== true) return t; await until(() => !(_sysGetSourceMeta(name0) || {}).type, 1500); await wait(300);
    out.cleared = [(_sysGetSourceMeta(name0) || {}).type || '', txt($('[data-sys-field="src-type"]', cards()[0]))];
    t = await tap($('[data-sys-field="resolution"]', cards()[0])); if (t !== true) return t; await until(() => $('.shared-res-dd .sys-dd-item'), 1500); await wait(350);
    const res = $$('.shared-res-dd > *').map(c => (c.classList.contains('sys-dd-group') ? '## ' : '') + txt($('.item-text', c) || c)); out.res = [res.slice(0, 2), res.some(r => /Clear/.test(r))];
    try { closeSharedResPicker(); } catch (e) {} await wait(200);
    return is(out, { conn: [['Custom…', '— Clear —', '## HDMI'], 25], box: [true, true, 'Type name…'], stored: ['LEMO', 'LEMO', true], offered: ['Custom…', '— Clear —', 'LEMO', '## HDMI'], picked: 'LEMO',
      type: [['Custom…', '— Clear —', 'PC'], 10], cleared: ['', '— Set machine —'], res: [['+ Custom resolution…', '— Clear —'], true] },
      'Connector menu [first rows, rows] / the box [there, cursor in it, placeholder] / after LEMO + a tap away [stored, card, box gone] / the next card\'s menu / picked there / Type menu [first rows, rows] / after Clear [type, chip] / Resolution sheet [first rows, a Clear]');
    } finally { tidy(); await wait(200); }
  });
  // 16kw-menus Q: NEW
  // 16kw-fix: the phone findings, with REAL taps. FAILS on the 16kw-menus page (no Clear in the Resolution sheet; the source
  //   card's sheet marks nothing; CUSTOM… runs into YOUR OWN; Media Server opens below the edge), PASSES on the 16kw-fix page.
  // 16kw-r2 Q: REPLACES the check named in its header (reason in the block)
  // 16kw-r2: REVISES the 16kw-fix phone check Q. Two of its expectations are what Omar's answers of 2026-09-26 change: a card
  //   whose Type is Media Server opened its Type menu scrolled to Media Server (answer 1: every menu opens at its TOP, the value
  //   still marked, a scroll down), and a tap on the destination sheet's — Clear — closed the sheet (answer 3: an output's Clear
  //   is greyed out, so the tap does nothing and the sheet stays). Every tap is the fixer's; the rest of Q is unchanged.
  await check('I/O 16kw-fix: on the phone cards the Resolution sheet reads + Custom resolution…, — Clear —, then Used in this show; the source card\'s sheet marks the source\'s own size; — Clear — empties the source\'s resolution (the card reads — Set resolution —); a destination card\'s sheet reads the same, its — Clear — greyed out (16kw-r2: a tap on it does nothing, the size stays, the sheet stays open); the Type menu\'s first row reads cleanly (CUSTOM… beside its note, not over it); a card whose Type is Media Server opens its Type menu at the TOP (16kw-r2: Custom… in view, Media Server still marked)', async () => {
    const tidy = () => { try { closeSharedResPicker(); } catch (e) {} try { _sysCloseMenu(); } catch (e) {} };   /* a failing run must not leave a sheet or a menu over the next checks */
    try {
    const shRows = () => $$('.shared-res-dd > *').map(c => (c.classList.contains('sys-dd-group') ? '## ' : '') + txt($('.item-text', c) || c) + (c.classList.contains('selected') ? ' *' : ''));
    const item = (sel, re) => $$(sel).find(i => re.test(txt($('.item-text', i) || i)));
    const cards = () => $$('#mobile-main .mb-io-card'), srcCards = () => $$('#mobile-main .mb-io-src'), dstCard = () => $('#mobile-main .mb-io-card.mb-io-dest'); const out = {};
    if (!$('#mobile-main .mb-io')) { const t0 = await tap($('#topbar-nav-iop')); if (t0 !== true) return t0; await until(() => $('#mobile-main .mb-io'), 1500); await wait(300); }
    const c2 = srcCards()[2], name2 = $('.mb-io-syname', c2).value, res2 = (_sysGetSourceMeta(name2) || {}).resolution || '';
    let t = await tap($('[data-sys-field="resolution"]', c2)); if (t !== true) return t; await until(() => $('.shared-res-dd .sys-dd-item'), 1500); await wait(350);
    const sr = shRows(); out.srcSheet = [sr.slice(0, 3), sr.includes(res2.replace('x', '×') + ' *')];
    t = await tap(item('.shared-res-dd .sys-dd-item', /^— Clear —$/)); if (t !== true) return t; await until(() => !(_sysGetSourceMeta(name2) || {}).resolution, 1500); await wait(400);
    out.cleared = [(_sysGetSourceMeta(name2) || {}).resolution || '', pillText(srcCards()[2], 'resolution')];
    const d = dstCard(); const did = (screens[0] || {}).id, w0 = screens[0].w + 'x' + screens[0].h;
    t = await tap($('[data-sys-field="resolution"]', d)); if (t !== true) return t; await until(() => $('.shared-res-dd .sys-dd-item'), 1500); await wait(350);
    out.dstSheet = shRows().slice(0, 2); const dc = item('.shared-res-dd .sys-dd-item', /^— Clear —$/); out.dstClear = dc ? [dc.classList.contains('disabled'), dc.title] : 'no Clear';
    t = await tap(dc); if (t !== true) return t; await wait(600);
    out.dstKept = [screens[0].w + 'x' + screens[0].h === w0, !!$('.shared-res-dd')];
    tidy(); await wait(300);
    t = await tap($('[data-sys-field="src-type"]', srcCards()[3])); if (t !== true) return t; await until(() => $('.sys-dd .sys-dd-item'), 1500); await wait(250);
    const first = $$('.sys-dd .sys-dd-item')[0]; const ft = first && $('.item-text', first), fm = first && $('.item-meta', first);
    const rg = document.createRange(); if (ft) rg.selectNodeContents(ft);
    out.firstRow = ft && fm ? [txt(ft), txt(fm), rg.getBoundingClientRect().right <= fm.getBoundingClientRect().left + 0.5] : 'no first row with a note';
    t = await tap(item('.sys-dd .sys-dd-item', /^Media Server$/)); if (t !== true) return t; await wait(500);
    const name3 = $('.mb-io-syname', srcCards()[3]).value; out.picked = (_sysGetSourceMeta(name3) || {}).type;
    t = await tap($('[data-sys-field="src-type"]', srcCards()[3])); if (t !== true) return t; await until(() => $('.sys-dd .sys-dd-item'), 1500); await wait(250);
    const m = $$('.sys-dd').filter(e => e.getBoundingClientRect().width > 0).pop(), s = m && $('.sys-dd-item.selected', m);
    const f0 = m && $('.sys-dd-item', m), mr = m && m.getBoundingClientRect();
    out.atTop = m && s && f0 ? [txt($('.item-text', s) || s), m.scrollTop, txt($('.item-text', f0) || f0), f0.getBoundingClientRect().top >= mr.top - 1] : 'no marked row';
    try { _sysCloseMenu(); } catch (e) {} await wait(200);
    return is(out, { srcSheet: [['+ Custom resolution…', '— Clear —', '## Used in this show'], true], cleared: ['', '— Set resolution —'], dstSheet: ['+ Custom resolution…', '— Clear —'], dstClear: [true, 'An output\'s resolution is its size'], dstKept: [true, true],
      firstRow: ['Custom…', 'your own', true], picked: 'Media Server', atTop: ['Media Server', 0, 'Custom…', true] },
      'source card sheet [first rows, its own size marked] / after Clear [resolution, card] / destination card sheet [first rows] / its Clear [greyed, tooltip] / after a tap on it [size kept, sheet still open] / Type menu first row [label, note, the label ends before the note] / picked / reopened [marked row, scroll, first row, first row in view]');
    } finally { tidy(); await wait(200); }
  });
  // 16kw-r2 Z: NEW
  // 16kw-r2: Omar's answers 1 and 3 on the phone cards, with REAL taps. FAILS on the 16kw-fix page (the Connector menu opens
  //   scrolled to LTC; the AUX / DSM / multiviewer sheets' Clear is live and a tap on the multiviewer's empties it), PASSES on 16kw-r2.
  await check('I/O 16kw-r2: on the phone the Resolution sheet of an AUX, a DSM and the multiviewer card greys out — Clear — (second, disabled, the tooltip "An output\'s resolution is its size"): a tap on it does nothing (the size stays, the sheet stays open); a card whose Connector is LTC opens its Connector menu at the TOP (Custom… and — Clear — in view, LTC still marked)', async () => {
    const tidy = () => { try { closeSharedResPicker(); } catch (e) {} try { _sysCloseMenu(); } catch (e) {} };
    try {
    const item = (sel, re) => $$(sel).find(i => re.test(txt($('.item-text', i) || i)));
    const out = {}; if (!$('#mobile-main .mb-io')) { const t0 = await tap($('#topbar-nav-iop')); if (t0 !== true) return t0; await until(() => $('#mobile-main .mb-io'), 1500); await wait(300); }
    const size = kind => { const c = $$('#mobile-main .mb-io-card').find(x => x.classList.contains('mb-io-' + kind)); const p = c && $('[data-sys-field="resolution"]', c); return p ? p.dataset.sysValue : null; };
    const model = () => JSON.stringify([dsms.map(x => x.w + 'x' + x.h), multiviewers.map(x => x.resolution || '')]);
    for (const kind of ['aux', 'dsm', 'mv']) {
      const c = $$('#mobile-main .mb-io-card').find(x => x.classList.contains('mb-io-' + kind)); if (!c) { out[kind] = 'no ' + kind + ' card'; continue; }
      let t = await tap($('[data-sys-field="resolution"]', c)); if (t !== true) { out[kind] = t; continue; } await until(() => $('.shared-res-dd .sys-dd-item'), 1500); await wait(350);
      const it = item('.shared-res-dd .sys-dd-item', /^— Clear —$/); const m0 = model();
      const r = it ? [$$('.shared-res-dd .sys-dd-item').indexOf(it), it.classList.contains('disabled'), it.classList.contains('selected'), it.title] : ['no Clear'];
      t = await tap(it); await wait(500); r.push(t === true, model() === m0, !!$('.shared-res-dd')); out[kind] = r; tidy(); await wait(300);
    }
    const c1 = $$('#mobile-main .mb-io-src')[1]; let t = await tap($('[data-sys-field="connector"]', c1)); if (t !== true) return t; await until(() => $('.sys-dd .sys-dd-item'), 1500); await wait(250);
    t = await tap(item('.sys-dd .sys-dd-item', /^LTC$/)); if (t !== true) return t; await wait(500);
    t = await tap($('[data-sys-field="connector"]', $$('#mobile-main .mb-io-src')[1])); if (t !== true) return t; await until(() => $('.sys-dd .sys-dd-item'), 1500); await wait(250);
    const m = $$('.sys-dd').filter(e => e.getBoundingClientRect().width > 0).pop(), s = m && $('.sys-dd-item.selected', m), mr = m && m.getBoundingClientRect();
    const inView = m ? $$('.sys-dd-item', m).filter(i => { const r = i.getBoundingClientRect(); return r.top >= mr.top - 1 && r.bottom <= mr.bottom + 1; }).slice(0, 2).map(i => txt($('.item-text', i) || i)) : [];
    out.ltc = m && s ? [txt($('.item-text', s) || s), m.scrollTop, inView] : 'no marked row'; tidy(); await wait(200);
    const OFF = [1, true, false, 'An output\'s resolution is its size', true, true, true];
    return is(out, { aux: OFF, dsm: OFF, mv: OFF, ltc: ['LTC', 0, ['Custom…', '— Clear —']] },
      'the sheet\'s Clear on AUX / DSM / MV [its row, greyed, marked, tooltip, the tap reached it, sizes kept, the sheet still open] / the Connector menu after LTC [marked, scroll, the first rows in view]');
    } finally { tidy(); await wait(200); }
  });
  // 16kw-r3fix P: NEW
  // 16kw-r3fix: Omar's answers 4 and 1 on the phone cards, with REAL taps and typing. FAILS on the 16kw-r2 page (the pill reads
  //   "lemo 2b" as typed; a typed Type's menu marks Custom…), PASSES on 16kw-r3fix.
  await check('I/O 16kw-r3fix: on the phone cards a typed connector reads in CAPITALS on its Connector pill ("lemo 2b" typed and a tap away, stored as typed, the pill reads LEMO 2B, like the desktop pill and the menu row), and a Type typed on a source or a destination card (Custom…, a tap in the box, the name typed, a tap on the card\'s Connector label) is the marked row of that card\'s Type menu, which still opens at its top', async () => {
    const tidy = () => { try { _sysCloseMenu(); } catch (e) {} };
    try {
    const item = re => $$('.sys-dd .sys-dd-item').find(i => re.test(txt($('.item-text', i) || i)));
    const out = {}; if (!$('#mobile-main .mb-io')) { const t0 = await tap($('#topbar-nav-iop')); if (t0 !== true) return t0; await until(() => $('#mobile-main .mb-io'), 1500); await wait(300); }
    const srcCard = () => $$('#mobile-main .mb-io-src')[4], dstCard = () => $$('#mobile-main .mb-io-card.mb-io-dest')[1];
    const sName = $('.mb-io-syname', srcCard()).value, dId = (screens[1] || {}).id;
    // the Connector pill
    let t = await tap($('[data-sys-field="connector"]', srcCard())); if (t !== true) return t; await until(() => $('.sys-dd .sys-dd-item'), 1500); await wait(200);
    t = await tap(item(/^Custom…$/)); if (t !== true) return t; await until(() => $('#mobile-main .sys-conn-ask input'), 1500); await wait(150);
    let ty = await runner('type', { text: 'lemo 2b' }); if (ty && ty.error) return 'typing failed: ' + ty.error; await wait(150);
    t = await tap($('.mb-io-flabel', srcCard())); if (t !== true) return t; await until(() => (_sysGetSourceMeta(sName) || {}).connectorType === 'lemo 2b', 2500); await wait(500);
    const pl = $('[data-sys-field="connector"] .pill-label', srcCard());
    out.pill = [(_sysGetSourceMeta(sName) || {}).connectorType, pl ? pl.innerText.replace(/\s+/g, ' ').trim() : null];
    // a Type typed on a card, then its Type menu
    const typed = async (card, f, name, stored) => { let t = await tap($('[data-sys-field="' + f + '"]', card())); if (t !== true) return t; await until(() => $('.sys-dd .sys-dd-item'), 1500); await wait(200);
      t = await tap(item(/^Custom…$/)); if (t !== true) return t; await until(() => $('.sys-type-input', card()), 1500); await wait(250);
      t = await tap($('.sys-type-input', card())); if (t !== true) return t; await wait(150);
      const ty = await runner('type', { text: name }); if (ty && ty.error) return 'typing failed: ' + ty.error; await wait(150);
      t = await tap($('.mb-io-flabel', card())); if (t !== true) return t; await until(() => stored() === name, 2500); await wait(500);
      t = await tap($('.sys-name-chev[data-sys-field="' + f + '"]', card())); if (t !== true) return t; await until(() => $('.sys-dd .sys-dd-item'), 1500); await wait(250);
      const m = $$('.sys-dd').filter(e => e.getBoundingClientRect().width > 0).pop(), s = m && $('.sys-dd-item.selected', m), f0 = m && $('.sys-dd-item', m);
      const r = [stored(), s ? txt($('.item-text', s) || s) : null, m ? m.scrollTop : null, f0 ? txt($('.item-text', f0) || f0) : null]; tidy(); await wait(250); return r; };
    out.src = await typed(srcCard, 'src-type', 'ALPHA PH', () => (_sysGetSourceMeta(sName) || {}).customType);
    out.dst = await typed(dstCard, 'dst-type', 'DELTA PH', () => ((screens.find(s => s.id === dId) || {}).customType));
    return is(out, { pill: ['lemo 2b', 'LEMO 2B'], src: ['ALPHA PH', 'ALPHA PH', 0, 'Custom…'], dst: ['DELTA PH', 'DELTA PH', 0, 'Custom…'] },
      'the Connector pill after "lemo 2b" [stored, the pill as seen] / a source card\'s typed Type, then its Type menu [stored, the marked row, its scroll, the first row] / the same on a destination card');
    } finally { tidy(); await wait(200); }
  });
  // 16kx-backdrop P: NEW
  // 16kx-backdrop (Omar 2026-09-27): a backdrop on the phone, with REAL taps. FAILS on the 16kw round-2 page (the Type menu has no
  //   Backdrop), PASSES on 16kx-backdrop.
  // 16kx-r2 P: REPLACES round-1 check P (reason in the block)
  // 16kx-r2: REPLACES round-1 phone check P. Why: answers 1, 2 and 4. The destination is named BACKDROP, the cards number the
  //   destinations without it (D1 LEFT LED, D2 RIGHT LED), and its size reads in feet and inches (10' × 5' 6", Length 10').
  // 16kx-r2fix P: REPLACES 16kx-r2 check P (reason in the block)
  // 16kx-r2fix: REPLACES 16kx-r2's phone check P. Why: one number per destination in the whole show. 16kx-r2 numbered the I/O
  //   cards without the backdrop (D1 LEFT LED, D2 RIGHT LED) while the phone's layer rows (D3·L1) and the Look Book kept the
  //   canvas numbers; the cards keep the canvas numbers again (D1 LEFT LED, D3 RIGHT LED). Nothing else changes.
  // 16kx-r3 XP: REPLACES the check named in its header (reason in the block)
  // 16kx-r3: RENAMED in place. Why: Omar's answer 1 ("no number count drops by one"): the phone's I/O cards number the destinations without the backdrop,
  //   D1 LEFT LED, D2 RIGHT LED (was the canvas numbers, D3). Everything else is unchanged.
  await check('I/O 16kx-backdrop: on the phone a destination card\'s Type menu ends with Stream, Backdrop; a tap on Backdrop asks first ("CENTER LED" becomes a backdrop …) and a tap on yes makes it one named BACKDROP (16kx-r2): its card leaves the I/O cards, which are numbered without it, D1 LEFT LED, D2 RIGHT LED (2 destination; 16kx-r3, Omar "no number count drops by one"); the preset\'s visualiser draws it between LEFT LED and RIGHT LED with BACKDROP and its size in feet and inches (10\' × 5\' 6"), inside the box, and a tap on it opens Destination Properties with Length 10\', never the layer panel', async () => {
    const tidy = () => { try { _sysCloseMenu(); } catch (e) {} };
    try {
    const out = {}; if (!$('#mobile-main .mb-io')) { const t0 = await tap($('#topbar-nav-iop')); if (t0 !== true) return t0; await until(() => $('#mobile-main .mb-io'), 1500); await wait(300); }
    const card = n => $$('#mobile-main .mb-io-card').find(c => (($('.mb-io-syname', c) || {}).value || '') === n);
    let t = await tap($('[data-sys-field="dst-type"]', card('CENTER LED'))); if (t !== true) return t; await until(() => $('.sys-dd .sys-dd-item'), 1500); await wait(300);
    const rows = $$('.sys-dd .sys-dd-item').map(i => txt($('.item-text', i) || i)); out.menu = rows.slice(-2);
    const it = $$('.sys-dd .sys-dd-item').find(i => /^Backdrop$/.test(txt($('.item-text', i) || i)));
    if (!it) { tidy(); return is(out, { menu: ['Stream', 'Backdrop'] }, 'the Type menu\'s last rows'); }
    t = await tap(it); if (t !== true) return t; await until(() => dlgOpen(), 1500); await wait(200);
    out.asked = /"CENTER LED" becomes a backdrop/.test(dialogText());
    t = await tap($('#dlg-confirm')); if (t !== true) return t; await wait(700);
    const s1 = screens[1] || {};
    out.cards = [!!card('CENTER LED'), !!card('BACKDROP'), !!card('LEFT LED'), !!card('RIGHT LED'), s1.deviceType, s1.name, $$('#mobile-main .mb-io-sec-count').map(txt).filter(x => /destination/.test(x)).join(''),
      $$('#mobile-main .mb-io-card').map(c => (txt($('.mb-io-badge', c)) + ' ' + (($('.mb-io-syname', c) || {}).value || '')).trim()).filter(x => /^D\d/.test(x))];
    t = await tap($('#topbar-nav-vp')); if (t !== true) return t; await wait(600);
    t = await tap($$('#mobile-main .mb-preset-card .mb-action-edit')[0]); if (t !== true) return t; await until(() => $('#mobile-main .mb-vis'), 1500); await wait(400);
    const v = $('#mobile-main .mb-vis'), vr = v.getBoundingClientRect(); const boxes = $$('.screen-box', v).map(b => ({ b, r: b.getBoundingClientRect() })).sort((a, b) => a.r.left - b.r.left);
    out.vis = [boxes.map(x => x.b.hasAttribute('data-backdrop') ? 'BD' : 'S').join(''), txt($('.screen-res', $('.screen-box[data-backdrop]', v))), boxes.every(x => x.r.left >= vr.left - 1 && x.r.right <= vr.right + 1)];
    t = await tap($('.screen-box[data-backdrop]', v)); if (t !== true) return t; await wait(800);
    out.tapped = [!!$('#screen-panel.lbbd-props'), ($('#lbbd-l') || {}).value, !!$('#layer-panel')];
    return is(out, { menu: ['Stream', 'Backdrop'], asked: true, cards: [false, false, true, true, 'Backdrop', 'BACKDROP', '5 total · 2 destination · 1 AUX · 1 DSM · 1 MV', ['D1 LEFT LED', 'D2 RIGHT LED']], vis: ['SBDS', 'BACKDROP · 10\' × 5\' 6"', true], tapped: [true, '10\'', false] },
      'the Type menu\'s last rows / the question / the I/O cards [CENTER LED, BACKDROP, LEFT LED, RIGHT LED, its Type, its name, the count, the destination cards] / the visualiser [left to right, its label, inside the box] / a tap on it [its size panel, Length, the layer panel]');
    } finally { tidy(); try { if (typeof closeScreenPanel === 'function') closeScreenPanel(); } catch (e) {} if (typeof mbCloseInlinePanel === 'function') { try { mbCloseInlinePanel(); } catch (e) {} } await wait(200); }
  });
  // 16kx-r2 PQ: NEW
  // 16kx-r2 (Omar's answer 2 on the phone), REAL taps and typing. FAILS on the round-1 page (its Length box is a number box that
  //   takes no ' or "), PASSES on 16kx-r2.
  await check('I/O 16kx-r2: on the phone the backdrop\'s Destination Properties takes its size in feet and inches typed with the phone\'s own curly marks (12’ 6” typed into Length, 8’ into Height, a tap on Apply): it is 12\' 6" × 8\' (150 × 96 inches, 2400 × 1536 px), the visualiser reads BACKDROP · 12\' 6" × 8\' and its destination row under it reads 12\' 6" × 8\'', async () => {
    const tidy = () => { try { if (typeof closeScreenPanel === 'function') closeScreenPanel(); } catch (e) {} if (typeof mbCloseInlinePanel === 'function') { try { mbCloseInlinePanel(); } catch (e) {} } };
    try {
    if (!$('#mobile-main .mb-vis .screen-box[data-backdrop]')) { let t0 = await tap($('#topbar-nav-vp')); if (t0 !== true) return t0; await wait(600); t0 = await tap($$('#mobile-main .mb-preset-card .mb-action-edit')[0]); if (t0 !== true) return t0; await until(() => $('#mobile-main .mb-vis'), 1500); await wait(400); }
    const bd = $('#mobile-main .mb-vis .screen-box[data-backdrop]'); if (!bd) return 'no backdrop on the visualiser';
    let t = await tap(bd); if (t !== true) return t; await until(() => $('#screen-panel.lbbd-props'), 1500); await wait(300);
    const L = $('#lbbd-l'), H = $('#lbbd-h'); if (!L || !H) return 'no Length / Height box';
    if (L.type !== 'text') return 'the Length box is a ' + L.type + ' box';
    t = await tap(L); if (t !== true) return t; L.select(); let ty = await runner('type', { text: '12’ 6”' }); if (ty && ty.error) return 'typing failed: ' + ty.error; await wait(150);
    t = await tap(H); if (t !== true) return t; H.select(); ty = await runner('type', { text: '8’' }); if (ty && ty.error) return 'typing failed: ' + ty.error; await wait(150);
    const typed = [L.value, H.value];
    t = await tap($('#sp-apply')); if (t !== true) return t; await wait(700);
    const s = screens.find(x => x.deviceType === 'Backdrop') || {}; const v = $('#mobile-main .mb-vis');
    const row = $$('#mobile-main .mb-le-head').find(h => txt($('.mb-le-name', h)) === s.name);
    const out = { typed, stored: [s.bdLin, s.bdHin, s.w, s.h], label: v ? txt($('.screen-res', $('.screen-box[data-backdrop]', v))) : 'no visualiser', row: row ? txt($('.mb-le-res', row)) : 'no destination row' };
    return is(out, { typed: ['12\' 6"', '8’'], stored: [150, 96, 2400, 1536], label: 'BACKDROP · 12\' 6" × 8\'', row: '12\' 6" × 8\'' }, 'the boxes as typed [Length after the tap away, Height] / stored [Length in, Height in, px, px] / the visualiser label / its destination row under the visualiser');
    } finally { tidy(); await wait(200); }
  });
  // 16kx-r2fix PR: NEW
  // 16kx-r2fix (a mis-tap on the phone), REAL taps. FAILS on 16kx-r2 (the row came back named BACKDROP 2 at 1920×1056 and Update
  //   Show wrote that), PASSES on 16kx-r2fix. "Changes nothing" is read from the show itself: on the phone the gesture tidy can keep
  //   an empty undo step (equal to the show) a moment longer, which the next Undo drops on the way; that is not a change.
  await check('I/O 16kx-r2fix: on the phone, a mis-tap on the Backdrop switch changes nothing: the Show card opens Edit Show Info, RIGHT LED\'s switch tapped on (the name box reads BACKDROP 2, the header its size in feet and inches) and off again gives the row back RIGHT LED and 1920×1080, and Update Show changes nothing in the show (an Undo right after would change nothing)', async () => {
    const tidy = () => { try { if (typeof _qsUp === 'function' && _qsUp()) closeQS(); } catch (e) {} };
    try {
    let t = true; try { if (typeof closeScreenPanel === 'function') closeScreenPanel(); } catch (e) {} await wait(200);
    if ($('#mobile-main .mb-back-btn')) { t = await tap($('#mobile-main .mb-back-btn')); if (t !== true) return t; await wait(500); }   /* back to the preset list, as a finger does */
    if (!$('#mobile-main .mb-guide-card')) { t = await tap($('#topbar-nav-vp')); if (t !== true) return t; await wait(600); }
    const card = $('#mobile-main .mb-guide-card'); if (!card) return 'no Show card';
    const S0 = _snapshot(), u0 = _undoStack.length; t = await tap(card); if (t !== true) return t; await until(() => _qsUp(), 1500); await wait(300);
    const hd = $('#qs-sr-2 .qs-screen-hdr'); if (!hd) return 'no RIGHT LED row';
    if (!$('#qs-sr-body-2').classList.contains('open')) { t = await tap(hd); if (t !== true) return t; await wait(300); }
    t = await tap($('#qs-bd-2')); if (t !== true) return t; await wait(300); const on = [($('#qs-sn-2') || {}).value, txt($('#qs-sr-lbl-2'))];
    t = await tap($('#qs-bd-2')); if (t !== true) return t; await wait(300); const off = [($('#qs-sn-2') || {}).value, txt($('#qs-sr-lbl-2'))];
    t = await tap($('#qs-confirm-btn')); if (t !== true) return t; await wait(700); okDialogs(); await wait(200);
    const s = screens[2] || {}, now = _snapshot(); const noUndo = _undoStack.length === u0 || _lbSameShow(_undoStack[_undoStack.length - 1], now);   /* the phone's gesture tidy may keep an EMPTY step a moment longer; an Undo drops it on the way (_lbDropEmptySteps) */
    return is({ on, off, after: [s.name, s.deviceType || '', s.w, s.h, _lbSameShow(S0, now), noUndo, _qsUp()] }, { on: ['BACKDROP 2', 'BACKDROP · 10\' × 5\' 6"'], off: ['RIGHT LED', '1920×1080'], after: ['RIGHT LED', 'LED', 1920, 1080, true, true, false] },
      'switch tapped on [name box, header] / off again [name box, header] / after Update Show [name, Type, px, px, the show unchanged, an Undo would change nothing, window open]');
    } finally { tidy(); await wait(200); }
  });
  // 16ky-iogrid P: NEW
  // 16ky-iogrid: the desktop I/O Patch Simple is a card grid now (Omar 2026-09-27); the phone keeps its own I/O cards. FAILS
  //   on 16kw (no grid is drawn at all), PASSES on 16ky.
  await check('I/O 16ky: the phone keeps its own I/O cards: the desktop card grid (the Simple I/O Patch of the desktop, Wire\'s cards in four sections) is drawn with the show but never shown on the phone; the phone\'s I/O view still shows one card per source, destination, AUX and multiviewer, reached by a tap, and none of them is a desktop grid card', async () => {
    if (!$('#mobile-main .mb-io')) { const t0 = await tap($('#topbar-nav-iop')); if (t0 !== true) return t0; await until(() => $('#mobile-main .mb-io'), 1500); await wait(300); }
    const g = $('#io-grid'); if (!g) return 'no desktop card grid in the page (the Simple I/O Patch is not a grid)';
    if (typeof _sysRender === 'function') { _sysRender(); await wait(200); }
    const shown = !!g.getClientRects().length && g.getBoundingClientRect().width > 0 && getComputedStyle($('#sys-overlay')).display !== 'none';
    const _r3Scr = (typeof _bdNoBd === 'function') ? _bdNoBd(screens).length : screens.length;   /* 16ky-r3: ADAPTED, a 16kx backdrop is in neither */
    const gridCards = $$('#io-grid .iog-card').length, want = srcNames().length + _r3Scr + dsms.length + multiviewers.length + ((typeof ioDests !== 'undefined' && Array.isArray(ioDests)) ? ioDests.length : 0);
    const phoneCards = $$('#mobile-main .mb-io-card').length, phoneWant = srcNames().length + _r3Scr + dsms.length + multiviewers.length;
    return is([gridCards === want, shown, phoneCards, $$('#mobile-main .iog-card').length], [true, false, phoneWant, 0], 'the grid holds every item / the grid is on screen / phone I/O cards / desktop grid cards inside the phone view');
  });
  // 16ky-r2 Q: NEW
  // 16ky-r2: the desktop Simple cards dropped Type and notes (Omar 2026-09-27: "leave it only for the advance page"); the phone
  //   keeps its own I/O cards WITH them, unchanged. Real taps and typing. FAILS on 16ky (the desktop grid the page draws still
  //   has Type and notes boxes), PASSES on 16ky-r2.
  await check('I/O 16ky-r2: the phone\'s I/O cards keep their Type and Notes (only the desktop Simple cards dropped them): every source and destination card still has its Type and its Notes box; a note typed on a source card (a tap in the box, the text typed, a tap away) is stored as that source\'s note and read back on its card; the desktop grid the page draws (never shown on the phone) has no Type and no notes box', async () => {
    const tidy = () => { try { _sysCloseMenu(); } catch (e) {} };
    try {
    if (!$('#mobile-main .mb-io')) { const t0 = await tap($('#topbar-nav-iop')); if (t0 !== true) return t0; await until(() => $('#mobile-main .mb-io'), 1500); await wait(300); }
    const notesOf = c => c ? $$('.mb-io-field', c).map(f => /^Notes$/i.test(txt($('.mb-io-flabel', f))) ? $('input.mb-io-input', f) : null).find(Boolean) || null : null;
    const cards = $$('#mobile-main .mb-io-card.mb-io-src, #mobile-main .mb-io-card.mb-io-dest');
    const has = [cards.length > 3, cards.filter(c => !$('[data-sys-field="src-type"], [data-sys-field="dst-type"]', c)).length, cards.filter(c => !notesOf(c)).length];
    const idx = $$('#mobile-main .mb-io-src').findIndex(c => notesOf(c) && !notesOf(c).value); if (idx < 0) return 'no source card with an empty note';
    const card = () => $$('#mobile-main .mb-io-src')[idx]; const sName = ($('.mb-io-syname', card()) || {}).value;
    let t = await tap(notesOf(card())); if (t !== true) return t; await wait(150);
    const ty = await runner('type', { text: 'KZ PHONE NOTE' }); if (ty && ty.error) return 'typing failed: ' + ty.error; await wait(150);
    t = await tap($('.mb-io-flabel', card())); if (t !== true) return t; await until(() => (_sysGetSourceMeta(sName) || {}).notes === 'KZ PHONE NOTE', 2500); await wait(400);
    const stored = [(_sysGetSourceMeta(sName) || {}).notes || '', (notesOf(card()) || {}).value || ''];
    if (typeof _sysRender === 'function') { _sysRender(); await wait(200); }
    const grid = $('#io-grid') ? $$('#io-grid [data-sys-field="src-type"], #io-grid [data-sys-field="dst-type"], #io-grid .sys-type-input, #io-grid .sys-notes-input, #io-grid [data-sys-field="notes"]').length : 'no desktop grid';
    return is({ has, stored, grid }, { has: [true, 0, 0], stored: ['KZ PHONE NOTE', 'KZ PHONE NOTE'], grid: 0 },
      'phone cards [more than three, cards without a Type, cards without a Notes box] / the typed note [stored on the source, on its card] / Type or notes controls in the desktop grid the page draws');
    } finally { tidy(); await wait(200); }
  });
  // 16ky-r3 R: NEW
  // 16ky-r3 (Omar 2026-09-27 ~21:40, "Yes, page 1 sets it"), REAL taps and typing: a Type or note is ONE value per item, the phone's
  // I/O card and I/O Patch Advanced page 1 alike. FAILS on the rebased page (page 1 keeps its copy), PASSES on 16ky-r3.
  await check('I/O 16ky-r3: the phone\'s I/O cards and I/O Patch Advanced page 1 hold ONE Type and note per item (Omar 2026-09-27: "Yes, page 1 sets it"): with page 1 built from the show, a note typed on the phone\'s LEFT LED card (a tap in its Notes box, the text typed, a tap away) and Monitor tapped in its Type menu are LEFT LED\'s own and show on its page-1 row at the next I/O Patch draw; a Type set on page 1\'s CAM 1 row shows on the phone\'s CAM 1 card', async () => {
    const tidy = () => { try { _sysCloseMenu(); } catch (e) {} };
    try {
    const L = screens.find(s => s.name === 'LEFT LED'); if (!L) return 'no LEFT LED';
    L.notes = ''; if (typeof _ioAdvSeedFromSimple === 'function') _ioAdvSeedFromSimple(true);   /* setup: an empty note to type into, page 1 built from the show (its first look on the desktop) */
    const p1 = () => (ioAdvanced.pages[0] || {}); if (!(p1().dests || []).some(r => r && r.name === 'LEFT LED')) return 'page 1 was not built';
    if (!$('#mobile-main .mb-io')) { const t0 = await tap($('#topbar-nav-iop')); if (t0 !== true) return t0; await until(() => $('#mobile-main .mb-io'), 1500); await wait(300); } else { window.renderMobileMain(); await wait(300); }
    const card = n => $$('#mobile-main .mb-io-card').find(c => (($('.mb-io-syname', c) || {}).value || '') === n);
    const notesOf = c => c ? $$('.mb-io-field', c).map(f => /^Notes$/i.test(txt($('.mb-io-flabel', f))) ? $('input.mb-io-input', f) : null).find(Boolean) || null : null;
    let t = await tap(notesOf(card('LEFT LED'))); if (t !== true) return t; await wait(150);
    const ty = await runner('type', { text: 'PHONE R3 NOTE' }); if (ty && ty.error) return 'typing failed: ' + ty.error; await wait(150);
    t = await tap($('.mb-io-flabel', card('LEFT LED'))); if (t !== true) return t; await until(() => L.notes === 'PHONE R3 NOTE', 2500); await wait(300);
    t = await tap($('[data-sys-field="dst-type"]', card('LEFT LED'))); if (t !== true) return t; await until(() => $('.sys-dd .sys-dd-item'), 1500); await wait(300);
    const it = $$('.sys-dd .sys-dd-item').find(i => /^Monitor$/.test(txt($('.item-text', i) || i))); if (!it) { tidy(); return 'no Monitor in the Type menu'; }
    t = await tap(it); if (t !== true) return t; await until(() => L.deviceType === 'Monitor', 1500); await wait(300);
    const own = [L.notes, L.deviceType];
    if (typeof _sysRender === 'function') { _sysRender(); await wait(200); }   /* the next I/O Patch draw */
    const r = (p1().dests || []).find(x => x && x.name === 'LEFT LED') || {};
    const pr = (p1().sources || []).find(x => x && x.name === 'CAM 1'); if (!pr) return 'no CAM 1 row on page 1';
    ioAdvanced.page = 0; _sysSetMeta('adv-src', pr.id, 'type', 'Mac'); window.renderMobileMain(); await wait(400);
    const chip = txt($('[data-sys-field="src-type"]', card('CAM 1')) || $('.sys-type-input', card('CAM 1')));
    return is({ own, page1: [r.notes, r.deviceType], cam: [(_sysGetSourceMeta('CAM 1') || {}).type, chip] }, { own: ['PHONE R3 NOTE', 'Monitor'], page1: ['PHONE R3 NOTE', 'Monitor'], cam: ['Mac', 'Mac'] },
      'LEFT LED after the taps [its note, its Type] / its page-1 row after the next I/O Patch draw [note, Type] / CAM 1 after page 1\'s Type [its own Type, its phone card\'s Type chip]');
    } finally { tidy(); await wait(200); }
  });
  // 16kx-r3 S: NEW
  // 16kx-r3 (Omar 2026-09-27: "no number count drops by one"), REAL taps. The phone checks before it leave CENTER LED a backdrop
  //   (16kx P). FAILS on the round-3 page (the cards and the layer rows keep the canvas numbers, D3; the Dest cell counts 3),
  //   PASSES on 16kx-r3.
  await check('I/O 16kx-r3: on the phone the backdrop has no number and the others are numbered without it: with CENTER LED a backdrop, the I/O cards read D1 LEFT LED and D2 RIGHT LED, the preset list\'s Dest cell counts 2, and P02\'s layer rows read D1·L… for LEFT LED and D2·L… for RIGHT LED (one number per destination on the phone, the same as the desktop\'s)', async () => {
    try {
    const bd = screens.find(s => s.deviceType === 'Backdrop'); if (!bd) return 'no backdrop left by the phone checks before';
    const nm = sid => (screens.find(s => s.id === sid) || {}).name || '?';
    if (!$('#mobile-main .mb-io')) { const t0 = await tap($('#topbar-nav-iop')); if (t0 !== true) return t0; await until(() => $('#mobile-main .mb-io'), 1500); await wait(300); } else { window.renderMobileMain(); await wait(300); }
    const cards = $$('#mobile-main .mb-io-card').map(c => (txt($('.mb-io-badge', c)) + ' ' + (($('.mb-io-syname', c) || {}).value || '')).trim()).filter(x => /^D\d/.test(x));
    let t = await tap($('#topbar-nav-vp')); if (t !== true) return t; await wait(600);
    if ($('#mobile-main .mb-back-btn')) { t = await tap($('#mobile-main .mb-back-btn')); if (t !== true) return t; await wait(500); }
    const cell = $$('#mobile-main .mb-preset-card')[0] ? $$('.mb-bb-cell', $$('#mobile-main .mb-preset-card')[0]).find(c => /Dest/.test(txt($('.mb-bb-label', c)))) : null;
    const dest = cell ? txt($('strong', cell)) : 'no Dest cell';
    t = await tap($$('#mobile-main .mb-preset-card .mb-action-edit')[1]); if (t !== true) return t; await until(() => $('#mobile-main .mb-vis'), 1500); await wait(400);   /* P02: layers on LEFT LED and RIGHT LED */
    const rows = $$('#mobile-main .mb-le-layerrow').map(r => { const k = (r.dataset.key || '').split(':'); return nm(k[1]) + ' ' + txt($('.mb-le-icon.layer', r)).split('·')[0]; }).filter((x, i, a) => a.indexOf(x) === i);
    return is({ cards, dest, rows: rows.filter(x => /^(LEFT|RIGHT) LED /.test(x)) }, { cards: ['D1 LEFT LED', 'D2 RIGHT LED'], dest: '2', rows: ['LEFT LED D1', 'RIGHT LED D2'] },
      'the I/O cards [number, name] / the first preset card\'s Dest cell / P02\'s layer rows [destination, the D number on the row]');
    } finally { if (typeof mbCloseInlinePanel === 'function') { try { mbCloseInlinePanel(); } catch (e) {} } await wait(200); }
  });
  // 16ky-r4fix T: NEW
  // 16ky-r4fix (the round-4 attack: the phone's + DEST gave a second "Destination 03"), REAL taps. The phone checks before it leave
  //   CENTER LED a backdrop (LEFT LED | BACKDROP | RIGHT LED); RIGHT LED is given the name "Destination 03" for this check (a show
  //   whose screens kept Quick Setup's names) and gets its name back after it. FAILS on the round-4 page (the new one is a second
  //   "Destination 03"), PASSES on 16ky-r4fix.
  await check('I/O 16ky-r4fix: the phone\'s + DEST never gives a name the show already has: with LEFT LED | BACKDROP | Destination 03, a tap on + DEST adds Destination 04 (its number without the backdrop, 03, is taken)', async () => {
    const r = screens.find(s => s.name === 'RIGHT LED'); if (!r || !screens.some(s => s.deviceType === 'Backdrop')) return 'no RIGHT LED or no backdrop left by the phone checks before';
    const ids0 = screens.map(s => s.id); r.name = 'Destination 03';
    try {
      let t = true; const seen = el => !!el && el.getBoundingClientRect().width > 0;
      if (!seen($('#mobile-main .mb-le-addbtn.dest:not(.rem)'))) {   /* S leaves P02's Edit Preset open; otherwise the preset list, then a preset's pencil */
        if (seen($('#mobile-main .mb-back-btn'))) { t = await tap($('#mobile-main .mb-back-btn')); if (t !== true) return t; await wait(500); }
        if (!seen($$('#mobile-main .mb-preset-card .mb-action-edit')[0])) { t = await tap($('#topbar-nav-vp')); if (t !== true) return t; await wait(600); }
        t = await tap($$('#mobile-main .mb-preset-card .mb-action-edit')[0]); if (t !== true) return t; await until(() => $('#mobile-main .mb-le-addbtn.dest:not(.rem)'), 1500); await wait(300);
      }
      window.renderMobileMain(); await wait(300);   /* the rows read the name given above */
      t = await tap($('#mobile-main .mb-le-addbtn.dest:not(.rem)')); if (t !== true) return t; await wait(500);
      const added = screens.filter(s => !ids0.includes(s.id)).map(s => s.name);
      return is({ added, names: screens.map(s => s.name) }, { added: ['Destination 04'], names: ['LEFT LED', 'BACKDROP', 'Destination 03', 'Destination 04'] }, 'the new destination\'s name / the show\'s destinations');
    } finally {
      const x = screens.filter(s => !ids0.includes(s.id)); x.forEach(s => { try { deleteScreen(s.id); } catch (e) {} }); r.name = 'RIGHT LED';
      if (typeof mbCloseInlinePanel === 'function') { try { mbCloseInlinePanel(); } catch (e) {} } try { window.renderMobileMain(); } catch (e) {} await wait(300);
    }
  });
  // 16kz-answers U: NEW
  // 16kz-answers (C) on the phone (Omar's answer 8, "refuse outputs too"), REAL taps and typing. The phone checks before it leave
  //   LEFT LED | BACKDROP | RIGHT LED with DSM 1 and AUX 1. FAILS on the committed 16ky page (the phone card takes the name),
  //   PASSES on 16kz-answers.
  const _kzToIo = async () => {   /* the I/O cards the way a finger gets there: Back from a preset's editor (it hides the top bar), then I/O Patch */
    if ($('#mobile-main .mb-io')) return true; let t = true;
    if ($('#mobile-main .mb-back-btn')) { t = await tap($('#mobile-main .mb-back-btn')); if (t !== true) return t; await wait(500); }
    t = await tap($('#topbar-nav-iop')); if (t !== true) return t; await until(() => $('#mobile-main .mb-io'), 1500); await wait(400); return true; };
  await check('I/O 16kz-answers: on the phone an output card renamed into a name another output has is refused like a source: RIGHT LED typed "LEFT LED" and AUX 1 typed "dsm 1" (a tap away each) say Name in use, a tap on OK, and the cards and the show keep RIGHT LED and AUX 1; a free name ("RIGHT WALL") is taken', async () => {
    const out = {}; const card = n => $$('#mobile-main .mb-io-card').find(c => (($('.mb-io-syname', c) || {}).value || '') === n) || null;
    const names = () => screens.map(s => s.name).concat(dsms.map(d => d.name)); const was = screens.map(s => [s, s.name]).concat(dsms.map(d => [d, d.name]));
    try {
      let t = await _kzToIo(); if (t !== true) return t;
      const typeOn = async (n, v) => {
        const inp = $('.mb-io-syname', card(n) || document.body); if (!inp || !card(n)) return 'no ' + n + ' card';
        let r = await tap(inp); if (r !== true) return r; if (document.activeElement !== inp) return 'the tap did not put the cursor in the name field';
        inp.select(); const ty = await runner('type', { text: v }); if (ty && ty.error) return 'typing failed: ' + ty.error; await wait(150);
        r = await tap($('#mobile-main .mb-io-section')); if (r !== true) return r; await until(() => dlgOpen(), 1200); await wait(200);
        const q = dlgOpen() ? dialogText() : null; if (q) { r = await tap($('#dlg-confirm')); if (r !== true) return r; await wait(400); }
        return [!!q && /Name in use/.test(q) && q.indexOf('"' + v + '"') >= 0, !!card(n), names().includes(n)];
      };
      out.dest = await typeOn('RIGHT LED', 'LEFT LED'); out.aux = await typeOn('AUX 1', 'dsm 1'); out.free = await typeOn('RIGHT LED', 'RIGHT WALL');
      out.names = names();
      return is(out, { dest: [true, true, true], aux: [true, true, true], free: [false, false, false], names: ['LEFT LED', 'BACKDROP', 'RIGHT WALL', 'DSM 1', 'AUX 1'] },
        'RIGHT LED typed "LEFT LED" [Name in use said, its card, its name] / AUX 1 typed "dsm 1" / RIGHT LED typed "RIGHT WALL" [said, the old card, the old name] / the names after');
    } finally { was.forEach(x => { x[0].name = x[1]; }); okDialogs(); try { window.renderMobileMain(); } catch (e) {} await wait(300); }   /* every name back, whatever happened */
  });
  // 16kz-answers V: NEW
  // 16kz-answers (D) on the phone (Omar's answer 9), REAL taps: DSM 1 is given the name AUX3 for this check (a show whose AUX
  //   was renamed), so the count + 1 (3) is taken. FAILS on the committed 16ky page (a second AUX3), PASSES on 16kz-answers.
  await check('I/O 16kz-answers: the phone\'s + AUX gives the next free AUX name, never one in use: with AUX3 and AUX 1, a tap on + AUX adds AUX4 (its number, 3, is taken)', async () => {
    const d0 = dsms.find(d => d.name === 'DSM 1'); if (!d0) return 'no DSM 1'; const ids0 = dsms.map(d => d.id); d0.name = 'AUX3';
    try {
      let t = true; const seen = el => !!el && el.getBoundingClientRect().width > 0;
      if (!seen($('#mobile-main .mb-le-addbtn.aux:not(.rem)'))) {
        t = await tap($('#topbar-nav-vp')); if (t !== true) return t; await wait(600);
        if (seen($('#mobile-main .mb-back-btn'))) { t = await tap($('#mobile-main .mb-back-btn')); if (t !== true) return t; await wait(500); }
        t = await tap($$('#mobile-main .mb-preset-card .mb-action-edit')[0]); if (t !== true) return t; await until(() => $('#mobile-main .mb-le-addbtn.aux:not(.rem)'), 1500); await wait(300);
      }
      window.renderMobileMain(); await wait(300);
      t = await tap($('#mobile-main .mb-le-addbtn.aux:not(.rem)')); if (t !== true) return t; await wait(500);
      const added = dsms.filter(d => !ids0.includes(d.id)).map(d => d.name);
      return is({ added, names: dsms.map(d => d.name) }, { added: ['AUX4'], names: ['AUX3', 'AUX 1', 'AUX4'] }, 'the new AUX\'s name / the show\'s AUX / DSM outputs');
    } finally {
      dsms.filter(d => !ids0.includes(d.id)).forEach(d => { const i = dsms.indexOf(d); if (i >= 0) dsms.splice(i, 1); presets.forEach(p => { if (p.dsmOn) delete p.dsmOn[d.id]; }); }); d0.name = 'DSM 1';
      if (typeof mbCloseInlinePanel === 'function') { try { mbCloseInlinePanel(); } catch (e) {} } try { window.renderMobileMain(); } catch (e) {} await wait(300);
    }
  });
  // 16kz-answers W: NEW
  // 16kz-answers (F) on the phone (Omar's answer 11, "agreed dont allow"), REAL taps: RIGHT LED is made a backdrop for this check
  //   (the app's own conversion; every other screen, so LEFT LED is the only screen left). FAILS on the committed 16ky page (Backdrop is offered and asks),
  //   PASSES on 16kz-answers. The I/O section's restore after it puts the show back.
  await check('I/O 16kz-answers: on the phone the only screen left never becomes a backdrop: with LEFT LED the only screen, its card\'s Type menu ends with Backdrop greyed ("A show needs at least one screen"), and a tap on it asks nothing, the menu stays and LEFT LED keeps its Type', async () => {
    const keep = screens.find(s => s.deviceType !== 'Backdrop'); if (!keep || keep.name !== 'LEFT LED') return 'LEFT LED is not the first screen'; pushUndo(); screens.filter(s => s !== keep && s.deviceType !== 'Backdrop').forEach(s => _bdConvert(s));
    if (screens.filter(s => s.deviceType !== 'Backdrop').length !== 1) return 'LEFT LED is not the only screen';
    const tidy = () => { try { _sysCloseMenu(); } catch (e) {} };
    try {
      let t = await _kzToIo(); if (t !== true) return t; window.renderMobileMain(); await wait(300);
      const card = $$('#mobile-main .mb-io-card').find(c => (($('.mb-io-syname', c) || {}).value || '') === 'LEFT LED'); if (!card) return 'no LEFT LED card';
      const type0 = (screens.find(s => s.name === 'LEFT LED') || {}).deviceType;   /* whatever the checks before left it */
      t = await tap($('[data-sys-field="dst-type"]', card)); if (t !== true) return t; await until(() => $('.sys-dd .sys-dd-item'), 1500); await wait(300);
      const it = $$('.sys-dd .sys-dd-item').pop(); const last = it ? [(($('.item-text', it) || it).textContent || '').trim(), it.classList.contains('disabled'), it.getAttribute('aria-disabled'), it.title, (($('.item-meta', it) || {}).textContent || '')] : null;
      if (it) { t = await tap(it); if (t !== true) return t; await wait(500); }
      const lt = (screens.find(s => s.name === 'LEFT LED') || {}).deviceType; const after = [dlgOpen(), !!$('.sys-dd'), lt === type0 && lt !== 'Backdrop'];
      return is({ last, after }, { last: ['Backdrop', true, 'true', 'A show needs at least one screen', 'A show needs at least one screen'], after: [false, true, true] }, 'the Type menu\'s last row [label, greyed, aria-disabled, its reason, the reason under it] / after a tap on it [a question, the menu still open, LEFT LED\'s Type unchanged]');
    } finally { tidy(); okDialogs(); await wait(200); }
  });
  // 16kz-refresh X1: NEW
  // 16kz-refresh (J) R6 on the phone (Omar: "all recommended"), REAL taps and typing: the phone's I/O cards get a Refresh box next to
  //   Resolution, the same menu and the same storage (the item's own rate). FAILS on the first builder's 16kz-answers page (no
  //   Refresh box), PASSES on 16kz-refresh. The I/O section's restore after it puts the show back.
  await check('I/O 16kz-refresh: on the phone an I/O card has a Refresh box next to its Resolution (a full-size touch target, the same row): a tap opens the same menu (Custom…, — Clear —, 23.98 … 120), a tap on 59.94 stores LEFT LED\'s own rate (one undo step) and the box reads 59.94 Hz; on a source card Custom… types in place (47.952 typed, a tap away) and it is the source\'s own rate', async () => {
    await restore(); const out = {}; const card = n => $$('#mobile-main .mb-io-card').find(c => (($('.mb-io-syname', c) || {}).value || '') === n) || null;
    const item = re => $$('.sys-dd .sys-dd-item').find(i => re.test(txt($('.item-text', i) || i)));
    try {
      let t = await _kzToIo(); if (t !== true) return t; window.renderMobileMain(); await wait(300);
      const c = card('LEFT LED'); if (!c) return 'no LEFT LED card'; const box = $('[data-sys-field="refresh"]', c);
      if (!box) return 'LEFT LED\'s card has no Refresh box';
      const b = box.getBoundingClientRect(), s = $('[data-sys-field="resolution"]', c).getBoundingClientRect();
      out.box = [txt(box), b.width >= 44 && b.height >= 44, Math.abs((b.top + b.height / 2) - (s.top + s.height / 2)) < 4 && b.left >= s.right - 1];
      const u0 = _undoStack.length; t = await tap(box); if (t !== true) return t; await until(() => $('.sys-dd .sys-dd-item'), 1500); await wait(250);
      out.menu = $$('.sys-dd .sys-dd-item').map(i => txt($('.item-text', i) || i));
      t = await tap(item(/^59\.94$/)); if (t !== true) return t; await until(() => !$('.sys-dd'), 1500); await wait(400);
      out.pick = [(screens.find(x => x.name === 'LEFT LED') || {}).refresh, _undoStack.length - u0, txt($('[data-sys-field="refresh"]', card('LEFT LED')))];
      const sn = (($('.mb-io-syname', $$('#mobile-main .mb-io-src')[0]) || {}).value) || '';
      t = await tap($('[data-sys-field="refresh"]', $$('#mobile-main .mb-io-src')[0])); if (t !== true) return t; await until(() => $('.sys-dd .sys-dd-item'), 1500); await wait(250);
      t = await tap(item(/^Custom/)); if (t !== true) return t; await wait(400);
      const inp = document.activeElement; out.typeBox = !!inp && !!inp.dataset && inp.dataset.sysField === 'custom-rf';
      const ty = await runner('type', { text: '47.952' }); if (ty && ty.error) return 'typing failed: ' + ty.error; await wait(150);
      t = await tap($('#mobile-main .mb-io-section')); if (t !== true) return t; await wait(600);
      out.custom = [(_sysGetSourceMeta(sn) || {}).refresh, txt($('[data-sys-field="refresh"]', $$('#mobile-main .mb-io-src')[0]))];
      return is(out, { box: ['— Hz —', true, true], menu: ['Custom…', '— Clear —', '23.98', '24', '25', '29.97', '30', '50', '59.94', '60', '120'], pick: ['59.94', 1, '59.94 Hz'], typeBox: true, custom: ['47.952', '47.952 Hz'] },
        'LEFT LED\'s Refresh box [its words, 44 px or more, beside Resolution on the same row] / its menu / 59.94 tapped [LEFT LED\'s own rate, undo steps, the box] / Custom… on a source card [the typing box has the cursor] / 47.952 typed, a tap away [the source\'s own rate, the box]');
    } finally { try { _sysCloseMenu(); } catch (e) {} okDialogs(); await wait(200); }
  });
  // 16kz-refresh X2: NEW
  // 16kz-refresh (L1) on the phone (Omar 2026-09-28 ~18:50, "all recommended"), REAL taps: LEFT LED and CENTER LED are made backdrops
  //   for this check (the app's own conversion), so RIGHT LED, the last destination, is the only screen: − DEST never deletes it.
  //   FAILS on the first builder's 16kz-answers page (it asks "Remove destination?"), PASSES on 16kz-refresh.
  await check('I/O 16kz-refresh: on the phone − DEST never deletes the only screen: with LEFT LED and CENTER LED backdrops (RIGHT LED, the last destination, the only screen) a tap on − DEST says "A show needs at least one screen", asks nothing and deletes nothing; after + DEST (a second screen) − DEST asks "Remove destination?" as before (Cancel keeps it)', async () => {
    await restore(); const out = {}; const nm = s => s.name + (s.deviceType === 'Backdrop' ? ' [bd]' : '');
    try {
      pushUndo(); screens.filter(s => s.name === 'LEFT LED' || s.name === 'CENTER LED').forEach(s => _bdConvert(s)); out.show = screens.map(nm);
      await openEdit(presets[0].id); await wait(300);
      const u0 = _undoStack.length; let t = await tap($('#mobile-main .mb-le-addbtn.dest.rem')); if (t !== true) return t; await until(dlgOpen, 1500);
      const d1 = dialogText(); out.minus = [/A show needs at least one screen/.test(d1), /Remove destination\?/.test(d1)];
      t = await tap($(/Remove destination\?/.test(d1) ? '#dlg-cancel' : '#dlg-confirm')); if (t !== true) return t; await wait(400);
      out.after = [screens.map(nm), _undoStack.length - u0];
      t = await tap($('#mobile-main .mb-le-addbtn.dest:not(.rem)')); if (t !== true) return t; await until(() => screens.length === 4, 1500); await wait(300);
      t = await tap($('#mobile-main .mb-le-addbtn.dest.rem')); if (t !== true) return t; await until(dlgOpen, 1500); out.ask = /Remove destination\?/.test(dialogText());
      t = await tap($('#dlg-cancel')); if (t !== true) return t; await wait(350); out.kept = screens.length;
    } finally { okDialogs(); await wait(200); await restore(); }
    return is(out, { show: ['BACKDROP [bd]', 'BACKDROP 2 [bd]', 'RIGHT LED'], minus: [true, false], after: [['BACKDROP [bd]', 'BACKDROP 2 [bd]', 'RIGHT LED'], 0], ask: true, kept: 4 },
      'the show / − DEST [said, asked Remove destination?] / after it [the show, undo steps] / after + DEST, − DEST asks / Cancel keeps it');
  });
  // 16kz-fix M1: NEW
  // 16kz-fix (J R6) on the phone, REAL taps to the I/O cards and the runner's own phone sizes: the Refresh box squeezed the Resolution
  //   box ("1920×1080" read "1920×108" at 360 px wide, "— Set resolution —" was cut at 390). FAILS on the second builder's
  //   16kz-refresh page (r16kz/build2, f715089b), PASSES on 16kz-fix. The phone is put back to its portrait size after it.
  await check('I/O 16kz-fix: on the phone an I/O card\'s Resolution box keeps its whole text next to the Refresh box: at 390, 360 and 320 px wide every card\'s resolution reads whole, the Refresh box is a full-size touch target inside its card, beside the resolution when both fit (LEFT LED at 390 px) and on the line under it when they do not', async () => {
    await restore(); const out = {}; const card = n => $$('#mobile-main .mb-io-card').find(c => (($('.mb-io-syname', c) || {}).value || '') === n) || null;
    const scan = () => { const cut = [], small = [], outside = []; let n = 0;
      $$('#mobile-main .mb-io-card').forEach(c => { const rp = $('[data-sys-field="resolution"]', c), rf = $('[data-sys-field="refresh"]', c), nm = (($('.mb-io-syname', c) || {}).value) || '?'; if (!rp) return; n++;
        const lab = $('.pill-label', rp) || rp; if (lab.scrollWidth > lab.clientWidth + 1) cut.push(nm + ' "' + txt(lab) + '"');
        if (rf) { const b = rf.getBoundingClientRect(), cr = c.getBoundingClientRect(); if (b.height < 44 || b.width < 44) small.push(nm); if (b.right > cr.right + 0.5 || b.left < cr.left - 0.5) outside.push(nm); } });
      return [n > 5, cut, small, outside]; };
    const beside = () => { const c = card('LEFT LED'); if (!c) return 'no LEFT LED card'; const b = $('[data-sys-field="refresh"]', c).getBoundingClientRect(), s = $('[data-sys-field="resolution"]', c).getBoundingClientRect(); return Math.abs((b.top + b.height / 2) - (s.top + s.height / 2)) < 4 && b.left >= s.right - 1; };
    try {
      let t = await _kzToIo(); if (t !== true) return t; window.renderMobileMain(); await wait(300);
      out.p390 = scan().concat([beside()]);
      await rotate([360, 740]); window.renderMobileMain(); await wait(300); out.p360 = scan();
      await rotate([320, 568]); window.renderMobileMain(); await wait(300); out.p320 = scan();
    } finally { await rotate(PORTRAIT); try { window.renderMobileMain(); } catch (e) {} await wait(300); okDialogs(); }
    return is(out, { p390: [true, [], [], [], true], p360: [true, [], [], []], p320: [true, [], [], []] },
      'at 390 px [cards, resolutions cut, Refresh boxes under 44 px, Refresh boxes outside their card, LEFT LED\'s Refresh beside its resolution] / at 360 px [the same] / at 320 px [the same]');
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

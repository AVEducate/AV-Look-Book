#!/usr/bin/env node
// AV Look Book — phone stage of the regression gate. No dependencies: Node 22+ and Chrome.
//
//   node tests/run_mobile_stage.mjs            compare the phone build against tests/golden/mobile.json (exit 1 on any diff)
//   node tests/run_mobile_stage.mjs --golden   rebuild tests/golden/mobile.json from the current page (only from a version you trust)
//
// The phone build cannot share the desktop page load: it needs its OWN load with phone emulation switched on BEFORE the
// page boots (390x844, mobile:true, touch, a phone user agent and window.LB_FORCE_MOBILE=true). One DevTools socket stays
// open for the whole run, because the emulation resets when the socket closes.
// tests/mobile_probe.js runs inside the page and asserts; this runner is its hands: through the binding window.lbRunner
// the probe asks for REAL touch taps (Input.dispatchTouchEvent, so a control buried under another layer fails the way it
// does for a finger), for a rotation to 844x390 and back, and for a show file to be put into a file input.
// Checks are {name, ok, detail?} compared by name and ok state, exactly like the flows stage: a check that fails at golden
// time is a KNOWN ISSUE. Budgets (tap targets under 44 px, text under 11 px, per screen) fail only when a count RISES.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync, createReadStream } from 'node:fs';
import { join, dirname, normalize, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = existsSync(join(HERE, '..', 'deploy', 'lookbook_builder.html')) ? join(HERE, '..') : '/Users/aveducate/LookBook';
const DEPLOY = resolve(process.env.LB_DEPLOY || join(REPO, 'deploy'));
const PACKET = resolve(process.env.LB_PACKET || join(REPO, 'site', 'packets', 'Town Hall.avlb'));
const GOLDEN = join(HERE, 'golden');
const OUT = join(HERE, 'out');
const PORT = parseInt(process.env.LB_MOBILE_HTTP || '8205', 10), CDP = parseInt(process.env.LB_MOBILE_CDP || '9405', 10);
const golden = process.argv.includes('--golden');
const quiet = process.argv.includes('--quiet');          // only the summary lines (run_smoke.mjs style)
const CHROME = process.env.LB_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROBE = process.env.LB_MOBILE_PROBE || join(HERE, 'mobile_probe.js');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PORTRAIT = [390, 844], LANDSCAPE = [844, 390];
const PROBE_LIMIT = 240000;   // a healthy run takes about a minute

const sleep = ms => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
const probeSrc = readFileSync(PROBE, 'utf8');

// ── a read-only static server for deploy/ (GET and HEAD only, nothing outside the folder) ────────────────────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  let p; try { p = normalize(join(DEPLOY, decodeURIComponent(new URL(req.url, 'http://x').pathname))); } catch { res.writeHead(400); res.end(); return; }
  if (p !== DEPLOY && !p.startsWith(DEPLOY + sep)) { res.writeHead(403); res.end(); return; }
  let st; try { st = statSync(p); } catch { res.writeHead(404); res.end(); return; }
  if (!st.isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(p).toLowerCase()] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store' });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(p).pipe(res);
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, '127.0.0.1', resolve); });

mkdirSync(OUT, { recursive: true });
const profile = join(OUT, 'chrome-profile-' + process.pid);   // a clean profile every run (no autosave draft, so the app boots to the empty state); tests/out/ is git-ignored
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--mute-audio', '--hide-scrollbars',
  '--remote-debugging-port=' + CDP, '--user-data-dir=' + profile, '--window-size=' + PORTRAIT.join(','), 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const chromeGone = new Promise(r => chrome.once('exit', r));
const cleanup = () => { if (cleaned) return; cleaned = true; try { chrome.kill(); } catch {} try { server.close(); server.closeAllConnections(); } catch {} try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {} };
// the tidy way out: Chrome is still writing to its profile for a moment after the kill, so wait for it to be gone before the folder is removed
const shutdown = async () => { try { chrome.kill(); } catch {} await Promise.race([chromeGone, sleep(4000)]); await sleep(300); cleanup(); };
process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(130); }); process.on('SIGTERM', () => { cleanup(); process.exit(143); });

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json();
      const t = list.find(x => x.type === 'page');
      if (t) return t;
    } catch {}
    await sleep(250);
  }
  throw new Error('Chrome did not expose a page target on port ' + CDP);
}

const pageErrors = [];   // { where, text } — exceptions and console errors raised by the app while the probe runs
let where = 'boot';
const listeners = new Set();
function connect(url) {
  const ws = new WebSocket(url); let id = 0; const pending = new Map();
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
    if (d.method === 'Runtime.exceptionThrown') { const x = d.params.exceptionDetails; pageErrors.push({ where, text: 'exception: ' + ((x.exception && x.exception.description) || x.text || '').split('\n')[0] }); }
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') pageErrors.push({ where, text: 'console.error: ' + d.params.args.map(a => a.value !== undefined ? String(a.value) : (a.description || '')).join(' ').slice(0, 240) });
    // not app errors: the missing favicon, and Chrome noting the "leave without saving?" prompt when the runner navigates away
    else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon\.ico/.test(d.params.entry.url || '') && !/beforeunload/.test(d.params.entry.text || '')) pageErrors.push({ where, text: 'log: ' + String(d.params.entry.text).slice(0, 200) + ' ' + (d.params.entry.url || '').replace(/^https?:\/\/[^/]+/, '') });
    // the app never uses a native alert / confirm (it has ONE dialog, #dlg-overlay); one appearing would hang a phone run, so answer it and report it
    else if (d.method === 'Page.javascriptDialogOpening') { pageErrors.push({ where, text: 'native dialog: ' + d.params.type + ' ' + String(d.params.message).slice(0, 120) }); send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); }
    for (const l of listeners) l(d);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, d => d.error ? reject(new Error(method + ': ' + d.error.message)) : resolve(d.result));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return new Promise((resolve, reject) => { ws.onopen = () => resolve({ ws, send }); ws.onerror = () => reject(new Error('CDP socket failed')); });
}
function once(method, ms) {
  return new Promise(resolve => {
    const l = d => { if (d.method === method) { listeners.delete(l); clearTimeout(t); resolve(d.params); } };
    const t = setTimeout(() => { listeners.delete(l); resolve(null); }, ms);
    listeners.add(l);
  });
}

async function evalJs(send, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 600000 });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}

async function setPhone(send, w, h) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 3, mobile: true, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setUserAgentOverride', { userAgent: UA, platform: 'iPhone' });
}

async function loadApp(send) {
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/lookbook_builder.html?mobile=' + Date.now() });
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    try { if (await evalJs(send, "document.readyState==='complete' && typeof lbOpenExample==='function' && typeof renderMobileMain==='function'")) return; } catch {}
  }
  throw new Error('the app did not finish loading');
}

async function tap(send, x, y) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(40);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// what the probe may ask the runner to do (window.lbRunner in the page)
async function runnerOp(send, op, a) {
  if (op === 'where') { where = String(a.text || 'mobile'); return true; }
  if (op === 'tap') { await tap(send, a.x, a.y); return true; }
  if (op === 'size') { await setPhone(send, a.w, a.h); await sleep(350); return true; }
  if (op === 'type') { await send('Input.insertText', { text: String(a.text) }); return true; }   // typed into whatever the last tap focused
  // tap a control that should raise the system file picker, and answer the picker with the Town Hall packet
  if (op === 'chooseFile') {
    await send('Page.setInterceptFileChooserDialog', { enabled: true });
    try {
      const opened = once('Page.fileChooserOpened', 2500);
      await tap(send, a.x, a.y);
      const ev = await opened;
      if (!ev) return { opened: false };
      await send('DOM.setFileInputFiles', { files: [PACKET], backendNodeId: ev.backendNodeId });
      return { opened: true };
    } finally { await send('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {}); }
  }
  // put the Town Hall packet straight into a file input (the load path itself, without the button in front of it)
  if (op === 'setFiles') {
    const doc = await send('DOM.getDocument', { depth: 0 });
    const n = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: a.selector });
    if (!n.nodeId) return { found: false };
    await send('DOM.setFileInputFiles', { files: [PACKET], nodeId: n.nodeId });
    return { found: true };
  }
  throw new Error('unknown runner op ' + op);
}

let failed = false, known = 0;
try {
  if (!existsSync(PACKET)) throw new Error('the Town Hall packet is missing: ' + PACKET);
  const t = await target();
  const { ws, send } = await connect(t.webSocketDebuggerUrl);
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('DOM.enable');
  await send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});   // nothing a test exports may land on the disk
  mkdirSync(OUT, { recursive: true }); if (golden) mkdirSync(GOLDEN, { recursive: true });

  // the phone must be a phone BEFORE the page boots
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.LB_FORCE_MOBILE=true;' });
  await setPhone(send, ...PORTRAIT);
  await send('Runtime.addBinding', { name: 'lbRunner' });
  listeners.add(async d => {
    if (d.method !== 'Runtime.bindingCalled' || d.params.name !== 'lbRunner') return;
    let req; try { req = JSON.parse(d.params.payload); } catch { return; }
    if (process.env.LB_MOBILE_DEBUG) console.error('  [runner] ' + req.op + ' ' + JSON.stringify(req.args || {}));
    let result, error = null;
    try { result = await Promise.race([runnerOp(send, req.op, req.args || {}), sleep(8000).then(() => { throw new Error('DevTools did not finish "' + req.op + '" within 8 s'); })]); } catch (e) { error = String((e && e.message) || e); }
    await send('Runtime.evaluate', { expression: 'window.__lbRunnerDone && window.__lbRunnerDone(' + JSON.stringify(req.id) + ',' + JSON.stringify(result === undefined ? null : result) + ',' + JSON.stringify(error) + ')' }).catch(() => {});
  });

  where = 'mobile';
  await loadApp(send);
  const mobile = await Promise.race([
    evalJs(send, '(' + probeSrc + ')(' + JSON.stringify({ portrait: PORTRAIT, landscape: LANDSCAPE }) + ')'),
    sleep(PROBE_LIMIT).then(() => { throw new Error('the phone probe did not finish within ' + PROBE_LIMIT / 1000 + ' s (last section: ' + where + ')'); })]);
  await setPhone(send, ...PORTRAIT);

  // page errors are compared against the golden below like the flows stage does; the line here makes them show in the check list too
  mobile.checks.push(pageErrors.length ? { name: 'no page errors during the phone run (exceptions, console.error, native dialogs)', ok: false, detail: pageErrors.map(e => '[' + e.where + '] ' + e.text).join(' || ').slice(0, 600) } : { name: 'no page errors during the phone run (exceptions, console.error, native dialogs)', ok: true });
  const result = { checks: mobile.checks, budgets: mobile.budgets, pageErrors };
  writeFileSync(join(OUT, 'mobile.json'), JSON.stringify(result, null, 1));
  const bad = mobile.checks.filter(c => !c.ok);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (!quiet) {
    mobile.checks.forEach(c => console.log((c.ok ? '  ✓ ' : '  ✗ ') + c.name + (c.ok ? '' : ' — ' + c.detail)));
    Object.keys(mobile.budgets).forEach(k => console.log('  · budget ' + k + ': ' + mobile.budgets[k].smallTaps + ' tap targets under 44 px, ' + mobile.budgets[k].smallText + ' texts under 11 px'));
  }
  if (golden) {
    writeFileSync(join(GOLDEN, 'mobile.json'), JSON.stringify(result, null, 1));
    console.log('golden written: mobile (' + mobile.checks.length + ' checks, ' + bad.length + ' known issues, ' + Object.keys(mobile.budgets).length + ' screen budgets, ' + pageErrors.length + ' page errors, ' + secs + ' s)');
    bad.forEach(c => console.log('    known issue: ' + c.name + ' — ' + c.detail));
    pageErrors.forEach(e => console.log('    page error [' + e.where + ']: ' + e.text));
  } else {
    const gf = join(GOLDEN, 'mobile.json');
    if (!existsSync(gf)) { failed = true; console.log('✗ mobile: no golden yet (run with --golden from a trusted version)'); }
    else {
      const G = JSON.parse(readFileSync(gf, 'utf8')); const gmap = new Map(G.checks.map(c => [c.name, c]));
      const fresh = [], fixed = [], gone = G.checks.filter(c => !mobile.checks.some(x => x.name === c.name)).map(c => c.name), added = [];
      for (const c of mobile.checks) {
        const g = gmap.get(c.name);
        if (!g) { added.push(c); continue; }
        if (g.ok && !c.ok) fresh.push(c); else if (!g.ok && c.ok) fixed.push(c); else if (!g.ok && !c.ok) known++;
      }
      // budgets: a count may fall (good, and the golden can be tightened on purpose); it may never rise
      const rose = [], fell = [], GB = G.budgets || {};
      for (const k of Object.keys(mobile.budgets)) {
        const now = mobile.budgets[k], was = GB[k];
        if (!was) { rose.push(k + ': a new screen with no budget in the golden'); continue; }
        for (const f of ['smallTaps', 'smallText']) {
          if (now[f] > was[f]) rose.push(k + ': ' + (f === 'smallTaps' ? 'tap targets under 44 px' : 'texts under 11 px') + ' rose from ' + was[f] + ' to ' + now[f]);
          else if (now[f] < was[f]) fell.push(k + ': ' + (f === 'smallTaps' ? 'tap targets under 44 px' : 'texts under 11 px') + ' fell from ' + was[f] + ' to ' + now[f]);
        }
      }
      Object.keys(GB).filter(k => !(k in mobile.budgets)).forEach(k => rose.push(k + ': the screen was not measured this run'));
      const newErrs = pageErrors.filter(e => !(G.pageErrors || []).some(g => g.text === e.text));
      const okCount = mobile.checks.filter(c => c.ok).length;
      if (!fresh.length && !gone.length && !added.length && !fixed.length && !newErrs.length && !rose.length) console.log('✓ mobile: ' + okCount + ' of ' + mobile.checks.length + ' checks pass' + (known ? ', ' + known + ' known issue' + (known > 1 ? 's' : '') : '') + ', budgets held on ' + Object.keys(mobile.budgets).length + ' screens, no new page errors (' + secs + ' s)');
      else {
        failed = true;
        console.log('✗ mobile: ' + fresh.length + ' newly failing, ' + fixed.length + ' newly passing, ' + added.length + ' new checks, ' + gone.length + ' missing checks, ' + rose.length + ' budgets over, ' + newErrs.length + ' new page errors (' + secs + ' s)');
        fresh.forEach(c => console.log('    BROKE: ' + c.name + ' — ' + c.detail));
        fixed.forEach(c => console.log('    now passes (regenerate the golden on purpose): ' + c.name));
        added.forEach(c => console.log('    new check (regenerate the golden on purpose): ' + c.name + (c.ok ? '' : ' — ' + c.detail)));
        gone.forEach(n => console.log('    check disappeared: ' + n));
        rose.forEach(l => console.log('    BUDGET: ' + l));
        newErrs.forEach(e => console.log('    page error [' + e.where + ']: ' + e.text));
      }
      fell.forEach(l => console.log('    budget improved (regenerate the golden to lock it in): ' + l));
      G.checks.filter(c => !c.ok).forEach(c => { if (mobile.checks.some(x => x.name === c.name && !x.ok)) console.log('    known issue: ' + c.name); });
    }
  }
  ws.close();
} catch (e) {
  failed = true; console.log('✗ mobile stage failed: ' + e.message);
} finally { await shutdown(); }
console.log(golden ? 'golden in ' + join(GOLDEN, 'mobile.json') : (failed ? 'MOBILE: FAIL' : 'MOBILE: PASS'));
process.exit(failed && !golden ? 1 : 0);

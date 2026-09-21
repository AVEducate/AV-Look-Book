#!/usr/bin/env node
// AV Look Book — smoke runner. No dependencies: Node 22 + Chrome.
//
//   node tests/run_smoke.mjs              compare deploy/lookbook_builder.html against tests/golden/  (exit 1 on any diff)
//   node tests/run_smoke.mjs --golden     rebuild tests/golden/ from the current file (only from a version you trust)
//   node tests/run_smoke.mjs --flows-only skip the three snapshots, run only the user-flow checks (faster while working)
//   node tests/run_smoke.mjs --no-mobile  skip the phone stage (tests/run_mobile_stage.mjs: the phone build under phone emulation)
//
// Two probes run inside the real app in headless Chrome:
//   tests/smoke_probe.js  snapshots what each example show PRODUCES (model, layouts, exports, wire labels)
//   tests/flows_probe.js  DRIVES the app like a user in Simple and Advanced across all three tools and asserts results
// Page errors (exceptions, console.error) raised anywhere during the run are collected and compared too.
// A flow check that already fails at the trusted version sits in the golden as a KNOWN ISSUE and is listed every run.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEPLOY = join(ROOT, 'deploy');
const GOLDEN = join(ROOT, 'tests', 'golden');
const OUT = join(ROOT, 'tests', 'out');
const SHOWS = ['general-session', 'awards-night', 'town-hall'];
const PORT = 8097, CDP = 9343;
const golden = process.argv.includes('--golden');
const flowsOnly = process.argv.includes('--flows-only');
const noMobile = process.argv.includes('--no-mobile');
const CHROME = process.env.LB_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const probeSrc = readFileSync(join(ROOT, 'tests', 'smoke_probe.js'), 'utf8');
const flowsSrc = readFileSync(join(ROOT, 'tests', 'flows_probe.js'), 'utf8');

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', DEPLOY], { stdio: 'ignore' });
const profile = join(tmpdir(), 'lb-smoke-profile-' + process.pid);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=' + CDP, '--user-data-dir=' + profile, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch {} try { server.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);

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

const pageErrors = [];   // { where, text } — exceptions and console errors raised by the app while the probes run
let where = 'boot';
function connect(url) {
  const ws = new WebSocket(url); let id = 0; const pending = new Map();
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
    if (d.method === 'Runtime.exceptionThrown') { const x = d.params.exceptionDetails; pageErrors.push({ where, text: 'exception: ' + ((x.exception && x.exception.description) || x.text || '').split('\n')[0] }); }
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') pageErrors.push({ where, text: 'console.error: ' + d.params.args.map(a => a.value !== undefined ? String(a.value) : (a.description || '')).join(' ').slice(0, 240) });
    // not app errors: the missing favicon, and Chrome noting the "leave without saving?" prompt when the runner navigates away
    else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon\.ico/.test(d.params.entry.url || '') && !/beforeunload/.test(d.params.entry.text || '')) pageErrors.push({ where, text: 'log: ' + String(d.params.entry.text).slice(0, 200) + ' ' + (d.params.entry.url || '').replace(/^https?:\/\/[^/]+/, '') });
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, d => d.error ? reject(new Error(d.error.message)) : resolve(d.result));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return new Promise((resolve, reject) => { ws.onopen = () => resolve({ ws, send }); ws.onerror = () => reject(new Error('CDP socket failed')); });
}

async function evalJs(send, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 600000 });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}

async function loadApp(send) {
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/lookbook_builder.html?smoke=' + Date.now() });
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    try { if (await evalJs(send, "document.readyState==='complete' && typeof lbOpenExample==='function'")) return; } catch {}
  }
  throw new Error('the app did not finish loading');
}

function flatten(v, path = '', acc = {}) {
  if (v !== null && typeof v === 'object') { for (const k of Object.keys(v)) flatten(v[k], path ? path + '.' + k : k, acc); if (!Object.keys(v).length) acc[path] = Array.isArray(v) ? '[]' : '{}'; }
  else acc[path] = v;
  return acc;
}
function diffJson(a, b) {
  const fa = flatten(a), fb = flatten(b), out = [];
  for (const k of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
    if (!(k in fa)) out.push('+ ' + k + ' = ' + JSON.stringify(fb[k]).slice(0, 120));
    else if (!(k in fb)) out.push('- ' + k + ' (was ' + JSON.stringify(fa[k]).slice(0, 120) + ')');
    else if (JSON.stringify(fa[k]) !== JSON.stringify(fb[k])) out.push('~ ' + k + ': ' + JSON.stringify(fa[k]).slice(0, 80) + ' -> ' + JSON.stringify(fb[k]).slice(0, 80));
  }
  return out;
}
function diffText(a, b) {
  const A = a.split('>'), B = b.split('>'); const out = []; const n = Math.max(A.length, B.length);
  for (let i = 0; i < n && out.length < 12; i++) if (A[i] !== B[i]) out.push('@' + i + ': ' + JSON.stringify((A[i] || '').slice(0, 90)) + ' -> ' + JSON.stringify((B[i] || '').slice(0, 90)));
  return { count: A.filter((x, i) => x !== B[i]).length + Math.max(0, B.length - A.length), sample: out };
}

let failed = false, known = 0;
try {
  const t = await target();
  const { ws, send } = await connect(t.webSocketDebuggerUrl);
  await send('Runtime.enable'); await send('Log.enable');
  mkdirSync(OUT, { recursive: true }); if (golden) mkdirSync(GOLDEN, { recursive: true });

  if (!flowsOnly) for (const show of SHOWS) {
    where = 'snapshot ' + show;
    await loadApp(send);
    const snap = await evalJs(send, '(' + probeSrc + ')(' + JSON.stringify(show) + ')');
    const lookbook = snap.sections.lookbook; delete snap.sections.lookbook;
    const errs = Object.entries(snap.sections).filter(([, v]) => typeof v === 'string' && v.startsWith('ERR '));
    writeFileSync(join(OUT, show + '.json'), JSON.stringify(snap, null, 1));
    writeFileSync(join(OUT, show + '.lookbook.html'), typeof lookbook === 'string' ? lookbook : String(lookbook));
    if (errs.length) { failed = true; console.log('✗ ' + show + ': probe errors ' + errs.map(([k, v]) => k + ' → ' + v).join(' | ')); }
    if (golden) {
      writeFileSync(join(GOLDEN, show + '.json'), JSON.stringify(snap, null, 1));
      writeFileSync(join(GOLDEN, show + '.lookbook.html'), typeof lookbook === 'string' ? lookbook : String(lookbook));
      console.log('golden written: ' + show + (errs.length ? '  (with probe errors — check the sections)' : ''));
      continue;
    }
    const gj = join(GOLDEN, show + '.json'), gh = join(GOLDEN, show + '.lookbook.html');
    if (!existsSync(gj) || !existsSync(gh)) { failed = true; console.log('✗ ' + show + ': no golden yet (run with --golden from a trusted version)'); continue; }
    const jd = diffJson(JSON.parse(readFileSync(gj, 'utf8')), snap);
    const hd = diffText(readFileSync(gh, 'utf8'), lookbook);
    if (!jd.length && !hd.count && !errs.length) console.log('✓ ' + show + ': matches golden');
    else {
      failed = true;
      console.log('✗ ' + show + ': ' + jd.length + ' model / export differences, ' + hd.count + ' Look Book differences');
      jd.slice(0, 25).forEach(l => console.log('    ' + l)); if (jd.length > 25) console.log('    … ' + (jd.length - 25) + ' more');
      hd.sample.forEach(l => console.log('    lookbook ' + l));
    }
  }

  // user flows, Simple and Advanced, on the General Session example
  where = 'flows';
  await loadApp(send);
  const flows = await evalJs(send, '(' + flowsSrc + ')()');
  const result = { checks: flows.checks, pageErrors };
  writeFileSync(join(OUT, 'flows.json'), JSON.stringify(result, null, 1));
  const bad = flows.checks.filter(c => !c.ok);
  if (golden) {
    writeFileSync(join(GOLDEN, 'flows.json'), JSON.stringify(result, null, 1));
    console.log('golden written: flows (' + flows.checks.length + ' checks, ' + bad.length + ' known issues, ' + pageErrors.length + ' page errors)');
    bad.forEach(c => console.log('    known issue: ' + c.name + ' — ' + c.detail));
    pageErrors.forEach(e => console.log('    page error [' + e.where + ']: ' + e.text));
  } else {
    const gf = join(GOLDEN, 'flows.json');
    if (!existsSync(gf)) { failed = true; console.log('✗ flows: no golden yet (run with --golden from a trusted version)'); }
    else {
      const G = JSON.parse(readFileSync(gf, 'utf8')); const gmap = new Map(G.checks.map(c => [c.name, c]));
      const fresh = [], fixed = [], gone = G.checks.filter(c => !flows.checks.some(x => x.name === c.name)).map(c => c.name), added = [];
      for (const c of flows.checks) {
        const g = gmap.get(c.name);
        if (!g) { added.push(c); continue; }
        if (g.ok && !c.ok) fresh.push(c); else if (!g.ok && c.ok) fixed.push(c); else if (!g.ok && !c.ok) known++;
      }
      const newErrs = pageErrors.filter(e => !(G.pageErrors || []).some(g => g.text === e.text));
      const okCount = flows.checks.filter(c => c.ok).length;
      if (!fresh.length && !gone.length && !added.length && !fixed.length && !newErrs.length) console.log('✓ flows: ' + okCount + ' of ' + flows.checks.length + ' checks pass' + (known ? ', ' + known + ' known issue' + (known > 1 ? 's' : '') : '') + ', no new page errors');
      else {
        failed = true;
        console.log('✗ flows: ' + fresh.length + ' newly failing, ' + fixed.length + ' newly passing, ' + added.length + ' new checks, ' + gone.length + ' missing checks, ' + newErrs.length + ' new page errors');
        fresh.forEach(c => console.log('    BROKE: ' + c.name + ' — ' + c.detail));
        fixed.forEach(c => console.log('    now passes (regenerate the golden on purpose): ' + c.name));
        added.forEach(c => console.log('    new check (regenerate the golden on purpose): ' + c.name + (c.ok ? '' : ' — ' + c.detail)));
        gone.forEach(n => console.log('    check disappeared: ' + n));
        newErrs.forEach(e => console.log('    page error [' + e.where + ']: ' + e.text));
      }
      G.checks.filter(c => !c.ok).forEach(c => { if (flows.checks.some(x => x.name === c.name && !x.ok)) console.log('    known issue: ' + c.name); });
    }
  }
  ws.close();
} catch (e) {
  failed = true; console.log('✗ smoke run failed: ' + e.message);
} finally { cleanup(); }
// the phone build: its own page load under phone emulation, real touch taps, its own golden (tests/golden/mobile.json)
if (!noMobile) {
  const m = spawnSync(process.execPath, [join(ROOT, 'tests', 'run_mobile_stage.mjs'), '--quiet'].concat(golden ? ['--golden'] : []), { stdio: 'inherit' });
  if (m.status !== 0) failed = true;
}
console.log(golden ? 'goldens in tests/golden/' : (failed ? 'SMOKE: FAIL' : 'SMOKE: PASS'));
process.exit(failed && !golden ? 1 : 0);

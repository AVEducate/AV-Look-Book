#!/usr/bin/env node
// AV Look Book — smoke runner. No dependencies: Node 22 + Chrome.
//
//   node tests/run_smoke.mjs            compare deploy/lookbook_builder.html against tests/golden/  (exit 1 on any diff)
//   node tests/run_smoke.mjs --golden   rebuild tests/golden/ from the current file (only from a version you trust)
//
// It serves deploy/ on a local port, drives headless Chrome over the DevTools protocol, runs tests/smoke_probe.js
// against each example show, and writes the snapshots to tests/out/. See RELEASE.md for when to run it.
import { spawn } from 'node:child_process';
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
const CHROME = process.env.LB_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const probeSrc = readFileSync(join(ROOT, 'tests', 'smoke_probe.js'), 'utf8');

// 1. static server for deploy/
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', DEPLOY], { stdio: 'ignore' });
// 2. headless Chrome with a throw-away profile
const profile = join(tmpdir(), 'lb-smoke-profile-' + process.pid);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--mute-audio',
  '--remote-debugging-port=' + CDP, '--user-data-dir=' + profile, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
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

function connect(url) {
  const ws = new WebSocket(url); let id = 0; const pending = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, d => d.error ? reject(new Error(d.error.message)) : resolve(d.result));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return new Promise((resolve, reject) => { ws.onopen = () => resolve({ ws, send }); ws.onerror = e => reject(new Error('CDP socket failed')); });
}

async function evalJs(send, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 120000 });
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

let failed = false;
try {
  const t = await target();
  const { ws, send } = await connect(t.webSocketDebuggerUrl);
  mkdirSync(OUT, { recursive: true }); if (golden) mkdirSync(GOLDEN, { recursive: true });
  for (const show of SHOWS) {
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
  ws.close();
} catch (e) {
  failed = true; console.log('✗ smoke run failed: ' + e.message);
} finally { cleanup(); }
console.log(golden ? 'goldens in tests/golden/' : (failed ? 'SMOKE: FAIL' : 'SMOKE: PASS'));
process.exit(failed && !golden ? 1 : 0);

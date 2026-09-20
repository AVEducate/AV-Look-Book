// Tiny DevTools-protocol driver for the desktop shell run in dev mode.
//   Launch the shell:  node_modules/electron/dist/Electron.app/Contents/MacOS/Electron ./electron --remote-debugging-port=9333
//   Then:              node tools/cdp.mjs <windowTitleOrUrlSubstring> "<js expression>"
// Evaluates the expression in the matching window and prints the JSON result. Node 22+ (global WebSocket), no deps.
const [, , match, expr] = process.argv;
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const t = list.find(x => x.type === 'page' && ((x.title || '') + ' ' + (x.url || '')).includes(match));
if (!t) { console.log('NO TARGET for', match, '| have:', list.map(x => x.title + ' ' + x.url).join(' ; ')); process.exit(2); }
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
const res = await new Promise((resolve) => {
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) resolve(d); };
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  setTimeout(() => resolve({ timeout: true }), 8000);
});
console.log(JSON.stringify(res.result ? res.result.result : res));
ws.close();

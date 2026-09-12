// Look Book Builder — Electron main process
//
// LOAD MODE A (Omar, 2026-09-11): the app ALWAYS runs from its own internal
// address (app://lookbook/) so drafts, autosave and settings live in ONE place
// whether the machine is online or offline.
//
// Content = the newest lookbook_builder.html we have:
//   • userData/latest.html — downloaded from the latest GitHub Release
//   • app/index.html       — the copy bundled into the installer (fallback)
// Whichever carries the newer "build 2026-06-16xx" stamp wins.
//
// Online: on launch and every few hours we fetch the release copy; if its build
// stamp is newer we save it and show a small "Update ready — restart to apply"
// note inside the window. Offline: no check, no message — it just runs.
//
// The SHELL itself (this Electron wrapper) updates through electron-updater +
// GitHub Releases. That path needs code signing on macOS to work.
const { app, BrowserWindow, ipcMain, shell, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch (e) { /* dev mode */ }

// ── CONFIG ─────────────────────────────────────────────────────────────────
const GH_OWNER = 'AVEducate';
const GH_REPO  = 'AV-Look-Book';
// The release workflow attaches deploy/lookbook_builder.html to every release,
// so "latest" always points at the newest build of the app itself.
const CONTENT_URL = 'https://github.com/' + GH_OWNER + '/' + GH_REPO + '/releases/latest/download/lookbook_builder.html';
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;   // re-check every 4 h while running
// ───────────────────────────────────────────────────────────────────────────

const BUNDLED = path.join(__dirname, 'app', 'index.html');
const latestPath = () => path.join(app.getPath('userData'), 'latest.html');

// "build 2026-06-16ew" → "2026-06-16ew"
function stampOf(html){
  const m = /build (20\d\d-\d\d-\d\d[a-z]+)/.exec(html || '');
  return m ? m[1] : '';
}
function stampOfFile(p){
  try { return stampOf(fs.readFileSync(p, 'utf8')); } catch (e) { return ''; }
}
// Order: date, then suffix LENGTH, then suffix — so "16z" < "16aa" < "16ew"
// (a plain string compare would put "16z" after "16aa").
function stampKey(s){
  const m = /^(\d{4}-\d\d-\d\d)([a-z]+)$/.exec(s || '');
  return m ? [m[1], m[2].length, m[2]] : ['', 0, ''];
}
function stampNewer(a, b){                 // true when a is newer than b
  const A = stampKey(a), B = stampKey(b);
  for (let i = 0; i < 3; i++) { if (A[i] > B[i]) return true; if (A[i] < B[i]) return false; }
  return false;
}
// The HTML we should run right now.
function currentHtmlPath(){
  const lp = latestPath();
  if (fs.existsSync(lp) && stampNewer(stampOfFile(lp), stampOfFile(BUNDLED))) return lp;
  return BUNDLED;
}

let win = null;
let notifiedStamp = '';

// app://lookbook/  →  the current HTML. Registered as a "standard" scheme so
// localStorage / File System Access / blob: URLs behave like a normal site.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

function createWindow(){
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0a1322',
    title: 'Look Book Builder',
    icon: path.join(__dirname, 'build', 'icon.png'),   // Linux/dev; mac/win use the packaged icon
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The sandboxed preload can't require() package.json — hand it the version.
      additionalArguments: ['--lb-shell-version=' + app.getVersion()]
    }
  });
  win.loadURL('app://lookbook/');
  // Real links (docs, store, GitHub) open in the user's browser; blob:/data:
  // windows (the PDF print previews) stay in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  win.on('closed', () => { win = null; });
}

// ── Content update check (the HTML app) ──────────────────────────────────
// Returns { status, current, remote } — status is one of
// 'offline' | 'no-release' | 'up-to-date' | 'downloaded' | 'error'
// (the app can show that on a "Check for updates" click later).
async function checkForContentUpdate(){
  const current = stampOfFile(currentHtmlPath());
  if (!net.isOnline()) return { status: 'offline', current, remote: '' };   // offline: silent
  try {
    const res = await net.fetch(CONTENT_URL, { cache: 'no-store' });
    if (!res.ok) return { status: 'no-release', current, remote: '' };      // no release yet / 404
    const html = await res.text();
    const remote = stampOf(html);
    if (!remote) return { status: 'no-release', current, remote: '' };
    if (!stampNewer(remote, current)) return { status: 'up-to-date', current, remote };
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(latestPath(), html, 'utf8');
    if (win && notifiedStamp !== remote) { notifiedStamp = remote; showUpdateToast(remote); }
    return { status: 'downloaded', current, remote };
  } catch (e) { return { status: 'error', current, remote: '', message: String(e && e.message || e) }; }
}

// Small in-window note, styled like the app's own toasts. "Restart" relaunches
// on the new build; "Later" just hides it (it applies on the next launch).
function showUpdateToast(stamp){
  const js = `(function(){
    if(document.getElementById('lb-native-update')) return;
    var d=document.createElement('div'); d.id='lb-native-update';
    d.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483647;background:#0c1a24;border:1px solid rgba(34,228,255,.45);border-radius:10px;padding:12px 14px;color:#e8e8ea;font:12px -apple-system,Helvetica,Arial,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.6);display:flex;gap:12px;align-items:center';
    d.innerHTML='<div><div style="font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:10px;color:#22e4ff">Update ready</div><div style="margin-top:3px">Build ${stamp} is downloaded \\u2014 restart to use it.</div></div>'
      +'<button id="lb-nu-later" style="background:transparent;border:1px solid #2a2f3a;border-radius:6px;color:#aeb6c2;padding:6px 10px;font:inherit;cursor:pointer">Later</button>'
      +'<button id="lb-nu-restart" style="background:#22e4ff;border:none;border-radius:6px;color:#001620;padding:6px 12px;font:inherit;font-weight:700;cursor:pointer">Restart now</button>';
    document.body.appendChild(d);
    document.getElementById('lb-nu-later').onclick=function(){ d.remove(); };
    document.getElementById('lb-nu-restart').onclick=function(){ if(window.lookbookNative&&window.lookbookNative.relaunch) window.lookbookNative.relaunch(); };
  })();`;
  try { win.webContents.executeJavaScript(js); } catch (e) {}
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const url = new URL(req.url);
    if (url.hostname === 'lookbook' && (url.pathname === '/' || url.pathname === '/index.html')) {
      // pathToFileURL: userData lives under "Application Support" — the space
      // must be percent-encoded or the fetch fails.
      return net.fetch(pathToFileURL(currentHtmlPath()).toString());
    }
    return new Response('Not found', { status: 404 });
  });
  createWindow();
  // Content check now + periodically; shell update check (packaged builds only).
  setTimeout(checkForContentUpdate, 4000);
  setInterval(checkForContentUpdate, CHECK_EVERY_MS);
  if (autoUpdater && app.isPackaged) { try { autoUpdater.checkForUpdatesAndNotify(); } catch (e) {} }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── Bridge (preload → window.lookbookNative) ─────────────────────────────
ipcMain.handle('lb:relaunch', async () => { app.relaunch(); app.exit(0); });
ipcMain.handle('lb:checkForUpdates', async () => checkForContentUpdate());
ipcMain.handle('lb:info', async () => ({ shell: app.getVersion(), build: stampOfFile(currentHtmlPath()), online: net.isOnline() }));

// Add-on / license hook (STUB — wire to the store later; see project memory).
ipcMain.handle('lb:getEntitlements', async () => ({ core: true, addons: [] }));
ipcMain.handle('lb:activateLicense', async (_e, _key) => ({ ok: false, message: 'Licensing not wired yet' }));

// AV Look Book — Electron main process
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
// PROJECTS AS FILES + WELCOME WINDOW (Omar, 2026-09-12, Mitti-style):
//   • A Welcome window (welcome.html) opens first: New Project / Open Last
//     Project / Getting Started, and a grid of recent projects with
//     thumbnails. Recents live in userData/settings.json.
//   • Every project runs in its OWN window. The page asks the shell what to
//     show (boot), creates its file on Build My Show, and autosaves into it.
//   • Closing a window flushes the file and captures a thumbnail first.
//     When the last project window closes the Welcome window comes back.
//
// The SHELL itself (this Electron wrapper) updates through electron-updater +
// GitHub Releases. That path needs code signing on macOS to work.
const { app, BrowserWindow, ipcMain, shell, protocol, net, dialog, Menu, nativeImage, clipboard } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch (e) { /* dev mode */ }

// The dev shell (`npm start`) must never share settings / recents / thumbnails
// with the installed app — Electron keys userData by package.json "name" for
// both, so give development its own folder.
if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'av-look-book-dev'));

// ── CONFIG ─────────────────────────────────────────────────────────────────
const GH_OWNER = 'AVEducate';
const GH_REPO  = 'AV-Look-Book';
// The release workflow attaches deploy/lookbook_builder.html to every release,
// so "latest" always points at the newest build of the app itself.
const CONTENT_URL = 'https://github.com/' + GH_OWNER + '/' + GH_REPO + '/releases/latest/download/lookbook_builder.html';
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;   // re-check every 4 h while running
const RECENT_MAX = 200;                       // how many projects the Welcome list remembers
const THUMB_WIDTH = 640;                      // px, thumbnails are 16:10-ish window captures
const DOWNLOAD_PAGE_URL = 'https://www.aveducate.com/av-look-book';   // where a recipient gets the app (landing page → sign-up → /download)
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

// ── Settings + recents (userData/settings.json) ──────────────────────────
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { showWelcomeOnLaunch: true, recents: [] };
function loadSettings(){
  try {
    const s = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    if (s && typeof s === 'object') settings = Object.assign(settings, s);
  } catch (e) { /* first run */ }
  if (!Array.isArray(settings.recents)) settings.recents = [];
  if (typeof settings.showWelcomeOnLaunch !== 'boolean') settings.showWelcomeOnLaunch = true;
}
function saveSettings(){
  try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2)); } catch (e) {}
}
const recentId = (p) => crypto.createHash('sha1').update(String(p)).digest('hex').slice(0, 16);
const thumbsDir = () => path.join(app.getPath('userData'), 'thumbs');
const thumbPath = (id) => path.join(thumbsDir(), id + '.png');
function findRecent(id){ return settings.recents.find(r => r.id === id) || null; }
// Move (or add) a project to the front of the list. "Last worked on" = slot 1.
function touchRecent(p, name){
  const id = recentId(p);
  const i = settings.recents.findIndex(r => r.id === id);
  const it = i >= 0 ? settings.recents.splice(i, 1)[0] : { id, path: p };
  it.path = p;
  if (name) it.name = name;
  it.lastOpened = Date.now();
  settings.recents.unshift(it);
  if (settings.recents.length > RECENT_MAX) settings.recents.length = RECENT_MAX;
  saveSettings(); refreshWelcome(); rebuildMenu();
}
function removeRecent(id){
  const i = settings.recents.findIndex(r => r.id === id);
  if (i >= 0) settings.recents.splice(i, 1);
  try { fs.unlinkSync(thumbPath(id)); } catch (e) {}
  saveSettings(); refreshWelcome(); rebuildMenu();
}
function thumbDataUrl(id){
  try { return 'data:image/png;base64,' + fs.readFileSync(thumbPath(id)).toString('base64'); } catch (e) { return null; }
}

// ── Project files ────────────────────────────────────────────────────────
function projectsDir(){
  const d = path.join(app.getPath('documents'), 'AV Look Book');
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
  return d;
}
function safeFileName(name){
  const n = String(name || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
  return n || 'Untitled Show';
}
function uniquePath(dir, base){
  let p = path.join(dir, base + '.avlb'), k = 2;
  while (fs.existsSync(p)) { p = path.join(dir, base + ' (' + (k++) + ').avlb'); }
  return p;
}
function readProject(p){
  const text = fs.readFileSync(p, 'utf8');
  let name = '';
  try { const j = JSON.parse(text); name = String(j.showName || '').trim(); } catch (e) {}
  return { text, name };
}
function nameFromJson(json){
  try { return String(JSON.parse(json).showName || '').trim(); } catch (e) { return ''; }
}
function writeProject(p, json){
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, p);             // atomic-ish: never leave a half-written .avlb
}

// ── Windows ──────────────────────────────────────────────────────────────
const projects = new Map();          // webContents.id → { win, boot, path, name, closing }
let welcomeWin = null;
let guideWin = null;
let quitting = false;
let notifiedStamp = '';

// app://lookbook/  →  the current HTML. Registered as a "standard" scheme so
// localStorage / File System Access / blob: URLs behave like a normal site.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

function entryFor(sender){ return projects.get(sender.id) || null; }
function projectWindowFor(p){ for (const e of projects.values()) if (e.path && e.path === p) return e; return null; }

function createProjectWindow(boot){
  if (boot.mode === 'open') {
    const ex = projectWindowFor(boot.path);
    if (ex) { ex.win.focus(); return ex; }
  }
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0a1322',
    title: 'AV Look Book',
    show: false,
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
  const wcId = win.webContents.id;
  const entry = { win, boot, path: boot.mode === 'open' ? boot.path : null, name: '', closing: false };
  projects.set(wcId, entry);
  win.once('ready-to-show', () => { win.show(); });
  win.loadURL('app://lookbook/');
  // Real links (docs, store, GitHub) open in the user's browser; blob:/data:
  // windows (the PDF print previews) stay in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  // Keep the recents name in step with the show name (the page sets
  // document.title to "<show> — Look Book Builder").
  win.webContents.on('page-title-updated', (_e, title) => {
    const n = String(title || '').replace(/\s+—\s+Look Book Builder$/, '').trim();
    if (!n || n === 'Look Book Builder' || n === 'AV Look Book') return;
    entry.name = n;
    if (entry.path) {
      const it = findRecent(recentId(entry.path));
      if (it && it.name !== n) { it.name = n; saveSettings(); refreshWelcome(); rebuildMenu(); }
    }
  });
  // The page vetoes a close only when it has changes that are NOT in a file
  // (a show that was never saved). Named shows are flushed to disk in the
  // close flow below, so they never get here.
  win.webContents.on('will-prevent-unload', (event) => {
    console.log('[lb] unsaved-changes dialog for', entry.path || '(unsaved show)');
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'Unsaved changes',
      message: 'This show has changes that are not saved to a file.',
      detail: 'Save it first (Cmd+S) if you want to keep it. Closing now discards the changes.',
      buttons: ['Close anyway', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    });
    if (choice === 0) event.preventDefault();          // ignore the page's veto, close
    else { entry.closing = false; quitting = false; }  // user backed out
  });
  // Close flow: flush the file, capture the thumbnail, then really close.
  win.on('close', (e) => {
    if (entry.closing) return;                          // second pass → let it go
    e.preventDefault();
    entry.closing = true;
    (async () => {
      let flushed = null;
      try {
        flushed = await Promise.race([
          win.webContents.executeJavaScript('window.__lbFlushSave ? window.__lbFlushSave() : true', true),
          new Promise(res => setTimeout(() => res('timeout'), 5000))
        ]);
      } catch (err) { flushed = 'error: ' + (err && err.message); }
      console.log('[lb] close:', entry.path || '(unsaved show)', 'flush →', flushed);
      await captureThumb(entry);
      if (!win.isDestroyed()) win.close();
    })();
  });
  win.on('closed', () => {
    projects.delete(wcId);
    if (!quitting && projects.size === 0) showWelcome();
  });
  if (welcomeWin && !welcomeWin.isDestroyed()) welcomeWin.hide();
  return entry;
}

function openProjectPath(p){
  if (!fs.existsSync(p)) {
    dialog.showMessageBox({ type: 'warning', title: 'File not found', message: 'That project file is no longer where it was.', detail: p, buttons: ['OK'] });
    refreshWelcome();
    return null;
  }
  return createProjectWindow({ mode: 'open', path: p });
}

async function captureThumb(entry){
  if (!entry.path || entry.win.isDestroyed() || entry.win.webContents.isDestroyed()) return;
  try {
    const img = await entry.win.webContents.capturePage();
    if (!img || img.isEmpty()) return;
    fs.mkdirSync(thumbsDir(), { recursive: true });
    fs.writeFileSync(thumbPath(recentId(entry.path)), img.resize({ width: THUMB_WIDTH }).toPNG());
    refreshWelcome();
  } catch (e) { /* hidden / minimized windows can't be captured — keep the old thumb */ }
}

// ── Welcome window ───────────────────────────────────────────────────────
function showWelcome(){
  if (welcomeWin && !welcomeWin.isDestroyed()) { welcomeWin.show(); welcomeWin.focus(); refreshWelcome(); return welcomeWin; }
  welcomeWin = new BrowserWindow({
    width: 1000,
    height: 620,
    resizable: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    title: 'Welcome to AV Look Book',
    backgroundColor: '#0a1322',
    show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'welcome-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  welcomeWin.once('ready-to-show', () => welcomeWin.show());
  welcomeWin.loadURL('app://lookbook/welcome.html');
  welcomeWin.on('closed', () => { welcomeWin = null; });
  return welcomeWin;
}
function refreshWelcome(){
  if (welcomeWin && !welcomeWin.isDestroyed()) { try { welcomeWin.webContents.send('lb:welcome:refresh'); } catch (e) {} }
}
function showGuide(){
  if (guideWin && !guideWin.isDestroyed()) { guideWin.show(); guideWin.focus(); return; }
  guideWin = new BrowserWindow({
    width: 1200, height: 820, minWidth: 800, minHeight: 600,
    title: 'Getting Started — AV Look Book', backgroundColor: '#0a1322',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  guideWin.loadURL('app://lookbook/quick_guide.html');
  guideWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  guideWin.on('closed', () => { guideWin = null; });
}

// ── Menu ─────────────────────────────────────────────────────────────────
function focusedProject(){
  const w = BrowserWindow.getFocusedWindow();
  if (w && projects.has(w.webContents.id)) return projects.get(w.webContents.id);
  for (const e of projects.values()) return e;
  return null;
}
function sendToFocused(cmd){
  const e = focusedProject();
  if (e && !e.win.isDestroyed()) e.win.webContents.send('lb:menu', cmd);
}
async function menuOpen(){
  const e = focusedProject();
  const r = await dialog.showOpenDialog(e ? e.win : (welcomeWin || undefined), {
    defaultPath: projectsDir(),
    filters: [{ name: 'AV Look Book Project', extensions: ['avlb', 'json'] }],
    properties: ['openFile']
  });
  if (r.canceled || !r.filePaths[0]) return;
  openProjectPath(r.filePaths[0]);
}
async function menuCheckUpdates(){
  const r = await checkForContentUpdate();
  const text = {
    'offline': 'You are offline. AV Look Book checks again automatically when a connection is back.',
    'no-release': 'No update is published yet.',
    'up-to-date': 'You are on the latest build (' + r.current + ').',
    'downloaded': 'Build ' + r.remote + ' is downloaded. Restart AV Look Book to use it.',
    'error': 'The update check failed: ' + (r.message || 'unknown error')
  }[r.status] || 'Unknown result.';
  dialog.showMessageBox({ type: 'info', title: 'Check for Updates', message: text, buttons: ['OK'] });
}
function rebuildMenu(){
  const isMac = process.platform === 'darwin';
  const recentsSub = settings.recents.slice(0, 10).map(r => ({ label: r.name || path.basename(r.path), click: () => openProjectPath(r.path) }));
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [
      { role: 'about' }, { type: 'separator' },
      { label: 'Check for Updates…', click: menuCheckUpdates }, { type: 'separator' },
      { role: 'services' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' },
      { role: 'quit' }
    ] }] : []),
    { label: 'File', submenu: [
      { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => createProjectWindow({ mode: 'new' }) },
      { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: menuOpen },
      { label: 'Open Recent', submenu: recentsSub.length ? recentsSub : [{ label: 'No recent projects', enabled: false }] },
      { type: 'separator' },
      { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendToFocused('save') },
      { label: 'Save As…', accelerator: 'Shift+CmdOrCtrl+S', click: () => sendToFocused('saveAs') },
      { type: 'separator' },
      { label: 'Welcome Window', accelerator: 'Shift+CmdOrCtrl+W', click: () => showWelcome() },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' }
    ] },
    // Undo/Redo deliberately carry no accelerator: the app handles Cmd+Z /
    // Cmd+Shift+Z / Cmd+Y itself (project undo), and a menu accelerator
    // would swallow those keys.
    { label: 'Edit', submenu: [
      { label: 'Undo', role: 'undo' }, { label: 'Redo', role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
    ] },
    { label: 'View', submenu: [
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
      { role: 'togglefullscreen' },
      ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }])
    ] },
    { label: 'Window', submenu: [ { role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }]) ] },
    { role: 'help', submenu: [
      { label: 'Getting Started', click: () => showGuide() },
      ...(isMac ? [] : [{ label: 'Check for Updates…', click: menuCheckUpdates }]),
      { label: 'AV Look Book on GitHub', click: () => shell.openExternal('https://github.com/' + GH_OWNER + '/' + GH_REPO) }
    ] }
  ];
  // Roles undo/redo get a default accelerator from Electron; strip it.
  template.forEach(m => (m.submenu || []).forEach(i => { if (i.role === 'undo' || i.role === 'redo') i.accelerator = ''; }));
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Content update check (the HTML app) ──────────────────────────────────
// Returns { status, current, remote } — status is one of
// 'offline' | 'no-release' | 'up-to-date' | 'downloaded' | 'error'
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
    if (notifiedStamp !== remote) { notifiedStamp = remote; for (const e of projects.values()) showUpdateToast(e.win, remote); }
    return { status: 'downloaded', current, remote };
  } catch (e) { return { status: 'error', current, remote: '', message: String(e && e.message || e) }; }
}

// Small in-window note, styled like the app's own toasts. "Restart" relaunches
// on the new build; "Later" just hides it (it applies on the next launch).
function showUpdateToast(win, stamp){
  if (!win || win.isDestroyed()) return;
  const js = `(function(){
    if(document.getElementById('lb-native-update')) return;
    var d=document.createElement('div'); d.id='lb-native-update';
    // 2026-09-14 (shell 0.2.37): grey card + square corners, matching app build 16ge (cool-grey ramp, #252a33 hairlines, cyan #4ec3e0 accent)
    d.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483647;background:#14181f;border:1px solid rgba(78,195,224,.35);border-radius:4px;padding:12px 14px;color:#e2e4e8;font:12px -apple-system,Helvetica,Arial,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.6),0 0 0 1px #252a33;display:flex;gap:12px;align-items:center';
    d.innerHTML='<div style="display:flex;align-items:center;gap:10px"><span style="width:2px;height:22px;border-radius:1px;background:#4ec3e0;box-shadow:0 0 6px #4ec3e0;flex-shrink:0"></span><div><div style="font-weight:800;letter-spacing:.1em;text-transform:uppercase;font-size:10px;color:#4ec3e0">Update ready</div><div style="margin-top:3px;color:#9aa0aa">Build ${stamp} is downloaded \\u2014 restart to use it.</div></div></div>'
      +'<button id="lb-nu-later" style="background:#0a0d12;border:1px solid #252a33;border-radius:4px;color:#aeb6c2;padding:7px 12px;font:inherit;font-weight:600;cursor:pointer">Later</button>'
      +'<button id="lb-nu-restart" style="background:linear-gradient(180deg,#4ec3e0 0%,#2f93ad 100%);border:1px solid #4ec3e0;border-radius:4px;color:#06222b;padding:7px 14px;font:inherit;font-weight:700;cursor:pointer;box-shadow:0 0 10px rgba(78,195,224,.35)">Restart now</button>';
    document.body.appendChild(d);
    document.getElementById('lb-nu-later').onclick=function(){ d.remove(); };
    document.getElementById('lb-nu-restart').onclick=function(){ if(window.lookbookNative&&window.lookbookNative.relaunch) window.lookbookNative.relaunch(); };
  })();`;
  try { win.webContents.executeJavaScript(js); } catch (e) {}
}

// ── App lifecycle ────────────────────────────────────────────────────────
let pendingOpen = null;                                   // .avlb double-clicked before ready
app.on('open-file', (e, p) => { e.preventDefault(); if (app.isReady()) openProjectPath(p); else pendingOpen = p; });

app.whenReady().then(() => {
  loadSettings();
  protocol.handle('app', (req) => {
    const url = new URL(req.url);
    if (url.hostname !== 'lookbook') return new Response('Not found', { status: 404 });
    const p = url.pathname;
    // pathToFileURL: userData lives under "Application Support" — the space
    // must be percent-encoded or the fetch fails.
    if (p === '/' || p === '/index.html') return net.fetch(pathToFileURL(currentHtmlPath()).toString());
    const files = {
      '/welcome.html':     path.join(__dirname, 'welcome.html'),
      '/quick_guide.html': path.join(__dirname, 'app', 'quick_guide.html'),
      '/icon.png':         path.join(__dirname, 'build', 'icon.png')
    };
    if (files[p] && fs.existsSync(files[p])) return net.fetch(pathToFileURL(files[p]).toString());
    return new Response('Not found', { status: 404 });
  });
  rebuildMenu();

  // What to show first: a file handed to us, else Welcome (or the last
  // project directly when "Show this window on launch" is off).
  const argFile = process.argv.slice(1).find(a => /\.avlb$/i.test(a) && fs.existsSync(a));
  const first = pendingOpen || argFile;
  const last = settings.recents[0];
  if (first) openProjectPath(first);
  else if (!settings.showWelcomeOnLaunch && last && fs.existsSync(last.path)) openProjectPath(last.path);
  else showWelcome();
  pendingOpen = null;

  // Content check now + periodically; shell update check (packaged builds only).
  setTimeout(checkForContentUpdate, 4000);
  setInterval(checkForContentUpdate, CHECK_EVERY_MS);
  if (autoUpdater && app.isPackaged) { try { autoUpdater.checkForUpdatesAndNotify(); } catch (e) {} }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) showWelcome(); });
});

app.on('before-quit', () => { quitting = true; });
// Only fires when every window (Welcome included) is gone: the user closed
// the Welcome window with nothing else open → the program closes (Omar's spec).
app.on('window-all-closed', () => { app.quit(); });

// ── Bridge: project windows (preload → window.lookbookNative.project) ────
ipcMain.handle('lb:project:boot', async (e) => {
  const entry = entryFor(e.sender); if (!entry) return { mode: 'new' };
  if (entry.boot.mode === 'open') {
    try {
      const { text, name } = readProject(entry.boot.path);
      entry.path = entry.boot.path; entry.name = name;
      touchRecent(entry.path, name);
      return { mode: 'open', path: entry.path, name, json: text };
    } catch (err) {
      entry.path = null;
      return { mode: 'new', error: String(err && err.message || err) };
    }
  }
  return { mode: 'new' };
});
ipcMain.handle('lb:project:create', async (e, name, json) => {
  const entry = entryFor(e.sender); if (!entry) return { ok: false, error: 'no window' };
  try {
    const p = uniquePath(projectsDir(), safeFileName(name));
    writeProject(p, String(json || ''));
    entry.path = p; entry.name = String(name || '');
    touchRecent(p, entry.name);
    setTimeout(() => captureThumb(entry), 400);
    return { ok: true, path: p, file: path.basename(p) };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});
async function saveAsFlow(entry, json, suggested){
  const r = await dialog.showSaveDialog(entry.win, {
    defaultPath: path.join(projectsDir(), safeFileName(suggested) + '.avlb'),
    filters: [{ name: 'AV Look Book Project', extensions: ['avlb'] }]
  });
  if (r.canceled || !r.filePath) return { ok: false, cancelled: true };
  let p = r.filePath; if (!/\.avlb$/i.test(p)) p += '.avlb';
  writeProject(p, String(json || ''));
  entry.path = p;
  touchRecent(p, nameFromJson(json) || entry.name);
  setTimeout(() => captureThumb(entry), 200);
  return { ok: true, path: p };
}
ipcMain.handle('lb:project:save', async (e, json, auto) => {
  const entry = entryFor(e.sender); if (!entry) return { ok: false, error: 'no window' };
  try {
    if (!entry.path) return await saveAsFlow(entry, json, nameFromJson(json) || 'Untitled Show');
    writeProject(entry.path, String(json || ''));
    touchRecent(entry.path, nameFromJson(json) || entry.name);
    if (!auto) setTimeout(() => captureThumb(entry), 200);
    return { ok: true, path: entry.path };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});
ipcMain.handle('lb:project:saveAs', async (e, json, suggested) => {
  const entry = entryFor(e.sender); if (!entry) return { ok: false, error: 'no window' };
  try { return await saveAsFlow(entry, json, suggested || 'Untitled Show'); }
  catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});
ipcMain.handle('lb:project:open', async (e, intoThis) => {
  const entry = entryFor(e.sender); if (!entry) return { ok: false, error: 'no window' };
  const r = await dialog.showOpenDialog(entry.win, {
    defaultPath: projectsDir(),
    filters: [{ name: 'AV Look Book Project', extensions: ['avlb', 'json'] }],
    properties: ['openFile']
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false, cancelled: true };
  const p = r.filePaths[0];
  if (intoThis && !projectWindowFor(p)) {
    try {
      const { text, name } = readProject(p);
      entry.path = p; entry.name = name; touchRecent(p, name);
      return { ok: true, path: p, json: text };
    } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
  }
  openProjectPath(p);
  return { ok: true };
});
ipcMain.handle('lb:project:new', async () => { createProjectWindow({ mode: 'new' }); return { ok: true }; });

// ── Send show (16fa, Omar): PDF + Excel + .avlb into Documents/AV Look Book/
// Outbox/<show>, then a new email with the three attached. Apple Mail via
// AppleScript on the Mac; elsewhere (or if Mail refuses) the default mail app
// opens with the text, the text also goes on the clipboard, and the folder is
// revealed so the files are one drag away. p.mode === 'files' skips mail.
function stampNow(){ const d = new Date(); const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + z(d.getMinutes()); }
async function renderLookBookPdf(html){
  const tmp = path.join(app.getPath('temp'), 'avlb-send-' + Date.now() + '.html');
  fs.writeFileSync(tmp, html, 'utf8');
  const w = new BrowserWindow({ show: false, width: 1200, height: 900, webPreferences: { sandbox: true, contextIsolation: true } });
  try {
    await w.loadFile(tmp);
    await new Promise(r => setTimeout(r, 1500));            // fonts + embedded images
    return await w.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  } finally { try { w.destroy(); } catch (e) {} try { fs.unlinkSync(tmp); } catch (e) {} }
}
function mailViaAppleMail(subject, body, files){
  const esc = v => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const content = esc(body).split('\n').join('" & return & "');
  const attach = files.map(f => '    make new attachment with properties {file name:POSIX file "' + esc(f) + '"} at after the last paragraph').join('\n');
  const script = 'tell application "Mail"\n'
    + '  set m to make new outgoing message with properties {subject:"' + esc(subject) + '", content:"' + content + '" & return & return, visible:true}\n'
    + '  tell m\n' + attach + '\n  end tell\n'
    + '  activate\n'
    + 'end tell';
  return new Promise(res => { execFile('osascript', ['-e', script], { timeout: 25000 }, (err) => { if (err) console.log('[lb] Apple Mail hand-off failed:', err.message); res(!err); }); });
}
ipcMain.handle('lb:project:sendShow', async (e, p) => {
  p = p || {};
  try {
    const showRaw = String(p.show || 'Untitled Show').trim() || 'Untitled Show';
    const show = safeFileName(showRaw);
    const dir = path.join(projectsDir(), 'Outbox', show + ' ' + stampNow());
    fs.mkdirSync(dir, { recursive: true });
    const files = [];
    if (p.html) { const f = path.join(dir, show + ' - Look Book.pdf'); fs.writeFileSync(f, await renderLookBookPdf(String(p.html))); files.push(f); }
    if (p.xlsxB64) { const f = path.join(dir, show + ' - Cue Sheet.xlsx'); fs.writeFileSync(f, Buffer.from(String(p.xlsxB64), 'base64')); files.push(f); }
    if (p.avlb) { const f = path.join(dir, show + ' (open with AV Look Book).avlb'); fs.writeFileSync(f, String(p.avlb), 'utf8'); files.push(f); }
    const link = p.downloadUrl || DOWNLOAD_PAGE_URL;
    const subject = 'Look Book — ' + showRaw;
    const body = [
      'Hi,',
      '',
      'Here’s the look book for “' + showRaw + '”. Attached:',
      '',
      '  • ' + show + ' - Look Book.pdf — the full look book',
      '  • ' + show + ' - Cue Sheet.xlsx — the I/O and preset sheets',
      '  • ' + show + ' (open with AV Look Book).avlb — the show file. Open it in AV Look Book: ' + link,
      '',
      'AV Look Book is free for Mac and Windows: ' + link
    ].join('\n');
    let mailed = false;
    if (p.mode !== 'files') {
      if (process.platform === 'darwin') mailed = await mailViaAppleMail(subject, body, files);
      if (!mailed) {
        try { clipboard.writeText(body); } catch (err) {}
        try { await shell.openExternal('mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body)); } catch (err) {}
        if (files[0]) shell.showItemInFolder(files[0]);
      }
    }
    return { ok: true, mailed, folder: dir, files, subject, body };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});
ipcMain.handle('lb:welcome:show', async () => { showWelcome(); return { ok: true }; });

// ── Bridge: Welcome window ───────────────────────────────────────────────
ipcMain.handle('lb:welcome:list', async () => ({
  version: app.getVersion(),
  build: stampOfFile(currentHtmlPath()),
  showOnLaunch: settings.showWelcomeOnLaunch,
  items: settings.recents.map((r, i) => ({
    id: r.id, path: r.path, name: r.name || '', lastOpened: r.lastOpened || 0,
    missing: !fs.existsSync(r.path),
    thumb: i < 6 ? thumbDataUrl(r.id) : null
  }))
}));
ipcMain.handle('lb:welcome:action', async (_e, name, a, b) => {
  switch (name) {
    case 'new': createProjectWindow({ mode: 'new' }); break;
    case 'openLast': { const it = settings.recents[0]; if (it) openProjectPath(it.path); else createProjectWindow({ mode: 'new' }); break; }
    case 'open': { const it = findRecent(a); if (it) openProjectPath(it.path); break; }
    case 'browse': await menuOpen(); break;
    case 'gettingStarted': showGuide(); break;
    case 'removeConfirmed': {
      const it = findRecent(a); if (!it) break;
      if (b === true && fs.existsSync(it.path)) { try { await shell.trashItem(it.path); } catch (err) { return { ok: false, error: String(err && err.message || err) }; } }
      removeRecent(a);
      break;
    }
    case 'setShowOnLaunch': settings.showWelcomeOnLaunch = !!a; saveSettings(); break;
  }
  return { ok: true };
});

// ── Bridge: misc (preload → window.lookbookNative) ───────────────────────
ipcMain.handle('lb:relaunch', async () => { app.relaunch(); app.exit(0); });
ipcMain.handle('lb:checkForUpdates', async () => checkForContentUpdate());
ipcMain.handle('lb:info', async () => ({ shell: app.getVersion(), build: stampOfFile(currentHtmlPath()), online: net.isOnline() }));

// Add-on / license hook (STUB — wire to the store later; see project memory).
ipcMain.handle('lb:getEntitlements', async () => ({ core: true, addons: [] }));
ipcMain.handle('lb:activateLicense', async (_e, _key) => ({ ok: false, message: 'Licensing not wired yet' }));

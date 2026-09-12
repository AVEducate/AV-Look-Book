// Secure bridge between the web app and the native shell.
// The HTML can detect it's running inside the desktop app via window.lookbookNative.
const { contextBridge, ipcRenderer } = require('electron');

// Shell version arrives as a launch argument (the sandboxed preload can't
// require() package.json).
const vArg = (process.argv || []).find(a => a.startsWith('--lb-shell-version='));
const version = vArg ? vArg.slice('--lb-shell-version='.length) : '0.0.0';

contextBridge.exposeInMainWorld('lookbookNative', {
  isDesktop: true,
  version: version,
  // { shell, build, online } — shell version, running HTML build stamp, connectivity
  info: () => ipcRenderer.invoke('lb:info'),
  // Ask the shell to look for a newer app build right now.
  // → { status: 'offline'|'no-release'|'up-to-date'|'downloaded'|'error', current, remote }
  checkForUpdates: () => ipcRenderer.invoke('lb:checkForUpdates'),
  // Relaunch onto the newest downloaded build.
  relaunch: () => ipcRenderer.invoke('lb:relaunch'),
  // Add-ons (free core today) — see main.js stubs.
  getEntitlements: () => ipcRenderer.invoke('lb:getEntitlements'),
  activateLicense: (key) => ipcRenderer.invoke('lb:activateLicense', key),

  // ── Projects as files (Welcome window / multi-window, 2026-09-12) ──────
  project: {
    // What this window should show: { mode:'new' } or { mode:'open', path, name, json }
    boot: () => ipcRenderer.invoke('lb:project:boot'),
    // Quick Show Setup → Build My Show: create Documents/AV Look Book/<name>.avlb
    create: (name, json) => ipcRenderer.invoke('lb:project:create', name, json),
    // Write to this window's file (auto=true for autosave: no thumbnail refresh)
    save: (json, auto) => ipcRenderer.invoke('lb:project:save', json, !!auto),
    // Native Save As dialog → { ok, path } or { cancelled:true }
    saveAs: (json, suggestedName) => ipcRenderer.invoke('lb:project:saveAs', json, suggestedName),
    // Native Open dialog. intoThis=true → returns { ok, path, json } for this
    // window to apply; otherwise the file opens in its own window.
    open: (intoThis) => ipcRenderer.invoke('lb:project:open', !!intoThis),
    // A fresh project window (Quick Show Setup opens there).
    newWindow: () => ipcRenderer.invoke('lb:project:new'),
    // Bring the Welcome window back.
    welcome: () => ipcRenderer.invoke('lb:welcome:show')
  },
  // Menu commands from the shell: 'save' | 'saveAs'
  onMenu: (cb) => ipcRenderer.on('lb:menu', (_e, cmd) => cb(cmd))
});

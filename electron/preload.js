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
  activateLicense: (key) => ipcRenderer.invoke('lb:activateLicense', key)
});

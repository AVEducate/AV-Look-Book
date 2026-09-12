// Bridge for the Welcome window (welcome.html).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lookbookWelcome', {
  // { version, build, showOnLaunch, items:[{id,path,name,lastOpened,missing,thumb}] }
  list: () => ipcRenderer.invoke('lb:welcome:list'),
  // 'new' | 'openLast' | 'open' id | 'browse' | 'gettingStarted' |
  // 'removeConfirmed' id trash | 'setShowOnLaunch' bool
  action: (name, ...args) => ipcRenderer.invoke('lb:welcome:action', name, ...args),
  onRefresh: (cb) => ipcRenderer.on('lb:welcome:refresh', () => cb())
});

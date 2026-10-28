const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('superCodex', Object.freeze({
  platform: process.platform,
  getStatus: () => ipcRenderer.invoke('super-codex:status'),
  connect: () => ipcRenderer.invoke('super-codex:connect'),
  getModels: () => ipcRenderer.invoke('super-codex:models'),
  sendTurn: payload => ipcRenderer.invoke('super-codex:send', payload),
  cancelTurn: payload => ipcRenderer.invoke('super-codex:cancel', payload),
  windowAction: action => ipcRenderer.invoke('super-codex:window', action),
  onEvent: callback => {
    if (typeof callback !== 'function') throw new TypeError('Event callback must be a function.');
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('super-codex:event', handler);
    return () => ipcRenderer.removeListener('super-codex:event', handler);
  },
}));

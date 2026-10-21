const { contextBridge, ipcRenderer } = require('electron');

// Expose only purpose-specific operations; no Node, paths, pairing token or raw IPC.
contextBridge.exposeInMainWorld('callaDesktop', Object.freeze({
  platform: 'darwin',
  webOrigin: 'https://cauto.yeseo.im',
  getState: () => ipcRenderer.invoke('desktop:state'),
  setDraftState: (value) => ipcRenderer.send('desktop:draft', value),
  openWeb: () => ipcRenderer.invoke('desktop:open-web'),
  copyText: value => ipcRenderer.invoke('desktop:copy', value),
  storage: {
    getItem: (key) => ipcRenderer.invoke('desktop:storage', 'get', key),
    setItem: (key, value) => ipcRenderer.invoke('desktop:storage', 'set', key, value),
    removeItem: (key) => ipcRenderer.invoke('desktop:storage', 'remove', key),
  },
  onCommand: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('desktop:command', listener);
    return () => ipcRenderer.removeListener('desktop:command', listener);
  },
}));

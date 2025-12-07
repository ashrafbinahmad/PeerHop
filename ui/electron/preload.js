const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFile: () => ipcRenderer.invoke('select-file'),
    startTransfer: (filePath) => ipcRenderer.invoke('start-transfer', filePath),
    onStatus: (callback) => ipcRenderer.on('transfer-status', (_event, value) => callback(value))
});

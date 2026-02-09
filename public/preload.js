// Preload script - provides safe bridge between renderer and main process
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Add any IPC methods here if needed
  // Example: invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
});

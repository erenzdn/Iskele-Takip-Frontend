const { contextBridge, ipcRenderer } = require('electron');

// Electron preload must be CommonJS (.cjs) when package.json has "type": "module".
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  appVersion: (() => {
    try {
      return ipcRenderer.sendSync('get-app-version');
    } catch {
      return null;
    }
  })(),
  updates: {
    onUpdateChecking: (callback) => {
      const subscription = () => callback();
      ipcRenderer.on('update-checking', subscription);
      return () => ipcRenderer.removeListener('update-checking', subscription);
    },
    onUpdateAvailable: (callback) => {
      const subscription = (_event, info) => callback(info);
      ipcRenderer.on('update-available', subscription);
      return () => ipcRenderer.removeListener('update-available', subscription);
    },
    onUpdateNotAvailable: (callback) => {
      const subscription = (_event, info) => callback(info);
      ipcRenderer.on('update-not-available', subscription);
      return () => ipcRenderer.removeListener('update-not-available', subscription);
    },
    onUpdateError: (callback) => {
      const subscription = (_event, error) => callback(error);
      ipcRenderer.on('update-error', subscription);
      return () => ipcRenderer.removeListener('update-error', subscription);
    },
    onUpdateDownloadProgress: (callback) => {
      const subscription = (_event, progress) => callback(progress);
      ipcRenderer.on('update-download-progress', subscription);
      return () => ipcRenderer.removeListener('update-download-progress', subscription);
    },
    onUpdateDownloaded: (callback) => {
      const subscription = (_event, info) => callback(info);
      ipcRenderer.on('update-downloaded', subscription);
      return () => ipcRenderer.removeListener('update-downloaded', subscription);
    },
    startDownload: () => ipcRenderer.send('start-download'),
    installUpdate: () => ipcRenderer.send('install-update'),
    checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  },
  getLiveExchangeRates: () => ipcRenderer.invoke('get-live-exchange-rates'),
  saveFile: (options) => ipcRenderer.invoke('save-file-dialog', options),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),
});

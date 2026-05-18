import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  appVersion: ipcRenderer.sendSync('get-app-version'),
  updates: {
    onUpdateChecking: (callback: () => void) => {
      const subscription = () => callback();
      ipcRenderer.on('update-checking', subscription);
      return () => ipcRenderer.removeListener('update-checking', subscription);
    },
    onUpdateAvailable: (callback: (info: any) => void) => {
      const subscription = (_event: any, info: any) => callback(info);
      ipcRenderer.on('update-available', subscription);
      return () => ipcRenderer.removeListener('update-available', subscription);
    },
    onUpdateNotAvailable: (callback: (info: any) => void) => {
      const subscription = (_event: any, info: any) => callback(info);
      ipcRenderer.on('update-not-available', subscription);
      return () => ipcRenderer.removeListener('update-not-available', subscription);
    },
    onUpdateError: (callback: (error: string) => void) => {
      const subscription = (_event: any, error: string) => callback(error);
      ipcRenderer.on('update-error', subscription);
      return () => ipcRenderer.removeListener('update-error', subscription);
    },
    onUpdateDownloadProgress: (callback: (progress: any) => void) => {
      const subscription = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('update-download-progress', subscription);
      return () => ipcRenderer.removeListener('update-download-progress', subscription);
    },
    onUpdateDownloaded: (callback: (info: any) => void) => {
      const subscription = (_event: any, info: any) => callback(info);
      ipcRenderer.on('update-downloaded', subscription);
      return () => ipcRenderer.removeListener('update-downloaded', subscription);
    },
    startDownload: () => ipcRenderer.send('start-download'),
    installUpdate: () => ipcRenderer.send('install-update'),
    checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  },
});


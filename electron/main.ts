import { app, BrowserWindow, session, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Logger configuration
log.transports.file.level = 'info';
autoUpdater.logger = log;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    backgroundColor: '#0f0f1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'default',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5175');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-web/index.html'));
  }
}

app.whenReady().then(() => {
  // Content Security Policy ayarları
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (isDev) {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' blob: 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:* https://iskeletakip.mehmeterenozden.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* https://iskeletakip.mehmeterenozden.com; style-src 'self' 'unsafe-inline' http://localhost:*; connect-src 'self' blob: http://localhost:* ws://localhost:* https://iskeletakip.mehmeterenozden.com; img-src 'self' data: blob: http://localhost:* https://iskeletakip.mehmeterenozden.com; frame-src 'self' blob:; object-src 'self' blob:;"
          ],
        },
      });
    } else {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' blob: 'unsafe-inline' 'unsafe-eval' https://iskeletakip.mehmeterenozden.com; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' blob: https://iskeletakip.mehmeterenozden.com; img-src 'self' data: blob: https://iskeletakip.mehmeterenozden.com; frame-src 'self' blob:; object-src 'self' blob:;"
          ],
        },
      });
    }
  });

  createWindow();

  // --- Auto-updater Section ---
  autoUpdater.autoDownload = false; // Kullanıcı onayı olmadan indirme yapmasın

  if (!isDev) {
    log.info('Uygulama paketlenmiş modda, güncelleme kontrolü başlatılıyor...');
    autoUpdater.checkForUpdates();
  } else {
    log.info('Uygulama geliştirme modunda, güncelleme kontrolü atlandı.');
  }

  autoUpdater.on('checking-for-update', () => {
    log.info('Güncelleme kontrol ediliyor...');
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('update-checking');
    });
  });

  autoUpdater.on('update-available', (info: any) => {
    log.info('Yeni bir güncelleme bulundu:', info.version);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('update-available', info);
    });
  });

  autoUpdater.on('update-not-available', (info: any) => {
    log.info('Şu anki sürüm güncel:', info.version);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('update-not-available', info);
    });
  });

  autoUpdater.on('error', (err: Error) => {
    log.error('Güncelleme sırasında hata oluştu:', err);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('update-error', err.message);
    });
  });

  autoUpdater.on('download-progress', (progressObj: any) => {
    log.info(`İndirme ilerlemesi: %${progressObj.percent.toFixed(2)}`);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('update-download-progress', progressObj);
    });
  });

  autoUpdater.on('update-downloaded', (info: any) => {
    log.info('Güncelleme başarıyla indirildi. Sürüm:', info.version);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('update-downloaded', info);
    });
  });

  // Renderer'dan gelen sinyaller
  const { ipcMain } = require('electron');
  
  ipcMain.on('start-download', () => {
    log.info('Renderer: İndirme başlatılıyor...');
    autoUpdater.downloadUpdate();
  });

  ipcMain.on('install-update', () => {
    log.info('Renderer: Güncelleme yükleniyor ve yeniden başlatılıyor...');
    autoUpdater.quitAndInstall();
  });

  ipcMain.on('check-for-updates', () => {
    log.info('Renderer: Güncelleme kontrolü tetiklendi.');
    autoUpdater.checkForUpdates();
  });
  // --- End Auto-updater Section ---

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


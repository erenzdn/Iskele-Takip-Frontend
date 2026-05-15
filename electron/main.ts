import { app, BrowserWindow, session, dialog, ipcMain } from 'electron';
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
  // Windows için AppID set etmek şart (Bildirimler ve Updater için)
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.iskeletakip.app');
  }

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

  // ÖNEMLİ: Dinleyicileri (on) kontrolü başlatmadan ÖNCE tanımla
  autoUpdater.on('checking-for-update', () => {
    log.info('Güncelleme kontrol ediliyor...');
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('update-checking');
    });
  });

  autoUpdater.on('update-available', (info: any) => {
    log.info('Yeni bir güncelleme bulundu:', info.version);
    const windows = BrowserWindow.getAllWindows();
    log.info(`Sinyal gönderiliyor: update-available (Pencere sayısı: ${windows.length})`);
    windows.forEach(win => {
      // info nesnesini serileştirilebilir hale getirmek için deep copy yapıyoruz
      win.webContents.send('update-available', JSON.parse(JSON.stringify(info)));
    });
  });

  autoUpdater.on('update-not-available', (info: any) => {
    log.info('Şu anki sürüm güncel:', info.version);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('update-not-available', JSON.parse(JSON.stringify(info)));
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
      win.webContents.send('update-downloaded', JSON.parse(JSON.stringify(info)));
    });
  });

  // Dinleyiciler hazır olduktan sonra kontrolü başlat
  if (!isDev) {
    log.info('Uygulama paketlenmiş modda, güncelleme kontrolü başlatılıyor...');
    autoUpdater.checkForUpdates();
  } else {
    log.info('Uygulama geliştirme modunda, güncelleme kontrolü atlandı.');
  }

  // Renderer'dan gelen sinyaller
  
  
  ipcMain.on('start-download', () => {
    log.info('Renderer: İndirme başlatılıyor...');
    autoUpdater.downloadUpdate();
  });

  let isUpdating = false;

  ipcMain.on('install-update', () => {
    log.info('Renderer: Güncelleme yükleniyor ve yeniden başlatılıyor...');
    isUpdating = true;
    
    // Uygulamanın kapanmasını engelleyen bir durum varsa zorla kapatıp güncelle
    // quitAndInstall(isSilent, isForceRunAfter)
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 500);
  });

  app.on('before-quit', (e) => {
    if (isUpdating) {
      log.info('Güncelleme yükleniyor, çıkış işlemi engellenmiyor.');
    }
  });

  ipcMain.on('check-for-updates', () => {
    log.info('Renderer: Güncelleme kontrolü tetiklendi.');
    if (isDev) {
      log.info('Geliştirme modu: Güncel durumu simüle ediliyor...');
      setTimeout(() => {
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('update-not-available', { version: app.getVersion() });
        });
      }, 1500);
    } else {
      autoUpdater.checkForUpdates();
    }
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


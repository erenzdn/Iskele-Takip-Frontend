import { app, BrowserWindow, session, dialog, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';
import fs from 'fs/promises';
const require = createRequire(import.meta.url);

const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Logger configuration
log.transports.file.level = 'info';
autoUpdater.logger = log;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

type LiveExchangeRatesOk = {
  ok: true;
  usdSelling: number;
  eurSelling: number;
  date: string;
  source: string;
};

type LiveExchangeRatesErr = {
  ok: false;
  error: string;
};

function parseTcmbNumber(block: string, tag: string): number | null {
  const match = block.match(new RegExp(`<${tag}>([\\d.]+)</${tag}>`, 'i'));
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseTcmbCurrency(xml: string, code: 'USD' | 'EUR'): number | null {
  const block = xml.match(new RegExp(`<Currency[^>]*Kod="${code}"[\\s\\S]*?</Currency>`, 'i'))?.[0];
  if (!block) return null;
  const unit = parseTcmbNumber(block, 'Unit') ?? 1;
  const selling = parseTcmbNumber(block, 'ForexSelling');
  if (selling == null) return null;
  return selling / unit;
}

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTcmbRates(): Promise<LiveExchangeRatesOk> {
  const response = await fetchWithTimeout('https://www.tcmb.gov.tr/kurlar/today.xml');
  if (!response.ok) {
    throw new Error(`TCMB yanıt vermedi (${response.status})`);
  }
  const xml = await response.text();
  const usdSelling = parseTcmbCurrency(xml, 'USD');
  const eurSelling = parseTcmbCurrency(xml, 'EUR');
  if (usdSelling == null || eurSelling == null) {
    throw new Error('TCMB kurları okunamadı.');
  }
  const date = xml.match(/\bTarih="([^"]+)"/)?.[1] ?? '';
  return {
    ok: true,
    usdSelling,
    eurSelling,
    date,
    source: 'TCMB döviz satış',
  };
}

async function fetchFallbackRates(): Promise<LiveExchangeRatesOk> {
  const [usdRes, eurRes] = await Promise.all([
    fetchWithTimeout('https://open.er-api.com/v6/latest/USD'),
    fetchWithTimeout('https://open.er-api.com/v6/latest/EUR'),
  ]);
  if (!usdRes.ok || !eurRes.ok) {
    throw new Error('Yedek kur kaynağı yanıt vermedi.');
  }
  const usdJson = (await usdRes.json()) as { result?: string; rates?: { TRY?: number }; time_last_update_utc?: string };
  const eurJson = (await eurRes.json()) as { result?: string; rates?: { TRY?: number } };
  const usdSelling = Number(usdJson?.rates?.TRY);
  const eurSelling = Number(eurJson?.rates?.TRY);
  if (!Number.isFinite(usdSelling) || usdSelling <= 0 || !Number.isFinite(eurSelling) || eurSelling <= 0) {
    throw new Error('Yedek kur kaynağı okunamadı.');
  }
  return {
    ok: true,
    usdSelling,
    eurSelling,
    date: usdJson.time_last_update_utc ?? '',
    source: 'Piyasa kuru',
  };
}

async function fetchLiveExchangeRates(): Promise<LiveExchangeRatesOk | LiveExchangeRatesErr> {
  try {
    return await fetchTcmbRates();
  } catch (primaryErr) {
    log.warn('TCMB kuru alınamadı, yedek kaynağa geçiliyor:', primaryErr);
    try {
      return await fetchFallbackRates();
    } catch (fallbackErr) {
      const message = fallbackErr instanceof Error ? fallbackErr.message : 'Güncel kur alınamadı.';
      return { ok: false, error: message };
    }
  }
}

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

  // Zero-Trust: Token artık localStorage'da tutulmuyor, RAM'de tutuluyor.
  // Uygulama kapandığında otomatik olarak silinir, manuel temizlik gereksiz.

  if (isDev) {
    const devPort = process.env.VITE_DEV_PORT || '5175';
    mainWindow.loadURL(`http://localhost:${devPort}`);
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
            "default-src 'self' blob: 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:* https://iskeletakip.mehmeterenozden.com; script-src 'self' blob: 'unsafe-inline' 'unsafe-eval' http://localhost:* https://iskeletakip.mehmeterenozden.com; style-src 'self' 'unsafe-inline' http://localhost:* https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' blob: http://localhost:* ws://localhost:* https://iskeletakip.mehmeterenozden.com; img-src 'self' data: blob: http://localhost:* https://iskeletakip.mehmeterenozden.com; frame-src 'self' blob:; object-src 'self' blob:; worker-src 'self' blob:;"
          ],
        },
      });
    } else {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' blob: 'unsafe-inline' 'unsafe-eval' https://iskeletakip.mehmeterenozden.com; script-src 'self' blob: 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' blob: https://iskeletakip.mehmeterenozden.com; img-src 'self' data: blob: https://iskeletakip.mehmeterenozden.com; frame-src 'self' blob:; object-src 'self' blob:; worker-src 'self' blob:;"
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
      autoUpdater.checkForUpdates().catch((err: Error) => {
        log.error('Güncelleme kontrolü başlatılamadı:', err);
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('update-error', err.message);
        });
      });
    }
  });

  ipcMain.on('get-app-version', (event) => {
    if (isDev) {
      try {
        const pkg = require('../package.json');
        event.returnValue = pkg.version;
      } catch (e) {
        event.returnValue = app.getVersion();
      }
    } else {
      event.returnValue = app.getVersion();
    }
  });

  ipcMain.handle('get-live-exchange-rates', async () => {
    try {
      return await fetchLiveExchangeRates();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Güncel kur alınamadı.';
      log.error('Güncel kur alınamadı:', err);
      return { ok: false as const, error: message };
    }
  });

  // Dosya kaydetme diyalogu ve yazma işlemleri (Syncfusion Document Editor için)
  ipcMain.handle('save-file-dialog', async (_, options) => {
    const result = await dialog.showSaveDialog({
      defaultPath: options.defaultPath,
      filters: options.filters || [{ name: 'Word Belgesi', extensions: ['docx'] }],
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('write-file', async (_, filePath: string, data: ArrayBuffer) => {
    await fs.writeFile(filePath, Buffer.from(data));
    return true;
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


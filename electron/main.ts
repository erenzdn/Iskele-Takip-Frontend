import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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


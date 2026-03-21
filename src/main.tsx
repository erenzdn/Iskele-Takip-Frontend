import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

// react-pdf / pdf.js bazı ortamlarda URL.parse kullanır.
// Electron/Chromium sürümüne göre bu API olmayabilir; basit polyfill.
if (!(URL as any).parse) {
  (URL as any).parse = (url: string, base?: string) => {
    try {
      return new URL(url, base);
    } catch {
      return null;
    }
  };
}

// Bazı pdf.js sürümleri Promise.try kullanıyor; bu API tüm ortamlarda yok.
// Promise.try polyfill (generic tür bildirimi olmadan, derleyici uyumlu)
if (!(Promise as any).try) {
  (Promise as any).try = (fn: () => unknown): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      try {
        const result = fn();
        Promise.resolve(result).then(resolve, reject);
      } catch (err) {
        reject(err);
      }
    });
  };
}
if (!(URL as any).canParse) {
  (URL as any).canParse = (url: string, base?: string) => {
    try {
      // eslint-disable-next-line no-new
      new URL(url, base);
      return true;
    } catch {
      return false;
    }
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);


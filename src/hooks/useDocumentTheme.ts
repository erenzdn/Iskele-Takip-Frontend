import { useEffect } from 'react';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const STYLE_TAG_ID = 'doc-theme-remote';

/**
 * Backend'deki kanonik belge stil sayfasını (Iskele-Takip-Backend/src/services/documentStyles.js)
 * çekip <head>'e enjekte eder. Böylece editör kağıdı (.doc-root) PDF ile aynı CSS'i kullanır.
 * Çekilemezse paketlenmiş yedek (src/styles/documentTheme.css) geçerli kalır.
 */
let fetchPromise: Promise<void> | null = null;

function fetchAndInjectDocumentTheme(): Promise<void> {
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch(`${BASE_URL}/document-styles.css`)
    .then((res) => {
      if (!res.ok) throw new Error(`document-styles.css ${res.status}`);
      return res.text();
    })
    .then((css) => {
      if (!css.trim()) return;
      let styleEl = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_TAG_ID;
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = css;
    })
    .catch((error) => {
      console.warn('Kanonik belge stil sayfası alınamadı, paketlenmiş yedek kullanılıyor.', error);
    });

  return fetchPromise;
}

export function useDocumentTheme() {
  useEffect(() => {
    fetchAndInjectDocumentTheme();
  }, []);
}

import { useEffect, useSyncExternalStore } from 'react';
import bundledDocumentCss from '../styles/documentTheme.css?raw';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const STYLE_TAG_ID = 'doc-theme-remote';
export const DOCUMENT_THEME_UPDATED_EVENT = 'doc-theme-updated';

/**
 * Sunucudaki kanonik CSS ile bu uygulamanın paketlediği documentTheme.css aynı mı?
 * - in-sync: editör ile PDF aynı kurallarla çizer.
 * - out-of-sync: backend ile uygulama farklı sürümde (backend elle dağıtılıyor; biri geride
 *   kalmış). Editörün sayfalaması/kırılımı PDF'ten ayrışabilir — kullanıcı uyarılır.
 * - unavailable: CSS çekilemedi; paketlenmiş yedek kullanılıyor (PDF yine sunucu CSS'iyle basılır).
 */
export type DocumentThemeStatus = 'pending' | 'in-sync' | 'out-of-sync' | 'unavailable';

/** Yorumlar ve boşluklar karşılaştırmaya girmez (frontend dosyasının başında ek açıklama var) */
export function normalizeDocumentCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

let status: DocumentThemeStatus = 'pending';
const listeners = new Set<() => void>();

function setStatus(next: DocumentThemeStatus) {
  if (status === next) return;
  status = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Backend'deki kanonik belge stil sayfasını (IskeleTakipAPI/src/services/documentStyles.js)
 * çekip <head>'e enjekte eder. Böylece editör kağıdı (.doc-root) PDF ile aynı CSS'i kullanır.
 * Çekilemezse paketlenmiş yedek (src/styles/documentTheme.css) geçerli kalır.
 */
let fetchPromise: Promise<void> | null = null;

function fetchAndInjectDocumentTheme(): Promise<void> {
  if (fetchPromise) return fetchPromise;

  // cache: 'no-cache' — tarayıcı önbelleğindeki kopya her açılışta sunucuyla doğrulanır.
  // Aksi halde backend güncellendikten sonra editör saatlerce eski CSS'le çizip PDF'ten ayrışabiliyordu.
  fetchPromise = fetch(`${BASE_URL}/document-styles.css`, { cache: 'no-cache' })
    .then((res) => {
      if (!res.ok) throw new Error(`document-styles.css ${res.status}`);
      return res.text();
    })
    .then((css) => {
      if (!css.trim()) {
        setStatus('unavailable');
        return;
      }
      const inSync = normalizeDocumentCss(css) === normalizeDocumentCss(bundledDocumentCss);
      if (!inSync) {
        console.warn(
          'Sunucudaki belge stil sayfası (GET /document-styles.css) bu uygulama sürümünün documentTheme.css dosyasından farklı. ' +
            'Backend ile uygulama aynı sürümde değil; editör ile PDF önizlemesi ayrışabilir.'
        );
      }
      let styleEl = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_TAG_ID;
        document.head.appendChild(styleEl);
      }
      if (styleEl.textContent !== css) {
        styleEl.textContent = css;
        // Editör sayfalaması yeni CSS ile yeniden ölçsün (EditorPaginationExtension dinler)
        window.dispatchEvent(new Event(DOCUMENT_THEME_UPDATED_EVENT));
      }
      setStatus(inSync ? 'in-sync' : 'out-of-sync');
    })
    .catch((error) => {
      console.warn('Kanonik belge stil sayfası alınamadı, paketlenmiş yedek kullanılıyor.', error);
      setStatus('unavailable');
      // Sonraki editör açılışında yeniden denensin
      fetchPromise = null;
    });

  return fetchPromise;
}

/** Kanonik belge CSS'ini yükler; sunucu ile uygulamanın uyum durumunu döndürür. */
export function useDocumentTheme(): DocumentThemeStatus {
  useEffect(() => {
    fetchAndInjectDocumentTheme();
  }, []);
  return useSyncExternalStore(subscribe, () => status);
}

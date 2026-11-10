/**
 * Uygulamadaki gerçek teklif şablonu editörünü (QuoteTemplateEditorModal: araç çubuğu, sayfalama,
 * görsel/tablo çubukları dahil) backend olmadan açar. Ölçüm senaryosu electron-main.cjs'te.
 */
import { createRoot } from 'react-dom/client';
import '../../src/styles/index.css';
import '../../src/styles/documentTheme.css';
import '@fontsource/arimo/400.css';
import '@fontsource/arimo/700.css';
import QuoteTemplateEditorModal from '../../src/components/modals/QuoteTemplateEditorModal';
import featuresTemplate from '../document-parity/features-template.html?raw';

declare global {
  interface Window {
    __featuresTemplate: string;
    __longTasks: number[];
  }
}

window.__featuresTemplate = featuresTemplate;
window.__longTasks = [];
try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__longTasks.push(entry.duration);
  }).observe({ type: 'longtask', buffered: true });
} catch {
  /* longtask desteklenmiyor */
}

createRoot(document.getElementById('root')!).render(
  <QuoteTemplateEditorModal template={null} isNew onClose={() => {}} />
);

/**
 * Şablon editörünü uygulamadaki ile AYNI eklenti, CSS ve font ile açar (Vite + Electron),
 * sayfalama oturunca her görünür glifin sayfa/x/taban çizgisi konumunu çıkarır.
 * Çıktı: window.__parity = { glyphs, exportContent, pageCount }
 */
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableRow } from '@tiptap/extension-table-row';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { FontFamily, TextStyle } from '@tiptap/extension-text-style';

import '../../src/styles/index.css';
import '../../src/styles/documentTheme.css';
import '@fontsource/arimo/400.css';
import '@fontsource/arimo/700.css';
import '@fontsource/arimo/400-italic.css';
import '@fontsource/arimo/700-italic.css';
// Yazı tipi seçicideki ek fontlar (uygulamada main.tsx yükler)
import '../../src/styles/documentFonts';
import { EditorTabKey } from '../../src/components/modals/EditorTabKeyExtension';

import { CustomImage } from '../../src/components/modals/CustomImageExtension';
import { LineHeight } from '../../src/components/modals/LineHeightExtension';
import { FontSize } from '../../src/components/modals/FontSizeExtension';
import {
  CustomTable,
  CustomTableCell,
  CustomTableHeader,
  prepareTemplateContentForExport,
  ensureLayoutTablesBorderless,
} from '../../src/components/modals/CustomTableExtensions';
import { PageBreak } from '../../src/components/modals/PageBreakExtension';
import { EditorPagination } from '../../src/components/modals/EditorPaginationExtension';
import { EditorWidgetPreview } from '../../src/components/modals/EditorWidgetPreviewExtension';
import { readPageMetrics } from '../../src/components/modals/editorPagination';
import {
  getPageMarginsPaperStyle,
  withPageMargins,
  type PageMargins,
} from '../../src/components/modals/PageMargins';
import stressTemplate from './stress-template.json';
// Araç çubuğundaki her işlemi içeren şablon (make-features-template.cjs); editöre HTML olarak
// eklenir — Düzen menüsünün yaptığı gibi editör kendisi ayrıştırır
import featuresTemplate from './features-template.html?raw';
// Alan + Türkçe ek / noktalama (make-features-template.cjs)
import fieldsTemplate from './fields-template.html?raw';
// Yazı tipi seçicideki her font × biçim, Tab girintisi (make-features-template.cjs)
import fontsTemplate from './fonts-template.html?raw';

/*
 * Ölçüm penceresi gizli (show: false): Chromium gizli pencerede kare üretmez ve
 * requestAnimationFrame geri çağrıları bir sonraki tesadüfi kareye kadar (≈1 sn) bekler.
 * Sayfalama, geç yüklenen yazı tipinden sonraki yeniden ölçümü RAF ile yaptığı için ölçüm eski
 * kalıyordu. Görünür penceredeki gibi ~60 Hz zamanlayıcıyla beslenir (yalnızca bu araçta).
 */
window.requestAnimationFrame = (callback: FrameRequestCallback) =>
  window.setTimeout(() => callback(performance.now()), 16);
window.cancelAnimationFrame = (handle: number) => window.clearTimeout(handle);

const templateName = new URLSearchParams(location.search).get('t') || 'stress';
const templates: Record<string, unknown> = {
  stress: stressTemplate,
  features: featuresTemplate,
  fields: fieldsTemplate,
  fonts: fontsTemplate,
};
const templateContent = templates[templateName] ?? stressTemplate;

declare global {
  interface Window {
    __parity?: unknown;
    __parityError?: string;
  }
}

const params = new URLSearchParams(location.search);
const [top, right, bottom, left] = (params.get('m') || '15,15,15,15').split(',').map(Number);
const margins: PageMargins = { top, right, bottom, left };

type Glyph = { page: number; x: number; baseline: number; size: number; ch: string };

function isHidden(element: Element | null): boolean {
  for (let el = element; el && !el.classList?.contains('ProseMirror'); el = el.parentElement) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
  }
  if (!element) return true;
  return parseFloat(getComputedStyle(element).fontSize) < 1;
}

const ascentCache = new Map<string, number>();

/**
 * Harf kutusunun üstünden taban çizgisine uzaklık (px). Sıfır yükseklikli satır içi blok taban
 * çizgisine oturur: kutunun altı = taban çizgisi. Arimo dışı fontlarda sabit oran yanlış olurdu.
 */
function fontAscent(element: Element): number {
  const style = getComputedStyle(element);
  const key = `${style.fontFamily}|${style.fontSize}|${style.fontWeight}|${style.fontStyle}`;
  const cached = ascentCache.get(key);
  if (cached != null) return cached;
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;left:-9999px;top:0;white-space:nowrap;line-height:normal;font-family:${style.fontFamily};font-size:${style.fontSize};font-weight:${style.fontWeight};font-style:${style.fontStyle}`;
  const text = document.createElement('span');
  text.textContent = 'Hxg';
  const marker = document.createElement('span');
  marker.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  probe.append(text, marker);
  document.body.appendChild(probe);
  const range = document.createRange();
  range.selectNodeContents(text);
  const ascent = marker.getBoundingClientRect().bottom - range.getBoundingClientRect().top;
  probe.remove();
  ascentCache.set(key, ascent);
  return ascent;
}

function extractGlyphs(paper: HTMLElement): { glyphs: Glyph[]; pageCount: number } {
  const metrics = readPageMetrics(paper);
  const step = metrics.pageHeight + metrics.pageGap;
  const paperRect = paper.getBoundingClientRect();
  const pm = paper.querySelector('.ProseMirror') as HTMLElement;
  const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
  const glyphs: Glyph[] = [];
  const range = document.createRange();

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (isHidden(parent)) continue;
    const size = parseFloat(getComputedStyle(parent!).fontSize);
    // Chrome yazı kutusunu tam sayıya yuvarlanmış ascent ile çizer; ascent yazı tipine göre ölçülür
    const ascent = fontAscent(parent!);
    const text = node.textContent || '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (/\s/.test(ch)) continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = Array.from(range.getClientRects()).find((r) => r.width > 0 && r.height > 0);
      if (!rect) continue;
      // Sayfa, taban çizgisine göre: sayfanın ilk satırının yazı kutusu sayfa sınırının
      // kesir piksel üstünden başlayabilir
      const absBaseline = rect.top - paperRect.top + ascent;
      const page = Math.floor(absBaseline / step);
      glyphs.push({
        page,
        x: rect.left - paperRect.left,
        baseline: absBaseline - page * step,
        size,
        ch,
      });
    }
  }
  const pageCount = Math.max(1, Math.round(paper.getBoundingClientRect().height / step));
  return { glyphs, pageCount };
}

function Harness() {
  const editor = useEditor({
    extensions: [
      StarterKit,
      CustomImage,
      CustomTable.configure({ resizable: true }),
      TableRow,
      CustomTableCell,
      CustomTableHeader,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      LineHeight,
      PageBreak,
      EditorPagination,
      EditorWidgetPreview.configure({ context: 'contract' }),
      EditorTabKey,
    ],
    content: templateContent,
  });

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    (async () => {
      await document.fonts.ready;
      const paper = document.querySelector('.template-editor-paper') as HTMLElement;
      // Sayfalama birkaç kare içinde oturur; konum değişmeyene kadar bekle
      let last = '';
      for (let i = 0; i < 60 && !cancelled; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const sig = `${paper.getBoundingClientRect().height}|${paper.querySelectorAll('.editor-page-gap').length}`;
        if (sig === last && i > 5) break;
        last = sig;
      }
      // Sayfalama kararlı noktada mı? Yeniden ölçüm aralıkları değiştirirse editör eski bir
      // ölçümde kalmış demektir — ölçüm geçersiz.
      {
        const gaps = () =>
          Array.from(paper.querySelectorAll('.editor-page-gap'))
            .map((g) => (g as HTMLElement).style.height)
            .join(',');
        const before = gaps();
        window.dispatchEvent(new Event('doc-theme-updated'));
        await new Promise((r) => setTimeout(r, 300));
        if (gaps() !== before) throw new Error(`Sayfalama kararlı değil: ${before} → ${gaps()}`);
      }
      ensureLayoutTablesBorderless(editor);
      const exportContent = withPageMargins(
        prepareTemplateContentForExport(editor.getJSON()),
        margins
      );
      // Hata ayıklama: üst düzey blokların konumu (sayfa aralıkları dahil)
      const pmRoot = paper.querySelector('.ProseMirror') as HTMLElement;
      const rootTop = pmRoot.getBoundingClientRect().top;
      const blocks = Array.from(pmRoot.children).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: `${el.tagName.toLowerCase()}.${(el as HTMLElement).className}`,
          top: +(r.top - rootTop).toFixed(2),
          height: +r.height.toFixed(2),
          gaps: Array.from(el.querySelectorAll('.editor-page-gap')).map((g) => {
            const r = g.getBoundingClientRect();
            return { top: +(r.top - rootTop).toFixed(2), height: +r.height.toFixed(2), style: (g as HTMLElement).style.height };
          }),
          text: (el.textContent || '').slice(0, 40),
        };
      });
      window.__parity = { ...extractGlyphs(paper), exportContent, blocks };
      (window as unknown as { __editor: unknown }).__editor = editor;
    })().catch((error) => {
      window.__parityError = String(error?.stack || error);
    });
    return () => {
      cancelled = true;
    };
  }, [editor]);

  if (!editor) return null;
  return (
    <div className="template-editor-workspace" style={{ padding: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0' }}>
        <div className="template-editor-paper doc-root" style={getPageMarginsPaperStyle(margins)}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);

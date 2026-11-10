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
import { TextStyle } from '@tiptap/extension-text-style';

import '../../src/styles/index.css';
import '../../src/styles/documentTheme.css';
import '@fontsource/arimo/400.css';
import '@fontsource/arimo/700.css';
import '@fontsource/arimo/400-italic.css';
import '@fontsource/arimo/700-italic.css';

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
    // Chrome yazı kutusunu tam sayıya yuvarlanmış ascent ile çizer (Arimo ascent 1854/2048)
    const ascent = Math.round((1854 / 2048) * size);
    const text = node.textContent || '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (/\s/.test(ch)) continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = Array.from(range.getClientRects()).find((r) => r.width > 0 && r.height > 0);
      if (!rect) continue;
      const absTop = rect.top - paperRect.top;
      const page = Math.floor(absTop / step);
      glyphs.push({
        page,
        x: rect.left - paperRect.left,
        baseline: absTop - page * step + ascent,
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
      FontSize,
      LineHeight,
      PageBreak,
      EditorPagination,
      EditorWidgetPreview.configure({ context: 'contract' }),
    ],
    content: stressTemplate,
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
      ensureLayoutTablesBorderless(editor);
      const exportContent = withPageMargins(
        prepareTemplateContentForExport(editor.getJSON()),
        margins
      );
      window.__parity = { ...extractGlyphs(paper), exportContent };
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

import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Mark } from '@tiptap/pm/model';
import type { DocumentPreviewContext, DocumentPreviewSample } from '../../constants/documentPreviewSampleData';
import { getLocalDocumentPreviewSample } from '../../constants/documentPreviewSampleData';
import {
  isDocumentWidgetKey,
  renderDocumentWidgetHtml,
  type DocumentWidgetKey,
} from '../../utils/documentWidgetHtml';

export const editorWidgetPreviewPluginKey = new PluginKey('editorWidgetPreview');

const PLACEHOLDER_PATTERN = /\{\{([a-zA-Z0-9_.]+)\}\}/g;

export type EditorWidgetPreviewOptions = {
  context: DocumentPreviewContext;
  getSample?: () => DocumentPreviewSample;
};

type WidgetBlock = { key: DocumentWidgetKey; from: number; to: number };
type PlaceholderInline = {
  key: string;
  from: number;
  to: number;
  value: string;
  marks: readonly Mark[];
};

function findWidgetParagraphs(doc: Editor['state']['doc']): WidgetBlock[] {
  const widgets: WidgetBlock[] = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;

    const match = node.textContent.trim().match(/^\{\{([a-zA-Z0-9_.]+)\}\}$/);
    if (!match) return;

    const key = match[1];
    if (!isDocumentWidgetKey(key)) return;

    widgets.push({ key, from: pos, to: pos + node.nodeSize });
  });

  return widgets;
}

function findPlaceholderRanges(
  doc: Editor['state']['doc'],
  placeholders: Record<string, string>
): PlaceholderInline[] {
  const results: PlaceholderInline[] = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    if (!node.textContent.includes('{{')) return;

    // textContent satır sonu (hardBreak) ve görsel gibi metin dışı satır içi düğümleri saymaz,
    // ama bunlar belgede 1 konum kaplar. Karakter → belge konumu eşlemesini düğüm düğüm
    // kuruyoruz; aksi halde bu düğümlerden sonraki alanların önizlemesi kayıyordu.
    let text = '';
    const positions: number[] = [];
    node.forEach((child, offset) => {
      const childPos = pos + 1 + offset;
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) {
          text += child.text[i];
          positions.push(childPos + i);
        }
      } else {
        text += '￼';
        positions.push(childPos);
      }
    });

    let match: RegExpExecArray | null;
    PLACEHOLDER_PATTERN.lastIndex = 0;

    while ((match = PLACEHOLDER_PATTERN.exec(text)) !== null) {
      const key = match[1];
      if (isDocumentWidgetKey(key)) continue;
      if (placeholders[key] === undefined) continue;

      const from = positions[match.index];
      const to = positions[match.index + match[0].length - 1] + 1;
      // Önizleme, alanın ilk karakterinin biçimini (kalın, yazı boyutu…) taşısın; PDF'te
      // değer aynı biçimli metnin yerine geçer.
      const marks = doc.nodeAt(from)?.marks ?? [];
      results.push({ key, from, to, value: placeholders[key], marks });
    }
  });

  return results;
}

function createWidgetPreviewElement(html: string, widgetKey: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'editor-widget-preview doc-widget';
  wrapper.setAttribute('contenteditable', 'false');
  wrapper.setAttribute('data-widget-key', widgetKey);
  wrapper.setAttribute('aria-label', `Önizleme: ${widgetKey}`);
  wrapper.innerHTML = html;
  return wrapper;
}

function createPlaceholderPreviewElement(value: string, key: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'editor-placeholder-preview';
  span.setAttribute('contenteditable', 'false');
  span.setAttribute('data-placeholder-key', key);
  span.setAttribute('aria-label', `Önizleme: ${key}`);
  span.textContent = value;
  return span;
}

/** Örnek veri sabit nesnedir; widget HTML'i her tuş vuruşunda yeniden üretilmesin */
const widgetHtmlCache = new WeakMap<DocumentPreviewSample, Map<DocumentWidgetKey, string>>();

function getWidgetHtml(key: DocumentWidgetKey, sample: DocumentPreviewSample): string {
  let cache = widgetHtmlCache.get(sample);
  if (!cache) {
    cache = new Map();
    widgetHtmlCache.set(sample, cache);
  }
  let html = cache.get(key);
  if (html === undefined) {
    html = renderDocumentWidgetHtml(key, sample.raw);
    cache.set(key, html);
  }
  return html;
}

function buildPreviewDecorations(
  doc: Editor['state']['doc'],
  sample: DocumentPreviewSample
): DecorationSet {
  const decorations: Decoration[] = [];
  const widgets = findWidgetParagraphs(doc);
  // Widget anahtarları konum içermez: önce yazılan metin konumu kaydırınca ProseMirror önizleme
  // DOM'unu silip yeniden kurmasın (büyük tablo önizlemesi her tuşta yeniden çiziliyordu).
  const occurrences = new Map<string, number>();
  const nextOccurrence = (key: string) => {
    const n = occurrences.get(key) ?? 0;
    occurrences.set(key, n + 1);
    return n;
  };

  for (const widget of widgets) {
    const html = getWidgetHtml(widget.key, sample);
    decorations.push(
      Decoration.node(widget.from, widget.to, {
        class: 'editor-widget-source-hidden',
      }),
      Decoration.widget(
        widget.from,
        () => createWidgetPreviewElement(html, widget.key),
        {
          side: -1,
          key: `editor-widget-${widget.key}-${nextOccurrence(`w:${widget.key}`)}`,
        }
      )
    );
  }

  const placeholders = findPlaceholderRanges(doc, sample.placeholders);
  for (const placeholder of placeholders) {
    decorations.push(
      Decoration.inline(placeholder.from, placeholder.to, {
        class: 'editor-placeholder-source-hidden',
      }),
      Decoration.widget(
        placeholder.from,
        () => createPlaceholderPreviewElement(placeholder.value, placeholder.key),
        {
          side: -1,
          marks: placeholder.marks,
          key: `editor-placeholder-${placeholder.key}-${nextOccurrence(`p:${placeholder.key}`)}-${placeholder.value}-${JSON.stringify(placeholder.marks.map((m) => m.toJSON()))}`,
        }
      )
    );
  }

  if (decorations.length === 0) return DecorationSet.empty;
  return DecorationSet.create(doc, decorations);
}

export const EditorWidgetPreview = Extension.create<EditorWidgetPreviewOptions>({
  name: 'editorWidgetPreview',

  addOptions() {
    return {
      context: 'quote' as DocumentPreviewContext,
      getSample: undefined,
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key: editorWidgetPreviewPluginKey,
        state: {
          init: (_, { doc }) => {
            const sample = extension.options.getSample?.() ?? getLocalDocumentPreviewSample(extension.options.context);
            return buildPreviewDecorations(doc, sample);
          },
          apply(tr, set, _oldState, newState) {
            if (!tr.docChanged && !tr.getMeta(editorWidgetPreviewPluginKey)) {
              return set.map(tr.mapping, tr.doc);
            }
            const sample = extension.options.getSample?.() ?? getLocalDocumentPreviewSample(extension.options.context);
            return buildPreviewDecorations(newState.doc, sample);
          },
        },
        props: {
          decorations(state) {
            return editorWidgetPreviewPluginKey.getState(state) ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

export function refreshEditorWidgetPreview(editor: Editor) {
  if (!editor?.view) return;
  editor.view.dispatch(
    editor.state.tr.setMeta(editorWidgetPreviewPluginKey, { refresh: true })
  );
}

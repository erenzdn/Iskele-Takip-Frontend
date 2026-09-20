import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
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
type PlaceholderInline = { key: string; from: number; to: number; value: string };

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

    const text = node.textContent;
    if (!text.includes('{{')) return;

    const blockStart = pos + 1;
    let match: RegExpExecArray | null;
    PLACEHOLDER_PATTERN.lastIndex = 0;

    while ((match = PLACEHOLDER_PATTERN.exec(text)) !== null) {
      const key = match[1];
      if (isDocumentWidgetKey(key)) continue;
      if (placeholders[key] === undefined) continue;

      const from = blockStart + match.index;
      const to = from + match[0].length;
      results.push({ key, from, to, value: placeholders[key] });
    }
  });

  return results;
}

function createWidgetPreviewElement(html: string, widgetKey: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'editor-widget-preview doc-root';
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

function buildPreviewDecorations(
  doc: Editor['state']['doc'],
  sample: DocumentPreviewSample
): DecorationSet {
  const decorations: Decoration[] = [];
  const widgets = findWidgetParagraphs(doc);

  for (const widget of widgets) {
    const html = renderDocumentWidgetHtml(widget.key, sample.raw);
    decorations.push(
      Decoration.node(widget.from, widget.to, {
        class: 'editor-widget-source-hidden',
      }),
      Decoration.widget(
        widget.from,
        () => createWidgetPreviewElement(html, widget.key),
        {
          side: -1,
          key: `editor-widget-${widget.key}-${widget.from}`,
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
          key: `editor-placeholder-${placeholder.key}-${placeholder.from}`,
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

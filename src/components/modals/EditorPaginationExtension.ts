import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view';
import {
  computeAutoPageGapTargets,
  dedupeGapTargets,
  findTableRowNodeRange,
  readPageMetrics,
  type LayoutUnit,
  type PageGapTarget,
} from './editorPagination';

export const editorPaginationPluginKey = new PluginKey('editorPagination');

const TABLE_PAGE_BREAK_CLASS = 'editor-table-page-break';

function createPageGapElement(): HTMLElement {
  const element = document.createElement('div');
  element.className = 'editor-page-gap';
  element.setAttribute('contenteditable', 'false');
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function resolveDomPos(view: EditorView, element: Element): number | null {
  try {
    const pos = view.posAtDOM(element, 0);
    return pos >= 0 ? pos : null;
  } catch {
    return null;
  }
}

function measureHeight(element: HTMLElement): number {
  return Math.max(element.offsetHeight, element.getBoundingClientRect().height);
}

function collectLayoutUnits(view: EditorView): LayoutUnit[] {
  const editorDom = view.dom as HTMLElement;
  const units: LayoutUnit[] = [];

  for (const child of Array.from(editorDom.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.classList.contains('editor-page-gap')) continue;

    if (child.classList.contains('page-break') || child.dataset.pageBreak === 'true') {
      const pos = resolveDomPos(view, child);
      if (pos != null) units.push({ docPos: pos, height: 0, isPageBreak: true, kind: 'block' });
      continue;
    }

    if (child.tagName === 'TABLE') {
      child.querySelectorAll('tr').forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        const rowPos = resolveDomPos(view, row);
        if (rowPos == null) return;
        const height = measureHeight(row);
        if (height <= 0.5) return;
        units.push({ docPos: rowPos, height, isPageBreak: false, kind: 'table-row' });
      });
      continue;
    }

    if (child.tagName === 'UL' || child.tagName === 'OL') {
      child.querySelectorAll(':scope > li').forEach((item) => {
        if (!(item instanceof HTMLElement)) return;
        const itemPos = resolveDomPos(view, item);
        if (itemPos == null) return;
        const height = measureHeight(item);
        if (height <= 0.5) return;
        units.push({ docPos: itemPos, height, isPageBreak: false, kind: 'block' });
      });
      continue;
    }

    const pos = resolveDomPos(view, child);
    if (pos == null) continue;
    const height = measureHeight(child);
    if (height <= 0.5) continue;
    units.push({ docPos: pos, height, isPageBreak: false, kind: 'block' });
  }

  return units;
}

function createGapDecoration(view: EditorView, target: PageGapTarget, index: number): Decoration | null {
  if (target.kind === 'table-row') {
    const range = findTableRowNodeRange(view.state.doc, target.docPos);
    if (!range) return null;
    return Decoration.node(range.from, range.to, { class: TABLE_PAGE_BREAK_CLASS });
  }

  return Decoration.widget(target.docPos, createPageGapElement, {
    side: -1,
    key: `editor-page-gap-${index}-${target.docPos}`,
  });
}

function buildDecorationSet(view: EditorView): DecorationSet {
  const paper = (view.dom as HTMLElement).closest('.template-editor-paper');
  if (!(paper instanceof HTMLElement)) return DecorationSet.empty;

  const metrics = readPageMetrics(paper);
  const units = collectLayoutUnits(view);
  const targets = dedupeGapTargets(
    computeAutoPageGapTargets(units, metrics.pageContentHeight, metrics.pageGap)
  );

  const decorations = targets
    .map((target, index) => createGapDecoration(view, target, index))
    .filter((deco): deco is Decoration => deco != null);

  return DecorationSet.create(view.state.doc, decorations);
}

function decorationSetsEqual(a: DecorationSet, b: DecorationSet): boolean {
  const aa = a.find();
  const bb = b.find();
  if (aa.length !== bb.length) return false;
  return aa.every((deco, index) => {
    const other = bb[index];
    return deco.from === other?.from && deco.to === other?.to;
  });
}

export const EditorPagination = Extension.create({
  name: 'editorPagination',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: editorPaginationPluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set, _oldState, newState) {
            const mapped = set.map(tr.mapping, newState.doc);
            const meta = tr.getMeta(editorPaginationPluginKey) as
              | { decorations?: DecorationSet }
              | undefined;
            return meta?.decorations ?? mapped;
          },
        },
        props: {
          decorations(state) {
            return editorPaginationPluginKey.getState(state) ?? DecorationSet.empty;
          },
        },
        view(view) {
          let frame = 0;
          let scheduled = false;
          let refinePass = 0;

          const applyDecorations = () => {
            scheduled = false;
            if (!view.dom.isConnected) return;

            const next = buildDecorationSet(view);
            const current = editorPaginationPluginKey.getState(view.state) ?? DecorationSet.empty;

            if (decorationSetsEqual(current, next)) {
              refinePass = 0;
              return;
            }

            view.dispatch(
              view.state.tr
                .setMeta('addToHistory', false)
                .setMeta(editorPaginationPluginKey, { decorations: next })
            );

            refinePass += 1;
            if (refinePass < 4) {
              schedule();
            }
          };

          const schedule = () => {
            if (scheduled) return;
            scheduled = true;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(applyDecorations);
          };

          schedule();

          const resizeObserver =
            typeof ResizeObserver !== 'undefined'
              ? new ResizeObserver(() => {
                  refinePass = 0;
                  schedule();
                })
              : null;

          resizeObserver?.observe(view.dom);
          const paper = view.dom.closest('.template-editor-paper');
          if (paper instanceof HTMLElement) resizeObserver?.observe(paper);

          return {
            update() {
              refinePass = 0;
              schedule();
            },
            destroy() {
              cancelAnimationFrame(frame);
              resizeObserver?.disconnect();
            },
          };
        },
      }),
    ];
  },
});

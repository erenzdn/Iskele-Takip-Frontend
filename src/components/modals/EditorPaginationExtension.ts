import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view';
import {
  computeAutoPageGapTargets,
  computeEditorPageLayout,
  dedupeGapTargets,
  findTableRowNodeRange,
  getContentExtent,
  groupElementLineRects,
  measureElementLayout,
  readPageMetrics,
  resolveMinimumPageCount,
  parseCssLengthToPx,
  type LayoutUnit,
  type PageGapTarget,
} from './editorPagination';

const LINE_BREAK_TAGS = new Set(['P', 'LI', 'BLOCKQUOTE', 'PRE']);

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

function coordsTopInEditor(view: EditorView, pos: number, editorRoot: HTMLElement): number {
  const rootRect = editorRoot.getBoundingClientRect();
  const coords = view.coordsAtPos(pos);
  return coords.top - rootRect.top + editorRoot.scrollTop;
}

function findDocumentPosAtEditorTop(
  view: EditorView,
  blockPos: number,
  targetTop: number
): number {
  const editorDom = view.dom as HTMLElement;
  const node = view.state.doc.nodeAt(blockPos);
  if (!node) return blockPos;

  const start = blockPos + 1;
  const end = blockPos + node.nodeSize - 1;
  if (start >= end) return blockPos;

  let bestPos = blockPos;
  let bestDelta = Infinity;

  for (let pos = start; pos < end; pos++) {
    const top = coordsTopInEditor(view, pos, editorDom);
    const delta = Math.abs(top - targetTop);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestPos = pos;
    }
    if (top > targetTop + 4) break;
  }

  return bestPos;
}

function collectTextLineUnits(
  view: EditorView,
  element: HTMLElement,
  blockPos: number,
  editorDom: HTMLElement
): LayoutUnit[] {
  const lines = groupElementLineRects(element, editorDom);
  if (lines.length <= 1) return [];

  return lines.map((line) => ({
    docPos: findDocumentPosAtEditorTop(view, blockPos, line.offsetTop),
    height: line.height,
    offsetTop: line.offsetTop,
    isPageBreak: false,
    kind: 'line' as const,
  }));
}

function collectLayoutUnits(view: EditorView): LayoutUnit[] {
  const editorDom = view.dom as HTMLElement;
  const units: LayoutUnit[] = [];

  const pushUnit = (
    element: HTMLElement,
    docPos: number,
    kind: LayoutUnit['kind'],
    isPageBreak = false
  ) => {
    const layout = measureElementLayout(element, editorDom);
    if (!isPageBreak && layout.height <= 0.5) return;
    units.push({
      docPos,
      height: layout.height,
      offsetTop: layout.offsetTop,
      isPageBreak,
      kind,
    });
  };

  for (const child of Array.from(editorDom.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.classList.contains('editor-page-gap')) continue;

    if (child.classList.contains('editor-widget-preview')) {
      const pos = resolveDomPos(view, child);
      if (pos == null) continue;
      pushUnit(child, pos, 'block');
      continue;
    }

    if (child.classList.contains('page-break') || child.dataset.pageBreak === 'true') {
      const pos = resolveDomPos(view, child);
      if (pos != null) pushUnit(child, pos, 'block', true);
      continue;
    }

    if (child.tagName === 'TABLE') {
      child.querySelectorAll('tr').forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        const rowPos = resolveDomPos(view, row);
        if (rowPos == null) return;
        pushUnit(row, rowPos, 'table-row');
      });
      continue;
    }

    if (child.tagName === 'UL' || child.tagName === 'OL') {
      child.querySelectorAll(':scope > li').forEach((item) => {
        if (!(item instanceof HTMLElement)) return;
        const itemPos = resolveDomPos(view, item);
        if (itemPos == null) return;
        pushUnit(item, itemPos, 'block');
      });
      continue;
    }

    const pos = resolveDomPos(view, child);
    if (pos == null) continue;

    if (LINE_BREAK_TAGS.has(child.tagName)) {
      const lineUnits = collectTextLineUnits(view, child, pos, editorDom);
      if (lineUnits.length > 0) {
        units.push(...lineUnits);
        continue;
      }
    }

    pushUnit(child, pos, 'block');
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
    computeAutoPageGapTargets(
      units,
      metrics.pageContentHeight,
      metrics.interPageSpacing,
      metrics.marginTop
    )
  );

  applyEditorPageLayout(view, paper, units, targets, metrics);

  const decorations = targets
    .map((target, index) => createGapDecoration(view, target, index))
    .filter((deco): deco is Decoration => deco != null);

  return DecorationSet.create(view.state.doc, decorations);
}

function applyEditorPageLayout(
  view: EditorView,
  paper: HTMLElement,
  units: LayoutUnit[],
  targets: PageGapTarget[],
  metrics: ReturnType<typeof readPageMetrics>
) {
  const contentExtent = getContentExtent(units);
  const minimumPages = resolveMinimumPageCount(units, targets.length);
  const { pageCount, minHeightPx } = computeEditorPageLayout(
    contentExtent,
    metrics.pageContentHeight,
    metrics.interPageSpacing,
    minimumPages
  );

  const styles = getComputedStyle(paper);
  const marginTop = parseCssLengthToPx(styles.getPropertyValue('--page-margin-top'), paper);
  const marginBottom = parseCssLengthToPx(styles.getPropertyValue('--page-margin-bottom'), paper);
  const marginLeft = styles.getPropertyValue('--page-margin-left').trim() || '0mm';
  const marginRight = styles.getPropertyValue('--page-margin-right').trim() || '0mm';
  const pageHeightPx = metrics.pageHeight;
  const proseTotalHeight = marginTop + minHeightPx + marginBottom;
  const paperFromPages =
    pageCount * pageHeightPx + Math.max(0, pageCount - 1) * metrics.pageGap;
  const paperMinHeight = Math.max(paperFromPages, proseTotalHeight);
  const trailingFill = Math.max(0, minHeightPx - contentExtent);

  const editorDom = view.dom as HTMLElement;
  editorDom.style.setProperty('--editor-flow-min-height', `${minHeightPx}px`);
  editorDom.style.setProperty('--editor-trailing-fill', `${trailingFill}px`);
  editorDom.style.setProperty('--editor-page-count', String(pageCount));
  editorDom.style.setProperty('--page-margin-top', styles.getPropertyValue('--page-margin-top').trim() || '0mm');
  editorDom.style.setProperty('--page-margin-bottom', styles.getPropertyValue('--page-margin-bottom').trim() || '0mm');
  editorDom.style.setProperty('--page-margin-left', marginLeft);
  editorDom.style.setProperty('--page-margin-right', marginRight);
  editorDom.style.setProperty(
    '--page-content-height',
    styles.getPropertyValue('--page-content-height').trim() ||
      `${Math.max(1, pageHeightPx - marginTop - marginBottom)}px`
  );
  editorDom.style.minHeight = `${minHeightPx}px`;

  paper.style.setProperty('--editor-paper-min-height', `${paperMinHeight}px`);
  paper.style.minHeight = `${paperMinHeight}px`;
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
            if (refinePass < 8) {
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

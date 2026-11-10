import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view';
import {
  computeEditorPageLayout,
  dedupeGapTargets,
  findTableRowNodeRange,
  measureElementLayout,
  measureTextLines,
  paginateNaturalLayout,
  readPageMetrics,
  parseCssLengthToPx,
  type LayoutUnit,
  type PageGapTarget,
} from './editorPagination';

const TEXT_BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE']);
const AVOID_BREAK_AFTER_TAGS = new Set(['H1', 'H2', 'H3']);

/** Ölçüm sırasında sayfa aralıklarını gizleyip doğal (PDF öncesi) akışı gösteren sınıf */
const MEASURING_CLASS = 'editor-pagination-measuring';

export const editorPaginationPluginKey = new PluginKey('editorPagination');

const TABLE_PAGE_BREAK_CLASS = 'editor-table-page-break';

function createPageGapElement(height: number): HTMLElement {
  const element = document.createElement('div');
  element.className = 'editor-page-gap';
  element.style.height = `${height}px`;
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

/** Bloğun içinde, verilen satırın başına denk gelen belge konumu */
function findDocumentPosAtLine(
  view: EditorView,
  blockStartPos: number,
  blockEndPos: number,
  lineTop: number,
  lineBottom: number
): number {
  const editorDom = view.dom as HTMLElement;
  for (let pos = blockStartPos; pos <= blockEndPos; pos++) {
    let top: number;
    try {
      top = coordsTopInEditor(view, pos, editorDom);
    } catch {
      continue;
    }
    if (top >= lineTop - 1 && top < lineBottom - 1) return pos;
    if (top >= lineBottom) break;
  }
  return blockStartPos;
}

function readMargins(element: HTMLElement) {
  const style = getComputedStyle(element);
  return {
    marginTop: parseFloat(style.marginTop || '0') || 0,
    marginBottom: parseFloat(style.marginBottom || '0') || 0,
  };
}

function collectTextBlockUnits(
  view: EditorView,
  element: HTMLElement,
  editorDom: HTMLElement
): LayoutUnit[] {
  const contentStart = resolveDomPos(view, element);
  if (contentStart == null) return [];

  const margins = readMargins(element);
  const avoidBreakAfter = AVOID_BREAK_AFTER_TAGS.has(element.tagName);
  const lines = measureTextLines(element, editorDom);

  if (lines.length <= 1) {
    const layout = measureElementLayout(element, editorDom);
    return [
      {
        docPos: contentStart,
        height: layout.height,
        offsetTop: layout.offsetTop,
        isPageBreak: false,
        kind: 'block',
        gapInside: true,
        avoidBreakAfter,
        ...margins,
      },
    ];
  }

  let contentEnd = contentStart;
  try {
    const $pos = view.state.doc.resolve(contentStart);
    contentEnd = $pos.end();
  } catch {
    /* blok sonu bulunamazsa satır konumu blok başı olur */
  }

  return lines.map((line, index) => ({
    docPos:
      index === 0
        ? contentStart
        : findDocumentPosAtLine(
            view,
            contentStart,
            contentEnd,
            line.offsetTop,
            line.offsetTop + line.height
          ),
    height: line.height,
    offsetTop: line.offsetTop,
    isPageBreak: false,
    kind: 'line' as const,
    gapInside: true,
    startsBlock: index === 0,
    avoidBreakAfter: avoidBreakAfter && index === lines.length - 1,
    ...(index === 0 ? { marginTop: margins.marginTop } : {}),
    ...(index === lines.length - 1 ? { marginBottom: margins.marginBottom } : {}),
  }));
}

function collectLayoutUnits(view: EditorView): LayoutUnit[] {
  const editorDom = view.dom as HTMLElement;
  const units: LayoutUnit[] = [];

  const pushUnit = (
    element: HTMLElement,
    docPos: number,
    kind: LayoutUnit['kind'],
    options: { isPageBreak?: boolean; gapInside?: boolean } = {}
  ) => {
    const layout = measureElementLayout(element, editorDom);
    if (!options.isPageBreak && layout.height <= 0.5) return;
    units.push({
      docPos,
      height: layout.height,
      offsetTop: layout.offsetTop,
      isPageBreak: options.isPageBreak ?? false,
      kind,
      gapInside: options.gapInside ?? false,
      ...readMargins(element),
    });
  };

  const collectTableRows = (table: Element) => {
    table.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr').forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      const rowPos = resolveDomPos(view, row);
      if (rowPos == null) return;
      pushUnit(row, rowPos, 'table-row');
    });
  };

  for (const child of Array.from(editorDom.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.classList.contains('editor-page-gap')) continue;
    if (child.classList.contains('editor-widget-source-hidden')) continue;

    if (child.classList.contains('editor-widget-preview')) {
      const pos = resolveDomPos(view, child);
      if (pos == null) continue;
      pushUnit(child, pos, 'block');
      continue;
    }

    if (child.classList.contains('page-break') || child.dataset.pageBreak === 'true') {
      const pos = resolveDomPos(view, child);
      if (pos != null) pushUnit(child, pos, 'block', { isPageBreak: true });
      continue;
    }

    // TipTap tabloyu div.tableWrapper içinde çizer; PDF tabloyu satır satır böler
    const table =
      child.tagName === 'TABLE' ? child : child.classList.contains('tableWrapper') ? child.querySelector(':scope > table') : null;
    if (table) {
      collectTableRows(table);
      continue;
    }

    if (child.tagName === 'UL' || child.tagName === 'OL') {
      // li: PDF'te break-inside: avoid — madde bütün olarak taşınır
      child.querySelectorAll(':scope > li').forEach((item) => {
        if (!(item instanceof HTMLElement)) return;
        const itemPos = resolveDomPos(view, item);
        if (itemPos == null) return;
        pushUnit(item, itemPos, 'block', { gapInside: true });
      });
      continue;
    }

    if (TEXT_BLOCK_TAGS.has(child.tagName)) {
      units.push(...collectTextBlockUnits(view, child, editorDom));
      continue;
    }

    const pos = resolveDomPos(view, child);
    if (pos == null) continue;
    pushUnit(child, pos, 'block');
  }

  return units;
}

function createGapDecoration(view: EditorView, target: PageGapTarget, index: number): Decoration | null {
  const height = Math.round(target.height * 100) / 100;

  if (target.kind === 'table-row') {
    const range = findTableRowNodeRange(view.state.doc, target.docPos);
    if (!range) return null;
    return Decoration.node(
      range.from,
      range.to,
      { class: TABLE_PAGE_BREAK_CLASS, style: `--page-gap-fill: ${height}px` },
      { gapHeight: height }
    );
  }

  if (target.kind === 'page-break') {
    const node = view.state.doc.nodeAt(target.docPos);
    if (!node) return null;
    return Decoration.node(
      target.docPos,
      target.docPos + node.nodeSize,
      { style: `--page-break-fill: ${height}px` },
      { gapHeight: height }
    );
  }

  return Decoration.widget(target.docPos, () => createPageGapElement(height), {
    // Aynı konumdaki alan/widget önizlemelerinden önce yerleşsin
    side: -10,
    key: `editor-page-gap-${index}-${target.docPos}-${height}`,
    gapHeight: height,
  });
}

function measureNaturalLayout(view: EditorView, paper: HTMLElement): LayoutUnit[] {
  paper.classList.add(MEASURING_CLASS);
  try {
    return collectLayoutUnits(view);
  } finally {
    paper.classList.remove(MEASURING_CLASS);
  }
}

function buildDecorationSet(view: EditorView): DecorationSet {
  const paper = (view.dom as HTMLElement).closest('.template-editor-paper');
  if (!(paper instanceof HTMLElement)) return DecorationSet.empty;

  const metrics = readPageMetrics(paper);
  const units = measureNaturalLayout(view, paper);
  const result = paginateNaturalLayout(
    units,
    metrics.pageContentHeight,
    metrics.interPageSpacing,
    metrics.marginTop
  );
  const targets = dedupeGapTargets(result.targets);

  applyEditorPageLayout(view, paper, result.contentEnd, result.pageCount, metrics);

  const decorations = targets
    .map((target, index) => createGapDecoration(view, target, index))
    .filter((deco): deco is Decoration => deco != null);

  return DecorationSet.create(view.state.doc, decorations);
}

function applyEditorPageLayout(
  view: EditorView,
  paper: HTMLElement,
  contentEnd: number,
  minimumPages: number,
  metrics: ReturnType<typeof readPageMetrics>
) {
  // contentEnd editör köküne göre (üst kenar boşluğu dahil); akış hesabı içerik alanına göre
  const contentExtent = Math.max(0, contentEnd - metrics.marginTop);
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
    return (
      deco.from === other?.from &&
      deco.to === other?.to &&
      Math.abs((deco.spec.gapHeight ?? 0) - (other?.spec.gapHeight ?? 0)) < 0.5
    );
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

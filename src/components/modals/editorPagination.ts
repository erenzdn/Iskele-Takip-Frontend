/**
 * A4 sayfa akışı — yalnızca editör görünümü (belge içeriğine yazılmaz).
 */

export type PageMetrics = {
  pageHeight: number;
  pageContentHeight: number;
  pageGap: number;
  marginTop: number;
  marginBottom: number;
  interPageSpacing: number;
};

export type LayoutUnitKind = 'block' | 'table-row' | 'line';

export type LayoutUnit = {
  docPos: number;
  height: number;
  /** ProseMirror köküne göre ölçülen üst konum (px) — margin birleşmesi dahil */
  offsetTop: number;
  isPageBreak: boolean;
  kind: LayoutUnitKind;
};

export type PageGapTarget = {
  docPos: number;
  kind: 'block' | 'table-row';
};

export type LineRect = {
  offsetTop: number;
  height: number;
};

/**
 * DOM konumlarına dayalı sayfa kırılımı.
 * Yükseklik toplama yerine offsetTop kullanır; liste maddeleri arası margin
 * birikiminden kaynaklanan editör/PDF sapmasını azaltır.
 */
export function computeEditorPageLayout(
  contentExtentPx: number,
  pageContentHeight: number,
  interPageSpacingPx: number,
  minimumPages = 1
): { pageCount: number; minHeightPx: number } {
  if (pageContentHeight <= 0) {
    return { pageCount: 1, minHeightPx: 1 };
  }

  let byContent = 1;
  if (contentExtentPx > pageContentHeight + 0.5) {
    const overflow = contentExtentPx - pageContentHeight;
    const step = pageContentHeight + interPageSpacingPx;
    byContent = 1 + Math.ceil(overflow / step);
  }

  const pageCount = Math.max(minimumPages, byContent);
  const minHeightPx =
    pageCount * pageContentHeight + Math.max(0, pageCount - 1) * interPageSpacingPx;

  return { pageCount, minHeightPx };
}

export function getContentExtent(units: LayoutUnit[]): number {
  const contentUnits = units.filter((unit) => !unit.isPageBreak && unit.height > 0.5);
  if (contentUnits.length === 0) return 0;

  const last = contentUnits[contentUnits.length - 1];
  return last.offsetTop + last.height;
}

export function resolveMinimumPageCount(
  units: LayoutUnit[],
  autoGapCount: number
): number {
  const manualBreaks = units.filter((unit) => unit.isPageBreak).length;
  return Math.max(1, autoGapCount + manualBreaks + 1);
}

/**
 * Metin bloklarının satır kutularını gruplar (getClientRects).
 */
export function groupElementLineRects(
  element: HTMLElement,
  editorRoot: HTMLElement
): LineRect[] {
  const rootRect = editorRoot.getBoundingClientRect();
  const scrollTop = editorRoot.scrollTop;
  const lineMap = new Map<number, { top: number; bottom: number }>();

  for (const rect of Array.from(element.getClientRects())) {
    if (rect.width < 1 || rect.height < 1) continue;
    const top = rect.top - rootRect.top + scrollTop;
    const bottom = top + rect.height;
    const bucket = Math.round(top / 2) * 2;
    const existing = lineMap.get(bucket);
    if (!existing) {
      lineMap.set(bucket, { top, bottom });
      continue;
    }
    existing.top = Math.min(existing.top, top);
    existing.bottom = Math.max(existing.bottom, bottom);
  }

  return Array.from(lineMap.values())
    .sort((a, b) => a.top - b.top)
    .map((line) => ({
      offsetTop: line.top,
      height: line.bottom - line.top,
    }));
}

export function computeAutoPageGapTargets(
  units: LayoutUnit[],
  pageContentHeight: number,
  interPageSpacingPx: number,
  marginTopPx = 0
): PageGapTarget[] {
  if (pageContentHeight <= 0 || units.length === 0) return [];

  const targets: PageGapTarget[] = [];
  const seen = new Set<string>();

  const pushTarget = (docPos: number, kind: 'block' | 'table-row') => {
    const key = `${kind}:${docPos}`;
    if (seen.has(key)) return false;
    seen.add(key);
    targets.push({ docPos, kind });
    return true;
  };

  const getPageBand = (offsetTop: number, epochStartY: number) => {
    let pageStartY = epochStartY;
    let pageEndY = pageStartY + pageContentHeight;

    while (offsetTop >= pageEndY + 0.5) {
      const gapEndY = pageEndY + interPageSpacingPx;
      if (offsetTop < gapEndY - 0.5) {
        return { pageStartY, pageEndY, inGap: true, gapEndY };
      }
      pageStartY = gapEndY;
      pageEndY = pageStartY + pageContentHeight;
    }

    return { pageStartY, pageEndY, inGap: false, gapEndY: pageEndY };
  };

  let epochStartY = marginTopPx;
  let lastGapPageEndY = -1;

  for (const unit of units) {
    if (unit.isPageBreak) {
      epochStartY = unit.offsetTop + Math.max(unit.height, interPageSpacingPx);
      lastGapPageEndY = -1;
      continue;
    }

    if (unit.height <= 0.5) continue;

    const gapKind: 'block' | 'table-row' =
      unit.kind === 'table-row' ? 'table-row' : 'block';

    const band = getPageBand(unit.offsetTop, epochStartY);

    const relativeTop = unit.offsetTop - band.pageStartY;
    const overflows = relativeTop + unit.height > pageContentHeight + 0.5;
    const needsGap =
      band.inGap || (overflows && (unit.kind === 'line' || relativeTop > 0.5 || unit.height > pageContentHeight));

    if (!needsGap) continue;
    if (band.pageEndY === lastGapPageEndY) continue;

    if (pushTarget(unit.docPos, gapKind)) {
      lastGapPageEndY = band.pageEndY;
    }
  }

  return targets;
}

export function parseCssLengthToPx(value: string, context: HTMLElement): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.height = trimmed;
  context.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  context.removeChild(probe);
  return px;
}

export function readPageMetrics(paper: HTMLElement): PageMetrics {
  const styles = getComputedStyle(paper);
  const pageHeight = parseCssLengthToPx(styles.getPropertyValue('--page-height'), paper);
  const pageGap = parseCssLengthToPx(styles.getPropertyValue('--page-gap'), paper) || 16;
  const marginTop = parseCssLengthToPx(styles.getPropertyValue('--page-margin-top'), paper);
  const marginBottom = parseCssLengthToPx(styles.getPropertyValue('--page-margin-bottom'), paper);
  const pageContentHeight = Math.max(1, pageHeight - marginTop - marginBottom);
  const interPageSpacing = marginBottom + pageGap + marginTop;

  return {
    pageHeight,
    pageContentHeight,
    pageGap,
    marginTop,
    marginBottom,
    interPageSpacing,
  };
}

export function getTopLevelBlockPos(
  doc: { childCount: number; child: (i: number) => { nodeSize: number } },
  index: number
): number {
  let pos = 1;
  for (let i = 0; i < index; i++) {
    pos += doc.child(i).nodeSize;
  }
  return pos;
}

export function dedupeGapTargets(targets: PageGapTarget[]): PageGapTarget[] {
  const seen = new Set<string>();
  const result: PageGapTarget[] = [];

  for (const target of targets.sort((a, b) => a.docPos - b.docPos)) {
    const key = `${target.kind}:${target.docPos}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(target);
  }

  return result;
}

export function findTableRowNodeRange(
  doc: {
    resolve: (pos: number) => {
      depth: number;
      before: (d: number) => number;
      node: (d: number) => { type: { name: string }; nodeSize: number };
    };
  },
  rowPos: number
): { from: number; to: number } | null {
  const $pos = doc.resolve(rowPos);

  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'tableRow') {
      const from = $pos.before(depth);
      return { from, to: from + node.nodeSize };
    }
  }

  return null;
}

export function gapTargetsEqual(a: PageGapTarget[], b: PageGapTarget[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (target, index) =>
      target.docPos === b[index]?.docPos && target.kind === b[index]?.kind
  );
}

/** ProseMirror köküne göre eleman konumunu ölçer */
export function measureElementLayout(
  element: HTMLElement,
  editorRoot: HTMLElement
): { offsetTop: number; height: number } {
  const rootRect = editorRoot.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    offsetTop: rect.top - rootRect.top + editorRoot.scrollTop,
    height: Math.max(element.offsetHeight, rect.height),
  };
}

/**
 * A4 sayfa akışı — yalnızca editör görünümü (belge içeriğine yazılmaz).
 */

export type PageMetrics = {
  pageContentHeight: number;
  pageGap: number;
};

export type LayoutUnitKind = 'block' | 'table-row';

export type LayoutUnit = {
  docPos: number;
  height: number;
  isPageBreak: boolean;
  kind: LayoutUnitKind;
};

export type PageGapTarget = {
  docPos: number;
  kind: LayoutUnitKind;
};

export function computeAutoPageGapTargets(
  units: LayoutUnit[],
  pageContentHeight: number,
  pageGap = 0
): PageGapTarget[] {
  if (pageContentHeight <= 0 || units.length === 0) return [];

  const targets: PageGapTarget[] = [];
  const seen = new Set<string>();
  let usedOnPage = 0;

  for (const unit of units) {
    if (unit.isPageBreak) {
      usedOnPage = 0;
      continue;
    }

    if (unit.height <= 0.5) continue;

    const exceedsPage = usedOnPage + unit.height > pageContentHeight + 0.5;

    if (exceedsPage && usedOnPage > 0) {
      const key = `${unit.kind}:${unit.docPos}`;
      if (!seen.has(key)) {
        seen.add(key);
        targets.push({ docPos: unit.docPos, kind: unit.kind });
      }
      usedOnPage = unit.height + (unit.kind === 'table-row' ? pageGap : 0);
    } else {
      usedOnPage += unit.height;
    }

    while (usedOnPage > pageContentHeight + 0.5) {
      usedOnPage -= pageContentHeight;
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
  const pageGap = parseCssLengthToPx(styles.getPropertyValue('--page-gap'), paper) || 36;
  const marginTop = parseCssLengthToPx(styles.getPropertyValue('--page-margin-top'), paper);
  const marginBottom = parseCssLengthToPx(styles.getPropertyValue('--page-margin-bottom'), paper);
  const pageContentHeight = Math.max(1, pageHeight - marginTop - marginBottom);

  return { pageContentHeight, pageGap };
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

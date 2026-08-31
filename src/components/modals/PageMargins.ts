export interface PageMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const DEFAULT_PAGE_MARGINS: PageMargins = {
  top: 15,
  bottom: 15,
  left: 15,
  right: 15,
};

function normalizeMargin(margin: unknown, fallback: number): number {
  const number = typeof margin === 'number' ? margin : Number(margin);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(0, number));
}

export function normalizePageMargins(value: unknown): PageMargins {
  if (!value || typeof value !== 'object') return DEFAULT_PAGE_MARGINS;

  const raw = value as {
    top?: unknown;
    bottom?: unknown;
    left?: unknown;
    right?: unknown;
  };

  return {
    top: normalizeMargin(raw.top, DEFAULT_PAGE_MARGINS.top),
    bottom: normalizeMargin(raw.bottom, DEFAULT_PAGE_MARGINS.bottom),
    left: normalizeMargin(raw.left, DEFAULT_PAGE_MARGINS.left),
    right: normalizeMargin(raw.right, DEFAULT_PAGE_MARGINS.right),
  };
}

export function withPageMargins(content: any, pageMargins: PageMargins) {
  return {
    ...content,
    pageMargins: normalizePageMargins(pageMargins),
  };
}

export function getPageMargins(content: unknown): PageMargins {
  if (!content || typeof content !== 'object') return DEFAULT_PAGE_MARGINS;
  return normalizePageMargins((content as { pageMargins?: unknown }).pageMargins);
}

export function getPageMarginsPaperStyle(pageMargins: PageMargins): Record<string, string> {
  const margins = normalizePageMargins(pageMargins);

  return {
    paddingTop: `${margins.top}mm`,
    paddingBottom: `${margins.bottom}mm`,
    paddingLeft: `${margins.left}mm`,
    paddingRight: `${margins.right}mm`,
    '--page-margin-top': `${margins.top}mm`,
    '--page-margin-bottom': `${margins.bottom}mm`,
    '--page-margin-left': `${margins.left}mm`,
    '--page-margin-right': `${margins.right}mm`,
  };
}

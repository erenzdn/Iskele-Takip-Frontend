export interface PageMargins {
  left: number;
  right: number;
}

export const DEFAULT_PAGE_MARGINS: PageMargins = {
  left: 15,
  right: 15,
};

export function normalizePageMargins(value: unknown): PageMargins {
  if (!value || typeof value !== 'object') return DEFAULT_PAGE_MARGINS;

  const raw = value as { left?: unknown; right?: unknown };
  const normalize = (margin: unknown) => {
    const number = typeof margin === 'number' ? margin : Number(margin);
    if (!Number.isFinite(number)) return 15;
    return Math.min(100, Math.max(0, number));
  };

  return {
    left: normalize(raw.left),
    right: normalize(raw.right),
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

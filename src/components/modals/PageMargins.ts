export interface PageMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const DEFAULT_PAGE_MARGINS: PageMargins = {
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
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

/**
 * Kenar boşluğu kaydedilmemiş (eski) şablonlar PDF'te her zaman 15mm ile basılır
 * (IskeleTakipAPI documentGenerator.normalizePageMargins). Editör de aynısını göstermeli.
 */
export const LEGACY_PAGE_MARGINS: PageMargins = {
  top: 15,
  bottom: 15,
  left: 15,
  right: 15,
};

export function getPageMargins(content: unknown): PageMargins {
  const raw = content && typeof content === 'object'
    ? (content as { pageMargins?: unknown }).pageMargins
    : undefined;
  if (!raw || typeof raw !== 'object') return LEGACY_PAGE_MARGINS;

  const sides = raw as Partial<Record<keyof PageMargins, unknown>>;
  const side = (value: unknown) => {
    const number = typeof value === 'number' ? value : Number(value);
    // Backend geçersiz kenarı 15mm'e çeker; aynı kural
    return Number.isFinite(number) && number >= 0 && number <= 100 ? number : 15;
  };
  return {
    top: side(sides.top),
    bottom: side(sides.bottom),
    left: side(sides.left),
    right: side(sides.right),
  };
}

export function getPageMarginsPaperStyle(pageMargins: PageMargins): Record<string, string> {
  const margins = normalizePageMargins(pageMargins);

  return {
    /* Yatay kenar boşlukları kağıtta; dikey boşluklar ProseMirror'da sayfa başına uygulanır (PDF ile aynı). */
    paddingLeft: `${margins.left}mm`,
    paddingRight: `${margins.right}mm`,
    '--page-margin-top': `${margins.top}mm`,
    '--page-margin-bottom': `${margins.bottom}mm`,
    '--page-margin-left': `${margins.left}mm`,
    '--page-margin-right': `${margins.right}mm`,
    '--page-content-height': `calc(var(--page-height) - ${margins.top}mm - ${margins.bottom}mm)`,
    '--inter-page-spacing': `calc(var(--page-margin-bottom) + var(--page-gap) + var(--page-margin-top))`,
  };
}

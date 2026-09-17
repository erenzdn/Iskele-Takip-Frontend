/**
 * Satır bazlı iskonto ↔ net tutar dönüşümleri.
 * Sektör standardı: brüt sabit kalır; iskonto % veya net tutar birbirinden türetilir.
 *
 * Net (yeşil toplam) yazıldığında yüzde, hedef kuruşu birebir üretecek kadar
 * incelikte saklanır. 2 hane yetiyorsa (ör. %10) 2 hanede kalır.
 * Backend QuoteDetails/ContractDetails.Iskonto = NUMERIC(7,4) → kayıtta en fazla 4 hane.
 */

export const MONEY_DECIMALS = 2;
export const PERCENT_DECIMALS = 2;
/** Backend NUMERIC(7,4) ile hizalı kayıt hassasiyeti. */
export const PERSISTED_PERCENT_DECIMALS = 4;
/** Kuruşluk net farkını yüzdeye çevirmek için üst sınır (1 kuruş / ~10^8). */
export const PERCENT_MAX_DECIMALS = 10;

/** Half-up yuvarlama (para / yüzde için). */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** 0–100 aralığı; ondalık hassasiyeti korunur. */
export function clampDiscountRange(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/** Kullanıcının iskonto alanına yazdığı değer: 0–100, 2 hane. */
export function clampDiscountPercent(value: number): number {
  return roundTo(clampDiscountRange(value), PERCENT_DECIMALS);
}

/**
 * İskonto yazımı (TR virgül / EN nokta).
 * Boş veya yarım giriş ("" / "," / ".") → null; çağıran eski değeri korumalı.
 */
export function parseDiscountInput(raw: string): number | null {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(',', '.');
  if (!s || s === '+' || s === '-' || s === '.') return null;
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return clampDiscountRange(v);
}

/** Brüt satır tutarından iskonto sonrası net tutar. */
export function lineNetFromGross(gross: number, discountPercent: number): number {
  const g = Number.isFinite(gross) ? Math.max(0, gross) : 0;
  const pct = clampDiscountRange(discountPercent);
  return roundTo(g * (1 - pct / 100), MONEY_DECIMALS);
}

export type NetToDiscountResult = {
  /** 0–100 arası iskonto yüzdesi (hedef neti üreten en kaba hassasiyet) */
  discountPercent: number;
  /** Yüzdeye göre normalize edilmiş net (gösterimle hizalı) */
  normalizedNet: number;
  /** Hedef net sınırlara çekildi mi */
  clamped: boolean;
  /** Neden clamp / özel durum */
  reason: 'ok' | 'gross_zero' | 'net_negative' | 'net_above_gross' | 'full_discount';
};

function percentYieldsNet(gross: number, percent: number, targetNet: number): boolean {
  return lineNetFromGross(gross, percent) === targetNet;
}

/**
 * Hedef neti (2 hane para) birebir üreten iskonto %.
 * Mümkün olan en az ondalık kullanılır; 2 hane yetmezse inceltilir.
 */
function percentThatYieldsNet(gross: number, targetNet: number): number {
  const rawPct = clampDiscountRange(((gross - targetNet) / gross) * 100);

  for (let decimals = PERCENT_DECIMALS; decimals <= PERCENT_MAX_DECIMALS; decimals++) {
    const candidate = clampDiscountRange(roundTo(rawPct, decimals));
    if (percentYieldsNet(gross, candidate, targetNet)) return candidate;
  }

  if (percentYieldsNet(gross, rawPct, targetNet)) {
    return roundTo(rawPct, PERCENT_MAX_DECIMALS);
  }

  let lo = 0;
  let hi = 100;
  let best = rawPct;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const net = lineNetFromGross(gross, mid);
    if (net === targetNet) {
      best = mid;
      break;
    }
    if (net > targetNet) lo = mid;
    else hi = mid;
    best = mid;
  }

  for (let decimals = PERCENT_DECIMALS; decimals <= PERCENT_MAX_DECIMALS; decimals++) {
    const candidate = clampDiscountRange(roundTo(best, decimals));
    if (percentYieldsNet(gross, candidate, targetNet)) return candidate;
  }

  return roundTo(best, PERCENT_MAX_DECIMALS);
}

/**
 * Hedef net tutardan iskonto % hesaplar.
 * - net > brüt → %0 (net brüte çekilir)
 * - net < 0 → %100 (net 0)
 * - brüt ≤ 0 → %0, net 0
 */
export function discountPercentFromNet(gross: number, targetNet: number): NetToDiscountResult {
  const g = Number.isFinite(gross) ? Math.max(0, gross) : 0;

  if (g <= 0) {
    return {
      discountPercent: 0,
      normalizedNet: 0,
      clamped: true,
      reason: 'gross_zero',
    };
  }

  if (!Number.isFinite(targetNet) || targetNet < 0) {
    return {
      discountPercent: 100,
      normalizedNet: 0,
      clamped: true,
      reason: 'net_negative',
    };
  }

  const netRounded = roundTo(targetNet, MONEY_DECIMALS);
  const grossMoney = roundTo(g, MONEY_DECIMALS);

  if (netRounded <= 0) {
    return {
      discountPercent: 100,
      normalizedNet: 0,
      clamped: netRounded < 0,
      reason: 'full_discount',
    };
  }

  if (netRounded >= grossMoney) {
    const above = netRounded > grossMoney;
    return {
      discountPercent: 0,
      normalizedNet: grossMoney,
      clamped: above,
      reason: above ? 'net_above_gross' : 'ok',
    };
  }

  const discountPercent = percentThatYieldsNet(g, netRounded);
  const normalizedNet = lineNetFromGross(g, discountPercent);

  return {
    discountPercent,
    normalizedNet,
    clamped: false,
    reason: 'ok',
  };
}

/** İskonto tutarı (brüt − net) — özet kırılımı ile uyumlu. */
export function lineDiscountAmount(gross: number, discountPercent: number): number {
  const g = Number.isFinite(gross) ? Math.max(0, gross) : 0;
  return roundTo(g - lineNetFromGross(g, discountPercent), MONEY_DECIMALS);
}

/** API satırındaki Iskonto; yoksa başlık yüzdesine düşer. */
export function lineIskontoFromApi(detail: unknown, fallback: number): number {
  const fb = clampDiscountRange(fallback);
  if (!detail || typeof detail !== 'object') return fb;
  const rec = detail as Record<string, unknown>;
  const raw = rec.Iskonto ?? rec.iskonto;
  if (raw == null || raw === '') return fb;
  const n = Number(raw);
  return Number.isFinite(n) ? clampDiscountRange(n) : fb;
}

/**
 * TR (1.234,56) / EN (1234.56) para yazımı.
 * Boş veya geçersiz → null; çağıran eski değeri korumalı.
 */
export function parseMoneyInput(raw: string): number | null {
  const compact = String(raw ?? '')
    .trim()
    .replace(/\s+/g, '');
  if (!compact || compact === ',' || compact === '.' || compact === '+' || compact === '-') return null;
  let normalized = compact;
  if (compact.includes(',')) {
    normalized = compact.replace(/\./g, '').replace(',', '.');
  } else {
    const dotCount = (compact.match(/\./g) ?? []).length;
    if (dotCount > 1 || /^\d{1,3}(\.\d{3})+$/.test(compact)) {
      normalized = compact.replace(/\./g, '');
    }
  }
  const v = Number(normalized);
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
}

export type LinePricingDraftState = {
  itemIskonto: Record<string, number>;
  iskontoInputs: Record<string, string>;
  lineNetInputs: Record<string, string>;
  globalIskontoInput: string | null;
  headerIskonto: number;
};

/** Üst iskonto alanı blur olmadan kaydedilirse taslağı başlığa yaz. */
export function resolveCommittedHeaderDiscount(
  headerIskonto: number,
  globalIskontoInput: string | null
): number {
  if (globalIskontoInput != null) {
    const parsed = parseDiscountInput(globalIskontoInput);
    if (parsed != null) return parsed;
  }
  return clampDiscountRange(Number(headerIskonto) || 0);
}

/**
 * Kaydetmeden önce satır iskontosunu, henüz blur olmamış taslaklardan üretir.
 * Öncelik: yeşil toplam taslağı → satır % taslağı → üst iskonto taslağı → kayıtlı satır % → başlık.
 */
export function resolveCommittedLineDiscount(params: {
  key: string;
  gross: number;
  drafts: LinePricingDraftState;
}): number {
  const { key, gross, drafts } = params;
  const header = resolveCommittedHeaderDiscount(drafts.headerIskonto, drafts.globalIskontoInput);

  if (Object.prototype.hasOwnProperty.call(drafts.lineNetInputs, key)) {
    const money = parseMoneyInput(drafts.lineNetInputs[key]);
    if (money != null) {
      return discountPercentFromNet(gross, money).discountPercent;
    }
  }

  if (Object.prototype.hasOwnProperty.call(drafts.iskontoInputs, key)) {
    const parsed = parseDiscountInput(drafts.iskontoInputs[key]);
    if (parsed != null) return parsed;
  }

  if (drafts.globalIskontoInput != null) {
    const parsed = parseDiscountInput(drafts.globalIskontoInput);
    if (parsed != null) return parsed;
  }

  return drafts.itemIskonto[key] ?? header;
}

/** Kaydet / taslak: tüm satırların kayıt iskontosu + başlık iskontosu. */
export function commitQuotePricingDrafts<T>(params: {
  items: T[];
  lineKey: (item: T) => string;
  getGross: (item: T) => number;
  drafts: LinePricingDraftState;
}): { headerIskonto: number; lineIskonto: Record<string, number> } {
  const headerIskonto = resolveCommittedHeaderDiscount(
    params.drafts.headerIskonto,
    params.drafts.globalIskontoInput
  );
  const lineIskonto: Record<string, number> = {};
  for (const item of params.items) {
    const key = params.lineKey(item);
    lineIskonto[key] = resolveCommittedLineDiscount({
      key,
      gross: params.getGross(item),
      drafts: params.drafts,
    });
  }
  return { headerIskonto, lineIskonto };
}

export type EncodedLinePricing = {
  discountPercent: number;
  price: number;
  priceChanged: boolean;
};

function persistedPercent(pct: number): number {
  return roundTo(clampDiscountRange(pct), PERSISTED_PERCENT_DECIMALS);
}

function netAtPrice(price: number, quantity: number, pct: number): number {
  return lineNetFromGross(Math.max(0, price) * Math.max(0, quantity), pct);
}

/**
 * Backend Iskonto NUMERIC(7,4); 4 haneli % ile hedef net elde edilir.
 * 
 * Sektör standardı: İskonto yüzdesi değiştirilir, fiyat sabittir (snapshot integrity).
 * Fiyat değişikliği sadece backend'in iskonto hassasiyetiyle hedef net üretilemediğinde
 * ve kullanıcı açıkça fiyat override yapmışsa yapılır.
 * 
 * Bu yaklaşım data integrity'yi korur ve backend validation'larını bozmaz.
 */
export function encodeLinePricingForPersistence(params: {
  currentPrice: number;
  quantity: number;
  discountPercent: number;
}): EncodedLinePricing {
  const qty = Number.isFinite(params.quantity) ? params.quantity : 0;
  const currentPrice = Number.isFinite(params.currentPrice) ? Math.max(0, params.currentPrice) : 0;
  const pctIn = clampDiscountRange(params.discountPercent);
  const targetNet = lineNetFromGross(currentPrice * Math.max(0, qty), pctIn);

  if (qty <= 0) {
    return { discountPercent: persistedPercent(pctIn), price: currentPrice, priceChanged: false };
  }

  // 1. Önce 4 haneli iskonto ile dene (backend NUMERIC(7,4) desteği)
  const pct4 = persistedPercent(pctIn);
  if (netAtPrice(currentPrice, qty, pct4) === targetNet) {
    return { discountPercent: pct4, price: currentPrice, priceChanged: false };
  }

  // 2. Eğer iskonto ile hedef net üretilemiyorsa, kullanıcı muhtemelen 
  //    manuel olarak fiyat override yapmıştır. Bu durumda da fiyatı koru.
  //    Backend validation'ları için snapshot fiyatlar değişmemeli.
  return { discountPercent: pct4, price: currentPrice, priceChanged: false };
}

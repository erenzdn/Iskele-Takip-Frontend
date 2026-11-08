/**
 * Teklif toplamından (İskontolu / Genel Toplam) tüm satırlara uygulanacak
 * tek bir ana iskonto yüzdesi türetir.
 *
 * Toplam hesabı ekrandaki özetle birebir aynıdır (satır bazlı kuruş yuvarlaması dahil);
 * bu yüzden bulunan yüzde uygulandığında ekranda yazılan hedef görünür.
 * Yüzde en fazla PERSISTED_PERCENT_DECIMALS haneye sahiptir: kayıt / yeniden açılışta tutar kaymaz.
 */

import {
  MONEY_DECIMALS,
  PERCENT_DECIMALS,
  PERSISTED_PERCENT_DECIMALS,
  lineDiscountAmount,
  roundTo,
} from './lineDiscount';

export type PriceBreakdown = {
  subtotal: number;
  discountAmount: number;
  discountedTotal: number;
  vatAmount: number;
  grandTotal: number;
};

export type PriceBreakdownLine = {
  gross: number;
  discountPercent: number;
};

function sanitizeVatRate(vatRate: number): number {
  return Number.isFinite(vatRate) && vatRate > 0 ? vatRate : 0;
}

/** Teklif özet kırılımı (Ara Toplam / İskonto / İskontolu / KDV / Genel Toplam). */
export function computePriceBreakdown(lines: PriceBreakdownLine[], vatRate: number): PriceBreakdown {
  const subtotal = lines.reduce((sum, line) => sum + line.gross, 0);
  const discountAmount = lines.reduce(
    (sum, line) => sum + lineDiscountAmount(line.gross, line.discountPercent),
    0
  );
  const discountedTotal = subtotal - discountAmount;
  const vatAmount = discountedTotal * (sanitizeVatRate(vatRate) / 100);
  const grandTotal = discountedTotal + vatAmount;
  return { subtotal, discountAmount, discountedTotal, vatAmount, grandTotal };
}

export type TargetTotalKind = 'net' | 'grand';

export type UniformDiscountReason =
  | 'ok'
  /** Yüzde hassasiyeti (4 hane) ve kuruş yuvarlaması hedefi birebir üretemedi; en yakın tutar seçildi. */
  | 'rounding'
  | 'no_lines'
  | 'gross_zero'
  | 'invalid_target'
  /** Hedef iskontosuz tutardan büyük → %0 */
  | 'target_above_gross'
  /** Hedef 0 → %100 */
  | 'full_discount';

export type UniformDiscountResult = {
  discountPercent: number;
  /** Uygulanınca oluşacak (2 hane) hedef türündeki toplam */
  achievedTotal: number;
  exact: boolean;
  reason: UniformDiscountReason;
};

function ceilTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.ceil(value * f - 1e-7) / f;
}

function floorTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.floor(value * f + 1e-7) / f;
}

/**
 * Tüm satırlara aynı iskonto uygulanınca hedef toplamı veren yüzdeyi bulur.
 * Toplam, iskonto arttıkça azalan (monoton) olduğundan ikili arama yapılır;
 * ardından hedefi birebir veren en az ondalıklı yüzde seçilir (2 → 4 hane).
 */
export function solveUniformDiscountForTarget(params: {
  grossList: number[];
  vatRate: number;
  target: number;
  kind: TargetTotalKind;
}): UniformDiscountResult {
  const grossList = params.grossList.map((g) => (Number.isFinite(g) ? Math.max(0, g) : 0));
  const totalAt = (pct: number): number => {
    const b = computePriceBreakdown(
      grossList.map((gross) => ({ gross, discountPercent: pct })),
      params.vatRate
    );
    return roundTo(params.kind === 'net' ? b.discountedTotal : b.grandTotal, MONEY_DECIMALS);
  };

  if (grossList.length === 0) {
    return { discountPercent: 0, achievedTotal: 0, exact: false, reason: 'no_lines' };
  }

  const totalAtZero = totalAt(0);
  if (totalAtZero <= 0) {
    return { discountPercent: 0, achievedTotal: 0, exact: false, reason: 'gross_zero' };
  }

  if (!Number.isFinite(params.target) || params.target < 0) {
    return { discountPercent: 0, achievedTotal: totalAtZero, exact: false, reason: 'invalid_target' };
  }

  const target = roundTo(params.target, MONEY_DECIMALS);

  if (target >= totalAtZero) {
    const above = target > totalAtZero;
    return {
      discountPercent: 0,
      achievedTotal: totalAtZero,
      exact: !above,
      reason: above ? 'target_above_gross' : 'ok',
    };
  }

  if (target <= 0) {
    return { discountPercent: 100, achievedTotal: 0, exact: true, reason: 'full_discount' };
  }

  // totalAt(lo) > target, totalAt(hi) <= target
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 100 && hi - lo > 1e-12; i++) {
    const mid = (lo + hi) / 2;
    if (totalAt(mid) > target) lo = mid;
    else hi = mid;
  }

  for (let decimals = PERCENT_DECIMALS; decimals <= PERSISTED_PERCENT_DECIMALS; decimals++) {
    const candidate = Math.min(100, ceilTo(hi, decimals));
    if (totalAt(candidate) === target) {
      return { discountPercent: candidate, achievedTotal: target, exact: true, reason: 'ok' };
    }
  }

  const candidates = [
    Math.min(100, ceilTo(hi, PERSISTED_PERCENT_DECIMALS)),
    Math.max(0, floorTo(lo, PERSISTED_PERCENT_DECIMALS)),
  ];
  let best = candidates[0];
  let bestDiff = Math.abs(totalAt(best) - target);
  for (const c of candidates.slice(1)) {
    const diff = Math.abs(totalAt(c) - target);
    if (diff < bestDiff) {
      best = c;
      bestDiff = diff;
    }
  }
  return { discountPercent: best, achievedTotal: totalAt(best), exact: false, reason: 'rounding' };
}

/**
 * Teklif / sözleşme toplamından (İskontolu / Genel Toplam) tüm satırlara uygulanacak
 * tek bir ana iskonto yüzdesi türetir.
 *
 * Toplam hesabı ekrandaki özetle birebir aynıdır (satır bazlı kuruş yuvarlaması dahil).
 * Yüzde, yazılan kuruşu birebir üretecek en kaba hassasiyette seçilir (2 → 10 hane).
 * Tutar en yakın kuruşa çekilmez; girdiğiniz tutar hedef olarak kalır.
 */

import {
  MONEY_DECIMALS,
  PERCENT_DECIMALS,
  PERCENT_MAX_DECIMALS,
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

/**
 * Kiralama tam dönem özeti: her satırın kuruşa yuvarlanmış 1 aylık (ekrandaki) iskontolu
 * tutarı gün oranıyla ölçeklenir. Böylece 1 ay 100.000,00 ise 2 ay 200.000,00 olur;
 * 4 haneli iskonto yüzdesinin brüt × gün üzerinde ürettiği kuruş artığı (200.000,01) oluşmaz.
 */
export function computeRentalPeriodBreakdown(
  monthlyLines: PriceBreakdownLine[],
  days: number,
  monthDays: number,
  vatRate: number
): PriceBreakdown {
  const factor = monthDays > 0 && Number.isFinite(days) ? Math.max(0, days) / monthDays : 0;
  let subtotal = 0;
  let discountedTotal = 0;
  for (const line of monthlyLines) {
    const monthlyGross = roundTo(Math.max(0, line.gross), MONEY_DECIMALS);
    const monthlyNet = roundTo(monthlyGross - lineDiscountAmount(line.gross, line.discountPercent), MONEY_DECIMALS);
    subtotal += roundTo(monthlyGross * factor, MONEY_DECIMALS);
    discountedTotal += roundTo(monthlyNet * factor, MONEY_DECIMALS);
  }
  subtotal = roundTo(subtotal, MONEY_DECIMALS);
  discountedTotal = roundTo(discountedTotal, MONEY_DECIMALS);
  const discountAmount = roundTo(subtotal - discountedTotal, MONEY_DECIMALS);
  const vatAmount = roundTo(discountedTotal * (sanitizeVatRate(vatRate) / 100), MONEY_DECIMALS);
  const grandTotal = roundTo(discountedTotal + vatAmount, MONEY_DECIMALS);
  return { subtotal, discountAmount, discountedTotal, vatAmount, grandTotal };
}

export type TargetTotalKind = 'net' | 'grand';

export type UniformDiscountReason =
  | 'ok'
  /** Satır kuruş yuvarlaması hedefi hiçbir yüzdeyle birebir üretemedi; en yakın tutar seçildi. */
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
 * ardından hedefi birebir veren en az ondalıklı yüzde seçilir (2 → 10 hane).
 * Yazılan kuruş korunur; tutar yuvarlanarak değiştirilmez.
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

  const grossSum = grossList.reduce((sum, gross) => sum + gross, 0);
  const vatFactor = 1 + sanitizeVatRate(params.vatRate) / 100;
  const netTarget = params.kind === 'net' ? target : target / vatFactor;
  const rawPercent = grossSum > 0 ? ((grossSum - netTarget) / grossSum) * 100 : 0;

  const hitAt = (pct: number, decimals: number): number | null => {
    if (!Number.isFinite(pct)) return null;
    const stored = Math.min(100, Math.max(0, roundTo(pct, decimals)));
    return totalAt(stored) === target ? stored : null;
  };

  for (let decimals = PERCENT_DECIMALS; decimals <= PERCENT_MAX_DECIMALS; decimals++) {
    const step = 10 ** -decimals;
    const base = floorTo(hi, decimals);
    const anchors = [
      ceilTo(hi, decimals),
      roundTo(rawPercent, decimals),
      ceilTo(rawPercent, decimals),
      floorTo(rawPercent, decimals),
      base,
      base + step,
      base + 2 * step,
      base + 3 * step,
      base + 4 * step,
    ];
    for (const anchor of anchors) {
      const stored = hitAt(anchor, decimals);
      if (stored != null) {
        return { discountPercent: stored, achievedTotal: target, exact: true, reason: 'ok' };
      }
    }
  }

  const candidates = [
    Math.min(100, ceilTo(hi, PERCENT_MAX_DECIMALS)),
    Math.max(0, floorTo(lo, PERCENT_MAX_DECIMALS)),
    Math.min(100, Math.max(0, roundTo(rawPercent, PERCENT_MAX_DECIMALS))),
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

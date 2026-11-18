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
  discountPercentFromNet,
  lineNetFromGross,
  roundMoney,
  PERCENT_DECIMALS,
  PERCENT_MAX_DECIMALS,
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
  /**
   * Kiralama tam dönem özetinde satır gün sayısıyla ölçeklenir mi? Varsayılan true.
   * Manuel kalemler (nakliye vb.) tek seferliktir: false (backend calculateCommercialTotals ile aynı).
   */
  scalesWithDays?: boolean;
};

function sanitizeVatRate(vatRate: number): number {
  return Number.isFinite(vatRate) && vatRate > 0 ? vatRate : 0;
}

/**
 * Ortak özet kuralı (backend lineIskonto.summarizeTotals ile birebir):
 * İskontolu = satır netleri toplamı (kuruş), KDV = İskontolu × oran (kuruş), Genel = İskontolu + KDV.
 */
function summarizeTotals(grossSum: number, netSum: number, vatRate: number): PriceBreakdown {
  const subtotal = roundMoney(grossSum);
  const discountedTotal = roundMoney(netSum);
  const discountAmount = roundMoney(subtotal - discountedTotal);
  const vatAmount = roundMoney(discountedTotal * (sanitizeVatRate(vatRate) / 100));
  const grandTotal = roundMoney(discountedTotal + vatAmount);
  return { subtotal, discountAmount, discountedTotal, vatAmount, grandTotal };
}

/** Teklif özet kırılımı (Ara Toplam / İskonto / İskontolu / KDV / Genel Toplam). İskontolu = yeşil satır tutarları toplamı. */
export function computePriceBreakdown(lines: PriceBreakdownLine[], vatRate: number): PriceBreakdown {
  let grossSum = 0;
  let netSum = 0;
  for (const line of lines) {
    const gross = Number.isFinite(line.gross) ? Math.max(0, line.gross) : 0;
    grossSum += gross;
    netSum += lineNetFromGross(gross, line.discountPercent);
  }
  return summarizeTotals(grossSum, netSum, vatRate);
}

/**
 * Kiralama tam dönem özeti: her satırın kuruşa yuvarlanmış 1 aylık (ekrandaki) iskontolu
 * tutarı gün oranıyla ölçeklenir (backend lineNetFactor ile aynı). Böylece 1 ay 100.000,00 ise
 * 2 ay 200.000,00 olur. Manuel kalemler ölçeklenmez (tek seferlik).
 */
export function computeRentalPeriodBreakdown(
  monthlyLines: PriceBreakdownLine[],
  days: number,
  monthDays: number,
  vatRate: number
): PriceBreakdown {
  const factor = monthDays > 0 && Number.isFinite(days) ? Math.max(0, days) / monthDays : 0;
  let grossSum = 0;
  let netSum = 0;
  for (const line of monthlyLines) {
    const gross = Number.isFinite(line.gross) ? Math.max(0, line.gross) : 0;
    const lineFactor = line.scalesWithDays === false ? 1 : factor;
    grossSum += gross * lineFactor;
    netSum += lineNetFromGross(gross, line.discountPercent) * lineFactor;
  }
  return summarizeTotals(grossSum, netSum, vatRate);
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
  /** Ana (başlık) iskonto yüzdesi */
  discountPercent: number;
  /**
   * grossList ile aynı sırada satır yüzdeleri. Genelde hepsi discountPercent'tir; ortak yüzde
   * hedefi tutturamazsa (ör. aynı tutarlı satırlar toplamı 2 kuruş atlatır) kalan kuruş farkı
   * tek bir satırın yüzdesi inceltilerek kapatılır.
   */
  lineDiscounts: number[];
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

/** Tek ortak yüzde araması (ikili arama + en az ondalık). */
function solveUniformCore(params: {
  grossList: number[];
  vatRate: number;
  target: number;
  kind: TargetTotalKind;
}): Omit<UniformDiscountResult, 'lineDiscounts'> {
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

/** Satır bazlı yüzdelerle (ekrandaki özetle aynı hesap) hedef türündeki 2 haneli toplam. */
function totalWithLineDiscounts(
  grossList: number[],
  discounts: number[],
  vatRate: number,
  kind: TargetTotalKind
): number {
  const b = computePriceBreakdown(
    grossList.map((gross, i) => ({ gross, discountPercent: discounts[i] })),
    vatRate
  );
  return roundTo(kind === 'net' ? b.discountedTotal : b.grandTotal, MONEY_DECIMALS);
}

/**
 * Tek ortak yüzde hedefi tutturamadığında kalan kuruş farkını bir satırın yüzdesiyle kapatır.
 * Satır neti kuruş kuruş ayarlanabildiği için iskontolu tutar her zaman birebir tutar; genel toplamda
 * yalnızca KDV'nin hiç üretemediği kuruşlar (net kuruş × (1+KDV)) tutturulamaz.
 */
function closeResidualOnOneLine(
  grossList: number[],
  vatRate: number,
  target: number,
  kind: TargetTotalKind,
  basePercent: number
): number[] | null {
  const vatFactor = 1 + sanitizeVatRate(vatRate) / 100;
  const netCandidates =
    kind === 'net'
      ? [target]
      : [0, -0.01, 0.01, -0.02, 0.02]
          .map((d) => roundTo(target / vatFactor + d, MONEY_DECIMALS))
          .filter((n) => roundTo(n * vatFactor, MONEY_DECIMALS) === target);
  if (netCandidates.length === 0) return null;

  const base = grossList.map(() => basePercent);
  const baseNet = totalWithLineDiscounts(grossList, base, vatRate, 'net');
  const order = grossList
    .map((gross, index) => ({ gross, index }))
    .filter((x) => x.gross > 0)
    .sort((a, b) => b.gross - a.gross);

  for (const netTarget of netCandidates) {
    const residual = roundTo(netTarget - baseNet, MONEY_DECIMALS);
    for (const { gross, index } of order) {
      const lineNet = lineNetFromGross(gross, basePercent);
      const wanted = roundTo(lineNet + residual, MONEY_DECIMALS);
      if (wanted < 0 || wanted > roundTo(gross, MONEY_DECIMALS)) continue;
      const pct = discountPercentFromNet(gross, wanted).discountPercent;
      if (lineNetFromGross(gross, pct) !== wanted) continue;
      const discounts = base.slice();
      discounts[index] = pct;
      if (totalWithLineDiscounts(grossList, discounts, vatRate, kind) === target) return discounts;
    }
  }
  return null;
}

/**
 * Tüm satırlara aynı iskonto uygulanınca hedef toplamı veren yüzdeyi bulur.
 * Toplam, iskonto arttıkça azalan (monoton) olduğundan ikili arama yapılır;
 * ardından hedefi birebir veren en az ondalıklı yüzde seçilir (2 → 10 hane).
 * Ortak yüzde yetmezse kalan kuruş tek satırda kapatılır (lineDiscounts).
 * Yazılan kuruş korunur; tutar yuvarlanarak değiştirilmez.
 */
export function solveUniformDiscountForTarget(params: {
  grossList: number[];
  vatRate: number;
  target: number;
  kind: TargetTotalKind;
}): UniformDiscountResult {
  const core = solveUniformCore(params);
  const uniform = params.grossList.map(() => core.discountPercent);
  if (core.reason !== 'rounding') return { ...core, lineDiscounts: uniform };

  const grossList = params.grossList.map((g) => (Number.isFinite(g) ? Math.max(0, g) : 0));
  const target = roundTo(params.target, MONEY_DECIMALS);
  const fixed = closeResidualOnOneLine(grossList, params.vatRate, target, params.kind, core.discountPercent);
  if (fixed) {
    return { discountPercent: core.discountPercent, lineDiscounts: fixed, achievedTotal: target, exact: true, reason: 'ok' };
  }
  // KDV'nin hiç üretemediği kuruş: en yakın oluşabilen tutara (önce ±1 kuruş) birebir otur.
  for (const delta of [-0.01, 0.01, -0.02, 0.02]) {
    const near = roundTo(target + delta, MONEY_DECIMALS);
    if (near <= 0) continue;
    const nearCore = solveUniformCore({ ...params, target: near });
    if (nearCore.reason === 'ok') {
      return { ...nearCore, lineDiscounts: grossList.map(() => nearCore.discountPercent), exact: false, reason: 'rounding' };
    }
    if (nearCore.reason !== 'rounding') continue;
    const nearFixed = closeResidualOnOneLine(grossList, params.vatRate, near, params.kind, nearCore.discountPercent);
    if (nearFixed) {
      return { discountPercent: nearCore.discountPercent, lineDiscounts: nearFixed, achievedTotal: near, exact: false, reason: 'rounding' };
    }
  }
  return { ...core, lineDiscounts: uniform };
}

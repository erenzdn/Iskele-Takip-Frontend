/**
 * Satır bazlı iskonto ↔ net tutar dönüşümleri.
 * Sektör standardı: brüt sabit kalır; iskonto % veya net tutar birbirinden türetilir.
 */

export const MONEY_DECIMALS = 2;
export const PERCENT_DECIMALS = 2;

/** Half-up yuvarlama (para / yüzde için). */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function clampDiscountPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, roundTo(value, PERCENT_DECIMALS)));
}

/** Brüt satır tutarından iskonto sonrası net tutar. */
export function lineNetFromGross(gross: number, discountPercent: number): number {
  const g = Number.isFinite(gross) ? Math.max(0, gross) : 0;
  const pct = clampDiscountPercent(discountPercent);
  return roundTo(g * (1 - pct / 100), MONEY_DECIMALS);
}

export type NetToDiscountResult = {
  /** 0–100 arası iskonto yüzdesi */
  discountPercent: number;
  /** Yüzdeye göre normalize edilmiş net (gösterimle hizalı) */
  normalizedNet: number;
  /** Hedef net sınırlara çekildi mi */
  clamped: boolean;
  /** Neden clamp / özel durum */
  reason: 'ok' | 'gross_zero' | 'net_negative' | 'net_above_gross' | 'full_discount';
};

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

  if (netRounded <= 0) {
    return {
      discountPercent: 100,
      normalizedNet: 0,
      clamped: netRounded < 0,
      reason: 'full_discount',
    };
  }

  if (netRounded >= g) {
    const above = netRounded > roundTo(g, MONEY_DECIMALS);
    return {
      discountPercent: 0,
      normalizedNet: roundTo(g, MONEY_DECIMALS),
      clamped: above,
      reason: above ? 'net_above_gross' : 'ok',
    };
  }

  const rawPct = ((g - netRounded) / g) * 100;
  const discountPercent = clampDiscountPercent(rawPct);
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

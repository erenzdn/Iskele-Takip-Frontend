import { describe, expect, it } from 'vitest';
import { computePriceBreakdown, computeRentalPeriodBreakdown } from './quoteTargetTotal';
import { discountPercentFromNet } from './lineDiscount';

describe('computeRentalPeriodBreakdown', () => {
  it('1 ay 100.000,00 ise 60 gün tam 200.000,00 olur (kuruş artığı yok)', () => {
    const monthlyGross = 123456.78;
    const pct = discountPercentFromNet(monthlyGross, 100000).discountPercent;
    const lines = [{ gross: monthlyGross, discountPercent: pct }];
    expect(computePriceBreakdown(lines, 20).discountedTotal).toBeCloseTo(100000, 2);
    const full = computeRentalPeriodBreakdown(lines, 60, 30, 20);
    expect(full.discountedTotal).toBe(200000);
    expect(full.vatAmount).toBe(40000);
    expect(full.grandTotal).toBe(240000);
  });

  it('kısmi ay gün oranıyla ölçeklenir', () => {
    const full = computeRentalPeriodBreakdown([{ gross: 3000, discountPercent: 10 }], 45, 30, 0);
    expect(full.subtotal).toBe(4500);
    expect(full.discountedTotal).toBe(4050);
    expect(full.discountAmount).toBe(450);
  });
});

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

describe('kiralama tam dönem: manuel kalem tek seferlik', () => {
  it('60 günde envanter 2 katına çıkar, manuel nakliye 1 kez sayılır (backend ile aynı)', () => {
    const b = computeRentalPeriodBreakdown(
      [
        { gross: 10000, discountPercent: 10 },
        { gross: 5000, discountPercent: 10, scalesWithDays: false },
      ],
      60,
      30,
      20
    );
    expect(b.subtotal).toBe(25000);
    expect(b.discountedTotal).toBe(22500);
    expect(b.vatAmount).toBe(4500);
    expect(b.grandTotal).toBe(27000);
  });

  it('kısmi ay: satır neti = kuruşa yuvarlanmış aylık net × gün/30, toplam bir kez yuvarlanır', () => {
    const b = computeRentalPeriodBreakdown(
      [
        { gross: 1000.01, discountPercent: 0 },
        { gross: 1000.01, discountPercent: 0 },
      ],
      45,
      30,
      20
    );
    // 1000,01 × 1,5 = 1500,015 (satır başına yuvarlansaydı 1500,02 + 1500,02 = 3000,04)
    expect(b.discountedTotal).toBe(3000.03);
  });
});

import { describe, expect, it } from 'vitest';
import {
  clampDiscountPercent,
  discountPercentFromNet,
  lineDiscountAmount,
  lineNetFromGross,
  roundTo,
} from './lineDiscount';

describe('lineDiscount.roundTo', () => {
  it('half-up yuvarlar', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(1.004, 2)).toBe(1);
    expect(roundTo(10.555, 2)).toBe(10.56);
  });

  it('NaN / Infinity için 0 döner', () => {
    expect(roundTo(Number.NaN, 2)).toBe(0);
    expect(roundTo(Number.POSITIVE_INFINITY, 2)).toBe(0);
  });
});

describe('lineDiscount.clampDiscountPercent', () => {
  it('0–100 aralığına sıkıştırır ve 2 haneye yuvarlar', () => {
    expect(clampDiscountPercent(-5)).toBe(0);
    expect(clampDiscountPercent(100.1)).toBe(100);
    expect(clampDiscountPercent(12.345)).toBe(12.35);
    expect(clampDiscountPercent(Number.NaN)).toBe(0);
  });
});

describe('lineDiscount.lineNetFromGross', () => {
  it('iskonto 0 iken brüte eşit net verir', () => {
    expect(lineNetFromGross(1000, 0)).toBe(1000);
  });

  it('yüzde iskontoyu nete yansıtır', () => {
    expect(lineNetFromGross(1000, 10)).toBe(900);
    expect(lineNetFromGross(1000, 100)).toBe(0);
    expect(lineNetFromGross(333.33, 15)).toBe(283.33);
  });

  it('negatif / geçersiz brütü 0 kabul eder', () => {
    expect(lineNetFromGross(-50, 10)).toBe(0);
    expect(lineNetFromGross(Number.NaN, 10)).toBe(0);
  });

  it('yüzdeyi clamp eder', () => {
    expect(lineNetFromGross(100, -10)).toBe(100);
    expect(lineNetFromGross(100, 150)).toBe(0);
  });
});

describe('lineDiscount.discountPercentFromNet', () => {
  it('klasik ters hesap: net → %', () => {
    const r = discountPercentFromNet(1000, 900);
    expect(r.discountPercent).toBe(10);
    expect(r.normalizedNet).toBe(900);
    expect(r.reason).toBe('ok');
    expect(r.clamped).toBe(false);
  });

  it('tam iskonto (net 0) → %100', () => {
    const r = discountPercentFromNet(500, 0);
    expect(r.discountPercent).toBe(100);
    expect(r.normalizedNet).toBe(0);
    expect(r.reason).toBe('full_discount');
  });

  it('net brüte eşit → %0', () => {
    const r = discountPercentFromNet(250, 250);
    expect(r.discountPercent).toBe(0);
    expect(r.normalizedNet).toBe(250);
    expect(r.reason).toBe('ok');
  });

  it('net brütten büyükse %0 ve brüte çeker', () => {
    const r = discountPercentFromNet(100, 150);
    expect(r.discountPercent).toBe(0);
    expect(r.normalizedNet).toBe(100);
    expect(r.clamped).toBe(true);
    expect(r.reason).toBe('net_above_gross');
  });

  it('negatif net → %100 / net 0', () => {
    const r = discountPercentFromNet(100, -1);
    expect(r.discountPercent).toBe(100);
    expect(r.normalizedNet).toBe(0);
    expect(r.clamped).toBe(true);
    expect(r.reason).toBe('net_negative');
  });

  it('brüt 0 iken güvenli varsayılan', () => {
    const r = discountPercentFromNet(0, 50);
    expect(r.discountPercent).toBe(0);
    expect(r.normalizedNet).toBe(0);
    expect(r.reason).toBe('gross_zero');
  });

  it('yuvarlama sonrası % → net tutarlılığı (ileri-geri)', () => {
    const gross = 1234.56;
    const target = 1000;
    const r = discountPercentFromNet(gross, target);
    const back = lineNetFromGross(gross, r.discountPercent);
    expect(back).toBe(r.normalizedNet);
    // Hedefe 1 kuruş tolerans (yüzde 2 hane kısıtı)
    expect(Math.abs(back - target)).toBeLessThanOrEqual(0.01);
  });

  it('küçük tutarlarda float kayması üretmez', () => {
    const r = discountPercentFromNet(0.1, 0.09);
    expect(r.discountPercent).toBe(10);
    expect(lineNetFromGross(0.1, r.discountPercent)).toBe(0.09);
  });

  it('çok haneli hedef neti para yuvarlamasıyla işler', () => {
    const r = discountPercentFromNet(100, 89.999);
    // 90.00 → %10
    expect(r.discountPercent).toBe(10);
    expect(r.normalizedNet).toBe(90);
  });
});

describe('lineDiscount.lineDiscountAmount', () => {
  it('brüt − net farkını verir', () => {
    expect(lineDiscountAmount(1000, 10)).toBe(100);
    expect(lineDiscountAmount(1000, 0)).toBe(0);
    expect(lineDiscountAmount(1000, 100)).toBe(1000);
  });
});

describe('lineDiscount çift yönlü tutarlılık', () => {
  const cases: Array<{ gross: number; pct: number }> = [
    { gross: 100, pct: 0 },
    { gross: 100, pct: 5 },
    { gross: 100, pct: 12.5 },
    { gross: 100, pct: 33.33 },
    { gross: 100, pct: 100 },
    { gross: 999.99, pct: 7.5 },
    { gross: 1, pct: 1 },
  ];

  it.each(cases)('pct → net → pct (gross=$gross pct=$pct)', ({ gross, pct }) => {
    const net = lineNetFromGross(gross, pct);
    const back = discountPercentFromNet(gross, net);
    expect(back.discountPercent).toBe(clampDiscountPercent(pct));
    expect(back.normalizedNet).toBe(net);
  });
});

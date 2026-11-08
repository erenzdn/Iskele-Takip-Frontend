import { describe, expect, it } from 'vitest';
import type { QuoteLineItem } from '../models';
import {
  commitQuotePricingDrafts,
  lineDiscountAmount,
  lineNetFromGross,
  roundTo,
  type LinePricingDraftState,
} from './lineDiscount';
import {
  computePriceBreakdown,
  solveUniformDiscountForTarget,
  type TargetTotalKind,
} from './quoteTargetTotal';

/** Değişiklik öncesi QuoteDetailModal.buildPriceBreakdown formülü (regresyon referansı). */
function legacyBreakdown(lines: { gross: number; pct: number }[], vatRate: number) {
  const subtotal = lines.reduce((s, l) => s + l.gross, 0);
  const discountAmount = lines.reduce((s, l) => s + lineDiscountAmount(l.gross, l.pct), 0);
  const discountedTotal = subtotal - discountAmount;
  const vatAmount = discountedTotal * (vatRate / 100);
  return { subtotal, discountAmount, discountedTotal, vatAmount, grandTotal: discountedTotal + vatAmount };
}

function totalAt(grossList: number[], vatRate: number, pct: number, kind: TargetTotalKind): number {
  const b = computePriceBreakdown(
    grossList.map((gross) => ({ gross, discountPercent: pct })),
    vatRate
  );
  return roundTo(kind === 'net' ? b.discountedTotal : b.grandTotal, 2);
}

function decimalsOf(n: number): number {
  const s = String(n);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

/** Deterministik sözde rastgele (LCG) — testler her çalıştırmada aynı. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const rentalGross = (monthly: number, qty: number) => (monthly / 30) * qty * 30;

describe('computePriceBreakdown: mevcut özet hesabı bozulmadı', () => {
  it('eski formülle birebir aynı sonuç (karışık satır iskontoları, KDV)', () => {
    const rand = rng(42);
    for (let t = 0; t < 300; t++) {
      const lines = Array.from({ length: 1 + Math.floor(rand() * 8) }, () => ({
        gross: roundTo(rand() * 50000, 4),
        pct: roundTo(rand() * 100, 4),
      }));
      const vat = [0, 1, 8, 10, 18, 20][Math.floor(rand() * 6)];
      const next = computePriceBreakdown(
        lines.map((l) => ({ gross: l.gross, discountPercent: l.pct })),
        vat
      );
      expect(next).toEqual(legacyBreakdown(lines, vat));
    }
  });

  it('boş liste → tüm toplamlar 0', () => {
    expect(computePriceBreakdown([], 20)).toEqual({
      subtotal: 0,
      discountAmount: 0,
      discountedTotal: 0,
      vatAmount: 0,
      grandTotal: 0,
    });
  });

  it('geçersiz KDV (NaN / negatif) → KDV 0 kabul edilir', () => {
    const lines = [{ gross: 1000, discountPercent: 10 }];
    expect(computePriceBreakdown(lines, Number.NaN).grandTotal).toBe(900);
    expect(computePriceBreakdown(lines, -5).grandTotal).toBe(900);
  });
});

describe('İskontolu (KDV hariç) tutar girişi', () => {
  it('SALE: 1000 + 500 brüt, hedef 1200 → %20 tüm satırlara', () => {
    const r = solveUniformDiscountForTarget({ grossList: [1000, 500], vatRate: 20, target: 1200, kind: 'net' });
    expect(r).toEqual({ discountPercent: 20, achievedTotal: 1200, exact: true, reason: 'ok' });
  });

  it('en az ondalıklı yüzde seçilir (%12,5 → 12.5, 4 hane değil)', () => {
    const r = solveUniformDiscountForTarget({ grossList: [800], vatRate: 20, target: 700, kind: 'net' });
    expect(r.discountPercent).toBe(12.5);
    expect(r.exact).toBe(true);
  });

  it('küsuratlı hedef: yazılan kuruş birebir kalır, yüzde yuvarlanarak tutar değişmez', () => {
    const grossList = [1234.56, 789.1, 45.67];
    const r = solveUniformDiscountForTarget({ grossList, vatRate: 20, target: 1777.77, kind: 'net' });
    expect(decimalsOf(r.discountPercent)).toBeLessThanOrEqual(10);
    expect(r.exact).toBe(true);
    expect(r.achievedTotal).toBe(1777.77);
    expect(r.reason).toBe('ok');
  });

  it('hedef = iskontosuz tutar → %0, uyarı yok', () => {
    const r = solveUniformDiscountForTarget({ grossList: [1000, 500], vatRate: 20, target: 1500, kind: 'net' });
    expect(r).toEqual({ discountPercent: 0, achievedTotal: 1500, exact: true, reason: 'ok' });
  });

  it('hedef brütü aşıyor → %0 ve target_above_gross (fiyat artırılmaz)', () => {
    const r = solveUniformDiscountForTarget({ grossList: [1000], vatRate: 20, target: 1500, kind: 'net' });
    expect(r.discountPercent).toBe(0);
    expect(r.achievedTotal).toBe(1000);
    expect(r.reason).toBe('target_above_gross');
  });

  it('hedef 0 → %100 (full_discount)', () => {
    const r = solveUniformDiscountForTarget({ grossList: [1000, 20], vatRate: 20, target: 0, kind: 'net' });
    expect(r).toEqual({ discountPercent: 100, achievedTotal: 0, exact: true, reason: 'full_discount' });
  });

  it('1 kuruş hedef → %100 değil, kuruşu karşılayan yüzde', () => {
    const r = solveUniformDiscountForTarget({ grossList: [1000], vatRate: 20, target: 0.01, kind: 'net' });
    expect(r.discountPercent).toBeLessThan(100);
    expect(r.achievedTotal).toBe(0.01);
  });

  it('negatif / NaN / Infinity hedef → invalid_target, iskonto değişmez', () => {
    for (const target of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = solveUniformDiscountForTarget({ grossList: [1000], vatRate: 20, target, kind: 'net' });
      expect(r.reason).toBe('invalid_target');
      expect(r.discountPercent).toBe(0);
    }
  });

  it('satır yok → no_lines', () => {
    const r = solveUniformDiscountForTarget({ grossList: [], vatRate: 20, target: 100, kind: 'net' });
    expect(r.reason).toBe('no_lines');
  });

  it('tüm satırlar 0 TL (fiyat/miktar 0) → gross_zero', () => {
    const r = solveUniformDiscountForTarget({ grossList: [0, 0], vatRate: 20, target: 100, kind: 'net' });
    expect(r.reason).toBe('gross_zero');
  });

  it('bozuk satır brütü (NaN / negatif) 0 sayılır, diğer satırlar hesaplanır', () => {
    const r = solveUniformDiscountForTarget({
      grossList: [Number.NaN, -50, 1000],
      vatRate: 20,
      target: 900,
      kind: 'net',
    });
    expect(r).toEqual({ discountPercent: 10, achievedTotal: 900, exact: true, reason: 'ok' });
  });

  it('fiyatı 0 olan satır karışık listede sorun çıkarmaz', () => {
    const r = solveUniformDiscountForTarget({ grossList: [0, 2000, 0], vatRate: 20, target: 1500, kind: 'net' });
    expect(r.discountPercent).toBe(25);
    expect(r.exact).toBe(true);
  });
});

describe('Genel Toplam (KDV dahil) girişi', () => {
  it('KDV %20: 1500 brüt, genel toplam 1440 → %20', () => {
    const r = solveUniformDiscountForTarget({ grossList: [1000, 500], vatRate: 20, target: 1440, kind: 'grand' });
    expect(r).toEqual({ discountPercent: 20, achievedTotal: 1440, exact: true, reason: 'ok' });
  });

  it('KDV %0: genel toplam = iskontolu tutar', () => {
    const net = solveUniformDiscountForTarget({ grossList: [1000], vatRate: 0, target: 750, kind: 'net' });
    const grand = solveUniformDiscountForTarget({ grossList: [1000], vatRate: 0, target: 750, kind: 'grand' });
    expect(grand.discountPercent).toBe(net.discountPercent);
  });

  it('yuvarlak genel toplam (100.000 TL) KDV ile küsurat üretse bile yazılan tutar kalır', () => {
    const grossList = [45000, 37250.5, 12345.67, 9999.99];
    const r = solveUniformDiscountForTarget({ grossList, vatRate: 20, target: 100000, kind: 'grand' });
    expect(decimalsOf(r.discountPercent)).toBeLessThanOrEqual(10);
    expect(r.achievedTotal).toBe(100000);
    expect(r.exact).toBe(true);
  });

  it('genel toplam KDV dahil brütü aşarsa → %0', () => {
    const r = solveUniformDiscountForTarget({ grossList: [1000], vatRate: 20, target: 1300, kind: 'grand' });
    expect(r.reason).toBe('target_above_gross');
    expect(r.achievedTotal).toBe(1200);
  });

  it('KDV dahil brüt ile aynı genel toplam → %0 ok (ana iskonto sıfırlama yolu)', () => {
    const r = solveUniformDiscountForTarget({ grossList: [1000], vatRate: 20, target: 1200, kind: 'grand' });
    expect(r).toEqual({ discountPercent: 0, achievedTotal: 1200, exact: true, reason: 'ok' });
  });
});

describe('Kiralama (aylık 30 gün) küsuratlı fiyatlar', () => {
  it('aylık fiyat / 30 * miktar * 30 kayan nokta brütleri ile hedef tutar', () => {
    const grossList = [rentalGross(137.37, 7), rentalGross(55.55, 13), rentalGross(1000 / 3, 4)];
    const r = solveUniformDiscountForTarget({ grossList, vatRate: 20, target: 2500, kind: 'net' });
    expect(r.achievedTotal).toBe(2500);
    expect(r.exact).toBe(true);
  });
});

describe('büyük tutarlar ve sınırlar', () => {
  it('1 milyonluk teklifte yazılan tutar kuruşu kuruşuna kalır', () => {
    const grossList = [612_345.67, 487_654.33];
    const r = solveUniformDiscountForTarget({ grossList, vatRate: 20, target: 950_000, kind: 'net' });
    expect(r.achievedTotal).toBe(950_000);
    expect(r.exact).toBe(true);
  });

  it('çok büyük teklif: ince yüzde ile yazılan tutar korunur, en yakın kuruşa çekilmez', () => {
    const grossList = [12_345_678.9, 8_765_432.1];
    const r = solveUniformDiscountForTarget({ grossList, vatRate: 20, target: 18_000_000, kind: 'net' });
    expect(decimalsOf(r.discountPercent)).toBeLessThanOrEqual(10);
    expect(r.achievedTotal).toBe(18_000_000);
    expect(r.exact).toBe(true);
    expect(r.reason).toBe('ok');
  });

  it('tek satır, kuruşluk brüt (0,03 TL)', () => {
    const r = solveUniformDiscountForTarget({ grossList: [0.03], vatRate: 20, target: 0.02, kind: 'net' });
    expect(r.achievedTotal).toBe(0.02);
    expect(r.discountPercent).toBeGreaterThan(0);
    expect(r.discountPercent).toBeLessThan(100);
  });

  it('hedef 3+ ondalıklı girilirse kuruşa yuvarlanır', () => {
    const r = solveUniformDiscountForTarget({ grossList: [1000], vatRate: 20, target: 899.996, kind: 'net' });
    expect(r.achievedTotal).toBe(900);
    expect(r.discountPercent).toBe(10);
  });
});

describe('rastgele teklifler (fuzz): her durumda tutarlı sonuç', () => {
  it('yüzde 0–100, ≤10 hane; yazılan tutar birebir; hedef küçüldükçe iskonto artar', () => {
    const rand = rng(2026);
    for (let t = 0; t < 400; t++) {
      const grossList = Array.from({ length: 1 + Math.floor(rand() * 10) }, () =>
        rand() < 0.1 ? 0 : roundTo(rand() * 20000 * (1 + Math.floor(rand() * 50)), 2)
      );
      const vat = [0, 1, 10, 20][Math.floor(rand() * 4)];
      const kind: TargetTotalKind = rand() < 0.5 ? 'net' : 'grand';
      const max = totalAt(grossList, vat, 0, kind);
      if (max <= 0) continue;
      const target = roundTo(max * (0.05 + rand() * 0.9), 2);

      const r = solveUniformDiscountForTarget({ grossList, vatRate: vat, target, kind });
      const diff = Math.abs(roundTo(r.achievedTotal - target, 2));
      if (kind === 'net') {
        expect(r.exact, JSON.stringify({ grossList, target, achieved: r.achievedTotal, pct: r.discountPercent })).toBe(true);
        expect(r.achievedTotal).toBe(target);
      } else {
        expect(diff).toBeLessThanOrEqual(0.01);
        if (r.exact) expect(r.achievedTotal).toBe(target);
      }
      expect(r.discountPercent).toBeGreaterThanOrEqual(0);
      expect(r.discountPercent).toBeLessThanOrEqual(100);
      expect(decimalsOf(r.discountPercent)).toBeLessThanOrEqual(10);
      expect(r.achievedTotal).toBe(totalAt(grossList, vat, r.discountPercent, kind));

      const lower = solveUniformDiscountForTarget({
        grossList,
        vatRate: vat,
        target: roundTo(target * 0.9, 2),
        kind,
      });
      expect(lower.discountPercent).toBeGreaterThanOrEqual(r.discountPercent);
    }
  });

  it('elde edilen tutar tekrar girilirse aynı tutar korunur (idempotent)', () => {
    const rand = rng(7);
    for (let t = 0; t < 200; t++) {
      const grossList = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => roundTo(1 + rand() * 9999, 2));
      const kind: TargetTotalKind = rand() < 0.5 ? 'net' : 'grand';
      const first = solveUniformDiscountForTarget({
        grossList,
        vatRate: 20,
        target: roundTo(totalAt(grossList, 20, 0, kind) * rand(), 2),
        kind,
      });
      const again = solveUniformDiscountForTarget({
        grossList,
        vatRate: 20,
        target: first.achievedTotal,
        kind,
      });
      expect(again.achievedTotal).toBe(first.achievedTotal);
      expect(again.exact).toBe(true);
    }
  });
});

describe('kaydet / yeniden aç akışı', () => {
  function inventoryLine(id: number, qty: number, price: number): Extract<QuoteLineItem, { kind: 'inventory' }> {
    return {
      kind: 'inventory',
      ItemId: id,
      Quantity: qty,
      UnitPriceSnapshot: price,
      PriceUnit: 'EACH',
      PriceSource: 'INVENTORY',
      ItemName: `Ürün ${id}`,
    };
  }
  const manual: Extract<QuoteLineItem, { kind: 'manual' }> = {
    kind: 'manual',
    ClientId: 'm1',
    is_manual: true,
    Description: 'Nakliye',
    Quantity: 1,
    UnitPriceSnapshot: 1750.5,
    PriceUnit: 'EACH',
    PriceSource: 'MANUAL',
  };
  const lineKey = (i: QuoteLineItem) => (i.kind === 'inventory' ? String(i.ItemId) : `man-${i.ClientId}`);
  const gross = (i: QuoteLineItem) => i.UnitPriceSnapshot * i.Quantity;

  function drafts(overrides: Partial<LinePricingDraftState> = {}): LinePricingDraftState {
    return { itemIskonto: {}, iskontoInputs: {}, lineNetInputs: {}, globalIskontoInput: null, headerIskonto: 0, ...overrides };
  }

  it('satır bazlı özel iskontolar ve yarım taslaklar hedef tutarla ezilir; tüm satırlar aynı %', () => {
    const items: QuoteLineItem[] = [inventoryLine(1, 3, 1234.56), inventoryLine(2, 10, 77.7), manual];
    const r = solveUniformDiscountForTarget({
      grossList: items.map(gross),
      vatRate: 20,
      target: 5000,
      kind: 'net',
    });

    // Modal: bekleyen hedef varken taslaklar boşaltılıp başlık % kullanılır.
    const committed = commitQuotePricingDrafts({
      items,
      lineKey,
      getGross: gross,
      drafts: drafts({ headerIskonto: r.discountPercent }),
    });
    expect(committed.headerIskonto).toBe(r.discountPercent);
    for (const item of items) expect(committed.lineIskonto[lineKey(item)]).toBe(r.discountPercent);

    // Eski satır özel % / taslak varsa ve hedef uygulanmadıysa korunur (mevcut akış).
    const untouched = commitQuotePricingDrafts({
      items,
      lineKey,
      getGross: gross,
      drafts: drafts({ itemIskonto: { '1': 5, '2': 50 }, lineNetInputs: { 'man-m1': '1.000,00' } }),
    });
    expect(untouched.lineIskonto['1']).toBe(5);
    expect(untouched.lineIskonto['2']).toBe(50);
  });

  it('API payload: her satırda aynı Iskonto; yeniden açılınca toplam değişmez', () => {
    const rand = rng(99);
    for (let t = 0; t < 150; t++) {
      const items: QuoteLineItem[] = Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, i) =>
        inventoryLine(i + 1, 1 + Math.floor(rand() * 40), roundTo(rand() * 3000, 2))
      );
      const kind: TargetTotalKind = rand() < 0.5 ? 'net' : 'grand';
      const grossList = items.map(gross);
      const max = totalAt(grossList, 20, 0, kind);
      if (max <= 0) continue;
      const typed = roundTo(max * (0.1 + rand() * 0.85), 2);
      const r = solveUniformDiscountForTarget({
        grossList,
        vatRate: 20,
        target: typed,
        kind,
      });

      if (kind === 'net') {
        expect(r.exact).toBe(true);
        expect(r.achievedTotal).toBe(typed);
      } else {
        expect(Math.abs(roundTo(r.achievedTotal - typed, 2))).toBeLessThanOrEqual(0.01);
      }

      const reopened = computePriceBreakdown(
        items.map((item) => ({
          gross: gross(item),
          discountPercent: r.discountPercent,
        })),
        20
      );
      expect(roundTo(kind === 'net' ? reopened.discountedTotal : reopened.grandTotal, 2)).toBe(r.achievedTotal);
    }
  });

  it('hedef uygulandıktan sonra miktar değişirse ana iskonto % sabit kalır, toplam yeniden hesaplanır', () => {
    const r = solveUniformDiscountForTarget({ grossList: [1000], vatRate: 20, target: 800, kind: 'net' });
    expect(r.discountPercent).toBe(20);
    expect(lineNetFromGross(2000, r.discountPercent)).toBe(1600);
  });
});

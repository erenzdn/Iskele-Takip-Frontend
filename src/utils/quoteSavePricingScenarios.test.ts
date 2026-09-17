import { describe, expect, it } from 'vitest';
import type { QuoteLineItem } from '../models';
import {
  commitQuotePricingDrafts,
  lineIskontoFromApi,
  lineNetFromGross,
  parseMoneyInput,
  roundTo,
  encodeLinePricingForPersistence,
  type LinePricingDraftState,
} from './lineDiscount';
import { buildQuoteDetailRequest } from './linePriceMetadata';

const MONTHLY_DAYS = 30;

function rentalGross(monthly: number, qty: number, days = MONTHLY_DAYS): number {
  return (monthly / 30) * qty * days;
}

function saleGross(unitPrice: number, qty: number): number {
  return unitPrice * qty;
}

function lineKey(item: QuoteLineItem): string {
  return item.kind === 'inventory' ? String(item.ItemId) : `man-${item.ClientId}`;
}

function effectiveDaily(item: QuoteLineItem, quoteType: 'SALE' | 'RENTAL'): number {
  if (item.kind === 'manual') return item.UnitPriceSnapshot;
  if (quoteType === 'SALE') {
    return item.OverrideUnitPrice != null ? item.OverrideUnitPrice : item.UnitPriceSnapshot;
  }
  return item.OverrideMonthlyPrice != null
    ? item.OverrideMonthlyPrice / 30
    : item.UnitPriceSnapshot;
}

function getGross(item: QuoteLineItem, quoteType: 'SALE' | 'RENTAL', days = MONTHLY_DAYS): number {
  const daily = effectiveDaily(item, quoteType);
  if (item.kind === 'manual' || quoteType === 'SALE') return daily * item.Quantity;
  return daily * item.Quantity * days;
}

function inventoryLine(
  overrides: Partial<Extract<QuoteLineItem, { kind: 'inventory' }>> = {}
): Extract<QuoteLineItem, { kind: 'inventory' }> {
  return {
    kind: 'inventory',
    QuoteDetailId: 1,
    ItemId: 12,
    Quantity: 10,
    UnitPriceSnapshot: 5,
    PriceUnit: 'DAY',
    PriceSource: 'INVENTORY',
    ItemName: 'Kuşak',
    ...overrides,
  };
}

function manualLine(
  overrides: Partial<Extract<QuoteLineItem, { kind: 'manual' }>> = {}
): Extract<QuoteLineItem, { kind: 'manual' }> {
  return {
    kind: 'manual',
    ClientId: 'manual-1',
    QuoteDetailId: 2,
    is_manual: true,
    Description: 'Nakliye',
    Quantity: 1,
    UnitPriceSnapshot: 1000,
    PriceUnit: 'EACH',
    PriceSource: 'MANUAL',
    ...overrides,
  };
}

function drafts(overrides: Partial<LinePricingDraftState> = {}): LinePricingDraftState {
  return {
    itemIskonto: {},
    iskontoInputs: {},
    lineNetInputs: {},
    globalIskontoInput: null,
    headerIskonto: 0,
    ...overrides,
  };
}

function saveQuote(params: {
  items: QuoteLineItem[];
  quoteType: 'SALE' | 'RENTAL';
  drafts: LinePricingDraftState;
  days?: number;
}) {
  const committed = commitQuotePricingDrafts({
    items: params.items,
    lineKey,
    getGross: (item) => getGross(item, params.quoteType, params.days ?? MONTHLY_DAYS),
    drafts: params.drafts,
  });
  const details = params.items.map((item) =>
    buildQuoteDetailRequest(item, params.quoteType, committed.lineIskonto[lineKey(item)] ?? 0)
  );
  return { headerIskonto: committed.headerIskonto, details, lineIskonto: committed.lineIskonto };
}

function storedPct(raw: number | undefined, fallback: number): number {
  const n = raw == null ? fallback : Number(raw);
  return roundTo(Number.isFinite(n) ? n : fallback, 4);
}

/** API iskontoyu NUMERIC(7,4) ile saklar; yeniden açılışta kayıtlı fiyat + yuvarlanmış % kullanılır. */
function reopenFromSaved(
  detail: {
    Iskonto?: number;
    OverrideUnitPrice?: number | null;
    OverrideMonthlyPrice?: number | null;
    DailyPrice?: number;
  },
  item: QuoteLineItem,
  quoteType: 'SALE' | 'RENTAL',
  headerIskonto = 0
): number {
  const pct = lineIskontoFromApi(
    { Iskonto: storedPct(detail.Iskonto, headerIskonto) },
    storedPct(headerIskonto, 0)
  );
  if (item.kind === 'manual') {
    const price = detail.DailyPrice ?? item.UnitPriceSnapshot;
    return lineNetFromGross(price * item.Quantity, pct);
  }
  if (quoteType === 'SALE') {
    const price = detail.OverrideUnitPrice ?? item.OverrideUnitPrice ?? item.UnitPriceSnapshot;
    return lineNetFromGross(price * item.Quantity, pct);
  }
  const price =
    detail.OverrideMonthlyPrice ??
    item.OverrideMonthlyPrice ??
    item.MonthlyPriceOverride ??
    item.UnitPriceSnapshot * 30;
  return lineNetFromGross(price * item.Quantity, pct);
}

describe('teklif kaydet: yeşil toplam override', () => {
  it('SALE: blur olmadan toplam yazınca eski % gitmez', () => {
    const item = inventoryLine({
      Quantity: 2,
      UnitPriceSnapshot: 500,
      PriceUnit: 'EACH',
    });
    const gross = saleGross(500, 2);
    const saved = saveQuote({
      items: [item],
      quoteType: 'SALE',
      drafts: drafts({
        itemIskonto: { '12': 0 },
        lineNetInputs: { '12': '800,00' },
      }),
    });

    expect(gross).toBe(1000);
    expect(saved.details[0].Iskonto).toBe(20);
    expect(saved.headerIskonto).toBe(0);
    expect(reopenFromSaved(saved.details[0], item, 'SALE', saved.headerIskonto)).toBe(800);
  });

  it('SALE: blur sonrası (taslak temiz, itemIskonto dolu) aynı neti kaydeder', () => {
    const item = inventoryLine({ Quantity: 2, UnitPriceSnapshot: 500, PriceUnit: 'EACH' });
    const gross = saleGross(500, 2);
    const focused = saveQuote({
      items: [item],
      quoteType: 'SALE',
      drafts: drafts({
        itemIskonto: { '12': 0 },
        lineNetInputs: { '12': '800,00' },
      }),
    });
    const afterBlur = saveQuote({
      items: [item],
      quoteType: 'SALE',
      drafts: drafts({
        itemIskonto: { '12': focused.details[0].Iskonto ?? 0 },
        lineNetInputs: {},
      }),
    });

    expect(afterBlur.details[0].Iskonto).toBe(focused.details[0].Iskonto);
    expect(reopenFromSaved(afterBlur.details[0], item, 'SALE', afterBlur.headerIskonto)).toBe(800);
  });

  it('RENTAL: 30 günlük yeşil aylık toplam override blur olmadan kaydolur', () => {
    const item = inventoryLine({ OverrideMonthlyPrice: 150 });
    const gross = rentalGross(150, 10, 30);
    const saved = saveQuote({
      items: [item],
      quoteType: 'RENTAL',
      drafts: drafts({
        itemIskonto: { '12': 0 },
        lineNetInputs: { '12': '1.200,00' },
      }),
    });

    expect(gross).toBe(1500);
    expect(lineNetFromGross(gross, saved.details[0].Iskonto ?? 0)).toBe(1200);
    expect(reopenFromSaved(saved.details[0], item, 'RENTAL', saved.headerIskonto)).toBe(1200);
  });

  it('RENTAL: kuruşluk toplam (1.499,50) kayıttan sonra birebir döner', () => {
    const item = inventoryLine({ OverrideMonthlyPrice: 150 });
    const gross = rentalGross(150, 10, 30);
    const saved = saveQuote({
      items: [item],
      quoteType: 'RENTAL',
      drafts: drafts({
        itemIskonto: { '12': 0 },
        lineNetInputs: { '12': '1.499,50' },
      }),
    });

    expect(reopenFromSaved(saved.details[0], item, 'RENTAL', saved.headerIskonto)).toBe(1499.5);
    expect(saved.details[0].Iskonto).toBeCloseTo(0.0333, 4);
    // Mevcut aylık override korunur; kuruş farkı ince iskontoya yazılır
    expect(saved.details[0].OverrideMonthlyPrice).toBe(150);
  });

  it('manuel satır man- anahtarı ile toplam override eder', () => {
    const item = manualLine();
    const saved = saveQuote({
      items: [item],
      quoteType: 'SALE',
      drafts: drafts({
        itemIskonto: { 'man-manual-1': 0 },
        lineNetInputs: { 'man-manual-1': '750,00' },
      }),
    });

    expect(saved.details[0].is_manual).toBe(true);
    expect(reopenFromSaved(saved.details[0], item, 'SALE', saved.headerIskonto)).toBe(750);
  });
});

describe('teklif kaydet: satır % / üst iskonto taslakları', () => {
  it('satır iskonto % blur olmadan kaydolur', () => {
    const item = inventoryLine({ Quantity: 1, UnitPriceSnapshot: 200, PriceUnit: 'EACH' });
    const saved = saveQuote({
      items: [item],
      quoteType: 'SALE',
      drafts: drafts({
        itemIskonto: { '12': 0 },
        iskontoInputs: { '12': '12,5' },
      }),
    });

    expect(saved.details[0].Iskonto).toBe(12.5);
    expect(reopenFromSaved(saved.details[0], item, 'SALE')).toBe(175);
  });

  it('üst iskonto taslağı satır özel taslağı yoksa tüm satırlara yayılır', () => {
    const a = inventoryLine({ ItemId: 12, Quantity: 1, UnitPriceSnapshot: 100, PriceUnit: 'EACH' });
    const b = inventoryLine({ ItemId: 13, Quantity: 1, UnitPriceSnapshot: 200, PriceUnit: 'EACH' });
    const saved = saveQuote({
      items: [a, b],
      quoteType: 'SALE',
      drafts: drafts({
        itemIskonto: { '12': 0, '13': 0 },
        globalIskontoInput: '10',
        headerIskonto: 0,
      }),
    });

    expect(saved.headerIskonto).toBe(10);
    expect(saved.details[0].Iskonto).toBe(10);
    expect(saved.details[1].Iskonto).toBe(10);
  });

  it('yeşil toplam, üst iskonto taslağından önceliklidir', () => {
    const a = inventoryLine({ ItemId: 12, Quantity: 1, UnitPriceSnapshot: 1000, PriceUnit: 'EACH' });
    const b = inventoryLine({ ItemId: 13, Quantity: 1, UnitPriceSnapshot: 1000, PriceUnit: 'EACH' });
    const saved = saveQuote({
      items: [a, b],
      quoteType: 'SALE',
      drafts: drafts({
        itemIskonto: { '12': 0, '13': 0 },
        lineNetInputs: { '12': '800,00' },
        globalIskontoInput: '10',
      }),
    });

    expect(saved.headerIskonto).toBe(10);
    expect(reopenFromSaved(saved.details[0], a, 'SALE', saved.headerIskonto)).toBe(800);
    expect(saved.details[1].Iskonto).toBe(10);
  });

  it('yeşil toplam, satır % taslağından önceliklidir', () => {
    const item = inventoryLine({ Quantity: 1, UnitPriceSnapshot: 1000, PriceUnit: 'EACH' });
    const saved = saveQuote({
      items: [item],
      quoteType: 'SALE',
      drafts: drafts({
        itemIskonto: { '12': 5 },
        iskontoInputs: { '12': '15' },
        lineNetInputs: { '12': '900,00' },
      }),
    });

    expect(saved.details[0].Iskonto).toBe(10);
  });

  it('yalnızca satır toplamı override edilince başlık iskontosu eski kalır', () => {
    const item = inventoryLine({ Quantity: 1, UnitPriceSnapshot: 1000, PriceUnit: 'EACH' });
    const saved = saveQuote({
      items: [item],
      quoteType: 'SALE',
      drafts: drafts({
        headerIskonto: 0,
        itemIskonto: { '12': 0 },
        lineNetInputs: { '12': '850,00' },
      }),
    });

    expect(saved.headerIskonto).toBe(0);
    expect(saved.details[0].Iskonto).not.toBe(0);
  });
});

describe('teklif kaydet: geçersiz / boş taslak ve sınırlar', () => {
  it('boş yeşil toplam taslağı eski satır iskontosunu korur', () => {
    const item = inventoryLine({ Quantity: 1, UnitPriceSnapshot: 1000, PriceUnit: 'EACH' });
    const saved = saveQuote({
      items: [item],
      quoteType: 'SALE',
      drafts: drafts({
        itemIskonto: { '12': 8 },
        lineNetInputs: { '12': '' },
      }),
    });

    expect(saved.details[0].Iskonto).toBe(8);
  });

  it('geçersiz yeşil toplam (metin) eski % korur', () => {
    const item = inventoryLine({ Quantity: 1, UnitPriceSnapshot: 1000, PriceUnit: 'EACH' });
    const saved = saveQuote({
      items: [item],
      quoteType: 'SALE',
      drafts: drafts({
        itemIskonto: { '12': 8 },
        lineNetInputs: { '12': 'abc' },
      }),
    });

    expect(saved.details[0].Iskonto).toBe(8);
  });

  it('yarım iskonto yazımı (",") eski % korur', () => {
    const item = inventoryLine({ Quantity: 1, UnitPriceSnapshot: 1000, PriceUnit: 'EACH' });
    const saved = saveQuote({
      items: [item],
      quoteType: 'SALE',
      drafts: drafts({
        itemIskonto: { '12': 8 },
        iskontoInputs: { '12': ',' },
      }),
    });

    expect(saved.details[0].Iskonto).toBe(8);
  });

  it('net brütten büyükse %0 (brüte çekilir) kaydeder', () => {
    const item = inventoryLine({ Quantity: 1, UnitPriceSnapshot: 100, PriceUnit: 'EACH' });
    const saved = saveQuote({
      items: [item],
      quoteType: 'SALE',
      drafts: drafts({
        itemIskonto: { '12': 10 },
        lineNetInputs: { '12': '150,00' },
      }),
    });

    expect(saved.details[0].Iskonto).toBe(0);
    expect(reopenFromSaved(saved.details[0], item, 'SALE')).toBe(100);
  });

  it('net 0 → %100 kaydeder', () => {
    const item = inventoryLine({ Quantity: 1, UnitPriceSnapshot: 100, PriceUnit: 'EACH' });
    const saved = saveQuote({
      items: [item],
      quoteType: 'SALE',
      drafts: drafts({
        itemIskonto: { '12': 0 },
        lineNetInputs: { '12': '0,00' },
      }),
    });

    expect(saved.details[0].Iskonto).toBe(100);
    expect(reopenFromSaved(saved.details[0], item, 'SALE')).toBe(0);
  });

  it('görünen brütü yeniden yazınca %0 kalır', () => {
    const item = inventoryLine({ OverrideMonthlyPrice: 100 });
    const gross = rentalGross(100, 10, 30);
    const displayed = lineNetFromGross(gross, 0);
    const saved = saveQuote({
      items: [item],
      quoteType: 'RENTAL',
      drafts: drafts({
        itemIskonto: { '12': 0 },
        lineNetInputs: { '12': displayed.toFixed(2).replace('.', ',') },
      }),
    });

    expect(saved.details[0].Iskonto).toBe(0);
  });
});

describe('teklif kaydet: fiyat override + bağımsız satırlar', () => {
  it('SALE birim fiyat override sonrası toplam, yeni brüt üzerinden iskonto üretir', () => {
    const item = inventoryLine({
      Quantity: 2,
      UnitPriceSnapshot: 100,
      OverrideUnitPrice: 80,
      PriceUnit: 'EACH',
    });
    const gross = saleGross(80, 2);
    const saved = saveQuote({
      items: [item],
      quoteType: 'SALE',
      drafts: drafts({
        itemIskonto: { '12': 0 },
        lineNetInputs: { '12': '140,00' },
      }),
    });

    expect(gross).toBe(160);
    expect(saved.details[0].OverrideUnitPrice).toBe(80);
    expect(reopenFromSaved(saved.details[0], item, 'SALE')).toBe(140);
  });

  it('RENTAL aylık fiyat override + yeşil toplam birlikte gider', () => {
    const item = inventoryLine({
      Quantity: 10,
      UnitPriceSnapshot: 5,
      OverrideMonthlyPrice: 200,
    });
    const gross = rentalGross(200, 10, 30);
    const saved = saveQuote({
      items: [item],
      quoteType: 'RENTAL',
      drafts: drafts({
        itemIskonto: { '12': 0 },
        lineNetInputs: { '12': '1.800,00' },
      }),
    });

    expect(saved.details[0].OverrideMonthlyPrice).toBe(200);
    expect(reopenFromSaved(saved.details[0], item, 'RENTAL')).toBe(1800);
  });

  it('iki satır bağımsız: biri toplam override, diğeri %0', () => {
    const a = inventoryLine({
      ItemId: 12,
      Quantity: 1,
      UnitPriceSnapshot: 1000,
      PriceUnit: 'EACH',
    });
    const b = inventoryLine({
      ItemId: 13,
      Quantity: 1,
      UnitPriceSnapshot: 400,
      PriceUnit: 'EACH',
    });
    const saved = saveQuote({
      items: [a, b],
      quoteType: 'SALE',
      drafts: drafts({
        itemIskonto: { '12': 0, '13': 0 },
        lineNetInputs: { '12': '999,95' },
      }),
    });

    expect(reopenFromSaved(saved.details[0], a, 'SALE')).toBe(999.95);
    expect(saved.details[1].Iskonto).toBe(0);
    expect(reopenFromSaved(saved.details[1], b, 'SALE')).toBe(400);
  });

  it('envanter + manuel kalem aynı kayıtta ayrı iskonto tutar', () => {
    const inv = inventoryLine({ Quantity: 1, UnitPriceSnapshot: 500, PriceUnit: 'EACH' });
    const man = manualLine({ UnitPriceSnapshot: 200 });
    const saved = saveQuote({
      items: [inv, man],
      quoteType: 'SALE',
      drafts: drafts({
        itemIskonto: { '12': 0, 'man-manual-1': 0 },
        lineNetInputs: { '12': '400,00', 'man-manual-1': '150,00' },
      }),
    });

    expect(reopenFromSaved(saved.details[0], inv, 'SALE')).toBe(400);
    expect(reopenFromSaved(saved.details[1], man, 'SALE')).toBe(150);
    expect(saved.details[0].is_manual).toBe(false);
    expect(saved.details[1].is_manual).toBe(true);
  });
});

describe('teklif kaydet: miktar/fiyat sonrası % korunur, net kilitlenmez', () => {
  it('kuruşluk kayıt ince % ile tutulur; miktar artınca net orantılı büyür', () => {
    const first = inventoryLine({ Quantity: 10, OverrideMonthlyPrice: 150 });
    const saved = saveQuote({
      items: [first],
      quoteType: 'RENTAL',
      drafts: drafts({
        itemIskonto: { '12': 0 },
        lineNetInputs: { '12': '1.499,50' },
      }),
    });
    expect(saved.details[0].OverrideMonthlyPrice).toBe(150);
    expect(saved.details[0].Iskonto).toBeCloseTo(0.0333, 4);
    const netAt20 = lineNetFromGross(150 * 20, saved.details[0].Iskonto ?? 0);
    expect(netAt20).toBe(2999);
  });

  it('API hydrate: kayıtlı satır Iskonto başlık 0 olsa da neti üretir', () => {
    const gross = 1000;
    const hydrated = lineIskontoFromApi({ Iskonto: 20 }, 0);
    expect(hydrated).toBe(20);
    expect(lineNetFromGross(gross, hydrated)).toBe(800);
  });

  it('API satır Iskonto yoksa başlık yüzdesine düşer (eski davranış)', () => {
    expect(lineIskontoFromApi({}, 10)).toBe(10);
    expect(lineNetFromGross(1000, lineIskontoFromApi({}, 10))).toBe(900);
  });
});

describe('teklif kaydet: kuruşluk yeşil tutar NUMERIC(7,4) iskonto ile kalır', () => {
  it('4 haneli % kuruşu fiyata dokunmadan korur', () => {
    const gross = 1500;
    const target = 1499.5;
    const highPct = encodeLinePricingForPersistence({
      currentPrice: 150,
      quantity: 10,
      discountPercent: 100 * (1 - target / gross),
    });
    expect(highPct.priceChanged).toBe(false);
    expect(lineNetFromGross(gross, highPct.discountPercent)).toBe(target);

    const item = inventoryLine({ OverrideMonthlyPrice: 150 });
    const saved = saveQuote({
      items: [item],
      quoteType: 'RENTAL',
      drafts: drafts({
        itemIskonto: { '12': 0 },
        lineNetInputs: { '12': '1.499,50' },
      }),
    });
    expect(reopenFromSaved(saved.details[0], item, 'RENTAL')).toBe(1499.5);
  });

  it('yuvarlak tutar (1.450) 4 haneli % ile kaydolur', () => {
    const item = inventoryLine({ OverrideMonthlyPrice: 150 });
    const saved = saveQuote({
      items: [item],
      quoteType: 'RENTAL',
      drafts: drafts({
        itemIskonto: { '12': 0 },
        lineNetInputs: { '12': '1.450,00' },
      }),
    });

    expect(lineNetFromGross(1500, roundTo(saved.lineIskonto['12'] ?? 0, 2))).not.toBe(1450);
    expect(reopenFromSaved(saved.details[0], item, 'RENTAL')).toBe(1450);
    expect(saved.details[0].OverrideMonthlyPrice).toBe(150);
    expect(saved.details[0].Iskonto).toBeCloseTo(3.3333, 4);
  });

  it('1 kuruş (qty=1) ince iskonto ile kaydolur', () => {
    const item = inventoryLine({
      Quantity: 1,
      UnitPriceSnapshot: 1000,
      PriceUnit: 'EACH',
    });
    const saved = saveQuote({
      items: [item],
      quoteType: 'SALE',
      drafts: drafts({
        itemIskonto: { '12': 0 },
        lineNetInputs: { '12': '999,99' },
      }),
    });

    expect(reopenFromSaved(saved.details[0], item, 'SALE')).toBe(999.99);
    expect(saved.details[0].OverrideUnitPrice).toBeUndefined();
    expect(saved.details[0].Iskonto).toBeCloseTo(0.001, 4);
  });
});

describe('parseMoneyInput kaydet taslağı', () => {
  it('TR maskeli yeşil toplamı (1.234,56) okur', () => {
    expect(parseMoneyInput('1.234,56')).toBe(1234.56);
    expect(parseMoneyInput('0,00')).toBe(0);
    expect(parseMoneyInput('1.234.567')).toBe(1234567);
  });
});

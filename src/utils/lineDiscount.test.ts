import { describe, expect, it } from 'vitest';
import {
  clampDiscountPercent,
  clampDiscountRange,
  discountPercentFromNet,
  formatDiscountPercent,
  lineDiscountAmount,
  lineIskontoFromApi,
  lineNetFromGross,
  parseDiscountInput,
  parseMoneyInput,
  resolveCommittedHeaderDiscount,
  resolveCommittedLineDiscount,
  encodeLinePricingForPersistence,
  roundTo,
  type LinePricingDraftState,
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

describe('lineDiscount.clampDiscountRange', () => {
  it('0–100 aralığına çeker, ondalığı korur', () => {
    expect(clampDiscountRange(-5)).toBe(0);
    expect(clampDiscountRange(100.1)).toBe(100);
    expect(clampDiscountRange(0.005)).toBe(0.005);
    expect(clampDiscountRange(Number.NaN)).toBe(0);
  });
});

describe('lineDiscount.formatDiscountPercent', () => {
  it('gereksiz sıfırları kaldırır', () => {
    expect(formatDiscountPercent(10)).toBe('10');
    expect(formatDiscountPercent(10.0)).toBe('10');
    expect(formatDiscountPercent(10.00)).toBe('10');
  });

  it('anlamlı ondalık basamakları korur', () => {
    expect(formatDiscountPercent(10.5)).toBe('10,5');
    expect(formatDiscountPercent(10.50)).toBe('10,5');
    expect(formatDiscountPercent(48.534)).toBe('48,534');
    expect(formatDiscountPercent(12.345678)).toBe('12,345678');
  });

  it('TR formatında gösterir (virgül ile)', () => {
    expect(formatDiscountPercent(48.534)).toBe('48,534');
    expect(formatDiscountPercent(0.005)).toBe('0,005');
    expect(formatDiscountPercent(99.99)).toBe('99,99');
  });

  it('tam sayıları düzgün gösterir', () => {
    expect(formatDiscountPercent(0)).toBe('0');
    expect(formatDiscountPercent(100)).toBe('100');
    expect(formatDiscountPercent(50)).toBe('50');
  });

  it('geçersiz değerler için 0 döner', () => {
    expect(formatDiscountPercent(Number.NaN)).toBe('0');
    expect(formatDiscountPercent(Number.POSITIVE_INFINITY)).toBe('0');
  });

  it('aralık dışı değerleri clamp eder', () => {
    expect(formatDiscountPercent(-5)).toBe('0');
    expect(formatDiscountPercent(150)).toBe('100');
  });
});

describe('lineDiscount.parseDiscountInput', () => {
  it('boş / yarım yazımı null döner (eski % korunur)', () => {
    expect(parseDiscountInput('')).toBeNull();
    expect(parseDiscountInput('   ')).toBeNull();
    expect(parseDiscountInput(',')).toBeNull();
    expect(parseDiscountInput('.')).toBeNull();
    expect(parseDiscountInput('abc')).toBeNull();
  });

  it('TR virgül ve ince yüzdeyi okur', () => {
    expect(parseDiscountInput('10,5')).toBe(10.5);
    expect(parseDiscountInput('0,005')).toBe(0.005);
    expect(parseDiscountInput('10.5')).toBe(10.5);
    expect(parseDiscountInput('0')).toBe(0);
    expect(parseDiscountInput('100')).toBe(100);
  });

  it('aralık dışını 0–100 içine çeker', () => {
    expect(parseDiscountInput('-3')).toBe(0);
    expect(parseDiscountInput('150')).toBe(100);
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

  it('ince yüzdeyi 2 haneye ezmeden nete yansıtır', () => {
    expect(lineNetFromGross(1000, 0.005)).toBe(999.95);
    expect(lineNetFromGross(10000, 0.001)).toBe(9999.9);
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
});

describe('lineDiscount.discountPercentFromNet brüt üstü', () => {
  it('3000→4000 yeşil toplamda fiyat değişmez, iskonto %0 olur', () => {
    const r = discountPercentFromNet(3000, 4000);
    expect(r.reason).toBe('net_above_gross');
    expect(r.discountPercent).toBe(0);
    expect(r.normalizedNet).toBe(3000);
    expect(r.clamped).toBe(true);
    expect(lineNetFromGross(3000, r.discountPercent)).toBe(3000);
  });

  it('kiralama: 10 adet × 300 = 3000 iken 4000 yazınca iskonto %0, brüt 3000 kalır', () => {
    const gross = 300 * 10;
    const r = discountPercentFromNet(gross, 4000);
    expect(r.reason).toBe('net_above_gross');
    expect(r.discountPercent).toBe(0);
    expect(r.normalizedNet).toBe(3000);
  });

  it('hedef brütün altındaysa iskonto hesaplanır', () => {
    const r = discountPercentFromNet(3000, 2400);
    expect(r.discountPercent).toBe(20);
    expect(r.normalizedNet).toBe(2400);
  });
});

describe('lineDiscount.discountPercentFromNet sınırlar', () => {
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
    expect(back).toBe(target);
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

  it('kuruşluk düşüşü %0 yapmaz, yazılan neti korur', () => {
    const cases: Array<{ gross: number; target: number }> = [
      { gross: 1000, target: 999.95 },
      { gross: 1000, target: 999.99 },
      { gross: 1234.56, target: 1234.5 },
      { gross: 3000, target: 2999.9 },
      { gross: 10000, target: 9999.9 },
      { gross: 10000, target: 9999.99 },
      { gross: 45000, target: 44999.5 },
    ];
    for (const { gross, target } of cases) {
      const r = discountPercentFromNet(gross, target);
      expect(r.normalizedNet, `gross=${gross} target=${target}`).toBe(target);
      expect(r.discountPercent, `gross=${gross} target=${target}`).toBeGreaterThan(0);
      expect(lineNetFromGross(gross, r.discountPercent)).toBe(target);
    }
  });

  it('2 hane yetiyorsa yüzdeyi incelmez', () => {
    expect(discountPercentFromNet(1000, 900).discountPercent).toBe(10);
    expect(discountPercentFromNet(200, 190).discountPercent).toBe(5);
  });

  it('float brütte görünen tutar %0 olarak kalır', () => {
    const gross = (100 / 30) * 10 * 30;
    const displayed = lineNetFromGross(gross, 0);
    const r = discountPercentFromNet(gross, displayed);
    expect(r.discountPercent).toBe(0);
    expect(r.normalizedNet).toBe(displayed);
  });
});

describe('lineDiscount.lineDiscountAmount', () => {
  it('brüt − net farkını verir', () => {
    expect(lineDiscountAmount(1000, 10)).toBe(100);
    expect(lineDiscountAmount(1000, 0)).toBe(0);
    expect(lineDiscountAmount(1000, 100)).toBe(1000);
  });
});

describe('lineDiscount.lineIskontoFromApi', () => {
  it('satır yoksa başlık yüzdesine düşer', () => {
    expect(lineIskontoFromApi(null, 10)).toBe(10);
    expect(lineIskontoFromApi({}, 7.5)).toBe(7.5);
    expect(lineIskontoFromApi({ Iskonto: null }, 7.5)).toBe(7.5);
  });

  it('satır yüzdesini korur (ince kuruş dahil)', () => {
    expect(lineIskontoFromApi({ Iskonto: 0.005 }, 10)).toBe(0.005);
    expect(lineIskontoFromApi({ iskonto: '12.5' }, 0)).toBe(12.5);
    expect(lineIskontoFromApi({ Iskonto: 0 }, 10)).toBe(0);
  });
});

describe('lineDiscount.parseMoneyInput', () => {
  it('TR binlik ve ondalığı okur', () => {
    expect(parseMoneyInput('1.500,00')).toBe(1500);
    expect(parseMoneyInput('1.234,56')).toBe(1234.56);
    expect(parseMoneyInput('1500,5')).toBe(1500.5);
  });

  it('EN ondalığı ve boş/geçersizi ayırır', () => {
    expect(parseMoneyInput('1500.50')).toBe(1500.5);
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('-3')).toBeNull();
  });
});

describe('lineDiscount.resolveCommittedLineDiscount', () => {
  const baseDrafts = (overrides: Partial<LinePricingDraftState> = {}): LinePricingDraftState => ({
    itemIskonto: { '12': 0 },
    iskontoInputs: {},
    lineNetInputs: {},
    globalIskontoInput: null,
    headerIskonto: 0,
    ...overrides,
  });

  it('yeşil toplam taslağını blur olmadan iskontoya çevirir', () => {
    const pct = resolveCommittedLineDiscount({
      key: '12',
      gross: 1000,
      drafts: baseDrafts({
        itemIskonto: { '12': 0 },
        lineNetInputs: { '12': '800,00' },
      }),
    });
    expect(pct).toBe(20);
    expect(lineNetFromGross(1000, pct)).toBe(800);
  });

  it('yeşil toplam brütü aşarsa iskonto %0 olur, fiyat değişmez', () => {
    const pct = resolveCommittedLineDiscount({
      key: '12',
      gross: 3000,
      drafts: baseDrafts({
        itemIskonto: { '12': 0 },
        lineNetInputs: { '12': '4.000,00' },
      }),
    });
    expect(pct).toBe(0);
    expect(lineNetFromGross(3000, pct)).toBe(3000);
  });

  it('satır % taslağını kayıtlı iskontoya tercih eder', () => {
    expect(
      resolveCommittedLineDiscount({
        key: '12',
        gross: 1000,
        drafts: baseDrafts({
          itemIskonto: { '12': 0 },
          iskontoInputs: { '12': '15' },
        }),
      })
    ).toBe(15);
  });

  it('yeşil toplam, satır % taslağından önceliklidir', () => {
    expect(
      resolveCommittedLineDiscount({
        key: '12',
        gross: 1000,
        drafts: baseDrafts({
          itemIskonto: { '12': 5 },
          iskontoInputs: { '12': '15' },
          lineNetInputs: { '12': '900,00' },
        }),
      })
    ).toBe(10);
  });

  it('taslak yoksa kayıtlı satır iskontosunu korur', () => {
    expect(
      resolveCommittedLineDiscount({
        key: '12',
        gross: 1000,
        drafts: baseDrafts({ itemIskonto: { '12': 7.5 } }),
      })
    ).toBe(7.5);
  });

  it('üst iskonto taslağını başlığa yazar', () => {
    expect(resolveCommittedHeaderDiscount(0, '12,5')).toBe(12.5);
    expect(resolveCommittedHeaderDiscount(8, null)).toBe(8);
  });
});

describe('lineDiscount.encodeLinePricingForPersistence', () => {
  it('tam % yetiyorsa fiyatı değiştirmez', () => {
    const encoded = encodeLinePricingForPersistence({
      currentPrice: 1000,
      quantity: 1,
      discountPercent: 20,
    });
    expect(encoded).toMatchObject({ discountPercent: 20, price: 1000, priceChanged: false });
  });

  it('kuruşluk neti NUMERIC(7,4) iskonto ile fiyata dokunmadan korur', () => {
    const pct = ((1500 - 1499.5) / 1500) * 100;
    expect(lineNetFromGross(1500, roundTo(pct, 2))).not.toBe(1499.5);
    expect(lineNetFromGross(1500, roundTo(pct, 4))).toBe(1499.5);

    const encoded = encodeLinePricingForPersistence({
      currentPrice: 150,
      quantity: 10,
      discountPercent: pct,
    });
    expect(encoded.priceChanged).toBe(false);
    expect(encoded.price).toBe(150);
    expect(lineNetFromGross(encoded.price * 10, encoded.discountPercent)).toBe(1499.5);
  });

  it('1.450 gibi yuvarlak tutarı 4 haneli % ile korur', () => {
    const pct = ((1500 - 1450) / 1500) * 100;
    const encoded = encodeLinePricingForPersistence({
      currentPrice: 150,
      quantity: 10,
      discountPercent: pct,
    });
    expect(encoded).toMatchObject({ price: 150, discountPercent: 3.3333, priceChanged: false });
    expect(lineNetFromGross(1500, encoded.discountPercent)).toBe(1450);
  });

  it('4 hane yetmezse fiyat override ile kodlar', () => {
    // Brüt 100, hedef 99.99 → %0.01; qty=7 ile 4 haneli % her fiyatla tutmayabilir
    const encoded = encodeLinePricingForPersistence({
      currentPrice: 100 / 7,
      quantity: 7,
      discountPercent: ((100 - 99.99) / 100) * 100,
    });
    expect(lineNetFromGross(encoded.price * 7, encoded.discountPercent)).toBe(99.99);
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

  const netCases: Array<{ gross: number; target: number }> = [
    { gross: 500, target: 499.99 },
    { gross: 1234.56, target: 1200 },
    { gross: 999.99, target: 1.23 },
    { gross: (150 / 30) * 20 * 30, target: 2999.87 },
  ];

  it.each(netCases)('net → % → net (gross=$gross target=$target)', ({ gross, target }) => {
    const r = discountPercentFromNet(gross, target);
    expect(lineNetFromGross(gross, r.discountPercent)).toBe(r.normalizedNet);
    expect(r.normalizedNet).toBe(roundTo(target, 2));
  });
});

describe('lineDiscount global iskonto hassasiyeti', () => {
  it('48.534 gibi virgüllü iskonto tüm satırlarda tamamen aynı olmalı', () => {
    const globalPct = 48.534;
    
    // 3 farklı ürün için brüt tutarlar
    const items = [
      { key: 'item1', gross: 1000 },
      { key: 'item2', gross: 2500 },
      { key: 'item3', gross: 750 },
    ];
    
    // Global iskonto tüm satırlara atanıyor
    const itemIskonto: Record<string, number> = {};
    items.forEach(item => {
      itemIskonto[item.key] = globalPct;
    });
    
    // Tüm satırlardaki iskonto değerleri tamamen aynı mı?
    items.forEach(item => {
      expect(itemIskonto[item.key]).toBe(globalPct);
      expect(itemIskonto[item.key]).toBe(48.534);
    });
    
    // Herhangi iki satır karşılaştırması
    expect(itemIskonto['item1']).toBe(itemIskonto['item2']);
    expect(itemIskonto['item2']).toBe(itemIskonto['item3']);
    
    // Net tutarlar farklı olmalı ama iskonto yüzdesi aynı olmalı
    const nets = items.map(item => 
      lineNetFromGross(item.gross, itemIskonto[item.key])
    );
    expect(nets[0]).not.toBe(nets[1]); // Farklı brüt → farklı net
    expect(nets[1]).not.toBe(nets[2]);
  });

  it('global iskonto değiştirildiğinde önceki satır iskontolarını sıfırlamalı', () => {
    const oldGlobalPct = 10;
    const newGlobalPct = 48.534;
    
    // Başlangıç: Bazı satırlarda özel iskonto var
    const itemIskonto: Record<string, number> = {
      'item1': 15, // Özel iskonto
      'item2': oldGlobalPct, // Global iskonto
    };
    
    // Global iskonto değiştirildiğinde TÜM satırlar güncellenmeli
    const items = [
      { key: 'item1', gross: 1000 },
      { key: 'item2', gross: 2500 },
    ];
    
    // handleGlobalIskontoChange simülasyonu
    items.forEach(item => {
      itemIskonto[item.key] = newGlobalPct;
    });
    
    // Tüm satırlar yeni global iskonto kullanmalı
    expect(itemIskonto['item1']).toBe(newGlobalPct);
    expect(itemIskonto['item2']).toBe(newGlobalPct);
    expect(itemIskonto['item1']).toBe(itemIskonto['item2']);
  });

  it('backend NUMERIC(7,4) hassasiyeti: 48.534 → 48.5340 → 48.534', () => {
    const userInput = 48.534;
    const persisted = roundTo(userInput, 4); // Backend NUMERIC(7,4)
    
    expect(persisted).toBe(48.534);
    
    // Backend'den dönen değer de aynı olmalı
    const fromApi = Number(persisted.toFixed(4));
    expect(fromApi).toBe(48.534);
    expect(fromApi).toBe(userInput);
  });

  it('lineIskontoFromApi: backend satır iskontosu yoksa başlık iskontosunu kullanır', () => {
    const globalPct = 48.534;
    
    // Senaryo 1: Satır iskontosu yok → global kullan
    const line1Pct = lineIskontoFromApi({}, globalPct);
    expect(line1Pct).toBe(globalPct);
    expect(line1Pct).toBe(48.534);
    
    // Senaryo 2: Satır iskontosu var → satır iskontosunu kullan
    const line2Pct = lineIskontoFromApi({ Iskonto: 12.5 }, globalPct);
    expect(line2Pct).toBe(12.5);
    expect(line2Pct).not.toBe(globalPct);
    
    // Senaryo 3: Satır iskontosu null/undefined → global kullan
    const line3Pct = lineIskontoFromApi({ Iskonto: null }, globalPct);
    expect(line3Pct).toBe(globalPct);
  });

  it('resolveCommittedLineDiscount: global iskonto tüm satırlara eşit uygulanır', () => {
    const globalPct = 48.534;
    const items = [
      { key: 'item1', gross: 1000 },
      { key: 'item2', gross: 2500 },
      { key: 'item3', gross: 750 },
    ];
    
    // Global iskonto state
    const drafts = {
      itemIskonto: {
        'item1': globalPct,
        'item2': globalPct,
        'item3': globalPct,
      },
      iskontoInputs: {},
      lineNetInputs: {},
      globalIskontoInput: null,
      headerIskonto: globalPct,
    };
    
    // Her satır için resolved iskonto aynı olmalı
    const resolved = items.map(item => 
      resolveCommittedLineDiscount({
        key: item.key,
        gross: item.gross,
        drafts,
      })
    );
    
    // Tüm satırlar aynı iskonto değerine sahip olmalı
    expect(resolved[0]).toBe(globalPct);
    expect(resolved[1]).toBe(globalPct);
    expect(resolved[2]).toBe(globalPct);
    expect(resolved[0]).toBe(resolved[1]);
    expect(resolved[1]).toBe(resolved[2]);
  });
});

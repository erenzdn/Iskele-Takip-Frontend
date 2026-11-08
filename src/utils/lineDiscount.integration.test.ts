import { describe, expect, it } from 'vitest';
import {
  formatDiscountPercent,
  parseDiscountInput,
  lineNetFromGross,
  discountPercentFromNet,
  resolveCommittedLineDiscount,
  commitQuotePricingDrafts,
  lineIskontoFromApi,
  clampDiscountRange,
  type LinePricingDraftState,
} from './lineDiscount';

describe('Integration: Teklif oluşturma akışı', () => {
  it('AKIŞ 1: Kullanıcı yeni teklif oluşturuyor, global iskonto 48,534', () => {
    // 1. Kullanıcı ana iskonto alanına 48,534 giriyor
    const userInput = '48,534';
    const globalPct = parseDiscountInput(userInput);
    expect(globalPct).toBe(48.534);
    
    // 2. Teklif kalemlerine ürün ekliyor
    const items = [
      { id: '1', name: 'Ürün A', price: 150, qty: 20, gross: 150 * 20 }, // 3000
      { id: '2', name: 'Ürün B', price: 85, qty: 30, gross: 85 * 30 },   // 2550
      { id: '3', name: 'Ürün C', price: 200, qty: 10, gross: 200 * 10 }, // 2000
    ];
    
    // 3. Global iskonto tüm satırlara atanıyor (handleGlobalIskontoChange simülasyonu)
    const itemIskonto: Record<string, number> = {};
    items.forEach(item => {
      itemIskonto[item.id] = globalPct!;
    });
    
    // 4. UI'da gösterilen iskonto değerleri
    const displayedDiscounts = items.map(item => ({
      itemId: item.id,
      discount: formatDiscountPercent(itemIskonto[item.id]),
    }));
    
    // Tüm satırlarda aynı görünmeli
    displayedDiscounts.forEach(({ discount }) => {
      expect(discount).toBe('48,534');
    });
    
    // 5. Net tutarlar hesaplanıyor
    const nets = items.map(item => ({
      itemId: item.id,
      net: lineNetFromGross(item.gross, itemIskonto[item.id]),
    }));
    
    // Net tutarlar: gross * (1 - iskonto/100), 2 ondalık hassasiyet
    expect(nets[0].net).toBe(1543.98); // 3000 * (1 - 0.48534)
    expect(nets[1].net).toBe(1312.38); // 2550 * (1 - 0.48534)
    expect(nets[2].net).toBe(1029.32); // 2000 * (1 - 0.48534)
    
    // 6. Kaydetme (commitQuotePricingDrafts simülasyonu)
    const drafts: LinePricingDraftState = {
      itemIskonto,
      iskontoInputs: {},
      lineNetInputs: {},
      globalIskontoInput: null,
      headerIskonto: globalPct!,
    };
    
    const committed = commitQuotePricingDrafts({
      items,
      lineKey: (item) => item.id,
      getGross: (item) => item.gross,
      drafts,
    });
    
    expect(committed.headerIskonto).toBe(48.534);
    expect(committed.lineIskonto['1']).toBe(48.534);
    expect(committed.lineIskonto['2']).toBe(48.534);
    expect(committed.lineIskonto['3']).toBe(48.534);
  });

  it('AKIŞ 2: Kullanıcı bir satırda manuel iskonto değiştiriyor', () => {
    const globalPct = 48.534;
    
    const items = [
      { id: '1', name: 'Ürün A', gross: 3000 },
      { id: '2', name: 'Ürün B', gross: 2550 },
      { id: '3', name: 'Ürün C', gross: 2000 },
    ];
    
    // Başlangıç: Tüm satırlar global iskonto
    const itemIskonto: Record<string, number> = {};
    items.forEach(item => {
      itemIskonto[item.id] = globalPct;
    });
    
    // Kullanıcı 2. satırda iskonto alanına 15 yazıyor
    const manualInput = '15';
    const manualPct = parseDiscountInput(manualInput);
    itemIskonto['2'] = manualPct!;
    
    // Gösterim
    expect(formatDiscountPercent(itemIskonto['1'])).toBe('48,534'); // Global
    expect(formatDiscountPercent(itemIskonto['2'])).toBe('15');     // Manuel
    expect(formatDiscountPercent(itemIskonto['3'])).toBe('48,534'); // Global
    
    // Net tutarlar
    expect(lineNetFromGross(items[0].gross, itemIskonto['1'])).toBe(1543.98);
    expect(lineNetFromGross(items[1].gross, itemIskonto['2'])).toBe(2167.5); // 2550 * 0.85
    expect(lineNetFromGross(items[2].gross, itemIskonto['3'])).toBe(1029.32);
  });

  it('AKIŞ 3: Kullanıcı yeşil toplam (net) değiştirerek iskonto hesaplatıyor', () => {
    const globalPct = 48.534;
    
    const items = [
      { id: '1', name: 'Ürün A', gross: 3000 },
      { id: '2', name: 'Ürün B', gross: 2550 },
    ];
    
    const itemIskonto: Record<string, number> = {};
    items.forEach(item => {
      itemIskonto[item.id] = globalPct;
    });
    
    // Kullanıcı 1. satırın yeşil toplam alanına 2000 yazıyor
    const targetNet = 2000;
    const result = discountPercentFromNet(items[0].gross, targetNet);
    itemIskonto['1'] = result.discountPercent;
    
    // 1. satır artık farklı iskonto (hassasiyet 4 hanede)
    expect(formatDiscountPercent(itemIskonto['1'])).toBe('33,3333'); // (3000-2000)/3000 * 100
    expect(formatDiscountPercent(itemIskonto['2'])).toBe('48,534'); // Hala global
    
    // Net kontrol
    expect(lineNetFromGross(items[0].gross, itemIskonto['1'])).toBe(2000);
    expect(lineNetFromGross(items[1].gross, itemIskonto['2'])).toBe(1312.38);
  });

  it('AKIŞ 4: Backend\'den gelen teklif açılıyor', () => {
    // Backend response simülasyonu
    const apiResponse = {
      Iskonto: 48.534, // Global iskonto
      details: [
        { ItemId: 1, Iskonto: 48.534, Gross: 3000 }, // Global kullanıyor
        { ItemId: 2, Iskonto: null, Gross: 2550 },    // Satır iskontosu yok -> global kullanılacak
        { ItemId: 3, Iskonto: 15, Gross: 2000 },      // Manuel değiştirilmiş
      ],
    };
    
    // Frontend state'e yüklenirken
    const globalIskonto = Number(apiResponse.Iskonto);
    const itemIskonto: Record<string, number> = {};
    
    apiResponse.details.forEach((detail) => {
      const key = String(detail.ItemId);
      itemIskonto[key] = lineIskontoFromApi(detail, globalIskonto);
    });
    
    // Kontroller
    expect(itemIskonto['1']).toBe(48.534); // Backend'den gelen satır iskontosu
    expect(itemIskonto['2']).toBe(48.534); // null -> global
    expect(itemIskonto['3']).toBe(15);     // Manuel değiştirilmiş
    
    // Gösterim
    expect(formatDiscountPercent(itemIskonto['1'])).toBe('48,534');
    expect(formatDiscountPercent(itemIskonto['2'])).toBe('48,534');
    expect(formatDiscountPercent(itemIskonto['3'])).toBe('15');
  });

  it('AKIŞ 5: Global iskonto değiştiriliyor, tüm satırlar güncelleniyor', () => {
    // Mevcut durum
    let globalPct = 10;
    const items = [
      { id: '1', gross: 3000 },
      { id: '2', gross: 2550 },
      { id: '3', gross: 2000 },
    ];
    
    let itemIskonto: Record<string, number> = {};
    items.forEach(item => {
      itemIskonto[item.id] = globalPct;
    });
    
    // 2. satırda manuel değişiklik yapılmış
    itemIskonto['2'] = 25;
    
    // Kullanıcı global iskonto değiştiriyor: 48,534
    const newInput = '48,534';
    globalPct = parseDiscountInput(newInput)!;
    
    // handleGlobalIskontoChange: TÜM satırları güncelle
    itemIskonto = {};
    items.forEach(item => {
      itemIskonto[item.id] = globalPct;
    });
    
    // Kontrol: Tüm satırlar yeni global iskonto kullanıyor
    expect(itemIskonto['1']).toBe(48.534);
    expect(itemIskonto['2']).toBe(48.534); // Manuel değişiklik silindi
    expect(itemIskonto['3']).toBe(48.534);
    
    // Gösterim: Hepsi aynı
    items.forEach(item => {
      expect(formatDiscountPercent(itemIskonto[item.id])).toBe('48,534');
    });
  });

  it('AKIŞ 6: Kaydetme sırasında blur olmamış değerler', () => {
    const items = [
      { id: '1', gross: 3000 },
      { id: '2', gross: 2550 },
    ];
    
    // State
    const itemIskonto: Record<string, number> = {
      '1': 10,
      '2': 10,
    };
    
    // Kullanıcı global iskonto alanına 48,534 yazmış ama blur yapmamış
    const globalIskontoInput = '48,534';
    
    // Kaydetme sırasında drafts
    const drafts: LinePricingDraftState = {
      itemIskonto,
      iskontoInputs: {},
      lineNetInputs: {},
      globalIskontoInput, // Blur olmamış değer
      headerIskonto: 10,  // Eski değer
    };
    
    // commitQuotePricingDrafts: Blur olmamış değeri de kullanmalı
    const committed = commitQuotePricingDrafts({
      items,
      lineKey: (item) => item.id,
      getGross: (item) => item.gross,
      drafts,
    });
    
    // Yeni global iskonto kullanılmalı
    expect(committed.headerIskonto).toBe(48.534);
    expect(committed.lineIskonto['1']).toBe(48.534);
    expect(committed.lineIskonto['2']).toBe(48.534);
  });

  it('AKIŞ 7: Satırda blur olmamış iskonto değeri', () => {
    const items = [
      { id: '1', gross: 3000 },
      { id: '2', gross: 2550 },
    ];
    
    const itemIskonto: Record<string, number> = {
      '1': 48.534,
      '2': 48.534,
    };
    
    // Kullanıcı 2. satırın iskonto alanına 20 yazmış ama blur yapmamış
    const iskontoInputs: Record<string, string> = {
      '2': '20',
    };
    
    const drafts: LinePricingDraftState = {
      itemIskonto,
      iskontoInputs,
      lineNetInputs: {},
      globalIskontoInput: null,
      headerIskonto: 48.534,
    };
    
    // resolveCommittedLineDiscount
    const resolved1 = resolveCommittedLineDiscount({
      key: '1',
      gross: items[0].gross,
      drafts,
    });
    
    const resolved2 = resolveCommittedLineDiscount({
      key: '2',
      gross: items[1].gross,
      drafts,
    });
    
    expect(resolved1).toBe(48.534); // Blur olmamış input yok
    expect(resolved2).toBe(20);     // Blur olmamış input kullanıldı
  });

  it('AKIŞ 8: Satırda blur olmamış net (yeşil toplam) değeri', () => {
    const items = [
      { id: '1', gross: 3000 },
      { id: '2', gross: 2550 },
    ];
    
    const itemIskonto: Record<string, number> = {
      '1': 48.534,
      '2': 48.534,
    };
    
    // Kullanıcı 1. satırın yeşil toplam alanına 2.100,00 yazmış ama blur yapmamış
    const lineNetInputs: Record<string, string> = {
      '1': '2.100,00',
    };
    
    const drafts: LinePricingDraftState = {
      itemIskonto,
      iskontoInputs: {},
      lineNetInputs,
      globalIskontoInput: null,
      headerIskonto: 48.534,
    };
    
    // resolveCommittedLineDiscount: Net değeri iskontoya çevirmeli
    const resolved = resolveCommittedLineDiscount({
      key: '1',
      gross: items[0].gross,
      drafts,
    });
    
    // Net 2100 → iskonto %30: (3000 - 2100) / 3000 * 100 = 30
    expect(resolved).toBe(30);
    expect(lineNetFromGross(3000, resolved)).toBe(2100);
  });
});

describe('Integration: Hata durumları ve sınır değerleri', () => {
  it('Net değeri brütü aşarsa iskonto %0 olur', () => {
    const gross = 3000;
    const targetNet = 4000; // Brütü aşıyor
    
    const result = discountPercentFromNet(gross, targetNet);
    
    expect(result.discountPercent).toBe(0);
    expect(result.normalizedNet).toBe(3000); // Brüte çekildi
    expect(result.clamped).toBe(true);
    expect(result.reason).toBe('net_above_gross');
    
    // UI'da gösterildiğinde
    expect(formatDiscountPercent(result.discountPercent)).toBe('0');
  });

  it('Brüt 0 iken güvenli varsayılan', () => {
    const gross = 0;
    const targetNet = 100;
    
    const result = discountPercentFromNet(gross, targetNet);
    
    expect(result.discountPercent).toBe(0);
    expect(result.normalizedNet).toBe(0);
    expect(result.reason).toBe('gross_zero');
  });

  it('Negatif net → %100 iskonto', () => {
    const gross = 1000;
    const targetNet = -50;
    
    const result = discountPercentFromNet(gross, targetNet);
    
    expect(result.discountPercent).toBe(100);
    expect(result.normalizedNet).toBe(0);
    expect(result.reason).toBe('net_negative');
  });

  it('Geçersiz input değerleri handle edilir', () => {
    expect(parseDiscountInput('abc')).toBeNull();
    expect(parseDiscountInput('--10')).toBeNull();
    expect(parseDiscountInput('10..5')).toBeNull();
    
    // clampDiscountRange güvenli varsayılan döner (infinity → 0)
    expect(clampDiscountRange(Number.NaN)).toBe(0);
    expect(clampDiscountRange(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampDiscountRange(Number.NEGATIVE_INFINITY)).toBe(0);
    
    // Geçerli aralık dışı değerler clamp edilir
    expect(clampDiscountRange(-10)).toBe(0);
    expect(clampDiscountRange(150)).toBe(100);
  });
});

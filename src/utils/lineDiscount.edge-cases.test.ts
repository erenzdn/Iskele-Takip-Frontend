import { describe, expect, it } from 'vitest';
import {
  formatDiscountPercent,
  parseDiscountInput,
  clampDiscountRange,
  lineNetFromGross,
  discountPercentFromNet,
  resolveCommittedLineDiscount,
  commitQuotePricingDrafts,
  type LinePricingDraftState,
} from './lineDiscount';

describe('formatDiscountPercent - edge cases ve float hassasiyeti', () => {
  it('çok küçük float farkları doğru gösterilir', () => {
    expect(formatDiscountPercent(48.534)).toBe('48,534');
    expect(formatDiscountPercent(48.5340)).toBe('48,534');
    expect(formatDiscountPercent(48.53400000)).toBe('48,534');
  });

  it('float hassasiyet sorunları düzgün handle edilir', () => {
    // JavaScript float hassasiyeti sorunları
    const val1 = 0.1 + 0.2; // 0.30000000000000004
    expect(formatDiscountPercent(val1 * 100)).toMatch(/^30,?0*$/);
    
    const val2 = 48.534;
    expect(formatDiscountPercent(val2)).toBe('48,534');
  });

  it('sıfır ve sıfıra yakın değerler', () => {
    expect(formatDiscountPercent(0)).toBe('0');
    expect(formatDiscountPercent(0.0)).toBe('0');
    expect(formatDiscountPercent(0.00000)).toBe('0');
    expect(formatDiscountPercent(0.001)).toBe('0,001');
    expect(formatDiscountPercent(0.0001)).toBe('0,0001');
  });

  it('100 ve 100a yakın değerler', () => {
    expect(formatDiscountPercent(100)).toBe('100');
    expect(formatDiscountPercent(100.0)).toBe('100');
    expect(formatDiscountPercent(99.999)).toBe('99,999');
    expect(formatDiscountPercent(99.9999)).toBe('99,9999');
  });

  it('çok uzun ondalık basamaklar', () => {
    expect(formatDiscountPercent(48.123456789)).toBe('48,123456789');
    expect(formatDiscountPercent(12.3456789012)).toBe('12,3456789012');
  });

  it('negatif ve aralık dışı değerler clamp edilir', () => {
    expect(formatDiscountPercent(-10)).toBe('0');
    expect(formatDiscountPercent(150)).toBe('100');
    expect(formatDiscountPercent(-0.001)).toBe('0');
  });
});

describe('Global iskonto senaryoları - gerçek kullanım', () => {
  it('Senaryo 1: Kullanıcı 48,534 giriyor, tüm satırlar aynı olmalı', () => {
    const userInput = '48,534';
    const parsed = parseDiscountInput(userInput);
    
    expect(parsed).toBe(48.534);
    
    // 5 farklı ürün için simüle
    const items = [
      { key: '1', gross: 1000 },
      { key: '2', gross: 2500 },
      { key: '3', gross: 750 },
      { key: '4', gross: 3200 },
      { key: '5', gross: 450 },
    ];
    
    const itemIskonto: Record<string, number> = {};
    items.forEach(item => {
      itemIskonto[item.key] = parsed!;
    });
    
    // Tüm gösterimler aynı olmalı
    const displays = items.map(item => formatDiscountPercent(itemIskonto[item.key]));
    const firstDisplay = displays[0];
    expect(firstDisplay).toBe('48,534');
    displays.forEach(display => {
      expect(display).toBe(firstDisplay);
      expect(display).toBe('48,534');
    });
    
    // Net tutarlar farklı olmalı (çünkü brüt farklı)
    const nets = items.map(item => 
      lineNetFromGross(item.gross, itemIskonto[item.key])
    );
    expect(nets[0]).not.toBe(nets[1]);
    expect(nets[1]).not.toBe(nets[2]);
  });

  it('Senaryo 2: Backend NUMERIC(7,4) hassasiyeti gidiş-dönüş', () => {
    const originalValue = 48.534;
    
    // Backend kayıt: 4 hane
    const persisted = Number(originalValue.toFixed(4));
    expect(persisted).toBe(48.534);
    
    // Geri okunduğunda format aynı mı?
    const formatted = formatDiscountPercent(persisted);
    expect(formatted).toBe('48,534');
  });

  it('Senaryo 3: Kullanıcı tam sayı giriyor (10), sonra değiştiriyor (48,534)', () => {
    // İlk durum: 10%
    let globalIskonto = parseDiscountInput('10');
    expect(globalIskonto).toBe(10);
    expect(formatDiscountPercent(globalIskonto!)).toBe('10');
    
    // Değişiklik: 48,534%
    globalIskonto = parseDiscountInput('48,534');
    expect(globalIskonto).toBe(48.534);
    expect(formatDiscountPercent(globalIskonto!)).toBe('48,534');
  });

  it('Senaryo 4: Bir satırda manuel değişiklik, diğerleri global', () => {
    const globalPct = 48.534;
    const items = [
      { key: '1', gross: 1000 },
      { key: '2', gross: 2500 },
      { key: '3', gross: 750 },
    ];
    
    // Başlangıç: Tüm satırlar global iskonto
    const itemIskonto: Record<string, number> = {};
    items.forEach(item => {
      itemIskonto[item.key] = globalPct;
    });
    
    // Kullanıcı 2. satırda manuel değişiklik yapıyor (12%)
    itemIskonto['2'] = 12;
    
    // Gösterim kontrolü
    expect(formatDiscountPercent(itemIskonto['1'])).toBe('48,534');
    expect(formatDiscountPercent(itemIskonto['2'])).toBe('12'); // Manuel değişiklik
    expect(formatDiscountPercent(itemIskonto['3'])).toBe('48,534');
    
    // 1. ve 3. satır hala aynı
    expect(itemIskonto['1']).toBe(itemIskonto['3']);
    expect(itemIskonto['1']).not.toBe(itemIskonto['2']);
  });

  it('Senaryo 5: Yeşil toplam (net) değiştirilerek iskonto hesaplanıyor', () => {
    const gross = 3000;
    const targetNet = 1542.0; // Kullanıcı bu neti istiyor
    
    const result = discountPercentFromNet(gross, targetNet);
    
    // İskonto hesaplandı
    expect(result.normalizedNet).toBe(1542.0);
    expect(result.reason).toBe('ok');
    
    // Ters hesap: Bu iskonto ile aynı neti üretmeli
    const netAgain = lineNetFromGross(gross, result.discountPercent);
    expect(netAgain).toBe(1542.0);
    
    // Gösterim
    const formatted = formatDiscountPercent(result.discountPercent);
    expect(formatted).toMatch(/^\d+,?\d*$/); // Geçerli TR formatı
  });

  it('Senaryo 6: commitQuotePricingDrafts - global iskonto tüm satırlara yayılıyor', () => {
    const globalPct = 48.534;
    const items = [
      { id: 1, price: 100, qty: 10 },
      { id: 2, price: 250, qty: 5 },
      { id: 3, price: 75, qty: 8 },
    ];
    
    const drafts: LinePricingDraftState = {
      itemIskonto: {
        '1': globalPct,
        '2': globalPct,
        '3': globalPct,
      },
      iskontoInputs: {},
      lineNetInputs: {},
      globalIskontoInput: null,
      headerIskonto: globalPct,
    };
    
    const result = commitQuotePricingDrafts({
      items,
      lineKey: (item) => String(item.id),
      getGross: (item) => item.price * item.qty,
      drafts,
    });
    
    expect(result.headerIskonto).toBe(globalPct);
    expect(result.lineIskonto['1']).toBe(globalPct);
    expect(result.lineIskonto['2']).toBe(globalPct);
    expect(result.lineIskonto['3']).toBe(globalPct);
    
    // Tüm satırlar aynı
    expect(result.lineIskonto['1']).toBe(result.lineIskonto['2']);
    expect(result.lineIskonto['2']).toBe(result.lineIskonto['3']);
  });

  it('Senaryo 7: resolveCommittedLineDiscount - blur olmadan kayıt', () => {
    const globalPct = 48.534;
    const drafts: LinePricingDraftState = {
      itemIskonto: { '1': globalPct },
      iskontoInputs: {},
      lineNetInputs: {},
      globalIskontoInput: '48,534', // Henüz blur olmamış
      headerIskonto: 0, // Eski değer
    };
    
    const resolved = resolveCommittedLineDiscount({
      key: '1',
      gross: 1000,
      drafts,
    });
    
    // globalIskontoInput'tan parse edip kullanmalı
    expect(resolved).toBe(globalPct);
  });

  it('Senaryo 8: Yarım giriş durumları (boş, nokta, virgül)', () => {
    // Kullanıcı yazıyor ama henüz tamamlamamış - tamamen boş
    expect(parseDiscountInput('')).toBeNull();
    expect(parseDiscountInput(',')).toBeNull();
    expect(parseDiscountInput('.')).toBeNull();
    
    // "48," veya "48." → 48 olarak parse edilir (JavaScript Number() davranışı)
    expect(parseDiscountInput('48,')).toBe(48);
    expect(parseDiscountInput('48.')).toBe(48);
    
    // Tamamlanmış girişler
    expect(parseDiscountInput('48')).toBe(48);
    expect(parseDiscountInput('48,5')).toBe(48.5);
    expect(parseDiscountInput('48.5')).toBe(48.5);
    expect(parseDiscountInput('48,534')).toBe(48.534);
  });
});

describe('Geriye uyumluluk ve mevcut davranış korunması', () => {
  it('eski String().replace() davranışı ile uyumlu', () => {
    const testCases = [
      { value: 10, oldWay: '10', newWay: formatDiscountPercent(10) },
      { value: 10.5, oldWay: '10,5', newWay: formatDiscountPercent(10.5) },
      { value: 48.534, oldWay: '48,534', newWay: formatDiscountPercent(48.534) },
      { value: 0, oldWay: '0', newWay: formatDiscountPercent(0) },
      { value: 100, oldWay: '100', newWay: formatDiscountPercent(100) },
    ];
    
    testCases.forEach(({ value, oldWay, newWay }) => {
      // Eski davranış ile karşılaştır
      expect(newWay).toBe(oldWay);
      // String() kullanılarak eski format da aynı sonucu vermeli
      expect(String(value).replace('.', ',')).toBe(oldWay);
      // Yeni format en az eski format kadar iyi olmalı
      expect(newWay.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('clampDiscountRange hassasiyeti koruyor', () => {
    expect(clampDiscountRange(48.534)).toBe(48.534);
    expect(clampDiscountRange(0.005)).toBe(0.005);
    expect(clampDiscountRange(12.3456789)).toBe(12.3456789);
  });

  it('parseDiscountInput hassasiyeti koruyor', () => {
    expect(parseDiscountInput('48,534')).toBe(48.534);
    expect(parseDiscountInput('0,005')).toBe(0.005);
    expect(parseDiscountInput('12,3456789')).toBe(12.3456789);
  });
});

describe('Performance ve ekstrem durumlar', () => {
  it('çok fazla satır ile performance', () => {
    const itemCount = 1000;
    const globalPct = 48.534;
    const items = Array.from({ length: itemCount }, (_, i) => ({
      key: String(i),
      gross: Math.random() * 10000,
    }));
    
    const start = Date.now();
    
    const itemIskonto: Record<string, number> = {};
    items.forEach(item => {
      itemIskonto[item.key] = globalPct;
    });
    
    const displays = items.map(item => formatDiscountPercent(itemIskonto[item.key]));
    
    const duration = Date.now() - start;
    
    // Tüm gösterimler aynı
    displays.forEach(display => {
      expect(display).toBe('48,534');
    });
    
    // Makul süre (< 100ms)
    expect(duration).toBeLessThan(100);
  });

  it('çok büyük ve çok küçük sayılar', () => {
    expect(formatDiscountPercent(Number.MAX_SAFE_INTEGER)).toBe('100'); // Clamp
    expect(formatDiscountPercent(Number.MIN_VALUE)).toBe('0'); // Çok küçük
    expect(formatDiscountPercent(Number.EPSILON)).toBe('0'); // Çok küçük
  });
});

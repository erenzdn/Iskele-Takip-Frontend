import { describe, expect, it } from 'vitest';
import type { QuoteLineItem } from '../models';
import {
  buildQuoteDetailRequest,
  hydrateQuotePriceMetadata,
  normalizeContractDetailPrice,
} from './linePriceMetadata';

const inventoryLine = (
  overrides: Partial<Extract<QuoteLineItem, { kind: 'inventory' }>> = {}
): Extract<QuoteLineItem, { kind: 'inventory' }> => ({
  kind: 'inventory',
  ItemId: 12,
  Quantity: 2,
  UnitPriceSnapshot: 25,
  PriceUnit: 'EACH',
  PriceSource: 'INVENTORY',
  ItemName: 'Kalıp',
  ...overrides,
});

describe('buildQuoteDetailRequest', () => {
  it('yeni envanter satırında kimliği ve dokunulmamış override alanını göndermez', () => {
    const payload = buildQuoteDetailRequest(inventoryLine(), 'SALE', 0);

    expect(payload).not.toHaveProperty('QuoteDetailId');
    expect(payload).not.toHaveProperty('OverrideUnitPrice');
  });

  it('mevcut satırın QuoteDetailId kimliğini taşır', () => {
    const payload = buildQuoteDetailRequest(
      inventoryLine({ QuoteDetailId: 41 }),
      'SALE',
      5
    );

    expect(payload).toMatchObject({ QuoteDetailId: 41, ItemId: 12, Iskonto: 5 });
  });

  it('SALE ve RENTAL override değerlerini, açık 0 dahil, korur', () => {
    expect(
      buildQuoteDetailRequest(inventoryLine({ OverrideUnitPrice: 0 }), 'SALE', 0)
    ).toHaveProperty('OverrideUnitPrice', 0);
    expect(
      buildQuoteDetailRequest(inventoryLine({ OverrideMonthlyPrice: 900 }), 'RENTAL', 0)
    ).toHaveProperty('OverrideMonthlyPrice', 900);
  });

  it('kullanıcının temizlediği override için null gönderir', () => {
    expect(
      buildQuoteDetailRequest(inventoryLine({ OverrideUnitPrice: null }), 'SALE', 0)
    ).toHaveProperty('OverrideUnitPrice', null);
    expect(
      buildQuoteDetailRequest(inventoryLine({ OverrideMonthlyPrice: null }), 'RENTAL', 0)
    ).toHaveProperty('OverrideMonthlyPrice', null);
  });

  it('manuel yeni ve mevcut kalemlerde doğru kimlik semantiğini uygular', () => {
    const manual: QuoteLineItem = {
      kind: 'manual',
      ClientId: 'manual-1',
      is_manual: true,
      Description: 'Nakliye',
      Quantity: 1,
      UnitPriceSnapshot: 0,
      PriceUnit: 'EACH',
      PriceSource: 'MANUAL',
    };

    expect(buildQuoteDetailRequest(manual, 'SALE', 0)).toEqual({
      is_manual: true,
      Description: 'Nakliye',
      Quantity: 1,
      DailyPrice: 0,
      Iskonto: 0,
    });
    expect(
      buildQuoteDetailRequest({ ...manual, QuoteDetailId: 9 }, 'SALE', 0)
    ).toHaveProperty('QuoteDetailId', 9);
  });
});

describe('hydrateQuotePriceMetadata', () => {
  it('SALE OVERRIDE satırını snapshot üzerinden UI override state ile hydrate eder', () => {
    expect(
      hydrateQuotePriceMetadata(
        { UnitPriceSnapshot: 73, PriceSource: 'OVERRIDE' },
        'SALE'
      )
    ).toMatchObject({
      unitPriceSnapshot: 73,
      priceSource: 'OVERRIDE',
      overrideUnitPrice: 73,
    });
  });

  it('RENTAL MonthlyPriceOverride alanını camelCase dahil korur', () => {
    expect(
      hydrateQuotePriceMetadata(
        { unitPriceSnapshot: 20, monthlyPriceOverride: 0, priceSource: 'OVERRIDE' },
        'RENTAL'
      )
    ).toMatchObject({
      unitPriceSnapshot: 20,
      monthlyPriceOverride: 0,
      overrideMonthlyPrice: 0,
    });
  });
});

describe('normalizeContractDetailPrice', () => {
  it.each([
    [{ UnitPriceSnapshot: 11 }, 11],
    [{ unitPriceSnapshot: 12 }, 12],
    [{ DailyPriceAtRent: 13 }, 13],
    [{ dailyPriceAtRent: 14 }, 14],
    [{ DailyPrice: 15 }, 15],
    [{ dailyPrice: 16 }, 16],
    [{ UnitPriceSnapshot: 0 }, 0],
  ])('Pascal/camel/legacy fiyatı normalize eder: %o', (detail, expected) => {
    expect(normalizeContractDetailPrice(detail)).toEqual({ value: expected });
  });

  it('geçersiz veya eksik fiyatı 0 olarak göstermeyip hata döndürür', () => {
    const invalid = normalizeContractDetailPrice({
      DetailId: 77,
      UnitPriceSnapshot: 'geçersiz',
    });
    const missing = normalizeContractDetailPrice({ detailId: 78 });

    expect(invalid.value).toBeUndefined();
    expect(invalid.error).toContain('77');
    expect(missing.value).toBeUndefined();
    expect(missing.error).toContain('78');
  });
});

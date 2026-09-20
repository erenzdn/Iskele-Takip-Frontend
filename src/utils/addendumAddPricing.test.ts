import { describe, expect, it } from 'vitest';
import type { ContractLineItem, Inventory } from '../models';
import {
  inventoryUnitPriceForContractType,
  resolveAddendumAddedItemPricing,
  resolveAddendumAddedItemUnitPrice,
} from './addendumAddPricing';

function inventory(partial: Partial<Inventory> & { ItemId: number }): Inventory {
  return {
    ItemName: 'Ürün',
    UnitPrice: 80,
    MonthlyListPrice: 3000,
    ...partial,
  } as Inventory;
}

function contractInv(
  partial: Partial<Extract<ContractLineItem, { kind: 'inventory' }>> & {
    ItemId: number;
    DetailId: number;
  }
): ContractLineItem {
  return {
    kind: 'inventory',
    WarehouseId: 1,
    RentedQuantity: 1,
    ReturnedQuantity: 0,
    UnitPriceSnapshot: 12,
    PriceUnit: 'DAY',
    PriceSource: 'INVENTORY',
    ItemName: 'Sözleşme ürünü',
    ...partial,
  };
}

describe('resolveAddendumAddedItemUnitPrice', () => {
  it('sözleşmede yoksa stok kartı fiyatını kullanır', () => {
    const item = inventory({ ItemId: 5, MonthlyListPrice: 3000 });
    expect(
      resolveAddendumAddedItemUnitPrice({
        item,
        contractType: 'RENTAL',
        currency: 'TRY',
        contractLines: [],
      })
    ).toBe(inventoryUnitPriceForContractType(item, 'TRY', 'RENTAL'));
  });

  it('aynı ürün sözleşmede varsa sözleşme birim fiyatını kullanır', () => {
    const item = inventory({ ItemId: 5, MonthlyListPrice: 9000, UnitPrice: 999 });
    expect(
      resolveAddendumAddedItemUnitPrice({
        item,
        contractType: 'RENTAL',
        currency: 'TRY',
        contractLines: [contractInv({ ItemId: 5, DetailId: 1, UnitPriceSnapshot: 18.5 })],
      })
    ).toBe(18.5);
  });

  it('satışta override birim fiyatı önceliklidir', () => {
    const item = inventory({ ItemId: 5, UnitPrice: 80 });
    expect(
      resolveAddendumAddedItemUnitPrice({
        item,
        contractType: 'SALE',
        currency: 'TRY',
        contractLines: [
          contractInv({
            ItemId: 5,
            DetailId: 1,
            UnitPriceSnapshot: 80,
            OverrideUnitPrice: 55,
            PriceUnit: 'EACH',
          }),
        ],
      })
    ).toBe(55);
  });

  it('kiralamada aylık override’ı güne çevirir', () => {
    const item = inventory({ ItemId: 5, MonthlyListPrice: 9000 });
    expect(
      resolveAddendumAddedItemUnitPrice({
        item,
        contractType: 'RENTAL',
        currency: 'TRY',
        contractLines: [
          contractInv({
            ItemId: 5,
            DetailId: 1,
            UnitPriceSnapshot: 10,
            MonthlyPriceOverride: 600,
          }),
        ],
      })
    ).toBe(20);
  });

  it('varsayılan depo eşleşen satırı tercih eder', () => {
    const item = inventory({ ItemId: 5 });
    expect(
      resolveAddendumAddedItemUnitPrice({
        item,
        contractType: 'RENTAL',
        currency: 'TRY',
        preferredWarehouseId: 2,
        contractLines: [
          contractInv({ ItemId: 5, DetailId: 1, WarehouseId: 1, UnitPriceSnapshot: 11 }),
          contractInv({ ItemId: 5, DetailId: 2, WarehouseId: 2, UnitPriceSnapshot: 22 }),
        ],
      })
    ).toBe(22);
  });

  it('sözleşme fiyatı 0 ise stok kartına düşer', () => {
    const item = inventory({ ItemId: 5, MonthlyListPrice: 3000 });
    expect(
      resolveAddendumAddedItemUnitPrice({
        item,
        contractType: 'RENTAL',
        currency: 'TRY',
        contractLines: [contractInv({ ItemId: 5, DetailId: 1, UnitPriceSnapshot: 0 })],
      })
    ).toBe(100);
  });
});

describe('resolveAddendumAddedItemPricing iskonto', () => {
  it('sözleşmede yoksa genel iskontoyu kullanır', () => {
    const item = inventory({ ItemId: 9 });
    expect(
      resolveAddendumAddedItemPricing({
        item,
        contractType: 'RENTAL',
        currency: 'TRY',
        contractLines: [],
        fallbackDiscountPercent: 12.5,
      })
    ).toMatchObject({
      unitPrice: inventoryUnitPriceForContractType(item, 'TRY', 'RENTAL'),
      discountPercent: 12.5,
    });
  });

  it('aynı ürünün satır iskontosunu kullanır', () => {
    const item = inventory({ ItemId: 5 });
    expect(
      resolveAddendumAddedItemPricing({
        item,
        contractType: 'RENTAL',
        currency: 'TRY',
        fallbackDiscountPercent: 20,
        contractLines: [
          contractInv({ ItemId: 5, DetailId: 1, UnitPriceSnapshot: 18, Iskonto: 8 }),
        ],
      })
    ).toEqual({ unitPrice: 18, discountPercent: 8 });
  });

  it('satır iskontosu 0 ise genel iskontoya düşmez', () => {
    const item = inventory({ ItemId: 5 });
    expect(
      resolveAddendumAddedItemPricing({
        item,
        contractType: 'RENTAL',
        currency: 'TRY',
        fallbackDiscountPercent: 20,
        contractLines: [
          contractInv({ ItemId: 5, DetailId: 1, UnitPriceSnapshot: 18, Iskonto: 0 }),
        ],
      })
    ).toEqual({ unitPrice: 18, discountPercent: 0 });
  });
});

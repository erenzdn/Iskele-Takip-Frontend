import { describe, expect, it } from 'vitest';
import type { ContractLineItem, Inventory } from '../models';
import {
  contractLineRentedQuantity,
  filterContractLinesForPeek,
  remainingContractLineQuantity,
  resolveInventoryForContractLine,
  totalRentedQuantityForItem,
} from './contractLinePeek';

function inventory(
  partial: Partial<Extract<ContractLineItem, { kind: 'inventory' }>> & { DetailId: number }
): ContractLineItem {
  return {
    kind: 'inventory',
    ItemId: 1,
    WarehouseId: 1,
    RentedQuantity: 10,
    ReturnedQuantity: 0,
    UnitPriceSnapshot: 12,
    PriceUnit: 'DAY',
    PriceSource: 'INVENTORY',
    ItemName: 'H tipi dikme',
    ItemCode: 'HT-01',
    WarehouseName: 'Ana Depo',
    ...partial,
  };
}

describe('remainingContractLineQuantity', () => {
  it('iade düşülmüş kalan miktarı verir', () => {
    expect(
      remainingContractLineQuantity(inventory({ DetailId: 1, RentedQuantity: 10, ReturnedQuantity: 3 }))
    ).toBe(7);
  });
});

describe('contractLineRentedQuantity', () => {
  it('sözleşmedeki orijinal kullanım adedini verir', () => {
    expect(
      contractLineRentedQuantity(inventory({ DetailId: 1, RentedQuantity: 10, ReturnedQuantity: 3 }))
    ).toBe(10);
  });
});

describe('totalRentedQuantityForItem', () => {
  it('aynı ürünün tüm satırlarını toplar', () => {
    const lines = [
      inventory({ DetailId: 1, ItemId: 1, RentedQuantity: 10, WarehouseId: 1 }),
      inventory({ DetailId: 2, ItemId: 1, RentedQuantity: 5, WarehouseId: 2 }),
      inventory({ DetailId: 3, ItemId: 2, RentedQuantity: 8 }),
    ];
    expect(totalRentedQuantityForItem(lines, 1)).toBe(15);
    expect(totalRentedQuantityForItem(lines, 2)).toBe(8);
  });
});

describe('resolveInventoryForContractLine', () => {
  it('katalogdan stok kartını bulur', () => {
    const line = inventory({ DetailId: 1, ItemId: 9, ItemName: 'Satır adı' });
    const catalog = [{ ItemId: 9, ItemName: 'Katalog adı', UnitPrice: 1 }] as Inventory[];
    expect(resolveInventoryForContractLine(line, catalog)?.ItemName).toBe('Katalog adı');
  });

  it('manuel satırda undefined döner', () => {
    const manual: ContractLineItem = {
      kind: 'manual',
      ClientId: 'm1',
      IsManual: true,
      Description: 'Manuel',
      RentedQuantity: 2,
      UnitPriceSnapshot: 1,
      PriceUnit: 'DAY',
      PriceSource: 'MANUAL',
    };
    expect(resolveInventoryForContractLine(manual)).toBeUndefined();
  });

  it('katalog yoksa satır bilgilerinden kart üretir', () => {
    const line = inventory({ DetailId: 1, ItemId: 4, ItemName: 'Satır ürünü', ItemCode: 'X-1' });
    const resolved = resolveInventoryForContractLine(line);
    expect(resolved?.ItemId).toBe(4);
    expect(resolved?.ItemName).toBe('Satır ürünü');
    expect(resolved?.ItemCode).toBe('X-1');
  });
});

describe('filterContractLinesForPeek', () => {
  const lines = [
    inventory({ DetailId: 1, ItemName: 'H tipi dikme', ItemCode: 'HT-01' }),
    inventory({ DetailId: 2, ItemId: 2, ItemName: 'Çapraz bağlantı', ItemCode: 'CB-02', WarehouseName: 'Şantiye' }),
  ];

  it('boş aramada tüm satırları döner', () => {
    expect(filterContractLinesForPeek(lines, '  ')).toHaveLength(2);
  });

  it('ürün adı veya kod ile süzülür', () => {
    expect(filterContractLinesForPeek(lines, 'çapraz')).toEqual([lines[1]]);
    expect(filterContractLinesForPeek(lines, 'ht-01')).toEqual([lines[0]]);
  });
});

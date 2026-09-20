import { describe, expect, it } from 'vitest';
import type { ContractLineItem } from '../models';
import {
  filterContractLinesForPeek,
  remainingContractLineQuantity,
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

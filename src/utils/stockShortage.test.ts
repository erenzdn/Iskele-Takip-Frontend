import { describe, expect, it } from 'vitest';
import type { WarehouseStock } from '../models';
import { aggregateStockNeeds, computeStockShortages, usableWarehouseStock } from './stockShortage';

const stock = (WarehouseId: number, Quantity: number, Reserved = 0) =>
  ({ WarehouseId, Quantity, Reserved }) as WarehouseStock;

describe('stockShortage', () => {
  it('kullanılabilir stok rezervi düşer, kayıt yoksa 0', () => {
    expect(usableWarehouseStock([stock(10, 5, 2)], 10)).toBe(3);
    expect(usableWarehouseStock([stock(10, 5)], 11)).toBe(0);
  });

  it('aynı ürün+depo ihtiyaçlarını toplar, sıfırları atar', () => {
    const needs = aggregateStockNeeds([
      { ItemId: 1, WarehouseId: 10, label: 'A', required: 2 },
      { ItemId: 1, WarehouseId: 10, label: 'A', required: 3 },
      { ItemId: 2, WarehouseId: 10, label: 'B', required: 0 },
    ]);
    expect(needs).toEqual([{ ItemId: 1, WarehouseId: 10, label: 'A', required: 5 }]);
  });

  it('yalnızca eksikleri döner; stoğu yüklenmemiş ürünü atlar', () => {
    const shortages = computeStockShortages(
      [
        { ItemId: 1, WarehouseId: 10, label: 'A', required: 4 },
        { ItemId: 2, WarehouseId: 10, label: 'B', required: 1 },
        { ItemId: 3, WarehouseId: 10, label: 'C', required: 9 },
        { ItemId: 4, WarehouseId: 10, label: 'D', required: 1 },
      ],
      { 1: [stock(10, 5, 2)], 2: [], 4: [stock(10, 1)] }
    );
    expect(shortages.map((s) => [s.ItemId, s.available, s.missing])).toEqual([
      [1, 3, 1],
      [2, 0, 1],
    ]);
  });
});

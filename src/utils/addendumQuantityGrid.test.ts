import { describe, expect, it } from 'vitest';
import type { AddendumDetail, ContractLineItem } from '../models';
import {
  buildAddendumGridRows,
  planAddendumPriceOps,
  planAddendumQtyOps,
  savedTargetPrice,
  savedTargetQty,
} from './addendumQuantityGrid';

describe('addendum fiyat değişikliği', () => {
  const rentalLine = {
    kind: 'inventory',
    DetailId: 1,
    ItemId: 10,
    WarehouseId: 1,
    RentedQuantity: 5,
    ReturnedQuantity: 0,
    UnitPriceSnapshot: 10, // günlük
    PriceUnit: 'DAY',
    PriceSource: 'INVENTORY',
    ItemName: 'Dikme',
  } as ContractLineItem;

  it('kiralamada aylık fiyat = günlük × 30; kayıtlı değişiklik gösterilir', () => {
    const [row] = buildAddendumGridRows(
      [rentalLine],
      [
        {
          DetailId: 5,
          AddendumId: 1,
          ChangeType: 'PRICE_CHANGE',
          ContractDetailId: 1,
          NewUnitPrice: 12,
          NewMonthlyOverride: 360,
        } as AddendumDetail,
      ],
      true
    );
    if (row.kind !== 'contract') throw new Error('contract row bekleniyordu');
    expect(row.currentPrice).toBe(300);
    expect(savedTargetPrice(row, true)).toBe(360);
  });

  it('kiralamada yeni aylık fiyat günlük + aylık override olarak eklenir', () => {
    const rows = buildAddendumGridRows([rentalLine], [], true);
    expect(planAddendumPriceOps(rows, { 'c-1': 450 }, true)).toEqual([
      {
        op: 'add',
        payload: {
          ChangeType: 'PRICE_CHANGE',
          ContractDetailId: 1,
          NewUnitPrice: 15,
          NewMonthlyOverride: 450,
        },
        rowKey: 'c-1',
      },
    ]);
  });

  it('satışta birim fiyat; mevcut fiyata dönünce kalem silinir, farklıysa güncellenir', () => {
    const saleLine = { ...rentalLine, DetailId: 2, PriceUnit: 'EACH', UnitPriceSnapshot: 100 } as ContractLineItem;
    const rows = buildAddendumGridRows(
      [saleLine, { ...saleLine, DetailId: 3 } as ContractLineItem],
      [
        { DetailId: 7, AddendumId: 1, ChangeType: 'PRICE_CHANGE', ContractDetailId: 2, NewUnitPrice: 120 } as AddendumDetail,
        { DetailId: 8, AddendumId: 1, ChangeType: 'PRICE_CHANGE', ContractDetailId: 3, NewUnitPrice: 120 } as AddendumDetail,
      ],
      false
    );
    expect(planAddendumPriceOps(rows, { 'c-2': 100, 'c-3': 130 }, false)).toEqual([
      { op: 'delete', detailId: 7, rowKey: 'c-2' },
      { op: 'update', detailId: 8, patch: { NewUnitPrice: 130 }, rowKey: 'c-3' },
    ]);
  });
});

function line(id: number, qty: number): ContractLineItem {
  return {
    kind: 'inventory',
    DetailId: id,
    ItemId: id * 10,
    WarehouseId: 1,
    RentedQuantity: qty,
    ReturnedQuantity: 0,
    UnitPriceSnapshot: 10,
    PriceUnit: 'DAY',
    PriceSource: 'INVENTORY',
    ItemName: `Ürün ${id}`,
  } as ContractLineItem;
}

function detail(partial: Partial<AddendumDetail> & { DetailId: number }): AddendumDetail {
  return { AddendumId: 1, ChangeType: 'INCREASE', ...partial } as AddendumDetail;
}

describe('addendumQuantityGrid', () => {
  it('tüm sözleşme kalemlerini + ADD kalemlerini satır yapar', () => {
    const rows = buildAddendumGridRows(
      [line(1, 5), line(2, 3)],
      [
        detail({ DetailId: 11, ChangeType: 'DECREASE', ContractDetailId: 2, QuantityChange: -1 }),
        detail({ DetailId: 12, ChangeType: 'ADD', ItemId: 99, QuantityChange: 4 }),
        detail({ DetailId: 13, ChangeType: 'PRICE_CHANGE', ContractDetailId: 1, NewUnitPrice: 5 }),
      ]
    );
    expect(rows.map((r) => r.key)).toEqual(['c-1', 'c-2', 'a-12']);
    expect(rows.map(savedTargetQty)).toEqual([5, 2, 4]);
  });

  it('yeni artış ekler, değişmeyeni atlar', () => {
    const rows = buildAddendumGridRows([line(1, 5), line(2, 3)], []);
    expect(planAddendumQtyOps(rows, { 'c-1': 8, 'c-2': 3 })).toEqual([
      {
        op: 'add',
        payload: { ChangeType: 'INCREASE', ContractDetailId: 1, QuantityChange: 3 },
        rowKey: 'c-1',
      },
    ]);
  });

  it('mevcut kalemi günceller, sıfır farkta siler, tip değişiminde sil+ekle', () => {
    const rows = buildAddendumGridRows(
      [line(1, 5), line(2, 5), line(3, 5)],
      [
        detail({ DetailId: 21, ContractDetailId: 1, QuantityChange: 2 }),
        detail({ DetailId: 22, ContractDetailId: 2, QuantityChange: 2 }),
        detail({ DetailId: 23, ContractDetailId: 3, QuantityChange: 2 }),
      ]
    );
    const ops = planAddendumQtyOps(rows, { 'c-1': 9, 'c-2': 5, 'c-3': 1 });
    expect(ops).toEqual([
      {
        op: 'update',
        detailId: 21,
        patch: { ChangeType: 'INCREASE', ContractDetailId: 1, QuantityChange: 4 },
        rowKey: 'c-1',
      },
      { op: 'delete', detailId: 22, rowKey: 'c-2' },
      { op: 'delete', detailId: 23, rowKey: 'c-3' },
      {
        op: 'add',
        payload: { ChangeType: 'DECREASE', ContractDetailId: 3, QuantityChange: -4 },
        rowKey: 'c-3',
      },
    ]);
  });

  it('ADD kaleminin miktarını günceller, 0 ise siler', () => {
    const rows = buildAddendumGridRows(
      [],
      [
        detail({ DetailId: 31, ChangeType: 'ADD', QuantityChange: 2 }),
        detail({ DetailId: 32, ChangeType: 'ADD', QuantityChange: 2 }),
      ]
    );
    expect(planAddendumQtyOps(rows, { 'a-31': 6, 'a-32': 0 })).toEqual([
      { op: 'update', detailId: 31, patch: { QuantityChange: 6 }, rowKey: 'a-31' },
      { op: 'delete', detailId: 32, rowKey: 'a-32' },
    ]);
  });
});

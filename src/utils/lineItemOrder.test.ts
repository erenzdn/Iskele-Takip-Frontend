import { describe, expect, it } from 'vitest';
import {
  copyQuoteLineDiscounts,
  extractContractDetails,
  extractQuoteDetails,
  lineIdentity,
  sortByQuoteLineOrder,
  sortByStoredLineOrder,
  withContractDetails,
} from './lineItemOrder';

describe('lineIdentity', () => {
  it('envanter satırını ItemId ile eşler', () => {
    expect(lineIdentity({ kind: 'inventory', ItemId: 12 })).toBe('i:12');
    expect(lineIdentity({ itemId: 12, IsManual: false })).toBe('i:12');
  });

  it('manuel satırı açıklama ile eşler', () => {
    expect(lineIdentity({ kind: 'manual', Description: ' Nakliye ' })).toBe('m:nakliye');
    expect(lineIdentity({ is_manual: true, description: 'Nakliye' })).toBe('m:nakliye');
  });
});

describe('sortByStoredLineOrder', () => {
  it('LineOrder varsa ona göre sıralar', () => {
    const rows = [
      { ItemId: 3, LineOrder: 3 },
      { ItemId: 1, LineOrder: 1 },
      { ItemId: 2, lineOrder: 2 },
    ];
    expect(sortByStoredLineOrder(rows).map((r) => r.ItemId)).toEqual([1, 2, 3]);
  });

  it('sıra alanı yoksa diziyi olduğu gibi bırakır', () => {
    const rows = [{ ItemId: 9 }, { ItemId: 8 }];
    expect(sortByStoredLineOrder(rows)).toBe(rows);
  });
});

describe('sortByQuoteLineOrder', () => {
  it('sözleşme kalemlerini teklif sırasına çeker', () => {
    const quoteLines = [
      { kind: 'inventory', ItemId: 30 },
      { kind: 'manual', Description: 'Nakliye' },
      { kind: 'inventory', ItemId: 10 },
    ];
    const contractLines = [
      { ItemId: 10 },
      { IsManual: true, Description: 'Nakliye' },
      { ItemId: 30 },
    ];
    expect(
      sortByQuoteLineOrder(contractLines, quoteLines).map((row) =>
        row.ItemId ?? row.Description
      )
    ).toEqual([30, 'Nakliye', 10]);
  });

  it('aynı ürünün depo kırılımlarını teklif konumunda tutar', () => {
    const quoteLines = [{ ItemId: 5 }, { ItemId: 8 }];
    const contractLines = [
      { ItemId: 8, WarehouseId: 1 },
      { ItemId: 5, WarehouseId: 1 },
      { ItemId: 5, WarehouseId: 2 },
    ];
    expect(sortByQuoteLineOrder(contractLines, quoteLines)).toEqual([
      { ItemId: 5, WarehouseId: 1 },
      { ItemId: 5, WarehouseId: 2 },
      { ItemId: 8, WarehouseId: 1 },
    ]);
  });

  it('teklifte olmayan zeyilname kalemlerini sonda bırakır', () => {
    const quoteLines = [{ ItemId: 1 }, { ItemId: 2 }];
    const contractLines = [
      { ItemId: 99, SourceAddendumId: 7 },
      { ItemId: 2 },
      { ItemId: 1 },
    ];
    expect(sortByQuoteLineOrder(contractLines, quoteLines).map((row) => row.ItemId)).toEqual([
      1, 2, 99,
    ]);
  });
});

describe('copyQuoteLineDiscounts', () => {
  it('sözleşme satırında Iskonto yoksa teklif satırındaki 4 haneli yüzdeyi kopyalar', () => {
    const quoteLines = [
      { ItemId: 12, Iskonto: 3.3333 },
      { IsManual: true, Description: 'Nakliye', Iskonto: 12.5 },
    ];
    const contractLines = [
      { ItemId: 12, WarehouseId: 1 },
      { ItemId: 12, WarehouseId: 2 },
      { IsManual: true, Description: 'Nakliye' },
    ];
    expect(copyQuoteLineDiscounts(contractLines, quoteLines)).toEqual([
      { ItemId: 12, WarehouseId: 1, Iskonto: 3.3333, iskonto: 3.3333 },
      { ItemId: 12, WarehouseId: 2, Iskonto: 3.3333, iskonto: 3.3333 },
      { IsManual: true, Description: 'Nakliye', Iskonto: 12.5, iskonto: 12.5 },
    ]);
  });

  it('API zaten satır Iskonto verdiyse üzerine yazmaz', () => {
    const quoteLines = [{ ItemId: 12, Iskonto: 20 }];
    const contractLines = [{ ItemId: 12, Iskonto: 3.3333 }];
    expect(copyQuoteLineDiscounts(contractLines, quoteLines)).toEqual(contractLines);
  });

  it('satır iskontosu yoksa başlık yuvarlamasına düşülmesin diye satırı olduğu gibi bırakır', () => {
    const quoteLines = [{ ItemId: 12 }];
    const contractLines = [{ ItemId: 12 }];
    expect(copyQuoteLineDiscounts(contractLines, quoteLines)).toBe(contractLines);
  });
});

describe('extract/with details', () => {
  it('quote ve contract detay alanlarını okur', () => {
    expect(extractQuoteDetails({ QuoteDetails: [{ ItemId: 1 }] })).toHaveLength(1);
    expect(extractContractDetails({ details: [{ ItemId: 2 }] })).toHaveLength(1);
  });

  it('sözleşmeye sıralı details yazar', () => {
    const next = withContractDetails({ ContractId: 4 }, [{ ItemId: 1 }, { ItemId: 2 }]);
    expect(next.details).toHaveLength(2);
    expect(next.ContractDetails).toHaveLength(2);
  });
});

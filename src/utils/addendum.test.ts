import { describe, expect, it } from 'vitest';
import type { Addendum, ContractLineItem } from '../models';
import {
  buildAddendumAddedLineSources,
  buildContractItemDisplayEntries,
  canReverseAddendum,
  getAddendumDisplayStatusLabel,
  getAddendumSourceForContractLine,
  groupAddendumLineItemsByAddendum,
  hasActiveReverseForSource,
} from './addendum';

function inventoryLine(
  partial: Partial<Extract<ContractLineItem, { kind: 'inventory' }>> & { DetailId: number }
): ContractLineItem {
  return {
    kind: 'inventory',
    ItemId: 1,
    WarehouseId: 1,
    RentedQuantity: 1,
    ReturnedQuantity: 0,
    UnitPriceSnapshot: 10,
    PriceUnit: 'DAY',
    PriceSource: 'INVENTORY',
    ItemName: 'Test',
    ...partial,
  };
}

function approvedAddWithLink(
  addendumId: number,
  addendumNo: number | null,
  contractDetailId: number | null
): Addendum {
  return {
    AddendumId: addendumId,
    ContractId: 100,
    AddendumNo: addendumNo,
    Status: 'approved',
    EffectiveDate: '2026-01-01',
    IsReversal: false,
    IsReversed: false,
    details: [
      {
        DetailId: 1,
        AddendumId: addendumId,
        ChangeType: 'ADD',
        ContractDetailId: contractDetailId,
      },
    ],
  };
}

describe('buildAddendumAddedLineSources', () => {
  it('yalnız onaylı ADD + dolu ContractDetailId eşler', () => {
    const map = buildAddendumAddedLineSources([
      approvedAddWithLink(5, 2, 50),
      {
        ...approvedAddWithLink(6, 3, 51),
        Status: 'pending',
      },
      {
        AddendumId: 7,
        ContractId: 100,
        AddendumNo: 4,
        Status: 'approved',
        EffectiveDate: '2026-01-02',
        IsReversal: false,
        IsReversed: false,
        details: [
          {
            DetailId: 2,
            AddendumId: 7,
            ChangeType: 'INCREASE',
            ContractDetailId: 10,
          },
        ],
      },
      approvedAddWithLink(8, 5, null),
    ]);

    expect(map.size).toBe(1);
    expect(map.get(50)).toEqual({ addendumId: 5, addendumNo: 2 });
  });
});

describe('getAddendumSourceForContractLine', () => {
  it('SourceAddendumId yolunu öncelikli kullanır (P1)', () => {
    const item = inventoryLine({
      DetailId: 50,
      SourceAddendumId: 9,
      SourceAddendumNo: 3,
    });
    const sources = new Map([[50, { addendumId: 5, addendumNo: 2 }]]);

    expect(getAddendumSourceForContractLine(item, sources)).toEqual({
      addendumId: 9,
      addendumNo: 3,
    });
  });

  it('Source yoksa onaylı ADD ContractDetailId map yolunu kullanır (P0)', () => {
    const item = inventoryLine({ DetailId: 50 });
    const sources = new Map([[50, { addendumId: 5, addendumNo: 2 }]]);

    expect(getAddendumSourceForContractLine(item, sources)).toEqual({
      addendumId: 5,
      addendumNo: 2,
    });
  });

  it('eşleşme yoksa null döner', () => {
    const item = inventoryLine({ DetailId: 99 });
    expect(getAddendumSourceForContractLine(item, new Map())).toBeNull();
  });
});

describe('buildContractItemDisplayEntries', () => {
  it('ADD kaynaklı satırları ayırıcı altında gruplar', () => {
    const base = inventoryLine({ DetailId: 1, ItemName: 'Ana' });
    const added = inventoryLine({
      DetailId: 50,
      ItemName: 'Zeyil',
      SourceAddendumId: 5,
      SourceAddendumNo: 2,
    });

    const entries = buildContractItemDisplayEntries([base, added], new Map(), true);

    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ kind: 'row', isAddendumRow: false });
    expect(entries[1]).toEqual({ kind: 'separator' });
    expect(entries[2]).toMatchObject({
      kind: 'row',
      isAddendumRow: true,
      addendumNo: 2,
    });
  });

  it('Source yok ve map boşsa ayırıcı eklemez', () => {
    const line = inventoryLine({ DetailId: 10, RentedQuantity: 15 });
    const entries = buildContractItemDisplayEntries([line], new Map(), true);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'row', isAddendumRow: false });
  });

  it('split kapalıysa tek listede kalır ama Z rozeti için işaretler', () => {
    const base = inventoryLine({ DetailId: 1, ItemName: 'Ana' });
    const added = inventoryLine({
      DetailId: 50,
      SourceAddendumId: 5,
      SourceAddendumNo: 2,
    });
    const entries = buildContractItemDisplayEntries([base, added], new Map(), false);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ kind: 'row', isAddendumRow: false, addendumNo: null });
    expect(entries[1]).toMatchObject({ kind: 'row', isAddendumRow: true, addendumNo: 2 });
  });
});

describe('groupAddendumLineItemsByAddendum', () => {
  it('zeyilname no’ya göre gruplar', () => {
    const a = inventoryLine({ DetailId: 50, SourceAddendumId: 5, SourceAddendumNo: 2, ItemName: 'A' });
    const b = inventoryLine({ DetailId: 51, SourceAddendumId: 8, SourceAddendumNo: 3, ItemName: 'B' });
    const c = inventoryLine({ DetailId: 52, SourceAddendumId: 5, SourceAddendumNo: 2, ItemName: 'C' });
    const base = inventoryLine({ DetailId: 1, ItemName: 'Ana' });
    const groups = groupAddendumLineItemsByAddendum([base, a, b, c], new Map());
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ addendumId: 5, addendumNo: 2 });
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1]).toMatchObject({ addendumId: 8, addendumNo: 3 });
  });
});

describe('canReverseAddendum / hasActiveReverseForSource', () => {
  const approved: Addendum = {
    AddendumId: 5,
    ContractId: 1,
    AddendumNo: 2,
    Status: 'approved',
    EffectiveDate: '2026-01-01',
    IsReversal: false,
    IsReversed: false,
  };

  it('onaylı ve tersine çevrilmemişken true döner', () => {
    expect(
      canReverseAddendum({
        addendum: approved,
        contractActive: true,
        canUpdate: true,
        siblingAddenda: [],
      })
    ).toBe(true);
  });

  it('IsReversed true iken false döner', () => {
    expect(
      canReverseAddendum({
        addendum: { ...approved, IsReversed: true },
        contractActive: true,
        canUpdate: true,
      })
    ).toBe(false);
  });

  it('aktif ters kayıt varken false döner', () => {
    const siblings: Addendum[] = [
      {
        AddendumId: 9,
        ContractId: 1,
        Status: 'draft',
        EffectiveDate: '2026-02-01',
        IsReversal: true,
        IsReversed: false,
        ReversesAddendumId: 5,
      },
    ];
    expect(hasActiveReverseForSource(siblings, 5)).toBe(true);
    expect(
      canReverseAddendum({
        addendum: approved,
        contractActive: true,
        canUpdate: true,
        siblingAddenda: siblings,
      })
    ).toBe(false);
  });

  it('reddedilmiş ters kayıt aktif sayılmaz', () => {
    const siblings: Addendum[] = [
      {
        AddendumId: 9,
        ContractId: 1,
        Status: 'rejected',
        EffectiveDate: '2026-02-01',
        IsReversal: true,
        IsReversed: false,
        ReversesAddendumId: 5,
      },
    ];
    expect(hasActiveReverseForSource(siblings, 5)).toBe(false);
  });

  it('display status IsReversed için özel etiket verir', () => {
    expect(getAddendumDisplayStatusLabel({ Status: 'approved', IsReversed: true })).toBe(
      'Onaylandı (tersine çevrildi)'
    );
    expect(getAddendumDisplayStatusLabel({ Status: 'approved', IsReversed: false })).toBe(
      'Onaylandı'
    );
  });
});

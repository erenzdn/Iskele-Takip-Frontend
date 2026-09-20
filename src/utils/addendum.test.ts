import { describe, expect, it } from 'vitest';
import type { Addendum, ContractLineItem } from '../models';
import {
  applyContractLocalAddendumNumbers,
  applyWarehouseIdToLines,
  buildAddendumAddedLineSources,
  buildAddendumExtrasDisplayGroups,
  buildContractAddendumDisplayNoMap,
  buildContractItemDisplayEntries,
  buildLineAddendumHistory,
  canReverseAddendum,
  getAddendumDisplayStatusLabel,
  getAddendumSourceForContractLine,
  getLineAddendumBadgeLabel,
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

describe('buildLineAddendumHistory', () => {
  it('aynı DetailId için INCREASE/DECREASE olaylarını toplar', () => {
    const addenda: Addendum[] = [
      {
        AddendumId: 10,
        ContractId: 100,
        AddendumNo: 2,
        Status: 'approved',
        EffectiveDate: '2026-02-01',
        IsReversal: false,
        IsReversed: false,
        details: [
          {
            DetailId: 100,
            AddendumId: 10,
            ChangeType: 'INCREASE',
            ContractDetailId: 50,
            QuantityChange: 5,
          },
        ],
      },
      {
        AddendumId: 11,
        ContractId: 100,
        AddendumNo: 3,
        Status: 'approved',
        EffectiveDate: '2026-03-01',
        IsReversal: false,
        IsReversed: false,
        details: [
          {
            DetailId: 101,
            AddendumId: 11,
            ChangeType: 'DECREASE',
            ContractDetailId: 50,
            QuantityChange: -2,
          },
        ],
      },
    ];

    const map = buildLineAddendumHistory(addenda);
    const events = map.get(50);
    expect(events).toHaveLength(2);
    expect(events![0]).toMatchObject({
      addendumId: 10,
      addendumNo: 2,
      changeType: 'INCREASE',
      quantityDelta: 5,
    });
    expect(events![1]).toMatchObject({
      addendumId: 11,
      changeType: 'DECREASE',
      quantityDelta: -2,
    });
  });

  it('PRICE_CHANGE olayını miktar null ile ekler', () => {
    const map = buildLineAddendumHistory([
      {
        AddendumId: 12,
        ContractId: 100,
        AddendumNo: 4,
        Status: 'approved',
        EffectiveDate: '2026-04-01',
        IsReversal: false,
        IsReversed: false,
        details: [
          {
            DetailId: 200,
            AddendumId: 12,
            ChangeType: 'PRICE_CHANGE',
            ContractDetailId: 50,
            NewUnitPrice: 99,
          },
        ],
      },
    ]);
    expect(map.get(50)).toEqual([
      expect.objectContaining({
        changeType: 'PRICE_CHANGE',
        quantityDelta: null,
        newUnitPrice: 99,
      }),
    ]);
  });

  it('draft / pending zeyilnameleri hariç tutar', () => {
    const map = buildLineAddendumHistory([
      {
        AddendumId: 13,
        ContractId: 100,
        AddendumNo: 5,
        Status: 'draft',
        EffectiveDate: '2026-05-01',
        IsReversal: false,
        IsReversed: false,
        details: [
          {
            DetailId: 300,
            AddendumId: 13,
            ChangeType: 'INCREASE',
            ContractDetailId: 50,
            QuantityChange: 9,
          },
        ],
      },
      {
        AddendumId: 14,
        ContractId: 100,
        AddendumNo: 6,
        Status: 'pending',
        EffectiveDate: '2026-05-02',
        IsReversal: false,
        IsReversed: false,
        details: [
          {
            DetailId: 301,
            AddendumId: 14,
            ChangeType: 'INCREASE',
            ContractDetailId: 50,
            QuantityChange: 1,
          },
        ],
      },
    ]);
    expect(map.size).toBe(0);
  });

  it('ters zeyilname etiketlerini işaretler', () => {
    const map = buildLineAddendumHistory([
      {
        AddendumId: 15,
        ContractId: 100,
        AddendumNo: 7,
        Status: 'approved',
        EffectiveDate: '2026-06-01',
        IsReversal: false,
        IsReversed: true,
        details: [
          {
            DetailId: 400,
            AddendumId: 15,
            ChangeType: 'INCREASE',
            ContractDetailId: 50,
            QuantityChange: 5,
          },
        ],
      },
      {
        AddendumId: 16,
        ContractId: 100,
        AddendumNo: 8,
        Status: 'approved',
        EffectiveDate: '2026-06-02',
        IsReversal: true,
        IsReversed: false,
        details: [
          {
            DetailId: 401,
            AddendumId: 16,
            ChangeType: 'DECREASE',
            ContractDetailId: 50,
            QuantityChange: -5,
          },
        ],
      },
    ]);
    const events = map.get(50)!;
    expect(events[0]).toMatchObject({ isFromReversedAddendum: true, isReversal: false });
    expect(events[1]).toMatchObject({ isReversal: true, isFromReversedAddendum: false });
  });

  it('EffectiveDate sonra AddendumNo ile sıralar', () => {
    const map = buildLineAddendumHistory([
      {
        AddendumId: 21,
        ContractId: 100,
        AddendumNo: 3,
        Status: 'approved',
        EffectiveDate: '2026-01-10',
        IsReversal: false,
        IsReversed: false,
        details: [
          {
            DetailId: 1,
            AddendumId: 21,
            ChangeType: 'INCREASE',
            ContractDetailId: 7,
            QuantityChange: 1,
          },
        ],
      },
      {
        AddendumId: 20,
        ContractId: 100,
        AddendumNo: 2,
        Status: 'approved',
        EffectiveDate: '2026-01-05',
        IsReversal: false,
        IsReversed: false,
        details: [
          {
            DetailId: 2,
            AddendumId: 20,
            ChangeType: 'ADD',
            ContractDetailId: 7,
            QuantityChange: 10,
          },
        ],
      },
    ]);
    const events = map.get(7)!;
    expect(events.map((e) => e.addendumId)).toEqual([20, 21]);
  });
});

describe('getLineAddendumBadgeLabel', () => {
  it('tek zeyilname no için Z{n} döner', () => {
    expect(
      getLineAddendumBadgeLabel([
        {
          addendumId: 1,
          addendumNo: 2,
          effectiveDate: '2026-01-01',
          changeType: 'INCREASE',
          quantityDelta: 5,
          newUnitPrice: null,
          isReversal: false,
          isFromReversedAddendum: false,
          addendumDetailId: 1,
        },
      ])
    ).toBe('Z2');
  });

  it('birden fazla farklı no için Z döner', () => {
    expect(
      getLineAddendumBadgeLabel([
        {
          addendumId: 1,
          addendumNo: 2,
          effectiveDate: '2026-01-01',
          changeType: 'INCREASE',
          quantityDelta: 5,
          newUnitPrice: null,
          isReversal: false,
          isFromReversedAddendum: false,
          addendumDetailId: 1,
        },
        {
          addendumId: 2,
          addendumNo: 3,
          effectiveDate: '2026-02-01',
          changeType: 'DECREASE',
          quantityDelta: -1,
          newUnitPrice: null,
          isReversal: false,
          isFromReversedAddendum: false,
          addendumDetailId: 2,
        },
      ])
    ).toBe('Z');
  });

  it('boş olayda null döner', () => {
    expect(getLineAddendumBadgeLabel(undefined)).toBeNull();
    expect(getLineAddendumBadgeLabel([])).toBeNull();
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

describe('buildAddendumExtrasDisplayGroups', () => {
  it('onaylı ters zeyilname detaylarını ekler', () => {
    const line = inventoryLine({
      DetailId: 50,
      SourceAddendumId: 5,
      SourceAddendumNo: 2,
      ItemName: 'Eklenen',
      ItemCode: 'A1',
      RentedQuantity: 10,
    });
    const addenda: Addendum[] = [
      {
        AddendumId: 5,
        ContractId: 100,
        AddendumNo: 2,
        Status: 'approved',
        EffectiveDate: '2026-01-01',
        IsReversal: false,
        IsReversed: true,
        details: [
          {
            DetailId: 1,
            AddendumId: 5,
            ChangeType: 'ADD',
            ContractDetailId: 50,
            QuantityChange: 10,
          },
        ],
      },
      {
        AddendumId: 9,
        ContractId: 100,
        AddendumNo: 3,
        Status: 'approved',
        EffectiveDate: '2026-02-01',
        IsReversal: true,
        IsReversed: false,
        ReversesAddendumId: 5,
        ReversesAddendumNumber: 2,
        details: [
          {
            DetailId: 10,
            AddendumId: 9,
            ChangeType: 'DECREASE',
            ContractDetailId: 50,
            QuantityChange: -10,
            ItemName: 'Eklenen',
            ItemCode: 'A1',
          },
        ],
      },
    ];
    const sources = new Map([[50, { addendumId: 5, addendumNo: 2 }]]);
    const groups = buildAddendumExtrasDisplayGroups({
      addenda,
      contractItems: [line],
      sources,
      formatNet: () => '100',
    });
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      addendumId: 5,
      isReversal: false,
      isReversed: true,
    });
    expect(groups[1]).toMatchObject({
      addendumId: 9,
      isReversal: true,
      reversesAddendumNo: 2,
    });
    expect(groups[1].rows[0]).toMatchObject({
      quantityDisplay: '-10',
      changeTypeLabel: 'Miktar Azalt',
      code: 'A1',
    });
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

describe('buildContractAddendumDisplayNoMap / applyContractLocalAddendumNumbers', () => {
  it('sözleşme içinde oluşum sırasına göre 1’den numaralandırır', () => {
    const map = buildContractAddendumDisplayNoMap([
      { AddendumId: 40 },
      { AddendumId: 12 },
      { AddendumId: 40 },
      { AddendumId: 25 },
    ]);
    expect([...map.entries()]).toEqual([
      [12, 1],
      [25, 2],
      [40, 3],
    ]);
  });

  it('global AddendumId yerine sözleşme içi no yazar', () => {
    const [first, second] = applyContractLocalAddendumNumbers([
      {
        AddendumId: 40,
        ContractId: 1,
        AddendumNo: 40,
        Status: 'draft',
        EffectiveDate: '2026-01-02',
        IsReversal: false,
        IsReversed: false,
      },
      {
        AddendumId: 15,
        ContractId: 1,
        AddendumNo: 15,
        Status: 'approved',
        EffectiveDate: '2026-01-01',
        IsReversal: true,
        IsReversed: false,
        ReversesAddendumId: 40,
        ReversesAddendumNumber: 40,
      },
    ]);

    expect(first.AddendumNo).toBe(2);
    expect(second.AddendumNo).toBe(1);
    expect(second.ReversesAddendumNumber).toBe(2);
  });
});

describe('getAddendumSourceForContractLine display no map', () => {
  it('sözleşme içi map varsa SourceAddendumNo yerine onu kullanır', () => {
    const item = inventoryLine({
      DetailId: 50,
      SourceAddendumId: 40,
      SourceAddendumNo: 40,
    });
    const displayNoById = new Map([[40, 1]]);
    expect(getAddendumSourceForContractLine(item, new Map(), displayNoById)).toEqual({
      addendumId: 40,
      addendumNo: 1,
    });
  });
});

describe('applyWarehouseIdToLines', () => {
  it('boş listede değişiklik yapmaz', () => {
    const lines: Array<{ warehouseId: number | '' }> = [];
    expect(applyWarehouseIdToLines(lines, 3)).toBe(lines);
  });

  it('varsayılan depo seçilince tüm satır depolarını günceller', () => {
    const lines = [
      { key: 'a', warehouseId: '' as const },
      { key: 'b', warehouseId: 1 },
    ];
    expect(applyWarehouseIdToLines(lines, 7)).toEqual([
      { key: 'a', warehouseId: 7 },
      { key: 'b', warehouseId: 7 },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  getLineShipmentProgress,
  getMaxReturnableQuantity,
  getShipmentLineAllowance,
  getRentalStartIso,
  getShipmentState,
  isShipmentContract,
  shipmentDateInputToIso,
  shipmentQtyByDetail,
  validateShipmentDraft,
} from './shipment';

const shipmentContract = { Type: 'RENTAL' as const, DeliveryMode: 'SHIPMENT' as const };
const immediateContract = { Type: 'RENTAL' as const, DeliveryMode: 'IMMEDIATE' as const };

describe('isShipmentContract', () => {
  it('yalnızca kiralama + SHIPMENT', () => {
    expect(isShipmentContract(shipmentContract)).toBe(true);
    expect(isShipmentContract(immediateContract)).toBe(false);
    expect(isShipmentContract({ Type: 'SALE', DeliveryMode: 'SHIPMENT' })).toBe(false);
    expect(isShipmentContract({ Type: 'RENTAL' })).toBe(false);
    expect(isShipmentContract(null)).toBe(false);
  });
});

describe('getShipmentState', () => {
  it('sevk yoksa bekliyor, kısmi sevkte kısmi, tamamında tamamlandı', () => {
    expect(getShipmentState({ ...shipmentContract, PendingShipmentQuantity: 100, ShippedQuantityTotal: 0 })).toBe('awaiting');
    expect(
      getShipmentState({ ...shipmentContract, PendingShipmentQuantity: 40, ShippedQuantityTotal: 60, FirstShipmentDate: '2026-03-01' })
    ).toBe('partial');
    expect(
      getShipmentState({ ...shipmentContract, PendingShipmentQuantity: 0, ShippedQuantityTotal: 100, FirstShipmentDate: '2026-03-01' })
    ).toBe('shipped');
    expect(getShipmentState({ ...immediateContract, PendingShipmentQuantity: 0 })).toBe('not_applicable');
  });
});

describe('getRentalStartIso', () => {
  it('SHIPMENT: ilk sevk; sevk yoksa null. IMMEDIATE: StartDate', () => {
    expect(getRentalStartIso({ ...shipmentContract, StartDate: '2026-02-20', FirstShipmentDate: '2026-03-01' })).toBe('2026-03-01');
    expect(getRentalStartIso({ ...shipmentContract, StartDate: '2026-02-20', FirstShipmentDate: null })).toBeNull();
    expect(getRentalStartIso({ ...immediateContract, StartDate: '2026-02-20', FirstShipmentDate: '2026-03-01' })).toBe('2026-02-20');
  });
});

describe('getLineShipmentProgress', () => {
  const line = { RentedQuantity: 100, ShippedQuantity: 60, ReturnedQuantity: 10 };

  it('SHIPMENT: sahada = sevk − iade, bekleyen = sözleşme − sevk', () => {
    expect(getLineShipmentProgress(line, shipmentContract)).toEqual({
      contracted: 100,
      shipped: 60,
      returned: 10,
      onSite: 50,
      pending: 40,
    });
    expect(getMaxReturnableQuantity(line, shipmentContract)).toBe(50);
  });

  it('IMMEDIATE: sevk = sözleşme miktarı (eski davranış)', () => {
    expect(getLineShipmentProgress(line, immediateContract)).toMatchObject({ shipped: 100, onSite: 90, pending: 0 });
    expect(getMaxReturnableQuantity(line, immediateContract)).toBe(90);
  });
});

describe('shipmentDateInputToIso', () => {
  it('bugün seçilirse şu anki an, geçmiş gün seçilirse o günün yerel öğlesi', () => {
    const now = new Date(2026, 10, 9, 15, 30);
    expect(shipmentDateInputToIso('2026-11-09', now)).toBe(now.toISOString());
    expect(shipmentDateInputToIso('2026-11-02', now)).toBe(new Date(2026, 10, 2, 12, 0, 0).toISOString());
  });
});

describe('validateShipmentDraft', () => {
  const base = [
    { DetailId: 1, ItemName: 'Dikme', remaining: 40, quantityInput: '40' },
    { DetailId: 2, ItemName: 'Kiriş', remaining: 10, quantityInput: '' },
    { DetailId: 3, ItemName: 'Plak', remaining: 5, quantityInput: '0' },
  ];

  it('boş ve 0 satırları atar, diğerlerini döner (parçalı sevk)', () => {
    expect(validateShipmentDraft(base)).toEqual({ ok: true, items: [{ DetailId: 1, Quantity: 40 }] });
  });

  it('kalanı aşan miktarı reddeder', () => {
    const res = validateShipmentDraft([{ ...base[0], quantityInput: '41' }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/en fazla 40/);
  });

  it('ondalıklı/negatif miktarı reddeder', () => {
    expect(validateShipmentDraft([{ ...base[0], quantityInput: '2.5' }]).ok).toBe(false);
    expect(validateShipmentDraft([{ ...base[0], quantityInput: '-1' }]).ok).toBe(false);
  });

  it('hiç miktar yoksa hata', () => {
    const res = validateShipmentDraft(base.map((l) => ({ ...l, quantityInput: '' })));
    expect(res.ok).toBe(false);
  });
});

describe('shipmentQtyByDetail', () => {
  it('aynı satırın kalemlerini toplar', () => {
    const map = shipmentQtyByDetail([
      { DetailId: 1, Quantity: 10 },
      { DetailId: 2, Quantity: 5 },
      { DetailId: 1, Quantity: 3 },
    ]);
    expect(map.get(1)).toBe(13);
    expect(map.get(2)).toBe(5);
    expect(shipmentQtyByDetail(undefined).size).toBe(0);
  });
});

describe('getShipmentLineAllowance', () => {
  const detail = { RentedQuantity: 100, ShippedQuantity: 70, ReturnedQuantity: 0 };

  it('yeni fişte en fazla = kalan', () => {
    expect(getShipmentLineAllowance(detail, shipmentContract)).toEqual({
      contracted: 100,
      otherShipped: 70,
      inThisShipment: 0,
      max: 30,
    });
  });

  it('düzenlemede fişin kendi miktarı serbest kalır', () => {
    expect(getShipmentLineAllowance(detail, shipmentContract, 40)).toEqual({
      contracted: 100,
      otherShipped: 30,
      inThisShipment: 40,
      max: 70,
    });
  });

  it('tamamı bu fişte sevk edildiyse en fazla = sözleşme', () => {
    expect(getShipmentLineAllowance({ ...detail, ShippedQuantity: 100 }, shipmentContract, 100).max).toBe(100);
  });
});

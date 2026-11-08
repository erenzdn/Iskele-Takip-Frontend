import { describe, expect, it } from 'vitest';
import {
  getLineShipmentProgress,
  getMaxReturnableQuantity,
  getRentalStartIso,
  getShipmentState,
  isShipmentContract,
  shipmentDateInputToIso,
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

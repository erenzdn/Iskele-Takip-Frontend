import { describe, expect, it } from 'vitest';
import {
  dateTimeLocalToIso,
  getPendingDeliveryDays,
  getShipmentDeliveryState,
  toDateTimeLocalValue,
  validateDeliveryDraft,
} from './shipment';

const NOW = new Date('2026-11-09T12:00:00.000Z'); // İstanbul 15:00
const SHIPPED = '2026-11-09T06:00:00.000Z'; // İstanbul 09:00

describe('getShipmentDeliveryState', () => {
  it('iptal > teslim > bekliyor önceliğiyle türetir', () => {
    expect(getShipmentDeliveryState({ Status: 'CANCELLED', DeliveredAt: '2026-11-09T10:00:00Z' })).toBe('cancelled');
    expect(getShipmentDeliveryState({ Status: 'ACTIVE', DeliveredAt: '2026-11-09T10:00:00Z' })).toBe('delivered');
    expect(getShipmentDeliveryState({ Status: 'ACTIVE', DeliveredAt: null })).toBe('pending');
  });
});

describe('getPendingDeliveryDays', () => {
  it('sevkten bu yana geçen İstanbul takvim gününü sayar', () => {
    expect(getPendingDeliveryDays({ Status: 'ACTIVE', DeliveredAt: null, ShipmentDate: SHIPPED }, NOW)).toBe(0);
    expect(
      getPendingDeliveryDays({ Status: 'ACTIVE', DeliveredAt: null, ShipmentDate: '2026-11-06T06:00:00.000Z' }, NOW)
    ).toBe(3);
  });

  it('teslim edilmiş veya iptal fişte null', () => {
    expect(getPendingDeliveryDays({ Status: 'ACTIVE', DeliveredAt: NOW.toISOString(), ShipmentDate: SHIPPED }, NOW)).toBeNull();
    expect(getPendingDeliveryDays({ Status: 'CANCELLED', DeliveredAt: null, ShipmentDate: SHIPPED }, NOW)).toBeNull();
  });
});

describe('datetime-local dönüşümü', () => {
  it('gidiş-dönüş dakika hassasiyetinde korunur', () => {
    const local = toDateTimeLocalValue('2026-11-09T11:37:45.000Z');
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(dateTimeLocalToIso(local)).toBe('2026-11-09T11:37:00.000Z');
  });

  it('boş veya geçersiz değerde null', () => {
    expect(dateTimeLocalToIso('')).toBeNull();
    expect(dateTimeLocalToIso('abc')).toBeNull();
  });
});

describe('validateDeliveryDraft', () => {
  const at = (iso: string) => toDateTimeLocalValue(iso);

  it('geçerli taslakta ISO tarihi döner', () => {
    const r = validateDeliveryDraft({ deliveredAt: at('2026-11-09T11:00:00.000Z'), receiverName: 'Ali Usta' }, SHIPPED, NOW);
    expect(r).toEqual({ ok: true, deliveredAtIso: '2026-11-09T11:00:00.000Z' });
  });

  it('teslim alan adı zorunlu', () => {
    const r = validateDeliveryDraft({ deliveredAt: at(NOW.toISOString()), receiverName: ' ' }, SHIPPED, NOW);
    expect(r.ok).toBe(false);
  });

  it('ileri tarihi reddeder', () => {
    const r = validateDeliveryDraft({ deliveredAt: at('2026-11-10T12:00:00.000Z'), receiverName: 'Ali' }, SHIPPED, NOW);
    expect(r).toEqual({ ok: false, message: 'Teslim tarihi ileri bir tarih olamaz.' });
  });

  it('sevk gününden önceki tarihi reddeder', () => {
    const r = validateDeliveryDraft({ deliveredAt: at('2026-11-08T12:00:00.000Z'), receiverName: 'Ali' }, SHIPPED, NOW);
    expect(r).toEqual({ ok: false, message: 'Teslim tarihi sevk tarihinden önce olamaz.' });
  });
});

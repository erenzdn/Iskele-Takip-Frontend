import { describe, expect, it } from 'vitest';
import { buildReturnSlipItems, emptyQuantities, lineTotal, previewCharge, type ReturnSlipDraftLine } from './returnSlip';

function line(overrides: Partial<ReturnSlipDraftLine> = {}): ReturnSlipDraftLine {
  return { DetailId: 10, ItemName: 'Boru 3m', OnSite: 100, quantities: emptyQuantities(), overrides: {}, ...overrides };
}

describe('returnSlip yardımcıları', () => {
  it('bir kalemi duruma göre bölünmüş API kalemlerine çevirir', () => {
    const r = buildReturnSlipItems([
      line({ quantities: { SOUND: '90', DAMAGED: '6', LOST: '4', SOLD: '' }, overrides: { LOST: '300' } }),
    ]);
    expect(r).toEqual({
      ok: true,
      hasSound: true,
      items: [
        { DetailId: 10, Quantity: 90, Condition: 'SOUND', ChargeOverride: null },
        { DetailId: 10, Quantity: 6, Condition: 'DAMAGED', ChargeOverride: null },
        { DetailId: 10, Quantity: 4, Condition: 'LOST', ChargeOverride: 300 },
      ],
    });
  });

  it('boş ve sıfır adetleri atlar; hiç adet yoksa hata verir', () => {
    expect(buildReturnSlipItems([line({ quantities: { SOUND: '0', DAMAGED: '', LOST: '', SOLD: '' } })])).toEqual({
      ok: false,
      message: 'En az bir kalem için adet girin.',
    });
  });

  it('sahadakinden fazla toplamı reddeder', () => {
    const r = buildReturnSlipItems([line({ OnSite: 10, quantities: { SOUND: '8', DAMAGED: '3', LOST: '', SOLD: '' } })]);
    expect(r).toEqual({ ok: false, message: 'Boru 3m: sahada 10 adet var, fişte 11 girildi.' });
  });

  it('geçersiz elle bedeli reddeder, virgüllü ondalığı kabul eder', () => {
    expect(buildReturnSlipItems([line({ quantities: { ...emptyQuantities(), DAMAGED: '1' }, overrides: { DAMAGED: 'abc' } })]).ok).toBe(false);
    const r = buildReturnSlipItems([line({ quantities: { ...emptyQuantities(), DAMAGED: '1' }, overrides: { DAMAGED: '12,5' } })]);
    expect(r.ok && r.items[0].ChargeOverride).toBe(12.5);
    expect(r.ok && r.hasSound).toBe(false);
  });

  it('lineTotal ve previewCharge', () => {
    expect(lineTotal(line({ quantities: { SOUND: '5', DAMAGED: '2', LOST: '', SOLD: '1' } }))).toBe(8);
    expect(previewCharge(3, 100)).toBe(300);
    expect(previewCharge(3, 100, '250')).toBe(250);
    expect(previewCharge(3, null)).toBeNull();
  });
});

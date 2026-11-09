import type { CreateReturnSlipRequest, ReturnCondition } from '../models';

/**
 * İade fişi yardımcıları — backend repositories/returnSlips.js ile aynı kurallar.
 * Hasarlı/kayıp malzeme tamir edilmez; müşteriye envanter birim fiyatından satılır.
 */

export const RETURN_CONDITIONS: ReturnCondition[] = ['SOUND', 'DAMAGED', 'LOST', 'SOLD'];

export const RETURN_CONDITION_LABELS: Record<ReturnCondition, string> = {
  SOUND: 'Sağlam',
  DAMAGED: 'Hasarlı',
  LOST: 'Kayıp',
  SOLD: 'Satın aldı',
};

export const RETURN_CONDITION_HINTS: Record<ReturnCondition, string> = {
  SOUND: 'Depoya döner, kira iade tarihinde durur',
  DAMAGED: 'Müşteriye satılır (envanter fiyatı), stoka girmez',
  LOST: 'Müşteriye satılır (envanter fiyatı), stoka girmez',
  SOLD: 'Müşteri sağlam malı satın aldı, stoka girmez',
};

/** Fiş satırı taslağı: bir sözleşme kalemi ve durum başına adet / elle bedel */
export interface ReturnSlipDraftLine {
  DetailId: number;
  ItemName: string;
  OnSite: number;
  quantities: Record<ReturnCondition, string>;
  /** Durum başına elle girilen bedel (boş = envanter fiyatı × adet) */
  overrides: Partial<Record<Exclude<ReturnCondition, 'SOUND'>, string>>;
}

export function emptyQuantities(): Record<ReturnCondition, string> {
  return { SOUND: '', DAMAGED: '', LOST: '', SOLD: '' };
}

const toInt = (v: string) => {
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
};

export function lineTotal(line: ReturnSlipDraftLine): number {
  return RETURN_CONDITIONS.reduce((sum, c) => {
    const n = toInt(line.quantities[c] || '0');
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/** Varsayılan bedel önizlemesi (sunucu aynı formülle hesaplar) */
export function previewCharge(quantity: number, unitPrice: number | null | undefined, override?: string): number | null {
  if (override != null && override.trim() !== '') {
    const n = Number(override.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  if (unitPrice == null || !(unitPrice > 0)) return null;
  return quantity * unitPrice;
}

export type ReturnSlipDraftValidation =
  | { ok: true; items: CreateReturnSlipRequest['items']; hasSound: boolean }
  | { ok: false; message: string };

/** Taslağı API kalemlerine çevirir ve istemci tarafında doğrular. */
export function buildReturnSlipItems(lines: ReturnSlipDraftLine[]): ReturnSlipDraftValidation {
  const items: CreateReturnSlipRequest['items'] = [];
  for (const line of lines) {
    for (const condition of RETURN_CONDITIONS) {
      const raw = line.quantities[condition]?.trim() ?? '';
      if (raw === '' || raw === '0') continue;
      const qty = toInt(raw);
      if (!Number.isInteger(qty) || qty < 0) {
        return { ok: false, message: `${line.ItemName}: ${RETURN_CONDITION_LABELS[condition]} adedi geçerli bir tam sayı olmalı.` };
      }
      let chargeOverride: number | null = null;
      if (condition !== 'SOUND') {
        const ov = line.overrides[condition]?.trim();
        if (ov) {
          const n = Number(ov.replace(',', '.'));
          if (!Number.isFinite(n) || n < 0) {
            return { ok: false, message: `${line.ItemName}: ${RETURN_CONDITION_LABELS[condition]} bedeli geçersiz.` };
          }
          chargeOverride = n;
        }
      }
      items.push({ DetailId: line.DetailId, Quantity: qty, Condition: condition, ChargeOverride: chargeOverride });
    }
    const total = lineTotal(line);
    if (total > line.OnSite) {
      return { ok: false, message: `${line.ItemName}: sahada ${line.OnSite} adet var, fişte ${total} girildi.` };
    }
  }
  if (items.length === 0) return { ok: false, message: 'En az bir kalem için adet girin.' };
  return { ok: true, items, hasSound: items.some((i) => i.Condition === 'SOUND') };
}

import { describe, expect, it } from 'vitest';
import { hasMeaningfulQuoteDraftContent, isQuoteDraftStatus, quoteContractsPath } from './quoteDraft';

describe('quoteDraft', () => {
  it('draft statusünü tanır', () => {
    expect(isQuoteDraftStatus('draft')).toBe(true);
    expect(isQuoteDraftStatus('pending')).toBe(false);
  });

  it('boş formu taslak saymaz', () => {
    expect(hasMeaningfulQuoteDraftContent({})).toBe(false);
    expect(hasMeaningfulQuoteDraftContent({ customerId: '', itemCount: 0, subject: '  ' })).toBe(false);
  });

  it('müşteri, kalem veya notu anlamlı içerik sayar', () => {
    expect(hasMeaningfulQuoteDraftContent({ customerId: 3 })).toBe(true);
    expect(hasMeaningfulQuoteDraftContent({ itemCount: 1 })).toBe(true);
    expect(hasMeaningfulQuoteDraftContent({ notes: 'eksik ürün' })).toBe(true);
  });

  it('teklif tipine göre dönüş yolunu üretir', () => {
    expect(quoteContractsPath('SALE')).toBe('/contracts/sale');
    expect(quoteContractsPath('RENTAL')).toBe('/contracts/rental');
  });
});

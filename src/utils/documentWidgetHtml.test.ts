import { describe, expect, it } from 'vitest';
import { createMaterialTableHTML, renderDocumentWidgetHtml } from './documentWidgetHtml';

describe('documentWidgetHtml', () => {
  it('teklif malzeme tablosu beş sütun ve malzeme-tablosu sınıfı üretir', () => {
    const html = renderDocumentWidgetHtml('malzemeTablosu', {
      currency: 'TRY',
      currencySymbol: 'TL',
      quote: { Type: 'RENTAL', Currency: 'TRY', Iskonto: 10 },
      details: [
        { ItemName: 'A', Quantity: 1, UnitPriceSnapshot: 10, LineTotal: 10, UnitName: 'adet' },
        { ItemName: 'B', Quantity: 2, UnitPriceSnapshot: 20, LineTotal: 40, UnitName: 'm²' },
        { ItemName: 'C', Quantity: 3, UnitPriceSnapshot: 30, LineTotal: 90, RentalUnit: 'kg' },
      ],
    });

    expect(html).toContain('malzeme-tablosu');
    expect(html).toContain('Birim');
    expect(html).toContain('Günlük Fiyat');
    expect(html).toContain('Toplam:');
    expect(html).toContain('A');
  });

  it('sözleşme iade tablosu gecikme tablosundan farklı 8 kolon üretir', () => {
    const html = renderDocumentWidgetHtml('iadeTablosu', {
      currency: 'TRY',
      currencySymbol: 'TL',
      contract: {
        Type: 'RENTAL',
        StartDate: '2026-01-01T00:00:00.000Z',
        PlannedEndDate: '2026-02-15T00:00:00.000Z',
        Iskonto: 10,
        Currency: 'TRY',
      },
      returns: [
        {
          ItemName: 'X',
          ReturnQuantity: 1,
          ReturnDate: '2026-02-05T00:00:00.000Z',
          LateDays: 2,
          LateFee: 100,
        },
      ],
    });

    expect(html).toContain('İade Tarihi');
    expect(html).toContain('İskontolu Tutar');
    expect(html).not.toContain('Gecikme Ücreti');
    expect(html).toContain('X');
  });

  it('boş malzeme listesinde mesaj döner', () => {
    expect(createMaterialTableHTML([])).toContain('Malzeme bulunmuyor');
  });
});

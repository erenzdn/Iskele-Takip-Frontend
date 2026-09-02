/**
 * Şablon editörü WYSIWYG önizlemesi — backend documentPreviewSamples.js ile senkron tutulur.
 * Canlı sürüm: GET /document-preview-samples/:type
 */

export type DocumentPreviewContext = 'quote' | 'contract' | 'report';

export type DocumentPreviewSample = {
  placeholders: Record<string, string>;
  raw: Record<string, unknown>;
};

const SAMPLE_START = '2026-01-01T00:00:00.000Z';
const SAMPLE_END = '2026-02-15T00:00:00.000Z';
const SAMPLE_RETURN_1 = '2026-02-05T00:00:00.000Z';
const SAMPLE_RETURN_2 = '2026-02-10T00:00:00.000Z';

export const quotePreviewSample: DocumentPreviewSample = {
  placeholders: {
    musteriAdi: 'Örnek Müşteri A.Ş.',
    musteriAdres: 'Örnek Mah. Test Sok. No:1 İstanbul',
    musteriTelefon: '0212 123 45 67',
    musteriEmail: 'ornek@musteri.com',
    musteriVergiNo: '1234567890',
    musteriVergiDairesi: 'Kadıköy Vergi Dairesi',
    musteriMerkezYetkili: 'Ahmet Yılmaz',
    musteriMerkezYetkiliTelefon: '0532 123 45 67',
    santiyeAdi: 'Örnek Şantiye',
    santiyeAdres: 'Şantiye Mah. İnşaat Sok. No:2 İstanbul',
    teklifNo: '12345',
    teklifKodu: 'TK-2026-001',
    baslangicTarihi: '01.01.2026',
    bitisTarihi: '31.01.2026',
    kiralananSure: '30 gün',
    urunBirimFiyati:
      'Örnek Malzeme 1: 50,00 TL/gün; Örnek Malzeme 2: 100,00 TL/gün; Örnek Malzeme 3: 25,00 TL/gün',
    toplamUrunBirimFiyati: '1.500,00 TL',
    teklifNotu: 'Teklif geçerlilik süresi 15 gündür.',
    toplamKdvliSatisFiyati: '10.620,00 TL',
    toplamTutar: '10.000,00 TL',
    bugunTarihi: '01.01.2026',
    iskonto: '%10',
    kdvOrani: '%18',
    kdvTutari: '1.620,00 TL',
    iskontoTutari: '1.000,00 TL',
    iskontoSonrasiTutar: '9.000,00 TL',
    kdvDahilTutar: '10.620,00 TL',
    paraBirimi: 'TRY',
  },
  raw: {
    details: [
      { ItemName: 'Örnek Malzeme 1', Quantity: 10, UnitPriceSnapshot: 50, LineTotal: 15000, UnitName: 'adet' },
      { ItemName: 'Örnek Malzeme 2', Quantity: 5, UnitPriceSnapshot: 100, LineTotal: 15000, UnitName: 'm²' },
      { ItemName: 'Örnek Malzeme 3', Quantity: 20, UnitPriceSnapshot: 25, LineTotal: 15000, RentalUnit: 'kg' },
    ],
    currency: 'TRY',
    currencySymbol: 'TL',
    quote: {
      Type: 'RENTAL',
      Currency: 'TRY',
      Iskonto: 10,
    },
  },
};

export const contractPreviewSample: DocumentPreviewSample = {
  placeholders: {
    musteriAdi: 'Örnek Müşteri A.Ş.',
    musteriAdres: 'Örnek Mah. Test Sok. No:1 İstanbul',
    musteriTelefon: '0212 123 45 67',
    musteriEmail: 'ornek@musteri.com',
    musteriVergiNo: '1234567890',
    musteriVergiDairesi: 'Kadıköy Vergi Dairesi',
    musteriMerkezYetkili: 'Ahmet Yılmaz',
    musteriMerkezYetkiliTelefon: '0532 123 45 67',
    santiyeAdi: 'Örnek Şantiye',
    santiyeAdres: 'Şantiye Mah. İnşaat Sok. No:2 İstanbul',
    baslangicTarihi: '01.01.2026',
    bitisTarihi: '31.01.2026',
    toplamTutar: '10.000,00 TL',
    hesaplananTutar: '10.500,00 TL',
    temelUcret: '10.000,00 TL',
    gecikmeUcreti: '500,00 TL',
    nihaiTutar: '10.500,00 TL',
    sozlesmeNo: '12345',
    bugunTarihi: '01.01.2026',
    iskonto: '%10',
    kdvOrani: '%18',
    kdvTutari: '1.620,00 TL',
    iskontoTutari: '1.000,00 TL',
    iskontoSonrasiTutar: '9.000,00 TL',
    kdvDahilTutar: '10.620,00 TL',
    paraBirimi: 'TRY',
  },
  raw: {
    details: [
      {
        ItemName: 'Örnek Malzeme 1',
        RentedQuantity: 10,
        ReturnedQuantity: 2,
        UnitPriceSnapshot: 50,
        UnitName: 'adet',
        EffectiveStartDate: SAMPLE_START,
      },
      {
        ItemName: 'Örnek Malzeme 2',
        RentedQuantity: 5,
        ReturnedQuantity: 0,
        UnitPriceSnapshot: 100,
        UnitName: 'm²',
        EffectiveStartDate: SAMPLE_START,
      },
      {
        ItemName: 'Örnek Malzeme 3',
        RentedQuantity: 20,
        ReturnedQuantity: 0,
        UnitPriceSnapshot: 25,
        RentalUnit: 'metre',
        EffectiveStartDate: null,
      },
    ],
    returns: [
      {
        ItemName: 'Örnek Malzeme 1',
        ReturnQuantity: 3,
        ReturnDate: SAMPLE_RETURN_1,
        LateDays: 5,
        LateFee: 750,
      },
      {
        ItemName: 'Örnek Malzeme 2',
        ReturnQuantity: 2,
        ReturnDate: SAMPLE_RETURN_2,
        LateDays: 10,
        LateFee: 2000,
      },
    ],
    currency: 'TRY',
    currencySymbol: 'TL',
    contract: {
      Type: 'RENTAL',
      StartDate: SAMPLE_START,
      PlannedEndDate: SAMPLE_END,
      Iskonto: 10,
      Currency: 'TRY',
    },
  },
};

export const reportPreviewSample: DocumentPreviewSample = {
  placeholders: {
    raporBasligi: 'Örnek Müşteri Stok Hareket Raporu',
    musteriAdi: 'Örnek Müşteri A.Ş.',
    santiyeAdi: 'Merkez Şantiye',
    aktifSozlesme: '3',
    toplamMusteri: '12',
    toplamSozlesme: '45',
    raporTarihi: '01.01.2026',
  },
  raw: {
    items: [
      { product_name: 'H Tipi İskele Panosu', dispatched: 500, returned: 200, current_on_site: 300 },
      { product_name: 'Dikey Boru 2m', dispatched: 1000, returned: 800, current_on_site: 200 },
      { product_name: 'Çapraz Boru 2.5m', dispatched: 750, returned: 600, current_on_site: 150 },
      { product_name: 'Taban Plakası', dispatched: 300, returned: 250, current_on_site: 50 },
    ],
  },
};

export function getLocalDocumentPreviewSample(type: DocumentPreviewContext): DocumentPreviewSample {
  switch (type) {
    case 'quote':
      return quotePreviewSample;
    case 'contract':
      return contractPreviewSample;
    case 'report':
      return reportPreviewSample;
    default:
      return quotePreviewSample;
  }
}

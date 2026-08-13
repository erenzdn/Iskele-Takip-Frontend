import { describe, expect, it } from 'vitest';
import {
  extractStockErrorQuantities,
  isStockErrorMessage,
  parseStockError,
} from './parseStockError';

describe('parseStockError', () => {
  it('depo stok durumu tablosunu ayrıştırır', () => {
    const msg =
      'Yetersiz depo stoku: "İskele Direği" — "Merkez Depo" deposunda 20 adet talep edildi, mevcut: 5. Depo stok durumu: "Merkez Depo": 5 adet; "Şube Depo": 15 adet.';
    const parsed = parseStockError(msg);
    expect(parsed.summary).toContain('Yetersiz depo stoku');
    expect(parsed.warehouses).toEqual([
      { name: 'Merkez Depo', quantity: 5 },
      { name: 'Şube Depo', quantity: 15 },
    ]);
  });

  it('hiçbir depoda stok yok durumunu işler', () => {
    const msg =
      'Bu ürün belirtilen depoda bulunamadı: "X" — "Y" deposunda kayıt yok. Depo stok durumu: hiçbir depoda stok yok.';
    const parsed = parseStockError(msg);
    expect(parsed.warehouses).toEqual([]);
  });

  it('depo stok durumu yoksa tüm metni özet olarak döner', () => {
    const msg = 'Yetersiz stok: İskele Direği (Mevcut: 10, İstenen: 25)';
    const parsed = parseStockError(msg);
    expect(parsed.summary).toBe(msg);
    expect(parsed.warehouses).toEqual([]);
  });
});

describe('extractStockErrorQuantities', () => {
  it('genel stok formatından miktar çıkarır', () => {
    expect(extractStockErrorQuantities('Yetersiz stok: X (Mevcut: 10, İstenen: 25)')).toEqual({
      available: 10,
      requested: 25,
    });
  });

  it('depo stok formatından mevcut çıkarır', () => {
    expect(
      extractStockErrorQuantities('... 20 adet talep edildi, mevcut: 5. Depo stok durumu: ...')
    ).toEqual({ available: 5, requested: 20 });
  });
});

describe('isStockErrorMessage', () => {
  it('stok hatalarını tanır', () => {
    expect(isStockErrorMessage('Yetersiz depo stoku')).toBe(true);
    expect(isStockErrorMessage('Kayıt bulunamadı')).toBe(false);
  });
});

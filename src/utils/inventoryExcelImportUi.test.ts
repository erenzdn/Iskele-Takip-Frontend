import { describe, expect, it } from 'vitest';
import {
  enrichInventoryImportError,
  enrichInventoryImportRowErrors,
  resolveExcelImportErrors,
} from './inventoryExcelImportUi';

describe('resolveExcelImportErrors (backend-first)', () => {
  it('backend displayMessage ve summary değerlerini korur', () => {
    const result = resolveExcelImportErrors(
      [
        {
          row: 12,
          sheet: 'INVENTORY',
          column: 'Toplam Stok',
          error: 'Toplam Stok geçerli bir sayı olmalıdır.',
          category: 'COERCION',
          givenValue: 'abc',
          displayMessage:
            'Satır 12, Toplam Stok: Toplam Stok geçerli bir sayı olmalıdır. (girilen: abc)',
        },
      ],
      [
        {
          row: 12,
          sheet: 'INVENTORY',
          errorCount: 2,
          columns: ['Ağırlık (kg)', 'Birim Fiyat (TL)'],
          summary: 'Satır 12: 2 sorun (Ağırlık (kg), Birim Fiyat (TL))',
          issues: [
            {
              column: 'Ağırlık (kg)',
              error: 'Geçerli bir sayı girilmelidir.',
              category: 'COERCION',
              givenValue: 'x',
              displayMessage: 'Satır 12, Ağırlık (kg): Geçerli bir sayı girilmelidir. (girilen: x)',
            },
            {
              column: 'Birim Fiyat (TL)',
              error: 'Geçerli bir sayı girilmelidir.',
              category: 'COERCION',
              givenValue: 'y',
              displayMessage:
                'Satır 12, Birim Fiyat (TL): Geçerli bir sayı girilmelidir. (girilen: y)',
            },
          ],
        },
      ],
      { mapInventoryColumns: true, softenTechnicalErrors: true }
    );

    expect(result.errors[0].displayMessage).toBe(
      'Satır 12, Toplam Stok: Toplam Stok geçerli bir sayı olmalıdır. (girilen: abc)'
    );
    expect(result.errorsByRow[0].summary).toBe(
      'Satır 12: 2 sorun (Ağırlık (kg), Birim Fiyat (TL))'
    );
    expect(result.errorsByRow[0].issues[0].displayMessage).toContain('Ağırlık (kg)');
  });

  it('müşteri mesajlarını envanter yumuşatmasıyla bozmaz', () => {
    const result = resolveExcelImportErrors(
      [
        {
          row: 3,
          sheet: 'CustomerContacts',
          column: 'Müşteri Vergi Numarası',
          error: '"0001234567" Customers sayfasında bulunamadı.',
          category: 'BUSINESS',
          givenValue: '0001234567',
          displayMessage:
            'Satır 3, Müşteri Vergi Numarası: "0001234567" Customers sayfasında bulunamadı. Önce müşteri satırını ekleyin veya vergi numarasını düzeltin. (girilen: 0001234567)',
        },
      ],
      [],
      { mapInventoryColumns: false, softenTechnicalErrors: false }
    );

    expect(result.errors[0].displayMessage).toContain('Customers sayfasında bulunamadı');
    expect(result.errorsByRow[0].summary).toBe('Satır 3: 1 sorun (Müşteri Vergi Numarası)');
  });

  it('displayMessage yoksa teknik mesajı yumuşatır ve TR sütun adı kullanır', () => {
    const enriched = enrichInventoryImportError(
      {
        row: 5,
        sheet: 'INVENTORY',
        column: 'TotalStock',
        error: 'TotalStock must be a number',
        category: 'COERCION',
        givenValue: 'abc',
      },
      { mapInventoryColumns: true, softenTechnicalErrors: true }
    );

    expect(enriched.column).toBe('Toplam Stok');
    expect(enriched.displayMessage).toBe(
      'Satır 5, Toplam Stok: Toplam Stok geçerli bir sayı olmalıdır. Boş bırakılırsa 0 kabul edilir. (girilen: abc)'
    );
  });

  it('summary yoksa sektör standardı satır özeti üretir', () => {
    const enriched = enrichInventoryImportRowErrors(
      {
        row: 8,
        sheet: 'INVENTORY',
        errorCount: 2,
        columns: [],
        summary: '',
        issues: [
          {
            column: 'Weight',
            error: 'must be a number',
            category: 'COERCION',
            givenValue: 'a',
            displayMessage: '',
          },
          {
            column: 'UnitPrice',
            error: 'must be a number',
            category: 'COERCION',
            givenValue: 'b',
            displayMessage: '',
          },
        ],
      },
      { mapInventoryColumns: true, softenTechnicalErrors: true }
    );

    expect(enriched.summary).toBe('Satır 8: 2 sorun (Ağırlık (kg), Birim Fiyat (TL))');
    expect(enriched.issues.every((i) => i.displayMessage.includes('Satır 8'))).toBe(true);
  });

  it('iyi Türkçe backend error metnini yeniden yazmaz', () => {
    const enriched = enrichInventoryImportError(
      {
        row: 4,
        sheet: 'INVENTORY',
        column: 'Stok Kodu',
        error: 'Bu stok kodu başka bir ürünle çakışıyor: "Boru 48mm (BR-48)"',
        category: 'BUSINESS',
        givenValue: 'BR-48',
        displayMessage:
          'Satır 4, Stok Kodu: Bu stok kodu başka bir ürünle çakışıyor: "Boru 48mm (BR-48)" (girilen: BR-48)',
      },
      { mapInventoryColumns: true, softenTechnicalErrors: true }
    );

    expect(enriched.error).toBe(
      'Bu stok kodu başka bir ürünle çakışıyor: "Boru 48mm (BR-48)"'
    );
    expect(enriched.displayMessage).toContain('Boru 48mm');
  });
});

import { describe, expect, it } from 'vitest';
import {
  decisionsToMappings,
  extractUnmatchedCategories,
  isResolutionComplete,
  mergeCategoryMappings,
  normalizeCategoryKey,
  suggestCategoryMatch,
} from './unmatchedCategoryResolution';

describe('unmatchedCategoryResolution', () => {
  it('Türkçe kategori adını normalize eder', () => {
    expect(normalizeCategoryKey('  Ahşap  ')).toBe('ahşap');
    expect(normalizeCategoryKey('ISKELE')).toBe('iskele');
  });

  it('backend unmatchedLookups listesini birincil kaynak olarak kullanır', () => {
    const result = extractUnmatchedCategories({
      unmatchedLookups: {
        categories: [{ value: 'Ahşap', rowCount: 2, rows: [3, 5], reason: 'not_found' }],
      },
      errorsByRow: [
        {
          row: 9,
          issues: [
            {
              column: 'Kategori',
              error: '"Metal" adında kategori bulunamadı.',
              givenValue: 'Metal',
            },
          ],
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('Ahşap');
  });

  it('unmatchedLookups yoksa hata satırlarından gruplar', () => {
    const result = extractUnmatchedCategories({
      errorsByRow: [
        {
          row: 3,
          issues: [
            {
              column: 'Kategori',
              code: 'CATEGORY_NOT_FOUND',
              error: '"Ahşap" adında kategori bulunamadı.',
              givenValue: 'Ahşap',
            },
          ],
        },
        {
          row: 8,
          issues: [
            {
              column: 'Kategori',
              error: '"Ahşap" adında kategori bulunamadı.',
              givenValue: 'Ahşap',
            },
          ],
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].rowCount).toBe(2);
    expect(result[0].rows).toEqual([3, 8]);
  });

  it('yakın kategori adını önerir', () => {
    const suggestion = suggestCategoryMatch('Ahsap', [
      { CategoryId: 1, CategoryName: 'Metal' },
      { CategoryId: 2, CategoryName: 'Ahşap' },
    ]);
    expect(suggestion?.CategoryId).toBe(2);
  });

  it('yalnızca map kararlarını mapping listesine çevirir', () => {
    const mappings = decisionsToMappings([
      { excelName: 'Ahşap', action: 'map', mapCategoryId: 4 },
      { excelName: 'Metal', action: 'create', createName: 'Metal' },
      { excelName: 'Atla', action: 'skip' },
    ]);
    expect(mappings).toEqual([{ from: 'Ahşap', toCategoryId: 4 }]);
  });

  it('mapping birleşiminde aynı kaynaktan son değer kazanır', () => {
    const merged = mergeCategoryMappings(
      [{ from: 'Ahşap', toCategoryId: 1 }],
      [{ from: 'ahşap', toCategoryId: 9 }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].toCategoryId).toBe(9);
  });

  it('kararın tamamlanıp tamamlanmadığını doğrular', () => {
    expect(isResolutionComplete({ excelName: 'A', action: 'skip' })).toBe(true);
    expect(isResolutionComplete({ excelName: 'A', action: 'create', createName: '  ' })).toBe(false);
    expect(isResolutionComplete({ excelName: 'A', action: 'map' })).toBe(false);
    expect(isResolutionComplete({ excelName: 'A', action: 'map', mapCategoryId: 2 })).toBe(true);
  });
});

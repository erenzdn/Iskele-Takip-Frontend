import { describe, expect, it } from 'vitest';
import {
  computeAutoPageGapTargets,
  computeEditorPageLayout,
  type LayoutUnit,
} from './editorPagination';

function unit(
  docPos: number,
  height: number,
  offsetTop: number,
  kind: 'block' | 'table-row' | 'line' = 'block',
  isPageBreak = false
): LayoutUnit {
  return { docPos, height, offsetTop, isPageBreak, kind };
}

describe('computeAutoPageGapTargets', () => {
  it('tek sayfaya sığan içerikte aralık eklemez', () => {
    expect(
      computeAutoPageGapTargets([unit(1, 200, 0), unit(2, 300, 200)], 800, 36)
    ).toEqual([]);
  });

  it('taşan bloğu yeni sayfaya iter', () => {
    expect(
      computeAutoPageGapTargets([unit(1, 760, 0), unit(2, 80, 760)], 800, 36, 0)
    ).toEqual([{ docPos: 2, kind: 'block' }]);
  });

  it('tablo satırını yeni sayfaya iter', () => {
    const units = [
      unit(1, 700, 0),
      unit(10, 40, 700, 'table-row'),
      unit(11, 40, 740, 'table-row'),
      unit(12, 40, 780, 'table-row'),
    ];
    expect(computeAutoPageGapTargets(units, 800, 36)).toEqual([
      { docPos: 12, kind: 'table-row' },
    ]);
  });

  it('manuel sayfa sonundan sonra sayacı sıfırlar', () => {
    expect(
      computeAutoPageGapTargets(
        [unit(1, 700, 0), unit(2, 36, 700, 'block', true), unit(3, 500, 736)],
        800,
        36,
        0
      )
    ).toEqual([]);
  });

  it('liste maddelerinde margin birikimini offsetTop ile doğru hesaplar', () => {
    // 12 madde ~66px, 13. madde sayfa sonuna taşar
    const units = Array.from({ length: 13 }, (_, i) => {
      const itemHeight = 66;
      const listMargin = 8;
      const offsetTop = listMargin + i * itemHeight;
      return unit(i + 1, itemHeight, offsetTop);
    });
    expect(computeAutoPageGapTargets(units, 800, 36)).toEqual([
      { docPos: 13, kind: 'block' },
    ]);
  });

  it('taşan satırı sonraki sayfaya iter', () => {
    expect(
      computeAutoPageGapTargets(
        [
          unit(1, 18, 780, 'line'),
          unit(2, 18, 798, 'line'),
          unit(3, 18, 816, 'line'),
        ],
        800,
        36,
        0
      )
    ).toEqual([{ docPos: 2, kind: 'block' }]);
  });

  it('sayfa aralığına düşen satırı sonraki sayfaya iter', () => {
    expect(
      computeAutoPageGapTargets([unit(1, 18, 810, 'line')], 800, 36, 0)
    ).toEqual([{ docPos: 1, kind: 'block' }]);
  });
});

describe('computeEditorPageLayout', () => {
  it('boş belgede en az bir tam A4 sayfası ayırır', () => {
    expect(computeEditorPageLayout(0, 800, 36)).toEqual({
      pageCount: 1,
      minHeightPx: 800,
    });
  });

  it('içerik silindiğinde son sayfayı tam A4 olarak korur', () => {
    expect(computeEditorPageLayout(420, 800, 36)).toEqual({
      pageCount: 1,
      minHeightPx: 800,
    });
  });

  it('ikinci sayfa gerektiğinde tam akış yüksekliği verir', () => {
    expect(computeEditorPageLayout(801, 800, 36)).toEqual({
      pageCount: 2,
      minHeightPx: 1636,
    });
  });
});

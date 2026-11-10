import { describe, expect, it } from 'vitest';
import {
  computeEditorPageLayout,
  paginateNaturalLayout,
  type LayoutUnit,
} from './editorPagination';

function unit(
  docPos: number,
  height: number,
  offsetTop: number,
  kind: 'block' | 'table-row' | 'line' = 'block',
  extra: Partial<LayoutUnit> = {}
): LayoutUnit {
  return { docPos, height, offsetTop, isPageBreak: false, kind, gapInside: true, ...extra };
}

// Sayfa içerik yüksekliği 800, sayfalar arası (alt kenar + boşluk + üst kenar) 36, üst kenar 0
const PAGE = 800;
const SPACING = 36;

describe('paginateNaturalLayout', () => {
  it('tek sayfaya sığan içerikte aralık eklemez', () => {
    const result = paginateNaturalLayout([unit(1, 200, 0), unit(2, 300, 200)], PAGE, SPACING);
    expect(result.targets).toEqual([]);
    expect(result.pageCount).toBe(1);
  });

  it('taşan bloğu sonraki sayfanın tam başına iter (sayfa sonundaki artık alan dahil)', () => {
    const result = paginateNaturalLayout([unit(1, 760, 0), unit(2, 80, 760)], PAGE, SPACING);
    // 40px artık alan + 36px sayfa arası
    expect(result.targets).toEqual([{ docPos: 2, kind: 'block', height: 76 }]);
    expect(result.contentEnd).toBe(836 + 80);
    expect(result.pageCount).toBe(2);
  });

  it('tablo satırını yeni sayfaya iter', () => {
    const units = [
      unit(1, 700, 0),
      unit(10, 40, 700, 'table-row'),
      unit(11, 40, 740, 'table-row'),
      unit(12, 40, 780, 'table-row'),
    ];
    expect(paginateNaturalLayout(units, PAGE, SPACING).targets).toEqual([
      { docPos: 12, kind: 'table-row', height: 56 },
    ]);
  });

  it('paragrafı satır satır böler', () => {
    const result = paginateNaturalLayout(
      [
        unit(1, 18, 770, 'line', { startsBlock: true }),
        unit(2, 18, 788, 'line'),
        unit(3, 18, 806, 'line'),
      ],
      PAGE,
      SPACING
    );
    expect(result.targets).toEqual([{ docPos: 2, kind: 'block', height: 48 }]);
  });

  it('sonraki sayfalardaki kırılımları da sayfa başına hizalar', () => {
    const units = Array.from({ length: 100 }, (_, i) => unit(i + 1, 30, i * 30));
    const { targets } = paginateNaturalLayout(units, PAGE, SPACING);
    // Sayfaya 26 blok sığar (780px), 27. blok taşar
    expect(targets.map((t) => t.docPos)).toEqual([27, 53, 79]);
    expect(targets.every((t) => t.height === 20 + SPACING)).toBe(true);
  });

  it('manuel sayfa sonundan sonra içerik yeni sayfadan başlar', () => {
    const result = paginateNaturalLayout(
      [unit(1, 300, 0), { ...unit(2, 1, 300), isPageBreak: true }, unit(3, 500, 301)],
      PAGE,
      SPACING
    );
    expect(result.targets).toEqual([{ docPos: 2, kind: 'page-break', height: 536 }]);
    expect(result.pageCount).toBe(2);
    expect(result.contentEnd).toBe(836 + 500);
  });

  it('başlık sayfa sonunda yalnız kalmaz (break-after: avoid-page)', () => {
    const { targets } = paginateNaturalLayout(
      [unit(1, 740, 0), unit(2, 30, 740, 'block', { avoidBreakAfter: true }), unit(3, 60, 770)],
      PAGE,
      SPACING
    );
    expect(targets).toEqual([{ docPos: 2, kind: 'block', height: 96 }]);
  });

  it('kardeş aralıkta sayfa başındaki üst boşluğu keser', () => {
    const { targets } = paginateNaturalLayout(
      [
        unit(1, 750, 0, 'block', { marginBottom: 2 }),
        unit(2, 80, 760, 'block', { gapInside: false, marginTop: 10 }),
      ],
      PAGE,
      SPACING
    );
    // hedef üst = 836; doğal üst 760; birleşen boşluk ayrılır (-2) ve üst boşluk kesilir (-10)
    expect(targets).toEqual([{ docPos: 2, kind: 'block', height: 64 }]);
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

import { describe, expect, it } from 'vitest';
import {
  computeEditorPageLayout,
  paginateNaturalLayout,
  pdfFragmentainerHeight,
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
    // hedef: blok kenarlığı tam sayfa başında (836). Aralıkla birleşme biter: 750 + 2 (alt) +
    // aralık + 10 (üst) = 836 → aralık 74 = 836 − 760 − min(2, 10). (PDF ölçümüyle doğrulandı)
    expect(targets).toEqual([{ docPos: 2, kind: 'block', height: 74 }]);
  });

  it('kardeş aralıktan sonraki birimleri gerçek kayma kadar kaydırır', () => {
    // Blok 2 sayfa başına (836) taşınır → gerçek kayma 76 (aralık 74 + birleşmeyen 2px).
    // Blok 3 doğal 840'ta; 840 + 76 = 916, sayfa 2'de 916 + 760 = 1676 > 836 + 800 → kırılır.
    const { targets } = paginateNaturalLayout(
      [
        unit(1, 750, 0, 'block', { marginBottom: 2 }),
        unit(2, 80, 760, 'block', { gapInside: false, marginTop: 10 }),
        unit(3, 759, 840),
      ],
      PAGE,
      SPACING
    );
    expect(targets).toEqual([
      { docPos: 2, kind: 'block', height: 74 },
      { docPos: 3, kind: 'block', height: 1672 - 916 },
    ]);
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

describe('PDF sayfa geometrisi', () => {
  it('Chrome gibi sayfa içerik yüksekliğini tam piksele yukarı yuvarlar', () => {
    // 297mm − 15mm − 15mm = 1009,13px → PDF'te 1010px sığar (ölçüldü)
    expect(pdfFragmentainerHeight(1009.134)).toBe(1010);
    expect(pdfFragmentainerHeight(934)).toBe(934);
  });

  it('kesirli sayfa sınırına taşan ama tam piksele sığan satırı aynı sayfada tutar', () => {
    const units = [unit(1, 990, 0), unit(2, 19.5, 990)];
    const editorOnly = paginateNaturalLayout(units, 1009.134, SPACING);
    expect(editorOnly.targets).toHaveLength(1);
    const pdfLike = paginateNaturalLayout(units, 1009.134, SPACING, 0, pdfFragmentainerHeight(1009.134));
    expect(pdfLike.targets).toEqual([]);
  });

  it('kararı PDF ölçümüyle verir, boşluğu ekrandaki konuma göre hesaplar', () => {
    // Ekran ölçeği %125: ekranda satırlar daha kısa (ince çizgiler); PDF'te ikinci satır taşar
    const units = [
      unit(1, 400, 0, 'table-row', { visualOffsetTop: 0 }),
      unit(2, 401, 400, 'table-row', { visualOffsetTop: 398 }),
    ];
    const result = paginateNaturalLayout(units, PAGE, SPACING);
    // PDF: 400 + 401 = 801 > 800 → kırılım; ekranda satır 398'de → 800 − 398 + 36
    expect(result.targets).toEqual([{ docPos: 2, kind: 'table-row', height: 438 }]);
  });
});

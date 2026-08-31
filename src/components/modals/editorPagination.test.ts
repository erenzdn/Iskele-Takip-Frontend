import { describe, expect, it } from 'vitest';
import { computeAutoPageGapTargets, type LayoutUnit } from './editorPagination';

function unit(
  docPos: number,
  height: number,
  kind: 'block' | 'table-row' = 'block',
  isPageBreak = false
): LayoutUnit {
  return { docPos, height, isPageBreak, kind };
}

describe('computeAutoPageGapTargets', () => {
  it('tek sayfaya sığan içerikte aralık eklemez', () => {
    expect(computeAutoPageGapTargets([unit(1, 200), unit(2, 300)], 800, 36)).toEqual([]);
  });

  it('taşan bloğu yeni sayfaya iter', () => {
    expect(computeAutoPageGapTargets([unit(1, 760), unit(2, 80)], 800, 36)).toEqual([
      { docPos: 2, kind: 'block' },
    ]);
  });

  it('tablo satırını yeni sayfaya iter', () => {
    const units = [unit(1, 700), unit(10, 40, 'table-row'), unit(11, 40, 'table-row'), unit(12, 40, 'table-row')];
    expect(computeAutoPageGapTargets(units, 800, 36)).toEqual([{ docPos: 12, kind: 'table-row' }]);
  });

  it('manuel sayfa sonundan sonra sayacı sıfırlar', () => {
    expect(computeAutoPageGapTargets([unit(1, 700), unit(2, 0, 'block', true), unit(3, 500)], 800, 36)).toEqual([]);
  });
});

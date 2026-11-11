import { describe, expect, it } from 'vitest';
import {
  MIN_COLUMN_WIDTH_PX,
  applyColumnMove,
  buildColumnIds,
  moveInOrder,
  resolveColumnOrder,
  sanitizeTableLayout,
} from './tableLayout';

describe('buildColumnIds', () => {
  it('boşlukları sadeleştirir, boş ve yinelenen başlıklara ek verir', () => {
    expect(buildColumnIds(['  Ürün   Adı ', '', 'Tutar', 'Tutar', ''])).toEqual([
      'Ürün Adı',
      '#1',
      'Tutar',
      'Tutar~2',
      '#2',
    ]);
  });
});

describe('resolveColumnOrder', () => {
  it('kayıt yoksa mevcut sırayı döner', () => {
    expect(resolveColumnOrder(['a', 'b'], undefined)).toEqual(['a', 'b']);
  });
  it('kayıtlı sırayı uygular; yeni sütunu önceki komşusunun arkasına koyar; kaybolanı atar', () => {
    expect(resolveColumnOrder(['a', 'b', 'n', 'c'], ['c', 'b', 'gone', 'a'])).toEqual([
      'c',
      'b',
      'n',
      'a',
    ]);
    expect(resolveColumnOrder(['n', 'a'], ['a'])).toEqual(['n', 'a']);
  });
});

describe('moveInOrder', () => {
  const order = ['a', 'b', 'c', 'd'];
  it('hedefin önüne/arkasına taşır', () => {
    expect(moveInOrder(order, 'd', 'a', 'before')).toEqual(['d', 'a', 'b', 'c']);
    expect(moveInOrder(order, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd']);
  });
  it('değişiklik yoksa aynı diziyi döner', () => {
    expect(moveInOrder(order, 'a', 'b', 'before')).toBe(order);
    expect(moveInOrder(order, 'a', 'a', 'after')).toBe(order);
  });
});

describe('applyColumnMove', () => {
  it('gizli sütunların kayıtlı konumunu korur', () => {
    // h şu an gizli; görünenler a, b, c
    const next = applyColumnMove(['a', 'h', 'b', 'c'], ['a', 'b', 'c'], 'c', 'a', 'before');
    expect(next.filter((id) => id !== 'h')).toEqual(['c', 'a', 'b']);
    expect(next).toContain('h');
  });
  it('kayıt yokken ekrandaki sıradan başlar', () => {
    expect(applyColumnMove(undefined, ['a', 'b', 'c'], 'a', 'c', 'after')).toEqual(['b', 'c', 'a']);
  });
  it('sonuç görünen sütunlara süzüldüğünde ekrandaki sırayla tutarlıdır', () => {
    const displayed = resolveColumnOrder(['a', 'n', 'b'], ['b', 'x', 'a']);
    const next = applyColumnMove(['b', 'x', 'a'], displayed, 'n', 'b', 'before');
    expect(resolveColumnOrder(['a', 'n', 'b'], next)).toEqual(['n', 'b', 'a']);
  });
});

describe('sanitizeTableLayout', () => {
  it('geçersiz veriyi reddeder, genişlikleri sınırlar', () => {
    expect(sanitizeTableLayout(null)).toBeNull();
    expect(sanitizeTableLayout({ order: [], widths: {} })).toBeNull();
    expect(
      sanitizeTableLayout({ order: ['a', 'a', 3, 'b'], widths: { a: 2, b: 150.6, c: 'x' } })
    ).toEqual({ order: ['a', 'b'], widths: { a: MIN_COLUMN_WIDTH_PX, b: 151 } });
  });
});

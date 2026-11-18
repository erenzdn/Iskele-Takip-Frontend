import { useCallback, useState } from 'react';
import { CaretDownIcon, CaretUpDownIcon, CaretUpIcon } from '@phosphor-icons/react';

export type SortDir = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K | null;
  dir: SortDir;
}

const collator = new Intl.Collator('tr-TR', { numeric: true, sensitivity: 'base' });

function isEmpty(value: unknown): boolean {
  return (
    value == null ||
    (typeof value === 'string' && value.trim() === '') ||
    (typeof value === 'number' && Number.isNaN(value)) ||
    (value instanceof Date && Number.isNaN(value.getTime()))
  );
}

/** Boş değerler yöne bakılmaksızın sona gider; sayılar sayısal, metinler Türkçe alfabetik karşılaştırılır. */
export function compareSortValues(a: unknown, b: unknown, dir: SortDir): number {
  const aEmpty = isEmpty(a);
  const bEmpty = isEmpty(b);
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  let result: number;
  if (typeof a === 'number' && typeof b === 'number') result = a - b;
  else if (a instanceof Date && b instanceof Date) result = a.getTime() - b.getTime();
  else result = collator.compare(String(a), String(b));
  return dir === 'asc' ? result : -result;
}

/** API'den metin olarak gelebilen sayısal alanları (pg numeric) sayıya çevirir; boşsa null. */
export function toSortNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function sortRows<T, K extends string>(
  rows: readonly T[],
  state: SortState<K>,
  getValue: (row: T, key: K) => unknown
): T[] {
  const { key, dir } = state;
  if (!key) return rows.slice();
  return rows
    .map((row, index) => ({ row, index, value: getValue(row, key) }))
    .sort((a, b) => compareSortValues(a.value, b.value, dir) || a.index - b.index)
    .map((entry) => entry.row);
}

/** Başlığa tıklayınca: yeni sütun → artan; aynı sütun → artan/azalan arasında geçiş. */
export function useTableSort<K extends string>(initial: SortState<K> = { key: null, dir: 'asc' }) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const toggleSort = useCallback((key: K) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }, []);
  return { sort, toggleSort };
}

/**
 * Başlık içindeki sıralama oku. Metin üretmez (yalnızca SVG), böylece DataTable'ın
 * başlık metninden türettiği sütun kimlikleri ve kayıtlı düzen bozulmaz.
 */
export function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <CaretUpDownIcon size={11} className="inline-block align-[-1px] ml-0.5 opacity-30" />;
  return dir === 'asc' ? (
    <CaretUpIcon size={11} weight="bold" className="inline-block align-[-1px] ml-0.5 text-accent" />
  ) : (
    <CaretDownIcon size={11} weight="bold" className="inline-block align-[-1px] ml-0.5 text-accent" />
  );
}

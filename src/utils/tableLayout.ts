/**
 * Tablo sütun düzeni (sıra + genişlik) için saf yardımcılar.
 * Sütunlar başlık metninden türetilen kimliklerle tanınır (bkz. DataTable).
 */

export type TableLayout = {
  /** Kullanıcının belirlediği sütun sırası (o an görünmeyen sütunlar da dahil olabilir). */
  order: string[];
  /** Sütun kimliği → piksel genişlik. Boşsa tablo kendi varsayılan genişliklerini kullanır. */
  widths: Record<string, number>;
};

export const MIN_COLUMN_WIDTH_PX = 36;
export const MAX_COLUMN_WIDTH_PX = 1600;

export function clampColumnWidth(px: number): number {
  if (!Number.isFinite(px)) return MIN_COLUMN_WIDTH_PX;
  return Math.round(Math.min(MAX_COLUMN_WIDTH_PX, Math.max(MIN_COLUMN_WIDTH_PX, px)));
}

/**
 * Kayıtlı sırayı o anki sütunlara uygular. Kayıtta olmayan (yeni / koşullu) sütunlar,
 * varsayılan sıradaki bir önceki komşusunun hemen arkasına yerleşir.
 */
export function resolveColumnOrder(currentIds: string[], savedOrder: string[] | undefined): string[] {
  if (!savedOrder || savedOrder.length === 0) return currentIds;
  const present = new Set(currentIds);
  const result = savedOrder.filter((id, i) => present.has(id) && savedOrder.indexOf(id) === i);
  currentIds.forEach((id, index) => {
    if (result.includes(id)) return;
    let insertAt = 0;
    for (let i = index - 1; i >= 0; i--) {
      const prev = result.indexOf(currentIds[i]);
      if (prev >= 0) {
        insertAt = prev + 1;
        break;
      }
    }
    result.splice(insertAt, 0, id);
  });
  return result;
}

/** `source` sütununu `target` sütununun önüne/arkasına taşır; değişiklik yoksa aynı diziyi döner. */
export function moveInOrder(
  order: string[],
  source: string,
  target: string,
  placement: 'before' | 'after'
): string[] {
  if (source === target || !order.includes(source) || !order.includes(target)) return order;
  const next = order.filter((id) => id !== source);
  const targetIdx = next.indexOf(target);
  next.splice(placement === 'before' ? targetIdx : targetIdx + 1, 0, source);
  return next.every((id, i) => id === order[i]) ? order : next;
}

/**
 * Ekrandaki (görünen) sütunlar üzerinde yapılan taşımayı kayıtlı tam sıraya işler;
 * şu an görünmeyen sütunların kayıtlı konumları korunur.
 */
export function applyColumnMove(
  savedOrder: string[] | undefined,
  displayedIds: string[],
  source: string,
  target: string,
  placement: 'before' | 'after'
): string[] {
  // Kayıtlı sıradaki görünen sütun yuvalarını ekrandaki sırayla doldur; gizli sütunlar yerinde kalır.
  // Böylece sonuç görünen sütunlara süzüldüğünde ekrandaki sırayı birebir verir.
  const displayedSet = new Set(displayedIds);
  const result: string[] = [];
  let d = 0;
  for (const id of savedOrder ?? []) {
    if (!displayedSet.has(id)) result.push(id);
    else if (d < displayedIds.length) result.push(displayedIds[d++]);
  }
  while (d < displayedIds.length) result.push(displayedIds[d++]);
  return moveInOrder(result, source, target, placement);
}

export function isIdentityOrder(currentIds: string[], displayIds: string[]): boolean {
  return currentIds.length === displayIds.length && currentIds.every((id, i) => id === displayIds[i]);
}

/** Saklanan ham veriyi doğrular. */
export function sanitizeTableLayout(raw: unknown): TableLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const rawOrder = (raw as { order?: unknown }).order;
  const order: string[] = [];
  if (Array.isArray(rawOrder)) {
    for (const id of rawOrder) {
      if (typeof id === 'string' && id && !order.includes(id)) order.push(id);
    }
  }
  const widths: Record<string, number> = {};
  const rawWidths = (raw as { widths?: unknown }).widths;
  if (rawWidths && typeof rawWidths === 'object') {
    for (const [id, value] of Object.entries(rawWidths as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) widths[id] = clampColumnWidth(value);
    }
  }
  if (order.length === 0 && Object.keys(widths).length === 0) return null;
  return { order, widths };
}

/** Başlık metninden kararlı sütun kimlikleri üretir (boş/yinelenen başlıklar için ek alır). */
export function buildColumnIds(labels: string[]): string[] {
  const seen = new Map<string, number>();
  let blank = 0;
  return labels.map((raw) => {
    const label = raw.replace(/\s+/g, ' ').trim();
    const base = label || `#${++blank}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}~${n}`;
  });
}

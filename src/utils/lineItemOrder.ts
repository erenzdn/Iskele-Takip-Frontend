/** Teklif/sözleşme kalem sırası: sürükle-bırak ve dönüşüm sonrası aynı dizi sırası. */

type LineRecord = Record<string, unknown>;

function asRecord(value: unknown): LineRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as LineRecord;
}

function finiteNumber(value: unknown): number | undefined {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function firstArray(source: LineRecord, keys: readonly string[]): unknown[] {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

export function extractQuoteDetails(source: unknown): unknown[] {
  const record = asRecord(source);
  if (!record) return [];
  return firstArray(record, ['details', 'QuoteDetails', 'quoteDetails', 'Details']);
}

export function extractContractDetails(source: unknown): unknown[] {
  const record = asRecord(source);
  if (!record) return [];
  return firstArray(record, ['details', 'ContractDetails', 'contractDetails', 'Details']);
}

export function withContractDetails<T extends object>(
  contract: T,
  details: unknown[]
): T & { details: unknown[]; ContractDetails: unknown[]; contractDetails: unknown[] } {
  return {
    ...contract,
    details,
    ContractDetails: details,
    contractDetails: details,
  };
}

export function readLineOrder(record: unknown): number | undefined {
  const row = asRecord(record);
  if (!row) return undefined;
  for (const key of ['LineOrder', 'lineOrder', 'OrderNo', 'orderNo', 'SortOrder', 'sortOrder'] as const) {
    const parsed = finiteNumber(row[key]);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

export function sortByStoredLineOrder<T>(items: T[]): T[] {
  if (items.length <= 1) return items;
  const keyed = items.map((item, originalIndex) => ({
    item,
    originalIndex,
    order: readLineOrder(item),
  }));
  if (keyed.every((entry) => entry.order == null)) return items;
  return keyed
    .sort((a, b) => {
      if (a.order == null && b.order == null) return a.originalIndex - b.originalIndex;
      if (a.order == null) return 1;
      if (b.order == null) return -1;
      if (a.order !== b.order) return a.order - b.order;
      return a.originalIndex - b.originalIndex;
    })
    .map((entry) => entry.item);
}

function truthyFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function normalizeDesc(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR');
}

/** Teklif ve sözleşme kalemlerini eşlemek için kararlı anahtar (envanter: ItemId, manuel: açıklama). */
export function lineIdentity(record: unknown): string {
  const row = asRecord(record);
  if (!row) return '';
  const kind = String(row.kind ?? '').toLowerCase();
  const isManual =
    kind === 'manual' ||
    truthyFlag(row.IsManual) ||
    truthyFlag(row.isManual) ||
    truthyFlag(row.is_manual);
  if (isManual) {
    return `m:${normalizeDesc(row.Description ?? row.description)}`;
  }
  const itemId = finiteNumber(row.ItemId ?? row.itemId);
  if (itemId != null && itemId > 0) return `i:${itemId}`;
  const name = normalizeDesc(row.ItemName ?? row.itemName ?? row.Description ?? row.description);
  return name ? `n:${name}` : '';
}

/**
 * Sözleşme kalemlerini kaynak teklif sırasına çeker.
 * Eşleşmeyen kalemler (zeyilname vb.) sonda, kendi aralarındaki sıra korunur.
 * Aynı teklif satırının depo kırılımları orijinal göreli sırada kalır.
 */
function readLineDiscount(record: unknown): number | undefined {
  const row = asRecord(record);
  if (!row) return undefined;
  const raw = row.Iskonto ?? row.iskonto;
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, n));
}

/**
 * Sözleşme GET satır Iskonto döndürmezse kaynak teklif satırından doldurur.
 * API zaten Iskonto verdiyse dokunmaz (başlık NUMERIC(5,2) yuvarlamasına düşülmesin).
 */
export function copyQuoteLineDiscounts<T>(contractLines: T[], quoteLines: unknown[]): T[] {
  if (contractLines.length === 0 || quoteLines.length === 0) return contractLines;
  const discounts = new Map<string, number>();
  for (const line of quoteLines) {
    const key = lineIdentity(line);
    if (!key || discounts.has(key)) continue;
    const pct = readLineDiscount(line);
    if (pct === undefined) continue;
    discounts.set(key, pct);
  }
  if (discounts.size === 0) return contractLines;

  let changed = false;
  const next = contractLines.map((item) => {
    if (readLineDiscount(item) !== undefined) return item;
    const pct = discounts.get(lineIdentity(item));
    if (pct === undefined) return item;
    changed = true;
    return { ...(item as object), Iskonto: pct, iskonto: pct } as T;
  });
  return changed ? next : contractLines;
}

export function sortByQuoteLineOrder<T>(items: T[], quoteLines: unknown[]): T[] {
  if (items.length <= 1 || quoteLines.length === 0) return items;
  const order = new Map<string, number>();
  quoteLines.forEach((line, index) => {
    const key = lineIdentity(line);
    if (key && !order.has(key)) order.set(key, index);
  });
  if (order.size === 0) return items;

  return items
    .map((item, originalIndex) => ({
      item,
      originalIndex,
      order: order.get(lineIdentity(item)),
    }))
    .sort((a, b) => {
      if (a.order == null && b.order == null) return a.originalIndex - b.originalIndex;
      if (a.order == null) return 1;
      if (b.order == null) return -1;
      if (a.order !== b.order) return a.order - b.order;
      return a.originalIndex - b.originalIndex;
    })
    .map((entry) => entry.item);
}

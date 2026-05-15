export const formatCurrency = (amount: number, decimals: number = 2): string => {
  return formatMoney(amount, 'TRY', decimals);
};

export type MoneyCurrency = 'TRY' | 'EUR' | 'USD';

export const formatMoney = (amount: number, currency: MoneyCurrency = 'TRY', decimals: number = 2): string => {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe);
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('tr-TR');
};

export const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString('tr-TR');
};

/** Kısa tarih+saat (saniyesiz), liste sütunları için */
export const formatShortDateTime = (dateString: string | null | undefined): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Türkçe ad + varsa İngilizce ad (UI ve toast için). */
export function formatInventoryBilingualLabel(itemName: string, itemNameEn?: string | null): string {
  const tr = (itemName ?? '').trim();
  const en = typeof itemNameEn === 'string' ? itemNameEn.trim() : '';
  if (en) return `${tr || itemName} / ${en}`;
  return tr || itemName;
}

/** Teklif/sözleşme envanter satırı: satır alanı veya ilişkili ürün üzerinden iki dilli etiket. */
export function formatInventoryLineBilingualLabel(
  itemName: string,
  itemNameEn?: string | null,
  item?: { ItemNameEn?: string | null } | null
): string {
  const en = itemNameEn ?? item?.ItemNameEn ?? null;
  return formatInventoryBilingualLabel(itemName, en);
}

/** Audit log özeti: "X alanı Y yaptı" formatına hazır; ChangedColumns veya action'dan türetir */
export const buildAuditLogSummary = (
  changedColumns: string | null | undefined,
  action: number
): string => {
  if (changedColumns && changedColumns.trim()) return changedColumns.trim();
  const labels: Record<number, string> = {
    0: 'Kayıt oluşturuldu',
    1: 'Kayıt güncellendi',
    2: 'Kayıt silindi',
  };
  return labels[action] ?? 'İşlem';
};
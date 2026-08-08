export type InventoryColumnKey =
  | 'itemCode'
  | 'itemName'
  | 'weight'
  | 'unit'
  | 'monthlyListPrice'
  | 'unitPriceTry'
  | 'unitPriceUsd'
  | 'unitPriceEur'
  | 'status'
  | 'audit';

export type CustomerColumnKey =
  | 'id'
  | 'name'
  | 'phone'
  | 'taxId'
  | 'email'
  | 'preferredContact'
  | 'contracts'
  | 'audit';

export type ColumnAlign = 'left' | 'right' | 'center';

export type TableColumnMeta<TKey extends string> = {
  key: TKey;
  label: string;
  required?: boolean;
  weight: number;
  align: ColumnAlign;
};

export const INVENTORY_TABLE_COLUMNS: TableColumnMeta<InventoryColumnKey>[] = [
  { key: 'itemCode', label: 'Ürün Kodu', weight: 1.2, align: 'left' },
  { key: 'itemName', label: 'Ürün Adı', required: true, weight: 2.4, align: 'left' },
  { key: 'weight', label: 'Ağırlık', weight: 1, align: 'right' },
  { key: 'unit', label: 'Ana Birim', weight: 0.8, align: 'left' },
  { key: 'monthlyListPrice', label: 'Aylık Liste (₺)', weight: 1.2, align: 'right' },
  { key: 'unitPriceTry', label: 'Birim (₺)', weight: 1.1, align: 'right' },
  { key: 'unitPriceUsd', label: 'Birim ($)', weight: 1.1, align: 'right' },
  { key: 'unitPriceEur', label: 'Birim (€)', weight: 1.1, align: 'right' },
  { key: 'status', label: 'Durum', weight: 1, align: 'center' },
  { key: 'audit', label: 'Kayıt Bilgisi', weight: 1.6, align: 'left' },
];

export const CUSTOMER_TABLE_COLUMNS: TableColumnMeta<CustomerColumnKey>[] = [
  { key: 'id', label: 'ID', weight: 0.6, align: 'left' },
  { key: 'name', label: 'Müşteri Adı', required: true, weight: 2.2, align: 'left' },
  { key: 'phone', label: 'Telefon', weight: 1.2, align: 'left' },
  { key: 'taxId', label: 'Vergi No', weight: 1, align: 'left' },
  { key: 'email', label: 'E-posta', weight: 1.4, align: 'left' },
  { key: 'preferredContact', label: 'Merkez Yetkili', weight: 1.6, align: 'left' },
  { key: 'contracts', label: 'Sözleşme', weight: 0.8, align: 'center' },
  { key: 'audit', label: 'Kayıt Bilgisi', weight: 1.5, align: 'left' },
];

export function getVisibleColumnWidths<TKey extends string>(
  columns: TableColumnMeta<TKey>[],
  visibility: Record<TKey, boolean>
): Partial<Record<TKey, number>> {
  const visible = columns.filter((col) => visibility[col.key]);
  const totalWeight = visible.reduce((sum, col) => sum + col.weight, 0);
  if (totalWeight <= 0) return {};

  const widths: Partial<Record<TKey, number>> = {};
  for (const col of visible) {
    widths[col.key] = (col.weight / totalWeight) * 100;
  }
  return widths;
}

/** Teklif / sözleşme kalem tablolarında ortak sütun genişlikleri (table-fixed %) */
export const LINE_ITEM_COL = {
  /** Satır no (+ sürükle tutamacı); dar tutulur, kalan alan içerik sütunlarına gider */
  rowIndex: '2.5%',
  itemCode: '13%',
  itemName: '36%',
  /** Sözleşmede depo sütunu varken ürün adı genişliği */
  itemNameWithWarehouse: '20%',
  warehouse: '10%',
  quantity: '8%',
  unitPrice: '12%',
  discount: '8%',
  total: '14%',
  action: '2.5%',
} as const;

export const LINE_ITEM_COL_SPAN = {
  /** Satır no her zaman görünür; sürükle tutamacı aynı sütunda */
  quote: { readOnly: 8, editable: 8 },
  contract: { readOnly: 8, editable: 9 },
} as const;

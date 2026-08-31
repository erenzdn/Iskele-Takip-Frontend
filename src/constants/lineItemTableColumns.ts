/** Teklif / sözleşme kalem tablolarında ortak sütun genişlikleri (table-fixed %) */
export const LINE_ITEM_COL = {
  itemCode: '14%',
  itemName: '30%',
  /** Sözleşmede depo sütunu varken ürün adı genişliği */
  itemNameWithWarehouse: '18%',
  warehouse: '10%',
  quantity: '8%',
  unitPrice: '12%',
  discount: '8%',
  total: '12%',
} as const;

export const LINE_ITEM_COL_SPAN = {
  quote: { readOnly: 7, editable: 8 },
  contract: { readOnly: 8, editable: 9 },
} as const;

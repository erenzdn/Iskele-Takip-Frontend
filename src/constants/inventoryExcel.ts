/** Envanter Excel import — zorunlu sütunlar (boş bırakılamaz). */
export const INVENTORY_REQUIRED_EXCEL_COLUMNS = [
  'Ürün Adı',
  'Ürün Adı (EN)',
  'Stok Kodu',
  'Ağırlık (kg)',
  'Birim Fiyat (TL)',
] as const;

/** Envanter Excel import — opsiyonel sütunlar (boş hücre kabul edilir). */
export const INVENTORY_OPTIONAL_EXCEL_COLUMNS = [
  'Kategori ID',
  'Liste Fiyatı (TL)',
  'Birim Fiyat (EUR)',
  'Liste Fiyatı (EUR)',
  'Birim Fiyat (USD)',
  'Liste Fiyatı (USD)',
  'Satın Alma Fiyatı',
  'Toplam Stok',
] as const;

export const INVENTORY_EXCEL_HELP = {
  hint: 'Envanter Excel şablonunu indirip doldurun; ardından dosyayı içe aktarın.',
  checklist:
    'Zorunlu sütunlar: Ürün Adı, Ürün Adı (EN), Stok Kodu, Ağırlık (kg), Birim Fiyat (TL). Opsiyonel: Kategori ID, liste/döviz fiyatları, Satın Alma Fiyatı, Toplam Stok (boş = 0).',
  requiredLegend: INVENTORY_REQUIRED_EXCEL_COLUMNS.join(', '),
  optionalLegend: INVENTORY_OPTIONAL_EXCEL_COLUMNS.join(', '),
  stockNote: 'Toplam Stok boş bırakılırsa 0 kabul edilir.',
  notInTemplate: 'Şablonda bulunmaz (içe aktarmada beklenmez): Kirada, Kategoriler, Alt Kategoriler.',
  exportNote:
    'Dışa aktarılmış dosyalarda yinelenen stok kodları veya eksik İngilizce ad satırları olabilir. Strict modda tek hata tüm yüklemeyi durdurur; düzeltemiyorsanız "Hatalı satırları atla ve yükle" seçeneğini kullanın.',
} as const;

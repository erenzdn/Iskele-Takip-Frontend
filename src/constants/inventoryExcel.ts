/** Envanter Excel import — zorunlu sütunlar (boş bırakılamaz). Export/şablonda * ile işaretlenir. */
export const INVENTORY_REQUIRED_EXCEL_COLUMNS = [
  'Ürün Adı',
  'Ürün Adı (EN)',
  'Stok Kodu',
  'Ağırlık (kg)',
  'Birim Fiyat (TL)',
] as const;

/** Envanter Excel import — opsiyonel sütunlar (boş hücre kabul edilir). */
export const INVENTORY_OPTIONAL_EXCEL_COLUMNS = [
  'Kategori',
  'Liste Fiyatı (TL)',
  'Birim Fiyat (EUR)',
  'Liste Fiyatı (EUR)',
  'Birim Fiyat (USD)',
  'Liste Fiyatı (USD)',
  'Toplam Stok',
] as const;

export const INVENTORY_EXCEL_HELP = {
  hint: 'Envanter Excel şablonunu indirip doldurun; ardından dosyayı içe aktarın. Önce doğrulama ekranı açılır. Aynı stok kodu kopya açmaz, mevcut kaydı günceller. Başlıkta * olan sütunlar zorunludur.',
  checklist:
    'Zorunlu sütunlar (*): Ürün Adı, Ürün Adı (EN), Stok Kodu, Ağırlık (kg), Birim Fiyat (TL). Opsiyonel: Kategori (kategori adı ile eşleşir), liste/döviz fiyatları, Toplam Stok (boş = 0).',
  requiredLegend: INVENTORY_REQUIRED_EXCEL_COLUMNS.map((c) => `${c} *`).join(', '),
  optionalLegend: INVENTORY_OPTIONAL_EXCEL_COLUMNS.join(', '),
  stockNote: 'Toplam Stok boş bırakılırsa 0 kabul edilir.',
  categoryNote:
    'Kategori sütununa sistemdeki kategori adını yazın (ör. "İskele Boru"). Eşleşme ada göredir; bulunamazsa hata mesajında kategori adı gösterilir.',
  roundTripNote:
    'Dışa aktarma ile içe aktarma aynı sütunları kullanır (round-trip). Kirada, Kategoriler, Alt Kategoriler ve Satın Alma Fiyatı Excel’e yazılmaz.',
  exportNote:
    'Aynı stok kodu (veya kod yoksa aynı ürün adı) varsa kayıt kopyalanmaz, güncellenir. Dışa aktarılan dosyayı düzenleyip tekrar yükleyebilirsiniz. Strict modda tek hata tüm yüklemeyi durdurur; önizlemede yalnızca geçerli satırları yükleyebilirsiniz.',
} as const;

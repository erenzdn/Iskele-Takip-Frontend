export const CUSTOMERS_EXCEL_HELP = {
  hint: 'Müşteri Excel dosyası 2 sayfa içerir: Customers + CustomerContacts. Başlıkta * olan sütunlar zorunludur.',
  taxIdNote:
    'Vergi Numarası * alanı 10 haneli VKN veya 11 haneli TCKN olmalıdır. Baştaki sıfırların korunması için güncel şablonu kullanın.',
  checklist:
    'Zorunlu (*): Customers → Müşteri Ünvanı, Vergi Numarası; CustomerContacts → Müşteri Vergi Numarası, Yetkili Adı. CustomerContacts.Müşteri Vergi Numarası, Customers.Vergi Numarası ile eşleşmeli. Aynı müşteri için birden fazla "Birincil Mi = Evet" satırı olamaz.',
} as const;

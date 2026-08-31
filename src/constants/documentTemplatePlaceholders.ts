export type DocumentPlaceholder = {
  key: string;
  label: string;
};

export const MATERIAL_TABLE_PLACEHOLDER = 'malzemeTablosu';
export const RETURN_TABLE_PLACEHOLDER = 'iadeTablosu';

export const DOCUMENT_TEMPLATE_PLACEHOLDERS = {
  musteri: [
    { key: 'musteriAdi', label: 'Müşteri Adı' },
    { key: 'musteriAdres', label: 'Müşteri Adres' },
    { key: 'musteriTelefon', label: 'Müşteri Telefon' },
    { key: 'musteriEmail', label: 'Müşteri Email' },
    { key: 'musteriVergiNo', label: 'Müşteri Vergi No' },
    { key: 'musteriMerkezYetkili', label: 'Merkez Yetkili' },
    { key: 'musteriMerkezYetkiliTelefon', label: 'Merkez Yetkili Telefon' },
  ] as DocumentPlaceholder[],
  santiye: [
    { key: 'santiyeAdi', label: 'Şantiye Adı' },
    { key: 'santiyeAdres', label: 'Şantiye Adres' },
  ] as DocumentPlaceholder[],
  teklif: [
    { key: 'teklifNo', label: 'Teklif No' },
    { key: 'teklifKodu', label: 'Teklif Kodu' },
    { key: 'baslangicTarihi', label: 'Başlangıç Tarihi' },
    { key: 'bitisTarihi', label: 'Bitiş Tarihi' },
    { key: 'toplamTutar', label: 'Toplam Tutar' },
    { key: 'iskonto', label: 'İskonto' },
    { key: 'kdvOrani', label: 'KDV Oranı' },
    { key: 'kdvTutari', label: 'KDV Tutarı' },
    { key: 'iskontoSonrasiTutar', label: 'İskonto Sonrası Tutar' },
    { key: 'kdvDahilTutar', label: 'KDV Dahil Tutar' },
    { key: 'bugunTarihi', label: 'Bugünün Tarihi' },
  ] as DocumentPlaceholder[],
  sozlesme: [
    { key: 'sozlesmeNo', label: 'Sözleşme No' },
    { key: 'baslangicTarihi', label: 'Başlangıç Tarihi' },
    { key: 'bitisTarihi', label: 'Bitiş Tarihi' },
    { key: 'gercekBitisTarihi', label: 'Gerçek Bitiş Tarihi' },
    { key: 'iskonto', label: 'İskonto' },
    { key: 'toplamTutar', label: 'Toplam Tutar' },
    { key: 'hesaplananTutar', label: 'Hesaplanan Tutar' },
    { key: 'bugunTarihi', label: 'Bugünün Tarihi' },
    { key: RETURN_TABLE_PLACEHOLDER, label: 'İade Tablosu' },
  ] as DocumentPlaceholder[],
  cek: [
    { key: 'Check.BankName', label: 'Çek Banka Adı' },
    { key: 'Check.CheckNumber', label: 'Çek Numarası' },
    { key: 'Check.AmountFormatted', label: 'Çek Tutarı (formatlı)' },
    { key: 'Check.IssueDateFormatted', label: 'Keside Tarihi (formatlı)' },
    { key: 'Check.DueDateFormatted', label: 'Vade Tarihi (formatlı)' },
    { key: 'Check.StatusLabel', label: 'Çek Durumu' },
    { key: 'Check.CustomerName', label: 'Müşteri Adı' },
  ] as DocumentPlaceholder[],
};

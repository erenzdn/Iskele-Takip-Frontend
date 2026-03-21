export type ValidationCode =
  | 'required'
  | 'invalidText'
  | 'invalidName'
  | 'invalidNumber'
  | 'minNumber'
  | 'maxNumber'
  | 'invalidDate'
  | 'invalidEmail'
  | 'invalidPhone'
  | 'invalidIban'
  | 'invalidTaxNumber'
  | 'invalidUuid'
  | 'invalidLength';

export function getValidationMessage(
  fieldLabel: string,
  code: ValidationCode,
  meta?: { min?: number; max?: number; expected?: string; length?: number }
): string {
  switch (code) {
    case 'required':
      return `${fieldLabel} zorunludur.`;
    case 'invalidText':
      return `${fieldLabel} geçersiz karakter içeriyor.`;
    case 'invalidName':
      return `${fieldLabel} sayı içeremez. Lütfen sadece harf ve uygun ayraç karakterleri kullanın.`;
    case 'invalidNumber':
      return `${fieldLabel} sadece sayı olmalıdır. Örnek: 1250.50`;
    case 'minNumber':
      return `${fieldLabel} en az ${meta?.min ?? 0} olmalıdır.`;
    case 'maxNumber':
      return `${fieldLabel} en fazla ${meta?.max ?? 0} olmalıdır.`;
    case 'invalidDate':
      return `${fieldLabel} geçerli bir tarih olmalıdır.`;
    case 'invalidEmail':
      return `${fieldLabel} geçerli bir e-posta formatında olmalıdır. Örnek: ad@firma.com`;
    case 'invalidPhone':
      return `${fieldLabel} sadece rakam içermeli ve 10-11 hane olmalıdır.`;
    case 'invalidIban':
      return `${fieldLabel} geçerli bir IBAN formatında olmalıdır. Örnek: TR330006100519786457841326`;
    case 'invalidTaxNumber':
      return `${fieldLabel} 10 veya 11 haneli sayısal bir değer olmalıdır.`;
    case 'invalidUuid':
      return `${fieldLabel} geçerli bir UUID formatında olmalıdır.`;
    case 'invalidLength':
      return `${fieldLabel} tam olarak ${meta?.length ?? 0} karakter olmalıdır.`;
    default:
      return `${fieldLabel} için geçersiz değer girdiniz.`;
  }
}

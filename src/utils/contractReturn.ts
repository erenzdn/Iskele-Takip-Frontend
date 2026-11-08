import { getApiErrorMessage } from './apiError';

export const AMBIGUOUS_CONTRACT_DETAIL_USER_MESSAGE =
  'Aynı ürün için birden fazla sözleşme satırı var. Lütfen iade edilecek satırı listeden seçin.';

export function isAmbiguousContractDetailError(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status !== 400) return false;
  const msg = getApiErrorMessage(error).toLocaleLowerCase('tr-TR');
  return (
    msg.includes('birden fazla satır') ||
    msg.includes('birden fazla satir') ||
    (msg.includes('detailid') && (msg.includes('zorunlu') || msg.includes('birden')))
  );
}

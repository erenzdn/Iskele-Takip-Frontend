/**
 * API hata yanıtından kullanıcıya gösterilecek mesajı çıkarır.
 * apiClient hatalarda responseText ekler; backend genelde { message: "..." } veya { errors: [...] } döner.
 */
function tryParseMessageFromText(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  try {
    const data = JSON.parse(text) as {
      message?: string;
      Message?: string;
      error?: string;
      Error?: string;
      title?: string;
      Title?: string;
      detail?: string;
      Detail?: string;
      errors?: Array<{ msg?: string; param?: string; path?: string }>;
    };
    if (typeof data?.message === 'string') return data.message;
    if (typeof data?.Message === 'string') return data.Message;
    if (typeof data?.detail === 'string') return data.detail;
    if (typeof data?.Detail === 'string') return data.Detail;
    if (typeof data?.error === 'string') return data.error;
    if (typeof data?.Error === 'string') return data.Error;
    if (Array.isArray(data?.errors) && data.errors.length > 0) {
      const parts = data.errors.map((e) => {
        const field = e.param || e.path || 'Alan';
        const msg = e.msg || 'Geçersiz değer';
        return `${field}: ${msg}`;
      });
      return parts.join('; ');
    }
  } catch {
    const firstLine = text.split('\n')[0]?.trim();
    if (firstLine) return firstLine;
  }
  return null;
}

type ParsedApiError = {
  message: string | null;
  fieldErrors: Record<string, string>;
};

function parseApiErrorText(text: string): ParsedApiError {
  const parsed: ParsedApiError = { message: null, fieldErrors: {} };
  if (!text || typeof text !== 'string') return parsed;

  try {
    const data = JSON.parse(text) as {
      message?: string;
      Message?: string;
      error?: string;
      Error?: string;
      title?: string;
      Title?: string;
      detail?: string;
      Detail?: string;
      errors?:
        | Array<{ msg?: string; message?: string; param?: string; path?: string; field?: string }>
        | Record<string, string | string[] | { message?: string; msg?: string }>;
    };

    parsed.message =
      (typeof data?.message === 'string' && data.message) ||
      (typeof data?.Message === 'string' && data.Message) ||
      (typeof data?.detail === 'string' && data.detail) ||
      (typeof data?.Detail === 'string' && data.Detail) ||
      (typeof data?.error === 'string' && data.error) ||
      (typeof data?.Error === 'string' && data.Error) ||
      null;

    if (Array.isArray(data?.errors)) {
      const parts = data.errors.map((e) => {
        const field = e.param || e.path || e.field || 'Alan';
        const msg = e.msg || e.message || 'Geçersiz değer';
        if (!parsed.fieldErrors[field]) parsed.fieldErrors[field] = msg;
        return `${field}: ${msg}`;
      });
      if (!parsed.message && parts.length > 0) parsed.message = parts.join('; ');
    } else if (data?.errors && typeof data.errors === 'object') {
      for (const [key, value] of Object.entries(data.errors)) {
        if (typeof value === 'string') {
          parsed.fieldErrors[key] = value;
        } else if (Array.isArray(value) && value.length > 0) {
          parsed.fieldErrors[key] = String(value[0]);
        } else if (value && typeof value === 'object') {
          const obj = value as { message?: string; msg?: string };
          if (obj.message) parsed.fieldErrors[key] = obj.message;
          else if (obj.msg) parsed.fieldErrors[key] = obj.msg;
        }
      }
    }
  } catch {
    const firstLine = text.split('\n')[0]?.trim();
    if (firstLine) parsed.message = firstLine;
  }

  return parsed;
}

export function getApiErrorMessage(error: unknown): string {
  const err = error as { message?: string; responseText?: string };
  if (!err) return 'Beklenmeyen hata';

  const fromResponse = parseApiErrorText(err.responseText ?? '').message;
  if (fromResponse) return fromResponse;

  const msg = err.message ?? '';
  const jsonMatch = msg.match(/\s-\s+(\{[\s\S]*\})\s*$/);
  if (jsonMatch) {
    const fromMessage = parseApiErrorText(jsonMatch[1]).message;
    if (fromMessage) return fromMessage;
  }

  const direct = tryParseMessageFromText(msg);
  if (direct) return direct;

  return msg || 'Beklenmeyen hata';
}

export function getApiFieldErrors(
  error: unknown,
  expectedFields?: string[]
): Record<string, string> {
  const err = error as { message?: string; responseText?: string };
  if (!err) return {};

  const fromResponse = parseApiErrorText(err.responseText ?? '').fieldErrors;
  let combined: Record<string, string> = { ...fromResponse };

  const msg = err.message ?? '';
  const jsonMatch = msg.match(/\s-\s+(\{[\s\S]*\})\s*$/);
  if (jsonMatch) {
    combined = { ...combined, ...parseApiErrorText(jsonMatch[1]).fieldErrors };
  } else if (msg.trim().startsWith('{')) {
    combined = { ...combined, ...parseApiErrorText(msg).fieldErrors };
  }

  if (!expectedFields || expectedFields.length === 0) return combined;

  const filtered: Record<string, string> = {};
  for (const field of expectedFields) {
    if (combined[field]) filtered[field] = combined[field];
  }
  return filtered;
}

/** POST/PATCH /inventory: başka üründe kullanılan İngilizce ad (400). */
export function isDuplicateInventoryItemNameEnError(error: unknown): boolean {
  const e = error as { status?: number };
  if (e.status !== 400) return false;
  const m = getApiErrorMessage(error).toLowerCase();
  if (!m) return false;
  if (m.includes('itemnameen')) return true;
  const trConflict =
    (m.includes('i̇ngilizce') || m.includes('ingilizce')) &&
    (m.includes('zaten') || m.includes('benzersiz') || m.includes('duplicate') || m.includes('unique') || m.includes('already'));
  if (trConflict) return true;
  if (
    (m.includes('english') || m.includes('name en')) &&
    (m.includes('already') || m.includes('taken') || m.includes('exists') || m.includes('unique') || m.includes('duplicate'))
  ) {
    return true;
  }
  return false;
}

export function getUserFacingErrorMessage(error: unknown, fallback: string): string {
  const raw = getApiErrorMessage(error);
  if (!raw) return fallback;

  if (raw.includes('Failed to fetch') || raw.includes('Network Error')) {
    return 'Sunucuya bağlanılamadı. İnternet bağlantınızı ve API servisinin çalıştığını kontrol edin.';
  }
  if (raw.includes('401') || raw.includes('Unauthorized')) {
    return 'Yetkilendirme hatası. Lütfen tekrar giriş yapın.';
  }
  if (raw.includes('403')) {
    return 'Bu işlem için yetkiniz bulunmuyor.';
  }
  if (raw.includes('404')) {
    return 'İlgili kayıt veya servis bulunamadı.';
  }

  return raw;
}

/** Arşivlenmiş müşteri / assertActiveCustomer benzeri 400 yanıtlarında ek bağlam. */
const ARCHIVED_CUSTOMER_ACTION_HINT =
  'Müşteri arşivlenmiş olabilir; müşteri alanından listede görünen aktif bir kayıt seçin.';

/**
 * Sözleşme, teklif, alış faturası vb. işlemlerde CustomerId ile ilgili 400 hatalarında
 * backend mesajını korur; gerektiğinde kısa bir yönlendirme ekler.
 */
export function userMessageForCustomerRelatedApiError(error: unknown, fallback: string): string {
  const base = getUserFacingErrorMessage(error, fallback);
  const status = (error as { status?: number })?.status;
  if (status !== 400) return base;
  const lower = base.toLowerCase();
  const looksArchivedOrInactive =
    lower.includes('arşiv') ||
    lower.includes('arsiv') ||
    (lower.includes('aktif') && (lower.includes('müşteri') || lower.includes('musteri'))) ||
    lower.includes('customerid');
  if (!looksArchivedOrInactive) return base;
  if (lower.includes('listeden') || lower.includes('yeniden')) return base;
  return `${base}\n${ARCHIVED_CUSTOMER_ACTION_HINT}`;
}

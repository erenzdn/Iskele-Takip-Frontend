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

function isWarehouseForeignKeyError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('foreign key') ||
    lower.includes('violates foreign key') ||
    /\b23503\b/.test(message) ||
    (lower.includes('warehouses') &&
      (lower.includes('constraint') || lower.includes('referenc') || lower.includes('fk')))
  );
}

export function getApiErrorCode(error: unknown): string | undefined {
  const err = error as { code?: string; responseText?: string };
  if (typeof err?.code === 'string' && err.code) return err.code;
  if (err?.responseText) {
    try {
      const data = JSON.parse(err.responseText) as { code?: string };
      if (typeof data?.code === 'string') return data.code;
    } catch {
      // no-op
    }
  }
  return undefined;
}

export function getWarehouseDeleteErrorMessage(error: unknown): string {
  const status = (error as { status?: number })?.status;
  const code = getApiErrorCode(error);
  if (status === 404) {
    return 'Depo bulunamadı. Liste yenilenmiş olabilir.';
  }
  if (status === 403) {
    return 'Depo kaldırma yetkiniz yok. Kullanıcıya warehouses_delete izni verin ve tekrar giriş yapın.';
  }
  const raw = getApiErrorMessage(error);
  if (code === 'WAREHOUSE_IN_USE' || isWarehouseForeignKeyError(raw)) {
    return (
      raw ||
      'Bu depo geçmiş kayıtlarda kullanıldığı için kaldırılamadı. Yeniden deneyin veya destek alın.'
    );
  }
  if (code === 'WAREHOUSE_HAS_STOCK' || code === 'WAREHOUSE_HAS_ACTIVE_RENTALS') {
    return raw || 'Depo kullanımdan kaldırılamadı.';
  }
  if (status === 409) {
    return raw || 'Depo kullanımdan kaldırılamadı.';
  }
  if (status && status >= 500) {
    return 'Depo kaldırılamadı. Lütfen tekrar deneyin.';
  }
  return sanitizeDatabaseErrorMessage(getUserFacingErrorMessage(error, 'Depo kaldırılamadı.'));
}

export function getStockReceiptDeleteErrorMessage(error: unknown): string {
  const status = (error as { status?: number })?.status;
  if (status === 404) {
    return (
      'Silme servisi sunucuda bulunamadı (404). Backend\'de DELETE /stock-receipts/:id route\'u ve ' +
      '066 migration\'ının production\'a deploy edildiğinden emin olun.'
    );
  }
  if (status === 403) {
    return (
      'Stok fişi silme yetkiniz yok. Kullanıcıya stockReceipts_delete izni verin ve tekrar giriş yapın.'
    );
  }
  if (status === 409) {
    return (
      getApiErrorMessage(error) ||
      'Yalnızca iptal edilmiş fişler silinebilir. Önce fişi iptal edin.'
    );
  }
  return getApiErrorMessage(error) || 'Silme işlemi başarısız';
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

/** Ham veritabanı / FK hata metinlerini kullanıcıya gösterme. */
function sanitizeDatabaseErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('foreign key') ||
    lower.includes('violates foreign key') ||
    lower.includes('violates not-null') ||
    lower.includes('duplicate key value') ||
    lower.includes('postgres') ||
    /\b23\d{3}\b/.test(message)
  ) {
    return 'İşlem başarısız. Lütfen tekrar deneyin.';
  }
  return message;
}

/** Pasif / arşiv envanter API mesajlarını kullanıcı dostu Türkçe'ye çevirir. Eşleşme yoksa null. */
function classifyArchivedInventoryApiMessage(raw: string): string | null {
  if (!raw?.trim()) return null;
  const lower = raw.toLowerCase();

  if (
    (lower.includes('kirada') && (lower.includes('ürün') || lower.includes('urun'))) ||
    (lower.includes('onrent') && (lower.includes('pasif') || lower.includes('silin')))
  ) {
    return 'Kirada olan ürün pasife alınamaz. Önce iade işlemini tamamlayın.';
  }

  if (
    lower.includes('assertactiveinventory') ||
    ((lower.includes('bulunamadı') || lower.includes('bulunamadi') || lower.includes('not found')) &&
      (lower.includes('arşiv') || lower.includes('arsiv') || lower.includes('pasif') || lower.includes('archived')))
  ) {
    return 'Seçilen ürün bulunamadı veya pasif durumda.';
  }

  if (
    lower.includes('foreign key') ||
    lower.includes('violates foreign key') ||
    (lower.includes('inventories') &&
      (lower.includes('constraint') || lower.includes('referenc') || lower.includes('fk'))) ||
    /\b23503\b/.test(raw)
  ) {
    return 'Bu ürün geçmiş kayıtlarda kullanıldığı için işlem tamamlanamadı. Ürünü pasife almayı deneyin.';
  }

  if (lower.includes('pasif') && (lower.includes('seçilemez') || lower.includes('secilemez'))) {
    return raw.trim();
  }

  if (
    lower.includes('pasif') ||
    lower.includes('arşiv') ||
    lower.includes('arsiv') ||
    lower.includes('archived') ||
    lower.includes('deletedat') ||
    lower.includes('pasife alınamaz') ||
    lower.includes('pasife alinamaz')
  ) {
    if (lower.includes('kirada')) {
      return 'Kirada olan ürün pasife alınamaz. Önce iade işlemini tamamlayın.';
    }
    return 'Bu ürün pasif durumda; yeni işlemde kullanılamaz.';
  }

  return null;
}

export type UserFacingApiErrorContext =
  | 'inventory-delete'
  | 'quote-save'
  | 'quote-convert'
  | 'quote-reject'
  | 'quote-delete'
  | 'contract-save'
  | 'contract-cancel'
  | 'contract-archive'
  | 'contract-add-line'
  | 'addendum'
  | 'stock-receipt'
  | 'package-save'
  | 'purchase-invoice'
  | 'excel-import'
  | 'generic';

const CONTEXT_FALLBACKS: Record<Exclude<UserFacingApiErrorContext, 'inventory-delete'>, string> = {
  'quote-save': 'Seçilen ürün pasif durumda veya kullanılamıyor.',
  'quote-convert': 'Seçilen ürün pasif durumda veya kullanılamıyor.',
  'quote-reject': 'Teklif reddedilemedi.',
  'quote-delete': 'Teklif silinemedi.',
  'contract-save': 'Pasif ürün bu işlemde kullanılamaz.',
  'contract-cancel': 'Sözleşme iptal edilemedi.',
  'contract-archive': 'Sözleşme arşivlenemedi.',
  'contract-add-line': 'Pasif ürün bu işlemde kullanılamaz.',
  addendum: 'Zeyilname işlemi başarısız.',
  'stock-receipt': 'Pasif ürün stok hareketine eklenemez.',
  'package-save': 'Pasif ürün pakete eklenemez.',
  'purchase-invoice': 'Pasif ürün bu işlemde kullanılamaz.',
  'excel-import': 'Pasif veya geçersiz ürün eşleşmesi.',
  generic: 'İşlem başarısız. Lütfen tekrar deneyin.',
};

const CONTEXT_PREFIXES: Partial<
  Record<Exclude<UserFacingApiErrorContext, 'inventory-delete' | 'generic'>, string>
> = {
  'quote-save': 'Teklif kaydedilemedi',
  'quote-convert': 'Teklif sözleşmeye dönüştürülemedi',
  'quote-reject': 'Teklif reddedilemedi',
  'quote-delete': 'Teklif silinemedi',
  'contract-save': 'Sözleşme kaydedilemedi',
  'contract-cancel': 'Sözleşme iptal edilemedi',
  'contract-archive': 'Sözleşme arşivlenemedi',
  'contract-add-line': 'Sözleşmeye kalem eklenemedi',
  addendum: 'Zeyilname işlemi başarısız',
  'stock-receipt': 'Stok fişi kaydedilemedi',
  'package-save': 'Paket oluşturulamadı',
  'purchase-invoice': 'Alış faturası kaydedilemedi',
  'excel-import': 'İçe aktarma başarısız',
};

function withContextPrefix(context: UserFacingApiErrorContext, detail: string): string {
  if (context === 'inventory-delete' || context === 'generic') return detail;
  const prefix = CONTEXT_PREFIXES[context];
  if (!prefix || detail.startsWith(prefix)) return detail;
  return `${prefix}: ${detail}`;
}

/** Dönüştürülmüş teklif silme/düzenleme 400 hataları. */
export function isConvertedQuoteApiError(error: unknown): boolean {
  const raw = getApiErrorMessage(error);
  if (!raw?.trim()) return false;
  const lower = raw.toLowerCase();
  const status = (error as { status?: number })?.status;
  if (status !== 400) return false;
  return (
    (lower.includes('sözleşme') || lower.includes('sozlesme') || lower.includes('contract')) &&
    (lower.includes('bağlı') || lower.includes('bagli') || lower.includes('bound') || lower.includes('converted') || lower.includes('aktif'))
  );
}

export function isArchivedInventoryApiError(error: unknown): boolean {
  const raw = getApiErrorMessage(error);
  if (classifyArchivedInventoryApiMessage(raw) || classifyArchivedInventoryApiMessage(sanitizeDatabaseErrorMessage(raw))) {
    return true;
  }
  const status = (error as { status?: number })?.status;
  if (status !== 400 && status !== 409) return false;
  const lower = raw.toLowerCase();
  return (
    lower.includes('itemid') ||
    lower.includes('inventory') ||
    lower.includes('assertactiveinventory') ||
    ((lower.includes('ürün') || lower.includes('urun') || lower.includes('malzeme')) &&
      !lower.includes('müşteri') &&
      !lower.includes('musteri'))
  );
}

export function getUserFacingApiErrorMessage(
  error: unknown,
  context: UserFacingApiErrorContext = 'generic'
): string {
  if (context === 'inventory-delete') {
    return getInventoryDeleteErrorMessage(error);
  }

  const status = (error as { status?: number })?.status;
  const raw = getApiErrorMessage(error);
  const classified =
    classifyArchivedInventoryApiMessage(raw) ?? classifyArchivedInventoryApiMessage(sanitizeDatabaseErrorMessage(raw));

  if (classified) {
    return withContextPrefix(context, classified);
  }

  if (status && status >= 500) {
    return 'İşlem başarısız. Lütfen tekrar deneyin.';
  }

  const fallbackDetail = CONTEXT_FALLBACKS[context === 'generic' ? 'generic' : context];
  const networkSafe = sanitizeDatabaseErrorMessage(getUserFacingErrorMessage(error, fallbackDetail));

  if (context !== 'generic' && isArchivedInventoryApiError(error)) {
    return withContextPrefix(context, fallbackDetail);
  }

  return withContextPrefix(context, networkSafe);
}

export type InventoryRestoreErrorResult = {
  severity: 'error' | 'warning';
  message: string;
  showConflictModal: boolean;
};

/** POST /inventory/:id/restore hata yanıtları */
export function getInventoryRestoreErrorResult(error: unknown): InventoryRestoreErrorResult {
  const status = (error as { status?: number })?.status;
  const raw = getApiErrorMessage(error);

  if (status === 404) {
    return {
      severity: 'error',
      message: raw || 'Ürün bulunamadı.',
      showConflictModal: false,
    };
  }

  if (status === 409) {
    const lower = raw.toLowerCase();
    const alreadyActive =
      lower.includes('zaten aktif') ||
      (lower.includes('aktif') && (lower.includes('ürün') || lower.includes('urun')) && lower.includes('zaten'));
    if (alreadyActive) {
      return { severity: 'warning', message: raw || 'Ürün zaten aktif.', showConflictModal: false };
    }
    return {
      severity: 'warning',
      message: raw || 'Ürün geri getirilemedi; aktif kayıtla çakışma var.',
      showConflictModal: true,
    };
  }

  if (status && status >= 500) {
    return {
      severity: 'error',
      message: 'İşlem başarısız. Lütfen tekrar deneyin.',
      showConflictModal: false,
    };
  }

  return {
    severity: 'error',
    message: sanitizeDatabaseErrorMessage(
      getUserFacingErrorMessage(error, 'Ürün geri getirilemedi.')
    ),
    showConflictModal: false,
  };
}

export function getInventoryDeleteErrorMessage(error: unknown): string {
  const status = (error as { status?: number })?.status;
  if (status === 400 || status === 409) {
    return sanitizeDatabaseErrorMessage(getUserFacingErrorMessage(error, 'İşlem yapılamadı.'));
  }
  if (status && status >= 500) {
    return 'İşlem başarısız. Lütfen tekrar deneyin.';
  }
  const msg = getUserFacingErrorMessage(error, 'İşlem başarısız. Lütfen tekrar deneyin.');
  return sanitizeDatabaseErrorMessage(msg);
}

export function formatInventoryRelatedApiText(
  message: string,
  context: UserFacingApiErrorContext = 'generic'
): string {
  const classified = classifyArchivedInventoryApiMessage(message);
  if (classified) return withContextPrefix(context, classified);
  return sanitizeDatabaseErrorMessage(message);
}

/** Pasif ürün seçimi / güncelleme API yanıtlarında kullanıcı dostu mesaj. */
export function userMessageForArchivedInventoryApiError(error: unknown, fallback: string): string {
  const raw = getApiErrorMessage(error);
  const classified =
    classifyArchivedInventoryApiMessage(raw) ?? classifyArchivedInventoryApiMessage(sanitizeDatabaseErrorMessage(raw));
  if (classified) return classified;
  const status = (error as { status?: number })?.status;
  if (status && status >= 500) {
    return 'İşlem başarısız. Lütfen tekrar deneyin.';
  }
  return sanitizeDatabaseErrorMessage(getUserFacingErrorMessage(error, fallback));
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

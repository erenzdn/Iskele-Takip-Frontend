import { apiClient } from './apiClient';
import { ContractQuoteType, Quote, QuoteDetail, QuoteStatus } from '../models';
import { CreateSiteRequest } from './siteService';

export interface CreateQuoteDetailRequest {
  ItemId: number;
  Quantity: number;
  is_manual?: boolean;
  Description?: string;
  /** Envanter satırları için satır bazlı ürün adı override (boş/whitespace => null). */
  ItemNameOverride?: string | null;
  /** Envanter satırları için satır bazlı ürün kodu override (boş/whitespace => null). */
  ItemCodeOverride?: string | null;
  /** SALE: satır bazlı birim fiyat override */
  OverrideUnitPrice?: number;
  /** RENTAL: satır bazlı aylık fiyat override */
  OverrideMonthlyPrice?: number;
  /**
   * Manuel kalemler için mevcut mantık korunur:
   * - is_manual: true, Description, Quantity, DailyPrice
   * Backend bunu UnitPriceSnapshot olarak saklar.
   */
  DailyPrice?: number;
}

export interface CreateQuoteRequest {
  QuoteCode?: string;
  Subject?: string | null;
  CustomerId?: number | null;
  CustomerAuthorizedContactId?: number | null;
  SiteId?: number;
  newSite?: CreateSiteRequest;
  StartDate?: string; // ISO 8601 (RENTAL için opsiyonel; boşsa gönderilmez)
  /** Kiralama (RENTAL) için tarih aralığı kullanılır; başlangıç tarihi backendce dönüşüm anında atanabilir */
  PlannedEndDate?: string; // ISO 8601
  /** RENTAL: tam sayı gün (min 1); StartDate+PlannedEndDate yerine veya birlikte */
  RentalDurationDays?: number;
  Status?: QuoteStatus;
  Notes?: string;
  Iskonto?: number;
  VatRate?: number;
  Currency?: 'TRY' | 'EUR' | 'USD';
  Type?: ContractQuoteType;
  Language?: 'TR' | 'EN';
  details: CreateQuoteDetailRequest[];
}

export interface UpdateQuoteRequest {
  QuoteCode?: string;
  Subject?: string | null;
  CustomerId?: number | null;
  CustomerAuthorizedContactId?: number | null;
  SiteId?: number;
  newSite?: CreateSiteRequest;
  /** RENTAL */
  StartDate?: string;
  /** RENTAL */
  PlannedEndDate?: string;
  /** RENTAL: gün-only güncellemede backend planlı bitişi temizleyebilir */
  RentalDurationDays?: number;
  Status?: QuoteStatus;
  Notes?: string;
  Iskonto?: number;
  VatRate?: number;
  Currency?: 'TRY' | 'EUR' | 'USD';
  Language?: 'TR' | 'EN';
  /** Mevcut teklif güncellemede de kalemleri güncellemek için */
  details?: CreateQuoteDetailRequest[];
}

export interface UpdateQuoteResponse {
  warnings?: string[];
  CreatedSiteId?: number;
}

export interface CreateQuoteResponse {
  QuoteId: number;
  warnings?: string[];
  CreatedSiteId?: number;
}

export interface ConvertQuoteResponse {
  message: string;
  ContractId: number;
  warnings?: string[];
}

export interface ConvertQuoteRequest {
  decrementStock: boolean;
  warehouseAssignments?: WarehouseAssignment[];
  defaultWarehouseId?: number;
  /** RENTAL dönüşümünde zorunlu (ISO 8601) */
  StartDate?: string;
  /** RENTAL dönüşümünde zorunlu (ISO 8601) */
  PlannedEndDate?: string;
}

// POST /api/quotes/:id/clone yaniti GET /api/quotes/:id ile ayni formatta yeni teklifi
// (alanlar + details[]) ve ek olarak message ile birlikte dondurur.
export type CloneQuoteResponse = Quote & {
  message: string;
  details?: QuoteDetail[];
};

export interface CreateQuoteFromPackageRequest {
  CustomerId: number;
  CustomerAuthorizedContactId: number;
  SiteId?: number;
  newSite?: CreateSiteRequest;
  StartDate?: string;
  /** Kiralama için opsiyonel */
  PlannedEndDate?: string;
  RentalDurationDays?: number;
  Currency?: 'TRY' | 'EUR' | 'USD';
  Type?: ContractQuoteType;
}

export interface CreateQuoteFromPackageResponse {
  QuoteId: number;
  message: string;
  warnings?: string[];
  CreatedSiteId?: number;
}

export interface WarehouseAssignment {
  ItemId: number;
  WarehouseId: number;
  Quantity: number;
}

/**
 * GET /quotes sorgu parametreleri.
 * `converted` = geçmiş liste filtresi (DB Status değil; ConvertedContractId dolu kayıtlar).
 * Varsayılan liste dönüşmüş teklifleri döndürmez; `includeConverted` yalnızca denetim için.
 */
export type QuoteListStatus = QuoteStatus | 'converted';

export type QuoteListQuery = {
  status?: QuoteListStatus;
  quoteType?: ContractQuoteType;
  search?: string;
  includeConverted?: boolean;
};

function buildQuotesListPath(query?: QuoteListQuery): string {
  const sp = new URLSearchParams();
  if (query?.status) sp.set('status', query.status);
  if (query?.quoteType) sp.set('type', query.quoteType);
  const s = query?.search?.trim();
  if (s) sp.set('search', s);
  if (query?.includeConverted === true) sp.set('includeConverted', 'true');
  const qs = sp.toString();
  return qs ? `/quotes?${qs}` : '/quotes';
}

function parseQuoteListArg(
  arg?: QuoteListStatus | QuoteListQuery
): QuoteListQuery | undefined {
  if (arg === undefined) return undefined;
  if (typeof arg === 'string') return { status: arg };
  return arg;
}

function normalizeQuote(raw: any): Quote {
  const convertedContractId = raw?.ConvertedContractId ?? raw?.convertedContractId;
  const isConvertedRaw = raw?.IsConverted ?? raw?.isConverted;
  const isConverted =
    isConvertedRaw === true ||
    isConvertedRaw === 1 ||
    isConvertedRaw === 'true' ||
    (convertedContractId != null && convertedContractId !== '');
  return {
    ...(raw as Quote),
    ConvertedContractId:
      convertedContractId != null && convertedContractId !== ''
        ? Number(convertedContractId)
        : undefined,
    ConvertedAt: raw?.ConvertedAt ?? raw?.convertedAt ?? null,
    IsConverted: isConverted,
    RentalDurationDays: raw?.RentalDurationDays ?? raw?.rentalDurationDays ?? null,
  };
}

function normalizeQuoteList(raw: unknown): Quote[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => normalizeQuote(item));
}

export const quoteService = {
  /**
   * Teklif listesi.
   * Sunucu filtresi: getAllAsync({ quoteType: 'SALE', status: 'pending' })
   */
  async getAllAsync(arg?: QuoteListStatus | QuoteListQuery): Promise<Quote[]> {
    const query = parseQuoteListArg(arg);
    const url = buildQuotesListPath(query);
    try {
      const rows = await apiClient.get<Quote[]>(url);
      return normalizeQuoteList(rows);
    } catch (error) {
      // Bazı backend sürümlerinde /quotes (parametresiz) 500 dönebilir.
      // status, type veya includeConverted ile filtre varsa birleştirme denemesi yapılmaz.
      if (query?.status != null || query?.quoteType != null || query?.includeConverted) throw error;
      const failures: unknown[] = [];
      const s = query?.search?.trim();
      const base: QuoteListQuery = s ? { search: s } : {};
      const [pending, accepted, rejected, draft] = await Promise.all([
        apiClient
          .get<Quote[]>(buildQuotesListPath({ ...base, status: QuoteStatus.Pending }))
          .catch((e) => {
            failures.push(e);
            return [];
          }),
        apiClient
          .get<Quote[]>(buildQuotesListPath({ ...base, status: QuoteStatus.Accepted }))
          .catch((e) => {
            failures.push(e);
            return [];
          }),
        apiClient
          .get<Quote[]>(buildQuotesListPath({ ...base, status: QuoteStatus.Rejected }))
          .catch((e) => {
            failures.push(e);
            return [];
          }),
        apiClient
          .get<Quote[]>(buildQuotesListPath({ ...base, status: QuoteStatus.Draft }))
          .catch((e) => {
            failures.push(e);
            return [];
          }),
      ]);
      const map = new Map<number, Quote>();
      [...draft, ...pending, ...accepted, ...rejected]
        .map((q) => normalizeQuote(q))
        .forEach((q) => map.set(q.QuoteId, q));
      const merged = Array.from(map.values()).sort((a, b) => b.QuoteId - a.QuoteId);
      if (merged.length === 0 && failures.length >= 4) {
        throw (failures[0] ?? error);
      }
      return merged;
    }
  },

  async getByIdAsync(id: number): Promise<Quote> {
    const row = await apiClient.get<Quote>(`/quotes/${id}`);
    return normalizeQuote(row);
  },

  async getPendingQuotesAsync(): Promise<Quote[]> {
    const rows = await apiClient.get<Quote[]>('/quotes?status=pending');
    return normalizeQuoteList(rows);
  },

  async getAcceptedQuotesAsync(): Promise<Quote[]> {
    const rows = await apiClient.get<Quote[]>('/quotes?status=accepted');
    return normalizeQuoteList(rows);
  },

  async getRejectedQuotesAsync(): Promise<Quote[]> {
    const rows = await apiClient.get<Quote[]>('/quotes?status=rejected');
    return normalizeQuoteList(rows);
  },

  async createAsync(data: CreateQuoteRequest): Promise<CreateQuoteResponse> {
    const payload: Record<string, unknown> = { ...data };
    const qType = String((data as any).Type ?? '').toUpperCase();
    const normalizedStartDate = typeof data.StartDate === 'string' ? data.StartDate.trim() : '';
    if (!normalizedStartDate) {
      delete payload.StartDate;
    }
    const normalizedPlannedEnd =
      typeof data.PlannedEndDate === 'string' ? data.PlannedEndDate.trim() : '';
    if (!normalizedPlannedEnd) {
      delete payload.PlannedEndDate;
    }
    const rd = Number((data as any).RentalDurationDays);
    if (!Number.isFinite(rd) || rd < 1) {
      delete payload.RentalDurationDays;
    } else {
      payload.RentalDurationDays = Math.floor(rd);
    }
    if (data.CustomerId == null || !Number.isFinite(Number(data.CustomerId))) {
      delete payload.CustomerId;
    }
    if (
      data.CustomerAuthorizedContactId == null ||
      !Number.isFinite(Number(data.CustomerAuthorizedContactId))
    ) {
      delete payload.CustomerAuthorizedContactId;
    }
    if (qType === 'SALE') {
      delete payload.StartDate;
      delete payload.PlannedEndDate;
      delete payload.RentalDurationDays;
    }
    return apiClient.post<CreateQuoteResponse>('/quotes', payload);
  },

  async updateAsync(id: number, data: UpdateQuoteRequest): Promise<Quote & UpdateQuoteResponse> {
    const payload: Record<string, unknown> = { ...data };
    const qType = String((data as any).Type ?? '').toUpperCase();
    if (data.CustomerId == null || !Number.isFinite(Number(data.CustomerId))) {
      delete payload.CustomerId;
    } else {
      payload.CustomerId = Number(data.CustomerId);
    }
    if (
      data.CustomerAuthorizedContactId == null ||
      !Number.isFinite(Number(data.CustomerAuthorizedContactId))
    ) {
      delete payload.CustomerAuthorizedContactId;
    }
    // Type gönderilmese bile, SALE akışında tarih/saha gibi alanları göndermemek güvenli.
    if (qType === 'SALE') {
      delete payload.StartDate;
      delete payload.PlannedEndDate;
      delete payload.RentalDurationDays;
    }
    const normalizedStartDate = typeof (payload as any).StartDate === 'string' ? String((payload as any).StartDate).trim() : '';
    if (!normalizedStartDate) {
      delete payload.StartDate;
    }
    const normalizedPlannedEnd =
      typeof (payload as any).PlannedEndDate === 'string' ? String((payload as any).PlannedEndDate).trim() : '';
    if (!normalizedPlannedEnd) {
      delete payload.PlannedEndDate;
    }
    const rdUp = Number((payload as any).RentalDurationDays);
    if (!Number.isFinite(rdUp) || rdUp < 1) {
      delete payload.RentalDurationDays;
    } else {
      payload.RentalDurationDays = Math.floor(rdUp);
    }
    return apiClient.patch<Quote & UpdateQuoteResponse>(`/quotes/${id}`, payload).then((raw) => ({
      ...normalizeQuote(raw),
      CreatedSiteId: (raw as UpdateQuoteResponse)?.CreatedSiteId ?? (raw as any)?.createdSiteId,
    }));
  },

  async deleteAsync(id: number, options?: { reason?: string }): Promise<void> {
    const trimmed = options?.reason?.trim();
    const body = trimmed ? { reason: trimmed } : undefined;
    return apiClient.delete<void>(`/quotes/${id}`, body);
  },

  /**
   * Late binding: gövdede `defaultWarehouseId` veya `warehouseAssignments` zorunlu (boş gövde gönderilmez).
   */
  async convertToContractAsync(
    id: number,
    options: ConvertQuoteRequest
  ): Promise<ConvertQuoteResponse> {
    const body: ConvertQuoteRequest = {
      decrementStock: options.decrementStock,
    };
    if (options.defaultWarehouseId != null) {
      body.defaultWarehouseId = options.defaultWarehouseId;
    }
    if (options.warehouseAssignments != null && options.warehouseAssignments.length > 0) {
      body.warehouseAssignments = options.warehouseAssignments;
    }
    if (options.StartDate != null && String(options.StartDate).trim()) {
      body.StartDate = options.StartDate;
    }
    if (options.PlannedEndDate != null && String(options.PlannedEndDate).trim()) {
      body.PlannedEndDate = options.PlannedEndDate;
    }
    if (body.defaultWarehouseId == null && (body.warehouseAssignments == null || body.warehouseAssignments.length === 0)) {
      throw new Error('Dönüşüm için defaultWarehouseId veya warehouseAssignments gerekli.');
    }
    return apiClient.post<ConvertQuoteResponse>(`/quotes/${id}/convert`, body);
  },

  async acceptQuoteAsync(id: number): Promise<Quote> {
    return apiClient.patch<Quote>(`/quotes/${id}`, { Status: 'accepted' });
  },

  async rejectQuoteAsync(id: number, rejectionReason: string): Promise<Quote> {
    return apiClient.patch<Quote>(`/quotes/${id}`, { Status: 'rejected', rejectionReason });
  },

  async cloneQuoteAsync(id: number): Promise<CloneQuoteResponse> {
    const raw = await apiClient.post<any>(`/quotes/${id}/clone`, {});
    const normalized = normalizeQuote(raw);
    const details: QuoteDetail[] | undefined = Array.isArray(raw?.details)
      ? raw.details
      : Array.isArray(raw?.QuoteDetails)
        ? raw.QuoteDetails
        : undefined;
    return {
      ...(normalized as Quote),
      QuoteDetails: details ?? normalized.QuoteDetails,
      details,
      message: typeof raw?.message === 'string' ? raw.message : 'Teklif kopyalandi.',
    } as CloneQuoteResponse;
  },

  async createFromPackageAsync(
    packageId: string | number,
    data: CreateQuoteFromPackageRequest
  ): Promise<CreateQuoteFromPackageResponse> {
    const normalizedId = String(packageId).trim();
    const payload: Record<string, unknown> = { ...data };
    const qType = String((data as any).Type ?? '').toUpperCase();
    const normalizedStartDate = typeof data.StartDate === 'string' ? data.StartDate.trim() : '';
    if (!normalizedStartDate) {
      delete payload.StartDate;
    }
    const normalizedPlannedEndPkg =
      typeof data.PlannedEndDate === 'string' ? data.PlannedEndDate.trim() : '';
    if (!normalizedPlannedEndPkg) {
      delete payload.PlannedEndDate;
    }
    const rdPkg = Number((data as any).RentalDurationDays);
    if (!Number.isFinite(rdPkg) || rdPkg < 1) {
      delete payload.RentalDurationDays;
    } else {
      payload.RentalDurationDays = Math.floor(rdPkg);
    }
    if (qType === 'SALE') {
      delete payload.StartDate;
      delete payload.PlannedEndDate;
      delete payload.RentalDurationDays;
    }
    return apiClient.post<CreateQuoteFromPackageResponse>(
      `/quotes/from-package/${encodeURIComponent(normalizedId)}`,
      payload
    );
  },

  async generateDocumentAsync(
    quoteId: number,
    templateId: number,
    format: 'pdf' | 'docx' = 'pdf'
  ): Promise<Blob> {
    return apiClient.postBlob(`/quotes/${quoteId}/generate-document`, {
      templateId,
      format,
    });
  },

  async previewDocumentAsync(quoteId: number, templateId: number): Promise<Blob> {
    return apiClient.postBlob(`/quotes/${quoteId}/preview-document`, { templateId });
  },
};

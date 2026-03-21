import { apiClient } from './apiClient';
import { Quote, QuoteStatus } from '../models';

export interface CreateQuoteDetailRequest {
  ItemId: number;
  Quantity: number;
  DailyPrice?: number;
  is_manual?: boolean;
  Description?: string;
}

export interface CreateQuoteRequest {
  QuoteCode?: string;
  CustomerId: number;
  SiteId?: number;
  StartDate: string; // ISO 8601
  PlannedEndDate: string; // ISO 8601
  Status?: QuoteStatus;
  Notes?: string;
  Iskonto?: number;
  VatRate?: number;
  Currency?: 'TRY' | 'EUR';
  details: CreateQuoteDetailRequest[];
}

export interface UpdateQuoteRequest {
  QuoteCode?: string;
  SiteId?: number;
  Status?: QuoteStatus;
  Iskonto?: number;
  VatRate?: number;
  Currency?: 'TRY' | 'EUR';
}

export interface CreateQuoteResponse {
  QuoteId: number;
}

export interface ConvertQuoteResponse {
  message: string;
  ContractId: number;
}

export interface CloneQuoteResponse {
  QuoteId: number;
  message: string;
}

export interface CreateQuoteFromPackageRequest {
  CustomerId: number;
  SiteId?: number;
  StartDate: string;
  PlannedEndDate: string;
  Currency?: 'TRY' | 'EUR';
}

export interface CreateQuoteFromPackageResponse {
  QuoteId: number;
  message: string;
}

export interface WarehouseAssignment {
  ItemId: number;
  WarehouseId: number;
  Quantity: number;
}

export const quoteService = {
  async getAllAsync(status?: QuoteStatus): Promise<Quote[]> {
    const url = status ? `/quotes?status=${status}` : '/quotes';
    try {
      return await apiClient.get<Quote[]>(url);
    } catch (error) {
      // Bazı backend sürümlerinde /quotes (status'suz) 500 dönebilir.
      // Bu durumda statü bazlı ayrı isteklerle listeyi toparla.
      if (status) throw error;
      const failures: unknown[] = [];
      const [pending, accepted, rejected] = await Promise.all([
        apiClient
          .get<Quote[]>('/quotes?status=pending')
          .catch((e) => {
            failures.push(e);
            return [];
          }),
        apiClient
          .get<Quote[]>('/quotes?status=accepted')
          .catch((e) => {
            failures.push(e);
            return [];
          }),
        apiClient
          .get<Quote[]>('/quotes?status=rejected')
          .catch((e) => {
            failures.push(e);
            return [];
          }),
      ]);
      const map = new Map<number, Quote>();
      [...pending, ...accepted, ...rejected].forEach((q) => map.set(q.QuoteId, q));
      const merged = Array.from(map.values()).sort((a, b) => b.QuoteId - a.QuoteId);
      if (merged.length === 0 && failures.length >= 3) {
        throw (failures[0] ?? error);
      }
      return merged;
    }
  },

  async getByIdAsync(id: number): Promise<Quote> {
    return apiClient.get<Quote>(`/quotes/${id}`);
  },

  async getPendingQuotesAsync(): Promise<Quote[]> {
    return apiClient.get<Quote[]>('/quotes?status=pending');
  },

  async getAcceptedQuotesAsync(): Promise<Quote[]> {
    return apiClient.get<Quote[]>('/quotes?status=accepted');
  },

  async getRejectedQuotesAsync(): Promise<Quote[]> {
    return apiClient.get<Quote[]>('/quotes?status=rejected');
  },

  async createAsync(data: CreateQuoteRequest): Promise<CreateQuoteResponse> {
    return apiClient.post<CreateQuoteResponse>('/quotes', data);
  },

  async updateAsync(id: number, data: UpdateQuoteRequest): Promise<Quote> {
    return apiClient.patch<Quote>(`/quotes/${id}`, data);
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/quotes/${id}`);
  },

  /** Dönüşüm seçenekleri: defaultWarehouseId (tümü tek depodan) veya warehouseAssignments (ürün bazlı) */
  async convertToContractAsync(
    id: number,
    options?: { warehouseAssignments?: WarehouseAssignment[]; defaultWarehouseId?: number }
  ): Promise<ConvertQuoteResponse> {
    const body: Record<string, unknown> = {};
    if (options?.defaultWarehouseId != null) {
      body.defaultWarehouseId = options.defaultWarehouseId;
    }
    if (options?.warehouseAssignments?.length) {
      body.warehouseAssignments = options.warehouseAssignments;
    }
    return apiClient.post<ConvertQuoteResponse>(`/quotes/${id}/convert`, body);
  },

  async acceptQuoteAsync(id: number): Promise<Quote> {
    return apiClient.patch<Quote>(`/quotes/${id}`, { Status: 'accepted' });
  },

  async rejectQuoteAsync(id: number): Promise<Quote> {
    return apiClient.patch<Quote>(`/quotes/${id}`, { Status: 'rejected' });
  },

  async cloneQuoteAsync(id: number): Promise<CloneQuoteResponse> {
    return apiClient.post<CloneQuoteResponse>(`/quotes/${id}/clone`, {});
  },

  async createFromPackageAsync(
    packageId: string | number,
    data: CreateQuoteFromPackageRequest
  ): Promise<CreateQuoteFromPackageResponse> {
    const normalizedId = String(packageId).trim();
    return apiClient.post<CreateQuoteFromPackageResponse>(
      `/quotes/from-package/${encodeURIComponent(normalizedId)}`,
      data
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

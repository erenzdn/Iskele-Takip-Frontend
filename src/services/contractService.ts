import { apiClient } from './apiClient';
import {
  AuditLog,
  Contract,
  ContractQuoteType,
  ContractReturn,
  ContractPriceCalculation,
  ContractStatusFilter,
  ReturnItemResponse,
  SettleNonReturnRequest,
} from '../models';
import { CreateSiteRequest } from './siteService';
import {
  DEFAULT_PAGE_LIMIT,
  fetchAllPaginatedPages,
  normalizePaginatedResponse,
  type PaginatedResponse,
} from '../utils/paginatedResponse';

export interface CreateContractDetailRequest {
  ItemId: number;
  WarehouseId: number;
  RentedQuantity: number;
  /** Envanter satırları için satır bazlı ürün kodu override (boş/whitespace => null). */
  ItemCodeOverride?: string | null;
}

export interface CreateContractManualDetailRequest {
  IsManual: true;
  Description: string;
  RentedQuantity: number;
  UnitPriceSnapshot: number;
}

export type CreateContractDetailPayload = CreateContractDetailRequest | CreateContractManualDetailRequest;

export interface CreateContractRequest {
  ContractCode?: string;
  CustomerId: number;
  CustomerAuthorizedContactId: number;
  SiteId?: number;
  newSite?: CreateSiteRequest;
  StartDate: string; // ISO 8601
  PlannedEndDate: string; // ISO 8601
  InitialTotalPrice: number;
  IsCompleted: boolean;
  Iskonto?: number;  // yüzde
  VatRate?: number;  // yüzde
  Currency?: 'TRY' | 'EUR';
  Type?: ContractQuoteType;
  Language?: 'TR' | 'EN';
  /** Opsiyonel. Bir kalemde WarehouseId yoksa bu depo kullanılır; depo stoğu düşümü için her detayda WarehouseId veya bu alan gerekir. */
  defaultWarehouseId?: number;
  details: CreateContractDetailPayload[];
}

export interface UpdateContractRequest {
  ContractCode?: string;
  CustomerAuthorizedContactId?: number;
  SiteId?: number;
  newSite?: CreateSiteRequest;
  Iskonto?: number;
  VatRate?: number;
  Currency?: 'TRY' | 'EUR';
  IsCompleted?: boolean;
  /** ISO 8601 */
  StartDate?: string;
  /** Kiralama sözleşmesi planlanan bitiş (ISO 8601) */
  PlannedEndDate?: string;
  Language?: 'TR' | 'EN';
}

export interface UpdateContractResponse {
  warnings?: string[];
  CreatedSiteId?: number;
}

export interface CreateContractResponse {
  ContractId: number;
  warnings?: string[];
  CreatedSiteId?: number;
}

export interface RevertToQuoteResponse {
  message: string;
  QuoteId: number | null;
}

export interface CancelContractResponse {
  message: string;
  ContractId: number;
  CancelledAt: string;
  QuoteId: number | null;
  QuoteReleased: boolean;
}

export type AddContractDetailInventoryRequest = {
  ItemId: number;
  WarehouseId: number;
  RentedQuantity: number;
  IsManual?: false;
  /** Envanter satırları için satır bazlı ürün kodu override (boş/whitespace => null). */
  ItemCodeOverride?: string | null;
  /** Kiralama sözleşmesi için: gönderilmezse backend "şimdi" kabul eder */
  EffectiveStartDate?: string;
};

export type AddContractDetailManualRequest = {
  IsManual: true;
  Description: string;
  RentedQuantity: number;
  UnitPriceSnapshot?: number;
};

export type AddContractDetailRequest = AddContractDetailInventoryRequest | AddContractDetailManualRequest;

export interface AddContractDetailsRequestBody {
  details: AddContractDetailRequest[];
  /** Satış sözleşmesinde opsiyonel; kiralamada genelde true kullanılır */
  decrementStock?: boolean;
}

export interface AddContractDetailsResponse {
  detailIds: number[];
  warnings?: string[];
  contract: Contract;
}

/** API .NET vb. PascalCase de dönebilir; tek tip camelCase modele çevirir. */
function parseContractPriceCalculation(raw: unknown): ContractPriceCalculation {
  const empty: ContractPriceCalculation = {
    contractId: 0,
    plannedDays: 0,
    basePrice: 0,
    totalLateFee: 0,
    finalPrice: 0,
    returns: [],
  };
  if (!raw || typeof raw !== 'object') return empty;
  const d = raw as Record<string, unknown>;
  const num = (camel: string, pascal: string): number => {
    const v = d[camel] ?? d[pascal];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const returnsRaw = d.returns ?? d.Returns;
  const returnsList: ContractPriceCalculation['returns'] = [];
  if (Array.isArray(returnsRaw)) {
    for (const item of returnsRaw) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      const rn = (c: string, p: string): number => {
        const v = r[c] ?? r[p];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      const rs = (c: string, p: string): string => {
        const v = r[c] ?? r[p];
        return typeof v === 'string' ? v : v != null ? String(v) : '';
      };
      returnsList.push({
        ReturnId: Math.floor(rn('returnId', 'ReturnId')),
        ItemId: Math.floor(rn('itemId', 'ItemId')),
        ReturnQuantity: Math.floor(rn('returnQuantity', 'ReturnQuantity')),
        ReturnDate: rs('returnDate', 'ReturnDate'),
        LateDays: Math.floor(rn('lateDays', 'LateDays')),
        LateFee: rn('lateFee', 'LateFee'),
      });
    }
  }
  return {
    contractId: Math.floor(num('contractId', 'ContractId')),
    plannedDays: Math.floor(num('plannedDays', 'PlannedDays')),
    basePrice: num('basePrice', 'BasePrice'),
    totalLateFee: num('totalLateFee', 'TotalLateFee'),
    finalPrice: num('finalPrice', 'FinalPrice'),
    returns: returnsList,
  };
}

export interface ContractListQuery {
  status?: ContractStatusFilter;
  type?: ContractQuoteType;
  search?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export interface ArchiveContractResponse {
  message: string;
  ContractId: number;
  ArchivedAt: string;
  ArchivedByUserId: number;
  ArchiveReason: string | null;
}

export interface UnarchiveContractResponse {
  message: string;
  ContractId: number;
}

function buildContractsEndpoint(query?: ContractListQuery): string {
  const sp = new URLSearchParams();
  if (query?.status) sp.set('status', query.status);
  if (query?.type) sp.set('type', query.type);
  const s = query?.search?.trim();
  if (s) sp.set('search', s);
  if (query?.includeArchived) sp.set('includeArchived', 'true');
  if (query?.limit != null) sp.set('limit', String(query.limit));
  if (query?.offset != null) sp.set('offset', String(query.offset));
  const qs = sp.toString();
  return qs ? `/contracts?${qs}` : '/contracts';
}

export const contractService = {
  async getPageAsync(query?: ContractListQuery): Promise<PaginatedResponse<Contract>> {
    const raw = await apiClient.get<Contract[] | PaginatedResponse<Contract>>(
      buildContractsEndpoint(query)
    );
    return normalizePaginatedResponse(
      raw,
      query?.limit ?? DEFAULT_PAGE_LIMIT,
      query?.offset ?? 0
    );
  },

  async getAllAsync(): Promise<Contract[]> {
    const page = await fetchAllPaginatedPages<Contract>((limit, offset) =>
      this.getPageAsync({ limit, offset })
    );
    return page.items;
  },

  async getByIdAsync(id: number): Promise<Contract> {
    return apiClient.get<Contract>(`/contracts/${id}`);
  },

  async listAsync(query: ContractListQuery): Promise<Contract[]> {
    const page = await fetchAllPaginatedPages<Contract>((limit, offset) =>
      this.getPageAsync({ ...query, limit, offset })
    );
    return page.items;
  },

  async getActiveContractsAsync(quoteType?: ContractQuoteType): Promise<Contract[]> {
    return this.listAsync({ status: 'active', type: quoteType });
  },

  async getCompletedContractsAsync(quoteType?: ContractQuoteType): Promise<Contract[]> {
    return this.listAsync({ status: 'completed', type: quoteType });
  },

  async createAsync(data: CreateContractRequest): Promise<CreateContractResponse> {
    return apiClient.post<CreateContractResponse>('/contracts', data);
  },

  async updateAsync(id: number, data: UpdateContractRequest): Promise<UpdateContractResponse> {
    return apiClient.patch<UpdateContractResponse>(`/contracts/${id}`, data as Record<string, unknown>);
  },

  async addDetailsAsync(id: number, body: AddContractDetailsRequestBody): Promise<AddContractDetailsResponse> {
    return apiClient.post<AddContractDetailsResponse>(
      `/contracts/${id}/details`,
      body as unknown as Record<string, unknown>
    );
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/contracts/${id}`);
  },

  /** Tamamlanmış veya iptal edilmiş sözleşmeyi arşivler. İzin: contracts_archive */
  async archiveAsync(id: number, reason?: string): Promise<ArchiveContractResponse> {
    const trimmed = reason?.trim();
    const body = trimmed && trimmed.length >= 3 ? { reason: trimmed } : {};
    return apiClient.post<ArchiveContractResponse>(`/contracts/${id}/archive`, body);
  },

  /** Arşivlenmiş sözleşmeyi geri getirir. İzin: contracts_archive */
  async unarchiveAsync(id: number): Promise<UnarchiveContractResponse> {
    return apiClient.post<UnarchiveContractResponse>(`/contracts/${id}/unarchive`, {});
  },

  async cancelAsync(id: number, reason: string): Promise<CancelContractResponse> {
    return apiClient.post<CancelContractResponse>(`/contracts/${id}/cancel`, { reason });
  },

  async revertToQuoteAsync(id: number): Promise<RevertToQuoteResponse> {
    return apiClient.post<RevertToQuoteResponse>(`/contracts/${id}/revert-to-quote`, {});
  },

  async completeContractAsync(id: number, actualEndDate: string): Promise<void> {
    return apiClient.patch<void>(`/contracts/${id}`, {
      ActualEndDate: actualEndDate,
      IsCompleted: true,
    });
  },

  async returnItemAsync(
    contractId: number,
    itemId: number,
    warehouseId: number,
    returnQuantity: number,
    options?: { returnDate?: string; returnWarehouseId?: number }
  ): Promise<ReturnItemResponse> {
    const body: Record<string, unknown> = {
      ItemId: itemId,
      WarehouseId: warehouseId,
      ReturnQuantity: returnQuantity,
    };
    if (options?.returnDate) {
      body.ReturnDate = options.returnDate;
    }
    if (options?.returnWarehouseId) {
      body.ReturnWarehouseId = options.returnWarehouseId;
    }
    return apiClient.post<ReturnItemResponse>(`/contracts/${contractId}/return`, body);
  },

  async settleNonReturnAsync(
    contractId: number,
    payload: SettleNonReturnRequest
  ): Promise<ReturnItemResponse> {
    return apiClient.post<ReturnItemResponse>(`/contracts/${contractId}/settle-non-return`, payload);
  },

  async getReturnsAsync(contractId: number): Promise<ContractReturn[]> {
    return apiClient.get<ContractReturn[]>(`/contracts/${contractId}/returns`);
  },

  async calculatePriceAsync(contractId: number): Promise<ContractPriceCalculation> {
    const raw = await apiClient.post<unknown>(`/contracts/${contractId}/calculate-price`, {});
    return parseContractPriceCalculation(raw);
  },

  async generateDocumentAsync(
    contractId: number,
    templateId: number,
    format: 'pdf' | 'docx' = 'pdf'
  ): Promise<Blob> {
    return apiClient.postBlob(`/contracts/${contractId}/generate-document`, {
      templateId,
      format,
    });
  },

  async previewDocumentAsync(contractId: number, templateId: number): Promise<Blob> {
    return apiClient.postBlob(`/contracts/${contractId}/preview-document`, { templateId });
  },

  async getAuditLogsByContractAsync(contractId: number): Promise<AuditLog[]> {
    return apiClient.get<AuditLog[]>(`/contracts/${contractId}/audit-logs`);
  },

  /**
   * Belirtilen depodan kirada olan ürünleri toplar (aktif sözleşmelerden).
   * Dönüş: ürün adı, kategori, toplam kirada miktar.
   */
  async getRentedItemsByWarehouseAsync(warehouseId: number): Promise<
    { ItemId: number; ItemName: string; CategoryName: string; Quantity: number }[]
  > {
    const active = await this.getActiveContractsAsync('RENTAL');
    const byItem = new Map<
      number,
      { ItemId: number; ItemName: string; CategoryName: string; Quantity: number }
    >();

    for (const c of active) {
      const full = await this.getByIdAsync(c.ContractId);
      const details = (full as { details?: Array<{ ItemId: number; WarehouseId?: number; RentedQuantity: number; ReturnedQuantity: number; Item?: { ItemName?: string; Category?: { CategoryName?: string }; Categories?: { CategoryName?: string }[] }; ItemName?: string }> }).details
        ?? (full as { ContractDetails?: Array<{ ItemId: number; WarehouseId?: number; RentedQuantity: number; ReturnedQuantity: number; Item?: { ItemName?: string; Category?: { CategoryName?: string }; Categories?: { CategoryName?: string }[] }; ItemName?: string }> }).ContractDetails
        ?? [];
      for (const d of details) {
        const whId = d.WarehouseId ?? 0;
        if (whId !== warehouseId) continue;
        const qty = (d.RentedQuantity ?? 0) - (d.ReturnedQuantity ?? 0);
        if (qty <= 0) continue;
        const name = d.Item?.ItemName ?? (d as { ItemName?: string }).ItemName ?? `Ürün #${d.ItemId}`;
        const item = d.Item as { Categories?: { CategoryName?: string }[] } | undefined;
        const catName =
          item?.Categories?.map((c: { CategoryName?: string }) => c.CategoryName ?? '').filter(Boolean).join(', ') ?? '';
        const existing = byItem.get(d.ItemId);
        if (existing) {
          existing.Quantity += qty;
        } else {
          byItem.set(d.ItemId, { ItemId: d.ItemId, ItemName: name, CategoryName: catName, Quantity: qty });
        }
      }
    }

    return Array.from(byItem.values());
  },
};


import { apiClient } from './apiClient';
import { AuditLog, Contract, ContractReturn, ContractPriceCalculation, ReturnItemResponse } from '../models';

export interface CreateContractDetailRequest {
  ItemId: number;
  WarehouseId: number;
  RentedQuantity: number;
  DailyPriceAtRent: number;
}

export interface CreateContractRequest {
  ContractCode?: string;
  CustomerId: number;
  SiteId?: number; // Şantiye ID (opsiyonel)
  StartDate: string; // ISO 8601
  PlannedEndDate: string; // ISO 8601
  InitialTotalPrice: number;
  IsCompleted: boolean;
  Iskonto?: number;  // yüzde
  VatRate?: number;  // yüzde
  Currency?: 'TRY' | 'EUR';
  /** Opsiyonel. Bir kalemde WarehouseId yoksa bu depo kullanılır; depo stoğu düşümü için her detayda WarehouseId veya bu alan gerekir. */
  defaultWarehouseId?: number;
  details: CreateContractDetailRequest[];
}

export interface UpdateContractRequest {
  ContractCode?: string;
  SiteId?: number;
  Iskonto?: number;
  VatRate?: number;
  Currency?: 'TRY' | 'EUR';
  IsCompleted?: boolean;
}

export interface CreateContractResponse {
  ContractId: number;
}

export const contractService = {
  async getAllAsync(): Promise<Contract[]> {
    return apiClient.get<Contract[]>('/contracts');
  },

  async getByIdAsync(id: number): Promise<Contract> {
    return apiClient.get<Contract>(`/contracts/${id}`);
  },

  async getActiveContractsAsync(): Promise<Contract[]> {
    return apiClient.get<Contract[]>('/contracts?status=active');
  },

  async getCompletedContractsAsync(): Promise<Contract[]> {
    return apiClient.get<Contract[]>('/contracts?status=completed');
  },

  async createAsync(data: CreateContractRequest): Promise<CreateContractResponse> {
    return apiClient.post<CreateContractResponse>('/contracts', data);
  },

  async updateAsync(id: number, data: UpdateContractRequest): Promise<void> {
    return apiClient.patch<void>(`/contracts/${id}`, data as Record<string, unknown>);
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/contracts/${id}`);
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

  async getReturnsAsync(contractId: number): Promise<ContractReturn[]> {
    return apiClient.get<ContractReturn[]>(`/contracts/${contractId}/returns`);
  },

  async calculatePriceAsync(contractId: number): Promise<ContractPriceCalculation> {
    return apiClient.post<ContractPriceCalculation>(`/contracts/${contractId}/calculate-price`, {});
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
    const active = await this.getActiveContractsAsync();
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


import { apiClient } from './apiClient';
import type {
  ConfirmShipmentDeliveryRequest,
  ContractAwaitingShipment,
  CreateShipmentRequest,
  Shipment,
  ShipmentMutationResult,
  ShipmentStatus,
} from '../models';

export interface ShipmentListParams {
  contractId?: number;
  warehouseId?: number;
  customerId?: number;
  status?: ShipmentStatus;
  /** Türetilmiş teslim durumu (yalnızca aktif fişler) */
  deliveryState?: 'pending' | 'delivered';
  /** İmzalı irsaliye eki olmayan aktif fişler */
  missingWaybill?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  includeItems?: boolean;
  limit?: number;
  offset?: number;
}

export interface ShipmentListResponse {
  items: Shipment[];
  total: number;
  limit: number;
  offset: number;
}

export function buildShipmentQuery(params?: ShipmentListParams): string {
  const sp = new URLSearchParams();
  if (!params) return '';
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    sp.set(key, String(value));
  }
  const q = sp.toString();
  return q ? `?${q}` : '';
}

/**
 * Sevkiyat fişi (teslim/sevk) API'si.
 * İzinler: shipments_view (liste/detay/PDF), shipments_create, shipments_cancel, shipments_confirm_delivery.
 */
export const shipmentService = {
  async listAsync(params?: ShipmentListParams): Promise<ShipmentListResponse> {
    return apiClient.get<ShipmentListResponse>(`/shipments${buildShipmentQuery(params)}`);
  },

  async listAwaitingContractsAsync(search?: string): Promise<ContractAwaitingShipment[]> {
    return apiClient.get<ContractAwaitingShipment[]>(
      `/shipments/awaiting-contracts${buildShipmentQuery({ search })}`
    );
  },

  async getByIdAsync(id: number): Promise<Shipment> {
    return apiClient.get<Shipment>(`/shipments/${id}`);
  },

  /** Sözleşmenin tüm fişleri (kalemleriyle). İzin: contracts_view */
  async listByContractAsync(contractId: number): Promise<Shipment[]> {
    return apiClient.get<Shipment[]>(`/contracts/${contractId}/shipments`);
  },

  async createAsync(contractId: number, data: CreateShipmentRequest): Promise<ShipmentMutationResult> {
    return apiClient.post<ShipmentMutationResult>(`/contracts/${contractId}/shipments`, data);
  },

  async cancelAsync(id: number, reason: string): Promise<ShipmentMutationResult> {
    return apiClient.patch<ShipmentMutationResult>(`/shipments/${id}/cancel`, { reason });
  },

  /** Teslim onayı (yeniden çağrılırsa düzeltir). İzin: shipments_confirm_delivery */
  async confirmDeliveryAsync(id: number, data: ConfirmShipmentDeliveryRequest): Promise<Shipment> {
    return apiClient.post<Shipment>(`/shipments/${id}/confirm-delivery`, data);
  },

  /** Teslim onayını geri al. İzin: shipments_confirm_delivery */
  async undoDeliveryAsync(id: number): Promise<Shipment> {
    return apiClient.delete<Shipment>(`/shipments/${id}/delivery`);
  },

  /** templateId verilmezse yerleşik sevk fişi düzeni basılır. */
  async getPdfBlobAsync(id: number, templateId?: number): Promise<Blob> {
    const query = templateId != null ? `?templateId=${templateId}` : '';
    return apiClient.getBlob(`/shipments/${id}/pdf${query}`);
  },
};

import { apiClient } from './apiClient';
import { AuditLog, Warehouse, WarehouseMovementsResponse, WarehouseStockResponse } from '../models';

export interface CreateWarehouseRequest {
  WarehouseName: string;
  Address?: string;
  Description?: string;
}

export interface UpdateWarehouseRequest {
  WarehouseName?: string;
  Address?: string;
  Description?: string;
}

export interface CreateWarehouseResponse {
  WarehouseId: number;
}

export interface AddStockRequest {
  ItemId: number;
  Quantity: number;
}

export interface AddStockResponse {
  StockId: number;
  WarehouseId: number;
  ItemId: number;
  Quantity: number;
}

export const warehouseService = {
  // Warehouse CRUD
  async getAllAsync(): Promise<Warehouse[]> {
    return apiClient.get<Warehouse[]>('/warehouses');
  },

  async getByIdAsync(id: number): Promise<Warehouse> {
    return apiClient.get<Warehouse>(`/warehouses/${id}`);
  },

  async createAsync(data: CreateWarehouseRequest): Promise<CreateWarehouseResponse> {
    return apiClient.post<CreateWarehouseResponse>('/warehouses', data);
  },

  async updateAsync(id: number, data: UpdateWarehouseRequest): Promise<Warehouse> {
    return apiClient.patch<Warehouse>(`/warehouses/${id}`, data);
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/warehouses/${id}`);
  },

  // Warehouse Stock Management
  async getStockAsync(warehouseId: number): Promise<WarehouseStockResponse> {
    return apiClient.get<WarehouseStockResponse>(`/warehouses/${warehouseId}/stock`);
  },

  async addOrUpdateStockAsync(warehouseId: number, data: AddStockRequest): Promise<AddStockResponse> {
    return apiClient.post<AddStockResponse>(`/warehouses/${warehouseId}/stock`, data);
  },

  async removeStockAsync(warehouseId: number, itemId: number): Promise<void> {
    return apiClient.delete<void>(`/warehouses/${warehouseId}/stock/${itemId}`);
  },

  async getAuditLogsByWarehouseAsync(warehouseId: number): Promise<AuditLog[]> {
    return apiClient.get<AuditLog[]>(`/warehouses/${warehouseId}/audit-logs`);
  },

  // Warehouse Movements (GET /warehouses/:warehouseId/movements)
  async getMovementsAsync(
    warehouseId: number,
    params?: {
      itemId?: number;
      dateFrom?: string;
      dateTo?: string;
      includeCompleted?: boolean;
    }
  ): Promise<WarehouseMovementsResponse> {
    const sp = new URLSearchParams();
    if (params?.itemId != null) sp.set('itemId', String(params.itemId));
    if (params?.dateFrom) sp.set('dateFrom', params.dateFrom);
    if (params?.dateTo) sp.set('dateTo', params.dateTo);
    if (params?.includeCompleted != null) sp.set('includeCompleted', String(params.includeCompleted));
    const qs = sp.toString();
    return apiClient.get<WarehouseMovementsResponse>(
      qs ? `/warehouses/${warehouseId}/movements?${qs}` : `/warehouses/${warehouseId}/movements`
    );
  },
};

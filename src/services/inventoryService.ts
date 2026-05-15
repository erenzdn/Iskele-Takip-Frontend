import { apiClient } from './apiClient';
import {
  AuditLog,
  Inventory,
  InventoryItemMovementsResponse,
  InventorySubCategory,
  MaterialCategory,
  WarehouseStock,
} from '../models';

export interface CreateCategoryRequest {
  CategoryName: string;
  RentalUnit?: string;
}

export interface UpdateCategoryRequest extends CreateCategoryRequest {}

export interface CreateCategoryResponse {
  CategoryId: number;
}

export interface CreateInventoryRequest {
  ItemCode?: string;
  CategoryIds?: number[];
  ItemName: string;
  ItemNameEn?: string;
  TotalStock: number;
  OnRent: number;
  MonthlyListPrice?: number;
  UnitPrice?: number;
  MonthlyListPriceEur?: number;
  UnitPriceEur?: number;
  MonthlyListPriceUsd?: number;
  UnitPriceUsd?: number;
  SubCategoryIds?: number[];
}

export interface UpdateInventoryRequest {
  ItemCode?: string;
  CategoryIds?: number[];
  ItemName?: string;
  ItemNameEn?: string;
  TotalStock?: number;
  OnRent?: number;
  MonthlyListPrice?: number;
  UnitPrice?: number;
  MonthlyListPriceEur?: number;
  UnitPriceEur?: number;
  MonthlyListPriceUsd?: number;
  UnitPriceUsd?: number;
  SubCategoryIds?: number[];
}

export interface CreateInventoryResponse {
  ItemId: number;
}

export const inventoryService = {
  // Categories
  async getAllCategoriesAsync(): Promise<MaterialCategory[]> {
    return apiClient.get<MaterialCategory[]>('/categories');
  },

  async getCategoryByIdAsync(id: number): Promise<MaterialCategory> {
    return apiClient.get<MaterialCategory>(`/categories/${id}`);
  },

  async createCategoryAsync(data: CreateCategoryRequest): Promise<CreateCategoryResponse> {
    return apiClient.post<CreateCategoryResponse>('/categories', data);
  },

  async updateCategoryAsync(id: number, data: UpdateCategoryRequest): Promise<void> {
    return apiClient.patch<void>(`/categories/${id}`, data);
  },

  async deleteCategoryAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/categories/${id}`);
  },

  // Inventory Items
  async getAllAsync(params?: { categoryId?: number; search?: string }): Promise<Inventory[]> {
    const sp = new URLSearchParams();
    if (params?.categoryId != null) sp.set('categoryId', String(params.categoryId));
    if (params?.search != null && params.search.trim() !== '') sp.set('search', params.search.trim());
    const qs = sp.toString();
    return apiClient.get<Inventory[]>(qs ? `/inventory?${qs}` : '/inventory');
  },

  async getByIdAsync(id: number): Promise<Inventory> {
    return apiClient.get<Inventory>(`/inventory/${id}`);
  },

  async getByCategoryAsync(categoryId: number): Promise<Inventory[]> {
    return this.getAllAsync({ categoryId });
  },

  async createAsync(data: CreateInventoryRequest): Promise<CreateInventoryResponse> {
    return apiClient.post<CreateInventoryResponse>('/inventory', data);
  },

  async updateAsync(id: number, data: UpdateInventoryRequest): Promise<void> {
    return apiClient.patch<void>(`/inventory/${id}`, data);
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/inventory/${id}`);
  },

  async getPriceTiersAsync(itemId: number) {
    return apiClient.get(`/inventory/${itemId}/price-tiers`);
  },

  async getSubCategoriesAsync(itemId: number): Promise<InventorySubCategory[]> {
    return apiClient.get<InventorySubCategory[]>(`/inventory/${itemId}/subcategories`);
  },

  async getWarehousesByItemAsync(itemId: number): Promise<WarehouseStock[]> {
    return apiClient.get<WarehouseStock[]>(`/inventory/${itemId}/warehouses`);
  },

  async getAuditLogsByItemAsync(itemId: number): Promise<AuditLog[]> {
    return apiClient.get<AuditLog[]>(`/inventory/${itemId}/audit-logs`);
  },

  async getItemMovementsAsync(
    itemId: number,
    params?: {
      warehouseId?: number;
      dateFrom?: string;
      dateTo?: string;
      includeCompleted?: boolean;
    }
  ): Promise<InventoryItemMovementsResponse> {
    const sp = new URLSearchParams();
    if (params?.warehouseId != null) sp.set('warehouseId', String(params.warehouseId));
    if (params?.dateFrom) sp.set('dateFrom', params.dateFrom);
    if (params?.dateTo) sp.set('dateTo', params.dateTo);
    if (params?.includeCompleted != null) sp.set('includeCompleted', String(params.includeCompleted));
    const qs = sp.toString();
    return apiClient.get<InventoryItemMovementsResponse>(
      qs ? `/inventory/${itemId}/movements?${qs}` : `/inventory/${itemId}/movements`
    );
  },
};


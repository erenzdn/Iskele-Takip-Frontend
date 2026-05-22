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
  Weight?: number;
  UnitId?: number;
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
  Weight?: number;
  UnitId?: number;
}

export interface CreateInventoryResponse {
  ItemId: number;
}

export interface ExchangeRateResponse {
  RateId: number;
  UsdRate: number;
  EurRate: number;
  Notes: string | null;
  IsActive: boolean;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface UpdateExchangeRatesRequest {
  UsdRate: number;
  EurRate: number;
  Notes?: string;
}

export interface PricingPresetResponse {
  PresetId: number;
  RentalRateTry: number;
  RentalRateUsd: number;
  RentalRateEur: number;
  IsActive: boolean;
  Notes: string | null;
  CreatedAt: string;
  UpdatedAt: string | null;
}

export interface UpdatePricingPresetRequest {
  RentalRateTry: number;
  RentalRateUsd: number;
  RentalRateEur: number;
  Notes?: string;
}

export interface PricePreviewRequest {
  UnitPrice: number;
  UsdRate?: number;
  EurRate?: number;
  RentalRateTry?: number;
  RentalRateUsd?: number;
  RentalRateEur?: number;
  MonthlyListPrice?: number;
  MonthlyListPriceUsd?: number;
  MonthlyListPriceEur?: number;
}

export interface PricePreviewResponse {
  UnitPrice: number;
  UnitPriceUsd: number;
  UnitPriceEur: number;
  MonthlyListPrice: number;
  MonthlyListPriceUsd: number;
  MonthlyListPriceEur: number;
  DailyPrice: number;
  DailyPriceUsd: number;
  DailyPriceEur: number;
  rates: { UsdRate: number; EurRate: number };
  preset: { RentalRateTry: number; RentalRateUsd: number; RentalRateEur: number };
  overrides: Record<string, boolean>;
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

  async applyDiscountAsync(categoryId: number, data: { discountRate: number; type: 'sales' | 'rental' }): Promise<{ message: string; updatedCount: number }> {
    return apiClient.post<{ message: string; updatedCount: number }>(`/categories/${categoryId}/apply-discount`, data);
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

  // Pricing & Exchange Rates
  async getExchangeRatesAsync(): Promise<ExchangeRateResponse> {
    return apiClient.get<ExchangeRateResponse>('/exchange-rates');
  },

  async updateExchangeRatesAsync(data: UpdateExchangeRatesRequest): Promise<void> {
    return apiClient.put<void>('/exchange-rates', data);
  },

  async getPricingPresetAsync(): Promise<PricingPresetResponse> {
    return apiClient.get<PricingPresetResponse>('/inventory-pricing-preset');
  },

  async updatePricingPresetAsync(data: UpdatePricingPresetRequest): Promise<void> {
    return apiClient.put<void>('/inventory-pricing-preset', data);
  },

  async getPricePreviewAsync(data: PricePreviewRequest): Promise<PricePreviewResponse> {
    return apiClient.post<PricePreviewResponse>('/inventory/price-preview', data);
  },
};


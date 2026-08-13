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

export interface RestoreInventoryResponse {
  message: string;
  ItemId: number;
  DeletedAt: null;
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
  RentalRateUsd: number | null;
  RentalRateEur: number | null;
  IsActive: boolean;
  Notes: string | null;
  CreatedAt: string;
  UpdatedAt: string | null;
}

export interface UpdatePricingPresetRequest {
  RentalRateTry: number;
  RentalRateUsd?: number | null;
  RentalRateEur?: number | null;
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

export interface InventoryListQuery {
  categoryId?: number;
  search?: string;
  includeArchived?: boolean;
}

interface InventoryQueryOptions {
  forceRefresh?: boolean;
  staleTimeMs?: number;
}

interface InventoryCacheEntry {
  data: Inventory[];
  fetchedAt: number;
}

const DEFAULT_INVENTORY_STALE_TIME_MS = 60_000;
const inventoryListCache = new Map<string, InventoryCacheEntry>();
const inFlightInventoryLists = new Map<string, Promise<Inventory[]>>();

function buildInventoryListKey(params?: InventoryListQuery): string {
  const cat = params?.categoryId ?? '';
  const search = (params?.search ?? '').trim().toLocaleLowerCase('tr-TR');
  const archived = params?.includeArchived ? '1' : '0';
  return `${cat}|${search}|${archived}`;
}

export function clearInventoryListCache(): void {
  inventoryListCache.clear();
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
  async getAllAsync(
    params?: InventoryListQuery,
    options?: InventoryQueryOptions
  ): Promise<Inventory[]> {
    const key = buildInventoryListKey(params);
    const staleTimeMs = options?.staleTimeMs ?? DEFAULT_INVENTORY_STALE_TIME_MS;
    const forceRefresh = options?.forceRefresh ?? false;
    const now = Date.now();

    if (!forceRefresh) {
      const cached = inventoryListCache.get(key);
      if (cached && now - cached.fetchedAt < staleTimeMs) {
        return cached.data;
      }
      const pending = inFlightInventoryLists.get(key);
      if (pending) {
        return pending;
      }
    }

    const sp = new URLSearchParams();
    if (params?.categoryId != null) sp.set('categoryId', String(params.categoryId));
    if (params?.search != null && params.search.trim() !== '') sp.set('search', params.search.trim());
    if (params?.includeArchived) sp.set('includeArchived', 'true');
    const qs = sp.toString();
    const endpoint = qs ? `/inventory?${qs}` : '/inventory';

    const request = apiClient.get<Inventory[]>(endpoint).then((data) => {
      const rows = data ?? [];
      inventoryListCache.set(key, {
        data: rows,
        fetchedAt: Date.now(),
      });
      return rows;
    }).finally(() => {
      inFlightInventoryLists.delete(key);
    });

    inFlightInventoryLists.set(key, request);
    return request;
  },

  async getByIdAsync(id: number): Promise<Inventory> {
    return apiClient.get<Inventory>(`/inventory/${id}`);
  },

  async getByCategoryAsync(categoryId: number): Promise<Inventory[]> {
    return this.getAllAsync({ categoryId });
  },

  async createAsync(data: CreateInventoryRequest): Promise<CreateInventoryResponse> {
    const created = await apiClient.post<CreateInventoryResponse>('/inventory', data);
    clearInventoryListCache();
    return created;
  },

  async updateAsync(id: number, data: UpdateInventoryRequest): Promise<void> {
    await apiClient.patch<void>(`/inventory/${id}`, data);
    clearInventoryListCache();
  },

  async deleteAsync(id: number): Promise<void> {
    await apiClient.delete<void>(`/inventory/${id}`);
    clearInventoryListCache();
  },

  /** Pasif / arşivlenmiş ürünü aktif listeye geri getirir. İzin: inventory_delete */
  async restoreAsync(id: number): Promise<RestoreInventoryResponse> {
    const data = await apiClient.post<RestoreInventoryResponse>(`/inventory/${id}/restore`, {});
    clearInventoryListCache();
    return data;
  },

  async getPriceTiersAsync(itemId: number) {
    return apiClient.get(`/inventory/${itemId}/price-tiers`);
  },

  async getSubCategoriesAsync(itemId: number): Promise<InventorySubCategory[]> {
    return apiClient.get<InventorySubCategory[]>(`/inventory/${itemId}/subcategories`);
  },

  async getWarehousesByItemAsync(itemId: number): Promise<WarehouseStock[]> {
    const raw = await apiClient.get<
      WarehouseStock[] | { warehouseStock?: WarehouseStock[]; WarehouseStock?: WarehouseStock[] }
    >(`/inventory/${itemId}/warehouses`);
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
      return raw.warehouseStock ?? raw.WarehouseStock ?? [];
    }
    return [];
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


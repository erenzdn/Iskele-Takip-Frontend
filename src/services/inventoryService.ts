import { apiClient } from './apiClient';
import { Inventory, MaterialCategory } from '../models';

export interface CreateCategoryRequest {
  CategoryName: string;
  RentalUnit?: string;
}

export interface UpdateCategoryRequest extends CreateCategoryRequest {}

export interface CreateCategoryResponse {
  CategoryId: number;
}

export interface CreateInventoryRequest {
  CategoryId: number;
  ItemName: string;
  TotalStock: number;
  OnRent: number;
  DailyPrice: number;
  PurchasePrice: number;
}

export interface UpdateInventoryRequest extends CreateInventoryRequest {}

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
  async getAllAsync(): Promise<Inventory[]> {
    return apiClient.get<Inventory[]>('/inventory');
  },

  async getByIdAsync(id: number): Promise<Inventory> {
    return apiClient.get<Inventory>(`/inventory/${id}`);
  },

  async getByCategoryAsync(categoryId: number): Promise<Inventory[]> {
    // API'de by-category endpoint yok, tüm envanteri alıp filtreliyoruz
    const allInventory = await apiClient.get<Inventory[]>('/inventory');
    return allInventory.filter((item) => item.CategoryId === categoryId);
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
};


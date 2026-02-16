import { apiClient } from './apiClient';
import { SubCategory } from '../models';

export interface CreateSubCategoryRequest {
  CategoryId: number;
  SubCategoryName: string;
}

export interface UpdateSubCategoryRequest {
  SubCategoryName?: string;
  CategoryId?: number;
}

export const subcategoryService = {
  async getAllAsync(categoryId?: number): Promise<SubCategory[]> {
    const url = categoryId != null
      ? `/subcategories?categoryId=${categoryId}`
      : '/subcategories';
    return apiClient.get<SubCategory[]>(url);
  },

  async getByIdAsync(id: number): Promise<SubCategory> {
    return apiClient.get<SubCategory>(`/subcategories/${id}`);
  },

  async createAsync(data: CreateSubCategoryRequest): Promise<SubCategory> {
    return apiClient.post<SubCategory>('/subcategories', data);
  },

  async updateAsync(id: number, data: UpdateSubCategoryRequest): Promise<void> {
    return apiClient.patch<void>(`/subcategories/${id}`, data);
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/subcategories/${id}`);
  },
};

import { create } from 'zustand';
import { apiClient } from './apiClient';
import type { DocumentCategory, DocumentCategoryRef } from '../models';

export interface DocumentCategoryInput {
  Name?: string;
  Color?: string;
  SortOrder?: number;
}

/** Teklif / sözleşme kategorileri (havuz ortak). */
export const documentCategoryService = {
  async listAsync(): Promise<DocumentCategory[]> {
    return apiClient.get<DocumentCategory[]>('/document-categories');
  },

  async createAsync(data: DocumentCategoryInput & { Name: string }): Promise<DocumentCategory> {
    return apiClient.post<DocumentCategory>('/document-categories', data);
  },

  async updateAsync(id: number, data: DocumentCategoryInput): Promise<DocumentCategory> {
    return apiClient.patch<DocumentCategory>(`/document-categories/${id}`, data);
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/document-categories/${id}`);
  },

  async setQuoteCategoriesAsync(quoteId: number, categoryIds: number[]): Promise<DocumentCategoryRef[]> {
    return apiClient.put<DocumentCategoryRef[]>(`/quotes/${quoteId}/categories`, { CategoryIds: categoryIds });
  },

  async setContractCategoriesAsync(contractId: number, categoryIds: number[]): Promise<DocumentCategoryRef[]> {
    return apiClient.put<DocumentCategoryRef[]>(`/contracts/${contractId}/categories`, {
      CategoryIds: categoryIds,
    });
  },
};

/** Hazır renk paleti (kategori oluştururken sırayla önerilir). */
export const DOCUMENT_CATEGORY_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#14b8a6',
  '#ec4899',
  '#f97316',
  '#64748b',
  '#84cc16',
] as const;

interface DocumentCategoryState {
  categories: DocumentCategory[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  /** İlk kullanımda yükler; force ile yeniden çeker. */
  load: (force?: boolean) => Promise<void>;
}

let inflight: Promise<void> | null = null;

/** Tüm ekranların paylaştığı kategori listesi (yönetim modalı değişiklik sonrası force ile yeniler). */
export const useDocumentCategoryStore = create<DocumentCategoryState>((set, get) => ({
  categories: [],
  loaded: false,
  loading: false,
  error: null,
  load: async (force = false) => {
    if (!force && (get().loaded || inflight)) return inflight ?? undefined;
    set({ loading: true, error: null });
    inflight = documentCategoryService
      .listAsync()
      .then((categories) => set({ categories: Array.isArray(categories) ? categories : [], loaded: true }))
      .catch((error: unknown) => {
        set({ error: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        inflight = null;
        set({ loading: false });
      });
    return inflight;
  },
}));

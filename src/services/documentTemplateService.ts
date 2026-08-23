import { apiClient } from './apiClient';

export interface DocumentTemplate {
  id: number;
  name: string;
  updated_at: string;
}

export interface DocumentTemplateDetail {
  id: number;
  name: string;
  sfdt: string;
}

export interface CreateDocumentTemplateRequest {
  name: string;
  sfdt: string;
}

export interface ImportDocumentTemplateResponse {
  id: number;
  name: string;
  sfdt: string;
}

export const documentTemplateService = {
  async getAllAsync(): Promise<DocumentTemplate[]> {
    return apiClient.get<DocumentTemplate[]>('/templates');
  },

  async getByIdAsync(id: number): Promise<DocumentTemplateDetail> {
    return apiClient.get<DocumentTemplateDetail>(`/templates/${id}`);
  },

  async createAsync(data: CreateDocumentTemplateRequest): Promise<{ id: number }> {
    return apiClient.post<{ id: number }>('/templates', data);
  },

  async updateAsync(id: number, sfdt: string): Promise<void> {
    return apiClient.put<void>(`/templates/${id}`, { sfdt });
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/templates/${id}`);
  },

  async importDocxAsync(file: File): Promise<ImportDocumentTemplateResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.postFormData<ImportDocumentTemplateResponse>('/templates/import', formData);
  },

  async exportDocxAsync(id: number): Promise<Blob> {
    return apiClient.getBlob(`/templates/${id}/export`);
  },
};

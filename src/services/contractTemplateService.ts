import { apiClient } from './apiClient';
import { ContractTemplate } from '../models';

export interface CreateContractTemplateRequest {
  TemplateName: string;
  Content: any; // TipTap JSON formatı
  IsDefault?: boolean;
}

export interface UpdateContractTemplateRequest {
  TemplateName?: string;
  Content?: any; // TipTap JSON formatı
  IsDefault?: boolean;
}

export interface CreateContractTemplateResponse {
  TemplateId: number;
}

export interface CopyTemplateRequest {
  TemplateName?: string;
}

export interface CopyTemplateResponse {
  TemplateId: number;
}

export const contractTemplateService = {
  async getAllAsync(all?: boolean): Promise<ContractTemplate[]> {
    const query = all ? '?all=true' : '';
    return apiClient.get<ContractTemplate[]>(`/contract-templates${query}`);
  },

  async getByIdAsync(id: number): Promise<ContractTemplate> {
    return apiClient.get<ContractTemplate>(`/contract-templates/${id}`);
  },

  async getDefaultAsync(): Promise<ContractTemplate> {
    return apiClient.get<ContractTemplate>('/contract-templates/default');
  },

  async createAsync(data: CreateContractTemplateRequest): Promise<CreateContractTemplateResponse> {
    return apiClient.post<CreateContractTemplateResponse>('/contract-templates', data);
  },

  async updateAsync(id: number, data: UpdateContractTemplateRequest): Promise<void> {
    return apiClient.patch<void>(`/contract-templates/${id}`, data);
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/contract-templates/${id}`);
  },

  async copyAsync(id: number, templateName?: string): Promise<CopyTemplateResponse> {
    const body: CopyTemplateRequest = {};
    if (templateName) {
      body.TemplateName = templateName;
    }
    return apiClient.post<CopyTemplateResponse>(`/contract-templates/${id}/copy`, body);
  },

  async previewAsync(id: number): Promise<Blob> {
    return apiClient.postBlob(`/contract-templates/${id}/preview`);
  },

  async previewContentAsync(content: any): Promise<Blob> {
    return apiClient.postBlob('/contract-templates/preview-content', { Content: content });
  },
};

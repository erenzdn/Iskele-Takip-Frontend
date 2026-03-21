import { apiClient } from './apiClient';
import { QuoteTemplate } from '../models';

export interface CreateQuoteTemplateRequest {
  TemplateName: string;
  Content: any; // TipTap JSON formatı
  IsDefault?: boolean;
}

export interface UpdateQuoteTemplateRequest {
  TemplateName?: string;
  Content?: any; // TipTap JSON formatı
  IsDefault?: boolean;
}

export interface CreateQuoteTemplateResponse {
  TemplateId: number;
}

export interface CopyTemplateRequest {
  TemplateName?: string;
}

export interface CopyTemplateResponse {
  TemplateId: number;
}

export const quoteTemplateService = {
  async getAllAsync(all?: boolean): Promise<QuoteTemplate[]> {
    const query = all ? '?all=true' : '';
    return apiClient.get<QuoteTemplate[]>(`/quote-templates${query}`);
  },

  async getByIdAsync(id: number): Promise<QuoteTemplate> {
    return apiClient.get<QuoteTemplate>(`/quote-templates/${id}`);
  },

  async getDefaultAsync(): Promise<QuoteTemplate> {
    return apiClient.get<QuoteTemplate>('/quote-templates/default');
  },

  async createAsync(data: CreateQuoteTemplateRequest): Promise<CreateQuoteTemplateResponse> {
    return apiClient.post<CreateQuoteTemplateResponse>('/quote-templates', data);
  },

  async updateAsync(id: number, data: UpdateQuoteTemplateRequest): Promise<void> {
    return apiClient.patch<void>(`/quote-templates/${id}`, data);
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/quote-templates/${id}`);
  },

  async copyAsync(id: number, templateName?: string): Promise<CopyTemplateResponse> {
    const body: CopyTemplateRequest = {};
    if (templateName) {
      body.TemplateName = templateName;
    }
    return apiClient.post<CopyTemplateResponse>(`/quote-templates/${id}/copy`, body);
  },

  async previewAsync(id: number): Promise<Blob> {
    return apiClient.postBlob(`/quote-templates/${id}/preview`);
  },

  async previewContentAsync(content: any): Promise<Blob> {
    return apiClient.postBlob('/quote-templates/preview-content', { Content: content });
  },
};

import { apiClient } from './apiClient';
import { ReportTemplate } from '../models';

export interface CreateReportTemplateRequest {
  TemplateName: string;
  Content: any; // TipTap JSON formatı
  IsDefault?: boolean;
}

export interface UpdateReportTemplateRequest {
  TemplateName?: string;
  Content?: any; // TipTap JSON formatı
  IsDefault?: boolean;
}

export interface CreateReportTemplateResponse {
  TemplateId: number;
}

export interface CopyReportTemplateRequest {
  TemplateName?: string;
}

export interface CopyReportTemplateResponse {
  TemplateId: number;
}

export const reportTemplateService = {
  async getAllAsync(all?: boolean): Promise<ReportTemplate[]> {
    const query = all ? '?all=true' : '';
    return apiClient.get<ReportTemplate[]>(`/report-templates${query}`);
  },

  async getByIdAsync(id: number): Promise<ReportTemplate> {
    return apiClient.get<ReportTemplate>(`/report-templates/${id}`);
  },

  async getDefaultAsync(): Promise<ReportTemplate> {
    return apiClient.get<ReportTemplate>('/report-templates/default');
  },

  async createAsync(data: CreateReportTemplateRequest): Promise<CreateReportTemplateResponse> {
    return apiClient.post<CreateReportTemplateResponse>('/report-templates', data);
  },

  async updateAsync(id: number, data: UpdateReportTemplateRequest): Promise<void> {
    return apiClient.patch<void>(`/report-templates/${id}`, data);
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/report-templates/${id}`);
  },

  async copyAsync(id: number, templateName?: string): Promise<CopyReportTemplateResponse> {
    const body: CopyReportTemplateRequest = {};
    if (templateName) {
      body.TemplateName = templateName;
    }
    return apiClient.post<CopyReportTemplateResponse>(`/report-templates/${id}/copy`, body);
  },

  async previewAsync(id: number): Promise<Blob> {
    return apiClient.postBlob(`/report-templates/${id}/preview`);
  },

  async previewContentAsync(content: any): Promise<Blob> {
    return apiClient.postBlob('/report-templates/preview-content', { Content: content });
  },
};

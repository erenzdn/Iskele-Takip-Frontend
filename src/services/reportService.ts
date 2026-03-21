import { apiClient } from './apiClient';
import { RentalMovementReportResponse } from '../models';

export interface ReportDateParams {
  dateFrom?: string;
  dateTo?: string;
}

export interface ReportPdfParams extends ReportDateParams {
  templateId?: number;
}

function buildQuery(params?: ReportDateParams): string {
  const searchParams = new URLSearchParams();
  if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom);
  if (params?.dateTo) searchParams.set('dateTo', params.dateTo);
  return searchParams.toString();
}

function buildPdfQuery(params?: ReportPdfParams): string {
  const searchParams = new URLSearchParams();
  if (params?.templateId != null) searchParams.set('templateId', String(params.templateId));
  if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom);
  if (params?.dateTo) searchParams.set('dateTo', params.dateTo);
  return searchParams.toString();
}

export const reportService = {
  async getCustomerReportAsync(
    customerId: number,
    params?: ReportDateParams
  ): Promise<RentalMovementReportResponse> {
    const query = buildQuery(params);
    const url = query
      ? `/reports/customer/${customerId}?${query}`
      : `/reports/customer/${customerId}`;
    return apiClient.get<RentalMovementReportResponse>(url);
  },

  async getSiteReportAsync(
    siteId: number,
    params?: ReportDateParams
  ): Promise<RentalMovementReportResponse> {
    const query = buildQuery(params);
    const url = query
      ? `/reports/site/${siteId}?${query}`
      : `/reports/site/${siteId}`;
    return apiClient.get<RentalMovementReportResponse>(url);
  },

  async getGlobalReportAsync(
    params?: ReportDateParams
  ): Promise<RentalMovementReportResponse> {
    const query = buildQuery(params);
    const url = query
      ? `/reports/inventory/global?${query}`
      : '/reports/inventory/global';
    return apiClient.get<RentalMovementReportResponse>(url);
  },

  async getCustomerReportPdfAsync(
    customerId: number,
    params?: ReportPdfParams
  ): Promise<Blob> {
    const query = buildPdfQuery(params);
    const url = query
      ? `/reports/customer/${customerId}/pdf?${query}`
      : `/reports/customer/${customerId}/pdf`;
    return apiClient.getBlob(url);
  },

  async getSiteReportPdfAsync(
    siteId: number,
    params?: ReportPdfParams
  ): Promise<Blob> {
    const query = buildPdfQuery(params);
    const url = query
      ? `/reports/site/${siteId}/pdf?${query}`
      : `/reports/site/${siteId}/pdf`;
    return apiClient.getBlob(url);
  },

  async getGlobalReportPdfAsync(params?: ReportPdfParams): Promise<Blob> {
    const query = buildPdfQuery(params);
    const url = query
      ? `/reports/inventory/global/pdf?${query}`
      : '/reports/inventory/global/pdf';
    return apiClient.getBlob(url);
  },
};

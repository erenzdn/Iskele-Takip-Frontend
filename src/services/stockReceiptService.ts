import { apiClient } from './apiClient';
import {
  StockReceipt,
  StockReceiptDetail,
  CreateStockReceiptRequest,
} from '../models';

export interface StockReceiptListParams {
  warehouseId?: number;
  receiptType?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

function buildQuery(params?: StockReceiptListParams): string {
  const searchParams = new URLSearchParams();
  if (params?.warehouseId != null) searchParams.set('warehouseId', String(params.warehouseId));
  if (params?.receiptType) searchParams.set('receiptType', params.receiptType);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.dateFrom) searchParams.set('dateFrom', params.dateFrom);
  if (params?.dateTo) searchParams.set('dateTo', params.dateTo);
  if (params?.limit != null) searchParams.set('limit', String(params.limit));
  return searchParams.toString();
}

export const stockReceiptService = {
  async getAllAsync(params?: StockReceiptListParams): Promise<StockReceipt[]> {
    const query = buildQuery(params);
    const url = query ? `/stock-receipts?${query}` : '/stock-receipts';
    return apiClient.get<StockReceipt[]>(url);
  },

  async getByIdAsync(id: string): Promise<StockReceiptDetail> {
    return apiClient.get<StockReceiptDetail>(`/stock-receipts/${id}`);
  },

  async createAsync(data: CreateStockReceiptRequest): Promise<StockReceiptDetail> {
    return apiClient.post<StockReceiptDetail>('/stock-receipts', data);
  },

  async cancelAsync(id: string): Promise<StockReceipt> {
    return apiClient.patch<StockReceipt>(`/stock-receipts/${id}/cancel`);
  },

  async getPdfBlobAsync(id: string, templateId?: number): Promise<Blob> {
    const query = templateId != null ? `?templateId=${templateId}` : '';
    return apiClient.getBlob(`/stock-receipts/${id}/pdf${query}`);
  },
};

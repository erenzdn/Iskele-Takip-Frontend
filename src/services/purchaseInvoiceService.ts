import { apiClient } from './apiClient';
import { PurchaseInvoice } from '../models';

export interface CreatePurchaseInvoiceRequest {
  InvoiceDate: string;
  EntryDate: string;
  CustomerId: number;
  Description?: string;
  Subtotal: number;
  VatAmount: number;
  TotalAmount: number;
  Iskonto?: number;
  VatRate?: number;
}

export interface UpdatePurchaseInvoiceRequest {
  InvoiceDate?: string;
  EntryDate?: string;
  CustomerId?: number;
  Description?: string;
  Subtotal?: number;
  VatAmount?: number;
  TotalAmount?: number;
  Iskonto?: number;
  VatRate?: number;
}

export interface CreatePurchaseInvoiceResponse {
  InvoiceId: number;
}

export const purchaseInvoiceService = {
  async getAllAsync(): Promise<PurchaseInvoice[]> {
    return apiClient.get<PurchaseInvoice[]>('/purchase-invoices');
  },

  async getByIdAsync(id: number): Promise<PurchaseInvoice> {
    return apiClient.get<PurchaseInvoice>(`/purchase-invoices/${id}`);
  },

  async searchAsync(searchText: string): Promise<PurchaseInvoice[]> {
    // API'de search endpoint yok, tüm faturaları alıp client-side filtreleme yapıyoruz
    const allInvoices = await apiClient.get<PurchaseInvoice[]>('/purchase-invoices');
    const search = searchText.toLowerCase();
    return allInvoices.filter(
      (inv) =>
        (inv.CustomerName?.toLowerCase().includes(search) ?? false) ||
        (inv.Description?.toLowerCase().includes(search) ?? false) ||
        inv.InvoiceId.toString().includes(search)
    );
  },

  async createAsync(data: CreatePurchaseInvoiceRequest): Promise<CreatePurchaseInvoiceResponse> {
    return apiClient.post<CreatePurchaseInvoiceResponse>('/purchase-invoices', data);
  },

  async updateAsync(id: number, data: UpdatePurchaseInvoiceRequest): Promise<void> {
    return apiClient.patch<void>(`/purchase-invoices/${id}`, data);
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/purchase-invoices/${id}`);
  },
};

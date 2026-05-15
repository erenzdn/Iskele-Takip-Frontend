import { apiClient } from './apiClient';
import { toast } from '../hooks/useToast';
import { Check, CheckFilters } from '../models';

export type CheckUpdatePayload = Partial<Check> & {
  cash_account_id?: string;
  reason?: string;
};

export type CheckUpdateResponse = Check & {
  FinanceAction?: string;
  financeAction?: string;
  Message?: string;
  message?: string;
};

function buildQueryString(filters: CheckFilters): string {
  const params = new URLSearchParams();

  if (filters.customerId) {
    params.append('customerId', String(filters.customerId));
  }
  if (filters.status) {
    params.append('status', filters.status);
  }
  if (filters.dateFrom) {
    params.append('dateFrom', filters.dateFrom);
  }
  if (filters.dateTo) {
    params.append('dateTo', filters.dateTo);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const checkService = {
  async getAllAsync(filters: CheckFilters = {}): Promise<Check[]> {
    const query = buildQueryString(filters);
    return apiClient.get<Check[]>(`/checks${query}`);
  },

  async getByIdAsync(id: number): Promise<Check> {
    return apiClient.get<Check>(`/checks/${id}`);
  },

  async createAsync(payload: Omit<Check, 'CheckId' | 'CreatedAt' | 'UpdatedAt' | 'StatusLabel'>): Promise<Check> {
    return apiClient.post<Check>('/checks', payload);
  },

  async updateAsync(id: number, partial: CheckUpdatePayload): Promise<CheckUpdateResponse> {
    return apiClient.patch<CheckUpdateResponse>(`/checks/${id}`, partial);
  },

  async deleteAsync(id: number): Promise<void> {
    await apiClient.delete<void>(`/checks/${id}`);
  },

  async downloadPdfAsync(id: number): Promise<void> {
    const blob = await apiClient.getBlob(`/checks/${id}/pdf`);

    if (blob.size === 0) {
      toast.error('PDF indirilemedi (sunucu boş yanıt döndü).');
      return;
    }

    const isPdf = blob.type === 'application/pdf' || blob.type === '';
    if (!isPdf && blob.size < 10000) {
      const text = await blob.text();
      try {
        const j = JSON.parse(text);
        toast.error('PDF hatası: ' + (j.message || text.slice(0, 200)));
      } catch {
        toast.error('Sunucu PDF döndürmedi. Content-Type: ' + (blob.type || '(boş)'));
      }
      return;
    }

    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
    // Not: URL.revokeObjectURL burada hemen çağrılmıyor; yeni sekmede kullanımdan sonra manuel temizlenebilir.
  },
};


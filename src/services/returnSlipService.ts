import { apiClient } from './apiClient';
import type { CreateReturnSlipRequest, ReturnSlip, ReturnSlipMutationResult } from '../models';

export interface ReturnSlipListParams {
  contractId?: number;
  customerId?: number;
  status?: 'ACTIVE' | 'CANCELLED';
  /** Hasarlı/kayıp/satış kalemi olan fişler */
  hasLoss?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  includeItems?: boolean;
  limit?: number;
  offset?: number;
}

function buildQuery(params?: ReturnSlipListParams): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    sp.set(key, String(value));
  }
  const q = sp.toString();
  return q ? `?${q}` : '';
}

/**
 * İade fişi API'si. İzinler: contracts_view (liste/detay/PDF), contracts_update (oluşturma),
 * return_slips_cancel (iptal).
 */
export const returnSlipService = {
  async listAsync(params?: ReturnSlipListParams): Promise<{ items: ReturnSlip[]; total: number }> {
    return apiClient.get(`/return-slips${buildQuery(params)}`);
  },

  async listByContractAsync(contractId: number): Promise<ReturnSlip[]> {
    return apiClient.get<ReturnSlip[]>(`/contracts/${contractId}/return-slips`);
  },

  async createAsync(contractId: number, data: CreateReturnSlipRequest): Promise<ReturnSlipMutationResult> {
    return apiClient.post<ReturnSlipMutationResult>(`/contracts/${contractId}/return-slips`, data);
  },

  async cancelAsync(id: number, reason: string): Promise<ReturnSlipMutationResult> {
    return apiClient.patch<ReturnSlipMutationResult>(`/return-slips/${id}/cancel`, { reason });
  },

  async getPdfBlobAsync(id: number): Promise<Blob> {
    return apiClient.getBlob(`/return-slips/${id}/pdf`);
  },
};

import { apiClient } from './apiClient';
import {
  CashAccount,
  CashTransaction,
  CreateCashTransactionDto,
  ListTransactionsParams,
  ListTransactionsResponse,
} from '../models';

type CreateCashAccountDto = {
  name: string;
  type: 'CASH' | 'BANK';
  currency: 'TRY' | 'USD' | 'EUR' | 'GBP';
  allow_negative_balance: boolean;
  branch_name?: string;
  account_no?: string;
};

type UpdateCashAccountDto = Partial<CreateCashAccountDto> & {
  is_active?: boolean;
};

function buildQueryString(params?: ListTransactionsParams): string {
  const searchParams = new URLSearchParams();

  if (params?.cash_account_id) searchParams.set('cash_account_id', params.cash_account_id);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.type) searchParams.set('type', params.type);
  if (params?.startDate) searchParams.set('startDate', params.startDate);
  if (params?.endDate) searchParams.set('endDate', params.endDate);
  if (params?.limit != null) searchParams.set('limit', String(params.limit));
  if (params?.offset != null) searchParams.set('offset', String(params.offset));

  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export const cashService = {
  async createDraftAsync(dto: CreateCashTransactionDto): Promise<CashTransaction> {
    return apiClient.post<CashTransaction>('/cash/transactions', dto);
  },

  async approveAsync(id: string): Promise<CashTransaction> {
    return apiClient.post<CashTransaction>(`/cash/transactions/${id}/approve`);
  },

  async cancelAsync(id: string, reason: string): Promise<CashTransaction> {
    return apiClient.post<CashTransaction>(`/cash/transactions/${id}/cancel`, { reason });
  },

  async listAsync(params?: ListTransactionsParams): Promise<ListTransactionsResponse> {
    const query = buildQueryString(params);
    return apiClient.get<ListTransactionsResponse>(`/cash/transactions${query}`);
  },

  async getBalanceAsync(accountId: string): Promise<CashAccount> {
    return apiClient.get<CashAccount>(`/cash/accounts/${accountId}/balance`);
  },

  async downloadReceiptAsync(id: string): Promise<Blob> {
    return apiClient.getBlob(`/cash/transactions/${id}/receipt`);
  },

  async deleteAsync(id: string): Promise<void> {
    await apiClient.delete<void>(`/cash/transactions/${id}`);
  },

  async listAccountsAsync(type?: 'CASH' | 'BANK'): Promise<CashAccount[]> {
    const qs = type ? `?type=${type}` : '';
    return apiClient.get<CashAccount[]>(`/cash/accounts${qs}`);
  },

  async createAccountAsync(dto: CreateCashAccountDto): Promise<CashAccount> {
    return apiClient.post<CashAccount>('/cash/accounts', dto);
  },

  async updateAccountAsync(id: string, dto: UpdateCashAccountDto): Promise<CashAccount> {
    return apiClient.patch<CashAccount>(`/cash/accounts/${id}`, dto);
  },

  async deleteAccountAsync(id: string): Promise<void> {
    await apiClient.delete<void>(`/cash/accounts/${id}`);
  },
};


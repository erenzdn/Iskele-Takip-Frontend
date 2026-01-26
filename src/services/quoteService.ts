import { apiClient } from './apiClient';
import { Quote, QuoteStatus } from '../models';

export interface CreateQuoteDetailRequest {
  ItemId: number;
  Quantity: number;
  DailyPrice: number;
}

export interface CreateQuoteRequest {
  CustomerId: number;
  SiteId?: number;
  StartDate: string; // ISO 8601
  PlannedEndDate: string; // ISO 8601
  TotalPrice: number;
  Status?: QuoteStatus;
  Notes?: string;
  details: CreateQuoteDetailRequest[];
}

export interface UpdateQuoteRequest {
  CustomerId?: number;
  SiteId?: number;
  StartDate?: string;
  PlannedEndDate?: string;
  TotalPrice?: number;
  Status?: QuoteStatus;
  Notes?: string;
  details?: CreateQuoteDetailRequest[];
}

export interface CreateQuoteResponse {
  QuoteId: number;
}

export interface ConvertQuoteResponse {
  message: string;
  ContractId: number;
}

export const quoteService = {
  async getAllAsync(status?: QuoteStatus): Promise<Quote[]> {
    const url = status ? `/quotes?status=${status}` : '/quotes';
    return apiClient.get<Quote[]>(url);
  },

  async getByIdAsync(id: number): Promise<Quote> {
    return apiClient.get<Quote>(`/quotes/${id}`);
  },

  async getPendingQuotesAsync(): Promise<Quote[]> {
    return apiClient.get<Quote[]>('/quotes?status=pending');
  },

  async getAcceptedQuotesAsync(): Promise<Quote[]> {
    return apiClient.get<Quote[]>('/quotes?status=accepted');
  },

  async getRejectedQuotesAsync(): Promise<Quote[]> {
    return apiClient.get<Quote[]>('/quotes?status=rejected');
  },

  async createAsync(data: CreateQuoteRequest): Promise<CreateQuoteResponse> {
    return apiClient.post<CreateQuoteResponse>('/quotes', data);
  },

  async updateAsync(id: number, data: UpdateQuoteRequest): Promise<Quote> {
    return apiClient.patch<Quote>(`/quotes/${id}`, data);
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/quotes/${id}`);
  },

  async convertToContractAsync(id: number): Promise<ConvertQuoteResponse> {
    return apiClient.post<ConvertQuoteResponse>(`/quotes/${id}/convert`, {});
  },

  async acceptQuoteAsync(id: number): Promise<Quote> {
    return apiClient.patch<Quote>(`/quotes/${id}`, { Status: 'accepted' });
  },

  async rejectQuoteAsync(id: number): Promise<Quote> {
    return apiClient.patch<Quote>(`/quotes/${id}`, { Status: 'rejected' });
  },
};

import { apiClient } from './apiClient';
import { Contract, ReturnItemResponse } from '../models';

export interface CreateContractDetailRequest {
  ItemId: number;
  RentedQuantity: number;
  ReturnedQuantity: number;
  DailyPriceAtRent: number;
}

export interface CreateContractRequest {
  CustomerId: number;
  SiteId?: number; // Şantiye ID (opsiyonel)
  StartDate: string; // ISO 8601
  PlannedEndDate: string; // ISO 8601
  InitialTotalPrice: number;
  IsCompleted: boolean;
  details: CreateContractDetailRequest[];
}

export interface UpdateContractRequest extends CreateContractRequest {}

export interface CreateContractResponse {
  ContractId: number;
}

export const contractService = {
  async getAllAsync(): Promise<Contract[]> {
    return apiClient.get<Contract[]>('/contracts');
  },

  async getByIdAsync(id: number): Promise<Contract> {
    return apiClient.get<Contract>(`/contracts/${id}`);
  },

  async getActiveContractsAsync(): Promise<Contract[]> {
    return apiClient.get<Contract[]>('/contracts?status=active');
  },

  async getCompletedContractsAsync(): Promise<Contract[]> {
    return apiClient.get<Contract[]>('/contracts?status=completed');
  },

  async createAsync(data: CreateContractRequest): Promise<CreateContractResponse> {
    return apiClient.post<CreateContractResponse>('/contracts', data);
  },

  async updateAsync(id: number, data: UpdateContractRequest): Promise<void> {
    return apiClient.patch<void>(`/contracts/${id}`, data);
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/contracts/${id}`);
  },

  async completeContractAsync(id: number, actualEndDate: string): Promise<void> {
    return apiClient.patch<void>(`/contracts/${id}`, {
      ActualEndDate: actualEndDate,
      IsCompleted: true,
    });
  },

  async returnItemAsync(
    contractId: number,
    itemId: number,
    returnQuantity: number
  ): Promise<ReturnItemResponse> {
    return apiClient.post<ReturnItemResponse>(`/contracts/${contractId}/return`, {
      ItemId: itemId,
      ReturnQuantity: returnQuantity,
    });
  },

  async generateDocumentAsync(
    contractId: number,
    templateId: number,
    format: 'pdf' | 'docx' = 'pdf'
  ): Promise<Blob> {
    return apiClient.postBlob(`/contracts/${contractId}/generate-document`, {
      templateId,
      format,
    });
  },
};


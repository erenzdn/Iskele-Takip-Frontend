import { apiClient } from './apiClient';
import { PriceTier } from '../models';

export interface CreatePriceTierRequest {
  ItemId: number;
  MinDays: number;
  MaxDays: number;
  PriceMultiplier: number;
}

export interface UpdatePriceTierRequest extends CreatePriceTierRequest {}

export interface CreatePriceTierResponse {
  TierId: number;
}

export const priceTierService = {
  async getAllAsync(itemId?: number): Promise<PriceTier[]> {
    const endpoint = itemId ? `/price-tiers?itemId=${itemId}` : '/price-tiers';
    return apiClient.get<PriceTier[]>(endpoint);
  },

  async getByItemAsync(itemId: number): Promise<PriceTier[]> {
    return apiClient.get<PriceTier[]>(`/price-tiers?itemId=${itemId}`);
  },

  async getByIdAsync(id: number): Promise<PriceTier> {
    return apiClient.get<PriceTier>(`/price-tiers/${id}`);
  },

  async createAsync(data: CreatePriceTierRequest): Promise<CreatePriceTierResponse> {
    return apiClient.post<CreatePriceTierResponse>('/price-tiers', data);
  },

  async updateAsync(id: number, data: UpdatePriceTierRequest): Promise<void> {
    return apiClient.patch<void>(`/price-tiers/${id}`, data);
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/price-tiers/${id}`);
  },

  async getPriceMultiplierForDaysAsync(itemId: number, days: number): Promise<number> {
    const tiers = await this.getByItemAsync(itemId);
    const matchingTier = tiers.find(
      (tier) => days >= tier.MinDays && days <= tier.MaxDays
    );
    return matchingTier?.PriceMultiplier ?? 1.0;
  },
};


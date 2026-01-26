import { apiClient } from './apiClient';
import { PricingRule, PriceCalculationResult } from '../models';

export interface CreatePricingRuleRequest {
  RuleName: string;
  RuleType: number;
  Value: number;
  MinDays?: number;
  MaxDays?: number;
  MinQuantity?: number;
  IsActive: boolean;
  Description?: string;
}

export interface UpdatePricingRuleRequest extends CreatePricingRuleRequest {}

export interface CreatePricingRuleResponse {
  RuleId: number;
}

export const pricingRulesService = {
  async getAllAsync(): Promise<PricingRule[]> {
    return apiClient.get<PricingRule[]>('/pricing-rules');
  },

  async getByIdAsync(id: number): Promise<PricingRule> {
    return apiClient.get<PricingRule>(`/pricing-rules/${id}`);
  },

  async createAsync(data: CreatePricingRuleRequest): Promise<CreatePricingRuleResponse> {
    return apiClient.post<CreatePricingRuleResponse>('/pricing-rules', data);
  },

  async updateAsync(id: number, data: UpdatePricingRuleRequest): Promise<void> {
    return apiClient.patch<void>(`/pricing-rules/${id}`, data);
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/pricing-rules/${id}`);
  },

  async toggleActiveAsync(id: number, isActive: boolean): Promise<void> {
    return apiClient.patch<void>(`/pricing-rules/${id}`, { IsActive: isActive });
  },

  async calculatePriceAsync(
    contractId: number,
    actualEndDate?: string
  ): Promise<PriceCalculationResult> {
    const endpoint = actualEndDate
      ? `/pricing-rules/calculate?contractId=${contractId}&actualEndDate=${actualEndDate}`
      : `/pricing-rules/calculate?contractId=${contractId}`;
    return apiClient.get<PriceCalculationResult>(endpoint);
  },
};


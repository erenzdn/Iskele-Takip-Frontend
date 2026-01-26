import { apiClient } from './apiClient';
import { ConstructionSite } from '../models';

export interface CreateSiteRequest {
  SiteName: string;
  SiteAddress?: string;
  ResponsiblePerson?: string;
  ResponsiblePhone?: string;
}

export interface UpdateSiteRequest extends Partial<CreateSiteRequest> {}

export const siteService = {
  async getByCustomerAsync(customerId: number): Promise<ConstructionSite[]> {
    return apiClient.get<ConstructionSite[]>(`/customers/${customerId}/sites`);
  },

  async getByIdAsync(siteId: number): Promise<ConstructionSite> {
    return apiClient.get<ConstructionSite>(`/sites/${siteId}`);
  },

  async createAsync(customerId: number, data: CreateSiteRequest): Promise<ConstructionSite> {
    return apiClient.post<ConstructionSite>(`/customers/${customerId}/sites`, data);
  },

  async updateAsync(siteId: number, data: UpdateSiteRequest): Promise<ConstructionSite> {
    return apiClient.patch<ConstructionSite>(`/sites/${siteId}`, data);
  },

  async deleteAsync(siteId: number): Promise<void> {
    return apiClient.delete<void>(`/sites/${siteId}`);
  },
};

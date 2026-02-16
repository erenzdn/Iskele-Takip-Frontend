import { apiClient } from './apiClient';
import { AuditLog, Customer } from '../models';

export interface CreateCustomerRequest {
  Name: string;
  TaxId?: string;
  TaxOffice?: string;
  PhoneNumber?: string;
  Email?: string;
  Address?: string;
  CenterAuthorizedPerson?: string;
  CenterAuthorizedPhone?: string;
}

export interface UpdateCustomerRequest extends CreateCustomerRequest {}

export interface CreateCustomerResponse {
  CustomerId: number;
}

export const customerService = {
  async getAllAsync(): Promise<Customer[]> {
    return apiClient.get<Customer[]>('/customers');
  },

  async getByIdAsync(id: number): Promise<Customer> {
    return apiClient.get<Customer>(`/customers/${id}`);
  },

  async searchAsync(searchText: string): Promise<Customer[]> {
    // API'de search endpoint yok, tüm müşterileri alıp client-side filtreleme yapıyoruz
    const allCustomers = await apiClient.get<Customer[]>('/customers');
    const search = searchText.toLowerCase();
    return allCustomers.filter(
      (c) =>
        c.Name.toLowerCase().includes(search) ||
        (c.Email?.toLowerCase().includes(search) ?? false) ||
        (c.PhoneNumber?.toLowerCase().includes(search) ?? false) ||
        (c.TaxId?.toLowerCase().includes(search) ?? false) ||
        (c.TaxOffice?.toLowerCase().includes(search) ?? false) ||
        (c.CenterAuthorizedPerson?.toLowerCase().includes(search) ?? false) ||
        (c.CenterAuthorizedPhone?.toLowerCase().includes(search) ?? false)
    );
  },

  async createAsync(data: CreateCustomerRequest): Promise<CreateCustomerResponse> {
    return apiClient.post<CreateCustomerResponse>('/customers', data);
  },

  async updateAsync(id: number, data: UpdateCustomerRequest): Promise<void> {
    return apiClient.patch<void>(`/customers/${id}`, data);
  },

  async deleteAsync(id: number): Promise<void> {
    return apiClient.delete<void>(`/customers/${id}`);
  },

  async getAuditLogsByCustomerAsync(customerId: number): Promise<AuditLog[]> {
    return apiClient.get<AuditLog[]>(`/customers/${customerId}/audit-logs`);
  },
};


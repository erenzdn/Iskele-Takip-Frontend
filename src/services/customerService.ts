import { apiClient } from './apiClient';
import { AuditLog, AuthorizedContact, Customer } from '../models';

export interface CreateCustomerRequest {
  Name: string;
  TaxId?: string;
  TaxOffice?: string;
  PhoneNumber?: string;
  Email?: string;
  Address?: string;
  AuthorizedContacts?: AuthorizedContact[];
}

export interface UpdateCustomerRequest extends CreateCustomerRequest {}

export interface CreateCustomerResponse {
  CustomerId: number;
}

interface CustomerQueryOptions {
  forceRefresh?: boolean;
  staleTimeMs?: number;
}

interface CustomerCacheEntry {
  data: Customer[];
  fetchedAt: number;
}

const DEFAULT_CUSTOMER_STALE_TIME_MS = 60_000;
const customerListCache = new Map<string, CustomerCacheEntry>();
const inFlightCustomerLists = new Map<string, Promise<Customer[]>>();

function normalizeSearchKey(search?: string): string {
  return (search ?? '').trim().toLocaleLowerCase('tr-TR');
}

export const customerService = {
  async getAllAsync(search?: string, options?: CustomerQueryOptions): Promise<Customer[]> {
    const key = normalizeSearchKey(search);
    const staleTimeMs = options?.staleTimeMs ?? DEFAULT_CUSTOMER_STALE_TIME_MS;
    const forceRefresh = options?.forceRefresh ?? false;
    const now = Date.now();

    if (!forceRefresh) {
      const cached = customerListCache.get(key);
      if (cached && now - cached.fetchedAt < staleTimeMs) {
        return cached.data;
      }
      const pending = inFlightCustomerLists.get(key);
      if (pending) {
        return pending;
      }
    }

    const q = search?.trim();
    const endpoint = !q
      ? '/customers'
      : (() => {
          const sp = new URLSearchParams();
          sp.set('search', q);
          return `/customers?${sp.toString()}`;
        })();

    const request = apiClient.get<Customer[]>(endpoint).then((data) => {
      const customers = data ?? [];
      customerListCache.set(key, {
        data: customers,
        fetchedAt: Date.now(),
      });
      return customers;
    }).finally(() => {
      inFlightCustomerLists.delete(key);
    });

    inFlightCustomerLists.set(key, request);
    return request;
  },

  async getByIdAsync(id: number): Promise<Customer> {
    return apiClient.get<Customer>(`/customers/${id}`);
  },

  async searchAsync(searchText: string): Promise<Customer[]> {
    return this.getAllAsync(searchText);
  },

  async createAsync(data: CreateCustomerRequest): Promise<CreateCustomerResponse> {
    const created = await apiClient.post<CreateCustomerResponse>('/customers', data);
    customerListCache.clear();
    return created;
  },

  async updateAsync(id: number, data: UpdateCustomerRequest): Promise<void> {
    await apiClient.patch<void>(`/customers/${id}`, data);
    customerListCache.clear();
  },

  async deleteAsync(id: number): Promise<void> {
    await apiClient.delete<void>(`/customers/${id}`);
    customerListCache.clear();
  },

  async getAuditLogsByCustomerAsync(customerId: number): Promise<AuditLog[]> {
    return apiClient.get<AuditLog[]>(`/customers/${customerId}/audit-logs`);
  },
};


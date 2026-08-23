import { apiClient } from './apiClient';
import { AuditLog, AuthorizedContact, Customer } from '../models';
import {
  DEFAULT_PAGE_LIMIT,
  fetchAllPaginatedPages,
  normalizePaginatedResponse,
  type PaginatedResponse,
} from '../utils/paginatedResponse';

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

export interface CustomerListQuery {
  search?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

interface CustomerQueryOptions {
  forceRefresh?: boolean;
  staleTimeMs?: number;
  includeArchived?: boolean;
}

interface CustomerCacheEntry {
  data: Customer[];
  fetchedAt: number;
}

const DEFAULT_CUSTOMER_STALE_TIME_MS = 60_000;
const customerListCache = new Map<string, CustomerCacheEntry>();
const inFlightCustomerLists = new Map<string, Promise<Customer[]>>();

function normalizeSearchKey(search?: string, includeArchived?: boolean): string {
  return `${(search ?? '').trim().toLocaleLowerCase('tr-TR')}|${includeArchived ? '1' : '0'}`;
}

function buildCustomersEndpoint(query?: CustomerListQuery): string {
  const sp = new URLSearchParams();
  const q = query?.search?.trim();
  if (q) sp.set('search', q);
  if (query?.includeArchived) sp.set('includeArchived', 'true');
  if (query?.limit != null) sp.set('limit', String(query.limit));
  if (query?.offset != null) sp.set('offset', String(query.offset));
  const qs = sp.toString();
  return qs ? `/customers?${qs}` : '/customers';
}

export const customerService = {
  async getPageAsync(query?: CustomerListQuery): Promise<PaginatedResponse<Customer>> {
    const raw = await apiClient.get<Customer[] | PaginatedResponse<Customer>>(
      buildCustomersEndpoint(query)
    );
    return normalizePaginatedResponse(
      raw,
      query?.limit ?? DEFAULT_PAGE_LIMIT,
      query?.offset ?? 0
    );
  },

  async getAllAsync(search?: string, options?: CustomerQueryOptions): Promise<Customer[]> {
    const includeArchived = options?.includeArchived ?? false;
    const key = normalizeSearchKey(search, includeArchived);
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

    const request = fetchAllPaginatedPages<Customer>((limit, offset) =>
      this.getPageAsync({
        search,
        includeArchived: includeArchived || undefined,
        limit,
        offset,
      })
    )
      .then((page) => {
        const customers = page.items;
        customerListCache.set(key, {
          data: customers,
          fetchedAt: Date.now(),
        });
        return customers;
      })
      .finally(() => {
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

  async createContactAsync(customerId: number, data: { Name: string; Phone?: string; Email?: string; Title?: string; IsPrimary: boolean }): Promise<Customer> {
    const updatedCustomer = await apiClient.post<Customer>(`/customers/${customerId}/contacts`, data);
    customerListCache.clear();
    return updatedCustomer;
  },

  async getAuditLogsByCustomerAsync(customerId: number): Promise<AuditLog[]> {
    return apiClient.get<AuditLog[]>(`/customers/${customerId}/audit-logs`);
  },
};


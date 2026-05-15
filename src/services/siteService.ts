import { apiClient } from './apiClient';
import { ConstructionSite } from '../models';

export interface CreateSiteRequest {
  SiteName: string;
  SiteAddress?: string;
  ResponsiblePerson?: string;
  ResponsiblePhone?: string;
}

export interface UpdateSiteRequest extends Partial<CreateSiteRequest> {}

interface SiteCacheEntry {
  data: ConstructionSite[];
  fetchedAt: number;
}

interface SiteFetchOptions {
  forceRefresh?: boolean;
  staleTimeMs?: number;
}

interface BatchFetchOptions extends SiteFetchOptions {
  concurrency?: number;
}

const DEFAULT_SITE_STALE_TIME_MS = 60_000;
const siteCache = new Map<number, SiteCacheEntry>();
const inFlightByCustomer = new Map<number, Promise<ConstructionSite[]>>();
const siteToCustomer = new Map<number, number>();

function rememberSiteOwnership(customerId: number, sites: ConstructionSite[]) {
  for (const site of sites) {
    siteToCustomer.set(site.SiteId, customerId);
  }
}

function setCustomerSitesCache(customerId: number, sites: ConstructionSite[]) {
  siteCache.set(customerId, {
    data: sites,
    fetchedAt: Date.now(),
  });
  rememberSiteOwnership(customerId, sites);
}

function invalidateCustomerSites(customerId: number) {
  siteCache.delete(customerId);
}

function invalidateBySiteId(siteId: number) {
  const ownerCustomerId = siteToCustomer.get(siteId);
  if (ownerCustomerId != null) {
    siteCache.delete(ownerCustomerId);
  } else {
    // Sahip müşteri bilinmiyorsa güvenli tarafta kal: cache'i tamamen temizle.
    siteCache.clear();
  }
  siteToCustomer.delete(siteId);
}

function shouldUseCached(entry: SiteCacheEntry | undefined, staleTimeMs: number): boolean {
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < staleTimeMs;
}

async function runWithConcurrencyLimit<T>(
  items: number[],
  worker: (item: number) => Promise<T>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  if (items.length === 0) return results;
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const current = items[nextIndex];
      nextIndex += 1;
      const value = await worker(current);
      results.push(value);
    }
  });

  await Promise.all(workers);
  return results;
}

export const siteService = {
  async getByCustomerAsync(
    customerId: number,
    options?: SiteFetchOptions
  ): Promise<ConstructionSite[]> {
    const staleTimeMs = options?.staleTimeMs ?? DEFAULT_SITE_STALE_TIME_MS;
    const forceRefresh = options?.forceRefresh ?? false;

    if (!forceRefresh) {
      const cached = siteCache.get(customerId);
      if (shouldUseCached(cached, staleTimeMs)) {
        return cached!.data;
      }
      const pending = inFlightByCustomer.get(customerId);
      if (pending) {
        return pending;
      }
    }

    const request = apiClient
      .get<ConstructionSite[]>(`/customers/${customerId}/sites`)
      .then((data) => {
        const sites = data ?? [];
        setCustomerSitesCache(customerId, sites);
        return sites;
      })
      .finally(() => {
        inFlightByCustomer.delete(customerId);
      });

    inFlightByCustomer.set(customerId, request);
    return request;
  },

  async getByCustomersBatchedAsync(
    customerIds: number[],
    options?: BatchFetchOptions
  ): Promise<Map<number, ConstructionSite[]>> {
    const uniqueCustomerIds = Array.from(new Set(customerIds.filter((id) => id > 0)));
    const concurrency = Math.max(1, Math.min(options?.concurrency ?? 4, 8));
    const entries = await runWithConcurrencyLimit(
      uniqueCustomerIds,
      async (customerId) => {
        const sites = await this.getByCustomerAsync(customerId, options);
        return [customerId, sites] as const;
      },
      concurrency
    );
    return new Map<number, ConstructionSite[]>(entries);
  },

  async getByIdAsync(siteId: number): Promise<ConstructionSite> {
    return apiClient.get<ConstructionSite>(`/sites/${siteId}`);
  },

  async createAsync(customerId: number, data: CreateSiteRequest): Promise<ConstructionSite> {
    const created = await apiClient.post<ConstructionSite>(`/customers/${customerId}/sites`, data);
    invalidateCustomerSites(customerId);
    return created;
  },

  async updateAsync(siteId: number, data: UpdateSiteRequest): Promise<ConstructionSite> {
    const updated = await apiClient.patch<ConstructionSite>(`/sites/${siteId}`, data);
    invalidateBySiteId(siteId);
    return updated;
  },

  async deleteAsync(siteId: number): Promise<void> {
    await apiClient.delete<void>(`/sites/${siteId}`);
    invalidateBySiteId(siteId);
  },
};

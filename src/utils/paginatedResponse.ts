export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export function normalizePaginatedResponse<T>(
  raw: T[] | PaginatedResponse<T> | null | undefined,
  fallbackLimit = DEFAULT_PAGE_LIMIT,
  fallbackOffset = 0
): PaginatedResponse<T> {
  if (raw == null) {
    return { items: [], total: 0, limit: fallbackLimit, offset: fallbackOffset };
  }

  if (Array.isArray(raw)) {
    return {
      items: raw,
      total: raw.length,
      limit: raw.length > 0 ? raw.length : fallbackLimit,
      offset: fallbackOffset,
    };
  }

  if (typeof raw === 'object' && Array.isArray((raw as PaginatedResponse<T>).items)) {
    const page = raw as PaginatedResponse<T>;
    const items = page.items ?? [];
    return {
      items,
      total: typeof page.total === 'number' ? page.total : items.length,
      limit: typeof page.limit === 'number' ? page.limit : fallbackLimit,
      offset: typeof page.offset === 'number' ? page.offset : fallbackOffset,
    };
  }

  return { items: [], total: 0, limit: fallbackLimit, offset: fallbackOffset };
}

export function unwrapListItems<T>(raw: unknown): T[] {
  return normalizePaginatedResponse<T>(raw as T[] | PaginatedResponse<T>).items;
}

export async function fetchAllPaginatedPages<T>(
  fetchPage: (limit: number, offset: number) => Promise<PaginatedResponse<T>>,
  pageLimit = MAX_PAGE_LIMIT
): Promise<PaginatedResponse<T>> {
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  const allItems: T[] = [];
  let lastLimit = pageLimit;

  while (offset < total) {
    const page = await fetchPage(pageLimit, offset);
    allItems.push(...page.items);
    total = page.total;
    lastLimit = page.limit;
    if (page.items.length === 0) break;
    offset += page.limit;
    if (allItems.length >= total) break;
  }

  return {
    items: allItems,
    total: Number.isFinite(total) ? total : allItems.length,
    limit: lastLimit,
    offset: 0,
  };
}

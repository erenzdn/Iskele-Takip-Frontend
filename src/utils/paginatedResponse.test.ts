import { describe, expect, it } from 'vitest';
import {
  fetchAllPaginatedPages,
  normalizePaginatedResponse,
  unwrapListItems,
  type PaginatedResponse,
} from './paginatedResponse';

describe('normalizePaginatedResponse', () => {
  it('ham diziyi paginated formata çevirir', () => {
    const result = normalizePaginatedResponse([{ id: 1 }, { id: 2 }]);
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('paginated yanıttan items döner', () => {
    const raw: PaginatedResponse<{ id: number }> = {
      items: [{ id: 1 }],
      total: 10,
      limit: 50,
      offset: 0,
    };
    const result = normalizePaginatedResponse(raw);
    expect(result.items).toEqual([{ id: 1 }]);
    expect(result.total).toBe(10);
  });
});

describe('unwrapListItems', () => {
  it('paginated yanıttan dizi çıkarır', () => {
    expect(
      unwrapListItems({
        items: ['a', 'b'],
        total: 2,
        limit: 50,
        offset: 0,
      })
    ).toEqual(['a', 'b']);
  });
});

describe('fetchAllPaginatedPages', () => {
  it('birden fazla sayfayı birleştirir', async () => {
    const pages = [
      { items: [1, 2], total: 4, limit: 2, offset: 0 },
      { items: [3, 4], total: 4, limit: 2, offset: 2 },
    ];
    let call = 0;
    const result = await fetchAllPaginatedPages(async (_limit, offset) => {
      const page = pages[call];
      call += 1;
      expect(offset).toBe(page.offset);
      return page;
    }, 2);

    expect(result.items).toEqual([1, 2, 3, 4]);
    expect(result.total).toBe(4);
  });
});

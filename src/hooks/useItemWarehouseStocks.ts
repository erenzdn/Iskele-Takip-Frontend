import { useCallback, useEffect, useRef, useState } from 'react';
import type { WarehouseStock } from '../models';
import { inventoryService } from '../services/inventoryService';

async function fetchStocks(ids: number[]): Promise<Record<number, WarehouseStock[]>> {
  const out: Record<number, WarehouseStock[]> = {};
  await Promise.all(
    ids.map(async (id) => {
      try {
        out[id] = await inventoryService.getWarehousesByItemAsync(id);
      } catch {
        // Sorgu başarısızsa ürün "bilinmiyor" kalır; sunucu kontrolü yine geçerli.
      }
    })
  );
  return out;
}

/**
 * Verilen ürünlerin depo bazlı stoklarını yükler ve önbellekte tutar.
 * Listeye yeni ürün girince yalnızca o ürün sorgulanır; refresh() hepsini tazeler.
 */
export function useItemWarehouseStocks(itemIds: number[], enabled = true) {
  const [stocks, setStocks] = useState<Record<number, WarehouseStock[]>>({});
  const [loading, setLoading] = useState(false);
  const stocksRef = useRef(stocks);
  stocksRef.current = stocks;
  const idsKey = [...new Set(itemIds.filter((id) => id > 0))].sort((a, b) => a - b).join(',');

  useEffect(() => {
    if (!enabled || !idsKey) return;
    const missing = idsKey
      .split(',')
      .map(Number)
      .filter((id) => stocksRef.current[id] === undefined);
    if (missing.length === 0) return;
    let cancelled = false;
    setLoading(true);
    void fetchStocks(missing).then((fresh) => {
      if (cancelled) return;
      setStocks((prev) => ({ ...prev, ...fresh }));
      setLoading(false);
    });
    return () => {
      cancelled = true;
      setLoading(false);
    };
  }, [idsKey, enabled]);

  /** Güncel listedeki tüm ürünlerin stoklarını yeniden çeker ve taze haritayı döner. */
  const refresh = useCallback(async (): Promise<Record<number, WarehouseStock[]>> => {
    const ids = idsKey ? idsKey.split(',').map(Number) : [];
    if (ids.length === 0) return stocksRef.current;
    setLoading(true);
    try {
      const fresh = await fetchStocks(ids);
      const next = { ...stocksRef.current, ...fresh };
      stocksRef.current = next;
      setStocks(next);
      return next;
    } finally {
      setLoading(false);
    }
  }, [idsKey]);

  return { stocks, loading, refresh };
}

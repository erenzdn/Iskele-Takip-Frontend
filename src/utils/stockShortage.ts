import type { WarehouseStock } from '../models';

/** Bir ürünün belirli depoda ihtiyaç duyulan miktarı (ör. zeyilnameyle eklenen/artırılan adet). */
export interface StockNeed {
  ItemId: number;
  WarehouseId: number;
  label: string;
  required: number;
}

export interface StockShortage extends StockNeed {
  /** Depodaki kullanılabilir miktar (rezerve hariç) */
  available: number;
  /** required - available */
  missing: number;
}

export function stockNeedKey(itemId: number, warehouseId: number): string {
  return `${itemId}:${warehouseId}`;
}

/**
 * Depodaki kullanılabilir miktar: Quantity - sevk bekleyen rezervasyon
 * (sunucudaki checkWarehouseStockAvailability ile aynı kural).
 */
export function usableWarehouseStock(
  stocks: WarehouseStock[] | undefined,
  warehouseId: number
): number {
  const row = stocks?.find((s) => s.WarehouseId === warehouseId);
  if (!row) return 0;
  return Math.max(0, (Number(row.Quantity) || 0) - (Number(row.Reserved) || 0));
}

/** Aynı ürün + depo ihtiyaçlarını toplar; geçersiz/sıfır ihtiyaçları atar. */
export function aggregateStockNeeds(needs: StockNeed[]): StockNeed[] {
  const map = new Map<string, StockNeed>();
  for (const need of needs) {
    const required = Math.floor(Number(need.required) || 0);
    if (!(need.ItemId > 0) || !(need.WarehouseId > 0) || required <= 0) continue;
    const key = stockNeedKey(need.ItemId, need.WarehouseId);
    const prev = map.get(key);
    if (prev) prev.required += required;
    else map.set(key, { ...need, required });
  }
  return [...map.values()];
}

/**
 * İhtiyaçları depo stoklarıyla karşılaştırır, yalnızca eksik olanları döner.
 * Stoğu henüz yüklenmemiş ürünler (stocksByItem'da yok) yanlış alarm vermemek için atlanır.
 */
export function computeStockShortages(
  needs: StockNeed[],
  stocksByItem: Record<number, WarehouseStock[] | undefined>
): StockShortage[] {
  const out: StockShortage[] = [];
  for (const need of aggregateStockNeeds(needs)) {
    const stocks = stocksByItem[need.ItemId];
    if (stocks === undefined) continue;
    const available = usableWarehouseStock(stocks, need.WarehouseId);
    if (need.required > available) {
      out.push({ ...need, available, missing: need.required - available });
    }
  }
  return out;
}

/** Eksik listesinden ürün+depo → eksik adet haritası (satır rozetleri için). */
export function shortageMap(shortages: StockShortage[]): Map<string, StockShortage> {
  return new Map(shortages.map((s) => [stockNeedKey(s.ItemId, s.WarehouseId), s]));
}

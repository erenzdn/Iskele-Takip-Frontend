export interface ParsedWarehouseStock {
  name: string;
  quantity: number;
}

export interface ParsedStockError {
  summary: string;
  warehouses: ParsedWarehouseStock[];
}

export interface StockErrorQuantities {
  available?: number;
  requested?: number;
}

const WAREHOUSE_STOCK_MARKER = 'Depo stok durumu:';

/** Backend stok hata mesajından özet ve depo dağılımını çıkarır. */
export function parseStockError(message: string): ParsedStockError {
  const idx = message.indexOf(WAREHOUSE_STOCK_MARKER);
  if (idx === -1) {
    return { summary: message.trim(), warehouses: [] };
  }

  const summary = message.slice(0, idx).trim().replace(/\.$/, '');
  const stockPart = message
    .slice(idx + WAREHOUSE_STOCK_MARKER.length)
    .trim()
    .replace(/\.$/, '');

  if (stockPart === 'hiçbir depoda stok yok') {
    return { summary, warehouses: [] };
  }

  const warehouses = stockPart
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^"(.+?)":\s*(\d+)\s*adet$/);
      return match ? { name: match[1], quantity: Number(match[2]) } : null;
    })
    .filter((entry): entry is ParsedWarehouseStock => entry != null);

  return { summary, warehouses };
}

/** Depo bazlı veya genel stok yetersizliği mesajlarını tanır. */
export function isStockErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('yetersiz') ||
    lower.includes('stok') ||
    lower.includes('depoda bulunamadı') ||
    lower.includes('depo stok durumu')
  );
}

/** Hata metninden mevcut / istenen miktarları çıkarır. */
export function extractStockErrorQuantities(message: string): StockErrorQuantities {
  const general = message.match(/Mevcut:\s*(\d+)\s*,\s*İstenen:\s*(\d+)/i);
  if (general) {
    return { available: Number(general[1]), requested: Number(general[2]) };
  }

  const warehouse = message.match(/mevcut:\s*(\d+)/i);
  const requested = message.match(/(\d+)\s*adet talep edildi/i);
  return {
    available: warehouse ? Number(warehouse[1]) : undefined,
    requested: requested ? Number(requested[1]) : undefined,
  };
}

/** İlk tırnak içi ifadeyi (ürün veya depo adı) döndürür. */
export function extractFirstQuotedName(message: string): string | null {
  const match = message.match(/"([^"]+)"/);
  return match ? match[1] : null;
}

import type { ContractLineItem, Inventory } from '../models';

export function contractLineRentedQuantity(line: ContractLineItem): number {
  return Math.max(0, Number(line.RentedQuantity) || 0);
}

export function remainingContractLineQuantity(line: ContractLineItem): number {
  const rented = contractLineRentedQuantity(line);
  if (line.kind === 'inventory') {
    return Math.max(0, rented - (Number(line.ReturnedQuantity) || 0));
  }
  return rented;
}

/** Aynı ürünün sözleşmedeki tüm satırlarında kiralanan / satılan toplam adet. */
export function totalRentedQuantityForItem(
  lines: readonly ContractLineItem[],
  itemId: number
): number {
  return lines.reduce((sum, line) => {
    if (line.kind === 'inventory' && line.ItemId === itemId) {
      return sum + contractLineRentedQuantity(line);
    }
    return sum;
  }, 0);
}

export function resolveInventoryForContractLine(
  line: ContractLineItem,
  catalog: readonly Inventory[] = []
): Inventory | undefined {
  if (line.kind !== 'inventory' || !line.ItemId) return undefined;
  const fromCatalog = catalog.find((item) => item.ItemId === line.ItemId);
  if (fromCatalog) return fromCatalog;
  if (line.Item?.ItemId) return line.Item;
  return {
    ItemId: line.ItemId,
    ItemName: line.ItemName,
    ItemNameEn: line.ItemNameEn ?? undefined,
    ItemCode: line.ItemCode,
  } as Inventory;
}

export function contractLinePeekSearchText(line: ContractLineItem): string {
  if (line.kind === 'manual') return line.Description ?? '';
  return [line.ItemCode, line.ItemName, line.ItemNameEn, line.WarehouseName]
    .filter((part) => typeof part === 'string' && part.trim())
    .join(' ');
}

export function filterContractLinesForPeek(
  lines: ContractLineItem[],
  query: string
): ContractLineItem[] {
  const q = query.trim().toLocaleLowerCase('tr-TR');
  if (!q) return lines;
  return lines.filter((line) =>
    contractLinePeekSearchText(line).toLocaleLowerCase('tr-TR').includes(q)
  );
}

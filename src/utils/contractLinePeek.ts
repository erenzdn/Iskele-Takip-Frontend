import type { ContractLineItem } from '../models';

export function remainingContractLineQuantity(line: ContractLineItem): number {
  const rented = Number(line.RentedQuantity) || 0;
  if (line.kind === 'inventory') {
    return Math.max(0, rented - (Number(line.ReturnedQuantity) || 0));
  }
  return Math.max(0, rented);
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

import type { ContractLineItem, ContractQuoteType, CurrencyCode, Inventory } from '../models';
import { clampDiscountRange } from './lineDiscount';

/** Stok kartı liste fiyatı (teklif / sözleşme ürün ekleme ile aynı kaynak). */
export function inventoryUnitPriceForContractType(
  inv: Inventory,
  cur: CurrencyCode,
  cType: ContractQuoteType
): number {
  if (cType === 'SALE') {
    return cur === 'EUR'
      ? inv.UnitPriceEur ?? 0
      : cur === 'USD'
        ? inv.UnitPriceUsd ?? 0
        : inv.UnitPrice ?? 0;
  }
  return cur === 'EUR'
    ? (inv.MonthlyListPriceEur ?? 0) / 30
    : cur === 'USD'
      ? (inv.MonthlyListPriceUsd ?? 0) / 30
      : (inv.MonthlyListPrice || 0) / 30;
}

/** Sözleşme satırının zeyilname günlük / birim fiyatına denk gelen değeri. */
export function contractLineUnitPriceForAddendum(
  line: ContractLineItem,
  contractType: ContractQuoteType
): number {
  if (line.kind === 'manual') return Number(line.UnitPriceSnapshot) || 0;
  if (contractType === 'SALE') {
    return Number(line.OverrideUnitPrice ?? line.UnitPriceSnapshot) || 0;
  }
  if (line.OverrideMonthlyPrice != null && Number.isFinite(line.OverrideMonthlyPrice)) {
    return line.OverrideMonthlyPrice / 30;
  }
  if (line.MonthlyPriceOverride != null && Number.isFinite(line.MonthlyPriceOverride)) {
    return line.MonthlyPriceOverride / 30;
  }
  return Number(line.UnitPriceSnapshot) || 0;
}

function pickMatchingInventoryLine(
  contractLines: ContractLineItem[] | undefined,
  itemId: number,
  preferredWarehouseId?: number | ''
): Extract<ContractLineItem, { kind: 'inventory' }> | undefined {
  const lines = (contractLines ?? []).filter(
    (line): line is Extract<ContractLineItem, { kind: 'inventory' }> =>
      line.kind === 'inventory' && line.ItemId === itemId
  );
  if (lines.length === 0) return undefined;
  const preferredWh =
    typeof preferredWarehouseId === 'number' && preferredWarehouseId > 0
      ? preferredWarehouseId
      : null;
  const preferred =
    preferredWh != null ? lines.find((line) => line.WarehouseId === preferredWh) : undefined;
  return preferred ?? [...lines].sort((a, b) => (a.DetailId ?? 0) - (b.DetailId ?? 0))[0];
}

export type AddendumAddedItemPricing = {
  unitPrice: number;
  discountPercent: number;
};

/**
 * Zeyilnameye ürün eklerken ilk birim fiyat + iskonto.
 * Aynı ürün sözleşmede varsa o satır; yoksa stok kartı fiyatı ve sözleşme genel iskontosu.
 */
export function resolveAddendumAddedItemPricing(opts: {
  item: Inventory;
  contractType: ContractQuoteType;
  currency: CurrencyCode;
  contractLines?: ContractLineItem[];
  preferredWarehouseId?: number | '';
  fallbackDiscountPercent?: number;
}): AddendumAddedItemPricing {
  const fallbackDiscount = clampDiscountRange(opts.fallbackDiscountPercent ?? 0);
  const catalogPrice = inventoryUnitPriceForContractType(
    opts.item,
    opts.currency,
    opts.contractType
  );
  const line = pickMatchingInventoryLine(
    opts.contractLines,
    opts.item.ItemId,
    opts.preferredWarehouseId
  );
  if (!line) {
    return { unitPrice: catalogPrice, discountPercent: fallbackDiscount };
  }
  const fromContract = contractLineUnitPriceForAddendum(line, opts.contractType);
  const unitPrice = fromContract > 0 ? fromContract : catalogPrice;
  const discountPercent =
    line.Iskonto != null && Number.isFinite(Number(line.Iskonto))
      ? clampDiscountRange(Number(line.Iskonto))
      : fallbackDiscount;
  return { unitPrice, discountPercent };
}

/** Zeyilnameye ürün eklerken ilk birim fiyat. */
export function resolveAddendumAddedItemUnitPrice(
  opts: Parameters<typeof resolveAddendumAddedItemPricing>[0]
): number {
  return resolveAddendumAddedItemPricing(opts).unitPrice;
}

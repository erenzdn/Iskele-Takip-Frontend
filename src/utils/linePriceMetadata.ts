import type {
  ContractQuoteType,
  PriceSource,
  QuoteLineItem,
} from '../models';
import type { CreateQuoteDetailRequest } from '../services/quoteService';
import { encodeLinePricingForPersistence } from './lineDiscount';

export type NullablePriceOverride = number | null | undefined;

function finiteNumber(value: unknown): number | undefined {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function firstFiniteField(
  source: Record<string, unknown>,
  keys: readonly string[]
): number | undefined {
  for (const key of keys) {
    const parsed = finiteNumber(source[key]);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function positiveId(value: unknown): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

export interface HydratedQuotePriceMetadata {
  unitPriceSnapshot: number;
  monthlyPriceOverride?: number;
  priceSource: PriceSource;
  overrideUnitPrice?: number;
  overrideMonthlyPrice?: number;
}

export function hydrateQuotePriceMetadata(
  detail: Record<string, unknown>,
  quoteType: ContractQuoteType
): HydratedQuotePriceMetadata {
  const unitPriceSnapshot =
    firstFiniteField(detail, [
      'UnitPriceSnapshot',
      'unitPriceSnapshot',
      'DailyPrice',
      'dailyPrice',
    ]) ?? 0;
  const monthlyPriceOverride = firstFiniteField(detail, [
    'OverrideMonthlyPrice',
    'overrideMonthlyPrice',
    'MonthlyPriceOverride',
    'monthlyPriceOverride',
  ]);
  // Backend'den OverrideUnitPrice doğrudan geliyorsa onu kullan
  const overrideUnitPriceFromBackend = firstFiniteField(detail, [
    'OverrideUnitPrice',
    'overrideUnitPrice',
  ]);
  
  const rawPriceSource = String(detail.PriceSource ?? detail.priceSource ?? 'INVENTORY').toUpperCase();
  const priceSource: PriceSource =
    rawPriceSource === 'OVERRIDE' || rawPriceSource === 'MANUAL'
      ? rawPriceSource
      : 'INVENTORY';

  return {
    unitPriceSnapshot,
    monthlyPriceOverride,
    priceSource,
    overrideUnitPrice:
      quoteType === 'SALE'
        ? (overrideUnitPriceFromBackend ?? (priceSource === 'OVERRIDE' ? unitPriceSnapshot : undefined))
        : undefined,
    overrideMonthlyPrice: quoteType === 'RENTAL' ? monthlyPriceOverride : undefined,
  };
}

export function persistPriceOfLine(item: QuoteLineItem, quoteType: ContractQuoteType): number {
  if (item.kind === 'manual') return item.UnitPriceSnapshot;
  if (quoteType === 'SALE') return item.OverrideUnitPrice ?? item.UnitPriceSnapshot;
  return item.OverrideMonthlyPrice ?? item.MonthlyPriceOverride ?? item.UnitPriceSnapshot * 30;
}

export function applyQuotedLinePrice(
  item: QuoteLineItem,
  quoteType: ContractQuoteType,
  price: number
): QuoteLineItem {
  if (item.kind === 'manual') {
    return { ...item, UnitPriceSnapshot: price };
  }
  if (quoteType === 'SALE') {
    return { ...item, OverrideUnitPrice: price };
  }
  return { ...item, OverrideMonthlyPrice: price };
}

function applyEncodedLinePrice(
  item: QuoteLineItem,
  quoteType: ContractQuoteType,
  encoded: ReturnType<typeof encodeLinePricingForPersistence>
): QuoteLineItem {
  if (!encoded.priceChanged) return item;
  return applyQuotedLinePrice(item, quoteType, encoded.price);
}

export function buildQuoteDetailRequest(
  item: QuoteLineItem,
  quoteType: ContractQuoteType,
  iskonto: number
): CreateQuoteDetailRequest {
  const encoded = encodeLinePricingForPersistence({
    currentPrice: persistPriceOfLine(item, quoteType),
    quantity: item.Quantity,
    discountPercent: iskonto,
  });
  const persisted = applyEncodedLinePrice(item, quoteType, encoded);
  const quoteDetailId = positiveId(persisted.QuoteDetailId);
  if (persisted.kind === 'manual') {
    return {
      ...(quoteDetailId !== undefined ? { QuoteDetailId: quoteDetailId } : {}),
      is_manual: true,
      Description: persisted.Description,
      Quantity: persisted.Quantity,
      DailyPrice: persisted.UnitPriceSnapshot,
      Iskonto: encoded.discountPercent,
    };
  }

  const normalizeTextOverride = (value: unknown): string | null => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || null;
  };
  const payload: CreateQuoteDetailRequest = {
    ...(quoteDetailId !== undefined ? { QuoteDetailId: quoteDetailId } : {}),
    ItemId: persisted.ItemId,
    Quantity: persisted.Quantity,
    is_manual: false,
    ItemNameOverride: normalizeTextOverride(persisted.ItemNameOverride),
    ItemCodeOverride: normalizeTextOverride(persisted.ItemCodeOverride),
    Iskonto: encoded.discountPercent,
  };

  const override: NullablePriceOverride =
    quoteType === 'SALE' ? persisted.OverrideUnitPrice : persisted.OverrideMonthlyPrice;
  if (override === null || (typeof override === 'number' && Number.isFinite(override))) {
    if (quoteType === 'SALE') payload.OverrideUnitPrice = override;
    else payload.OverrideMonthlyPrice = override;
  }
  return payload;
}

export interface NormalizedContractPrice {
  value?: number;
  error?: string;
}

export function normalizeContractDetailPrice(
  detail: Record<string, unknown>
): NormalizedContractPrice {
  const value = firstFiniteField(detail, [
    'UnitPriceSnapshot',
    'unitPriceSnapshot',
    'DailyPriceAtRent',
    'dailyPriceAtRent',
    'DailyPrice',
    'dailyPrice',
  ]);
  if (value !== undefined) return { value };

  const id =
    positiveId(detail.DetailId ?? detail.detailId) ??
    positiveId(detail.ItemId ?? detail.itemId);
  return {
    error: `${id != null ? `${id} kimlikli` : 'Bir'} sözleşme satırında geçerli fiyat bulunamadı.`,
  };
}

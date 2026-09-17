import type {
  ContractQuoteType,
  PriceSource,
  QuoteLineItem,
} from '../models';
import type { CreateQuoteDetailRequest } from '../services/quoteService';

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
    'MonthlyPriceOverride',
    'monthlyPriceOverride',
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
      quoteType === 'SALE' && priceSource === 'OVERRIDE' ? unitPriceSnapshot : undefined,
    overrideMonthlyPrice: quoteType === 'RENTAL' ? monthlyPriceOverride : undefined,
  };
}

export function buildQuoteDetailRequest(
  item: QuoteLineItem,
  quoteType: ContractQuoteType,
  iskonto: number
): CreateQuoteDetailRequest {
  const quoteDetailId = positiveId(item.QuoteDetailId);
  if (item.kind === 'manual') {
    return {
      ...(quoteDetailId !== undefined ? { QuoteDetailId: quoteDetailId } : {}),
      is_manual: true,
      Description: item.Description,
      Quantity: item.Quantity,
      DailyPrice: item.UnitPriceSnapshot,
      Iskonto: iskonto,
    };
  }

  const normalizeTextOverride = (value: unknown): string | null => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || null;
  };
  const payload: CreateQuoteDetailRequest = {
    ...(quoteDetailId !== undefined ? { QuoteDetailId: quoteDetailId } : {}),
    ItemId: item.ItemId,
    Quantity: item.Quantity,
    is_manual: false,
    ItemNameOverride: normalizeTextOverride(item.ItemNameOverride),
    ItemCodeOverride: normalizeTextOverride(item.ItemCodeOverride),
    Iskonto: iskonto,
  };

  const override: NullablePriceOverride =
    quoteType === 'SALE' ? item.OverrideUnitPrice : item.OverrideMonthlyPrice;
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

import type {
  BillingCurrentPeriodProjection,
  BillingPeriod,
  BillingPeriodLine,
  BillingSummary,
  BillingVarianceReason,
  ContractLineItem,
  InvoiceBreakdown,
  InvoiceLineBreakdown,
  InvoiceLineKind,
  MarkBilledPeriodRequest,
} from '../models';
import { todayDateInput } from './dateInput';
import { parseMoneyInput, roundTo } from './lineDiscount';

/** Backend maddi fark eşiği; UI aynı eşiği uygular. */
export const BILLING_VARIANCE_THRESHOLD = 0.01;

export type BillingPeriodStatus = 'in_progress' | 'unbilled' | 'billed' | 'variance';

export type DueNowTone = 'positive' | 'zero' | 'overbilled';

export type BillingVarianceKind = 'none' | 'under' | 'over';

export interface BillingVarianceDisplay {
  kind: BillingVarianceKind;
  amount: number | null;
  label: string;
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as Record<string, unknown>;
}

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key];
  }
  return undefined;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.trim().replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = asNumber(value, Number.NaN);
  return Number.isFinite(n) ? n : null;
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value == null) return fallback;
  return String(value);
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  return false;
}

function parseVarianceReason(raw: unknown): BillingVarianceReason | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const addendumId = Math.floor(asNumber(pick(obj, 'AddendumId', 'addendumId'), 0));
  if (!Number.isFinite(addendumId) || addendumId <= 0) return null;
  const reasonRaw = pick(obj, 'Reason', 'reason');
  return {
    AddendumId: addendumId,
    AddendumNumber: Math.floor(asNumber(pick(obj, 'AddendumNumber', 'addendumNumber'), 0)),
    Reason: reasonRaw == null || reasonRaw === '' ? null : asString(reasonRaw),
    EffectiveDate: asString(pick(obj, 'EffectiveDate', 'effectiveDate')),
  };
}

function parsePeriodLine(raw: unknown): BillingPeriodLine | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const detailId = Math.floor(asNumber(pick(obj, 'DetailId', 'detailId'), 0));
  const itemId = Math.floor(asNumber(pick(obj, 'ItemId', 'itemId'), 0));
  if (!Number.isFinite(detailId) || !Number.isFinite(itemId)) return null;
  return {
    DetailId: detailId,
    ItemId: itemId,
    gross: asNumber(pick(obj, 'gross', 'Gross')),
    net: asNumber(pick(obj, 'net', 'Net')),
  };
}

export function parseBillingPeriod(raw: unknown): BillingPeriod | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const periodStart = asString(pick(obj, 'periodStart', 'PeriodStart'));
  const periodEnd = asString(pick(obj, 'periodEnd', 'PeriodEnd'));
  if (!periodStart || !periodEnd) return null;
  const reasonsRaw = pick(obj, 'varianceReasons', 'VarianceReasons');
  const linesRaw = pick(obj, 'lines', 'Lines');
  return {
    index: Math.floor(asNumber(pick(obj, 'index', 'Index'), 0)),
    periodStart,
    periodEnd,
    isPartial: asBoolean(pick(obj, 'isPartial', 'IsPartial')),
    isClosed: asBoolean(pick(obj, 'isClosed', 'IsClosed')),
    accrualSubtotal: asNumber(pick(obj, 'accrualSubtotal', 'AccrualSubtotal')),
    accrualNetTotal: asNumber(pick(obj, 'accrualNetTotal', 'AccrualNetTotal')),
    billedAmount: asNumberOrNull(pick(obj, 'billedAmount', 'BilledAmount')),
    variance: asNumberOrNull(pick(obj, 'variance', 'Variance')),
    varianceReasons: Array.isArray(reasonsRaw)
      ? reasonsRaw.map(parseVarianceReason).filter((r): r is BillingVarianceReason => r != null)
      : [],
    lines: Array.isArray(linesRaw)
      ? linesRaw.map(parsePeriodLine).filter((l): l is BillingPeriodLine => l != null)
      : [],
  };
}

const INVOICE_LINE_KINDS = [
  'RENTAL',
  'RETURN',
  'DECREASE',
  'SETTLEMENT',
  'SETTLEMENT_CHARGE',
  'MANUAL',
  'ADJUSTMENT',
  'CATCH_UP',
] as const;

function parseInvoiceLine(raw: unknown): InvoiceLineBreakdown | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const detailId = Math.floor(asNumber(pick(obj, 'DetailId', 'detailId'), Number.NaN));
  if (!Number.isFinite(detailId)) return null;
  const start = pick(obj, 'periodStart', 'PeriodStart');
  const end = pick(obj, 'periodEnd', 'PeriodEnd');
  const days = asNumberOrNull(pick(obj, 'days', 'Days'));
  const isManual = asBoolean(pick(obj, 'isManual', 'IsManual'));
  const kindRaw = asString(pick(obj, 'kind', 'Kind')).toUpperCase();
  const kind: InvoiceLineKind = (INVOICE_LINE_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as InvoiceLineKind)
    : isManual
      ? 'MANUAL'
      : 'RENTAL';
  const cohortStart = pick(obj, 'cohortStart', 'CohortStart');
  const exitDate = pick(obj, 'exitDate', 'ExitDate');
  return {
    DetailId: detailId,
    ItemId: Math.floor(asNumber(pick(obj, 'ItemId', 'itemId'), 0)),
    isManual,
    kind,
    quantity: asNumber(pick(obj, 'quantity', 'Quantity')),
    cohortStart: cohortStart ? asString(cohortStart) : null,
    exitDate: exitDate ? asString(exitDate) : null,
    periodStart: start ? asString(start) : null,
    periodEnd: end ? asString(end) : null,
    days: days != null ? Math.round(days) : null,
    gross: asNumber(pick(obj, 'gross', 'Gross')),
    net: asNumber(pick(obj, 'net', 'Net')),
    ...(kind === 'CATCH_UP'
      ? {
          missedInvoiceId: asNumberOrNull(pick(obj, 'missedInvoiceId', 'MissedInvoiceId')),
          missedInvoiceNumber: optionalString(pick(obj, 'missedInvoiceNumber', 'MissedInvoiceNumber')),
        }
      : {}),
  };
}

function optionalString(value: unknown): string | null {
  return value == null || value === '' ? null : asString(value);
}

export function parseInvoiceBreakdown(raw: unknown): InvoiceBreakdown {
  const obj = asRecord(raw);
  const linesRaw = obj ? pick(obj, 'lines', 'Lines') : null;
  return {
    lines: Array.isArray(linesRaw)
      ? linesRaw.map(parseInvoiceLine).filter((l): l is InvoiceLineBreakdown => l != null)
      : [],
    subtotalNet: obj ? asNumber(pick(obj, 'subtotalNet', 'SubtotalNet')) : 0,
    vatAmount: obj ? asNumber(pick(obj, 'vatAmount', 'VatAmount')) : 0,
    netTotal: obj ? asNumber(pick(obj, 'netTotal', 'NetTotal')) : 0,
    catchUpNet: obj ? asNumber(pick(obj, 'catchUpNet', 'CatchUpNet')) : 0,
    catchUpTotal: obj ? asNumber(pick(obj, 'catchUpTotal', 'CatchUpTotal')) : 0,
  };
}

function shortDate(key: string | null): string {
  const m = key ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(key) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

export interface InvoiceLinePresentation {
  /** Dönem sütunu: "29.10.2026 - 31.10.2026" ya da "Tek seferlik" vb. */
  periodText: string;
  /** Satırın yanındaki kısa etiketler */
  badges: string[];
}

/**
 * Ürün bazlı kırılım satırının ekrandaki dönem metni ve etiketleri.
 * @param line Satır
 * @param allLines Kırılımın tüm satırları (aynı üründe birden çok parti var mı diye bakılır)
 * @param invoiceEndKey Fatura bitiş günü (YYYY-MM-DD, dahil) — asgari 30 gün taşmasını işaretlemek için
 */
export function presentInvoiceLine(
  line: InvoiceLineBreakdown,
  allLines: InvoiceLineBreakdown[],
  invoiceEndKey: string
): InvoiceLinePresentation {
  const badges: string[] = [];
  let periodText = '—';
  if (line.periodStart && line.periodEnd) {
    periodText = `${shortDate(line.periodStart)} - ${shortDate(line.periodEnd)}`;
  } else if (line.kind === 'MANUAL' || (line.kind === 'CATCH_UP' && line.isManual)) {
    periodText = 'Tek seferlik';
  } else if (line.kind === 'SETTLEMENT_CHARGE') {
    periodText = 'Malzeme bedeli';
  } else if (line.kind === 'ADJUSTMENT') {
    periodText = 'Düzeltme (geçmiş kayıt)';
  }

  const sameDetail = allLines.filter((l) => l.DetailId === line.DetailId && l.cohortStart);
  const batchCount = new Set(sameDetail.map((l) => l.cohortStart)).size;
  if (line.kind !== 'CATCH_UP' && batchCount > 1 && line.cohortStart && line.periodStart === line.cohortStart) {
    badges.push(`Parti ${shortDate(line.cohortStart)}`);
  }
  if (line.kind === 'CATCH_UP') {
    const prefix = line.isManual ? '' : 'İlk ay · ';
    badges.push(
      line.missedInvoiceNumber
        ? `${prefix}${line.missedInvoiceNumber} kesildikten sonra eklendi`
        : `${prefix}önceki fatura kesildikten sonra eklendi`
    );
  }
  if (line.exitDate) {
    if (line.kind === 'RETURN') badges.push(`İade ${shortDate(line.exitDate)}`);
    else if (line.kind === 'DECREASE') badges.push(`Azaltma ${shortDate(line.exitDate)}`);
    else if (line.kind === 'SETTLEMENT') badges.push(`Satış/kayıp ${shortDate(line.exitDate)}`);
  }
  if (line.kind !== 'CATCH_UP' && line.periodEnd && invoiceEndKey && line.periodEnd > invoiceEndKey) {
    badges.push('Asgari 30 gün');
  }
  return { periodText, badges };
}

export function parseBillingPlan(raw: unknown): BillingPeriod[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseBillingPeriod).filter((p): p is BillingPeriod => p != null);
}

function parseProjection(raw: unknown): BillingCurrentPeriodProjection | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const periodStart = asString(pick(obj, 'periodStart', 'PeriodStart'));
  const periodEnd = asString(pick(obj, 'periodEnd', 'PeriodEnd'));
  if (!periodStart || !periodEnd) return null;
  return {
    periodStart,
    periodEnd,
    projectedNetTotal: asNumber(pick(obj, 'projectedNetTotal', 'ProjectedNetTotal')),
  };
}

export function parseBillingSummary(raw: unknown): BillingSummary {
  const obj = asRecord(raw);
  if (!obj) {
    return {
      asOf: '',
      dueNow: 0,
      currentPeriodProjection: null,
      warnings: [],
    };
  }
  const warningsRaw = pick(obj, 'warnings', 'Warnings');
  return {
    asOf: asString(pick(obj, 'asOf', 'AsOf')),
    dueNow: asNumber(pick(obj, 'dueNow', 'DueNow')),
    currentPeriodProjection: parseProjection(pick(obj, 'currentPeriodProjection', 'CurrentPeriodProjection')),
    warnings: Array.isArray(warningsRaw)
      ? warningsRaw.map((w) => asString(w)).filter((w) => w.trim().length > 0)
      : [],
  };
}

/** §3.2 durum rozeti — sırayla değerlendirilir. */
export function getBillingPeriodStatus(
  period: Pick<BillingPeriod, 'isClosed' | 'billedAmount' | 'variance'>
): BillingPeriodStatus {
  if (!period.isClosed) return 'in_progress';
  if (period.billedAmount == null) return 'unbilled';
  const variance = period.variance ?? 0;
  if (Math.abs(variance) <= BILLING_VARIANCE_THRESHOLD) return 'billed';
  return 'variance';
}

export function getBillingPeriodStatusLabel(status: BillingPeriodStatus): string {
  switch (status) {
    case 'in_progress':
      return 'Devam ediyor';
    case 'unbilled':
      return 'Faturalanmadı';
    case 'billed':
      return 'Faturalandı';
    case 'variance':
      return 'Fark var';
  }
}

export function getBillingPeriodStatusClass(status: BillingPeriodStatus): string {
  switch (status) {
    case 'in_progress':
      return 'bg-sky-500/20 text-sky-200 border-sky-500/40';
    case 'unbilled':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    case 'billed':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'variance':
      return 'bg-red-500/20 text-red-300 border-red-500/40';
  }
}

export function getBillingVarianceDisplay(variance: number | null): BillingVarianceDisplay {
  if (variance == null || Math.abs(variance) <= BILLING_VARIANCE_THRESHOLD) {
    return { kind: 'none', amount: null, label: '—' };
  }
  if (variance > 0) {
    return {
      kind: 'under',
      amount: variance,
      label: 'eksik faturalandı (ek fatura gerekir)',
    };
  }
  return {
    kind: 'over',
    amount: Math.abs(variance),
    label: 'fazla faturalandı (iade/alacak gerekir)',
  };
}

export function getDueNowPresentation(dueNow: number): { tone: DueNowTone; rounded: number } {
  const rounded = roundTo(dueNow, 2);
  if (rounded > 0) return { tone: 'positive', rounded };
  if (rounded < 0) return { tone: 'overbilled', rounded };
  return { tone: 'zero', rounded: 0 };
}

export function canMarkBilledPeriod(opts: {
  isClosed: boolean;
  billedAmount: number | null;
  canUpdate: boolean;
  contractCancelled: boolean;
  contractArchived: boolean;
}): boolean {
  if (!opts.canUpdate) return false;
  if (opts.contractCancelled || opts.contractArchived) return false;
  if (!opts.isClosed) return false;
  if (opts.billedAmount != null) return false;
  return true;
}

export function canUnmarkBilledPeriod(opts: {
  billedAmount: number | null;
  canUpdate: boolean;
  contractCancelled: boolean;
  contractArchived: boolean;
}): boolean {
  if (!opts.canUpdate) return false;
  if (opts.contractCancelled || opts.contractArchived) return false;
  return opts.billedAmount != null;
}

export function getMarkBilledDisabledReason(opts: {
  isClosed: boolean;
  contractCancelled: boolean;
  contractArchived: boolean;
}): string | null {
  if (opts.contractCancelled || opts.contractArchived) {
    return 'İptal veya arşiv sözleşmelerinde işaretleme yalnızca bilgi amaçlıdır';
  }
  if (!opts.isClosed) return 'Dönem tamamlanınca işaretlenebilir';
  return null;
}

export function formatBilledAmountInputDefault(amount: number): string {
  const rounded = roundTo(amount, 2);
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
}

export function parseBilledAmountInput(raw: string): number | null {
  return parseMoneyInput(raw);
}

export function validateBilledAmountInput(raw: string): string | null {
  const parsed = parseBilledAmountInput(raw);
  if (parsed == null) return 'Faturalanan tutar 0 veya daha büyük bir sayı olmalıdır';
  return null;
}

export function buildMarkBilledPeriodBody(
  period: Pick<BillingPeriod, 'periodStart' | 'periodEnd'>,
  billedAmount: number,
  notes: string
): MarkBilledPeriodRequest {
  const trimmed = notes.trim();
  return {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    billedAmount: roundTo(billedAmount, 2),
    notes: trimmed.length > 0 ? trimmed : null,
  };
}

export function billedPeriodDeletePath(contractId: number, periodStart: string): string {
  return `/contracts/${contractId}/billed-periods/${encodeURIComponent(periodStart)}`;
}

export function asOfDateInputToIso(dateInput: string): string | undefined {
  const trimmed = dateInput.trim();
  if (!trimmed) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const local = new Date(year, month - 1, day, 23, 59, 59, 999);
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day
  ) {
    return undefined;
  }
  return local.toISOString();
}

export function isAsOfInFuture(dateInput: string): boolean {
  const trimmed = dateInput.trim();
  if (!trimmed) return false;
  return trimmed > todayDateInput();
}

export function warningLooksPendingAddendum(text: string): boolean {
  const lower = text.toLocaleLowerCase('tr-TR');
  const hasAddendum = lower.includes('zeyilname');
  const pending =
    lower.includes('onay bekleyen') ||
    lower.includes('onay bekliyor') ||
    lower.includes('bekleyen zeyil');
  return hasAddendum && pending;
}

export function resolveBillingLineLabel(
  line: Pick<BillingPeriodLine, 'DetailId' | 'ItemId'>,
  contractItems: ContractLineItem[]
): string {
  const byDetail = contractItems.find(
    (item) => item.DetailId != null && item.DetailId === line.DetailId
  );
  if (byDetail) {
    if (byDetail.kind === 'inventory') {
      return (byDetail.ItemNameOverride ?? byDetail.ItemName)?.trim() || `#${line.ItemId}`;
    }
    return byDetail.Description.trim() || `#${line.ItemId}`;
  }
  const byItem = contractItems.find(
    (item) => item.kind === 'inventory' && item.ItemId === line.ItemId
  );
  if (byItem && byItem.kind === 'inventory') {
    return (byItem.ItemNameOverride ?? byItem.ItemName)?.trim() || `#${line.ItemId}`;
  }
  return `#${line.ItemId}`;
}

/**
 * Kiralama sözleşmelerinde fatura tutarı otomatik hesaplama.
 *
 * Kural: ilk 30 gün tek seferde ücretlenir; 30 günü aşan her gün aylık fiyat / 30.
 * Tutar backend tahakkuk motorunun birikmiş değerleri arasındaki farktır (bkz.
 * computeInvoiceAmountFromAccrual). Fatura dönem bitiş günü dahildir.
 */

import type { BillingPeriod, ContractInvoice } from '../models';
import { addCalendarDays, calendarDaysBetween, formatDateInput, parseDateInput } from './dateInput';
import { roundTo } from './lineDiscount';

/**
 * Billing tarihini takvim günü anahtarına çevirir (YYYY-MM-DD).
 * Tarih alanları saat dilimine kaydırılmaz: `2026-01-31T23:59:59.999Z` 31 Ocak'tır.
 * Türkiye gece yarısının UTC karşılığı (`T21:00:00.000Z`) bir sonraki takvim günüdür.
 */
export function isoToLocalDateKey(iso: string): string {
  const trimmed = String(iso ?? '').trim();
  if (!trimmed) return '';

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    return parseDateInput(trimmed) ? trimmed : '';
  }

  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(trimmed);
  if (!match) {
    const date = new Date(trimmed);
    if (isNaN(date.getTime())) return '';
    return formatDateInput(date);
  }

  const datePart = match[1];
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  const seconds = Number(match[4]);
  const zone = (match[5] ?? '').toUpperCase().replace(':', '');
  const isUtc = zone === 'Z' || zone === '+0000';

  // Yerel gece yarısı toISOString() ile önceki günün 21:00Z kaydı olarak gelir.
  if (isUtc && hours === 21 && minutes === 0 && seconds === 0) {
    return addCalendarDays(datePart, 1);
  }

  return parseDateInput(datePart) ? datePart : '';
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Tahakkuk motoruna verilecek `asOf` anı: sözleşme başlangıç anı + (gün farkı) × 24 saat.
 * Backend gün sayısını `ceil((asOf - başlangıç) / 1 gün)` ile bulduğu için sınırın başlangıçla
 * aynı saatte olması gerekir; aksi halde saat dilimi farkı fazladan bir gün yazdırır.
 *
 * `dateKey` bir SINIRDIR (o günün başı): `dateKey` günü hesaba dahil DEĞİLDİR.
 */
export function accrualBoundaryIso(contractStartIso: string, dateKey: string): string | null {
  const startMs = new Date(contractStartIso).getTime();
  const startDay = parseDateInput(isoToLocalDateKey(contractStartIso));
  const targetDay = parseDateInput(dateKey);
  if (!Number.isFinite(startMs) || !startDay || !targetDay) return null;
  const days = Math.round((targetDay.getTime() - startDay.getTime()) / MS_PER_DAY);
  return new Date(startMs + days * MS_PER_DAY).toISOString();
}

/** Plan dönemlerinin toplamı = başlangıçtan planın `asOf` anına kadar birikmiş tahakkuk. */
export function sumPlanAccrual(plan: BillingPeriod[]): number {
  return (plan ?? []).reduce(
    (sum, p) => sum + (Number.isFinite(p.accrualNetTotal) ? p.accrualNetTotal : 0),
    0
  );
}

/** İki tarih arasındaki gün sayısı (iki uç dahil). */
export function inclusiveDayCount(startKey: string, endKey: string): number {
  const start = new Date(startKey + 'T00:00:00');
  const end = new Date(endKey + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays + 1);
}

/** Dönem kırılım satırı */
export interface PeriodBreakdownLine {
  /** Fatura aralığının bu dönemdeki ilk günü (YYYY-MM-DD) */
  periodStart: string;
  /** Fatura aralığının bu dönemdeki son günü (YYYY-MM-DD, dahil) */
  periodEnd: string;
  /** Dönemin (plan) tahakkuku */
  accrualNetTotal: number;
  /** Fatura aralığıyla çakışan gün sayısı */
  overlappingDays: number;
  /** Dönemin toplam gün sayısı */
  periodDays: number;
  /** Bu dönemden faturaya katkı */
  contribution: number;
  /** Dönem kapalı mı */
  isClosed: boolean;
  /** Dönem kısmi mi */
  isPartial: boolean;
}

/** Hesaplama sonucu */
export interface InvoiceAmountCalculation {
  /** Hesaplanan toplam tutar */
  amount: number;
  /** Kullanıcının istediği toplam gün sayısı */
  requestedDays: number;
  /** Sözleşme süresiyle kapsanan gün sayısı */
  coveredDays: number;
  /** Sözleşme dışında kalan gün sayısı (başlangıçtan önce / gerçek bitişten sonra) */
  uncoveredDays: number;
  /** 30 günlük asgari kira bedeli bu faturaya düştü mü */
  includesMinimumRental: boolean;
  /** Bugün ve sonrasındaki günler var mı (projeksiyon) */
  hasProjection: boolean;
  /** Dönem bazlı kırılım */
  breakdown: PeriodBreakdownLine[];
}

export interface InvoiceAccrualInput {
  /** Fatura bitiş gününün ERTESİ sınırına kadar (asOf) alınmış plan */
  planAtEnd: BillingPeriod[];
  /** Fatura başlangıç sınırına kadar birikmiş tahakkuk (başlangıç sözleşmeden önceyse 0) */
  accruedAtStart: number;
  /** Fatura başlangıç günü (YYYY-MM-DD, dahil) */
  startKey: string;
  /** Fatura bitiş günü (YYYY-MM-DD, dahil) */
  endKey: string;
  /** Sözleşme başlangıç günü (YYYY-MM-DD) */
  contractStartKey: string;
  /** Bugünün günü (YYYY-MM-DD); projeksiyon uyarısı için */
  todayKey: string;
}

/**
 * Kiralama kuralı (backend tahakkuk motoru ile aynı):
 * - İlk 30 gün tek seferde ücretlenir (müşteri 2 gün kullansa da 30 gün öder).
 * - 30 günü aşan her gün için aylık fiyat / 30 eklenir.
 *
 * Bu yüzden bir aralığın tutarı gün oranlamasıyla değil, birikmiş tahakkuk farkıyla bulunur:
 *   tutar = tahakkuk(bitiş gününün ertesi) − tahakkuk(başlangıç günü)
 * Böylece asgari 30 günlük bedel ilk faturaya düşer ve ardışık faturaların toplamı sözleşme
 * tutarına birebir eşit olur. Fatura bitiş günü dahildir (25 Ocak – 23 Şubat = 30 gün).
 */
export function computeInvoiceAmountFromAccrual(input: InvoiceAccrualInput): InvoiceAmountCalculation {
  const { planAtEnd, accruedAtStart, startKey, endKey, contractStartKey, todayKey } = input;
  const requestedDays = inclusiveDayCount(startKey, endKey);
  const empty: InvoiceAmountCalculation = {
    amount: 0,
    requestedDays,
    coveredDays: 0,
    uncoveredDays: requestedDays,
    includesMinimumRental: false,
    hasProjection: false,
    breakdown: [],
  };
  if (requestedDays <= 0 || !planAtEnd || planAtEnd.length === 0) return empty;

  // Fatura aralığı [rangeStart, rangeEndExclusive); sözleşme başlangıcından önceki günler kapsam dışı.
  const rangeStart = startKey > contractStartKey ? startKey : contractStartKey;
  const rangeEndExclusive = addCalendarDays(endKey, 1);

  const ordered = [...planAtEnd].sort((a, b) =>
    isoToLocalDateKey(a.periodStart).localeCompare(isoToLocalDateKey(b.periodStart))
  );

  const breakdown: PeriodBreakdownLine[] = [];
  let cumulative = 0;
  let coveredDays = 0;

  for (const period of ordered) {
    const before = cumulative;
    cumulative += period.accrualNetTotal;
    const pStart = isoToLocalDateKey(period.periodStart);
    const pEndExclusive = isoToLocalDateKey(period.periodEnd);
    if (!pStart || !pEndExclusive || pEndExclusive <= pStart) continue;
    if (pEndExclusive <= rangeStart || pStart >= rangeEndExclusive) continue;

    const overlapStart = pStart > rangeStart ? pStart : rangeStart;
    const overlapEndExclusive = pEndExclusive < rangeEndExclusive ? pEndExclusive : rangeEndExclusive;
    const overlappingDays = calendarDaysBetween(overlapStart, overlapEndExclusive);
    if (!(overlappingDays > 0)) continue;

    // Fatura başlangıcı bu dönemin içindeyse, dönem başından fatura başlangıcına kadarki kısım düşülür.
    const from = overlapStart > pStart ? Math.max(before, accruedAtStart) : before;
    coveredDays += overlappingDays;

    breakdown.push({
      periodStart: overlapStart,
      periodEnd: addCalendarDays(overlapEndExclusive, -1),
      accrualNetTotal: period.accrualNetTotal,
      overlappingDays,
      periodDays: calendarDaysBetween(pStart, pEndExclusive),
      contribution: roundTo(cumulative - from, 2),
      isClosed: period.isClosed,
      isPartial: period.isPartial,
    });
  }

  const startsAtContractStart = startKey <= contractStartKey;

  return {
    amount: roundTo(Math.max(0, cumulative - accruedAtStart), 2),
    requestedDays,
    coveredDays,
    uncoveredDays: Math.max(0, requestedDays - coveredDays),
    // İlk fatura sözleşmenin 30. gününden önce bitiyorsa asgari 30 günlük bedel devrededir.
    includesMinimumRental:
      startsAtContractStart && coveredDays > 0 && calendarDaysBetween(contractStartKey, rangeEndExclusive) < 30,
    hasProjection: endKey >= todayKey,
    breakdown,
  };
}

/**
 * Fatura aralığıyla çakışan faturaları bulur.
 * @param invoices Sözleşmenin tüm faturaları
 * @param startKey Kontrol edilecek aralık başlangıcı (YYYY-MM-DD)
 * @param endKey Kontrol edilecek aralık bitişi (YYYY-MM-DD)
 * @param excludeId Hariç tutulacak fatura ID (düzenleme modunda)
 */
export function findOverlappingInvoices(
  invoices: ContractInvoice[],
  startKey: string,
  endKey: string,
  excludeId?: number
): ContractInvoice[] {
  if (!invoices || invoices.length === 0) return [];

  const overlapping: ContractInvoice[] = [];

  for (const invoice of invoices) {
    // Düzenlenen faturayı atla
    if (excludeId != null && invoice.invoiceRecordId === excludeId) continue;

    // Silinmiş faturaları atla (eğer böyle bir alan varsa)
    // Şu an için tüm faturaların geçerli olduğunu varsayıyoruz

    const invStartKey = isoToLocalDateKey(invoice.periodStart);
    const invEndKey = isoToLocalDateKey(invoice.periodEnd);

    // Dönem uçları dahildir: aynı günü paylaşan iki fatura o günü iki kez faturalar.
    const hasOverlap = !(endKey < invStartKey || startKey > invEndKey);

    if (hasOverlap) {
      overlapping.push(invoice);
    }
  }

  return overlapping;
}

// ============================================================================
// Durum Yönetimi (Auto/Manual Mode Reducer)
// ============================================================================

export type InvoiceAmountMode = 'auto' | 'manual';

export interface InvoiceAmountState {
  /** Mevcut mod */
  mode: InvoiceAmountMode;
  /** Tutar alanındaki değer (metin) */
  amountInput: string;
  /** Hesaplanan tutar (referans için) */
  calculatedAmount: number | null;
  /** Hesaplama sonucu (kırılım ve uyarılar için) */
  calculation: InvoiceAmountCalculation | null;
  /** Son hesaplama hatası */
  error: string | null;
  /** Hesaplama devam ediyor mu */
  loading: boolean;
}

export type InvoiceAmountAction =
  | { type: 'CALC_RESULT'; calculation: InvoiceAmountCalculation }
  | { type: 'CALC_ERROR'; error: string }
  | { type: 'CALC_LOADING' }
  | { type: 'CALC_CLEAR' }
  | { type: 'USER_INPUT'; value: string }
  | { type: 'RESET_TO_AUTO' }
  | { type: 'INIT_CREATE'; initialAmount?: number }
  | { type: 'INIT_EDIT'; amount: number; calculatedAmount: number | null };

/**
 * Tutar alanı için tr-TR formatında gösterim
 */
export function formatAmountInput(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
}

/**
 * Tutar girişini parse eder (tr-TR virgül desteği)
 */
export function parseAmountInput(raw: string): number | null {
  const compact = String(raw ?? '')
    .trim()
    .replace(/\s+/g, '');
  
  if (!compact || compact === ',' || compact === '.' || compact === '+' || compact === '-') {
    return null;
  }

  let normalized = compact;
  
  if (compact.includes(',')) {
    // TR formatı: 1.234,56 -> 1234.56
    normalized = compact.replace(/\./g, '').replace(',', '.');
  } else {
    // EN formatı veya bin ayracı: 1,234.56 veya 1.234
    const dotCount = (compact.match(/\./g) ?? []).length;
    if (dotCount > 1 || /^\d{1,3}(\.\d{3})+$/.test(compact)) {
      normalized = compact.replace(/\./g, '');
    }
  }

  const v = Number(normalized);
  if (!Number.isFinite(v) || v < 0) return null;
  
  return v;
}

/**
 * Tutar durum yöneticisi
 */
export function invoiceAmountReducer(
  state: InvoiceAmountState,
  action: InvoiceAmountAction
): InvoiceAmountState {
  switch (action.type) {
    case 'CALC_LOADING':
      return {
        ...state,
        loading: true,
        error: null,
      };

    case 'CALC_RESULT':
      // Otomatik modda hesaplanan tutarı alana yaz
      if (state.mode === 'auto') {
        return {
          ...state,
          calculatedAmount: action.calculation.amount,
          calculation: action.calculation,
          amountInput: formatAmountInput(action.calculation.amount),
          loading: false,
          error: null,
        };
      }
      // Elle modda sadece referans olarak sakla
      return {
        ...state,
        calculatedAmount: action.calculation.amount,
        calculation: action.calculation,
        loading: false,
        error: null,
      };

    case 'CALC_ERROR':
      return {
        ...state,
        error: action.error,
        calculatedAmount: null,
        calculation: null,
        loading: false,
      };

    case 'CALC_CLEAR':
      // Tarihler silindi veya hesap devre dışı: tutar alanı korunur, eski hesap temizlenir
      return {
        ...state,
        calculatedAmount: null,
        calculation: null,
        error: null,
        loading: false,
      };

    case 'USER_INPUT':
      // Kullanıcı yazdığında elle moda geç
      return {
        ...state,
        mode: 'manual',
        amountInput: action.value,
      };

    case 'RESET_TO_AUTO':
      // "Hesaplanan tutarı kullan" butonu
      const newAmount = state.calculatedAmount ?? 0;
      return {
        ...state,
        mode: 'auto',
        amountInput: formatAmountInput(newAmount),
      };

    case 'INIT_CREATE':
      // Yeni fatura oluşturma - otomatik moddan başla
      const initialAmt = action.initialAmount ?? 0;
      return {
        mode: 'auto',
        amountInput: formatAmountInput(initialAmt),
        calculatedAmount: null,
        calculation: null,
        error: null,
        loading: false,
      };

    case 'INIT_EDIT':
      // Düzenleme - kayıtlı tutarla elle moddan başla
      return {
        mode: 'manual',
        amountInput: formatAmountInput(action.amount),
        calculatedAmount: action.calculatedAmount,
        calculation: null,
        error: null,
        loading: false,
      };

    default:
      return state;
  }
}

/**
 * İlk durum oluşturur
 */
export function createInitialInvoiceAmountState(): InvoiceAmountState {
  return {
    mode: 'auto',
    amountInput: formatAmountInput(0),
    calculatedAmount: null,
    calculation: null,
    error: null,
    loading: false,
  };
}

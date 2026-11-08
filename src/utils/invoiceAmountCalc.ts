/**
 * Kiralama sözleşmelerinde fatura tutarı otomatik hesaplama.
 *
 * Tam faturalama dönemi seçilirse o dönemin net tahakkuku aynen yazılır.
 * Dönemin bir kısmı seçilirse, sözleşmedeki kiralama kuralı uygulanır:
 * aylık net / 30 gün. Takvim ayının 28, 29 veya 31 çekmesi günlük bedeli değiştirmez.
 */

import type { BillingPeriod, ContractInvoice } from '../models';
import { addCalendarDays, formatDateInput, parseDateInput } from './dateInput';
import { roundTo } from './lineDiscount';

/** Sözleşme ve teklif ekranıyla aynı: 1 ay = 30 gün. */
export const RENTAL_MONTH_DAYS = 30;

/** Tutarı gün oranıyla kuruşa yuvarlar (yukarı yarım kuruş). */
function prorateMoney(amount: number, numerator: number, denominator: number): number {
  if (!Number.isFinite(amount) || denominator <= 0 || numerator <= 0) return 0;
  const cents = Math.round((amount + Number.EPSILON) * 100);
  return Math.round((cents * numerator) / denominator) / 100;
}

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

/** Başlangıç gününün ayının son takvim günü. */
export function calendarMonthEndKey(startKey: string): string | null {
  const start = parseDateInput(startKey);
  if (!start) return null;
  return formatDateInput(new Date(start.getFullYear(), start.getMonth() + 1, 0));
}

/** Dönem, ayın 1'inden son gününe kadar olan tam takvim ayı mı? */
export function isFullCalendarMonth(startKey: string, endKey: string): boolean {
  const start = parseDateInput(startKey);
  const end = parseDateInput(endKey);
  if (!start || !end) return false;
  if (start.getDate() !== 1) return false;
  if (start.getFullYear() !== end.getFullYear() || start.getMonth() !== end.getMonth()) return false;
  return end.getDate() === new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
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
  /** Dönem başlangıç tarihi (YYYY-MM-DD) */
  periodStart: string;
  /** Dönem bitiş tarihi (YYYY-MM-DD) */
  periodEnd: string;
  /** Dönemin net tahakkuku */
  accrualNetTotal: number;
  /** Fatura aralığıyla çakışan gün sayısı */
  overlappingDays: number;
  /** Dönemin toplam gün sayısı */
  periodDays: number;
  /** Bu dönemden faturaya katkı */
  contribution: number;
  /** Dönem kapalı mı (faturalanabilir mi) */
  isClosed: boolean;
  /** Dönem kısmi mi (zeyilname/iade olabilir) */
  isPartial: boolean;
}

/** Hesaplama sonucu */
export interface InvoiceAmountCalculation {
  /** Hesaplanan toplam tutar */
  amount: number;
  /** Kullanıcının istediği toplam gün sayısı */
  requestedDays: number;
  /** Planla kapsanan gün sayısı */
  coveredDays: number;
  /** Plan dışı kalan gün sayısı */
  uncoveredDays: number;
  /** Orantılama yapıldı mı (kısmi dönem var) */
  hasProration: boolean;
  /** Tam ayın bir kısmı 30 güne bölünerek mi hesaplandı */
  hasCommercialProration: boolean;
  /** Açık/gelecek dönem var mı (projeksiyon) */
  hasProjection: boolean;
  /** Dönem bazlı kırılım */
  breakdown: PeriodBreakdownLine[];
}

/**
 * Billing plan'dan fatura tutarı hesaplar.
 * @param plan Billing dönemleri (asOf ile alınmış)
 * @param startKey Fatura dönem başlangıç (YYYY-MM-DD)
 * @param endKey Fatura dönem bitiş (YYYY-MM-DD)
 */
export function computeInvoiceAmountForRange(
  plan: BillingPeriod[],
  startKey: string,
  endKey: string
): InvoiceAmountCalculation {
  const requestedDays = inclusiveDayCount(startKey, endKey);

  if (requestedDays <= 0 || !plan || plan.length === 0) {
    return {
      amount: 0,
      requestedDays,
      coveredDays: 0,
      uncoveredDays: requestedDays,
      hasProration: false,
      hasCommercialProration: false,
      hasProjection: false,
      breakdown: [],
    };
  }

  const breakdown: PeriodBreakdownLine[] = [];
  let totalContribution = 0;
  let coveredDays = 0;
  let hasProration = false;
  let hasCommercialProration = false;
  let hasProjection = false;
  let claimedThrough = '';

  const ordered = [...plan].sort((a, b) => {
    const startCmp = isoToLocalDateKey(a.periodStart).localeCompare(isoToLocalDateKey(b.periodStart));
    if (startCmp !== 0) return startCmp;
    return isoToLocalDateKey(a.periodEnd).localeCompare(isoToLocalDateKey(b.periodEnd));
  });

  for (const period of ordered) {
    const periodStartKey = isoToLocalDateKey(period.periodStart);
    const rawEndKey = isoToLocalDateKey(period.periodEnd);
    if (!periodStartKey || !rawEndKey) continue;

    // Açık ay, asOf tarihinde kesilmişse günlük bedel ayın tamamına yayılır.
    // Aksi halde 8 günlük aralık, tam ay tahakkukuyla birebir eşleşir.
    let periodEndKey = rawEndKey;
    const monthEnd = calendarMonthEndKey(periodStartKey);
    const clippedOpenMonth =
      !period.isClosed &&
      !period.isPartial &&
      periodStartKey.endsWith('-01') &&
      monthEnd != null &&
      rawEndKey < monthEnd;
    if (clippedOpenMonth && monthEnd) {
      periodEndKey = monthEnd;
    }

    const periodDays = inclusiveDayCount(periodStartKey, periodEndKey);
    if (periodDays <= 0) continue;

    let overlapStart = startKey > periodStartKey ? startKey : periodStartKey;
    const overlapEnd = endKey < periodEndKey ? endKey : periodEndKey;
    if (claimedThrough && overlapStart <= claimedThrough) {
      overlapStart = addCalendarDays(claimedThrough, 1);
    }
    const overlappingDays = overlapStart <= overlapEnd ? inclusiveDayCount(overlapStart, overlapEnd) : 0;
    if (overlappingDays <= 0) continue;

    coveredDays += overlappingDays;
    claimedThrough = !claimedThrough || overlapEnd > claimedThrough ? overlapEnd : claimedThrough;

    const coversWholePeriod = overlapStart === periodStartKey && overlapEnd === periodEndKey;
    // Tam takvim ayının tahakkuku bir aylık bedeldir (dönem içi zeyilname dahil).
    // Ay 31 çekse bile kısmi günler 30'a bölünür. Kısa dönem kendi gün sayısına bölünür.
    const commercialMonth = isFullCalendarMonth(periodStartKey, periodEndKey);

    let contribution: number;
    let divisor = periodDays;

    if (coversWholePeriod) {
      contribution = roundTo(period.accrualNetTotal, 2);
    } else if (commercialMonth) {
      divisor = RENTAL_MONTH_DAYS;
      contribution = prorateMoney(period.accrualNetTotal, overlappingDays, RENTAL_MONTH_DAYS);
      hasProration = true;
      hasCommercialProration = true;
    } else if (periodDays > 0) {
      contribution = prorateMoney(period.accrualNetTotal, overlappingDays, periodDays);
      hasProration = true;
    } else {
      contribution = 0;
    }
    totalContribution += contribution;

    if (!period.isClosed) {
      hasProjection = true;
    }

    breakdown.push({
      periodStart: periodStartKey,
      periodEnd: periodEndKey,
      accrualNetTotal: period.accrualNetTotal,
      overlappingDays,
      periodDays: divisor,
      contribution,
      isClosed: period.isClosed,
      isPartial: period.isPartial,
    });
  }

  const uncoveredDays = Math.max(0, requestedDays - coveredDays);
  const amount = roundTo(totalContribution, 2);

  return {
    amount,
    requestedDays,
    coveredDays,
    uncoveredDays,
    hasProration,
    hasCommercialProration,
    hasProjection,
    breakdown,
  };
}

/**
 * Açık dönemin gerçek ay sonuna kadar plan çekmek için ikinci asOf günü.
 * İlk plandaki bitiş fatura bitişiyle aynıysa null döner.
 */
export function nextBillingPlanAsOfKey(plan: BillingPeriod[], invoiceEndKey: string): string | null {
  const open = findOpenPeriodContaining(plan, invoiceEndKey);
  if (!open) return null;

  const start = isoToLocalDateKey(open.periodStart);
  const end = isoToLocalDateKey(open.periodEnd);
  if (!start || !end) return null;

  if (!open.isPartial && start.endsWith('-01')) {
    const monthEnd = calendarMonthEndKey(start);
    if (monthEnd && monthEnd > end && monthEnd !== invoiceEndKey) return monthEnd;
  }

  if (end > invoiceEndKey) return end;
  return null;
}

/**
 * Verilen tarihi içeren açık dönemi bulur.
 * İkinci billing-plan isteği gerekip gerekmediğini belirlemek için kullanılır.
 */
export function findOpenPeriodContaining(plan: BillingPeriod[], dateKey: string): BillingPeriod | null {
  if (!plan || plan.length === 0) return null;

  for (const period of plan) {
    if (period.isClosed) continue;
    
    const periodStartKey = isoToLocalDateKey(period.periodStart);
    const periodEndKey = isoToLocalDateKey(period.periodEnd);

    if (dateKey >= periodStartKey && dateKey <= periodEndKey) {
      return period;
    }
  }

  return null;
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

    // Çakışma kontrolü: sadece sınırda değen tarihler çakışma sayılmaz
    const hasOverlap = !(endKey < invStartKey || startKey > invEndKey) && 
                       !(endKey === invStartKey || startKey === invEndKey);

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

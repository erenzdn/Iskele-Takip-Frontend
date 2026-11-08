/**
 * Kiralama sözleşmelerinde fatura tutarı otomatik hesaplama mantığı.
 * 
 * Dönem tarihleri girilince, billing-plan'daki dönemlerin net tahakkuklarından
 * gün bazlı orantılı tutar hesaplanır. Tüm mantık saf fonksiyonlarda toplanır.
 */

import type { BillingPeriod, ContractInvoice } from '../models';

/** ISO zaman damgasını yerel takvim günü anahtarına çevirir (YYYY-MM-DD). */
export function isoToLocalDateKey(iso: string): string {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
      hasProjection: false,
      breakdown: [],
    };
  }

  const breakdown: PeriodBreakdownLine[] = [];
  let totalContribution = 0;
  let coveredDays = 0;
  let hasProration = false;
  let hasProjection = false;

  for (const period of plan) {
    const periodStartKey = isoToLocalDateKey(period.periodStart);
    const periodEndKey = isoToLocalDateKey(period.periodEnd);
    const periodDays = inclusiveDayCount(periodStartKey, periodEndKey);

    // Çakışma kontrolü
    const overlapStart = startKey > periodStartKey ? startKey : periodStartKey;
    const overlapEnd = endKey < periodEndKey ? endKey : periodEndKey;
    const overlappingDays = overlapStart <= overlapEnd ? inclusiveDayCount(overlapStart, overlapEnd) : 0;

    if (overlappingDays <= 0) continue;

    coveredDays += overlappingDays;

    let contribution: number;

    // Dönem tam kapsanıyorsa birebir tutar kullan (orantı yok)
    if (overlapStart === periodStartKey && overlapEnd === periodEndKey) {
      contribution = period.accrualNetTotal;
    } else {
      // Kısmi dönem - orantılı hesaplama
      contribution = periodDays > 0 
        ? (period.accrualNetTotal * overlappingDays) / periodDays 
        : 0;
      hasProration = true;
    }

    totalContribution += contribution;

    // Açık dönem kontrolü
    if (!period.isClosed) {
      hasProjection = true;
    }

    breakdown.push({
      periodStart: periodStartKey,
      periodEnd: periodEndKey,
      accrualNetTotal: period.accrualNetTotal,
      overlappingDays,
      periodDays,
      contribution,
      isClosed: period.isClosed,
      isPartial: period.isPartial,
    });
  }

  const uncoveredDays = Math.max(0, requestedDays - coveredDays);
  const amount = Math.round(totalContribution * 100) / 100; // 2 haneye yuvarla

  return {
    amount,
    requestedDays,
    coveredDays,
    uncoveredDays,
    hasProration,
    hasProjection,
    breakdown,
  };
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

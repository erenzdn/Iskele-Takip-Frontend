import { describe, it, expect } from 'vitest';
import type { BillingPeriod, ContractInvoice } from '../models';
import {
  isoToLocalDateKey,
  inclusiveDayCount,
  accrualBoundaryIso,
  computeInvoiceAmountFromAccrual,
  sumPlanAccrual,
  findOverlappingInvoices,
  invoiceAmountReducer,
  createInitialInvoiceAmountState,
  formatAmountInput,
  parseAmountInput,
} from './invoiceAmountCalc';
import { addCalendarDays } from './dateInput';

describe('invoiceAmountCalc', () => {
  describe('isoToLocalDateKey', () => {
    it('ISO tarihini yerel takvim gününe çevirir', () => {
      // 20:59:59.999Z İstanbul saatiyle 23:59:59.999 olur (UTC+3) — gün kaymaz
      expect(isoToLocalDateKey('2026-02-14T20:59:59.999Z')).toBe('2026-02-14');
      expect(isoToLocalDateKey('2026-01-01T00:00:00.000Z')).toBe('2026-01-01');
      // UTC gün sonu, Türkiye'de ertesi güne taşınmaz
      expect(isoToLocalDateKey('2026-01-31T23:59:59.999Z')).toBe('2026-01-31');
      // Yerel gece yarısının UTC karşılığı bir sonraki takvim günüdür
      expect(isoToLocalDateKey('2026-12-31T21:00:00.000Z')).toBe('2027-01-01');
      expect(isoToLocalDateKey('2026-03-15')).toBe('2026-03-15');
    });
  });

  describe('inclusiveDayCount', () => {
    it('iki tarihi içeren gün sayısını hesaplar', () => {
      expect(inclusiveDayCount('2026-01-01', '2026-01-01')).toBe(1);
      expect(inclusiveDayCount('2026-01-01', '2026-01-31')).toBe(31);
      expect(inclusiveDayCount('2026-02-01', '2026-02-28')).toBe(28);
      expect(inclusiveDayCount('2024-02-01', '2024-02-29')).toBe(29); // Artık yıl
      expect(inclusiveDayCount('2026-01-15', '2026-01-10')).toBe(0); // Ters sıra
    });
  });

  /**
   * Backend tahakkuk motorunun (contractAccrual.js + billingPeriods.js) sade bir taklidi:
   * takvim ayı dönemleri, birikmiş tahakkuk = günlük × max(gün, 30).
   */
  const DAY = 24 * 60 * 60 * 1000;
  function simulatePlan(contractStartIso: string, asOfIso: string, daily: number): BillingPeriod[] {
    const start = new Date(contractStartIso);
    const until = new Date(asOfIso);
    if (until <= start) return [];
    const cumulative = (at: Date) => {
      const days = Math.ceil((at.getTime() - start.getTime()) / DAY);
      return days <= 0 ? 0 : daily * Math.max(days, 30);
    };
    const periods: BillingPeriod[] = [];
    let cursor = start;
    let natural = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    let index = 1;
    while (cursor < until) {
      const end = natural > until ? until : natural;
      const accrual = cumulative(end) - cumulative(cursor);
      periods.push({
        index,
        periodStart: cursor.toISOString(),
        periodEnd: end.toISOString(),
        isPartial: natural > until,
        isClosed: natural <= until,
        accrualSubtotal: accrual,
        accrualNetTotal: accrual,
        billedAmount: null,
        variance: null,
        varianceReasons: [],
        lines: [],
      });
      cursor = end;
      natural = new Date(Date.UTC(natural.getUTCFullYear(), natural.getUTCMonth() + 1, 1));
      index += 1;
    }
    return periods;
  }

  function invoiceAmount(contractStartIso: string, startKey: string, endKey: string, daily: number) {
    const contractStartKey = isoToLocalDateKey(contractStartIso);
    const endBoundary = accrualBoundaryIso(contractStartIso, addCalendarDays(endKey, 1))!;
    const startBoundary = accrualBoundaryIso(contractStartIso, startKey)!;
    const planAtStart = startKey > contractStartKey ? simulatePlan(contractStartIso, startBoundary, daily) : [];
    return computeInvoiceAmountFromAccrual({
      planAtEnd: simulatePlan(contractStartIso, endBoundary, daily),
      accruedAtStart: sumPlanAccrual(planAtStart),
      startKey,
      endKey,
      contractStartKey,
      todayKey: '2000-01-01',
    });
  }

  // Aylık 3.000 → günlük 100
  const DAILY = 100;
  const START = '2026-01-25T00:00:00.000Z';

  describe('accrualBoundaryIso', () => {
    it('sınırı sözleşme başlangıç saatine hizalar', () => {
      expect(accrualBoundaryIso('2026-01-25T00:00:00.000Z', '2026-02-24')).toBe('2026-02-24T00:00:00.000Z');
      // Yerel gece yarısı (21:00Z) kaydedilmiş başlangıç: sınır da 21:00Z olur, fazladan gün yazmaz
      expect(accrualBoundaryIso('2026-01-24T21:00:00.000Z', '2026-02-24')).toBe('2026-02-23T21:00:00.000Z');
      expect(accrualBoundaryIso('2026-01-25T00:00:00.000Z', 'geçersiz')).toBeNull();
    });
  });

  describe('computeInvoiceAmountFromAccrual (30 gün kuralı)', () => {
    it('ilk ay: 25 Ocak – 23 Şubat tam 30 gün = 1 aylık bedel', () => {
      const result = invoiceAmount(START, '2026-01-25', '2026-02-23', DAILY);
      expect(result.amount).toBe(3000);
      expect(result.requestedDays).toBe(30);
      expect(result.coveredDays).toBe(30);
      expect(result.uncoveredDays).toBe(0);
      expect(result.includesMinimumRental).toBe(false);
    });

    it('müşteri 2 gün kullansa da ilk faturada 30 gün ödenir', () => {
      const result = invoiceAmount(START, '2026-01-25', '2026-01-26', DAILY);
      expect(result.amount).toBe(3000);
      expect(result.includesMinimumRental).toBe(true);
    });

    it('30 günü aşan her gün aylık / 30 olarak eklenir', () => {
      // 24 Şubat – 23 Mart = 28 gün
      expect(invoiceAmount(START, '2026-02-24', '2026-03-23', DAILY).amount).toBe(2800);
      // 30 gün + 5 gün tek faturada
      expect(invoiceAmount(START, '2026-01-25', '2026-02-28', DAILY).amount).toBe(3500);
    });

    it('ilk 30 gün içindeki ikinci fatura 0 olur (bedel ilk faturaya düşer)', () => {
      expect(invoiceAmount(START, '2026-01-25', '2026-01-31', DAILY).amount).toBe(3000);
      const second = invoiceAmount(START, '2026-02-01', '2026-02-23', DAILY);
      expect(second.amount).toBe(0);
      expect(second.includesMinimumRental).toBe(false);
    });

    it('takvim ayı faturası (1–31 Mart) ayın gün sayısı kadar günlük bedeldir', () => {
      const result = invoiceAmount(START, '2026-03-01', '2026-03-31', DAILY);
      expect(result.amount).toBe(3100);
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0]).toMatchObject({
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        overlappingDays: 31,
        contribution: 3100,
      });
    });

    it('ardışık faturaların toplamı sözleşme tutarına eşittir (uzatma dahil)', () => {
      // 25 Ocak + 30 gün, ardından 30 gün uzatma → planlanan bitiş 26 Mart
      const plannedEndKey = '2026-03-26';
      const total = sumPlanAccrual(simulatePlan(START, accrualBoundaryIso(START, plannedEndKey)!, DAILY));
      expect(total).toBe(6000);

      const parts = [
        invoiceAmount(START, '2026-01-25', '2026-01-31', DAILY),
        invoiceAmount(START, '2026-02-01', '2026-02-28', DAILY),
        invoiceAmount(START, '2026-03-01', '2026-03-25', DAILY), // son fatura günü = bitiş - 1
      ];
      expect(parts.reduce((s, r) => s + r.amount, 0)).toBe(total);
    });

    it('ay ortasında başlayan fatura kırılımı dönem içindeki farkı gösterir', () => {
      const result = invoiceAmount(START, '2026-02-20', '2026-03-10', DAILY);
      // 24 Şubat'a kadar ilk 30 güne dahil; 24 Şubat – 10 Mart = 15 gün
      expect(result.amount).toBe(1500);
      expect(result.breakdown.map((b) => b.contribution)).toEqual([500, 1000]);
      expect(result.breakdown.map((b) => b.overlappingDays)).toEqual([9, 10]);
    });

    it('sözleşme başlangıcından önceki günler kapsam dışı sayılır', () => {
      const result = invoiceAmount(START, '2026-01-20', '2026-02-23', DAILY);
      expect(result.amount).toBe(3000);
      expect(result.uncoveredDays).toBe(5);
    });

    it('yerel gece yarısı kayıtlı başlangıçta fazladan gün yazmaz', () => {
      const localStart = '2026-01-24T21:00:00.000Z'; // 25 Ocak 00:00 İstanbul
      expect(invoiceAmount(localStart, '2026-01-25', '2026-02-23', DAILY).amount).toBe(3000);
      expect(invoiceAmount(localStart, '2026-02-24', '2026-03-23', DAILY).amount).toBe(2800);
    });

    it('plan boşsa 0 döner', () => {
      const result = computeInvoiceAmountFromAccrual({
        planAtEnd: [],
        accruedAtStart: 0,
        startKey: '2026-01-01',
        endKey: '2026-01-31',
        contractStartKey: '2026-01-01',
        todayKey: '2026-01-01',
      });
      expect(result.amount).toBe(0);
      expect(result.uncoveredDays).toBe(31);
    });

    it('bugün veya sonrası seçiliyse projeksiyon işaretlenir', () => {
      const result = computeInvoiceAmountFromAccrual({
        planAtEnd: simulatePlan(START, accrualBoundaryIso(START, '2026-03-01')!, DAILY),
        accruedAtStart: 0,
        startKey: '2026-01-25',
        endKey: '2026-02-28',
        contractStartKey: '2026-01-25',
        todayKey: '2026-02-10',
      });
      expect(result.hasProjection).toBe(true);
    });
  });

  describe('findOverlappingInvoices', () => {
    const invoices: ContractInvoice[] = [
      {
        invoiceRecordId: 1,
        contractId: 100,
        invoiceNumber: 'FT-001',
        invoiceDate: '2026-01-31T00:00:00.000Z',
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-01-31T00:00:00.000Z',
        amount: 5000,
        currency: 'TRY',
        notes: null,
        createdBy: 'user1',
        createdAt: '2026-01-31T10:00:00.000Z',
      },
      {
        invoiceRecordId: 2,
        contractId: 100,
        invoiceNumber: 'FT-002',
        invoiceDate: '2026-02-28T00:00:00.000Z',
        periodStart: '2026-02-01T00:00:00.000Z',
        periodEnd: '2026-02-28T00:00:00.000Z',
        amount: 5000,
        currency: 'TRY',
        notes: null,
        createdBy: 'user1',
        createdAt: '2026-02-28T10:00:00.000Z',
      },
    ];

    it('kısmi çakışma bulur', () => {
      const overlapping = findOverlappingInvoices(invoices, '2026-01-15', '2026-02-15');
      expect(overlapping).toHaveLength(2);
    });

    it('tam kapsama bulur', () => {
      const overlapping = findOverlappingInvoices(invoices, '2026-01-01', '2026-02-28');
      expect(overlapping).toHaveLength(2);
    });

    it('sınırda değme çakışma sayılmaz', () => {
      // Ocak faturası 1-31, yeni fatura 1 Şubat'tan başlıyor
      const overlapping = findOverlappingInvoices(invoices, '2026-02-01', '2026-02-15');
      expect(overlapping).toHaveLength(1);
      expect(overlapping[0].invoiceRecordId).toBe(2);
    });

    it('aynı günü paylaşan faturalar çakışır (bitiş günü dahil)', () => {
      // Ocak faturası 31 Ocak'ı içeriyor; yeni fatura da 31 Ocak'tan başlıyor
      const overlapping = findOverlappingInvoices(invoices, '2026-01-31', '2026-02-10');
      expect(overlapping.map((i) => i.invoiceRecordId)).toEqual([1, 2]);
    });

    it('düzenlenen fatura hariç tutulur', () => {
      const overlapping = findOverlappingInvoices(invoices, '2026-01-01', '2026-01-31', 1);
      expect(overlapping).toHaveLength(0);
    });

    it('çakışma yoksa boş döner', () => {
      const overlapping = findOverlappingInvoices(invoices, '2026-03-01', '2026-03-31');
      expect(overlapping).toHaveLength(0);
    });

    it('boş liste için boş döner', () => {
      const overlapping = findOverlappingInvoices([], '2026-01-01', '2026-01-31');
      expect(overlapping).toHaveLength(0);
    });
  });

  describe('formatAmountInput', () => {
    it('TR formatında gösterir', () => {
      expect(formatAmountInput(1234.56)).toBe('1.234,56');
      expect(formatAmountInput(0)).toBe('0,00');
      expect(formatAmountInput(0.1)).toBe('0,10');
      expect(formatAmountInput(999999.99)).toBe('999.999,99');
    });

    it('2 haneye yuvarlar', () => {
      expect(formatAmountInput(1234.567)).toBe('1.234,57');
      expect(formatAmountInput(1234.564)).toBe('1.234,56');
    });
  });

  describe('parseAmountInput', () => {
    it('TR formatını parse eder', () => {
      expect(parseAmountInput('1.234,56')).toBe(1234.56);
      expect(parseAmountInput('1234,56')).toBe(1234.56);
      expect(parseAmountInput('0,50')).toBe(0.5);
    });

    it('EN formatını parse eder', () => {
      expect(parseAmountInput('1234.56')).toBe(1234.56);
      expect(parseAmountInput('0.5')).toBe(0.5);
    });

    it('boş veya geçersiz input için null döner', () => {
      expect(parseAmountInput('')).toBeNull();
      expect(parseAmountInput(',')).toBeNull();
      expect(parseAmountInput('.')).toBeNull();
      expect(parseAmountInput('abc')).toBeNull();
      expect(parseAmountInput('-100')).toBeNull(); // Negatif kabul etme
    });
  });

  describe('invoiceAmountReducer', () => {
    it('oluşturmada otomatik moddan başlar', () => {
      const state = createInitialInvoiceAmountState();
      const newState = invoiceAmountReducer(state, { type: 'INIT_CREATE' });
      
      expect(newState.mode).toBe('auto');
      expect(newState.amountInput).toBe('0,00');
    });

    it('hesap sonucu otomatik modda alanı günceller', () => {
      const state = createInitialInvoiceAmountState();
      const calculation = {
        amount: 5000,
        requestedDays: 31,
        coveredDays: 31,
        uncoveredDays: 0,
        includesMinimumRental: false,
        hasProjection: false,
        breakdown: [],
      };
      
      const newState = invoiceAmountReducer(state, { type: 'CALC_RESULT', calculation });
      
      expect(newState.mode).toBe('auto');
      expect(newState.amountInput).toBe('5.000,00');
      expect(newState.calculatedAmount).toBe(5000);
      expect(newState.calculation).toBe(calculation);
    });

    it('kullanıcı yazınca elle moda geçer', () => {
      const state = createInitialInvoiceAmountState();
      const newState = invoiceAmountReducer(state, { type: 'USER_INPUT', value: '1234,56' });
      
      expect(newState.mode).toBe('manual');
      expect(newState.amountInput).toBe('1234,56');
    });

    it('elle modda yeni hesap alanı ezmez', () => {
      let state = createInitialInvoiceAmountState();
      state = invoiceAmountReducer(state, { type: 'USER_INPUT', value: '7000,00' });
      
      const calculation = {
        amount: 5000,
        requestedDays: 31,
        coveredDays: 31,
        uncoveredDays: 0,
        includesMinimumRental: false,
        hasProjection: false,
        breakdown: [],
      };
      
      const newState = invoiceAmountReducer(state, { type: 'CALC_RESULT', calculation });
      
      expect(newState.mode).toBe('manual');
      expect(newState.amountInput).toBe('7000,00'); // Değişmedi
      expect(newState.calculatedAmount).toBe(5000); // Referans güncellendi
    });

    it('"Hesaplanan tutarı kullan" ile geri döner', () => {
      let state = createInitialInvoiceAmountState();
      
      // Önce hesaplama
      state = invoiceAmountReducer(state, {
        type: 'CALC_RESULT',
        calculation: {
          amount: 5000,
          requestedDays: 31,
          coveredDays: 31,
          uncoveredDays: 0,
          includesMinimumRental: false,
          hasProjection: false,
          breakdown: [],
        },
      });
      
      // Kullanıcı değiştirir
      state = invoiceAmountReducer(state, { type: 'USER_INPUT', value: '7000,00' });
      expect(state.mode).toBe('manual');
      
      // Reset
      const newState = invoiceAmountReducer(state, { type: 'RESET_TO_AUTO' });
      
      expect(newState.mode).toBe('auto');
      expect(newState.amountInput).toBe('5.000,00');
    });

    it('düzenlemede elle moddan başlar', () => {
      const state = createInitialInvoiceAmountState();
      const newState = invoiceAmountReducer(state, {
        type: 'INIT_EDIT',
        amount: 7000,
        calculatedAmount: 5000,
      });
      
      expect(newState.mode).toBe('manual');
      expect(newState.amountInput).toBe('7.000,00');
      expect(newState.calculatedAmount).toBe(5000);
    });

    it('hesap hatası durumunu günceller', () => {
      const state = createInitialInvoiceAmountState();
      const newState = invoiceAmountReducer(state, {
        type: 'CALC_ERROR',
        error: 'API hatası',
      });
      
      expect(newState.error).toBe('API hatası');
      expect(newState.calculatedAmount).toBeNull();
      expect(newState.loading).toBe(false);
    });

    it('CALC_CLEAR eski hesabı temizler, tutar alanını korur', () => {
      let state = createInitialInvoiceAmountState();
      state = invoiceAmountReducer(state, {
        type: 'CALC_RESULT',
        calculation: {
          amount: 5000,
          requestedDays: 31,
          coveredDays: 31,
          uncoveredDays: 0,
          includesMinimumRental: false,
          hasProjection: false,
          breakdown: [],
        },
      });

      const newState = invoiceAmountReducer(state, { type: 'CALC_CLEAR' });

      expect(newState.calculation).toBeNull();
      expect(newState.calculatedAmount).toBeNull();
      expect(newState.error).toBeNull();
      expect(newState.amountInput).toBe('5.000,00');
      expect(newState.mode).toBe('auto');
    });

    it('yükleme durumunu ayarlar', () => {
      const state = createInitialInvoiceAmountState();
      const newState = invoiceAmountReducer(state, { type: 'CALC_LOADING' });
      
      expect(newState.loading).toBe(true);
      expect(newState.error).toBeNull();
    });
  });
});

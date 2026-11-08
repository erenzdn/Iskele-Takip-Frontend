import { describe, it, expect } from 'vitest';
import type { BillingPeriod, ContractInvoice } from '../models';
import {
  isoToLocalDateKey,
  inclusiveDayCount,
  computeInvoiceAmountForRange,
  findOpenPeriodContaining,
  findOverlappingInvoices,
  invoiceAmountReducer,
  createInitialInvoiceAmountState,
  formatAmountInput,
  parseAmountInput,
} from './invoiceAmountCalc';

describe('invoiceAmountCalc', () => {
  describe('isoToLocalDateKey', () => {
    it('ISO tarihini yerel takvim gününe çevirir', () => {
      // 20:59:59.999Z İstanbul saatiyle 23:59:59.999 olur (UTC+3)
      expect(isoToLocalDateKey('2026-02-14T20:59:59.999Z')).toBe('2026-02-14');
      expect(isoToLocalDateKey('2026-01-01T00:00:00.000Z')).toBe('2026-01-01');
      expect(isoToLocalDateKey('2026-12-31T21:00:00.000Z')).toBe('2027-01-01'); // UTC+3 ile bir sonraki gün
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

  describe('computeInvoiceAmountForRange', () => {
    it('tek dönemi tam kapsayınca birebir tutar döner', () => {
      const plan: BillingPeriod[] = [
        {
          index: 0,
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-01-31T20:59:59.999Z',
          isPartial: false,
          isClosed: true,
          accrualSubtotal: 10000,
          accrualNetTotal: 10000,
          billedAmount: null,
          variance: null,
          varianceReasons: [],
          lines: [],
        },
      ];

      const result = computeInvoiceAmountForRange(plan, '2026-01-01', '2026-01-31');

      expect(result.amount).toBe(10000);
      expect(result.requestedDays).toBe(31);
      expect(result.coveredDays).toBe(31);
      expect(result.uncoveredDays).toBe(0);
      expect(result.hasProration).toBe(false);
      expect(result.hasProjection).toBe(false);
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].contribution).toBe(10000);
    });

    it('birden çok tam dönemi toplar', () => {
      const plan: BillingPeriod[] = [
        {
          index: 0,
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-01-31T20:59:59.999Z',
          isPartial: false,
          isClosed: true,
          accrualSubtotal: 5000,
          accrualNetTotal: 5000,
          billedAmount: null,
          variance: null,
          varianceReasons: [],
          lines: [],
        },
        {
          index: 1,
          periodStart: '2026-02-01T00:00:00.000Z',
          periodEnd: '2026-02-28T20:59:59.999Z',
          isPartial: false,
          isClosed: true,
          accrualSubtotal: 5000,
          accrualNetTotal: 5000,
          billedAmount: null,
          variance: null,
          varianceReasons: [],
          lines: [],
        },
      ];

      const result = computeInvoiceAmountForRange(plan, '2026-01-01', '2026-02-28');

      expect(result.amount).toBe(10000);
      expect(result.requestedDays).toBe(59);
      expect(result.coveredDays).toBe(59);
      expect(result.hasProration).toBe(false);
      expect(result.breakdown).toHaveLength(2);
    });

    it('başta kısmi dönem orantılar', () => {
      const plan: BillingPeriod[] = [
        {
          index: 0,
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-01-31T20:59:59.999Z',
          isPartial: false,
          isClosed: true,
          accrualSubtotal: 3100,
          accrualNetTotal: 3100,
          billedAmount: null,
          variance: null,
          varianceReasons: [],
          lines: [],
        },
      ];

      // 15-31 Ocak = 17 gün
      const result = computeInvoiceAmountForRange(plan, '2026-01-15', '2026-01-31');

      expect(result.requestedDays).toBe(17);
      expect(result.coveredDays).toBe(17);
      expect(result.hasProration).toBe(true);
      // 3100 * 17/31 = 1700
      expect(result.amount).toBe(1700);
    });

    it('sonda kısmi dönem orantılar', () => {
      const plan: BillingPeriod[] = [
        {
          index: 0,
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-01-31T20:59:59.999Z',
          isPartial: false,
          isClosed: true,
          accrualSubtotal: 3100,
          accrualNetTotal: 3100,
          billedAmount: null,
          variance: null,
          varianceReasons: [],
          lines: [],
        },
      ];

      // 1-15 Ocak = 15 gün
      const result = computeInvoiceAmountForRange(plan, '2026-01-01', '2026-01-15');

      expect(result.requestedDays).toBe(15);
      expect(result.coveredDays).toBe(15);
      expect(result.hasProration).toBe(true);
      // 3100 * 15/31 = 1500
      expect(result.amount).toBe(1500);
    });

    it('tek gün hesaplar', () => {
      const plan: BillingPeriod[] = [
        {
          index: 0,
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-01-31T20:59:59.999Z',
          isPartial: false,
          isClosed: true,
          accrualSubtotal: 3100,
          accrualNetTotal: 3100,
          billedAmount: null,
          variance: null,
          varianceReasons: [],
          lines: [],
        },
      ];

      const result = computeInvoiceAmountForRange(plan, '2026-01-15', '2026-01-15');

      expect(result.requestedDays).toBe(1);
      expect(result.coveredDays).toBe(1);
      expect(result.hasProration).toBe(true);
      // 3100 * 1/31 = 100
      expect(result.amount).toBe(100);
    });

    it('dönem ortası aralık orantılar', () => {
      const plan: BillingPeriod[] = [
        {
          index: 0,
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-01-31T20:59:59.999Z',
          isPartial: false,
          isClosed: true,
          accrualSubtotal: 3100,
          accrualNetTotal: 3100,
          billedAmount: null,
          variance: null,
          varianceReasons: [],
          lines: [],
        },
      ];

      // 10-20 Ocak = 11 gün
      const result = computeInvoiceAmountForRange(plan, '2026-01-10', '2026-01-20');

      expect(result.requestedDays).toBe(11);
      expect(result.coveredDays).toBe(11);
      expect(result.hasProration).toBe(true);
      // 3100 * 11/31 = 1100
      expect(result.amount).toBe(1100);
    });

    it('28 günlük Şubat ayını doğru hesaplar', () => {
      const plan: BillingPeriod[] = [
        {
          index: 0,
          periodStart: '2026-02-01T00:00:00.000Z',
          periodEnd: '2026-02-28T20:59:59.999Z',
          isPartial: false,
          isClosed: true,
          accrualSubtotal: 2800,
          accrualNetTotal: 2800,
          billedAmount: null,
          variance: null,
          varianceReasons: [],
          lines: [],
        },
      ];

      const result = computeInvoiceAmountForRange(plan, '2026-02-01', '2026-02-28');

      expect(result.amount).toBe(2800);
      expect(result.requestedDays).toBe(28);
      expect(result.breakdown[0].periodDays).toBe(28);
    });

    it('29 günlük Şubat ayını doğru hesaplar (artık yıl)', () => {
      const plan: BillingPeriod[] = [
        {
          index: 0,
          periodStart: '2024-02-01T00:00:00.000Z',
          periodEnd: '2024-02-29T20:59:59.999Z',
          isPartial: false,
          isClosed: true,
          accrualSubtotal: 2900,
          accrualNetTotal: 2900,
          billedAmount: null,
          variance: null,
          varianceReasons: [],
          lines: [],
        },
      ];

      const result = computeInvoiceAmountForRange(plan, '2024-02-01', '2024-02-29');

      expect(result.amount).toBe(2900);
      expect(result.requestedDays).toBe(29);
      expect(result.breakdown[0].periodDays).toBe(29);
    });

    it('sıfır tahakkuklu dönem sıfır katkı verir', () => {
      const plan: BillingPeriod[] = [
        {
          index: 0,
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-01-31T20:59:59.999Z',
          isPartial: false,
          isClosed: true,
          accrualSubtotal: 0,
          accrualNetTotal: 0,
          billedAmount: null,
          variance: null,
          varianceReasons: [],
          lines: [],
        },
      ];

      const result = computeInvoiceAmountForRange(plan, '2026-01-01', '2026-01-31');

      expect(result.amount).toBe(0);
      expect(result.breakdown[0].contribution).toBe(0);
    });

    it('boş plan sıfır döner', () => {
      const result = computeInvoiceAmountForRange([], '2026-01-01', '2026-01-31');

      expect(result.amount).toBe(0);
      expect(result.requestedDays).toBe(31);
      expect(result.coveredDays).toBe(0);
      expect(result.uncoveredDays).toBe(31);
      expect(result.breakdown).toHaveLength(0);
    });

    it('tamamen plan dışı aralık uncoveredDays döner', () => {
      const plan: BillingPeriod[] = [
        {
          index: 0,
          periodStart: '2026-02-01T00:00:00.000Z',
          periodEnd: '2026-02-28T20:59:59.999Z',
          isPartial: false,
          isClosed: true,
          accrualSubtotal: 5000,
          accrualNetTotal: 5000,
          billedAmount: null,
          variance: null,
          varianceReasons: [],
          lines: [],
        },
      ];

      const result = computeInvoiceAmountForRange(plan, '2026-01-01', '2026-01-31');

      expect(result.amount).toBe(0);
      expect(result.requestedDays).toBe(31);
      expect(result.coveredDays).toBe(0);
      expect(result.uncoveredDays).toBe(31);
    });

    it('kısmen plan dışı aralık uncoveredDays belirtir', () => {
      const plan: BillingPeriod[] = [
        {
          index: 0,
          periodStart: '2026-01-10T00:00:00.000Z',
          periodEnd: '2026-01-31T20:59:59.999Z',
          isPartial: false,
          isClosed: true,
          accrualSubtotal: 2200,
          accrualNetTotal: 2200,
          billedAmount: null,
          variance: null,
          varianceReasons: [],
          lines: [],
        },
      ];

      // 1-31 Ocak isteniyor ama plan 10-31 arası
      const result = computeInvoiceAmountForRange(plan, '2026-01-01', '2026-01-31');

      expect(result.requestedDays).toBe(31);
      expect(result.coveredDays).toBe(22); // 10-31 = 22 gün
      expect(result.uncoveredDays).toBe(9); // 1-9 = 9 gün
      expect(result.hasProration).toBe(false); // Dönem tam kapsanıyor
    });

    it('başlangıç > bitiş olunca sıfır döner', () => {
      const plan: BillingPeriod[] = [
        {
          index: 0,
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-01-31T20:59:59.999Z',
          isPartial: false,
          isClosed: true,
          accrualSubtotal: 3100,
          accrualNetTotal: 3100,
          billedAmount: null,
          variance: null,
          varianceReasons: [],
          lines: [],
        },
      ];

      const result = computeInvoiceAmountForRange(plan, '2026-01-31', '2026-01-01');

      expect(result.amount).toBe(0);
      expect(result.requestedDays).toBe(0);
    });

    it('yuvarlama doğru çalışır (0.1 + 0.2 sorunu)', () => {
      const plan: BillingPeriod[] = [
        {
          index: 0,
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-01-31T20:59:59.999Z',
          isPartial: false,
          isClosed: true,
          accrualSubtotal: 0.3,
          accrualNetTotal: 0.3,
          billedAmount: null,
          variance: null,
          varianceReasons: [],
          lines: [],
        },
      ];

      const result = computeInvoiceAmountForRange(plan, '2026-01-01', '2026-01-31');

      expect(result.amount).toBe(0.3);
      expect(Number.isFinite(result.amount)).toBe(true);
    });

    it('20:59:59.999Z bitiş doğru yerel güne düşer', () => {
      const plan: BillingPeriod[] = [
        {
          index: 0,
          periodStart: '2026-01-31T21:00:00.000Z',
          periodEnd: '2026-02-28T20:59:59.999Z',
          isPartial: false,
          isClosed: true,
          accrualSubtotal: 2800,
          accrualNetTotal: 2800,
          billedAmount: null,
          variance: null,
          varianceReasons: [],
          lines: [],
        },
      ];

      // Backend ISO tarihleri İstanbul saat dilimine göre
      const result = computeInvoiceAmountForRange(plan, '2026-02-01', '2026-02-28');

      expect(result.requestedDays).toBe(28);
      expect(result.coveredDays).toBe(28);
      expect(result.amount).toBe(2800);
    });

    it('açık dönemde hasProjection bayrağı', () => {
      const plan: BillingPeriod[] = [
        {
          index: 0,
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-01-31T20:59:59.999Z',
          isPartial: false,
          isClosed: false, // Açık dönem
          accrualSubtotal: 3100,
          accrualNetTotal: 3100,
          billedAmount: null,
          variance: null,
          varianceReasons: [],
          lines: [],
        },
      ];

      const result = computeInvoiceAmountForRange(plan, '2026-01-01', '2026-01-31');

      expect(result.hasProjection).toBe(true);
      expect(result.breakdown[0].isClosed).toBe(false);
    });

    it('kısmi dönem isPartial bayrağını korur', () => {
      const plan: BillingPeriod[] = [
        {
          index: 0,
          periodStart: '2026-01-01T00:00:00.000Z',
          periodEnd: '2026-01-15T20:59:59.999Z',
          isPartial: true,
          isClosed: true,
          accrualSubtotal: 1500,
          accrualNetTotal: 1500,
          billedAmount: null,
          variance: null,
          varianceReasons: [],
          lines: [],
        },
      ];

      const result = computeInvoiceAmountForRange(plan, '2026-01-01', '2026-01-15');

      expect(result.breakdown[0].isPartial).toBe(true);
    });
  });

  describe('findOpenPeriodContaining', () => {
    const plan: BillingPeriod[] = [
      {
        index: 0,
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-01-31T20:59:59.999Z',
        isPartial: false,
        isClosed: true,
        accrualSubtotal: 5000,
        accrualNetTotal: 5000,
        billedAmount: 5000,
        variance: 0,
        varianceReasons: [],
        lines: [],
      },
      {
        index: 1,
        periodStart: '2026-02-01T00:00:00.000Z',
        periodEnd: '2026-02-28T20:59:59.999Z',
        isPartial: false,
        isClosed: false, // Açık dönem
        accrualSubtotal: 5000,
        accrualNetTotal: 5000,
        billedAmount: null,
        variance: null,
        varianceReasons: [],
        lines: [],
      },
    ];

    it('açık dönemin içindeki tarihi bulur', () => {
      const found = findOpenPeriodContaining(plan, '2026-02-15');
      expect(found).toBeTruthy();
      expect(found?.index).toBe(1);
    });

    it('açık dönemin tam sonundaki tarihi bulur', () => {
      const found = findOpenPeriodContaining(plan, '2026-02-28');
      expect(found).toBeTruthy();
      expect(found?.index).toBe(1);
    });

    it('kapalı dönemdeki tarihi bulmaz', () => {
      const found = findOpenPeriodContaining(plan, '2026-01-15');
      expect(found).toBeNull();
    });

    it('plan dışı tarihi bulmaz', () => {
      const found = findOpenPeriodContaining(plan, '2026-03-15');
      expect(found).toBeNull();
    });

    it('boş plan için null döner', () => {
      const found = findOpenPeriodContaining([], '2026-02-15');
      expect(found).toBeNull();
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
        hasProration: false,
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
        hasProration: false,
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
          hasProration: false,
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

    it('yükleme durumunu ayarlar', () => {
      const state = createInitialInvoiceAmountState();
      const newState = invoiceAmountReducer(state, { type: 'CALC_LOADING' });
      
      expect(newState.loading).toBe(true);
      expect(newState.error).toBeNull();
    });
  });
});

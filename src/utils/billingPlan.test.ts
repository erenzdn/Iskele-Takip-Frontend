import { describe, expect, it } from 'vitest';
import type { BillingPeriod, ContractLineItem } from '../models';
import {
  billedPeriodDeletePath,
  buildMarkBilledPeriodBody,
  canMarkBilledPeriod,
  canUnmarkBilledPeriod,
  formatBilledAmountInputDefault,
  getBillingPeriodStatus,
  getBillingPeriodStatusLabel,
  getBillingVarianceDisplay,
  getDueNowPresentation,
  getMarkBilledDisabledReason,
  isAsOfInFuture,
  parseBilledAmountInput,
  parseBillingPeriod,
  parseBillingPlan,
  parseBillingSummary,
  resolveBillingLineLabel,
  validateBilledAmountInput,
  warningLooksPendingAddendum,
} from './billingPlan';
import {
  AMBIGUOUS_CONTRACT_DETAIL_USER_MESSAGE,
  isAmbiguousContractDetailError,
} from './contractReturn';

function period(partial: Partial<BillingPeriod> & Pick<BillingPeriod, 'periodStart' | 'periodEnd'>): BillingPeriod {
  return {
    index: 0,
    isPartial: false,
    isClosed: true,
    accrualSubtotal: 100,
    accrualNetTotal: 120,
    billedAmount: null,
    variance: null,
    varianceReasons: [],
    lines: [],
    ...partial,
  };
}

describe('getBillingPeriodStatus', () => {
  it('açık dönemi billedAmount olsa bile Devam ediyor sayar', () => {
    const status = getBillingPeriodStatus(
      period({
        periodStart: '2026-01-15T00:00:00.000Z',
        periodEnd: '2026-02-01T00:00:00.000Z',
        isClosed: false,
        billedAmount: 120,
        variance: 0,
      })
    );
    expect(status).toBe('in_progress');
    expect(getBillingPeriodStatusLabel(status)).toBe('Devam ediyor');
  });

  it('kapalı ve işaretsiz dönemi Faturalanmadı sayar', () => {
    const status = getBillingPeriodStatus(
      period({
        periodStart: '2026-01-15T00:00:00.000Z',
        periodEnd: '2026-02-01T00:00:00.000Z',
        isClosed: true,
        billedAmount: null,
        variance: null,
      })
    );
    expect(status).toBe('unbilled');
    expect(getBillingPeriodStatusLabel(status)).toBe('Faturalanmadı');
  });

  it('işaretli ve maddi olmayan farkı Faturalandı sayar', () => {
    const status = getBillingPeriodStatus(
      period({
        periodStart: '2026-01-15T00:00:00.000Z',
        periodEnd: '2026-02-01T00:00:00.000Z',
        billedAmount: 120.004,
        variance: 0.004,
      })
    );
    expect(status).toBe('billed');
    expect(getBillingPeriodStatusLabel(status)).toBe('Faturalandı');
  });

  it('işaretli ve maddi farkı Fark var sayar', () => {
    const status = getBillingPeriodStatus(
      period({
        periodStart: '2026-01-15T00:00:00.000Z',
        periodEnd: '2026-02-01T00:00:00.000Z',
        billedAmount: 100,
        variance: 20.02,
      })
    );
    expect(status).toBe('variance');
    expect(getBillingPeriodStatusLabel(status)).toBe('Fark var');
  });
});

describe('getBillingVarianceDisplay', () => {
  it('işaret yoksa veya eşik altındaysa tire gösterir', () => {
    expect(getBillingVarianceDisplay(null)).toEqual({ kind: 'none', amount: null, label: '—' });
    expect(getBillingVarianceDisplay(0)).toEqual({ kind: 'none', amount: null, label: '—' });
    expect(getBillingVarianceDisplay(0.01)).toEqual({ kind: 'none', amount: null, label: '—' });
    expect(getBillingVarianceDisplay(-0.009)).toEqual({ kind: 'none', amount: null, label: '—' });
  });

  it('pozitif maddi farkı eksik faturalandı olarak yazar', () => {
    const display = getBillingVarianceDisplay(36.5);
    expect(display.kind).toBe('under');
    expect(display.amount).toBe(36.5);
    expect(display.label).toBe('eksik faturalandı (ek fatura gerekir)');
  });

  it('negatif maddi farkı fazla faturalandı olarak yazar', () => {
    const display = getBillingVarianceDisplay(-12.25);
    expect(display.kind).toBe('over');
    expect(display.amount).toBe(12.25);
    expect(display.label).toBe('fazla faturalandı (iade/alacak gerekir)');
  });
});

describe('işaretle modalı gövdesi', () => {
  it('periodStart/periodEnd değerlerini parse etmeden aynen gönderir', () => {
    const start = '2026-01-15T00:00:00.000Z';
    const end = '2026-02-14T20:59:59.999Z';
    const body = buildMarkBilledPeriodBody(
      { periodStart: start, periodEnd: end },
      360.129,
      '  Fatura no: FTR-1  '
    );
    expect(body.periodStart).toBe(start);
    expect(body.periodEnd).toBe(end);
    expect(body.billedAmount).toBe(360.13);
    expect(body.notes).toBe('Fatura no: FTR-1');
  });

  it('boş notu null gönderir ve tutarı 2 haneye yuvarlar', () => {
    const body = buildMarkBilledPeriodBody(
      {
        periodStart: '2026-01-15T00:00:00.000Z',
        periodEnd: '2026-02-01T00:00:00.000Z',
      },
      10.004,
      '   '
    );
    expect(body.notes).toBeNull();
    expect(body.billedAmount).toBe(10);
  });

  it('varsayılan tutarı tr-TR 2 ondalık yazar', () => {
    expect(formatBilledAmountInputDefault(360.1299)).toBe('360,13');
    expect(parseBilledAmountInput('1.234,50')).toBe(1234.5);
    expect(validateBilledAmountInput('')).toBeTruthy();
    expect(validateBilledAmountInput('-1')).toBeTruthy();
    expect(validateBilledAmountInput('0')).toBeNull();
  });
});

describe('işaretleme yetkisi', () => {
  it('açık dönemde işaretlemeyi engeller', () => {
    expect(
      canMarkBilledPeriod({
        isClosed: false,
        billedAmount: null,
        canUpdate: true,
        contractCancelled: false,
        contractArchived: false,
      })
    ).toBe(false);
    expect(
      getMarkBilledDisabledReason({
        isClosed: false,
        contractCancelled: false,
        contractArchived: false,
      })
    ).toBe('Dönem tamamlanınca işaretlenebilir');
  });

  it('iptal/arşiv sözleşmede işaretle/kaldır yapmaz', () => {
    expect(
      canMarkBilledPeriod({
        isClosed: true,
        billedAmount: null,
        canUpdate: true,
        contractCancelled: true,
        contractArchived: false,
      })
    ).toBe(false);
    expect(
      canUnmarkBilledPeriod({
        billedAmount: 100,
        canUpdate: true,
        contractCancelled: false,
        contractArchived: true,
      })
    ).toBe(false);
  });

  it('yalnız contracts_update ve kapalı işaretsiz dönemde izin verir', () => {
    expect(
      canMarkBilledPeriod({
        isClosed: true,
        billedAmount: null,
        canUpdate: false,
        contractCancelled: false,
        contractArchived: false,
      })
    ).toBe(false);
    expect(
      canMarkBilledPeriod({
        isClosed: true,
        billedAmount: null,
        canUpdate: true,
        contractCancelled: false,
        contractArchived: false,
      })
    ).toBe(true);
  });
});

describe('dueNow sunumu', () => {
  it('negatif tutarı fazla faturalanmış olarak işaretler', () => {
    const over = getDueNowPresentation(-15.019);
    expect(over.tone).toBe('overbilled');
    expect(over.rounded).toBe(-15.02);
  });

  it('sıfıra yakın tutarı bekleyen yok sayar', () => {
    expect(getDueNowPresentation(0.004).tone).toBe('zero');
    expect(getDueNowPresentation(80).tone).toBe('positive');
  });
});

describe('API parse ve URL', () => {
  it('DELETE periodStart değerini encodeURIComponent ile yazar', () => {
    expect(billedPeriodDeletePath(42, '2026-01-15T00:00:00.000Z')).toBe(
      '/contracts/42/billed-periods/2026-01-15T00%3A00%3A00.000Z'
    );
  });

  it('PascalCase plan yanıtını camelCase modele çevirir', () => {
    const parsed = parseBillingPeriod({
      Index: 1,
      PeriodStart: '2026-01-15T00:00:00.000Z',
      PeriodEnd: '2026-02-01T00:00:00.000Z',
      IsPartial: true,
      IsClosed: true,
      AccrualSubtotal: 200,
      AccrualNetTotal: 240,
      BilledAmount: 240,
      Variance: 0,
      VarianceReasons: [],
      Lines: [{ DetailId: 9, ItemId: 3, Gross: 200, Net: 240 }],
    });
    expect(parsed?.index).toBe(1);
    expect(parsed?.isPartial).toBe(true);
    expect(parsed?.lines[0]).toEqual({ DetailId: 9, ItemId: 3, gross: 200, net: 240 });
    expect(parseBillingPlan(parsed ? [parsed] : []).length).toBe(1);
  });

  it('özet yanıtındaki projeksiyonu korur, tutarı yeniden hesaplamaz', () => {
    const summary = parseBillingSummary({
      asOf: '2026-03-01T00:00:00.000Z',
      dueNow: -12.3456,
      currentPeriodProjection: {
        periodStart: '2026-03-01T00:00:00.000Z',
        periodEnd: '2026-03-31T21:00:00.000Z',
        projectedNetTotal: 88.8888,
      },
      warnings: ['Onay bekleyen zeyilname var'],
    });
    expect(summary.dueNow).toBe(-12.3456);
    expect(summary.currentPeriodProjection?.projectedNetTotal).toBe(88.8888);
    expect(warningLooksPendingAddendum(summary.warnings[0])).toBe(true);
  });
});

describe('kalem etiketi ve asOf', () => {
  it('aynı ItemId satırlarını DetailId ile ayırır', () => {
    const items: ContractLineItem[] = [
      {
        kind: 'inventory',
        DetailId: 10,
        ItemId: 5,
        WarehouseId: 1,
        RentedQuantity: 2,
        ReturnedQuantity: 0,
        UnitPriceSnapshot: 1,
        PriceUnit: 'DAY',
        PriceSource: 'INVENTORY',
        ItemName: 'İskele A',
      },
      {
        kind: 'inventory',
        DetailId: 11,
        ItemId: 5,
        WarehouseId: 1,
        RentedQuantity: 1,
        ReturnedQuantity: 0,
        UnitPriceSnapshot: 1,
        PriceUnit: 'DAY',
        PriceSource: 'INVENTORY',
        ItemName: 'İskele A (zeyil)',
      },
    ];
    expect(resolveBillingLineLabel({ DetailId: 11, ItemId: 5 }, items)).toBe('İskele A (zeyil)');
    expect(resolveBillingLineLabel({ DetailId: 99, ItemId: 8 }, [])).toBe('#8');
  });

  it('gelecek asOf tarihini projeksiyon kabul eder', () => {
    expect(isAsOfInFuture('2099-12-31')).toBe(true);
    expect(isAsOfInFuture('2000-01-01')).toBe(false);
    expect(isAsOfInFuture('')).toBe(false);
  });
});

describe('iade DetailId 400', () => {
  it('birden fazla satır mesajını tanır', () => {
    const error = Object.assign(new Error('bad'), {
      status: 400,
      responseText: JSON.stringify({ message: 'Bu ürün için birden fazla satır var, DetailId zorunlu' }),
    });
    expect(isAmbiguousContractDetailError(error)).toBe(true);
    expect(AMBIGUOUS_CONTRACT_DETAIL_USER_MESSAGE).toMatch(/satırı listeden seçin/);
  });

  it('diğer 400 mesajlarını karıştırmaz', () => {
    const error = Object.assign(new Error('bad'), {
      status: 400,
      responseText: JSON.stringify({ message: 'İade miktarı geçersiz' }),
    });
    expect(isAmbiguousContractDetailError(error)).toBe(false);
  });
});

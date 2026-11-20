import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/apiClient', () => ({ apiClient: { get: vi.fn() } }));

import {
  expirationBucket,
  formatCompactMoney,
  formatCurrencyBreakdown,
  formatDaysRemaining,
  formatMonthKey,
  percent,
  shareOfPrevious,
} from './dashboardFormat';
import { normalizeDashboardSummary } from '../services/dashboardService';

describe('dashboardFormat', () => {
  it('ay anahtarını Türkçe kısaltır', () => {
    expect(formatMonthKey('2026-11')).toBe('Kas 2026');
    expect(formatMonthKey('2026-02', true)).toBe('Şub 26');
    expect(formatMonthKey('bozuk')).toBe('bozuk');
  });

  it('para birimlerini ayrı gösterir, sıfırları atlar', () => {
    expect(formatCurrencyBreakdown({ TRY: 1200, EUR: 0, USD: 50 })).toBe('₺1.200 + $50');
    expect(formatCurrencyBreakdown({ TRY: 0, EUR: 0, USD: 0 })).toBe('₺0');
  });

  it('kısa tutar biçimi', () => {
    expect(formatCompactMoney(1_250_000)).toBe('1,25 Mn');
    expect(formatCompactMoney(12_500)).toBe('12,5 B');
    expect(formatCompactMoney(900)).toBe('900');
  });

  it('geçen aya oran; geçen ay 0 ise null', () => {
    expect(shareOfPrevious(50, 200)).toBe(25);
    expect(shareOfPrevious(50, 0)).toBeNull();
    expect(shareOfPrevious(null, 10)).toBeNull();
  });

  it('bitiş grupları ve metinleri', () => {
    expect(expirationBucket(-1)).toBe('overdue');
    expect(expirationBucket(0)).toBe('week');
    expect(expirationBucket(7)).toBe('week');
    expect(expirationBucket(8)).toBe('month');
    expect(formatDaysRemaining(-3)).toBe('3 gün gecikti');
    expect(formatDaysRemaining(0)).toBe('Bugün bitiyor');
  });

  it('yüzde, payda 0 iken 0', () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(5, 0)).toBe(0);
  });
});

describe('normalizeDashboardSummary', () => {
  it('eski sunucu yanıtını (yeniden eskiye seri, eksik alanlar) güvenle normalize eder', () => {
    const s = normalizeDashboardSummary({
      activeContractsCount: '3' as unknown as number,
      totalRevenue: null,
      monthlyRevenueSeries: [
        { month: '2026-11', revenue: 10 },
        { month: '2026-09', revenue: 5 },
      ],
      lowStockItems: [{ ItemId: 1, ItemName: 'X', TotalStock: 10, OnRent: 4, Reserved: 3 }],
    });
    expect(s.activeContractsCount).toBe(3);
    expect(s.totalRevenue).toBeNull();
    expect(s.monthlyRevenueSeries.map((p) => p.month)).toEqual(['2026-09', '2026-11']);
    expect(s.lowStockItems[0].AvailableStock).toBe(3);
    expect(s.checksDueSoon).toBeNull();
    expect(s.totalRevenueByCurrency).toEqual({ TRY: 0, EUR: 0, USD: 0 });
  });
});

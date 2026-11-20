import type { CurrencyAmounts } from '../services/dashboardService';

const MONTH_NAMES = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const CURRENCY_SYMBOL: Record<string, string> = { TRY: '₺', EUR: '€', USD: '$' };

/** '2026-11' → 'Kas 2026' (kısa: 'Kas 26') */
export function formatMonthKey(monthKey: string, short = false): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return monthKey;
  return `${MONTH_NAMES[monthIndex]} ${short ? match[1].slice(2) : match[1]}`;
}

export function formatMoney(amount: number, currency = 'TRY', fractionDigits = 0): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  return `${symbol}${amount.toLocaleString('tr-TR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

/** Eksen için kısa tutar: 1.250.000 → 1,25 Mn */
export function formatCompactMoney(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${(amount / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} Mn`;
  if (abs >= 1_000) return `${(amount / 1_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} B`;
  return amount.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}

/** Sıfır olmayan para birimlerini yan yana yazar: '₺12.000 + €300'. Hepsi sıfırsa '₺0'. */
export function formatCurrencyBreakdown(amounts: CurrencyAmounts): string {
  const parts = (['TRY', 'EUR', 'USD'] as const)
    .filter((c) => (amounts[c] ?? 0) !== 0)
    .map((c) => formatMoney(amounts[c], c));
  return parts.length > 0 ? parts.join(' + ') : formatMoney(0);
}

export function hasForeignCurrency(amounts: CurrencyAmounts): boolean {
  return (amounts.EUR ?? 0) !== 0 || (amounts.USD ?? 0) !== 0;
}

/**
 * Bu ayın (henüz bitmemiş) değerinin geçen ayın tamamına oranı, yüzde.
 * Geçen ay 0 ya da bilinmiyorsa null.
 */
export function shareOfPrevious(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous <= 0) return null;
  return Math.round((current / previous) * 100);
}

export type ExpirationBucket = 'overdue' | 'week' | 'month';

export function expirationBucket(daysRemaining: number): ExpirationBucket {
  if (daysRemaining < 0) return 'overdue';
  if (daysRemaining <= 7) return 'week';
  return 'month';
}

export function formatDaysRemaining(daysRemaining: number): string {
  if (daysRemaining < 0) return `${Math.abs(daysRemaining)} gün gecikti`;
  if (daysRemaining === 0) return 'Bugün bitiyor';
  if (daysRemaining === 1) return 'Yarın bitiyor';
  return `${daysRemaining} gün kaldı`;
}

export function percent(part: number, whole: number): number {
  if (!(whole > 0)) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('tr-TR');
}

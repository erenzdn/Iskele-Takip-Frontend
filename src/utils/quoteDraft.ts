import { QuoteStatus } from '../models';

export function isQuoteDraftStatus(status: string | null | undefined): boolean {
  return String(status ?? '').toLowerCase() === QuoteStatus.Draft;
}

export function hasMeaningfulQuoteDraftContent(input: {
  customerId?: number | '' | null;
  itemCount?: number;
  subject?: string | null;
  notes?: string | null;
  quoteCode?: string | null;
}): boolean {
  if (input.customerId != null && input.customerId !== '') return true;
  if ((input.itemCount ?? 0) > 0) return true;
  if (String(input.subject ?? '').trim()) return true;
  if (String(input.notes ?? '').trim()) return true;
  if (String(input.quoteCode ?? '').trim()) return true;
  return false;
}

export function quoteContractsPath(quoteType: 'RENTAL' | 'SALE' | string | undefined): string {
  return String(quoteType ?? '').toUpperCase() === 'SALE' ? '/contracts/sale' : '/contracts/rental';
}

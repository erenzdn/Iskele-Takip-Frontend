import type { AddendumStatus, ChangeType } from '../models';

export function normalizeAddendumStatus(raw: unknown): AddendumStatus {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 'pending' || s === 'approved' || s === 'rejected' || s === 'draft') return s;
  return 'draft';
}

export function getAddendumStatusLabel(status: AddendumStatus): string {
  switch (status) {
    case 'draft':
      return 'Taslak';
    case 'pending':
      return 'Onay Bekliyor';
    case 'approved':
      return 'Onaylandı';
    case 'rejected':
      return 'Reddedildi';
    default:
      return status;
  }
}

/** Tailwind sınıfları — durum badge */
export function getAddendumStatusBadgeClass(status: AddendumStatus): string {
  switch (status) {
    case 'draft':
      return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    case 'pending':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    case 'approved':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'rejected':
      return 'bg-red-500/20 text-red-300 border-red-500/40';
    default:
      return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
  }
}

export function getChangeTypeLabel(changeType: ChangeType): string {
  switch (changeType) {
    case 'ADD':
      return 'Yeni Kalem';
    case 'INCREASE':
      return 'Miktar Artır';
    case 'DECREASE':
      return 'Miktar Azalt';
    case 'PRICE_CHANGE':
      return 'Fiyat Değiştir';
    default:
      return changeType;
  }
}

export function isAddendumEditable(status: AddendumStatus): boolean {
  return status === 'draft';
}

export function canSubmitAddendum(status: AddendumStatus): boolean {
  return status === 'draft' || status === 'rejected';
}

export function canApproveOrRejectAddendum(status: AddendumStatus): boolean {
  return status === 'pending';
}

export function canDeleteAddendum(status: AddendumStatus): boolean {
  return status === 'draft';
}

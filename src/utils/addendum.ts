import type { Addendum, AddendumStatus, ChangeType, ContractLineItem } from '../models';

export interface AddendumLineSource {
  addendumId: number;
  addendumNo: number | null;
}

/** Onaylı zeyilnamelerdeki ADD kalemlerinden sözleşme satırı → zeyilname eşlemesi */
export function buildAddendumAddedLineSources(addenda: Addendum[]): Map<number, AddendumLineSource> {
  const map = new Map<number, AddendumLineSource>();
  for (const addendum of addenda) {
    if (addendum.Status !== 'approved') continue;
    const details = addendum.details ?? addendum.Details ?? [];
    const source: AddendumLineSource = {
      addendumId: addendum.AddendumId,
      addendumNo: addendum.AddendumNo ?? null,
    };
    for (const detail of details) {
      if (detail.ChangeType !== 'ADD') continue;
      const contractDetailId = detail.ContractDetailId;
      if (contractDetailId != null && contractDetailId > 0) {
        map.set(contractDetailId, source);
      }
    }
  }
  return map;
}

export function getAddendumSourceForContractLine(
  item: ContractLineItem,
  sources: Map<number, AddendumLineSource>
): AddendumLineSource | null {
  const directId = item.SourceAddendumId;
  if (directId != null && directId > 0) {
    return {
      addendumId: directId,
      addendumNo: item.SourceAddendumNo ?? null,
    };
  }
  const detailId = item.DetailId;
  if (detailId != null && detailId > 0 && sources.has(detailId)) {
    return sources.get(detailId)!;
  }
  return null;
}

export type ContractItemDisplayEntry =
  | { kind: 'separator' }
  | { kind: 'row'; item: ContractLineItem; isAddendumRow: boolean; addendumNo: number | null };

/** Sözleşme kalemlerini ana liste + zeyilname bölümü olarak sıralar */
export function buildContractItemDisplayEntries(
  items: ContractLineItem[],
  sources: Map<number, AddendumLineSource>,
  splitAddendumRows: boolean
): ContractItemDisplayEntry[] {
  if (!splitAddendumRows || items.length === 0) {
    return items.map((item) => ({ kind: 'row', item, isAddendumRow: false, addendumNo: null }));
  }

  const base: ContractLineItem[] = [];
  const addendum: Array<{ item: ContractLineItem; addendumNo: number | null; addendumId: number }> = [];

  for (const item of items) {
    const source = getAddendumSourceForContractLine(item, sources);
    if (source) {
      addendum.push({
        item,
        addendumNo: source.addendumNo,
        addendumId: source.addendumId,
      });
    } else {
      base.push(item);
    }
  }

  if (addendum.length === 0) {
    return items.map((item) => ({ kind: 'row', item, isAddendumRow: false, addendumNo: null }));
  }

  addendum.sort((a, b) => {
    const noDiff = (a.addendumNo ?? a.addendumId) - (b.addendumNo ?? b.addendumId);
    if (noDiff !== 0) return noDiff;
    return (a.item.DetailId ?? 0) - (b.item.DetailId ?? 0);
  });

  const entries: ContractItemDisplayEntry[] = base.map((item) => ({
    kind: 'row',
    item,
    isAddendumRow: false,
    addendumNo: null,
  }));
  entries.push({ kind: 'separator' });
  entries.push(
    ...addendum.map(({ item, addendumNo }) => ({
      kind: 'row' as const,
      item,
      isAddendumRow: true,
      addendumNo,
    }))
  );
  return entries;
}

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

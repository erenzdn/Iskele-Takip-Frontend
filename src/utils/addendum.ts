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

export type AddendumLineGroup = {
  addendumId: number;
  addendumNo: number | null;
  items: ContractLineItem[];
};

/** Zeyilname kaynaklı kalemleri zeyilname no'ya göre gruplar */
export function groupAddendumLineItemsByAddendum(
  items: ContractLineItem[],
  sources: Map<number, AddendumLineSource>
): AddendumLineGroup[] {
  const map = new Map<number, AddendumLineGroup>();
  for (const item of items) {
    const source = getAddendumSourceForContractLine(item, sources);
    if (!source) continue;
    let group = map.get(source.addendumId);
    if (!group) {
      group = {
        addendumId: source.addendumId,
        addendumNo: source.addendumNo,
        items: [],
      };
      map.set(source.addendumId, group);
    } else if (group.addendumNo == null && source.addendumNo != null) {
      group.addendumNo = source.addendumNo;
    }
    group.items.push(item);
  }
  return Array.from(map.values()).sort(
    (a, b) => (a.addendumNo ?? a.addendumId) - (b.addendumNo ?? b.addendumId)
  );
}

/**
 * Sözleşme kalemlerini listeler.
 * splitAddendumRows=true: ana + ayırıcı + zeyilname (eski görünüm).
 * splitAddendumRows=false: tek birleşik sıra; Z rozeti için isAddendumRow işaretlenir.
 */
export function buildContractItemDisplayEntries(
  items: ContractLineItem[],
  sources: Map<number, AddendumLineSource>,
  splitAddendumRows: boolean
): ContractItemDisplayEntry[] {
  if (items.length === 0) return [];

  if (!splitAddendumRows) {
    return items.map((item) => {
      const source = getAddendumSourceForContractLine(item, sources);
      return {
        kind: 'row' as const,
        item,
        isAddendumRow: source != null,
        addendumNo: source?.addendumNo ?? null,
      };
    });
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

/** Onaylandı + tersine çevrildi durum etiketi (Status alanı approved kalır) */
export function getAddendumDisplayStatusLabel(addendum: Pick<Addendum, 'Status' | 'IsReversed'>): string {
  if (addendum.Status === 'approved' && addendum.IsReversed) {
    return 'Onaylandı (tersine çevrildi)';
  }
  return getAddendumStatusLabel(addendum.Status);
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

/** Aktif ters kayıt: draft / pending / approved (rejected sayılmaz) */
export function isActiveReverseStatus(status: AddendumStatus): boolean {
  return status === 'draft' || status === 'pending' || status === 'approved';
}

export function hasActiveReverseForSource(
  list: Array<Pick<Addendum, 'ReversesAddendumId' | 'Status'>>,
  sourceAddendumId: number
): boolean {
  return list.some(
    (row) => row.ReversesAddendumId === sourceAddendumId && isActiveReverseStatus(row.Status)
  );
}

/**
 * Onaylı + henüz tersine çevrilmemiş + aktif sözleşme + yetki.
 * Aynı kaynak için aktif ters kayıt varsa false.
 */
export function canReverseAddendum(opts: {
  addendum: Pick<Addendum, 'AddendumId' | 'Status' | 'IsReversed'>;
  contractActive: boolean;
  canUpdate: boolean;
  siblingAddenda?: Array<Pick<Addendum, 'ReversesAddendumId' | 'Status'>>;
}): boolean {
  const { addendum, contractActive, canUpdate, siblingAddenda } = opts;
  if (!canUpdate || !contractActive) return false;
  if (addendum.Status !== 'approved') return false;
  if (addendum.IsReversed) return false;
  if (siblingAddenda && hasActiveReverseForSource(siblingAddenda, addendum.AddendumId)) {
    return false;
  }
  return true;
}

export function getReverseBlockedReason(opts: {
  addendum: Pick<Addendum, 'AddendumId' | 'Status' | 'IsReversed'>;
  contractActive: boolean;
  canUpdate: boolean;
  siblingAddenda?: Array<Pick<Addendum, 'ReversesAddendumId' | 'Status'>>;
}): string | null {
  const { addendum, contractActive, canUpdate, siblingAddenda } = opts;
  if (!canUpdate) return 'Zeyilname tersine çevirmek için yetkiniz yok';
  if (!contractActive) {
    return 'Tamamlanmış, iptal veya arşiv sözleşmelerde tersine çevirme yapılamaz';
  }
  if (addendum.Status !== 'approved') return 'Yalnızca onaylanmış zeyilnameler tersine çevrilebilir';
  if (addendum.IsReversed) return 'Bu zeyilname zaten tersine çevrildi';
  if (siblingAddenda && hasActiveReverseForSource(siblingAddenda, addendum.AddendumId)) {
    return 'Bu zeyilname için aktif bir ters zeyilname zaten var';
  }
  return null;
}

export function formatAddendumRefLabel(opts: {
  number?: number | null;
  code?: string | null;
  id?: number | null;
}): string {
  if (opts.number != null) return `#${opts.number}`;
  if (opts.code) return opts.code;
  if (opts.id != null) return `#${opts.id}`;
  return '—';
}

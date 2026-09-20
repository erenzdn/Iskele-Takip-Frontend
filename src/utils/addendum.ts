import type { Addendum, AddendumStatus, ChangeType, ContractLineItem } from '../models';

export interface AddendumLineSource {
  addendumId: number;
  addendumNo: number | null;
}

/** Onaylı zeyilname detayının sözleşme satırına etkisini temsil eder */
export type LineAddendumEvent = {
  addendumId: number;
  addendumNo: number | null;
  effectiveDate: string;
  changeType: ChangeType;
  /** ADD / INCREASE / DECREASE; PRICE_CHANGE için null */
  quantityDelta: number | null;
  newUnitPrice: number | null;
  isReversal: boolean;
  isFromReversedAddendum: boolean;
  addendumDetailId: number;
};

/**
 * Bir sözleşmenin zeyilnamelerini oluşum sırasına (AddendumId) göre 1'den numaralandırır.
 * Global veritabanı kimliği yerine sözleşme içi sıra gösterilir.
 */
export function buildContractAddendumDisplayNoMap(
  addenda: Array<Pick<Addendum, 'AddendumId'>>
): Map<number, number> {
  const ids = new Set<number>();
  for (const row of addenda) {
    if (row.AddendumId > 0) ids.add(row.AddendumId);
  }
  const sorted = [...ids].sort((a, b) => a - b);
  const map = new Map<number, number>();
  sorted.forEach((id, index) => {
    map.set(id, index + 1);
  });
  return map;
}

export function lookupContractAddendumDisplayNo(
  addendumId: number | null | undefined,
  displayNoById: Map<number, number> | undefined,
  fallback?: number | null
): number | null {
  if (addendumId == null || addendumId <= 0) return fallback ?? null;
  const mapped = displayNoById?.get(addendumId);
  return mapped ?? fallback ?? null;
}

export function applyAddendumDisplayNumbers<T extends Addendum>(
  row: T,
  displayNoById: Map<number, number>
): T {
  return {
    ...row,
    AddendumNo: lookupContractAddendumDisplayNo(row.AddendumId, displayNoById),
    ReversesAddendumNumber: lookupContractAddendumDisplayNo(
      row.ReversesAddendumId,
      displayNoById,
      row.ReversesAddendumNumber
    ),
    ReversedByAddendumNumber: lookupContractAddendumDisplayNo(
      row.ReversedByAddendumId,
      displayNoById,
      row.ReversedByAddendumNumber
    ),
  };
}

/** Sözleşmedeki tüm zeyilnamelere 1..n yerel numara yazar. */
export function applyContractLocalAddendumNumbers<T extends Addendum>(addenda: T[]): T[] {
  const displayNoById = buildContractAddendumDisplayNoMap(addenda);
  return addenda.map((row) => applyAddendumDisplayNumbers(row, displayNoById));
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

/**
 * Onaylı zeyilname detaylarından sözleşme satırı (ContractDetailId) → olay listesi.
 * Draft / pending / rejected dahil edilmez. Sıra: EffectiveDate, sonra AddendumNo.
 */
export function buildLineAddendumHistory(addenda: Addendum[]): Map<number, LineAddendumEvent[]> {
  const map = new Map<number, LineAddendumEvent[]>();

  for (const addendum of addenda) {
    if (addendum.Status !== 'approved') continue;
    const details = addendum.details ?? addendum.Details ?? [];
    const isReversal = Boolean(addendum.IsReversal);
    const isFromReversedAddendum = Boolean(addendum.IsReversed);

    for (const detail of details) {
      const contractDetailId = detail.ContractDetailId;
      if (contractDetailId == null || contractDetailId <= 0) continue;

      const changeType = detail.ChangeType;
      if (
        changeType !== 'ADD' &&
        changeType !== 'INCREASE' &&
        changeType !== 'DECREASE' &&
        changeType !== 'PRICE_CHANGE'
      ) {
        continue;
      }

      let quantityDelta: number | null = null;
      if (changeType === 'ADD' || changeType === 'INCREASE' || changeType === 'DECREASE') {
        quantityDelta =
          detail.QuantityChange != null && Number.isFinite(Number(detail.QuantityChange))
            ? Number(detail.QuantityChange)
            : null;
      }

      const event: LineAddendumEvent = {
        addendumId: addendum.AddendumId,
        addendumNo: addendum.AddendumNo ?? null,
        effectiveDate: addendum.EffectiveDate ?? '',
        changeType,
        quantityDelta,
        newUnitPrice:
          detail.NewUnitPrice != null && Number.isFinite(Number(detail.NewUnitPrice))
            ? Number(detail.NewUnitPrice)
            : null,
        isReversal,
        isFromReversedAddendum,
        addendumDetailId: detail.DetailId,
      };

      const list = map.get(contractDetailId);
      if (list) list.push(event);
      else map.set(contractDetailId, [event]);
    }
  }

  for (const [, events] of map) {
    events.sort((a, b) => {
      const dateCmp = (a.effectiveDate || '').localeCompare(b.effectiveDate || '');
      if (dateCmp !== 0) return dateCmp;
      const noDiff = (a.addendumNo ?? a.addendumId) - (b.addendumNo ?? b.addendumId);
      if (noDiff !== 0) return noDiff;
      return a.addendumDetailId - b.addendumDetailId;
    });
  }

  return map;
}

/**
 * Tek zeyilname no varsa `Z{n}`; birden fazla farklı zeyilname veya no yoksa `Z`.
 * Olay yoksa null.
 */
export function getLineAddendumBadgeLabel(events: LineAddendumEvent[] | undefined): string | null {
  if (!events || events.length === 0) return null;
  const uniqueNos = new Set<number>();
  for (const e of events) {
    if (e.addendumNo != null) uniqueNos.add(e.addendumNo);
  }
  if (uniqueNos.size === 1) {
    const only = uniqueNos.values().next().value as number;
    return `Z${only}`;
  }
  return 'Z';
}

export function getAddendumSourceForContractLine(
  item: ContractLineItem,
  sources: Map<number, AddendumLineSource>,
  displayNoByAddendumId?: Map<number, number>
): AddendumLineSource | null {
  const resolveNo = (addendumId: number, fallback: number | null): number | null =>
    displayNoByAddendumId
      ? lookupContractAddendumDisplayNo(addendumId, displayNoByAddendumId, fallback)
      : fallback;

  const directId = item.SourceAddendumId;
  if (directId != null && directId > 0) {
    return {
      addendumId: directId,
      addendumNo: resolveNo(directId, item.SourceAddendumNo ?? null),
    };
  }
  const detailId = item.DetailId;
  if (detailId != null && detailId > 0 && sources.has(detailId)) {
    const src = sources.get(detailId)!;
    return {
      ...src,
      addendumNo: resolveNo(src.addendumId, src.addendumNo),
    };
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

/** Zeyilname ekleri sekmesi satırı (ADD kalemi veya ters zeyilname detayı) */
export type AddendumExtrasDisplayRow = {
  key: string;
  code: string;
  name: string;
  quantityDisplay: string;
  netDisplay: string | null;
  changeTypeLabel: string | null;
};

export type AddendumExtrasDisplayGroup = {
  addendumId: number;
  addendumNo: number | null;
  isReversal: boolean;
  isReversed: boolean;
  reversesAddendumNo: number | null;
  reversesAddendumId: number | null;
  rows: AddendumExtrasDisplayRow[];
};

/** Zeyilname kaynaklı kalemleri zeyilname no'ya göre gruplar */
export function groupAddendumLineItemsByAddendum(
  items: ContractLineItem[],
  sources: Map<number, AddendumLineSource>,
  displayNoByAddendumId?: Map<number, number>
): AddendumLineGroup[] {
  const map = new Map<number, AddendumLineGroup>();
  for (const item of items) {
    const source = getAddendumSourceForContractLine(item, sources, displayNoByAddendumId);
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

function extrasDetailName(detail: {
  ItemName?: string | null;
  ItemCode?: string | null;
  Description?: string | null;
  ContractDetailDescription?: string | null;
  ItemId?: number | null;
  IsManual?: boolean;
}): string {
  if (detail.IsManual) {
    return detail.Description || detail.ContractDetailDescription || 'Manuel kalem';
  }
  return (
    detail.ItemName ||
    detail.ContractDetailDescription ||
    detail.Description ||
    (detail.ItemId != null ? `Ürün #${detail.ItemId}` : 'Kalem')
  );
}

function formatExtrasQuantityDelta(qty: number | null | undefined): string {
  if (qty == null || !Number.isFinite(Number(qty))) return '—';
  const n = Number(qty);
  if (n > 0) return `+${n}`;
  return String(n);
}

/**
 * Zeyilname ekleri sekmesi: onaylı ADD kalemleri + onaylı ters zeyilname detayları.
 */
export function buildAddendumExtrasDisplayGroups(opts: {
  addenda: Addendum[];
  contractItems: ContractLineItem[];
  sources: Map<number, AddendumLineSource>;
  formatNet: (item: ContractLineItem) => string;
  displayNoByAddendumId?: Map<number, number>;
}): AddendumExtrasDisplayGroup[] {
  const { addenda, contractItems, sources, formatNet, displayNoByAddendumId } = opts;
  const approved = addenda.filter((a) => a.Status === 'approved');
  const byId = new Map(approved.map((a) => [a.AddendumId, a]));
  const groups: AddendumExtrasDisplayGroup[] = [];
  const seenAddendumIds = new Set<number>();

  const addGroups = groupAddendumLineItemsByAddendum(
    contractItems,
    sources,
    displayNoByAddendumId
  );
  for (const g of addGroups) {
    const meta = byId.get(g.addendumId);
    seenAddendumIds.add(g.addendumId);
    groups.push({
      addendumId: g.addendumId,
      addendumNo: lookupContractAddendumDisplayNo(
        g.addendumId,
        displayNoByAddendumId,
        g.addendumNo ?? meta?.AddendumNo
      ),
      isReversal: Boolean(meta?.IsReversal),
      isReversed: Boolean(meta?.IsReversed),
      reversesAddendumNo: lookupContractAddendumDisplayNo(
        meta?.ReversesAddendumId,
        displayNoByAddendumId,
        meta?.ReversesAddendumNumber
      ),
      reversesAddendumId: meta?.ReversesAddendumId ?? null,
      rows: g.items.map((item, idx) => {
        const name =
          item.kind === 'manual'
            ? item.Description || 'Manuel kalem'
            : item.ItemName || `Ürün #${item.ItemId}`;
        const code =
          item.kind === 'inventory' ? item.ItemCode || item.ItemCodeOverride || '' : '';
        return {
          key: `add-${g.addendumId}-${item.DetailId ?? idx}-${item.kind === 'inventory' ? `${item.ItemId}-${item.WarehouseId}` : item.ClientId}`,
          code,
          name,
          quantityDisplay: String(item.RentedQuantity),
          netDisplay: formatNet(item),
          changeTypeLabel: null,
        };
      }),
    });
  }

  for (const addendum of approved) {
    if (!addendum.IsReversal) continue;
    if (seenAddendumIds.has(addendum.AddendumId)) continue;
    const details = addendum.details ?? addendum.Details ?? [];
    if (details.length === 0) continue;
    seenAddendumIds.add(addendum.AddendumId);
    groups.push({
      addendumId: addendum.AddendumId,
      addendumNo: lookupContractAddendumDisplayNo(
        addendum.AddendumId,
        displayNoByAddendumId,
        addendum.AddendumNo
      ),
      isReversal: true,
      isReversed: Boolean(addendum.IsReversed),
      reversesAddendumNo: lookupContractAddendumDisplayNo(
        addendum.ReversesAddendumId,
        displayNoByAddendumId,
        addendum.ReversesAddendumNumber
      ),
      reversesAddendumId: addendum.ReversesAddendumId ?? null,
      rows: details.map((detail, idx) => ({
        key: `rev-${addendum.AddendumId}-${detail.DetailId || idx}`,
        code: detail.ItemCode || '',
        name: extrasDetailName(detail),
        quantityDisplay: formatExtrasQuantityDelta(detail.QuantityChange),
        netDisplay: null,
        changeTypeLabel: getChangeTypeLabel(detail.ChangeType),
      })),
    });
  }

  return groups.sort(
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
  splitAddendumRows: boolean,
  displayNoByAddendumId?: Map<number, number>
): ContractItemDisplayEntry[] {
  if (items.length === 0) return [];

  if (!splitAddendumRows) {
    return items.map((item) => {
      const source = getAddendumSourceForContractLine(item, sources, displayNoByAddendumId);
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
    const source = getAddendumSourceForContractLine(item, sources, displayNoByAddendumId);
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

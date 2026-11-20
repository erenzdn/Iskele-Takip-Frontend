import type { AddendumDetail, ContractLineItem } from '../models';
import type {
  CreateAddendumDetailRequest,
  UpdateAddendumDetailRequest,
} from '../services/addendumService';

/**
 * Zeyilname miktar tablosu: sözleşmedeki tüm kalemler + zeyilnamede eklenen ürünler tek tabloda,
 * kullanıcı "yeni miktar" yazar; kaydederken mevcut INCREASE/DECREASE/ADD kalemleriyle farkı çıkarılır.
 */

export type AddendumGridRow =
  | {
      kind: 'contract';
      key: string;
      line: ContractLineItem;
      contractDetailId: number;
      /** Sözleşmedeki mevcut miktar */
      currentQty: number;
      /** Bu zeyilnamedeki INCREASE/DECREASE toplamı (kayıtlı) */
      savedDelta: number;
      /** Bu satıra bağlı miktar kalemleri (çoğunlukla 0 veya 1) */
      qtyDetails: AddendumDetail[];
      /** Sözleşmedeki mevcut fiyat (kiralamada aylık, satışta birim; iskonto öncesi) */
      currentPrice: number;
      /** Bu satıra bağlı fiyat değişikliği kalemleri */
      priceDetails: AddendumDetail[];
    }
  | {
      kind: 'added';
      key: string;
      detail: AddendumDetail;
      /** Kayıtlı ADD miktarı */
      savedQty: number;
    };

function isQtyChange(d: AddendumDetail): boolean {
  return d.ChangeType === 'INCREASE' || d.ChangeType === 'DECREASE';
}

export function contractLineCurrentQty(line: ContractLineItem): number {
  return Math.max(0, Math.floor(Number(line.RentedQuantity) || 0));
}

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Kiralama satırında UnitPriceSnapshot günlüktür (PriceUnit DAY); aylık fiyat = override ?? günlük × 30.
 * Satışta birim fiyat aynen.
 */
export function contractLineCurrentPrice(line: ContractLineItem, isRental: boolean): number {
  const snapshot = Number(line.UnitPriceSnapshot) || 0;
  if (!isRental) return roundMoney(snapshot);
  if (line.kind === 'inventory' && line.MonthlyPriceOverride != null) {
    return roundMoney(line.MonthlyPriceOverride);
  }
  return roundMoney(line.PriceUnit === 'DAY' ? snapshot * 30 : snapshot);
}

/** Fiyat değişikliği kaleminin tabloda gösterilecek fiyatı (kiralamada aylık) */
export function priceChangeDisplayPrice(d: AddendumDetail, isRental: boolean): number | null {
  if (isRental) {
    if (d.NewMonthlyOverride != null) return roundMoney(d.NewMonthlyOverride);
    return d.NewUnitPrice != null ? roundMoney(d.NewUnitPrice * 30) : null;
  }
  return d.NewUnitPrice != null ? roundMoney(d.NewUnitPrice) : null;
}

export function buildAddendumGridRows(
  contractLines: ContractLineItem[],
  details: AddendumDetail[],
  isRental = false
): AddendumGridRow[] {
  const byContractDetail = new Map<number, AddendumDetail[]>();
  const priceByContractDetail = new Map<number, AddendumDetail[]>();
  for (const d of details) {
    if (d.ContractDetailId == null) continue;
    const target = isQtyChange(d)
      ? byContractDetail
      : d.ChangeType === 'PRICE_CHANGE'
        ? priceByContractDetail
        : null;
    if (!target) continue;
    const id = Number(d.ContractDetailId);
    const list = target.get(id) ?? [];
    list.push(d);
    target.set(id, list);
  }

  const rows: AddendumGridRow[] = [];
  for (const line of contractLines) {
    const id = Number(line.DetailId);
    if (!Number.isFinite(id) || id <= 0) continue;
    const qtyDetails = byContractDetail.get(id) ?? [];
    const savedDelta = qtyDetails.reduce((sum, d) => sum + signedQty(d), 0);
    rows.push({
      kind: 'contract',
      key: `c-${id}`,
      line,
      contractDetailId: id,
      currentQty: contractLineCurrentQty(line),
      savedDelta,
      qtyDetails,
      currentPrice: contractLineCurrentPrice(line, isRental),
      priceDetails: priceByContractDetail.get(id) ?? [],
    });
  }

  details.forEach((d, idx) => {
    if (d.ChangeType !== 'ADD') return;
    rows.push({
      kind: 'added',
      key: d.DetailId > 0 ? `a-${d.DetailId}` : `a-idx-${idx}`,
      detail: d,
      savedQty: Math.max(0, Math.floor(Number(d.QuantityChange) || 0)),
    });
  });

  return rows;
}

/** INCREASE pozitif, DECREASE negatif (backend işaretini güvenilir saymadan) */
function signedQty(d: AddendumDetail): number {
  const abs = Math.abs(Math.floor(Number(d.QuantityChange) || 0));
  return d.ChangeType === 'DECREASE' ? -abs : abs;
}

/** Satırın kayıtlı (sunucudaki) "yeni miktar" değeri */
export function savedTargetQty(row: AddendumGridRow): number {
  return row.kind === 'contract' ? row.currentQty + row.savedDelta : row.savedQty;
}

export type AddendumQtyOp =
  | { op: 'add'; payload: CreateAddendumDetailRequest; rowKey: string }
  | { op: 'update'; detailId: number; patch: UpdateAddendumDetailRequest; rowKey: string }
  | { op: 'delete'; detailId: number; rowKey: string };

/**
 * Kullanıcının girdiği hedef miktarlardan yapılacak API işlemlerini çıkarır.
 * targets: rowKey → hedef miktar (yalnızca değiştirilen satırlar).
 */
export function planAddendumQtyOps(
  rows: AddendumGridRow[],
  targets: Record<string, number>
): AddendumQtyOp[] {
  const ops: AddendumQtyOp[] = [];
  for (const row of rows) {
    if (!(row.key in targets)) continue;
    const target = Math.max(0, Math.floor(targets[row.key]));
    if (target === savedTargetQty(row)) continue;

    if (row.kind === 'added') {
      if (row.detail.DetailId <= 0) continue;
      if (target === 0) {
        ops.push({ op: 'delete', detailId: row.detail.DetailId, rowKey: row.key });
      } else {
        ops.push({
          op: 'update',
          detailId: row.detail.DetailId,
          patch: { QuantityChange: target },
          rowKey: row.key,
        });
      }
      continue;
    }

    const delta = target - row.currentQty;
    const [first, ...extras] = row.qtyDetails.filter((d) => d.DetailId > 0);
    for (const extra of extras) {
      ops.push({ op: 'delete', detailId: extra.DetailId, rowKey: row.key });
    }
    if (delta === 0) {
      if (first) ops.push({ op: 'delete', detailId: first.DetailId, rowKey: row.key });
      continue;
    }
    const changeType = delta > 0 ? 'INCREASE' : 'DECREASE';
    if (first && first.ChangeType !== changeType) {
      // Tip değişimi (artış ↔ azalış) güncelleme ile değil, sil + ekle ile yapılır.
      ops.push({ op: 'delete', detailId: first.DetailId, rowKey: row.key });
      ops.push({
        op: 'add',
        payload: { ChangeType: changeType, ContractDetailId: row.contractDetailId, QuantityChange: delta },
        rowKey: row.key,
      });
    } else if (first) {
      ops.push({
        op: 'update',
        detailId: first.DetailId,
        patch: { ChangeType: changeType, ContractDetailId: row.contractDetailId, QuantityChange: delta },
        rowKey: row.key,
      });
    } else {
      ops.push({
        op: 'add',
        payload: { ChangeType: changeType, ContractDetailId: row.contractDetailId, QuantityChange: delta },
        rowKey: row.key,
      });
    }
  }
  return ops;
}

/** Satırın kayıtlı "yeni fiyat" değeri (fiyat değişikliği yoksa mevcut fiyat) */
export function savedTargetPrice(
  row: Extract<AddendumGridRow, { kind: 'contract' }>,
  isRental: boolean
): number {
  const last = row.priceDetails[row.priceDetails.length - 1];
  const p = last ? priceChangeDisplayPrice(last, isRental) : null;
  return p ?? row.currentPrice;
}

function priceFields(price: number, isRental: boolean) {
  const p = roundMoney(price);
  // Kiralamada sözleşme satırı günlük fiyat tutar; aylık override ile birlikte gönderilir.
  return isRental
    ? { NewUnitPrice: p / 30, NewMonthlyOverride: p }
    : { NewUnitPrice: p };
}

/**
 * Fiyat tablosunda girilen hedef fiyatlardan yapılacak API işlemleri.
 * Hedef mevcut sözleşme fiyatına eşitse fiyat değişikliği kalemi silinir.
 */
export function planAddendumPriceOps(
  rows: AddendumGridRow[],
  targets: Record<string, number>,
  isRental: boolean
): AddendumQtyOp[] {
  const ops: AddendumQtyOp[] = [];
  for (const row of rows) {
    if (row.kind !== 'contract' || !(row.key in targets)) continue;
    const target = roundMoney(Math.max(0, targets[row.key]));
    if (target === savedTargetPrice(row, isRental)) continue;
    const [first, ...extras] = row.priceDetails.filter((d) => d.DetailId > 0);
    for (const extra of extras) {
      ops.push({ op: 'delete', detailId: extra.DetailId, rowKey: row.key });
    }
    if (target === row.currentPrice) {
      if (first) ops.push({ op: 'delete', detailId: first.DetailId, rowKey: row.key });
      continue;
    }
    if (first) {
      ops.push({
        op: 'update',
        detailId: first.DetailId,
        patch: priceFields(target, isRental),
        rowKey: row.key,
      });
    } else {
      ops.push({
        op: 'add',
        payload: {
          ChangeType: 'PRICE_CHANGE',
          ContractDetailId: row.contractDetailId,
          ...priceFields(target, isRental),
        },
        rowKey: row.key,
      });
    }
  }
  return ops;
}

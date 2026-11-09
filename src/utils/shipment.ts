import type { Contract, ContractDetail, DeliveryMode, InventoryContractLineItem } from '../models';

/**
 * Sevkiyat (teslim) modu yardımcıları — backend src/utils/deliveryMode.js ile aynı kurallar.
 *
 * SHIPMENT modunda sözleşme malzemeyi yalnızca rezerve eder; kira ve depodan çıkış
 * sevkiyat fişiyle başlar. Parçalı sevkiyatta her parti kendi tarihinden en az 30 gün öder.
 */

export const DELIVERY_MODE_LABELS: Record<DeliveryMode, string> = {
  SHIPMENT: 'Sevkiyat ile',
  IMMEDIATE: 'Anında (sözleşmeyle)',
};

type ModeSource = Pick<Contract, 'Type' | 'DeliveryMode'> | null | undefined;

export function isShipmentContract(contract: ModeSource): boolean {
  if (!contract) return false;
  return contract.Type !== 'SALE' && contract.DeliveryMode === 'SHIPMENT';
}

export type ShipmentState = 'not_applicable' | 'awaiting' | 'partial' | 'shipped';

export const SHIPMENT_STATE_LABELS: Record<Exclude<ShipmentState, 'not_applicable'>, string> = {
  awaiting: 'Sevkiyat bekliyor',
  partial: 'Kısmi sevk',
  shipped: 'Sevk tamamlandı',
};

/**
 * Sözleşmenin sevkiyat durumu (liste/başlık rozeti için). IMMEDIATE ve satış: not_applicable.
 */
export function getShipmentState(
  contract: Pick<Contract, 'Type' | 'DeliveryMode' | 'PendingShipmentQuantity' | 'ShippedQuantityTotal' | 'FirstShipmentDate'>
): ShipmentState {
  if (!isShipmentContract(contract)) return 'not_applicable';
  const pending = Number(contract.PendingShipmentQuantity) || 0;
  const shipped = Number(contract.ShippedQuantityTotal) || 0;
  if (shipped <= 0 && !contract.FirstShipmentDate) return 'awaiting';
  return pending > 0 ? 'partial' : 'shipped';
}

/**
 * Kira başlangıcı (faturalama çapası): SHIPMENT modunda ilk aktif sevk tarihi; sevk yoksa
 * null (henüz kira yok). IMMEDIATE'te sözleşme StartDate'i.
 */
export function getRentalStartIso(
  contract: Pick<Contract, 'Type' | 'DeliveryMode' | 'StartDate' | 'FirstShipmentDate'>
): string | null {
  if (isShipmentContract(contract)) return contract.FirstShipmentDate ?? null;
  return contract.StartDate ?? null;
}

export interface LineShipmentProgress {
  contracted: number;
  shipped: number;
  returned: number;
  /** Sahada (müşteride) olan */
  onSite: number;
  /** Sevk bekleyen (rezerve) */
  pending: number;
}

/**
 * Satır bazlı ilerleme. IMMEDIATE'te sevk = sözleşme miktarı kabul edilir.
 */
export function getLineShipmentProgress(
  detail: Pick<ContractDetail, 'RentedQuantity' | 'ReturnedQuantity' | 'ShippedQuantity'>,
  contract: ModeSource
): LineShipmentProgress {
  const contracted = Number(detail.RentedQuantity) || 0;
  const returned = Number(detail.ReturnedQuantity) || 0;
  const shipped = isShipmentContract(contract) ? Number(detail.ShippedQuantity) || 0 : contracted;
  return {
    contracted,
    shipped,
    returned,
    onSite: Math.max(shipped - returned, 0),
    pending: Math.max(contracted - shipped, 0),
  };
}

/**
 * Sevk tarihi (YYYY-MM-DD) → ISO. Bugün seçildiyse şu anki saat (fiş gerçek çıkış anını
 * taşır); geçmiş bir gün seçildiyse o günün yerel öğlesi (takvim günü sınırına takılmaz).
 */
export function shipmentDateInputToIso(dateInput: string, now: Date = new Date()): string {
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (!dateInput || dateInput === todayKey) return now.toISOString();
  const [y, m, d] = dateInput.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0).toISOString();
}

export interface ShipmentDraftLine {
  DetailId: number;
  ItemName: string;
  /** Sevk edilebilecek kalan (sözleşme − sevk edilen) */
  remaining: number;
  /** Kullanıcının girdiği miktar (metin) */
  quantityInput: string;
}

export type ShipmentDraftValidation =
  | { ok: true; items: Array<{ DetailId: number; Quantity: number }> }
  | { ok: false; error: string };

/**
 * Sevkiyat taslağını doğrular ve API kalemlerine çevirir: 0 miktarlı satırlar atılır,
 * kalan miktarı aşan veya tam sayı olmayan girişler reddedilir.
 */
export function validateShipmentDraft(lines: ShipmentDraftLine[]): ShipmentDraftValidation {
  const items: Array<{ DetailId: number; Quantity: number }> = [];
  for (const line of lines) {
    const raw = line.quantityInput.trim();
    if (raw === '') continue;
    const qty = Number(raw);
    if (!Number.isInteger(qty) || qty < 0) {
      return { ok: false, error: `${line.ItemName}: miktar pozitif tam sayı olmalıdır.` };
    }
    if (qty > line.remaining) {
      return { ok: false, error: `${line.ItemName}: en fazla ${line.remaining} adet sevk edilebilir.` };
    }
    if (qty > 0) items.push({ DetailId: line.DetailId, Quantity: qty });
  }
  if (items.length === 0) return { ok: false, error: 'En az bir kalem için sevk miktarı girin.' };
  return { ok: true, items };
}

/** İade/kapama formunda girilebilecek azami miktar (sahadaki). */
export function getMaxReturnableQuantity(
  detail: Pick<ContractDetail, 'RentedQuantity' | 'ReturnedQuantity' | 'ShippedQuantity'>,
  contract: ModeSource
): number {
  return getLineShipmentProgress(detail, contract).onSite;
}

/**
 * GET /contracts/:id yanıtındaki ham detayları sevkiyat fişi penceresinin beklediği
 * envanter satırlarına çevirir (manuel kalemler sevk edilmez, atlanır).
 */
export function contractDetailsToShipmentLines(contract: unknown): InventoryContractLineItem[] {
  const src = (contract ?? {}) as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (src.details ?? src.ContractDetails ?? src.contractDetails ?? []) as Record<string, any>[];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d) => !(d.IsManual === true || d.is_manual === true || d.IsManual === 1 || d.is_manual === 1))
    .map((d): InventoryContractLineItem => ({
      kind: 'inventory',
      DetailId: Number(d.DetailId ?? d.detailId),
      ItemId: Number(d.ItemId ?? d.itemId),
      WarehouseId: Number(d.WarehouseId ?? d.warehouseId ?? 0) || 0,
      WarehouseName: d.WarehouseName ?? d.warehouseName ?? '',
      RentedQuantity: Number(d.RentedQuantity ?? d.rentedQuantity ?? 0) || 0,
      ReturnedQuantity: Number(d.ReturnedQuantity ?? d.returnedQuantity ?? 0) || 0,
      ShippedQuantity: Number(d.ShippedQuantity ?? d.shippedQuantity ?? 0) || 0,
      UnitPriceSnapshot: Number(d.UnitPriceSnapshot ?? d.unitPriceSnapshot ?? 0) || 0,
      PriceUnit: d.PriceUnit ?? d.priceUnit ?? 'DAY',
      PriceSource: d.PriceSource ?? d.priceSource ?? 'INVENTORY',
      ItemName: d.ItemName ?? d.itemName ?? '',
      ItemNameEn: d.ItemNameEn ?? d.itemNameEn ?? undefined,
      ItemCode: d.ItemCode ?? d.itemCode ?? undefined,
    }))
    .filter((l) => Number.isFinite(l.DetailId) && l.DetailId > 0);
}

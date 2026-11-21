import type { Shipment } from '../models';
import { toast } from '../hooks/useToast';
import { getPendingDeliveryDays } from '../utils/shipment';
import type { OpenContextMenuPayload, ShipmentRowTarget } from './types';

/** Sevkiyat fişi satırı için sağ tık hedefi */
export function shipmentContextTarget(shipment: Shipment): ShipmentRowTarget {
  return {
    entityType: 'shipment',
    entityId: shipment.ShipmentId,
    itemName: shipment.ShipmentNo,
    rawData: {
      ShipmentId: shipment.ShipmentId,
      ShipmentNo: shipment.ShipmentNo,
      ContractId: shipment.ContractId,
      IsCancelled: shipment.Status === 'CANCELLED',
      IsDelivered: Boolean(shipment.DeliveredAt),
      ExternalWaybillNo: shipment.ExternalWaybillNo,
      AttachmentCount: shipment.AttachmentCount,
      HasSignedWaybill: shipment.HasSignedWaybill,
      PendingDays: getPendingDeliveryDays(shipment),
    },
  };
}

/** Metni panoya kopyalar; boşsa uyarır, sonucu bildirim olarak gösterir */
export async function copyWithToast(text: string | null | undefined, label: string) {
  if (!text) {
    toast.warning(`${label} bulunmuyor.`);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} kopyalandı.`);
  } catch {
    toast.error(`${label} kopyalanamadı.`);
  }
}

/** Sağ tık "Kopyala" işlemleri (fiş no / irsaliye no) */
export function shipmentCopyHandlers(shipment: Shipment): NonNullable<OpenContextMenuPayload['handlers']> {
  return {
    'shipment.copyNo': () => copyWithToast(shipment.ShipmentNo, 'Fiş no'),
    'shipment.copyWaybill': () => copyWithToast(shipment.ExternalWaybillNo, 'İrsaliye no'),
  };
}

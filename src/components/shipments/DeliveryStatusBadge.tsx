import type { Shipment } from '../../models';
import {
  DELIVERY_OVERDUE_DAYS,
  getPendingDeliveryDays,
  getShipmentDeliveryState,
  SHIPMENT_DELIVERY_STATE_LABELS,
} from '../../utils/shipment';
import { formatDateTime } from '../../utils/formatters';

type BadgeShipment = Pick<
  Shipment,
  'Status' | 'DeliveredAt' | 'ShipmentDate' | 'DeliveredReceiverName' | 'CancellationReason' | 'HasSignedWaybill'
>;

/**
 * Türetilmiş fiş durumu: İptal / Teslim edildi / Teslim bekliyor (N gün).
 * Teslim edilmiş ama imzalı irsaliyesi eklenmemiş fiş ayrıca işaretlenir.
 */
export default function DeliveryStatusBadge({ shipment }: { shipment: BadgeShipment }) {
  const state = getShipmentDeliveryState(shipment);

  if (state === 'cancelled') {
    return (
      <span className="text-red-400" title={shipment.CancellationReason || undefined}>
        {SHIPMENT_DELIVERY_STATE_LABELS.cancelled}
      </span>
    );
  }

  if (state === 'delivered') {
    const title = [
      shipment.DeliveredAt ? `Teslim: ${formatDateTime(shipment.DeliveredAt)}` : null,
      shipment.DeliveredReceiverName ? `Teslim alan: ${shipment.DeliveredReceiverName}` : null,
      shipment.HasSignedWaybill ? null : 'İmzalı irsaliye eklenmemiş',
    ]
      .filter(Boolean)
      .join('\n');
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap" title={title}>
        <span className="text-green-400">{SHIPMENT_DELIVERY_STATE_LABELS.delivered}</span>
        {!shipment.HasSignedWaybill && (
          <span className="text-[10px] px-1 rounded bg-amber-500/20 text-amber-300">irsaliye yok</span>
        )}
      </span>
    );
  }

  const days = getPendingDeliveryDays(shipment) ?? 0;
  const overdue = days > DELIVERY_OVERDUE_DAYS;
  return (
    <span
      className={`whitespace-nowrap ${overdue ? 'text-amber-300 font-medium' : 'text-sky-300'}`}
      title={overdue ? `${days} gündür teslim onayı bekliyor` : undefined}
    >
      {SHIPMENT_DELIVERY_STATE_LABELS.pending}
      {days > 0 ? ` (${days} gün)` : ''}
    </span>
  );
}

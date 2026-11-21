import type { Attachment, Shipment } from '../../models';
import { formatDateTime } from '../../utils/formatters';
import AttachmentsPanel from '../attachments/AttachmentsPanel';

interface ShipmentDetailsPanelProps {
  shipment: Shipment;
  /** Kalemler henüz yükleniyorsa true (liste yanıtı kalem içermeyebilir) */
  itemsLoading?: boolean;
  canConfirmDelivery: boolean;
  onConfirmDelivery: () => void;
  onUndoDelivery: () => void;
  onAttachmentsChange?: (items: Attachment[]) => void;
}

/**
 * Fiş satırının açılır ayrıntısı: kalemler, fiş bilgileri, teslim durumu ve teslim belgeleri.
 * Sevkiyatlar sayfası ve sözleşmenin "Sevkiyatlar" sekmesi ortak kullanır.
 */
export default function ShipmentDetailsPanel({
  shipment: s,
  itemsLoading,
  canConfirmDelivery,
  onConfirmDelivery,
  onUndoDelivery,
  onAttachmentsChange,
}: ShipmentDetailsPanelProps) {
  const cancelled = s.Status === 'CANCELLED';
  const items = s.items ?? [];

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary mb-1">Sevk edilen kalemler</div>
        {itemsLoading && items.length === 0 ? (
          <p className="text-[11px] text-text-secondary">Yükleniyor…</p>
        ) : items.length === 0 ? (
          <p className="text-[11px] text-text-secondary">Kalem yok.</p>
        ) : (
          <ul className="space-y-0.5">
            {items.map((it) => (
              <li key={it.ShipmentItemId} className="flex justify-between gap-3 border-b border-background-border/40 py-0.5">
                <span>
                  {it.ItemCode ? <span className="text-text-secondary mr-1">{it.ItemCode}</span> : null}
                  {it.ItemName}
                </span>
                <span className="font-medium">{it.Quantity}</span>
              </li>
            ))}
          </ul>
        )}

        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
          {(s.VehiclePlate || s.DriverName) && (
            <>
              <dt className="text-text-secondary">Araç / Şoför</dt>
              <dd>{[s.VehiclePlate, s.DriverName].filter(Boolean).join(' · ')}</dd>
            </>
          )}
          {s.ReceiverName && (
            <>
              <dt className="text-text-secondary">Teslim alacak</dt>
              <dd>{s.ReceiverName}</dd>
            </>
          )}
          {s.ExternalWaybillNo && (
            <>
              <dt className="text-text-secondary">İrsaliye no</dt>
              <dd>{s.ExternalWaybillNo}</dd>
            </>
          )}
          {s.DeliveryAddress && (
            <>
              <dt className="text-text-secondary">Adres</dt>
              <dd>{s.DeliveryAddress}</dd>
            </>
          )}
          {(s.CreatedByName || s.CreatedAt) && (
            <>
              <dt className="text-text-secondary">Düzenleyen</dt>
              <dd>
                {s.CreatedByName ?? ''}
                {s.CreatedAt ? ` · ${formatDateTime(s.CreatedAt)}` : ''}
              </dd>
            </>
          )}
          {s.UpdatedAt && (
            <>
              <dt className="text-text-secondary">Son düzenleme</dt>
              <dd>
                {formatDateTime(s.UpdatedAt)}
                {s.UpdatedByName ? ` (${s.UpdatedByName})` : ''}
              </dd>
            </>
          )}
          {s.Notes && (
            <>
              <dt className="text-text-secondary">Not</dt>
              <dd className="whitespace-pre-wrap">{s.Notes}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="space-y-3">
        {cancelled ? (
          <div className="rounded border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[11px]">
            <div className="font-semibold text-red-400">Fiş iptal edildi</div>
            <div>
              {s.CancelledAt ? formatDateTime(s.CancelledAt) : ''}
              {s.CancelledByName ? ` · ${s.CancelledByName}` : ''}
            </div>
            {s.CancellationReason && <div className="mt-0.5">Sebep: {s.CancellationReason}</div>}
          </div>
        ) : (
          <div className="rounded border border-background-border bg-background-panel px-2.5 py-2 text-[11px] flex flex-wrap items-center gap-x-3 gap-y-1">
            {s.DeliveredAt ? (
              <>
                <span className="font-semibold text-green-400">Teslim edildi</span>
                <span>{formatDateTime(s.DeliveredAt)}</span>
                <span>
                  Teslim alan: {s.DeliveredReceiverName}
                  {s.DeliveredReceiverTitle ? ` (${s.DeliveredReceiverTitle})` : ''}
                </span>
                {s.DeliveryConfirmedByName && (
                  <span className="text-text-secondary">Onaylayan: {s.DeliveryConfirmedByName}</span>
                )}
                {s.DeliveryNotes && <span className="basis-full">Teslim notu: {s.DeliveryNotes}</span>}
              </>
            ) : (
              <span className="text-sky-300">Teslim onayı bekliyor. İmzalı irsaliye geldiğinde teslimi onaylayın.</span>
            )}
            {canConfirmDelivery && (
              <span className="ml-auto flex gap-1.5">
                <button
                  type="button"
                  className={`${s.DeliveredAt ? 'btn-secondary' : 'btn-primary'} py-0.5 px-2 text-xs`}
                  onClick={onConfirmDelivery}
                >
                  {s.DeliveredAt ? 'Düzelt' : 'Teslimi onayla'}
                </button>
                {s.DeliveredAt && (
                  <button type="button" className="btn-secondary py-0.5 px-2 text-xs text-red-400" onClick={onUndoDelivery}>
                    Onayı geri al
                  </button>
                )}
              </span>
            )}
          </div>
        )}
        <AttachmentsPanel
          entityType="SHIPMENT"
          entityId={s.ShipmentId}
          categories={['SIGNED_WAYBILL', 'DELIVERY_PHOTO', 'OTHER']}
          title="Teslim belgeleri"
          onItemsChange={onAttachmentsChange}
        />
      </div>
    </div>
  );
}

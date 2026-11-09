import { useState } from 'react';
import { createPortal } from 'react-dom';
import { WarningIcon, XIcon } from '@phosphor-icons/react';
import { usePortalTarget } from '../tabs/TabContext';
import type { Attachment, Shipment } from '../../models';
import { shipmentService } from '../../services/shipmentService';
import { toast } from '../../hooks/useToast';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatDate } from '../../utils/formatters';
import { toDateTimeLocalValue, validateDeliveryDraft } from '../../utils/shipment';
import AttachmentsPanel from '../attachments/AttachmentsPanel';

interface ConfirmDeliveryModalProps {
  shipment: Shipment;
  onClose: () => void;
  /** Onay kaydedildi (güncel fiş) */
  onConfirmed: (shipment: Shipment) => void;
  /** Modal içinde ek yüklenip silindiğinde (liste sayaçları için) */
  onAttachmentsChanged?: (items: Attachment[]) => void;
}

/**
 * Sevkiyat fişinin teslim edildiğini onaylar (ya da mevcut onayı düzeltir).
 * İmzalı irsaliye aynı pencereden eklenir; eklenmeden de onaylanabilir ama uyarı gösterilir.
 * Kira hesabı değişmez — kira sevk tarihinde başlar.
 */
export default function ConfirmDeliveryModal({
  shipment,
  onClose,
  onConfirmed,
  onAttachmentsChanged,
}: ConfirmDeliveryModalProps) {
  const portalTarget = usePortalTarget();
  const isEdit = Boolean(shipment.DeliveredAt);
  const [deliveredAt, setDeliveredAt] = useState(() => toDateTimeLocalValue(shipment.DeliveredAt || new Date()));
  const [receiverName, setReceiverName] = useState(shipment.DeliveredReceiverName || shipment.ReceiverName || '');
  const [receiverTitle, setReceiverTitle] = useState(shipment.DeliveredReceiverTitle || '');
  const [notes, setNotes] = useState(shipment.DeliveryNotes || '');
  const [hasSignedWaybill, setHasSignedWaybill] = useState(Boolean(shipment.HasSignedWaybill));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const check = validateDeliveryDraft({ deliveredAt, receiverName }, shipment.ShipmentDate);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      const updated = await shipmentService.confirmDeliveryAsync(shipment.ShipmentId, {
        DeliveredAt: check.deliveredAtIso,
        ReceiverName: receiverName.trim(),
        ReceiverTitle: receiverTitle.trim() || null,
        Notes: notes.trim() || null,
      });
      toast.success(isEdit ? `${shipment.ShipmentNo} teslim bilgisi güncellendi.` : `${shipment.ShipmentNo} teslim edildi olarak işaretlendi.`);
      onConfirmed(updated);
    } catch (err) {
      setError(getApiErrorMessage(err) || 'Teslim onayı kaydedilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black bg-opacity-50 p-4 animate-in fade-in duration-200">
      <div
        className="bg-background-panel rounded-panel shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delivery-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-background-border">
          <h2 id="confirm-delivery-title" className="text-lg font-semibold text-text-primary">
            {isEdit ? 'Teslim bilgisini düzelt' : 'Teslimi onayla'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-background-secondary rounded-lg transition-colors text-text-secondary hover:text-text-primary"
            disabled={isSubmitting}
            aria-label="Kapat"
          >
            <XIcon size={20} />
          </button>
        </div>

        <div className="overflow-y-auto">
          <form id="confirm-delivery-form" onSubmit={handleSubmit} className="p-4 space-y-3">
            <p className="text-sm text-text-secondary">
              <span className="font-medium text-text-primary">{shipment.ShipmentNo}</span> · {formatDate(shipment.ShipmentDate)} ·{' '}
              {shipment.TotalQuantity ?? 0} adet
              {shipment.CustomerName ? ` · ${shipment.CustomerName}` : ''}
              {shipment.SiteName ? ` / ${shipment.SiteName}` : ''}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="delivery-at">
                  Teslim tarihi ve saati *
                </label>
                <input
                  id="delivery-at"
                  type="datetime-local"
                  className="input w-full"
                  value={deliveredAt}
                  max={toDateTimeLocalValue(new Date())}
                  onChange={(e) => {
                    setDeliveredAt(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="delivery-receiver">
                  Teslim alan *
                </label>
                <input
                  id="delivery-receiver"
                  className="input w-full"
                  value={receiverName}
                  onChange={(e) => {
                    setReceiverName(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Ad soyad"
                  maxLength={150}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="delivery-title">
                  Görevi / unvanı
                </label>
                <input
                  id="delivery-title"
                  className="input w-full"
                  value={receiverTitle}
                  onChange={(e) => setReceiverTitle(e.target.value)}
                  placeholder="Örn. şantiye şefi, formen"
                  maxLength={100}
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="delivery-notes">
                  Not
                </label>
                <input
                  id="delivery-notes"
                  className="input w-full"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Örn. eksik/fazla teslim, gecikme sebebi"
                  maxLength={1000}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </form>

          <div className="px-4 pb-4">
            <AttachmentsPanel
              entityType="SHIPMENT"
              entityId={shipment.ShipmentId}
              categories={['SIGNED_WAYBILL', 'DELIVERY_PHOTO', 'OTHER']}
              title="İmzalı irsaliye ve fotoğraflar"
              onItemsChange={(items) => {
                setHasSignedWaybill(items.some((a) => a.Category === 'SIGNED_WAYBILL'));
                onAttachmentsChanged?.(items);
              }}
            />
            {!hasSignedWaybill && (
              <p className="mt-2 text-xs text-amber-300 flex items-start gap-1.5">
                <WarningIcon size={14} className="mt-px shrink-0" />
                İmzalı irsaliye eklenmedi. Teslimi yine de onaylayabilirsiniz; fiş "irsaliye yok" olarak işaretlenir ve
                Sevkiyatlar sayfasındaki "İmzalı irsaliye eksik" filtresinde görünür.
              </p>
            )}
          </div>
        </div>

        {error && <p className="px-4 pb-2 text-sm text-red-400">{error}</p>}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-background-border">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
            Vazgeç
          </button>
          <button type="submit" form="confirm-delivery-form" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Kaydediliyor...' : isEdit ? 'Güncelle' : 'Teslimi onayla'}
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

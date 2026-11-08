import { useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '@phosphor-icons/react';
import { usePortalTarget } from '../tabs/TabContext';
import type { Shipment, ShipmentMutationResult } from '../../models';
import { shipmentService } from '../../services/shipmentService';
import { toast } from '../../hooks/useToast';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatDate } from '../../utils/formatters';

interface CancelShipmentModalProps {
  shipment: Shipment;
  onClose: () => void;
  onCancelled: (result: ShipmentMutationResult) => void;
}

/**
 * Sevkiyat fişi iptali (gerekçe zorunlu). Fiş silinmez; stok etkisi tersine çevrilir ve
 * kira tahakkuku yeniden hesaplanır. Düzeltme için iptal edip yeni fiş kesilir.
 */
export default function CancelShipmentModal({ shipment, onClose, onCancelled }: CancelShipmentModalProps) {
  const portalTarget = usePortalTarget();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (reason.trim().length < 3) {
      setError('İptal gerekçesi en az 3 karakter olmalıdır.');
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      const result = await shipmentService.cancelAsync(shipment.ShipmentId, reason.trim());
      toast.success(`${shipment.ShipmentNo} iptal edildi.`);
      if (result.warnings?.length) toast.warning(result.warnings.join('\n'));
      onCancelled(result);
    } catch (err) {
      setError(getApiErrorMessage(err) || 'Sevkiyat fişi iptal edilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black bg-opacity-50 p-4 animate-in fade-in duration-200">
      <div
        className="bg-background-panel rounded-panel shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-shipment-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-background-border">
          <h2 id="cancel-shipment-title" className="text-lg font-semibold text-text-primary">
            Sevkiyat fişini iptal et
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
        <form id="cancel-shipment-form" onSubmit={handleSubmit} className="p-4 space-y-3">
          <p className="text-sm text-text-secondary">
            <span className="font-medium text-text-primary">{shipment.ShipmentNo}</span> ({formatDate(shipment.ShipmentDate)},{' '}
            {shipment.TotalQuantity ?? 0} adet) iptal edilecek. Malzeme depoya geri alınır ve bu partinin kirası silinir.
            Fiş kayıtlarda “iptal” olarak kalır.
          </p>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="cancel-shipment-reason">
              İptal gerekçesi *
            </label>
            <textarea
              id="cancel-shipment-reason"
              className="input w-full min-h-[72px]"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Örn. yanlış miktar girildi, araç değişti"
              maxLength={500}
              disabled={isSubmitting}
              required
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
        <div className="flex items-center justify-end gap-3 p-4 border-t border-background-border">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
            Vazgeç
          </button>
          <button type="submit" form="cancel-shipment-form" className="btn-danger" disabled={isSubmitting}>
            {isSubmitting ? 'İptal ediliyor...' : 'Fişi iptal et'}
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

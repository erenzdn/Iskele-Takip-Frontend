import { useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '@phosphor-icons/react';
import { usePortalTarget } from '../tabs/TabContext';
import type { ReturnSlip, ReturnSlipMutationResult } from '../../models';
import { returnSlipService } from '../../services/returnSlipService';
import { toast } from '../../hooks/useToast';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatDate } from '../../utils/formatters';

interface CancelReturnSlipModalProps {
  slip: ReturnSlip;
  onClose: () => void;
  onCancelled: (result: ReturnSlipMutationResult) => void;
}

/**
 * İade fişi iptali (gerekçe zorunlu): bağlı iade kayıtları silinir, sağlam dönen malzeme depodan,
 * satışa çevrilen malzeme stoktan geri alınır ve malzeme yeniden "sahada" sayılır.
 */
export default function CancelReturnSlipModal({ slip, onClose, onCancelled }: CancelReturnSlipModalProps) {
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
      const result = await returnSlipService.cancelAsync(slip.ReturnSlipId, reason.trim());
      toast.success(`${slip.ReturnSlipNo} iptal edildi.`);
      if (result.warnings?.length) toast.warning(result.warnings.join('\n'));
      onCancelled(result);
    } catch (err) {
      setError(getApiErrorMessage(err) || 'İade fişi iptal edilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const charged = slip.DamagedQuantity + slip.LostQuantity + slip.SoldQuantity;

  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black bg-opacity-50 p-4 animate-in fade-in duration-200">
      <div
        className="bg-background-panel rounded-panel shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-return-slip-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-background-border">
          <h2 id="cancel-return-slip-title" className="text-lg font-semibold text-text-primary">
            İade fişini iptal et
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
        <form id="cancel-return-slip-form" onSubmit={handleSubmit} className="p-4 space-y-3">
          <p className="text-sm text-text-secondary">
            <span className="font-medium text-text-primary">{slip.ReturnSlipNo}</span> ({formatDate(slip.ReturnDate)}) iptal
            edilecek. Fişteki {slip.TotalQuantity} adet yeniden <b>sahada</b> sayılır ve kirası devam eder:
          </p>
          <ul className="text-sm text-text-secondary list-disc pl-5 space-y-0.5">
            {slip.SoundQuantity > 0 && (
              <li>
                {slip.SoundQuantity} sağlam adet {slip.WarehouseName ? `${slip.WarehouseName} deposundan` : 'depodan'} düşülür
                (depoda yoksa iptal reddedilir).
              </li>
            )}
            {charged > 0 && <li>{charged} adetlik satış (hasarlı/kayıp) ve bedeli sözleşmeden kaldırılır.</li>}
            <li>Sözleşme tamamlanmışsa yeniden açılır.</li>
          </ul>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="cancel-return-slip-reason">
              İptal gerekçesi *
            </label>
            <textarea
              id="cancel-return-slip-reason"
              className="input w-full min-h-[72px]"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Örn. yanlış sözleşmeye girildi, sayım hatası"
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
          <button type="submit" form="cancel-return-slip-form" className="btn-danger" disabled={isSubmitting}>
            {isSubmitting ? 'İptal ediliyor...' : 'Fişi iptal et'}
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

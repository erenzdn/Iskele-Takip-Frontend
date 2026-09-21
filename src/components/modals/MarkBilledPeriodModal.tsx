import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '@phosphor-icons/react';
import type { BillingPeriod, CurrencyCode } from '../../models';
import { contractService } from '../../services/contractService';
import { toast } from '../../hooks/useToast';
import { getApiErrorMessage } from '../../utils/apiError';
import {
  buildMarkBilledPeriodBody,
  formatBilledAmountInputDefault,
  validateBilledAmountInput,
  parseBilledAmountInput,
} from '../../utils/billingPlan';
import { formatDate, formatMoney } from '../../utils/formatters';

interface MarkBilledPeriodModalProps {
  contractId: number;
  period: BillingPeriod;
  currency: CurrencyCode;
  onClose: () => void;
  onSuccess: () => void;
}

export default function MarkBilledPeriodModal({
  contractId,
  period,
  currency,
  onClose,
  onSuccess,
}: MarkBilledPeriodModalProps) {
  const [billedAmountStr, setBilledAmountStr] = useState(() =>
    formatBilledAmountInputDefault(period.accrualNetTotal)
  );
  const [notes, setNotes] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setBilledAmountStr(formatBilledAmountInputDefault(period.accrualNetTotal));
    setNotes('');
    setFieldError(null);
  }, [period.periodStart, period.accrualNetTotal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const amountError = validateBilledAmountInput(billedAmountStr);
    if (amountError) {
      setFieldError(amountError);
      return;
    }
    const parsed = parseBilledAmountInput(billedAmountStr);
    if (parsed == null) {
      setFieldError('Faturalanan tutar 0 veya daha büyük bir sayı olmalıdır');
      return;
    }

    try {
      setIsSubmitting(true);
      setFieldError(null);
      await contractService.markBilledPeriodAsync(
        contractId,
        buildMarkBilledPeriodBody(period, parsed, notes)
      );
      toast.success('Dönem faturalandı olarak işaretlendi.');
      onSuccess();
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status === 409) {
        toast.error(
          getApiErrorMessage(error) || 'Bu dönem zaten faturalandı olarak işaretlenmiş.'
        );
        onSuccess();
        return;
      }
      toast.error(getApiErrorMessage(error) || 'İşaretleme kaydedilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const periodLabel = `${formatDate(period.periodStart)} – ${formatDate(period.periodEnd)}`;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-50 p-4 animate-in fade-in duration-200">
      <div
        className="bg-background-panel rounded-panel shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mark-billed-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-background-border">
          <h2 id="mark-billed-title" className="text-lg font-semibold text-text-primary">
            Faturalandı olarak işaretle
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

        <form id="mark-billed-form" onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Dönem</label>
            <input type="text" className="input w-full" value={periodLabel} readOnly disabled />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="billed-amount-input">
              Faturalanan tutar
            </label>
            <input
              id="billed-amount-input"
              type="text"
              inputMode="decimal"
              className="input w-full"
              value={billedAmountStr}
              onChange={(e) => {
                setBilledAmountStr(e.target.value);
                if (fieldError) setFieldError(null);
              }}
              disabled={isSubmitting}
              required
            />
            <p className="text-xs text-text-secondary mt-1">
              Kesilmesi gereken net tutar: {formatMoney(period.accrualNetTotal, currency)}
            </p>
            {fieldError && <p className="text-xs text-red-400 mt-1">{fieldError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="billed-notes-input">
              Not (opsiyonel)
            </label>
            <textarea
              id="billed-notes-input"
              className="input w-full min-h-[72px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Fatura no: ..."
              disabled={isSubmitting}
            />
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-background-border">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
            Vazgeç
          </button>
          <button
            type="submit"
            form="mark-billed-form"
            className="btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

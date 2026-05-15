import { useEffect, useState } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { firstValidationError, normalizeText, validateNumber, validateRequired } from '../../utils/validation';
import { toast } from '../../hooks/useToast';

interface ManualLineItemModalProps {
  open: boolean;
  mode: 'quote' | 'contract';
  currency: 'TRY' | 'EUR' | 'USD';
  onClose: () => void;
  onAdd: (data: { Description: string; Quantity: number; DailyPrice: number }) => void;
}

export default function ManualLineItemModal({
  open,
  mode,
  currency,
  onClose,
  onAdd,
}: ManualLineItemModalProps) {
  const [description, setDescription] = useState('');
  const [quantityStr, setQuantityStr] = useState('1');
  const [dailyPriceStr, setDailyPriceStr] = useState('0');

  useEffect(() => {
    if (!open) return;
    setDescription('');
    setQuantityStr('1');
    setDailyPriceStr('0');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const qty = Math.max(1, parseInt(quantityStr, 10) || 1);
  const price = Math.max(0, parseFloat(dailyPriceStr) || 0);
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : '₺';

  const submit = () => {
    const validationError = firstValidationError([
      validateRequired(description, 'Açıklama'),
      validateNumber(quantityStr, mode === 'quote' ? 'Miktar' : 'Adet', { min: 1 }),
      validateNumber(dailyPriceStr, mode === 'quote' ? 'Birim fiyat' : 'Günlük fiyat', { min: 0 }),
    ]);
    if (validationError) {
      toast.warning(validationError);
      return;
    }
    onAdd({ Description: normalizeText(description), Quantity: qty, DailyPrice: price });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80]" aria-modal="true" role="dialog">
      <div className="bg-background-panel rounded-xl w-[95vw] max-w-xl shadow-2xl border border-background-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-background-border shrink-0 bg-background-secondary/50">
          <h2 className="text-lg font-semibold text-text-primary">
            {mode === 'quote' ? 'Manuel Kalem Ekle (Teklif)' : 'Manuel Kalem Ekle (Sözleşme)'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
            aria-label="Kapat"
          >
            <XIcon size={22} weight="regular" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Açıklama *</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input w-full"
              placeholder="Örn: Nakliye / Hizmet bedeli"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                {mode === 'quote' ? 'Miktar *' : 'Adet *'}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={quantityStr}
                onChange={(e) => setQuantityStr(e.target.value.replace(/[^0-9]/g, '') || '')}
                className="input w-full"
                placeholder="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                {mode === 'quote' ? `Birim Fiyat (${symbol}) *` : `Günlük Fiyat (${symbol}) *`}
              </label>
              <input
                type="number"
                value={dailyPriceStr}
                onChange={(e) => setDailyPriceStr(e.target.value)}
                className="input w-full"
                min={0}
                step={0.01}
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              İptal
            </button>
            <button type="button" onClick={submit} className="btn-primary flex-1">
              Ekle
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


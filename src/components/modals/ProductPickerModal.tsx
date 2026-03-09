import { useEffect, useRef, useState } from 'react';
import { CheckCircleIcon, XIcon } from '@phosphor-icons/react';
import { Inventory } from '../../models';
import ItemPickerPanel, { ItemDisplayMode } from '../ItemPickerPanel';

interface ProductPickerModalProps {
  open: boolean;
  onClose: () => void;
  items: Inventory[];
  /** Ürün ve miktar ile listeye ekleme. Miktar sadece 1 değil, kullanıcının girdiği değer kullanılır. */
  onItemSelect: (item: Inventory, quantity: number) => void;
  displayMode?: ItemDisplayMode;
}

export default function ProductPickerModal({
  open,
  onClose,
  items,
  onItemSelect,
  displayMode = 'contract',
}: ProductPickerModalProps) {
  const [selectedForPreview, setSelectedForPreview] = useState<Inventory | null>(null);
  const [quantityStr, setQuantityStr] = useState('1');
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const addedMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setSelectedForPreview(null);
      setQuantityStr('1');
    }
  }, [open]);

  const handleRowClick = (item: Inventory) => {
    setSelectedForPreview(item);
  };

  const handleAddToList = () => {
    if (!selectedForPreview) return;
    const qty = Math.max(1, parseInt(quantityStr, 10) || 1);
    onItemSelect(selectedForPreview, qty);
    setQuantityStr('1');
    if (addedMessageTimeoutRef.current) clearTimeout(addedMessageTimeoutRef.current);
    setAddedMessage(`${selectedForPreview.ItemName}${qty > 1 ? ` (${qty} adet)` : ''} eklendi`);
    addedMessageTimeoutRef.current = setTimeout(() => {
      setAddedMessage(null);
      addedMessageTimeoutRef.current = null;
    }, 2200);
  };

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setQuantityStr(raw || '');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" aria-modal="true" role="dialog">
      <div className="bg-background-panel rounded-xl w-[95vw] max-w-6xl h-[90vh] flex flex-col shadow-2xl border border-background-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-background-border shrink-0 bg-background-secondary/50">
          <h2 className="text-lg font-semibold text-text-primary">Ürün Seçimi</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
            aria-label="Kapat"
          >
            <XIcon size={22} weight="regular" />
          </button>
        </div>
        <div className="flex-1 min-h-0 p-4 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-background-border bg-background-panel">
            <ItemPickerPanel
              items={items}
              onItemSelect={handleRowClick}
              displayMode={displayMode}
              className="h-full"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-background-border shrink-0 bg-background-secondary/30 flex flex-wrap items-end gap-4">
          {addedMessage && (
            <div className="w-full flex justify-center mb-1" role="status" aria-live="polite">
              <span className="inline-flex items-center gap-1.5 text-sm text-green-400 bg-green-500/15 border border-green-500/30 rounded-full px-3 py-1.5">
                <CheckCircleIcon size={18} weight="fill" className="shrink-0" aria-hidden />
                {addedMessage}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Ürün / Hizmet Bilgileri</div>
            {selectedForPreview ? (
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="text-sm">
                  <span className="font-medium text-text-primary">{selectedForPreview.ItemCode ?? '—'}</span>
                  <span className="text-text-secondary ml-2">{selectedForPreview.ItemName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-text-secondary whitespace-nowrap">Miktar</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={quantityStr}
                    onChange={handleQuantityChange}
                    className="input w-20 text-center py-2"
                    placeholder="1"
                    aria-label="Miktar"
                  />
                  <button
                    type="button"
                    onClick={handleAddToList}
                    className="btn-primary py-2 px-4"
                  >
                    Listeye Ekle
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-text-secondary">Listeden bir ürün seçin, miktarı girin ve &quot;Listeye Ekle&quot;ye tıklayın.</div>
            )}
          </div>
          <button type="button" onClick={onClose} className="btn-secondary py-2 px-4">
            Kapat (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}

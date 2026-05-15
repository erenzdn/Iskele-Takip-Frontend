import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '@phosphor-icons/react';
import { InventoryContractLineItem, Inventory } from '../../models';
import { contractService } from '../../services/contractService';
import { inventoryService } from '../../services/inventoryService';
import { toast } from '../../hooks/useToast';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatMoney } from '../../utils/formatters';

interface SettleNonReturnModalProps {
  contractId: number;
  item: InventoryContractLineItem;
  remainingOnRent: number;
  currency: 'TRY' | 'EUR' | 'USD';
  onClose: () => void;
  onSuccess: () => void;
}

const SETTLEMENT_REASONS: Array<{ label: string; value: 'SALE' | 'DEFECT' }> = [
  { label: 'Satış - SALE', value: 'SALE' },
  { label: 'Hurda / Defo - DEFECT', value: 'DEFECT' },
];

export default function SettleNonReturnModal({
  contractId,
  item,
  remainingOnRent,
  currency,
  onClose,
  onSuccess,
}: SettleNonReturnModalProps) {
  const [quantity, setQuantity] = useState<string>('1');
  const [reason, setReason] = useState<'SALE' | 'DEFECT'>('SALE');
  const [priceBasis, setPriceBasis] = useState<'TRY' | 'USD' | 'EUR'>(currency);
  const [chargeOverride, setChargeOverride] = useState<string>('');
  const [inventoryItem, setInventoryItem] = useState<Inventory | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchInventory = async () => {
      try {
        setIsLoading(true);
        const data = await inventoryService.getByIdAsync(item.ItemId);
        if (active) setInventoryItem(data);
      } catch (error) {
        console.error('Failed to fetch inventory item details:', error);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    fetchInventory();
    return () => { active = false; };
  }, [item.ItemId]);

  const unitPrice = useMemo(() => {
    if (!inventoryItem) return 0;
    if (priceBasis === 'EUR') return inventoryItem.UnitPriceEur ?? 0;
    if (priceBasis === 'USD') return inventoryItem.UnitPriceUsd ?? 0;
    return inventoryItem.UnitPrice ?? 0;
  }, [inventoryItem, priceBasis]);

  const calculatedTotal = useMemo(() => {
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) return 0;
    return unitPrice * qty;
  }, [unitPrice, quantity]);

  const isDifferentCurrency = priceBasis !== currency;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0 || qty > remainingOnRent) {
      toast.warning('Geçerli bir miktar girin.');
      return;
    }

    if (isDifferentCurrency && !chargeOverride.trim()) {
      toast.warning(`Sözleşme para birimi ${currency} olduğu için, ${priceBasis} bazlı bu işlemin sözleşmeye yansıtılacak ${currency} tutarını (Override) girmelisiniz.`);
      return;
    }

    let overrideValue: number | string | undefined = undefined;
    if (chargeOverride.trim()) {
      const parsedCharge = parseFloat(chargeOverride.replace(',', '.'));
      if (!isNaN(parsedCharge) && parsedCharge >= 0) {
        overrideValue = parsedCharge;
      } else {
        overrideValue = chargeOverride.trim();
      }
    }

    try {
      setIsSubmitting(true);
      await contractService.settleNonReturnAsync(contractId, {
        itemId: item.ItemId,
        warehouseId: item.WarehouseId,
        returnQuantity: qty,
        settlementReason: reason,
        priceBasis: priceBasis,
        settlementChargeOverride: overrideValue,
      });
      toast.success('Sanal iade işlemi başarıyla tamamlandı.');
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error) || 'Sanal iade işlemi başarısız oldu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4 animate-in fade-in duration-200">
      <div className="bg-background-panel rounded-panel shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-background-border">
          <h2 className="text-lg font-semibold text-text-primary">Zayi / Satış (Sanal İade)</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-background-secondary rounded-lg transition-colors text-text-secondary hover:text-text-primary"
            disabled={isSubmitting || isLoading}
          >
            <XIcon size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto">
          <div className="mb-4 bg-background-surface border border-background-border p-3 rounded-lg text-sm text-text-secondary">
            <span className="block font-medium text-text-primary mb-1">{item.ItemName}</span>
            Bu ürün için fiziksel olmayan (stoktan düşülecek) bir iade/kesinti işlemi yapıyorsunuz. Kirada bekleyen: <strong className="text-text-primary">{remainingOnRent} adet</strong>
          </div>

          <form id="settle-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">İşlem Miktarı</label>
              <input
                type="number"
                className="input w-full"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="1"
                max={remainingOnRent}
                required
                disabled={isSubmitting || isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">İşlem Nedeni</label>
              <select
                className="input w-full"
                value={reason}
                onChange={(e) => setReason(e.target.value as 'SALE' | 'DEFECT')}
                disabled={isSubmitting || isLoading}
              >
                {SETTLEMENT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">İşlem Para Birimi</label>
              <select
                className="input w-full"
                value={priceBasis}
                onChange={(e) => setPriceBasis(e.target.value as 'TRY' | 'USD' | 'EUR')}
                disabled={isSubmitting || isLoading}
              >
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>

            <div className="bg-background-secondary p-3 rounded-lg border border-background-border">
              <span className="text-xs font-semibold text-text-secondary block mb-1">Birim Fiyat Önizlemesi</span>
              <div className="text-sm">
                Envanter Fiyatı: <strong className="text-text-primary">{formatMoney(unitPrice, priceBasis)}</strong>
              </div>
              <div className="text-sm font-medium text-green-400 mt-1">
                Ara Toplam: {quantity || 0} × {formatMoney(unitPrice, priceBasis)} = {formatMoney(calculatedTotal, priceBasis)}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Sözleşmeye Yansıtılacak Tutar ({currency}) {isDifferentCurrency ? '*' : '(Opsiyonel)'}
              </label>
              <input
                type="number"
                step="0.01"
                className="input w-full"
                value={chargeOverride}
                onChange={(e) => setChargeOverride(e.target.value)}
                placeholder={isDifferentCurrency ? `Zorunlu tutar (${currency})...` : `Varsayılan: ${formatMoney(calculatedTotal, currency)}`}
                required={isDifferentCurrency}
                disabled={isSubmitting || isLoading}
              />
              {isDifferentCurrency ? (
                <p className="text-xs text-amber-400 mt-1">
                  Sözleşme para birimi {currency} olduğu için, {priceBasis} bazlı bu satışın sözleşmeye yansıtılacak {currency} tutarını (Override) girmelisiniz.
                </p>
              ) : (
                <p className="text-xs text-text-secondary mt-1">
                  Boş bırakılırsa envanter değeri ({formatMoney(calculatedTotal, currency)}) sözleşmeye kesinti olarak yansıtılacaktır. Farklı bir bedel girmek isterseniz belirtebilirsiniz.
                </p>
              )}
            </div>
          </form>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-background-border">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            disabled={isSubmitting || isLoading}
          >
            İptal
          </button>
          <button
            type="submit"
            form="settle-form"
            className="btn-danger"
            disabled={isSubmitting || isLoading}
          >
            {isSubmitting ? 'İşleniyor...' : 'Sanal İadeyi Onayla'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

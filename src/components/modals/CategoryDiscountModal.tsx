import { useState } from 'react';
import { XIcon, PercentIcon } from '@phosphor-icons/react';
import { MaterialCategory } from '../../models';
import { inventoryService } from '../../services/inventoryService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toast } from '../../hooks/useToast';

interface CategoryDiscountModalProps {
  category: MaterialCategory;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CategoryDiscountModal({
  category,
  onClose,
  onSuccess,
}: CategoryDiscountModalProps) {
  const [discountRate, setDiscountRate] = useState<number | ''>('');
  const [type, setType] = useState<'sales' | 'rental'>('sales');
  const [isBusy, setIsBusy] = useState(false);

  const handleApply = async () => {
    if (discountRate === '') {
      toast.warning('Lütfen bir indirim oranı giriniz.');
      return;
    }
    const rate = Number(discountRate);
    if (rate < 0 || rate > 100) {
      toast.warning('İndirim oranı 0 ile 100 arasında olmalıdır.');
      return;
    }

    try {
      setIsBusy(true);
      const response = await inventoryService.applyDiscountAsync(category.CategoryId, {
        discountRate: rate,
        type,
      });
      toast.success(response.message || `${response.updatedCount} ürün güncellendi.`);
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Apply discount error:', error);
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background-panel border border-background-border rounded-lg shadow-lg max-w-md w-full overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-background-border">
          <h2 className="text-lg font-bold text-text-primary">
            [{category.CategoryName}] Kategorisine İndirim Uygula
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-background-hover text-text-primary"
            aria-label="Kapat"
          >
            <XIcon size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1 text-text-secondary">İndirim Oranı (%)</label>
            <div className="relative">
              <input
                type="number"
                value={discountRate}
                onChange={(e) => setDiscountRate(e.target.value === '' ? '' : Number(e.target.value))}
                min="0"
                max="100"
                step="0.01"
                className="input w-full pr-8"
                placeholder="Örn: 15"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary pointer-events-none">%</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1 text-text-secondary">Uygulanacak Fiyat Türü</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="discountType"
                  value="sales"
                  checked={type === 'sales'}
                  onChange={() => setType('sales')}
                  className="radio"
                />
                <span className="text-sm text-text-primary">Satış Fiyatları</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="discountType"
                  value="rental"
                  checked={type === 'rental'}
                  onChange={() => setType('rental')}
                  className="radio"
                />
                <span className="text-sm text-text-primary">Kiralama Fiyatları</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-background-border bg-background-secondary/20">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            disabled={isBusy}
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="btn-primary flex items-center gap-2"
            disabled={isBusy}
          >
            <PercentIcon size={16} />
            {isBusy ? 'Uygulanıyor...' : 'İndirimi Uygula'}
          </button>
        </div>
      </div>
    </div>
  );
}

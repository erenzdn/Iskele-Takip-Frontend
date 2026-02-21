import { useState, useEffect } from 'react';
import { PriceTier, Inventory } from '../../models';
import { priceTierService } from '../../services/priceTierService';
import ConfirmModal from './ConfirmModal';

interface PriceTierDetailModalProps {
  tier: PriceTier | null;
  inventoryItems: Inventory[];
  isNew: boolean;
  onClose: () => void;
}

export default function PriceTierDetailModal({
  tier,
  inventoryItems,
  isNew,
  onClose,
}: PriceTierDetailModalProps) {
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  const [minDays, setMinDays] = useState<number | ''>(1);
  const [maxDays, setMaxDays] = useState<number | ''>(30);
  const [priceMultiplier, setPriceMultiplier] = useState<number | ''>(1.0);
  const [isBusy, setIsBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (tier) {
      setSelectedItemId(tier.ItemId);
      setMinDays(tier.MinDays);
      setMaxDays(tier.MaxDays);
      setPriceMultiplier(tier.PriceMultiplier);
    }
  }, [tier]);

  const handleSave = async () => {
    if (!selectedItemId) {
      alert('Malzeme seçimi zorunludur');
      return;
    }

    if (Number(minDays) > Number(maxDays)) {
      alert('Minimum gün maksimum günden büyük olamaz');
      return;
    }

    try {
      setIsBusy(true);
      if (isNew) {
        await priceTierService.createAsync({
          ItemId: Number(selectedItemId),
          MinDays: Number(minDays),
          MaxDays: Number(maxDays),
          PriceMultiplier: Number(priceMultiplier),
        });
      } else if (tier) {
        await priceTierService.updateAsync(tier.TierId, {
          ItemId: Number(selectedItemId),
          MinDays: Number(minDays),
          MaxDays: Number(maxDays),
          PriceMultiplier: Number(priceMultiplier),
        });
      }
      onClose();
    } catch (error) {
      console.error('Save price tier error:', error);
      alert('Kaydetme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteClick = () => {
    if (!tier) return;
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!tier) return;
    try {
      setIsBusy(true);
      await priceTierService.deleteAsync(tier.TierId);
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      console.error('Delete price tier error:', error);
      alert('Silme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-background-panel rounded-panel w-full max-w-md p-6">
        <h2 className="text-2xl font-bold mb-6">
          {isNew ? 'Yeni Fiyat Tarifesi' : 'Fiyat Tarifesi Detayı'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Malzeme Seçimi *</label>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(Number(e.target.value) || '')}
              className="input w-full"
              required
            >
              <option value="">Malzeme seçin</option>
              {inventoryItems.map((item) => (
                <option key={item.ItemId} value={item.ItemId}>
                  {item.ItemName} (₺{item.DailyPrice.toFixed(2)}/gün)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Minimum Gün</label>
              <input
                type="number"
                value={minDays}
                onChange={(e) => setMinDays(e.target.value === '' ? '' : Number(e.target.value))}
                min="1"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Maksimum Gün</label>
              <input
                type="number"
                value={maxDays}
                onChange={(e) => setMaxDays(e.target.value === '' ? '' : Number(e.target.value))}
                min="1"
                className="input w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Fiyat Çarpanı *</label>
            <input
              type="number"
              value={priceMultiplier}
              onChange={(e) => setPriceMultiplier(e.target.value === '' ? '' : Number(e.target.value))}
              min="0.1"
              max="10"
              step="0.1"
              className="input w-full"
            />
          </div>

          <div className="card bg-blue-900 p-4">
            <div className="font-semibold mb-2">ℹ️ Fiyat Çarpanı Nasıl Çalışır?</div>
            <div className="text-sm opacity-90 mb-2">
              Kiralama süresi bu aralığa düştüğünde, günlük fiyat bu çarpan ile çarpılır.
            </div>
            <div className="text-xs opacity-75">
              1.0 = Normal fiyat, 0.8 = %20 indirim, 1.2 = %20 zam
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          {!isNew && tier && (
            <button
              onClick={handleDeleteClick}
              disabled={isBusy}
              className="btn-danger flex-1"
            >
              Sil
            </button>
          )}
          <button onClick={onClose} className="btn-secondary flex-1">
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={isBusy}
            className="btn-primary flex-1"
          >
            {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
      <ConfirmModal
        open={showDeleteConfirm}
        title="Onaylıyor musunuz?"
        message="Bu tarifeyi silmek istediğinizden emin misiniz?"
        variant="danger"
        loading={isBusy}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}


import { useState } from 'react';
import { inventoryService } from '../../services/inventoryService';

interface CategoryDetailModalProps {
  onClose: () => void;
}

export default function CategoryDetailModal({ onClose }: CategoryDetailModalProps) {
  const [categoryName, setCategoryName] = useState('');
  const [rentalUnit, setRentalUnit] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const handleSave = async () => {
    if (!categoryName.trim()) {
      alert('Kategori adı zorunludur');
      return;
    }

    try {
      setIsBusy(true);
      await inventoryService.createCategoryAsync({
        CategoryName: categoryName,
        RentalUnit: rentalUnit || undefined,
      });
      onClose();
    } catch (error) {
      console.error('Save category error:', error);
      alert('Kaydetme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-background-panel rounded-panel w-full max-w-md p-6">
        <h2 className="text-2xl font-bold mb-6">Yeni Kategori</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Kategori Adı *</label>
            <input
              type="text"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="Örn: Cephe İskelesi"
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Kiralama Birimi</label>
            <input
              type="text"
              value={rentalUnit}
              onChange={(e) => setRentalUnit(e.target.value)}
              placeholder="Örn: adet, metre, m²"
              className="input w-full"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
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
    </div>
  );
}


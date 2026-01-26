import { useState, useEffect } from 'react';
import { inventoryService } from '../services/inventoryService';
import { Inventory, MaterialCategory } from '../models';
import EmptyState from '../components/EmptyState';
import InventoryDetailModal from '../components/modals/InventoryDetailModal';
import CategoryDetailModal from '../components/modals/CategoryDetailModal';

export default function InventoryPage() {
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<MaterialCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Inventory | null>(null);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isNewItem, setIsNewItem] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [invData, catData] = await Promise.all([
        inventoryService.getAllAsync(),
        inventoryService.getAllCategoriesAsync(),
      ]);

      // Category bilgilerini inventory'ye ekle (API nested döndürmüyor)
      const categoryMap = new Map<number, typeof catData[0]>();
      catData.forEach((c) => categoryMap.set(c.CategoryId, c));
      const inventoryWithCategories = invData.map((item) => ({
        ...item,
        Category: categoryMap.get(item.CategoryId),
      }));

      setInventory(inventoryWithCategories);
      setCategories(catData);
    } catch (error) {
      console.error('Load inventory error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterByCategory = async () => {
    if (!selectedCategory) {
      loadData();
      return;
    }

    try {
      setLoading(true);
      const data = await inventoryService.getByCategoryAsync(selectedCategory.CategoryId);
      
      // Category bilgisini ekle
      const filteredWithCategory = data.map((item) => ({
        ...item,
        Category: selectedCategory,
      }));
      
      setInventory(filteredWithCategory);
    } catch (error) {
      console.error('Filter error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNewItem = () => {
    setSelectedItem(null);
    setIsNewItem(true);
    setIsItemModalOpen(true);
  };

  const handleAddCategory = () => {
    setIsCategoryModalOpen(true);
  };

  const handleOpenItemDetail = (item: Inventory) => {
    setSelectedItem(item);
    setIsNewItem(false);
    setIsItemModalOpen(true);
  };

  const handleItemModalClose = () => {
    setIsItemModalOpen(false);
    setSelectedItem(null);
    loadData();
  };

  const handleCategoryModalClose = () => {
    setIsCategoryModalOpen(false);
    loadData();
  };

  const formatCurrency = (amount: number) => {
    return `₺${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Envanter</h1>
          <p className="text-text-secondary">Malzeme ve kategori yönetimi</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleAddCategory} className="btn-secondary">
            + Kategori Ekle
          </button>
          <button onClick={handleAddNewItem} className="btn-primary">
            + Yeni Malzeme
          </button>
        </div>
      </div>

      <div className="mb-6 flex gap-4">
        <select
          value={selectedCategory?.CategoryId || ''}
          onChange={(e) => {
            const cat = categories.find((c) => c.CategoryId === Number(e.target.value));
            setSelectedCategory(cat || null);
          }}
          className="input"
        >
          <option value="">Tüm Kategoriler</option>
          {categories.map((cat) => (
            <option key={cat.CategoryId} value={cat.CategoryId}>
              {cat.CategoryName}
            </option>
          ))}
        </select>
        <button onClick={handleFilterByCategory} className="btn-secondary">
          Filtrele
        </button>
        <button onClick={loadData} className="btn-secondary">
          Yenile
        </button>
      </div>

      {inventory.length === 0 ? (
        <EmptyState
          icon="📦"
          title="Henüz envanter kalemi bulunmuyor"
          description="Önce kategori, sonra malzeme ekleyin"
        />
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-background-border">
                  <th className="text-left p-4 font-semibold" style={{ width: '28%' }}>
                    Malzeme Adı
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '15%' }}>
                    Kategori
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '10%' }}>
                    Toplam
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '10%' }}>
                    Kirada
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '10%' }}>
                    Müsait
                  </th>
                  <th className="text-right p-4 font-semibold" style={{ width: '12%' }}>
                    Günlük Fiyat
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '15%' }}>
                    Durum
                  </th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => {
                  const availableStock = item.TotalStock - item.OnRent;
                  const stockPercentage = item.TotalStock > 0 ? (availableStock / item.TotalStock) * 100 : 0;
                  
                  // Stok durumuna göre renk ve etiket
                  let statusBadge;
                  if (availableStock <= 0) {
                    statusBadge = <span className="badge bg-red-600 text-white">Stok Yok</span>;
                  } else if (stockPercentage <= 20) {
                    statusBadge = <span className="badge bg-orange-600 text-white">Kritik</span>;
                  } else if (stockPercentage <= 50) {
                    statusBadge = <span className="badge bg-yellow-600 text-white">Düşük</span>;
                  } else {
                    statusBadge = <span className="badge bg-green-600 text-white">Yeterli</span>;
                  }

                  return (
                    <tr
                      key={item.ItemId}
                      className="border-b border-background-border hover:bg-background-hover cursor-pointer"
                      onClick={() => handleOpenItemDetail(item)}
                    >
                      <td className="p-4">
                        <div className="font-medium">{item.ItemName}</div>
                        <div className="text-sm text-text-secondary">
                          Alış: {formatCurrency(item.PurchasePrice)}
                        </div>
                      </td>
                      <td className="p-4">{item.Category?.CategoryName || '-'}</td>
                      <td className="p-4 text-center">
                        <span className="font-bold text-lg text-blue-400">{item.TotalStock}</span>
                      </td>
                      <td className="p-4 text-center">
                        <span className="text-orange-400 font-medium">{item.OnRent}</span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`font-bold text-lg ${availableStock > 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {availableStock}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-green-500 font-bold">
                          {formatCurrency(item.DailyPrice)}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        {statusBadge}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isItemModalOpen && (
        <InventoryDetailModal
          item={selectedItem}
          categories={categories}
          isNew={isNewItem}
          onClose={handleItemModalClose}
        />
      )}

      {isCategoryModalOpen && (
        <CategoryDetailModal onClose={handleCategoryModalClose} />
      )}
    </div>
  );
}


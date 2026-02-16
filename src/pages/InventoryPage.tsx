import { useState, useEffect } from 'react';
import { inventoryService } from '../services/inventoryService';
import { Inventory, MaterialCategory } from '../models';
import { formatShortDateTime } from '../utils/formatters';
import EmptyState from '../components/EmptyState';
import InventoryDetailModal from '../components/modals/InventoryDetailModal';
import CategoryDetailModal from '../components/modals/CategoryDetailModal';

export default function InventoryPage() {
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [allInventory, setAllInventory] = useState<Inventory[]>([]);
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<MaterialCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Inventory | null>(null);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isNewItem, setIsNewItem] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MaterialCategory | null>(null);
  const [searchText, setSearchText] = useState('');
  const [minAvailable, setMinAvailable] = useState<number | ''>('');
  const [maxAvailable, setMaxAvailable] = useState<number | ''>('');

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

      setAllInventory(inventoryWithCategories);
      setInventory(inventoryWithCategories);
      setCategories(catData);
    } catch (error) {
      console.error('Load inventory error:', error);
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
    setEditingCategory(null);
    setIsCategoryModalOpen(true);
  };

  const handleEditCategory = (cat: MaterialCategory) => {
    setEditingCategory(cat);
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
    setEditingCategory(null);
    loadData();
  };

  const formatCurrency = (amount: number) => {
    return `₺${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const filteredInventory = allInventory.filter((item) => {
    const text = searchText.trim().toLowerCase();
    const name = item.ItemName?.toLowerCase() ?? '';
    const categoryName = item.Category?.CategoryName?.toLowerCase() ?? '';

    const itemCode = item.ItemCode?.toLowerCase() ?? '';
    const matchesText = !text || name.includes(text) || categoryName.includes(text) || itemCode.includes(text);

    const matchesCategory =
      !selectedCategory || item.CategoryId === selectedCategory.CategoryId;

    const availableStock = item.TotalStock - item.OnRent;
    const matchesMin = minAvailable === '' || availableStock >= minAvailable;
    const matchesMax = maxAvailable === '' || availableStock <= maxAvailable;

    return matchesText && matchesCategory && matchesMin && matchesMax;
  });

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

      <div className="mb-6 card p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Arama ve Filtreler</h2>
            <p className="text-sm text-text-secondary">
              Malzemeleri isim, kategori ve müsait stok miktarına göre filtreleyin.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSearchText('');
              setSelectedCategory(null);
              setMinAvailable('');
              setMaxAvailable('');
              setInventory(allInventory);
            }}
            className="btn-secondary"
          >
            Filtreleri Sıfırla
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-end">
          {/* Search */}
          <div className="flex-1">
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Ara
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-3 flex items-center text-text-secondary text-sm">
                  🔍
                </span>
                <input
                  type="text"
                  className="input w-full pl-8"
                  placeholder="Ürün kodu, malzeme adı veya kategori (örn: BRU2M001, İskele)"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Category filter */}
          <div className="w-full lg:w-64">
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Kategori
            </label>
            <div className="flex gap-2">
              <select
                value={selectedCategory?.CategoryId || ''}
                onChange={(e) => {
                  const cat = categories.find((c) => c.CategoryId === Number(e.target.value));
                  setSelectedCategory(cat || null);
                }}
                className="input flex-1"
              >
                <option value="">Tüm Kategoriler</option>
                {categories.map((cat) => (
                  <option key={cat.CategoryId} value={cat.CategoryId}>
                    {cat.CategoryName}
                  </option>
                ))}
              </select>
              {selectedCategory && (
                <button
                  type="button"
                  onClick={() => handleEditCategory(selectedCategory)}
                  className="btn-secondary text-sm px-3"
                  title="Kategoriyi düzenle"
                >
                  Yönet
                </button>
              )}
            </div>
          </div>

          {/* Available stock filter */}
          <div className="w-full lg:w-72 flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Müsait Stok (min)
              </label>
              <input
                type="number"
                className="input w-full"
                min={0}
                value={minAvailable === '' ? '' : minAvailable}
                onChange={(e) => {
                  const value = e.target.value;
                  setMinAvailable(value === '' ? '' : Number(value));
                }}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Müsait Stok (max)
              </label>
              <input
                type="number"
                className="input w-full"
                min={0}
                value={maxAvailable === '' ? '' : maxAvailable}
                onChange={(e) => {
                  const value = e.target.value;
                  setMaxAvailable(value === '' ? '' : Number(value));
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {filteredInventory.length === 0 ? (
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
                  <th className="text-left p-4 font-semibold" style={{ width: '8%' }}>
                    Ürün Kodu
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '17%' }}>
                    Malzeme Adı
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '9%' }}>
                    Kategori
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '6%' }}>
                    Toplam
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '6%' }}>
                    Kirada
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '6%' }}>
                    Müsait
                  </th>
                  <th className="text-right p-4 font-semibold" style={{ width: '9%' }}>
                    Aylık Liste
                  </th>
                  <th className="text-right p-4 font-semibold" style={{ width: '9%' }}>
                    Günlük Efektif
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '12%' }}>
                    Alt Kategoriler
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '8%' }}>
                    Durum
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '10%' }}>
                    Kayıt Bilgisi
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((item) => {
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
                        {item.ItemCode ? (
                          <span className="font-mono text-sm font-medium text-accent bg-accent/10 px-2 py-0.5 rounded">
                            {item.ItemCode}
                          </span>
                        ) : (
                          <span className="text-text-secondary text-sm">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="font-medium">{item.ItemName}</div>
                        <div className="text-sm text-text-secondary">
                          Birim: {item.UnitPrice ? formatCurrency(item.UnitPrice) : formatCurrency(item.PurchasePrice)}
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
                          {item.MonthlyListPrice ? formatCurrency(item.MonthlyListPrice) : '-'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="font-medium text-text-secondary">
                          {item.MonthlyListPrice
                            ? formatCurrency(item.MonthlyListPrice / 30)
                            : item.DailyPrice
                              ? formatCurrency(item.DailyPrice)
                              : '-'}
                        </span>
                      </td>
                      <td className="p-4">
                        {item.SubCategories && item.SubCategories.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.SubCategories.map((sc) => (
                              <span
                                key={sc.SubCategoryId}
                                className="badge bg-purple-600/30 text-purple-300 text-xs"
                              >
                                {sc.SubCategoryName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-text-secondary text-sm">-</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {statusBadge}
                      </td>
                      <td className="p-4 text-sm text-text-secondary">
                        <div>{item.CreatedByUserFullName || item.CreatedByUserName || '-'}</div>
                        <div>{formatShortDateTime(item.CreatedAt)}</div>
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
        <CategoryDetailModal
          category={editingCategory}
          categories={categories}
          onClose={handleCategoryModalClose}
        />
      )}
    </div>
  );
}


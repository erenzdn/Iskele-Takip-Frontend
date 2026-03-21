import { useState, useEffect } from 'react';
import { MagnifyingGlassIcon, PackageIcon } from '@phosphor-icons/react';
import { inventoryService } from '../services/inventoryService';
import { Inventory, MaterialCategory } from '../models';
import { formatShortDateTime } from '../utils/formatters';
import EmptyState from '../components/EmptyState';
import InventoryDetailModal from '../components/modals/InventoryDetailModal';
import CategoryDetailModal from '../components/modals/CategoryDetailModal';

export default function InventoryPage() {
  const [, setInventory] = useState<Inventory[]>([]);
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
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);

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

      setAllInventory(invData);
      setInventory(invData);
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

  const formatEur = (amount: number) => {
    return `€${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const letters = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'.split('');

  const filteredInventory = allInventory.filter((item) => {
    const text = searchText.trim().toLowerCase();
    const name = item.ItemName?.toLowerCase() ?? '';
    const categoryNames =
      item.Categories?.map((c) => c.CategoryName).join(' ').toLowerCase() ?? '';

    const itemCode = item.ItemCode?.toLowerCase() ?? '';
    const matchesText =
      !text || name.includes(text) || categoryNames.includes(text) || itemCode.includes(text);

    const matchesLetter =
      !selectedLetter ||
      item.ItemName?.toLocaleUpperCase('tr-TR').startsWith(selectedLetter.toLocaleUpperCase('tr-TR'));

    const matchesCategory =
      !selectedCategory ||
      item.Categories?.some((c) => c.CategoryId === selectedCategory.CategoryId);

    const availableStock = item.TotalStock - item.OnRent;
    const matchesMin = minAvailable === '' || availableStock >= minAvailable;
    const matchesMax = maxAvailable === '' || availableStock <= maxAvailable;

    return matchesText && matchesCategory && matchesMin && matchesMax && matchesLetter;
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
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Envanter</h1>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="btn-secondary py-2 px-3 text-sm">
            Yenile
          </button>
          <button onClick={handleAddCategory} className="btn-secondary py-2 px-3 text-sm">
            + Kategori Ekle
          </button>
          <button onClick={handleAddNewItem} className="btn-primary py-2 px-3 text-sm">
            + Yeni Malzeme
          </button>
        </div>
      </div>

      <div className="mb-3 rounded-panel border border-background-border bg-gradient-to-r from-[#111827] via-[#020617] to-[#111827] px-3 py-2 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-text-secondary/70">
              Harfe göre filtrele
            </div>
            <div className="text-[11px] text-text-secondary/60">
              Malzeme adının ilk harfine göre hızlı seçim
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedLetter(null)}
              className={`px-2.5 py-1.5 text-[11px] rounded-full border transition-all duration-150 shadow-sm ${
                selectedLetter == null
                  ? 'bg-accent text-white border-accent shadow-[0_0_0_1px_rgba(0,0,0,0.6)]'
                  : 'bg-transparent text-text-secondary border-background-border hover:border-accent/70 hover:text-text-primary'
              }`}
            >
              Tümü
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedLetter(null);
                setSearchText('');
                setSelectedCategory(null);
                setMinAvailable('');
                setMaxAvailable('');
                loadData();
              }}
              className="px-2.5 py-1.5 text-[11px] rounded-full border border-background-border/80 text-text-secondary/80 hover:border-accent/70 hover:text-text-primary hover:bg-background-hover/40 transition-all duration-150"
            >
              Filtreleri Temizle
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {letters.map((letter) => {
            const isActive = selectedLetter === letter;
            return (
              <button
                key={letter}
                type="button"
                onClick={() => setSelectedLetter(letter)}
                className={`w-7 h-7 flex items-center justify-center text-[11px] rounded-full border transition-all duration-150 ${
                  isActive
                    ? 'bg-accent text-white border-accent shadow-[0_0_0_1px_rgba(0,0,0,0.7)] scale-105'
                    : 'bg-[#020617] text-text-secondary/80 border-background-border hover:border-accent/60 hover:text-text-primary hover:bg-background-hover/40'
                }`}
              >
                {letter}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3 rounded border border-background-border bg-background-panel p-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-secondary whitespace-nowrap">Kriterler:</span>
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-text-secondary">
            <MagnifyingGlassIcon size={14} weight="regular" color="currentColor" aria-hidden />
          </span>
          <input
            type="text"
            className="input w-full pl-7 py-2 text-sm"
            placeholder="Ürün kodu, malzeme adı veya kategori..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <select
          value={selectedCategory?.CategoryId || ''}
          onChange={(e) => {
            const cat = categories.find((c) => c.CategoryId === Number(e.target.value));
            setSelectedCategory(cat || null);
          }}
          className="input py-2 px-3 text-sm w-40"
        >
          <option value="">Tüm Kategoriler</option>
          {categories.map((cat) => (
            <option key={cat.CategoryId} value={cat.CategoryId}>
              {cat.CategoryName}
            </option>
          ))}
        </select>
        <input
          type="number"
          className="input py-2 px-3 text-sm w-24"
          min={0}
          placeholder="Min müsait"
          value={minAvailable === '' ? '' : minAvailable}
          onChange={(e) => setMinAvailable(e.target.value === '' ? '' : Number(e.target.value))}
        />
        <input
          type="number"
          className="input py-2 px-3 text-sm w-24"
          min={0}
          placeholder="Max müsait"
          value={maxAvailable === '' ? '' : maxAvailable}
          onChange={(e) => setMaxAvailable(e.target.value === '' ? '' : Number(e.target.value))}
        />
        <button
          type="button"
          onClick={() => {
            setSearchText('');
            setSelectedCategory(null);
            setMinAvailable('');
            setMaxAvailable('');
          }}
          className="btn-secondary py-2 px-3 text-sm"
        >
          Filtreleri Sıfırla
        </button>
        {selectedCategory && (
          <button type="button" onClick={() => handleEditCategory(selectedCategory)} className="btn-secondary py-2 px-3 text-sm" title="Kategoriyi düzenle">
            Yönet
          </button>
        )}
      </div>

      {filteredInventory.length === 0 ? (
        <EmptyState
          icon={<PackageIcon size={48} weight="duotone" />}
          title="Henüz envanter kalemi bulunmuyor"
          description="Önce kategori, sonra malzeme ekleyin"
        />
      ) : (
        <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
          <div className="overflow-auto max-h-[calc(100vh-200px)] min-h-[320px]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 border-b border-background-border">
                <tr>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Ürün Kodu</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Malzeme Adı</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Kategori</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Toplam</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Kirada</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Müsait</th>
                  <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Aylık Liste (₺)</th>
                  <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Günlük Efektif (₺)</th>
                  <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Aylık Liste (€)</th>
                  <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Birim Fiyat (€)</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Alt Kategoriler</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Durum</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">Kayıt Bilgisi</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((item, index) => {
                  const availableStock = item.TotalStock - item.OnRent;
                  const stockPercentage = item.TotalStock > 0 ? (availableStock / item.TotalStock) * 100 : 0;
                  let statusBadge: React.ReactNode;
                  const badgeClass = 'inline-block px-2 py-0.5 rounded text-xs font-medium';
                  if (availableStock <= 0) {
                    statusBadge = <span className={`${badgeClass} bg-red-600 text-white`}>Stok Yok</span>;
                  } else if (stockPercentage <= 20) {
                    statusBadge = <span className={`${badgeClass} bg-orange-600 text-white`}>Kritik</span>;
                  } else if (stockPercentage <= 50) {
                    statusBadge = <span className={`${badgeClass} bg-yellow-600 text-white`}>Düşük</span>;
                  } else {
                    statusBadge = <span className={`${badgeClass} bg-green-600 text-white`}>Yeterli</span>;
                  }
                  return (
                    <tr
                      key={item.ItemId}
                      className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${index % 2 === 0 ? 'bg-background-panel' : 'bg-[#16162e]'}`}
                      onClick={() => handleOpenItemDetail(item)}
                    >
                      <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                        {item.ItemCode ? (
                          <span className="font-mono font-medium text-accent bg-accent/10 px-1 py-0.5 rounded">{item.ItemCode}</span>
                        ) : (
                          <span className="text-text-secondary">-</span>
                        )}
                      </td>
                      <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                        <span className="font-medium text-text-primary">{item.ItemName}</span>
                        <span className="text-text-secondary ml-1">Birim: {item.UnitPrice != null ? formatCurrency(item.UnitPrice) : formatCurrency(item.PurchasePrice ?? 0)}</span>
                      </td>
                      <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                        {item.Categories?.length ? (
                          item.Categories.map((c) => (
                            <span key={c.CategoryId} className="inline-block mr-0.5 mb-0.5 px-1 py-0 rounded bg-blue-600/30 text-blue-300 text-[10px]">
                              {c.CategoryName}
                            </span>
                          ))
                        ) : (
                          <span className="text-text-secondary">-</span>
                        )}
                      </td>
                      <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0"><span className="text-blue-400 font-medium">{item.TotalStock}</span></td>
                      <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0"><span className="text-orange-400">{item.OnRent}</span></td>
                      <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0">
                        <span className={availableStock > 0 ? 'text-green-500 font-medium' : 'text-red-500 font-medium'}>{availableStock}</span>
                      </td>
                      <td className="py-0.5 px-2 text-right align-middle border-r border-background-border/60 last:border-r-0 text-green-500 tabular-nums">
                        {item.MonthlyListPrice != null ? formatCurrency(item.MonthlyListPrice) : '-'}
                      </td>
                      <td className="py-0.5 px-2 text-right align-middle border-r border-background-border/60 last:border-r-0 text-text-secondary tabular-nums">
                        {item.MonthlyListPrice != null ? formatCurrency(item.MonthlyListPrice / 30) : item.DailyPrice != null ? formatCurrency(item.DailyPrice) : '-'}
                      </td>
                      <td className="py-0.5 px-2 text-right align-middle border-r border-background-border/60 last:border-r-0 text-blue-300 tabular-nums">
                        {item.MonthlyListPriceEur != null ? formatEur(item.MonthlyListPriceEur) : '-'}
                      </td>
                      <td className="py-0.5 px-2 text-right align-middle border-r border-background-border/60 last:border-r-0 text-blue-300 tabular-nums">
                        {item.UnitPriceEur != null ? formatEur(item.UnitPriceEur) : '-'}
                      </td>
                      <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                        {item.SubCategories?.length ? item.SubCategories.map((sc) => (
                          <span key={sc.SubCategoryId} className="inline-block mr-0.5 mb-0.5 px-1 py-0 rounded bg-purple-600/30 text-purple-300 text-[10px]">{sc.SubCategoryName}</span>
                        )) : <span className="text-text-secondary">-</span>}
                      </td>
                      <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0">{statusBadge}</td>
                      <td className="py-0.5 px-2 align-middle text-text-secondary border-r border-background-border/60 last:border-r-0">
                        {item.CreatedByUserFullName || item.CreatedByUserName || '-'} • {formatShortDateTime(item.CreatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex items-center justify-between shrink-0">
            <span>Toplam: {filteredInventory.length} kalem</span>
            <span className="text-text-secondary/80">Ekranda yaklaşık 25–40 satır görünür (pencere boyutuna göre)</span>
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


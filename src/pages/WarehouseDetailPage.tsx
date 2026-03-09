import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { Warehouse, WarehouseStock, WarehouseStockResponse } from '../models';
import { warehouseService } from '../services/warehouseService';
import { contractService } from '../services/contractService';

export default function WarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [stock, setStock] = useState<WarehouseStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStock, setLoadingStock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
  const [minQuantity, setMinQuantity] = useState<number | ''>('');
  const [maxQuantity, setMaxQuantity] = useState<number | ''>('');
  const [activeTab, setActiveTab] = useState<'stock' | 'rented'>('stock');
  const [rentedItems, setRentedItems] = useState<{ ItemId: number; ItemName: string; CategoryName: string; Quantity: number }[]>([]);
  const [loadingRented, setLoadingRented] = useState(false);
  const [rentedSearchText, setRentedSearchText] = useState('');
  const [rentedCategoryName, setRentedCategoryName] = useState<string>('all');
  const [rentedMinQty, setRentedMinQty] = useState<number | ''>('');
  const [rentedMaxQty, setRentedMaxQty] = useState<number | ''>('');

  useEffect(() => {
    const warehouseId = Number(id);
    if (!warehouseId || Number.isNaN(warehouseId)) {
      navigate('/warehouses', { replace: true });
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response: WarehouseStockResponse = await warehouseService.getStockAsync(warehouseId);
        setWarehouse(response.warehouse);
        setStock(response.stock);
      } catch (err) {
        console.error('Warehouse detail load error:', err);
        setError('Depo bilgileri yüklenirken bir hata oluştu.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, navigate]);

  useEffect(() => {
    const warehouseId = Number(id);
    if (!warehouseId || Number.isNaN(warehouseId) || activeTab !== 'rented') return;
    const load = async () => {
      try {
        setLoadingRented(true);
        const data = await contractService.getRentedItemsByWarehouseAsync(warehouseId);
        setRentedItems(data);
      } catch (err) {
        console.error('Load rented items error:', err);
        setRentedItems([]);
      } finally {
        setLoadingRented(false);
      }
    };
    load();
  }, [id, activeTab]);

  const handleRefresh = async () => {
    if (!warehouse?.WarehouseId) return;
    try {
      setLoadingStock(true);
      const response: WarehouseStockResponse = await warehouseService.getStockAsync(warehouse.WarehouseId);
      setWarehouse(response.warehouse);
      setStock(response.stock);
    } catch (err) {
      console.error('Warehouse stock refresh error:', err);
      setError('Depo stokları yenilenirken bir hata oluştu.');
    } finally {
      setLoadingStock(false);
    }
  };

  const filteredStock = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    return stock.filter((s) => {
      const name = s.ItemName?.toLowerCase() ?? '';
      const category = s.CategoryName?.toLowerCase() ?? '';
      const matchesText = !text || name.includes(text) || category.includes(text);

      const matchesCategory =
        selectedCategoryId === 'all' || s.CategoryId === selectedCategoryId;

      const quantity = s.Quantity ?? 0;
      const matchesMin = minQuantity === '' || quantity >= minQuantity;
      const matchesMax = maxQuantity === '' || quantity <= maxQuantity;

      return matchesText && matchesCategory && matchesMin && matchesMax;
    });
  }, [stock, searchText, selectedCategoryId, minQuantity, maxQuantity]);

  const categoryOptions = useMemo(() => {
    const map = new Map<number, string | undefined>();
    stock.forEach((s) => {
      if (!map.has(s.CategoryId)) {
        map.set(s.CategoryId, s.CategoryName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({
      id,
      name: name || `Kategori #${id}`,
    }));
  }, [stock]);

  const filteredRentedItems = useMemo(() => {
    const text = rentedSearchText.trim().toLowerCase();
    return rentedItems.filter((r) => {
      const name = r.ItemName?.toLowerCase() ?? '';
      const cat = r.CategoryName?.toLowerCase() ?? '';
      const okText = !text || name.includes(text) || cat.includes(text);
      const okCat = rentedCategoryName === 'all' || (r.CategoryName || '') === rentedCategoryName;
      const okMin = rentedMinQty === '' || r.Quantity >= rentedMinQty;
      const okMax = rentedMaxQty === '' || r.Quantity <= rentedMaxQty;
      return okText && okCat && okMin && okMax;
    });
  }, [rentedItems, rentedSearchText, rentedCategoryName, rentedMinQty, rentedMaxQty]);

  const rentedCategoryOptions = useMemo(() => {
    const set = new Set<string>();
    rentedItems.forEach((r) => {
      const n = r.CategoryName?.trim() || '';
      if (n) set.add(n);
    });
    return Array.from(set).sort();
  }, [rentedItems]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-text-secondary">Depo detayları yükleniyor...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="mb-4 text-red-400">{error}</div>
        <button onClick={() => navigate('/warehouses')} className="btn-secondary">
          Depo listesine dön
        </button>
      </div>
    );
  }

  if (!warehouse) {
    return (
      <div className="p-8">
        <div className="mb-4 text-text-secondary">Depo bulunamadı.</div>
        <button onClick={() => navigate('/warehouses')} className="btn-secondary">
          Depo listesine dön
        </button>
      </div>
    );
  }

  const uniqueItems = warehouse.UniqueItems ?? 0;
  const totalQuantity = warehouse.TotalQuantity ?? 0;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1">{warehouse.WarehouseName}</h1>
          <p className="text-text-secondary">
            Depodaki malzemeleri ve stok durumunu detaylı olarak görüntüleyin.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/warehouses')} className="btn-secondary">
            ← Depo listesine dön
          </button>
          <button onClick={handleRefresh} className="btn-secondary" disabled={loadingStock}>
            {loadingStock ? 'Yenileniyor...' : 'Stokları Yenile'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-sm text-text-secondary mb-1">Adres</div>
          <div className="font-medium">{warehouse.Address || '-'}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-text-secondary mb-1">Ürün Çeşidi</div>
          <div className="text-2xl font-bold text-blue-400">{uniqueItems}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-text-secondary mb-1">Toplam Miktar</div>
          <div className="text-2xl font-bold text-green-500">
            {totalQuantity.toLocaleString('tr-TR')}
          </div>
        </div>
      </div>

      {warehouse.Description && (
        <div className="card p-4">
          <div className="text-sm text-text-secondary mb-1">Açıklama</div>
          <div>{warehouse.Description}</div>
        </div>
      )}

      <div className="card p-4 space-y-4">
        <div className="flex gap-2 border-b border-background-border mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('stock')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'stock'
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Depodaki Malzemeler
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rented')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'rented'
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Kiradaki Ürünler
          </button>
        </div>

        {activeTab === 'rented' && (
          <>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Kiradaki Ürünler</h2>
                <p className="text-sm text-text-secondary">
                  Bu depodan kiraya verilmiş ve henüz iade edilmemiş ürünler. Arama ve filtreleri kullanarak daraltabilirsiniz.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRentedSearchText('');
                  setRentedCategoryName('all');
                  setRentedMinQty('');
                  setRentedMaxQty('');
                }}
                className="btn-secondary"
              >
                Filtreleri Sıfırla
              </button>
            </div>

            {loadingRented ? (
              <div className="text-text-secondary py-6">Yükleniyor...</div>
            ) : rentedItems.length === 0 ? (
              <div className="text-text-secondary text-center py-6">
                Bu depodan kirada ürün bulunmuyor.
              </div>
            ) : (
              <>
                <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-text-secondary mb-1">Ara</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-text-secondary">
                          <MagnifyingGlassIcon size={18} weight="regular" color="currentColor" aria-hidden />
                        </span>
                        <input
                          type="text"
                          className="input w-full pl-8"
                          placeholder="Malzeme veya kategori adı..."
                          value={rentedSearchText}
                          onChange={(e) => setRentedSearchText(e.target.value)}
                        />
                      </div>
                      {rentedSearchText && (
                        <button type="button" onClick={() => setRentedSearchText('')} className="btn-secondary whitespace-nowrap">
                          Temizle
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="w-full lg:w-48">
                    <label className="block text-xs font-medium text-text-secondary mb-1">Kategori</label>
                    <select
                      className="input w-full"
                      value={rentedCategoryName}
                      onChange={(e) => setRentedCategoryName(e.target.value)}
                    >
                      <option value="all">Tüm kategoriler</option>
                      {rentedCategoryOptions.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full lg:w-56 flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-text-secondary mb-1">Kirada (min)</label>
                      <input
                        type="number"
                        className="input w-full"
                        min={0}
                        value={rentedMinQty === '' ? '' : rentedMinQty}
                        onChange={(e) => setRentedMinQty(e.target.value === '' ? '' : Number(e.target.value))}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-text-secondary mb-1">Kirada (max)</label>
                      <input
                        type="number"
                        className="input w-full"
                        min={0}
                        value={rentedMaxQty === '' ? '' : rentedMaxQty}
                        onChange={(e) => setRentedMaxQty(e.target.value === '' ? '' : Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>

                <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
                  <div className="overflow-auto max-h-[320px]">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 z-10 border-b border-background-border">
                        <tr>
                          <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Malzeme</th>
                          <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Kategori</th>
                          <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">Kirada (Miktar)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRentedItems.map((r, idx) => (
                          <tr key={r.ItemId} className={`border-b border-background-border hover:bg-background-hover ${idx % 2 === 0 ? 'bg-background-panel' : 'bg-[#16162e]'}`}>
                            <td className="py-0.5 px-2 align-middle border-r border-background-border/60 font-medium text-text-primary">{r.ItemName}</td>
                            <td className="py-0.5 px-2 align-middle border-r border-background-border/60 text-text-secondary">{r.CategoryName || '-'}</td>
                            <td className="py-0.5 px-2 text-center align-middle"><span className="font-medium text-orange-400">{r.Quantity.toLocaleString('tr-TR')}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary shrink-0">
                    Toplam: {filteredRentedItems.length} çeşit kirada
                  </div>
                  {filteredRentedItems.length === 0 && (
                    <div className="text-text-secondary text-center py-4 text-sm">Arama kriterlerine uygun kirada ürün yok.</div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {activeTab === 'stock' && (
        <>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Depodaki Malzemeler</h2>
              <p className="text-sm text-text-secondary">
                Aşağıdaki arama ve filtreleri kullanarak malzemeleri hızlıca daraltabilirsiniz.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchText('');
                setSelectedCategoryId('all');
                setMinQuantity('');
                setMaxQuantity('');
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
                  <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-text-secondary">
                    <MagnifyingGlassIcon size={18} weight="regular" color="currentColor" aria-hidden />
                  </span>
                  <input
                    type="text"
                    className="input w-full pl-8"
                    placeholder="Malzeme adı veya kategori (örn: İskele, Köşebent)"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                </div>
                {searchText && (
                  <button
                    type="button"
                    onClick={() => setSearchText('')}
                    className="btn-secondary whitespace-nowrap"
                  >
                    Temizle
                  </button>
                )}
              </div>
            </div>

            {/* Category filter */}
            <div className="w-full lg:w-64">
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Kategori
              </label>
              <select
                className="input w-full"
                value={selectedCategoryId === 'all' ? 'all' : String(selectedCategoryId)}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedCategoryId(value === 'all' ? 'all' : Number(value));
                }}
              >
                <option value="all">Tüm kategoriler</option>
                {categoryOptions.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quantity filter */}
            <div className="w-full lg:w-72 flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Miktar (min)
                </label>
                <input
                  type="number"
                  className="input w-full"
                  min={0}
                  value={minQuantity === '' ? '' : minQuantity}
                  onChange={(e) => {
                    const value = e.target.value;
                    setMinQuantity(value === '' ? '' : Number(value));
                  }}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Miktar (max)
                </label>
                <input
                  type="number"
                  className="input w-full"
                  min={0}
                  value={maxQuantity === '' ? '' : maxQuantity}
                  onChange={(e) => {
                    const value = e.target.value;
                    setMaxQuantity(value === '' ? '' : Number(value));
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {activeTab === 'stock' && loadingStock && (
          <div className="text-text-secondary text-sm">Depo stokları güncelleniyor...</div>
        )}

        {activeTab === 'stock' && (filteredStock.length === 0 ? (
          <div className="text-text-secondary text-center py-6">
            {stock.length === 0
              ? 'Bu depoda henüz malzeme bulunmuyor.'
              : 'Arama kriterlerinize uygun malzeme bulunamadı.'}
          </div>
        ) : (
          <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
            <div className="overflow-auto max-h-[calc(100vh-380px)] min-h-[240px]">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10 border-b border-background-border">
                  <tr>
                    <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Malzeme</th>
                    <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Kategori</th>
                    <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">Miktar</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.map((s, idx) => (
                    <tr key={s.StockId} className={`border-b border-background-border hover:bg-background-hover ${idx % 2 === 0 ? 'bg-background-panel' : 'bg-[#16162e]'}`}>
                      <td className="py-0.5 px-2 align-middle border-r border-background-border/60 font-medium text-text-primary">{s.ItemName}</td>
                      <td className="py-0.5 px-2 align-middle border-r border-background-border/60 text-text-secondary">{s.CategoryName || '-'}</td>
                      <td className="py-0.5 px-2 text-center align-middle"><span className="font-medium text-green-500">{s.Quantity.toLocaleString('tr-TR')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex items-center justify-between shrink-0">
              <span>Toplam: {filteredStock.length} çeşit malzeme</span>
              <span className="text-text-secondary/80">Ekranda yaklaşık 25–40 satır görünür</span>
            </div>
          </div>
        ))}
        </>
        )}
      </div>
    </div>
  );
}


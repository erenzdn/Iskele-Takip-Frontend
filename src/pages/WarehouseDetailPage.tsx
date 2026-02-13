import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Warehouse, WarehouseStock, WarehouseStockResponse } from '../models';
import { warehouseService } from '../services/warehouseService';

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
                  <span className="absolute inset-y-0 left-3 flex items-center text-text-secondary text-sm">
                    🔍
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

        {loadingStock && (
          <div className="text-text-secondary text-sm">Depo stokları güncelleniyor...</div>
        )}

        {filteredStock.length === 0 ? (
          <div className="text-text-secondary text-center py-6">
            {stock.length === 0
              ? 'Bu depoda henüz malzeme bulunmuyor.'
              : 'Arama kriterlerinize uygun malzeme bulunamadı.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-background-border">
                  <th className="text-left p-3 font-medium text-text-secondary">Malzeme</th>
                  <th className="text-left p-3 font-medium text-text-secondary">Kategori</th>
                  <th className="text-center p-3 font-medium text-text-secondary">Miktar</th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.map((s) => (
                  <tr key={s.StockId} className="border-b border-background-border/50 hover:bg-background-hover">
                    <td className="p-3 font-medium">{s.ItemName}</td>
                    <td className="p-3 text-text-secondary">{s.CategoryName || '-'}</td>
                    <td className="p-3 text-center">
                      <span className="font-bold text-green-500">
                        {s.Quantity.toLocaleString('tr-TR')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


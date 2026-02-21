import { useState, useEffect, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { WarehouseIcon } from '@phosphor-icons/react';
import { warehouseService } from '../services/warehouseService';
import { inventoryService } from '../services/inventoryService';
import { Warehouse, WarehouseStock, Inventory } from '../models';
import { formatShortDateTime } from '../utils/formatters';
import EmptyState from '../components/EmptyState';
import WarehouseDetailModal from '../components/modals/WarehouseDetailModal';

export default function WarehousesPage() {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewWarehouse, setIsNewWarehouse] = useState(false);

  // Genişletilmiş depo ve stok bilgileri
  const [expandedWarehouseId, setExpandedWarehouseId] = useState<number | null>(null);
  const [expandedStock, setExpandedStock] = useState<WarehouseStock[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);

  // Kiradakiler (genel: hangi üründen kaç tane kirada)
  const [rentedItems, setRentedItems] = useState<Inventory[]>([]);
  const [loadingRented, setLoadingRented] = useState(false);
  const [rentedSearchText, setRentedSearchText] = useState('');
  const [rentedCategoryId, setRentedCategoryId] = useState<number | 'all'>('all');
  const [rentedMinQty, setRentedMinQty] = useState<number | ''>('');
  const [rentedMaxQty, setRentedMaxQty] = useState<number | ''>('');

  useEffect(() => {
    loadData();
    loadRentedItems();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await warehouseService.getAllAsync();
      setWarehouses(data);
    } catch (error) {
      console.error('Load warehouses error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setSelectedWarehouse(null);
    setIsNewWarehouse(true);
    setIsModalOpen(true);
  };

  const handleOpenDetail = (warehouse: Warehouse, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedWarehouse(warehouse);
    setIsNewWarehouse(false);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedWarehouse(null);
    loadData();
    loadRentedItems();
    // Genişletilmiş depoyu yenile
    if (expandedWarehouseId) {
      loadWarehouseStock(expandedWarehouseId);
    }
  };

  // Depo satırına tıklandığında genişlet/daralt
  const handleToggleExpand = async (warehouse: Warehouse) => {
    if (expandedWarehouseId === warehouse.WarehouseId) {
      // Zaten açıksa kapat
      setExpandedWarehouseId(null);
      setExpandedStock([]);
    } else {
      // Yeni depoyu aç
      setExpandedWarehouseId(warehouse.WarehouseId);
      await loadWarehouseStock(warehouse.WarehouseId);
    }
  };

  // Depo stoklarını yükle
  const loadWarehouseStock = async (warehouseId: number) => {
    try {
      setLoadingStock(true);
      const response = await warehouseService.getStockAsync(warehouseId);
      setExpandedStock(response.stock);
    } catch (error) {
      console.error('Load warehouse stock error:', error);
      setExpandedStock([]);
    } finally {
      setLoadingStock(false);
    }
  };

  const filteredRentedItems = useMemo(() => {
    const text = rentedSearchText.trim().toLowerCase();
    return rentedItems.filter((i) => {
      const name = i.ItemName?.toLowerCase() ?? '';
      const cat = i.Category?.CategoryName?.toLowerCase() ?? '';
      const okText = !text || name.includes(text) || cat.includes(text);
      const okCat = rentedCategoryId === 'all' || i.CategoryId === rentedCategoryId;
      const qty = i.OnRent ?? 0;
      const okMin = rentedMinQty === '' || qty >= rentedMinQty;
      const okMax = rentedMaxQty === '' || qty <= rentedMaxQty;
      return okText && okCat && okMin && okMax;
    });
  }, [rentedItems, rentedSearchText, rentedCategoryId, rentedMinQty, rentedMaxQty]);

  const rentedCategoryOptions = useMemo(() => {
    const map = new Map<number, string>();
    rentedItems.forEach((i) => {
      if (i.CategoryId != null && !map.has(i.CategoryId)) {
        map.set(i.CategoryId, i.Category?.CategoryName ?? `Kategori #${i.CategoryId}`);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rentedItems]);

  // Kiradaki ürünleri yükle (envanterden OnRent > 0)
  const loadRentedItems = async () => {
    try {
      setLoadingRented(true);
      const all = await inventoryService.getAllAsync();
      setRentedItems(all.filter((i) => (i.OnRent ?? 0) > 0));
    } catch (error) {
      console.error('Load rented items error:', error);
      setRentedItems([]);
    } finally {
      setLoadingRented(false);
    }
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
          <h1 className="text-3xl font-bold mb-2">Depolar</h1>
          <p className="text-text-secondary">Depo ve stok yönetimi</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => { loadData(); loadRentedItems(); }} className="btn-secondary">
            Yenile
          </button>
          <button onClick={handleAddNew} className="btn-primary">
            + Yeni Depo
          </button>
        </div>
      </div>

      {/* Kiradakiler bölümü: hangi üründen kaç tane kirada */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-2 px-4 pt-4">Kiradakiler</h2>
        <p className="text-sm text-text-secondary mb-3 px-4">
          Hangi üründen kaç adet şu an kirada görüntülenir. Arama ve filtreleri kullanarak daraltabilirsiniz.
        </p>
        {loadingRented ? (
          <div className="px-4 pb-4 text-text-secondary">Yükleniyor...</div>
        ) : rentedItems.length === 0 ? (
          <div className="px-4 pb-4 text-text-secondary">Şu an kirada ürün bulunmuyor.</div>
        ) : (
          <>
            <div className="px-4 pb-3 flex flex-col lg:flex-row gap-3 items-stretch lg:items-end flex-wrap">
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-medium text-text-secondary mb-1">Ara</label>
                <div className="flex gap-2">
                  <div className="relative flex-1 min-w-0">
                    <span className="absolute inset-y-0 left-3 flex items-center text-text-secondary text-sm">🔍</span>
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
                  value={rentedCategoryId === 'all' ? 'all' : String(rentedCategoryId)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRentedCategoryId(v === 'all' ? 'all' : Number(v));
                  }}
                >
                  <option value="all">Tüm kategoriler</option>
                  {rentedCategoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
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
              <button
                type="button"
                onClick={() => {
                  setRentedSearchText('');
                  setRentedCategoryId('all');
                  setRentedMinQty('');
                  setRentedMaxQty('');
                }}
                className="btn-secondary"
              >
                Filtreleri Sıfırla
              </button>
            </div>
            <div className="overflow-x-auto px-4 pb-4">
              <table className="w-full text-sm table-compact">
                <thead>
                  <tr className="border-b border-background-border">
                    <th className="text-left p-2 font-medium text-text-secondary">Malzeme</th>
                    <th className="text-left p-2 font-medium text-text-secondary">Kategori</th>
                    <th className="text-center p-2 font-medium text-text-secondary">Kirada (Miktar)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRentedItems.map((item) => (
                    <tr key={item.ItemId} className="border-b border-background-border/50">
                      <td className="p-2 font-medium">{item.ItemName}</td>
                      <td className="p-2 text-text-secondary">{item.Category?.CategoryName ?? '-'}</td>
                      <td className="p-2 text-center">
                        <span className="font-bold text-orange-400">
                          {(item.OnRent ?? 0).toLocaleString('tr-TR')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRentedItems.length === 0 && (
                <div className="text-text-secondary text-center py-4">Arama kriterlerine uygun kirada ürün yok.</div>
              )}
            </div>
          </>
        )}
      </div>

      {warehouses.length === 0 ? (
        <EmptyState
          icon={<WarehouseIcon size={48} weight="duotone" />}
          title="Henüz depo bulunmuyor"
          description="Malzemelerinizi depolamak için yeni bir depo ekleyin"
        />
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full table-compact">
              <thead>
                <tr className="border-b border-background-border">
                  <th className="text-left p-4 font-semibold" style={{ width: '22%' }}>
                    Depo Adı
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '26%' }}>
                    Adres
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '12%' }}>
                    Ürün Çeşidi
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '12%' }}>
                    Toplam Miktar
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '12%' }}>
                    Durum
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '16%' }}>
                    Oluşturan / Son Güncelleyen
                  </th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((warehouse) => {
                  // Stok durumuna göre renk ve etiket
                  let statusBadge;
                  if (warehouse.TotalQuantity === 0) {
                    statusBadge = <span className="badge bg-gray-600 text-white">Boş</span>;
                  } else if (warehouse.UniqueItems <= 3) {
                    statusBadge = <span className="badge bg-yellow-600 text-white">Az Ürün</span>;
                  } else {
                    statusBadge = <span className="badge bg-green-600 text-white">Aktif</span>;
                  }

                  const isExpanded = expandedWarehouseId === warehouse.WarehouseId;

                  return (
                    <Fragment key={warehouse.WarehouseId}>
                      <tr
                        className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${
                          isExpanded ? 'bg-background-hover' : ''
                        }`}
                        onClick={() => navigate(`/warehouses/${warehouse.WarehouseId}`)}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleExpand(warehouse);
                              }}
                              className="text-text-secondary transition-transform hover:text-text-primary"
                              title={isExpanded ? 'Kapat' : 'Depodaki malzemeleri göster'}
                            >
                              <span className={isExpanded ? 'inline-block rotate-90' : 'inline-block'}>▶</span>
                            </button>
                            <div>
                              <div className="font-medium">{warehouse.WarehouseName}</div>
                              {warehouse.Description && (
                                <div className="text-sm text-text-secondary truncate max-w-xs">
                                  {warehouse.Description}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-text-secondary">
                          {warehouse.Address || '-'}
                        </td>
                        <td className="p-4 text-center">
                          <span className="font-bold text-lg text-blue-400">
                            {warehouse.UniqueItems}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className="font-bold text-lg text-green-500">
                            {warehouse.TotalQuantity.toLocaleString('tr-TR')}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {statusBadge}
                            <button
                              onClick={() => navigate(`/warehouses/${warehouse.WarehouseId}`)}
                              className="btn-secondary text-xs px-3 py-1 ml-2"
                              title="Depo içeriğini gör"
                            >
                              Depo Detayı
                            </button>
                            <button
                              onClick={(e) => handleOpenDetail(warehouse, e)}
                              className="text-blue-400 hover:text-blue-300 ml-2"
                              title="Düzenle"
                            >
                              ✎
                            </button>
                          </div>
                        </td>
                        <td className="p-4 text-sm text-text-secondary">
                          <div>Oluşturan: {warehouse.CreatedByUserFullName || warehouse.CreatedByUserName || '-'}</div>
                          <div>{formatShortDateTime(warehouse.CreatedAt)}</div>
                          <div className="mt-1">Güncelleyen: {warehouse.LastModifiedByUserFullName || warehouse.LastModifiedByUserName || '-'}</div>
                          <div>{formatShortDateTime(warehouse.LastModifiedAt)}</div>
                        </td>
                      </tr>
                      {/* Genişletilmiş malzeme listesi */}
                      {isExpanded && (
                        <tr key={`${warehouse.WarehouseId}-expanded`}>
                          <td colSpan={6} className="p-0">
                            <div className="bg-background-secondary p-4 border-b border-background-border">
                              {loadingStock ? (
                                <div className="text-center py-4 text-text-secondary">
                                  Malzemeler yükleniyor...
                                </div>
                              ) : expandedStock.length === 0 ? (
                                <div className="text-center py-4 text-text-secondary">
                                  Bu depoda henüz malzeme bulunmuyor
                                </div>
                              ) : (
                                <div>
                                  <h4 className="text-sm font-semibold mb-3 text-text-secondary">
                                    Depodaki Malzemeler ({expandedStock.length} çeşit)
                                  </h4>
                                  <table className="w-full text-sm table-compact">
                                    <thead>
                                      <tr className="border-b border-background-border">
                                        <th className="text-left p-2 font-medium text-text-secondary">Malzeme</th>
                                        <th className="text-left p-2 font-medium text-text-secondary">Kategori</th>
                                        <th className="text-center p-2 font-medium text-text-secondary">Miktar</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {expandedStock.map((stock) => (
                                        <tr key={stock.StockId} className="border-b border-background-border/50">
                                          <td className="p-2 font-medium">{stock.ItemName}</td>
                                          <td className="p-2 text-text-secondary">{stock.CategoryName || '-'}</td>
                                          <td className="p-2 text-center">
                                            <span className="font-bold text-green-500">
                                              {stock.Quantity.toLocaleString('tr-TR')}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <WarehouseDetailModal
          warehouse={selectedWarehouse}
          isNew={isNewWarehouse}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}

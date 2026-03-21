import { useState, useEffect, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, WarehouseIcon } from '@phosphor-icons/react';
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
  const [rentedSubCategoryId, setRentedSubCategoryId] = useState<number | 'all'>('all');
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
      const catNames =
        i.Categories?.map((c) => c.CategoryName).join(' ').toLowerCase() ?? '';
      const okText = !text || name.includes(text) || catNames.includes(text);
      const okCat =
        rentedCategoryId === 'all' ||
        i.Categories?.some((c) => c.CategoryId === rentedCategoryId);
      const okSubCat =
        rentedSubCategoryId === 'all' ||
        i.SubCategories?.some((sc) => sc.SubCategoryId === rentedSubCategoryId);
      const qty = i.OnRent ?? 0;
      const okMin = rentedMinQty === '' || qty >= rentedMinQty;
      const okMax = rentedMaxQty === '' || qty <= rentedMaxQty;
      return okText && okCat && okSubCat && okMin && okMax;
    });
  }, [rentedItems, rentedSearchText, rentedCategoryId, rentedSubCategoryId, rentedMinQty, rentedMaxQty]);

  const rentedCategoryOptions = useMemo(() => {
    const map = new Map<number, string>();
    rentedItems.forEach((i) => {
      i.Categories?.forEach((c) => {
        if (!map.has(c.CategoryId)) {
          map.set(c.CategoryId, c.CategoryName ?? `Kategori #${c.CategoryId}`);
        }
      });
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rentedItems]);

  const rentedSubCategoryOptions = useMemo(() => {
    const map = new Map<number, string>();
    rentedItems.forEach((i) => {
      i.SubCategories?.forEach((sc) => {
        if (!map.has(sc.SubCategoryId)) {
          map.set(sc.SubCategoryId, sc.SubCategoryName);
        }
      });
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
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Depolar</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => { loadData(); loadRentedItems(); }} className="btn-secondary py-2 px-3 text-sm">
            Yenile
          </button>
          <button onClick={handleAddNew} className="btn-primary py-2 px-3 text-sm">
            + Yeni Depo
          </button>
        </div>
      </div>

      {/* Kiradakiler */}
      <div className="mb-3 rounded border border-background-border bg-background-panel p-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-secondary whitespace-nowrap">Kiradakiler — Kriterler:</span>
        <div className="relative flex-1 min-w-[160px]">
          <span className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-text-secondary">
            <MagnifyingGlassIcon size={14} weight="regular" color="currentColor" aria-hidden />
          </span>
          <input
            type="text"
            className="input w-full pl-7 py-2 text-sm"
            placeholder="Malzeme veya kategori..."
            value={rentedSearchText}
            onChange={(e) => setRentedSearchText(e.target.value)}
          />
        </div>
        <select
          className="input py-2 px-3 text-sm w-40"
          value={rentedCategoryId === 'all' ? 'all' : String(rentedCategoryId)}
          onChange={(e) => {
            const v = e.target.value;
            setRentedCategoryId(v === 'all' ? 'all' : Number(v));
            // kategori değişince alt kategori filtresini de sıfırla
            setRentedSubCategoryId('all');
          }}
        >
          <option value="all">Tüm kategoriler</option>
          {rentedCategoryOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          className="input py-2 px-3 text-sm w-44"
          value={rentedSubCategoryId === 'all' ? 'all' : String(rentedSubCategoryId)}
          onChange={(e) => {
            const v = e.target.value;
            setRentedSubCategoryId(v === 'all' ? 'all' : Number(v));
          }}
        >
          <option value="all">Tüm alt kategoriler</option>
          {rentedSubCategoryOptions.map((sc) => (
            <option key={sc.id} value={sc.id}>{sc.name}</option>
          ))}
        </select>
        <input type="number" className="input py-2 px-3 text-sm w-20" min={0} placeholder="Min" value={rentedMinQty === '' ? '' : rentedMinQty} onChange={(e) => setRentedMinQty(e.target.value === '' ? '' : Number(e.target.value))} />
        <input type="number" className="input py-2 px-3 text-sm w-20" min={0} placeholder="Max" value={rentedMaxQty === '' ? '' : rentedMaxQty} onChange={(e) => setRentedMaxQty(e.target.value === '' ? '' : Number(e.target.value))} />
        <button
          type="button"
          onClick={() => {
            setRentedSearchText('');
            setRentedCategoryId('all');
            setRentedSubCategoryId('all');
            setRentedMinQty('');
            setRentedMaxQty('');
          }}
          className="btn-secondary py-2 px-3 text-sm"
        >
          Filtreleri Sıfırla
        </button>
      </div>

      {loadingRented ? (
        <div className="mb-4 text-text-secondary text-sm">Kiradakiler yükleniyor...</div>
      ) : rentedItems.length > 0 ? (
        <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col mb-6">
          <div className="overflow-auto max-h-[280px]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 border-b border-background-border">
                <tr>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Malzeme</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Kategori</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">Kirada (Miktar)</th>
                </tr>
              </thead>
              <tbody>
                {filteredRentedItems.map((item, idx) => (
                  <tr key={item.ItemId} className={`border-b border-background-border hover:bg-background-hover ${idx % 2 === 0 ? 'bg-background-panel' : 'bg-[#16162e]'}`}>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 font-medium text-text-primary">{item.ItemName}</td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 text-text-secondary">
                      {item.Categories?.length
                        ? item.Categories.map((c) => c.CategoryName).join(', ')
                        : '-'}
                    </td>
                    <td className="py-0.5 px-2 text-center align-middle"><span className="font-medium text-orange-400">{(item.OnRent ?? 0).toLocaleString('tr-TR')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary shrink-0">
            Toplam: {filteredRentedItems.length} çeşit kirada
          </div>
        </div>
      ) : null}

      {warehouses.length === 0 ? (
        <EmptyState
          icon={<WarehouseIcon size={48} weight="duotone" />}
          title="Henüz depo bulunmuyor"
          description="Malzemelerinizi depolamak için yeni bir depo ekleyin"
        />
      ) : (
        <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
          <div className="overflow-auto max-h-[calc(100vh-320px)] min-h-[280px]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 border-b border-background-border">
                <tr>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Depo Adı</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Adres</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Ürün Çeşidi</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Toplam Miktar</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Durum</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">Kayıt Bilgisi</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((warehouse, index) => {
                  const badgeClass = 'inline-block px-2 py-0.5 rounded text-xs font-medium';
                  const statusBadge = warehouse.TotalQuantity === 0
                    ? <span className={`${badgeClass} bg-gray-600 text-white`}>Boş</span>
                    : warehouse.UniqueItems <= 3
                      ? <span className={`${badgeClass} bg-yellow-600 text-white`}>Az Ürün</span>
                      : <span className={`${badgeClass} bg-green-600 text-white`}>Aktif</span>;
                  const isExpanded = expandedWarehouseId === warehouse.WarehouseId;
                  return (
                    <Fragment key={warehouse.WarehouseId}>
                      <tr
                        className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${isExpanded ? 'bg-background-hover' : index % 2 === 0 ? 'bg-background-panel' : 'bg-[#16162e]'}`}
                        onClick={() => navigate(`/warehouses/${warehouse.WarehouseId}`)}
                      >
                        <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleToggleExpand(warehouse); }} className="text-text-secondary hover:text-text-primary" title={isExpanded ? 'Kapat' : 'Aç'}>
                              <span className={isExpanded ? 'inline-block rotate-90' : 'inline-block'}>▶</span>
                            </button>
                            <span className="font-medium text-text-primary">{warehouse.WarehouseName}</span>
                            {warehouse.Description && <span className="text-text-secondary truncate max-w-[200px] ml-1"> — {warehouse.Description}</span>}
                          </div>
                        </td>
                        <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-secondary">{warehouse.Address || '-'}</td>
                        <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0"><span className="text-blue-400 font-medium">{warehouse.UniqueItems}</span></td>
                        <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0"><span className="text-green-500 font-medium">{warehouse.TotalQuantity.toLocaleString('tr-TR')}</span></td>
                        <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0">
                          {statusBadge}
                          <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/warehouses/${warehouse.WarehouseId}`); }} className="ml-1 text-xs text-primary hover:underline">Detay</button>
                          <button type="button" onClick={(e) => handleOpenDetail(warehouse, e)} className="ml-1 text-blue-400 hover:text-blue-300" title="Düzenle">✎</button>
                        </td>
                        <td className="py-0.5 px-2 align-middle text-text-secondary">
                          {warehouse.CreatedByUserFullName || warehouse.CreatedByUserName || '-'} • {formatShortDateTime(warehouse.CreatedAt)}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${warehouse.WarehouseId}-expanded`}>
                          <td colSpan={6} className="p-0 bg-background-hover/50">
                            <div className="p-2 border-b border-background-border">
                              {loadingStock ? (
                                <div className="text-center py-2 text-text-secondary text-xs">Yükleniyor...</div>
                              ) : expandedStock.length === 0 ? (
                                <div className="text-center py-2 text-text-secondary text-xs">Bu depoda malzeme yok.</div>
                              ) : (
                                <table className="w-full text-xs border-collapse">
                                  <thead>
                                    <tr className="border-b border-background-border">
                                      <th className="text-left py-0.5 px-2 font-medium text-text-secondary bg-background-hover border-r border-background-border">Malzeme</th>
                                      <th className="text-left py-0.5 px-2 font-medium text-text-secondary bg-background-hover border-r border-background-border">Kategori</th>
                                      <th className="text-center py-0.5 px-2 font-medium text-text-secondary bg-background-hover">Miktar</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedStock.map((stock, i) => (
                                      <tr key={stock.StockId} className={`border-b border-background-border/50 ${i % 2 === 0 ? 'bg-background-panel' : 'bg-[#16162e]'}`}>
                                        <td className="py-0.5 px-2 font-medium border-r border-background-border/60">{stock.ItemName}</td>
                                        <td className="py-0.5 px-2 text-text-secondary border-r border-background-border/60">{stock.CategoryName || '-'}</td>
                                        <td className="py-0.5 px-2 text-center text-green-500 font-medium">{stock.Quantity.toLocaleString('tr-TR')}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
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
          <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex items-center justify-between shrink-0">
            <span>Toplam: {warehouses.length} depo</span>
            <span className="text-text-secondary/80">Ekranda yaklaşık 25–40 satır görünür (pencere boyutuna göre)</span>
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import {
  Warehouse,
  WarehouseStock,
  WarehouseStockResponse,
  Inventory,
  MaterialCategory,
  SubCategory,
  resolveContractQuoteType,
  type WarehouseMovementsResponse,
  type WarehouseMovementRow,
} from '../models';
import { warehouseService } from '../services/warehouseService';
import { contractService } from '../services/contractService';
import { inventoryService } from '../services/inventoryService';
import { subcategoryService } from '../services/subcategoryService';
import EmptyState from '../components/EmptyState';
import WarehouseMovementDetailModal from '../components/modals/WarehouseMovementDetailModal';

import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { toast } from '../hooks/useToast';
import { getApiErrorMessage } from '../utils/apiError';

export default function WarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [stock, setStock] = useState<WarehouseStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStock, setLoadingStock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<number | 'all'>('all');
  const [minQuantity, setMinQuantity] = useState<number | ''>('');
  const [maxQuantity, setMaxQuantity] = useState<number | ''>('');
  const [activeTab, setActiveTab] = useState<'stock' | 'rented' | 'movements'>('stock');
  const [rentedItems, setRentedItems] = useState<{ ItemId: number; ItemName: string; CategoryName: string; Quantity: number }[]>([]);
  const [loadingRented, setLoadingRented] = useState(false);
  const [rentedSearchText, setRentedSearchText] = useState('');
  const [rentedCategoryName, setRentedCategoryName] = useState<string>('all');
  const [rentedMinQty, setRentedMinQty] = useState<number | ''>('');
  const [rentedMaxQty, setRentedMaxQty] = useState<number | ''>('');
  const [allInventory, setAllInventory] = useState<Inventory[]>([]);
  const [allCategories, setAllCategories] = useState<MaterialCategory[]>([]);
  const [allSubCategories, setAllSubCategories] = useState<SubCategory[]>([]);

  type MovementFilters = {
    itemId: number | '';
    dateFrom: string; // yyyy-mm-dd
    dateTo: string; // yyyy-mm-dd
    includeCompleted: boolean;
  };

  const [movementFilters, setMovementFilters] = useState<MovementFilters>({
    itemId: '',
    dateFrom: '',
    dateTo: '',
    includeCompleted: true,
  });
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [movementsData, setMovementsData] = useState<WarehouseMovementsResponse | null>(null);
  const [selectedMovementRow, setSelectedMovementRow] = useState<WarehouseMovementRow | null>(null);

  const [movementsError, setMovementsError] = useState<string | null>(null);
  const lastMovementRequestRef = useRef<string>('');
  const movementsScrollRef = useRef<HTMLDivElement | null>(null);

  const [itemSearch, setItemSearch] = useState('');
  const debouncedItemSearch = useDebouncedValue(itemSearch, 300);
  const [itemOptions, setItemOptions] = useState<Inventory[]>([]);
  const [loadingItemOptions, setLoadingItemOptions] = useState(false);

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
        const [response, inventory, categories, subCategories] = await Promise.all([
          warehouseService.getStockAsync(warehouseId),
          inventoryService.getAllAsync(),
          inventoryService.getAllCategoriesAsync(),
          subcategoryService.getAllAsync(),
        ]);
        setWarehouse(response.warehouse);
        setStock(response.stock);
        setAllInventory(inventory);
        setAllCategories(categories);
        setAllSubCategories(subCategories);
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
    const st = location.state as any;
    const initialTab = st?.initialTab;
    if (initialTab === 'movements' || initialTab === 'rented' || initialTab === 'stock') {
      setActiveTab(initialTab);
    }
  }, [location.state]);

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

  const loadMovements = useCallback(
    async (warehouseId: number, filters: MovementFilters, opts?: { showToastOnError?: boolean }) => {
      const filterKey = JSON.stringify({ warehouseId, ...filters });
      lastMovementRequestRef.current = filterKey;
      setLoadingMovements(true);
      setMovementsError(null);
      try {
        const res = await warehouseService.getMovementsAsync(warehouseId, {
          itemId: filters.itemId === '' ? undefined : Number(filters.itemId),
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          includeCompleted: filters.includeCompleted,
        });
        if (lastMovementRequestRef.current !== filterKey) return;
        setMovementsData(res);
        // Yeni veri geldiğinde tablo/alan en üste gelsin (iade sonrası yeni hareket üstte görünsün).
        queueMicrotask(() => {
          try {
            movementsScrollRef.current?.scrollTo({ top: 0 });
            window.scrollTo({ top: 0 });
          } catch {
            // no-op
          }
        });
      } catch (e) {
        console.error('Load warehouse movements error:', e);
        const msg = getApiErrorMessage(e) || 'Hareket dökümü yüklenemedi.';
        setMovementsError(msg);
        setMovementsData(null);
        if (opts?.showToastOnError) toast.error(msg);
      } finally {
        if (lastMovementRequestRef.current === filterKey) setLoadingMovements(false);
      }
    },
    []
  );

  useEffect(() => {
    const warehouseId = Number(id);
    if (!warehouseId || Number.isNaN(warehouseId) || activeTab !== 'movements') return;
    void loadMovements(warehouseId, movementFilters);
  }, [id, activeTab, movementFilters, loadMovements]);

  useEffect(() => {
    if (activeTab !== 'movements') return;
    // Tab'a geçince de en üste kaydır.
    queueMicrotask(() => {
      try {
        movementsScrollRef.current?.scrollTo({ top: 0 });
        window.scrollTo({ top: 0 });
      } catch {
        // no-op
      }
    });
  }, [activeTab]);

  const formatInt = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString('tr-TR');
  const formatDateTr = (s: string) => {
    const d = new Date(s);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  const renderStatus = (isCompleted: boolean) => {
    const c = 'inline-block px-2 py-0.5 rounded text-xs font-medium';
    return isCompleted ? (
      <span className={`${c} bg-gray-700 text-gray-100`}>Tamamlandı</span>
    ) : (
      <span className={`${c} bg-green-700 text-green-100`}>Aktif</span>
    );
  };
  const renderTypeBadge = (typeRaw: unknown) => {
    const type = resolveContractQuoteType({ Type: typeRaw });
    const c = 'inline-block px-2 py-0.5 rounded text-xs font-medium';
    return type === 'SALE' ? (
      <span className={`${c} bg-orange-700 text-orange-100`}>SALE</span>
    ) : (
      <span className={`${c} bg-blue-700 text-blue-100`}>RENTAL</span>
    );
  };
  const renderStillOut = (stillOut: number) =>
    stillOut <= 0 ? (
      <span className="inline-flex items-center gap-1 text-green-400 font-medium">
        <span aria-hidden>✓</span> 0
      </span>
    ) : (
      <span className="tabular-nums">{formatInt(stillOut)}</span>
    );

  const openContractDetail = (row: WarehouseMovementRow) => {
    const type = resolveContractQuoteType({ Type: row.contract?.Type });
    navigate(type === 'SALE' ? '/contracts/sale' : '/contracts/rental', {
      state: {
        openContractId: row.contract?.ContractId,
        initialTab: 'info',
        preferTab: row.contract?.isCompleted ? 'completed' : 'active',
        returnOnClose: true,
        returnTo: { path: `/warehouses/${id}`, state: { initialTab: 'movements' } },
      },
    });
  };

  const openCustomerDetail = (row: WarehouseMovementRow) => {
    navigate('/customers', {
      state: {
        openCustomerId: row.customer?.CustomerId,
        returnOnClose: true,
        returnTo: { path: `/warehouses/${id}`, state: { initialTab: 'movements' } },
      },
    });
  };

  const openItemDetail = (row: WarehouseMovementRow) => {
    navigate('/inventory', {
      state: {
        openItemId: row.item?.ItemId,
        returnOnClose: true,
        returnTo: { path: `/warehouses/${id}`, state: { initialTab: 'movements' } },
      },
    });
  };

  useEffect(() => {
    if (activeTab !== 'movements') return;
    const q = debouncedItemSearch.trim();
    if (!q) {
      setItemOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoadingItemOptions(true);
        const rows = await inventoryService.getAllAsync({ search: q });
        if (!cancelled) setItemOptions(rows || []);
      } catch (e) {
        console.error('Load inventory options error:', e);
        if (!cancelled) setItemOptions([]);
      } finally {
        if (!cancelled) setLoadingItemOptions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, debouncedItemSearch]);

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

      const inv = allInventory.find((i) => i.ItemId === s.ItemId);
      const subCats = inv?.SubCategories ?? [];
      const matchesSubCategory =
        selectedSubCategoryId === 'all' ||
        subCats.some((sc) => sc.SubCategoryId === selectedSubCategoryId);

      const quantity = s.Quantity ?? 0;
      const matchesMin = minQuantity === '' || quantity >= minQuantity;
      const matchesMax = maxQuantity === '' || quantity <= maxQuantity;

      return matchesText && matchesCategory && matchesSubCategory && matchesMin && matchesMax;
    });
  }, [stock, searchText, selectedCategoryId, selectedSubCategoryId, minQuantity, maxQuantity, allInventory]);

  const categoryOptions = useMemo(() => {
    return allCategories.map((cat) => ({
      id: cat.CategoryId,
      name: cat.CategoryName,
    }));
  }, [allCategories]);

  const subCategoryOptions = useMemo(() => {
    const filtered =
      selectedCategoryId === 'all'
        ? allSubCategories
        : allSubCategories.filter((sc) => sc.CategoryId === selectedCategoryId);
    return filtered.map((sc) => ({
      id: sc.SubCategoryId,
      name: sc.SubCategoryName,
    }));
  }, [allSubCategories, selectedCategoryId]);

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
          <button
            type="button"
            onClick={() => setActiveTab('movements')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'movements'
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Hareket Dökümü
          </button>
        </div>

        {activeTab === 'movements' && (
          <div className="space-y-3">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Hareket Dökümü</h2>
                <p className="text-sm text-text-secondary">
                  Bu depodan çıkmış (kira/çıkış) ve iade hareketleri. Aynı ürün aynı sözleşmede birden fazla çıkmış olabilir.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMovementFilters({ itemId: '', dateFrom: '', dateTo: '', includeCompleted: true });
                  setItemSearch('');
                  setItemOptions([]);
                }}
                className="btn-secondary"
              >
                Filtreleri Sıfırla
              </button>
            </div>

            <div className="rounded border border-background-border bg-background-panel p-3">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-end">
                <div className="lg:col-span-4">
                  <label className="text-xs text-text-secondary block mb-1">Ürün</label>
                  <div className="relative">
                    <input
                      type="text"
                      className="input py-2 px-3 text-sm w-full"
                      placeholder="Ürün ara (kod/ad)…"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                    />
                    {(loadingItemOptions || itemOptions.length > 0) && itemSearch.trim() ? (
                      <div className="absolute z-20 mt-1 w-full rounded border border-background-border bg-background-panel shadow-lg max-h-64 overflow-auto">
                        {loadingItemOptions ? (
                          <div className="p-2 text-xs text-text-secondary">Aranıyor…</div>
                        ) : itemOptions.length === 0 ? (
                          <div className="p-2 text-xs text-text-secondary">Sonuç yok.</div>
                        ) : (
                          itemOptions.slice(0, 30).map((it) => (
                            <button
                              type="button"
                              key={it.ItemId}
                              onClick={() => {
                                setMovementFilters((p) => ({ ...p, itemId: it.ItemId }));
                                setItemSearch(`${it.ItemName}${it.ItemCode ? ` (${it.ItemCode})` : ''}`);
                                setItemOptions([]);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-background-hover text-sm"
                            >
                              <div className="font-medium text-text-primary">
                                {it.ItemName}{' '}
                                <span className="text-text-secondary font-mono">{it.ItemCode ? `(${it.ItemCode})` : ''}</span>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                  {movementFilters.itemId !== '' ? (
                    <div className="mt-1">
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => {
                          setMovementFilters((p) => ({ ...p, itemId: '' }));
                          setItemSearch('');
                        }}
                      >
                        Ürün filtresini kaldır
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="lg:col-span-3">
                  <label className="text-xs text-text-secondary block mb-1">Başlangıç Tarihi</label>
                  <input
                    type="date"
                    className="input py-2 px-3 text-sm w-full"
                    value={movementFilters.dateFrom}
                    onChange={(e) => setMovementFilters((p) => ({ ...p, dateFrom: e.target.value }))}
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="text-xs text-text-secondary block mb-1">Bitiş Tarihi</label>
                  <input
                    type="date"
                    className="input py-2 px-3 text-sm w-full"
                    value={movementFilters.dateTo}
                    onChange={(e) => setMovementFilters((p) => ({ ...p, dateTo: e.target.value }))}
                  />
                </div>
                <div className="lg:col-span-1 flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer whitespace-nowrap mt-6 lg:mt-0">
                    <input
                      type="checkbox"
                      className="rounded border-background-border"
                      checked={movementFilters.includeCompleted}
                      onChange={(e) => setMovementFilters((p) => ({ ...p, includeCompleted: e.target.checked }))}
                    />
                    Kapalı Dahil
                  </label>
                </div>
                <div className="lg:col-span-1">
                  <button
                    type="button"
                    onClick={() => {
                      const warehouseId = Number(id);
                      if (!warehouseId || Number.isNaN(warehouseId)) return;
                      void loadMovements(warehouseId, movementFilters, { showToastOnError: true });
                    }}
                    className="btn-primary py-2 px-3 text-sm w-full"
                  >
                    Filtrele
                  </button>
                </div>
              </div>
            </div>

            {movementsData?.summary ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-2">
                <div className="rounded border border-background-border bg-background-panel p-3">
                  <div className="text-xs text-text-secondary">Hareket Sayısı</div>
                  <div className="text-lg font-semibold text-text-primary tabular-nums">{formatInt(movementsData.summary.totalMovements)}</div>
                </div>
                <div className="rounded border border-background-border bg-background-panel p-3">
                  <div className="text-xs text-text-secondary">Farklı Ürün</div>
                  <div className="text-lg font-semibold text-text-primary tabular-nums">{formatInt(movementsData.summary.uniqueItems)}</div>
                </div>
                <div className="rounded border border-background-border bg-background-panel p-3">
                  <div className="text-xs text-text-secondary">Farklı Müşteri</div>
                  <div className="text-lg font-semibold text-text-primary tabular-nums">{formatInt(movementsData.summary.uniqueCustomers)}</div>
                </div>
                <div className="rounded border border-background-border bg-background-panel p-3">
                  <div className="text-xs text-text-secondary">Toplam Çıkış</div>
                  <div className="text-lg font-semibold text-text-primary tabular-nums">{formatInt(movementsData.summary.totalDispatched)}</div>
                </div>
                <div className="rounded border border-background-border bg-background-panel p-3">
                  <div className="text-xs text-text-secondary">Toplam İade</div>
                  <div className="text-lg font-semibold text-text-primary tabular-nums">{formatInt(movementsData.summary.totalReturned)}</div>
                </div>
                <div className="rounded border border-background-border bg-background-panel p-3">
                  <div className="text-xs text-text-secondary">Şu An Dışarıda</div>
                  <div className="text-lg font-semibold text-text-primary tabular-nums">{formatInt(movementsData.summary.currentlyOut)}</div>
                </div>
              </div>
            ) : null}

            {movementsError ? (
              <div className="rounded border border-red-700/50 bg-red-950/40 p-3 text-sm text-red-200">
                {movementsError}
              </div>
            ) : null}

            {loadingMovements ? (
              <div className="text-text-secondary py-6">Yükleniyor...</div>
            ) : (movementsData?.movements?.length ?? 0) === 0 ? (
              <EmptyState
                icon={<MagnifyingGlassIcon size={48} weight="duotone" />}
                title="Bu depo için hareket kaydı bulunamadı"
                description="Tarih aralığını genişletip tekrar deneyebilirsiniz."
              />
            ) : (
              <>
                {/* Desktop / Tablet: Table */}
                <div className="hidden md:block border border-background-border rounded-panel overflow-hidden bg-background-panel">
                  <div ref={movementsScrollRef} className="overflow-auto max-h-[calc(100vh-420px)] min-h-[320px]">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 z-10 border-b border-background-border">
                        <tr>
                          <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover" />
                          <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                            Kod
                          </th>
                          <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                            Sözleşme
                          </th>
                          <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                            Ürün
                          </th>
                          <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                            Tip
                          </th>
                          <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                            Müşteri
                          </th>
                          <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                            Şantiye
                          </th>
                          <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                            Çıkış Tarihi
                          </th>
                          <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                            Miktar
                          </th>
                          <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                            İade
                          </th>
                          <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                            Kalan
                          </th>
                          <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">
                            Durum
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(movementsData?.movements ?? []).map((row, idx) => {
                          const returned = row.totals?.returned ?? 0;
                          const stillOut = row.totals?.stillOut ?? 0;
                          return (
                            <>
                              <tr
                                key={row.detailId}
                                onClick={() => setSelectedMovementRow(row)}
                                className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${idx % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'}`}
                              >
                                <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 w-9 text-center">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedMovementRow(row);
                                    }}
                                    className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-background-hover text-primary font-bold"
                                    title="Tam Ekranda Gör"
                                  >
                                    ⛶
                                  </button>
                                </td>
                                <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                                  <span className="font-mono text-text-secondary">{row.item?.ItemCode ?? '-'}</span>
                                </td>
                                <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openContractDetail(row);
                                    }}
                                    className="text-primary hover:underline font-medium"
                                    title="Sözleşme detayını aç"
                                  >
                                    {row.contract?.ContractCode ?? `#${row.contract?.ContractId ?? '-'}`}
                                  </button>
                                </td>
                                <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openItemDetail(row);
                                    }}
                                    className="text-primary hover:underline font-medium"
                                    title="Ürün detayını aç"
                                  >
                                    {row.item?.ItemName ?? '—'}
                                  </button>
                                </td>
                                <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0">
                                  {renderTypeBadge(row.contract?.Type)}
                                </td>
                                <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openCustomerDetail(row);
                                    }}
                                    className="text-primary hover:underline"
                                    title="Müşteri detayını aç"
                                  >
                                    {row.customer?.CustomerName ?? '—'}
                                  </button>
                                </td>
                                <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                                  {row.site?.SiteName ?? <span className="text-text-secondary">-</span>}
                                </td>
                                <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                                  {formatDateTr(row.dispatch?.dispatchDate)}
                                </td>
                                <td className="py-0.5 px-2 text-right align-middle border-r border-background-border/60 last:border-r-0 tabular-nums">
                                  {formatInt(row.dispatch?.rentedQuantity ?? 0)}
                                </td>
                                <td className="py-0.5 px-2 text-right align-middle border-r border-background-border/60 last:border-r-0 tabular-nums">
                                  {formatInt(returned)}
                                </td>
                                <td className="py-0.5 px-2 text-right align-middle border-r border-background-border/60 last:border-r-0">
                                  {renderStillOut(stillOut)}
                                </td>
                                <td className="py-0.5 px-2 text-center align-middle">{renderStatus(Boolean(row.contract?.isCompleted))}</td>
                              </tr>
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary shrink-0">
                    Toplam: {(movementsData?.movements ?? []).length} hareket satırı
                  </div>
                </div>

                {/* Mobile: Card */}
                <div className="md:hidden space-y-2">
                  {(movementsData?.movements ?? []).map((row) => {
                    const returned = row.totals?.returned ?? 0;
                    const stillOut = row.totals?.stillOut ?? 0;
                    const contractCompleted = Boolean(row.contract?.isCompleted);
                    return (
                      <div key={row.detailId} className="rounded border border-background-border bg-background-panel p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <button type="button" onClick={() => openItemDetail(row)} className="text-primary hover:underline font-medium text-sm">
                              {row.item?.ItemName ?? '—'}
                            </button>
                            <div className="text-xs text-text-secondary mt-0.5">
                              {row.item?.ItemCode ?? '-'} • {row.contract?.ContractCode ?? `#${row.contract?.ContractId ?? '-'}`}
                            </div>
                          </div>
                          {renderStatus(contractCompleted)}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2 items-center">
                          {renderTypeBadge(row.contract?.Type)}
                          <span className="text-xs text-text-secondary">{row.site?.SiteName ?? '-'}</span>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <div className="text-text-secondary">Müşteri</div>
                            <button type="button" onClick={() => openCustomerDetail(row)} className="text-primary hover:underline">
                              {row.customer?.CustomerName ?? '—'}
                            </button>
                          </div>
                          <div>
                            <div className="text-text-secondary">Çıkış Tarihi</div>
                            <div className="text-text-primary">{formatDateTr(row.dispatch?.dispatchDate)}</div>
                          </div>
                          <div>
                            <div className="text-text-secondary">Miktar</div>
                            <div className="text-text-primary tabular-nums">{formatInt(row.dispatch?.rentedQuantity ?? 0)}</div>
                          </div>
                          <div>
                            <div className="text-text-secondary">Kalan</div>
                            <div className="text-text-primary">{renderStillOut(stillOut)}</div>
                          </div>
                          <div>
                            <div className="text-text-secondary">İade</div>
                            <div className="text-text-primary tabular-nums">{formatInt(returned)}</div>
                          </div>
                          <div>
                            <div className="text-text-secondary">Sözleşme</div>
                            <button type="button" onClick={() => openContractDetail(row)} className="text-primary hover:underline">
                              {row.contract?.ContractCode ?? `#${row.contract?.ContractId ?? '-'}`}
                            </button>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedMovementRow(row)}
                          className="mt-3 w-full btn-secondary py-2 px-3 text-sm inline-flex items-center justify-center gap-2 font-medium"
                        >
                          Tam Ekranda Gör
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

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
                          <tr key={r.ItemId} className={`border-b border-background-border hover:bg-background-hover ${idx % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'}`}>
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
                  setSelectedSubCategoryId('all');
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

            {/* Category & Subcategory filters */}
            <div className="w-full lg:w-64 space-y-3">
              <div>
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

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Alt Kategori
                </label>
                <select
                  className="input w-full"
                  value={selectedSubCategoryId === 'all' ? 'all' : String(selectedSubCategoryId)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedSubCategoryId(value === 'all' ? 'all' : Number(value));
                  }}
                >
                  <option value="all">Tüm alt kategoriler</option>
                  {subCategoryOptions.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.name}
                    </option>
                  ))}
                </select>
              </div>
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
                    <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                      Malzeme
                    </th>
                    <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                      Kategori
                    </th>
                    <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                      Alt Kategoriler
                    </th>
                    <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">
                      Miktar
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.map((s, idx) => {
                    const inv = allInventory.find((i) => i.ItemId === s.ItemId);
                    const subCats = inv?.SubCategories ?? [];
                    return (
                      <tr
                        key={s.StockId}
                        className={`border-b border-background-border hover:bg-background-hover ${
                          idx % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'
                        }`}
                      >
                        <td className="py-0.5 px-2 align-middle border-r border-background-border/60 font-medium text-text-primary">
                          {s.ItemName}
                        </td>
                        <td className="py-0.5 px-2 align-middle border-r border-background-border/60 text-text-secondary">
                          {s.CategoryName || '-'}
                        </td>
                        <td className="py-0.5 px-2 align-middle border-r border-background-border/60">
                          {subCats.length === 0 ? (
                            <span className="text-text-secondary">-</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {subCats.map((sc) => (
                                <span
                                  key={sc.SubCategoryId}
                                  className="inline-flex items-center rounded-full bg-purple-600/20 text-purple-200 px-2 py-0.5 text-[10px]"
                                >
                                  {sc.SubCategoryName}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-0.5 px-2 text-center align-middle">
                          <span className="font-medium text-green-500">
                            {s.Quantity.toLocaleString('tr-TR')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
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

      <WarehouseMovementDetailModal
        row={selectedMovementRow}
        onClose={() => setSelectedMovementRow(null)}
        onOpenContract={(row) => {
          setSelectedMovementRow(null);
          openContractDetail(row);
        }}
        onOpenCustomer={(row) => {
          setSelectedMovementRow(null);
          openCustomerDetail(row);
        }}
        onOpenItem={(row) => {
          setSelectedMovementRow(null);
          openItemDetail(row);
        }}
      />
    </div>
  );
}


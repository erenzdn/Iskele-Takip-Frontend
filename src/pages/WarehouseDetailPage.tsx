import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArchiveIcon, ArrowLeftIcon, MagnifyingGlassIcon, PackageIcon } from '@phosphor-icons/react';
import {
  Warehouse,
  WarehouseStock,
  WarehouseStockResponse,
  Inventory,
  MaterialCategory,
  SubCategory,
  resolveContractQuoteType,
  isInventoryArchived,
  isWarehouseArchived,
  pickWarehouseDeletedAt,
  type WarehouseMovementsResponse,
  type WarehouseMovementRow,
} from '../models';
import { warehouseService } from '../services/warehouseService';
import { contractService } from '../services/contractService';
import { inventoryService } from '../services/inventoryService';
import { subcategoryService } from '../services/subcategoryService';
import EmptyState from '../components/EmptyState';
import ArchivedWarehouseBanner from '../components/ArchivedWarehouseBanner';
import WarehouseMovementDetailModal from '../components/modals/WarehouseMovementDetailModal';
import ConfirmModal from '../components/modals/ConfirmModal';

import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { toast } from '../hooks/useToast';
import { getApiErrorMessage, getWarehouseDeleteErrorMessage } from '../utils/apiError';
import { useAuthStore } from '../store/authStore';
import { canDeleteWarehouse } from '../utils/warehousePermissions';
import { resolveWarehouseDeactivateError, type WarehouseDeactivateErrorDialog } from '../utils/warehouseDeactivate';

export default function WarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const canDelete = canDeleteWarehouse(user);

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deactivateError, setDeactivateError] = useState<WarehouseDeactivateErrorDialog | null>(null);
  const rentedSectionRef = useRef<HTMLDivElement | null>(null);

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

  const handleDeleteConfirm = async () => {
    if (!warehouse) return;
    const warehouseId = warehouse.WarehouseId;
    try {
      setDeleteBusy(true);
      await warehouseService.deleteAsync(warehouseId);
      setShowDeleteConfirm(false);
      toast.success('Depo kullanımdan kaldırıldı.');
      navigate('/warehouses', { replace: true });
    } catch (error) {
      console.error('Deactivate warehouse error:', error);
      setShowDeleteConfirm(false);
      const dialog = resolveWarehouseDeactivateError(error, {
        onGoToStock: () => setActiveTab('stock'),
        onGoToRentals: () => {
          setActiveTab('rented');
          queueMicrotask(() => {
            rentedSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        },
      });
      if (dialog) {
        setDeactivateError(dialog);
      } else {
        toast.error(getWarehouseDeleteErrorMessage(error));
      }
    } finally {
      setDeleteBusy(false);
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
    }).sort((a, b) => (a.ItemName ?? '').localeCompare(b.ItemName ?? '', 'tr-TR'));
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

  const tabBtn = (id: 'stock' | 'rented' | 'movements', label: string) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
        activeTab === id
          ? 'bg-accent/15 text-accent'
          : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  );

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-5rem)] items-center justify-center">
        <div className="text-text-secondary">Depo detayları yükleniyor...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="mb-4 text-red-400">{error}</div>
        <button onClick={() => navigate('/warehouses')} className="btn-secondary">
          Depo listesine dön
        </button>
      </div>
    );
  }

  if (!warehouse) {
    return (
      <div>
        <div className="mb-4 text-text-secondary">Depo bulunamadı.</div>
        <button onClick={() => navigate('/warehouses')} className="btn-secondary">
          Depo listesine dön
        </button>
      </div>
    );
  }

  const uniqueItems = warehouse.UniqueItems ?? stock.length;
  const totalQuantity = warehouse.TotalQuantity ?? stock.reduce((sum, s) => sum + (s.Quantity ?? 0), 0);
  const archived = isWarehouseArchived(warehouse);
  const rentedTotalQty = rentedItems.reduce((sum, r) => sum + (r.Quantity ?? 0), 0);
  const filteredRentedQty = filteredRentedItems.reduce((sum, r) => sum + (r.Quantity ?? 0), 0);
  const hasActiveFilters =
    Boolean(searchText.trim()) ||
    selectedCategoryId !== 'all' ||
    selectedSubCategoryId !== 'all' ||
    minQuantity !== '' ||
    maxQuantity !== '';
  const hasRentedFilters =
    Boolean(rentedSearchText.trim()) ||
    rentedCategoryName !== 'all' ||
    rentedMinQty !== '' ||
    rentedMaxQty !== '';
  const hasMovementFilters =
    movementFilters.itemId !== '' ||
    Boolean(movementFilters.dateFrom) ||
    Boolean(movementFilters.dateTo) ||
    !movementFilters.includeCompleted;

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-0 flex-col gap-2 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold">{warehouse.WarehouseName}</h1>
            {archived ? (
              <span className="rounded border border-amber-700/50 bg-amber-900/40 px-2 py-0.5 text-xs font-semibold text-amber-100">
                Pasif
              </span>
            ) : null}
            <span className="truncate text-xs text-text-secondary" title={warehouse.Address || undefined}>
              {warehouse.Address || 'Adres yok'}
            </span>
          </div>
          {warehouse.Description ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary" title={warehouse.Description}>
              {warehouse.Description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="rounded-md border border-background-border bg-background-surface px-2.5 py-1 text-center">
            <div className="text-[10px] text-text-secondary">Çeşit</div>
            <div className="text-sm font-bold tabular-nums text-blue-500">{uniqueItems}</div>
          </div>
          <div className="rounded-md border border-background-border bg-background-surface px-2.5 py-1 text-center">
            <div className="text-[10px] text-text-secondary">Toplam</div>
            <div className="text-sm font-bold tabular-nums text-green-600 dark:text-green-500">
              {totalQuantity.toLocaleString('tr-TR')}
            </div>
          </div>
          {activeTab === 'rented' && rentedItems.length > 0 ? (
            <div className="rounded-md border border-background-border bg-background-surface px-2.5 py-1 text-center">
              <div className="text-[10px] text-text-secondary">Kirada</div>
              <div className="text-sm font-bold tabular-nums text-warning">{rentedTotalQty.toLocaleString('tr-TR')}</div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => navigate('/warehouses')}
            className="btn-secondary inline-flex items-center gap-1 py-1.5 px-3 text-sm"
          >
            <ArrowLeftIcon size={14} weight="bold" />
            Liste
          </button>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="btn-secondary py-1.5 px-3 text-sm"
            disabled={loadingStock}
          >
            {loadingStock ? 'Yenileniyor...' : 'Yenile'}
          </button>
          {canDelete && !archived && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleteBusy}
              className="btn-danger inline-flex items-center gap-1.5 py-1.5 px-3 text-sm"
              title="Depoyu kullanımdan kaldır"
            >
              <ArchiveIcon size={16} weight="bold" aria-hidden />
              Kullanımdan Kaldır
            </button>
          )}
        </div>
      </div>

      {archived ? (
        <ArchivedWarehouseBanner
          warehouseName={warehouse.WarehouseName}
          deletedAt={pickWarehouseDeletedAt(warehouse)}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-background-border bg-background-panel">
        <div className="flex shrink-0 gap-1 border-b border-background-border p-1">
          {tabBtn('stock', `Depo stoğu (${stock.length})`)}
          {tabBtn('rented', activeTab === 'rented' || rentedItems.length > 0 ? `Kirada (${rentedItems.length})` : 'Kirada')}
          {tabBtn('movements', 'Hareket dökümü')}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
          {activeTab === 'stock' && (
            <>
              <div className="mb-2 flex shrink-0 flex-wrap items-end gap-2">
                <div className="relative min-w-[180px] flex-1">
                  <MagnifyingGlassIcon
                    size={16}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary"
                  />
                  <input
                    type="text"
                    className="input w-full py-2 pl-8 text-sm"
                    placeholder="Malzeme veya kategori ara…"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                </div>
                <select
                  className="input w-40 py-2 text-sm"
                  value={selectedCategoryId === 'all' ? 'all' : String(selectedCategoryId)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedCategoryId(value === 'all' ? 'all' : Number(value));
                    setSelectedSubCategoryId('all');
                  }}
                  aria-label="Kategori"
                >
                  <option value="all">Tüm kategoriler</option>
                  {categoryOptions.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <select
                  className="input w-44 py-2 text-sm"
                  value={selectedSubCategoryId === 'all' ? 'all' : String(selectedSubCategoryId)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedSubCategoryId(value === 'all' ? 'all' : Number(value));
                  }}
                  aria-label="Alt kategori"
                >
                  <option value="all">Tüm alt kategoriler</option>
                  {subCategoryOptions.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="input w-24 py-2 text-sm"
                  min={0}
                  placeholder="Min"
                  value={minQuantity === '' ? '' : minQuantity}
                  onChange={(e) => setMinQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                  aria-label="Miktar min"
                />
                <input
                  type="number"
                  className="input w-24 py-2 text-sm"
                  min={0}
                  placeholder="Max"
                  value={maxQuantity === '' ? '' : maxQuantity}
                  onChange={(e) => setMaxQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                  aria-label="Miktar max"
                />
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchText('');
                      setSelectedCategoryId('all');
                      setSelectedSubCategoryId('all');
                      setMinQuantity('');
                      setMaxQuantity('');
                    }}
                    className="btn-secondary py-2 px-3 text-sm"
                  >
                    Sıfırla
                  </button>
                )}
              </div>

              {loadingStock ? (
                <div className="px-2 py-1 text-xs text-text-secondary">Stoklar güncelleniyor…</div>
              ) : null}

              {filteredStock.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <EmptyState
                    icon={<PackageIcon size={48} weight="duotone" />}
                    title={stock.length === 0 ? 'Bu depoda henüz malzeme yok' : 'Filtrelere uygun malzeme yok'}
                    description={
                      stock.length === 0
                        ? 'Depo detayından ürün ekleyebilirsiniz.'
                        : 'Arama veya kategori filtrelerini gevşetin.'
                    }
                  />
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-background-border">
                  <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead className="sticky top-0 z-10 border-b border-background-border">
                        <tr>
                          <th className="bg-background-hover px-2 py-1.5 text-left font-medium text-text-secondary">Malzeme</th>
                          <th className="bg-background-hover px-2 py-1.5 text-left font-medium text-text-secondary">Kategori</th>
                          <th className="bg-background-hover px-2 py-1.5 text-left font-medium text-text-secondary">Alt kategoriler</th>
                          <th className="bg-background-hover px-2 py-1.5 text-center font-medium text-text-secondary">Miktar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStock.map((s, idx) => {
                          const inv = allInventory.find((i) => i.ItemId === s.ItemId);
                          const subCats = inv?.SubCategories ?? [];
                          const stockArchived =
                            s.IsArchived === true || s.isArchived === true || (inv ? isInventoryArchived(inv) : false);
                          return (
                            <tr
                              key={s.StockId}
                              className={`border-b border-background-border hover:bg-background-hover ${
                                stockArchived ? 'opacity-70' : ''
                              } ${idx % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'}`}
                            >
                              <td className="px-2 py-1 font-medium">
                                <span className="inline-flex flex-wrap items-center gap-1">
                                  {s.ItemName}
                                  {stockArchived ? (
                                    <span className="rounded border border-amber-700/50 bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100">
                                      Pasif
                                    </span>
                                  ) : null}
                                </span>
                              </td>
                              <td className="px-2 py-1 text-text-secondary">{s.CategoryName || '—'}</td>
                              <td className="px-2 py-1">
                                {subCats.length === 0 ? (
                                  <span className="text-text-secondary">—</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {subCats.map((sc) => (
                                      <span
                                        key={sc.SubCategoryId}
                                        className="inline-flex items-center rounded-full bg-purple-600/20 px-2 py-0.5 text-[10px] text-purple-700 dark:text-purple-200"
                                      >
                                        {sc.SubCategoryName}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1 text-center">
                                <span className="font-medium text-green-600 dark:text-green-500">
                                  {s.Quantity.toLocaleString('tr-TR')}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="shrink-0 border-t border-background-border bg-background-hover px-2 py-1 text-xs text-text-secondary">
                    {filteredStock.length} çeşit
                    {hasActiveFilters ? ` (toplam ${stock.length})` : ''}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'rented' && (
            <div ref={rentedSectionRef} id="kiradakiler" className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {loadingRented ? (
                <div className="flex flex-1 items-center justify-center text-sm text-text-secondary">Yükleniyor…</div>
              ) : rentedItems.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <EmptyState
                    icon={<PackageIcon size={48} weight="duotone" />}
                    title="Bu depodan kirada ürün yok"
                    description="Global kirada listesi için Envanter → Kirada filtresini kullanın."
                  />
                </div>
              ) : (
                <>
                  <div className="mb-2 flex shrink-0 flex-wrap items-end gap-2">
                    <div className="relative min-w-[180px] flex-1">
                      <MagnifyingGlassIcon
                        size={16}
                        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary"
                      />
                      <input
                        type="text"
                        className="input w-full py-2 pl-8 text-sm"
                        placeholder="Malzeme veya kategori ara…"
                        value={rentedSearchText}
                        onChange={(e) => setRentedSearchText(e.target.value)}
                      />
                    </div>
                    <select
                      className="input w-44 py-2 text-sm"
                      value={rentedCategoryName}
                      onChange={(e) => setRentedCategoryName(e.target.value)}
                      aria-label="Kategori"
                    >
                      <option value="all">Tüm kategoriler</option>
                      {rentedCategoryOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      className="input w-24 py-2 text-sm"
                      min={0}
                      placeholder="Min"
                      value={rentedMinQty === '' ? '' : rentedMinQty}
                      onChange={(e) => setRentedMinQty(e.target.value === '' ? '' : Number(e.target.value))}
                      aria-label="Kirada min"
                    />
                    <input
                      type="number"
                      className="input w-24 py-2 text-sm"
                      min={0}
                      placeholder="Max"
                      value={rentedMaxQty === '' ? '' : rentedMaxQty}
                      onChange={(e) => setRentedMaxQty(e.target.value === '' ? '' : Number(e.target.value))}
                      aria-label="Kirada max"
                    />
                    {hasRentedFilters && (
                      <button
                        type="button"
                        onClick={() => {
                          setRentedSearchText('');
                          setRentedCategoryName('all');
                          setRentedMinQty('');
                          setRentedMaxQty('');
                        }}
                        className="btn-secondary py-2 px-3 text-sm"
                      >
                        Sıfırla
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => navigate('/inventory?stockStatus=onRent')}
                    >
                      Envanterde kiradakiler
                    </button>
                  </div>

                  {filteredRentedItems.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-text-secondary">
                      Filtrelere uygun kirada ürün yok.
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-background-border">
                      <div className="min-h-0 flex-1 overflow-auto">
                        <table className="w-full border-collapse text-xs">
                          <thead className="sticky top-0 z-10 border-b border-background-border">
                            <tr>
                              <th className="bg-background-hover px-2 py-1.5 text-left font-medium text-text-secondary">Malzeme</th>
                              <th className="bg-background-hover px-2 py-1.5 text-left font-medium text-text-secondary">Kategori</th>
                              <th className="bg-background-hover px-2 py-1.5 text-center font-medium text-text-secondary">Kirada</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredRentedItems.map((r, idx) => (
                              <tr
                                key={r.ItemId}
                                className={`border-b border-background-border hover:bg-background-hover ${
                                  idx % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'
                                }`}
                              >
                                <td className="px-2 py-1 font-medium">{r.ItemName}</td>
                                <td className="px-2 py-1 text-text-secondary">{r.CategoryName || '—'}</td>
                                <td className="px-2 py-1 text-center">
                                  <span className="font-medium text-warning">{r.Quantity.toLocaleString('tr-TR')}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="shrink-0 border-t border-background-border bg-background-hover px-2 py-1 text-xs text-text-secondary">
                        {filteredRentedItems.length} çeşit kirada · {filteredRentedQty.toLocaleString('tr-TR')} adet
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'movements' && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="mb-2 flex shrink-0 flex-wrap items-end gap-2">
                <div className="relative min-w-[180px] flex-1">
                  <input
                    type="text"
                    className="input w-full py-2 px-3 text-sm"
                    placeholder="Ürün ara (kod/ad)…"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                  />
                  {(loadingItemOptions || itemOptions.length > 0) && itemSearch.trim() ? (
                    <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded border border-background-border bg-background-panel shadow-lg">
                      {loadingItemOptions ? (
                        <div className="p-2 text-xs text-text-secondary">Aranıyor…</div>
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
                            className="w-full px-3 py-2 text-left text-sm hover:bg-background-hover"
                          >
                            <span className="font-medium">{it.ItemName}</span>{' '}
                            <span className="font-mono text-text-secondary">{it.ItemCode ? `(${it.ItemCode})` : ''}</span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                  {movementFilters.itemId !== '' ? (
                    <button
                      type="button"
                      className="mt-0.5 text-[11px] text-primary hover:underline"
                      onClick={() => {
                        setMovementFilters((p) => ({ ...p, itemId: '' }));
                        setItemSearch('');
                      }}
                    >
                      Ürün filtresini kaldır
                    </button>
                  ) : null}
                </div>
                <input
                  type="date"
                  className="input w-36 py-2 text-sm"
                  value={movementFilters.dateFrom}
                  onChange={(e) => setMovementFilters((p) => ({ ...p, dateFrom: e.target.value }))}
                  aria-label="Başlangıç tarihi"
                />
                <input
                  type="date"
                  className="input w-36 py-2 text-sm"
                  value={movementFilters.dateTo}
                  onChange={(e) => setMovementFilters((p) => ({ ...p, dateTo: e.target.value }))}
                  aria-label="Bitiş tarihi"
                />
                <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-text-primary">
                  <input
                    type="checkbox"
                    className="rounded border-background-border"
                    checked={movementFilters.includeCompleted}
                    onChange={(e) => setMovementFilters((p) => ({ ...p, includeCompleted: e.target.checked }))}
                  />
                  Kapalı dahil
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const warehouseId = Number(id);
                    if (!warehouseId || Number.isNaN(warehouseId)) return;
                    void loadMovements(warehouseId, movementFilters, { showToastOnError: true });
                  }}
                  className="btn-primary py-2 px-3 text-sm"
                >
                  Filtrele
                </button>
                {hasMovementFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setMovementFilters({ itemId: '', dateFrom: '', dateTo: '', includeCompleted: true });
                      setItemSearch('');
                      setItemOptions([]);
                    }}
                    className="btn-secondary py-2 px-3 text-sm"
                  >
                    Sıfırla
                  </button>
                )}
              </div>

              {movementsData?.summary ? (
                <div className="mb-2 flex shrink-0 flex-wrap gap-1.5">
                  {(
                    [
                      ['Hareket', movementsData.summary.totalMovements],
                      ['Ürün', movementsData.summary.uniqueItems],
                      ['Müşteri', movementsData.summary.uniqueCustomers],
                      ['Çıkış', movementsData.summary.totalDispatched],
                      ['İade', movementsData.summary.totalReturned],
                      ['Dışarıda', movementsData.summary.currentlyOut],
                    ] as const
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded border border-background-border bg-background-surface px-2 py-1 text-xs"
                    >
                      <span className="text-text-secondary">{label} </span>
                      <span className="font-semibold tabular-nums">{formatInt(value)}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {movementsError ? (
                <div className="mb-2 shrink-0 rounded border border-red-700/50 bg-red-950/40 p-2 text-sm text-red-200">
                  {movementsError}
                </div>
              ) : null}

              {loadingMovements ? (
                <div className="flex flex-1 items-center justify-center text-sm text-text-secondary">Yükleniyor…</div>
              ) : (movementsData?.movements?.length ?? 0) === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <EmptyState
                    icon={<MagnifyingGlassIcon size={48} weight="duotone" />}
                    title="Bu depo için hareket kaydı yok"
                    description="Tarih aralığını genişletip tekrar deneyebilirsiniz."
                  />
                </div>
              ) : (
                <>
                  <div className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-background-border md:flex">
                    <div ref={movementsScrollRef} className="min-h-0 flex-1 overflow-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead className="sticky top-0 z-10 border-b border-background-border">
                          <tr>
                            <th className="bg-background-hover px-2 py-1.5" />
                            <th className="bg-background-hover px-2 py-1.5 text-left font-medium text-text-secondary">Kod</th>
                            <th className="bg-background-hover px-2 py-1.5 text-left font-medium text-text-secondary">Sözleşme</th>
                            <th className="bg-background-hover px-2 py-1.5 text-left font-medium text-text-secondary">Ürün</th>
                            <th className="bg-background-hover px-2 py-1.5 text-center font-medium text-text-secondary">Tip</th>
                            <th className="bg-background-hover px-2 py-1.5 text-left font-medium text-text-secondary">Müşteri</th>
                            <th className="bg-background-hover px-2 py-1.5 text-left font-medium text-text-secondary">Şantiye</th>
                            <th className="bg-background-hover px-2 py-1.5 text-left font-medium text-text-secondary">Çıkış</th>
                            <th className="bg-background-hover px-2 py-1.5 text-right font-medium text-text-secondary">Miktar</th>
                            <th className="bg-background-hover px-2 py-1.5 text-right font-medium text-text-secondary">İade</th>
                            <th className="bg-background-hover px-2 py-1.5 text-right font-medium text-text-secondary">Kalan</th>
                            <th className="bg-background-hover px-2 py-1.5 text-center font-medium text-text-secondary">Durum</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(movementsData?.movements ?? []).map((row, idx) => {
                            const returned = row.totals?.returned ?? 0;
                            const stillOut = row.totals?.stillOut ?? 0;
                            return (
                              <tr
                                key={row.detailId}
                                onClick={() => setSelectedMovementRow(row)}
                                className={`cursor-pointer border-b border-background-border hover:bg-background-hover ${
                                  idx % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'
                                }`}
                              >
                                <td className="w-9 px-2 py-0.5 text-center">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedMovementRow(row);
                                    }}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded font-bold text-primary hover:bg-background-hover"
                                    title="Tam ekranda gör"
                                  >
                                    ⛶
                                  </button>
                                </td>
                                <td className="px-2 py-0.5 font-mono text-text-secondary">{row.item?.ItemCode ?? '—'}</td>
                                <td className="px-2 py-0.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openContractDetail(row);
                                    }}
                                    className="font-medium text-primary hover:underline"
                                  >
                                    {row.contract?.ContractCode ?? `#${row.contract?.ContractId ?? '—'}`}
                                  </button>
                                </td>
                                <td className="px-2 py-0.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openItemDetail(row);
                                    }}
                                    className="font-medium text-primary hover:underline"
                                  >
                                    {row.item?.ItemName ?? '—'}
                                  </button>
                                </td>
                                <td className="px-2 py-0.5 text-center">{renderTypeBadge(row.contract?.Type)}</td>
                                <td className="px-2 py-0.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openCustomerDetail(row);
                                    }}
                                    className="text-primary hover:underline"
                                  >
                                    {row.customer?.CustomerName ?? '—'}
                                  </button>
                                </td>
                                <td className="px-2 py-0.5">{row.site?.SiteName ?? <span className="text-text-secondary">—</span>}</td>
                                <td className="px-2 py-0.5">{formatDateTr(row.dispatch?.dispatchDate)}</td>
                                <td className="px-2 py-0.5 text-right tabular-nums">{formatInt(row.dispatch?.rentedQuantity ?? 0)}</td>
                                <td className="px-2 py-0.5 text-right tabular-nums">{formatInt(returned)}</td>
                                <td className="px-2 py-0.5 text-right">{renderStillOut(stillOut)}</td>
                                <td className="px-2 py-0.5 text-center">{renderStatus(Boolean(row.contract?.isCompleted))}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="shrink-0 border-t border-background-border bg-background-hover px-2 py-1 text-xs text-text-secondary">
                      {(movementsData?.movements ?? []).length} hareket satırı
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 space-y-2 overflow-auto md:hidden">
                    {(movementsData?.movements ?? []).map((row) => {
                      const returned = row.totals?.returned ?? 0;
                      const stillOut = row.totals?.stillOut ?? 0;
                      const contractCompleted = Boolean(row.contract?.isCompleted);
                      return (
                        <div key={row.detailId} className="rounded border border-background-border bg-background-panel p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <button type="button" onClick={() => openItemDetail(row)} className="text-sm font-medium text-primary hover:underline">
                                {row.item?.ItemName ?? '—'}
                              </button>
                              <div className="mt-0.5 text-xs text-text-secondary">
                                {row.item?.ItemCode ?? '—'} · {row.contract?.ContractCode ?? `#${row.contract?.ContractId ?? '—'}`}
                              </div>
                            </div>
                            {renderStatus(contractCompleted)}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {renderTypeBadge(row.contract?.Type)}
                            <span className="text-xs text-text-secondary">{row.site?.SiteName ?? '—'}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <div className="text-text-secondary">Müşteri</div>
                              <button type="button" onClick={() => openCustomerDetail(row)} className="text-primary hover:underline">
                                {row.customer?.CustomerName ?? '—'}
                              </button>
                            </div>
                            <div>
                              <div className="text-text-secondary">Çıkış</div>
                              <div>{formatDateTr(row.dispatch?.dispatchDate)}</div>
                            </div>
                            <div>
                              <div className="text-text-secondary">Miktar</div>
                              <div className="tabular-nums">{formatInt(row.dispatch?.rentedQuantity ?? 0)}</div>
                            </div>
                            <div>
                              <div className="text-text-secondary">Kalan</div>
                              <div>{renderStillOut(stillOut)}</div>
                            </div>
                            <div>
                              <div className="text-text-secondary">İade</div>
                              <div className="tabular-nums">{formatInt(returned)}</div>
                            </div>
                            <div>
                              <div className="text-text-secondary">Sözleşme</div>
                              <button type="button" onClick={() => openContractDetail(row)} className="text-primary hover:underline">
                                {row.contract?.ContractCode ?? `#${row.contract?.ContractId ?? '—'}`}
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedMovementRow(row)}
                            className="btn-secondary mt-3 w-full py-2 px-3 text-sm"
                          >
                            Tam ekranda gör
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
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

      <ConfirmModal
        open={showDeleteConfirm}
        title="Depoyu kullanımdan kaldırmak istiyor musunuz?"
        message={
          warehouse
            ? `"${warehouse.WarehouseName}" deposu kullanımdan kaldırılacak.\n\nBu depo geçmiş kayıtlarda kullanılmış olabilir. Kullanımdan kaldırıldığında yeni işlemlerde seçilemez; geçmiş sözleşme ve hareket kayıtları korunur.\n\nHiç kullanılmamış boş depolar tamamen silinir. Devam etmek istiyor musunuz?`
            : ''
        }
        variant="danger"
        loading={deleteBusy}
        confirmLabel="Kullanımdan Kaldır"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmModal
        open={Boolean(deactivateError)}
        title={deactivateError?.title ?? ''}
        message={deactivateError?.message ?? ''}
        variant="danger"
        confirmLabel={deactivateError?.actionLabel ?? 'Tamam'}
        cancelLabel="Kapat"
        onConfirm={() => {
          deactivateError?.onAction?.();
          setDeactivateError(null);
        }}
        onCancel={() => setDeactivateError(null)}
      />
    </div>
  );
}

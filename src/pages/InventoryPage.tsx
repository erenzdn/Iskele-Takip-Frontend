import { useState, useEffect, useMemo, useCallback, useRef, type MouseEvent } from 'react';
import { MagnifyingGlassIcon, PackageIcon } from '@phosphor-icons/react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { inventoryService } from '../services/inventoryService';
import { subcategoryService } from '../services/subcategoryService';
import { Inventory, MaterialCategory, isInventoryArchived } from '../models';
import { formatShortDateTime } from '../utils/formatters';
import { getInventoryDeleteErrorMessage, getInventoryRestoreErrorResult } from '../utils/apiError';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { toast } from '../hooks/useToast';
import EmptyState from '../components/EmptyState';
import ExcelManager from '../components/ExcelManager';
import InventoryDetailModal from '../components/modals/InventoryDetailModal';
import CategoryDetailModal from '../components/modals/CategoryDetailModal';
import ConfirmModal from '../components/modals/ConfirmModal';
import { useAuthStore } from '../store/authStore';
import { useArchivePreferencesStore } from '../store/archivePreferencesStore';
import { useTableColumnPreferencesStore } from '../store/tableColumnPreferencesStore';
import {
  INVENTORY_TABLE_COLUMNS,
  getVisibleColumnWidths,
  type InventoryColumnKey,
} from '../constants/tableColumns';
import { useContextMenu, useContextMenuHandlers, type ContextMenuActionHandlers, type ScaffoldRowTarget } from '../context-menu';
import { useHeaderActions } from '../layouts/HeaderActionsContext';

type StockStatusFilter = 'all' | 'onRent' | 'available';

function parseStockStatus(value: string | null): StockStatusFilter {
  if (value === 'onRent' || value === 'available') return value;
  return 'all';
}

export default function InventoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const permissions = user?.permissions ?? [];
  const canUpdate = permissions.includes('inventory_update');
  const canDelete = permissions.includes('inventory_delete');
  const [allInventory, setAllInventory] = useState<Inventory[]>([]);
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<MaterialCategory | null>(null);
  const [selectedSubCategories, setSelectedSubCategories] = useState<string[]>(
    Array.from({ length: 6 }, () => '')
  );
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Inventory | null>(null);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isNewItem, setIsNewItem] = useState(false);
  const [startItemInEditMode, setStartItemInEditMode] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MaterialCategory | null>(null);
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebouncedValue(searchText, 300);
  const [minAvailable, setMinAvailable] = useState<number | ''>('');
  const [maxAvailable, setMaxAvailable] = useState<number | ''>('');
  const [stockStatus, setStockStatus] = useState<StockStatusFilter>(() =>
    parseStockStatus(searchParams.get('stockStatus'))
  );
  const [selectedLanguage, setSelectedLanguage] = useState<'tr' | 'en'>('tr');
  const [listLoading, setListLoading] = useState(false);
  const inventoryColumnVisibility = useTableColumnPreferencesStore((s) => s.inventory);
  const showArchived = useArchivePreferencesStore((s) => s.showArchivedInventory);
  const [categoriesReady, setCategoriesReady] = useState(false);
  const [subCategoryOptions, setSubCategoryOptions] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const inventoryColumnWidths = useMemo(() => {
    const base = getVisibleColumnWidths(INVENTORY_TABLE_COLUMNS, inventoryColumnVisibility);
    const reservedPct =
      (selectionMode ? 4 : 0) + (showArchived && canDelete ? 8 : 0);
    if (reservedPct <= 0) return base;
    const scale = (100 - reservedPct) / 100;
    const scaled: Partial<Record<InventoryColumnKey, number>> = {};
    for (const [key, pct] of Object.entries(base) as [InventoryColumnKey, number][]) {
      scaled[key] = pct * scale;
    }
    return scaled;
  }, [inventoryColumnVisibility, selectionMode, showArchived, canDelete]);
  const isInventoryColVisible = (key: InventoryColumnKey) => inventoryColumnVisibility[key];
  const inventoryColWidthStyle = (key: InventoryColumnKey) => {
    const pct = inventoryColumnWidths[key];
    return pct != null ? { width: `${pct}%` } : undefined;
  };
  const [restoreTarget, setRestoreTarget] = useState<{ itemId: number; itemName: string } | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreConflictMessage, setRestoreConflictMessage] = useState<string | null>(null);
  const { openContextMenu } = useContextMenu();
  const { setActions } = useHeaderActions();
  const consumedOpenItemIdRef = useRef<number | null>(null);
  const fetchingOpenItemByIdRef = useRef<number | null>(null);
  const hadFirstListLoadRef = useRef(false);
  const returnOnCloseRef = useRef<boolean>(false);
  const returnToRef = useRef<{ path: string; state?: any } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const catData = await inventoryService.getAllCategoriesAsync();
        if (!cancelled) setCategories(catData);
      } catch (error) {
        console.error('Load categories error:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setCategoriesReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!categoriesReady) return;
    let cancelled = false;
    (async () => {
      try {
        setListLoading(true);
        const invData = await inventoryService.getAllAsync({
          categoryId: selectedCategory?.CategoryId,
          search: debouncedSearch.trim() || undefined,
          includeArchived: showArchived || undefined,
        });
        if (!cancelled) {
          setAllInventory(invData);
          hadFirstListLoadRef.current = true;
        }
      } catch (error) {
        console.error('Load inventory error:', error);
        if (!cancelled) setAllInventory([]);
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categoriesReady, selectedCategory, debouncedSearch, showArchived]);

  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      setListLoading(true);
      const [invData, catData] = await Promise.all([
        inventoryService.getAllAsync(
          {
            categoryId: selectedCategory?.CategoryId,
            search: debouncedSearch.trim() || undefined,
            includeArchived: showArchived || undefined,
          },
          { forceRefresh }
        ),
        inventoryService.getAllCategoriesAsync(),
      ]);
      setAllInventory(invData);
      setCategories(catData);
      hadFirstListLoadRef.current = true;
    } catch (error) {
      console.error('Load inventory error:', error);
    } finally {
      setListLoading(false);
    }
  }, [debouncedSearch, selectedCategory?.CategoryId, showArchived]);

  const toggleSelection = useCallback((itemId: number) => {
    setSelectionMode(true);
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  }, []);

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedItemIds([]);
  }, []);

  useEffect(() => {
    setStockStatus(parseStockStatus(searchParams.get('stockStatus')));
  }, [searchParams]);

  const updateStockStatus = useCallback(
    (next: StockStatusFilter) => {
      setStockStatus(next);
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === 'all') params.delete('stockStatus');
          else params.set('stockStatus', next);
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const filteredInventory = useMemo(() => {
    return allInventory.filter((item) => {
      const activeSubCategories = selectedSubCategories.filter(Boolean);
      const matchesSubCategory =
        activeSubCategories.length === 0 ||
        item.SubCategories?.some((sc) => activeSubCategories.includes(sc.SubCategoryName));

      const availableStock = item.TotalStock - item.OnRent;
      const matchesMin = minAvailable === '' || availableStock >= minAvailable;
      const matchesMax = maxAvailable === '' || availableStock <= maxAvailable;

      const matchesLanguage = selectedLanguage === 'tr' || (selectedLanguage === 'en' && Boolean(item.ItemNameEn));

      const matchesStockStatus =
        stockStatus === 'all' ||
        (stockStatus === 'onRent' && (item.OnRent ?? 0) > 0) ||
        (stockStatus === 'available' && availableStock > 0);

      return matchesSubCategory && matchesMin && matchesMax && matchesLanguage && matchesStockStatus;
    });
  }, [allInventory, selectedSubCategories, minAvailable, maxAvailable, selectedLanguage, stockStatus]);

  const selectAllFiltered = useCallback(() => {
    setSelectionMode(true);
    setSelectedItemIds(filteredInventory.map((item) => item.ItemId));
  }, [filteredInventory]);

  const handleAddNewItem = useCallback(() => {
    setSelectedItem(null);
    setIsNewItem(true);
    setStartItemInEditMode(true);
    setIsItemModalOpen(true);
  }, []);

  const handleAddCategory = useCallback(() => {
    setEditingCategory(null);
    setIsCategoryModalOpen(true);
  }, []);

  const handleEditCategory = useCallback((cat: MaterialCategory | null) => {
    if (!cat) {
      toast.warning('Düzenlemek için önce bir kategori seçin');
      return;
    }
    setEditingCategory(cat);
    setIsCategoryModalOpen(true);
  }, []);

  const handleOpenItemDetail = (item: Inventory, options?: { startInEditMode?: boolean }) => {
    setSelectedItem(item);
    setIsNewItem(false);
    setStartItemInEditMode(Boolean(options?.startInEditMode));
    setIsItemModalOpen(true);
  };

  useEffect(() => {
    const st = location.state as any;
    const openItemId = st?.openItemId;
    if (!openItemId) return;
    const idNum = Number(openItemId);
    if (!Number.isFinite(idNum) || idNum <= 0) return;
    if (consumedOpenItemIdRef.current === idNum) return;

    const found = allInventory.find((i) => i.ItemId === idNum);
    if (found) {
      consumedOpenItemIdRef.current = idNum;
      returnOnCloseRef.current = Boolean(st?.returnOnClose);
      const rt = st?.returnTo;
      returnToRef.current = rt && typeof rt.path === 'string' ? rt : null;
      handleOpenItemDetail(found);
      navigate(location.pathname + location.search, { replace: true, state: null });
      return;
    }

    if (listLoading || !hadFirstListLoadRef.current) return;
    if (fetchingOpenItemByIdRef.current === idNum) return;

    fetchingOpenItemByIdRef.current = idNum;
    void inventoryService
      .getByIdAsync(idNum)
      .then((item) => {
        fetchingOpenItemByIdRef.current = null;
        if (consumedOpenItemIdRef.current === idNum) return;
        consumedOpenItemIdRef.current = idNum;
        returnOnCloseRef.current = Boolean(st?.returnOnClose);
        const rt = st?.returnTo;
        returnToRef.current = rt && typeof rt.path === 'string' ? rt : null;
        handleOpenItemDetail(item);
        navigate(location.pathname + location.search, { replace: true, state: null });
      })
      .catch(() => {
        fetchingOpenItemByIdRef.current = null;
        consumedOpenItemIdRef.current = idNum;
        toast.warning('Ürün bulunamadı.');
        navigate(location.pathname + location.search, { replace: true, state: null });
      });
  }, [allInventory, listLoading, handleOpenItemDetail, location.pathname, location.search, location.state, navigate]);

  const openInventoryContextMenu = (event: MouseEvent<HTMLTableRowElement>, item: Inventory) => {
    event.preventDefault();
    openContextMenu({
      menuKey: 'scaffoldRow',
      x: event.clientX,
      y: event.clientY,
      env: { selectionMode },
      target: {
        entityType: 'scaffold',
        entityId: item.ItemId,
        itemName: item.ItemName,
        rawData: {
          ItemId: item.ItemId,
          ItemName: item.ItemName,
          ItemCode: item.ItemCode,
          TotalStock: item.TotalStock,
          OnRent: item.OnRent,
          UnitPrice: item.UnitPrice,
          MonthlyListPrice: item.MonthlyListPrice,
          DeletedAt: item.DeletedAt,
          deletedAt: item.deletedAt,
          IsArchived: item.IsArchived,
          isArchived: item.isArchived,
        },
      },
    });
  };

  const handleItemModalClose = () => {
    setIsItemModalOpen(false);
    setSelectedItem(null);
    setStartItemInEditMode(false);
    if (returnOnCloseRef.current) {
      returnOnCloseRef.current = false;
      const rt = returnToRef.current;
      returnToRef.current = null;
      if (rt?.path) {
        navigate(rt.path, { replace: true, state: rt.state ?? null });
      } else {
        navigate(-1);
      }
      return;
    }
    loadData(true);
  };

  const handleCategoryModalClose = () => {
    setIsCategoryModalOpen(false);
    setEditingCategory(null);
    loadData(true);
  };

  const printInventoryItemPdf = (target: ScaffoldRowTarget) => {
    const availableStock = target.rawData.TotalStock - target.rawData.OnRent;
    const opened = window.open('', '_blank', 'noopener,noreferrer,width=960,height=700');
    if (!opened) {
      toast.warning('PDF penceresi acilamadi. Tarayici popup ayarlarini kontrol edin.');
      return;
    }
    opened.document.write(`
      <html>
        <head>
          <title>${target.itemName} - PDF</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { margin-bottom: 8px; }
            table { border-collapse: collapse; width: 100%; margin-top: 16px; }
            td, th { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
            th { background: #f3f4f6; width: 220px; }
          </style>
        </head>
        <body>
          <h1>Iskele Kaydi</h1>
          <p>Olusturma zamani: ${new Date().toLocaleString('tr-TR')}</p>
          <table>
            <tr><th>Malzeme Adi</th><td>${target.rawData.ItemName}</td></tr>
            <tr><th>Kod</th><td>${target.rawData.ItemCode ?? '-'}</td></tr>
            <tr><th>Toplam Stok</th><td>${target.rawData.TotalStock}</td></tr>
            <tr><th>Kirada</th><td>${target.rawData.OnRent}</td></tr>
            <tr><th>Musait</th><td>${availableStock}</td></tr>
            <tr><th>Birim Fiyat</th><td>${target.rawData.UnitPrice ?? '-'}</td></tr>
            <tr><th>Aylik Liste</th><td>${target.rawData.MonthlyListPrice ?? '-'}</td></tr>
          </table>
        </body>
      </html>
    `);
    opened.document.close();
    opened.focus();
    opened.print();
  };

  const updateInventoryStatus = async (target: ScaffoldRowTarget, status: 'active' | 'passive' | 'maintenance') => {
    const nextOnRent = (() => {
      if (status === 'active') {
        return Math.max(0, Math.min(target.rawData.OnRent, target.rawData.TotalStock - 1));
      }
      if (status === 'passive') {
        return target.rawData.TotalStock;
      }
      return Math.max(target.rawData.OnRent, Math.max(0, target.rawData.TotalStock - 1));
    })();

    await inventoryService.updateAsync(target.entityId, { OnRent: nextOnRent });
    const statusLabel = status === 'active' ? 'Aktif' : status === 'passive' ? 'Pasif' : 'Bakimda';
    toast.success(`${target.itemName} durumu ${statusLabel} olarak guncellendi.`);
    await loadData();
  };

  const updateInventoryStatusByItem = useCallback(
    async (item: Inventory, status: 'active' | 'passive' | 'maintenance') => {
    const nextOnRent = (() => {
      if (status === 'active') {
        return Math.max(0, Math.min(item.OnRent, item.TotalStock - 1));
      }
      if (status === 'passive') {
        return item.TotalStock;
      }
      return Math.max(item.OnRent, Math.max(0, item.TotalStock - 1));
    })();
    await inventoryService.updateAsync(item.ItemId, { OnRent: nextOnRent });
    },
    []
  );

  const applyBulkStatus = useCallback(
    async (status: 'active' | 'passive' | 'maintenance') => {
    if (selectedItemIds.length === 0) {
      toast.warning('Toplu islem icin once satir secin.');
      return;
    }

    const selectedItems = allInventory.filter((item) => selectedItemIds.includes(item.ItemId));
    await Promise.all(selectedItems.map((item) => updateInventoryStatusByItem(item, status)));
    const statusLabel = status === 'active' ? 'Aktif' : status === 'passive' ? 'Pasif' : 'Bakimda';
    toast.success(`${selectedItems.length} kayit ${statusLabel} durumuna guncellendi.`);
    await loadData();
    },
    [allInventory, loadData, selectedItemIds, updateInventoryStatusByItem]
  );

  const applyBulkDelete = useCallback(async () => {
    if (selectedItemIds.length === 0) {
      toast.warning('Toplu işlem için önce satır seçin.');
      return;
    }

    const selectedItems = allInventory.filter((item) => selectedItemIds.includes(item.ItemId));
    const activeItems = selectedItems.filter((item) => !isInventoryArchived(item));
    if (activeItems.length === 0) {
      toast.warning('Seçili kayıtlar zaten pasif durumda.');
      return;
    }
    const onRentItems = activeItems.filter((item) => item.OnRent > 0);
    if (onRentItems.length > 0) {
      toast.warning('Kirada olan ürün pasife alınamaz. Önce iade işlemini tamamlayın.');
      return;
    }

    const confirmDelete = window.confirm(
      `${activeItems.length} adet seçili ürünü listeden kaldırmak (pasife almak) istediğinize emin misiniz? Pasif ürünler yeni teklif ve sözleşmelerde seçilemez; geçmiş kayıtlar korunur.`
    );
    if (!confirmDelete) return;

    try {
      await Promise.all(activeItems.map((item) => inventoryService.deleteAsync(item.ItemId)));
      toast.success('Ürün listeden kaldırıldı.');
      clearSelection();
      await loadData(true);
    } catch (error) {
      console.error('Toplu pasife alma hatası:', error);
      toast.error(getInventoryDeleteErrorMessage(error));
      clearSelection();
      await loadData(true);
    }
  }, [allInventory, clearSelection, loadData, selectedItemIds]);

  const openRestoreConfirm = useCallback((item: Inventory) => {
    if (!canDelete) return;
    setRestoreTarget({ itemId: item.ItemId, itemName: item.ItemName });
    setShowRestoreConfirm(true);
  }, [canDelete]);

  const handleRestoreError = useCallback((error: unknown) => {
    const result = getInventoryRestoreErrorResult(error);
    if (result.severity === 'warning') {
      toast.warning(result.message);
    } else {
      toast.error(result.message);
    }
    if (result.showConflictModal) {
      setRestoreConflictMessage(result.message);
    }
  }, []);

  const handleRestoreConfirm = useCallback(async () => {
    if (!restoreTarget?.itemId || isRestoring) return;
    try {
      setIsRestoring(true);
      const data = await inventoryService.restoreAsync(restoreTarget.itemId);
      toast.success(data.message || 'Ürün aktif listeye geri getirildi.');
      setShowRestoreConfirm(false);
      setRestoreTarget(null);
      await loadData(true);
    } catch (error) {
      console.error('Restore inventory error:', error);
      handleRestoreError(error);
    } finally {
      setIsRestoring(false);
    }
  }, [handleRestoreError, isRestoring, loadData, restoreTarget?.itemId]);

  useContextMenuHandlers(
    'scaffoldRow',
    useMemo<ContextMenuActionHandlers>(
      () => ({
        'scaffold.edit': (target) => {
          if (!canUpdate) return;
          const row = target as ScaffoldRowTarget;
          const item = allInventory.find((inventoryItem) => inventoryItem.ItemId === row.entityId);
          if (!item) {
            toast.warning('Kayıt bulunamadı.');
            return;
          }
          if (isInventoryArchived(item)) {
            handleOpenItemDetail(item, { startInEditMode: false });
            return;
          }
          handleOpenItemDetail(item, { startInEditMode: false });
        },
        'scaffold.stockEntry': (target) => {
          if (!canUpdate) return;
          const row = target as ScaffoldRowTarget;
          const item = allInventory.find((inventoryItem) => inventoryItem.ItemId === row.entityId);
          if (!item) {
            toast.warning('Kayıt bulunamadı.');
            return;
          }
          if (isInventoryArchived(item)) {
            toast.warning('Pasif ürün düzenlenemez.');
            return;
          }
          handleOpenItemDetail(item, { startInEditMode: true });
        },
        'scaffold.movements': (target) => {
          const row = target as ScaffoldRowTarget;
          navigate(`/inventory/${row.entityId}/movements`);
        },
        'scaffold.delete': async (target) => {
          if (!canDelete) return;
          const row = target as ScaffoldRowTarget;
          if (row.rawData.OnRent > 0) {
            toast.warning('Kirada olan ürün pasife alınamaz. Önce iade işlemini tamamlayın.');
            return;
          }
          try {
            await inventoryService.deleteAsync(target.entityId);
            toast.success('Ürün listeden kaldırıldı.');
            await loadData(true);
          } catch (error) {
            toast.error(getInventoryDeleteErrorMessage(error));
          }
        },
        'scaffold.restore': (target) => {
          if (!canDelete) return;
          const row = target as ScaffoldRowTarget;
          const item = allInventory.find((inventoryItem) => inventoryItem.ItemId === row.entityId);
          if (!item) {
            toast.warning('Kayıt bulunamadı.');
            return;
          }
          openRestoreConfirm(item);
        },
        'scaffold.selection.toggle': (target) => {
          const row = target as ScaffoldRowTarget;
          setSelectionMode(true);
          toggleSelection(row.entityId);
        },
        'scaffold.selection.selectAll': () => {
          setSelectionMode(true);
          selectAllFiltered();
        },
        'scaffold.selection.clear': () => {
          clearSelection();
        },
        'scaffold.exportPdf': (target) => {
          printInventoryItemPdf(target as ScaffoldRowTarget);
        },
        'scaffold.status.active': async (target) => {
          if (!canUpdate) return;
          await updateInventoryStatus(target as ScaffoldRowTarget, 'active');
        },
        'scaffold.status.passive': async (target) => {
          if (!canUpdate) return;
          await updateInventoryStatus(target as ScaffoldRowTarget, 'passive');
        },
        'scaffold.status.maintenance': async (target) => {
          if (!canUpdate) return;
          await updateInventoryStatus(target as ScaffoldRowTarget, 'maintenance');
        },
      }),
      [allInventory, canDelete, canUpdate, filteredInventory, openRestoreConfirm]
    )
  );

  const formatMoneyCustom = (amount: number, currency: 'TRY' | 'EUR' | 'USD') => {
    const formatted = new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    const symbols = { TRY: '₺', EUR: '€', USD: '$' };
    return `${formatted} ${symbols[currency]}`;
  };
  const formatTry = (amount: number) => formatMoneyCustom(amount, 'TRY');
  const formatEur = (amount: number) => formatMoneyCustom(amount, 'EUR');
  const formatUsd = (amount: number) => formatMoneyCustom(amount, 'USD');

  useEffect(() => {
    let cancelled = false;
    subcategoryService
      .getAllAsync(selectedCategory?.CategoryId)
      .then((rows) => {
        if (cancelled) return;
        const names = Array.from(
          new Set(
            rows
              .map((r) => r.SubCategoryName?.trim())
              .filter((name): name is string => Boolean(name))
          )
        ).sort((a, b) => a.localeCompare(b, 'tr-TR'));
        setSubCategoryOptions(names);
      })
      .catch(() => {
        if (!cancelled) setSubCategoryOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCategory]);

  const headerActions = useMemo(
    () => (
      <>
        {selectedItemIds.length > 0 ? (
          <>
            <button onClick={clearSelection} className="btn-secondary py-2 px-3 text-sm">
              Secimi Temizle ({selectedItemIds.length})
            </button>
            <button
              onClick={selectAllFiltered}
              disabled={filteredInventory.length === 0}
              className="btn-secondary py-2 px-3 text-sm disabled:opacity-50"
            >
              Tümünü Seç
            </button>
            {canUpdate ? (
              <>
                <button
                  onClick={() => void applyBulkStatus('active')}
                  className="btn-secondary py-2 px-3 text-sm"
                >
                  Toplu Aktif
                </button>
                <button
                  onClick={() => void applyBulkStatus('passive')}
                  className="btn-secondary py-2 px-3 text-sm"
                >
                  Toplu Pasif
                </button>
                <button
                  onClick={() => void applyBulkStatus('maintenance')}
                  className="btn-secondary py-2 px-3 text-sm"
                >
                  Toplu Bakimda
                </button>
              </>
            ) : null}
            {canDelete ? (
              <button onClick={() => void applyBulkDelete()} className="btn-secondary py-2 px-3 text-sm">
                Toplu Listeden Kaldır
              </button>
            ) : null}
          </>
        ) : (
          <button
            onClick={selectAllFiltered}
            disabled={filteredInventory.length === 0}
            className="btn-secondary py-2 px-3 text-sm disabled:opacity-50"
          >
            Tümünü Seç
          </button>
        )}
        <button onClick={() => void loadData(true)} className="btn-secondary py-2 px-3 text-sm">
          Yenile
        </button>
        <ExcelManager type="inventory" onImportSuccess={() => void loadData(true)} />
        <button onClick={handleAddCategory} className="btn-secondary py-2 px-3 text-sm">
          + Kategori Ekle
        </button>
        <button onClick={handleAddNewItem} className="btn-primary py-2 px-3 text-sm">
          + Yeni Malzeme
        </button>
      </>
    ),
    [
      selectedItemIds.length,
      clearSelection,
      selectAllFiltered,
      filteredInventory,
      canUpdate,
      applyBulkStatus,
      canDelete,
      applyBulkDelete,
      loadData,
      handleAddCategory,
      handleAddNewItem,
    ]
  );

  useEffect(() => {
    setActions(headerActions);
    return () => setActions(null);
  }, [headerActions, setActions]);

  useEffect(() => {
    setSelectedItemIds((prev) => prev.filter((id) => allInventory.some((item) => item.ItemId === id)));
  }, [allInventory]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 rounded border border-background-border bg-background-panel p-2">
        <div className="mb-1.5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setSearchText('');
              setSelectedCategory(null);
              setSelectedSubCategories(Array.from({ length: 6 }, () => ''));
              setMinAvailable('');
              setMaxAvailable('');
              setSelectedLanguage('tr');
              updateStockStatus('all');
            }}
            className="btn-secondary py-1.5 px-3 text-xs"
          >
            Filtreleri Sıfırla
          </button>
          <button
            type="button"
            onClick={() => handleEditCategory(selectedCategory)}
            className="btn-secondary py-1.5 px-3 text-xs"
            title={selectedCategory ? 'Kategoriyi düzenle' : 'Önce bir kategori seçin'}
          >
            Kategori Yönet
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-1.5">
          <div className="relative lg:col-span-3">
            <span className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-text-secondary">
              <MagnifyingGlassIcon size={14} weight="regular" color="currentColor" aria-hidden />
            </span>
            <input
              type="text"
              className="input w-full pl-7 py-2 text-sm"
              placeholder="Ürün kodu veya malzeme adı (sunucu araması)…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>

          <div className="lg:col-span-2">
            <select
              value={selectedCategory?.CategoryId || ''}
              onChange={(e) => {
                const cat = categories.find((c) => c.CategoryId === Number(e.target.value));
                setSelectedCategory(cat || null);
              }}
              className="input py-2 px-3 text-sm w-full"
            >
              <option value="">Tüm Kategoriler</option>
              {categories.map((cat) => (
                <option key={cat.CategoryId} value={cat.CategoryId}>
                  {cat.CategoryName}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <select
              value={stockStatus}
              onChange={(e) => updateStockStatus(parseStockStatus(e.target.value))}
              className="input py-2 px-3 text-sm w-full"
              title="Stok durumu"
            >
              <option value="all">Tüm stok durumları</option>
              <option value="onRent">Kirada</option>
              <option value="available">Müsait</option>
            </select>
          </div>

          <div className="lg:col-span-1">
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value as 'tr' | 'en')}
              className="input py-2 px-3 text-sm w-full"
            >
              <option value="tr">TR</option>
              <option value="en">EN</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <input
              type="number"
              className="input py-2 px-3 text-sm w-full"
              min={0}
              placeholder="Min müsait"
              value={minAvailable === '' ? '' : minAvailable}
              onChange={(e) => setMinAvailable(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>

          <div className="lg:col-span-2">
            <input
              type="number"
              className="input py-2 px-3 text-sm w-full"
              min={0}
              placeholder="Max müsait"
              value={maxAvailable === '' ? '' : maxAvailable}
              onChange={(e) => setMaxAvailable(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
        </div>

        <div className="mt-1.5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-1.5">
          {selectedSubCategories.map((value, index) => (
            <select
              key={`sub-category-${index}`}
              value={value}
              onChange={(e) =>
                setSelectedSubCategories((prev) =>
                  prev.map((item, i) => (i === index ? e.target.value : item))
                )
              }
              className="input py-2 px-2 text-sm w-full"
            >
              <option value="">Alt Kategori {index + 1}</option>
              {subCategoryOptions.map((subCategoryName) => (
                <option key={`${index}-${subCategoryName}`} value={subCategoryName}>
                  {subCategoryName}
                </option>
              ))}
            </select>
          ))}
        </div>
      </div>

      {listLoading && allInventory.length === 0 ? (
        <div className="py-8 flex items-center justify-center text-text-secondary text-sm">Liste yükleniyor…</div>
      ) : filteredInventory.length === 0 ? (
        <EmptyState
          icon={<PackageIcon size={48} weight="duotone" />}
          title={
            allInventory.length === 0
              ? 'Henüz envanter kalemi bulunmuyor'
              : stockStatus === 'onRent'
                ? 'Kirada ürün yok'
                : stockStatus === 'available'
                  ? 'Müsait ürün yok'
                  : 'Filtrelere uygun kayıt yok'
          }
          description={
            allInventory.length === 0
              ? 'Önce kategori, sonra malzeme ekleyin'
              : stockStatus === 'onRent'
                ? 'Şu an kirada görünen malzeme bulunmuyor. Filtreyi değiştirmeyi deneyin.'
                : 'Arama, stok durumu veya alt kategori filtrelerini gevşetmeyi deneyin'
          }
        />
      ) : (
        <div
          className={`border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col ${listLoading ? 'opacity-80' : ''}`}
        >
          <div className="overflow-y-auto overflow-x-hidden max-h-[calc(100vh-180px)] min-h-[320px]">
            <table className="w-full table-fixed text-xs border-collapse">
              <thead className="sticky top-0 z-10 border-b border-background-border">
                <tr>
                  {selectionMode ? (
                    <th className="text-center py-0.5 px-1.5 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover w-10">
                      <input
                        type="checkbox"
                        checked={
                          filteredInventory.length > 0 &&
                          filteredInventory.every((item) => selectedItemIds.includes(item.ItemId))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            selectAllFiltered();
                          } else {
                            clearSelection();
                          }
                        }}
                        className="w-3.5 h-3.5 align-middle cursor-pointer"
                        title="Tümünü Seç / Seçimi Kaldır"
                      />
                    </th>
                  ) : null}
                  {isInventoryColVisible('itemCode') ? (
                    <th
                      className="text-left py-0.5 px-1.5 font-medium text-text-secondary border-r border-background-border last:border-r-0 bg-background-hover truncate"
                      style={inventoryColWidthStyle('itemCode')}
                    >
                      Ürün Kodu
                    </th>
                  ) : null}
                  {isInventoryColVisible('itemName') ? (
                    <th
                      className="text-left py-0.5 px-1.5 font-medium text-text-secondary border-r border-background-border last:border-r-0 bg-background-hover truncate"
                      style={inventoryColWidthStyle('itemName')}
                    >
                      Ürün Adı
                    </th>
                  ) : null}
                  {isInventoryColVisible('weight') ? (
                    <th
                      className="text-right py-0.5 px-1.5 font-medium text-text-secondary border-r border-background-border last:border-r-0 bg-background-hover truncate"
                      style={inventoryColWidthStyle('weight')}
                    >
                      Ağırlık
                    </th>
                  ) : null}
                  {isInventoryColVisible('unit') ? (
                    <th
                      className="text-left py-0.5 px-1.5 font-medium text-text-secondary border-r border-background-border last:border-r-0 bg-background-hover truncate"
                      style={inventoryColWidthStyle('unit')}
                    >
                      Ana Birim
                    </th>
                  ) : null}
                  {isInventoryColVisible('monthlyListPrice') ? (
                    <th
                      className="text-right py-0.5 px-1.5 font-medium text-text-secondary border-r border-background-border last:border-r-0 bg-background-hover truncate"
                      style={inventoryColWidthStyle('monthlyListPrice')}
                    >
                      Aylık Liste (₺)
                    </th>
                  ) : null}
                  {isInventoryColVisible('unitPriceTry') ? (
                    <th
                      className="text-right py-0.5 px-1.5 font-medium text-text-secondary border-r border-background-border last:border-r-0 bg-background-hover truncate"
                      style={inventoryColWidthStyle('unitPriceTry')}
                    >
                      Birim (₺)
                    </th>
                  ) : null}
                  {isInventoryColVisible('unitPriceUsd') ? (
                    <th
                      className="text-right py-0.5 px-1.5 font-medium text-text-secondary border-r border-background-border last:border-r-0 bg-background-hover truncate"
                      style={inventoryColWidthStyle('unitPriceUsd')}
                    >
                      Birim ($)
                    </th>
                  ) : null}
                  {isInventoryColVisible('unitPriceEur') ? (
                    <th
                      className="text-right py-0.5 px-1.5 font-medium text-text-secondary border-r border-background-border last:border-r-0 bg-background-hover truncate"
                      style={inventoryColWidthStyle('unitPriceEur')}
                    >
                      Birim (€)
                    </th>
                  ) : null}
                  {isInventoryColVisible('status') ? (
                    <th
                      className="text-center py-0.5 px-1.5 font-medium text-text-secondary border-r border-background-border last:border-r-0 bg-background-hover truncate"
                      style={inventoryColWidthStyle('status')}
                    >
                      Durum
                    </th>
                  ) : null}
                  {showArchived && canDelete ? (
                    <th className="text-center py-0.5 px-1.5 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover w-24">
                      İşlem
                    </th>
                  ) : null}
                  {isInventoryColVisible('audit') ? (
                    <th
                      className="text-left py-0.5 px-1.5 font-medium text-text-secondary bg-background-hover truncate"
                      style={inventoryColWidthStyle('audit')}
                    >
                      Kayıt Bilgisi
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((item, index) => {
                  const archived = isInventoryArchived(item);
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
                  const displayName =
                    selectedLanguage === 'tr' ? item.ItemName : item.ItemNameEn || item.ItemName;
                  const auditText = `${item.CreatedByUserFullName || item.CreatedByUserName || '-'} • ${formatShortDateTime(item.CreatedAt)}`;
                  return (
                    <tr
                      key={item.ItemId}
                      className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${
                        archived ? 'opacity-60 bg-background-secondary/50' : ''
                      } ${selectedItemIds.includes(item.ItemId) ? 'bg-primary/10' : !archived && index % 2 === 0 ? 'bg-background-panel' : !archived ? 'bg-background-secondary/35' : ''}`}
                      onClick={() => handleOpenItemDetail(item)}
                      onContextMenu={(event) => openInventoryContextMenu(event, item)}
                    >
                      {selectionMode ? (
                        <td className="py-0 px-1.5 text-center align-middle border-r border-background-border/60 last:border-r-0">
                          <input
                            type="checkbox"
                            checked={selectedItemIds.includes(item.ItemId)}
                            onClick={(event) => event.stopPropagation()}
                            onChange={() => toggleSelection(item.ItemId)}
                            className="w-3.5 h-3.5"
                          />
                        </td>
                      ) : null}
                      {isInventoryColVisible('itemCode') ? (
                        <td className="py-0 px-1.5 align-middle border-r border-background-border/60 last:border-r-0 overflow-hidden">
                          {item.ItemCode ? (
                            <span className="font-mono font-medium text-accent bg-accent/10 px-1 py-0.5 rounded truncate inline-block max-w-full" title={item.ItemCode}>
                              {item.ItemCode}
                            </span>
                          ) : (
                            <span className="text-text-secondary">-</span>
                          )}
                        </td>
                      ) : null}
                      {isInventoryColVisible('itemName') ? (
                        <td className="py-0 px-1.5 align-middle border-r border-background-border/60 last:border-r-0 overflow-hidden">
                          <div className="font-medium text-text-primary leading-tight flex items-center gap-1 min-w-0">
                            <span className="truncate" title={displayName}>
                              {displayName}
                            </span>
                            {archived ? (
                              <span className="shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-900/40 text-amber-100 border border-amber-700/50">
                                Pasif
                              </span>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                      {isInventoryColVisible('weight') ? (
                        <td className="py-0 px-1.5 text-right align-middle border-r border-background-border/60 last:border-r-0 tabular-nums truncate">
                          {item.Weight != null ? `${item.Weight} kg` : '-'}
                        </td>
                      ) : null}
                      {isInventoryColVisible('unit') ? (
                        <td className="py-0 px-1.5 align-middle border-r border-background-border/60 last:border-r-0 truncate" title={item.UnitName ?? undefined}>
                          {item.UnitName ?? '-'}
                        </td>
                      ) : null}
                      {isInventoryColVisible('monthlyListPrice') ? (
                        <td className="py-0 px-1.5 text-right align-middle border-r border-background-border/60 last:border-r-0 text-success tabular-nums truncate">
                          {item.MonthlyListPrice != null ? formatTry(item.MonthlyListPrice) : '-'}
                        </td>
                      ) : null}
                      {isInventoryColVisible('unitPriceTry') ? (
                        <td className="py-0 px-1.5 text-right align-middle border-r border-background-border/60 last:border-r-0 text-info tabular-nums truncate">
                          {item.UnitPrice != null
                            ? formatTry(item.UnitPrice)
                            : item.PurchasePrice != null
                              ? formatTry(item.PurchasePrice)
                              : '-'}
                        </td>
                      ) : null}
                      {isInventoryColVisible('unitPriceUsd') ? (
                        <td className="py-0 px-1.5 text-right align-middle border-r border-background-border/60 last:border-r-0 text-info tabular-nums truncate">
                          {item.UnitPriceUsd != null ? formatUsd(item.UnitPriceUsd) : '-'}
                        </td>
                      ) : null}
                      {isInventoryColVisible('unitPriceEur') ? (
                        <td className="py-0 px-1.5 text-right align-middle border-r border-background-border/60 last:border-r-0 text-info tabular-nums truncate">
                          {item.UnitPriceEur != null ? formatEur(item.UnitPriceEur) : '-'}
                        </td>
                      ) : null}
                      {isInventoryColVisible('status') ? (
                        <td className="py-0 px-1.5 text-center align-middle border-r border-background-border/60 last:border-r-0 overflow-hidden">
                          {statusBadge}
                        </td>
                      ) : null}
                      {showArchived && canDelete ? (
                        <td className="py-0 px-1.5 text-center align-middle border-r border-background-border/60 last:border-r-0">
                          {archived ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openRestoreConfirm(item);
                              }}
                              disabled={isRestoring && restoreTarget?.itemId === item.ItemId}
                              className="btn-primary py-0.5 px-2 text-[11px] disabled:opacity-50"
                              aria-label={`Geri getir: ${item.ItemName}`}
                            >
                              {isRestoring && restoreTarget?.itemId === item.ItemId
                                ? 'İşleniyor...'
                                : 'Geri Getir'}
                            </button>
                          ) : (
                            <span className="text-text-secondary/50">—</span>
                          )}
                        </td>
                      ) : null}
                      {isInventoryColVisible('audit') ? (
                        <td
                          className="py-0 px-1.5 align-middle text-text-secondary border-r border-background-border/60 last:border-r-0 truncate"
                          title={auditText}
                        >
                          {auditText}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex items-center justify-between shrink-0">
            <span className="flex items-center gap-2">
              Toplam: {filteredInventory.length} kalem
              {selectedItemIds.length > 0 ? <span className="text-primary">Secili: {selectedItemIds.length}</span> : null}
              {listLoading ? <span className="text-accent">Güncelleniyor…</span> : null}
            </span>
            <span className="text-text-secondary/80">Ekranda yaklaşık 25–40 satır görünür (pencere boyutuna göre)</span>
          </div>
        </div>
      )}

      {isItemModalOpen && (
        <InventoryDetailModal
          item={selectedItem}
          categories={categories}
          isNew={isNewItem}
          startInEditMode={startItemInEditMode}
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

      <ConfirmModal
        open={showRestoreConfirm}
        title="Ürünü aktif listeye geri getir"
        message={
          restoreTarget
            ? `"${restoreTarget.itemName}" ürününü aktif listeye geri getirmek istediğinize emin misiniz? Ürün tekrar teklif ve sözleşmelerde seçilebilir hale gelir.`
            : ''
        }
        confirmLabel="Geri Getir"
        cancelLabel="İptal"
        loading={isRestoring}
        onConfirm={() => void handleRestoreConfirm()}
        onCancel={() => {
          if (isRestoring) return;
          setShowRestoreConfirm(false);
          setRestoreTarget(null);
        }}
      />

      <ConfirmModal
        open={Boolean(restoreConflictMessage)}
        title="Ürün geri getirilemedi"
        message={restoreConflictMessage ?? ''}
        confirmLabel="Tamam"
        singleAction
        onConfirm={() => setRestoreConflictMessage(null)}
        onCancel={() => setRestoreConflictMessage(null)}
      />
    </div>
  );
}

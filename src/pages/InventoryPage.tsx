import { useState, useEffect, useMemo, useCallback, useRef, type MouseEvent } from 'react';
import { MagnifyingGlassIcon, PackageIcon } from '@phosphor-icons/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { inventoryService } from '../services/inventoryService';
import { subcategoryService } from '../services/subcategoryService';
import { Inventory, MaterialCategory } from '../models';
import { formatInventoryBilingualLabel, formatMoney, formatShortDateTime } from '../utils/formatters';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { toast } from '../hooks/useToast';
import EmptyState from '../components/EmptyState';
import ExcelManager from '../components/ExcelManager';
import InventoryDetailModal from '../components/modals/InventoryDetailModal';
import CategoryDetailModal from '../components/modals/CategoryDetailModal';
import { useAuthStore } from '../store/authStore';
import { useContextMenu, useContextMenuHandlers, type ScaffoldRowTarget } from '../context-menu';
import { useHeaderActions } from '../layouts/HeaderActionsContext';

export default function InventoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [listLoading, setListLoading] = useState(false);
  const [categoriesReady, setCategoriesReady] = useState(false);
  const [subCategoryOptions, setSubCategoryOptions] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const { openContextMenu } = useContextMenu();
  const { setActions } = useHeaderActions();
  const consumedOpenItemIdRef = useRef<number | null>(null);
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
        });
        if (!cancelled) setAllInventory(invData);
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
  }, [categoriesReady, selectedCategory, debouncedSearch]);

  const loadData = useCallback(async () => {
    try {
      setListLoading(true);
      const [invData, catData] = await Promise.all([
        inventoryService.getAllAsync({
          categoryId: selectedCategory?.CategoryId,
          search: debouncedSearch.trim() || undefined,
        }),
        inventoryService.getAllCategoriesAsync(),
      ]);
      setAllInventory(invData);
      setCategories(catData);
    } catch (error) {
      console.error('Load inventory error:', error);
    } finally {
      setListLoading(false);
    }
  }, [debouncedSearch, selectedCategory?.CategoryId]);

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

  const filteredInventory = useMemo(() => {
    return allInventory.filter((item) => {
      const activeSubCategories = selectedSubCategories.filter(Boolean);
      const matchesSubCategory =
        activeSubCategories.length === 0 ||
        item.SubCategories?.some((sc) => activeSubCategories.includes(sc.SubCategoryName));

      const availableStock = item.TotalStock - item.OnRent;
      const matchesMin = minAvailable === '' || availableStock >= minAvailable;
      const matchesMax = maxAvailable === '' || availableStock <= maxAvailable;

      return matchesSubCategory && matchesMin && matchesMax;
    });
  }, [allInventory, selectedSubCategories, minAvailable, maxAvailable]);

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
      // State'i temizle: modal kapanınca liste yenilenince tekrar açılmasın.
      navigate(location.pathname + location.search, { replace: true, state: null });
    }
  }, [allInventory, handleOpenItemDetail, location.pathname, location.search, location.state, navigate]);

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
    loadData();
  };

  const handleCategoryModalClose = () => {
    setIsCategoryModalOpen(false);
    setEditingCategory(null);
    loadData();
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
      toast.warning('Toplu silme icin once satir secin.');
      return;
    }

    await Promise.all(selectedItemIds.map((id) => inventoryService.deleteAsync(id)));
    toast.success(`${selectedItemIds.length} kayit silindi.`);
    clearSelection();
    await loadData();
  }, [clearSelection, loadData, selectedItemIds]);

  useContextMenuHandlers(
    'scaffoldRow',
    useMemo(
      () => ({
        'scaffold.edit': (target) => {
          if (!canUpdate) return;
          const row = target as ScaffoldRowTarget;
          const item = allInventory.find((inventoryItem) => inventoryItem.ItemId === row.entityId);
          if (!item) {
            toast.warning('Kayit bulunamadi.');
            return;
          }
          handleOpenItemDetail(item, { startInEditMode: false });
        },
        'scaffold.stockEntry': (target) => {
          if (!canUpdate) return;
          const row = target as ScaffoldRowTarget;
          const item = allInventory.find((inventoryItem) => inventoryItem.ItemId === row.entityId);
          if (!item) {
            toast.warning('Kayit bulunamadi.');
            return;
          }
          handleOpenItemDetail(item, { startInEditMode: true });
        },
        'scaffold.delete': async (target) => {
          if (!canDelete) return;
          await inventoryService.deleteAsync(target.entityId);
          toast.success('Kayit silindi.');
          await loadData();
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
      [allInventory, canDelete, canUpdate, filteredInventory]
    )
  );

  const formatTry = (amount: number) => formatMoney(amount, 'TRY');
  const formatEur = (amount: number) => formatMoney(amount, 'EUR');
  const formatUsd = (amount: number) => formatMoney(amount, 'USD');

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
                Toplu Sil
              </button>
            ) : null}
          </>
        ) : null}
        <button onClick={loadData} className="btn-secondary py-2 px-3 text-sm">
          Yenile
        </button>
        <ExcelManager type="inventory" onImportSuccess={() => void loadData()} />
        <button onClick={handleAddCategory} className="btn-secondary py-2 px-3 text-sm">
          + Kategori Ekle
        </button>
        <button onClick={handleAddNewItem} className="btn-primary py-2 px-3 text-sm">
          + Yeni Malzeme
        </button>
      </>
    ),
    [applyBulkDelete, applyBulkStatus, canDelete, canUpdate, loadData, selectedItemIds.length]
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
      <div className="p-8 flex items-center justify-center">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-3 rounded border border-background-border bg-background-panel p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-text-secondary">Arama ve Filtreler</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSearchText('');
                setSelectedCategory(null);
                setSelectedSubCategories(Array.from({ length: 6 }, () => ''));
                setMinAvailable('');
                setMaxAvailable('');
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
          <div className="relative lg:col-span-4">
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

          <div className="lg:col-span-3">
            <input
              type="number"
              className="input py-2 px-3 text-sm w-full"
              min={0}
              placeholder="Min müsait"
              value={minAvailable === '' ? '' : minAvailable}
              onChange={(e) => setMinAvailable(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>

          <div className="lg:col-span-3">
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

        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2">
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
        <div className="p-8 flex items-center justify-center text-text-secondary text-sm">Liste yükleniyor…</div>
      ) : filteredInventory.length === 0 ? (
        <EmptyState
          icon={<PackageIcon size={48} weight="duotone" />}
          title={
            allInventory.length === 0
              ? 'Henüz envanter kalemi bulunmuyor'
              : 'Filtrelere uygun kayıt yok'
          }
          description={
            allInventory.length === 0
              ? 'Önce kategori, sonra malzeme ekleyin'
              : 'Arama, harf veya alt kategori filtrelerini gevşetmeyi deneyin'
          }
        />
      ) : (
        <div
          className={`border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col ${listLoading ? 'opacity-80' : ''}`}
        >
          <div className="overflow-auto max-h-[calc(100vh-150px)] min-h-[320px]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 border-b border-background-border">
                <tr>
                  {selectionMode ? (
                    <th className="text-center py-0.5 px-1.5 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                      Sec
                    </th>
                  ) : null}
                  <th className="text-left py-0.5 px-1.5 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Ürün Kodu</th>
                  <th className="text-left py-0.5 px-1.5 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Ürün Adı</th>
                  <th className="text-right py-0.5 px-1.5 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Aylık Liste (₺)</th>
                  <th className="text-right py-0.5 px-1.5 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Birim (₺)</th>
                  <th className="text-right py-0.5 px-1.5 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Birim ($)</th>
                  <th className="text-right py-0.5 px-1.5 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Birim (€)</th>
                  <th className="text-center py-0.5 px-1.5 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    Hareketler
                  </th>
                  <th className="text-center py-0.5 px-1.5 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Durum</th>
                  <th className="text-left py-0.5 px-1.5 font-medium text-text-secondary whitespace-nowrap bg-background-hover">Kayıt Bilgisi</th>
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
                      className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${selectedItemIds.includes(item.ItemId) ? 'bg-primary/10' : index % 2 === 0 ? 'bg-background-panel' : 'bg-background-secondary/35'}`}
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
                      <td className="py-0 px-1.5 align-middle border-r border-background-border/60 last:border-r-0">
                        {item.ItemCode ? (
                          <span className="font-mono font-medium text-accent bg-accent/10 px-1 py-0.5 rounded">{item.ItemCode}</span>
                        ) : (
                          <span className="text-text-secondary">-</span>
                        )}
                      </td>
                      <td className="py-0 px-1.5 align-middle border-r border-background-border/60 last:border-r-0">
                        <div className="font-medium text-text-primary leading-tight">
                          {formatInventoryBilingualLabel(item.ItemName, item.ItemNameEn)}
                        </div>
                        <div className="text-text-secondary text-[10px] mt-0.5">
                          Birim: {item.UnitPrice != null ? formatTry(item.UnitPrice) : formatTry(item.PurchasePrice ?? 0)}
                        </div>
                      </td>
                      <td className="py-0 px-1.5 text-right align-middle border-r border-background-border/60 last:border-r-0 text-success tabular-nums">
                        {item.MonthlyListPrice != null ? formatTry(item.MonthlyListPrice) : '-'}
                      </td>
                      <td className="py-0 px-1.5 text-right align-middle border-r border-background-border/60 last:border-r-0 text-info tabular-nums">
                        {item.UnitPrice != null ? formatTry(item.UnitPrice) : item.PurchasePrice != null ? formatTry(item.PurchasePrice) : '-'}
                      </td>
                      <td className="py-0 px-1.5 text-right align-middle border-r border-background-border/60 last:border-r-0 text-info tabular-nums">
                        {item.UnitPriceUsd != null ? formatUsd(item.UnitPriceUsd) : '-'}
                      </td>
                      <td className="py-0 px-1.5 text-right align-middle border-r border-background-border/60 last:border-r-0 text-info tabular-nums">
                        {item.UnitPriceEur != null ? formatEur(item.UnitPriceEur) : '-'}
                      </td>
                      <td className="py-0 px-1.5 text-center align-middle border-r border-background-border/60 last:border-r-0">
                        <button
                          type="button"
                          className="btn-secondary py-1 px-2 text-[11px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/inventory/${item.ItemId}/movements`);
                          }}
                          title="Ürün hareket dökümü"
                        >
                          Hareketler
                        </button>
                      </td>
                      <td className="py-0 px-1.5 text-center align-middle border-r border-background-border/60 last:border-r-0">{statusBadge}</td>
                      <td className="py-0 px-1.5 align-middle text-text-secondary border-r border-background-border/60 last:border-r-0">
                        {item.CreatedByUserFullName || item.CreatedByUserName || '-'} • {formatShortDateTime(item.CreatedAt)}
                      </td>
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
    </div>
  );
}


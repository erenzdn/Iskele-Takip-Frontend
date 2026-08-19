import { useState, useEffect, useMemo, type ReactNode } from 'react';
import {
  CurrencyCircleDollarIcon,
  PackageIcon,
  Plus,
  TagIcon,
  WarehouseIcon,
  XIcon,
} from '@phosphor-icons/react';
import { AuditLog, Inventory, MaterialCategory, SubCategory, Warehouse, Unit, isInventoryArchived, pickInventoryDeletedAt } from '../../models';
import { inventoryService, ExchangeRateResponse, PricingPresetResponse } from '../../services/inventoryService';
import { warehouseService } from '../../services/warehouseService';
import { subcategoryService } from '../../services/subcategoryService';
import { unitService } from '../../services/unitService';
import { getApiErrorMessage, getInventoryDeleteErrorMessage, getInventoryRestoreErrorResult, isDuplicateInventoryItemNameEnError } from '../../utils/apiError';
import { formatShortDateTime } from '../../utils/formatters';
import { toast } from '../../hooks/useToast';
import { useAuthStore } from '../../store/authStore';
import AuditLogTimeline from '../AuditLogTimeline';
import ConfirmModal from './ConfirmModal';

interface InventoryDetailModalProps {
  item: Inventory | null;
  categories: MaterialCategory[];
  isNew: boolean;
  startInEditMode?: boolean;
  onClose: () => void;
}

// Depo stok girişi için tip
interface WarehouseStockEntry {
  warehouseId: number;
  quantity: number | '';
}

function SectionCard({
  title,
  subtitle,
  icon,
  extra,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex min-h-0 flex-col rounded-lg border border-background-border bg-background-surface p-3 ${className}`}>
      <div className="mb-2.5 flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            {icon}
            {title}
          </h3>
          {subtitle ? <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">{subtitle}</p> : null}
        </div>
        {extra ? <div className="shrink-0">{extra}</div> : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="mb-1 block text-xs font-medium text-text-secondary">
      {children}
      {required ? <span className="ml-0.5 text-error">*</span> : null}
    </label>
  );
}

export default function InventoryDetailModal({
  item,
  categories,
  isNew,
  startInEditMode = false,
  onClose,
}: InventoryDetailModalProps) {
  const user = useAuthStore((state) => state.user);
  const canDelete = (user?.permissions ?? []).includes('inventory_delete');
  const [resolvedItem, setResolvedItem] = useState<Inventory | null>(item);
  const effectiveItem = resolvedItem ?? item;
  const archived = Boolean(effectiveItem && !isNew && isInventoryArchived(effectiveItem));
  const archivedAtLabel = (() => {
    const raw = effectiveItem ? pickInventoryDeletedAt(effectiveItem) : undefined;
    if (!raw) return null;
    const formatted = formatShortDateTime(raw);
    return formatted && formatted !== '-' ? formatted : raw;
  })();
  const [isReadOnly, setIsReadOnly] = useState(!isNew && !startInEditMode);
  const [itemCode, setItemCode] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemNameEn, setItemNameEn] = useState('');
  const [weight, setWeight] = useState<number | ''>('');
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<number | ''>('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [totalStock, setTotalStock] = useState<number | ''>(0);
  const [onRent, setOnRent] = useState(0);
  const [monthlyListPrice, setMonthlyListPrice] = useState<number | ''>(0);
  const [unitPrice, setUnitPrice] = useState<number | ''>(0);
  const [monthlyListPriceEur, setMonthlyListPriceEur] = useState<number | ''>(0);
  const [unitPriceEur, setUnitPriceEur] = useState<number | ''>(0);
  const [monthlyListPriceUsd, setMonthlyListPriceUsd] = useState<number | ''>('');
  const [unitPriceUsd, setUnitPriceUsd] = useState<number | ''>('');
  const [isBusy, setIsBusy] = useState(false);

  const [activeRates, setActiveRates] = useState<ExchangeRateResponse | null>(null);
  const [activePreset, setActivePreset] = useState<PricingPresetResponse | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [isCalculating, setIsCalculating] = useState(false);

  // Alt kategori seçimi için state'ler
  const [allSubCategories, setAllSubCategories] = useState<SubCategory[]>([]);
  const [selectedSubCategoryIds, setSelectedSubCategoryIds] = useState<number[]>([]);
  const [loadingSubCategories, setLoadingSubCategories] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState('');
  const [subCategoryQuery, setSubCategoryQuery] = useState('');
  const [showAllSelectedChips, setShowAllSelectedChips] = useState(false);
  const [collapsedSubCategoryGroups, setCollapsedSubCategoryGroups] = useState<Set<string>>(() => new Set());

  // Depo seçimi için state'ler
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseStocks, setWarehouseStocks] = useState<WarehouseStockEntry[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'history'>('info');
  const [itemLogs, setItemLogs] = useState<AuditLog[]>([]);
  const [itemLogsLoading, setItemLogsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoreConflictMessage, setRestoreConflictMessage] = useState<string | null>(null);

  useEffect(() => {
    setResolvedItem(item);
  }, [item]);

  useEffect(() => {
    if (!item?.ItemId || isNew) return;
    let cancelled = false;
    void inventoryService.getByIdAsync(item.ItemId).then((fresh) => {
      if (!cancelled) setResolvedItem(fresh);
    }).catch(() => {
      /* liste kaydı ile devam */
    });
    return () => {
      cancelled = true;
    };
  }, [item?.ItemId, isNew]);

  useEffect(() => {
    if (archived) {
      setIsReadOnly(true);
      return;
    }
    setIsReadOnly(!isNew && !startInEditMode);
  }, [archived, isNew, startInEditMode]);

  useEffect(() => {
    const fetchRatesAndPresets = async () => {
      try {
        const rates = await inventoryService.getExchangeRatesAsync();
        setActiveRates(rates);
      } catch (err) {
        console.warn('Döviz kurları alınamadı:', err);
      }
      try {
        const preset = await inventoryService.getPricingPresetAsync();
        setActivePreset(preset);
      } catch (err) {
        console.warn('Kiralama oranları alınamadı:', err);
      }
    };
    fetchRatesAndPresets();
  }, []);

  useEffect(() => {
    const loadUnits = async () => {
      try {
        const data = await unitService.getAllAsync();
        setUnits(data);
      } catch (error) {
        console.error('Load units error:', error);
      }
    };
    loadUnits();
  }, []);

  useEffect(() => {
    if (!unitPrice || isReadOnly) return;

    const timer = setTimeout(async () => {
      try {
        setIsCalculating(true);
        const response = await inventoryService.getPricePreviewAsync({
          UnitPrice: Number(unitPrice),
          UsdRate: activeRates?.UsdRate,
          EurRate: activeRates?.EurRate,
          RentalRateTry: activePreset?.RentalRateTry,
          RentalRateUsd: activePreset?.RentalRateUsd ?? undefined,
          RentalRateEur: activePreset?.RentalRateEur ?? undefined,
          MonthlyListPrice: overrides['MonthlyListPrice'] ? Number(monthlyListPrice) : undefined,
          MonthlyListPriceUsd: overrides['MonthlyListPriceUsd'] ? Number(monthlyListPriceUsd) : undefined,
          MonthlyListPriceEur: overrides['MonthlyListPriceEur'] ? Number(monthlyListPriceEur) : undefined,
        });

        if (!overrides['MonthlyListPrice']) setMonthlyListPrice(response.MonthlyListPrice);
        if (!overrides['MonthlyListPriceUsd']) setMonthlyListPriceUsd(response.MonthlyListPriceUsd);
        if (!overrides['MonthlyListPriceEur']) setMonthlyListPriceEur(response.MonthlyListPriceEur);
        if (!overrides['UnitPriceUsd']) setUnitPriceUsd(response.UnitPriceUsd);
        if (!overrides['UnitPriceEur']) setUnitPriceEur(response.UnitPriceEur);
      } catch (err) {
        console.error('Fiyat hesaplama hatası:', err);
      } finally {
        setIsCalculating(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [unitPrice, activeRates, activePreset, overrides]);

  const handlePriceFieldChange = (field: string, val: number | '', setter: (v: number | '') => void) => {
    setter(val);
    setOverrides(prev => ({ ...prev, [field]: true }));
  };

  const handleResetOverride = (field: string, setter: (v: number | '') => void) => {
    setOverrides(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setter('');
  };

  const renderPriceInput = (
    value: number | '',
    field: string,
    setter: (v: number | '') => void,
    currency: string,
    isCalculated: boolean = false,
    isPrimary: boolean = false
  ) => {
    const isOverridden = overrides[field];
    return (
      <div className="min-w-0">
        <div className="mb-0.5 flex h-4 items-center justify-end">
          {isPrimary ? (
            <span className="rounded bg-primary/15 px-1 text-[10px] font-medium text-primary">kaynak</span>
          ) : isCalculated && isOverridden ? (
            <button
              type="button"
              onClick={() => handleResetOverride(field, setter)}
              className="rounded bg-yellow-500/20 px-1 text-[10px] text-yellow-700 hover:bg-yellow-500/30 dark:text-yellow-400"
              title="Otomatik değere dön"
            >
              manuel ×
            </button>
          ) : isCalculated && !isOverridden && value !== '' ? (
            <span className="rounded bg-green-500/20 px-1 text-[10px] text-green-700 dark:text-green-400">otomatik</span>
          ) : null}
        </div>
        <div className="relative">
          <input
            type="number"
            value={value}
            onChange={(e) => {
              const val = e.target.value === '' ? '' : Number(e.target.value);
              if (isCalculated) {
                handlePriceFieldChange(field, val, setter);
              } else {
                setter(val);
              }
            }}
            disabled={isReadOnly}
            min="0"
            step="0.01"
            className={`input w-full py-2 pr-8 text-sm ${isPrimary ? 'ring-1 ring-primary/35' : ''} ${
              isCalculated && !isOverridden ? 'bg-background-hover/60' : ''
            }`}
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-secondary">
            {currency}
          </span>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (isNew) {
      setItemCode('');
      setItemName('');
      setItemNameEn('');
      setWeight('');
      setSelectedUnitId('');
      setSelectedCategoryIds([]);
      setTotalStock(0);
      setOnRent(0);
      setMonthlyListPrice(0);
      setUnitPrice(0);
      setMonthlyListPriceEur(0);
      setUnitPriceEur(0);
      setMonthlyListPriceUsd('');
      setUnitPriceUsd('');
      setSelectedSubCategoryIds([]);
    }
  }, [isNew]);

  useEffect(() => {
    if (isNew || !effectiveItem) return;
    setItemCode(effectiveItem.ItemCode ?? '');
    setItemName(effectiveItem.ItemName);
    setItemNameEn(effectiveItem.ItemNameEn?.trim() ? effectiveItem.ItemNameEn : '');
    setWeight(effectiveItem.Weight ?? '');
    setSelectedUnitId(effectiveItem.UnitId ?? '');
    setSelectedCategoryIds(effectiveItem.Categories?.map((c) => c.CategoryId) ?? []);
    setTotalStock(effectiveItem.TotalStock);
    setOnRent(effectiveItem.OnRent);
    setMonthlyListPrice(effectiveItem.MonthlyListPrice ?? 0);
    setUnitPrice(effectiveItem.UnitPrice ?? 0);
    setMonthlyListPriceEur(effectiveItem.MonthlyListPriceEur ?? 0);
    setUnitPriceEur(effectiveItem.UnitPriceEur ?? 0);
    setMonthlyListPriceUsd(effectiveItem.MonthlyListPriceUsd ?? '');
    setUnitPriceUsd(effectiveItem.UnitPriceUsd ?? '');
    setSelectedSubCategoryIds(
      effectiveItem.SubCategories?.map((sc) => sc.SubCategoryId) ?? []
    );
  }, [effectiveItem, isNew]);

  const toOptionalNumber = (v: number | ''): number | undefined => {
    if (v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  // Alt kategorileri yükle
  useEffect(() => {
    loadSubCategories();
  }, []);

  // Yeni malzeme eklerken depoları yükle
  useEffect(() => {
    if (isNew) {
      loadWarehouses();
    }
  }, [isNew]);

  const loadSubCategories = async () => {
    try {
      setLoadingSubCategories(true);
      const data = await subcategoryService.getAllAsync();
      setAllSubCategories(data);
    } catch (error) {
      console.error('Load subcategories error:', error);
    } finally {
      setLoadingSubCategories(false);
    }
  };

  const handleCategoryToggle = (categoryId: number) => {
    if (isReadOnly) return;
    setSelectedCategoryIds((prev) => {
      if (prev.includes(categoryId)) {
        const next = prev.filter((id) => id !== categoryId);
        setSelectedSubCategoryIds((subs) =>
          subs.filter((sid) => {
            const sc = allSubCategories.find((s) => s.SubCategoryId === sid);
            return sc ? next.includes(sc.CategoryId) : true;
          })
        );
        return next;
      }
      return [...prev, categoryId];
    });
  };

  const handleSubCategoryToggle = (subCategoryId: number) => {
    if (isReadOnly) return;
    setSelectedSubCategoryIds((prev) => {
      if (prev.includes(subCategoryId)) {
        return prev.filter((id) => id !== subCategoryId);
      } else {
        return [...prev, subCategoryId];
      }
    });
  };

  const loadItemLogs = async () => {
    if (!effectiveItem?.ItemId) return;
    try {
      setItemLogsLoading(true);
      const data = await inventoryService.getAuditLogsByItemAsync(effectiveItem.ItemId);
      setItemLogs(data ?? []);
    } catch (error) {
      console.error('Load item audit logs error:', error);
      setItemLogs([]);
    } finally {
      setItemLogsLoading(false);
    }
  };

  useEffect(() => {
    if (effectiveItem?.ItemId && !isNew) {
      loadItemLogs();
    } else {
      setItemLogs([]);
    }
  }, [effectiveItem?.ItemId, isNew]);

  const loadWarehouses = async () => {
    try {
      setLoadingWarehouses(true);
      const data = await warehouseService.getActiveAsync();
      setWarehouses(data);
      // İlk depoyu varsayılan olarak ekle (eğer depo varsa)
      if (data.length > 0) {
        setWarehouseStocks([{ warehouseId: data[0].WarehouseId, quantity: 0 }]);
      }
    } catch (error) {
      console.error('Load warehouses error:', error);
    } finally {
      setLoadingWarehouses(false);
    }
  };

  // Depo stok girişi ekle
  const handleAddWarehouseStock = () => {
    const usedWarehouseIds = warehouseStocks.map(ws => ws.warehouseId);
    const availableWarehouse = warehouses.find(w => !usedWarehouseIds.includes(w.WarehouseId));
    if (availableWarehouse) {
      setWarehouseStocks([...warehouseStocks, { warehouseId: availableWarehouse.WarehouseId, quantity: 0 }]);
    }
  };

  // Depo stok girişi kaldır
  const handleRemoveWarehouseStock = (index: number) => {
    setWarehouseStocks(warehouseStocks.filter((_, i) => i !== index));
  };

  // Depo stok girişi güncelle
  const handleWarehouseStockChange = (index: number, field: 'warehouseId' | 'quantity', value: number | '') => {
    const updated = [...warehouseStocks];
    updated[index] = { ...updated[index], [field]: value };
    setWarehouseStocks(updated);
  };

  // Toplam stok hesapla (depo miktarlarından)
  const calculateTotalFromWarehouses = () => {
    return warehouseStocks.reduce((sum, ws) => sum + Number(ws.quantity), 0);
  };

  // Depo miktarları değiştiğinde toplam stoku güncelle
  useEffect(() => {
    if (isNew && warehouseStocks.length > 0) {
      setTotalStock(calculateTotalFromWarehouses());
    }
  }, [warehouseStocks, isNew]);

  const handleSave = async () => {
    if (!itemName.trim() || selectedCategoryIds.length === 0) {
      toast.warning('Ürün adı ve en az bir kategori zorunludur');
      return;
    }

    if (!isNew && effectiveItem && isInventoryArchived(effectiveItem)) {
      toast.warning('Pasif ürün düzenlenemez.');
      return;
    }

    // Yeni malzeme eklerken en az bir depoda miktar girilmiş olmalı
    if (isNew) {
      const validStocks = warehouseStocks.filter(ws => Number(ws.quantity) > 0);
      if (validStocks.length === 0) {
        toast.warning('En az bir depoya miktar girmelisiniz');
        return;
      }
    }

    try {
      setIsBusy(true);
      if (isNew) {
        // 1. Önce malzemeyi oluştur
        const result = await inventoryService.createAsync({
          ItemCode: itemCode.trim() || undefined,
          CategoryIds: selectedCategoryIds,
          ItemName: itemName,
          ItemNameEn: itemNameEn.trim() || undefined,
          TotalStock: calculateTotalFromWarehouses(),
          OnRent: 0,
          MonthlyListPrice: Number(monthlyListPrice),
          UnitPrice: Number(unitPrice),
          MonthlyListPriceEur: toOptionalNumber(monthlyListPriceEur),
          UnitPriceEur: toOptionalNumber(unitPriceEur),
          MonthlyListPriceUsd: toOptionalNumber(monthlyListPriceUsd),
          UnitPriceUsd: toOptionalNumber(unitPriceUsd),
          SubCategoryIds: selectedSubCategoryIds.length > 0 ? selectedSubCategoryIds : undefined,
          Weight: toOptionalNumber(weight),
          UnitId: selectedUnitId || undefined,
        });

        // 2. Sonra seçilen depolara stok ekle
        const validStocks = warehouseStocks.filter(ws => Number(ws.quantity) > 0);
        for (const ws of validStocks) {
          await warehouseService.addOrUpdateStockAsync(ws.warehouseId, {
            ItemId: result.ItemId,
            Quantity: Number(ws.quantity),
          });
        }
      } else if (effectiveItem) {
        await inventoryService.updateAsync(effectiveItem.ItemId, {
          ItemCode: itemCode.trim() || undefined,
          CategoryIds: selectedCategoryIds,
          ItemName: itemName,
          ItemNameEn: itemNameEn.trim() || undefined,
          TotalStock: Number(totalStock),
          OnRent: onRent,
          MonthlyListPrice: Number(monthlyListPrice),
          UnitPrice: Number(unitPrice),
          MonthlyListPriceEur: toOptionalNumber(monthlyListPriceEur),
          UnitPriceEur: toOptionalNumber(unitPriceEur),
          MonthlyListPriceUsd: toOptionalNumber(monthlyListPriceUsd),
          UnitPriceUsd: toOptionalNumber(unitPriceUsd),
          SubCategoryIds: selectedSubCategoryIds,
          Weight: toOptionalNumber(weight),
          UnitId: selectedUnitId || undefined,
        });
      }
      onClose();
    } catch (error) {
      console.error('Save inventory error:', error);
      toast.error(
        isDuplicateInventoryItemNameEnError(error)
          ? 'Bu İngilizce isim zaten başka bir üründe tanımlı.'
          : getApiErrorMessage(error)
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteClick = () => {
    if (!effectiveItem) return;
    if (effectiveItem.OnRent > 0) {
      toast.warning('Kirada olan ürün pasife alınamaz. Önce iade işlemini tamamlayın.');
      return;
    }
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!effectiveItem) return;
    try {
      setIsBusy(true);
      await inventoryService.deleteAsync(effectiveItem.ItemId);
      setShowDeleteConfirm(false);
      toast.success('Ürün listeden kaldırıldı.');
      onClose();
    } catch (error) {
      console.error('Delete inventory error:', error);
      toast.error(getInventoryDeleteErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleRestoreError = (error: unknown) => {
    const result = getInventoryRestoreErrorResult(error);
    if (result.severity === 'warning') {
      toast.warning(result.message);
    } else {
      toast.error(result.message);
    }
    if (result.showConflictModal) {
      setRestoreConflictMessage(result.message);
    }
  };

  const handleRestoreConfirm = async () => {
    if (!effectiveItem || isBusy) return;
    try {
      setIsBusy(true);
      const data = await inventoryService.restoreAsync(effectiveItem.ItemId);
      setShowRestoreConfirm(false);
      toast.success(data.message || 'Ürün aktif listeye geri getirildi.');
      const fresh = await inventoryService.getByIdAsync(effectiveItem.ItemId);
      setResolvedItem(fresh);
      setIsReadOnly(false);
    } catch (error) {
      console.error('Restore inventory error:', error);
      handleRestoreError(error);
    } finally {
      setIsBusy(false);
    }
  };

  const availableStock = Number(totalStock) - onRent;

  const visibleSubCategories = useMemo(() => {
    if (selectedCategoryIds.length === 0) return [];
    return allSubCategories.filter((sc) => selectedCategoryIds.includes(sc.CategoryId));
  }, [allSubCategories, selectedCategoryIds]);

  const filteredCategories = useMemo(() => {
    const q = categoryQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return categories;
    return categories.filter((c) => (c.CategoryName ?? '').toLocaleLowerCase('tr-TR').includes(q));
  }, [categories, categoryQuery]);

  const filteredVisibleSubCategories = useMemo(() => {
    const q = subCategoryQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return visibleSubCategories;
    return visibleSubCategories.filter((sc) =>
      (sc.SubCategoryName ?? '').toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [visibleSubCategories, subCategoryQuery]);

  const selectedCategoryChips = useMemo(() => {
    if (selectedCategoryIds.length === 0) return [];
    const map = new Map(categories.map((c) => [c.CategoryId, c.CategoryName] as const));
    return selectedCategoryIds
      .map((id) => ({ id, name: map.get(id) ?? `Kategori #${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));
  }, [categories, selectedCategoryIds]);

  const selectedSubCategoryChips = useMemo(() => {
    if (selectedSubCategoryIds.length === 0) return [];
    const map = new Map(allSubCategories.map((s) => [s.SubCategoryId, s] as const));
    return selectedSubCategoryIds
      .map((id) => {
        const sc = map.get(id);
        return {
          id,
          name: sc?.SubCategoryName ?? `Alt Kategori #${id}`,
          categoryName: sc?.CategoryName ?? '',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));
  }, [allSubCategories, selectedSubCategoryIds]);

  const MAX_OPTIONS_RENDER = 200;
  const categoryOptions = filteredCategories.slice(0, MAX_OPTIONS_RENDER);
  const hasMoreCategoryOptions = filteredCategories.length > MAX_OPTIONS_RENDER;
  const subCategoryOptions = filteredVisibleSubCategories.slice(0, MAX_OPTIONS_RENDER);
  const hasMoreSubCategoryOptions = filteredVisibleSubCategories.length > MAX_OPTIONS_RENDER;

  const groupedSubCategoryOptions = useMemo(() => {
    const map = new Map<string, SubCategory[]>();
    for (const sc of subCategoryOptions) {
      const key = (sc.CategoryName || `Kategori ${sc.CategoryId}` || 'Diğer').trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(sc);
    }
    return Array.from(map.entries()).map(([groupName, list]) => {
      const sorted = [...list].sort((a, b) =>
        (a.SubCategoryName ?? '').localeCompare((b.SubCategoryName ?? ''), 'tr-TR')
      );
      const selectedCount = sorted.reduce(
        (acc, s) => acc + (selectedSubCategoryIds.includes(s.SubCategoryId) ? 1 : 0),
        0
      );
      return { groupName, items: sorted, selectedCount };
    }).sort((a, b) => a.groupName.localeCompare(b.groupName, 'tr-TR'));
  }, [subCategoryOptions, selectedSubCategoryIds]);

  const MAX_SELECTED_CHIPS = 10;
  const selectedChipsCollapsed =
    !showAllSelectedChips &&
    (selectedCategoryChips.length + selectedSubCategoryChips.length > MAX_SELECTED_CHIPS);
  const selectedCategoryChipsVisible = selectedChipsCollapsed
    ? selectedCategoryChips.slice(0, Math.min(selectedCategoryChips.length, Math.max(0, MAX_SELECTED_CHIPS - 2)))
    : selectedCategoryChips;
  const remainingForSubs = MAX_SELECTED_CHIPS - selectedCategoryChipsVisible.length;
  const selectedSubCategoryChipsVisible = selectedChipsCollapsed
    ? selectedSubCategoryChips.slice(0, Math.max(0, remainingForSubs))
    : selectedSubCategoryChips;
  const hiddenSelectedCount =
    selectedCategoryChips.length +
    selectedSubCategoryChips.length -
    (selectedCategoryChipsVisible.length + selectedSubCategoryChipsVisible.length);

  const selectedUnitName = units.find((u) => u.UnitId === selectedUnitId)?.UnitName || 'kg';

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background-panel">
      <header className="shrink-0 border-b border-background-border px-3 py-2 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">
                {isNew ? 'Yeni Malzeme' : (itemName.trim() || 'Malzeme Detayı')}
              </h2>
              {!isNew && itemCode ? (
                <span className="rounded bg-accent/10 px-2 py-0.5 font-mono text-xs font-semibold text-accent">
                  {itemCode}
                </span>
              ) : null}
              {archived && (
                <span className="rounded border border-amber-600/50 bg-amber-900/30 px-2 py-0.5 text-xs font-semibold text-amber-100">
                  Pasif{archivedAtLabel ? ` • ${archivedAtLabel}` : ''}
                </span>
              )}
            </div>
            {archived ? (
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-100/90">
                Bu ürün pasif durumda. Bilgiler salt okunurdur.
              </p>
            ) : isNew ? (
              <p className="mt-0.5 text-xs text-text-secondary">
                Ürün adı, kategori ve en az bir depo miktarı zorunludur. Fiyatlar birim fiyat (TL) üzerinden hesaplanır.
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-text-secondary">Malzeme bilgilerini görüntüleyin veya düzenleyin.</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {archived && canDelete && (
              <button
                type="button"
                onClick={() => setShowRestoreConfirm(true)}
                disabled={isBusy}
                className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
                aria-label={effectiveItem ? `Geri getir: ${effectiveItem.ItemName}` : 'Geri getir'}
                title="Ürünü aktif listeye geri getirir"
              >
                {isBusy ? 'İşleniyor...' : 'Geri Getir'}
              </button>
            )}
            {!isNew && effectiveItem && (
              <div className="hidden items-center gap-1.5 sm:flex">
                <div className="rounded-md border border-background-border bg-background-surface px-2.5 py-1 text-center">
                  <div className="text-[10px] text-text-secondary">Toplam</div>
                  <div className="text-sm font-bold text-blue-500">{Number(totalStock)}</div>
                </div>
                <div className="rounded-md border border-background-border bg-background-surface px-2.5 py-1 text-center">
                  <div className="text-[10px] text-text-secondary">Kirada</div>
                  <div className="text-sm font-bold text-warning">{onRent}</div>
                </div>
                <div className="rounded-md border border-background-border bg-background-surface px-2.5 py-1 text-center">
                  <div className="text-[10px] text-text-secondary">Müsait</div>
                  <div className={`text-sm font-bold ${availableStock > 0 ? 'text-green-600 dark:text-green-500' : 'text-error'}`}>
                    {availableStock}
                  </div>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-text-primary hover:bg-background-hover"
              aria-label="Kapat"
            >
              <XIcon size={22} weight="regular" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-1 flex-col px-3 py-2 sm:px-4">
        {!isNew && (
          <div className="mb-2 flex shrink-0 gap-1 rounded border border-background-border bg-background-surface p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('info')}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'info'
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
              }`}
            >
              Bilgiler
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'history'
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
              }`}
            >
              Aktivite Geçmişi
            </button>
          </div>
        )}

        {activeTab === 'history' && !isNew ? (
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-background-border p-3">
            <AuditLogTimeline logs={itemLogs} loading={itemLogsLoading} />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
            <div className="flex min-h-0 flex-col gap-3 lg:overflow-hidden">
              <SectionCard
                title="Ürün bilgisi"
                subtitle="Ad zorunludur. Kod ve İngilizce ad isteğe bağlıdır."
                icon={<PackageIcon size={16} weight="duotone" />}
                className="shrink-0"
              >
                <div className="space-y-2.5">
                  <div>
                    <FieldLabel required>Ürün adı</FieldLabel>
                    <input
                      type="text"
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      disabled={isReadOnly}
                      placeholder="Örn: Çelik Boru"
                      className="input w-full py-2"
                      required
                      autoFocus={isNew}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <FieldLabel>Ürün kodu</FieldLabel>
                      <input
                        type="text"
                        value={itemCode}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^a-zA-Z0-9\-_.]/g, '');
                          if (val.length <= 50) setItemCode(val);
                        }}
                        disabled={isReadOnly}
                        placeholder="Örn: BRU2M001"
                        className="input w-full py-2 uppercase"
                        maxLength={50}
                      />
                    </div>
                    <div>
                      <FieldLabel>İngilizce adı</FieldLabel>
                      <input
                        type="text"
                        value={itemNameEn}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v.length <= 200) setItemNameEn(v);
                        }}
                        disabled={isReadOnly}
                        placeholder="e.g., Steel Pipe"
                        className="input w-full py-2"
                        maxLength={200}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FieldLabel>Ağırlık</FieldLabel>
                      <div className="relative">
                        <input
                          type="number"
                          value={weight}
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : Number(e.target.value);
                            setWeight(val);
                          }}
                          disabled={isReadOnly}
                          min="0"
                          step="0.01"
                          placeholder="Örn: 10.5"
                          className="input w-full py-2 pr-12"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary">
                          {selectedUnitName}
                        </span>
                      </div>
                    </div>
                    <div>
                      <FieldLabel>Ana birim</FieldLabel>
                      <select
                        value={selectedUnitId}
                        onChange={(e) => setSelectedUnitId(e.target.value === '' ? '' : Number(e.target.value))}
                        disabled={isReadOnly}
                        className="input w-full py-2"
                      >
                        <option value="">Birim seçin</option>
                        {units.map((unit) => (
                          <option key={unit.UnitId} value={unit.UnitId}>
                            {unit.UnitName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Kategori"
                subtitle="En az bir kategori seçin. Alt kategoriler seçilen kategoriye göre listelenir."
                icon={<TagIcon size={16} weight="duotone" />}
                extra={
                  <div className="flex items-center gap-2 text-[11px] text-text-secondary">
                    <span>
                      <span className="font-semibold text-text-primary">{selectedCategoryIds.length}</span> kat.
                      {' · '}
                      <span className="font-semibold text-text-primary">{selectedSubCategoryIds.length}</span> alt
                    </span>
                    {(selectedCategoryIds.length > 0 || selectedSubCategoryIds.length > 0) && !isReadOnly ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategoryIds([]);
                          setSelectedSubCategoryIds([]);
                        }}
                        className="text-accent hover:underline"
                      >
                        Temizle
                      </button>
                    ) : null}
                  </div>
                }
                className="min-h-[240px] flex-1"
              >
                {(selectedCategoryChips.length > 0 || selectedSubCategoryChips.length > 0) && (
                  <div className="mb-2 max-h-14 shrink-0 overflow-y-auto">
                    <div className="flex flex-wrap gap-1">
                      {selectedCategoryChipsVisible.map((c) => (
                        <button
                          key={`cat-${c.id}`}
                          type="button"
                          onClick={() => handleCategoryToggle(c.id)}
                          disabled={isReadOnly}
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${
                            isReadOnly
                              ? 'border-background-border text-text-secondary'
                              : 'border-accent/30 bg-accent/10 text-accent hover:bg-accent/15'
                          }`}
                          title="Kategoriyi kaldır"
                        >
                          {c.name}
                        </button>
                      ))}
                      {selectedSubCategoryChipsVisible.map((s) => (
                        <button
                          key={`sub-${s.id}`}
                          type="button"
                          onClick={() => handleSubCategoryToggle(s.id)}
                          disabled={isReadOnly}
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${
                            isReadOnly
                              ? 'border-background-border text-text-secondary'
                              : 'border-background-border bg-background-panel text-text-primary hover:bg-background-hover'
                          }`}
                          title="Alt kategoriyi kaldır"
                        >
                          {s.name}
                        </button>
                      ))}
                      {selectedCategoryChips.length + selectedSubCategoryChips.length > MAX_SELECTED_CHIPS && (
                        <button
                          type="button"
                          onClick={() => setShowAllSelectedChips((v) => !v)}
                          disabled={isReadOnly}
                          className="rounded-full border border-background-border px-2 py-0.5 text-[11px] text-text-secondary hover:bg-background-hover"
                        >
                          {showAllSelectedChips ? 'Daha az' : `+${hiddenSelectedCount}`}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-2">
                  <div className="flex min-h-0 flex-col">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                        Kategoriler *
                      </span>
                    </div>
                    <input
                      type="text"
                      value={categoryQuery}
                      onChange={(e) => setCategoryQuery(e.target.value)}
                      disabled={isReadOnly}
                      placeholder="Kategori ara…"
                      className="input mb-1.5 w-full py-1.5 text-sm"
                    />
                    {categories.length === 0 ? (
                      <div className="rounded-lg border border-background-border px-3 py-4 text-xs text-text-secondary">
                        Henüz kategori yok. Envanter sayfasındaki kategori yönetiminden ekleyebilirsiniz.
                      </div>
                    ) : (
                      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-background-border bg-background-panel">
                        {categoryOptions.length === 0 ? (
                          <div className="px-3 py-3 text-xs text-text-secondary">Aramaya uygun kategori yok.</div>
                        ) : (
                          categoryOptions.map((cat) => {
                            const active = selectedCategoryIds.includes(cat.CategoryId);
                            return (
                              <label
                                key={cat.CategoryId}
                                className={`flex cursor-pointer items-center gap-2 border-b border-background-border px-2 py-1.5 last:border-b-0 ${
                                  isReadOnly ? 'cursor-not-allowed opacity-70' : 'hover:bg-background-hover'
                                } ${active ? 'bg-accent/10' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={active}
                                  onChange={() => handleCategoryToggle(cat.CategoryId)}
                                  disabled={isReadOnly}
                                  className="accent-primary"
                                />
                                <span className={`text-xs font-medium ${active ? 'text-accent' : 'text-text-primary'}`}>
                                  {cat.CategoryName}
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    )}
                    {hasMoreCategoryOptions ? (
                      <div className="mt-1 text-[10px] text-text-secondary">Çok sonuç var; aramayı daraltın.</div>
                    ) : null}
                  </div>

                  <div className="flex min-h-0 flex-col">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                        Alt kategoriler
                      </span>
                      {selectedSubCategoryIds.length > 0 && !isReadOnly ? (
                        <button
                          type="button"
                          onClick={() => setSelectedSubCategoryIds([])}
                          className="text-[11px] text-accent hover:underline"
                        >
                          Temizle
                        </button>
                      ) : null}
                    </div>
                    <input
                      type="text"
                      value={subCategoryQuery}
                      onChange={(e) => setSubCategoryQuery(e.target.value)}
                      disabled={isReadOnly || selectedCategoryIds.length === 0}
                      placeholder={selectedCategoryIds.length === 0 ? 'Önce kategori seçin' : 'Alt kategori ara…'}
                      className="input mb-1.5 w-full py-1.5 text-sm"
                    />
                    {loadingSubCategories ? (
                      <div className="px-2 py-3 text-xs text-text-secondary">Alt kategoriler yükleniyor…</div>
                    ) : selectedCategoryIds.length === 0 ? (
                      <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-background-border px-3 py-4 text-center text-xs text-text-secondary">
                        Soldan kategori seçince ilgili alt kategoriler burada görünür.
                      </div>
                    ) : filteredVisibleSubCategories.length === 0 ? (
                      <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-background-border px-3 py-4 text-center text-xs text-text-secondary">
                        Seçili kategorilere ait alt kategori bulunamadı.
                      </div>
                    ) : (
                      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-background-border bg-background-panel">
                        {groupedSubCategoryOptions.map((g) => {
                          const isCollapsed = collapsedSubCategoryGroups.has(g.groupName);
                          return (
                            <div key={g.groupName} className="border-b border-background-border last:border-b-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setCollapsedSubCategoryGroups((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(g.groupName)) next.delete(g.groupName);
                                    else next.add(g.groupName);
                                    return next;
                                  });
                                }}
                                className="flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-background-hover"
                                aria-expanded={!isCollapsed}
                              >
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                                  {g.groupName}
                                </span>
                                <span className="text-[11px] text-text-secondary">
                                  {g.selectedCount > 0 ? (
                                    <span className="font-medium text-primary">{g.selectedCount} seçili</span>
                                  ) : (
                                    `${g.items.length}`
                                  )}
                                  <span className="ml-1.5">{isCollapsed ? '▸' : '▾'}</span>
                                </span>
                              </button>
                              {!isCollapsed &&
                                g.items.map((sc) => {
                                  const active = selectedSubCategoryIds.includes(sc.SubCategoryId);
                                  return (
                                    <label
                                      key={sc.SubCategoryId}
                                      className={`flex cursor-pointer items-center gap-2 border-t border-background-border px-2 py-1.5 ${
                                        isReadOnly ? 'cursor-not-allowed opacity-70' : 'hover:bg-background-hover'
                                      } ${active ? 'bg-primary/10' : ''}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={active}
                                        onChange={() => handleSubCategoryToggle(sc.SubCategoryId)}
                                        disabled={isReadOnly}
                                        className="accent-primary"
                                      />
                                      <span className={`text-xs font-medium ${active ? 'text-primary' : 'text-text-primary'}`}>
                                        {sc.SubCategoryName}
                                      </span>
                                    </label>
                                  );
                                })}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {hasMoreSubCategoryOptions ? (
                      <div className="mt-1 text-[10px] text-text-secondary">Çok sonuç var; aramayı daraltın.</div>
                    ) : null}
                  </div>
                </div>
              </SectionCard>
            </div>

            <div className="flex min-h-0 flex-col gap-3 lg:overflow-hidden">
              {isNew ? (
                <SectionCard
                  title="Başlangıç stoğu"
                  subtitle="En az bir depoya 0’dan büyük miktar girin. Toplam otomatik hesaplanır."
                  icon={<WarehouseIcon size={16} weight="duotone" />}
                  extra={
                    warehouseStocks.length < warehouses.length ? (
                      <button
                        type="button"
                        onClick={handleAddWarehouseStock}
                        className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                      >
                        <Plus size={14} weight="bold" />
                        Depo ekle
                      </button>
                    ) : null
                  }
                  className="shrink-0"
                >
                  {loadingWarehouses ? (
                    <div className="text-xs text-text-secondary">Depolar yükleniyor…</div>
                  ) : warehouses.length === 0 ? (
                    <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-yellow-900/20 dark:text-yellow-500">
                      Henüz depo tanımlanmamış. Önce Depolar sayfasından bir depo ekleyin.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {warehouseStocks.map((ws, index) => {
                        const usedWarehouseIds = warehouseStocks
                          .filter((_, i) => i !== index)
                          .map((s) => s.warehouseId);
                        const availableWarehouses = warehouses.filter(
                          (w) => w.WarehouseId === ws.warehouseId || !usedWarehouseIds.includes(w.WarehouseId)
                        );
                        return (
                          <div key={index} className="flex items-end gap-2">
                            <div className="min-w-0 flex-1">
                              <FieldLabel>Depo</FieldLabel>
                              <select
                                value={ws.warehouseId}
                                onChange={(e) => handleWarehouseStockChange(index, 'warehouseId', Number(e.target.value))}
                                className="input w-full py-2"
                              >
                                {availableWarehouses.map((w) => (
                                  <option key={w.WarehouseId} value={w.WarehouseId}>
                                    {w.WarehouseName}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="w-28 shrink-0">
                              <FieldLabel>Miktar</FieldLabel>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={ws.quantity === '' ? '' : ws.quantity}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/[^0-9]/g, '');
                                  handleWarehouseStockChange(index, 'quantity', raw === '' ? '' : parseInt(raw, 10));
                                }}
                                className="input w-full py-2"
                                placeholder="0"
                              />
                            </div>
                            {warehouseStocks.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveWarehouseStock(index)}
                                className="inline-flex items-center justify-center p-2 text-error hover:opacity-80"
                                title="Kaldır"
                              >
                                <XIcon size={18} weight="regular" aria-hidden />
                              </button>
                            )}
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-between border-t border-background-border pt-2 text-xs">
                        <span className="text-text-secondary">Toplam stok</span>
                        <span className="font-bold text-green-600 dark:text-green-500">{calculateTotalFromWarehouses()}</span>
                      </div>
                    </div>
                  )}
                </SectionCard>
              ) : (
                <SectionCard
                  title="Stok durumu"
                  subtitle="Kirada değeri sözleşmelerden gelir. Müsait stok otomatik hesaplanır."
                  icon={<WarehouseIcon size={16} weight="duotone" />}
                  className="shrink-0"
                >
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <FieldLabel>Toplam stok</FieldLabel>
                      <input
                        type="number"
                        value={totalStock}
                        onChange={(e) => setTotalStock(e.target.value === '' ? '' : Number(e.target.value))}
                        disabled={isReadOnly}
                        min="0"
                        className="input w-full py-2"
                      />
                    </div>
                    <div>
                      <FieldLabel>Kirada</FieldLabel>
                      <input
                        type="number"
                        value={onRent}
                        disabled
                        className="input w-full cursor-not-allowed bg-background-hover py-2"
                        title="Bu değer sözleşmeler tarafından otomatik yönetilir"
                      />
                    </div>
                    <div>
                      <FieldLabel>Müsait</FieldLabel>
                      <div
                        className={`input flex w-full items-center justify-center bg-background-hover py-2 font-bold ${
                          availableStock > 0 ? 'text-green-600 dark:text-green-500' : 'text-error'
                        }`}
                      >
                        {availableStock}
                      </div>
                    </div>
                  </div>
                </SectionCard>
              )}

              <SectionCard
                title="Fiyatlandırma"
                subtitle="TL birim fiyatını girin; diğer tutarlar kur ve kiralama oranına göre dolar. İsterseniz üzerine yazın."
                icon={<CurrencyCircleDollarIcon size={16} weight="duotone" />}
                extra={
                  <div className="text-right">
                    {isCalculating ? (
                      <div className="text-[11px] text-accent animate-pulse">Hesaplanıyor…</div>
                    ) : null}
                    {activeRates ? (
                      <div className="whitespace-nowrap text-[11px] text-text-secondary">
                        $1 = ₺{activeRates.UsdRate.toFixed(2)} · €1 = ₺{activeRates.EurRate.toFixed(2)}
                      </div>
                    ) : null}
                  </div>
                }
                className="flex-1"
              >
                <div className="grid grid-cols-[3.5rem_1fr_1fr_1fr] items-end gap-x-2 gap-y-1">
                  <div />
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">TL</div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">USD</div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">EUR</div>

                  <div className="pb-2 text-xs font-medium text-text-secondary">Birim</div>
                  {renderPriceInput(unitPrice, 'UnitPrice', setUnitPrice, '₺', false, true)}
                  {renderPriceInput(unitPriceUsd, 'UnitPriceUsd', setUnitPriceUsd, '$', true)}
                  {renderPriceInput(unitPriceEur, 'UnitPriceEur', setUnitPriceEur, '€', true)}

                  <div className="pb-2 text-xs font-medium text-text-secondary">Aylık</div>
                  {renderPriceInput(monthlyListPrice, 'MonthlyListPrice', setMonthlyListPrice, '₺', true)}
                  {renderPriceInput(monthlyListPriceUsd, 'MonthlyListPriceUsd', setMonthlyListPriceUsd, '$', true)}
                  {renderPriceInput(monthlyListPriceEur, 'MonthlyListPriceEur', setMonthlyListPriceEur, '€', true)}
                </div>
                {!activePreset ? (
                  <div className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:bg-yellow-900/20 dark:text-yellow-500">
                    Kiralama oranı tanımlı değil. Aylık fiyatları elle girin.
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-text-secondary">
                    Yeşil etiketli alanlar otomatik hesaplanır. Değiştirirseniz “manuel” olur; çarpıya basınca tekrar otomatik döner.
                  </p>
                )}
              </SectionCard>
            </div>
          </div>
        )}

        <div className="mt-2 flex shrink-0 items-center gap-2 border-t border-background-border pt-2">
          {!isReadOnly && !isNew && effectiveItem && !archived && canDelete && (
            <button
              type="button"
              onClick={handleDeleteClick}
              disabled={isBusy || effectiveItem.OnRent > 0}
              title={
                effectiveItem.OnRent > 0
                  ? 'Geçmiş kayıtlarda kullanılmış ürünler tamamen silinmez, pasife alınır. Kirada olan ürün pasife alınamaz.'
                  : 'Geçmiş kayıtlarda kullanılmış ürünler tamamen silinmez, pasife alınır.'
              }
              className="btn-danger px-4 py-2.5 disabled:opacity-50"
            >
              Listeden Kaldır
            </button>
          )}
          <div className="ml-auto flex gap-2">
            {isReadOnly && !isNew && !archived && (
              <button type="button" onClick={() => setIsReadOnly(false)} className="btn-primary px-6 py-2.5">
                Düzenle
              </button>
            )}
            {!isReadOnly && (
              <>
                <button type="button" onClick={onClose} className="btn-secondary px-5 py-2.5">
                  İptal
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isBusy || archived}
                  className="btn-primary px-6 py-2.5 disabled:opacity-50"
                >
                  {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </>
            )}
            {isReadOnly && !isNew && (
              <button type="button" onClick={onClose} className="btn-secondary px-6 py-2.5">
                Kapat
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={showDeleteConfirm}
        title="Ürünü pasife almak istiyor musunuz?"
        message={
          effectiveItem
            ? `"${effectiveItem.ItemName}" ürününü pasife almak istediğinize emin misiniz? Pasif ürünler yeni teklif ve sözleşmelerde seçilemez; geçmiş kayıtlar korunur.`
            : ''
        }
        variant="danger"
        loading={isBusy}
        confirmLabel="Listeden Kaldır"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        zIndexClass="z-[70]"
      />

      <ConfirmModal
        open={showRestoreConfirm}
        title="Ürünü aktif listeye geri getir"
        message={
          effectiveItem
            ? `"${effectiveItem.ItemName}" ürününü aktif listeye geri getirmek istediğinize emin misiniz? Ürün tekrar teklif ve sözleşmelerde seçilebilir hale gelir.`
            : ''
        }
        confirmLabel="Geri Getir"
        cancelLabel="İptal"
        loading={isBusy}
        onConfirm={() => void handleRestoreConfirm()}
        onCancel={() => {
          if (isBusy) return;
          setShowRestoreConfirm(false);
        }}
        zIndexClass="z-[70]"
      />

      <ConfirmModal
        open={Boolean(restoreConflictMessage)}
        title="Ürün geri getirilemedi"
        message={restoreConflictMessage ?? ''}
        confirmLabel="Tamam"
        singleAction
        onConfirm={() => setRestoreConflictMessage(null)}
        onCancel={() => setRestoreConflictMessage(null)}
        zIndexClass="z-[70]"
      />
    </div>
  );
}

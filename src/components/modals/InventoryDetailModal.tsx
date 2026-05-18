import { useState, useEffect, useMemo } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { AuditLog, Inventory, MaterialCategory, SubCategory, Warehouse, Unit } from '../../models';
import { inventoryService, ExchangeRateResponse, PricingPresetResponse } from '../../services/inventoryService';
import { warehouseService } from '../../services/warehouseService';
import { subcategoryService } from '../../services/subcategoryService';
import { unitService } from '../../services/unitService';
import { getApiErrorMessage, isDuplicateInventoryItemNameEnError } from '../../utils/apiError';
import { toast } from '../../hooks/useToast';
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

export default function InventoryDetailModal({
  item,
  categories,
  isNew,
  startInEditMode = false,
  onClose,
}: InventoryDetailModalProps) {
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
          RentalRateUsd: activePreset?.RentalRateUsd,
          RentalRateEur: activePreset?.RentalRateEur,
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
    label: string,
    value: number | '',
    field: string,
    setter: (v: number | '') => void,
    currency: string = '₺',
    isCalculated: boolean = false
  ) => {
    const isOverridden = overrides[field];
    return (
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-xs text-text-secondary">{label}</label>
          {isCalculated && isOverridden && (
            <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-1 rounded flex items-center gap-1">
              <span>manuel</span>
              <button
                type="button"
                onClick={() => handleResetOverride(field, setter)}
                className="text-text-primary hover:text-accent"
              >
                ×
              </button>
            </span>
          )}
          {isCalculated && !isOverridden && value !== '' && (
            <span className="text-[10px] bg-green-500/20 text-green-500 px-1 rounded">
              otomatik
            </span>
          )}
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
            className={`input w-full ${isCalculated && !isOverridden ? 'bg-background-secondary/50' : ''}`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary pointer-events-none">{currency}</span>
        </div>
      </div>
    );
  };

  useEffect(() => {
    setIsReadOnly(!isNew && !startInEditMode);
    if (item) {
      setItemCode(item.ItemCode ?? '');
      setItemName(item.ItemName);
      setItemNameEn(item.ItemNameEn?.trim() ? item.ItemNameEn : '');
      setWeight(item.Weight ?? '');
      setSelectedUnitId(item.UnitId ?? '');
      setSelectedCategoryIds(item.Categories?.map((c) => c.CategoryId) ?? []);
      setTotalStock(item.TotalStock);
      setOnRent(item.OnRent);
      setMonthlyListPrice(item.MonthlyListPrice ?? 0);
      setUnitPrice(item.UnitPrice ?? 0);
      setMonthlyListPriceEur(item.MonthlyListPriceEur ?? 0);
      setUnitPriceEur(item.UnitPriceEur ?? 0);
      setMonthlyListPriceUsd(item.MonthlyListPriceUsd ?? '');
      setUnitPriceUsd(item.UnitPriceUsd ?? '');
      setSelectedSubCategoryIds(
        item.SubCategories?.map((sc) => sc.SubCategoryId) ?? []
      );
    } else {
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
  }, [item, isNew, startInEditMode]);

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
        return prev.filter((id) => id !== categoryId);
      } else {
        return [...prev, categoryId];
      }
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
    if (!item?.ItemId) return;
    try {
      setItemLogsLoading(true);
      const data = await inventoryService.getAuditLogsByItemAsync(item.ItemId);
      setItemLogs(data ?? []);
    } catch (error) {
      console.error('Load item audit logs error:', error);
      setItemLogs([]);
    } finally {
      setItemLogsLoading(false);
    }
  };

  useEffect(() => {
    if (item?.ItemId && !isNew) {
      loadItemLogs();
    } else {
      setItemLogs([]);
    }
  }, [item?.ItemId, isNew]);

  const loadWarehouses = async () => {
    try {
      setLoadingWarehouses(true);
      const data = await warehouseService.getAllAsync();
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
          TotalStock: Number(totalStock),
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
      } else if (item) {
        await inventoryService.updateAsync(item.ItemId, {
          ItemCode: itemCode.trim() || undefined,
          CategoryIds: selectedCategoryIds,
          ItemName: itemName,
          ItemNameEn: itemNameEn.trim(),
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
    if (!item) return;
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!item) return;
    try {
      setIsBusy(true);
      await inventoryService.deleteAsync(item.ItemId);
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      console.error('Delete inventory error:', error);
      toast.error('Silme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const availableStock = Number(totalStock) - onRent;

  const visibleSubCategories = useMemo(() => {
    if (selectedCategoryIds.length === 0) return allSubCategories;
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

  return (
    <div className="fixed inset-0 z-50 bg-background-panel overflow-hidden">
      <div className="w-full h-screen p-2 sm:p-3 flex flex-col">
        <div className="shrink-0 flex items-center justify-between gap-2 bg-background-panel py-1.5 mb-1.5 border-b border-background-border">
          <h2 className="text-lg font-bold shrink-0">{isNew ? 'Yeni Malzeme' : 'Malzeme Detayı'}</h2>
          <div className="ml-auto flex items-center gap-2 shrink-0 min-w-0">
            {!isNew && item && (
              <div className="hidden md:flex items-end gap-2 text-[11px] whitespace-nowrap">
                <div className="flex items-baseline gap-1">
                  <span className="text-text-secondary">Toplam</span>
                  <span className="text-sm font-bold text-blue-400 leading-tight">{Number(totalStock)}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-text-secondary">Kirada</span>
                  <span className="text-sm font-bold text-warning leading-tight">{onRent}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-text-secondary">Müsait</span>
                  <span className="text-sm font-bold text-green-500 leading-tight">{availableStock}</span>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-background-hover text-text-primary shrink-0"
              aria-label="Kapat"
            >
              <XIcon size={24} weight="regular" aria-hidden />
            </button>
          </div>
        </div>

        <div className="container mx-auto max-w-screen-2xl w-full flex-1 min-h-0 px-0 sm:px-1">
        <div className="h-full flex flex-col min-h-0">
        {!isNew && (
          <div className="mb-2 flex gap-1 border-b border-background-border">
            <button
              type="button"
              onClick={() => setActiveTab('info')}
              className={`px-2 py-1 text-xs font-medium border-b-2 ${
                activeTab === 'info'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              Bilgiler
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-2 py-1 text-xs font-medium border-b-2 ${
                activeTab === 'history'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              Aktivite Geçmişi
            </button>
          </div>
        )}

        {activeTab === 'history' && !isNew ? (
          <div className="border border-background-border rounded-lg p-2 min-h-0 flex-1 overflow-auto">
            <h3 className="text-sm font-semibold mb-1.5">Aktivite Geçmişi</h3>
            <AuditLogTimeline logs={itemLogs} loading={itemLogsLoading} />
          </div>
        ) : (
          <>
        {isReadOnly && !isNew && item && item.ItemCode && (
          <div className="mb-2 flex items-center gap-1.5">
            <span className="text-xs text-text-secondary">Ürün Kodu:</span>
            <span className="font-mono font-bold text-accent bg-accent/10 px-2 py-0.5 rounded text-sm">
              {item.ItemCode}
            </span>
          </div>
        )}

        <div className="mb-2 grid grid-cols-1 lg:grid-cols-3 gap-2">
          <div>
            <label className="block text-xs font-medium mb-1">Ürün Kodu</label>
            <input
              type="text"
              value={itemCode}
              onChange={(e) => {
                const val = e.target.value.replace(/[^a-zA-Z0-9\-_.]/g, '');
                if (val.length <= 50) setItemCode(val);
              }}
              disabled={isReadOnly}
              placeholder="Örn: BRU2M001"
              className="input w-full uppercase"
              maxLength={50}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Ürün Adı *</label>
            <input
              type="text"
              value={itemName}
              onChange={(e) => {
                setItemName(e.target.value);
              }}
              disabled={isReadOnly}
              placeholder="Örn: Çelik Boru"
              className="input w-full"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">İngilizce Ürün Adı</label>
            <input
              type="text"
              value={itemNameEn}
              onChange={(e) => {
                const v = e.target.value;
                if (v.length <= 200) setItemNameEn(v);
              }}
              disabled={isReadOnly}
              placeholder="e.g., Steel Pipe"
              className="input w-full"
              maxLength={200}
            />
          </div>
        </div>

        <div className="mb-2 grid grid-cols-1 lg:grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium mb-1">Ağırlık</label>
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
                className="input w-full"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary pointer-events-none">
                {units.find(u => u.UnitId === selectedUnitId)?.UnitName || 'kg'}
              </span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Ana Birim</label>
            <select
              value={selectedUnitId}
              onChange={(e) => setSelectedUnitId(e.target.value === '' ? '' : Number(e.target.value))}
              disabled={isReadOnly}
              className="input w-full"
            >
              <option value="">Birim Seçin</option>
              {units.map((unit) => (
                <option key={unit.UnitId} value={unit.UnitId}>
                  {unit.UnitName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          className={`grid gap-2 flex-1 min-h-0 overflow-y-auto pr-1 ${
            isNew ? 'grid-cols-1 xl:grid-cols-12' : 'grid-cols-1 xl:grid-cols-12'
          }`}
        >
          <div
            className={`border border-background-border rounded-lg p-2 min-h-0 overflow-auto flex flex-col ${
              isNew ? 'xl:col-span-7' : 'xl:col-span-6 xl:min-h-[360px]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium">Kategori & Alt Kategori</div>
              <div className="text-xs text-text-secondary">
                Seçili: <span className="font-medium text-text-primary">{selectedCategoryIds.length}</span> kategori
                {' · '}
                <span className="font-medium text-text-primary">{selectedSubCategoryIds.length}</span> alt kategori
              </div>
            </div>

            {(selectedCategoryChips.length > 0 || selectedSubCategoryChips.length > 0) && (
              <div className="mb-2 rounded-lg border border-background-border bg-background-secondary/20 p-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Seçilenler</div>
                  <div className="flex items-center gap-3">
                    {hiddenSelectedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAllSelectedChips((v) => !v)}
                        className={`text-xs ${isReadOnly ? 'text-text-secondary cursor-not-allowed' : 'text-text-primary hover:underline'}`}
                        disabled={isReadOnly}
                      >
                        {showAllSelectedChips ? 'Daha az göster' : `+${hiddenSelectedCount} daha`}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (isReadOnly) return;
                        setSelectedCategoryIds([]);
                        setSelectedSubCategoryIds([]);
                      }}
                      className={`text-xs ${isReadOnly ? 'text-text-secondary cursor-not-allowed' : 'text-accent hover:underline'}`}
                      disabled={isReadOnly}
                    >
                      Hepsini Temizle
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {selectedCategoryChipsVisible.map((c) => (
                    <button
                      key={`cat-${c.id}`}
                      type="button"
                      onClick={() => handleCategoryToggle(c.id)}
                      disabled={isReadOnly}
                      className={`px-2 py-1 rounded-full text-xs border ${
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
                      className={`px-2 py-1 rounded-full text-xs border ${
                        isReadOnly
                          ? 'border-background-border text-text-secondary'
                          : 'border-background-border bg-background-panel text-text-primary hover:bg-background-hover'
                      }`}
                      title="Alt kategoriyi kaldır"
                    >
                      {s.name}
                      {s.categoryName ? <span className="text-text-secondary"> · {s.categoryName}</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-1 min-h-0">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Kategoriler *</div>
                  {selectedCategoryIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (isReadOnly) return;
                        setSelectedCategoryIds([]);
                        setSelectedSubCategoryIds([]);
                      }}
                      className={`text-xs ${isReadOnly ? 'text-text-secondary cursor-not-allowed' : 'text-accent hover:underline'}`}
                      disabled={isReadOnly}
                    >
                      Temizle
                    </button>
                  ) : null}
                </div>
                <input
                  type="text"
                  value={categoryQuery}
                  onChange={(e) => setCategoryQuery(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Kategori ara…"
                  className="input w-full mb-1.5"
                />
                {categories.length === 0 ? (
                  <div className="text-text-secondary text-sm">
                    Henüz kategori tanımlanmamış. Envanter sayfasındaki kategori yönetiminden ekleyebilirsiniz.
                  </div>
                ) : (
                  <div className="rounded-lg border border-background-border bg-background-panel max-h-[120px] overflow-y-auto">
                    {categoryOptions.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-text-secondary">Aramaya uygun kategori yok.</div>
                    ) : (
                      categoryOptions.map((cat) => {
                        const active = selectedCategoryIds.includes(cat.CategoryId);
                        return (
                          <button
                            key={cat.CategoryId}
                            type="button"
                            onClick={() => handleCategoryToggle(cat.CategoryId)}
                            disabled={isReadOnly}
                            className={`w-full text-left px-2 py-1.5 text-xs border-b border-background-border last:border-b-0 ${
                              isReadOnly ? 'cursor-not-allowed opacity-70' : 'hover:bg-background-hover'
                            } ${active ? 'bg-accent/10' : ''}`}
                          >
                            <span className={`font-medium ${active ? 'text-accent' : 'text-text-primary'}`}>
                              {cat.CategoryName}
                            </span>
                            {active ? <span className="ml-2 text-xs text-text-secondary">(seçili)</span> : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
                <div className="mt-1 text-[10px] text-text-secondary">
                  Alt kategoriler, seçtiğiniz kategorilere göre filtrelenir.
                  {hasMoreCategoryOptions ? ' Çok sonuç var; aramayı daraltın.' : ''}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Alt Kategoriler</div>
                  {selectedSubCategoryIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (isReadOnly) return;
                        setSelectedSubCategoryIds([]);
                      }}
                      className={`text-xs ${isReadOnly ? 'text-text-secondary cursor-not-allowed' : 'text-accent hover:underline'}`}
                      disabled={isReadOnly}
                    >
                      Temizle
                    </button>
                  ) : null}
                </div>
                <input
                  type="text"
                  value={subCategoryQuery}
                  onChange={(e) => setSubCategoryQuery(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Alt kategori ara…"
                  className="input w-full mb-1.5"
                />
                {loadingSubCategories ? (
                  <div className="text-text-secondary text-sm">Alt kategoriler yükleniyor...</div>
                ) : filteredVisibleSubCategories.length === 0 ? (
                  <div className="text-text-secondary text-sm">
                    {selectedCategoryIds.length === 0
                      ? 'Alt kategori listesi boş.'
                      : 'Seçili kategorilere ait alt kategori bulunamadı.'}
                  </div>
                ) : (
                  <div className="rounded-lg border border-background-border bg-background-panel max-h-[120px] overflow-y-auto">
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
                            className={`w-full flex items-center justify-between px-2 py-1.5 text-left ${
                              isReadOnly ? 'cursor-default' : 'hover:bg-background-hover'
                            }`}
                            aria-expanded={!isCollapsed}
                          >
                            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                              {g.groupName}
                            </span>
                            <span className="text-xs text-text-secondary">
                              {g.selectedCount > 0 ? (
                                <span className="text-primary font-medium">{g.selectedCount} seçili</span>
                              ) : (
                                `${g.items.length} öğe`
                              )}
                              <span className="ml-2">{isCollapsed ? '▸' : '▾'}</span>
                            </span>
                          </button>
                          {!isCollapsed && (
                            <div>
                              {g.items.map((sc) => {
                                const active = selectedSubCategoryIds.includes(sc.SubCategoryId);
                                return (
                                  <button
                                    key={sc.SubCategoryId}
                                    type="button"
                                    onClick={() => handleSubCategoryToggle(sc.SubCategoryId)}
                                    disabled={isReadOnly}
                                    className={`w-full text-left px-2 py-1.5 text-xs border-t border-background-border ${
                                      isReadOnly ? 'cursor-not-allowed opacity-70' : 'hover:bg-background-hover'
                                    } ${active ? 'bg-primary/10' : ''}`}
                                  >
                                    <span className={`font-medium ${active ? 'text-primary' : 'text-text-primary'}`}>
                                      {sc.SubCategoryName}
                                    </span>
                                    {active ? <span className="ml-2 text-xs text-text-secondary">(seçili)</span> : null}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-1 text-[10px] text-text-secondary">
                  {hasMoreSubCategoryOptions ? 'Çok sonuç var; aramayı daraltın.' : ''}
                </div>
              </div>
            </div>
          </div>

          {/* Yeni malzeme için depo seçimi */}
          {isNew && (
            <div className="border border-background-border rounded-lg p-2 xl:col-span-5 min-h-0 overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium">Depo ve Miktar *</label>
                {warehouseStocks.length < warehouses.length && (
                  <button
                    type="button"
                    onClick={handleAddWarehouseStock}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    + Başka Depo Ekle
                  </button>
                )}
              </div>
              
              {loadingWarehouses ? (
                <div className="text-text-secondary text-sm">Depolar yükleniyor...</div>
              ) : warehouses.length === 0 ? (
                <div className="text-yellow-500 text-sm bg-yellow-900/20 p-3 rounded">
                  Henüz depo tanımlanmamış. Önce Depolar sayfasından bir depo ekleyin.
                </div>
              ) : (
                <div className="space-y-2">
                  {warehouseStocks.map((ws, index) => {
                    const usedWarehouseIds = warehouseStocks
                      .filter((_, i) => i !== index)
                      .map(s => s.warehouseId);
                    const availableWarehouses = warehouses.filter(
                      w => w.WarehouseId === ws.warehouseId || !usedWarehouseIds.includes(w.WarehouseId)
                    );

                    return (
                      <div key={index} className="flex gap-2 items-end">
                        <div className="flex-1">
                          <label className="block text-xs text-text-secondary mb-1">Depo</label>
                          <select
                            value={ws.warehouseId}
                            onChange={(e) => handleWarehouseStockChange(index, 'warehouseId', Number(e.target.value))}
                            className="input w-full"
                          >
                            {availableWarehouses.map((w) => (
                              <option key={w.WarehouseId} value={w.WarehouseId}>
                                {w.WarehouseName}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-28">
                          <label className="block text-xs text-text-secondary mb-1">Miktar</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={ws.quantity === '' ? '' : ws.quantity}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, '');
                              handleWarehouseStockChange(index, 'quantity', raw === '' ? '' : parseInt(raw, 10));
                            }}
                            className="input w-full"
                            placeholder="0"
                          />
                        </div>
                        {warehouseStocks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveWarehouseStock(index)}
                            className="text-red-500 hover:text-red-400 p-2 inline-flex items-center justify-center"
                            title="Kaldır"
                          >
                            <XIcon size={18} weight="regular" aria-hidden />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              
              {warehouseStocks.length > 0 && (
                <div className="mt-2 pt-2 border-t border-background-border flex justify-between text-xs">
                  <span className="text-text-secondary">Toplam Stok:</span>
                  <span className="font-bold text-green-500">{calculateTotalFromWarehouses()}</span>
                </div>
              )}
            </div>
          )}

          {/* Mevcut malzeme için stok bilgileri */}
          {!isNew && (
            <>
              <div className="border border-background-border rounded-lg p-2 xl:col-span-12">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium">Fiyatlandırma</label>
                  {activeRates && (
                    <div className="text-xs text-text-secondary">
                      Aktif Kur: $1 = ₺{activeRates.UsdRate.toFixed(2)} | €1 = ₺{activeRates.EurRate.toFixed(2)}
                    </div>
                  )}
                </div>
                
                {isCalculating && (
                  <div className="text-xs text-accent mb-2 animate-pulse">Hesaplanıyor...</div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border border-background-border rounded-lg p-2">
                    <div className="text-xs font-semibold mb-2 text-text-secondary">TL Fiyatları</div>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-text-secondary mb-1">Birim Fiyat (TL) *</label>
                        <input
                          type="number"
                          value={unitPrice}
                          onChange={(e) => setUnitPrice(e.target.value === '' ? '' : Number(e.target.value))}
                          disabled={isReadOnly}
                          min="0"
                          step="0.01"
                          className="input w-full"
                          placeholder="0.00"
                        />
                      </div>
                      {renderPriceInput('Aylık Liste (TL)', monthlyListPrice, 'MonthlyListPrice', setMonthlyListPrice, '₺', true)}
                    </div>
                  </div>

                  <div className="border border-background-border rounded-lg p-2">
                    <div className="text-xs font-semibold mb-2 text-text-secondary">USD Fiyatları</div>
                    <div className="space-y-2">
                      {renderPriceInput('Birim Fiyat (USD)', unitPriceUsd, 'UnitPriceUsd', setUnitPriceUsd, '$', true)}
                      {renderPriceInput('Aylık Liste (USD)', monthlyListPriceUsd, 'MonthlyListPriceUsd', setMonthlyListPriceUsd, '$', true)}
                    </div>
                  </div>

                  <div className="border border-background-border rounded-lg p-2">
                    <div className="text-xs font-semibold mb-2 text-text-secondary">EUR Fiyatları</div>
                    <div className="space-y-2">
                      {renderPriceInput('Birim Fiyat (EUR)', unitPriceEur, 'UnitPriceEur', setUnitPriceEur, '€', true)}
                      {renderPriceInput('Aylık Liste (EUR)', monthlyListPriceEur, 'MonthlyListPriceEur', setMonthlyListPriceEur, '€', true)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border border-background-border rounded-lg p-2 xl:col-span-12">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Toplam Stok</label>
                  <input
                    type="number"
                    value={totalStock}
                    onChange={(e) => setTotalStock(e.target.value === '' ? '' : Number(e.target.value))}
                    disabled={isReadOnly}
                    min="0"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Kirada Olan
                    <span className="text-xs text-text-secondary ml-1">(Otomatik)</span>
                  </label>
                  <input
                    type="number"
                    value={onRent}
                    disabled={true}
                    className="input w-full bg-background-secondary cursor-not-allowed"
                    title="Bu değer sözleşmeler tarafından otomatik yönetilir"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Müsait Stok</label>
                  <div className={`input w-full flex items-center justify-center font-bold ${
                    availableStock > 0 ? 'text-green-500' : 'text-red-500'
                  } bg-background-secondary`}>
                    {availableStock}
                  </div>
                </div>
              </div>

              {!isReadOnly && (
                <div className="mt-2 text-[11px] text-text-secondary bg-background-secondary p-2 rounded-lg">
                  <strong>Not:</strong> "Kirada Olan" değeri sözleşmelerle otomatik yönetilir.
                </div>
              )}
              </div>
            </>
          )}

          {isNew ? (
            <>
              <div className="border border-background-border rounded-lg p-2 xl:col-span-12">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium">Fiyatlandırma</label>
                  {activeRates && (
                    <div className="text-xs text-text-secondary">
                      Aktif Kur: $1 = ₺{activeRates.UsdRate.toFixed(2)} | €1 = ₺{activeRates.EurRate.toFixed(2)}
                    </div>
                  )}
                </div>
                
                {isCalculating && (
                  <div className="text-xs text-accent mb-2 animate-pulse">Hesaplanıyor...</div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border border-background-border rounded-lg p-2">
                    <div className="text-xs font-semibold mb-2 text-text-secondary">TL Fiyatları</div>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-text-secondary mb-1">Birim Fiyat (TL) *</label>
                        <input
                          type="number"
                          value={unitPrice}
                          onChange={(e) => setUnitPrice(e.target.value === '' ? '' : Number(e.target.value))}
                          disabled={isReadOnly}
                          min="0"
                          step="0.01"
                          className="input w-full"
                          placeholder="0.00"
                        />
                      </div>
                      {renderPriceInput('Aylık Liste (TL)', monthlyListPrice, 'MonthlyListPrice', setMonthlyListPrice, '₺', true)}
                    </div>
                  </div>

                  <div className="border border-background-border rounded-lg p-2">
                    <div className="text-xs font-semibold mb-2 text-text-secondary">USD Fiyatları</div>
                    <div className="space-y-2">
                      {renderPriceInput('Birim Fiyat (USD)', unitPriceUsd, 'UnitPriceUsd', setUnitPriceUsd, '$', true)}
                      {renderPriceInput('Aylık Liste (USD)', monthlyListPriceUsd, 'MonthlyListPriceUsd', setMonthlyListPriceUsd, '$', true)}
                    </div>
                  </div>

                  <div className="border border-background-border rounded-lg p-2">
                    <div className="text-xs font-semibold mb-2 text-text-secondary">EUR Fiyatları</div>
                    <div className="space-y-2">
                      {renderPriceInput('Birim Fiyat (EUR)', unitPriceEur, 'UnitPriceEur', setUnitPriceEur, '€', true)}
                      {renderPriceInput('Aylık Liste (EUR)', monthlyListPriceEur, 'MonthlyListPriceEur', setMonthlyListPriceEur, '€', true)}
                    </div>
                  </div>
                </div>
                
                {!activePreset && (
                  <div className="mt-2 text-xs text-yellow-500 bg-yellow-900/20 p-2 rounded">
                    Kiralama oranı tanımlanmamış, lütfen aylık fiyatları manuel giriniz.
                  </div>
                )}
              </div>
            </>
          ) : null}

        </div>
          </>
        )}

        <div className="flex gap-2 mt-2 pt-2 border-t border-background-border bg-background-panel shrink-0">
          {!isNew && isReadOnly && (
            <button onClick={() => setIsReadOnly(false)} className="btn-primary flex-1">
              Düzenle
            </button>
          )}
          {!isReadOnly && (
            <>
              {!isNew && item && (
                <button
                  onClick={handleDeleteClick}
                  disabled={isBusy}
                  className="btn-danger flex-1"
                >
                  Sil
                </button>
              )}
              <button onClick={onClose} className="btn-secondary flex-1">
                İptal
              </button>
              <button
                onClick={handleSave}
                disabled={isBusy}
                className="btn-primary flex-1"
              >
                {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </>
          )}
          {isReadOnly && !isNew && (
            <button onClick={onClose} className="btn-secondary flex-1">
              Kapat
            </button>
          )}
        </div>
        </div>
        </div>
      </div>
      <ConfirmModal
        open={showDeleteConfirm}
        title="Onaylıyor musunuz?"
        message="Bu malzemeyi silmek istediğinizden emin misiniz?"
        variant="danger"
        loading={isBusy}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}


import { useState, useEffect, Fragment } from 'react';
import { CheckIcon, ClipboardIcon, ClockIcon, XIcon } from '@phosphor-icons/react';
import { AuditLog, Contract, Customer, Inventory, ContractLineItem, ConstructionSite, ReturnItemResponse, ContractReturn, ContractPriceCalculation, ContractTemplate, Warehouse } from '../../models';
import { contractService } from '../../services/contractService';
import { customerService } from '../../services/customerService';
import { inventoryService } from '../../services/inventoryService';
import { warehouseService } from '../../services/warehouseService';
import { siteService } from '../../services/siteService';
import { contractTemplateService } from '../../services/contractTemplateService';
import ContractTemplateEditorModal from './ContractTemplateEditorModal';
import PdfPreviewModal from './PdfPreviewModal';
import AuditLogTimeline from '../AuditLogTimeline';
import ConfirmModal from './ConfirmModal';
import ProductPickerModal from './ProductPickerModal';
import { getApiErrorMessage } from '../../utils/apiError';
import { firstValidationError, normalizeText, validateDate, validateNumber, validateRequired } from '../../utils/validation';
import { useAuthStore } from '../../store/authStore';
import ManualLineItemModal from './ManualLineItemModal';

interface ContractDetailModalProps {
  contract: Contract | null;
  isNew: boolean;
  onClose: () => void;
}

export default function ContractDetailModal({
  contract,
  isNew,
  onClose,
}: ContractDetailModalProps) {
  const [isReadOnly, setIsReadOnly] = useState(!isNew);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableItems, setAvailableItems] = useState<Inventory[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [sites, setSites] = useState<ConstructionSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<number | ''>('');
  const [sitesLoading, setSitesLoading] = useState(false);
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [plannedEndDate, setPlannedEndDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [actualEndDate, setActualEndDate] = useState<string>('');
  const [contractItems, setContractItems] = useState<ContractLineItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | ''>('');
  const [isBusy, setIsBusy] = useState(false);

  // İade işlemi state'leri - returnDetailKey: "itemId-warehouseId" formatında
  const [returnDetailKey, setReturnDetailKey] = useState<string | null>(null);
  const [returnWarehouseId, setReturnWarehouseId] = useState<number | ''>('');
  /** İade miktarı inputu – sadece rakam */
  const [returnQuantityStr, setReturnQuantityStr] = useState<string>('1');
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isReturning, setIsReturning] = useState(false);

  // İade geçmişi state'leri
  const [contractReturns, setContractReturns] = useState<ContractReturn[]>([]);
  const [returnsLoading, setReturnsLoading] = useState(false);

  // Fiyat hesaplama state'leri
  const [priceCalculation, setPriceCalculation] = useState<ContractPriceCalculation | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Şablon yönetimi state'leri
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>('');
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'return' | 'returns' | 'history'>('info');
  const [contractLogs, setContractLogs] = useState<AuditLog[]>([]);
  const [contractLogsLoading, setContractLogsLoading] = useState(false);
  const [fullContract, setFullContract] = useState<Contract | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [iskonto, setIskonto] = useState<number>(0);
  /** Satır bazlı iskonto (%) - key: "ItemId-WarehouseId". Üstteki iskonto değişince tüm satırlara yansır; satırda tek tek de düzenlenebilir. */
  const [itemIskonto, setItemIskonto] = useState<Record<string, number>>({});
  const [vatRate, setVatRate] = useState<number>(20);
  const [contractCode, setContractCode] = useState<string>('');
  const [currency, setCurrency] = useState<'TRY' | 'EUR'>('TRY');
  const [showProductPickerModal, setShowProductPickerModal] = useState(false);
  const [lastAddedKeys, setLastAddedKeys] = useState<string[]>([]);
  /** Depo stok cache: key = "itemId-warehouseId", value = müsait stok miktarı */
  const [warehouseStockCache, setWarehouseStockCache] = useState<Record<string, number>>({});
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [isAddingMaterialTable, setIsAddingMaterialTable] = useState(false);
  const [showManualLineModal, setShowManualLineModal] = useState(false);
  const currentUser = useAuthStore((s) => s.user);

  useEffect(() => {
    loadData();
    loadTemplates();
  }, []);

  // Mevcut sözleşme açıldığında tam detayı yükle (ContractDetails liste API'sinde gelmez)
  useEffect(() => {
    if (contract?.ContractId && !isNew) {
      let cancelled = false;
      const loadFullContract = async () => {
        try {
          const full = await contractService.getByIdAsync(contract.ContractId);
          if (!cancelled) setFullContract(full);
        } catch (err) {
          console.error('Load contract details error:', err);
          if (!cancelled) setFullContract(contract);
        }
      };
      loadFullContract();
      return () => { cancelled = true; };
    } else {
      setFullContract(null);
    }
  }, [contract?.ContractId, isNew]);

  const loadContractLogs = async () => {
    if (!contract?.ContractId) return;
    try {
      setContractLogsLoading(true);
      const data = await contractService.getAuditLogsByContractAsync(contract.ContractId);
      setContractLogs(data ?? []);
    } catch (error) {
      console.error('Load contract audit logs error:', error);
      setContractLogs([]);
    } finally {
      setContractLogsLoading(false);
    }
  };

  const loadContractReturns = async () => {
    if (!contract?.ContractId) return;
    try {
      setReturnsLoading(true);
      const data = await contractService.getReturnsAsync(contract.ContractId);
      setContractReturns(data ?? []);
    } catch (error) {
      console.error('Load contract returns error:', error);
      setContractReturns([]);
    } finally {
      setReturnsLoading(false);
    }
  };

  const handleCalculatePrice = async () => {
    if (!contract?.ContractId) return;
    try {
      setIsCalculating(true);
      const result = await contractService.calculatePriceAsync(contract.ContractId);
      setPriceCalculation(result);
    } catch (error) {
      console.error('Calculate price error:', error);
      alert(getApiErrorMessage(error) || 'Fiyat hesaplama hatası');
    } finally {
      setIsCalculating(false);
    }
  };

  useEffect(() => {
    if (contract?.ContractId && !isNew) {
      loadContractLogs();
      loadContractReturns();
    } else {
      setContractLogs([]);
      setContractReturns([]);
    }
  }, [contract?.ContractId, isNew]);

  const loadTemplates = async () => {
    try {
      const templateList = await contractTemplateService.getAllAsync();
      setTemplates(templateList);
    } catch (error) {
      console.error('Load templates error:', error);
    }
  };

  useEffect(() => {
    const source = fullContract ?? contract;
    if (source) {
      setSelectedCustomerId(source.CustomerId);
      setSelectedSiteId(source.SiteId || '');
      setStartDate(source.StartDate.split('T')[0]);
      setPlannedEndDate(source.PlannedEndDate.split('T')[0]);
      if (source.ActualEndDate) {
        setActualEndDate(source.ActualEndDate.split('T')[0]);
      }
      setIskonto((source as { Iskonto?: number }).Iskonto ?? 0);
      setVatRate((source as { VatRate?: number }).VatRate ?? 20);
      setContractCode((source as { ContractCode?: string }).ContractCode ?? '');
      setCurrency((source as { Currency?: string }).Currency === 'EUR' ? 'EUR' : 'TRY');
      // Backend GET /contracts/:id "details" döndürür, ContractDetails değil
      const details = (source as any).details ?? source.ContractDetails ?? [];
      if (details.length > 0) {
        const items: ContractLineItem[] = details.map((detail: any) => {
          const isManual = detail.IsManual === true || detail.is_manual === true || detail.IsManual === 1 || detail.is_manual === 1;
          if (isManual) {
            return {
              kind: 'manual',
              ClientId: `manual-${detail.DetailId ?? crypto.randomUUID()}`,
              DetailId: detail.DetailId,
              IsManual: true,
              Description: String(detail.Description ?? detail.description ?? '').trim() || 'Manuel Kalem',
              RentedQuantity: Number(detail.RentedQuantity ?? 1) || 1,
              DailyPriceAtRent: Number(detail.DailyPriceAtRent ?? 0) || 0,
            };
          }
          const wh = warehouses.find((w) => w.WarehouseId === detail.WarehouseId);
          return {
            kind: 'inventory',
            DetailId: detail.DetailId,
            ItemId: detail.ItemId,
            WarehouseId: detail.WarehouseId ?? 0,
            WarehouseName: wh?.WarehouseName ?? detail.WarehouseName ?? '',
            RentedQuantity: detail.RentedQuantity,
            ReturnedQuantity: detail.ReturnedQuantity,
            DailyPriceAtRent: detail.DailyPriceAtRent,
            Item: undefined,
            ItemName: detail.ItemName ?? '',
          };
        });
        setContractItems(items);
        const globalIsk = (source as { Iskonto?: number }).Iskonto ?? 0;
        setItemIskonto((prev) => {
          const next = { ...prev };
          items.forEach((i) => {
            if (i.kind === 'inventory') next[`${i.ItemId}-${i.WarehouseId}`] = globalIsk;
          });
          return next;
        });
      } else {
        setContractItems([]);
      }
      // Şantiyeleri yükle
      if (source.CustomerId) {
        loadSites(source.CustomerId);
      }
    }
  }, [contract, fullContract, warehouses]);

  // Müşteri değiştiğinde şantiyeleri yükle
  useEffect(() => {
    if (selectedCustomerId) {
      loadSites(Number(selectedCustomerId));
      setSelectedSiteId(''); // Müşteri değişince şantiye seçimini sıfırla
    } else {
      setSites([]);
      setSelectedSiteId('');
    }
  }, [selectedCustomerId]);

  const loadSites = async (customerId: number) => {
    try {
      setSitesLoading(true);
      const data = await siteService.getByCustomerAsync(customerId);
      setSites(data);
    } catch (error) {
      console.error('Load sites error:', error);
      setSites([]);
    } finally {
      setSitesLoading(false);
    }
  };

  useEffect(() => {
    // Ürün adlarını /inventory/:id ile tek tek çekmek yerine,
    // zaten yüklenmiş olan /inventory listesinden (availableItems) eşle.
    // Böylece backend'de GET /inventory/:id olmasa bile isimler görünür.
    if (availableItems.length === 0 || contractItems.length === 0) return;

    const inventoryMap = new Map<number, Inventory>();
    for (const inv of availableItems) {
      inventoryMap.set(inv.ItemId, inv);
    }

    setContractItems((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item.kind === 'manual') return item;
        // Boş veya önceki denemeden "Bilinmiyor" kalanları doldur.
        if (item.ItemName && item.ItemName !== 'Bilinmiyor') return item;
        const inv = inventoryMap.get(item.ItemId);
        if (!inv) return item;
        changed = true;
        return {
          ...item,
          Item: inv,
          ItemName: inv.ItemName,
        };
      });
      return changed ? next : prev;
    });
  }, [availableItems, contractItems.length]);

  const loadData = async () => {
    try {
      const [custData, invData, whData] = await Promise.all([
        customerService.getAllAsync(),
        inventoryService.getAllAsync(),
        warehouseService.getAllAsync(),
      ]);
      setCustomers(custData);
      setAvailableItems(invData);
      setWarehouses(whData);
    } catch (error) {
      console.error('Load data error:', error);
    }
  };

  const plannedDays = Math.ceil(
    (new Date(plannedEndDate).getTime() - new Date(startDate).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const actualDays = actualEndDate
    ? Math.ceil(
        (new Date(actualEndDate).getTime() - new Date(startDate).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 0;

  const getLineTotal = (item: ContractLineItem) => {
    if (item.kind === 'manual') return item.DailyPriceAtRent * item.RentedQuantity;
    return item.DailyPriceAtRent * item.RentedQuantity * plannedDays;
  };

  const initialTotalPrice = contractItems.reduce((sum, item) => sum + getLineTotal(item), 0);

  /** Satır için iskonto oranı: satıra özel yoksa üstteki global iskonto. */
  const getItemIskonto = (itemId: number, warehouseId: number) =>
    itemIskonto[`${itemId}-${warehouseId}`] ?? iskonto;

  // Toplam tutar kırılımları (satır bazlı iskonto)
  const subtotal = initialTotalPrice;
  const discountAmount = contractItems.reduce((sum, item) => {
    const lineTotal = getLineTotal(item);
    const pct = item.kind === 'inventory' ? getItemIskonto(item.ItemId, item.WarehouseId) : iskonto;
    return sum + lineTotal * (pct / 100);
  }, 0);
  const discountedTotal = subtotal - discountAmount;
  const vatAmount = discountedTotal * (vatRate / 100);
  const grandTotal = discountedTotal + vatAmount;

  /** Panelden ürün + miktar ile listeye ekler. */
  const addItemFromPicker = async (item: Inventory, quantity: number) => {
    if (!selectedWarehouseId) {
      alert('Depo seçimi zorunludur. Lütfen varsayılan depo seçin.');
      return;
    }
    const qty = Math.max(1, quantity);
    const whId = Number(selectedWarehouseId);
    const itemId = item.ItemId;

    let warehouseStock = 0;
    try {
      const whStocks = await inventoryService.getWarehousesByItemAsync(itemId);
      const whStock = whStocks.find((ws) => ws.WarehouseId === whId);
      warehouseStock = whStock?.Quantity ?? 0;
      setWarehouseStockCache((prev) => ({ ...prev, [`${itemId}-${whId}`]: warehouseStock }));
    } catch {
      warehouseStock = item.TotalStock - item.OnRent;
    }

    const existingDetail = contractItems.find(
      (i) => i.kind === 'inventory' && i.ItemId === itemId && i.WarehouseId === whId
    );
    const alreadyInContract = existingDetail?.RentedQuantity ?? 0;
    const effectiveAvailable = warehouseStock + (isNew ? 0 : alreadyInContract);
    const newTotalQuantity = existingDetail ? existingDetail.RentedQuantity + qty : qty;

    if (newTotalQuantity > effectiveAvailable) {
      const wh = warehouses.find((w) => w.WarehouseId === whId);
      alert(
        `Yetersiz depo stoku! "${item.ItemName}" için ${wh?.WarehouseName ?? 'seçili depoda'} müsait: ${effectiveAvailable}, istenen: ${newTotalQuantity}`
      );
      return;
    }

    const wh = warehouses.find((w) => w.WarehouseId === whId);
    if (existingDetail) {
      setContractItems(
        contractItems.map((i) =>
          i.kind === 'inventory' && i.ItemId === itemId && i.WarehouseId === whId
            ? { ...i, RentedQuantity: i.RentedQuantity + qty }
            : i
        )
      );
    } else {
      const dailyPriceAtRent =
        currency === 'EUR'
          ? (item.MonthlyListPriceEur ?? 0) / 30
          : (item.MonthlyListPrice || 0) / 30;
      setContractItems([
        ...contractItems,
        {
          kind: 'inventory',
          DetailId: 0,
          ItemId: itemId,
          WarehouseId: whId,
          WarehouseName: wh?.WarehouseName ?? '',
          RentedQuantity: qty,
          ReturnedQuantity: 0,
          DailyPriceAtRent: dailyPriceAtRent,
          Item: item,
          ItemName: item.ItemName,
        },
      ]);
      setItemIskonto((prev) => ({ ...prev, [`${itemId}-${whId}`]: iskonto }));
    }
    const key = `${itemId}-${whId}`;
    setLastAddedKeys((prev) => [...prev.filter((k) => k !== key), key]);
  };

  useEffect(() => {
    if (lastAddedKeys.length === 0) return;
    const t = setTimeout(() => setLastAddedKeys([]), 1600);
    return () => clearTimeout(t);
  }, [lastAddedKeys]);

  useEffect(() => {
    if (!isNew || contractItems.length === 0) return;
    const loadMissingStocks = async () => {
      for (const item of contractItems) {
        if (item.kind !== 'inventory') continue;
        const cacheKey = `${item.ItemId}-${item.WarehouseId}`;
        if (warehouseStockCache[cacheKey] === undefined && item.WarehouseId) {
          try {
            const whStocks = await inventoryService.getWarehousesByItemAsync(item.ItemId);
            const whStock = whStocks.find((ws) => ws.WarehouseId === item.WarehouseId);
            setWarehouseStockCache((prev) => ({ ...prev, [cacheKey]: whStock?.Quantity ?? 0 }));
          } catch { /* ignore */ }
        }
      }
    };
    loadMissingStocks();
  }, [contractItems, isNew]);

  const handleRemoveItem = (itemId: number, warehouseId: number) => {
    setContractItems(
      contractItems.filter((i) => !(i.kind === 'inventory' && i.ItemId === itemId && i.WarehouseId === warehouseId))
    );
  };

  const handleRemoveManualItem = (clientId: string) => {
    setContractItems(contractItems.filter((i) => !(i.kind === 'manual' && i.ClientId === clientId)));
  };

  const fetchWarehouseStock = async (itemId: number, warehouseId: number): Promise<number> => {
    const cacheKey = `${itemId}-${warehouseId}`;
    if (warehouseStockCache[cacheKey] !== undefined) return warehouseStockCache[cacheKey];
    try {
      const whStocks = await inventoryService.getWarehousesByItemAsync(itemId);
      const whStock = whStocks.find((ws) => ws.WarehouseId === warehouseId);
      const qty = whStock?.Quantity ?? 0;
      setWarehouseStockCache((prev) => ({ ...prev, [cacheKey]: qty }));
      return qty;
    } catch {
      return Infinity;
    }
  };

  const updateItemQuantity = async (itemId: number, warehouseId: number, newQty: number) => {
    const qty = Math.max(1, Math.floor(newQty));

    if (isNew) {
      const stock = await fetchWarehouseStock(itemId, warehouseId);
      if (stock !== Infinity && qty > stock) {
        const wh = warehouses.find((w) => w.WarehouseId === warehouseId);
        const item = availableItems.find((i) => i.ItemId === itemId);
        alert(
          `Yetersiz depo stoku! "${item?.ItemName ?? 'Ürün'}" için ${wh?.WarehouseName ?? 'seçili depoda'} müsait: ${stock}, istenen: ${qty}`
        );
        return;
      }
    }

    setContractItems((prev) =>
      prev.map((i) =>
        i.kind === 'inventory' && i.ItemId === itemId && i.WarehouseId === warehouseId
          ? { ...i, RentedQuantity: qty }
          : i
      )
    );
  };

  const updateContractItemIskonto = (itemId: number, warehouseId: number, value: number) => {
    const pct = Math.max(0, Math.min(100, value));
    setItemIskonto((prev) => ({ ...prev, [`${itemId}-${warehouseId}`]: pct }));
  };

  /** Üstteki iskonto değişince tüm satırlara uygula */
  const handleGlobalIskontoChange = (value: number) => {
    setIskonto(value);
    setItemIskonto((prev) => {
      const next = { ...prev };
      contractItems.forEach((i) => {
        if (i.kind === 'inventory') next[`${i.ItemId}-${i.WarehouseId}`] = value;
      });
      return next;
    });
  };

  const handleSave = async () => {
    const validationError = firstValidationError([
      validateRequired(String(selectedCustomerId || ''), 'Müşteri'),
      validateDate(startDate, 'Başlangıç tarihi', true),
      validateDate(plannedEndDate, 'Planlanan bitiş tarihi', true),
      validateNumber(iskonto, 'İskonto', { min: 0, max: 100 }),
      validateNumber(vatRate, 'KDV', { min: 0, max: 100 }),
    ]);
    if (validationError) {
      alert(validationError);
      return;
    }
    if (contractItems.length === 0) {
      alert('En az bir malzeme veya manuel kalem eklemelisiniz.');
      return;
    }

    // Eğer müşterinin şantiyeleri varsa ve şantiye seçilmemişse uyar
    if (sites.length > 0 && !selectedSiteId) {
      alert('Bu müşterinin şantiyeleri bulunuyor. Lütfen bir şantiye seçin.');
      return;
    }

    // Depo zorunluluğu yalnızca envanter kalemleri için geçerli (manuel kalemler stok etkilemez)
    if (isNew) {
      const invItems = contractItems.filter((i) => i.kind === 'inventory');
      const withoutWarehouse = invItems.filter((i) => !i.WarehouseId || i.WarehouseId === 0);
      if (withoutWarehouse.length > 0) {
        alert(
          'Depo stoğundan düşüm için envanter kalemlerinde depo seçilmesi zorunludur. Lütfen tüm envanter kalemlerine depo atayın.'
        );
        return;
      }
    }

    try {
      setIsBusy(true);

      if (isNew) {
        const details = contractItems.map((item) => {
          if (item.kind === 'manual') {
            return {
              IsManual: true,
              Description: item.Description,
              RentedQuantity: item.RentedQuantity,
              DailyPriceAtRent: item.DailyPriceAtRent,
            };
          }
          return {
            ItemId: item.ItemId,
            WarehouseId: item.WarehouseId,
            RentedQuantity: item.RentedQuantity,
            DailyPriceAtRent: item.DailyPriceAtRent,
          };
        });

        const requestBody: Record<string, unknown> = {
          CustomerId: Number(selectedCustomerId),
          StartDate: new Date(startDate).toISOString(),
          PlannedEndDate: new Date(plannedEndDate).toISOString(),
          InitialTotalPrice: initialTotalPrice,
          IsCompleted: false,
          Iskonto: iskonto,
          VatRate: vatRate,
          Currency: currency,
          details,
        };

        if (selectedSiteId) {
          requestBody.SiteId = Number(selectedSiteId);
        }
        if (normalizeText(contractCode)) {
          requestBody.ContractCode = normalizeText(contractCode);
        }

        if (contractItems.length > 0) {
          const inv = contractItems.filter((i) => i.kind === 'inventory');
          const firstWh = inv[0]?.WarehouseId;
          if (firstWh && inv.length > 0 && inv.every((i) => i.WarehouseId === firstWh)) {
            requestBody.defaultWarehouseId = firstWh;
          }
        }

        const result = await contractService.createAsync(requestBody as any);
        alert(`Sözleşme başarıyla oluşturuldu! (ID: ${result.ContractId})\n\nEnvanter ve depo stokları otomatik güncellendi.`);
      } else if (contract) {
        const updateBody: Record<string, unknown> = {
          Iskonto: iskonto,
          VatRate: vatRate,
          Currency: currency,
        };
        if (selectedSiteId) {
          updateBody.SiteId = Number(selectedSiteId);
        }
        if (normalizeText(contractCode)) {
          updateBody.ContractCode = normalizeText(contractCode);
        }

        await contractService.updateAsync(contract.ContractId, updateBody as any);
        alert('Sözleşme başarıyla güncellendi!');
      }
      onClose();
    } catch (error) {
      console.error('Save contract error:', error);
      const errorMsg = getApiErrorMessage(error);
      if (errorMsg.includes('Yetersiz') || errorMsg.includes('stok')) {
        alert(`Stok hatası: ${errorMsg}\n\nLütfen ürün miktarlarını kontrol edin.`);
      } else {
        alert(errorMsg || 'Kaydetme hatası');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteClick = () => {
    if (!contract || contract.IsCompleted) return;
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!contract || contract.IsCompleted) return;
    try {
      setIsBusy(true);
      await contractService.deleteAsync(contract.ContractId);
      setShowDeleteConfirm(false);
      alert('Sözleşme silindi. İade edilmemiş ürünlerin stokları geri eklendi.');
      onClose();
    } catch (error) {
      console.error('Delete contract error:', error);
      alert(getApiErrorMessage(error) || 'Silme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleComplete = async () => {
    if (!contract || contract.IsCompleted) return;

    const today = new Date().toISOString();
    try {
      setIsBusy(true);
      await contractService.completeContractAsync(contract.ContractId, today);
      alert('Sözleşme tamamlandı. Kalan ürünlerin stokları geri eklendi.');
      onClose();
    } catch (error) {
      console.error('Complete contract error:', error);
      alert(getApiErrorMessage(error) || 'Tamamlama hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleReturnClick = () => {
    const effectiveContract = fullContract ?? contract;
    if (!contract || !effectiveContract || effectiveContract.IsCompleted || !returnDetailKey) return;
    const [itemIdStr, warehouseIdStr] = returnDetailKey.split('-');
    const itemId = Number(itemIdStr);
    const warehouseId = Number(warehouseIdStr);
    const item = contractItems.find(
      (i): i is Extract<ContractLineItem, { kind: 'inventory' }> =>
        i.kind === 'inventory' && i.ItemId === itemId && i.WarehouseId === warehouseId
    );
    if (!item) return;
    const qty = Math.max(0, parseInt(returnQuantityStr, 10) || 0);
    const remainingOnRent = item.RentedQuantity - item.ReturnedQuantity;
    if (qty <= 0 || qty > remainingOnRent) {
      alert(`İade miktarı 1 ile ${remainingOnRent} arasında olmalıdır`);
      return;
    }
    setShowReturnConfirm(true);
  };

  const handleReturnItem = async () => {
    const effectiveContract = fullContract ?? contract;
    if (!contract || !effectiveContract || effectiveContract.IsCompleted || !returnDetailKey) return;

    const [itemIdStr, warehouseIdStr] = returnDetailKey.split('-');
    const itemId = Number(itemIdStr);
    const warehouseId = Number(warehouseIdStr);

    const item = contractItems.find(
      (i): i is Extract<ContractLineItem, { kind: 'inventory' }> =>
        i.kind === 'inventory' && i.ItemId === itemId && i.WarehouseId === warehouseId
    );
    if (!item) return;

    const qty = Math.max(0, parseInt(returnQuantityStr, 10) || 0);
    const remainingOnRent = item.RentedQuantity - item.ReturnedQuantity;
    if (qty <= 0 || qty > remainingOnRent) {
      alert(`İade miktarı 1 ile ${remainingOnRent} arasında olmalıdır`);
      return;
    }

    try {
      setIsReturning(true);
      const options: { returnDate?: string; returnWarehouseId?: number } = {};
      if (returnDate) options.returnDate = new Date(returnDate).toISOString();
      if (returnWarehouseId) options.returnWarehouseId = Number(returnWarehouseId);

      const result: ReturnItemResponse = await contractService.returnItemAsync(
        contract.ContractId,
        itemId,
        warehouseId,
        qty,
        options
      );

      // Başarılı iade sonrası contract items güncelle
      setContractItems((prevItems) =>
        prevItems.map((i) =>
          i.kind === 'inventory' && i.ItemId === itemId && i.WarehouseId === warehouseId
            ? { ...i, ReturnedQuantity: result.ReturnedQuantity }
            : i
        )
      );

      // İade formunu kapat ve onay modal'ını kapat
      setShowReturnConfirm(false);
      setReturnDetailKey(null);
      setReturnQuantityStr('1');
      setReturnDate(new Date().toISOString().split('T')[0]);
      setReturnWarehouseId('');

      // İade geçmişini yenile
      loadContractReturns();

      // Gecikme ücreti bilgisi ile mesaj oluştur
      let message = `İade başarılı!\nİade edilen: ${qty} adet\nKirada kalan: ${result.RemainingOnRent} adet`;
      if (result.LateDays > 0) {
        message += `\n\nGecikme: ${result.LateDays} gün`;
        message += `\nGecikme ücreti: ₺${result.LateFee.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`;
      }
      if (result.ContractCompleted) {
        message += '\n\nTüm ürünler iade edildi. Sözleşme otomatik olarak tamamlandı.';
      }

      alert(message);

      // Sözleşme otomatik tamamlandıysa modal'ı kapat
      if (result.ContractCompleted) {
        onClose();
      }
    } catch (error: unknown) {
      console.error('Return item error:', error);
      alert(getApiErrorMessage(error) || 'İade işlemi başarısız');
    } finally {
      setIsReturning(false);
    }
  };

  const openReturnForm = (item: Extract<ContractLineItem, { kind: 'inventory' }>) => {
    const remainingOnRent = item.RentedQuantity - item.ReturnedQuantity;
    if (remainingOnRent > 0) {
      setReturnDetailKey(`${item.ItemId}-${item.WarehouseId}`);
      setReturnQuantityStr('1');
      setReturnWarehouseId(item.WarehouseId); // Varsayılan: aynı depoya iade
    }
  };

  const closeReturnForm = () => {
    setReturnDetailKey(null);
    setReturnQuantityStr('1');
    setReturnWarehouseId('');
  };

  /** Sadece rakam girişine izin ver (miktar / iade miktarı) */
  const handleNumericInput = (setter: (v: string) => void, e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setter(raw);
  };

  const formatCurrency = (amount: number) => {
    const formatted = amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return currency === 'EUR' ? `€${formatted}` : `₺${formatted}`;
  };

  const handleGenerateDocument = async (format: 'pdf' | 'docx' = 'pdf') => {
    if (!contract || !selectedTemplateId) {
      alert('Döküman oluşturmak için bir şablon seçmelisiniz');
      return;
    }

    try {
      setIsBusy(true);
      const blob = await contractService.generateDocumentAsync(
        contract.ContractId,
        Number(selectedTemplateId),
        format
      );

      if (blob.size === 0) {
        alert('Belge oluşturulamadı (sunucu boş yanıt döndü).');
        return;
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sozlesme_${contract.ContractId}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Generate document error:', error);
      alert(getApiErrorMessage(error) || 'Döküman oluşturma hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePreviewDocument = async () => {
    if (!contract || !selectedTemplateId) {
      alert('Önizleme için bir şablon seçmelisiniz');
      return;
    }

    try {
      setIsBusy(true);
      const blob = await contractService.previewDocumentAsync(
        contract.ContractId,
        Number(selectedTemplateId)
      );
      // Backend tanı: gelen yanıtın tipi ve boyutu (konsolda kontrol edin)
      console.log('[PDF Önizleme] Blob:', { size: blob.size, type: blob.type });

      if (blob.size === 0) {
        alert('Sunucu boş yanıt döndürdü (boyut: 0). Backend preview-document endpoint\'ini kontrol edin.');
        return;
      }
      const isPdf = blob.type === 'application/pdf' || blob.type === '';
      if (!isPdf && blob.size < 10000) {
        const text = await blob.text();
        try {
          const j = JSON.parse(text);
          alert('Önizleme hatası (sunucu PDF değil): ' + (j.message || text.slice(0, 200)));
        } catch {
          alert('Sunucu PDF döndürmedi. Content-Type: ' + (blob.type || '(boş)') + '. Backend\'i kontrol edin.');
        }
        return;
      }
      if (!isPdf) {
        console.warn('[PDF Önizleme] Content-Type PDF değil:', blob.type, '- yine de açmayı deniyoruz.');
      }
      const url = window.URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setShowPdfPreview(true);
    } catch (error) {
      console.error('Preview document error:', error);
      alert(getApiErrorMessage(error) || 'Önizleme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const closePdfPreview = () => {
    setShowPdfPreview(false);
    if (pdfPreviewUrl) {
      window.URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background-main">
      {/* Üst başlık çubuğu - sistem penceresi görünümü */}
      <header className="shrink-0 flex items-center justify-between px-6 py-4 bg-background-panel border-b border-background-border shadow-sm">
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">
          {isNew ? 'Yeni Sözleşme' : `Sözleşme #${contract?.ContractId ?? ''} Detayı`}
        </h1>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
          aria-label="Kapat"
        >
          <XIcon size={22} weight="regular" />
        </button>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="w-full max-w-6xl mx-auto p-6">
        {!isNew && (
          <div className="flex gap-2 mb-4 border-b border-background-border pb-2">
            <button
              onClick={() => setActiveTab('info')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'info'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Bilgiler
            </button>
            {(fullContract ?? contract) && !(fullContract ?? contract)!.IsCompleted && (
              <button
                onClick={() => setActiveTab('return')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'return'
                    ? 'text-accent border-b-2 border-accent'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                İade Al
                {contractItems.some(i => i.kind === 'inventory' && (i.RentedQuantity - i.ReturnedQuantity) > 0) && (
                  <span className="ml-1.5 bg-green-600/30 text-green-400 text-xs px-1.5 py-0.5 rounded-full">
                    {contractItems.filter(i => i.kind === 'inventory' && (i.RentedQuantity - i.ReturnedQuantity) > 0).length}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => setActiveTab('returns')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'returns'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              İade Geçmişi
              {contractReturns.length > 0 && (
                <span className="ml-1.5 bg-accent/20 text-accent text-xs px-1.5 py-0.5 rounded-full">
                  {contractReturns.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'history'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Geçmiş
            </button>
          </div>
        )}

        {activeTab === 'return' && !isNew && (
          <>
            <h3 className="text-lg font-semibold mb-3">Ürün İade Al</h3>
            <p className="text-sm text-text-secondary mb-4">
              Müşteriden gelen ürünleri iade almak için aşağıdaki listeden ürün seçin, miktar ve tarih girin.
            </p>
            {contractItems.length === 0 ? (
              <div className="text-center py-8 text-text-secondary">
                Bu sözleşmede kiralanan malzeme bulunmuyor veya yükleniyor...
              </div>
            ) : (
              <div className="space-y-3">
                {contractItems.filter((i) => i.kind === 'inventory').map((item) => {
                  const remainingOnRent = item.RentedQuantity - item.ReturnedQuantity;
                  const itemKey = `${item.ItemId}-${item.WarehouseId}`;
                  const isReturnFormOpen = returnDetailKey === itemKey;

                  return (
                    <div key={itemKey} className="card">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{item.ItemName}</span>
                            {item.WarehouseName && (
                              <span className="text-xs px-2 py-0.5 bg-background-secondary rounded text-text-secondary">
                                {item.WarehouseName}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-text-secondary">
                            Kirada: {remainingOnRent} / {item.RentedQuantity} adet
                            {item.ReturnedQuantity > 0 && (
                              <span className="ml-2 inline-flex items-center gap-1 text-green-400"><CheckIcon size={14} weight="bold" aria-hidden /> İade: {item.ReturnedQuantity}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {remainingOnRent > 0 ? (
                            <button
                              onClick={() => openReturnForm(item)}
                              className="btn-success text-sm px-4 py-2"
                              disabled={isReturning}
                            >
                              İade Al
                            </button>
                          ) : (
                            <span className="text-sm text-green-400">Tamamı iade edildi</span>
                          )}
                        </div>
                      </div>

                      {isReturnFormOpen && remainingOnRent > 0 && (
                        <div className="mt-3 pt-3 border-t border-background-border">
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="text-sm">İade Miktarı:</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={returnQuantityStr}
                              onChange={(e) => handleNumericInput(setReturnQuantityStr, e)}
                              className="input w-24"
                              placeholder="1"
                              disabled={isReturning}
                              aria-label="İade miktarı"
                            />
                            <span className="text-sm text-text-secondary">/ {remainingOnRent} adet</span>
                            <label className="text-sm ml-2">İade Tarihi:</label>
                            <input
                              type="date"
                              value={returnDate}
                              onChange={(e) => setReturnDate(e.target.value)}
                              className="input w-40"
                              disabled={isReturning}
                            />
                            <label className="text-sm ml-2">Hedef Depo:</label>
                            <select
                              value={returnWarehouseId}
                              onChange={(e) => setReturnWarehouseId(Number(e.target.value) || '')}
                              className="input w-40"
                              disabled={isReturning}
                            >
                              <option value="">Kaynak depoya iade</option>
                              {warehouses.map((wh) => (
                                <option key={wh.WarehouseId} value={wh.WarehouseId}>
                                  {wh.WarehouseName}
                                </option>
                              ))}
                            </select>
                            <div className="flex-1" />
                            <button
                              onClick={closeReturnForm}
                              className="btn-secondary text-sm px-3 py-1"
                              disabled={isReturning}
                            >
                              İptal
                            </button>
                            <button
                              onClick={handleReturnClick}
                              className="btn-success text-sm px-3 py-1"
                              disabled={isReturning}
                            >
                              {isReturning ? 'İşleniyor...' : 'Onayla'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="btn-secondary flex-1">
                Kapat
              </button>
            </div>
          </>
        )}

        {activeTab === 'returns' && !isNew && (
          <>
            <h3 className="text-lg font-semibold mb-3">İade Geçmişi</h3>
            {returnsLoading ? (
              <div className="text-center py-8 text-text-secondary">Yükleniyor...</div>
            ) : contractReturns.length === 0 ? (
              <div className="text-center py-8 text-text-secondary">
                Bu sözleşmede henüz iade kaydı bulunmuyor.
              </div>
            ) : (
              <div className="space-y-3">
                {contractReturns.map((ret) => (
                  <div key={ret.ReturnId} className="card">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{ret.ItemName}</span>
                          {ret.WarehouseName && (
                            <span className="text-xs px-2 py-0.5 bg-background-secondary rounded text-text-secondary">
                              {ret.WarehouseName}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-text-secondary">
                          {ret.ReturnQuantity} adet iade
                          {' — '}
                          {new Date(ret.ReturnDate).toLocaleDateString('tr-TR')}
                        </div>
                        {ret.LateDays > 0 && (
                          <div className="text-xs mt-1 flex gap-3">
                            <span className="text-orange-400">
                              Gecikme: {ret.LateDays} gün
                            </span>
                            <span className="text-red-400">
                              Gecikme ücreti: {formatCurrency(ret.LateFee)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-text-secondary">
                        {new Date(ret.CreatedAt).toLocaleString('tr-TR')}
                      </div>
                    </div>
                  </div>
                ))}
                {/* Toplam gecikme ücreti özeti */}
                {contractReturns.some(r => r.LateFee > 0) && (
                  <div className="card bg-orange-900/30 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Toplam Gecikme Ücreti</span>
                      <span className="font-bold text-orange-300">
                        {formatCurrency(contractReturns.reduce((sum, r) => sum + r.LateFee, 0))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="btn-secondary flex-1">
                Kapat
              </button>
            </div>
          </>
        )}

        {activeTab === 'history' && !isNew && (
          <>
            <h3 className="text-lg font-semibold mb-3">Aktivite Geçmişi</h3>
            <AuditLogTimeline logs={contractLogs} loading={contractLogsLoading} />
            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="btn-secondary flex-1">
                Kapat
              </button>
            </div>
          </>
        )}

        {(activeTab === 'info' || isNew) && (
        <>
        <div className="space-y-4">
          {/* Üst: Genel Bilgiler - teklif ekranı gibi yatay grid */}
          <section className="rounded-xl border border-background-border bg-background-panel p-3 shadow-sm">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 pb-1.5 border-b border-background-border">
              Genel Bilgiler
            </h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">Sözleşme Kodu (Opsiyonel)</label>
                <input
                  type="text"
                  value={contractCode}
                  onChange={(e) => setContractCode(e.target.value)}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                  placeholder="Örn: SZ-2026-001"
                  maxLength={50}
                />
              </div>

              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">Müşteri Seçimi *</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(Number(e.target.value) || '')}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                  required
                >
                  <option value="">Müşteri seçin</option>
                  {customers.map((customer) => (
                    <option key={customer.CustomerId} value={customer.CustomerId}>
                      {customer.Name}
                    </option>
                  ))}
                </select>
              </div>

              {!isReadOnly && (
                <div className="space-y-0.5">
                  <label className="block text-xs font-medium text-text-primary">Sözleşme Şablonu (Opsiyonel)</label>
                  <div className="flex gap-2">
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(Number(e.target.value) || '')}
                      className="input w-full text-sm py-1.5"
                    >
                      <option value="">Şablon seçin</option>
                      {templates.map((t) => (
                        <option key={t.TemplateId} value={t.TemplateId}>
                          {t.TemplateName} {t.IsDefault ? '(Varsayılan)' : ''}
                        </option>
                      ))}
                    </select>
                    {selectedTemplateId && (
                      <button
                        type="button"
                        onClick={async () => {
                          const template = templates.find((t) => t.TemplateId === Number(selectedTemplateId));
                          if (!template) return;
                          try {
                            setLoadingTemplate(true);
                            const fullTemplate = await contractTemplateService.getByIdAsync(template.TemplateId);
                            setEditingTemplate(fullTemplate);
                            setIsNewTemplate(false);
                            setIsTemplateEditorOpen(true);
                          } catch (error) {
                            console.error('Şablon yükleme hatası:', error);
                            alert(getApiErrorMessage(error));
                          } finally {
                            setLoadingTemplate(false);
                          }
                        }}
                        disabled={loadingTemplate}
                        className="btn-secondary text-sm shrink-0"
                      >
                        {loadingTemplate ? 'Yükleniyor...' : 'Düzenle'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTemplate(null);
                        setIsNewTemplate(true);
                        setIsTemplateEditorOpen(true);
                      }}
                      className="btn-secondary text-sm shrink-0"
                    >
                      Yeni
                    </button>
                  </div>
                </div>
              )}

              {selectedCustomerId && (
                <div className="space-y-0.5">
                  <label className="block text-xs font-medium text-text-primary">
                    Şantiye Seçimi {sites.length > 0 ? '*' : '(Opsiyonel)'}
                  </label>
                  {sitesLoading ? (
                    <div className="input w-full text-text-secondary text-sm py-2">Yükleniyor...</div>
                  ) : sites.length > 0 ? (
                    <select
                      value={selectedSiteId}
                      onChange={(e) => setSelectedSiteId(Number(e.target.value) || '')}
                      disabled={isReadOnly}
                      className="input w-full text-sm py-1.5"
                      required={sites.length > 0}
                    >
                      <option value="">Şantiye seçin</option>
                      {sites.map((site) => (
                        <option key={site.SiteId} value={site.SiteId}>
                          {site.SiteName}
                          {site.SiteAddress && ` - ${site.SiteAddress}`}
                          {site.ResponsiblePerson && ` (${site.ResponsiblePerson})`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="input w-full text-text-secondary bg-background-secondary text-sm py-2">
                      Bu müşterinin şantiyesi yok
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">Başlangıç Tarihi</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                />
              </div>
              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">Planlanan Bitiş</label>
                <input
                  type="date"
                  value={plannedEndDate}
                  onChange={(e) => setPlannedEndDate(e.target.value)}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                />
              </div>
              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">Sözleşme Sahibi</label>
                <div className="input w-full bg-background-secondary text-text-secondary py-1.5 px-2 text-xs rounded-lg border border-background-border">
                  {currentUser?.FullName || currentUser?.Username || '—'}
                </div>
              </div>
              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">İskonto (%)</label>
                <input
                  type="number"
                  value={Number(iskonto) || 0}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    handleGlobalIskontoChange(Number.isFinite(v) ? v : 0);
                  }}
                  disabled={isReadOnly}
                  min={0}
                  max={100}
                  step={0.01}
                  className="input w-20 text-sm py-1.5"
                  placeholder="0"
                  title="Tüm satırlara uygulanır"
                />
              </div>
              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">KDV (%)</label>
                <input
                  type="number"
                  value={vatRate}
                  onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
                  disabled={isReadOnly}
                  min={0}
                  max={100}
                  step={1}
                  className="input w-20 text-sm py-1.5"
                  placeholder="20"
                />
              </div>
              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">Para Birimi</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'TRY' | 'EUR')}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                >
                  <option value="TRY">TRY (TL)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
              {!isReadOnly && (
                <div className="space-y-0.5">
                  <label className="block text-xs font-medium text-text-primary">Varsayılan depo *</label>
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(Number(e.target.value) || '')}
                    className="input w-full text-sm py-1.5"
                  >
                    <option value="">Depo seçin</option>
                    {warehouses.map((wh) => (
                      <option key={wh.WarehouseId} value={wh.WarehouseId}>
                        {wh.WarehouseName}
                      </option>
                    ))}
                  </select>
                  {!selectedWarehouseId && (
                    <span className="text-xs text-amber-400">Ürün eklemek için depo seçin.</span>
                  )}
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-background-border pt-2">
              <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
                <span><span className="font-medium text-text-primary">Planlanan Süre:</span> {plannedDays} gün</span>
                {actualDays > 0 && (
                  <span><span className="font-medium text-text-primary">Gerçekleşen Süre:</span> {actualDays} gün</span>
                )}
                <span><span className="font-medium text-text-primary">Durum:</span> {contract?.IsCompleted ? 'Tamamlandı' : 'Aktif'}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setShowProductPickerModal(true)}
                    className="btn-secondary"
                  >
                    Ürün Ekle
                  </button>
                )}
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setShowManualLineModal(true)}
                    className="btn-secondary"
                  >
                    Manuel Kalem Ekle
                  </button>
                )}
                {!isReadOnly && selectedTemplateId && contractItems.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        setIsAddingMaterialTable(true);
                        const template = templates.find((t) => t.TemplateId === Number(selectedTemplateId));
                        if (!template) return;
                        const fullTemplate = await contractTemplateService.getByIdAsync(template.TemplateId);
                        const content = JSON.parse(JSON.stringify(fullTemplate.Content || { type: 'doc', content: [] }));
                        if (!content.content) content.content = [];

                        const hasPlaceholder = JSON.stringify(content).includes('{{malzemeTablosu}}');
                        if (hasPlaceholder) {
                          alert('Bu şablonda zaten malzeme tablosu placeholder\'ı mevcut.');
                          return;
                        }

                        const placeholderNode = {
                          type: 'paragraph',
                          content: [{ type: 'text', text: '{{malzemeTablosu}}' }],
                        };
                        content.content.push(placeholderNode);
                        await contractTemplateService.updateAsync(template.TemplateId, { Content: content });
                        await loadTemplates();
                        alert('Malzeme tablosu şablona eklendi!');
                      } catch (error) {
                        console.error('Add material table error:', error);
                        alert(getApiErrorMessage(error));
                      } finally {
                        setIsAddingMaterialTable(false);
                      }
                    }}
                    disabled={isAddingMaterialTable}
                    className="btn-secondary text-sm"
                  >
                    <ClipboardIcon size={16} weight="regular" className="inline mr-1" aria-hidden />
                    {isAddingMaterialTable ? 'Ekleniyor...' : 'Tabloyu Şablona Ekle'}
                  </button>
                )}
                {!isNew && isReadOnly && (
                  <button type="button" onClick={() => setIsReadOnly(false)} className="btn-primary">Düzenle</button>
                )}
                {!isReadOnly && !isNew && contract && !contract.IsCompleted && (
                  <>
                    <button type="button" onClick={handleDeleteClick} disabled={isBusy} className="btn-danger">Sil</button>
                    <button type="button" onClick={handleComplete} disabled={isBusy} className="btn-success">Tamamla</button>
                  </>
                )}
                {!isNew && contract && selectedTemplateId && (
                  <>
                    <button type="button" onClick={handlePreviewDocument} disabled={isBusy} className="btn-primary text-sm">
                      {isBusy ? 'Yükleniyor...' : 'Önizle'}
                    </button>
                    <button type="button" onClick={() => handleGenerateDocument('pdf')} disabled={isBusy} className="btn-secondary text-sm">PDF İndir</button>
                    <button type="button" onClick={() => handleGenerateDocument('docx')} disabled={isBusy} className="btn-secondary text-sm">Word İndir</button>
                  </>
                )}
                {!isReadOnly && (
                  <>
                    <button type="button" onClick={onClose} className="btn-secondary">İptal</button>
                    <button type="button" onClick={handleSave} disabled={isBusy} className="btn-primary">
                      {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                  </>
                )}
                {isReadOnly && !isNew && (
                  <button type="button" onClick={onClose} className="btn-secondary">Kapat</button>
                )}
              </div>
            </div>
          </section>

          {/* Kiralanan Malzemeler tablosu - tam genişlik */}
          <section className="rounded-xl border border-background-border bg-background-panel shadow-sm flex-1 min-h-[260px] flex flex-col overflow-hidden">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider px-4 pt-4 pb-2 border-b border-background-border shrink-0">
              Kiralanan Malzemeler
            </h3>
            <div className="border-0 rounded-b-xl overflow-auto flex-1 min-h-0">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 bg-background-secondary z-10 border-b border-background-border">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-text-secondary whitespace-nowrap">Ürün Kodu</th>
                      <th className="text-left px-3 py-2 font-semibold text-text-secondary">Ürün Adı</th>
                      <th className="text-left px-3 py-2 font-semibold text-text-secondary whitespace-nowrap">Depo</th>
                      {isNew && <th className="text-right px-3 py-2 font-semibold text-text-secondary whitespace-nowrap">Müsait Stok</th>}
                      <th className="text-right px-3 py-2 font-semibold text-text-secondary w-24">Miktar</th>
                      <th className="text-right px-3 py-2 font-semibold text-text-secondary whitespace-nowrap">Birim Fiyat</th>
                      <th className="text-right px-3 py-2 font-semibold text-text-secondary w-20">İskonto (%)</th>
                      <th className="text-right px-3 py-2 font-semibold text-text-secondary whitespace-nowrap">Toplam</th>
                      <th className="text-center px-2 py-2 font-semibold text-text-secondary w-20">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractItems.length === 0 ? (
                      <tr>
                        <td colSpan={isNew ? 9 : 8} className="px-3 py-6 text-center text-sm text-text-secondary">
                          Henüz malzeme eklenmedi. Üst kısımdan &quot;Ürün Ekle&quot; butonu ile malzeme seçebilirsiniz.
                        </td>
                      </tr>
                    ) : (
                    contractItems.map((item) => {
                      const remainingOnRent = item.kind === 'inventory' ? item.RentedQuantity - item.ReturnedQuantity : 0;
                      const itemKey = item.kind === 'inventory' ? `${item.ItemId}-${item.WarehouseId}` : item.ClientId;
                      const isReturnFormOpen = item.kind === 'inventory' ? returnDetailKey === itemKey : false;
                      const itemCode = item.kind === 'inventory' ? (availableItems.find((i) => i.ItemId === item.ItemId)?.ItemCode ?? '—') : '—';
                      const justAdded = item.kind === 'inventory' ? lastAddedKeys.includes(itemKey) : false;
                      return (
                        <Fragment key={itemKey}>
                          <tr
                            className={`border-b border-background-border hover:bg-background-hover/50 transition-colors duration-300 ${
                              justAdded ? 'bg-green-500/20' : ''
                            }`}
                          >
                            <td className="px-3 py-2 text-text-secondary">{itemCode}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium">{item.kind === 'inventory' ? item.ItemName : item.Description}</div>
                              {item.kind === 'inventory' && item.ReturnedQuantity > 0 && (
                                <div className="text-xs text-text-secondary mt-0.5 flex gap-2">
                                  <span className="text-green-400"><CheckIcon size={10} weight="bold" className="inline" aria-hidden /> İade: {item.ReturnedQuantity}</span>
                                  <span className="text-orange-400"><ClockIcon size={10} weight="regular" className="inline" aria-hidden /> Kirada: {remainingOnRent}</span>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-text-secondary">{item.kind === 'inventory' ? (item.WarehouseName ?? '—') : '—'}</td>
                            {isNew && (
                              item.kind === 'inventory' ? (() => {
                                const cacheKey = `${item.ItemId}-${item.WarehouseId}`;
                                const stock = warehouseStockCache[cacheKey];
                                const isOverStock = stock !== undefined && item.RentedQuantity > stock;
                                return (
                                  <td className={`px-3 py-2 text-right text-sm ${isOverStock ? 'text-red-400 font-semibold' : 'text-text-secondary'}`}>
                                    {stock !== undefined ? stock : '—'}
                                  </td>
                                );
                              })() : (
                                <td className="px-3 py-2 text-right text-sm text-text-secondary">—</td>
                              )
                            )}
                            <td className="px-3 py-2 text-right">
                              {isReadOnly ? (
                                item.RentedQuantity
                              ) : (
                                <input
                                  type="number"
                                  min={1}
                                  value={item.RentedQuantity}
                                  onChange={(e) => {
                                    const v = Number(e.target.value) || 1;
                                    if (item.kind === 'inventory') {
                                      updateItemQuantity(item.ItemId, item.WarehouseId, v);
                                    } else {
                                      setContractItems((prev) =>
                                        prev.map((x) =>
                                          x.kind === 'manual' && x.ClientId === item.ClientId
                                            ? { ...x, RentedQuantity: Math.max(1, Math.floor(v)) }
                                            : x
                                        )
                                      );
                                    }
                                  }}
                                  className="input w-16 text-right py-1 text-sm"
                                  aria-label="Miktar"
                                />
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-text-secondary">{formatCurrency(item.DailyPriceAtRent)}/gün</td>
                            <td className="px-3 py-2 text-right">
                              {isReadOnly ? (
                                Number(item.kind === 'inventory' ? getItemIskonto(item.ItemId, item.WarehouseId) : iskonto) || 0
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.01}
                                  value={Number(item.kind === 'inventory' ? getItemIskonto(item.ItemId, item.WarehouseId) : iskonto) || 0}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value);
                                    if (item.kind === 'inventory') {
                                      updateContractItemIskonto(
                                        item.ItemId,
                                        item.WarehouseId,
                                        Number.isFinite(v) ? v : 0
                                      );
                                    } else {
                                      setIskonto(Number.isFinite(v) ? v : 0);
                                    }
                                  }}
                                  className="input w-16 text-right py-1 text-sm"
                                  aria-label="İskonto %"
                                />
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-green-500">{formatCurrency(getLineTotal(item))}</td>
                            <td className="px-2 py-2 text-center">
                              {!isNew && item.kind === 'inventory' && (fullContract ?? contract) && !(fullContract ?? contract)!.IsCompleted && remainingOnRent > 0 && isReadOnly && (
                                <button type="button" onClick={() => openReturnForm(item)} className="btn-secondary text-xs px-2 py-1" disabled={isReturning}>İade Et</button>
                              )}
                              {!isReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => (item.kind === 'inventory' ? handleRemoveItem(item.ItemId, item.WarehouseId) : handleRemoveManualItem(item.ClientId))}
                                  className="text-error hover:text-red-700 inline-flex p-1"
                                  aria-label="Kaldır"
                                >
                                  <XIcon size={18} weight="regular" />
                                </button>
                              )}
                            </td>
                          </tr>
                          {item.kind === 'inventory' && isReturnFormOpen && (
                            <tr className="bg-background-secondary/50">
                              <td colSpan={isNew ? 9 : 8} className="px-3 py-3 border-b border-background-border">
                                <div className="flex flex-wrap items-center gap-3">
                                  <label className="text-sm">İade Miktarı:</label>
                                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={returnQuantityStr} onChange={(e) => handleNumericInput(setReturnQuantityStr, e)} className="input w-24" placeholder="1" disabled={isReturning} aria-label="İade miktarı" />
                                  <span className="text-sm text-text-secondary">/ {remainingOnRent} adet</span>
                                  <label className="text-sm ml-2">İade Tarihi:</label>
                                  <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="input w-40" disabled={isReturning} />
                                  <label className="text-sm ml-2">Hedef Depo:</label>
                                  <select value={returnWarehouseId} onChange={(e) => setReturnWarehouseId(Number(e.target.value) || '')} className="input w-40" disabled={isReturning}>
                                    <option value="">Kaynak depoya iade</option>
                                    {warehouses.map((wh) => (<option key={wh.WarehouseId} value={wh.WarehouseId}>{wh.WarehouseName}</option>))}
                                  </select>
                                  <div className="flex-1" />
                                  <button onClick={closeReturnForm} className="btn-secondary text-sm px-3 py-1" disabled={isReturning}>İptal</button>
                                  <button onClick={handleReturnClick} className="btn-success text-sm px-3 py-1" disabled={isReturning}>{isReturning ? 'İşleniyor...' : 'Onayla'}</button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                    )}
                  </tbody>
                </table>
            </div>
          </section>

          {/* Alt: Finansal özet (teklif ekranı gibi) */}
          <section className="rounded-xl border border-background-border bg-background-panel p-4 shadow-sm shrink-0">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 text-sm">
              <div>
                <div className="text-text-secondary mb-1">Ara Toplam</div>
                <div className="font-semibold text-text-primary">{formatCurrency(subtotal)}</div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">Toplam İskonto</div>
                <div className="font-semibold text-red-300">-{formatCurrency(discountAmount)}</div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">İskontolu Toplam</div>
                <div className="font-semibold text-text-primary">{formatCurrency(discountedTotal)}</div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">KDV Toplam ({vatRate || 0}%)</div>
                <div className="font-semibold text-yellow-300">{formatCurrency(vatAmount)}</div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">Genel Toplam</div>
                <div className="text-2xl font-bold text-green-400">{formatCurrency(grandTotal)}</div>
              </div>
            </div>
            <div className="mt-2 text-xs text-text-secondary">
              (Planlanan süre üzerinden hesaplanmıştır)
            </div>

            {contract?.FinalCalculatedPrice && (
              <div className="mt-3 pt-3 border-t border-background-border">
                <div className="text-xs text-text-secondary mb-1">Final Tutar</div>
                <div className="text-lg font-bold text-green-200">{formatCurrency(contract.FinalCalculatedPrice)}</div>
                <div className="text-[11px] text-text-secondary">(Gerçekleşen süre üzerinden)</div>
              </div>
            )}

            {!isNew && contract && !contract.IsCompleted && (
              <div className="mt-3 pt-3 border-t border-background-border">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-semibold text-sm">Fiyat Hesaplama</div>
                    <div className="text-xs text-text-secondary">Temel ücret ve gecikme ücretleri kırılımı</div>
                  </div>
                  <button
                    onClick={handleCalculatePrice}
                    disabled={isCalculating}
                    className="btn-primary text-sm px-4 py-2"
                  >
                    {isCalculating ? 'Hesaplanıyor...' : 'Fiyat Hesapla'}
                  </button>
                </div>
                {priceCalculation && (
                  <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                    <div className="rounded-lg bg-blue-900/30 p-2">
                      <span className="text-text-secondary">Planlanan:</span> {priceCalculation.plannedDays} gün
                    </div>
                    <div className="rounded-lg bg-blue-900/30 p-2">
                      <span className="text-text-secondary">Temel Ücret:</span> {formatCurrency(priceCalculation.basePrice)}
                    </div>
                    {priceCalculation.totalLateFee > 0 && (
                      <div className="col-span-2 rounded-lg bg-orange-900/30 p-2">
                        <span className="text-text-secondary">Gecikme Ücreti:</span> {formatCurrency(priceCalculation.totalLateFee)}
                      </div>
                    )}
                    <div className="col-span-2 rounded-lg bg-green-900 p-2 font-bold">
                      Final Fiyat: {formatCurrency(priceCalculation.finalPrice)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
        </>
        )}
      </div>

      <ConfirmModal
        open={showDeleteConfirm}
        title="Onaylıyor musunuz?"
        message="Bu sözleşmeyi silmek istediğinizden emin misiniz?"
        variant="danger"
        loading={isBusy}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />
      <ConfirmModal
        open={showReturnConfirm}
        title="Onaylıyor musunuz?"
        message={returnDetailKey ? (() => {
          const [itemIdStr, warehouseIdStr] = returnDetailKey.split('-');
          const itemId = Number(itemIdStr);
          const warehouseId = Number(warehouseIdStr);
          const item = contractItems.find(
            (i): i is Extract<ContractLineItem, { kind: 'inventory' }> =>
              i.kind === 'inventory' && i.ItemId === itemId && i.WarehouseId === warehouseId
          );
          const qty = Math.max(0, parseInt(returnQuantityStr, 10) || 0);
          return item ? `Bu iadeyi onaylıyor musunuz? (${qty} adet, ${item.ItemName})` : 'Bu iadeyi onaylıyor musunuz?';
        })() : 'Bu iadeyi onaylıyor musunuz?'}
        loading={isReturning}
        onConfirm={handleReturnItem}
        onCancel={() => setShowReturnConfirm(false)}
      />
      {/* Şablon Editör Modal */}
      {isTemplateEditorOpen && (
        <ContractTemplateEditorModal
          template={editingTemplate}
          isNew={isNewTemplate}
          onClose={() => {
            setIsTemplateEditorOpen(false);
            setEditingTemplate(null);
            loadTemplates();
          }}
          onSave={(templateId) => {
            setSelectedTemplateId(templateId);
            setIsTemplateEditorOpen(false);
            setEditingTemplate(null);
            loadTemplates();
          }}
        />
      )}
      <ProductPickerModal
        open={showProductPickerModal}
        onClose={() => setShowProductPickerModal(false)}
        items={availableItems}
        onItemSelect={addItemFromPicker}
        displayMode="contract"
        currency={currency}
      />
      <ManualLineItemModal
        open={showManualLineModal}
        mode="contract"
        currency={currency}
        onClose={() => setShowManualLineModal(false)}
        onAdd={(data) => {
          setContractItems((prev) => [
            ...prev,
            {
              kind: 'manual',
              ClientId: `manual-${crypto.randomUUID()}`,
              IsManual: true,
              Description: data.Description,
              RentedQuantity: data.Quantity,
              DailyPriceAtRent: data.DailyPrice,
            },
          ]);
        }}
      />
      <PdfPreviewModal
        open={showPdfPreview}
        pdfUrl={pdfPreviewUrl}
        title={`Sözleşme #${contract?.ContractId ?? ''} Önizleme`}
        downloadFileName={`sozlesme_${contract?.ContractId ?? ''}.pdf`}
        onClose={closePdfPreview}
      />
      </div>
    </div>
  );
}


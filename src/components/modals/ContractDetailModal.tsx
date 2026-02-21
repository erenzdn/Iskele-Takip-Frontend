import { useState, useEffect } from 'react';
import { AuditLog, Contract, Customer, Inventory, ContractDetailItem, ConstructionSite, ReturnItemResponse, ContractReturn, ContractPriceCalculation, ContractTemplate, Warehouse } from '../../models';
import { contractService } from '../../services/contractService';
import { customerService } from '../../services/customerService';
import { inventoryService } from '../../services/inventoryService';
import { warehouseService } from '../../services/warehouseService';
import { siteService } from '../../services/siteService';
import { contractTemplateService } from '../../services/contractTemplateService';
import ContractTemplateEditorModal from './ContractTemplateEditorModal';
import AuditLogTimeline from '../AuditLogTimeline';
import ConfirmModal from './ConfirmModal';
import SearchableItemCombobox from '../SearchableItemCombobox';
import { getApiErrorMessage } from '../../utils/apiError';

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
  const [contractItems, setContractItems] = useState<ContractDetailItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | ''>('');
  /** Miktar inputu – sadece rakam, yazarken giriş kaybı olmaması için string */
  const [itemQuantityStr, setItemQuantityStr] = useState<string>('1');
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
  const [showAddItemConfirm, setShowAddItemConfirm] = useState(false);
  const [iskonto, setIskonto] = useState<number>(0);
  const [vatRate, setVatRate] = useState<number>(20);

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
      // Backend GET /contracts/:id "details" döndürür, ContractDetails değil
      const details = (source as any).details ?? source.ContractDetails ?? [];
      if (details.length > 0) {
        const items: ContractDetailItem[] = details.map((detail: any) => {
          const wh = warehouses.find((w) => w.WarehouseId === detail.WarehouseId);
          return {
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

  const initialTotalPrice = contractItems.reduce(
    (sum, item) => sum + item.DailyPriceAtRent * item.RentedQuantity * plannedDays,
    0
  );

  const handleAddItemClick = () => {
    if (!selectedItemId || !selectedWarehouseId) {
      alert('Malzeme ve depo seçimi zorunludur');
      return;
    }
    setShowAddItemConfirm(true);
  };

  const handleAddItem = async () => {
    if (!selectedItemId || !selectedWarehouseId) {
      alert('Malzeme ve depo seçimi zorunludur');
      return;
    }
    const qty = Math.max(1, parseInt(itemQuantityStr, 10) || 1);
    const whId = Number(selectedWarehouseId);
    const itemId = Number(selectedItemId);

    const selectedItem = availableItems.find((i) => i.ItemId === itemId);
    if (!selectedItem) return;

    // Depo bazlı stok kontrolü
    let warehouseStock = 0;
    try {
      const whStocks = await inventoryService.getWarehousesByItemAsync(itemId);
      const whStock = whStocks.find((ws) => ws.WarehouseId === whId);
      warehouseStock = whStock?.Quantity ?? 0;
    } catch {
      // Depo stoku alınamazsa global stok kullan
      warehouseStock = selectedItem.TotalStock - selectedItem.OnRent;
    }

    const existingDetail = contractItems.find(
      (i) => i.ItemId === itemId && i.WarehouseId === whId
    );
    const alreadyInContract = existingDetail?.RentedQuantity ?? 0;
    const effectiveAvailable = warehouseStock + (isNew ? 0 : alreadyInContract);
    const newTotalQuantity = existingDetail ? existingDetail.RentedQuantity + qty : qty;

    if (newTotalQuantity > effectiveAvailable) {
      const wh = warehouses.find((w) => w.WarehouseId === whId);
      alert(
        `Yetersiz depo stoku! "${selectedItem.ItemName}" için ${wh?.WarehouseName ?? 'seçili depoda'} müsait: ${effectiveAvailable}, istenen: ${newTotalQuantity}`
      );
      return;
    }

    const wh = warehouses.find((w) => w.WarehouseId === whId);
    if (existingDetail) {
      setContractItems(
        contractItems.map((i) =>
          i.ItemId === itemId && i.WarehouseId === whId
            ? { ...i, RentedQuantity: i.RentedQuantity + qty }
            : i
        )
      );
    } else {
      setContractItems([
        ...contractItems,
        {
          DetailId: 0,
          ItemId: itemId,
          WarehouseId: whId,
          WarehouseName: wh?.WarehouseName ?? '',
          RentedQuantity: qty,
          ReturnedQuantity: 0,
          DailyPriceAtRent: (selectedItem.MonthlyListPrice || 0) / 30,
          Item: selectedItem,
          ItemName: selectedItem.ItemName,
        },
      ]);
    }

    setShowAddItemConfirm(false);
    setSelectedItemId('');
    setSelectedWarehouseId('');
    setItemQuantityStr('1');
  };

  const handleRemoveItem = (itemId: number, warehouseId: number) => {
    setContractItems(
      contractItems.filter((i) => !(i.ItemId === itemId && i.WarehouseId === warehouseId))
    );
  };

  const handleSave = async () => {
    if (!selectedCustomerId || contractItems.length === 0) {
      alert('Müşteri seçimi ve en az bir malzeme gereklidir');
      return;
    }

    // Eğer müşterinin şantiyeleri varsa ve şantiye seçilmemişse uyar
    if (sites.length > 0 && !selectedSiteId) {
      alert('Bu müşterinin şantiyeleri bulunuyor. Lütfen bir şantiye seçin.');
      return;
    }

    // Yeni sözleşmede her kalemde depo zorunlu; depo stoğu ancak böyle düşer
    if (isNew) {
      const withoutWarehouse = contractItems.filter((i) => !i.WarehouseId || i.WarehouseId === 0);
      if (withoutWarehouse.length > 0) {
        alert(
          'Depo stoğundan düşüm için her malzemede depo seçilmesi zorunludur. Lütfen tüm kalemlere depo atayın veya ilgili kalemleri silip depo seçerek tekrar ekleyin.'
        );
        return;
      }
    }

    try {
      setIsBusy(true);
      // Backend: detayda WarehouseId veya warehouseId kabul edilir; yeni sözleşmede depo stoğu için her kalemde depo zorunlu
      const details = isNew
        ? contractItems.map((item) => ({
            ItemId: item.ItemId,
            WarehouseId: item.WarehouseId,
            RentedQuantity: item.RentedQuantity,
            DailyPriceAtRent: item.DailyPriceAtRent,
          }))
        : contractItems.map((item) => ({
            ItemId: item.ItemId,
            WarehouseId: item.WarehouseId,
            RentedQuantity: item.RentedQuantity,
            ReturnedQuantity: item.ReturnedQuantity || 0,
            DailyPriceAtRent: item.DailyPriceAtRent,
          }));

      // Sadece backend'in yazdığı alanlar: CustomerId, SiteId, StartDate, PlannedEndDate, InitialTotalPrice, IsCompleted; defaultWarehouseId (son harf büyük I)
      const requestBody: Record<string, unknown> = {
        CustomerId: Number(selectedCustomerId),
        StartDate: new Date(startDate).toISOString(),
        PlannedEndDate: new Date(plannedEndDate).toISOString(),
        InitialTotalPrice: initialTotalPrice,
        IsCompleted: isNew ? false : contract?.IsCompleted ?? false,
        details,
      };

      if (selectedSiteId) {
        requestBody.SiteId = Number(selectedSiteId);
      }
      requestBody.Iskonto = iskonto;
      requestBody.VatRate = vatRate;

      // Yazım: defaultWarehouseId (büyük I); yanlış yazım backend'de yok sayılır
      if (isNew && contractItems.length > 0) {
        const firstWh = contractItems[0].WarehouseId;
        if (firstWh && contractItems.every((i) => i.WarehouseId === firstWh)) {
          requestBody.defaultWarehouseId = firstWh;
        }
      }

      console.log('=== SÖZLEŞME KAYDETME DEBUG ===');
      console.log('contractItems:', contractItems);
      console.log('details array:', details);
      console.log('Tam request body:', JSON.stringify(requestBody, null, 2));
      console.log('===============================');

      if (isNew) {
        const result = await contractService.createAsync(requestBody as any);
        console.log('=== SÖZLEŞME BAŞARIYLA OLUŞTURULDU ===');
        console.log('Oluşturulan ContractId:', result.ContractId);
        alert(`Sözleşme başarıyla oluşturuldu! (ID: ${result.ContractId})\n\nEnvanter stokları otomatik güncellendi. Envanter sayfasını kontrol edin.`);
      } else if (contract) {
        await contractService.updateAsync(contract.ContractId, requestBody as any);
        alert('Sözleşme başarıyla güncellendi!');
      }
      onClose();
    } catch (error) {
      console.error('Save contract error:', error);
      alert(getApiErrorMessage(error) || 'Kaydetme hatası');
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
      (i) => i.ItemId === itemId && i.WarehouseId === warehouseId
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
      (i) => i.ItemId === itemId && i.WarehouseId === warehouseId
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
          i.ItemId === itemId && i.WarehouseId === warehouseId
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

  const openReturnForm = (item: ContractDetailItem) => {
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
    return `₺${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-background-panel rounded-panel w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">
          {isNew ? 'Yeni Sözleşme' : 'Sözleşme Detayı'}
        </h2>

        {!isNew && (
          <div className="flex gap-2 mb-4 border-b border-background-border">
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
                {contractItems.some(i => (i.RentedQuantity - i.ReturnedQuantity) > 0) && (
                  <span className="ml-1.5 bg-green-600/30 text-green-400 text-xs px-1.5 py-0.5 rounded-full">
                    {contractItems.filter(i => (i.RentedQuantity - i.ReturnedQuantity) > 0).length}
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
                {contractItems.map((item) => {
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
                              <span className="ml-2 text-green-400">✓ İade: {item.ReturnedQuantity}</span>
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
          <div>
            <label className="block text-sm font-medium mb-2">Müşteri Seçimi *</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(Number(e.target.value) || '')}
              disabled={isReadOnly}
              className="input w-full"
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

          {/* Şablon Seçimi */}
          {!isReadOnly && (
            <div>
              <label className="block text-sm font-medium mb-2">Sözleşme Şablonu (Opsiyonel)</label>
              <div className="flex gap-2">
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(Number(e.target.value) || '')}
                  className="input flex-1"
                >
                  <option value="">Şablon seçin (opsiyonel)</option>
                  {templates.map((t) => (
                    <option key={t.TemplateId} value={t.TemplateId}>
                      {t.TemplateName} {t.IsDefault ? '(Varsayılan)' : ''}
                    </option>
                  ))}
                </select>
                {selectedTemplateId && (
                  <button
                    onClick={() => {
                      const template = templates.find((t) => t.TemplateId === Number(selectedTemplateId));
                      if (template) {
                        setEditingTemplate(template);
                        setIsNewTemplate(false);
                        setIsTemplateEditorOpen(true);
                      }
                    }}
                    className="btn-secondary text-sm px-3"
                  >
                    Düzenle
                  </button>
                )}
                <button
                  onClick={() => {
                    setEditingTemplate(null);
                    setIsNewTemplate(true);
                    setIsTemplateEditorOpen(true);
                  }}
                  className="btn-secondary text-sm px-3"
                >
                  Yeni Şablon
                </button>
              </div>
            </div>
          )}

          {selectedCustomerId && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Şantiye Seçimi {sites.length > 0 ? '*' : '(Opsiyonel)'}
              </label>
              {sitesLoading ? (
                <div className="input w-full text-text-secondary">Yükleniyor...</div>
              ) : sites.length > 0 ? (
                <select
                  value={selectedSiteId}
                  onChange={(e) => setSelectedSiteId(Number(e.target.value) || '')}
                  disabled={isReadOnly}
                  className="input w-full"
                  required={sites.length > 0}
                >
                  <option value="">Şantiye seçin</option>
                  {sites.map((site) => (
                    <option key={site.SiteId} value={site.SiteId}>
                      {site.SiteName}
                      {site.SiteAddress && ` - ${site.SiteAddress}`}
                      {site.ResponsiblePerson && ` (Sorumlu: ${site.ResponsiblePerson})`}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="input w-full text-text-secondary bg-background-secondary">
                  Bu müşterinin şantiyesi bulunmuyor
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Başlangıç Tarihi</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={isReadOnly}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Planlanan Bitiş</label>
              <input
                type="date"
                value={plannedEndDate}
                onChange={(e) => setPlannedEndDate(e.target.value)}
                disabled={isReadOnly}
                className="input w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">İskonto (%)</label>
              <input
                type="number"
                value={iskonto}
                onChange={(e) => setIskonto(parseFloat(e.target.value) || 0)}
                disabled={isReadOnly}
                min={0}
                max={100}
                step={0.01}
                className="input w-32"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">KDV Oranı (%)</label>
              <input
                type="number"
                value={vatRate}
                onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
                disabled={isReadOnly}
                min={0}
                max={100}
                step={1}
                className="input w-32"
                placeholder="20"
              />
            </div>
          </div>

          <div className="card bg-blue-900 p-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-text-secondary mb-1">Planlanan Süre</div>
                <div className="text-xl font-bold">{plannedDays} gün</div>
              </div>
              {actualDays > 0 && (
                <div>
                  <div className="text-text-secondary mb-1">Gerçekleşen Süre</div>
                  <div className="text-xl font-bold">{actualDays} gün</div>
                </div>
              )}
              <div>
                <div className="text-text-secondary mb-1">Durum</div>
                <div className="text-xl font-bold">
                  {contract?.IsCompleted ? 'Tamamlandı' : 'Aktif'}
                </div>
              </div>
            </div>
          </div>

          {!isReadOnly && (
            <div className="card border border-background-border p-4">
              <h3 className="font-semibold mb-3">Malzeme Ekle</h3>
              <div className="flex flex-wrap gap-4">
                <SearchableItemCombobox
                  items={availableItems}
                  value={selectedItemId}
                  onChange={(id) => {
                    setSelectedItemId(id);
                    setSelectedWarehouseId('');
                  }}
                  displayMode="contract"
                  placeholder="Malzeme adı, kodu veya kategori ile ara..."
                />
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(Number(e.target.value) || '')}
                  className="input flex-1 min-w-[140px]"
                  disabled={!selectedItemId}
                >
                  <option value="">Depo seçin</option>
                  {warehouses.map((wh) => (
                    <option key={wh.WarehouseId} value={wh.WarehouseId}>
                      {wh.WarehouseName}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={itemQuantityStr}
                  onChange={(e) => handleNumericInput(setItemQuantityStr, e)}
                  className="input w-24"
                  placeholder="Miktar"
                  aria-label="Miktar"
                />
                <button onClick={handleAddItemClick} className="btn-primary">
                  Ekle
                </button>
              </div>
              {selectedItemId && !selectedWarehouseId && (
                <div className="mt-2 text-sm text-amber-400">
                  Depo seçimi zorunludur. Stok kontrolü depo bazlı yapılır.
                </div>
              )}
            </div>
          )}

          {/* Malzeme Tablosunu Şablona Ekle Butonu */}
          {!isReadOnly && selectedTemplateId && contractItems.length > 0 && (
            <div className="card bg-blue-900/30 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">Malzeme Tablosunu Şablona Ekle</div>
                  <div className="text-xs text-text-secondary mt-1">
                    Seçili şablona malzeme tablosu placeholder'ı eklenir
                  </div>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const template = templates.find((t) => t.TemplateId === Number(selectedTemplateId));
                      if (!template) return;

                      // Şablon içeriğine malzeme tablosu placeholder'ı ekle
                      const content = template.Content || { type: 'doc', content: [] };
                      const placeholderNode = {
                        type: 'paragraph',
                        content: [
                          {
                            type: 'text',
                            text: '{{malzemeTablosu}}',
                          },
                        ],
                      };

                      // İçeriğin sonuna ekle
                      if (!content.content) {
                        content.content = [];
                      }
                      content.content.push(placeholderNode);

                      // Şablonu güncelle
                      await contractTemplateService.updateAsync(template.TemplateId, {
                        Content: content,
                      });

                      // Şablon listesini yenile
                      await loadTemplates();

                      alert('Malzeme tablosu şablona eklendi!');
                    } catch (error) {
                      console.error('Add material table error:', error);
                      alert('Malzeme tablosu ekleme hatası');
                    }
                  }}
                  className="btn-primary text-sm px-4 py-2"
                >
                  📋 Tabloyu Ekle
                </button>
              </div>
            </div>
          )}

          {contractItems.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3">Kiralanan Malzemeler</h3>
              <div className="space-y-2">
                {contractItems.map((item) => {
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
                            Efektif günlük: {formatCurrency(item.DailyPriceAtRent)} × {item.RentedQuantity} adet
                          </div>
                          {/* İade durumu gösterimi */}
                          {item.ReturnedQuantity > 0 && (
                            <div className="text-xs mt-1 flex gap-3">
                              <span className="text-green-400">
                                ✓ İade: {item.ReturnedQuantity}
                              </span>
                              <span className="text-orange-400">
                                ⏳ Kirada: {remainingOnRent}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-green-500 font-bold">
                            {formatCurrency(item.DailyPriceAtRent * item.RentedQuantity)}
                          </div>
                          {/* İade butonu - sadece aktif sözleşmelerde ve kirada malzeme varsa */}
                          {!isNew && (fullContract ?? contract) && !(fullContract ?? contract)!.IsCompleted && remainingOnRent > 0 && isReadOnly && (
                            <button
                              onClick={() => openReturnForm(item)}
                              className="btn-secondary text-sm px-3 py-1"
                              disabled={isReturning}
                            >
                              İade Et
                            </button>
                          )}
                          {!isReadOnly && (
                            <button
                              onClick={() => handleRemoveItem(item.ItemId, item.WarehouseId)}
                              className="text-error hover:text-red-700 text-xl"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {/* İade formu */}
                      {isReturnFormOpen && (
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
                            <span className="text-sm text-text-secondary">
                              / {remainingOnRent} adet
                            </span>
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
            </div>
          )}

          <div className="card bg-green-900 p-4">
            <div className="text-sm text-text-secondary mb-1">Toplam Tutar</div>
            <div className="text-3xl font-bold text-green-300">
              {formatCurrency(initialTotalPrice)}
            </div>
            <div className="text-xs text-text-secondary mt-1">
              (Planlanan süre üzerinden)
            </div>
          </div>

          {contract?.FinalCalculatedPrice && (
            <div className="card bg-green-800 p-4">
              <div className="text-sm text-text-secondary mb-1">Final Tutar</div>
              <div className="text-2xl font-bold text-green-200">
                {formatCurrency(contract.FinalCalculatedPrice)}
              </div>
              <div className="text-xs text-text-secondary mt-1">
                (Gerçekleşen süre üzerinden)
              </div>
            </div>
          )}

          {/* Fiyat Hesaplama Bölümü */}
          {!isNew && contract && !contract.IsCompleted && (
            <div className="card border border-background-border p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-semibold">Fiyat Hesaplama</div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    Temel ücret ve gecikme ücretleri kırılımını hesapla
                  </div>
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
                <div className="space-y-2 mt-3 pt-3 border-t border-background-border">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="card bg-blue-900/30 p-3">
                      <div className="text-xs text-text-secondary">Planlanan Süre</div>
                      <div className="text-lg font-bold">{priceCalculation.plannedDays} gün</div>
                    </div>
                    <div className="card bg-blue-900/30 p-3">
                      <div className="text-xs text-text-secondary">Temel Ücret</div>
                      <div className="text-lg font-bold">{formatCurrency(priceCalculation.basePrice)}</div>
                    </div>
                  </div>
                  {priceCalculation.totalLateFee > 0 && (
                    <div className="card bg-orange-900/30 p-3">
                      <div className="text-xs text-text-secondary mb-1">Toplam Gecikme Ücreti</div>
                      <div className="text-lg font-bold text-orange-300">
                        {formatCurrency(priceCalculation.totalLateFee)}
                      </div>
                      {priceCalculation.returns.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {priceCalculation.returns.map((ret) => (
                            <div key={ret.ReturnId} className="text-xs text-text-secondary flex justify-between">
                              <span>
                                {ret.ReturnQuantity} adet - {new Date(ret.ReturnDate).toLocaleDateString('tr-TR')}
                                {ret.LateDays > 0 && ` (${ret.LateDays} gün gecikme)`}
                              </span>
                              <span className="text-orange-400">{formatCurrency(ret.LateFee)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="card bg-green-900 p-3">
                    <div className="text-xs text-text-secondary mb-1">Final Fiyat</div>
                    <div className="text-2xl font-bold text-green-300">
                      {formatCurrency(priceCalculation.finalPrice)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Döküman Oluştur Butonu - Sadece kaydedilmiş sözleşmelerde ve şablon seçiliyse */}
        {!isNew && contract && selectedTemplateId && (
          <div className="card bg-green-900/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">Sözleşme Dökümanı Oluştur</div>
                <div className="text-xs text-text-secondary mt-1">
                  Seçili şablon ile PDF veya Word formatında döküman oluşturun
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleGenerateDocument('pdf')}
                  disabled={isBusy}
                  className="btn-primary text-sm px-4 py-2"
                >
                  📄 PDF İndir
                </button>
                <button
                  onClick={() => handleGenerateDocument('docx')}
                  disabled={isBusy}
                  className="btn-secondary text-sm px-4 py-2"
                >
                  📝 Word İndir
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          {!isNew && isReadOnly && (
            <button onClick={() => setIsReadOnly(false)} className="btn-primary flex-1">
              Düzenle
            </button>
          )}
          {!isReadOnly && (
            <>
              {!isNew && contract && !contract.IsCompleted && (
                <>
                  <button
                    onClick={handleDeleteClick}
                    disabled={isBusy}
                    className="btn-danger flex-1"
                  >
                    Sil
                  </button>
                  <button
                    onClick={handleComplete}
                    disabled={isBusy}
                    className="btn-success flex-1"
                  >
                    Tamamla
                  </button>
                </>
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
          const item = contractItems.find((i) => i.ItemId === itemId && i.WarehouseId === warehouseId);
          const qty = Math.max(0, parseInt(returnQuantityStr, 10) || 0);
          return item ? `Bu iadeyi onaylıyor musunuz? (${qty} adet, ${item.ItemName})` : 'Bu iadeyi onaylıyor musunuz?';
        })() : 'Bu iadeyi onaylıyor musunuz?'}
        loading={isReturning}
        onConfirm={handleReturnItem}
        onCancel={() => setShowReturnConfirm(false)}
      />
      <ConfirmModal
        open={showAddItemConfirm}
        title="Onaylıyor musunuz?"
        message={selectedItemId && (() => {
          const item = availableItems.find((i) => i.ItemId === selectedItemId);
          const qty = Math.max(1, parseInt(itemQuantityStr, 10) || 1);
          return item ? `Bu malzemeyi sözleşmeye eklemek istediğinize emin misiniz? (${qty} adet, ${item.ItemName})` : 'Bu malzemeyi sözleşmeye eklemek istediğinize emin misiniz?';
        })() || 'Bu malzemeyi sözleşmeye eklemek istediğinize emin misiniz?'}
        onConfirm={handleAddItem}
        onCancel={() => setShowAddItemConfirm(false)}
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
    </div>
  );
}


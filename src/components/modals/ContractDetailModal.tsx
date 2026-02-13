import { useState, useEffect } from 'react';
import { AuditLog, Contract, Customer, Inventory, ContractDetailItem, ConstructionSite, ReturnItemResponse, ContractTemplate } from '../../models';
import { contractService } from '../../services/contractService';
import { customerService } from '../../services/customerService';
import { inventoryService } from '../../services/inventoryService';
import { siteService } from '../../services/siteService';
import { contractTemplateService } from '../../services/contractTemplateService';
import ContractTemplateEditorModal from './ContractTemplateEditorModal';
import AuditLogTimeline from '../AuditLogTimeline';

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
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  const [itemQuantity, setItemQuantity] = useState(1);
  const [isBusy, setIsBusy] = useState(false);

  // İade işlemi state'leri
  const [returnItemId, setReturnItemId] = useState<number | null>(null);
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [isReturning, setIsReturning] = useState(false);

  // Şablon yönetimi state'leri
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>('');
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'history'>('info');
  const [contractLogs, setContractLogs] = useState<AuditLog[]>([]);
  const [contractLogsLoading, setContractLogsLoading] = useState(false);

  useEffect(() => {
    loadData();
    loadTemplates();
  }, []);

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

  useEffect(() => {
    if (contract?.ContractId && !isNew) {
      loadContractLogs();
    } else {
      setContractLogs([]);
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
    if (contract) {
      setSelectedCustomerId(contract.CustomerId);
      setSelectedSiteId(contract.SiteId || '');
      setStartDate(contract.StartDate.split('T')[0]);
      setPlannedEndDate(contract.PlannedEndDate.split('T')[0]);
      if (contract.ActualEndDate) {
        setActualEndDate(contract.ActualEndDate.split('T')[0]);
      }
      if (contract.ContractDetails) {
        const items: ContractDetailItem[] = contract.ContractDetails.map((detail) => ({
          DetailId: detail.DetailId,
          ItemId: detail.ItemId,
          RentedQuantity: detail.RentedQuantity,
          ReturnedQuantity: detail.ReturnedQuantity,
          DailyPriceAtRent: detail.DailyPriceAtRent,
          Item: undefined,
          ItemName: '',
        }));
        setContractItems(items);
      }
      // Şantiyeleri yükle
      if (contract.CustomerId) {
        loadSites(contract.CustomerId);
      }
    }
  }, [contract]);

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
    // Load item names for contract items
    const loadItemNames = async () => {
      const itemsWithNames = await Promise.all(
        contractItems.map(async (item) => {
          try {
            const inventoryItem = await inventoryService.getByIdAsync(item.ItemId);
            return {
              ...item,
              Item: inventoryItem,
              ItemName: inventoryItem.ItemName,
            };
          } catch {
            return { ...item, ItemName: 'Bilinmiyor' };
          }
        })
      );
      setContractItems(itemsWithNames);
    };

    if (contractItems.length > 0 && contractItems[0].ItemName === '') {
      loadItemNames();
    }
  }, [contractItems.length]);

  const loadData = async () => {
    try {
      const [custData, invData] = await Promise.all([
        customerService.getAllAsync(),
        inventoryService.getAllAsync(),
      ]);
      setCustomers(custData);
      setAvailableItems(invData);
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

  const handleAddItem = () => {
    if (!selectedItemId) return;

    const selectedItem = availableItems.find((i) => i.ItemId === Number(selectedItemId));
    if (!selectedItem) return;

    // Müsait stok kontrolü
    const availableStock = selectedItem.TotalStock - selectedItem.OnRent;
    const alreadyInContract = contractItems.find(ci => ci.ItemId === selectedItem.ItemId)?.RentedQuantity || 0;
    const effectiveAvailable = availableStock + (isNew ? 0 : alreadyInContract);

    const existingItem = contractItems.find((i) => i.ItemId === Number(selectedItemId));
    const newTotalQuantity = existingItem 
      ? existingItem.RentedQuantity + itemQuantity 
      : itemQuantity;

    if (newTotalQuantity > effectiveAvailable) {
      alert(`Yetersiz stok! "${selectedItem.ItemName}" için müsait stok: ${effectiveAvailable}, istenen: ${newTotalQuantity}`);
      return;
    }

    if (existingItem) {
      setContractItems(
        contractItems.map((i) =>
          i.ItemId === Number(selectedItemId)
            ? { ...i, RentedQuantity: i.RentedQuantity + itemQuantity }
            : i
        )
      );
    } else {
      setContractItems([
        ...contractItems,
        {
          DetailId: 0,
          ItemId: Number(selectedItemId),
          RentedQuantity: itemQuantity,
          ReturnedQuantity: 0,
          DailyPriceAtRent: selectedItem.DailyPrice,
          Item: selectedItem,
          ItemName: selectedItem.ItemName,
        },
      ]);
    }

    setSelectedItemId('');
    setItemQuantity(1);
  };

  const handleRemoveItem = (itemId: number) => {
    setContractItems(contractItems.filter((i) => i.ItemId !== itemId));
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

    try {
      setIsBusy(true);
      const details = contractItems.map((item) => ({
        ItemId: item.ItemId,
        RentedQuantity: item.RentedQuantity,
        ReturnedQuantity: item.ReturnedQuantity || 0,
        DailyPriceAtRent: item.DailyPriceAtRent,
      }));

      // Request body oluştur - SiteId sadece seçilmişse dahil et
      const requestBody: Record<string, unknown> = {
        CustomerId: Number(selectedCustomerId),
        StartDate: new Date(startDate).toISOString(),
        PlannedEndDate: new Date(plannedEndDate).toISOString(),
        InitialTotalPrice: initialTotalPrice,
        IsCompleted: isNew ? false : contract?.IsCompleted ?? false,
        details,
      };

      // SiteId sadece seçilmişse ekle (null/undefined gönderme)
      if (selectedSiteId) {
        requestBody.SiteId = Number(selectedSiteId);
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
      alert('Kaydetme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!contract || contract.IsCompleted || !confirm('Bu sözleşmeyi silmek istediğinizden emin misiniz?')) {
      return;
    }

    try {
      setIsBusy(true);
      await contractService.deleteAsync(contract.ContractId);
      onClose();
    } catch (error) {
      console.error('Delete contract error:', error);
      alert('Silme hatası');
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
      alert('Tamamlama hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleReturnItem = async (itemId: number) => {
    if (!contract || contract.IsCompleted) return;

    const item = contractItems.find((i) => i.ItemId === itemId);
    if (!item) return;

    const remainingOnRent = item.RentedQuantity - item.ReturnedQuantity;
    if (returnQuantity <= 0 || returnQuantity > remainingOnRent) {
      alert(`İade miktarı 1 ile ${remainingOnRent} arasında olmalıdır`);
      return;
    }

    try {
      setIsReturning(true);
      const result: ReturnItemResponse = await contractService.returnItemAsync(
        contract.ContractId,
        itemId,
        returnQuantity
      );

      // Başarılı iade sonrası contract items güncelle
      setContractItems((prevItems) =>
        prevItems.map((i) =>
          i.ItemId === itemId
            ? { ...i, ReturnedQuantity: result.ReturnedQuantity }
            : i
        )
      );

      // İade formunu kapat
      setReturnItemId(null);
      setReturnQuantity(1);

      alert(
        `İade başarılı!\nİade edilen: ${returnQuantity} adet\nKirada kalan: ${result.RemainingOnRent} adet`
      );
    } catch (error) {
      console.error('Return item error:', error);
      alert('İade işlemi başarısız');
    } finally {
      setIsReturning(false);
    }
  };

  const openReturnForm = (itemId: number) => {
    const item = contractItems.find((i) => i.ItemId === itemId);
    if (item) {
      const remainingOnRent = item.RentedQuantity - item.ReturnedQuantity;
      setReturnItemId(itemId);
      setReturnQuantity(Math.min(1, remainingOnRent));
    }
  };

  const closeReturnForm = () => {
    setReturnItemId(null);
    setReturnQuantity(1);
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
      alert('Döküman oluşturma hatası');
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
            <div className="card border-2 border-dashed border-background-border p-4">
              <h3 className="font-semibold mb-3">Malzeme Ekle</h3>
              <div className="flex gap-3">
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(Number(e.target.value) || '')}
                  className="input flex-1"
                >
                  <option value="">Malzeme seçin</option>
                  {availableItems.map((item) => {
                    const availableStock = item.TotalStock - item.OnRent;
                    const alreadyInContract = contractItems.find(ci => ci.ItemId === item.ItemId)?.RentedQuantity || 0;
                    const effectiveAvailable = availableStock + (isNew ? 0 : alreadyInContract);
                    
                    return (
                      <option 
                        key={item.ItemId} 
                        value={item.ItemId}
                        disabled={effectiveAvailable <= 0}
                      >
                        {item.ItemName} - ₺{item.DailyPrice.toFixed(2)}/gün 
                        {effectiveAvailable > 0 
                          ? ` (Müsait: ${effectiveAvailable})` 
                          : ' (Stok Yok)'}
                      </option>
                    );
                  })}
                </select>
                <input
                  type="number"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(Number(e.target.value))}
                  min="1"
                  className="input w-24"
                  placeholder="Miktar"
                />
                <button onClick={handleAddItem} className="btn-primary">
                  Ekle
                </button>
              </div>
              {/* Seçili malzeme için stok uyarısı */}
              {selectedItemId && (() => {
                const selectedItem = availableItems.find(i => i.ItemId === Number(selectedItemId));
                if (selectedItem) {
                  const availableStock = selectedItem.TotalStock - selectedItem.OnRent;
                  const alreadyInContract = contractItems.find(ci => ci.ItemId === selectedItem.ItemId)?.RentedQuantity || 0;
                  const effectiveAvailable = availableStock + (isNew ? 0 : alreadyInContract);
                  
                  if (itemQuantity > effectiveAvailable) {
                    return (
                      <div className="mt-2 text-sm text-red-400 bg-red-900/30 p-2 rounded">
                        ⚠️ Uyarı: İstenen miktar ({itemQuantity}) müsait stoktan ({effectiveAvailable}) fazla!
                      </div>
                    );
                  }
                }
                return null;
              })()}
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
                  const isReturnFormOpen = returnItemId === item.ItemId;

                  return (
                    <div key={item.ItemId} className="card">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium">{item.ItemName}</div>
                          <div className="text-sm text-text-secondary">
                            {formatCurrency(item.DailyPriceAtRent)}/gün × {item.RentedQuantity} adet
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
                          {!isNew && contract && !contract.IsCompleted && remainingOnRent > 0 && isReadOnly && (
                            <button
                              onClick={() => openReturnForm(item.ItemId)}
                              className="btn-secondary text-sm px-3 py-1"
                              disabled={isReturning}
                            >
                              İade Et
                            </button>
                          )}
                          {!isReadOnly && (
                            <button
                              onClick={() => handleRemoveItem(item.ItemId)}
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
                          <div className="flex items-center gap-3">
                            <label className="text-sm">İade Miktarı:</label>
                            <input
                              type="number"
                              value={returnQuantity}
                              onChange={(e) => setReturnQuantity(Math.max(1, Math.min(remainingOnRent, Number(e.target.value))))}
                              min="1"
                              max={remainingOnRent}
                              className="input w-24"
                              disabled={isReturning}
                            />
                            <span className="text-sm text-text-secondary">
                              / {remainingOnRent} adet
                            </span>
                            <div className="flex-1" />
                            <button
                              onClick={closeReturnForm}
                              className="btn-secondary text-sm px-3 py-1"
                              disabled={isReturning}
                            >
                              İptal
                            </button>
                            <button
                              onClick={() => handleReturnItem(item.ItemId)}
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
                    onClick={handleDelete}
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


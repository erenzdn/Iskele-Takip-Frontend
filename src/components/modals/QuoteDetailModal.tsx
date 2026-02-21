import { useState, useEffect } from 'react';
import {
  Quote,
  Customer,
  Inventory,
  QuoteDetailItem,
  ConstructionSite,
  QuoteStatus,
  Warehouse,
} from '../../models';
import { quoteService, WarehouseAssignment } from '../../services/quoteService';
import { customerService } from '../../services/customerService';
import { getApiErrorMessage } from '../../utils/apiError';
import { inventoryService } from '../../services/inventoryService';
import { warehouseService } from '../../services/warehouseService';
import { siteService } from '../../services/siteService';
import ConfirmModal from './ConfirmModal';
import SearchableItemCombobox from '../SearchableItemCombobox';

interface QuoteDetailModalProps {
  quote: Quote | null;
  isNew: boolean;
  onClose: () => void;
}

export default function QuoteDetailModal({ quote, isNew, onClose }: QuoteDetailModalProps) {
  const [isReadOnly, setIsReadOnly] = useState(!isNew);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableItems, setAvailableItems] = useState<Inventory[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [sites, setSites] = useState<ConstructionSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<number | ''>('');
  const [sitesLoading, setSitesLoading] = useState(false);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [plannedEndDate, setPlannedEndDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [quoteItems, setQuoteItems] = useState<QuoteDetailItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  /** Miktar inputu için string state - yazarken giriş kaybını önler, sadece rakam kabul eder */
  const [itemQuantityStr, setItemQuantityStr] = useState<string>('1');
  const [status, setStatus] = useState<QuoteStatus>(QuoteStatus.Pending);
  const [notes, setNotes] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  // Sözleşmeye dönüştürme - depo atama: 'global' | 'defaultWarehouse' | 'perItem'
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [convertMode, setConvertMode] = useState<'global' | 'defaultWarehouse' | 'perItem'>('global');
  const [defaultWarehouseIdForConvert, setDefaultWarehouseIdForConvert] = useState<number | ''>('');
  // perItemAssignments[ItemId] = { WarehouseId, Quantity }[]
  const [perItemAssignments, setPerItemAssignments] = useState<
    Record<number, { WarehouseId: number; Quantity: number }[]>
  >({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddItemConfirm, setShowAddItemConfirm] = useState(false);
  const [iskonto, setIskonto] = useState<number>(0);
  const [vatRate, setVatRate] = useState<number>(20);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (quote) {
      setSelectedCustomerId(quote.CustomerId);
      setSelectedSiteId(quote.SiteId || '');
      setStartDate(quote.StartDate.split('T')[0]);
      setPlannedEndDate(quote.PlannedEndDate.split('T')[0]);
      setStatus(quote.Status);
      setNotes(quote.Notes || '');
      setIskonto(quote.Iskonto ?? 0);
      setVatRate(quote.VatRate ?? 20);

      if (quote.QuoteDetails) {
        const items: QuoteDetailItem[] = quote.QuoteDetails.map((detail) => ({
          QuoteDetailId: detail.QuoteDetailId,
          ItemId: detail.ItemId,
          Quantity: detail.Quantity,
          DailyPrice: detail.DailyPrice,
          Item: undefined,
          ItemName: detail.ItemName || '',
        }));
        setQuoteItems(items);
      }

      if (quote.CustomerId) {
        loadSites(quote.CustomerId);
      }
    }
  }, [quote]);

  // Müşteri değiştiğinde şantiyeleri yükle
  useEffect(() => {
    if (selectedCustomerId) {
      loadSites(Number(selectedCustomerId));
      setSelectedSiteId('');
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
    // Load item names for quote items
    const loadItemNames = async () => {
      const itemsWithNames = await Promise.all(
        quoteItems.map(async (item) => {
          if (item.ItemName) return item;
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
      setQuoteItems(itemsWithNames);
    };

    if (quoteItems.length > 0 && quoteItems.some((i) => !i.ItemName)) {
      loadItemNames();
    }
  }, [quoteItems.length]);

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
    (new Date(plannedEndDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  const totalPrice = quoteItems.reduce(
    (sum, item) => sum + item.DailyPrice * item.Quantity * plannedDays,
    0
  );

  const handleAddItemClick = () => {
    if (!selectedItemId) return;
    const selectedItem = availableItems.find((i) => i.ItemId === Number(selectedItemId));
    if (!selectedItem) return;
    setShowAddItemConfirm(true);
  };

  const handleAddItem = () => {
    if (!selectedItemId) return;

    const selectedItem = availableItems.find((i) => i.ItemId === Number(selectedItemId));
    if (!selectedItem) return;

    const qty = Math.max(1, parseInt(itemQuantityStr, 10) || 1);
    const existingItem = quoteItems.find((i) => i.ItemId === Number(selectedItemId));

    if (existingItem) {
      setQuoteItems(
        quoteItems.map((i) =>
          i.ItemId === Number(selectedItemId) ? { ...i, Quantity: i.Quantity + qty } : i
        )
      );
    } else {
      setQuoteItems([
        ...quoteItems,
        {
          QuoteDetailId: 0,
          ItemId: Number(selectedItemId),
          Quantity: qty,
          DailyPrice: (selectedItem.MonthlyListPrice || 0) / 30,
          Item: selectedItem,
          ItemName: selectedItem.ItemName,
        },
      ]);
    }

    setShowAddItemConfirm(false);
    setSelectedItemId('');
    setItemQuantityStr('1');
  };

  /** Sadece rakam girişine izin ver (boş veya pozitif tam sayı) */
  const handleQuantityInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      setItemQuantityStr('');
      return;
    }
    const digitsOnly = raw.replace(/[^0-9]/g, '');
    setItemQuantityStr(digitsOnly);
  };

  const handleRemoveItem = (itemId: number) => {
    setQuoteItems(quoteItems.filter((i) => i.ItemId !== itemId));
  };

  const handleSave = async () => {
    if (!selectedCustomerId || quoteItems.length === 0) {
      alert('Müşteri seçimi ve en az bir malzeme gereklidir');
      return;
    }

    if (sites.length > 0 && !selectedSiteId) {
      alert('Bu müşterinin şantiyeleri bulunuyor. Lütfen bir şantiye seçin.');
      return;
    }

    try {
      setIsBusy(true);
      const details = quoteItems.map((item) => ({
        ItemId: item.ItemId,
        Quantity: item.Quantity,
        DailyPrice: item.DailyPrice,
      }));

      const requestBody: Record<string, unknown> = {
        CustomerId: Number(selectedCustomerId),
        StartDate: new Date(startDate).toISOString(),
        PlannedEndDate: new Date(plannedEndDate).toISOString(),
        TotalPrice: totalPrice,
        Status: status,
        Notes: notes || undefined,
        Iskonto: iskonto,
        VatRate: vatRate,
        details,
      };

      if (selectedSiteId) {
        requestBody.SiteId = Number(selectedSiteId);
      }

      if (isNew) {
        const result = await quoteService.createAsync(requestBody as any);
        alert(`Teklif başarıyla oluşturuldu! (ID: ${result.QuoteId})`);
      } else if (quote) {
        await quoteService.updateAsync(quote.QuoteId, requestBody as any);
        alert('Teklif başarıyla güncellendi!');
      }
      onClose();
    } catch (error) {
      console.error('Save quote error:', error);
      alert('Kaydetme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteClick = () => {
    if (!quote) return;
    if (quote.ConvertedContractId) {
      alert('Sözleşmeye dönüştürülmüş teklifler silinemez.');
      return;
    }
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!quote) return;
    try {
      setIsBusy(true);
      await quoteService.deleteAsync(quote.QuoteId);
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      console.error('Delete quote error:', error);
      alert('Silme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleAccept = async () => {
    if (!quote) return;

    try {
      setIsBusy(true);
      await quoteService.acceptQuoteAsync(quote.QuoteId);
      setStatus(QuoteStatus.Accepted);
      alert('Teklif kabul edildi!');
      onClose();
    } catch (error) {
      console.error('Accept quote error:', error);
      alert('Kabul etme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleReject = async () => {
    if (!quote) return;

    try {
      setIsBusy(true);
      await quoteService.rejectQuoteAsync(quote.QuoteId);
      setStatus(QuoteStatus.Rejected);
      alert('Teklif reddedildi.');
      onClose();
    } catch (error) {
      console.error('Reject quote error:', error);
      alert('Reddetme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const openConvertModal = () => {
    if (!quote || quote.Status !== QuoteStatus.Accepted || quote.ConvertedContractId) return;
    setShowConvertModal(true);
    setPerItemAssignments({});
  };

  const addWarehouseAssignment = (itemId: number) => {
    const current = perItemAssignments[itemId] ?? [];
    setPerItemAssignments({
      ...perItemAssignments,
      [itemId]: [...current, { WarehouseId: warehouses[0]?.WarehouseId ?? 0, Quantity: 1 }],
    });
  };

  const updateWarehouseAssignment = (
    itemId: number,
    index: number,
    field: 'WarehouseId' | 'Quantity',
    value: number
  ) => {
    const current = [...(perItemAssignments[itemId] ?? [])];
    current[index] = { ...current[index], [field]: value };
    setPerItemAssignments({ ...perItemAssignments, [itemId]: current });
  };

  const removeWarehouseAssignment = (itemId: number, index: number) => {
    const current = (perItemAssignments[itemId] ?? []).filter((_, i) => i !== index);
    if (current.length === 0) {
      const { [itemId]: _, ...rest } = perItemAssignments;
      setPerItemAssignments(rest);
    } else {
      setPerItemAssignments({ ...perItemAssignments, [itemId]: current });
    }
  };

  const getAssignmentTotalForItem = (itemId: number) =>
    (perItemAssignments[itemId] ?? []).reduce((sum, a) => sum + a.Quantity, 0);

  const handleConvertToContract = async () => {
    if (!quote) return;

    if (quote.Status !== QuoteStatus.Accepted) {
      alert('Sadece kabul edilmiş teklifler sözleşmeye dönüştürülebilir.');
      return;
    }

    if (quote.ConvertedContractId) {
      alert('Bu teklif zaten sözleşmeye dönüştürülmüş.');
      return;
    }

    if (convertMode === 'defaultWarehouse' && !defaultWarehouseIdForConvert) {
      alert('Tüm kalemler tek depodan çıkacaksa lütfen bir depo seçin.');
      return;
    }

    let options: { warehouseAssignments?: WarehouseAssignment[]; defaultWarehouseId?: number } | undefined;

    if (convertMode === 'defaultWarehouse' && defaultWarehouseIdForConvert) {
      options = { defaultWarehouseId: Number(defaultWarehouseIdForConvert) };
    } else if (convertMode === 'perItem') {
      const assignments: WarehouseAssignment[] = [];
      for (const item of quoteItems) {
        const itemAssignments = perItemAssignments[item.ItemId] ?? [];
        const total = itemAssignments.reduce((s, a) => s + a.Quantity, 0);
        if (total !== item.Quantity) {
          alert(
            `"${item.ItemName}" için atanan toplam miktar (${total}) teklif miktarı (${item.Quantity}) ile eşleşmiyor.`
          );
          return;
        }
        for (const a of itemAssignments) {
          if (a.Quantity > 0) {
            assignments.push({ ItemId: item.ItemId, WarehouseId: a.WarehouseId, Quantity: a.Quantity });
          }
        }
      }
      options = assignments.length > 0 ? { warehouseAssignments: assignments } : undefined;
    }
    // convertMode === 'global' => options undefined (boş body)

    try {
      setIsBusy(true);
      const result = await quoteService.convertToContractAsync(quote.QuoteId, options);
      setShowConvertModal(false);
      alert(`Teklif başarıyla sözleşmeye dönüştürüldü!\nSözleşme ID: ${result.ContractId}`);
      onClose();
    } catch (error: unknown) {
      console.error('Convert quote error:', error);
      const msg = getApiErrorMessage(error);
      alert(msg || 'Dönüştürme hatası. Envanterde yeterli stok olduğundan emin olun.');
    } finally {
      setIsBusy(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `₺${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusBadge = () => {
    switch (status) {
      case QuoteStatus.Pending:
        return <span className="badge bg-yellow-700 text-yellow-100 text-lg px-4 py-1">Beklemede</span>;
      case QuoteStatus.Accepted:
        return <span className="badge bg-green-700 text-green-100 text-lg px-4 py-1">Kabul Edildi</span>;
      case QuoteStatus.Rejected:
        return <span className="badge bg-red-700 text-red-100 text-lg px-4 py-1">Reddedildi</span>;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-background-panel rounded-panel w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">{isNew ? 'Yeni Teklif' : 'Teklif Detayı'}</h2>
          {!isNew && getStatusBadge()}
        </div>

        <div className="space-y-4">
          {/* Müşteri Seçimi */}
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

          {/* Şantiye Seçimi */}
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

          {/* Tarihler */}
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

          {/* İskonto ve KDV */}
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

          {/* Notlar */}
          <div>
            <label className="block text-sm font-medium mb-2">Notlar</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isReadOnly}
              className="input w-full h-20 resize-none"
              placeholder="Teklif ile ilgili notlar..."
            />
          </div>

          {/* Süre Bilgisi */}
          <div className="card bg-blue-900 p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-text-secondary mb-1">Planlanan Süre</div>
                <div className="text-xl font-bold">{plannedDays} gün</div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">Durum</div>
                <div className="text-xl font-bold">
                  {status === QuoteStatus.Pending && 'Beklemede'}
                  {status === QuoteStatus.Accepted && 'Kabul Edildi'}
                  {status === QuoteStatus.Rejected && 'Reddedildi'}
                </div>
              </div>
            </div>
          </div>

          {/* Sözleşmeye Dönüştürüldü Bilgisi */}
          {quote?.ConvertedContractId && (
            <div className="card bg-green-900 p-4">
              <div className="flex items-center gap-2">
                <span className="text-green-300 text-lg">✓</span>
                <span>
                  Bu teklif sözleşmeye dönüştürüldü (Sözleşme #{quote.ConvertedContractId})
                </span>
              </div>
            </div>
          )}

          {/* Malzeme Ekleme */}
          {!isReadOnly && (
            <div className="card border border-background-border p-4">
              <h3 className="font-semibold mb-3">Malzeme Ekle</h3>
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-0 w-full sm:w-auto">
                  <SearchableItemCombobox
                    items={availableItems}
                    value={selectedItemId}
                    onChange={setSelectedItemId}
                    displayMode="quote"
                    placeholder="Malzeme adı, kodu veya kategori ile ara..."
                  />
                </div>
                <div className="flex gap-2 flex-shrink-0 items-center">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={itemQuantityStr}
                    onChange={handleQuantityInputChange}
                    className="input w-24"
                    placeholder="Miktar"
                    aria-label="Miktar"
                  />
                  <button onClick={handleAddItemClick} className="btn-primary">
                    Ekle
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Malzeme Listesi */}
          {quoteItems.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3">Teklif Kalemleri</h3>
              <div className="space-y-2">
                {quoteItems.map((item) => (
                  <div key={item.ItemId} className="card">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium">{item.ItemName}</div>
                        <div className="text-sm text-text-secondary">
                          Efektif günlük: {formatCurrency(item.DailyPrice)} × {item.Quantity} adet
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-green-500 font-bold">
                          {formatCurrency(item.DailyPrice * item.Quantity)}
                          <span className="text-text-secondary text-sm">/gün</span>
                        </div>
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
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Toplam Tutar */}
          <div className="card bg-green-900 p-4">
            <div className="text-sm text-text-secondary mb-1">Toplam Teklif Tutarı</div>
            <div className="text-3xl font-bold text-green-300">{formatCurrency(totalPrice)}</div>
            <div className="text-xs text-text-secondary mt-1">
              ({plannedDays} gün üzerinden hesaplanmıştır)
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mt-6">
          {/* Düzenleme modu değilse */}
          {!isNew && isReadOnly && (
            <>
              {/* Düzenle butonu - sadece beklemede olanlar için */}
              {status === QuoteStatus.Pending && !quote?.ConvertedContractId && (
                <button onClick={() => setIsReadOnly(false)} className="btn-primary flex-1">
                  Düzenle
                </button>
              )}

              {/* Kabul/Red butonları - sadece beklemede olanlar için */}
              {status === QuoteStatus.Pending && !quote?.ConvertedContractId && (
                <>
                  <button
                    onClick={handleAccept}
                    disabled={isBusy}
                    className="btn-success flex-1"
                  >
                    Kabul Et
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={isBusy}
                    className="btn-danger flex-1"
                  >
                    Reddet
                  </button>
                </>
              )}

              {/* Sözleşmeye Dönüştür - sadece kabul edilmiş ve henüz dönüştürülmemiş için */}
              {status === QuoteStatus.Accepted && !quote?.ConvertedContractId && (
                <button
                  onClick={openConvertModal}
                  disabled={isBusy}
                  className="btn-success flex-1"
                >
                  Sözleşmeye Dönüştür
                </button>
              )}

              <button onClick={onClose} className="btn-secondary flex-1">
                Kapat
              </button>
            </>
          )}

          {/* Düzenleme modundaysa */}
          {!isReadOnly && (
            <>
              {!isNew && quote && status === QuoteStatus.Pending && (
                <button onClick={handleDeleteClick} disabled={isBusy} className="btn-danger flex-1">
                  Sil
                </button>
              )}
              <button onClick={onClose} className="btn-secondary flex-1">
                İptal
              </button>
              <button onClick={handleSave} disabled={isBusy} className="btn-primary flex-1">
                {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </>
          )}
        </div>
      </div>
      <ConfirmModal
        open={showDeleteConfirm}
        title="Onaylıyor musunuz?"
        message="Bu teklifi silmek istediğinizden emin misiniz?"
        variant="danger"
        loading={isBusy}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />
      <ConfirmModal
        open={showAddItemConfirm}
        title="Onaylıyor musunuz?"
        message={selectedItemId ? (() => {
          const item = availableItems.find((i) => i.ItemId === Number(selectedItemId));
          const qty = Math.max(1, parseInt(itemQuantityStr, 10) || 1);
          return item ? `Bu kalemi teklife eklemek istediğinize emin misiniz? (${qty} adet, ${item.ItemName})` : 'Bu kalemi teklife eklemek istediğinize emin misiniz?';
        })() : 'Bu kalemi teklife eklemek istediğinize emin misiniz?'}
        onConfirm={handleAddItem}
        onCancel={() => setShowAddItemConfirm(false)}
      />
      {/* Sözleşmeye Dönüştür - Depo Atama Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]">
          <div className="bg-background-panel rounded-panel w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Sözleşmeye Dönüştür – Stok / Depo</h3>
            <p className="text-sm text-text-secondary mb-4">
              Stok güncellemesi nasıl yapılsın? Sadece global envanter, tümü tek depodan veya ürün bazlı depo ataması seçebilirsiniz.
            </p>

            <div className="space-y-3 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="convertMode"
                  checked={convertMode === 'global'}
                  onChange={() => setConvertMode('global')}
                  className="rounded-full"
                />
                <span className="text-sm">Sadece global envanter güncellensin (depo stoğu değişmesin)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="convertMode"
                  checked={convertMode === 'defaultWarehouse'}
                  onChange={() => setConvertMode('defaultWarehouse')}
                  className="rounded-full"
                />
                <span className="text-sm">Tüm kalemler tek depodan çıksın</span>
              </label>
              {convertMode === 'defaultWarehouse' && (
                <div className="ml-6">
                  <select
                    value={defaultWarehouseIdForConvert}
                    onChange={(e) => setDefaultWarehouseIdForConvert(Number(e.target.value) || '')}
                    className="input w-full max-w-xs"
                  >
                    <option value="">Depo seçin</option>
                    {warehouses.map((wh) => (
                      <option key={wh.WarehouseId} value={wh.WarehouseId}>
                        {wh.WarehouseName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="convertMode"
                  checked={convertMode === 'perItem'}
                  onChange={() => setConvertMode('perItem')}
                  className="rounded-full"
                />
                <span className="text-sm">Ürün bazlı depo ataması yap</span>
              </label>
            </div>

            {convertMode === 'perItem' && (
              <div className="space-y-4 mb-6">
                {quoteItems.map((item) => {
                  const assignments = perItemAssignments[item.ItemId] ?? [];
                  const total = getAssignmentTotalForItem(item.ItemId);
                  const isValid = total === item.Quantity;

                  return (
                    <div key={item.ItemId} className="card p-4">
                      <div className="font-medium mb-2">
                        {item.ItemName} — Toplam: {item.Quantity} adet
                        {assignments.length > 0 && (
                          <span
                            className={`ml-2 text-sm ${isValid ? 'text-green-400' : 'text-red-400'}`}
                          >
                            (Atanan: {total} {!isValid && '— eşleşmiyor!'})
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {assignments.map((a, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <select
                              value={a.WarehouseId}
                              onChange={(e) =>
                                updateWarehouseAssignment(
                                  item.ItemId,
                                  idx,
                                  'WarehouseId',
                                  Number(e.target.value)
                                )
                              }
                              className="input flex-1"
                            >
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
                              value={a.Quantity === 0 ? '' : a.Quantity}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^0-9]/g, '');
                                const num = raw === '' ? 0 : Math.max(0, parseInt(raw, 10));
                                updateWarehouseAssignment(item.ItemId, idx, 'Quantity', num);
                              }}
                              className="input w-24"
                              placeholder="Adet"
                            />
                            <button
                              onClick={() => removeWarehouseAssignment(item.ItemId, idx)}
                              className="text-error hover:text-red-700 text-xl px-1"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => addWarehouseAssignment(item.ItemId)}
                          className="btn-secondary text-sm px-3 py-1"
                        >
                          + Depo ekle
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowConvertModal(false)}
                className="btn-secondary flex-1"
              >
                İptal
              </button>
              <button
                onClick={handleConvertToContract}
                disabled={
                  isBusy ||
                  (convertMode === 'defaultWarehouse' && !defaultWarehouseIdForConvert) ||
                  (convertMode === 'perItem' &&
                    quoteItems.some((q) => getAssignmentTotalForItem(q.ItemId) !== q.Quantity))
                }
                className="btn-success flex-1"
              >
                {isBusy ? 'Dönüştürülüyor...' : 'Dönüştür'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

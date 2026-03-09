import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { CheckIcon, XIcon } from '@phosphor-icons/react';
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
import ProductPickerModal from './ProductPickerModal';

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
  const [showProductPickerModal, setShowProductPickerModal] = useState(false);
  const [lastAddedItemIds, setLastAddedItemIds] = useState<number[]>([]);
  const [iskonto, setIskonto] = useState<number>(0);
  /** Satır bazlı iskonto (%) - key: ItemId. Üstteki iskonto değişince tüm satırlara yansır; satırda tek tek de düzenlenebilir. */
  const [itemIskonto, setItemIskonto] = useState<Record<number, number>>({});
  const [vatRate, setVatRate] = useState<number>(20);
  const [quoteCode, setQuoteCode] = useState<string>('');

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
      setQuoteCode(quote.QuoteCode ?? '');

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
        const globalIsk = quote.Iskonto ?? 0;
        setItemIskonto((prev) => {
          const next = { ...prev };
          items.forEach((i) => (next[i.ItemId] = globalIsk));
          return next;
        });
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
    (new Date(plannedEndDate).getTime() - new Date(startDate).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const totalPrice = quoteItems.reduce(
    (sum, item) => sum + item.DailyPrice * item.Quantity * plannedDays,
    0
  );

  /** Satır için iskonto oranı: satıra özel yoksa üstteki global iskonto. */
  const getItemIskonto = (itemId: number) => itemIskonto[itemId] ?? iskonto;

  // Toplam tutar kırılımları (satır bazlı iskonto)
  const subtotal = totalPrice;
  const discountAmount = quoteItems.reduce((sum, item) => {
    const lineTotal = item.DailyPrice * item.Quantity * plannedDays;
    const pct = getItemIskonto(item.ItemId);
    return sum + lineTotal * (pct / 100);
  }, 0);
  const discountedTotal = subtotal - discountAmount;
  const vatAmount = discountedTotal * (vatRate / 100);
  const grandTotal = discountedTotal + vatAmount;

  /** Panelden ürün + miktar ile listeye ekler. */
  const addItemFromPicker = (item: Inventory, quantity: number) => {
    const qty = Math.max(1, quantity);
    const existingItem = quoteItems.find((i) => i.ItemId === item.ItemId);

    if (existingItem) {
      setQuoteItems(
        quoteItems.map((i) =>
          i.ItemId === item.ItemId ? { ...i, Quantity: i.Quantity + qty } : i
        )
      );
    } else {
      setQuoteItems([
        ...quoteItems,
        {
          QuoteDetailId: 0,
          ItemId: item.ItemId,
          Quantity: qty,
          DailyPrice: (item.MonthlyListPrice || 0) / 30,
          Item: item,
          ItemName: item.ItemName,
        },
      ]);
      setItemIskonto((prev) => ({ ...prev, [item.ItemId]: iskonto }));
    }
    setLastAddedItemIds((prev) => [...prev.filter((id) => id !== item.ItemId), item.ItemId]);
  };

  useEffect(() => {
    if (lastAddedItemIds.length === 0) return;
    const t = setTimeout(() => setLastAddedItemIds([]), 1600);
    return () => clearTimeout(t);
  }, [lastAddedItemIds]);

  const handleRemoveItem = (itemId: number) => {
    setQuoteItems(quoteItems.filter((i) => i.ItemId !== itemId));
  };

  const updateQuoteItemQuantity = (itemId: number, newQty: number) => {
    const qty = Math.max(1, Math.floor(newQty));
    setQuoteItems((prev) =>
      prev.map((i) => (i.ItemId === itemId ? { ...i, Quantity: qty } : i))
    );
  };

  const updateQuoteItemIskonto = (itemId: number, value: number) => {
    const pct = Math.max(0, Math.min(100, value));
    setItemIskonto((prev) => ({ ...prev, [itemId]: pct }));
  };

  /** Üstteki iskonto değişince tüm satırlara uygula */
  const handleGlobalIskontoChange = (value: number) => {
    setIskonto(value);
    setItemIskonto((prev) => {
      const next = { ...prev };
      quoteItems.forEach((i) => (next[i.ItemId] = value));
      return next;
    });
  };

  const currentUser = useAuthStore((s) => s.user);

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
      if (quoteCode.trim()) {
        requestBody.QuoteCode = quoteCode.trim();
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
    <div className="fixed inset-0 z-50 flex flex-col bg-background-main">
      <header className="shrink-0 flex items-center justify-between px-6 py-4 bg-background-panel border-b border-background-border shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            {isNew ? 'Yeni Teklif' : 'Teklif Detayı'}
          </h1>
          {!isNew && getStatusBadge()}
        </div>
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
        <div className="w-full max-w-6xl mx-auto p-6 space-y-4">
          {/* Üst kısım: yatay bilgi alanları (kompakt) */}
          <section className="rounded-xl border border-background-border bg-background-panel p-3 shadow-sm">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 pb-1.5 border-b border-background-border">
              Genel Bilgiler
            </h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-0.5">
                <label className="block text-xs font-medium text-text-primary">Teklif Kodu (Opsiyonel)</label>
                <input
                  type="text"
                  value={quoteCode}
                  onChange={(e) => setQuoteCode(e.target.value)}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                  placeholder="Örn: TK-2026-001"
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
                    <div className="input w-full text-text-secondary bg-background-secondary text-sm py-2">
                      Bu müşterinin şantiyesi bulunmuyor
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
                <label className="block text-xs font-medium text-text-primary">Teklif Sahibi</label>
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
                  title="Tüm satırlara uygulanır; tabloda satır bazlı değiştirebilirsiniz"
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

              <div className="space-y-0.5 md:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-text-primary">Notlar</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isReadOnly}
                  className="input w-full h-14 resize-none text-sm"
                  placeholder="Teklif ile ilgili notlar..."
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-background-border pt-2">
              <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
                <span>
                  <span className="font-medium text-text-primary">Planlanan Süre:</span> {plannedDays} gün
                </span>
                <span>
                  <span className="font-medium text-text-primary">Durum:</span>{' '}
                  {status === QuoteStatus.Pending && 'Beklemede'}
                  {status === QuoteStatus.Accepted && 'Kabul Edildi'}
                  {status === QuoteStatus.Rejected && 'Reddedildi'}
                </span>
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
                {!isNew && isReadOnly && (
                  <>
                    {status === QuoteStatus.Pending && !quote?.ConvertedContractId && (
                      <button
                        onClick={() => setIsReadOnly(false)}
                        className="btn-primary"
                      >
                        Düzenle
                      </button>
                    )}
                    {status === QuoteStatus.Pending && !quote?.ConvertedContractId && (
                      <>
                        <button
                          onClick={handleAccept}
                          disabled={isBusy}
                          className="btn-success"
                        >
                          Kabul Et
                        </button>
                        <button
                          onClick={handleReject}
                          disabled={isBusy}
                          className="btn-danger"
                        >
                          Reddet
                        </button>
                      </>
                    )}
                    {status === QuoteStatus.Accepted && !quote?.ConvertedContractId && (
                      <button
                        onClick={openConvertModal}
                        disabled={isBusy}
                        className="btn-success"
                      >
                        Sözleşmeye Dönüştür
                      </button>
                    )}
                  </>
                )}
                {!isReadOnly && (
                  <>
                    {!isNew && quote && status === QuoteStatus.Pending && (
                      <button
                        onClick={handleDeleteClick}
                        disabled={isBusy}
                        className="btn-danger"
                      >
                        Sil
                      </button>
                    )}
                    <button onClick={onClose} className="btn-secondary">
                      İptal
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isBusy}
                      className="btn-primary"
                    >
                      {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                  </>
                )}
                {isReadOnly && (
                  <button onClick={onClose} className="btn-secondary">
                    Kapat
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Sözleşmeye dönüştürüldü bilgisi */}
          {quote?.ConvertedContractId && (
            <section className="rounded-xl border border-background-border bg-green-900/30 p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-green-300 shrink-0">
                  <CheckIcon size={20} weight="bold" aria-hidden />
                </span>
                <span>
                  Bu teklif sözleşmeye dönüştürüldü (Sözleşme #{quote.ConvertedContractId})
                </span>
              </div>
            </section>
          )}

          {/* Orta kısım: ürün tablosu */}
          <section className="rounded-xl border border-background-border bg-background-panel shadow-sm flex-1 min-h-[260px] flex flex-col overflow-hidden">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider px-4 pt-4 pb-2 border-b border-background-border shrink-0">
              Teklif Kalemleri
            </h3>
            <div className="border-0 rounded-b-xl overflow-auto flex-1 min-h-0">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-background-secondary z-10 border-b border-background-border">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-text-secondary whitespace-nowrap">
                      Ürün Kodu
                    </th>
                    <th className="text-left px-3 py-2 font-semibold text-text-secondary">
                      Ürün Adı
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-text-secondary w-24">
                      Miktar
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-text-secondary whitespace-nowrap">
                      Birim Fiyat
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-text-secondary w-20">
                      İskonto (%)
                    </th>
                    <th className="text-right px-3 py-2 font-semibold text-text-secondary whitespace-nowrap">
                      Toplam
                    </th>
                    <th className="text-center px-2 py-2 font-semibold text-text-secondary w-20">
                      İşlem
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {quoteItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-6 text-center text-sm text-text-secondary"
                      >
                        Henüz ürün eklenmedi. Üst kısımdan "Ürün Ekle" butonu ile ürün
                        seçebilirsiniz.
                      </td>
                    </tr>
                  ) : (
                    quoteItems.map((item) => {
                      const itemCode =
                        availableItems.find((i) => i.ItemId === item.ItemId)?.ItemCode ??
                        '—';
                      const lineTotal = item.DailyPrice * item.Quantity * plannedDays;
                      const justAdded = lastAddedItemIds.includes(item.ItemId);
                      return (
                        <tr
                          key={item.ItemId}
                          className={`border-b border-background-border hover:bg-background-hover/50 transition-colors duration-300 ${
                            justAdded ? 'bg-green-500/20' : ''
                          }`}
                        >
                          <td className="px-3 py-2 text-text-secondary">{itemCode}</td>
                          <td className="px-3 py-2 font-medium">{item.ItemName}</td>
                          <td className="px-3 py-2 text-right">
                            {isReadOnly ? (
                              item.Quantity
                            ) : (
                              <input
                                type="number"
                                min={1}
                                value={item.Quantity}
                                onChange={(e) =>
                                  updateQuoteItemQuantity(
                                    item.ItemId,
                                    Number(e.target.value) || 1
                                  )
                                }
                                className="input w-16 text-right py-1 text-sm"
                                aria-label="Miktar"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-text-secondary">
                            {formatCurrency(item.DailyPrice)}/gün
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isReadOnly ? (
                              Number(getItemIskonto(item.ItemId)) || 0
                            ) : (
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.01}
                                value={Number(getItemIskonto(item.ItemId)) || 0}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value);
                                  updateQuoteItemIskonto(item.ItemId, Number.isFinite(v) ? v : 0);
                                }}
                                className="input w-16 text-right py-1 text-sm"
                                aria-label="İskonto %"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-green-500">
                            {formatCurrency(lineTotal)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.ItemId)}
                                className="text-error hover:text-red-700 inline-flex p-1"
                                aria-label="Kaldır"
                              >
                                <XIcon size={18} weight="regular" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Alt kısım: finansal özet */}
          <section className="rounded-xl border border-background-border bg-background-panel p-4 shadow-sm shrink-0">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 text-sm">
              <div>
                <div className="text-text-secondary mb-1">Ara Toplam</div>
                <div className="font-semibold text-text-primary">
                  {formatCurrency(subtotal)}
                </div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">
                  Toplam İskonto
                </div>
                <div className="font-semibold text-red-300">
                  -{formatCurrency(discountAmount)}
                </div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">İskontolu Toplam</div>
                <div className="font-semibold text-text-primary">
                  {formatCurrency(discountedTotal)}
                </div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">
                  KDV Toplam ({vatRate || 0}%)
                </div>
                <div className="font-semibold text-yellow-300">
                  {formatCurrency(vatAmount)}
                </div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">Genel Toplam</div>
                <div className="text-2xl font-bold text-green-400">
                  {formatCurrency(grandTotal)}
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs text-text-secondary">
              ({plannedDays} gün üzerinden hesaplanmıştır)
            </div>
          </section>
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
                              className="text-error hover:text-red-700 text-xl px-1 inline-flex items-center justify-center"
                            >
                              <XIcon size={18} weight="regular" aria-hidden />
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
      <ProductPickerModal
        open={showProductPickerModal}
        onClose={() => setShowProductPickerModal(false)}
        items={availableItems}
        onItemSelect={addItemFromPicker}
        displayMode="quote"
      />
    </div>
  );
}

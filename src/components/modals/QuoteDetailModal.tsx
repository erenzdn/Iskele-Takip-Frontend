import { useState, useEffect } from 'react';
import {
  Quote,
  Customer,
  Inventory,
  QuoteDetailItem,
  ConstructionSite,
  QuoteStatus,
} from '../../models';
import { quoteService } from '../../services/quoteService';
import { customerService } from '../../services/customerService';
import { inventoryService } from '../../services/inventoryService';
import { siteService } from '../../services/siteService';

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
  const [itemQuantity, setItemQuantity] = useState<number | ''>(1);
  const [status, setStatus] = useState<QuoteStatus>(QuoteStatus.Pending);
  const [notes, setNotes] = useState('');
  const [isBusy, setIsBusy] = useState(false);

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
    (new Date(plannedEndDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  const totalPrice = quoteItems.reduce(
    (sum, item) => sum + item.DailyPrice * item.Quantity * plannedDays,
    0
  );

  const handleAddItem = () => {
    if (!selectedItemId) return;

    const selectedItem = availableItems.find((i) => i.ItemId === Number(selectedItemId));
    if (!selectedItem) return;

    const qty = Number(itemQuantity) || 1;
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

    setSelectedItemId('');
    setItemQuantity(1);
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

  const handleDelete = async () => {
    if (!quote || !confirm('Bu teklifi silmek istediğinizden emin misiniz?')) {
      return;
    }

    if (quote.ConvertedContractId) {
      alert('Sözleşmeye dönüştürülmüş teklifler silinemez.');
      return;
    }

    try {
      setIsBusy(true);
      await quoteService.deleteAsync(quote.QuoteId);
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

    if (!confirm('Bu teklifi sözleşmeye dönüştürmek istediğinizden emin misiniz?')) {
      return;
    }

    try {
      setIsBusy(true);
      const result = await quoteService.convertToContractAsync(quote.QuoteId);
      alert(`Teklif başarıyla sözleşmeye dönüştürüldü!\nSözleşme ID: ${result.ContractId}`);
      onClose();
    } catch (error) {
      console.error('Convert quote error:', error);
      alert('Dönüştürme hatası. Envanterde yeterli stok olduğundan emin olun.');
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
            <div className="card border-2 border-dashed border-background-border p-4">
              <h3 className="font-semibold mb-3">Malzeme Ekle</h3>
              <div className="flex gap-3">
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(Number(e.target.value) || '')}
                  className="input flex-1"
                >
                  <option value="">Malzeme seçin</option>
                  {availableItems.map((item) => (
                    <option key={item.ItemId} value={item.ItemId}>
                      {item.ItemName} - ₺{(item.MonthlyListPrice ?? 0).toFixed(2)}/ay (Stok:{' '}
                      {item.TotalStock - item.OnRent})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                  min="1"
                  className="input w-24"
                  placeholder="Miktar"
                />
                <button onClick={handleAddItem} className="btn-primary">
                  Ekle
                </button>
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
                  onClick={handleConvertToContract}
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
                <button onClick={handleDelete} disabled={isBusy} className="btn-danger flex-1">
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
    </div>
  );
}

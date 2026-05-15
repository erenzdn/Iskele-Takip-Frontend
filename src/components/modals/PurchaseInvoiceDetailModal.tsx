import { useState, useEffect, useMemo } from 'react';
import { PurchaseInvoice, Customer, Inventory, Warehouse } from '../../models';
import { purchaseInvoiceService } from '../../services/purchaseInvoiceService';
import { customerService } from '../../services/customerService';
import { inventoryService } from '../../services/inventoryService';
import { warehouseService } from '../../services/warehouseService';
import { formatCurrency } from '../../utils/formatters';
import ConfirmModal from './ConfirmModal';
import { getApiErrorMessage, getUserFacingErrorMessage, userMessageForCustomerRelatedApiError } from '../../utils/apiError';
import { toast } from '../../hooks/useToast';
import {
  firstValidationError,
  normalizeNumericText,
  normalizeText,
  validateDate,
  validateEmail,
  validateName,
  validateNumber,
  validatePhone,
  validateRequired,
  validateTaxNumber,
} from '../../utils/validation';

interface PurchaseInvoiceDetailModalProps {
  invoice: PurchaseInvoice | null;
  isNew: boolean;
  onClose: () => void;
}

export default function PurchaseInvoiceDetailModal({
  invoice,
  isNew,
  onClose,
}: PurchaseInvoiceDetailModalProps) {
  const [isReadOnly, setIsReadOnly] = useState(!isNew);
  const [isBusy, setIsBusy] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [items, setItems] = useState<Inventory[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);

  // Yeni müşteri ekleme state'leri
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerTaxId, setNewCustomerTaxId] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Yeni ürün ekleme state'leri
  const [showNewItemForm, setShowNewItemForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCode, setNewItemCode] = useState('');
  const [newItemTotalStock, setNewItemTotalStock] = useState('0');
  const [savingItem, setSavingItem] = useState(false);
  const [newItemSaveError, setNewItemSaveError] = useState<string | null>(null);

  // Form alanları
  const [invoiceDate, setInvoiceDate] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [documentNo, setDocumentNo] = useState('');
  const [itemId, setItemId] = useState<number | ''>('');
  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [currency, setCurrency] = useState<string>('TL');
  const [exchangeRate, setExchangeRate] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');

  // Tutar alanları - string olarak tutulur, input'larda doğal düzenleme sağlanır
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('0');
  const [iskonto, setIskonto] = useState('0');
  const [vatRate, setVatRate] = useState('20');

  const calculations = useMemo(() => {
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(unitPrice) || 0;
    const disc = parseFloat(iskonto) || 0;
    const vat = parseFloat(vatRate) || 0;
    const grossTotal = qty * price;
    const discountAmount = grossTotal * (disc / 100);
    const subtotal = grossTotal - discountAmount;
    const vatAmount = subtotal * (vat / 100);
    const totalAmount = subtotal + vatAmount;
    return {
      grossTotal,
      discountAmount,
      subtotal,
      vatAmount,
      totalAmount,
    };
  }, [quantity, unitPrice, iskonto, vatRate]);

  useEffect(() => {
    loadCustomers();
    loadItems();
    loadWarehouses();

    if (invoice) {
      setInvoiceDate(invoice.InvoiceDate.split('T')[0]);
      setEntryDate(invoice.EntryDate.split('T')[0]);
      setCustomerId(invoice.CustomerId);
      setDescription(invoice.Description || '');
      setDocumentNo(invoice.DocumentNo || '');
      setItemId(invoice.ItemId ?? '');
      setWarehouseId(invoice.WarehouseId ?? '');
      setCurrency(invoice.Currency || 'TL');
      setExchangeRate(invoice.ExchangeRate != null ? String(invoice.ExchangeRate) : '');

      setIskonto(String(invoice.Iskonto ?? 0));
      if (invoice.VatRate != null) {
        setVatRate(String(invoice.VatRate));
      } else if (invoice.Subtotal > 0) {
        setVatRate(String(Math.round((invoice.VatAmount / invoice.Subtotal) * 100)));
      }
      const invoiceQty = invoice.Quantity ?? 1;
      setQuantity(String(invoiceQty));
      const iskontoPct = (invoice.Iskonto ?? 0) / 100;
      const grossSubtotal = iskontoPct < 1 ? invoice.Subtotal / (1 - iskontoPct) : invoice.Subtotal;
      setUnitPrice(String(invoiceQty > 0 ? grossSubtotal / invoiceQty : grossSubtotal));
    } else {
      const today = new Date().toISOString().split('T')[0];
      setInvoiceDate(today);
      setEntryDate(today);
    }
  }, [invoice]);

  const loadCustomers = async () => {
    try {
      setCustomersLoading(true);
      const data = await customerService.getAllAsync();
      setCustomers(data);
    } catch (error) {
      console.error('Load customers error:', error);
    } finally {
      setCustomersLoading(false);
    }
  };

  const loadItems = async () => {
    try {
      setItemsLoading(true);
      const data = await inventoryService.getAllAsync();
      setItems(data);
    } catch (error) {
      console.error('Load items error:', error);
    } finally {
      setItemsLoading(false);
    }
  };

  const loadWarehouses = async () => {
    try {
      setWarehousesLoading(true);
      const data = await warehouseService.getAllAsync();
      setWarehouses(data);
    } catch (error) {
      console.error('Load warehouses error:', error);
    } finally {
      setWarehousesLoading(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    const search = customerSearch.trim().toLowerCase();
    if (!search) return customers;
    return customers.filter((customer) => {
      const name = String(customer.Name || '').toLowerCase();
      const taxId = String(customer.TaxId || '').toLowerCase();
      return name.includes(search) || taxId.includes(search);
    });
  }, [customers, customerSearch]);

  const filteredItems = useMemo(() => {
    const search = itemSearch.trim().toLowerCase();
    if (!search) return items;
    return items.filter((item) => {
      const name = String(item.ItemName || '').toLowerCase();
      const code = String(item.ItemCode || '').toLowerCase();
      return name.includes(search) || code.includes(search);
    });
  }, [items, itemSearch]);

  const selectedCustomer = useMemo(
    () => (customerId ? customers.find((customer) => customer.CustomerId === Number(customerId)) ?? null : null),
    [customers, customerId]
  );
  const selectedItem = useMemo(
    () => (itemId ? items.find((item) => item.ItemId === Number(itemId)) ?? null : null),
    [items, itemId]
  );


  const handleSaveNewItem = async () => {
    const newItemValidation = firstValidationError([
      validateRequired(newItemName, 'Ürün adı'),
      validateNumber(newItemTotalStock, 'Toplam stok', { min: 0 }),
    ]);
    if (newItemValidation) {
      toast.warning(newItemValidation);
      return;
    }

    try {
      setNewItemSaveError(null);
      setSavingItem(true);
      const result = await inventoryService.createAsync({
        ItemName: normalizeText(newItemName),
        ItemCode: normalizeText(newItemCode) || undefined,
        TotalStock: parseFloat(newItemTotalStock) || 0,
        OnRent: 0,
      });

      await loadItems();
      setItemId(result.ItemId);
      resetNewItemForm();
    } catch (error) {
      console.error('Save item error:', error);
      setNewItemSaveError(getApiErrorMessage(error));
    } finally {
      setSavingItem(false);
    }
  };

  const resetNewItemForm = () => {
    setShowNewItemForm(false);
    setNewItemName('');
    setNewItemCode('');
    setNewItemTotalStock('0');
    setNewItemSaveError(null);
  };

  // Yeni müşteri kaydetme
  const handleSaveNewCustomer = async () => {
    const customerValidation = firstValidationError([
      validateName(newCustomerName, 'Müşteri/Tedarikçi adı', true),
      validateTaxNumber(newCustomerTaxId, 'Vergi no'),
      validatePhone(newCustomerPhone, 'Telefon'),
      validateEmail(newCustomerEmail, 'E-posta'),
    ]);
    if (customerValidation) {
      toast.warning(customerValidation);
      return;
    }

    try {
      setSavingCustomer(true);
      const result = await customerService.createAsync({
        Name: normalizeText(newCustomerName),
        TaxId: normalizeNumericText(newCustomerTaxId) || undefined,
        PhoneNumber: normalizeNumericText(newCustomerPhone) || undefined,
        Email: normalizeText(newCustomerEmail) || undefined,
        Address: normalizeText(newCustomerAddress) || undefined,
      });

      // Müşterileri yeniden yükle ve yeni müşteriyi seç
      await loadCustomers();
      setCustomerId(result.CustomerId);

      // Formu temizle ve kapat
      resetNewCustomerForm();
    } catch (error) {
      console.error('Save customer error:', error);
      toast.error(getUserFacingErrorMessage(error, 'Müşteri kaydetme hatası'));
    } finally {
      setSavingCustomer(false);
    }
  };

  const resetNewCustomerForm = () => {
    setShowNewCustomerForm(false);
    setNewCustomerName('');
    setNewCustomerTaxId('');
    setNewCustomerPhone('');
    setNewCustomerEmail('');
    setNewCustomerAddress('');
  };

  const handleSave = async () => {
    const validationError = firstValidationError([
      validateDate(invoiceDate, 'Fatura tarihi', true),
      validateDate(entryDate, 'Giriş tarihi', true),
      validateRequired(String(customerId || ''), 'Tedarikçi'),
      validateNumber(quantity, 'Miktar', { min: 0.01 }),
      validateNumber(unitPrice, 'Birim fiyat', { min: 0.01 }),
      ...(exchangeRate ? [validateNumber(exchangeRate, 'Kur', { min: 0.0001 })] : []),
    ]);
    if (validationError) {
      toast.warning(validationError);
      return;
    }

    try {
      setIsBusy(true);
      const qty = parseFloat(quantity) || 0;
      const payload = {
        InvoiceDate: new Date(invoiceDate).toISOString(),
        EntryDate: new Date(entryDate).toISOString(),
        CustomerId: Number(customerId),
        Description: normalizeText(description) || undefined,
        Subtotal: calculations.subtotal,
        VatAmount: calculations.vatAmount,
        TotalAmount: calculations.totalAmount,
        Iskonto: parseFloat(iskonto) || 0,
        VatRate: parseFloat(vatRate) || 0,
        DocumentNo: normalizeText(documentNo) || undefined,
        ItemId: itemId ? Number(itemId) : undefined,
        WarehouseId: warehouseId ? Number(warehouseId) : undefined,
        Quantity: itemId && warehouseId ? qty : undefined,
        Currency: currency || undefined,
        ExchangeRate: exchangeRate ? parseFloat(exchangeRate) : undefined,
      };

      if (isNew) {
        await purchaseInvoiceService.createAsync(payload);
      } else if (invoice) {
        await purchaseInvoiceService.updateAsync(invoice.InvoiceId, payload);
      }
      onClose();
    } catch (error) {
      console.error('Save invoice error:', error);
      toast.error(userMessageForCustomerRelatedApiError(error, 'Kaydetme hatası'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteClick = () => {
    if (!invoice) return;
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!invoice) return;
    try {
      setIsBusy(true);
      await purchaseInvoiceService.deleteAsync(invoice.InvoiceId);
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      console.error('Delete invoice error:', error);
      toast.error(getUserFacingErrorMessage(error, 'Silme hatası'));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      className={
        isNew
          ? 'fixed inset-0 z-50 flex flex-col bg-background-main'
          : 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
      }
    >
      <div
        className={
          isNew
            ? 'w-full h-full overflow-hidden p-1.5 md:p-2 text-xs leading-tight [&_.input]:text-xs [&_.input]:py-1 [&_.input]:px-2 [&_.input]:min-h-[28px] [&_textarea.input]:min-h-[38px]'
            : 'bg-background-panel rounded-panel w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto'
        }
      >
        <h2 className="mb-1 text-base font-semibold">
          {isNew ? 'Yeni Alış Faturası' : 'Fatura Detayı'}
        </h2>

        {/* Özet Bilgiler - Sadece mevcut faturalarda */}
        {isReadOnly && !isNew && invoice && (
          <div className="mb-6 card bg-blue-900 p-4">
            <div className="grid grid-cols-4 gap-4 text-sm mb-3">
              <div>
                <div className="text-text-secondary mb-1">Fatura No</div>
                <div className="text-xl font-bold">#{invoice.InvoiceId}</div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">Ara Toplam</div>
                <div className="text-xl font-bold">{formatCurrency(invoice.Subtotal)}</div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">KDV</div>
                <div className="text-xl font-bold">{formatCurrency(invoice.VatAmount)}</div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">Toplam</div>
                <div className="text-xl font-bold text-accent">{formatCurrency(invoice.TotalAmount)}</div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4 text-sm border-t border-blue-800 pt-3">
              {invoice.DocumentNo && (
                <div>
                  <div className="text-text-secondary mb-1">Evrak No</div>
                  <div className="font-medium">{invoice.DocumentNo}</div>
                </div>
              )}
              {invoice.ItemName && (
                <div>
                  <div className="text-text-secondary mb-1">Ürün</div>
                  <div className="font-medium">{invoice.ItemName}</div>
                </div>
              )}
              {invoice.WarehouseName && (
                <div>
                  <div className="text-text-secondary mb-1">Depo</div>
                  <div className="font-medium">{invoice.WarehouseName}</div>
                </div>
              )}
              {invoice.Quantity != null && invoice.Quantity > 0 && (
                <div>
                  <div className="text-text-secondary mb-1">Miktar</div>
                  <div className="font-medium">{invoice.Quantity} adet</div>
                </div>
              )}
              {invoice.Currency && invoice.Currency !== 'TL' && (
                <div>
                  <div className="text-text-secondary mb-1">Döviz</div>
                  <div className="font-medium">{invoice.Currency} (Kur: {invoice.ExchangeRate ?? '-'})</div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid h-[calc(100%-66px)] grid-cols-12 gap-2">
          <div className="col-span-7 space-y-1.5">
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <label className="mb-1 block text-xs font-medium">Fatura Tarihi *</label>
                <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} disabled={isReadOnly} className="input w-full" required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Giriş Tarihi *</label>
                <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} disabled={isReadOnly} className="input w-full" required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Evrak No</label>
                <input type="text" value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} disabled={isReadOnly} maxLength={100} placeholder="Evrak numarası" className="input w-full" />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Tedarikçi *</label>
              {customersLoading ? (
                <div className="text-text-secondary">Yükleniyor...</div>
              ) : (
                <div className="space-y-1">
                  {!isReadOnly && (
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Tedarikçi ara..."
                      className="input w-full"
                    />
                  )}
                  {isReadOnly ? (
                    <input type="text" readOnly value={selectedCustomer?.Name || 'Tedarikçi seçilmedi'} className="input w-full" />
                  ) : (
                    <div className="rounded-panel border border-background-border bg-background-secondary p-1">
                      {selectedCustomer && (
                        <div className="mb-1 rounded-md border border-background-border bg-background-main px-2 py-1 text-[11px] text-text-secondary">
                          <span className="mr-1 font-medium text-text-primary">Seçili:</span>
                          {selectedCustomer.Name}
                        </div>
                      )}
                      <div className="max-h-28 overflow-y-auto pr-0.5">
                        {filteredCustomers.length === 0 ? (
                          <div className="px-2 py-1.5 text-[11px] text-text-secondary">Eşleşen tedarikçi bulunamadı.</div>
                        ) : (
                          filteredCustomers.map((customer) => {
                            const isSelected = Number(customerId) === customer.CustomerId;
                            return (
                              <button
                                key={customer.CustomerId}
                                type="button"
                                onClick={() => setCustomerId(customer.CustomerId)}
                                className={`mb-1 w-full rounded-md border px-2 py-1 text-left text-[11px] last:mb-0 ${
                                  isSelected
                                    ? 'border-blue-700/50 bg-blue-900/30 text-text-primary'
                                    : 'border-transparent bg-background-main text-text-primary hover:border-background-border hover:bg-background-hover'
                                }`}
                              >
                                {customer.Name}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                  {!isReadOnly && (
                    <button type="button" onClick={() => setShowNewCustomerForm(!showNewCustomerForm)} className="btn-secondary whitespace-nowrap">
                      + Yeni C/H
                    </button>
                  )}
                  {!isReadOnly && customerId && !selectedCustomer && (
                    <p className="text-[11px] text-amber-600">
                      Seçili tedarikçi listede yok (muhtemelen arşivlenmiş). Kaydetmek için listeden aktif bir müşteri seçin.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Ürün</label>
              {itemsLoading ? (
                <div className="text-text-secondary text-sm">Yükleniyor...</div>
              ) : (
                <div className="space-y-1">
                  {!isReadOnly && (
                    <input
                      type="text"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      placeholder="Ürün ara..."
                      className="input w-full"
                    />
                  )}
                  {isReadOnly ? (
                    <input
                      type="text"
                      readOnly
                      value={
                        selectedItem
                          ? `${selectedItem.ItemCode ? `[${selectedItem.ItemCode}] ` : ''}${selectedItem.ItemName}`
                          : 'Ürün seçilmedi'
                      }
                      className="input w-full"
                    />
                  ) : (
                    <div className="rounded-panel border border-background-border bg-background-secondary p-1">
                      {selectedItem && (
                        <div className="mb-1 rounded-md border border-background-border bg-background-main px-2 py-1 text-[11px] text-text-secondary">
                          <span className="mr-1 font-medium text-text-primary">Seçili:</span>
                          {selectedItem.ItemCode ? `[${selectedItem.ItemCode}] ` : ''}
                          {selectedItem.ItemName}
                        </div>
                      )}
                      <div className="max-h-28 overflow-y-auto pr-0.5">
                        {filteredItems.length === 0 ? (
                          <div className="px-2 py-1.5 text-[11px] text-text-secondary">Eşleşen ürün bulunamadı.</div>
                        ) : (
                          filteredItems.map((item) => {
                            const isSelected = Number(itemId) === item.ItemId;
                            return (
                              <button
                                key={item.ItemId}
                                type="button"
                                onClick={() => setItemId(item.ItemId)}
                                className={`mb-1 w-full rounded-md border px-2 py-1 text-left text-[11px] last:mb-0 ${
                                  isSelected
                                    ? 'border-blue-700/50 bg-blue-900/30 text-text-primary'
                                    : 'border-transparent bg-background-main text-text-primary hover:border-background-border hover:bg-background-hover'
                                }`}
                              >
                                <div>{item.ItemName}</div>
                                <div className="text-[10px] text-text-secondary">Kod: {item.ItemCode || '—'}</div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                  {!isReadOnly && (
                    <button type="button" onClick={() => { setNewItemSaveError(null); setShowNewItemForm((prev) => !prev); }} className="btn-secondary whitespace-nowrap">
                      {showNewItemForm ? '✕' : '+ Yeni Ürün'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {showNewCustomerForm && !isReadOnly && (
              <div className="rounded-panel border border-background-border bg-background-secondary p-2">
                <h4 className="mb-1 text-xs font-semibold">Yeni Cari Hesap Ekle</h4>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="mb-1 block text-xs font-medium">Ad/Ünvan *</label>
                    <input type="text" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} placeholder="Firma veya kişi adı" className="input w-full" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Vergi No</label>
                    <input
                      type="text"
                      value={newCustomerTaxId}
                      onChange={(e) => setNewCustomerTaxId(e.target.value.replace(/\D/g, '').slice(0, 11))}
                      placeholder="Vergi numarası"
                      inputMode="numeric"
                      maxLength={11}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Telefon</label>
                    <input type="text" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} placeholder="0xxx xxx xx xx" className="input w-full" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">E-posta</label>
                    <input type="email" value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} placeholder="ornek@email.com" className="input w-full" />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-medium">Adres</label>
                    <input type="text" value={newCustomerAddress} onChange={(e) => setNewCustomerAddress(e.target.value)} placeholder="Adres bilgisi" className="input w-full" />
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={resetNewCustomerForm} className="btn-secondary" disabled={savingCustomer}>İptal</button>
                  <button type="button" onClick={handleSaveNewCustomer} className="btn-primary" disabled={savingCustomer}>{savingCustomer ? 'Kaydediliyor...' : 'Kaydet'}</button>
                </div>
              </div>
            )}
          </div>

          <div className="col-span-5 space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium">Depo</label>
                {warehousesLoading ? (
                  <div className="text-text-secondary text-sm">Yükleniyor...</div>
                ) : (
                  <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : '')} disabled={isReadOnly} className="input w-full">
                    <option value="">Depo seçin (opsiyonel)</option>
                    {warehouses.map((wh) => (
                      <option key={wh.WarehouseId} value={wh.WarehouseId}>{wh.WarehouseName}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {showNewItemForm && !isReadOnly && (
              <div className="rounded-panel border border-background-border bg-background-secondary p-2">
                <h4 className="mb-1 text-xs font-semibold">Yeni Ürün Ekle</h4>
                {newItemSaveError && (
                  <div role="alert" className="mb-2 rounded-md border border-red-600/60 bg-red-950/45 p-2 text-xs text-red-100 whitespace-pre-wrap">{newItemSaveError}</div>
                )}
                <div className="space-y-1.5">
                  <div>
                    <label className="mb-1 block text-xs font-medium">Ürün Adı *</label>
                    <input type="text" value={newItemName} onChange={(e) => { setNewItemName(e.target.value); setNewItemSaveError(null); }} placeholder="Ürün adı" className="input w-full" />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="mb-1 block text-xs font-medium">Ürün Kodu</label>
                      <input type="text" value={newItemCode} onChange={(e) => setNewItemCode(e.target.value)} placeholder="Alfanümerik kod" maxLength={50} className="input w-full" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Stok Adedi</label>
                      <input type="number" value={newItemTotalStock} onChange={(e) => setNewItemTotalStock(e.target.value)} min="0" step="1" placeholder="0" className="input w-full" />
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={resetNewItemForm} className="btn-secondary text-xs py-1 px-2" disabled={savingItem}>İptal</button>
                  <button type="button" onClick={handleSaveNewItem} className="btn-primary text-xs py-1 px-2" disabled={savingItem}>{savingItem ? 'Kaydediliyor...' : 'Kaydet'}</button>
                </div>
              </div>
            )}

            {!isReadOnly && itemId && warehouseId && (
              <div className="flex items-start gap-2 rounded-md border border-green-700/40 bg-green-900/20 p-2 text-[11px] text-green-300">
                <span className="mt-0.5 shrink-0">&#9432;</span>
                <span>Ürün ve depo seçili olduğundan, fatura kaydedildiğinde <strong>{parseFloat(quantity) || 0} adet</strong> ürün otomatik olarak envanter stokuna ve depo stokuna eklenecektir.</span>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium">Açıklama</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={isReadOnly} placeholder="Fatura açıklaması (opsiyonel)" className="input h-14 w-full resize-none" />
            </div>

            <div className="rounded-panel border border-background-border bg-background-secondary p-2">
              <h3 className="mb-1 text-xs font-semibold">Tutar Bilgileri</h3>
              <div className="mb-1 grid grid-cols-2 gap-1.5">
                <div>
                  <label className="mb-1 block text-xs font-medium">Miktar *</label>
                  <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={isReadOnly} min="0" step="1" placeholder="1" className="input w-full" required />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Birim Fiyat *</label>
                  <input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} disabled={isReadOnly} min="0" step="0.01" placeholder="0.00" className="input w-full" required />
                </div>
              </div>
              <div className="mb-1 grid grid-cols-4 gap-1.5">
                <div>
                  <label className="mb-1 block text-xs font-medium">İskonto (%)</label>
                  <input type="number" value={iskonto} onChange={(e) => setIskonto(e.target.value)} disabled={isReadOnly} min="0" max="100" step="0.01" placeholder="0" className="input w-full" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">KDV (%)</label>
                  <input type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)} disabled={isReadOnly} min="0" max="100" step="1" placeholder="20" className="input w-full" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Para Birimi</label>
                  <select value={currency} onChange={(e) => { setCurrency(e.target.value); if (e.target.value === 'TL') setExchangeRate(''); }} disabled={isReadOnly} className="input w-full">
                    <option value="TL">TL</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
                {currency === 'EUR' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium">Kur</label>
                    <input type="number" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} disabled={isReadOnly} min="0" step="0.0001" placeholder="Kur" className="input w-full" />
                  </div>
                )}
              </div>
              <div className="rounded-md border border-background-border bg-background-main p-2">
                <div className="mb-1 flex justify-between"><span className="text-text-secondary">Toplam:</span><span>{formatCurrency(calculations.grossTotal)}</span></div>
                {calculations.discountAmount > 0 && <div className="mb-1 flex justify-between text-red-400"><span>İskonto:</span><span>-{formatCurrency(calculations.discountAmount)}</span></div>}
                <div className="mb-1 flex justify-between border-t border-background-border pt-1"><span className="text-text-secondary">Ara Toplam:</span><span>{formatCurrency(calculations.subtotal)}</span></div>
                <div className="mb-1 flex justify-between"><span className="text-text-secondary">KDV:</span><span>{formatCurrency(calculations.vatAmount)}</span></div>
                <div className="mt-1 flex justify-between border-t border-background-border pt-1 text-xs font-semibold"><span>Genel Toplam:</span><span className="text-accent">{formatCurrency(calculations.totalAmount)}</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-3">
          {!isNew && isReadOnly && (
            <button onClick={() => setIsReadOnly(false)} className="btn-primary flex-1">
              Düzenle
            </button>
          )}
          {!isReadOnly && (
            <>
              {!isNew && invoice && (
                <button
                  onClick={handleDeleteClick}
                  disabled={isBusy}
                  className="btn-danger flex-1"
                >
                  Sil
                </button>
              )}
              <button onClick={onClose} className="btn-secondary flex-1 !text-sm !py-2 !px-4">
                İptal
              </button>
              <button
                onClick={handleSave}
                disabled={isBusy}
                className="btn-primary flex-1 !text-sm !py-2 !px-4"
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
      <ConfirmModal
        open={showDeleteConfirm}
        title="Onaylıyor musunuz?"
        message="Bu faturayı silmek istediğinizden emin misiniz?"
        variant="danger"
        loading={isBusy}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

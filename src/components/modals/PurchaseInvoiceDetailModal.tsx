import { useState, useEffect, useMemo } from 'react';
import { Plus, XIcon } from '@phosphor-icons/react';
import { PurchaseInvoice, Customer, Inventory, Warehouse } from '../../models';
import { purchaseInvoiceService } from '../../services/purchaseInvoiceService';
import { customerService } from '../../services/customerService';
import { inventoryService } from '../../services/inventoryService';
import { warehouseService } from '../../services/warehouseService';
import { formatCurrency } from '../../utils/formatters';
import ConfirmModal from './ConfirmModal';
import CustomerSearchField from '../CustomerSearchField';
import { getApiErrorMessage, getUserFacingApiErrorMessage, getUserFacingErrorMessage, isArchivedInventoryApiError, userMessageForCustomerRelatedApiError } from '../../utils/apiError';
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
      const data = await warehouseService.getActiveAsync();
      setWarehouses(data);
    } catch (error) {
      console.error('Load warehouses error:', error);
    } finally {
      setWarehousesLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    const search = itemSearch.trim().toLowerCase();
    if (!search) return items;
    return items.filter((item) => {
      const name = String(item.ItemName || '').toLowerCase();
      const code = String(item.ItemCode || '').toLowerCase();
      return name.includes(search) || code.includes(search);
    });
  }, [items, itemSearch]);

  const itemOptions = useMemo(() => {
    if (!itemId) return filteredItems;
    const selected = items.find((item) => item.ItemId === Number(itemId));
    if (selected && !filteredItems.some((item) => item.ItemId === selected.ItemId)) {
      return [selected, ...filteredItems];
    }
    return filteredItems;
  }, [filteredItems, itemId, items]);

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
      toast.error(
        isArchivedInventoryApiError(error)
          ? getUserFacingApiErrorMessage(error, 'purchase-invoice')
          : userMessageForCustomerRelatedApiError(error, 'Kaydetme hatası')
      );
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

  const compactBtn = '!py-1.5 !px-3 text-xs';
  const fieldLabel = 'block text-[11px] font-medium text-text-secondary mb-0.5';
  const extraFormOpen = !isReadOnly && (showNewCustomerForm || showNewItemForm);
  const selectedWarehouse = warehouseId
    ? warehouses.find((wh) => wh.WarehouseId === Number(warehouseId))
    : undefined;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background-main overflow-hidden">
      <header className="shrink-0 flex items-center justify-between px-3 py-2 bg-background-panel border-b border-background-border">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-base font-semibold text-text-primary tracking-tight truncate">
            {isNew ? 'Yeni Alış Faturası' : 'Fatura Detayı'}
          </h1>
          {!isNew && invoice && (
            <span className="text-xs font-medium text-text-secondary whitespace-nowrap">
              #{invoice.InvoiceId}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
          aria-label="Kapat"
        >
          <XIcon size={20} weight="regular" />
        </button>
      </header>

      <div className="flex-1 min-h-0 flex flex-col p-2 gap-2">
        <section
          className={`shrink-0 rounded-lg border border-background-border bg-background-panel px-3 py-2 ${
            extraFormOpen ? 'max-h-[42vh] overflow-auto' : ''
          }`}
        >
          <div className="flex flex-wrap gap-x-2.5 gap-y-1.5">
            <div className="min-w-[140px] w-[160px]">
              <label className={fieldLabel}>Fatura Tarihi *</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                disabled={isReadOnly}
                className="input w-full text-sm py-1.5"
                required
              />
            </div>
            <div className="min-w-[140px] w-[160px]">
              <label className={fieldLabel}>Giriş Tarihi *</label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                disabled={isReadOnly}
                className="input w-full text-sm py-1.5"
                required
              />
            </div>
            <div className="min-w-[140px] w-[160px]">
              <label className={fieldLabel}>Evrak No</label>
              <input
                type="text"
                value={documentNo}
                onChange={(e) => setDocumentNo(e.target.value)}
                disabled={isReadOnly}
                maxLength={100}
                placeholder="Evrak numarası"
                className="input w-full text-sm py-1.5"
              />
            </div>
            <div className="min-w-[220px] flex-[1.4]">
              <label className={fieldLabel} htmlFor="purchase-supplier-search">
                Tedarikçi *
              </label>
              <div className="flex items-center gap-1">
                {customersLoading ? (
                  <div className="input w-full text-text-secondary text-sm py-1.5">Yükleniyor...</div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <CustomerSearchField
                      id="purchase-supplier-search"
                      customers={customers}
                      value={customerId}
                      onChange={setCustomerId}
                      disabled={isReadOnly}
                    />
                  </div>
                )}
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerForm((prev) => !prev)}
                    className={`btn-secondary shrink-0 ${compactBtn}`}
                    title="Yeni cari hesap ekle"
                  >
                    <Plus size={14} weight="bold" className="inline" /> C/H
                  </button>
                )}
              </div>
              {!isReadOnly && customerId && !selectedCustomer && (
                <p className="text-[11px] text-amber-200 mt-0.5">
                  Seçili tedarikçi listede yok (muhtemelen arşivlenmiş). Kaydetmek için aktif bir müşteri seçin.
                </p>
              )}
            </div>
            <div className="min-w-[240px] flex-[1.5]">
              <label className={fieldLabel}>Ürün</label>
              {itemsLoading ? (
                <div className="input w-full text-text-secondary text-sm py-1.5">Yükleniyor...</div>
              ) : (
                <div className="flex items-center gap-1">
                  {!isReadOnly && (
                    <input
                      type="text"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      placeholder="Ara..."
                      className="input w-[110px] shrink-0 text-sm py-1.5"
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
                      className="input w-full text-sm py-1.5"
                    />
                  ) : (
                    <select
                      value={itemId}
                      onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : '')}
                      className="input flex-1 min-w-0 text-sm py-1.5"
                    >
                      <option value="">Ürün seçin (opsiyonel)</option>
                      {itemOptions.map((item) => (
                        <option key={item.ItemId} value={item.ItemId}>
                          {item.ItemCode ? `[${item.ItemCode}] ` : ''}
                          {item.ItemName}
                        </option>
                      ))}
                    </select>
                  )}
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewItemSaveError(null);
                        setShowNewItemForm((prev) => !prev);
                      }}
                      className={`btn-secondary shrink-0 ${compactBtn}`}
                      title="Yeni ürün ekle"
                    >
                      {showNewItemForm ? 'Kapat' : '+ Ürün'}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="min-w-[180px] flex-1">
              <label className={fieldLabel}>Depo</label>
              {warehousesLoading ? (
                <div className="input w-full text-text-secondary text-sm py-1.5">Yükleniyor...</div>
              ) : (
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : '')}
                  disabled={isReadOnly}
                  className="input w-full text-sm py-1.5"
                >
                  <option value="">Depo seçin (opsiyonel)</option>
                  {warehouses.map((wh) => (
                    <option key={wh.WarehouseId} value={wh.WarehouseId}>
                      {wh.WarehouseName}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="min-w-[110px] w-[130px]">
              <label className={fieldLabel}>Para Birimi</label>
              <select
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  if (e.target.value === 'TL') setExchangeRate('');
                }}
                disabled={isReadOnly}
                className="input w-full text-sm py-1.5"
              >
                <option value="TL">TL</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            {currency === 'EUR' && (
              <div className="min-w-[110px] w-[130px]">
                <label className={fieldLabel}>Kur</label>
                <input
                  type="number"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  disabled={isReadOnly}
                  min="0"
                  step="0.0001"
                  placeholder="Kur"
                  className="input w-full text-sm py-1.5"
                />
              </div>
            )}
            <div className="min-w-[200px] flex-[1.4]">
              <label className={fieldLabel}>Açıklama</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isReadOnly}
                placeholder="Fatura açıklaması..."
                className="input w-full text-sm py-1.5"
              />
            </div>
          </div>

          {showNewCustomerForm && !isReadOnly && (
            <div className="mt-2 rounded-lg border border-background-border bg-background-secondary p-2">
              <h4 className="mb-1.5 text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                Yeni Cari Hesap
              </h4>
              <div className="flex flex-wrap gap-2">
                <div className="min-w-[160px] flex-1">
                  <label className={fieldLabel}>Ad/Ünvan *</label>
                  <input type="text" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} placeholder="Firma veya kişi adı" className="input w-full text-sm py-1.5" />
                </div>
                <div className="min-w-[120px] w-[140px]">
                  <label className={fieldLabel}>Vergi No</label>
                  <input
                    type="text"
                    value={newCustomerTaxId}
                    onChange={(e) => setNewCustomerTaxId(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    placeholder="Vergi no"
                    inputMode="numeric"
                    maxLength={11}
                    className="input w-full text-sm py-1.5"
                  />
                </div>
                <div className="min-w-[130px] w-[150px]">
                  <label className={fieldLabel}>Telefon</label>
                  <input type="text" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} placeholder="0xxx xxx xx xx" className="input w-full text-sm py-1.5" />
                </div>
                <div className="min-w-[160px] flex-1">
                  <label className={fieldLabel}>E-posta</label>
                  <input type="email" value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} placeholder="ornek@email.com" className="input w-full text-sm py-1.5" />
                </div>
                <div className="min-w-[200px] flex-[1.4]">
                  <label className={fieldLabel}>Adres</label>
                  <input type="text" value={newCustomerAddress} onChange={(e) => setNewCustomerAddress(e.target.value)} placeholder="Adres" className="input w-full text-sm py-1.5" />
                </div>
                <div className="flex items-end gap-1">
                  <button type="button" onClick={resetNewCustomerForm} className={`btn-secondary ${compactBtn}`} disabled={savingCustomer}>
                    İptal
                  </button>
                  <button type="button" onClick={handleSaveNewCustomer} className={`btn-primary ${compactBtn}`} disabled={savingCustomer}>
                    {savingCustomer ? 'Kaydediliyor...' : 'Cari Kaydet'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showNewItemForm && !isReadOnly && (
            <div className="mt-2 rounded-lg border border-background-border bg-background-secondary p-2">
              <h4 className="mb-1.5 text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                Yeni Ürün
              </h4>
              {newItemSaveError && (
                <div role="alert" className="mb-1.5 rounded-md border border-red-600/60 bg-red-950/45 p-2 text-xs text-red-100 whitespace-pre-wrap">
                  {newItemSaveError}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <div className="min-w-[180px] flex-1">
                  <label className={fieldLabel}>Ürün Adı *</label>
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => {
                      setNewItemName(e.target.value);
                      setNewItemSaveError(null);
                    }}
                    placeholder="Ürün adı"
                    className="input w-full text-sm py-1.5"
                  />
                </div>
                <div className="min-w-[120px] w-[150px]">
                  <label className={fieldLabel}>Ürün Kodu</label>
                  <input type="text" value={newItemCode} onChange={(e) => setNewItemCode(e.target.value)} placeholder="Kod" maxLength={50} className="input w-full text-sm py-1.5" />
                </div>
                <div className="min-w-[100px] w-[120px]">
                  <label className={fieldLabel}>Stok Adedi</label>
                  <input type="number" value={newItemTotalStock} onChange={(e) => setNewItemTotalStock(e.target.value)} min="0" step="1" placeholder="0" className="input w-full text-sm py-1.5" />
                </div>
                <div className="flex items-end gap-1">
                  <button type="button" onClick={resetNewItemForm} className={`btn-secondary ${compactBtn}`} disabled={savingItem}>
                    İptal
                  </button>
                  <button type="button" onClick={handleSaveNewItem} className={`btn-primary ${compactBtn}`} disabled={savingItem}>
                    {savingItem ? 'Kaydediliyor...' : 'Ürün Kaydet'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="flex-1 min-h-0 rounded-lg border border-background-border bg-background-panel flex flex-col overflow-hidden">
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-background-border">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Fatura Kalemi
            </h3>
            {!isReadOnly && itemId && warehouseId && (
              <span className="text-[11px] text-green-300">
                Kayıtta {parseFloat(quantity) || 0} adet stoka eklenecek
              </span>
            )}
          </div>
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm border-collapse text-text-primary">
              <thead className="sticky top-0 bg-background-surface z-10 border-b border-background-border">
                <tr>
                  <th className="text-left px-3 py-1.5 font-semibold text-text-secondary text-xs">Ürün</th>
                  <th className="text-left px-3 py-1.5 font-semibold text-text-secondary text-xs">Depo</th>
                  <th className="text-right px-3 py-1.5 font-semibold text-text-secondary text-xs w-28">Miktar *</th>
                  <th className="text-right px-3 py-1.5 font-semibold text-text-secondary text-xs w-36">Birim Fiyat *</th>
                  <th className="text-right px-3 py-1.5 font-semibold text-text-secondary text-xs w-24">İskonto %</th>
                  <th className="text-right px-3 py-1.5 font-semibold text-text-secondary text-xs w-24">KDV %</th>
                  <th className="text-right px-3 py-1.5 font-semibold text-text-secondary text-xs whitespace-nowrap">Satır Toplamı</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-background-border bg-background-surface">
                  <td className="px-3 py-1.5 text-text-secondary">
                    {selectedItem
                      ? `${selectedItem.ItemCode ? `[${selectedItem.ItemCode}] ` : ''}${selectedItem.ItemName}`
                      : 'Ürün seçilmedi'}
                  </td>
                  <td className="px-3 py-1.5 text-text-secondary">
                    {selectedWarehouse?.WarehouseName || 'Depo seçilmedi'}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {isReadOnly ? (
                      quantity
                    ) : (
                      <input
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        min="0"
                        step="1"
                        placeholder="1"
                        className="input w-full text-right text-sm py-1"
                        required
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {isReadOnly ? (
                      formatCurrency(parseFloat(unitPrice) || 0)
                    ) : (
                      <input
                        type="number"
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(e.target.value)}
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="input w-full text-right text-sm py-1"
                        required
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {isReadOnly ? (
                      iskonto
                    ) : (
                      <input
                        type="number"
                        value={iskonto}
                        onChange={(e) => setIskonto(e.target.value)}
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="0"
                        className="input w-full text-right text-sm py-1"
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {isReadOnly ? (
                      vatRate
                    ) : (
                      <input
                        type="number"
                        value={vatRate}
                        onChange={(e) => setVatRate(e.target.value)}
                        min="0"
                        max="100"
                        step="1"
                        placeholder="20"
                        className="input w-full text-right text-sm py-1"
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium text-green-400">
                    {formatCurrency(calculations.totalAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="shrink-0 rounded-lg border border-background-border bg-background-panel px-3 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm min-w-0">
            <div>
              <span className="text-[11px] text-text-secondary mr-1.5">Toplam</span>
              <span className="font-semibold text-text-primary">{formatCurrency(calculations.grossTotal)}</span>
            </div>
            {calculations.discountAmount > 0 && (
              <div>
                <span className="text-[11px] text-text-secondary mr-1.5">İskonto</span>
                <span className="font-semibold text-red-300">-{formatCurrency(calculations.discountAmount)}</span>
              </div>
            )}
            <div>
              <span className="text-[11px] text-text-secondary mr-1.5">Ara Toplam</span>
              <span className="font-semibold text-text-primary">{formatCurrency(calculations.subtotal)}</span>
            </div>
            <div>
              <span className="text-[11px] text-text-secondary mr-1.5">KDV ({vatRate || 0}%)</span>
              <span className="font-semibold text-yellow-300">{formatCurrency(calculations.vatAmount)}</span>
            </div>
            <div>
              <span className="text-[11px] text-text-secondary mr-1.5">Genel Toplam</span>
              <span className="text-lg font-bold text-green-400">{formatCurrency(calculations.totalAmount)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {!isNew && isReadOnly && (
              <button type="button" onClick={() => setIsReadOnly(false)} className={`btn-primary ${compactBtn}`}>
                Düzenle
              </button>
            )}
            {!isReadOnly && (
              <>
                {!isNew && invoice && (
                  <button type="button" onClick={handleDeleteClick} disabled={isBusy} className={`btn-danger ${compactBtn}`}>
                    Sil
                  </button>
                )}
                <button type="button" onClick={onClose} className={`btn-secondary ${compactBtn}`}>
                  İptal
                </button>
                <button type="button" onClick={handleSave} disabled={isBusy} className={`btn-primary ${compactBtn}`}>
                  {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </>
            )}
            {isReadOnly && !isNew && (
              <button type="button" onClick={onClose} className={`btn-secondary ${compactBtn}`}>
                Kapat
              </button>
            )}
          </div>
        </section>
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

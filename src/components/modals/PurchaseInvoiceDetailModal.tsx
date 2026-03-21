import { useState, useEffect, useMemo } from 'react';
import { PurchaseInvoice, Customer, Inventory, Warehouse } from '../../models';
import { purchaseInvoiceService } from '../../services/purchaseInvoiceService';
import { customerService } from '../../services/customerService';
import { inventoryService } from '../../services/inventoryService';
import { warehouseService } from '../../services/warehouseService';
import { formatCurrency } from '../../utils/formatters';
import ConfirmModal from './ConfirmModal';
import { getUserFacingErrorMessage } from '../../utils/apiError';
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
      const data = await warehouseService.getAllAsync();
      setWarehouses(data);
    } catch (error) {
      console.error('Load warehouses error:', error);
    } finally {
      setWarehousesLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (!itemSearch.trim()) return items;
    const search = itemSearch.toLowerCase();
    return items.filter(
      (item) =>
        item.ItemName.toLowerCase().includes(search) ||
        (item.ItemCode?.toLowerCase().includes(search) ?? false)
    );
  }, [items, itemSearch]);

  const handleSaveNewItem = async () => {
    const newItemValidation = firstValidationError([
      validateRequired(newItemName, 'Ürün adı'),
      validateNumber(newItemTotalStock, 'Toplam stok', { min: 0 }),
    ]);
    if (newItemValidation) {
      alert(newItemValidation);
      return;
    }

    try {
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
      alert(getUserFacingErrorMessage(error, 'Ürün kaydetme hatası'));
    } finally {
      setSavingItem(false);
    }
  };

  const resetNewItemForm = () => {
    setShowNewItemForm(false);
    setNewItemName('');
    setNewItemCode('');
    setNewItemTotalStock('0');
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
      alert(customerValidation);
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
      alert(getUserFacingErrorMessage(error, 'Müşteri kaydetme hatası'));
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
      alert(validationError);
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
      alert(getUserFacingErrorMessage(error, 'Kaydetme hatası'));
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
      alert(getUserFacingErrorMessage(error, 'Silme hatası'));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-background-panel rounded-panel w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">
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

        <div className="space-y-4">
          {/* Tarihler ve Evrak No */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Fatura Tarihi *</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                disabled={isReadOnly}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Giriş Tarihi *</label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                disabled={isReadOnly}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Evrak No</label>
              <input
                type="text"
                value={documentNo}
                onChange={(e) => setDocumentNo(e.target.value)}
                disabled={isReadOnly}
                maxLength={100}
                placeholder="Evrak numarası"
                className="input w-full"
              />
            </div>
          </div>

          {/* Tedarikçi Seçimi */}
          <div>
            <label className="block text-sm font-medium mb-2">Tedarikçi *</label>
            {customersLoading ? (
              <div className="text-text-secondary">Yükleniyor...</div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}
                  disabled={isReadOnly}
                  className="input flex-1"
                  required
                >
                  <option value="">Tedarikçi seçin...</option>
                  {customers.map((customer) => (
                    <option key={customer.CustomerId} value={customer.CustomerId}>
                      {customer.Name}
                    </option>
                  ))}
                </select>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerForm(!showNewCustomerForm)}
                    className="btn-secondary whitespace-nowrap"
                  >
                    + Yeni C/H
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Yeni Müşteri/Tedarikçi Ekleme Formu */}
          {showNewCustomerForm && !isReadOnly && (
            <div className="card bg-background-secondary p-4 border border-accent">
              <h4 className="text-md font-semibold mb-3">Yeni Cari Hesap Ekle</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Ad/Ünvan *</label>
                  <input
                    type="text"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="Firma veya kişi adı"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Vergi No</label>
                  <input
                    type="text"
                    value={newCustomerTaxId}
                    onChange={(e) => setNewCustomerTaxId(e.target.value)}
                    placeholder="Vergi numarası"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Telefon</label>
                  <input
                    type="text"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    placeholder="0xxx xxx xx xx"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">E-posta</label>
                  <input
                    type="email"
                    value={newCustomerEmail}
                    onChange={(e) => setNewCustomerEmail(e.target.value)}
                    placeholder="ornek@email.com"
                    className="input w-full"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Adres</label>
                  <input
                    type="text"
                    value={newCustomerAddress}
                    onChange={(e) => setNewCustomerAddress(e.target.value)}
                    placeholder="Adres bilgisi"
                    className="input w-full"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={resetNewCustomerForm}
                  className="btn-secondary"
                  disabled={savingCustomer}
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={handleSaveNewCustomer}
                  className="btn-primary"
                  disabled={savingCustomer}
                >
                  {savingCustomer ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </div>
          )}

          {/* Ürün ve Depo Seçimi */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Ürün</label>
              {itemsLoading ? (
                <div className="text-text-secondary text-sm">Yükleniyor...</div>
              ) : (
                <div>
                  {!isReadOnly && (
                    <input
                      type="text"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      placeholder="Ürün ara..."
                      className="input w-full mb-1 text-sm"
                    />
                  )}
                  <div className="flex gap-2">
                    <select
                      value={itemId}
                      onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : '')}
                      disabled={isReadOnly}
                      className="input flex-1"
                    >
                      <option value="">Ürün seçin (opsiyonel)</option>
                      {filteredItems.map((item) => (
                        <option key={item.ItemId} value={item.ItemId}>
                          {item.ItemCode ? `[${item.ItemCode}] ` : ''}{item.ItemName}
                        </option>
                      ))}
                    </select>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => setShowNewItemForm((prev) => !prev)}
                        className="btn-secondary whitespace-nowrap"
                      >
                        {showNewItemForm ? '✕' : '+ Yeni Ürün'}
                      </button>
                    )}
                  </div>

                  {showNewItemForm && !isReadOnly && (
                    <div className="mt-2 rounded-lg border border-accent bg-blue-900/30 p-3">
                      <h4 className="text-sm font-semibold mb-2">Yeni Ürün Ekle</h4>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium mb-1">Ürün Adı *</label>
                          <input
                            type="text"
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            placeholder="Ürün adı"
                            className="input w-full text-sm"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium mb-1">Ürün Kodu</label>
                            <input
                              type="text"
                              value={newItemCode}
                              onChange={(e) => setNewItemCode(e.target.value)}
                              placeholder="Alfanümerik kod"
                              maxLength={50}
                              className="input w-full text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Stok Adedi</label>
                            <input
                              type="number"
                              value={newItemTotalStock}
                              onChange={(e) => setNewItemTotalStock(e.target.value)}
                              min="0"
                              step="1"
                              placeholder="0"
                              className="input w-full text-sm"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={resetNewItemForm}
                          className="btn-secondary text-xs py-1 px-2"
                          disabled={savingItem}
                        >
                          İptal
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveNewItem}
                          className="btn-primary text-xs py-1 px-2"
                          disabled={savingItem}
                        >
                          {savingItem ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Depo</label>
              {warehousesLoading ? (
                <div className="text-text-secondary text-sm">Yükleniyor...</div>
              ) : (
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : '')}
                  disabled={isReadOnly}
                  className="input w-full"
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
          </div>

          {/* Stok güncelleme bilgi notu */}
          {!isReadOnly && itemId && warehouseId && (
            <div className="rounded-lg bg-green-900/30 border border-green-700/50 p-3 text-sm text-green-300 flex items-start gap-2">
              <span className="shrink-0 mt-0.5">&#9432;</span>
              <span>
                Ürün ve depo seçili olduğundan, fatura kaydedildiğinde <strong>{parseFloat(quantity) || 0} adet</strong> ürün otomatik olarak envanter stokuna ve depo stokuna eklenecektir.
              </span>
            </div>
          )}

          {/* Açıklama */}
          <div>
            <label className="block text-sm font-medium mb-2">Açıklama</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isReadOnly}
              placeholder="Fatura açıklaması (opsiyonel)"
              className="input w-full h-16 resize-none"
            />
          </div>

          {/* Tutar Bilgileri */}
          <div className="border-t border-background-border pt-4">
            <h3 className="text-lg font-semibold mb-4">Tutar Bilgileri</h3>

            {/* Miktar ve Birim Fiyat */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">Miktar *</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={isReadOnly}
                  min="0"
                  step="1"
                  placeholder="1"
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Birim Fiyat *</label>
                <input
                  type="number"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  disabled={isReadOnly}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="input w-full"
                  required
                />
              </div>
            </div>

            {/* İskonto, KDV, Para Birimi, Döviz Kuru */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">İskonto (%)</label>
                <input
                  type="number"
                  value={iskonto}
                  onChange={(e) => setIskonto(e.target.value)}
                  disabled={isReadOnly}
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="0"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">KDV Oranı (%)</label>
                <input
                  type="number"
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                  disabled={isReadOnly}
                  min="0"
                  max="100"
                  step="1"
                  placeholder="20"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Para Birimi</label>
                <select
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value);
                    if (e.target.value === 'TL') setExchangeRate('');
                  }}
                  disabled={isReadOnly}
                  className="input w-full"
                >
                  <option value="TL">TL</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              {currency === 'EUR' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Döviz Kuru</label>
                  <input
                    type="number"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    disabled={isReadOnly}
                    min="0"
                    step="0.0001"
                    placeholder="Kur değeri"
                    className="input w-full"
                  />
                </div>
              )}
            </div>

            {/* Hesaplama Özeti */}
            <div className="mt-4 p-4 bg-background-secondary rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="text-text-secondary">Toplam ({parseFloat(quantity) || 0} x {formatCurrency(parseFloat(unitPrice) || 0)}):</span>
                <span>{formatCurrency(calculations.grossTotal)}</span>
              </div>

              {calculations.discountAmount > 0 && (
                <div className="flex justify-between mb-2 text-red-400">
                  <span>İskonto ({parseFloat(iskonto) || 0}%):</span>
                  <span>-{formatCurrency(calculations.discountAmount)}</span>
                </div>
              )}

              <div className="flex justify-between mb-2 border-t border-background-border pt-2">
                <span className="text-text-secondary">Ara Toplam:</span>
                <span>{formatCurrency(calculations.subtotal)}</span>
              </div>

              <div className="flex justify-between mb-2">
                <span className="text-text-secondary">KDV ({parseFloat(vatRate) || 0}%):</span>
                <span>{formatCurrency(calculations.vatAmount)}</span>
              </div>

              <div className="flex justify-between text-lg font-bold border-t border-background-border pt-2 mt-2">
                <span>Alt Toplam:</span>
                <span className="text-accent">{formatCurrency(calculations.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-6">
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

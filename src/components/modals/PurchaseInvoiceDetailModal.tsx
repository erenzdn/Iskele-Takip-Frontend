import { useState, useEffect, useMemo } from 'react';
import { PurchaseInvoice, Customer } from '../../models';
import { purchaseInvoiceService } from '../../services/purchaseInvoiceService';
import { customerService } from '../../services/customerService';
import { formatCurrency } from '../../utils/formatters';
import ConfirmModal from './ConfirmModal';

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

  // Yeni müşteri ekleme state'leri
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerTaxId, setNewCustomerTaxId] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form alanları
  const [invoiceDate, setInvoiceDate] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [description, setDescription] = useState('');

  // Tutar alanları (tek iskonto, backend ile uyumlu)
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [iskonto, setIskonto] = useState<number>(0);
  const [vatRate, setVatRate] = useState<number>(20);

  // Ön izleme: tek iskonto + KDV (backend hesaplamasına uyum için basit formül)
  const calculations = useMemo(() => {
    const grossTotal = quantity * unitPrice;
    const discountAmount = grossTotal * (iskonto / 100);
    const subtotal = grossTotal - discountAmount;
    const vatAmount = subtotal * (vatRate / 100);
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

    if (invoice) {
      setInvoiceDate(invoice.InvoiceDate.split('T')[0]);
      setEntryDate(invoice.EntryDate.split('T')[0]);
      setCustomerId(invoice.CustomerId);
      setDescription(invoice.Description || '');

      // Backend'den gelen değerleri doğrudan kullan (geri hesaplama yok)
      setIskonto(invoice.Iskonto ?? 0);
      if (invoice.VatRate != null) {
        setVatRate(invoice.VatRate);
      } else if (invoice.Subtotal > 0) {
        setVatRate(Math.round((invoice.VatAmount / invoice.Subtotal) * 100));
      }
      setQuantity(1);
      const iskontoPct = (invoice.Iskonto ?? 0) / 100;
      setUnitPrice(iskontoPct < 1 ? invoice.Subtotal / (1 - iskontoPct) : invoice.Subtotal);
    } else {
      // Yeni fatura için bugünün tarihini varsayılan yap
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

  // Yeni müşteri kaydetme
  const handleSaveNewCustomer = async () => {
    if (!newCustomerName.trim()) {
      alert('Müşteri/Tedarikçi adı zorunludur');
      return;
    }

    try {
      setSavingCustomer(true);
      const result = await customerService.createAsync({
        Name: newCustomerName,
        TaxId: newCustomerTaxId || undefined,
        PhoneNumber: newCustomerPhone || undefined,
        Email: newCustomerEmail || undefined,
        Address: newCustomerAddress || undefined,
      });

      // Müşterileri yeniden yükle ve yeni müşteriyi seç
      await loadCustomers();
      setCustomerId(result.CustomerId);

      // Formu temizle ve kapat
      resetNewCustomerForm();
    } catch (error) {
      console.error('Save customer error:', error);
      alert('Müşteri kaydetme hatası');
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
    if (!invoiceDate) {
      alert('Fatura tarihi zorunludur');
      return;
    }
    if (!entryDate) {
      alert('Giriş tarihi zorunludur');
      return;
    }
    if (!customerId) {
      alert('Tedarikçi seçimi zorunludur');
      return;
    }
    if (quantity <= 0) {
      alert('Miktar 0\'dan büyük olmalıdır');
      return;
    }
    if (unitPrice <= 0) {
      alert('Birim fiyat 0\'dan büyük olmalıdır');
      return;
    }

    try {
      setIsBusy(true);
      const payload = {
        InvoiceDate: new Date(invoiceDate).toISOString(),
        EntryDate: new Date(entryDate).toISOString(),
        CustomerId: Number(customerId),
        Description: description || undefined,
        Subtotal: calculations.subtotal,
        VatAmount: calculations.vatAmount,
        TotalAmount: calculations.totalAmount,
        Iskonto: iskonto,
        VatRate: vatRate,
      };

      if (isNew) {
        await purchaseInvoiceService.createAsync(payload);
      } else if (invoice) {
        await purchaseInvoiceService.updateAsync(invoice.InvoiceId, payload);
      }
      onClose();
    } catch (error) {
      console.error('Save invoice error:', error);
      alert('Kaydetme hatası');
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
      alert('Silme hatası');
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
            <div className="grid grid-cols-4 gap-4 text-sm">
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
          </div>
        )}

        <div className="space-y-4">
          {/* Tarihler */}
          <div className="grid grid-cols-2 gap-4">
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
                  onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
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
                  onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                  disabled={isReadOnly}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="input w-full"
                  required
                />
              </div>
            </div>

            {/* İskonto (tek alan, backend ile uyumlu) */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">İskonto (%)</label>
              <input
                type="number"
                value={iskonto}
                onChange={(e) => setIskonto(parseFloat(e.target.value) || 0)}
                disabled={isReadOnly}
                min="0"
                max="100"
                step="0.01"
                placeholder="0"
                className="input w-32"
              />
            </div>

            {/* KDV Oranı */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">KDV Oranı (%)</label>
              <input
                type="number"
                value={vatRate}
                onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
                disabled={isReadOnly}
                min="0"
                max="100"
                step="1"
                placeholder="20"
                className="input w-32"
              />
            </div>

            {/* Hesaplama Özeti */}
            <div className="mt-4 p-4 bg-background-secondary rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="text-text-secondary">Toplam ({quantity} x {formatCurrency(unitPrice)}):</span>
                <span>{formatCurrency(calculations.grossTotal)}</span>
              </div>

              {calculations.discountAmount > 0 && (
                <div className="flex justify-between mb-2 text-red-400">
                  <span>İskonto ({iskonto}%):</span>
                  <span>-{formatCurrency(calculations.discountAmount)}</span>
                </div>
              )}

              <div className="flex justify-between mb-2 border-t border-background-border pt-2">
                <span className="text-text-secondary">Ara Toplam:</span>
                <span>{formatCurrency(calculations.subtotal)}</span>
              </div>

              <div className="flex justify-between mb-2">
                <span className="text-text-secondary">KDV ({vatRate}%):</span>
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

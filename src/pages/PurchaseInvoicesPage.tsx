import { useState, useEffect } from 'react';
import { purchaseInvoiceService } from '../services/purchaseInvoiceService';
import { PurchaseInvoice } from '../models';
import EmptyState from '../components/EmptyState';
import PurchaseInvoiceDetailModal from '../components/modals/PurchaseInvoiceDetailModal';
import { formatCurrency, formatDate } from '../utils/formatters';

export default function PurchaseInvoicesPage() {
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewInvoice, setIsNewInvoice] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const data = await purchaseInvoiceService.getAllAsync();
      setInvoices(data);
    } catch (error) {
      console.error('Load invoices error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchText.trim()) {
      loadInvoices();
      return;
    }

    try {
      setLoading(true);
      const data = await purchaseInvoiceService.searchAsync(searchText);
      setInvoices(data);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setSelectedInvoice(null);
    setIsNewInvoice(true);
    setIsModalOpen(true);
  };

  const handleOpenDetail = (invoice: PurchaseInvoice) => {
    setSelectedInvoice(invoice);
    setIsNewInvoice(false);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedInvoice(null);
    loadInvoices();
  };

  // Toplam hesaplamaları
  const totalSubtotal = invoices.reduce((sum, inv) => sum + inv.Subtotal, 0);
  const totalVat = invoices.reduce((sum, inv) => sum + inv.VatAmount, 0);
  const totalAmount = invoices.reduce((sum, inv) => sum + inv.TotalAmount, 0);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Alış Faturaları</h1>
          <p className="text-text-secondary">Tedarikçi alış faturalarını yönetin</p>
        </div>
        <button onClick={handleAddNew} className="btn-primary">
          + Yeni Fatura
        </button>
      </div>

      {/* Özet Kartları */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="card p-4">
            <div className="text-text-secondary text-sm mb-1">Toplam Fatura</div>
            <div className="text-2xl font-bold">{invoices.length}</div>
          </div>
          <div className="card p-4">
            <div className="text-text-secondary text-sm mb-1">Ara Toplam</div>
            <div className="text-2xl font-bold">{formatCurrency(totalSubtotal)}</div>
          </div>
          <div className="card p-4">
            <div className="text-text-secondary text-sm mb-1">Toplam KDV</div>
            <div className="text-2xl font-bold">{formatCurrency(totalVat)}</div>
          </div>
          <div className="card p-4">
            <div className="text-text-secondary text-sm mb-1">Genel Toplam</div>
            <div className="text-2xl font-bold text-accent">{formatCurrency(totalAmount)}</div>
          </div>
        </div>
      )}

      <div className="mb-6 flex gap-4">
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Tedarikçi adı, açıklama veya fatura no ile ara..."
          className="input flex-1"
        />
        <button onClick={handleSearch} className="btn-secondary">
          Ara
        </button>
        <button onClick={loadInvoices} className="btn-secondary">
          Yenile
        </button>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon="🧾"
          title="Henüz alış faturası bulunmuyor"
          description="Yeni alış faturası eklemek için yukarıdaki butonu kullanın"
        />
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-background-border">
                  <th className="text-left p-4 font-semibold" style={{ width: '10%' }}>
                    Fatura No
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '12%' }}>
                    Fatura Tarihi
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '20%' }}>
                    Tedarikçi
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '20%' }}>
                    Açıklama
                  </th>
                  <th className="text-right p-4 font-semibold" style={{ width: '12%' }}>
                    Ara Toplam
                  </th>
                  <th className="text-right p-4 font-semibold" style={{ width: '10%' }}>
                    KDV
                  </th>
                  <th className="text-right p-4 font-semibold" style={{ width: '16%' }}>
                    Toplam
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.InvoiceId}
                    className="border-b border-background-border hover:bg-background-hover cursor-pointer"
                    onClick={() => handleOpenDetail(invoice)}
                  >
                    <td className="p-4">
                      <span className="badge bg-blue-600 text-white">
                        #{invoice.InvoiceId}
                      </span>
                    </td>
                    <td className="p-4">{formatDate(invoice.InvoiceDate)}</td>
                    <td className="p-4">
                      <div className="font-medium">{invoice.CustomerName || '-'}</div>
                    </td>
                    <td className="p-4 opacity-80">
                      {invoice.Description || '-'}
                    </td>
                    <td className="p-4 text-right">{formatCurrency(invoice.Subtotal)}</td>
                    <td className="p-4 text-right text-text-secondary">
                      {formatCurrency(invoice.VatAmount)}
                    </td>
                    <td className="p-4 text-right font-semibold text-accent">
                      {formatCurrency(invoice.TotalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <PurchaseInvoiceDetailModal
          invoice={selectedInvoice}
          isNew={isNewInvoice}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ReceiptIcon } from '@phosphor-icons/react';
import { purchaseInvoiceService } from '../services/purchaseInvoiceService';
import { PurchaseInvoice } from '../models';
import EmptyState from '../components/EmptyState';
import PurchaseInvoiceDetailModal from '../components/modals/PurchaseInvoiceDetailModal';
import { formatCurrency, formatDate, formatShortDateTime } from '../utils/formatters';
import { useHeaderActions } from '../layouts/HeaderActionsContext';

export default function PurchaseInvoicesPage() {
  const { setActions } = useHeaderActions();
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewInvoice, setIsNewInvoice] = useState(false);

  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const data = await purchaseInvoiceService.getAllAsync();
      setInvoices(data);
    } catch (error) {
      console.error('Load invoices error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  const handleSearch = useCallback(async () => {
    if (!searchText.trim()) {
      await loadInvoices();
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
  }, [searchText, loadInvoices]);

  const handleAddNew = useCallback(() => {
    setSelectedInvoice(null);
    setIsNewInvoice(true);
    setIsModalOpen(true);
  }, []);

  const headerActions = useMemo(
    () => (
      <>
        <button onClick={() => void loadInvoices()} className="btn-secondary py-2 px-3 text-sm">
          Yenile
        </button>
        <button onClick={handleAddNew} className="btn-primary py-2 px-3 text-sm">
          + Yeni Fatura
        </button>
      </>
    ),
    [loadInvoices, handleAddNew]
  );

  useEffect(() => {
    setActions(headerActions);
    return () => setActions(null);
  }, [headerActions, setActions]);

  const handleOpenDetail = (invoice: PurchaseInvoice) => {
    setSelectedInvoice(invoice);
    setIsNewInvoice(false);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedInvoice(null);
    void loadInvoices();
  };

  const totalSubtotal = invoices.reduce((sum, inv) => sum + inv.Subtotal, 0);
  const totalVat = invoices.reduce((sum, inv) => sum + inv.VatAmount, 0);
  const totalAmount = invoices.reduce((sum, inv) => sum + inv.TotalAmount, 0);

  if (loading && invoices.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 rounded border border-background-border bg-background-panel p-1.5 flex flex-wrap items-center gap-1.5">
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
          placeholder="Tedarikçi, açıklama, evrak no, ürün veya depo..."
          className="input flex-1 min-w-[200px] py-1.5 px-3 text-sm"
        />
        <button onClick={() => void handleSearch()} className="btn-secondary py-1.5 px-3 text-sm">
          Ara
        </button>
        {invoices.length > 0 && (
          <>
            <span className="text-xs text-text-secondary whitespace-nowrap">
              {invoices.length} fatura
            </span>
            <span className="text-xs text-text-secondary whitespace-nowrap">
              Ara: <strong className="text-text-primary">{formatCurrency(totalSubtotal)}</strong>
            </span>
            <span className="text-xs text-text-secondary whitespace-nowrap">
              KDV: <strong className="text-text-primary">{formatCurrency(totalVat)}</strong>
            </span>
            <span className="text-xs text-text-secondary whitespace-nowrap">
              Toplam: <strong className="text-accent">{formatCurrency(totalAmount)}</strong>
            </span>
          </>
        )}
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          icon={<ReceiptIcon size={48} weight="duotone" />}
          title="Henüz alış faturası bulunmuyor"
          description="Yeni alış faturası eklemek için yukarıdaki butonu kullanın"
        />
      ) : (
        <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
          <div className="overflow-auto max-h-[calc(100vh-150px)] min-h-[280px]">
            <table className="w-full text-xs border-collapse text-text-primary">
              <thead className="sticky top-0 z-10 border-b border-background-border">
                <tr>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Fatura No</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Evrak No</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Tarih</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Tedarikçi</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Ürün</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Depo</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Açıklama</th>
                  <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Ara Toplam</th>
                  <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">KDV</th>
                  <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Toplam</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">Kayıt Bilgisi</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice, index) => (
                  <tr
                    key={invoice.InvoiceId}
                    className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${index % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'}`}
                    onClick={() => handleOpenDetail(invoice)}
                  >
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                      <span className="font-medium text-primary">#{invoice.InvoiceId}</span>
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-secondary">{invoice.DocumentNo || '-'}</td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">{formatDate(invoice.InvoiceDate)}</td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 font-medium text-text-primary">{invoice.CustomerName || '-'}</td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">{invoice.ItemName || '-'}</td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">{invoice.WarehouseName || '-'}</td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-secondary opacity-90">{invoice.Description || '-'}</td>
                    <td className="py-0.5 px-2 text-right align-middle border-r border-background-border/60 last:border-r-0">{formatCurrency(invoice.Subtotal)}</td>
                    <td className="py-0.5 px-2 text-right align-middle border-r border-background-border/60 last:border-r-0 text-text-secondary">{formatCurrency(invoice.VatAmount)}</td>
                    <td className="py-0.5 px-2 text-right align-middle border-r border-background-border/60 last:border-r-0 font-medium text-accent">
                      {formatCurrency(invoice.TotalAmount)}
                      {invoice.Currency && invoice.Currency !== 'TL' && (
                        <span className="ml-1 text-text-secondary text-[10px]">({invoice.Currency})</span>
                      )}
                    </td>
                    <td className="py-0.5 px-2 align-middle text-text-secondary">{invoice.CreatedByUserFullName || invoice.CreatedByUserName || '-'} • {formatShortDateTime(invoice.CreatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex items-center justify-between shrink-0">
            <span>Toplam: {invoices.length} fatura</span>
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

import { useState, useEffect, useCallback } from 'react';
import { ReceiptIcon } from '@phosphor-icons/react';
import { stockReceiptService, StockReceiptListParams } from '../services/stockReceiptService';
import { warehouseService } from '../services/warehouseService';
import { StockReceipt, ReceiptType, StockReceiptStatus, Warehouse } from '../models';
import { useAuthStore } from '../store/authStore';
import EmptyState from '../components/EmptyState';
import StockReceiptDetailModal from '../components/modals/StockReceiptDetailModal';
import { formatShortDateTime } from '../utils/formatters';

const RECEIPT_TYPE_LABELS: Record<ReceiptType, string> = {
  IN: 'Giriş',
  OUT: 'Çıkış',
  CONSUMPTION: 'Sarf/Fire',
  TRANSFER: 'Transfer',
};

const STATUS_LABELS: Record<StockReceiptStatus, string> = {
  ACTIVE: 'Aktif',
  CANCELLED: 'İptal',
};

export default function StockReceiptsPage() {
  const user = useAuthStore((state) => state.user);
  const canView = user?.Permissions?.includes('stockReceipts_view');
  const canCreate = user?.Permissions?.includes('stockReceipts_create');

  const [receipts, setReceipts] = useState<StockReceipt[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState<StockReceipt | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewReceipt, setIsNewReceipt] = useState(false);

  const [filterWarehouseId, setFilterWarehouseId] = useState<number | ''>('');
  const [filterReceiptType, setFilterReceiptType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const loadWarehouses = useCallback(async () => {
    try {
      const list = await warehouseService.getAllAsync();
      setWarehouses(list ?? []);
    } catch {
      setWarehouses([]);
    }
  }, []);

  const loadReceipts = useCallback(async () => {
    if (!canView) return;
    try {
      setLoading(true);
      const params: StockReceiptListParams = {};
      if (filterWarehouseId !== '') params.warehouseId = filterWarehouseId;
      if (filterReceiptType) params.receiptType = filterReceiptType;
      if (filterStatus) params.status = filterStatus;
      if (filterDateFrom) params.dateFrom = filterDateFrom;
      if (filterDateTo) params.dateTo = filterDateTo;
      params.limit = 500;
      const data = await stockReceiptService.getAllAsync(params);
      setReceipts(data ?? []);
    } catch (error) {
      console.error('Load stock receipts error:', error);
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, [canView, filterWarehouseId, filterReceiptType, filterStatus, filterDateFrom, filterDateTo]);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  const handleApplyFilters = () => {
    loadReceipts();
  };

  const handleClearFilters = () => {
    setFilterWarehouseId('');
    setFilterReceiptType('');
    setFilterStatus('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  const handleAddNew = () => {
    setSelectedReceipt(null);
    setIsNewReceipt(true);
    setIsModalOpen(true);
  };

  const handleOpenDetail = (receipt: StockReceipt) => {
    setSelectedReceipt(receipt);
    setIsNewReceipt(false);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedReceipt(null);
    loadReceipts();
  };

  if (!canView) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-text-secondary">Bu sayfayı görüntüleme yetkiniz yok.</div>
      </div>
    );
  }

  if (loading && receipts.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Stok Fişleri</h1>
        <div className="flex items-center gap-2">
          <button onClick={loadReceipts} className="btn-secondary py-2 px-3 text-sm">
            Yenile
          </button>
          {canCreate && (
            <button onClick={handleAddNew} className="btn-primary py-2 px-3 text-sm">
              + Yeni Fiş
            </button>
          )}
        </div>
      </div>

      <div className="mb-3 rounded border border-background-border bg-background-panel p-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-secondary whitespace-nowrap">Depo:</span>
        <select
          value={filterWarehouseId}
          onChange={(e) => setFilterWarehouseId(e.target.value === '' ? '' : Number(e.target.value))}
          className="input py-2 px-3 text-sm min-w-[140px]"
        >
          <option value="">Tümü</option>
          {warehouses.map((w) => (
            <option key={w.WarehouseId} value={w.WarehouseId}>
              {w.WarehouseName}
            </option>
          ))}
        </select>
        <span className="text-xs text-text-secondary whitespace-nowrap">İşlem tipi:</span>
        <select
          value={filterReceiptType}
          onChange={(e) => setFilterReceiptType(e.target.value)}
          className="input py-2 px-3 text-sm min-w-[120px]"
        >
          <option value="">Tümü</option>
          <option value="IN">Giriş</option>
          <option value="OUT">Çıkış</option>
          <option value="CONSUMPTION">Sarf/Fire</option>
          <option value="TRANSFER">Transfer</option>
        </select>
        <span className="text-xs text-text-secondary whitespace-nowrap">Durum:</span>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input py-2 px-3 text-sm min-w-[100px]"
        >
          <option value="">Tümü</option>
          <option value="ACTIVE">Aktif</option>
          <option value="CANCELLED">İptal</option>
        </select>
        <span className="text-xs text-text-secondary whitespace-nowrap">Tarih:</span>
        <input
          type="date"
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          className="input py-2 px-3 text-sm w-[130px]"
        />
        <span className="text-text-secondary">-</span>
        <input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          className="input py-2 px-3 text-sm w-[130px]"
        />
        <button onClick={handleApplyFilters} className="btn-secondary py-2 px-3 text-sm">
          Filtrele
        </button>
        <button onClick={handleClearFilters} className="btn-secondary py-2 px-3 text-sm">
          Temizle
        </button>
      </div>

      {receipts.length === 0 ? (
        <EmptyState
          icon={<ReceiptIcon size={48} weight="duotone" />}
          title="Henüz stok fişi bulunmuyor"
          description="Yeni stok fişi eklemek için yukarıdaki butonu kullanın"
        />
      ) : (
        <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
          <div className="overflow-auto max-h-[calc(100vh-280px)] min-h-[280px]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 border-b border-background-border">
                <tr>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    Fiş No
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    İşlem Tipi
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    Depo
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    Hedef Depo
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    Açıklama
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    Durum
                  </th>
                  <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    Kalem
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    Oluşturan
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">
                    Tarih
                  </th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt, index) => (
                  <tr
                    key={receipt.ReceiptId}
                    className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${
                      index % 2 === 0 ? 'bg-background-panel' : 'bg-[#16162e]'
                    }`}
                    onClick={() => handleOpenDetail(receipt)}
                  >
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                      <span className="font-medium text-primary">{receipt.ReceiptNo}</span>
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                      {RECEIPT_TYPE_LABELS[receipt.ReceiptType]}
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                      {receipt.WarehouseName ?? '-'}
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                      {receipt.TargetWarehouseName ?? '-'}
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-secondary max-w-[180px] truncate">
                      {receipt.Description || '-'}
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                      {STATUS_LABELS[receipt.Status]}
                    </td>
                    <td className="py-0.5 px-2 text-right align-middle border-r border-background-border/60 last:border-r-0">
                      {receipt.ItemCount ?? 0}
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-secondary">
                      {receipt.CreatedByName ?? '-'}
                    </td>
                    <td className="py-0.5 px-2 align-middle text-text-secondary">
                      {formatShortDateTime(receipt.CreatedAt ?? null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex items-center justify-between shrink-0">
            <span>Toplam: {receipts.length} fiş</span>
          </div>
        </div>
      )}

      {isModalOpen && (
        <StockReceiptDetailModal
          receipt={selectedReceipt}
          isNew={isNewReceipt}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}

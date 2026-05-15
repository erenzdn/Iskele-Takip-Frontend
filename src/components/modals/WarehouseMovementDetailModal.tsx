import { createPortal } from 'react-dom';
import { XIcon, PackageIcon, FileTextIcon, UserIcon, BuildingsIcon } from '@phosphor-icons/react';
import { WarehouseMovementRow, resolveContractQuoteType } from '../../models';

interface WarehouseMovementDetailModalProps {
  row: WarehouseMovementRow | null;
  onClose: () => void;
  onOpenContract: (row: WarehouseMovementRow) => void;
  onOpenCustomer: (row: WarehouseMovementRow) => void;
  onOpenItem: (row: WarehouseMovementRow) => void;
}

export default function WarehouseMovementDetailModal({
  row,
  onClose,
  onOpenContract,
  onOpenCustomer,
  onOpenItem,
}: WarehouseMovementDetailModalProps) {
  if (!row) return null;

  const returned = row.totals?.returned ?? 0;
  const stillOut = row.totals?.stillOut ?? 0;
  const isCompleted = Boolean(row.contract?.isCompleted);
  const contractType = resolveContractQuoteType({ Type: row.contract?.Type });

  const formatInt = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString('tr-TR');
  const formatDateTr = (s: string | null | undefined) => {
    if (!s) return '-';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(val);
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex flex-col bg-background-main animate-fadeIn">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-6 py-4 bg-background-panel border-b border-background-border shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-xl font-semibold text-text-primary tracking-tight truncate">
            {row.item?.ItemName ?? 'Ürün'} Hareket Dökümü
          </h1>
          <span className="text-sm text-text-secondary font-mono">
            {row.item?.ItemCode ? `(${row.item.ItemCode})` : ''}
          </span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${isCompleted ? 'bg-gray-700 text-gray-100' : 'bg-green-700 text-green-100'}`}>
            {isCompleted ? 'Tamamlandı' : 'Aktif'}
          </span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${contractType === 'SALE' ? 'bg-orange-700 text-orange-100' : 'bg-blue-700 text-blue-100'}`}>
            {contractType === 'SALE' ? 'Satış' : 'Kiralama'}
          </span>
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

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-panel border border-background-border bg-background-panel p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center gap-2 text-text-secondary mb-2">
              <FileTextIcon size={18} />
              <span className="text-xs font-medium">Sözleşme</span>
            </div>
            <div>
              <button
                type="button"
                onClick={() => onOpenContract(row)}
                className="text-lg font-semibold text-primary hover:underline text-left"
              >
                {row.contract?.ContractCode ?? `#${row.contract?.ContractId ?? '-'}`}
              </button>
            </div>
          </div>

          <div className="rounded-panel border border-background-border bg-background-panel p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center gap-2 text-text-secondary mb-2">
              <PackageIcon size={18} />
              <span className="text-xs font-medium">Ürün Detayı</span>
            </div>
            <div>
              <button
                type="button"
                onClick={() => onOpenItem(row)}
                className="text-lg font-semibold text-primary hover:underline text-left truncate block w-full"
              >
                {row.item?.ItemName ?? '—'}
              </button>
            </div>
          </div>

          <div className="rounded-panel border border-background-border bg-background-panel p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center gap-2 text-text-secondary mb-2">
              <UserIcon size={18} />
              <span className="text-xs font-medium">Müşteri</span>
            </div>
            <div>
              <button
                type="button"
                onClick={() => onOpenCustomer(row)}
                className="text-lg font-semibold text-primary hover:underline text-left truncate block w-full"
              >
                {row.customer?.CustomerName ?? '—'}
              </button>
            </div>
          </div>

          <div className="rounded-panel border border-background-border bg-background-panel p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center gap-2 text-text-secondary mb-2">
              <BuildingsIcon size={18} />
              <span className="text-xs font-medium">Şantiye</span>
            </div>
            <div className="text-lg font-semibold text-text-primary truncate">
              {row.site?.SiteName ?? '-'}
            </div>
          </div>
        </div>

        {/* Quantities & Dates Overview */}
        <div className="rounded-panel border border-background-border bg-background-panel p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
            Çıkış ve Miktar Özeti
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-sm">
            <div>
              <div className="text-xs text-text-secondary mb-1">Çıkış Tarihi</div>
              <div className="font-semibold text-text-primary text-base">
                {formatDateTr(row.dispatch?.dispatchDate)}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-secondary mb-1">Çıkış Miktarı</div>
              <div className="font-semibold text-text-primary text-lg tabular-nums">
                {formatInt(row.dispatch?.rentedQuantity ?? 0)}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-secondary mb-1">İade Edilen</div>
              <div className="font-semibold text-green-500 text-lg tabular-nums">
                {formatInt(returned)}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-secondary mb-1">Şu An Dışarıda (Kalan)</div>
              <div className="font-semibold text-orange-400 text-lg tabular-nums">
                {stillOut <= 0 ? (
                  <span className="text-green-400 font-medium">✓ 0</span>
                ) : (
                  formatInt(stillOut)
                )}
              </div>
            </div>
            <div className="col-span-2 md:col-span-1 border-t md:border-t-0 pt-2 md:pt-0 border-background-border">
              <div className="text-xs text-text-secondary mb-1">Planlanan / Gerçek Bitiş</div>
              <div className="text-xs text-text-primary space-y-0.5">
                <div>Planlanan: {row.dispatch?.plannedEndDate ? formatDateTr(row.dispatch.plannedEndDate) : '-'}</div>
                <div>Gerçek: {row.dispatch?.actualEndDate ? formatDateTr(row.dispatch.actualEndDate) : '-'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Returns Table */}
        <div className="rounded-panel border border-background-border bg-background-panel overflow-hidden shadow-sm flex flex-col">
          <div className="p-4 bg-background-surface border-b border-background-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
              İade ve Hareket Dökümü
            </h3>
            <span className="text-xs text-text-secondary">
              Toplam {(row.returns ?? []).length} iade kaydı
            </span>
          </div>

          {(row.returns ?? []).length === 0 ? (
            <div className="p-12 text-center text-sm text-text-secondary">
              Bu çıkış satırı için henüz herhangi bir iade işlemi gerçekleştirilmemiş.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse text-left">
                <thead className="bg-background-hover/50 text-xs text-text-secondary uppercase tracking-wider border-b border-background-border">
                  <tr>
                    <th className="py-3 px-4 font-medium">İade Tarihi</th>
                    <th className="py-3 px-4 font-medium text-right">Miktar</th>
                    <th className="py-3 px-4 font-medium">Hedef Depo</th>
                    <th className="py-3 px-4 font-medium text-right">Gecikme</th>
                    <th className="py-3 px-4 font-medium text-right">Gecikme Ücreti</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-background-border/60">
                  {row.returns.map((r) => {
                    const lateDays = r.LateDays ?? 0;
                    const lateFee = r.LateFee ?? 0;
                    const lateCls = lateDays > 0 ? 'text-amber-300 font-medium' : 'text-text-primary';
                    return (
                      <tr key={r.ReturnId} className="hover:bg-background-hover/40 transition-colors">
                        <td className="py-3 px-4 text-text-primary font-medium">
                          {formatDateTr(r.ReturnDate)}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-text-primary tabular-nums">
                          {formatInt(r.ReturnQuantity)}
                        </td>
                        <td className="py-3 px-4 text-text-secondary">
                          {r.returnWarehouseName || '-'}
                        </td>
                        <td className={`py-3 px-4 text-right tabular-nums ${lateCls}`}>
                          {lateDays > 0 ? `${formatInt(lateDays)} gün` : '0 gün'}
                        </td>
                        <td className={`py-3 px-4 text-right tabular-nums ${lateCls}`}>
                          {lateFee > 0 ? formatMoney(lateFee) : formatMoney(0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
}

import { useEffect, useMemo, useState } from 'react';
import { CalendarBlankIcon, FunnelSimpleIcon, NotePencilIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { checkService } from '../services/checkService';
import { Check, CheckFilters, CheckStatus, Customer } from '../models';
import EmptyState from '../components/EmptyState';
import { toast } from '../hooks/useToast';
import { useAuthStore } from '../store/authStore';
import ConfirmModal from '../components/modals/ConfirmModal';
import { customerService } from '../services/customerService';
import CheckDetailModal from '../components/modals/CheckDetailModal';
import ExcelManager from '../components/ExcelManager';

type DateRange = {
  from: string | null;
  to: string | null;
};

const STATUS_LABELS: Record<CheckStatus, string> = {
  PORTFOLIO: 'Portföyde',
  CASHED: 'Tahsil Edildi',
  RETURNED: 'İade Edildi',
  CANCELLED: 'İptal',
};

export default function ChecksPage() {
  const user = useAuthStore((state) => state.user);
  const permissions = user?.permissions ?? [];

  const canCreate = permissions.includes('checks_create');
  const canUpdate = permissions.includes('checks_update');
  const canDelete = permissions.includes('checks_delete');

  const [checks, setChecks] = useState<Check[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedStatus, setSelectedStatus] = useState<CheckStatus | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [editingCheck, setEditingCheck] = useState<Check | null>(null);
  const [isNew, setIsNew] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Check | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const filters: CheckFilters = useMemo(
    () => ({
      customerId: selectedCustomer?.CustomerId,
      status: selectedStatus ?? undefined,
      dateFrom: dateRange.from ?? undefined,
      dateTo: dateRange.to ?? undefined,
    }),
    [selectedCustomer, selectedStatus, dateRange]
  );

  useEffect(() => {
    loadData();
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.customerId, filters.status, filters.dateFrom, filters.dateTo]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await checkService.getAllAsync(filters);
      setChecks(data);
    } catch (e) {
      console.error('Load checks error:', e);
      setError('Çekler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    try {
      const data = await customerService.getAllAsync();
      setCustomers(data);
    } catch (e) {
      console.error('Load customers error (checks page):', e);
    }
  };

  const handleNewCheck = () => {
    if (!canCreate) return;
    setEditingCheck(null);
    setIsNew(true);
    setIsDetailOpen(true);
  };

  const handleEditCheck = (check: Check) => {
    setEditingCheck(check);
    setIsNew(false);
    setIsDetailOpen(true);
  };

  const handleDetailClose = (reload?: boolean) => {
    setIsDetailOpen(false);
    setEditingCheck(null);
    if (reload) {
      loadData();
    }
  };

  const handleDeleteClick = (check: Check) => {
    if (!canDelete) return;
    setDeleteTarget(check);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteBusy(true);
      await checkService.deleteAsync(deleteTarget.CheckId!);
      setDeleteTarget(null);
      await loadData();
    } catch (e) {
      console.error('Delete check error:', e);
      toast.error('Çek silinirken bir hata oluştu');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handlePdf = async (check: Check) => {
    try {
      await checkService.downloadPdfAsync(check.CheckId!);
    } catch (e) {
      console.error('Download check PDF error:', e);
      toast.error('PDF oluşturulurken hata oluştu');
    }
  };

  const handleQuickDateRange = (type: 'thisMonth' | 'thisQuarter' | 'clear') => {
    if (type === 'clear') {
      setDateRange({ from: null, to: null });
      return;
    }

    const now = new Date();
    if (type === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setDateRange({
        from: start.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10),
      });
    } else if (type === 'thisQuarter') {
      const quarter = Math.floor(now.getMonth() / 3);
      const startMonth = quarter * 3;
      const start = new Date(now.getFullYear(), startMonth, 1);
      const end = new Date(now.getFullYear(), startMonth + 3, 0);
      setDateRange({
        from: start.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10),
      });
    }
  };

  const getStatusBadgeClass = (status?: CheckStatus) => {
    const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium';
    switch (status) {
      case 'CASHED':
        return `${base} bg-green-600/30 text-green-300 border border-green-500/60`;
      case 'RETURNED':
        return `${base} bg-yellow-600/30 text-yellow-200 border border-yellow-500/60`;
      case 'CANCELLED':
        return `${base} bg-red-700/40 text-red-200 border border-red-500/60`;
      case 'PORTFOLIO':
      default:
        return `${base} bg-blue-700/40 text-blue-200 border border-blue-500/60`;
    }
  };

  const isDueSoon = (dueDateStr?: string | null) => {
    if (!dueDateStr) return false;
    const due = new Date(dueDateStr);
    const today = new Date();
    const diffMs = due.getTime() - today.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 3;
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-text-secondary">Çekler yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Çekler</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Vadesi yaklaşan ve tahsil edilmiş çekleri buradan izleyebilirsiniz.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="btn-secondary py-2 px-3 text-sm"
          >
            Yenile
          </button>
          <ExcelManager type="checks" onImportSuccess={() => void loadData()} />
          {canCreate && (
            <button
              type="button"
              onClick={handleNewCheck}
              className="btn-primary py-2 px-3 text-sm inline-flex items-center gap-1.5"
            >
              <PlusIcon size={16} weight="bold" />
              Yeni Çek
            </button>
          )}
        </div>
      </div>

      <div className="mb-3 rounded-panel border border-background-border bg-background-panel p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <FunnelSimpleIcon size={14} className="text-text-secondary" />
          <span>Filtreler</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[220px]">
            <select
              className="input py-1.5 px-2 text-sm w-full"
              value={selectedCustomer?.CustomerId ?? ''}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                const customer = customers.find((c) => c.CustomerId === id) ?? null;
                setSelectedCustomer(customer);
              }}
            >
              <option value="">Tüm Müşteriler</option>
              {customers.map((c) => (
                <option key={c.CustomerId} value={c.CustomerId}>
                  {c.Name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectedStatus(null)}
              className={`px-2.5 py-1.5 rounded-full text-[11px] border ${
                selectedStatus === null
                  ? 'bg-accent text-white border-accent'
                  : 'bg-transparent text-text-secondary border-background-border hover:border-accent/60 hover:text-text-primary'
              }`}
            >
              Tüm Durumlar
            </button>
            {(['PORTFOLIO', 'CASHED', 'RETURNED', 'CANCELLED'] as CheckStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSelectedStatus(s)}
                className={`px-2.5 py-1.5 rounded-full text-[11px] border ${
                  selectedStatus === s
                    ? 'bg-accent text-white border-accent'
                    : 'bg-transparent text-text-secondary border-background-border hover:border-accent/60 hover:text-text-primary'
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <CalendarBlankIcon size={14} className="text-text-secondary" />
            <input
              type="date"
              className="input py-1 px-2 text-xs"
              value={dateRange.from ?? ''}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, from: e.target.value || null }))
              }
            />
            <span className="text-text-secondary">-</span>
            <input
              type="date"
              className="input py-1 px-2 text-xs"
              value={dateRange.to ?? ''}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, to: e.target.value || null }))
              }
            />
            <button
              type="button"
              onClick={() => handleQuickDateRange('thisMonth')}
              className="btn-secondary py-1 px-2 text-[11px]"
            >
              Bu Ay
            </button>
            <button
              type="button"
              onClick={() => handleQuickDateRange('thisQuarter')}
              className="btn-secondary py-1 px-2 text-[11px]"
            >
              Bu Çeyrek
            </button>
            <button
              type="button"
              onClick={() => handleQuickDateRange('clear')}
              className="btn-secondary py-1 px-2 text-[11px]"
            >
              Temizle
            </button>
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-400 border border-red-700 rounded-md px-2 py-1">
            {error}
          </div>
        )}
      </div>

      {checks.length === 0 ? (
        <EmptyState
          icon={<NotePencilIcon size={40} weight="duotone" />}
          title="Henüz çek kaydı yok"
          description={
            canCreate
              ? 'İlk çek kaydınızı oluşturmak için sağ üstten \"Yeni Çek\" butonunu kullanabilirsiniz.'
              : 'Sistemde henüz çek kaydı bulunmuyor.'
          }
        />
      ) : (
        <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
          <div className="overflow-auto max-h-[calc(100vh-260px)] min-h-[320px]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 border-b border-background-border bg-background-hover">
                <tr>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border">
                    Banka / Şube
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border">
                    Çek No
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border">
                    Müşteri
                  </th>
                  <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border">
                    Tutar
                  </th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border">
                    Keside Tarihi
                  </th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border">
                    Vade Tarihi
                  </th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border">
                    Durum
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap">
                    İşlemler
                  </th>
                </tr>
              </thead>
              <tbody>
                {checks.map((check) => {
                  const status = check.Status ?? 'PORTFOLIO';
                  const dueSoon = isDueSoon(check.DueDate);
                  return (
                    <tr
                      key={check.CheckId}
                      className={`border-b border-background-border hover:bg-background-hover/70 ${
                        dueSoon ? 'bg-yellow-900/20' : ''
                      }`}
                    >
                      <td className="py-1 px-2 align-middle border-r border-background-border/60">
                        <div className="flex flex-col">
                          <span className="font-medium text-text-primary">{check.BankName}</span>
                          {check.BranchName && (
                            <span className="text-[11px] text-text-secondary">
                              {check.BranchName}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-1 px-2 align-middle border-r border-background-border/60">
                        <span className="font-mono text-sm bg-accent/10 text-accent px-1.5 py-0.5 rounded">
                          {check.CheckNumber}
                        </span>
                      </td>
                      <td className="py-1 px-2 align-middle border-r border-background-border/60">
                        <span className="text-xs text-text-primary">
                          {check.CustomerName || '-'}
                        </span>
                      </td>
                      <td className="py-1 px-2 align-middle text-right border-r border-background-border/60 tabular-nums">
                        <span className="font-semibold text-text-primary">
                          {check.Amount.toLocaleString('tr-TR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          <span className="text-text-secondary text-[11px]">
                            {check.Currency || 'TRY'}
                          </span>
                        </span>
                      </td>
                      <td className="py-1 px-2 align-middle text-center border-r border-background-border/60">
                        <span className="text-xs text-text-secondary">
                          {check.IssueDate
                            ? new Date(check.IssueDate).toLocaleDateString('tr-TR')
                            : '-'}
                        </span>
                      </td>
                      <td className="py-1 px-2 align-middle text-center border-r border-background-border/60">
                        <span
                          className={`text-xs ${
                            dueSoon ? 'text-yellow-300 font-semibold' : 'text-text-secondary'
                          }`}
                        >
                          {check.DueDate
                            ? new Date(check.DueDate).toLocaleDateString('tr-TR')
                            : '-'}
                        </span>
                      </td>
                      <td className="py-1 px-2 align-middle text-center border-r border-background-border/60">
                        <span className={getStatusBadgeClass(status)}>
                          {check.StatusLabel || STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td className="py-1 px-2 align-middle">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEditCheck(check)}
                            className="btn-secondary px-2 py-1 text-[11px] inline-flex items-center gap-1"
                          >
                            <NotePencilIcon size={14} />
                            {canUpdate ? 'Detay / Düzenle' : 'Detay'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePdf(check)}
                            className="btn-secondary px-2 py-1 text-[11px]"
                          >
                            PDF
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteClick(check)}
                              className="btn-danger px-2 py-1 text-[11px] inline-flex items-center gap-1"
                            >
                              <TrashIcon size={14} />
                              Sil
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex items-center justify-between shrink-0">
            <span>Toplam: {checks.length} çek</span>
            <span className="text-text-secondary/80">
              Vadesine 3 günden az kalan çekler sarı ile vurgulanır.
            </span>
          </div>
        </div>
      )}

      {isDetailOpen && (
        <CheckDetailModal
          check={editingCheck}
          isNew={isNew}
          canEdit={isNew ? canCreate : canUpdate}
          onClose={handleDetailClose}
        />
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Çeki silmek istiyor musunuz?"
        message={
          deleteTarget
            ? `${deleteTarget.BankName} bankasına ait ${deleteTarget.CheckNumber} numaralı çeki silmek üzeresiniz.`
            : ''
        }
        variant="danger"
        loading={deleteBusy}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}


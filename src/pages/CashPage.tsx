import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarBlankIcon,
  CheckIcon,
  FileTextIcon,
  FunnelSimpleIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { CashAccount, CashTransaction, ListTransactionsParams } from '../models';
import { useAuthStore } from '../store/authStore';
import ConfirmModal from '../components/modals/ConfirmModal';
import CashTransactionModal from '../components/modals/CashTransactionModal';
import CashAccountModal from '../components/modals/CashAccountModal';
import EmptyState from '../components/EmptyState';
import { cashService } from '../services/cashService';
import { getApiErrorMessage } from '../utils/apiError';
import { toast } from '../hooks/useToast';

const LIMIT = 20;

const STATUS_OPTIONS: CashTransaction['status'][] = ['DRAFT', 'APPROVED', 'CANCELLED'];

const STATUS_LABELS: Record<CashTransaction['status'], string> = {
  DRAFT: 'Taslak',
  APPROVED: 'Onaylandı',
  CANCELLED: 'İptal Edildi',
};

const TYPE_OPTIONS: CashTransaction['type'][] = [
  'TAHSILAT',
  'ODEME',
  'VIRMAN',
  'MASRAF',
  'GELIR',
  'DOVIZ_TAKAS',
];

const TYPE_LABELS: Record<CashTransaction['type'], string> = {
  TAHSILAT: 'Tahsilat',
  ODEME: 'Ödeme',
  VIRMAN: 'Virman',
  MASRAF: 'Masraf',
  GELIR: 'Gelir',
  DOVIZ_TAKAS: 'Döviz Takas',
};

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('tr-TR');
}

function formatAmount(amount: number) {
  return amount.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getStatusBadgeClass(status: CashTransaction['status']) {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border';
  switch (status) {
    case 'DRAFT':
      return `${base} bg-yellow-600/30 text-yellow-200 border-yellow-500/60`;
    case 'APPROVED':
      return `${base} bg-green-600/30 text-green-200 border-green-500/60`;
    case 'CANCELLED':
      return `${base} bg-red-700/40 text-red-200 border-red-500/60`;
    default:
      return base;
  }
}

export default function CashPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const permissions = user?.permissions ?? [];

  const canCreate = permissions.includes('cash_create');
  const canCreateAccount = permissions.includes('cash_account_create');
  const canApprove = permissions.includes('cash_approve');
  const canCancel = permissions.includes('cash_cancel');
  const canDelete = permissions.includes('cash_delete');

  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [offset, setOffset] = useState(0);
  const [selectedStatus, setSelectedStatus] = useState<CashTransaction['status'] | ''>('');
  const [selectedType, setSelectedType] = useState<CashTransaction['type'] | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Kasa/Banka grupları (accordion); hesap detayı ayrı sayfada: /cash/accounts/:accountId
  const [expandedSections, setExpandedSections] = useState<{ CASH: boolean; BANK: boolean }>({
    CASH: true,
    BANK: true,
  });

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<CashAccount | null>(null);
  const [isNewAccount, setIsNewAccount] = useState(false);

  const [approveTarget, setApproveTarget] = useState<CashTransaction | null>(null);
  const [approveBusy, setApproveBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CashTransaction | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<CashTransaction | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonError, setCancelReasonError] = useState<string | null>(null);
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);

  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);

  const cashAccounts = useMemo(() => accounts.filter((a) => a.type === 'CASH'), [accounts]);
  const bankAccounts = useMemo(() => accounts.filter((a) => a.type === 'BANK'), [accounts]);

  const handleToggleSection = (type: 'CASH' | 'BANK') => {
    const willOpen = !expandedSections[type];
    setExpandedSections((prev) => ({ ...prev, [type]: willOpen }));
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params: ListTransactionsParams = {
        limit: LIMIT,
        offset,
      };

      if (selectedStatus) params.status = selectedStatus;
      if (selectedType) params.type = selectedType;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;

      const resp = await cashService.listAsync(params);
      setTransactions(resp.items ?? []);
      setTotal(resp.total ?? 0);
    } catch (e: unknown) {
      console.error('Load cash transactions error:', e);
      setError(getApiErrorMessage(e));
      setTransactions([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, offset, selectedStatus, selectedType]);

  const loadAccounts = useCallback(async () => {
    try {
      setAccountsLoading(true);
      setAccountsError(null);
      const list = await cashService.listAccountsAsync();
      setAccounts(list ?? []);
    } catch (e: unknown) {
      console.error('Load cash accounts error:', e);
      setAccounts([]);
      setAccountsError(getApiErrorMessage(e) || 'Hesaplar yüklenemedi');
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const hasPrev = offset > 0;
  const hasNext = offset + LIMIT < total;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const currentPage = Math.floor(offset / LIMIT) + 1;

  const handleDownloadReceipt = async (tx: CashTransaction) => {
    try {
      setDownloadBusyId(tx.id);
      const blob = await cashService.downloadReceiptAsync(tx.id);
      if (blob.size === 0) {
        toast.error('PDF oluşturulamadı.');
        return;
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kasa_islem_${tx.receipt_no || tx.id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e: unknown) {
      console.error('Download receipt error:', e);
      toast.error(getApiErrorMessage(e) || 'PDF indirme hatası');
    } finally {
      setDownloadBusyId(null);
    }
  };

  const handleApproveConfirm = async () => {
    if (!approveTarget) return;
    try {
      setApproveBusy(true);
      await cashService.approveAsync(approveTarget.id);
      setApproveTarget(null);
      await loadData();
      await loadAccounts();
    } catch (e: unknown) {
      console.error('Approve error:', e);
      toast.error(getApiErrorMessage(e) || 'Onaylama hatası');
    } finally {
      setApproveBusy(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setDeleteBusy(true);
      await cashService.deleteAsync(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
      await loadAccounts();
    } catch (e: unknown) {
      console.error('Delete error:', e);
      toast.error(getApiErrorMessage(e) || 'Silme hatası');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleCancelReasonContinue = () => {
    const reason = cancelReason.trim();
    if (!reason) {
      setCancelReasonError('İptal nedeni gereklidir.');
      return;
    }
    setCancelReasonError(null);
    setShowCancelReasonModal(false);
    setCancelConfirmOpen(true);
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    try {
      setCancelBusy(true);
      await cashService.cancelAsync(cancelTarget.id, cancelReason.trim());
      setCancelConfirmOpen(false);
      setCancelTarget(null);
      setCancelReason('');
      setCancelReasonError(null);
      await loadData();
      await loadAccounts();
    } catch (e: unknown) {
      console.error('Cancel error:', e);
      toast.error(getApiErrorMessage(e) || 'İptal hatası');
    } finally {
      setCancelBusy(false);
    }
  };

  const statusSelect = useMemo(
    () =>
      STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      )),
    []
  );

  const typeSelect = useMemo(
    () =>
      TYPE_OPTIONS.map((t) => (
        <option key={t} value={t}>
          {TYPE_LABELS[t]}
        </option>
      )),
    []
  );

  if (loading && transactions.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Kasa & Banka</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Kasa/banka işlemlerini takip edin, onaylayın ve gerektiğinde iptal edin.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canCreateAccount && (
            <button
              type="button"
              onClick={() => {
                setSelectedAccount(null);
                setIsNewAccount(true);
                setIsAccountModalOpen(true);
              }}
              className="btn-secondary py-2 px-3 text-sm inline-flex items-center gap-1.5"
            >
              <PlusIcon size={16} weight="bold" />
              Yeni Hesap
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="btn-primary py-2 px-3 text-sm inline-flex items-center gap-1.5"
            >
              <PlusIcon size={16} weight="bold" />
              Yeni İşlem
            </button>
          )}
        </div>
      </div>

      <div className="mb-3 rounded-panel border border-background-border bg-background-panel p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <FileTextIcon size={14} className="text-text-secondary" />
            <span>Hesaplar (Kasa / Banka)</span>
          </div>
          <button
            type="button"
            onClick={() => void loadAccounts()}
            className="btn-secondary py-1 px-2 text-[11px]"
            disabled={accountsLoading}
          >
            {accountsLoading ? 'Yükleniyor...' : 'Yenile'}
          </button>
        </div>

        {accountsError && (
          <div className="text-xs text-red-400 border border-red-700 rounded-md px-2 py-1">
            {accountsError}
          </div>
        )}

        {accounts.length === 0 ? (
          <div className="text-xs text-text-secondary border border-background-border rounded-md px-2 py-2">
            {accountsLoading ? 'Hesaplar yükleniyor...' : 'Kayıtlı kasa/banka hesabı bulunamadı.'}
          </div>
        ) : (
          <div className="border border-background-border rounded-md overflow-hidden">
            <div className="divide-y divide-background-border/60">
              {/* Kasa */}
              <div>
                <button
                  type="button"
                  onClick={() => handleToggleSection('CASH')}
                  className="w-full flex items-center justify-between gap-3 px-2 py-1.5 text-xs text-text-secondary hover:bg-background-hover/50"
                >
                  <span className="flex items-center gap-2">
                    <span className={`inline-block transition-transform ${expandedSections.CASH ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                    Kasa
                    <span className="text-text-secondary/80">({cashAccounts.length})</span>
                  </span>
                  <span className="text-[11px] text-text-secondary/80">Hesaplar</span>
                </button>

                {expandedSections.CASH && (
                  <div>
                    {cashAccounts.length === 0 ? (
                      <div className="px-2 py-2 text-xs text-text-secondary">
                        Kayıtlı kasa hesabı yok.
                      </div>
                    ) : (
                      <table className="w-full text-xs border-collapse text-text-primary">
                        <thead className="border-b border-background-border bg-background-hover">
                          <tr>
                            <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border/60">
                              Hesap Adı
                            </th>
                            <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border/60">
                              Para Birimi
                            </th>
                            <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border/60">
                              Bakiye
                            </th>
                            <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border/60">
                              Şube
                            </th>
                            <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border/60">
                              Hesap No / IBAN
                            </th>
                            <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border/60">
                              Negatif Bakiye
                            </th>
                            <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border/60">
                              Durum
                            </th>
                            <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap">
                              Düzenle
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {cashAccounts.map((acc, idx) => (
                            <tr
                              key={acc.id}
                              className={`border-b border-background-border/60 hover:bg-background-hover/50 cursor-pointer ${
                                idx % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'
                              }`}
                              onClick={() => navigate(`/cash/accounts/${acc.id}`)}
                            >
                              <td className="py-1 px-2 align-middle border-r border-background-border/40 font-medium text-text-primary">
                                {acc.name}
                              </td>
                              <td className="py-1 px-2 align-middle border-r border-background-border/40 text-text-secondary">
                                {acc.currency}
                              </td>
                              <td className="py-1 px-2 align-middle text-right border-r border-background-border/40 tabular-nums">
                                {formatAmount(acc.current_balance)}
                              </td>
                              <td className="py-1 px-2 align-middle border-r border-background-border/40 text-text-secondary">
                                {acc.branch_name || '-'}
                              </td>
                              <td className="py-1 px-2 align-middle border-r border-background-border/40 text-text-secondary">
                                {acc.account_no || '-'}
                              </td>
                              <td className="py-1 px-2 align-middle text-center border-r border-background-border/40">
                                {acc.allow_negative_balance ? 'Evet' : 'Hayır'}
                              </td>
                              <td className="py-1 px-2 align-middle text-center border-r border-background-border/40">
                                {acc.is_active ? 'Aktif' : 'Pasif'}
                              </td>
                              <td className="py-1 px-2 align-middle text-center">
                                <button
                                  type="button"
                                  className="text-blue-400 hover:text-blue-300"
                                  title="Düzenle"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAccount(acc);
                                    setIsNewAccount(false);
                                    setIsAccountModalOpen(true);
                                  }}
                                >
                                  ✎
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>

              {/* Banka */}
              <div>
                <button
                  type="button"
                  onClick={() => handleToggleSection('BANK')}
                  className="w-full flex items-center justify-between gap-3 px-2 py-1.5 text-xs text-text-secondary hover:bg-background-hover/50"
                >
                  <span className="flex items-center gap-2">
                    <span className={`inline-block transition-transform ${expandedSections.BANK ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                    Banka
                    <span className="text-text-secondary/80">({bankAccounts.length})</span>
                  </span>
                  <span className="text-[11px] text-text-secondary/80">Hesaplar</span>
                </button>

                {expandedSections.BANK && (
                  <div>
                    {bankAccounts.length === 0 ? (
                      <div className="px-2 py-2 text-xs text-text-secondary">
                        Kayıtlı banka hesabı yok.
                      </div>
                    ) : (
                      <table className="w-full text-xs border-collapse text-text-primary">
                        <thead className="border-b border-background-border bg-background-hover">
                          <tr>
                            <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border/60">
                              Hesap Adı
                            </th>
                            <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border/60">
                              Para Birimi
                            </th>
                            <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border/60">
                              Bakiye
                            </th>
                            <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border/60">
                              Negatif Bakiye
                            </th>
                            <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border/60">
                              Durum
                            </th>
                            <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap">
                              Düzenle
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {bankAccounts.map((acc, idx) => (
                            <tr
                              key={acc.id}
                              className={`border-b border-background-border/60 hover:bg-background-hover/50 cursor-pointer ${
                                idx % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'
                              }`}
                              onClick={() => navigate(`/cash/accounts/${acc.id}`)}
                            >
                              <td className="py-1 px-2 align-middle border-r border-background-border/40 font-medium text-text-primary">
                                {acc.name}
                              </td>
                              <td className="py-1 px-2 align-middle border-r border-background-border/40 text-text-secondary">
                                {acc.currency}
                              </td>
                              <td className="py-1 px-2 align-middle text-right border-r border-background-border/40 tabular-nums">
                                {formatAmount(acc.current_balance)}
                              </td>
                              <td className="py-1 px-2 align-middle text-center border-r border-background-border/40">
                                {acc.allow_negative_balance ? 'Evet' : 'Hayır'}
                              </td>
                              <td className="py-1 px-2 align-middle text-center border-r border-background-border/40">
                                {acc.is_active ? 'Aktif' : 'Pasif'}
                              </td>
                              <td className="py-1 px-2 align-middle text-center">
                                <button
                                  type="button"
                                  className="text-blue-400 hover:text-blue-300"
                                  title="Düzenle"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAccount(acc);
                                    setIsNewAccount(false);
                                    setIsAccountModalOpen(true);
                                  }}
                                >
                                  ✎
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mb-3 rounded-panel border border-background-border bg-background-panel p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <FunnelSimpleIcon size={14} className="text-text-secondary" />
          <span>Filtreler</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[200px]">
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus((e.target.value || '') as CashTransaction['status'] | '');
                setOffset(0);
              }}
              className="input py-1.5 px-2 text-sm w-full"
            >
              <option value="">Tüm Durumlar</option>
              {statusSelect}
            </select>
          </div>

          <div className="min-w-[200px]">
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType((e.target.value || '') as CashTransaction['type'] | '');
                setOffset(0);
              }}
              className="input py-1.5 px-2 text-sm w-full"
            >
              <option value="">Tüm Türler</option>
              {typeSelect}
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <CalendarBlankIcon size={14} className="text-text-secondary" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setOffset(0);
              }}
              className="input py-1 px-2 text-xs"
            />
            <span className="text-text-secondary">-</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setOffset(0);
              }}
              className="input py-1 px-2 text-xs"
            />
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-400 border border-red-700 rounded-md px-2 py-1">
            {error}
          </div>
        )}
      </div>

      {transactions.length === 0 ? (
        <EmptyState
          icon={<FileTextIcon size={40} weight="duotone" />}
          title="Henüz kayıt yok"
          description={
            canCreate
              ? 'İlk kasa/banka işleminizi oluşturmak için “Yeni İşlem” butonunu kullanın.'
              : 'Sistemde henüz kasa/banka işlemi bulunmuyor.'
          }
        />
      ) : (
        <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
          <div className="overflow-auto max-h-[calc(100vh-260px)] min-h-[320px]">
            <table className="w-full text-xs border-collapse text-text-primary">
              <thead className="sticky top-0 z-10 border-b border-background-border bg-background-hover">
                <tr>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0">
                    Fiş No
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0">
                    Tür
                  </th>
                  <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0">
                    Tutar
                  </th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0">
                    Durum
                  </th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0">
                    Tarih
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0">
                    Müşteri
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className={`border-b border-background-border hover:bg-background-hover/70 ${
                      tx.status === 'DRAFT' ? '' : ''
                    }`}
                  >
                    <td className="py-1 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                      <span className="font-mono text-sm bg-accent/10 text-accent px-1.5 py-0.5 rounded">
                        {tx.receipt_no || '-'}
                      </span>
                    </td>
                    <td className="py-1 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                      <span className="text-xs text-text-primary">
                        {TYPE_LABELS[tx.type] ?? tx.type}
                      </span>
                    </td>
                    <td className="py-1 px-2 align-middle text-right border-r border-background-border/60 last:border-r-0 tabular-nums">
                      <span className="font-semibold text-text-primary">
                        {formatAmount(tx.amount)}
                      </span>
                    </td>
                    <td className="py-1 px-2 align-middle text-center border-r border-background-border/60 last:border-r-0">
                      <span className={getStatusBadgeClass(tx.status)}>
                        {STATUS_LABELS[tx.status]}
                      </span>
                    </td>
                    <td className="py-1 px-2 align-middle text-center border-r border-background-border/60 last:border-r-0">
                      <span className="text-xs text-text-secondary">
                        {formatDate(tx.transaction_date)}
                      </span>
                    </td>
                    <td className="py-1 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                      <span className="text-xs text-text-secondary">
                        {tx.related_entity_type === 'CUSTOMER' ? tx.customer_name || '-' : '-'}
                      </span>
                    </td>
                    <td className="py-1 px-2 align-middle">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {tx.status === 'DRAFT' && (
                          <>
                            <button
                              type="button"
                              onClick={() => setApproveTarget(tx)}
                              disabled={!canApprove || approveBusy}
                              className="btn-primary px-2 py-1 text-[11px] inline-flex items-center gap-1"
                            >
                              <CheckIcon size={14} weight="bold" />
                              Onayla
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(tx)}
                              disabled={!canDelete || deleteBusy}
                              className="btn-danger px-2 py-1 text-[11px] inline-flex items-center gap-1"
                            >
                              <TrashIcon size={14} />
                              Sil
                            </button>
                          </>
                        )}

                        {tx.status === 'APPROVED' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                if (!canCancel) return;
                                setCancelTarget(tx);
                                setCancelReason('');
                                setCancelReasonError(null);
                                setShowCancelReasonModal(true);
                              }}
                              disabled={!canCancel || cancelBusy}
                              className="btn-danger px-2 py-1 text-[11px] inline-flex items-center gap-1"
                            >
                              <TrashIcon size={14} />
                              İptal Et
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDownloadReceipt(tx)}
                              disabled={downloadBusyId === tx.id}
                              className="btn-secondary px-2 py-1 text-[11px] inline-flex items-center gap-1"
                            >
                              <FileTextIcon size={14} weight="regular" />
                              {downloadBusyId === tx.id ? 'İndiriliyor...' : 'PDF İndir'}
                            </button>
                          </>
                        )}

                        {tx.status === 'CANCELLED' && tx.receipt_pdf_path && (
                          <button
                            type="button"
                            onClick={() => void handleDownloadReceipt(tx)}
                            disabled={downloadBusyId === tx.id}
                            className="btn-secondary px-2 py-1 text-[11px] inline-flex items-center gap-1"
                          >
                            <FileTextIcon size={14} weight="regular" />
                            {downloadBusyId === tx.id ? 'İndiriliyor...' : 'PDF İndir'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex items-center justify-between shrink-0">
            <span>
              Toplam: {total} kayıt (Sayfa {currentPage} / {totalPages})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOffset((prev) => Math.max(0, prev - LIMIT))}
                disabled={!hasPrev || loading}
                className="btn-secondary py-1 px-2 text-[11px]"
              >
                Önceki
              </button>
              <button
                type="button"
                onClick={() => setOffset((prev) => prev + LIMIT)}
                disabled={!hasNext || loading}
                className="btn-secondary py-1 px-2 text-[11px]"
              >
                Sonraki
              </button>
            </div>
          </div>
        </div>
      )}

      <CashTransactionModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={async () => {
          await loadData();
          await loadAccounts();
        }}
      />
      <CashAccountModal
        account={selectedAccount}
        isNew={isNewAccount}
        open={isAccountModalOpen}
        onClose={() => {
          setIsAccountModalOpen(false);
          setSelectedAccount(null);
        }}
        onCreated={loadAccounts}
      />

      <ConfirmModal
        open={!!approveTarget}
        title="İşlemi onayla"
        message={approveTarget ? `${approveTarget.receipt_no} fiş numaralı işlemi onaylamak istiyor musunuz?` : ''}
        confirmLabel="Onayla"
        cancelLabel="Vazgeç"
        variant="default"
        loading={approveBusy}
        onConfirm={handleApproveConfirm}
        onCancel={() => setApproveTarget(null)}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Taslağı sil"
        message={deleteTarget ? `${deleteTarget.receipt_no} fiş numaralı taslağı silmek istiyor musunuz?` : ''}
        confirmLabel="Sil"
        cancelLabel="Vazgeç"
        variant="danger"
        loading={deleteBusy}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {showCancelReasonModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-background-panel rounded-panel w-full max-w-md p-6 max-h-[90vh] overflow-y-auto shadow-xl">
            <h3 className="text-xl font-bold mb-2">İptal Nedeni</h3>
            <p className="text-sm text-text-secondary mb-4">
              İptal etmek için lütfen nedeni belirtin.
            </p>

            <textarea
              value={cancelReason}
              onChange={(e) => {
                setCancelReason(e.target.value);
                setCancelReasonError(null);
              }}
              className="input w-full h-24 resize-none py-2 px-3 text-sm"
              placeholder="Örn: Yanlış kayıt / Güncelleme"
            />

            {cancelReasonError && (
              <div className="mt-2 text-xs text-red-400 border border-red-700 rounded-md px-2 py-1">
                {cancelReasonError}
              </div>
            )}

            <div className="flex gap-3 justify-end mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowCancelReasonModal(false);
                  setCancelTarget(null);
                  setCancelReason('');
                  setCancelReasonError(null);
                }}
                disabled={cancelBusy}
                className="btn-secondary flex-1"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleCancelReasonContinue}
                disabled={cancelBusy}
                className="btn-primary flex-1"
              >
                Devam
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={cancelConfirmOpen}
        title="İşlemi iptal et"
        message={`Aşağıdaki işlemi iptal edeceksiniz.\n\nFiş No: ${cancelTarget?.receipt_no ?? '-'}\nİptal Nedeni: ${cancelReason.trim()}`}
        confirmLabel="İptal Et"
        cancelLabel="Vazgeç"
        variant="danger"
        loading={cancelBusy}
        onConfirm={handleCancelConfirm}
        onCancel={() => {
          setCancelConfirmOpen(false);
          setCancelTarget(null);
          setCancelReason('');
          setCancelReasonError(null);
        }}
      />
    </div>
  );
}


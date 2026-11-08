import { useState, useEffect, useReducer } from 'react';
import { ReceiptIcon, TrashIcon, NotePencilIcon, ChartBarIcon, ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import { contractService } from '../../services/contractService';
import { ContractInvoice, ContractInvoicingSummary, CreateInvoiceRequest, UpdateInvoiceRequest } from '../../models';
import { toast } from '../../hooks/useToast';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatShortDateTime } from '../../utils/formatters';
import { useAuthStore } from '../../store/authStore';
import { clearInvoicePlanCache, useInvoiceAmountSuggestion } from '../../hooks/useInvoiceAmountSuggestion';
import { addCalendarDays, calendarDaysBetween } from '../../utils/dateInput';
import { roundTo } from '../../utils/lineDiscount';
import {
  invoiceAmountReducer,
  createInitialInvoiceAmountState,
  parseAmountInput,
  findOverlappingInvoices,
  isoToLocalDateKey,
  accrualBoundaryIso,
  sumPlanAccrual,
} from '../../utils/invoiceAmountCalc';

interface ContractInvoicesPanelProps {
  contractId: number;
  contractCode?: string; // Şu an kullanılmıyor ama gelecekte başlıkta gösterilebilir
  contractCurrency?: 'TRY' | 'EUR' | 'USD';
  /** Backend NetTotal (iskontolu, KDV dahil). Satış sözleşmesinde sözleşme tutarı olarak kullanılır. */
  contractNetTotal?: number;
  contractStartDate?: string | null; // Sözleşme başlangıç tarihi
  contractPlannedEndDate?: string | null; // Sözleşme planlanan bitiş tarihi (uzatmalar dahil güncel)
  isRentalContract?: boolean; // Kiralama sözleşmesi mi?
}

export default function ContractInvoicesPanel({
  contractId,
  contractCode: _contractCode,
  contractCurrency = 'TRY',
  contractNetTotal,
  contractStartDate,
  contractPlannedEndDate,
  isRentalContract = false,
}: ContractInvoicesPanelProps) {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<ContractInvoice[]>([]);
  const [summary, setSummary] = useState<ContractInvoicingSummary | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<ContractInvoice | null>(null);
  const [formData, setFormData] = useState<CreateInvoiceRequest>({
    invoiceNumber: '',
    invoiceDate: '',
    periodStart: '',
    periodEnd: '',
    amount: 0,
    currency: contractCurrency,
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  /** Fatura dönemi gün sayısı (bitiş dahil). Girilince bitiş otomatik hesaplanır. */
  const [periodDaysInput, setPeriodDaysInput] = useState('');

  // Tutar yönetimi için reducer
  const [amountState, dispatchAmount] = useReducer(
    invoiceAmountReducer,
    undefined,
    createInitialInvoiceAmountState
  );

  const user = useAuthStore((state) => state.user);
  const canManageInvoices = Boolean(user?.permissions?.includes('contracts_invoice'));

  // Otomatik hesaplama (sadece kiralama + aynı para birimi)
  const autoCalcEnabled = 
    isRentalContract && 
    formData.currency === contractCurrency &&
    formData.periodStart !== '' &&
    formData.periodEnd !== '';

  const suggestion = useInvoiceAmountSuggestion({
    contractId,
    contractStartDate,
    startDate: formData.periodStart,
    endDate: formData.periodEnd,
    enabled: autoCalcEnabled,
  });

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const data = await contractService.getInvoicesAsync(contractId, false);
      setInvoices(data);
    } catch (error) {
      console.error('Load invoices error:', error);
      toast.error(getApiErrorMessage(error) || 'Faturalar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const data = await contractService.getInvoicingSummaryAsync(contractId);
      setSummary(data);
    } catch (error) {
      console.error('Load summary error:', error);
      toast.error(getApiErrorMessage(error) || 'Özet yüklenemedi.');
    }
  };

  useEffect(() => {
    // Zeyilname/iade/uzatma sonrası eski planla tutar önerilmesin.
    clearInvoicePlanCache(contractId);
    void loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  // Kiralamada sözleşme tutarı = başlangıçtan planlanan bitişe kadar tahakkuk (iskontolu, KDV dahil;
  // ilk 30 gün asgari, sonrası aylık / 30). Fatura önerisi de aynı tahakkuktan geldiği için ardışık
  // faturaların toplamı bu tutara birebir eşit olur. Erken iade/kapanışta backend planı gerçek bitişte keser.
  // Sözleşmedeki InitialTotalPrice brüt (iskonto ve KDV hariç) olduğu ve uzatmada güncellenmediği için kullanılmaz.
  const [rentalPlanTotal, setRentalPlanTotal] = useState<number | null>(null);
  const [rentalPlanTotalLoading, setRentalPlanTotalLoading] = useState(false);
  const plannedEndKeyForTotal = contractPlannedEndDate ? isoToLocalDateKey(contractPlannedEndDate) : '';
  const planAsOf =
    contractStartDate && plannedEndKeyForTotal
      ? accrualBoundaryIso(contractStartDate, plannedEndKeyForTotal)
      : null;

  useEffect(() => {
    if (!isRentalContract || !planAsOf) {
      setRentalPlanTotal(null);
      setRentalPlanTotalLoading(false);
      return;
    }
    let cancelled = false;
    setRentalPlanTotalLoading(true);
    contractService
      .getBillingPlanAsync(contractId, planAsOf)
      .then((plan) => {
        if (cancelled) return;
        setRentalPlanTotal(roundTo(sumPlanAccrual(plan), 2));
      })
      .catch((error) => {
        console.error('Load contract planned total error:', error);
        if (!cancelled) setRentalPlanTotal(null);
      })
      .finally(() => {
        if (!cancelled) setRentalPlanTotalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contractId, isRentalContract, planAsOf]);

  const contractTotalAmount: number | null = isRentalContract
    ? rentalPlanTotal
    : contractNetTotal ?? null;

  // Hesaplama sonuçlarını reducer'a gönder
  useEffect(() => {
    if (suggestion.loading) {
      dispatchAmount({ type: 'CALC_LOADING' });
    } else if (suggestion.error) {
      dispatchAmount({ type: 'CALC_ERROR', error: suggestion.error });
    } else if (suggestion.calculation) {
      dispatchAmount({ type: 'CALC_RESULT', calculation: suggestion.calculation });
    } else {
      dispatchAmount({ type: 'CALC_CLEAR' });
    }
  }, [suggestion.loading, suggestion.error, suggestion.calculation]);

  const resetForm = () => {
    setFormData({
      invoiceNumber: '',
      invoiceDate: '',
      periodStart: '',
      periodEnd: '',
      amount: 0,
      currency: contractCurrency,
      notes: '',
    });
    setEditingInvoice(null);
    setShowBreakdown(false);
    setPeriodDaysInput('');
    dispatchAmount({ type: 'INIT_CREATE' });
  };

  /** Dönem bitişi dahil: N gün → bitiş = başlangıç + N - 1. */
  const endFromDays = (start: string, days: number) => addCalendarDays(start, days - 1);
  const daysFromRange = (start: string, end: string) => {
    const diff = calendarDaysBetween(start, end);
    return Number.isFinite(diff) && diff >= 0 ? diff + 1 : null;
  };

  /**
   * Yeni faturanın varsayılan dönemi: son faturanın ertesi gününden (yoksa sözleşme başlangıcından)
   * başlar; uzatmalar dahil güncel planlanan bitişe kadar en fazla 30 gün.
   */
  const getDefaultPeriod = (): { start: string; days: number | null } => {
    const lastEnd = invoices
      .map((inv) => isoToLocalDateKey(inv.periodEnd))
      .filter(Boolean)
      .sort()
      .pop();
    const contractStartKey = contractStartDate ? isoToLocalDateKey(contractStartDate) : '';
    const start = lastEnd ? addCalendarDays(lastEnd, 1) : contractStartKey;
    if (!start) return { start: '', days: null };
    const endKey = contractPlannedEndDate ? isoToLocalDateKey(contractPlannedEndDate) : '';
    // Planlanan bitiş günü faturaya dahil değildir (son fatura günü = bitiş - 1).
    const remaining = endKey ? calendarDaysBetween(start, endKey) : NaN;
    if (Number.isFinite(remaining) && remaining >= 1) {
      return { start, days: Math.min(30, remaining) };
    }
    return { start, days: endKey ? null : 30 };
  };

  const openCreateForm = () => {
    resetForm();
    if (isRentalContract) {
      const { start, days } = getDefaultPeriod();
      setFormData((prev) => ({
        ...prev,
        periodStart: start,
        periodEnd: start && days ? endFromDays(start, days) : '',
      }));
      setPeriodDaysInput(days ? String(days) : '');
    }
    setShowCreateForm(true);
    dispatchAmount({ type: 'INIT_CREATE' });
  };

  const handlePeriodStartChange = (nextStart: string) => {
    const days = Math.floor(Number(periodDaysInput));
    setFormData((prev) => ({
      ...prev,
      periodStart: nextStart,
      periodEnd: nextStart && days >= 1 ? endFromDays(nextStart, days) : prev.periodEnd,
    }));
  };

  const handlePeriodDaysChange = (raw: string) => {
    setPeriodDaysInput(raw);
    const days = Math.floor(Number(raw));
    if (!formData.periodStart || !Number.isFinite(days) || days < 1) return;
    setFormData((prev) => ({ ...prev, periodEnd: endFromDays(prev.periodStart, days) }));
  };

  const handlePeriodEndChange = (nextEnd: string) => {
    setFormData((prev) => ({ ...prev, periodEnd: nextEnd }));
    const days = formData.periodStart && nextEnd ? daysFromRange(formData.periodStart, nextEnd) : null;
    setPeriodDaysInput(days != null ? String(days) : '');
  };

  const openEditForm = (invoice: ContractInvoice) => {
    setFormData({
      invoiceNumber: invoice.invoiceNumber || '',
      invoiceDate: isoToLocalDateKey(invoice.invoiceDate),
      periodStart: isoToLocalDateKey(invoice.periodStart),
      periodEnd: isoToLocalDateKey(invoice.periodEnd),
      amount: invoice.amount,
      currency: invoice.currency,
      notes: invoice.notes || '',
    });
    setEditingInvoice(invoice);
    setShowCreateForm(true);
    setShowBreakdown(false);
    const editStart = isoToLocalDateKey(invoice.periodStart);
    const editEnd = isoToLocalDateKey(invoice.periodEnd);
    const editDays = editStart && editEnd ? daysFromRange(editStart, editEnd) : null;
    setPeriodDaysInput(editDays != null ? String(editDays) : '');
    
    // Düzenleme modunda elle moddan başla, hesaplanan değeri referans olarak göster
    dispatchAmount({
      type: 'INIT_EDIT',
      amount: invoice.amount,
      calculatedAmount: null, // İlk açılışta hesaplanmış yoksa null
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.invoiceDate || !formData.periodStart || !formData.periodEnd) {
      toast.error('Tarih alanları zorunludur.');
      return;
    }

    // Tutar alanından parse et
    const parsedAmount = parseAmountInput(amountState.amountInput);
    if (parsedAmount == null || parsedAmount <= 0) {
      toast.error('Tutar 0\'dan büyük olmalıdır.');
      return;
    }

    try {
      setSubmitting(true);
      
      const submitData = {
        ...formData,
        amount: parsedAmount,
      };

      if (editingInvoice) {
        // Güncelleme
        await contractService.updateInvoiceAsync(
          contractId,
          editingInvoice.invoiceRecordId,
          submitData as UpdateInvoiceRequest
        );
        toast.success('Fatura güncellendi.');
      } else {
        // Yeni oluşturma
        await contractService.createInvoiceAsync(contractId, submitData);
        toast.success('Fatura kaydedildi.');
      }
      setShowCreateForm(false);
      resetForm();
      await loadInvoices();
    } catch (error) {
      console.error('Save invoice error:', error);
      toast.error(getApiErrorMessage(error) || 'Fatura kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (invoiceId: number) => {
    if (!confirm('Bu faturayı silmek istediğinizden emin misiniz?')) {
      return;
    }

    try {
      await contractService.deleteInvoiceAsync(contractId, invoiceId);
      toast.success('Fatura silindi.');
      await loadInvoices();
    } catch (error) {
      console.error('Delete invoice error:', error);
      toast.error(getApiErrorMessage(error) || 'Fatura silinemedi.');
    }
  };

  const handleToggleSummary = async () => {
    if (!showSummary && !summary) {
      await loadSummary();
    }
    setShowSummary(!showSummary);
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    const key = isoToLocalDateKey(dateString);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!match) return '-';
    return `${match[3]}.${match[2]}.${match[1]}`;
  };

  const getCurrencySymbol = (curr?: string) => {
    switch (curr) {
      case 'EUR': return '€';
      case 'USD': return '$';
      default: return '₺';
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-text-secondary">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full"></div>
        <p className="mt-2">Yükleniyor...</p>
      </div>
    );
  }

  // Fatura durumu hesaplamaları
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.amount, 0);
  const remainingAmount = contractTotalAmount != null ? roundTo(contractTotalAmount - totalInvoiced, 2) : null;
  const invoicingPercentage = contractTotalAmount && contractTotalAmount > 0 
    ? (totalInvoiced / contractTotalAmount) * 100 
    : null;

  // Kiralama süresi: fiyatlamayla aynı kural (bitiş - başlangıç gün, 1 ay = 30 gün)
  const startKey = contractStartDate ? isoToLocalDateKey(contractStartDate) : '';
  const plannedEndKey = contractPlannedEndDate ? isoToLocalDateKey(contractPlannedEndDate) : '';
  const rentalDaysRaw = startKey && plannedEndKey ? calendarDaysBetween(startKey, plannedEndKey) : NaN;
  const rentalDays = Number.isFinite(rentalDaysRaw) && rentalDaysRaw > 0 ? rentalDaysRaw : null;
  const rentalMonthsLabel =
    rentalDays != null
      ? (rentalDays / 30).toLocaleString('tr-TR', { maximumFractionDigits: 1 })
      : null;
  const hasRentalInfo = isRentalContract && contractStartDate && rentalDays != null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
      {/* Fatura Durumu Kartı */}
      {(contractTotalAmount != null || rentalPlanTotalLoading) && (
        <div className="p-4 bg-background-elevated rounded-lg border border-background-border">
          <h4 className="text-sm font-semibold mb-3">Fatura Durumu</h4>
          
          {/* Kiralama Bilgileri (varsa) */}
          {hasRentalInfo && (
            <div className="mb-3 p-2 bg-background-panel rounded-md flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-text-secondary">📅 Başlangıç:</span>
                <span className="font-medium">{formatDate(contractStartDate)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-text-secondary">⏱️ Süre:</span>
                <span className="font-medium text-primary">{rentalDays} gün (≈ {rentalMonthsLabel} ay)</span>
              </div>
              {contractPlannedEndDate && (
                <div className="flex items-center gap-2">
                  <span className="text-text-secondary">🏁 Bitiş:</span>
                  <span className="font-medium">{formatDate(contractPlannedEndDate)}</span>
                  {plannedEndKeyForTotal && (
                    <span
                      className="text-text-secondary"
                      title="Fatura dönem bitişi dahil sayılır; son faturanın bitiş günü budur."
                    >
                      (son fatura günü {formatDate(addCalendarDays(plannedEndKeyForTotal, -1))})
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-4 gap-4">
            <div>
              <div
                className="text-xs text-text-secondary mb-1"
                title={
                  isRentalContract
                    ? 'Başlangıçtan planlanan bitişe kadar tahakkuk (iskontolu, KDV dahil). Uzatma, zeyilname ve iadeler dahildir.'
                    : 'İskontolu, KDV dahil sözleşme tutarı.'
                }
              >
                Sözleşme Tutarı <span className="opacity-70">(KDV dahil)</span>
              </div>
              <div className="text-base font-bold text-text-primary">
                {contractTotalAmount != null
                  ? `${getCurrencySymbol(contractCurrency)}${contractTotalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
                  : '…'}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-secondary mb-1">Kesilen Fatura</div>
              <div className="text-base font-bold text-primary">
                {getCurrencySymbol(contractCurrency)}{totalInvoiced.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-secondary mb-1">Kalan Tutar</div>
              <div className={`text-base font-bold ${remainingAmount != null && remainingAmount > 0 ? 'text-amber-400' : remainingAmount === 0 ? 'text-green-400' : 'text-red-400'}`}>
                {remainingAmount != null ? `${getCurrencySymbol(contractCurrency)}${remainingAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-secondary mb-1">Tamamlanma</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-background-panel rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full transition-all ${
                      invoicingPercentage != null && invoicingPercentage >= 100 
                        ? 'bg-green-500' 
                        : invoicingPercentage != null && invoicingPercentage >= 75
                          ? 'bg-primary'
                          : 'bg-amber-500'
                    }`}
                    style={{ width: `${Math.min(invoicingPercentage || 0, 100)}%` }}
                  />
                </div>
                <span className="text-xs font-medium">
                  {invoicingPercentage != null ? `${invoicingPercentage.toFixed(0)}%` : '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Uyarı Mesajları */}
          {remainingAmount != null && remainingAmount < 0 && (
            <div className="mt-3 p-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-200">
              ⚠️ Kesilen faturalar sözleşme tutarını aşıyor! Fazla: {getCurrencySymbol(contractCurrency)}{Math.abs(remainingAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </div>
          )}
          {remainingAmount === 0 && (
            <div className="mt-3 p-2 bg-green-900/30 border border-green-700/50 rounded text-xs text-green-200">
              ✓ Sözleşme tutarının tamamı faturalandırıldı.
            </div>
          )}
        </div>
      )}

      {/* Üst Butonlar */}
      <div className="flex gap-2">
        {canManageInvoices && (
          <button
            onClick={openCreateForm}
            className="btn-primary flex-1 py-2"
          >
            + Yeni Fatura Ekle
          </button>
        )}
        <button
          onClick={handleToggleSummary}
          className={`btn-secondary py-2 px-4 flex items-center gap-2 ${!canManageInvoices ? 'flex-1' : ''}`}
        >
          <ChartBarIcon size={16} />
          {showSummary ? 'Özeti Gizle' : 'Aylık Özet'}
        </button>
      </div>

      {!canManageInvoices && (
        <div className="text-center py-2 text-xs text-text-secondary bg-background-elevated rounded-lg border border-background-border">
          Fatura oluşturmak ve düzenlemek için yetkiniz bulunmuyor. Sadece görüntüleme yapabilirsiniz.
        </div>
      )}

      {/* Aylık Özet */}
      {showSummary && summary && (
        <div className="p-4 bg-background-elevated rounded-lg border border-background-border space-y-4">
          <h4 className="text-sm font-semibold">Aylık Fatura Özeti</h4>
          
          {/* Genel İstatistikler */}
          <div className="grid grid-cols-3 gap-4 p-3 bg-background-panel rounded-md">
            <div>
              <div className="text-xs text-text-secondary mb-1">Toplam Fatura</div>
              <div className="text-lg font-bold text-primary">
                {getCurrencySymbol(summary.currency)}{summary.totalInvoiced.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-secondary mb-1">Fatura Sayısı</div>
              <div className="text-lg font-bold">{summary.invoiceCount}</div>
            </div>
            <div>
              <div className="text-xs text-text-secondary mb-1">Son Fatura</div>
              <div className="text-sm font-medium">{formatDate(summary.lastInvoiceDate)}</div>
            </div>
          </div>

          {/* Aylık Kırılım */}
          <div className="space-y-2">
            <h5 className="text-xs font-semibold text-text-secondary">Aylık Kırılım</h5>
            {summary.monthlyBreakdown.map((month) => (
              <div key={month.month} className="p-3 bg-background-panel rounded-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{month.month}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-text-secondary">{month.count} fatura</span>
                    <span className="text-sm font-semibold text-primary">
                      {getCurrencySymbol(summary.currency)}{month.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  {month.invoices.map((inv) => (
                    <div key={inv.invoiceRecordId} className="text-xs text-text-secondary flex justify-between">
                      <span>{inv.invoiceNumber || `#${inv.invoiceRecordId}`}</span>
                      <span>{formatDate(inv.invoiceDate)} • {getCurrencySymbol(summary.currency)}{inv.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fatura Formu */}
      {showCreateForm && (
        <form onSubmit={handleSubmit} className="p-4 bg-background-elevated rounded-lg border border-background-border space-y-3">
          <h4 className="text-sm font-semibold mb-3">
            {editingInvoice ? 'Fatura Düzenle' : 'Yeni Fatura'}
          </h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Fatura Numarası</label>
              <input
                type="text"
                value={formData.invoiceNumber}
                onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                className="input w-full"
                placeholder="FT-2026-0042"
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-xs text-text-secondary mb-1">
                Fatura Tarihi <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.invoiceDate}
                onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
                className="input w-full"
                required
                disabled={submitting}
              />
            </div>

            <div className="col-span-2 grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">
                  Dönem Başlangıç <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.periodStart}
                  onChange={(e) => handlePeriodStartChange(e.target.value)}
                  className="input w-full"
                  required
                  disabled={submitting}
                  title="Varsayılan: son faturanın ertesi günü (fatura yoksa sözleşme başlangıcı). Değiştirebilirsiniz."
                />
              </div>

              <div>
                <label
                  className="block text-xs text-text-secondary mb-1"
                  title="Faturalanacak gün sayısı (başlangıç ve bitiş günü dahil). Bitiş tarihi buna göre hesaplanır."
                >
                  Gün
                </label>
                <input
                  type="number"
                  min={1}
                  max={36500}
                  step={1}
                  value={periodDaysInput}
                  onChange={(e) => handlePeriodDaysChange(e.target.value)}
                  className="input w-full"
                  placeholder="30"
                  disabled={submitting}
                  title="Örn. 30 yazınca bitiş tarihi otomatik gelir."
                />
              </div>

              <div>
                <label className="block text-xs text-text-secondary mb-1">
                  Dönem Bitiş <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.periodEnd}
                  min={formData.periodStart || undefined}
                  onChange={(e) => handlePeriodEndChange(e.target.value)}
                  className="input w-full"
                  required
                  disabled={submitting}
                  title="Elle bitiş tarihi de girebilirsiniz; gün sayısı buna göre güncellenir."
                />
              </div>

              {isRentalContract && !editingInvoice && plannedEndKey && formData.periodStart && (
                <p className="col-span-3 text-xs text-text-secondary">
                  Planlanan bitiş (uzatmalar dahil): {formatDate(plannedEndKey)} — son fatura günü{' '}
                  {formatDate(addCalendarDays(plannedEndKey, -1))}
                  {formData.periodStart >= plannedEndKey && (
                    <span className="text-amber-300"> · Başlangıç planlanan bitişten sonra; sözleşme uzatılmamış olabilir.</span>
                  )}
                </p>
              )}
            </div>

            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-text-secondary">
                  Tutar <span className="text-red-500">*</span>
                </label>
                {isRentalContract && (
                  <div className="flex items-center gap-2">
                    {amountState.mode === 'manual' && amountState.calculatedAmount != null && (
                      <button
                        type="button"
                        onClick={() => dispatchAmount({ type: 'RESET_TO_AUTO' })}
                        className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                        disabled={submitting}
                      >
                        <ArrowCounterClockwiseIcon size={12} />
                        Hesaplanan tutarı kullan
                      </button>
                    )}
                    {amountState.mode === 'auto' && (
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        Otomatik
                      </span>
                    )}
                    {amountState.mode === 'manual' && (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        Elle girildi
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={amountState.amountInput}
                  onChange={(e) => dispatchAmount({ type: 'USER_INPUT', value: e.target.value })}
                  className="input w-full pr-24"
                  placeholder="0,00"
                  required
                  disabled={submitting}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm">
                  {getCurrencySymbol(formData.currency)}
                </span>
                {amountState.loading && (
                  <div className="absolute right-12 top-1/2 -translate-y-1/2">
                    <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full"></div>
                  </div>
                )}
              </div>
              
              {/* Hesaplanan tutar ve fark (elle modda) */}
              {isRentalContract && amountState.mode === 'manual' && amountState.calculatedAmount != null && (
                <div className="mt-1 text-xs text-text-secondary">
                  Hesaplanan: {getCurrencySymbol(formData.currency)}{amountState.calculatedAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  {(() => {
                    const parsed = parseAmountInput(amountState.amountInput);
                    if (parsed != null) {
                      const diff = parsed - amountState.calculatedAmount;
                      if (Math.abs(diff) > 0.01) {
                        const sign = diff > 0 ? '+' : '';
                        return (
                          <span className={diff > 0 ? 'text-amber-400' : 'text-red-400'}>
                            {' '}(fark {sign}{diff.toLocaleString('tr-TR', { minimumFractionDigits: 2 })})
                          </span>
                        );
                      }
                    }
                    return null;
                  })()}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-text-secondary mb-1">Para Birimi</label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="input w-full"
                disabled={submitting}
              >
                <option value="TRY">TRY (₺)</option>
                <option value="EUR">EUR (€)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>

          {isRentalContract && formData.currency !== contractCurrency && (
            <div className="p-2 bg-amber-900/30 border border-amber-700/50 rounded text-xs text-amber-200">
              ⚠️ Seçilen para birimi sözleşme para biriminden farklı. Otomatik hesaplama devre dışı.
            </div>
          )}

          {(() => {
            if (!isRentalContract || !formData.periodStart || !formData.periodEnd) return null;
            if (formData.periodStart > formData.periodEnd) return null;
            const overlapping = findOverlappingInvoices(
              invoices,
              formData.periodStart,
              formData.periodEnd,
              editingInvoice?.invoiceRecordId
            );
            if (overlapping.length === 0) return null;
            return (
              <div className="p-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-200">
                ⚠️ Bu dönemle çakışan fatura var:{' '}
                {overlapping.map((inv) => inv.invoiceNumber || `#${inv.invoiceRecordId}`).join(', ')}
              </div>
            );
          })()}

          {/* Uyarılar */}
          {isRentalContract && amountState.calculation && (
            <div className="space-y-2">
              {/* Kapsam dışı günler */}
              {amountState.calculation.uncoveredDays > 0 && (
                <div className="p-2 bg-amber-900/30 border border-amber-700/50 rounded text-xs text-amber-200">
                  ⚠️ {amountState.calculation.uncoveredDays} gün hesaba dahil edilmedi (sözleşme dönemleri dışında)
                </div>
              )}
              
              {/* Asgari kira süresi */}
              {amountState.calculation.includesMinimumRental && (
                <div className="p-2 bg-sky-900/30 border border-sky-700/50 rounded text-xs text-sky-200">
                  ℹ️ İlk 30 gün asgari kira bedeli olarak tam ücretlendirildi ({amountState.calculation.coveredDays} gün seçili olsa da).
                </div>
              )}
              
              {/* Projeksiyon */}
              {amountState.calculation.hasProjection && (
                <div className="p-2 bg-purple-900/30 border border-purple-700/50 rounded text-xs text-purple-200">
                  📊 Projeksiyon: iade veya zeyilname olursa tutar değişebilir
                </div>
              )}
            </div>
          )}

          {/* API Hatası */}
          {isRentalContract && amountState.error && (
            <div className="p-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-200 flex items-center justify-between">
              <span>⚠️ {amountState.error}</span>
              <button
                type="button"
                onClick={suggestion.retry}
                className="text-xs text-primary hover:text-primary/80 underline"
              >
                Tekrar dene
              </button>
            </div>
          )}

          {/* Hesap Kırılımı */}
          {isRentalContract && amountState.calculation && amountState.calculation.breakdown.length > 0 && (
            <div className="border border-background-border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="w-full p-2 bg-background-panel hover:bg-background-secondary transition-colors text-left flex items-center justify-between text-xs font-medium"
              >
                <span>Hesap Kırılımı</span>
                <span className={`transform transition-transform ${showBreakdown ? 'rotate-180' : ''}`}>▼</span>
              </button>
              
              {showBreakdown && (
                <div className="p-2 space-y-1">
                  <div className="grid grid-cols-12 gap-1 text-xs font-semibold text-text-secondary border-b border-background-border pb-1">
                    <div className="col-span-4">Dönem</div>
                    <div className="col-span-2 text-right">Günler</div>
                    <div className="col-span-3 text-right">Dönem Tutarı</div>
                    <div className="col-span-3 text-right">Katkı</div>
                  </div>
                  {amountState.calculation.breakdown.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-1 text-xs py-1 border-b border-background-border last:border-0">
                      <div className="col-span-4 flex items-center gap-1">
                        <span className="text-text-secondary">{formatDate(line.periodStart)}</span>
                        <span className="text-text-secondary">-</span>
                        <span className="text-text-secondary">{formatDate(line.periodEnd)}</span>
                        {line.isPartial && (
                          <span className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px]">
                            Kısmi
                          </span>
                        )}
                        {!line.isClosed && (
                          <span className="px-1 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px]">
                            Proj.
                          </span>
                        )}
                      </div>
                      <div className="col-span-2 text-right text-text-secondary">
                        {line.overlappingDays} / {line.periodDays}
                      </div>
                      <div className="col-span-3 text-right">
                        {getCurrencySymbol(formData.currency)}{line.accrualNetTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="col-span-3 text-right font-medium text-primary">
                        {getCurrencySymbol(formData.currency)}{line.contribution.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-12 gap-1 text-xs font-bold pt-1 border-t-2 border-primary/30">
                    <div className="col-span-9 text-right">Toplam:</div>
                    <div className="col-span-3 text-right text-primary">
                      {getCurrencySymbol(formData.currency)}{amountState.calculation.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs text-text-secondary mb-1">Notlar</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="input w-full h-20 resize-none"
              placeholder="Örn: Kasım ayı kiralama bedeli"
              disabled={submitting}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                resetForm();
              }}
              className="btn-secondary flex-1"
              disabled={submitting}
            >
              İptal
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={submitting}
            >
              {submitting ? 'Kaydediliyor...' : editingInvoice ? 'Güncelle' : 'Kaydet'}
            </button>
          </div>
        </form>
      )}

      {/* Fatura Listesi */}
      <div>
        <h4 className="text-sm font-semibold mb-3">Faturalar</h4>
        {invoices.length === 0 ? (
          <div className="text-center py-8 text-text-secondary text-sm">
            Henüz fatura kaydı bulunmuyor.
          </div>
        ) : (
          <div className="space-y-2">
            {invoices.map((invoice) => (
              <div
                key={invoice.invoiceRecordId}
                className="p-3 rounded-lg border bg-background-elevated border-background-border hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ReceiptIcon size={16} className="text-text-secondary" />
                    <span className="text-sm font-medium">
                      {invoice.invoiceNumber || `#${invoice.invoiceRecordId}`}
                    </span>
                  </div>
                  {canManageInvoices && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEditForm(invoice)}
                        className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                      >
                        <NotePencilIcon size={14} />
                        Düzenle
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(invoice.invoiceRecordId)}
                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                      >
                        <TrashIcon size={14} />
                        Sil
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                  <div>
                    <span className="text-text-secondary">Fatura Tarihi:</span>
                    <span className="ml-1">{formatDate(invoice.invoiceDate)}</span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Tutar:</span>
                    <span className="ml-1 font-semibold text-primary">
                      {getCurrencySymbol(invoice.currency)}{invoice.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-text-secondary">Dönem:</span>
                    <span className="ml-1">{formatDate(invoice.periodStart)} - {formatDate(invoice.periodEnd)}</span>
                  </div>
                </div>

                {invoice.notes && (
                  <div className="text-xs text-text-secondary pt-2 border-t border-background-border">
                    {invoice.notes}
                  </div>
                )}

                <div className="text-xs text-text-secondary mt-2">
                  {invoice.createdBy || '-'} • {formatShortDateTime(invoice.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

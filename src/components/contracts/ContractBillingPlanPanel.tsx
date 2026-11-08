import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowClockwiseIcon,
  CaretDownIcon,
  CaretRightIcon,
  InfoIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import type { BillingPeriod, BillingSummary, ContractLineItem, CurrencyCode } from '../../models';
import { contractService } from '../../services/contractService';
import ConfirmModal from '../modals/ConfirmModal';
import MarkBilledPeriodModal from '../modals/MarkBilledPeriodModal';
import { toast } from '../../hooks/useToast';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatDate, formatMoney } from '../../utils/formatters';
import {
  asOfDateInputToIso,
  canMarkBilledPeriod,
  canUnmarkBilledPeriod,
  getBillingPeriodStatus,
  getBillingPeriodStatusClass,
  getBillingPeriodStatusLabel,
  getBillingVarianceDisplay,
  getDueNowPresentation,
  getMarkBilledDisabledReason,
  isAsOfInFuture,
  resolveBillingLineLabel,
  warningLooksPendingAddendum,
} from '../../utils/billingPlan';

interface ContractBillingPlanPanelProps {
  contractId: number;
  currency: CurrencyCode;
  contractItems: ContractLineItem[];
  canUpdate: boolean;
  contractCancelled: boolean;
  contractArchived: boolean;
  refreshNonce?: number;
  onOpenAddendum?: (addendumId: number) => void;
  onOpenAddendaTab?: () => void;
}

function money(amount: number, currency: CurrencyCode): string {
  return formatMoney(amount, currency);
}

export default function ContractBillingPlanPanel({
  contractId,
  currency,
  contractItems,
  canUpdate,
  contractCancelled,
  contractArchived,
  refreshNonce = 0,
  onOpenAddendum,
  onOpenAddendaTab,
}: ContractBillingPlanPanelProps) {
  const [asOfInput, setAsOfInput] = useState('');
  const [plan, setPlan] = useState<BillingPeriod[] | null>(null);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [markPeriod, setMarkPeriod] = useState<BillingPeriod | null>(null);
  const [unmarkPeriod, setUnmarkPeriod] = useState<BillingPeriod | null>(null);
  const [unmarkLoading, setUnmarkLoading] = useState(false);

  const asOfIso = useMemo(() => asOfDateInputToIso(asOfInput), [asOfInput]);
  const futureAsOf = isAsOfInFuture(asOfInput);

  const load = useCallback(async () => {
    setLoading(true);
    setPlanError(null);
    setSummaryError(null);
    const [planResult, summaryResult] = await Promise.allSettled([
      contractService.getBillingPlanAsync(contractId, asOfIso),
      contractService.getBillingSummaryAsync(contractId),
    ]);
    if (planResult.status === 'fulfilled') {
      setPlan(planResult.value);
    } else {
      setPlan(null);
      setPlanError(getApiErrorMessage(planResult.reason) || 'Faturalama planı yüklenemedi');
    }
    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value);
    } else {
      setSummary(null);
      setSummaryError(getApiErrorMessage(summaryResult.reason) || 'Faturalama özeti yüklenemedi');
    }
    setLoading(false);
  }, [contractId, asOfIso]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  const toggleRow = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleUnmarkConfirm = async () => {
    if (!unmarkPeriod) return;
    try {
      setUnmarkLoading(true);
      await contractService.unmarkBilledPeriodAsync(contractId, unmarkPeriod.periodStart);
      toast.success('Faturalandı işareti kaldırıldı.');
      setUnmarkPeriod(null);
      await load();
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status === 404) {
        toast.info('İşaret zaten yok');
        setUnmarkPeriod(null);
        await load();
        return;
      }
      toast.error(getApiErrorMessage(error) || 'İşaret kaldırılamadı.');
    } finally {
      setUnmarkLoading(false);
    }
  };

  const dueNow = summary ? getDueNowPresentation(summary.dueNow) : null;
  const pendingWarning = summary?.warnings.some(warningLooksPendingAddendum) ?? false;
  const lastPeriodKey =
    plan && plan.length > 0 ? `${plan[plan.length - 1].periodStart}|${plan[plan.length - 1].index}` : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto space-y-3 pr-0.5">
        <p className="text-xs text-text-secondary rounded-lg border border-background-border bg-background-surface px-3 py-2">
          Bu ekran fatura oluşturmaz; hesaplanan tutarı kendi fatura sisteminizde kullanın ve dönemi
          işaretleyerek takibini yapın.
        </p>

        <section className="rounded-xl border border-background-border bg-background-panel p-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              {summaryError && !summary ? (
                <p className="text-sm text-red-300">{summaryError}</p>
              ) : loading && !summary ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-4 w-40 rounded bg-background-border/70" />
                  <div className="h-8 w-56 rounded bg-background-border/70" />
                </div>
              ) : dueNow?.tone === 'zero' ? (
                <>
                  <p className="text-[11px] uppercase tracking-wide text-text-secondary">Özet</p>
                  <p className="text-lg font-semibold text-text-primary mt-0.5">Bekleyen fatura yok</p>
                </>
              ) : dueNow?.tone === 'overbilled' ? (
                <>
                  <p className="text-[11px] uppercase tracking-wide text-red-300">Fazla faturalanmış</p>
                  <p className="text-2xl font-semibold text-red-300 mt-0.5 tabular-nums">
                    {money(Math.abs(dueNow.rounded), currency)}
                  </p>
                  <p className="text-xs text-red-200/90 mt-1">
                    {money(Math.abs(dueNow.rounded), currency)} tutarında iade/alacak durumu
                  </p>
                </>
              ) : dueNow ? (
                <>
                  <p className="text-[11px] uppercase tracking-wide text-text-secondary">
                    Şu an kesilmesi gereken
                  </p>
                  <p className="text-2xl font-semibold text-text-primary mt-0.5 tabular-nums">
                    {money(dueNow.rounded, currency)}
                  </p>
                </>
              ) : null}

              {summary?.currentPeriodProjection && (
                <p
                  className="text-xs text-text-secondary mt-2"
                  title="Ay sonuna kadar, yeni iade veya zeyilname olmazsa oluşacak tutar; peşin fatura kesmek isterseniz referans alın."
                >
                  Bu ayın projeksiyonu:{' '}
                  <span className="text-text-primary font-medium tabular-nums">
                    {money(summary.currentPeriodProjection.projectedNetTotal, currency)}
                  </span>
                  <span className="ml-1">
                    ({formatDate(summary.currentPeriodProjection.periodStart)} –{' '}
                    {formatDate(summary.currentPeriodProjection.periodEnd)})
                  </span>
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn-secondary text-xs inline-flex items-center gap-1"
              onClick={() => void load()}
              disabled={loading}
            >
              <ArrowClockwiseIcon size={14} />
              Yenile
            </button>
          </div>

          {pendingWarning && (
            <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-100">
              <p className="font-medium">Onaylanınca tutar değişebilir; kesinleşmeden fatura kesmeyin.</p>
              {onOpenAddendaTab && (
                <button
                  type="button"
                  className="mt-1 text-amber-200 underline underline-offset-2 hover:text-amber-50"
                  onClick={onOpenAddendaTab}
                >
                  Zeyilnamelere git
                </button>
              )}
            </div>
          )}

          {summary && summary.warnings.length > 0 && (
            <div className="mt-3 space-y-1">
              {summary.warnings.map((warning, idx) => (
                <div
                  key={`${idx}-${warning.slice(0, 24)}`}
                  className="flex items-start gap-1.5 rounded-md border border-amber-600/30 bg-amber-950/20 px-2.5 py-1.5 text-xs text-amber-100"
                >
                  <WarningCircleIcon size={14} className="mt-0.5 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <span>Tarihe göre</span>
              <input
                type="date"
                className="input py-0.5 text-xs w-[10.5rem]"
                value={asOfInput}
                onChange={(e) => setAsOfInput(e.target.value)}
              />
              {asOfInput && (
                <button
                  type="button"
                  className="text-accent hover:underline"
                  onClick={() => setAsOfInput('')}
                >
                  Temizle
                </button>
              )}
            </label>
          </div>

          {loading && !plan ? (
            <div className="rounded-xl border border-background-border bg-background-panel p-4 space-y-2 animate-pulse">
              <div className="h-8 rounded bg-background-border/70" />
              <div className="h-8 rounded bg-background-border/50" />
              <div className="h-8 rounded bg-background-border/70" />
            </div>
          ) : planError && !plan ? (
            <div className="rounded-xl border border-red-500/40 bg-red-900/15 px-4 py-6 text-center space-y-3">
              <p className="text-sm text-red-200">{planError}</p>
              <button type="button" className="btn-secondary text-sm" onClick={() => void load()}>
                Tekrar dene
              </button>
            </div>
          ) : !plan || plan.length === 0 ? (
            <div className="rounded-xl border border-background-border bg-background-panel py-10 text-center text-sm text-text-secondary">
              Sözleşme henüz başlamadı veya faturalanacak dönem yok.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-background-border">
              <table className="table-data-grid table-excel-rows text-text-primary min-w-[860px] w-full">
                <thead>
                  <tr>
                    <th className="text-left w-8" />
                    <th className="text-left whitespace-nowrap">Dönem</th>
                    <th className="text-right whitespace-nowrap">Tahakkuk (KDV hariç)</th>
                    <th className="text-right whitespace-nowrap">Net Tahakkuk</th>
                    <th className="text-right whitespace-nowrap">Faturalanan</th>
                    <th className="text-left whitespace-nowrap">Fark</th>
                    <th className="text-left whitespace-nowrap">Durum</th>
                    <th className="text-right whitespace-nowrap">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((period, rowIndex) => {
                    const rowKey = `${period.periodStart}|${period.index}`;
                    const isOpen = expanded.has(rowKey);
                    const status = getBillingPeriodStatus(period);
                    const variance = getBillingVarianceDisplay(period.variance);
                    const markable = canMarkBilledPeriod({
                      isClosed: period.isClosed,
                      billedAmount: period.billedAmount,
                      canUpdate,
                      contractCancelled,
                      contractArchived,
                    });
                    const unmarkable = canUnmarkBilledPeriod({
                      billedAmount: period.billedAmount,
                      canUpdate,
                      contractCancelled,
                      contractArchived,
                    });
                    const markDisabledReason = getMarkBilledDisabledReason({
                      isClosed: period.isClosed,
                      contractCancelled,
                      contractArchived,
                    });
                    const isProjectionRow = futureAsOf && rowKey === lastPeriodKey;

                    return (
                      <Fragment key={rowKey}>
                        <tr className={rowIndex % 2 === 0 ? 'bg-background-panel' : 'bg-background-secondary/35'}>
                          <td className="w-8">
                            <button
                              type="button"
                              className="p-0.5 text-text-secondary hover:text-text-primary"
                              onClick={() => toggleRow(rowKey)}
                              aria-label={isOpen ? 'Satırı daralt' : 'Satırı genişlet'}
                            >
                              {isOpen ? <CaretDownIcon size={14} /> : <CaretRightIcon size={14} />}
                            </button>
                          </td>
                          <td className="whitespace-nowrap">
                            <span className="tabular-nums">
                              {formatDate(period.periodStart)} – {formatDate(period.periodEnd)}
                            </span>
                            {period.isPartial && (
                              <span className="ml-1.5 inline-flex rounded border border-sky-500/40 bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-200">
                                Kıst
                              </span>
                            )}
                            {isProjectionRow && (
                              <span className="ml-1.5 inline-flex rounded border border-violet-500/40 bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-200">
                                Projeksiyon
                              </span>
                            )}
                          </td>
                          <td className="text-right tabular-nums">{money(period.accrualSubtotal, currency)}</td>
                          <td className="text-right tabular-nums font-medium">
                            {money(period.accrualNetTotal, currency)}
                          </td>
                          <td className="text-right tabular-nums">
                            {period.billedAmount == null ? '—' : money(period.billedAmount, currency)}
                          </td>
                          <td className="text-xs">
                            {variance.kind === 'none' ? (
                              <span className="text-text-secondary">—</span>
                            ) : (
                              <span
                                className={
                                  variance.kind === 'under' ? 'text-amber-300' : 'text-red-300'
                                }
                              >
                                {variance.kind === 'under' ? '+' : ''}
                                {money(variance.amount ?? 0, currency)} {variance.label}
                              </span>
                            )}
                          </td>
                          <td>
                            <span
                              className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${getBillingPeriodStatusClass(status)}`}
                            >
                              {getBillingPeriodStatusLabel(status)}
                            </span>
                          </td>
                          <td className="text-right whitespace-nowrap">
                            {canUpdate && markable && (
                              <button
                                type="button"
                                className="btn-primary text-[10px] px-1.5 py-0.5 leading-none h-[1.25rem] min-h-0"
                                onClick={() => setMarkPeriod(period)}
                                title="Faturalandı olarak işaretle"
                              >
                                İşaretle
                              </button>
                            )}
                            {canUpdate && !markable && period.billedAmount == null && (
                              <button
                                type="button"
                                className="btn-primary text-[10px] px-1.5 py-0.5 leading-none h-[1.25rem] min-h-0 opacity-50 cursor-not-allowed"
                                disabled
                                title={markDisabledReason ?? undefined}
                              >
                                İşaretle
                              </button>
                            )}
                            {canUpdate && unmarkable && (
                              <button
                                type="button"
                                className="btn-secondary text-[10px] px-1.5 py-0.5 leading-none h-[1.25rem] min-h-0 ml-1"
                                onClick={() => setUnmarkPeriod(period)}
                              >
                                İşareti kaldır
                              </button>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-background-surface">
                            <td colSpan={8} className="px-3 py-2.5 border-b border-background-border">
                              {period.lines.length === 0 ? (
                                <p className="text-xs text-text-secondary">Bu dönem için kalem kırılımı yok.</p>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-text-secondary">
                                      <th className="text-left font-medium py-1">Kalem</th>
                                      <th className="text-right font-medium py-1">Brüt</th>
                                      <th className="text-right font-medium py-1">Net</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {period.lines.map((line) => (
                                      <tr key={`${line.DetailId}-${line.ItemId}`}>
                                        <td className="py-0.5">
                                          {resolveBillingLineLabel(line, contractItems)}
                                          <span className="ml-1 text-text-secondary">
                                            (satır #{line.DetailId})
                                          </span>
                                        </td>
                                        <td className="text-right tabular-nums py-0.5">
                                          {money(line.gross, currency)}
                                        </td>
                                        <td className="text-right tabular-nums py-0.5">
                                          {money(line.net, currency)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              {period.varianceReasons.length > 0 && (
                                <div className="mt-3 rounded-md border border-amber-600/30 bg-amber-950/15 px-2.5 py-2">
                                  <p className="text-xs font-medium text-amber-100">Bu farkın sebebi</p>
                                  <p className="text-[11px] text-amber-100/80 mt-0.5">
                                    Bu dönem faturalandıktan sonra onaylanan ve geriye dönük etkili
                                    zeyilname(ler) nedeniyle tahakkuk değişti.
                                  </p>
                                  <ul className="mt-1.5 space-y-1">
                                    {period.varianceReasons.map((reason) => (
                                      <li key={reason.AddendumId}>
                                        {onOpenAddendum ? (
                                          <button
                                            type="button"
                                            className="text-xs text-amber-100 underline underline-offset-2 hover:text-white"
                                            onClick={() => onOpenAddendum(reason.AddendumId)}
                                          >
                                            Zeyilname #{reason.AddendumNumber} —{' '}
                                            {reason.Reason?.trim() || 'Gerekçe girilmemiş'} — yürürlük:{' '}
                                            {formatDate(reason.EffectiveDate)}
                                          </button>
                                        ) : (
                                          <span className="text-xs text-amber-100">
                                            Zeyilname #{reason.AddendumNumber} —{' '}
                                            {reason.Reason?.trim() || 'Gerekçe girilmemiş'} — yürürlük:{' '}
                                            {formatDate(reason.EffectiveDate)}
                                          </span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <details className="rounded-lg border border-background-border bg-background-surface px-3 py-2 text-xs text-text-secondary">
          <summary className="cursor-pointer inline-flex items-center gap-1 text-text-primary font-medium">
            <InfoIcon size={14} />
            Faturaya girmeyen / ayrı değerlendirilmesi gerekenler
          </summary>
          <ul className="mt-2 list-disc pl-4 space-y-1">
            <li>
              Gecikme bedeli (LateFee) faturaya girmez — gecikme günleri zaten kira olarak hesaplanıyor.
            </li>
            <li>
              Kayıp/hasar bedeli (SettlementCharge) tahakkuka dahildir ama muhasebe açısından mal
              satışıdır; fatura keserken ayrı satır olarak göstermeniz önerilir.
            </li>
            <li>Teminat/depozito bu hesaba girmez.</li>
            <li>
              Kısa süreli eklenen malzeme sonradan tersine çevrilse bile 30 günlük asgari kiralama
              bedeli tahakkuk eder; bu bir hata değildir.
            </li>
          </ul>
        </details>
      </div>

      {markPeriod && (
        <MarkBilledPeriodModal
          contractId={contractId}
          period={markPeriod}
          currency={currency}
          onClose={() => setMarkPeriod(null)}
          onSuccess={() => {
            setMarkPeriod(null);
            void load();
          }}
        />
      )}

      <ConfirmModal
        open={Boolean(unmarkPeriod)}
        title="İşareti kaldır"
        message="Bu dönemin faturalandı işareti kaldırılacak. Fatura sisteminizdeki kayıt etkilenmez."
        confirmLabel="İşareti kaldır"
        cancelLabel="Vazgeç"
        variant="danger"
        loading={unmarkLoading}
        zIndexClass="z-[70]"
        onConfirm={() => void handleUnmarkConfirm()}
        onCancel={() => {
          if (!unmarkLoading) setUnmarkPeriod(null);
        }}
      />
    </div>
  );
}

import { Fragment, useCallback, useEffect, useState } from 'react';
import { FilePdfIcon, PaperclipIcon, PlusIcon, XCircleIcon } from '@phosphor-icons/react';
import type { ReturnSlip } from '../../models';
import { returnSlipService } from '../../services/returnSlipService';
import { useAuthStore } from '../../store/authStore';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatDate, formatDateTime, formatMoney, type MoneyCurrency } from '../../utils/formatters';
import { RETURN_CONDITION_LABELS } from '../../utils/returnSlip';
import { toast } from '../../hooks/useToast';
import PdfPreviewModal from '../modals/PdfPreviewModal';
import CancelReturnSlipModal from '../modals/CancelReturnSlipModal';
import AttachmentsPanel from '../attachments/AttachmentsPanel';

interface ContractReturnSlipsPanelProps {
  contractId: number;
  currency: MoneyCurrency;
  /** Yeni fiş kesilebilir mi (aktif kiralama + contracts_update) */
  canCreate: boolean;
  onCreateClick: () => void;
  /** Dışarıdan yeniden yükleme tetikleyicisi (fiş kesildikten sonra artırılır) */
  refreshKey: number;
  /** Fiş iptal edildi: sözleşme ve iade geçmişi yeniden yüklensin */
  onChanged: () => void | Promise<void>;
}

/**
 * Sözleşmenin iade fişleri: durum kırılımı, satış bedeli, PDF, iptal ve dosya ekleri (hasar fotoğrafı, imzalı fiş).
 */
export default function ContractReturnSlipsPanel({
  contractId,
  currency,
  canCreate,
  onCreateClick,
  refreshKey,
  onChanged,
}: ContractReturnSlipsPanelProps) {
  const user = useAuthStore((s) => s.user);
  const canCancel = Boolean(user?.permissions?.includes('return_slips_cancel'));

  const [slips, setSlips] = useState<ReturnSlip[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ReturnSlip | null>(null);
  const [pdf, setPdf] = useState<{ url: string; slip: ReturnSlip } | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      setSlips(await returnSlipService.listByContractAsync(contractId));
    } catch (err) {
      setLoadError(getApiErrorMessage(err) || 'İade fişleri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(
    () => () => {
      if (pdf) URL.revokeObjectURL(pdf.url);
    },
    [pdf]
  );

  const openPdf = async (slip: ReturnSlip) => {
    try {
      setPdfLoadingId(slip.ReturnSlipId);
      const blob = await returnSlipService.getPdfBlobAsync(slip.ReturnSlipId);
      setPdf({ url: URL.createObjectURL(blob), slip });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'İade fişi PDF oluşturulamadı.');
    } finally {
      setPdfLoadingId(null);
    }
  };

  const setAttachmentCount = useCallback((slipId: number, count: number) => {
    setSlips((prev) =>
      prev.map((s) => (s.ReturnSlipId === slipId && s.AttachmentCount !== count ? { ...s, AttachmentCount: count } : s))
    );
  }, []);

  return (
    <div className="p-3 bg-background-elevated rounded-lg border border-background-border">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold">İade fişleri</h4>
        {canCreate && (
          <button type="button" className="btn-primary py-1 px-2.5 text-xs flex items-center gap-1" onClick={onCreateClick}>
            <PlusIcon size={13} /> İade fişi kes
          </button>
        )}
      </div>
      {loading ? (
        <p className="text-xs text-text-secondary">Yükleniyor…</p>
      ) : loadError ? (
        <p className="text-xs text-red-400">{loadError}</p>
      ) : slips.length === 0 ? (
        <p className="text-xs text-text-secondary">Bu sözleşmede henüz iade fişi kesilmedi.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-text-secondary">
              <tr className="border-b border-background-border">
                <th className="text-left py-1.5 pr-2">Fiş no</th>
                <th className="text-left py-1.5 px-2">İade tarihi</th>
                <th className="text-left py-1.5 px-2">Depo</th>
                <th className="text-right py-1.5 px-2">Sağlam</th>
                <th className="text-right py-1.5 px-2">Hasarlı</th>
                <th className="text-right py-1.5 px-2">Kayıp</th>
                <th className="text-right py-1.5 px-2">Satış</th>
                <th className="text-right py-1.5 px-2">Satış bedeli</th>
                <th className="text-center py-1.5 px-2">Ek</th>
                <th className="text-left py-1.5 px-2">Durum</th>
                <th className="text-right py-1.5 pl-2">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s) => {
                const cancelled = s.Status === 'CANCELLED';
                const expanded = expandedId === s.ReturnSlipId;
                const num = (n: number, cls: string) => (n > 0 ? <span className={cls}>{n}</span> : <span className="text-text-secondary/50">—</span>);
                return (
                  <Fragment key={s.ReturnSlipId}>
                    <tr
                      className={`border-b border-background-border/50 cursor-pointer hover:bg-background-panel ${cancelled ? 'opacity-60' : ''}`}
                      onClick={() => setExpandedId(expanded ? null : s.ReturnSlipId)}
                    >
                      <td className={`py-1.5 pr-2 font-medium ${cancelled ? 'line-through' : ''}`}>{s.ReturnSlipNo}</td>
                      <td className="py-1.5 px-2">{formatDate(s.ReturnDate)}</td>
                      <td className="py-1.5 px-2">{s.WarehouseName || '—'}</td>
                      <td className="text-right py-1.5 px-2">{num(s.SoundQuantity, 'text-green-400')}</td>
                      <td className="text-right py-1.5 px-2">{num(s.DamagedQuantity, 'text-red-300')}</td>
                      <td className="text-right py-1.5 px-2">{num(s.LostQuantity, 'text-red-300')}</td>
                      <td className="text-right py-1.5 px-2">{num(s.SoldQuantity, 'text-red-300')}</td>
                      <td className="text-right py-1.5 px-2 whitespace-nowrap">
                        {s.TotalCharge > 0 ? formatMoney(s.TotalCharge, currency) : '—'}
                      </td>
                      <td className="text-center py-1.5 px-2">
                        {(s.AttachmentCount ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-text-secondary">
                            <PaperclipIcon size={13} />
                            {s.AttachmentCount}
                          </span>
                        ) : (
                          <span className="text-text-secondary/50">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2">
                        {cancelled ? (
                          <span className="text-red-400" title={s.CancellationReason || undefined}>
                            İptal
                          </span>
                        ) : (
                          <span className="text-green-400">Aktif</span>
                        )}
                      </td>
                      <td className="text-right py-1.5 pl-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-background-secondary text-text-secondary hover:text-text-primary"
                          onClick={() => void openPdf(s)}
                          disabled={pdfLoadingId === s.ReturnSlipId}
                          title="İade fişi PDF"
                          aria-label={`${s.ReturnSlipNo} PDF`}
                        >
                          <FilePdfIcon size={16} />
                        </button>
                        {!cancelled && canCancel && (
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-background-secondary text-red-400"
                            onClick={() => setCancelTarget(s)}
                            title="Fişi iptal et"
                            aria-label={`${s.ReturnSlipNo} iptal et`}
                          >
                            <XCircleIcon size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-background-panel/60">
                        <td colSpan={11} className="px-3 py-2">
                          <table className="w-full text-[11px] mb-2">
                            <tbody>
                              {(s.items ?? []).map((it) => (
                                <tr key={it.ReturnSlipItemId}>
                                  <td className="py-0.5 pr-2">
                                    {it.ItemCode ? <span className="text-text-secondary mr-1">{it.ItemCode}</span> : null}
                                    {it.ItemName}
                                    {it.Notes ? <span className="text-text-secondary"> — {it.Notes}</span> : null}
                                  </td>
                                  <td className={`py-0.5 px-2 ${it.Condition === 'SOUND' ? 'text-green-400' : 'text-red-300'}`}>
                                    {RETURN_CONDITION_LABELS[it.Condition]}
                                  </td>
                                  <td className="py-0.5 px-2 text-right font-medium">{it.Quantity}</td>
                                  <td className="py-0.5 pl-2 text-right whitespace-nowrap">
                                    {it.ChargeAmount != null ? formatMoney(it.ChargeAmount, currency) : ''}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="text-[11px] text-text-secondary space-x-3">
                            {s.DeliveredByName && <span>Teslim eden: {s.DeliveredByName}</span>}
                            {s.VehiclePlate && <span>Plaka: {s.VehiclePlate}</span>}
                            {s.DriverName && <span>Şoför: {s.DriverName}</span>}
                            {s.ExternalWaybillNo && <span>İrsaliye: {s.ExternalWaybillNo}</span>}
                            {s.CreatedByName && <span>Düzenleyen: {s.CreatedByName}</span>}
                            {s.CreatedAt && <span>{formatDateTime(s.CreatedAt)}</span>}
                            {cancelled && (
                              <span className="text-red-400">
                                İptal: {s.CancelledAt ? formatDateTime(s.CancelledAt) : ''} — {s.CancellationReason}
                              </span>
                            )}
                          </div>
                          {s.Notes && <p className="mt-1 text-[11px]">Not: {s.Notes}</p>}
                          <div className="mt-3">
                            <AttachmentsPanel
                              entityType="RETURN_SLIP"
                              entityId={s.ReturnSlipId}
                              categories={['DAMAGE_PHOTO', 'SIGNED_WAYBILL', 'OTHER']}
                              title="Fiş belgeleri ve hasar fotoğrafları"
                              onCountChange={(count) => setAttachmentCount(s.ReturnSlipId, count)}
                            />
                          </div>
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

      {cancelTarget && (
        <CancelReturnSlipModal
          slip={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => {
            setCancelTarget(null);
            void load();
            void onChanged();
          }}
        />
      )}
      <PdfPreviewModal
        open={pdf != null}
        pdfUrl={pdf?.url ?? null}
        title={pdf ? `İade Fişi ${pdf.slip.ReturnSlipNo}` : 'İade Fişi'}
        downloadFileName={pdf ? `iade_fisi_${pdf.slip.ReturnSlipNo}.pdf` : 'iade_fisi.pdf'}
        onClose={() => setPdf(null)}
      />
    </div>
  );
}

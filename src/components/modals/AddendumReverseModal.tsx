import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '@phosphor-icons/react';
import type { Addendum, AddendumReversalPreview, ChangeType } from '../../models';
import { addendumService } from '../../services/addendumService';
import { getApiErrorMessage, getUserFacingApiErrorMessage } from '../../utils/apiError';
import { formatAddendumRefLabel, getChangeTypeLabel } from '../../utils/addendum';
import { formatDate, formatMoney } from '../../utils/formatters';
import { toast } from '../../hooks/useToast';

function todayDateInputValue(): string {
  return new Date().toISOString().split('T')[0];
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return todayDateInputValue();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayDateInputValue();
  return d.toISOString().split('T')[0];
}

function previewDetailLabel(d: AddendumReversalPreview['reversalDetails'][number]): string {
  if (d.ContractDetailDescription) return d.ContractDetailDescription;
  if (d.Description) return d.Description;
  if (d.ItemName) {
    const code = d.ItemCode ? `${d.ItemCode} — ` : '';
    return `${code}${d.ItemName}`;
  }
  if (d.ContractDetailId != null) return `Kalem #${d.ContractDetailId}`;
  if (d.ItemId != null) return `Ürün #${d.ItemId}`;
  return '—';
}

function skippedChangeTypeLabel(raw: string): string {
  const upper = String(raw || '').toUpperCase();
  if (upper === 'ADD' || upper === 'INCREASE' || upper === 'DECREASE' || upper === 'PRICE_CHANGE') {
    return getChangeTypeLabel(upper as ChangeType);
  }
  return raw || '—';
}

interface AddendumReverseModalProps {
  open: boolean;
  sourceAddendum: Addendum;
  onClose: () => void;
  /** Başarıda yeni taslak id */
  onCreated: (newAddendumId: number) => void | Promise<void>;
  zIndexClass?: string;
}

export default function AddendumReverseModal({
  open,
  sourceAddendum,
  onClose,
  onCreated,
  zIndexClass = 'z-[80]',
}: AddendumReverseModalProps) {
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<AddendumReversalPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const [reason, setReason] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(todayDateInputValue());
  const [addendumCode, setAddendumCode] = useState('');

  const sourceMinDate = toDateInputValue(sourceAddendum.EffectiveDate);
  const reasonOk = reason.trim().length >= 3;
  const dateOk = !effectiveDate || effectiveDate >= sourceMinDate;
  const canSubmit =
    reasonOk && dateOk && !isBusy && !loadingPreview && preview != null && preview.reversalDetails.length > 0;

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setPreviewError(null);
      setReason('');
      setEffectiveDate(todayDateInputValue());
      setAddendumCode('');
      setIsBusy(false);
      setLoadingPreview(false);
      return;
    }

    let cancelled = false;
    const boot = async () => {
      setLoadingPreview(true);
      setPreviewError(null);
      setPreview(null);
      const minDate = toDateInputValue(sourceAddendum.EffectiveDate);
      const today = todayDateInputValue();
      setEffectiveDate(today >= minDate ? today : minDate);
      try {
        const data = await addendumService.getReversalPreviewAsync(sourceAddendum.AddendumId);
        if (cancelled) return;
        setPreview(data);
        if (data.reversalDetails.length === 0) {
          setPreviewError('Tersine çevirme üretilemez');
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Reversal preview error:', error);
        const msg = getApiErrorMessage(error) || 'Önizleme yüklenemedi';
        setPreviewError(msg);
        const status = (error as { status?: number })?.status;
        if (status === 409 || status === 400) {
          toast.error(msg);
        } else {
          toast.error(getUserFacingApiErrorMessage(error, 'addendum'));
        }
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [open, sourceAddendum.AddendumId, sourceAddendum.EffectiveDate]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!canSubmit || !preview) return;
    if (!reasonOk) {
      toast.warning('Neden en az 3 karakter olmalıdır');
      return;
    }
    if (!dateOk) {
      toast.warning('Geçerlilik tarihi kaynak zeyilnameden önce olamaz');
      return;
    }
    try {
      setIsBusy(true);
      const body: { Reason: string; EffectiveDate?: string; AddendumCode?: string } = {
        Reason: reason.trim(),
      };
      if (effectiveDate) {
        body.EffectiveDate = new Date(effectiveDate).toISOString();
      }
      if (addendumCode.trim()) {
        body.AddendumCode = addendumCode.trim();
      }
      const result = await addendumService.reverseAsync(sourceAddendum.AddendumId, body);
      toast.success('Ters zeyilname taslağı oluşturuldu');
      await Promise.resolve(onCreated(result.addendum.AddendumId));
      onClose();
    } catch (error) {
      console.error('Create reversal error:', error);
      const status = (error as { status?: number })?.status;
      const msg = getApiErrorMessage(error);
      if (status === 409 || status === 400) {
        toast.error(msg || 'Tersine çevirme oluşturulamadı');
        if (status === 409) onClose();
      } else {
        toast.error(getUserFacingApiErrorMessage(error, 'addendum'));
      }
    } finally {
      setIsBusy(false);
    }
  };

  const sourceLabel = formatAddendumRefLabel({
    number: sourceAddendum.AddendumNo,
    code: sourceAddendum.AddendumCode,
    id: sourceAddendum.AddendumId,
  });

  const modalTree = (
    <div className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-4`}>
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => !isBusy && !loadingPreview && onClose()}
        aria-hidden
      />
      <div
        className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-background-border bg-background-panel shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="addendum-reverse-title"
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-background-border shrink-0">
          <div className="min-w-0">
            <h2 id="addendum-reverse-title" className="text-lg font-semibold text-text-primary">
              Tersine Çevir — {sourceLabel}
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Önizlemeyi kontrol edin, ardından taslak ters zeyilname oluşturun. Onay mevcut
              akışla yapılır.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
            aria-label="Kapat"
            disabled={isBusy}
          >
            <XIcon size={20} weight="regular" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <section className="rounded-xl border border-background-border bg-background-main/40 px-4 py-3 text-sm space-y-1">
            <div className="font-medium text-text-primary">Kaynak zeyilname</div>
            <div className="text-text-secondary flex flex-wrap gap-x-4 gap-y-1">
              <span>
                No:{' '}
                {preview?.sourceAddendumNumber != null
                  ? `#${preview.sourceAddendumNumber}`
                  : sourceLabel}
              </span>
              <span>
                Kod:{' '}
                {preview?.sourceAddendumCode || sourceAddendum.AddendumCode || '—'}
              </span>
              <span>
                Geçerlilik:{' '}
                {sourceAddendum.EffectiveDate
                  ? formatDate(sourceAddendum.EffectiveDate)
                  : '—'}
              </span>
            </div>
          </section>

          {loadingPreview ? (
            <div className="text-center py-10 text-text-secondary text-sm">Önizleme yükleniyor...</div>
          ) : previewError && (!preview || preview.reversalDetails.length === 0) ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-900/15 px-4 py-8 text-center space-y-2">
              <p className="text-sm text-amber-100 font-medium">Tersine çevirme üretilemez</p>
              <p className="text-xs text-amber-200/80">{previewError}</p>
            </div>
          ) : preview ? (
            <>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-text-primary">Önerilen ters kalemler</h3>
                {preview.reversalDetails.length === 0 ? (
                  <div className="rounded-xl border border-background-border px-4 py-6 text-center text-sm text-text-secondary">
                    Tersine çevirme üretilemez
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-background-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-text-secondary bg-background-main/50 border-b border-background-border">
                          <th className="px-3 py-2 font-medium">Tip</th>
                          <th className="px-3 py-2 font-medium">Açıklama</th>
                          <th className="px-3 py-2 font-medium">Miktar</th>
                          <th className="px-3 py-2 font-medium">Fiyat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.reversalDetails.map((d, idx) => (
                          <tr
                            key={`rev-${idx}-${d.ChangeType}-${d.ContractDetailId ?? 'x'}-${d.ItemId ?? 'x'}`}
                            className="border-b border-background-border/60"
                          >
                            <td className="px-3 py-2 whitespace-nowrap">
                              {getChangeTypeLabel(d.ChangeType)}
                            </td>
                            <td className="px-3 py-2">{previewDetailLabel(d)}</td>
                            <td className="px-3 py-2">
                              {d.QuantityChange != null ? d.QuantityChange : '—'}
                            </td>
                            <td className="px-3 py-2">
                              {d.NewUnitPrice != null
                                ? formatMoney(d.NewUnitPrice)
                                : d.NewMonthlyOverride != null
                                  ? `Aylık: ${formatMoney(d.NewMonthlyOverride)}`
                                  : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {preview.warnings.length > 0 && (
                <section className="rounded-xl border border-amber-500/40 bg-amber-900/15 px-4 py-3 space-y-2">
                  <h3 className="text-sm font-semibold text-amber-200">Uyarılar</h3>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-amber-100/90">
                    {preview.warnings.map((w) => (
                      <li key={`w-${w.sourceDetailId}-${w.message}`}>
                        {w.message || `Kalem #${w.sourceDetailId}`}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {preview.skipped.length > 0 && (
                <section className="rounded-xl border border-slate-500/40 bg-slate-800/30 px-4 py-3 space-y-2">
                  <h3 className="text-sm font-semibold text-slate-300">Atlanacak kalemler</h3>
                  <ul className="space-y-1.5 text-xs text-slate-400">
                    {preview.skipped.map((s) => (
                      <li key={`s-${s.sourceDetailId}-${s.changeType}`}>
                        <span className="text-slate-300">
                          #{s.sourceDetailId}
                          {s.changeType ? ` (${skippedChangeTypeLabel(s.changeType)})` : ''}
                        </span>
                        {s.reason ? ` — ${s.reason}` : ''}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="rounded-xl border border-background-border bg-background-main/40 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-text-primary">Taslak bilgileri</h3>
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">
                    Neden *
                  </label>
                  <textarea
                    className="input w-full min-h-[80px]"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={isBusy}
                    placeholder="Örn: Malzeme iade edildi (min. 3 karakter)"
                  />
                  {reason.trim().length > 0 && !reasonOk && (
                    <p className="text-[11px] text-red-300 mt-1">En az 3 karakter girin</p>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-text-primary mb-1">
                      Geçerlilik Tarihi (opsiyonel)
                    </label>
                    <input
                      type="date"
                      className="input w-full"
                      value={effectiveDate}
                      min={sourceMinDate}
                      onChange={(e) => setEffectiveDate(e.target.value)}
                      disabled={isBusy}
                    />
                    {!dateOk && (
                      <p className="text-[11px] text-red-300 mt-1">
                        Kaynak geçerlilik tarihinden ({formatDate(sourceAddendum.EffectiveDate)}) önce
                        olamaz
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-primary mb-1">
                      Zeyilname Kodu (opsiyonel)
                    </label>
                    <input
                      type="text"
                      className="input w-full"
                      value={addendumCode}
                      onChange={(e) => setAddendumCode(e.target.value)}
                      disabled={isBusy}
                      placeholder="Örn: ZEY-TERS-001"
                    />
                  </div>
                </div>
              </section>
            </>
          ) : null}
        </div>

        <footer className="shrink-0 flex flex-wrap items-center justify-end gap-2 px-5 py-4 border-t border-background-border">
          <button type="button" className="btn-secondary" disabled={isBusy} onClick={onClose}>
            Vazgeç
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canSubmit}
            title={
              !reasonOk
                ? 'Neden en az 3 karakter olmalıdır'
                : !dateOk
                  ? 'Geçerlilik tarihi kaynak tarihten önce olamaz'
                  : preview && preview.reversalDetails.length === 0
                    ? 'Tersine çevirme üretilemez'
                    : undefined
            }
            onClick={() => void handleSubmit()}
          >
            {isBusy ? 'Oluşturuluyor...' : 'Taslak Oluştur'}
          </button>
        </footer>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalTree, document.body) : null;
}

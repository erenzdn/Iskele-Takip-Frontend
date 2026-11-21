import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowCounterClockwiseIcon,
  CalendarXIcon,
  ClockCounterClockwiseIcon,
  PencilSimpleIcon,
  ProhibitIcon,
  WarehouseIcon,
  WarningIcon,
  XIcon,
} from '@phosphor-icons/react';
import { usePortalTarget } from '../tabs/TabContext';
import { isContractActive, type Shipment, type ShipmentMutationResult } from '../../models';
import { shipmentService } from '../../services/shipmentService';
import { contractService } from '../../services/contractService';
import { toast } from '../../hooks/useToast';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatDate, formatDateTime } from '../../utils/formatters';

interface CancelShipmentModalProps {
  shipment: Shipment;
  onClose: () => void;
  onCancelled: (result: ShipmentMutationResult) => void;
  /**
   * Verilirse "Sadece bilgi mi yanlış?" ipucunda "Fişi düzenle" düğmesi çıkar; pencere kapanır
   * ve düzenleme açılır. Plaka/miktar düzeltmesi için iptal + yeni fiş gerekmez.
   */
  onEditInstead?: () => void;
}

/** Sık kullanılan gerekçeler — tıklayınca gerekçe kutusuna yazılır, sonra düzenlenebilir */
const QUICK_REASONS = [
  'Sevkiyat yapılmadı (araç çıkmadı)',
  'Mükerrer fiş (aynı sevk iki kez girildi)',
  'Yanlış sözleşmeye kesildi',
  'Müşteri sevkiyatı istemedi',
];

const MIN_REASON = 3;

/**
 * Sevkiyat fişi iptali (gerekçe zorunlu). Fiş silinmez; stok etkisi tersine çevrilir ve
 * kira tahakkuku yeniden hesaplanır. Açılışta fişin güncel hâli ve sözleşmesi yüklenir;
 * backend'in reddedeceği durumlar (sözleşme kapalı, iade yapılmış) önceden gösterilir.
 */
export default function CancelShipmentModal({ shipment: initial, onClose, onCancelled, onEditInstead }: CancelShipmentModalProps) {
  const portalTarget = usePortalTarget();
  const [shipment, setShipment] = useState<Shipment>(initial);
  const [contractInactive, setContractInactive] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [reason, setReason] = useState('');
  const [deliveredAck, setDeliveredAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  // Güncel fiş (kalemler, teslim/iade durumu) ve sözleşme durumu
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [fresh, contract] = await Promise.all([
          shipmentService.getByIdAsync(initial.ShipmentId),
          contractService.getByIdAsync(initial.ContractId).catch(() => null),
        ]);
        if (!alive) return;
        setShipment(fresh);
        if (contract) setContractInactive(!isContractActive(contract));
      } catch {
        // Ayrıntılar yüklenemese de iptal denenebilir; backend son kontrolü yapar.
      } finally {
        if (alive) setLoadingDetails(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [initial.ShipmentId, initial.ContractId]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isSubmitting, onClose]);

  const items = shipment.items ?? [];
  const totalQty = shipment.TotalQuantity ?? items.reduce((s, it) => s + (Number(it.Quantity) || 0), 0);
  const isDelivered = Boolean(shipment.DeliveredAt);
  const alreadyCancelled = shipment.Status === 'CANCELLED';

  /** İptal sonrası sevk, iade edilenin altına düşecek kalemler (backend reddeder) */
  const returnConflicts = useMemo(
    () =>
      items.filter((it) => {
        if (it.CurrentShippedQuantity == null || it.ReturnedQuantity == null) return false;
        return Number(it.CurrentShippedQuantity) - Number(it.Quantity) < Number(it.ReturnedQuantity);
      }),
    [items]
  );

  const blocker: string | null = alreadyCancelled
    ? 'Bu fiş zaten iptal edilmiş.'
    : contractInactive
      ? 'Sözleşme aktif değil (tamamlanmış, iptal ya da arşivlenmiş). Kapalı sözleşmenin sevkiyatı iptal edilemez.'
      : returnConflicts.length > 0
        ? `Bu sevkiyattaki malzemenin bir kısmı müşteriden iade alınmış (${returnConflicts
            .map((it) => it.ItemName || it.ItemCode || `#${it.ItemId}`)
            .join(', ')}). Önce ilgili iade fişlerini düzeltin ya da iptal edin.`
        : null;

  const reasonOk = reason.trim().length >= MIN_REASON;
  const canSubmit = !blocker && reasonOk && (!isDelivered || deliveredAck) && !isSubmitting && !loadingDetails;

  const pickReason = (text: string) => {
    setReason(text);
    if (error) setError(null);
    reasonRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || blocker) return;
    if (!reasonOk) {
      setError(`İptal gerekçesi en az ${MIN_REASON} karakter olmalıdır.`);
      reasonRef.current?.focus();
      return;
    }
    if (isDelivered && !deliveredAck) {
      setError('Teslim edilmiş fişi iptal etmek için onay kutusunu işaretleyin.');
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      const result = await shipmentService.cancelAsync(shipment.ShipmentId, reason.trim());
      toast.success(`${shipment.ShipmentNo} iptal edildi. ${totalQty} adet malzeme depoya geri alındı.`);
      if (result.warnings?.length) toast.warning(result.warnings.join('\n'));
      onCancelled(result);
    } catch (err) {
      setError(getApiErrorMessage(err) || 'Sevkiyat fişi iptal edilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const warehouse = shipment.WarehouseName || 'depo';

  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black bg-opacity-50 p-4 animate-in fade-in duration-200">
      <div
        className="bg-background-panel rounded-panel shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-shipment-title"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-background-border">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="shrink-0 rounded-full bg-red-500/15 p-1.5 text-red-400">
              <ProhibitIcon size={20} />
            </div>
            <div className="min-w-0">
              <h2 id="cancel-shipment-title" className="text-lg font-semibold text-text-primary leading-tight">
                Sevkiyat fişini iptal et
              </h2>
              <p className="text-xs text-text-secondary mt-0.5 truncate">
                <span className="font-medium text-text-primary">{shipment.ShipmentNo}</span>
                {' · '}
                {shipment.ContractCode || `#${shipment.ContractId}`}
                {shipment.CustomerName ? ` · ${shipment.CustomerName}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-background-secondary rounded-lg transition-colors text-text-secondary hover:text-text-primary"
            disabled={isSubmitting}
            aria-label="Kapat"
          >
            <XIcon size={20} />
          </button>
        </div>

        <form id="cancel-shipment-form" onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto">
          {/* 1) İptal edilecek fiş */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5">İptal edilecek fiş</h3>
            <div className="rounded border border-background-border bg-background-surface">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-2 text-xs">
                <div className="flex gap-1.5">
                  <dt className="text-text-secondary">Sevk tarihi:</dt>
                  <dd className="font-medium">{formatDate(shipment.ShipmentDate)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-text-secondary">Depo:</dt>
                  <dd className="font-medium truncate">{shipment.WarehouseName || '—'}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-text-secondary">Araç:</dt>
                  <dd className="font-medium truncate">
                    {[shipment.VehiclePlate, shipment.DriverName].filter(Boolean).join(' · ') || '—'}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-text-secondary">Durum:</dt>
                  <dd className={`font-medium ${isDelivered ? 'text-green-400' : 'text-amber-300'}`}>
                    {alreadyCancelled ? 'İptal' : isDelivered ? 'Teslim edildi' : 'Teslim bekliyor'}
                  </dd>
                </div>
              </dl>
              <div className="border-t border-background-border">
                {loadingDetails && items.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-text-secondary">Kalemler yükleniyor...</p>
                ) : items.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-text-secondary">Toplam {totalQty} adet</p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.ShipmentItemId} className="border-b border-background-border/50 last:border-b-0">
                          <td className="px-3 py-1">
                            {it.ItemCode && <span className="text-text-secondary mr-1">{it.ItemCode}</span>}
                            {it.ItemName}
                          </td>
                          <td className="px-3 py-1 text-right font-medium whitespace-nowrap">
                            {it.Quantity} {it.UnitName || 'adet'}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-background-hover/60">
                        <td className="px-3 py-1 font-medium">Toplam</td>
                        <td className="px-3 py-1 text-right font-semibold whitespace-nowrap">{totalQty} adet</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>

          {blocker ? (
            <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm flex gap-2" role="alert">
              <ProhibitIcon size={18} className="shrink-0 mt-0.5 text-red-400" />
              <div>
                <p className="font-medium text-red-400">Bu fiş iptal edilemez</p>
                <p className="mt-1 text-text-primary">{blocker}</p>
              </div>
            </div>
          ) : (
            <>
              {/* 2) İptal edince ne olur */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5">İptal edince ne olur?</h3>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex gap-2">
                    <WarehouseIcon size={16} className="shrink-0 mt-0.5 text-text-secondary" />
                    <span>
                      <span className="font-medium">{totalQty} adet</span> malzeme <span className="font-medium">{warehouse}</span>{' '}
                      stoğuna geri girer.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <ArrowCounterClockwiseIcon size={16} className="shrink-0 mt-0.5 text-text-secondary" />
                    <span>Malzeme sözleşmede yeniden “sevk bekliyor” olur; istenirse daha sonra yeni fiş kesilebilir.</span>
                  </li>
                  <li className="flex gap-2">
                    <CalendarXIcon size={16} className="shrink-0 mt-0.5 text-text-secondary" />
                    <span>
                      Bu partinin {formatDate(shipment.ShipmentDate)} tarihinden başlayan kirası hesaptan çıkar. Fatura kesilmiş bir
                      dönemle çakışırsa ayrıca uyarı gösterilir.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <ClockCounterClockwiseIcon size={16} className="shrink-0 mt-0.5 text-text-secondary" />
                    <span>Fiş silinmez; listede üstü çizili “İptal” olarak gerekçesiyle kalır. İptal geri alınamaz.</span>
                  </li>
                </ul>
              </section>

              {onEditInstead && (
                <div className="rounded border border-background-border bg-background-surface px-3 py-2 text-xs flex items-center justify-between gap-3">
                  <span className="text-text-secondary">
                    Sevkiyat gerçekten yapıldı da yalnızca <span className="text-text-primary">miktar, tarih, depo veya araç</span> bilgisi mi
                    yanlış? İptal etmeden düzeltebilirsiniz.
                  </span>
                  <button
                    type="button"
                    className="btn-secondary py-1 px-2 text-xs inline-flex items-center gap-1 shrink-0"
                    onClick={onEditInstead}
                    disabled={isSubmitting}
                  >
                    <PencilSimpleIcon size={14} />
                    Fişi düzenle
                  </button>
                </div>
              )}

              {isDelivered && (
                <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200 flex gap-2" role="alert">
                  <WarningIcon size={18} className="shrink-0 mt-0.5 text-amber-300" />
                  <div>
                    <p className="font-medium text-amber-300">Bu fiş müşteriye teslim edilmiş.</p>
                    <p className="mt-1">
                      {formatDateTime(shipment.DeliveredAt!)} tarihinde{' '}
                      <span className="font-medium">{shipment.DeliveredReceiverName || 'müşteri'}</span> teslim aldı
                      {shipment.HasSignedWaybill ? ' ve imzalı irsaliyesi ekli' : ''}. Malzeme hâlâ şantiyedeyse iptal stok ve kirayı
                      bozar. Malzeme sahadan döndüyse iptal yerine <span className="font-medium">iade fişi</span> girin.
                    </p>
                    <label className="mt-2 flex items-start gap-2 cursor-pointer select-none text-text-primary">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={deliveredAck}
                        onChange={(e) => {
                          setDeliveredAck(e.target.checked);
                          if (error) setError(null);
                        }}
                        disabled={isSubmitting}
                      />
                      <span>Malzemenin şantiyeye hiç gitmediğini / kaydın hatalı olduğunu biliyorum, yine de iptal et.</span>
                    </label>
                  </div>
                </div>
              )}

              {/* 3) Gerekçe */}
              <section>
                <label className="block text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1.5" htmlFor="cancel-shipment-reason">
                  İptal gerekçesi <span className="text-red-400">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {QUICK_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => pickReason(r)}
                      disabled={isSubmitting}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                        reason === r
                          ? 'border-accent bg-accent/20 text-accent'
                          : 'border-background-border text-text-secondary hover:bg-background-hover hover:text-text-primary'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <textarea
                  id="cancel-shipment-reason"
                  ref={reasonRef}
                  className="input w-full min-h-[64px]"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Yukarıdan seçin ya da kendiniz yazın"
                  maxLength={500}
                  disabled={isSubmitting}
                  autoFocus
                />
                <p className="mt-1 text-[11px] text-text-secondary">Gerekçe fişin geçmişinde görünür.</p>
              </section>
            </>
          )}

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
        </form>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-background-border">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
            {blocker ? 'Kapat' : 'Vazgeç, fiş kalsın'}
          </button>
          {!blocker && (
            <button
              type="submit"
              form="cancel-shipment-form"
              className="btn-danger inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!canSubmit}
              title={!reasonOk ? 'Önce iptal gerekçesi girin' : isDelivered && !deliveredAck ? 'Önce onay kutusunu işaretleyin' : undefined}
            >
              <ProhibitIcon size={16} />
              {isSubmitting ? 'İptal ediliyor...' : `${shipment.ShipmentNo} fişini iptal et`}
            </button>
          )}
        </div>
      </div>
    </div>,
    portalTarget
  );
}

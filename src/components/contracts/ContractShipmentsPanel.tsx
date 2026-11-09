import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircleIcon, FilePdfIcon, PaperclipIcon, PlusIcon, TruckIcon, XCircleIcon } from '@phosphor-icons/react';
import type { Attachment, Contract, InventoryContractLineItem, Shipment } from '../../models';
import { shipmentService } from '../../services/shipmentService';
import { useAuthStore } from '../../store/authStore';
import { getApiErrorMessage } from '../../utils/apiError';
import { toast } from '../../hooks/useToast';
import { formatDate, formatDateTime } from '../../utils/formatters';
import { getLineShipmentProgress, getRentalStartIso, getShipmentState, SHIPMENT_STATE_LABELS } from '../../utils/shipment';
import { useShipmentPdfPreview } from '../../hooks/useShipmentPdfPreview';
import CreateShipmentModal from '../modals/CreateShipmentModal';
import CancelShipmentModal from '../modals/CancelShipmentModal';
import AttachmentsPanel from '../attachments/AttachmentsPanel';
import ConfirmDeliveryModal from '../modals/ConfirmDeliveryModal';
import ConfirmModal from '../modals/ConfirmModal';
import DeliveryStatusBadge from '../shipments/DeliveryStatusBadge';

interface ContractShipmentsPanelProps {
  contract: Contract;
  /** Sözleşmenin envanter satırları (ShippedQuantity dahil) */
  lines: InventoryContractLineItem[];
  /** Sözleşme aktif mi (sevk/iptal yalnızca aktif sözleşmede) */
  canEdit: boolean;
  /** Fiş oluşturma/iptal sonrası sözleşme yeniden yüklensin */
  onChanged: () => void | Promise<void>;
}

export default function ContractShipmentsPanel({ contract, lines, canEdit, onChanged }: ContractShipmentsPanelProps) {
  const user = useAuthStore((state) => state.user);
  const canCreate = Boolean(user?.permissions?.includes('shipments_create'));
  const canCancel = Boolean(user?.permissions?.includes('shipments_cancel'));
  // Teslim onayı sözleşme tamamlanmış olsa da verilebilir (kanıt sonradan gelebilir)
  const canConfirmDelivery = Boolean(user?.permissions?.includes('shipments_confirm_delivery'));

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Shipment | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deliveryTarget, setDeliveryTarget] = useState<Shipment | null>(null);
  const [undoTarget, setUndoTarget] = useState<Shipment | null>(null);
  const [undoing, setUndoing] = useState(false);
  const { openPreview, loadingId: pdfLoadingId, element: pdfPreviewElement } = useShipmentPdfPreview();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      setShipments(await shipmentService.listByContractAsync(contract.ContractId));
    } catch (err) {
      setLoadError(getApiErrorMessage(err) || 'Sevkiyatlar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [contract.ContractId]);

  useEffect(() => {
    void load();
  }, [load]);

  const progressRows = useMemo(
    () => lines.map((line) => ({ line, progress: getLineShipmentProgress(line, contract) })),
    [lines, contract]
  );
  const totals = progressRows.reduce(
    (acc, { progress }) => ({
      contracted: acc.contracted + progress.contracted,
      shipped: acc.shipped + progress.shipped,
      returned: acc.returned + progress.returned,
      onSite: acc.onSite + progress.onSite,
      pending: acc.pending + progress.pending,
    }),
    { contracted: 0, shipped: 0, returned: 0, onSite: 0, pending: 0 }
  );
  const state = getShipmentState(contract);
  const rentalStart = getRentalStartIso(contract);
  const shippedPct = totals.contracted > 0 ? Math.round((totals.shipped / totals.contracted) * 100) : 0;

  /** Ek yüklenince/silinince satırdaki ataç sayacını ve irsaliye işaretini yerinde güncelle */
  const syncAttachments = useCallback((shipmentId: number, items: Attachment[]) => {
    const count = items.length;
    const hasSigned = items.some((a) => a.Category === 'SIGNED_WAYBILL');
    setShipments((prev) =>
      prev.map((s) =>
        s.ShipmentId === shipmentId && (s.AttachmentCount !== count || Boolean(s.HasSignedWaybill) !== hasSigned)
          ? { ...s, AttachmentCount: count, HasSignedWaybill: hasSigned }
          : s
      )
    );
  }, []);

  /** Teslim onayı kira/stok etkilemez: sözleşmeyi yeniden yüklemeden yalnızca fişi değiştir */
  const replaceShipment = (updated: Shipment) => {
    setShipments((prev) => prev.map((s) => (s.ShipmentId === updated.ShipmentId ? { ...s, ...updated, items: s.items } : s)));
  };

  const undoDelivery = async () => {
    if (!undoTarget) return;
    try {
      setUndoing(true);
      replaceShipment(await shipmentService.undoDeliveryAsync(undoTarget.ShipmentId));
      toast.success(`${undoTarget.ShipmentNo} teslim onayı geri alındı.`);
      setUndoTarget(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Teslim onayı geri alınamadı.');
    } finally {
      setUndoing(false);
    }
  };

  const afterMutation = async () => {
    await load();
    await onChanged();
  };

  return (
    <div className="p-4 space-y-4">
      {/* Özet */}
      <div className="p-4 bg-background-elevated rounded-lg border border-background-border">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <TruckIcon size={16} /> Sevkiyat durumu
              {state !== 'not_applicable' && (
                <span
                  className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                    state === 'shipped' ? 'bg-green-600/20 text-green-400' : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {SHIPMENT_STATE_LABELS[state]}
                </span>
              )}
            </h4>
            <p className="text-xs text-text-secondary mt-1">
              {rentalStart
                ? `Kira başlangıcı (ilk sevk): ${formatDate(rentalStart)}. Her sevk partisi kendi tarihinden en az 30 gün faturalanır.`
                : 'Henüz sevk yok — kira ilk sevkiyat fişiyle başlar. Malzeme depoda bu sözleşmeye rezerve.'}
            </p>
          </div>
          {canEdit && canCreate && totals.pending > 0 && (
            <button
              type="button"
              className="btn-primary py-1.5 px-3 text-sm flex items-center gap-1.5"
              onClick={() => setShowCreate(true)}
            >
              <PlusIcon size={14} /> Sevkiyat fişi oluştur
            </button>
          )}
        </div>

        <div className="mb-3">
          <div className="flex justify-between text-xs text-text-secondary mb-1">
            <span>
              Sevk edilen {totals.shipped} / {totals.contracted}
            </span>
            <span>%{shippedPct}</span>
          </div>
          <div className="h-2 rounded-full bg-background-panel overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: `${shippedPct}%` }} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-text-secondary">
              <tr className="border-b border-background-border">
                <th className="text-left py-1.5 pr-2">Malzeme</th>
                <th className="text-right py-1.5 px-2">Sözleşme</th>
                <th className="text-right py-1.5 px-2">Sevk edilen</th>
                <th className="text-right py-1.5 px-2">İade</th>
                <th className="text-right py-1.5 px-2">Sahada</th>
                <th className="text-right py-1.5 pl-2">Sevk bekleyen</th>
              </tr>
            </thead>
            <tbody>
              {progressRows.map(({ line, progress }) => (
                <tr key={line.DetailId} className="border-b border-background-border/50">
                  <td className="py-1.5 pr-2">
                    {line.ItemCode ? <span className="text-text-secondary mr-1">{line.ItemCode}</span> : null}
                    {line.ItemName}
                  </td>
                  <td className="text-right py-1.5 px-2">{progress.contracted}</td>
                  <td className="text-right py-1.5 px-2">{progress.shipped}</td>
                  <td className="text-right py-1.5 px-2">{progress.returned}</td>
                  <td className="text-right py-1.5 px-2 font-medium">{progress.onSite}</td>
                  <td className={`text-right py-1.5 pl-2 ${progress.pending > 0 ? 'text-amber-300 font-medium' : 'text-text-secondary'}`}>
                    {progress.pending}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-1.5 pr-2">Toplam</td>
                <td className="text-right py-1.5 px-2">{totals.contracted}</td>
                <td className="text-right py-1.5 px-2">{totals.shipped}</td>
                <td className="text-right py-1.5 px-2">{totals.returned}</td>
                <td className="text-right py-1.5 px-2">{totals.onSite}</td>
                <td className="text-right py-1.5 pl-2">{totals.pending}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Fiş geçmişi */}
      <div className="p-4 bg-background-elevated rounded-lg border border-background-border">
        <h4 className="text-sm font-semibold mb-3">Sevkiyat fişleri</h4>
        {loading ? (
          <p className="text-xs text-text-secondary">Yükleniyor…</p>
        ) : loadError ? (
          <p className="text-xs text-red-400">{loadError}</p>
        ) : shipments.length === 0 ? (
          <p className="text-xs text-text-secondary">Bu sözleşme için henüz sevkiyat fişi kesilmedi.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-text-secondary">
                <tr className="border-b border-background-border">
                  <th className="text-left py-1.5 pr-2">Fiş no</th>
                  <th className="text-left py-1.5 px-2">Sevk tarihi</th>
                  <th className="text-left py-1.5 px-2">Depo</th>
                  <th className="text-right py-1.5 px-2">Miktar</th>
                  <th className="text-left py-1.5 px-2">Araç / Şoför</th>
                  <th className="text-left py-1.5 px-2">Durum</th>
                  <th className="text-center py-1.5 px-2" title="Dosya ekleri (imzalı irsaliye, fotoğraf)">Ek</th>
                  <th className="text-right py-1.5 pl-2">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => {
                  const cancelled = s.Status === 'CANCELLED';
                  const expanded = expandedId === s.ShipmentId;
                  return (
                    <Fragment key={s.ShipmentId}>
                      <tr
                        className={`border-b border-background-border/50 cursor-pointer hover:bg-background-panel ${cancelled ? 'opacity-60' : ''}`}
                        onClick={() => setExpandedId(expanded ? null : s.ShipmentId)}
                      >
                        <td className={`py-1.5 pr-2 font-medium ${cancelled ? 'line-through' : ''}`}>{s.ShipmentNo}</td>
                        <td className="py-1.5 px-2">{formatDate(s.ShipmentDate)}</td>
                        <td className="py-1.5 px-2">{s.WarehouseName || '—'}</td>
                        <td className="text-right py-1.5 px-2">{s.TotalQuantity ?? 0}</td>
                        <td className="py-1.5 px-2 text-text-secondary">
                          {[s.VehiclePlate, s.DriverName].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="py-1.5 px-2">
                          <DeliveryStatusBadge shipment={s} />
                        </td>
                        <td className="text-center py-1.5 px-2">
                          {(s.AttachmentCount ?? 0) > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-text-secondary" title={`${s.AttachmentCount} dosya eki`}>
                              <PaperclipIcon size={13} />
                              {s.AttachmentCount}
                            </span>
                          ) : (
                            <span className="text-text-secondary/50">—</span>
                          )}
                        </td>
                        <td className="text-right py-1.5 pl-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-background-secondary text-text-secondary hover:text-text-primary"
                            onClick={() => void openPreview(s)}
                            disabled={pdfLoadingId === s.ShipmentId}
                            title="Sevk fişi PDF"
                            aria-label={`${s.ShipmentNo} PDF`}
                          >
                            <FilePdfIcon size={16} />
                          </button>
                          {!cancelled && !s.DeliveredAt && canConfirmDelivery && (
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-background-secondary text-green-400"
                              onClick={() => setDeliveryTarget(s)}
                              title="Teslimi onayla"
                              aria-label={`${s.ShipmentNo} teslimi onayla`}
                            >
                              <CheckCircleIcon size={16} />
                            </button>
                          )}
                          {!cancelled && canEdit && canCancel && (
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-background-secondary text-red-400"
                              onClick={() => setCancelTarget(s)}
                              title="Fişi iptal et"
                              aria-label={`${s.ShipmentNo} iptal et`}
                            >
                              <XCircleIcon size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-background-panel/60">
                          <td colSpan={8} className="px-3 py-2">
                            <ul className="space-y-0.5">
                              {(s.items ?? []).map((it) => (
                                <li key={it.ShipmentItemId} className="flex justify-between gap-3">
                                  <span>
                                    {it.ItemCode ? <span className="text-text-secondary mr-1">{it.ItemCode}</span> : null}
                                    {it.ItemName}
                                  </span>
                                  <span className="font-medium">{it.Quantity}</span>
                                </li>
                              ))}
                            </ul>
                            <div className="mt-2 text-[11px] text-text-secondary space-x-3">
                              {s.ReceiverName && <span>Teslim alan: {s.ReceiverName}</span>}
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
                            {!cancelled && (
                              <div className="mt-3 rounded border border-background-border bg-background-panel px-2.5 py-2 text-[11px] flex flex-wrap items-center gap-x-3 gap-y-1">
                                {s.DeliveredAt ? (
                                  <>
                                    <span className="font-semibold text-green-400">Teslim edildi</span>
                                    <span>{formatDateTime(s.DeliveredAt)}</span>
                                    <span>
                                      Teslim alan: {s.DeliveredReceiverName}
                                      {s.DeliveredReceiverTitle ? ` (${s.DeliveredReceiverTitle})` : ''}
                                    </span>
                                    {s.DeliveryConfirmedByName && (
                                      <span className="text-text-secondary">Onaylayan: {s.DeliveryConfirmedByName}</span>
                                    )}
                                    {s.DeliveryNotes && <span className="basis-full">Teslim notu: {s.DeliveryNotes}</span>}
                                  </>
                                ) : (
                                  <span className="text-sky-300">
                                    Teslim onayı bekliyor. İmzalı irsaliye geldiğinde teslimi onaylayın.
                                  </span>
                                )}
                                {canConfirmDelivery && (
                                  <span className="ml-auto flex gap-1.5">
                                    <button
                                      type="button"
                                      className={`${s.DeliveredAt ? 'btn-secondary' : 'btn-primary'} py-0.5 px-2 text-xs`}
                                      onClick={() => setDeliveryTarget(s)}
                                    >
                                      {s.DeliveredAt ? 'Düzelt' : 'Teslimi onayla'}
                                    </button>
                                    {s.DeliveredAt && (
                                      <button
                                        type="button"
                                        className="btn-secondary py-0.5 px-2 text-xs text-red-400"
                                        onClick={() => setUndoTarget(s)}
                                      >
                                        Onayı geri al
                                      </button>
                                    )}
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="mt-3">
                              <AttachmentsPanel
                                entityType="SHIPMENT"
                                entityId={s.ShipmentId}
                                categories={['SIGNED_WAYBILL', 'DELIVERY_PHOTO', 'OTHER']}
                                title="Teslim belgeleri"
                                onItemsChange={(items) => syncAttachments(s.ShipmentId, items)}
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
      </div>

      {showCreate && (
        <CreateShipmentModal
          contract={contract}
          lines={lines}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void afterMutation();
          }}
        />
      )}
      {cancelTarget && (
        <CancelShipmentModal
          shipment={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => {
            setCancelTarget(null);
            void afterMutation();
          }}
        />
      )}
      {deliveryTarget && (
        <ConfirmDeliveryModal
          shipment={deliveryTarget}
          onClose={() => setDeliveryTarget(null)}
          onAttachmentsChanged={(items) => syncAttachments(deliveryTarget.ShipmentId, items)}
          onConfirmed={(updated) => {
            replaceShipment(updated);
            setDeliveryTarget(null);
          }}
        />
      )}
      <ConfirmModal
        open={undoTarget != null}
        title="Teslim onayı geri alınsın mı?"
        message={
          undoTarget
            ? `${undoTarget.ShipmentNo} yeniden "Teslim bekliyor" durumuna döner. Eklenen dosyalar silinmez.`
            : ''
        }
        confirmLabel="Geri al"
        cancelLabel="Vazgeç"
        variant="danger"
        loading={undoing}
        onConfirm={() => void undoDelivery()}
        onCancel={() => setUndoTarget(null)}
      />
      {pdfPreviewElement}
    </div>
  );
}

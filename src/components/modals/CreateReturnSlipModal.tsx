import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PencilSimpleIcon, XIcon } from '@phosphor-icons/react';
import { usePortalTarget } from '../tabs/TabContext';
import type { ReturnCondition, ReturnSlipMutationResult, Warehouse } from '../../models';
import { returnSlipService } from '../../services/returnSlipService';
import { toast } from '../../hooks/useToast';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatMoney, type MoneyCurrency } from '../../utils/formatters';
import { shipmentDateInputToIso } from '../../utils/shipment';
import {
  buildReturnSlipItems,
  emptyQuantities,
  lineTotal,
  previewCharge,
  RETURN_CONDITION_HINTS,
  RETURN_CONDITION_LABELS,
  RETURN_CONDITIONS,
  type ReturnSlipDraftLine,
} from '../../utils/returnSlip';
import DataTable from '../DataTable';

/** Fişe girebilecek sözleşme kalemi (yalnızca sahada malzemesi olanlar) */
export interface ReturnableLine {
  DetailId: number;
  ItemCode?: string | null;
  ItemName: string;
  OnSite: number;
  WarehouseId?: number | null;
  /** Sözleşme para birimindeki envanter birim fiyatı (bedel önizlemesi; bilinmiyorsa null) */
  UnitPrice?: number | null;
}

interface CreateReturnSlipModalProps {
  contractId: number;
  contractLabel: string;
  currency: MoneyCurrency;
  lines: ReturnableLine[];
  warehouses: Warehouse[];
  /** Satırdaki "İade"/"Zayi" butonundan açıldıysa o kalem ve durum öne çıkar */
  preset?: { DetailId: number; condition: ReturnCondition } | null;
  onClose: () => void;
  onCreated: (result: ReturnSlipMutationResult) => void;
}

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const CHARGED: Array<Exclude<ReturnCondition, 'SOUND'>> = ['DAMAGED', 'LOST', 'SOLD'];

/**
 * İade fişi: şantiyeden dönen malzeme tek belgede, kalem başına Sağlam / Hasarlı / Kayıp / Satın aldı
 * adetleriyle girilir. Hasarlı ve kayıp malzeme müşteriye envanter fiyatından satılır (elle bedel girilebilir).
 */
export default function CreateReturnSlipModal({
  contractId,
  contractLabel,
  currency,
  lines,
  warehouses,
  preset,
  onClose,
  onCreated,
}: CreateReturnSlipModalProps) {
  const portalTarget = usePortalTarget();
  const presetInputRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<ReturnSlipDraftLine[]>(() =>
    lines.map((l) => ({
      DetailId: l.DetailId,
      ItemName: l.ItemName,
      OnSite: l.OnSite,
      quantities: emptyQuantities(),
      overrides: {},
    }))
  );
  const [overrideOpen, setOverrideOpen] = useState<Set<number>>(new Set());
  const [returnDate, setReturnDate] = useState(todayKey);
  const defaultWarehouse =
    lines.find((l) => l.DetailId === preset?.DetailId)?.WarehouseId ?? lines.find((l) => l.WarehouseId)?.WarehouseId ?? '';
  const [warehouseId, setWarehouseId] = useState<number | ''>(defaultWarehouse ?? '');
  const [deliveredBy, setDeliveredBy] = useState('');
  const [driverName, setDriverName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [waybillNo, setWaybillNo] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    presetInputRef.current?.focus();
    presetInputRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  const linesById = useMemo(() => new Map(lines.map((l) => [l.DetailId, l])), [lines]);

  const setQty = (detailId: number, condition: ReturnCondition, value: string) => {
    if (value !== '' && !/^\d+$/.test(value)) return;
    setDraft((prev) =>
      prev.map((d) => (d.DetailId === detailId ? { ...d, quantities: { ...d.quantities, [condition]: value } } : d))
    );
    if (error) setError(null);
  };

  const setOverride = (detailId: number, condition: Exclude<ReturnCondition, 'SOUND'>, value: string) => {
    setDraft((prev) =>
      prev.map((d) => (d.DetailId === detailId ? { ...d, overrides: { ...d.overrides, [condition]: value } } : d))
    );
  };

  const fillAllSound = (detailId?: number) => {
    setDraft((prev) =>
      prev.map((d) =>
        detailId == null || d.DetailId === detailId
          ? { ...d, quantities: { ...emptyQuantities(), SOUND: String(d.OnSite) }, overrides: {} }
          : d
      )
    );
    if (error) setError(null);
  };

  const rowCharge = (d: ReturnSlipDraftLine): number | null => {
    const unit = linesById.get(d.DetailId)?.UnitPrice ?? null;
    let sum = 0;
    let unknown = false;
    for (const c of CHARGED) {
      const q = Number(d.quantities[c] || 0);
      if (!q) continue;
      const v = previewCharge(q, unit, d.overrides[c]);
      if (v == null) unknown = true;
      else sum += v;
    }
    return unknown ? null : sum;
  };

  const summary = (() => {
    let sound = 0;
    let charged = 0;
    let charge = 0;
    let chargeUnknown = false;
    for (const d of draft) {
      sound += Number(d.quantities.SOUND || 0);
      for (const c of CHARGED) charged += Number(d.quantities[c] || 0);
      const rc = rowCharge(d);
      if (rc == null) chargeUnknown = true;
      else charge += rc;
    }
    return { sound, charged, charge, chargeUnknown };
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const built = buildReturnSlipItems(draft);
    if (!built.ok) {
      setError(built.message);
      return;
    }
    if (built.hasSound && !warehouseId) {
      setError('Sağlam dönen malzeme için giriş deposunu seçin.');
      return;
    }
    if (returnDate > todayKey()) {
      setError('İade tarihi ileri bir tarih olamaz.');
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      const result = await returnSlipService.createAsync(contractId, {
        ReturnDate: shipmentDateInputToIso(returnDate),
        WarehouseId: warehouseId === '' ? null : warehouseId,
        DeliveredByName: deliveredBy.trim() || null,
        DriverName: driverName.trim() || null,
        VehiclePlate: vehiclePlate.trim() || null,
        ExternalWaybillNo: waybillNo.trim() || null,
        Notes: notes.trim() || null,
        items: built.items,
      });
      toast.success(
        `${result.returnSlip.ReturnSlipNo} kesildi.` +
          (result.contractCompleted ? '\nTüm malzeme kapandı; sözleşme tamamlandı.' : '')
      );
      if (result.warnings?.length) toast.warning(result.warnings.join('\n'));
      onCreated(result);
    } catch (err) {
      setError(getApiErrorMessage(err) || 'İade fişi kesilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const qtyInput = (d: ReturnSlipDraftLine, c: ReturnCondition) => {
    const isPreset = preset?.DetailId === d.DetailId && preset.condition === c;
    return (
      <input
        ref={isPreset ? presetInputRef : undefined}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={`input w-14 py-0.5 px-1 text-xs text-right ${c !== 'SOUND' && d.quantities[c] ? 'border-red-500/60' : ''}`}
        value={d.quantities[c]}
        onChange={(e) => setQty(d.DetailId, c, e.target.value)}
        disabled={isSubmitting}
        placeholder="0"
        aria-label={`${d.ItemName} ${RETURN_CONDITION_LABELS[c]}`}
      />
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black bg-opacity-50 p-4 animate-in fade-in duration-200">
      <div
        className="bg-background-panel rounded-panel shadow-xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-return-slip-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-background-border">
          <div>
            <h2 id="create-return-slip-title" className="text-lg font-semibold text-text-primary">
              İade fişi kes
            </h2>
            <p className="text-xs text-text-secondary">{contractLabel}</p>
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

        <form id="create-return-slip-form" onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" htmlFor="rs-date">
                İade tarihi *
              </label>
              <input
                id="rs-date"
                type="date"
                className="input w-full"
                value={returnDate}
                max={todayKey()}
                onChange={(e) => setReturnDate(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" htmlFor="rs-warehouse">
                Giriş deposu {summary.sound > 0 ? '*' : ''}
              </label>
              <select
                id="rs-warehouse"
                className="input w-full"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={isSubmitting}
              >
                <option value="">Seçin</option>
                {warehouses.map((w) => (
                  <option key={w.WarehouseId} value={w.WarehouseId}>
                    {w.WarehouseName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" htmlFor="rs-delivered-by">
                Teslim eden (müşteri)
              </label>
              <input
                id="rs-delivered-by"
                className="input w-full"
                value={deliveredBy}
                onChange={(e) => setDeliveredBy(e.target.value)}
                maxLength={150}
                disabled={isSubmitting}
                placeholder="Ad soyad"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" htmlFor="rs-waybill">
                İrsaliye no
              </label>
              <input
                id="rs-waybill"
                className="input w-full"
                value={waybillNo}
                onChange={(e) => setWaybillNo(e.target.value)}
                maxLength={60}
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" htmlFor="rs-driver">
                Şoför
              </label>
              <input
                id="rs-driver"
                className="input w-full"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                maxLength={150}
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" htmlFor="rs-plate">
                Araç plakası
              </label>
              <input
                id="rs-plate"
                className="input w-full"
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value)}
                maxLength={30}
                disabled={isSubmitting}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1" htmlFor="rs-notes">
                Not
              </label>
              <input
                id="rs-notes"
                className="input w-full"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="rounded border border-background-border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-background-elevated border-b border-background-border">
              <span className="text-xs text-text-secondary">
                Her kalem için dönen adedi duruma göre girin. Hasarlı ve kayıp malzeme müşteriye satılır.
              </span>
              <button
                type="button"
                className="btn-secondary py-0.5 px-2 text-xs"
                onClick={() => fillAllSound()}
                disabled={isSubmitting}
              >
                Tümü sağlam döndü
              </button>
            </div>
            <div className="overflow-x-auto">
              <DataTable tableId="CreateReturnSlipModal" className="w-full text-xs">
                <thead className="text-text-secondary">
                  <tr className="border-b border-background-border">
                    <th className="text-left py-1.5 px-2">Malzeme</th>
                    <th className="text-right py-1.5 px-2">Sahada</th>
                    {RETURN_CONDITIONS.map((c) => (
                      <th
                        key={c}
                        className={`text-center py-1.5 px-1 ${c === 'SOUND' ? 'text-green-400' : 'text-red-300'}`}
                        title={RETURN_CONDITION_HINTS[c]}
                      >
                        {RETURN_CONDITION_LABELS[c]}
                      </th>
                    ))}
                    <th className="text-right py-1.5 px-2">Kalan</th>
                    <th className="text-right py-1.5 px-2">Satış bedeli</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {draft.map((d) => {
                    const meta = linesById.get(d.DetailId);
                    const total = lineTotal(d);
                    const remaining = d.OnSite - total;
                    const charge = rowCharge(d);
                    const hasCharged = CHARGED.some((c) => Number(d.quantities[c] || 0) > 0);
                    const isPresetRow = preset?.DetailId === d.DetailId;
                    const showOverrides = overrideOpen.has(d.DetailId) && hasCharged;
                    return (
                      <Fragment key={d.DetailId}>
                        <tr className={`border-b border-background-border/50 ${isPresetRow ? 'bg-primary/10' : ''}`}>
                          <td className="py-1 px-2">
                            {meta?.ItemCode ? <span className="text-text-secondary mr-1">{meta.ItemCode}</span> : null}
                            {d.ItemName}
                          </td>
                          <td className="text-right py-1 px-2 font-medium">{d.OnSite}</td>
                          {RETURN_CONDITIONS.map((c) => (
                            <td key={c} className="text-center py-1 px-1">
                              {qtyInput(d, c)}
                            </td>
                          ))}
                          <td
                            className={`text-right py-1 px-2 ${remaining < 0 ? 'text-red-400 font-semibold' : remaining === 0 && total > 0 ? 'text-green-400' : 'text-text-secondary'}`}
                          >
                            {remaining}
                          </td>
                          <td className="text-right py-1 px-2 whitespace-nowrap">
                            {hasCharged ? (charge == null ? <span className="text-amber-300" title="Envanter fiyatı bilinmiyor; kaydederken sunucuda hesaplanır">?</span> : formatMoney(charge, currency)) : '—'}
                          </td>
                          <td className="text-right py-1 px-1 whitespace-nowrap">
                            {hasCharged && (
                              <button
                                type="button"
                                className="p-0.5 rounded hover:bg-background-secondary text-text-secondary"
                                title="Bedeli elle gir"
                                aria-label={`${d.ItemName} bedelini elle gir`}
                                onClick={() =>
                                  setOverrideOpen((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(d.DetailId)) next.delete(d.DetailId);
                                    else next.add(d.DetailId);
                                    return next;
                                  })
                                }
                              >
                                <PencilSimpleIcon size={13} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="text-[10px] px-1 rounded hover:bg-background-secondary text-green-400"
                              title="Bu kalemin tamamı sağlam döndü"
                              onClick={() => fillAllSound(d.DetailId)}
                              disabled={isSubmitting}
                            >
                              Tümü
                            </button>
                          </td>
                        </tr>
                        {showOverrides && (
                          <tr className="bg-background-surface border-b border-background-border/50">
                            <td colSpan={RETURN_CONDITIONS.length + 5} className="px-2 py-1.5">
                              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                                <span className="text-text-secondary">
                                  Elle bedel (toplam, KDV/iskonto hariç). Boş bırakılırsa envanter fiyatı ×
                                  adet{meta?.UnitPrice ? ` (${formatMoney(meta.UnitPrice, currency)}/adet)` : ''}.
                                </span>
                                {CHARGED.filter((c) => Number(d.quantities[c] || 0) > 0).map((c) => (
                                  <label key={c} className="flex items-center gap-1">
                                    {RETURN_CONDITION_LABELS[c]}
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      className="input w-24 py-0.5 px-1 text-xs text-right"
                                      value={d.overrides[c] ?? ''}
                                      onChange={(e) => setOverride(d.DetailId, c, e.target.value)}
                                      placeholder="otomatik"
                                      disabled={isSubmitting}
                                    />
                                  </label>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </DataTable>
            </div>
          </div>
        </form>

        <div className="px-4 py-2 border-t border-background-border text-xs text-text-secondary flex flex-wrap gap-x-4 gap-y-1">
          <span>
            Sağlam iade: <b className="text-green-400">{summary.sound}</b>
          </span>
          <span>
            Satışa çevrilen: <b className="text-red-300">{summary.charged}</b>
          </span>
          {summary.charged > 0 && (
            <span>
              Müşteriye yansıyacak bedel:{' '}
              <b className="text-text-primary">
                {formatMoney(summary.charge, currency)}
                {summary.chargeUnknown ? ' + ?' : ''}
              </b>{' '}
              (KDV/iskonto hariç; satışa çevrilen adetlerin kirası iade tarihine kadar işler)
            </span>
          )}
        </div>
        {error && <p className="px-4 pb-2 text-sm text-red-400">{error}</p>}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-background-border">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
            Vazgeç
          </button>
          <button type="submit" form="create-return-slip-form" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Kaydediliyor...' : 'İade fişini kes'}
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
import { usePortalTarget } from '../tabs/TabContext';
import type { Contract, InventoryContractLineItem, Shipment, ShipmentMutationResult, Warehouse } from '../../models';
import { shipmentService } from '../../services/shipmentService';
import { warehouseService } from '../../services/warehouseService';
import { toast } from '../../hooks/useToast';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatDateInput, todayDateInput } from '../../utils/dateInput';
import { formatDate } from '../../utils/formatters';
import {
  getShipmentLineAllowance,
  shipmentDateInputToIso,
  shipmentQtyByDetail,
  validateShipmentDraft,
  type ShipmentDraftLine,
} from '../../utils/shipment';
import DataTable from '../DataTable';

interface CreateShipmentModalProps {
  contract: Contract;
  lines: InventoryContractLineItem[];
  /** Verilirse pencere bu fişi düzenler (kalemleri dolu olmalı) */
  shipment?: Shipment | null;
  /**
   * Düzenlemede yalnızca stok etkisi olmayan fiş bilgileri (şoför, plaka, irsaliye no…) değişebilir.
   * Sözleşme aktif değilken kullanılır; tarih/depo/miktar kilitlenir.
   */
  headerOnly?: boolean;
  onClose: () => void;
  onSaved: (result: ShipmentMutationResult) => void;
}

/**
 * Sevkiyat fişi oluşturma / düzenleme. Yeni fişte kalemler kalan (sevk edilmemiş) miktarla ön doldurulur;
 * parçalı sevk için miktar düşürülebilir ya da gitmeyen satır fişten çıkarılabilir (sevk bekliyor kalır); satırlar
 * yukarı/aşağı taşınabilir, fiş ve PDF bu sırayla basılır. Düzenlemede fişin mevcut değerleri
 * gelir; fiş no korunur, tarih/depo/miktar değişirse stok ve kira sunucuda yeniden hesaplanır.
 */
export default function CreateShipmentModal({
  contract,
  lines,
  shipment = null,
  headerOnly = false,
  onClose,
  onSaved,
}: CreateShipmentModalProps) {
  const portalTarget = usePortalTarget();
  const isEdit = shipment != null;
  const lockStock = isEdit && headerOnly;
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const existingQty = useMemo(() => shipmentQtyByDetail(shipment?.items), [shipment]);

  const shippableLines = useMemo(
    () =>
      lines
        .map((line) => ({
          line,
          allowance: getShipmentLineAllowance(line, contract, existingQty.get(line.DetailId) ?? 0),
        }))
        .filter(({ allowance }) => allowance.max > 0 || allowance.inThisShipment > 0),
    [lines, contract, existingQty]
  );

  // Varsayılan depo: düzenlemede fişin deposu; yeni fişte kalan satırların ortak deposu (yoksa ilk satırınki)
  const defaultWarehouseId = useMemo(() => {
    if (shipment) return shipment.WarehouseId;
    const ids = Array.from(new Set(shippableLines.map(({ line }) => line.WarehouseId).filter(Boolean)));
    return ids[0] ?? 0;
  }, [shipment, shippableLines]);

  const originalDateKey = shipment ? formatDateInput(new Date(shipment.ShipmentDate)) : '';

  const [warehouseId, setWarehouseId] = useState<number>(defaultWarehouseId);
  const [shipmentDate, setShipmentDate] = useState(originalDateKey || todayDateInput());
  const [driverName, setDriverName] = useState(shipment?.DriverName ?? '');
  const [vehiclePlate, setVehiclePlate] = useState(shipment?.VehiclePlate ?? '');
  const [receiverName, setReceiverName] = useState(shipment?.ReceiverName ?? '');
  const [deliveryAddress, setDeliveryAddress] = useState(shipment?.DeliveryAddress ?? '');
  const [externalWaybillNo, setExternalWaybillNo] = useState(shipment?.ExternalWaybillNo ?? '');
  const [notes, setNotes] = useState(shipment?.Notes ?? '');
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      shippableLines.map(({ line, allowance }) => [
        line.DetailId,
        isEdit ? (allowance.inThisShipment > 0 ? String(allowance.inThisShipment) : '') : String(allowance.max),
      ])
    )
  );
  /**
   * Fişe giren satırlar, fişteki/PDF'teki sırasıyla. Yeni fişte kalanı olan tüm satırlar; düzenlemede
   * fişin kendi kalemleri (fişteki sırayla). Listede olmayanlar "eklenmeyenler" bölümünde durur.
   */
  const [order, setOrder] = useState<number[]>(() => {
    const shippableIds = new Set(shippableLines.map(({ line }) => line.DetailId));
    if (shipment) {
      const ids = (shipment.items ?? []).map((it) => it.DetailId).filter((id) => shippableIds.has(id));
      return Array.from(new Set(ids));
    }
    return shippableLines.filter(({ allowance }) => allowance.max > 0).map(({ line }) => line.DetailId);
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const qtyInputRefs = useRef(new Map<number, HTMLInputElement>());

  const lineById = useMemo(() => new Map(shippableLines.map((l) => [l.line.DetailId, l])), [shippableLines]);
  const includedLines = useMemo(
    () => order.map((id) => lineById.get(id)).filter((l): l is (typeof shippableLines)[number] => l != null),
    [order, lineById]
  );
  const excludedLines = useMemo(
    () => shippableLines.filter(({ line, allowance }) => !order.includes(line.DetailId) && allowance.max > 0),
    [shippableLines, order]
  );

  /** Taşıma/silme sonrası odağı ilgili satırın miktar kutusuna geri ver (klavyeyle seri düzenleme) */
  const focusQty = (detailId: number | undefined) => {
    if (detailId == null) return;
    requestAnimationFrame(() => qtyInputRefs.current.get(detailId)?.focus());
  };

  const moveLine = (detailId: number, delta: -1 | 1, keepFocus = false) => {
    setOrder((prev) => {
      const from = prev.indexOf(detailId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    if (keepFocus) focusQty(detailId);
  };

  const removeLine = (detailId: number, keepFocus = false) => {
    const idx = order.indexOf(detailId);
    const neighbour = order[idx + 1] ?? order[idx - 1];
    setOrder((prev) => prev.filter((id) => id !== detailId));
    if (error) setError(null);
    if (keepFocus) focusQty(neighbour);
  };

  const addLine = (detailId: number) => {
    const entry = lineById.get(detailId);
    if (!entry) return;
    setOrder((prev) => (prev.includes(detailId) ? prev : [...prev, detailId]));
    setQuantities((prev) => (Number(prev[detailId]) > 0 ? prev : { ...prev, [detailId]: String(entry.allowance.max) }));
    if (error) setError(null);
    focusQty(detailId);
  };

  const addAllExcluded = () => {
    setOrder((prev) => [...prev, ...excludedLines.map(({ line }) => line.DetailId).filter((id) => !prev.includes(id))]);
    setQuantities((prev) => {
      const next = { ...prev };
      for (const { line, allowance } of excludedLines) {
        if (!(Number(next[line.DetailId]) > 0)) next[line.DetailId] = String(allowance.max);
      }
      return next;
    });
    if (error) setError(null);
  };

  useEffect(() => {
    warehouseService
      .getActiveAsync()
      .then(setWarehouses)
      .catch(() => setWarehouses([]));
  }, []);

  // Fişin deposu pasifleşmişse listede yine görünsün (değiştirilmeden kaydedilebilsin)
  const warehouseOptions = useMemo(() => {
    if (!shipment || warehouses.some((w) => w.WarehouseId === shipment.WarehouseId)) return warehouses;
    return [
      ...warehouses,
      { WarehouseId: shipment.WarehouseId, WarehouseName: shipment.WarehouseName || `Depo #${shipment.WarehouseId}` } as Warehouse,
    ];
  }, [warehouses, shipment]);

  const mixedWarehouses = useMemo(
    () => new Set(shippableLines.map(({ line }) => line.WarehouseId)).size > 1,
    [shippableLines]
  );

  const draftLines: ShipmentDraftLine[] = includedLines.map(({ line, allowance }) => ({
    DetailId: line.DetailId,
    ItemName: line.ItemName,
    remaining: allowance.max,
    quantityInput: quantities[line.DetailId] ?? '',
  }));

  const totalToShip = draftLines.reduce((sum, l) => sum + (Number(l.quantityInput) || 0), 0);
  const contractStartKey = contract.StartDate ? contract.StartDate.slice(0, 10) : '';
  const deliveredKey = shipment?.DeliveredAt ? formatDateInput(new Date(shipment.DeliveredAt)) : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!warehouseId) {
      setError('Çıkış deposunu seçin.');
      return;
    }
    if (!shipmentDate) {
      setError('Sevk tarihini girin.');
      return;
    }
    if (deliveredKey && shipmentDate > deliveredKey) {
      setError(`Sevk tarihi teslim tarihinden (${formatDate(shipment!.DeliveredAt!)}) sonra olamaz.`);
      return;
    }
    if (draftLines.length === 0) {
      setError('Fişte hiç kalem yok. Aşağıdaki “Bu sevkiyata eklenmeyenler” listesinden kalem ekleyin.');
      return;
    }
    // Fişte duran ama miktarı boş/0 olan satır sessizce düşmesin: ya miktar girilsin ya satır silinsin
    const emptyLine = draftLines.find((l) => !(Number(l.quantityInput.trim()) > 0));
    if (emptyLine && !lockStock) {
      setError(`${emptyLine.ItemName}: miktar girin ya da satırı fişten çıkarın (çöp kutusu).`);
      focusQty(emptyLine.DetailId);
      return;
    }
    const validation = validateShipmentDraft(draftLines);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    // Fişte olup pencerede listelenmeyen kalem (ör. satır listesi eksik geldiyse) sessizce düşmesin
    const shownIds = new Set(shippableLines.map(({ line }) => line.DetailId));
    const hiddenExisting = [...existingQty]
      .filter(([detailId, qty]) => qty > 0 && !shownIds.has(detailId))
      .map(([DetailId, Quantity]) => ({ DetailId, Quantity }));
    const payload = {
      // Düzenlemede gün değişmediyse saklanan zaman damgası korunur
      ShipmentDate:
        shipment && shipmentDate === originalDateKey ? shipment.ShipmentDate : shipmentDateInputToIso(shipmentDate),
      WarehouseId: warehouseId,
      DriverName: driverName.trim() || null,
      VehiclePlate: vehiclePlate.trim() || null,
      ReceiverName: receiverName.trim() || null,
      DeliveryAddress: deliveryAddress.trim() || null,
      ExternalWaybillNo: externalWaybillNo.trim() || null,
      Notes: notes.trim() || null,
      items: [...validation.items, ...hiddenExisting],
    };
    try {
      setIsSubmitting(true);
      setError(null);
      const result = shipment
        ? await shipmentService.updateAsync(shipment.ShipmentId, payload)
        : await shipmentService.createAsync(contract.ContractId, payload);
      toast.success(
        shipment
          ? `Sevkiyat fişi güncellendi: ${result.shipment.ShipmentNo}`
          : `Sevkiyat fişi oluşturuldu: ${result.shipment.ShipmentNo}`
      );
      if (result.warnings?.length) toast.warning(result.warnings.join('\n'));
      onSaved(result);
    } catch (err) {
      setError(getApiErrorMessage(err) || (shipment ? 'Sevkiyat fişi güncellenemedi.' : 'Sevkiyat fişi oluşturulamadı.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillAll = () => {
    setQuantities((prev) => ({
      ...prev,
      ...Object.fromEntries(includedLines.map(({ line, allowance }) => [line.DetailId, String(allowance.max)])),
    }));
    if (error) setError(null);
  };
  const removeAll = () => {
    setOrder([]);
    if (error) setError(null);
  };

  const stockInputsDisabled = isSubmitting || lockStock;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-50 p-4 animate-in fade-in duration-200">
      <div
        className="bg-background-panel rounded-panel shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-shipment-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-background-border">
          <div>
            <h2 id="create-shipment-title" className="text-lg font-semibold text-text-primary">
              {shipment ? `Sevkiyat fişini düzenle — ${shipment.ShipmentNo}` : 'Sevkiyat fişi oluştur'}
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              {contract.ContractCode || `Sözleşme #${contract.ContractId}`}
              {contract.CustomerName ? ` · ${contract.CustomerName}` : ''}
              {lockStock
                ? ' — sözleşme aktif olmadığı için yalnızca fiş bilgileri düzenlenebilir.'
                : shipment
                  ? ' — tarih, depo veya miktar değişirse stok ve kira yeniden hesaplanır.'
                  : ' — kira, sevk edilen miktar için bu tarihten başlar.'}
            </p>
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

        <form id="create-shipment-form" onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-4">
          {shippableLines.length === 0 ? (
            <p className="text-sm text-text-secondary">Bu sözleşmede sevk edilecek kalan malzeme yok.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" htmlFor="shipment-date">Sevk tarihi *</label>
                  <input
                    id="shipment-date"
                    type="date"
                    className="input w-full"
                    value={shipmentDate}
                    min={contractStartKey || undefined}
                    max={deliveredKey || undefined}
                    onChange={(e) => setShipmentDate(e.target.value)}
                    disabled={stockInputsDisabled}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" htmlFor="shipment-warehouse">Çıkış deposu *</label>
                  <select
                    id="shipment-warehouse"
                    className="input w-full"
                    value={warehouseId || ''}
                    onChange={(e) => setWarehouseId(Number(e.target.value))}
                    disabled={stockInputsDisabled}
                    required
                  >
                    <option value="">Seçin</option>
                    {warehouseOptions.map((w) => (
                      <option key={w.WarehouseId} value={w.WarehouseId}>
                        {w.WarehouseName}
                      </option>
                    ))}
                  </select>
                  {mixedWarehouses && !shipment && (
                    <p className="text-[11px] text-amber-300 mt-1">
                      Kalemler farklı depolarda rezerve; her depo için ayrı fiş kesin.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" htmlFor="shipment-waybill">İrsaliye no</label>
                  <input
                    id="shipment-waybill"
                    className="input w-full"
                    value={externalWaybillNo}
                    onChange={(e) => setExternalWaybillNo(e.target.value)}
                    placeholder="e-İrsaliye / matbu no"
                    maxLength={60}
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" htmlFor="shipment-driver">Şoför</label>
                  <input
                    id="shipment-driver"
                    className="input w-full"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    maxLength={150}
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" htmlFor="shipment-plate">Araç plakası</label>
                  <input
                    id="shipment-plate"
                    className="input w-full uppercase"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                    maxLength={30}
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" htmlFor="shipment-receiver">Teslim alan</label>
                  <input
                    id="shipment-receiver"
                    className="input w-full"
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    maxLength={150}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
              {deliveredKey && !lockStock && (
                <p className="text-[11px] text-sky-300 -mt-2">
                  Fişin teslimi {formatDate(shipment!.DeliveredAt!)} tarihinde onaylandı; sevk tarihi bundan sonra olamaz.
                </p>
              )}
              <div>
                <label className="block text-xs font-medium mb-1" htmlFor="shipment-address">Teslim adresi</label>
                <input
                  id="shipment-address"
                  className="input w-full"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Boş bırakılırsa şantiye adresi kullanılır"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">
                    {shipment ? 'Fişteki kalemler' : 'Bu sevkiyatta gidecek kalemler'}{' '}
                    <span className="text-text-secondary font-normal">({includedLines.length})</span>
                  </span>
                  {!lockStock && includedLines.length > 0 && (
                    <div className="flex gap-3 text-xs">
                      <button
                        type="button"
                        className="text-accent hover:underline"
                        onClick={fillAll}
                        disabled={isSubmitting}
                        title="Fişteki her satıra kalan miktarın tamamını yaz"
                      >
                        Miktarları kalanla doldur
                      </button>
                      <button
                        type="button"
                        className="text-text-secondary hover:text-red-400 hover:underline"
                        onClick={removeAll}
                        disabled={isSubmitting}
                        title="Bütün satırları fişten çıkar (aşağıdan tek tek eklenebilir)"
                      >
                        Tümünü çıkar
                      </button>
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto rounded border border-background-border">
                  <DataTable tableId="CreateShipmentModal" className="w-full text-xs">
                    <thead className="bg-background-elevated text-text-secondary">
                      <tr>
                        <th className="text-center px-1 py-1.5 w-7">#</th>
                        <th className="text-left px-2 py-1.5">Malzeme</th>
                        <th className="text-left px-2 py-1.5">Rezerve depo</th>
                        <th className="text-right px-2 py-1.5">Sözleşme</th>
                        <th className="text-right px-2 py-1.5">{shipment ? 'Diğer fişler' : 'Sevk edilen'}</th>
                        <th className="text-right px-2 py-1.5">{shipment ? 'En fazla' : 'Kalan'}</th>
                        <th className="text-right px-2 py-1.5 w-28">{shipment ? 'Bu fiş' : 'Bu sevk'}</th>
                        <th className="text-center px-1 py-1.5 w-[88px]" title="Sırala / fişten çıkar">
                          Sıra · Sil
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {includedLines.length === 0 ? (
                        <tr className="border-t border-background-border">
                          <td colSpan={8} className="px-2 py-4 text-center text-text-secondary">
                            Fişte kalem yok. Aşağıdaki listeden “Ekle” ile kalem ekleyin.
                          </td>
                        </tr>
                      ) : (
                        includedLines.map(({ line, allowance }, idx) => {
                          const isFirst = idx === 0;
                          const isLast = idx === includedLines.length - 1;
                          const qtyEmpty = !(Number(quantities[line.DetailId]) > 0);
                          return (
                            <tr key={line.DetailId} className="border-t border-background-border group">
                              <td className="px-1 py-1.5 text-center text-text-secondary">{idx + 1}</td>
                              <td className="px-2 py-1.5">
                                {line.ItemCode ? <span className="text-text-secondary mr-1">{line.ItemCode}</span> : null}
                                {line.ItemName}
                              </td>
                              <td className="px-2 py-1.5 text-text-secondary">{line.WarehouseName || '—'}</td>
                              <td className="px-2 py-1.5 text-right">{allowance.contracted}</td>
                              <td className="px-2 py-1.5 text-right">{allowance.otherShipped}</td>
                              <td className="px-2 py-1.5 text-right font-medium">{allowance.max}</td>
                              <td className="px-2 py-1">
                                <input
                                  ref={(el) => {
                                    if (el) qtyInputRefs.current.set(line.DetailId, el);
                                    else qtyInputRefs.current.delete(line.DetailId);
                                  }}
                                  type="number"
                                  min={0}
                                  max={allowance.max}
                                  step={1}
                                  className={`input w-full text-right py-1 ${qtyEmpty && !lockStock ? 'border-amber-500/70' : ''}`}
                                  value={quantities[line.DetailId] ?? ''}
                                  onChange={(e) => {
                                    setQuantities((prev) => ({ ...prev, [line.DetailId]: e.target.value }));
                                    if (error) setError(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                                      e.preventDefault();
                                      moveLine(line.DetailId, e.key === 'ArrowUp' ? -1 : 1, true);
                                    } else if (e.ctrlKey && e.key === 'Delete' && !stockInputsDisabled) {
                                      e.preventDefault();
                                      removeLine(line.DetailId, true);
                                    }
                                  }}
                                  disabled={stockInputsDisabled}
                                  placeholder={lockStock ? undefined : 'Miktar'}
                                  aria-label={`${line.ItemName} sevk miktarı`}
                                />
                              </td>
                              <td className="px-1 py-1 whitespace-nowrap text-center">
                                <button
                                  type="button"
                                  className="p-1 rounded text-text-secondary hover:bg-background-secondary hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
                                  onClick={() => moveLine(line.DetailId, -1)}
                                  disabled={isFirst || isSubmitting}
                                  title="Yukarı taşı (Alt+↑)"
                                  aria-label={`${line.ItemName} yukarı taşı`}
                                >
                                  <ArrowUpIcon size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="p-1 rounded text-text-secondary hover:bg-background-secondary hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
                                  onClick={() => moveLine(line.DetailId, 1)}
                                  disabled={isLast || isSubmitting}
                                  title="Aşağı taşı (Alt+↓)"
                                  aria-label={`${line.ItemName} aşağı taşı`}
                                >
                                  <ArrowDownIcon size={14} />
                                </button>
                                {!lockStock && (
                                  <button
                                    type="button"
                                    className="p-1 rounded text-red-400/80 hover:bg-red-500/15 hover:text-red-400 disabled:opacity-30"
                                    onClick={() => removeLine(line.DetailId)}
                                    disabled={isSubmitting}
                                    title="Bu sevkiyattan çıkar (Ctrl+Delete) — malzeme sevk bekliyor olarak kalır"
                                    aria-label={`${line.ItemName} fişten çıkar`}
                                  >
                                    <TrashIcon size={14} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </DataTable>
                </div>
                <p className="text-[11px] text-text-secondary mt-1">
                  Bu sevkiyatta gitmeyen kalemi <TrashIcon size={11} className="inline -mt-0.5" /> ile çıkarın; sevk bekliyor olarak kalır,
                  sonraki fişte gönderilir. Sırayı oklarla (veya miktar kutusundayken Alt+↑/↓) değiştirin; fiş ve PDF bu sırayla
                  basılır.{' '}
                  {shipment ? 'İade/kapama yapılmış miktarın altına düşülemez. ' : ''}
                  Her sevk partisi kendi tarihinden itibaren en az 30 gün faturalanır.
                </p>

                {!lockStock && excludedLines.length > 0 && (
                  <div className="mt-3 rounded border border-dashed border-background-border">
                    <div className="flex items-center justify-between px-2 py-1.5 border-b border-dashed border-background-border">
                      <span className="text-xs">
                        <span className="font-medium">Bu sevkiyata eklenmeyenler</span>{' '}
                        <span className="text-text-secondary">— sevk bekliyor olarak kalır</span>
                      </span>
                      {excludedLines.length > 1 && (
                        <button
                          type="button"
                          className="text-xs text-accent hover:underline"
                          onClick={addAllExcluded}
                          disabled={isSubmitting}
                        >
                          Tümünü ekle
                        </button>
                      )}
                    </div>
                    <ul>
                      {excludedLines.map(({ line, allowance }) => (
                        <li
                          key={line.DetailId}
                          className="flex items-center justify-between gap-3 px-2 py-1 text-xs border-b border-background-border/40 last:border-b-0 text-text-secondary"
                        >
                          <span className="min-w-0 truncate">
                            {line.ItemCode ? <span className="mr-1">{line.ItemCode}</span> : null}
                            <span className="text-text-primary">{line.ItemName}</span>
                            <span className="ml-2">kalan {allowance.max}</span>
                          </span>
                          <button
                            type="button"
                            className="btn-secondary py-0.5 px-2 text-xs inline-flex items-center gap-1 shrink-0"
                            onClick={() => addLine(line.DetailId)}
                            disabled={isSubmitting}
                            title="Fişin sonuna ekle (kalan miktarla)"
                          >
                            <PlusIcon size={12} />
                            Ekle
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" htmlFor="shipment-notes">Not</label>
                <textarea
                  id="shipment-notes"
                  className="input w-full min-h-[56px]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>

        <div className="flex items-center justify-between gap-3 p-4 border-t border-background-border">
          <span className="text-xs text-text-secondary">
            {shippableLines.length > 0
              ? `Bu ${shipment ? 'fişte' : 'sevkiyatta'} ${includedLines.length} kalem, toplam ${totalToShip} adet` +
                (excludedLines.length > 0 ? ` · ${excludedLines.length} kalem sonraki sevke kalıyor` : '')
              : ''}
          </span>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
              Vazgeç
            </button>
            <button
              type="submit"
              form="create-shipment-form"
              className="btn-primary"
              disabled={isSubmitting || shippableLines.length === 0 || includedLines.length === 0}
            >
              {isSubmitting ? 'Kaydediliyor...' : shipment ? 'Değişiklikleri kaydet' : 'Sevkiyatı kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

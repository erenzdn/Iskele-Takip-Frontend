import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '@phosphor-icons/react';
import { usePortalTarget } from '../tabs/TabContext';
import type { Contract, InventoryContractLineItem, ShipmentMutationResult, Warehouse } from '../../models';
import { shipmentService } from '../../services/shipmentService';
import { warehouseService } from '../../services/warehouseService';
import { toast } from '../../hooks/useToast';
import { getApiErrorMessage } from '../../utils/apiError';
import { todayDateInput } from '../../utils/dateInput';
import {
  getLineShipmentProgress,
  shipmentDateInputToIso,
  validateShipmentDraft,
  type ShipmentDraftLine,
} from '../../utils/shipment';

interface CreateShipmentModalProps {
  contract: Contract;
  lines: InventoryContractLineItem[];
  onClose: () => void;
  onCreated: (result: ShipmentMutationResult) => void;
}

/**
 * Sevkiyat fişi oluşturma. Kalemler kalan (sevk edilmemiş) miktarla ön doldurulur;
 * parçalı sevk için miktar düşürülebilir veya satır boş bırakılabilir.
 */
export default function CreateShipmentModal({ contract, lines, onClose, onCreated }: CreateShipmentModalProps) {
  const portalTarget = usePortalTarget();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const shippableLines = useMemo(
    () =>
      lines
        .map((line) => ({ line, progress: getLineShipmentProgress(line, contract) }))
        .filter(({ progress }) => progress.pending > 0),
    [lines, contract]
  );

  // Varsayılan depo: kalan satırların ortak deposu (yoksa ilk satırınki)
  const defaultWarehouseId = useMemo(() => {
    const ids = Array.from(new Set(shippableLines.map(({ line }) => line.WarehouseId).filter(Boolean)));
    return ids[0] ?? 0;
  }, [shippableLines]);

  const [warehouseId, setWarehouseId] = useState<number>(defaultWarehouseId);
  const [shipmentDate, setShipmentDate] = useState(todayDateInput());
  const [driverName, setDriverName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [externalWaybillNo, setExternalWaybillNo] = useState('');
  const [notes, setNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(shippableLines.map(({ line, progress }) => [line.DetailId, String(progress.pending)]))
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    warehouseService
      .getActiveAsync()
      .then(setWarehouses)
      .catch(() => setWarehouses([]));
  }, []);

  const mixedWarehouses = useMemo(
    () => new Set(shippableLines.map(({ line }) => line.WarehouseId)).size > 1,
    [shippableLines]
  );

  const draftLines: ShipmentDraftLine[] = shippableLines.map(({ line, progress }) => ({
    DetailId: line.DetailId,
    ItemName: line.ItemName,
    remaining: progress.pending,
    quantityInput: quantities[line.DetailId] ?? '',
  }));

  const totalToShip = draftLines.reduce((sum, l) => sum + (Number(l.quantityInput) || 0), 0);
  const today = todayDateInput();
  const contractStartKey = contract.StartDate ? contract.StartDate.slice(0, 10) : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!warehouseId) {
      setError('Çıkış deposunu seçin.');
      return;
    }
    if (!shipmentDate || shipmentDate > today) {
      setError('Sevk tarihi bugünden ileri olamaz.');
      return;
    }
    const validation = validateShipmentDraft(draftLines);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      const result = await shipmentService.createAsync(contract.ContractId, {
        ShipmentDate: shipmentDateInputToIso(shipmentDate),
        WarehouseId: warehouseId,
        DriverName: driverName.trim() || null,
        VehiclePlate: vehiclePlate.trim() || null,
        ReceiverName: receiverName.trim() || null,
        DeliveryAddress: deliveryAddress.trim() || null,
        ExternalWaybillNo: externalWaybillNo.trim() || null,
        Notes: notes.trim() || null,
        items: validation.items,
      });
      toast.success(`Sevkiyat fişi oluşturuldu: ${result.shipment.ShipmentNo}`);
      if (result.warnings?.length) toast.warning(result.warnings.join('\n'));
      onCreated(result);
    } catch (err) {
      setError(getApiErrorMessage(err) || 'Sevkiyat fişi oluşturulamadı.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillAll = () =>
    setQuantities(Object.fromEntries(shippableLines.map(({ line, progress }) => [line.DetailId, String(progress.pending)])));
  const clearAll = () => setQuantities(Object.fromEntries(shippableLines.map(({ line }) => [line.DetailId, ''])));

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
              Sevkiyat fişi oluştur
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              {contract.ContractCode || `Sözleşme #${contract.ContractId}`}
              {contract.CustomerName ? ` · ${contract.CustomerName}` : ''} — kira, sevk edilen miktar için bu tarihten başlar.
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
                    max={today}
                    onChange={(e) => setShipmentDate(e.target.value)}
                    disabled={isSubmitting}
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
                    disabled={isSubmitting}
                    required
                  >
                    <option value="">Seçin</option>
                    {warehouses.map((w) => (
                      <option key={w.WarehouseId} value={w.WarehouseId}>
                        {w.WarehouseName}
                      </option>
                    ))}
                  </select>
                  {mixedWarehouses && (
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
                  <span className="text-xs font-medium">Kalemler</span>
                  <div className="flex gap-2 text-xs">
                    <button type="button" className="text-accent hover:underline" onClick={fillAll} disabled={isSubmitting}>
                      Tümünü doldur
                    </button>
                    <button type="button" className="text-text-secondary hover:underline" onClick={clearAll} disabled={isSubmitting}>
                      Temizle
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto rounded border border-background-border">
                  <table className="w-full text-xs">
                    <thead className="bg-background-elevated text-text-secondary">
                      <tr>
                        <th className="text-left px-2 py-1.5">Malzeme</th>
                        <th className="text-left px-2 py-1.5">Rezerve depo</th>
                        <th className="text-right px-2 py-1.5">Sözleşme</th>
                        <th className="text-right px-2 py-1.5">Sevk edilen</th>
                        <th className="text-right px-2 py-1.5">Kalan</th>
                        <th className="text-right px-2 py-1.5 w-28">Bu sevk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shippableLines.map(({ line, progress }) => (
                        <tr key={line.DetailId} className="border-t border-background-border">
                          <td className="px-2 py-1.5">
                            {line.ItemCode ? <span className="text-text-secondary mr-1">{line.ItemCode}</span> : null}
                            {line.ItemName}
                          </td>
                          <td className="px-2 py-1.5 text-text-secondary">{line.WarehouseName || '—'}</td>
                          <td className="px-2 py-1.5 text-right">{progress.contracted}</td>
                          <td className="px-2 py-1.5 text-right">{progress.shipped}</td>
                          <td className="px-2 py-1.5 text-right font-medium">{progress.pending}</td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              min={0}
                              max={progress.pending}
                              step={1}
                              className="input w-full text-right py-1"
                              value={quantities[line.DetailId] ?? ''}
                              onChange={(e) => {
                                setQuantities((prev) => ({ ...prev, [line.DetailId]: e.target.value }));
                                if (error) setError(null);
                              }}
                              disabled={isSubmitting}
                              aria-label={`${line.ItemName} sevk miktarı`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-text-secondary mt-1">
                  Parçalı sevk için miktarı düşürün veya boş bırakın. Her sevk partisi kendi tarihinden itibaren en az 30 gün faturalanır.
                </p>
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
            {shippableLines.length > 0 ? `Bu sevkiyatta toplam ${totalToShip} adet` : ''}
          </span>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
              Vazgeç
            </button>
            <button
              type="submit"
              form="create-shipment-form"
              className="btn-primary"
              disabled={isSubmitting || shippableLines.length === 0}
            >
              {isSubmitting ? 'Kaydediliyor...' : 'Sevkiyatı kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

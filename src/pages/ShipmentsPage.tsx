import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircleIcon, FilePdfIcon, PaperclipIcon, TruckIcon } from '@phosphor-icons/react';
import type { Contract, ContractAwaitingShipment, InventoryContractLineItem, Shipment, Warehouse } from '../models';
import { shipmentService } from '../services/shipmentService';
import { warehouseService } from '../services/warehouseService';
import { contractService } from '../services/contractService';
import CreateShipmentModal from '../components/modals/CreateShipmentModal';
import ConfirmDeliveryModal from '../components/modals/ConfirmDeliveryModal';
import DeliveryStatusBadge from '../components/shipments/DeliveryStatusBadge';
import { contractDetailsToShipmentLines } from '../utils/shipment';
import { useAuthStore } from '../store/authStore';
import { PageActions } from '../components/PageActions';
import EmptyState from '../components/EmptyState';
import { formatDate } from '../utils/formatters';
import { contractPath } from '../utils/entityNavigation';
import { getApiErrorMessage } from '../utils/apiError';
import { toast } from '../hooks/useToast';
import { useShipmentPdfPreview } from '../hooks/useShipmentPdfPreview';

type ViewMode = 'awaiting' | 'shipments';
/** Türetilmiş fiş durumu filtresi: teslim durumu yalnızca aktif fişler için anlamlı */
type StateFilter = '' | 'pending' | 'delivered' | 'CANCELLED';

const th =
  'text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover';
const td = 'py-1 px-2 align-middle border-r border-background-border/60 last:border-r-0';

/**
 * Sevkiyatlar: sevk bekleyen sözleşmeler (rezervasyonu olan) ve tüm sevkiyat fişleri.
 * Sevk bekleyen satırdan doğrudan fiş kesilebilir; sözleşmenin "Sevkiyatlar" sekmesi de aynı pencereyi açar.
 */
export default function ShipmentsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canView = Boolean(user?.permissions?.includes('shipments_view'));
  const canCreate = Boolean(user?.permissions?.includes('shipments_create'));
  const canConfirmDelivery = Boolean(user?.permissions?.includes('shipments_confirm_delivery'));

  const [view, setView] = useState<ViewMode>('awaiting');
  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('');
  const [missingWaybill, setMissingWaybill] = useState(false);
  const [deliveryTarget, setDeliveryTarget] = useState<Shipment | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [awaiting, setAwaiting] = useState<ContractAwaitingShipment[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(false);
  const { openPreview, loadingId, element: pdfPreviewElement } = useShipmentPdfPreview();
  const [shipTarget, setShipTarget] = useState<{ contract: Contract; lines: InventoryContractLineItem[] } | null>(null);
  const [preparingId, setPreparingId] = useState<number | null>(null);

  useEffect(() => {
    warehouseService.getAllAsync().then(setWarehouses).catch(() => setWarehouses([]));
  }, []);

  const load = useCallback(async () => {
    if (!canView) return;
    try {
      setLoading(true);
      if (view === 'awaiting') {
        setAwaiting(await shipmentService.listAwaitingContractsAsync(search.trim() || undefined));
      } else {
        const res = await shipmentService.listAsync({
          search: search.trim() || undefined,
          warehouseId: warehouseId === '' ? undefined : warehouseId,
          status: stateFilter === 'CANCELLED' ? 'CANCELLED' : undefined,
          deliveryState: stateFilter === 'pending' || stateFilter === 'delivered' ? stateFilter : undefined,
          missingWaybill: missingWaybill || undefined,
          dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
          dateTo: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
          limit: 500,
        });
        setShipments(res.items ?? []);
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Sevkiyatlar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [canView, view, search, warehouseId, stateFilter, missingWaybill, dateFrom, dateTo]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [load]);

  const headerActions = useMemo(
    () =>
      canView ? (
        <button onClick={() => void load()} className="btn-secondary py-1.5 px-3 text-sm">
          Yenile
        </button>
      ) : null,
    [canView, load]
  );

  const openCreateShipment = async (contractId: number) => {
    if (preparingId != null) return;
    try {
      setPreparingId(contractId);
      const contract = await contractService.getByIdAsync(contractId);
      const lines = contractDetailsToShipmentLines(contract);
      if (lines.length === 0) {
        toast.error('Sözleşmede sevk edilecek kalem bulunamadı.');
        return;
      }
      setShipTarget({ contract, lines });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Sözleşme yüklenemedi.');
    } finally {
      setPreparingId(null);
    }
  };

  const openContract = (contractId: number) => navigate(contractPath(contractId), { state: { initialTab: 'shipments' } });

  if (!canView) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-text-secondary">Bu sayfayı görüntüleme yetkiniz yok.</div>
      </div>
    );
  }

  const awaitingTotal = awaiting.reduce((s, a) => s + (a.PendingQuantity || 0), 0);

  return (
    <div>
      <div className="mb-1.5 rounded border border-background-border bg-background-panel p-1.5 flex flex-wrap items-center gap-1.5">
        <div className="flex rounded border border-background-border overflow-hidden text-sm">
          <button
            type="button"
            className={`px-3 py-1.5 ${view === 'awaiting' ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:bg-background-hover'}`}
            onClick={() => setView('awaiting')}
          >
            Sevk bekleyenler
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 border-l border-background-border ${view === 'shipments' ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:bg-background-hover'}`}
            onClick={() => setView('shipments')}
          >
            Sevkiyat fişleri
          </button>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={view === 'awaiting' ? 'Sözleşme no veya müşteri' : 'Fiş no, sözleşme, müşteri, plaka'}
          className="input py-1.5 px-2 text-sm min-w-[220px]"
        />
        {view === 'shipments' && (
          <>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value === '' ? '' : Number(e.target.value))}
              className="input py-1.5 px-2 text-sm min-w-[140px]"
              title="Depo"
            >
              <option value="">Tüm depolar</option>
              {warehouses.map((w) => (
                <option key={w.WarehouseId} value={w.WarehouseId}>
                  {w.WarehouseName}
                </option>
              ))}
            </select>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value as StateFilter)}
              className="input py-1.5 px-2 text-sm min-w-[130px]"
              title="Durum"
            >
              <option value="">Tüm durumlar</option>
              <option value="pending">Teslim bekleyen</option>
              <option value="delivered">Teslim edildi</option>
              <option value="CANCELLED">İptal</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none" title="İmzalı irsaliye eki olmayan aktif fişler">
              <input type="checkbox" checked={missingWaybill} onChange={(e) => setMissingWaybill(e.target.checked)} />
              İmzalı irsaliye eksik
            </label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input py-1.5 px-2 text-sm w-[130px]" title="Başlangıç" />
            <span className="text-text-secondary text-xs">–</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input py-1.5 px-2 text-sm w-[130px]" title="Bitiş" />
          </>
        )}
        {view === 'awaiting' && awaiting.length > 0 && (
          <span className="text-xs text-text-secondary ml-auto">
            {awaiting.length} sözleşmede toplam {awaitingTotal} adet sevk bekliyor
          </span>
        )}
        <PageActions className={view === 'awaiting' && awaiting.length > 0 ? '' : 'ml-auto'}>{headerActions}</PageActions>
      </div>

      {loading && (view === 'awaiting' ? awaiting.length === 0 : shipments.length === 0) ? (
        <div className="flex items-center justify-center py-16 text-text-secondary">Yükleniyor...</div>
      ) : view === 'awaiting' ? (
        awaiting.length === 0 ? (
          <EmptyState
            icon={<TruckIcon size={48} weight="duotone" />}
            title="Sevk bekleyen sözleşme yok"
            description="“Sevkiyat ile” açılan kiralama sözleşmeleri, malzemenin tamamı sevk edilene kadar burada listelenir."
          />
        ) : (
          <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel">
            <div className="overflow-auto max-h-[calc(100vh-160px)] min-h-[200px]">
              <table className="w-full text-xs border-collapse text-text-primary">
                <thead className="sticky top-0 z-10 border-b border-background-border">
                  <tr>
                    <th className={th}>Sözleşme</th>
                    <th className={th}>Müşteri</th>
                    <th className={th}>Şantiye</th>
                    <th className={th}>Sözleşme tarihi</th>
                    <th className={th}>İlk sevk</th>
                    <th className={`${th} text-right`}>Sözleşme</th>
                    <th className={`${th} text-right`}>Sevk edilen</th>
                    <th className={`${th} text-right`}>Bekleyen</th>
                    {canCreate && <th className={`${th} text-center w-20`}>Fiş</th>}
                  </tr>
                </thead>
                <tbody>
                  {awaiting.map((a, index) => (
                    <tr
                      key={a.ContractId}
                      className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${index % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'}`}
                      onClick={() => openContract(a.ContractId)}
                      title="Sözleşmeyi aç"
                    >
                      <td className={td}>
                        <span className="font-medium text-primary">{a.ContractCode || `#${a.ContractId}`}</span>
                      </td>
                      <td className={td}>{a.CustomerName || '—'}</td>
                      <td className={td}>{a.SiteName || '—'}</td>
                      <td className={td}>{formatDate(a.StartDate)}</td>
                      <td className={td}>
                        {a.FirstShipmentDate ? formatDate(a.FirstShipmentDate) : <span className="text-amber-300">Sevk yok</span>}
                      </td>
                      <td className={`${td} text-right`}>{a.ContractQuantity}</td>
                      <td className={`${td} text-right`}>{a.ShippedQuantity}</td>
                      <td className={`${td} text-right font-semibold text-amber-300`}>{a.PendingQuantity}</td>
                      {canCreate && (
                        <td className={`${td} text-center`} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn-primary py-0.5 px-2 text-xs inline-flex items-center gap-1 disabled:opacity-60"
                            onClick={() => void openCreateShipment(a.ContractId)}
                            disabled={preparingId != null}
                            title="Bu sözleşme için sevkiyat fişi kes"
                          >
                            <TruckIcon size={14} />
                            {preparingId === a.ContractId ? '...' : 'Fiş kes'}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : shipments.length === 0 ? (
        <EmptyState
          icon={<TruckIcon size={48} weight="duotone" />}
          title="Sevkiyat fişi bulunamadı"
          description="Fişler “Sevk bekleyenler” listesinden veya sözleşmenin “Sevkiyatlar” sekmesinden kesilir."
        />
      ) : (
        <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel">
          <div className="overflow-auto max-h-[calc(100vh-160px)] min-h-[200px]">
            <table className="w-full text-xs border-collapse text-text-primary">
              <thead className="sticky top-0 z-10 border-b border-background-border">
                <tr>
                  <th className={th}>Fiş no</th>
                  <th className={th}>Sevk tarihi</th>
                  <th className={th}>Sözleşme</th>
                  <th className={th}>Müşteri</th>
                  <th className={th}>Depo</th>
                  <th className={`${th} text-right`}>Miktar</th>
                  <th className={th}>Plaka</th>
                  <th className={th}>İrsaliye</th>
                  <th className={th}>Durum</th>
                  <th className={`${th} text-center w-12`} title="Dosya ekleri (imzalı irsaliye, fotoğraf)">Ek</th>
                  <th className={`${th} text-center w-16`}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s, index) => {
                  const cancelled = s.Status === 'CANCELLED';
                  return (
                    <tr
                      key={s.ShipmentId}
                      className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${index % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'} ${cancelled ? 'opacity-60' : ''}`}
                      onClick={() => openContract(s.ContractId)}
                    >
                      <td className={td}>
                        <span className={`font-medium text-primary ${cancelled ? 'line-through' : ''}`}>{s.ShipmentNo}</span>
                      </td>
                      <td className={td}>{formatDate(s.ShipmentDate)}</td>
                      <td className={td}>{s.ContractCode || `#${s.ContractId}`}</td>
                      <td className={td}>{s.CustomerName || '—'}</td>
                      <td className={td}>{s.WarehouseName || '—'}</td>
                      <td className={`${td} text-right`}>{s.TotalQuantity ?? 0}</td>
                      <td className={td}>{s.VehiclePlate || '—'}</td>
                      <td className={td}>{s.ExternalWaybillNo || '—'}</td>
                      <td className={td}>
                        <DeliveryStatusBadge shipment={s} />
                      </td>
                      <td className={`${td} text-center`}>
                        {(s.AttachmentCount ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-text-secondary" title={`${s.AttachmentCount} dosya eki`}>
                            <PaperclipIcon size={13} />
                            {s.AttachmentCount}
                          </span>
                        ) : (
                          <span className="text-text-secondary/50">—</span>
                        )}
                      </td>
                      <td className={`${td} text-center whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-background-secondary text-text-secondary hover:text-text-primary"
                          onClick={() => void openPreview(s)}
                          disabled={loadingId === s.ShipmentId}
                          title="Sevk fişi PDF"
                          aria-label={`${s.ShipmentNo} PDF`}
                        >
                          <FilePdfIcon size={16} />
                        </button>
                        {!cancelled && canConfirmDelivery && (
                          <button
                            type="button"
                            className={`p-1 rounded hover:bg-background-secondary ${s.DeliveredAt ? 'text-text-secondary hover:text-text-primary' : 'text-green-400'}`}
                            onClick={() => setDeliveryTarget(s)}
                            title={s.DeliveredAt ? 'Teslim bilgisi / belgeler' : 'Teslimi onayla'}
                            aria-label={`${s.ShipmentNo} teslim onayı`}
                          >
                            <CheckCircleIcon size={16} weight={s.DeliveredAt ? 'fill' : 'regular'} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {pdfPreviewElement}
      {deliveryTarget && (
        <ConfirmDeliveryModal
          shipment={deliveryTarget}
          onClose={() => {
            setDeliveryTarget(null);
            // Modalda ek yüklenmiş olabilir: sayaçlar ve "irsaliye eksik" filtresi tazelensin
            void load();
          }}
          onConfirmed={() => {
            setDeliveryTarget(null);
            void load();
          }}
        />
      )}
      {shipTarget && (
        <CreateShipmentModal
          contract={shipTarget.contract}
          lines={shipTarget.lines}
          onClose={() => setShipTarget(null)}
          onCreated={() => {
            setShipTarget(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

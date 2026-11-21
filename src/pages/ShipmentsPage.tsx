import { Fragment, useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CaretDownIcon,
  CaretRightIcon,
  CheckCircleIcon,
  DotsThreeVerticalIcon,
  FilePdfIcon,
  FunnelSimpleXIcon,
  PaperclipIcon,
  ReceiptIcon,
  TruckIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import {
  isContractActive,
  type Attachment,
  type Contract,
  type ContractAwaitingShipment,
  type InventoryContractLineItem,
  type Shipment,
  type Warehouse,
} from '../models';
import { shipmentService, type ShipmentListParams } from '../services/shipmentService';
import { warehouseService } from '../services/warehouseService';
import { contractService } from '../services/contractService';
import CreateShipmentModal from '../components/modals/CreateShipmentModal';
import ConfirmDeliveryModal from '../components/modals/ConfirmDeliveryModal';
import CancelShipmentModal from '../components/modals/CancelShipmentModal';
import ConfirmModal from '../components/modals/ConfirmModal';
import DeliveryStatusBadge from '../components/shipments/DeliveryStatusBadge';
import ShipmentDetailsPanel from '../components/shipments/ShipmentDetailsPanel';
import { contractDetailsToShipmentLines } from '../utils/shipment';
import { useContextMenu, type ContextMenuActionHandlers } from '../context-menu';
import { copyWithToast, shipmentContextTarget, shipmentCopyHandlers } from '../context-menu/shipmentMenu';
import { invalidateData } from '../store/dataInvalidationStore';
import { useAuthStore } from '../store/authStore';
import { PageActions } from '../components/PageActions';
import EmptyState from '../components/EmptyState';
import { formatDate } from '../utils/formatters';
import { contractPath, type ContractTabState } from '../utils/entityNavigation';
import { getApiErrorMessage } from '../utils/apiError';
import { toast } from '../hooks/useToast';
import { useShipmentPdfPreview } from '../hooks/useShipmentPdfPreview';
import DataTable from '../components/DataTable';
import { useTabReturn } from '../components/tabs/TabContext';

type ViewMode = 'awaiting' | 'shipments';
/** Türetilmiş fiş durumu filtresi: teslim durumu yalnızca aktif fişler için anlamlı */
type StateFilter = '' | 'pending' | 'delivered' | 'CANCELLED';

const th =
  'text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover';
const td = 'py-1 px-2 align-middle border-r border-background-border/60 last:border-r-0';

const STATE_CHIPS: Array<{ value: StateFilter; label: string }> = [
  { value: '', label: 'Tümü' },
  { value: 'pending', label: 'Teslim bekleyen' },
  { value: 'delivered', label: 'Teslim edildi' },
  { value: 'CANCELLED', label: 'İptal' },
];

const normalize = (value: string | null | undefined) => (value ?? '').toLocaleLowerCase('tr-TR');

/** Sayılı filtre çipi */
function Chip({
  active,
  onClick,
  count,
  tone = 'default',
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  tone?: 'default' | 'warn';
  title?: string;
  children: ReactNode;
}) {
  const base = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors';
  const cls = active
    ? tone === 'warn'
      ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
      : 'border-accent/60 bg-accent/20 text-accent'
    : 'border-background-border text-text-secondary hover:bg-background-hover hover:text-text-primary';
  return (
    <button type="button" className={`${base} ${cls}`} onClick={onClick} title={title} aria-pressed={active}>
      {children}
      {count != null && count > 0 && (
        <span
          className={`min-w-[18px] rounded-full px-1 text-[10px] font-semibold text-center ${
            tone === 'warn' ? 'bg-amber-500/30 text-amber-200' : 'bg-background-hover text-text-primary'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * Sevkiyatlar: iki iş listesi.
 * 1) Sevk bekleyenler — malzemesi henüz tamamen gönderilmemiş "Sevkiyat ile" sözleşmeler; buradan fiş kesilir.
 * 2) Sevkiyat fişleri — kesilen fişler; teslim onayı, imzalı irsaliye, PDF, düzenleme ve iptal buradan yapılır.
 * Satır sağ tık menüsü ve "⋯" düğmesi aynı işlem listesini açar.
 */
export default function ShipmentsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const permissions = user?.permissions ?? [];
  const canView = permissions.includes('shipments_view');
  const canCreate = permissions.includes('shipments_create');
  const canConfirmDelivery = permissions.includes('shipments_confirm_delivery');
  const canCancel = permissions.includes('shipments_cancel');
  const canUpdate = permissions.includes('shipments_update');
  const { openContextMenu } = useContextMenu();

  const [view, setView] = useState<ViewMode>('awaiting');
  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('');
  const [missingWaybill, setMissingWaybill] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [awaiting, setAwaiting] = useState<ContractAwaitingShipment[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [shipmentTotal, setShipmentTotal] = useState(0);
  const [counts, setCounts] = useState({ pending: 0, missingWaybill: 0 });
  const [loading, setLoading] = useState(false);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  /** Açılan fişin kalemli tam kaydı (liste yanıtı kalem içermez) */
  const [details, setDetails] = useState<Record<number, Shipment>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);

  const [deliveryTarget, setDeliveryTarget] = useState<Shipment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Shipment | null>(null);
  const [undoTarget, setUndoTarget] = useState<Shipment | null>(null);
  const [undoing, setUndoing] = useState(false);
  const { openPreview, loadingId, element: pdfPreviewElement } = useShipmentPdfPreview();
  const [shipTarget, setShipTarget] = useState<{ contract: Contract; lines: InventoryContractLineItem[] } | null>(null);
  const [preparingId, setPreparingId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<{
    contract: Contract;
    lines: InventoryContractLineItem[];
    shipment: Shipment;
    headerOnly: boolean;
  } | null>(null);
  const [preparingEditId, setPreparingEditId] = useState<number | null>(null);

  useEffect(() => {
    warehouseService.getAllAsync().then(setWarehouses).catch(() => setWarehouses([]));
  }, []);

  const filtersActive = Boolean(search.trim() || warehouseId !== '' || stateFilter || missingWaybill || dateFrom || dateTo);

  const clearFilters = () => {
    setSearch('');
    setWarehouseId('');
    setStateFilter('');
    setMissingWaybill(false);
    setDateFrom('');
    setDateTo('');
  };

  const load = useCallback(async () => {
    if (!canView) return;
    try {
      setLoading(true);
      // Sevk bekleyenler her iki görünümde de yüklenir (sekme sayacı); arama istemcide yapılır.
      const awaitingPromise = shipmentService.listAwaitingContractsAsync();
      if (view === 'awaiting') {
        setAwaiting(await awaitingPromise);
        return;
      }
      // Durum çiplerindeki sayılar, durum dışındaki filtrelere (arama, depo, tarih) uyar.
      const base: ShipmentListParams = {
        search: search.trim() || undefined,
        warehouseId: warehouseId === '' ? undefined : warehouseId,
        dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
        dateTo: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
      };
      const [list, pending, missing, awaitingRows] = await Promise.all([
        shipmentService.listAsync({
          ...base,
          status: stateFilter === 'CANCELLED' ? 'CANCELLED' : undefined,
          deliveryState: stateFilter === 'pending' || stateFilter === 'delivered' ? stateFilter : undefined,
          missingWaybill: missingWaybill || undefined,
          limit: 500,
        }),
        shipmentService.listAsync({ ...base, deliveryState: 'pending', limit: 1 }),
        shipmentService.listAsync({ ...base, missingWaybill: true, limit: 1 }),
        awaitingPromise,
      ]);
      const items = list.items ?? [];
      setShipments(items);
      setShipmentTotal(list.total ?? items.length);
      setCounts({ pending: pending.total ?? 0, missingWaybill: missing.total ?? 0 });
      setAwaiting(awaitingRows);
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

  /** Açık ayrıntıyı (kalemler, teslim bilgisi) sunucudan tazele */
  const loadDetail = useCallback(async (shipmentId: number) => {
    try {
      setDetailLoadingId(shipmentId);
      const fresh = await shipmentService.getByIdAsync(shipmentId);
      setDetails((prev) => ({ ...prev, [shipmentId]: fresh }));
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Fiş ayrıntısı yüklenemedi.');
    } finally {
      setDetailLoadingId((cur) => (cur === shipmentId ? null : cur));
    }
  }, []);

  const refresh = useCallback(() => {
    void load();
    if (expandedId != null) void loadDetail(expandedId);
  }, [load, loadDetail, expandedId]);

  // Başka sekmede yapılan değişiklikler, bu sekmeye dönüldüğünde yansısın.
  useTabReturn(refresh);

  const toggleExpanded = (shipmentId: number) => {
    if (expandedId === shipmentId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(shipmentId);
    void loadDetail(shipmentId);
  };

  const showDetails = (shipmentId: number) => {
    if (expandedId !== shipmentId) toggleExpanded(shipmentId);
  };

  const headerActions = useMemo(
    () =>
      canView ? (
        <button onClick={refresh} className="btn-secondary py-1.5 px-3 text-sm">
          Yenile
        </button>
      ) : null,
    [canView, refresh]
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

  /** Düzenleme penceresi: güncel sözleşme satırları ve fişin kalemleri gerekir */
  const openEditShipment = async (shipment: Shipment) => {
    if (preparingEditId != null) return;
    try {
      setPreparingEditId(shipment.ShipmentId);
      const [contract, fresh] = await Promise.all([
        contractService.getByIdAsync(shipment.ContractId),
        shipmentService.getByIdAsync(shipment.ShipmentId),
      ]);
      if (fresh.Status === 'CANCELLED') {
        toast.warning('Fiş iptal edilmiş; düzenlenemez.');
        refresh();
        return;
      }
      setEditTarget({
        contract,
        lines: contractDetailsToShipmentLines(contract),
        shipment: fresh,
        headerOnly: !isContractActive(contract),
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Fiş yüklenemedi.');
    } finally {
      setPreparingEditId(null);
    }
  };

  const openContract = (contractId: number, initialTab: NonNullable<ContractTabState['initialTab']> = 'shipments') =>
    navigate(contractPath(contractId), { state: { initialTab } satisfies ContractTabState });

  /** Sözleşmenin fişlerini bu sayfada listele (diğer filtreler temizlenir) */
  const showContractShipments = (contractCode: string | null | undefined, contractId: number) => {
    clearFilters();
    setSearch(contractCode || `#${contractId}`);
    setExpandedId(null);
    setView('shipments');
  };

  const undoDelivery = async (shipment: Shipment) => {
    try {
      setUndoing(true);
      await shipmentService.undoDeliveryAsync(shipment.ShipmentId);
      toast.success(`${shipment.ShipmentNo} teslim onayı geri alındı.`);
      setUndoTarget(null);
      refresh();
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Teslim onayı geri alınamadı.');
    } finally {
      setUndoing(false);
    }
  };

  /** Ayrıntıda ek yüklenince/silinince satırdaki sayaç ve irsaliye işaretini yerinde güncelle */
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

  // ─── Sağ tık menüleri ───────────────────────────────────────────────────

  /** Sevk bekleyen sözleşme satırı: sevk odaklı kısa menü */
  const openAwaitingMenu = (event: MouseEvent<HTMLElement>, row: ContractAwaitingShipment) => {
    event.preventDefault();
    event.stopPropagation();
    const handlers: ContextMenuActionHandlers = {
      'contract.open': () => openContract(row.ContractId, 'info'),
      'contract.goto.shipments': () => openContract(row.ContractId, 'shipments'),
      'contract.showShipments': () => showContractShipments(row.ContractCode, row.ContractId),
      'contract.copyCode': () => copyWithToast(row.ContractCode, 'Sözleşme kodu'),
    };
    if (canCreate) handlers['contract.ship'] = () => openCreateShipment(row.ContractId);
    openContextMenu({
      menuKey: 'awaitingShipmentRow',
      ...menuPosition(event),
      target: {
        entityType: 'contract',
        entityId: row.ContractId,
        itemName: row.ContractCode || `#${row.ContractId}`,
        rawData: {
          ContractId: row.ContractId,
          ContractCode: row.ContractCode ?? undefined,
          IsCompleted: false,
          IsRental: true,
          IsShipmentMode: true,
          PendingShipmentQuantity: Number(row.PendingQuantity) || 0,
          ShippedQuantityTotal: Number(row.ShippedQuantity) || 0,
        },
      },
      handlers,
    });
  };

  /** Sevkiyat fişi satırı: görüntüle → teslim → fiş işlemleri → iptal */
  const openShipmentMenu = (event: MouseEvent<HTMLElement>, shipment: Shipment) => {
    event.preventDefault();
    event.stopPropagation();
    const handlers: ContextMenuActionHandlers = {
      'shipment.details': () => showDetails(shipment.ShipmentId),
      'shipment.preview': () => void openPreview(shipment),
      'shipment.openContract': () => openContract(shipment.ContractId),
      'shipment.filterContract': () => showContractShipments(shipment.ContractCode, shipment.ContractId),
      'shipment.confirmDelivery': () => setDeliveryTarget(shipment),
      'shipment.editDelivery': () => setDeliveryTarget(shipment),
      // Onay menüde soruluyor; burada doğrudan geri al
      'shipment.undoDelivery': () => undoDelivery(shipment),
      ...shipmentCopyHandlers(shipment),
    };
    if (canCancel) handlers['shipment.cancel'] = () => setCancelTarget(shipment);
    if (canUpdate) handlers['shipment.edit'] = () => void openEditShipment(shipment);
    openContextMenu({
      menuKey: 'shipmentRow',
      ...menuPosition(event),
      target: shipmentContextTarget(shipment),
      handlers,
    });
  };

  if (!canView) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-text-secondary">Bu sayfayı görüntüleme yetkiniz yok.</div>
      </div>
    );
  }

  const awaitingQuery = normalize(search.trim());
  const visibleAwaiting = awaitingQuery
    ? awaiting.filter((a) =>
        [a.ContractCode, a.CustomerName, a.SiteName].some((v) => normalize(v).includes(awaitingQuery))
      )
    : awaiting;
  const awaitingTotalQty = visibleAwaiting.reduce((s, a) => s + (Number(a.PendingQuantity) || 0), 0);
  const shipmentQty = shipments.reduce((s, x) => s + (x.Status === 'CANCELLED' ? 0 : Number(x.TotalQuantity) || 0), 0);

  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-1.5 ${
      active ? 'bg-accent/20 text-accent font-medium' : 'text-text-secondary hover:bg-background-hover'
    }`;

  return (
    <div>
      {/* ── Başlık: görünüm sekmeleri ── */}
      <div className="mb-1.5 rounded border border-background-border bg-background-panel p-1.5 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex rounded border border-background-border overflow-hidden text-sm" role="tablist">
            <button type="button" role="tab" aria-selected={view === 'awaiting'} className={tabClass(view === 'awaiting')} onClick={() => setView('awaiting')}>
              <TruckIcon size={15} />
              Sevk bekleyenler
              {awaiting.length > 0 && (
                <span className="rounded-full bg-amber-500/25 text-amber-200 px-1.5 text-[11px] font-semibold">{awaiting.length}</span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'shipments'}
              className={`${tabClass(view === 'shipments')} border-l border-background-border`}
              onClick={() => setView('shipments')}
            >
              <ReceiptIcon size={15} />
              Sevkiyat fişleri
            </button>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={view === 'awaiting' ? 'Ara: sözleşme, müşteri, şantiye' : 'Ara: fiş no, sözleşme, müşteri, plaka'}
            className="input py-1.5 px-2 text-sm min-w-[240px]"
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
              <span className="text-xs text-text-secondary">Sevk tarihi</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input py-1.5 px-2 text-sm w-[130px]" title="Başlangıç" />
              <span className="text-text-secondary text-xs">–</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input py-1.5 px-2 text-sm w-[130px]" title="Bitiş" />
            </>
          )}
          {filtersActive && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary px-1.5 py-1"
              onClick={clearFilters}
              title="Tüm filtreleri temizle"
            >
              <FunnelSimpleXIcon size={14} /> Temizle
            </button>
          )}
          <PageActions className="ml-auto">{headerActions}</PageActions>
        </div>

        {/* ── İkinci satır: durum çipleri + özet ── */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {view === 'shipments' ? (
            <>
              {STATE_CHIPS.map((c) => (
                <Chip
                  key={c.value || 'all'}
                  active={stateFilter === c.value}
                  onClick={() => setStateFilter(c.value)}
                  count={c.value === 'pending' ? counts.pending : undefined}
                >
                  {c.label}
                </Chip>
              ))}
              <span className="mx-1 h-4 w-px bg-background-border" />
              <Chip
                active={missingWaybill}
                onClick={() => setMissingWaybill((v) => !v)}
                count={counts.missingWaybill}
                tone="warn"
                title="İmzalı irsaliye eki olmayan aktif fişler"
              >
                <WarningIcon size={13} /> İmzalı irsaliye eksik
              </Chip>
              <span className="ml-auto text-text-secondary">
                {shipmentTotal > shipments.length ? `${shipments.length} / ${shipmentTotal}` : shipments.length} fiş · {shipmentQty} adet
                <span className="hidden lg:inline"> · satıra tıkla: ayrıntı · çift tık: sözleşme · sağ tık: işlemler</span>
              </span>
            </>
          ) : (
            <>
              <span className="text-text-secondary">
                “Sevkiyat ile” açılan sözleşmeler, malzemenin tamamı gönderilene kadar burada kalır. Kira, fiş kesilen günden başlar.
              </span>
              <span className="ml-auto text-text-secondary">
                {visibleAwaiting.length > 0 && (
                  <>
                    {visibleAwaiting.length} sözleşme · <span className="text-amber-300 font-medium">{awaitingTotalQty} adet</span> bekliyor
                  </>
                )}
                <span className="hidden lg:inline"> · satıra tıkla: sözleşme · sağ tık: işlemler</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── İçerik ── */}
      {loading && (view === 'awaiting' ? awaiting.length === 0 : shipments.length === 0) ? (
        <div className="flex items-center justify-center py-16 text-text-secondary">Yükleniyor...</div>
      ) : view === 'awaiting' ? (
        visibleAwaiting.length === 0 ? (
          <EmptyState
            icon={<TruckIcon size={48} weight="duotone" />}
            title={awaitingQuery ? 'Aramaya uyan sözleşme yok' : 'Sevk bekleyen sözleşme yok'}
            description={
              awaitingQuery
                ? 'Arama metnini değiştirin veya temizleyin.'
                : '“Sevkiyat ile” açılan kiralama sözleşmeleri, malzemenin tamamı sevk edilene kadar burada listelenir.'
            }
          />
        ) : (
          <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel">
            <div className="overflow-auto max-h-[calc(100vh-190px)] min-h-[200px]">
              <DataTable tableId="ShipmentsPage.1" className="w-full text-xs border-collapse text-text-primary">
                <thead className="sticky top-0 z-10 border-b border-background-border">
                  <tr>
                    <th className={th}>Sözleşme</th>
                    <th className={th}>Müşteri</th>
                    <th className={th}>Şantiye</th>
                    <th className={th}>Sözleşme tarihi</th>
                    <th className={th}>İlk sevk</th>
                    <th className={`${th} min-w-[180px]`}>Sevk ilerlemesi</th>
                    <th className={`${th} text-right`}>Bekleyen</th>
                    <th className={`${th} text-center w-28`}>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAwaiting.map((a, index) => {
                    const contracted = Number(a.ContractQuantity) || 0;
                    const shipped = Number(a.ShippedQuantity) || 0;
                    const pct = contracted > 0 ? Math.min(100, Math.round((shipped / contracted) * 100)) : 0;
                    return (
                      <tr
                        key={a.ContractId}
                        className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${index % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'}`}
                        onClick={() => openContract(a.ContractId)}
                        onContextMenu={(event) => openAwaitingMenu(event, a)}
                        title="Tıkla: sözleşmenin sevkiyat sekmesi · Sağ tık: işlemler"
                      >
                        <td className={td}>
                          <span className="font-medium text-primary">{a.ContractCode || `#${a.ContractId}`}</span>
                        </td>
                        <td className={td}>{a.CustomerName || '—'}</td>
                        <td className={td}>{a.SiteName || '—'}</td>
                        <td className={td}>{formatDate(a.StartDate)}</td>
                        <td className={td}>
                          {a.FirstShipmentDate ? formatDate(a.FirstShipmentDate) : <span className="text-amber-300">Henüz sevk yok</span>}
                        </td>
                        <td className={td}>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-background-hover overflow-hidden">
                              <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="whitespace-nowrap text-text-secondary">
                              {shipped} / {contracted}
                            </span>
                          </div>
                        </td>
                        <td className={`${td} text-right font-semibold text-amber-300`}>{a.PendingQuantity}</td>
                        <td className={`${td} text-center whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                          {canCreate && (
                            <button
                              type="button"
                              className="btn-primary py-0.5 px-2 text-xs inline-flex items-center gap-1 disabled:opacity-60"
                              onClick={() => void openCreateShipment(a.ContractId)}
                              disabled={preparingId != null}
                              title="Bu sözleşme için sevkiyat fişi kes"
                            >
                              <TruckIcon size={14} />
                              {preparingId === a.ContractId ? '...' : 'Sevk et'}
                            </button>
                          )}
                          <MoreButton onClick={(e) => openAwaitingMenu(e, a)} label={`${a.ContractCode || a.ContractId} işlemleri`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </div>
          </div>
        )
      ) : shipments.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 gap-2">
          <ReceiptIcon size={48} weight="duotone" className="text-text-secondary" />
          <div className="text-lg opacity-50">{filtersActive ? 'Filtrelere uyan fiş yok' : 'Henüz sevkiyat fişi yok'}</div>
          <div className="text-sm opacity-40">
            {filtersActive
              ? 'Filtreleri değiştirin ya da temizleyin.'
              : 'Fişler “Sevk bekleyenler” listesinden veya sözleşmenin “Sevkiyatlar” sekmesinden kesilir.'}
          </div>
          {filtersActive && (
            <button type="button" className="btn-secondary py-1 px-3 text-sm mt-2" onClick={clearFilters}>
              Filtreleri temizle
            </button>
          )}
        </div>
      ) : (
        <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel">
          <div className="overflow-auto max-h-[calc(100vh-190px)] min-h-[200px]">
            <DataTable tableId="ShipmentsPage.2" className="w-full text-xs border-collapse text-text-primary">
              <thead className="sticky top-0 z-10 border-b border-background-border">
                <tr>
                  <th className={`${th} w-6`} aria-label="Ayrıntı" />
                  <th className={th}>Fiş no</th>
                  <th className={th}>Sevk tarihi</th>
                  <th className={th}>Sözleşme</th>
                  <th className={th}>Müşteri</th>
                  <th className={th}>Depo</th>
                  <th className={`${th} text-right`}>Miktar</th>
                  <th className={th}>Araç</th>
                  <th className={th}>Durum</th>
                  <th className={th} title="Harici irsaliye no ve dosya ekleri">İrsaliye / Belge</th>
                  <th className={`${th} text-center w-40`}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s, index) => {
                  const cancelled = s.Status === 'CANCELLED';
                  const delivered = Boolean(s.DeliveredAt);
                  const expanded = expandedId === s.ShipmentId;
                  const attachmentCount = s.AttachmentCount ?? 0;
                  const detail = details[s.ShipmentId];
                  return (
                    <Fragment key={s.ShipmentId}>
                      <tr
                        className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${
                          expanded ? 'bg-accent/10' : index % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'
                        } ${cancelled ? 'opacity-60' : ''}`}
                        onClick={() => toggleExpanded(s.ShipmentId)}
                        onDoubleClick={() => openContract(s.ContractId)}
                        onContextMenu={(event) => openShipmentMenu(event, s)}
                        aria-expanded={expanded}
                      >
                        <td className={`${td} text-text-secondary`}>
                          {expanded ? <CaretDownIcon size={12} /> : <CaretRightIcon size={12} />}
                        </td>
                        <td className={td}>
                          <span className={`font-medium text-primary ${cancelled ? 'line-through' : ''}`}>{s.ShipmentNo}</span>
                        </td>
                        <td className={td}>{formatDate(s.ShipmentDate)}</td>
                        <td className={td} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="hover:underline text-text-primary"
                            onClick={() => openContract(s.ContractId)}
                            title="Sözleşmeyi aç"
                          >
                            {s.ContractCode || `#${s.ContractId}`}
                          </button>
                        </td>
                        <td className={td} title={s.SiteName ? `Şantiye: ${s.SiteName}` : undefined}>
                          {s.CustomerName || '—'}
                        </td>
                        <td className={td}>{s.WarehouseName || '—'}</td>
                        <td className={`${td} text-right`}>{s.TotalQuantity ?? 0}</td>
                        <td className={td} title={s.DriverName ? `Şoför: ${s.DriverName}` : undefined}>
                          {s.VehiclePlate || '—'}
                        </td>
                        <td className={td}>
                          <DeliveryStatusBadge shipment={s} />
                        </td>
                        <td className={td}>
                          <span className="inline-flex items-center gap-2">
                            <span className={s.ExternalWaybillNo ? '' : 'text-text-secondary/50'}>{s.ExternalWaybillNo || '—'}</span>
                            {attachmentCount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-text-secondary" title={`${attachmentCount} dosya eki`}>
                                <PaperclipIcon size={13} />
                                {attachmentCount}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className={`${td} whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5">
                            {!cancelled && !delivered && canConfirmDelivery && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs bg-green-600/20 text-green-300 hover:bg-green-600/30"
                                onClick={() => setDeliveryTarget(s)}
                                title="Teslim alan kişiyi ve imzalı irsaliyeyi kaydet"
                              >
                                <CheckCircleIcon size={14} /> Teslim onayla
                              </button>
                            )}
                            {!cancelled && delivered && !s.HasSignedWaybill && canConfirmDelivery && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                                onClick={() => setDeliveryTarget(s)}
                                title="İmzalı irsaliyeyi yükle"
                              >
                                <PaperclipIcon size={14} /> İrsaliye ekle
                              </button>
                            )}
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-background-secondary text-text-secondary hover:text-text-primary disabled:opacity-50"
                              onClick={() => void openPreview(s)}
                              disabled={loadingId === s.ShipmentId}
                              title="Sevk fişi PDF"
                              aria-label={`${s.ShipmentNo} PDF`}
                            >
                              <FilePdfIcon size={16} />
                            </button>
                            <MoreButton onClick={(e) => openShipmentMenu(e, s)} label={`${s.ShipmentNo} işlemleri`} />
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-background-surface/60 border-b border-background-border">
                          <td colSpan={11} className="px-4 py-3 border-l-2 border-l-accent">
                            <ShipmentDetailsPanel
                              shipment={detail ? { ...s, ...detail } : s}
                              itemsLoading={detailLoadingId === s.ShipmentId}
                              canConfirmDelivery={canConfirmDelivery}
                              onConfirmDelivery={() => setDeliveryTarget(detail ? { ...s, ...detail } : s)}
                              onUndoDelivery={() => setUndoTarget(s)}
                              onAttachmentsChange={(items) => syncAttachments(s.ShipmentId, items)}
                            />
                            {!cancelled && (canUpdate || canCancel) && (
                              <div className="mt-3 flex flex-wrap gap-1.5 justify-end">
                                {canUpdate && (
                                  <button
                                    type="button"
                                    className="btn-secondary py-0.5 px-2 text-xs disabled:opacity-60"
                                    onClick={() => void openEditShipment(s)}
                                    disabled={preparingEditId != null}
                                  >
                                    {preparingEditId === s.ShipmentId ? '...' : 'Fişi düzenle'}
                                  </button>
                                )}
                                {canCancel && (
                                  <button
                                    type="button"
                                    className="btn-secondary py-0.5 px-2 text-xs text-red-400"
                                    onClick={() => setCancelTarget(s)}
                                    title="Malzeme depoya geri alınır"
                                  >
                                    Fişi iptal et
                                  </button>
                                )}
                              </div>
                            )}
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
      )}

      {pdfPreviewElement}
      {deliveryTarget && (
        <ConfirmDeliveryModal
          shipment={deliveryTarget}
          onClose={() => {
            setDeliveryTarget(null);
            // Modalda ek yüklenmiş olabilir: sayaçlar ve "irsaliye eksik" filtresi tazelensin
            refresh();
          }}
          onAttachmentsChanged={(items) => syncAttachments(deliveryTarget.ShipmentId, items)}
          onConfirmed={() => {
            setDeliveryTarget(null);
            refresh();
          }}
        />
      )}
      <ConfirmModal
        open={undoTarget != null}
        title="Teslim onayı geri alınsın mı?"
        message={undoTarget ? `${undoTarget.ShipmentNo} yeniden "Teslim bekliyor" durumuna döner. Eklenen dosyalar silinmez.` : ''}
        confirmLabel="Geri al"
        cancelLabel="Vazgeç"
        variant="danger"
        loading={undoing}
        onConfirm={() => undoTarget && void undoDelivery(undoTarget)}
        onCancel={() => setUndoTarget(null)}
      />
      {cancelTarget && (
        <CancelShipmentModal
          shipment={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onEditInstead={
            canUpdate
              ? () => {
                  const target = cancelTarget;
                  setCancelTarget(null);
                  void openEditShipment(target);
                }
              : undefined
          }
          onCancelled={() => {
            setCancelTarget(null);
            invalidateData('contracts');
            refresh();
          }}
        />
      )}
      {shipTarget && (
        <CreateShipmentModal
          contract={shipTarget.contract}
          lines={shipTarget.lines}
          onClose={() => setShipTarget(null)}
          onSaved={() => {
            setShipTarget(null);
            invalidateData('contracts');
            refresh();
          }}
        />
      )}
      {editTarget && (
        <CreateShipmentModal
          contract={editTarget.contract}
          lines={editTarget.lines}
          shipment={editTarget.shipment}
          headerOnly={editTarget.headerOnly}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            invalidateData('contracts');
            refresh();
          }}
        />
      )}
    </div>
  );
}

/** Sağ tık menüsünü düğmenin altında açar (fare kullanmayanlar ve sağ tıkı bilmeyenler için) */
function MoreButton({ onClick, label }: { onClick: (event: MouseEvent<HTMLElement>) => void; label: string }) {
  return (
    <button
      type="button"
      className="p-1 rounded hover:bg-background-secondary text-text-secondary hover:text-text-primary"
      onClick={onClick}
      title="Tüm işlemler (sağ tık ile de açılır)"
      aria-label={label}
      aria-haspopup="menu"
    >
      <DotsThreeVerticalIcon size={16} weight="bold" />
    </button>
  );
}

/** Sağ tıkta imleç konumu; düğmeyle açılınca düğmenin sol altı */
function menuPosition(event: MouseEvent<HTMLElement>): { x: number; y: number } {
  if (event.type === 'click') {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: rect.left, y: rect.bottom + 2 };
  }
  return { x: event.clientX, y: event.clientY };
}

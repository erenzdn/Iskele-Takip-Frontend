import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowsClockwiseIcon, CaretDownIcon, CaretRightIcon, ListMagnifyingGlassIcon } from '@phosphor-icons/react';
import EmptyState from '../components/EmptyState';
import { inventoryService } from '../services/inventoryService';
import { warehouseService } from '../services/warehouseService';
import type { InventoryItemMovementsResponse, InventoryItemMovementContractRow, Warehouse } from '../models';
import { formatMoney, formatShortDateTime } from '../utils/formatters';
import { toast } from '../hooks/useToast';
import { getApiErrorMessage } from '../utils/apiError';
import { useArchivePreferencesStore } from '../store/archivePreferencesStore';

type FiltersState = {
  warehouseId: number | '';
  dateFrom: string;
  dateTo: string;
  includeCompleted: boolean;
};

function formatInt(n: number | null | undefined): string {
  const safe = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return safe.toLocaleString('tr-TR');
}

function formatDateTr(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function rowKey(row: InventoryItemMovementContractRow): string {
  return `${row.ContractId}-${row.dispatch?.detailId ?? 'x'}`;
}

export default function ItemMovementsPage() {
  const navigate = useNavigate();
  const { itemId } = useParams();
  const parsedItemId = Number(itemId);
  const showArchivedWarehouses = useArchivePreferencesStore((s) => s.showArchivedWarehouses);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [filters, setFilters] = useState<FiltersState>({
    warehouseId: '',
    dateFrom: '',
    dateTo: '',
    includeCompleted: true,
  });

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<InventoryItemMovementsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const lastLoadedFiltersRef = useRef<string>('');

  const loadWarehouses = useCallback(async () => {
    try {
      const rows = await warehouseService.getAllAsync({
        includeArchived: showArchivedWarehouses || undefined,
      });
      const sorted = (rows || []).slice().sort((a, b) => (a.WarehouseName || '').localeCompare(b.WarehouseName || '', 'tr-TR'));
      setWarehouses(sorted);
    } catch (e) {
      console.error('Load warehouses error:', e);
      setWarehouses([]);
    }
  }, [showArchivedWarehouses]);

  const loadMovements = useCallback(async (opts?: { showToastOnError?: boolean }) => {
    if (!Number.isFinite(parsedItemId) || parsedItemId <= 0) {
      setError('Geçersiz ürün seçimi.');
      setLoading(false);
      return;
    }
    const filterKey = JSON.stringify(filters);
    lastLoadedFiltersRef.current = filterKey;
    try {
      setLoading(true);
      setError(null);
      const res = await inventoryService.getItemMovementsAsync(parsedItemId, {
        warehouseId: filters.warehouseId === '' ? undefined : Number(filters.warehouseId),
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        includeCompleted: filters.includeCompleted,
      });
      if (lastLoadedFiltersRef.current !== filterKey) return;
      setData(res);
      setExpanded(new Set());
    } catch (e) {
      console.error('Load item movements error:', e);
      const msg = getApiErrorMessage(e) || 'Hareket dökümü yüklenemedi.';
      setError(msg);
      setData(null);
      if (opts?.showToastOnError) toast.error(msg);
    } finally {
      if (lastLoadedFiltersRef.current === filterKey) setLoading(false);
    }
  }, [filters, parsedItemId]);

  useEffect(() => {
    void loadWarehouses();
  }, [loadWarehouses]);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  const itemHeader = useMemo(() => {
    const item = data?.item;
    return {
      name: item?.ItemName || `Ürün #${parsedItemId}`,
      code: item?.ItemCode || '-',
    };
  }, [data?.item, parsedItemId]);

  const summary = data?.summary;
  const contracts = data?.contracts ?? [];

  const toggleExpand = (row: InventoryItemMovementContractRow) => {
    const key = rowKey(row);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openContractDetail = (row: InventoryItemMovementContractRow) => {
    // Sözleşmeler sayfası modal tabanlı olduğu için state ile açtırıyoruz.
    navigate('/contracts/rental', {
      state: {
        openContractId: row.ContractId,
        initialTab: 'info',
        preferTab: row.isCompleted ? 'completed' : 'active',
      },
    });
  };

  const openCustomerDetail = (row: InventoryItemMovementContractRow) => {
    navigate('/customers', {
      state: {
        openCustomerId: row.customer?.CustomerId,
      },
    });
  };

  const renderStatusBadge = (row: InventoryItemMovementContractRow) => {
    const c = 'inline-block px-2 py-0.5 rounded text-xs font-medium';
    if (row.isCompleted) return <span className={`${c} bg-gray-700 text-gray-100`}>Tamamlandı</span>;
    return <span className={`${c} bg-green-700 text-green-100`}>Aktif</span>;
  };

  const renderStillOut = (row: InventoryItemMovementContractRow) => {
    const still = row.totals?.stillOut ?? 0;
    if (still <= 0) {
      return (
        <span className="inline-flex items-center gap-1 text-green-400 font-medium">
          <span aria-hidden>✓</span> 0
        </span>
      );
    }
    return <span className="tabular-nums">{formatInt(still)}</span>;
  };

  return (
    <div className="p-8">
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-xs text-text-secondary">Ürün Hareket Dökümü</div>
          <div className="text-xl font-semibold text-text-primary">
            {itemHeader.name}{' '}
            <span className="text-text-secondary font-mono text-base">({itemHeader.code})</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/inventory')} className="btn-secondary py-2 px-3 text-sm">
            Envantere Dön
          </button>
          <button
            onClick={() => void loadMovements({ showToastOnError: true })}
            className="btn-secondary py-2 px-3 text-sm inline-flex items-center gap-2"
          >
            <ArrowsClockwiseIcon size={16} weight="bold" /> Yenile
          </button>
        </div>
      </div>

      <div className="mb-3 rounded border border-background-border bg-background-panel p-3">
        <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-medium text-text-secondary">Filtreler</span>
          <button
            type="button"
            onClick={() => {
              setFilters({ warehouseId: '', dateFrom: '', dateTo: '', includeCompleted: true });
            }}
            className="btn-secondary py-1.5 px-3 text-xs"
          >
            Filtreleri Sıfırla
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-end">
          <div className="lg:col-span-3">
            <label className="text-xs text-text-secondary block mb-1">Depo</label>
            <select
              className="input py-2 px-3 text-sm w-full"
              value={filters.warehouseId}
              onChange={(e) => setFilters((p) => ({ ...p, warehouseId: e.target.value === '' ? '' : Number(e.target.value) }))}
            >
              <option value="">Tüm Depolar</option>
              {warehouses.map((w) => (
                <option key={w.WarehouseId} value={w.WarehouseId}>
                  {w.WarehouseName}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-3">
            <label className="text-xs text-text-secondary block mb-1">Başlangıç Tarihi</label>
            <input
              type="date"
              className="input py-2 px-3 text-sm w-full"
              value={filters.dateFrom}
              onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value }))}
            />
          </div>

          <div className="lg:col-span-3">
            <label className="text-xs text-text-secondary block mb-1">Bitiş Tarihi</label>
            <input
              type="date"
              className="input py-2 px-3 text-sm w-full"
              value={filters.dateTo}
              onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value }))}
            />
          </div>

          <div className="lg:col-span-2 flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer whitespace-nowrap mt-6 lg:mt-0">
              <input
                type="checkbox"
                className="rounded border-background-border"
                checked={filters.includeCompleted}
                onChange={(e) => setFilters((p) => ({ ...p, includeCompleted: e.target.checked }))}
              />
              Kapalı Dahil
            </label>
          </div>

          <div className="lg:col-span-1">
            <button
              type="button"
              onClick={() => void loadMovements({ showToastOnError: true })}
              className="btn-primary py-2 px-3 text-sm w-full"
            >
              Filtrele
            </button>
          </div>
        </div>
      </div>

      {summary ? (
        <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          <div className="rounded border border-background-border bg-background-panel p-3">
            <div className="text-xs text-text-secondary">Toplam Sözleşme</div>
            <div className="text-lg font-semibold text-text-primary tabular-nums">{formatInt(summary.totalContracts)}</div>
          </div>
          <div className="rounded border border-background-border bg-background-panel p-3">
            <div className="text-xs text-text-secondary">Toplam Çıkış</div>
            <div className="text-lg font-semibold text-text-primary tabular-nums">{formatInt(summary.totalDispatched)}</div>
          </div>
          <div className="rounded border border-background-border bg-background-panel p-3">
            <div className="text-xs text-text-secondary">Toplam İade</div>
            <div className="text-lg font-semibold text-text-primary tabular-nums">{formatInt(summary.totalReturned)}</div>
          </div>
          <div className="rounded border border-background-border bg-background-panel p-3">
            <div className="text-xs text-text-secondary">Şu An Kirada</div>
            <div className="text-lg font-semibold text-text-primary tabular-nums">{formatInt(summary.currentlyOnRent)}</div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mb-3 rounded border border-red-700/50 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-text-secondary">Yükleniyor...</div>
        </div>
      ) : contracts.length === 0 ? (
        <EmptyState
          icon={<ListMagnifyingGlassIcon size={48} weight="duotone" />}
          title="Bu ürün için hareket kaydı bulunamadı"
          description="Filtreleri değiştirip tekrar deneyebilirsiniz."
        />
      ) : (
        <>
          {/* Desktop / Tablet: Table */}
          <div className="hidden md:block border border-background-border rounded-panel overflow-hidden bg-background-panel">
            <div className="overflow-auto max-h-[calc(100vh-320px)] min-h-[320px]">
              <table className="w-full text-xs border-collapse text-text-primary">
                <thead className="sticky top-0 z-10 border-b border-background-border">
                  <tr>
                    <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover" />
                    <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                      Sözleşme
                    </th>
                    <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                      Tip
                    </th>
                    <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                      Müşteri
                    </th>
                    <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                      Şantiye
                    </th>
                    <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                      Kaynak Depo
                    </th>
                    <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                      Çıkış Tarihi
                    </th>
                    <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                      Miktar
                    </th>
                    <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                      İade
                    </th>
                    <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                      Kalan
                    </th>
                    <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">
                      Durum
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((row, index) => {
                    const key = rowKey(row);
                    const isOpen = expanded.has(key);
                    return (
                      <>
                        <tr
                          key={key}
                          className={`border-b border-background-border hover:bg-background-hover ${index % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'}`}
                        >
                          <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 w-9">
                            <button
                              type="button"
                              onClick={() => toggleExpand(row)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-background-hover"
                              title={isOpen ? 'Daralt' : 'Genişlet'}
                            >
                              {isOpen ? <CaretDownIcon size={16} /> : <CaretRightIcon size={16} />}
                            </button>
                          </td>
                          <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                            <button
                              type="button"
                              onClick={() => openContractDetail(row)}
                              className="text-primary hover:underline font-medium"
                              title="Sözleşme detayını aç"
                            >
                              {row.ContractCode || `#${row.ContractId}`}
                            </button>
                          </td>
                          <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                            <span className="font-mono">{String(row.Type ?? '-')}</span>
                          </td>
                          <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                            <button
                              type="button"
                              onClick={() => openCustomerDetail(row)}
                              className="text-primary hover:underline"
                              title="Müşteri detayını aç"
                            >
                              {row.customer?.CustomerName ?? '—'}
                            </button>
                          </td>
                          <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                            {row.site?.SiteName ? row.site.SiteName : <span className="text-text-secondary">-</span>}
                          </td>
                          <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                            {row.dispatch?.sourceWarehouseName ?? '-'}
                          </td>
                          <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                            {formatDateTr(row.dispatch?.dispatchDate)}
                          </td>
                          <td className="py-0.5 px-2 text-right align-middle border-r border-background-border/60 last:border-r-0 tabular-nums">
                            {formatInt(row.dispatch?.rentedQuantity)}
                          </td>
                          <td className="py-0.5 px-2 text-right align-middle border-r border-background-border/60 last:border-r-0 tabular-nums">
                            {formatInt(row.totals?.returned)}
                          </td>
                          <td className="py-0.5 px-2 text-right align-middle border-r border-background-border/60 last:border-r-0">
                            {renderStillOut(row)}
                          </td>
                          <td className="py-0.5 px-2 text-center align-middle">{renderStatusBadge(row)}</td>
                        </tr>
                        {isOpen ? (
                          <tr key={`${key}-details`} className="border-b border-background-border bg-background-hover/30">
                            <td colSpan={11} className="p-3">
                              <div className="text-xs font-medium text-text-primary mb-2">İade Detayları</div>
                              {row.returns?.length ? (
                                <div className="overflow-auto">
                                  <table className="w-full text-xs border-collapse">
                                    <thead className="border-b border-background-border">
                                      <tr>
                                        <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0">
                                          İade Tarihi
                                        </th>
                                        <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0">
                                          Miktar
                                        </th>
                                        <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0">
                                          Hedef Depo
                                        </th>
                                        <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0">
                                          Gecikme
                                        </th>
                                        <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap">
                                          Gecikme Ücreti
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {row.returns.map((r) => {
                                        const lateDays = r.LateDays ?? 0;
                                        const lateFee = r.LateFee ?? 0;
                                        const lateCls = lateDays > 0 ? 'text-amber-300 font-medium' : 'text-text-primary';
                                        return (
                                          <tr key={r.ReturnId} className="border-b border-background-border/60 last:border-b-0">
                                            <td className="py-1 px-2 border-r border-background-border/60 last:border-r-0">
                                              {formatDateTr(r.ReturnDate)}
                                            </td>
                                            <td className="py-1 px-2 text-right border-r border-background-border/60 last:border-r-0 tabular-nums">
                                              {formatInt(r.ReturnQuantity)}
                                            </td>
                                            <td className="py-1 px-2 border-r border-background-border/60 last:border-r-0">
                                              {r.returnWarehouseName || <span className="text-text-secondary">-</span>}
                                            </td>
                                            <td className={`py-1 px-2 text-right border-r border-background-border/60 last:border-r-0 tabular-nums ${lateCls}`}>
                                              {lateDays > 0 ? `${formatInt(lateDays)} gün` : '0 gün'}
                                            </td>
                                            <td className={`py-1 px-2 text-right tabular-nums ${lateCls}`}>
                                              {lateFee > 0 ? formatMoney(lateFee, 'TRY') : formatMoney(0, 'TRY')}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="text-sm text-text-secondary">Henüz iade yapılmamış.</div>
                              )}
                              <div className="mt-2 text-[11px] text-text-secondary">
                                Çıkış: {formatShortDateTime(row.dispatch?.dispatchDate)} • Planlanan Bitiş:{' '}
                                {row.dispatch?.plannedEndDate ? formatDateTr(row.dispatch.plannedEndDate) : '-'} • Gerçek Bitiş:{' '}
                                {row.dispatch?.actualEndDate ? formatDateTr(row.dispatch.actualEndDate) : '-'}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: Card */}
          <div className="md:hidden space-y-2">
            {contracts.map((row) => {
              const key = rowKey(row);
              const isOpen = expanded.has(key);
              return (
                <div key={key} className="rounded border border-background-border bg-background-panel p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => openContractDetail(row)}
                        className="text-primary hover:underline font-medium text-sm"
                      >
                        {row.ContractCode || `#${row.ContractId}`}
                      </button>
                      <div className="text-xs text-text-secondary mt-0.5">
                        {String(row.Type ?? '-')} • {row.dispatch?.sourceWarehouseName ?? '-'}
                      </div>
                    </div>
                    {renderStatusBadge(row)}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-text-secondary">Müşteri</div>
                      <button type="button" onClick={() => openCustomerDetail(row)} className="text-primary hover:underline">
                        {row.customer?.CustomerName ?? '—'}
                      </button>
                    </div>
                    <div>
                      <div className="text-text-secondary">Şantiye</div>
                      <div className="text-text-primary">{row.site?.SiteName ?? '-'}</div>
                    </div>
                    <div>
                      <div className="text-text-secondary">Çıkış Tarihi</div>
                      <div className="text-text-primary">{formatDateTr(row.dispatch?.dispatchDate)}</div>
                    </div>
                    <div>
                      <div className="text-text-secondary">Kaynak Depo</div>
                      <div className="text-text-primary">{row.dispatch?.sourceWarehouseName ?? '-'}</div>
                    </div>
                    <div>
                      <div className="text-text-secondary">Miktar</div>
                      <div className="text-text-primary tabular-nums">{formatInt(row.dispatch?.rentedQuantity)}</div>
                    </div>
                    <div>
                      <div className="text-text-secondary">Kalan</div>
                      <div className="text-text-primary">{renderStillOut(row)}</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleExpand(row)}
                    className="mt-3 w-full btn-secondary py-2 px-3 text-sm inline-flex items-center justify-center gap-2"
                  >
                    {isOpen ? <CaretDownIcon size={16} /> : <CaretRightIcon size={16} />}
                    İade Detayları
                  </button>

                  {isOpen ? (
                    <div className="mt-2">
                      {row.returns?.length ? (
                        <div className="space-y-2">
                          {row.returns.map((r) => {
                            const lateDays = r.LateDays ?? 0;
                            const lateFee = r.LateFee ?? 0;
                            const lateCls = lateDays > 0 ? 'text-amber-300 font-medium' : 'text-text-primary';
                            return (
                              <div key={r.ReturnId} className="rounded border border-background-border bg-background-hover/30 p-2 text-xs">
                                <div className="flex items-center justify-between">
                                  <div className="text-text-primary">{formatDateTr(r.ReturnDate)}</div>
                                  <div className="tabular-nums font-medium">{formatInt(r.ReturnQuantity)}</div>
                                </div>
                                <div className="mt-1 text-text-secondary">
                                  Depo: <span className="text-text-primary">{r.returnWarehouseName || '-'}</span>
                                </div>
                                <div className={`mt-1 ${lateCls}`}>
                                  Gecikme: {lateDays > 0 ? `${formatInt(lateDays)} gün` : '0 gün'} • Ücret:{' '}
                                  {lateFee > 0 ? formatMoney(lateFee, 'TRY') : formatMoney(0, 'TRY')}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-sm text-text-secondary">Henüz iade yapılmamış.</div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}


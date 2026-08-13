import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArchiveIcon, MagnifyingGlassIcon, WarehouseIcon } from '@phosphor-icons/react';
import { warehouseService } from '../services/warehouseService';
import { Warehouse, WarehouseStock, isWarehouseArchived } from '../models';
import { formatShortDateTime } from '../utils/formatters';
import EmptyState from '../components/EmptyState';
import WarehouseDetailModal from '../components/modals/WarehouseDetailModal';
import ConfirmModal from '../components/modals/ConfirmModal';
import { useHeaderActions } from '../layouts/HeaderActionsContext';
import { useAuthStore } from '../store/authStore';
import { useArchivePreferencesStore } from '../store/archivePreferencesStore';
import { canDeleteWarehouse } from '../utils/warehousePermissions';
import { getWarehouseDeleteErrorMessage } from '../utils/apiError';
import { resolveWarehouseDeactivateError, type WarehouseDeactivateErrorDialog } from '../utils/warehouseDeactivate';
import { toast } from '../hooks/useToast';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

export default function WarehousesPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const canDelete = canDeleteWarehouse(user);
  const showArchivedWarehouses = useArchivePreferencesStore((s) => s.showArchivedWarehouses);
  const { setActions } = useHeaderActions();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewWarehouse, setIsNewWarehouse] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deactivateError, setDeactivateError] = useState<WarehouseDeactivateErrorDialog | null>(null);
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebouncedValue(searchText, 300);

  // Genişletilmiş depo ve stok bilgileri
  const [expandedWarehouseId, setExpandedWarehouseId] = useState<number | null>(null);
  const [expandedStock, setExpandedStock] = useState<WarehouseStock[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await warehouseService.getAllAsync({
        includeArchived: showArchivedWarehouses || undefined,
      });
      setWarehouses(data);
    } catch (error) {
      console.error('Load warehouses error:', error);
      toast.error('Depolar yüklenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [showArchivedWarehouses]);

  const handleAddNew = useCallback(() => {
    setSelectedWarehouse(null);
    setIsNewWarehouse(true);
    setIsModalOpen(true);
  }, []);

  const handleOpenDetail = (warehouse: Warehouse, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedWarehouse(warehouse);
    setIsNewWarehouse(false);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedWarehouse(null);
    void loadData();
    if (expandedWarehouseId) {
      void loadWarehouseStock(expandedWarehouseId);
    }
  };

  const handleDeleteClick = (warehouse: Warehouse, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canDelete || isWarehouseArchived(warehouse)) return;
    setDeleteTarget(warehouse);
  };

  const handleDeactivateError = (error: unknown, warehouseId: number) => {
    const dialog = resolveWarehouseDeactivateError(error, {
      onGoToStock: () => navigate(`/warehouses/${warehouseId}`, { state: { initialTab: 'stock' } }),
      onGoToRentals: () => navigate(`/warehouses/${warehouseId}`, { state: { initialTab: 'rented' } }),
    });
    if (dialog) {
      setDeactivateError(dialog);
      return;
    }
    toast.error(getWarehouseDeleteErrorMessage(error));
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.WarehouseId;
    const name = deleteTarget.WarehouseName;
    try {
      setDeleteBusy(true);
      await warehouseService.deleteAsync(targetId);
      setDeleteTarget(null);
      if (expandedWarehouseId === targetId) {
        setExpandedWarehouseId(null);
        setExpandedStock([]);
      }
      toast.success(`"${name}" deposu kullanımdan kaldırıldı.`);
      await loadData();
    } catch (error) {
      setDeleteTarget(null);
      handleDeactivateError(error, targetId);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleToggleExpand = async (warehouse: Warehouse) => {
    if (expandedWarehouseId === warehouse.WarehouseId) {
      setExpandedWarehouseId(null);
      setExpandedStock([]);
    } else {
      setExpandedWarehouseId(warehouse.WarehouseId);
      await loadWarehouseStock(warehouse.WarehouseId);
    }
  };

  const loadWarehouseStock = async (warehouseId: number) => {
    try {
      setLoadingStock(true);
      const response = await warehouseService.getStockAsync(warehouseId);
      setExpandedStock(response.stock);
    } catch (error) {
      console.error('Load warehouse stock error:', error);
      setExpandedStock([]);
    } finally {
      setLoadingStock(false);
    }
  };

  const filteredWarehouses = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return warehouses;
    return warehouses.filter((w) => {
      const name = w.WarehouseName?.toLowerCase() ?? '';
      const address = w.Address?.toLowerCase() ?? '';
      const description = w.Description?.toLowerCase() ?? '';
      return name.includes(q) || address.includes(q) || description.includes(q);
    });
  }, [warehouses, debouncedSearch]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const headerActions = useMemo(
    () => (
      <>
        <button onClick={() => { void loadData(); }} className="btn-secondary py-2 px-3 text-sm">
          Yenile
        </button>
        <button onClick={handleAddNew} className="btn-primary py-2 px-3 text-sm">
          + Yeni Depo
        </button>
      </>
    ),
    [handleAddNew, loadData]
  );

  useEffect(() => {
    setActions(headerActions);
    return () => setActions(null);
  }, [headerActions, setActions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 rounded border border-background-border bg-background-panel p-2 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-text-secondary">
            <MagnifyingGlassIcon size={14} weight="regular" color="currentColor" aria-hidden />
          </span>
          <input
            type="text"
            className="input w-full pl-7 py-2 text-sm"
            placeholder="Depo adı veya adres ara..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        {searchText && (
          <button
            type="button"
            onClick={() => setSearchText('')}
            className="btn-secondary py-2 px-3 text-sm"
          >
            Temizle
          </button>
        )}
      </div>

      {warehouses.length === 0 ? (
        <EmptyState
          icon={<WarehouseIcon size={48} weight="duotone" />}
          title="Henüz depo bulunmuyor"
          description="Malzemelerinizi depolamak için yeni bir depo ekleyin"
        />
      ) : filteredWarehouses.length === 0 ? (
        <EmptyState
          icon={<WarehouseIcon size={48} weight="duotone" />}
          title="Aramayla eşleşen depo yok"
          description="Depo adı veya adres aramasını değiştirmeyi deneyin"
        />
      ) : (
        <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
          <div className="overflow-auto max-h-[calc(100vh-140px)] min-h-[280px]">
            <table className="w-full text-xs border-collapse text-text-primary">
              <thead className="sticky top-0 z-10 border-b border-background-border">
                <tr>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Depo Adı</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Adres</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Ürün Çeşidi</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Toplam Miktar</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Durum</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">Kayıt Bilgisi</th>
                </tr>
              </thead>
              <tbody>
                {filteredWarehouses.map((warehouse, index) => {
                  const archived = isWarehouseArchived(warehouse);
                  const badgeClass = 'inline-block px-2 py-0.5 rounded text-xs font-medium';
                  const statusBadge = archived ? (
                    <span className={`${badgeClass} bg-amber-900/60 text-amber-100 border border-amber-700/50`}>Pasif</span>
                  ) : warehouse.TotalQuantity === 0 ? (
                    <span className={`${badgeClass} bg-gray-600 text-white`}>Boş</span>
                  ) : warehouse.UniqueItems <= 3 ? (
                    <span className={`${badgeClass} bg-yellow-600 text-white`}>Az Ürün</span>
                  ) : (
                    <span className={`${badgeClass} bg-green-600 text-white`}>Aktif</span>
                  );
                  const isExpanded = expandedWarehouseId === warehouse.WarehouseId;
                  return (
                    <Fragment key={warehouse.WarehouseId}>
                      <tr
                        className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${
                          archived ? 'opacity-60 bg-background-secondary/50' : ''
                        } ${isExpanded ? 'bg-background-hover' : !archived && index % 2 === 0 ? 'bg-background-panel' : !archived ? 'bg-background-surface' : ''}`}
                        onClick={() => navigate(`/warehouses/${warehouse.WarehouseId}`)}
                      >
                        <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={(e) => { e.stopPropagation(); void handleToggleExpand(warehouse); }} className="text-text-secondary hover:text-text-primary" title={isExpanded ? 'Kapat' : 'Aç'}>
                              <span className={isExpanded ? 'inline-block rotate-90' : 'inline-block'}>▶</span>
                            </button>
                            <span className="font-medium text-text-primary">{warehouse.WarehouseName}</span>
                            {archived ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-900/40 text-amber-100 border border-amber-700/50 ml-1">
                                Pasif
                              </span>
                            ) : null}
                            {warehouse.Description && <span className="text-text-secondary truncate max-w-[200px] ml-1"> — {warehouse.Description}</span>}
                          </div>
                        </td>
                        <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-secondary">{warehouse.Address || '-'}</td>
                        <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0"><span className="text-blue-400 font-medium">{warehouse.UniqueItems}</span></td>
                        <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0"><span className="text-green-500 font-medium">{warehouse.TotalQuantity.toLocaleString('tr-TR')}</span></td>
                        <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0">
                          {statusBadge}
                          <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/warehouses/${warehouse.WarehouseId}`); }} className="ml-1 text-xs text-primary hover:underline">Detay</button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/warehouses/${warehouse.WarehouseId}`, { state: { initialTab: 'movements' } });
                            }}
                            className="ml-1 text-xs text-primary hover:underline"
                            title="Depo hareket dökümü"
                          >
                            Hareketler
                          </button>
                          <button type="button" onClick={(e) => handleOpenDetail(warehouse, e)} className="ml-1 text-blue-400 hover:text-blue-300" title="Düzenle" disabled={archived}>✎</button>
                          {canDelete && !archived && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteClick(warehouse, e)}
                              disabled={deleteBusy}
                              className="ml-1 text-amber-400 hover:text-amber-300 inline-flex items-center"
                              title="Depoyu kullanımdan kaldır"
                            >
                              <ArchiveIcon size={14} weight="bold" aria-hidden />
                            </button>
                          )}
                        </td>
                        <td className="py-0.5 px-2 align-middle text-text-secondary">
                          {warehouse.CreatedByUserFullName || warehouse.CreatedByUserName || '-'} • {formatShortDateTime(warehouse.CreatedAt)}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${warehouse.WarehouseId}-expanded`}>
                          <td colSpan={6} className="p-0 bg-background-hover/50">
                            <div className="p-2 border-b border-background-border">
                              {loadingStock ? (
                                <div className="text-center py-2 text-text-secondary text-xs">Yükleniyor...</div>
                              ) : expandedStock.length === 0 ? (
                                <div className="text-center py-2 text-text-secondary text-xs">Bu depoda malzeme yok.</div>
                              ) : (
                                <table className="w-full text-xs border-collapse text-text-primary">
                                  <thead>
                                    <tr className="border-b border-background-border">
                                      <th className="text-left py-0.5 px-2 font-medium text-text-secondary bg-background-hover border-r border-background-border">Malzeme</th>
                                      <th className="text-left py-0.5 px-2 font-medium text-text-secondary bg-background-hover border-r border-background-border">Kategori</th>
                                      <th className="text-center py-0.5 px-2 font-medium text-text-secondary bg-background-hover">Miktar</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedStock.map((stock, i) => (
                                      <tr key={stock.StockId} className={`border-b border-background-border/50 ${i % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'}`}>
                                        <td className="py-0.5 px-2 font-medium border-r border-background-border/60">{stock.ItemName}</td>
                                        <td className="py-0.5 px-2 text-text-secondary border-r border-background-border/60">{stock.CategoryName || '-'}</td>
                                        <td className="py-0.5 px-2 text-center text-green-500 font-medium">{stock.Quantity.toLocaleString('tr-TR')}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
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
          <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex items-center justify-between shrink-0">
            <span>
              Toplam: {filteredWarehouses.length}
              {debouncedSearch.trim() ? ` / ${warehouses.length}` : ''} depo
            </span>
            <span className="text-text-secondary/80">Ekranda yaklaşık 25–40 satır görünür (pencere boyutuna göre)</span>
          </div>
        </div>
      )}

      {isModalOpen && (
        <WarehouseDetailModal
          warehouse={selectedWarehouse}
          isNew={isNewWarehouse}
          onClose={handleModalClose}
        />
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Depoyu kullanımdan kaldırmak istiyor musunuz?"
        message={
          deleteTarget
            ? `"${deleteTarget.WarehouseName}" deposu kullanımdan kaldırılacak.\n\nBu depo geçmiş kayıtlarda kullanılmış olabilir. Kullanımdan kaldırıldığında yeni işlemlerde seçilemez; geçmiş sözleşme ve hareket kayıtları korunur.\n\nHiç kullanılmamış boş depolar tamamen silinir. Devam etmek istiyor musunuz?`
            : ''
        }
        variant="danger"
        loading={deleteBusy}
        confirmLabel="Kullanımdan Kaldır"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        open={Boolean(deactivateError)}
        title={deactivateError?.title ?? ''}
        message={deactivateError?.message ?? ''}
        variant="danger"
        confirmLabel={deactivateError?.actionLabel ?? 'Tamam'}
        cancelLabel="Kapat"
        onConfirm={() => {
          deactivateError?.onAction?.();
          setDeactivateError(null);
        }}
        onCancel={() => setDeactivateError(null)}
      />
    </div>
  );
}

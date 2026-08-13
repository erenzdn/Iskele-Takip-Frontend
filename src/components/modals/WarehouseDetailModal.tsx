import { useState, useEffect, useMemo, type ReactNode } from 'react';
import {
  ArchiveIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  PackageIcon,
  PencilIcon,
  Plus,
  TrashIcon,
  WarehouseIcon,
  XIcon,
} from '@phosphor-icons/react';
import {
  AuditLog,
  Warehouse,
  WarehouseStock,
  Inventory,
  isWarehouseArchived,
  isInventoryArchived,
  pickWarehouseDeletedAt,
} from '../../models';
import { warehouseService } from '../../services/warehouseService';
import { inventoryService } from '../../services/inventoryService';
import AuditLogTimeline from '../AuditLogTimeline';
import ConfirmModal from './ConfirmModal';
import SearchableItemCombobox from '../SearchableItemCombobox';
import { toast } from '../../hooks/useToast';
import { getUserFacingApiErrorMessage, getWarehouseDeleteErrorMessage } from '../../utils/apiError';
import { formatShortDateTime } from '../../utils/formatters';
import { useAuthStore } from '../../store/authStore';
import { canDeleteWarehouse, canUpdateWarehouse } from '../../utils/warehousePermissions';

interface WarehouseDetailModalProps {
  warehouse: Warehouse | null;
  isNew: boolean;
  onClose: () => void;
}

function SectionCard({
  title,
  subtitle,
  icon,
  extra,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex min-h-0 flex-col rounded-lg border border-background-border bg-background-surface p-3 ${className}`}>
      <div className="mb-2.5 flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            {icon}
            {title}
          </h3>
          {subtitle ? <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">{subtitle}</p> : null}
        </div>
        {extra ? <div className="shrink-0">{extra}</div> : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="mb-1 block text-xs font-medium text-text-secondary">
      {children}
      {required ? <span className="ml-0.5 text-error">*</span> : null}
    </label>
  );
}

export default function WarehouseDetailModal({
  warehouse,
  isNew,
  onClose,
}: WarehouseDetailModalProps) {
  const user = useAuthStore((state) => state.user);
  const canDelete = canDeleteWarehouse(user);
  const canUpdateStock = canUpdateWarehouse(user);
  const archived = useMemo(
    () => Boolean(warehouse && !isNew && isWarehouseArchived(warehouse)),
    [warehouse, isNew]
  );
  const archivedAtLabel = (() => {
    const raw = warehouse ? pickWarehouseDeletedAt(warehouse) : undefined;
    if (!raw) return null;
    const formatted = formatShortDateTime(raw);
    return formatted && formatted !== '-' ? formatted : raw;
  })();
  const [isReadOnly, setIsReadOnly] = useState(!isNew);
  const [warehouseName, setWarehouseName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const [stock, setStock] = useState<WarehouseStock[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockQuery, setStockQuery] = useState('');
  const [inventoryItems, setInventoryItems] = useState<Inventory[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  const [quantityStr, setQuantityStr] = useState('');
  const [editingStockId, setEditingStockId] = useState<number | null>(null);
  const [editingQuantityStr, setEditingQuantityStr] = useState('0');
  const [activeTab, setActiveTab] = useState<'info' | 'history'>('info');
  const [warehouseLogs, setWarehouseLogs] = useState<AuditLog[]>([]);
  const [warehouseLogsLoading, setWarehouseLogsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRemoveStockConfirm, setShowRemoveStockConfirm] = useState(false);
  const [removeStockTarget, setRemoveStockTarget] = useState<WarehouseStock | null>(null);

  useEffect(() => {
    if (warehouse) {
      setWarehouseName(warehouse.WarehouseName);
      setAddress(warehouse.Address || '');
      setDescription(warehouse.Description || '');
      void loadStock();
    }
  }, [warehouse]);

  const loadStock = async () => {
    if (!warehouse) return;
    try {
      setLoadingStock(true);
      const response = await warehouseService.getStockAsync(warehouse.WarehouseId);
      setStock(response.stock);
    } catch (error) {
      console.error('Load stock error:', error);
    } finally {
      setLoadingStock(false);
    }
  };

  const loadWarehouseLogs = async () => {
    if (!warehouse) return;
    try {
      setWarehouseLogsLoading(true);
      const data = await warehouseService.getAuditLogsByWarehouseAsync(warehouse.WarehouseId);
      setWarehouseLogs(data ?? []);
    } catch (error) {
      console.error('Load warehouse audit logs error:', error);
      setWarehouseLogs([]);
    } finally {
      setWarehouseLogsLoading(false);
    }
  };

  useEffect(() => {
    if (warehouse?.WarehouseId && !isNew) {
      loadWarehouseLogs();
    } else {
      setWarehouseLogs([]);
    }
  }, [warehouse?.WarehouseId, isNew]);

  const loadInventoryItems = async () => {
    try {
      const items = await inventoryService.getAllAsync();
      setInventoryItems(items);
    } catch (error) {
      console.error('Load inventory error:', error);
    }
  };

  useEffect(() => {
    if (!isNew) {
      void loadInventoryItems();
    }
  }, [isNew]);

  useEffect(() => {
    if (archived) setIsReadOnly(true);
  }, [archived]);

  const handleSave = async () => {
    if (archived) return;
    if (!warehouseName.trim()) {
      toast.warning('Depo adı zorunludur');
      return;
    }

    try {
      setIsBusy(true);
      if (isNew) {
        await warehouseService.createAsync({
          WarehouseName: warehouseName,
          Address: address || undefined,
          Description: description || undefined,
        });
      } else if (warehouse) {
        await warehouseService.updateAsync(warehouse.WarehouseId, {
          WarehouseName: warehouseName,
          Address: address || undefined,
          Description: description || undefined,
        });
      }
      onClose();
    } catch (error) {
      console.error('Save warehouse error:', error);
      toast.error('Kaydetme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteClick = () => {
    if (!warehouse) return;
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!warehouse) return;
    try {
      setIsBusy(true);
      await warehouseService.deleteAsync(warehouse.WarehouseId);
      setShowDeleteConfirm(false);
      toast.success('Depo kullanımdan kaldırıldı.');
      onClose();
    } catch (error) {
      console.error('Deactivate warehouse error:', error);
      setShowDeleteConfirm(false);
      toast.error(getWarehouseDeleteErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddStock = async () => {
    const qty = Math.max(0, parseInt(quantityStr, 10) || 0);
    if (!warehouse || !selectedItemId || qty <= 0) {
      toast.warning('Lütfen ürün seçin ve geçerli bir miktar girin');
      return;
    }

    try {
      setIsBusy(true);
      await warehouseService.addOrUpdateStockAsync(warehouse.WarehouseId, {
        ItemId: Number(selectedItemId),
        Quantity: qty,
      });
      setSelectedItemId('');
      setQuantityStr('');
      await loadStock();
    } catch (error) {
      console.error('Add stock error:', error);
      toast.error(getUserFacingApiErrorMessage(error, 'generic'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleStartEditStock = (stockItem: WarehouseStock) => {
    setEditingStockId(stockItem.StockId);
    setEditingQuantityStr(String(stockItem.Quantity));
  };

  const handleSaveEditStock = async (stockItem: WarehouseStock) => {
    const qty = Math.max(0, parseInt(editingQuantityStr, 10) || 0);
    if (!warehouse || qty < 0) {
      toast.warning('Geçerli bir miktar girin');
      return;
    }

    try {
      setIsBusy(true);
      await warehouseService.addOrUpdateStockAsync(warehouse.WarehouseId, {
        ItemId: stockItem.ItemId,
        Quantity: qty,
      });
      setEditingStockId(null);
      await loadStock();
    } catch (error) {
      console.error('Update stock error:', error);
      toast.error('Stok güncelleme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCancelEditStock = () => {
    setEditingStockId(null);
  };

  const handleRemoveStockClick = (stockItem: WarehouseStock) => {
    if (!warehouse) return;
    setRemoveStockTarget(stockItem);
    setShowRemoveStockConfirm(true);
  };

  const handleRemoveStockConfirm = async () => {
    if (!warehouse || !removeStockTarget) return;
    try {
      setIsBusy(true);
      await warehouseService.removeStockAsync(warehouse.WarehouseId, removeStockTarget.ItemId);
      setShowRemoveStockConfirm(false);
      setRemoveStockTarget(null);
      await loadStock();
    } catch (error) {
      console.error('Remove stock error:', error);
      toast.error('Stok silme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const stockItemIds = useMemo(() => new Set(stock.map((s) => s.ItemId)), [stock]);
  const availableItems = useMemo(
    () => inventoryItems.filter((item) => !stockItemIds.has(item.ItemId) && !isInventoryArchived(item)),
    [inventoryItems, stockItemIds]
  );

  const filteredStock = useMemo(() => {
    const q = stockQuery.trim().toLocaleLowerCase('tr-TR');
    const list = q
      ? stock.filter(
          (s) =>
            (s.ItemName ?? '').toLocaleLowerCase('tr-TR').includes(q) ||
            (s.CategoryName ?? '').toLocaleLowerCase('tr-TR').includes(q)
        )
      : stock;
    return [...list].sort((a, b) => (a.ItemName ?? '').localeCompare(b.ItemName ?? '', 'tr-TR'));
  }, [stock, stockQuery]);

  const uniqueItems = stock.length;
  const totalQuantity = stock.reduce((sum, s) => sum + (s.Quantity ?? 0), 0);
  const canManageStock = Boolean(canUpdateStock && !archived && !isNew);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background-panel">
      <header className="shrink-0 border-b border-background-border px-3 py-2 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">
                {isNew ? 'Yeni Depo' : (warehouseName.trim() || 'Depo Detayı')}
              </h2>
              {archived && (
                <span className="rounded border border-amber-600/50 bg-amber-900/30 px-2 py-0.5 text-xs font-semibold text-amber-100">
                  Pasif{archivedAtLabel ? ` • ${archivedAtLabel}` : ''}
                </span>
              )}
            </div>
            {archived ? (
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-100/90">
                Bu depo pasif durumda. Yeni işlem yapılamaz; geçmiş kayıtlar korunur.
              </p>
            ) : isNew ? (
              <p className="mt-0.5 text-xs text-text-secondary">
                Depo adı zorunludur. Kaydettikten sonra bu depoya stok ekleyebilirsiniz.
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-text-secondary">
                Depo bilgilerini düzenleyin; stok ekleme ve miktar güncelleme sağ taraftan yapılır.
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!isNew && (
              <div className="hidden items-center gap-1.5 sm:flex">
                <div className="rounded-md border border-background-border bg-background-surface px-2.5 py-1 text-center">
                  <div className="text-[10px] text-text-secondary">Ürün çeşidi</div>
                  <div className="text-sm font-bold text-blue-500">{uniqueItems}</div>
                </div>
                <div className="rounded-md border border-background-border bg-background-surface px-2.5 py-1 text-center">
                  <div className="text-[10px] text-text-secondary">Toplam miktar</div>
                  <div className="text-sm font-bold text-green-600 dark:text-green-500">
                    {totalQuantity.toLocaleString('tr-TR')}
                  </div>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-text-primary hover:bg-background-hover"
              aria-label="Kapat"
            >
              <XIcon size={22} weight="regular" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-screen-2xl flex-1 flex-col px-3 py-2 sm:px-4">
        {!isNew && (
          <div className="mb-2 flex shrink-0 gap-1 rounded border border-background-border bg-background-surface p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('info')}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'info'
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
              }`}
            >
              Bilgiler
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'history'
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
              }`}
            >
              Aktivite Geçmişi
            </button>
          </div>
        )}

        {activeTab === 'history' && !isNew ? (
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-background-border p-3">
            <AuditLogTimeline logs={warehouseLogs} loading={warehouseLogsLoading} />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
            <div className="flex min-h-0 flex-col gap-3 lg:overflow-hidden">
              <SectionCard
                title="Depo bilgisi"
                subtitle="Ad zorunludur. Adres ve açıklama isteğe bağlıdır."
                icon={<WarehouseIcon size={16} weight="duotone" />}
                className="flex-1"
              >
                <div className="space-y-2.5">
                  <div>
                    <FieldLabel required>Depo adı</FieldLabel>
                    <input
                      type="text"
                      value={warehouseName}
                      onChange={(e) => setWarehouseName(e.target.value)}
                      disabled={isReadOnly}
                      placeholder="Örn: Ana Depo"
                      className="input w-full py-2"
                      required
                      autoFocus={isNew}
                    />
                  </div>
                  <div>
                    <FieldLabel>Adres</FieldLabel>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      disabled={isReadOnly}
                      placeholder="Depo adresi"
                      className="input w-full py-2"
                    />
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col">
                    <FieldLabel>Açıklama</FieldLabel>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={isReadOnly}
                      placeholder="Depo hakkında notlar…"
                      className="input min-h-[88px] w-full flex-1 resize-none py-2"
                    />
                  </div>
                </div>
              </SectionCard>
            </div>

            <div className="flex min-h-0 flex-col gap-3 lg:overflow-hidden">
              {isNew ? (
                <SectionCard
                  title="Depo stoğu"
                  subtitle="Önce depoyu kaydedin; ardından ürün ekleyebilirsiniz."
                  icon={<PackageIcon size={16} weight="duotone" />}
                  className="flex-1"
                >
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-background-border px-4 py-8 text-center">
                    <PackageIcon size={36} weight="duotone" className="mb-2 text-text-secondary" />
                    <p className="text-sm font-medium text-text-primary">Stok henüz eklenemez</p>
                    <p className="mt-1 max-w-sm text-xs text-text-secondary">
                      Depoyu kaydettikten sonra bu ekranı tekrar açarak ürün ve miktar girebilirsiniz.
                    </p>
                  </div>
                </SectionCard>
              ) : (
                <SectionCard
                  title="Depodaki ürünler"
                  subtitle="Ürün eklemek için aşağıdan seçin. Miktarı satırdaki kalemle değiştirin."
                  icon={<PackageIcon size={16} weight="duotone" />}
                  extra={
                    <span className="text-[11px] text-text-secondary">
                      {filteredStock.length}
                      {stockQuery.trim() ? ` / ${stock.length}` : ''} kalem
                    </span>
                  }
                  className="flex-1"
                >
                  {canManageStock && (
                    <div className="mb-2 shrink-0 rounded-lg border border-background-border bg-background-panel p-2">
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                        Ürün ekle
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-[200px] flex-1">
                          <SearchableItemCombobox
                            items={availableItems}
                            value={selectedItemId}
                            onChange={setSelectedItemId}
                            placeholder="Ürün adı veya kodu ile ara…"
                            displayMode="quote"
                          />
                        </div>
                        <div className="w-24 shrink-0">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={quantityStr}
                            onChange={(e) => setQuantityStr(e.target.value.replace(/[^0-9]/g, ''))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleAddStock();
                              }
                            }}
                            className="input w-full py-2"
                            placeholder="Miktar"
                            aria-label="Miktar"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleAddStock()}
                          disabled={isBusy || !selectedItemId || (parseInt(quantityStr, 10) || 0) <= 0}
                          className="btn-primary inline-flex items-center gap-1 px-3 py-2 text-sm disabled:opacity-50"
                        >
                          <Plus size={14} weight="bold" />
                          Ekle
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="relative mb-2 shrink-0">
                    <MagnifyingGlassIcon
                      size={16}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
                    />
                    <input
                      type="text"
                      value={stockQuery}
                      onChange={(e) => setStockQuery(e.target.value)}
                      placeholder="Listede ürün veya kategori ara…"
                      className="input w-full py-2 pl-9"
                    />
                  </div>

                  {loadingStock ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-text-secondary">
                      Yükleniyor…
                    </div>
                  ) : stock.length === 0 ? (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-background-border px-3 py-6 text-center text-sm text-text-secondary">
                      Bu depoda henüz ürün yok.
                      {canManageStock ? ' Yukarıdan ürün ekleyebilirsiniz.' : ''}
                    </div>
                  ) : filteredStock.length === 0 ? (
                    <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-text-secondary">
                      Aramaya uygun ürün yok.
                    </div>
                  ) : (
                    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-background-border">
                      <table className="w-full text-sm table-compact text-text-primary">
                        <thead className="sticky top-0 bg-background-surface">
                          <tr className="border-b border-background-border">
                            <th className="p-2 text-left font-semibold">Ürün</th>
                            <th className="p-2 text-left font-semibold">Kategori</th>
                            <th className="p-2 text-center font-semibold">Miktar</th>
                            {canManageStock && (
                              <th className="p-2 text-center font-semibold">İşlem</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStock.map((item) => (
                            <tr
                              key={item.StockId}
                              className="border-b border-background-border bg-background-panel hover:bg-background-hover"
                            >
                              <td className="p-2 font-medium">{item.ItemName}</td>
                              <td className="p-2 text-text-secondary">{item.CategoryName || '—'}</td>
                              <td className="p-2 text-center">
                                {editingStockId === item.StockId ? (
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={editingQuantityStr}
                                    onChange={(e) => setEditingQuantityStr(e.target.value.replace(/[^0-9]/g, ''))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void handleSaveEditStock(item);
                                      } else if (e.key === 'Escape') {
                                        handleCancelEditStock();
                                      }
                                    }}
                                    className="input mx-auto w-20 py-1 text-center"
                                    autoFocus
                                  />
                                ) : (
                                  <span className="font-bold text-green-600 dark:text-green-500">
                                    {item.Quantity.toLocaleString('tr-TR')}
                                  </span>
                                )}
                              </td>
                              {canManageStock && (
                                <td className="p-2">
                                  {editingStockId === item.StockId ? (
                                    <div className="flex justify-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => void handleSaveEditStock(item)}
                                        disabled={isBusy}
                                        className="inline-flex items-center justify-center p-1.5 text-green-600 hover:text-green-500"
                                        title="Kaydet"
                                      >
                                        <CheckIcon size={18} weight="bold" aria-hidden />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleCancelEditStock}
                                        className="inline-flex items-center justify-center p-1.5 text-text-secondary hover:text-text-primary"
                                        title="İptal"
                                      >
                                        <XIcon size={18} weight="regular" aria-hidden />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex justify-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleStartEditStock(item)}
                                        disabled={isBusy}
                                        className="inline-flex items-center justify-center p-1.5 text-blue-500 hover:text-blue-400"
                                        title="Miktarı düzenle"
                                      >
                                        <PencilIcon size={16} weight="regular" aria-hidden />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveStockClick(item)}
                                        disabled={isBusy}
                                        className="inline-flex items-center justify-center p-1.5 text-error hover:opacity-80"
                                        title="Kaldır"
                                      >
                                        <TrashIcon size={16} weight="regular" aria-hidden />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>
              )}
            </div>
          </div>
        )}

        <div className="mt-2 flex shrink-0 items-center gap-2 border-t border-background-border pt-2">
          {isReadOnly && !isNew && canDelete && !archived && warehouse && (
            <button
              type="button"
              onClick={handleDeleteClick}
              disabled={isBusy}
              className="btn-danger inline-flex items-center gap-2 px-4 py-2.5 disabled:opacity-50"
              title="Depoyu kullanımdan kaldır"
            >
              <ArchiveIcon size={18} weight="bold" aria-hidden />
              Kullanımdan Kaldır
            </button>
          )}
          <div className="ml-auto flex gap-2">
            {isReadOnly && !isNew && !archived && (
              <button type="button" onClick={() => setIsReadOnly(false)} className="btn-primary px-6 py-2.5">
                Düzenle
              </button>
            )}
            {!isReadOnly && (
              <>
                <button type="button" onClick={onClose} className="btn-secondary px-5 py-2.5">
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isBusy}
                  className="btn-primary px-6 py-2.5 disabled:opacity-50"
                >
                  {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </>
            )}
            {isReadOnly && !isNew && (
              <button type="button" onClick={onClose} className="btn-secondary px-6 py-2.5">
                Kapat
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={showDeleteConfirm}
        title="Depoyu kullanımdan kaldırmak istiyor musunuz?"
        message={
          warehouse
            ? `"${warehouse.WarehouseName}" deposu kullanımdan kaldırılacak.\n\nBu depo geçmiş kayıtlarda kullanılmış olabilir. Kullanımdan kaldırıldığında yeni işlemlerde seçilemez; geçmiş sözleşme ve hareket kayıtları korunur.\n\nHiç kullanılmamış boş depolar tamamen silinir. Devam etmek istiyor musunuz?`
            : ''
        }
        variant="danger"
        loading={isBusy}
        confirmLabel="Kullanımdan Kaldır"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        zIndexClass="z-[70]"
      />
      <ConfirmModal
        open={showRemoveStockConfirm}
        title="Onaylıyor musunuz?"
        message={
          removeStockTarget
            ? `"${removeStockTarget.ItemName}" ürününü depodan kaldırmak istediğinizden emin misiniz?`
            : ''
        }
        variant="danger"
        loading={isBusy}
        onConfirm={handleRemoveStockConfirm}
        onCancel={() => {
          setShowRemoveStockConfirm(false);
          setRemoveStockTarget(null);
        }}
        zIndexClass="z-[70]"
      />
    </div>
  );
}

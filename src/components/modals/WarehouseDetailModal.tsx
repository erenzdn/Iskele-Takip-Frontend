import { useState, useEffect, useMemo } from 'react';
import { ArchiveIcon, CheckIcon, XIcon } from '@phosphor-icons/react';
import { AuditLog, Warehouse, WarehouseStock, Inventory, isWarehouseArchived, pickWarehouseDeletedAt } from '../../models';
import { warehouseService } from '../../services/warehouseService';
import { inventoryService } from '../../services/inventoryService';
import AuditLogTimeline from '../AuditLogTimeline';
import ArchivedWarehouseBanner from '../ArchivedWarehouseBanner';
import ConfirmModal from './ConfirmModal';
import { toast } from '../../hooks/useToast';
import { getUserFacingApiErrorMessage, getWarehouseDeleteErrorMessage } from '../../utils/apiError';
import { useAuthStore } from '../../store/authStore';
import { canDeleteWarehouse, canUpdateWarehouse } from '../../utils/warehousePermissions';

interface WarehouseDetailModalProps {
  warehouse: Warehouse | null;
  isNew: boolean;
  onClose: () => void;
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
  const [isReadOnly, setIsReadOnly] = useState(!isNew);
  const [warehouseName, setWarehouseName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  // Stok yönetimi state'leri
  const [stock, setStock] = useState<WarehouseStock[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<Inventory[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  /** Miktar inputu – sadece rakam, string state ile giriş kaybı önlenir */
  const [quantityStr, setQuantityStr] = useState<string>('0');
  const [editingStockId, setEditingStockId] = useState<number | null>(null);
  const [editingQuantityStr, setEditingQuantityStr] = useState<string>('0');
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
      loadStock();
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

  const handleOpenAddStock = async () => {
    await loadInventoryItems();
    setShowAddStock(true);
    setSelectedItemId('');
    setQuantityStr('0');
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
      setShowAddStock(false);
      setSelectedItemId('');
      setQuantityStr('0');
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-background-panel rounded-panel w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">
          {isNew ? 'Yeni Depo' : 'Depo Detayı'}
        </h2>

        {archived && warehouse ? (
          <div className="mb-4">
            <ArchivedWarehouseBanner
              warehouseName={warehouse.WarehouseName}
              deletedAt={pickWarehouseDeletedAt(warehouse)}
            />
          </div>
        ) : null}

        {!isNew && (
          <div className="flex gap-2 mb-4 border-b border-background-border">
            <button
              onClick={() => setActiveTab('info')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'info'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Bilgiler
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'history'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Geçmiş
            </button>
          </div>
        )}

        {activeTab === 'history' && !isNew && (
          <>
            <h3 className="text-lg font-semibold mb-3">Aktivite Geçmişi</h3>
            <AuditLogTimeline logs={warehouseLogs} loading={warehouseLogsLoading} />
            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="btn-secondary flex-1">
                Kapat
              </button>
            </div>
          </>
        )}

        {(activeTab === 'info' || isNew) && (
        <>
        {/* Depo Özet Bilgileri (sadece mevcut depolarda) */}
        {isReadOnly && !isNew && warehouse && (
          <div className="mb-6 card bg-blue-900 p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-text-secondary mb-1">Ürün Çeşidi</div>
                <div className="text-xl font-bold text-blue-400">{warehouse.UniqueItems}</div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">Toplam Miktar</div>
                <div className="text-xl font-bold text-green-500">
                  {warehouse.TotalQuantity.toLocaleString('tr-TR')}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Depo Bilgileri Formu */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-2">Depo Adı *</label>
            <input
              type="text"
              value={warehouseName}
              onChange={(e) => setWarehouseName(e.target.value)}
              disabled={isReadOnly}
              placeholder="Örn: Ana Depo"
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Adres</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={isReadOnly}
              placeholder="Depo adresi"
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Açıklama</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isReadOnly}
              placeholder="Depo hakkında notlar..."
              className="input w-full"
              rows={2}
            />
          </div>
        </div>

        {/* Stok Listesi (sadece mevcut depolarda) */}
        {!isNew && warehouse && (
          <div className="border-t border-background-border pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Depodaki Ürünler</h3>
              {canUpdateStock && !archived && (
                <button
                  onClick={handleOpenAddStock}
                  disabled={isBusy}
                  className="btn-secondary text-sm"
                >
                  + Ürün Ekle
                </button>
              )}
            </div>

            {/* Ürün Ekleme Formu */}
            {showAddStock && (
              <div className="mb-4 p-4 bg-background-secondary rounded-lg">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-2">Ürün Seç</label>
                    <select
                      value={selectedItemId}
                      onChange={(e) => setSelectedItemId(Number(e.target.value) || '')}
                      className="input w-full"
                    >
                      <option value="">Ürün seçin...</option>
                      {inventoryItems.map((item) => (
                        <option key={item.ItemId} value={item.ItemId}>
                          {item.ItemName} (Mevcut: {item.TotalStock - item.OnRent})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Miktar</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={quantityStr}
                      onChange={(e) => setQuantityStr(e.target.value.replace(/[^0-9]/g, ''))}
                      className="input w-full"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleAddStock}
                    disabled={isBusy || !selectedItemId || (parseInt(quantityStr, 10) || 0) <= 0}
                    className="btn-primary text-sm"
                  >
                    Ekle
                  </button>
                  <button
                    onClick={() => setShowAddStock(false)}
                    className="btn-secondary text-sm"
                  >
                    İptal
                  </button>
                </div>
              </div>
            )}

            {loadingStock ? (
              <div className="text-center py-4 text-text-secondary">Yükleniyor...</div>
            ) : stock.length === 0 ? (
              <div className="text-center py-8 text-text-secondary">
                Bu depoda henüz ürün bulunmuyor
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-compact text-text-primary">
                  <thead className="bg-background-surface">
                    <tr className="border-b border-background-border">
                      <th className="text-left p-3 font-semibold">Ürün</th>
                      <th className="text-left p-3 font-semibold">Kategori</th>
                      <th className="text-center p-3 font-semibold">Miktar</th>
                      {canUpdateStock && !archived && (
                        <th className="text-center p-3 font-semibold">İşlem</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {stock.map((item) => (
                      <tr key={item.StockId} className="border-b border-background-border bg-background-surface hover:bg-background-hover transition-colors">
                        <td className="p-3 font-medium">{item.ItemName}</td>
                        <td className="p-3 text-text-secondary">{item.CategoryName || '-'}</td>
                        <td className="p-3 text-center">
                          {editingStockId === item.StockId ? (
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={editingQuantityStr}
                              onChange={(e) => setEditingQuantityStr(e.target.value.replace(/[^0-9]/g, ''))}
                              className="input w-20 text-center"
                              autoFocus
                            />
                          ) : (
                            <span className="font-bold text-green-500">
                              {item.Quantity.toLocaleString('tr-TR')}
                            </span>
                          )}
                        </td>
                        {canUpdateStock && !archived && (
                        <td className="p-3 text-center">
                          {editingStockId === item.StockId ? (
                            <div className="flex gap-1 justify-center">
                              <button
                                onClick={() => handleSaveEditStock(item)}
                                disabled={isBusy}
                                className="text-green-500 hover:text-green-400 px-2 inline-flex items-center justify-center"
                                title="Kaydet"
                              >
                                <CheckIcon size={18} weight="bold" aria-hidden />
                              </button>
                              <button
                                onClick={handleCancelEditStock}
                                className="text-gray-500 hover:text-gray-400 px-2 inline-flex items-center justify-center"
                                title="İptal"
                              >
                                <XIcon size={18} weight="regular" aria-hidden />
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-1 justify-center">
                              <button
                                onClick={() => handleStartEditStock(item)}
                                disabled={isBusy}
                                className="text-blue-500 hover:text-blue-400 px-2"
                                title="Düzenle"
                              >
                                ✎
                              </button>
                              <button
                                onClick={() => handleRemoveStockClick(item)}
                                disabled={isBusy}
                                className="text-red-500 hover:text-red-400 px-2"
                                title="Kaldır"
                              >
                                🗑
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
          </div>
        )}

        {/* Aksiyon Butonları */}
        <div className="flex gap-3 mt-6 pt-6 border-t border-background-border">
          {!isNew && isReadOnly && (
            <>
              {!archived && (
                <button onClick={() => setIsReadOnly(false)} className="btn-primary flex-1">
                  Düzenle
                </button>
              )}
              {canDelete && !archived && warehouse && (
                <button
                  onClick={handleDeleteClick}
                  disabled={isBusy}
                  className="btn-danger flex-1 inline-flex items-center justify-center gap-2"
                  title="Depoyu kullanımdan kaldır"
                >
                  <ArchiveIcon size={18} weight="bold" aria-hidden />
                  Kullanımdan Kaldır
                </button>
              )}
            </>
          )}
          {!isReadOnly && (
            <>
              <button onClick={onClose} className="btn-secondary flex-1">
                İptal
              </button>
              <button
                onClick={handleSave}
                disabled={isBusy}
                className="btn-primary flex-1"
              >
                {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </>
          )}
          {isReadOnly && !isNew && (
            <button onClick={onClose} className="btn-secondary flex-1">
              Kapat
            </button>
          )}
        </div>
        </>
        )}
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
      />
      <ConfirmModal
        open={showRemoveStockConfirm}
        title="Onaylıyor musunuz?"
        message={removeStockTarget ? `"${removeStockTarget.ItemName}" ürününü depodan kaldırmak istediğinizden emin misiniz?` : ''}
        variant="danger"
        loading={isBusy}
        onConfirm={handleRemoveStockConfirm}
        onCancel={() => { setShowRemoveStockConfirm(false); setRemoveStockTarget(null); }}
      />
    </div>
  );
}

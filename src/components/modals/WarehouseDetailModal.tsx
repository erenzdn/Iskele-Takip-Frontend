import { useState, useEffect } from 'react';
import { AuditLog, Warehouse, WarehouseStock, Inventory } from '../../models';
import { warehouseService } from '../../services/warehouseService';
import { inventoryService } from '../../services/inventoryService';
import AuditLogTimeline from '../AuditLogTimeline';

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
  const [quantity, setQuantity] = useState<number>(0);
  const [editingStockId, setEditingStockId] = useState<number | null>(null);
  const [editingQuantity, setEditingQuantity] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'info' | 'history'>('info');
  const [warehouseLogs, setWarehouseLogs] = useState<AuditLog[]>([]);
  const [warehouseLogsLoading, setWarehouseLogsLoading] = useState(false);

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

  const handleSave = async () => {
    if (!warehouseName.trim()) {
      alert('Depo adı zorunludur');
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
      alert('Kaydetme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!warehouse || !confirm('Bu depoyu silmek istediğinizden emin misiniz?\nDikkat: Depodaki tüm stok kayıtları da silinecektir!')) {
      return;
    }

    try {
      setIsBusy(true);
      await warehouseService.deleteAsync(warehouse.WarehouseId);
      onClose();
    } catch (error) {
      console.error('Delete warehouse error:', error);
      alert('Silme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleOpenAddStock = async () => {
    await loadInventoryItems();
    setShowAddStock(true);
    setSelectedItemId('');
    setQuantity(0);
  };

  const handleAddStock = async () => {
    if (!warehouse || !selectedItemId || quantity <= 0) {
      alert('Lütfen ürün seçin ve geçerli bir miktar girin');
      return;
    }

    try {
      setIsBusy(true);
      await warehouseService.addOrUpdateStockAsync(warehouse.WarehouseId, {
        ItemId: Number(selectedItemId),
        Quantity: quantity,
      });
      setShowAddStock(false);
      setSelectedItemId('');
      setQuantity(0);
      await loadStock();
    } catch (error) {
      console.error('Add stock error:', error);
      alert('Stok ekleme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleStartEditStock = (stockItem: WarehouseStock) => {
    setEditingStockId(stockItem.StockId);
    setEditingQuantity(stockItem.Quantity);
  };

  const handleSaveEditStock = async (stockItem: WarehouseStock) => {
    if (!warehouse || editingQuantity < 0) {
      alert('Geçerli bir miktar girin');
      return;
    }

    try {
      setIsBusy(true);
      await warehouseService.addOrUpdateStockAsync(warehouse.WarehouseId, {
        ItemId: stockItem.ItemId,
        Quantity: editingQuantity,
      });
      setEditingStockId(null);
      await loadStock();
    } catch (error) {
      console.error('Update stock error:', error);
      alert('Stok güncelleme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCancelEditStock = () => {
    setEditingStockId(null);
  };

  const handleRemoveStock = async (stockItem: WarehouseStock) => {
    if (!warehouse || !confirm(`"${stockItem.ItemName}" ürününü depodan kaldırmak istediğinizden emin misiniz?`)) {
      return;
    }

    try {
      setIsBusy(true);
      await warehouseService.removeStockAsync(warehouse.WarehouseId, stockItem.ItemId);
      await loadStock();
    } catch (error) {
      console.error('Remove stock error:', error);
      alert('Stok silme hatası');
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
              <button
                onClick={handleOpenAddStock}
                disabled={isBusy}
                className="btn-secondary text-sm"
              >
                + Ürün Ekle
              </button>
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
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      min="1"
                      className="input w-full"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleAddStock}
                    disabled={isBusy || !selectedItemId || quantity <= 0}
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
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-background-border">
                      <th className="text-left p-3 font-semibold">Ürün</th>
                      <th className="text-left p-3 font-semibold">Kategori</th>
                      <th className="text-center p-3 font-semibold">Miktar</th>
                      <th className="text-center p-3 font-semibold">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stock.map((item) => (
                      <tr key={item.StockId} className="border-b border-background-border">
                        <td className="p-3 font-medium">{item.ItemName}</td>
                        <td className="p-3 text-text-secondary">{item.CategoryName || '-'}</td>
                        <td className="p-3 text-center">
                          {editingStockId === item.StockId ? (
                            <input
                              type="number"
                              value={editingQuantity}
                              onChange={(e) => setEditingQuantity(Number(e.target.value))}
                              min="0"
                              className="input w-20 text-center"
                              autoFocus
                            />
                          ) : (
                            <span className="font-bold text-green-500">
                              {item.Quantity.toLocaleString('tr-TR')}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {editingStockId === item.StockId ? (
                            <div className="flex gap-1 justify-center">
                              <button
                                onClick={() => handleSaveEditStock(item)}
                                disabled={isBusy}
                                className="text-green-500 hover:text-green-400 px-2"
                                title="Kaydet"
                              >
                                ✓
                              </button>
                              <button
                                onClick={handleCancelEditStock}
                                className="text-gray-500 hover:text-gray-400 px-2"
                                title="İptal"
                              >
                                ✕
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
                                onClick={() => handleRemoveStock(item)}
                                disabled={isBusy}
                                className="text-red-500 hover:text-red-400 px-2"
                                title="Kaldır"
                              >
                                🗑
                              </button>
                            </div>
                          )}
                        </td>
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
            <button onClick={() => setIsReadOnly(false)} className="btn-primary flex-1">
              Düzenle
            </button>
          )}
          {!isReadOnly && (
            <>
              {!isNew && warehouse && (
                <button
                  onClick={handleDelete}
                  disabled={isBusy}
                  className="btn-danger flex-1"
                >
                  Sil
                </button>
              )}
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
    </div>
  );
}

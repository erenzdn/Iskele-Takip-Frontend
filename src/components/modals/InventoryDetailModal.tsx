import { useState, useEffect } from 'react';
import { Inventory, MaterialCategory, Warehouse } from '../../models';
import { inventoryService } from '../../services/inventoryService';
import { warehouseService } from '../../services/warehouseService';

interface InventoryDetailModalProps {
  item: Inventory | null;
  categories: MaterialCategory[];
  isNew: boolean;
  onClose: () => void;
}

// Depo stok girişi için tip
interface WarehouseStockEntry {
  warehouseId: number;
  quantity: number;
}

export default function InventoryDetailModal({
  item,
  categories,
  isNew,
  onClose,
}: InventoryDetailModalProps) {
  const [isReadOnly, setIsReadOnly] = useState(!isNew);
  const [itemName, setItemName] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | ''>('');
  const [totalStock, setTotalStock] = useState(0);
  const [onRent, setOnRent] = useState(0);
  const [dailyPrice, setDailyPrice] = useState(0);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [isBusy, setIsBusy] = useState(false);

  // Depo seçimi için state'ler
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseStocks, setWarehouseStocks] = useState<WarehouseStockEntry[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);

  useEffect(() => {
    if (item) {
      setItemName(item.ItemName);
      setSelectedCategoryId(item.CategoryId);
      setTotalStock(item.TotalStock);
      setOnRent(item.OnRent);
      setDailyPrice(item.DailyPrice);
      setPurchasePrice(item.PurchasePrice);
    }
  }, [item]);

  // Yeni malzeme eklerken depoları yükle
  useEffect(() => {
    if (isNew) {
      loadWarehouses();
    }
  }, [isNew]);

  const loadWarehouses = async () => {
    try {
      setLoadingWarehouses(true);
      const data = await warehouseService.getAllAsync();
      setWarehouses(data);
      // İlk depoyu varsayılan olarak ekle (eğer depo varsa)
      if (data.length > 0) {
        setWarehouseStocks([{ warehouseId: data[0].WarehouseId, quantity: 0 }]);
      }
    } catch (error) {
      console.error('Load warehouses error:', error);
    } finally {
      setLoadingWarehouses(false);
    }
  };

  // Depo stok girişi ekle
  const handleAddWarehouseStock = () => {
    const usedWarehouseIds = warehouseStocks.map(ws => ws.warehouseId);
    const availableWarehouse = warehouses.find(w => !usedWarehouseIds.includes(w.WarehouseId));
    if (availableWarehouse) {
      setWarehouseStocks([...warehouseStocks, { warehouseId: availableWarehouse.WarehouseId, quantity: 0 }]);
    }
  };

  // Depo stok girişi kaldır
  const handleRemoveWarehouseStock = (index: number) => {
    setWarehouseStocks(warehouseStocks.filter((_, i) => i !== index));
  };

  // Depo stok girişi güncelle
  const handleWarehouseStockChange = (index: number, field: 'warehouseId' | 'quantity', value: number) => {
    const updated = [...warehouseStocks];
    updated[index] = { ...updated[index], [field]: value };
    setWarehouseStocks(updated);
  };

  // Toplam stok hesapla (depo miktarlarından)
  const calculateTotalFromWarehouses = () => {
    return warehouseStocks.reduce((sum, ws) => sum + ws.quantity, 0);
  };

  // Depo miktarları değiştiğinde toplam stoku güncelle
  useEffect(() => {
    if (isNew && warehouseStocks.length > 0) {
      setTotalStock(calculateTotalFromWarehouses());
    }
  }, [warehouseStocks, isNew]);

  const handleSave = async () => {
    if (!itemName.trim() || !selectedCategoryId) {
      alert('Malzeme adı ve kategori zorunludur');
      return;
    }

    // Yeni malzeme eklerken en az bir depoda miktar girilmiş olmalı
    if (isNew) {
      const validStocks = warehouseStocks.filter(ws => ws.quantity > 0);
      if (validStocks.length === 0) {
        alert('En az bir depoya miktar girmelisiniz');
        return;
      }
    }

    try {
      setIsBusy(true);
      if (isNew) {
        // 1. Önce malzemeyi oluştur
        const result = await inventoryService.createAsync({
          CategoryId: Number(selectedCategoryId),
          ItemName: itemName,
          TotalStock: totalStock,
          OnRent: 0,
          DailyPrice: dailyPrice,
          PurchasePrice: purchasePrice,
        });

        // 2. Sonra seçilen depolara stok ekle
        const validStocks = warehouseStocks.filter(ws => ws.quantity > 0);
        for (const ws of validStocks) {
          await warehouseService.addOrUpdateStockAsync(ws.warehouseId, {
            ItemId: result.ItemId,
            Quantity: ws.quantity,
          });
        }
      } else if (item) {
        await inventoryService.updateAsync(item.ItemId, {
          CategoryId: Number(selectedCategoryId),
          ItemName: itemName,
          TotalStock: totalStock,
          OnRent: onRent,
          DailyPrice: dailyPrice,
          PurchasePrice: purchasePrice,
        });
      }
      onClose();
    } catch (error) {
      console.error('Save inventory error:', error);
      alert('Kaydetme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!item || !confirm('Bu malzemeyi silmek istediğinizden emin misiniz?')) {
      return;
    }

    try {
      setIsBusy(true);
      await inventoryService.deleteAsync(item.ItemId);
      onClose();
    } catch (error) {
      console.error('Delete inventory error:', error);
      alert('Silme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const availableStock = totalStock - onRent;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-background-panel rounded-panel w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6">
          {isNew ? 'Yeni Malzeme' : 'Malzeme Detayı'}
        </h2>

        {isReadOnly && !isNew && item && (
          <div className="mb-6 card bg-blue-900 p-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-text-secondary mb-1">Toplam</div>
                <div className="text-xl font-bold text-blue-400">{item.TotalStock}</div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">Kirada</div>
                <div className="text-xl font-bold text-warning">{item.OnRent}</div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">Müsait</div>
                <div className="text-xl font-bold text-green-500">{availableStock}</div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Malzeme Adı *</label>
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              disabled={isReadOnly}
              placeholder="Örn: Cephe İskelesi 1.5m"
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Kategori *</label>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(Number(e.target.value) || '')}
              disabled={isReadOnly}
              className="input w-full"
              required
            >
              <option value="">Kategori seçin</option>
              {categories.map((cat) => (
                <option key={cat.CategoryId} value={cat.CategoryId}>
                  {cat.CategoryName}
                </option>
              ))}
            </select>
          </div>

          {/* Yeni malzeme için depo seçimi */}
          {isNew && (
            <div className="border border-background-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium">Depo ve Miktar *</label>
                {warehouseStocks.length < warehouses.length && (
                  <button
                    type="button"
                    onClick={handleAddWarehouseStock}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    + Başka Depo Ekle
                  </button>
                )}
              </div>
              
              {loadingWarehouses ? (
                <div className="text-text-secondary text-sm">Depolar yükleniyor...</div>
              ) : warehouses.length === 0 ? (
                <div className="text-yellow-500 text-sm bg-yellow-900/20 p-3 rounded">
                  Henüz depo tanımlanmamış. Önce Depolar sayfasından bir depo ekleyin.
                </div>
              ) : (
                <div className="space-y-3">
                  {warehouseStocks.map((ws, index) => {
                    const usedWarehouseIds = warehouseStocks
                      .filter((_, i) => i !== index)
                      .map(s => s.warehouseId);
                    const availableWarehouses = warehouses.filter(
                      w => w.WarehouseId === ws.warehouseId || !usedWarehouseIds.includes(w.WarehouseId)
                    );

                    return (
                      <div key={index} className="flex gap-3 items-end">
                        <div className="flex-1">
                          <label className="block text-xs text-text-secondary mb-1">Depo</label>
                          <select
                            value={ws.warehouseId}
                            onChange={(e) => handleWarehouseStockChange(index, 'warehouseId', Number(e.target.value))}
                            className="input w-full"
                          >
                            {availableWarehouses.map((w) => (
                              <option key={w.WarehouseId} value={w.WarehouseId}>
                                {w.WarehouseName}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-32">
                          <label className="block text-xs text-text-secondary mb-1">Miktar</label>
                          <input
                            type="number"
                            value={ws.quantity}
                            onChange={(e) => handleWarehouseStockChange(index, 'quantity', Number(e.target.value))}
                            min="0"
                            className="input w-full"
                          />
                        </div>
                        {warehouseStocks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveWarehouseStock(index)}
                            className="text-red-500 hover:text-red-400 p-2"
                            title="Kaldır"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              
              {warehouseStocks.length > 0 && (
                <div className="mt-3 pt-3 border-t border-background-border flex justify-between text-sm">
                  <span className="text-text-secondary">Toplam Stok:</span>
                  <span className="font-bold text-green-500">{calculateTotalFromWarehouses()}</span>
                </div>
              )}
            </div>
          )}

          {/* Mevcut malzeme için stok bilgileri */}
          {!isNew && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Toplam Stok</label>
                  <input
                    type="number"
                    value={totalStock}
                    onChange={(e) => setTotalStock(Number(e.target.value))}
                    disabled={isReadOnly}
                    min="0"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Kirada Olan
                    <span className="text-xs text-text-secondary ml-1">(Otomatik)</span>
                  </label>
                  <input
                    type="number"
                    value={onRent}
                    disabled={true}
                    className="input w-full bg-background-secondary cursor-not-allowed"
                    title="Bu değer sözleşmeler tarafından otomatik yönetilir"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Müsait Stok</label>
                  <div className={`input w-full flex items-center justify-center font-bold ${
                    availableStock > 0 ? 'text-green-500' : 'text-red-500'
                  } bg-background-secondary`}>
                    {availableStock}
                  </div>
                </div>
              </div>
              
              <div className="text-xs text-text-secondary bg-background-secondary p-3 rounded-lg">
                <strong>Not:</strong> "Kirada Olan" değeri sözleşmeler oluşturulduğunda otomatik artar, 
                sözleşme tamamlandığında veya ürün iadesi yapıldığında otomatik azalır.
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Günlük Kira</label>
              <input
                type="number"
                value={dailyPrice}
                onChange={(e) => setDailyPrice(Number(e.target.value))}
                disabled={isReadOnly}
                min="0"
                step="0.01"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Alış Fiyatı</label>
              <input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(Number(e.target.value))}
                disabled={isReadOnly}
                min="0"
                step="0.01"
                className="input w-full"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          {!isNew && isReadOnly && (
            <button onClick={() => setIsReadOnly(false)} className="btn-primary flex-1">
              Düzenle
            </button>
          )}
          {!isReadOnly && (
            <>
              {!isNew && item && (
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
      </div>
    </div>
  );
}


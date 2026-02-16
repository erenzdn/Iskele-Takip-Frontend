import { useState, useEffect } from 'react';
import { AuditLog, Inventory, MaterialCategory, SubCategory, Warehouse } from '../../models';
import { inventoryService } from '../../services/inventoryService';
import { warehouseService } from '../../services/warehouseService';
import { subcategoryService } from '../../services/subcategoryService';
import AuditLogTimeline from '../AuditLogTimeline';

interface InventoryDetailModalProps {
  item: Inventory | null;
  categories: MaterialCategory[];
  isNew: boolean;
  onClose: () => void;
}

// Depo stok girişi için tip
interface WarehouseStockEntry {
  warehouseId: number;
  quantity: number | '';
}

export default function InventoryDetailModal({
  item,
  categories,
  isNew,
  onClose,
}: InventoryDetailModalProps) {
  const [isReadOnly, setIsReadOnly] = useState(!isNew);
  const [itemCode, setItemCode] = useState('');
  const [itemName, setItemName] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | ''>('');
  const [totalStock, setTotalStock] = useState<number | ''>(0);
  const [onRent, setOnRent] = useState(0);
  const [dailyPrice, setDailyPrice] = useState(0);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [monthlyListPrice, setMonthlyListPrice] = useState<number | ''>(0);
  const [unitPrice, setUnitPrice] = useState<number | ''>(0);
  const [isBusy, setIsBusy] = useState(false);

  // Alt kategori seçimi için state'ler
  const [allSubCategories, setAllSubCategories] = useState<SubCategory[]>([]);
  const [selectedSubCategoryIds, setSelectedSubCategoryIds] = useState<number[]>([]);
  const [loadingSubCategories, setLoadingSubCategories] = useState(false);

  // Depo seçimi için state'ler
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseStocks, setWarehouseStocks] = useState<WarehouseStockEntry[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'history'>('info');
  const [itemLogs, setItemLogs] = useState<AuditLog[]>([]);
  const [itemLogsLoading, setItemLogsLoading] = useState(false);

  useEffect(() => {
    if (item) {
      setItemCode(item.ItemCode ?? '');
      setItemName(item.ItemName);
      setSelectedCategoryId(item.CategoryId);
      setTotalStock(item.TotalStock);
      setOnRent(item.OnRent);
      setDailyPrice(item.DailyPrice);
      setPurchasePrice(item.PurchasePrice);
      setMonthlyListPrice(item.MonthlyListPrice ?? 0);
      setUnitPrice(item.UnitPrice ?? 0);
      setSelectedSubCategoryIds(
        item.SubCategories?.map((sc) => sc.SubCategoryId) ?? []
      );
    }
  }, [item]);

  // Alt kategorileri yükle
  useEffect(() => {
    loadSubCategories();
  }, []);

  // Yeni malzeme eklerken depoları yükle
  useEffect(() => {
    if (isNew) {
      loadWarehouses();
    }
  }, [isNew]);

  const loadSubCategories = async () => {
    try {
      setLoadingSubCategories(true);
      const data = await subcategoryService.getAllAsync();
      setAllSubCategories(data);
    } catch (error) {
      console.error('Load subcategories error:', error);
    } finally {
      setLoadingSubCategories(false);
    }
  };

  const handleSubCategoryToggle = (subCategoryId: number) => {
    if (isReadOnly) return;
    setSelectedSubCategoryIds((prev) => {
      if (prev.includes(subCategoryId)) {
        return prev.filter((id) => id !== subCategoryId);
      } else {
        return [...prev, subCategoryId];
      }
    });
  };

  const loadItemLogs = async () => {
    if (!item?.ItemId) return;
    try {
      setItemLogsLoading(true);
      const data = await inventoryService.getAuditLogsByItemAsync(item.ItemId);
      setItemLogs(data ?? []);
    } catch (error) {
      console.error('Load item audit logs error:', error);
      setItemLogs([]);
    } finally {
      setItemLogsLoading(false);
    }
  };

  useEffect(() => {
    if (item?.ItemId && !isNew) {
      loadItemLogs();
    } else {
      setItemLogs([]);
    }
  }, [item?.ItemId, isNew]);

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
  const handleWarehouseStockChange = (index: number, field: 'warehouseId' | 'quantity', value: number | '') => {
    const updated = [...warehouseStocks];
    updated[index] = { ...updated[index], [field]: value };
    setWarehouseStocks(updated);
  };

  // Toplam stok hesapla (depo miktarlarından)
  const calculateTotalFromWarehouses = () => {
    return warehouseStocks.reduce((sum, ws) => sum + Number(ws.quantity), 0);
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
      const validStocks = warehouseStocks.filter(ws => Number(ws.quantity) > 0);
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
          ItemCode: itemCode.trim() || undefined,
          CategoryId: Number(selectedCategoryId),
          ItemName: itemName,
          TotalStock: Number(totalStock),
          OnRent: 0,
          MonthlyListPrice: Number(monthlyListPrice),
          UnitPrice: Number(unitPrice),
          SubCategoryIds: selectedSubCategoryIds.length > 0 ? selectedSubCategoryIds : undefined,
        });

        // 2. Sonra seçilen depolara stok ekle
        const validStocks = warehouseStocks.filter(ws => Number(ws.quantity) > 0);
        for (const ws of validStocks) {
          await warehouseService.addOrUpdateStockAsync(ws.warehouseId, {
            ItemId: result.ItemId,
            Quantity: Number(ws.quantity),
          });
        }
      } else if (item) {
        await inventoryService.updateAsync(item.ItemId, {
          ItemCode: itemCode.trim() || undefined,
          CategoryId: Number(selectedCategoryId),
          ItemName: itemName,
          TotalStock: Number(totalStock),
          OnRent: onRent,
          MonthlyListPrice: Number(monthlyListPrice),
          UnitPrice: Number(unitPrice),
          SubCategoryIds: selectedSubCategoryIds,
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

  const availableStock = Number(totalStock) - onRent;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-background-panel rounded-panel w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">
          {isNew ? 'Yeni Malzeme' : 'Malzeme Detayı'}
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
            <AuditLogTimeline logs={itemLogs} loading={itemLogsLoading} />
            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="btn-secondary flex-1">
                Kapat
              </button>
            </div>
          </>
        )}

        {(activeTab === 'info' || isNew) && (
        <>
        {isReadOnly && !isNew && item && item.ItemCode && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-text-secondary">Ürün Kodu:</span>
            <span className="font-mono font-bold text-accent bg-accent/10 px-3 py-1 rounded text-lg">
              {item.ItemCode}
            </span>
          </div>
        )}

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
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className="block text-sm font-medium mb-2">Ürün Kodu</label>
              <input
                type="text"
                value={itemCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^a-zA-Z0-9\-_.]/g, '');
                  if (val.length <= 50) setItemCode(val);
                }}
                disabled={isReadOnly}
                placeholder="Örn: BRU2M001"
                className="input w-full uppercase"
                maxLength={50}
              />
              <p className="text-xs text-text-secondary mt-1">Harf, rakam, tire, nokta ve alt çizgi kullanılabilir (maks 50 karakter)</p>
            </div>
            <div className="col-span-2">
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
                            onChange={(e) => handleWarehouseStockChange(index, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
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
                    onChange={(e) => setTotalStock(e.target.value === '' ? '' : Number(e.target.value))}
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
              <label className="block text-sm font-medium mb-2">Aylık Liste Fiyatı *</label>
              <input
                type="number"
                value={monthlyListPrice}
                onChange={(e) => setMonthlyListPrice(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={isReadOnly}
                min="0"
                step="0.01"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Birim Fiyat</label>
              <input
                type="number"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={isReadOnly}
                min="0"
                step="0.01"
                className="input w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Günlük Kira
                <span className="text-xs text-text-secondary ml-1">(Otomatik: Aylık/30)</span>
              </label>
              <input
                type="number"
                value={Number(monthlyListPrice) > 0 ? Number((Number(monthlyListPrice) / 30).toFixed(2)) : dailyPrice}
                disabled={true}
                min="0"
                step="0.01"
                className="input w-full bg-background-secondary cursor-not-allowed"
                title="Aylık Liste Fiyatı / 30 olarak otomatik hesaplanır"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Alış Fiyatı
                <span className="text-xs text-text-secondary ml-1">(Salt okunur)</span>
              </label>
              <input
                type="number"
                value={purchasePrice}
                disabled={true}
                min="0"
                step="0.01"
                className="input w-full bg-background-secondary cursor-not-allowed"
                title="Bu alan artık salt okunurdur. Birim Fiyat alanını kullanın."
              />
            </div>
          </div>

          {/* Alt Kategori Seçimi */}
          <div className="border border-background-border rounded-lg p-4">
            <label className="block text-sm font-medium mb-3">Alt Kategoriler</label>
            {loadingSubCategories ? (
              <div className="text-text-secondary text-sm">Alt kategoriler yükleniyor...</div>
            ) : allSubCategories.length === 0 ? (
              <div className="text-text-secondary text-sm">
                Henüz alt kategori tanımlanmamış. Envanter sayfasındaki kategori yönetiminden ekleyebilirsiniz.
              </div>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {/* Kategoriye göre grupla */}
                {Array.from(
                  allSubCategories.reduce((map, sc) => {
                    const catName = sc.CategoryName || `Kategori ${sc.CategoryId}`;
                    if (!map.has(catName)) map.set(catName, []);
                    map.get(catName)!.push(sc);
                    return map;
                  }, new Map<string, SubCategory[]>())
                ).map(([categoryName, subCats]) => (
                  <div key={categoryName} className="mb-2">
                    <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                      {categoryName}
                    </div>
                    <div className="grid grid-cols-2 gap-1 ml-2">
                      {subCats.map((sc) => (
                        <label
                          key={sc.SubCategoryId}
                          className={`flex items-center gap-2 text-sm py-1 ${
                            isReadOnly ? 'cursor-default' : 'cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedSubCategoryIds.includes(sc.SubCategoryId)}
                            onChange={() => handleSubCategoryToggle(sc.SubCategoryId)}
                            disabled={isReadOnly}
                            className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800"
                          />
                          <span className="text-text-secondary">{sc.SubCategoryName}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {selectedSubCategoryIds.length > 0 && (
              <div className="mt-2 pt-2 border-t border-background-border text-sm text-text-secondary">
                Seçili: <span className="font-medium text-white">{selectedSubCategoryIds.length}</span> alt kategori
              </div>
            )}
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
        </>
        )}
      </div>
    </div>
  );
}


import { useState, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { warehouseService } from '../services/warehouseService';
import { Warehouse, WarehouseStock } from '../models';
import { formatShortDateTime } from '../utils/formatters';
import EmptyState from '../components/EmptyState';
import WarehouseDetailModal from '../components/modals/WarehouseDetailModal';

export default function WarehousesPage() {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewWarehouse, setIsNewWarehouse] = useState(false);

  // Genişletilmiş depo ve stok bilgileri
  const [expandedWarehouseId, setExpandedWarehouseId] = useState<number | null>(null);
  const [expandedStock, setExpandedStock] = useState<WarehouseStock[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await warehouseService.getAllAsync();
      setWarehouses(data);
    } catch (error) {
      console.error('Load warehouses error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setSelectedWarehouse(null);
    setIsNewWarehouse(true);
    setIsModalOpen(true);
  };

  const handleOpenDetail = (warehouse: Warehouse, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedWarehouse(warehouse);
    setIsNewWarehouse(false);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedWarehouse(null);
    loadData();
    // Genişletilmiş depoyu yenile
    if (expandedWarehouseId) {
      loadWarehouseStock(expandedWarehouseId);
    }
  };

  // Depo satırına tıklandığında genişlet/daralt
  const handleToggleExpand = async (warehouse: Warehouse) => {
    if (expandedWarehouseId === warehouse.WarehouseId) {
      // Zaten açıksa kapat
      setExpandedWarehouseId(null);
      setExpandedStock([]);
    } else {
      // Yeni depoyu aç
      setExpandedWarehouseId(warehouse.WarehouseId);
      await loadWarehouseStock(warehouse.WarehouseId);
    }
  };

  // Depo stoklarını yükle
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

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Depolar</h1>
          <p className="text-text-secondary">Depo ve stok yönetimi</p>
        </div>
        <div className="flex gap-3">
          <button onClick={loadData} className="btn-secondary">
            Yenile
          </button>
          <button onClick={handleAddNew} className="btn-primary">
            + Yeni Depo
          </button>
        </div>
      </div>

      {warehouses.length === 0 ? (
        <EmptyState
          icon="🏭"
          title="Henüz depo bulunmuyor"
          description="Malzemelerinizi depolamak için yeni bir depo ekleyin"
        />
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-background-border">
                  <th className="text-left p-4 font-semibold" style={{ width: '22%' }}>
                    Depo Adı
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '26%' }}>
                    Adres
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '12%' }}>
                    Ürün Çeşidi
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '12%' }}>
                    Toplam Miktar
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '12%' }}>
                    Durum
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '16%' }}>
                    Oluşturan / Son Güncelleyen
                  </th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((warehouse) => {
                  // Stok durumuna göre renk ve etiket
                  let statusBadge;
                  if (warehouse.TotalQuantity === 0) {
                    statusBadge = <span className="badge bg-gray-600 text-white">Boş</span>;
                  } else if (warehouse.UniqueItems <= 3) {
                    statusBadge = <span className="badge bg-yellow-600 text-white">Az Ürün</span>;
                  } else {
                    statusBadge = <span className="badge bg-green-600 text-white">Aktif</span>;
                  }

                  const isExpanded = expandedWarehouseId === warehouse.WarehouseId;

                  return (
                    <Fragment key={warehouse.WarehouseId}>
                      <tr
                        className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${
                          isExpanded ? 'bg-background-hover' : ''
                        }`}
                        onClick={() => navigate(`/warehouses/${warehouse.WarehouseId}`)}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleExpand(warehouse);
                              }}
                              className="text-text-secondary transition-transform hover:text-text-primary"
                              title={isExpanded ? 'Kapat' : 'Depodaki malzemeleri göster'}
                            >
                              <span className={isExpanded ? 'inline-block rotate-90' : 'inline-block'}>▶</span>
                            </button>
                            <div>
                              <div className="font-medium">{warehouse.WarehouseName}</div>
                              {warehouse.Description && (
                                <div className="text-sm text-text-secondary truncate max-w-xs">
                                  {warehouse.Description}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-text-secondary">
                          {warehouse.Address || '-'}
                        </td>
                        <td className="p-4 text-center">
                          <span className="font-bold text-lg text-blue-400">
                            {warehouse.UniqueItems}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className="font-bold text-lg text-green-500">
                            {warehouse.TotalQuantity.toLocaleString('tr-TR')}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {statusBadge}
                            <button
                              onClick={() => navigate(`/warehouses/${warehouse.WarehouseId}`)}
                              className="btn-secondary text-xs px-3 py-1 ml-2"
                              title="Depo içeriğini gör"
                            >
                              Depo Detayı
                            </button>
                            <button
                              onClick={(e) => handleOpenDetail(warehouse, e)}
                              className="text-blue-400 hover:text-blue-300 ml-2"
                              title="Düzenle"
                            >
                              ✎
                            </button>
                          </div>
                        </td>
                        <td className="p-4 text-sm text-text-secondary">
                          <div>Oluşturan: {warehouse.CreatedByUserFullName || warehouse.CreatedByUserName || '-'}</div>
                          <div>{formatShortDateTime(warehouse.CreatedAt)}</div>
                          <div className="mt-1">Güncelleyen: {warehouse.LastModifiedByUserFullName || warehouse.LastModifiedByUserName || '-'}</div>
                          <div>{formatShortDateTime(warehouse.LastModifiedAt)}</div>
                        </td>
                      </tr>
                      {/* Genişletilmiş malzeme listesi */}
                      {isExpanded && (
                        <tr key={`${warehouse.WarehouseId}-expanded`}>
                          <td colSpan={6} className="p-0">
                            <div className="bg-background-secondary p-4 border-b border-background-border">
                              {loadingStock ? (
                                <div className="text-center py-4 text-text-secondary">
                                  Malzemeler yükleniyor...
                                </div>
                              ) : expandedStock.length === 0 ? (
                                <div className="text-center py-4 text-text-secondary">
                                  Bu depoda henüz malzeme bulunmuyor
                                </div>
                              ) : (
                                <div>
                                  <h4 className="text-sm font-semibold mb-3 text-text-secondary">
                                    Depodaki Malzemeler ({expandedStock.length} çeşit)
                                  </h4>
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-background-border">
                                        <th className="text-left p-2 font-medium text-text-secondary">Malzeme</th>
                                        <th className="text-left p-2 font-medium text-text-secondary">Kategori</th>
                                        <th className="text-center p-2 font-medium text-text-secondary">Miktar</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {expandedStock.map((stock) => (
                                        <tr key={stock.StockId} className="border-b border-background-border/50">
                                          <td className="p-2 font-medium">{stock.ItemName}</td>
                                          <td className="p-2 text-text-secondary">{stock.CategoryName || '-'}</td>
                                          <td className="p-2 text-center">
                                            <span className="font-bold text-green-500">
                                              {stock.Quantity.toLocaleString('tr-TR')}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
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
        </div>
      )}

      {isModalOpen && (
        <WarehouseDetailModal
          warehouse={selectedWarehouse}
          isNew={isNewWarehouse}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}

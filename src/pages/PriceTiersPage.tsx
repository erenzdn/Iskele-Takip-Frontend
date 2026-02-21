import { useState, useEffect } from 'react';
import { CurrencyCircleDollarIcon } from '@phosphor-icons/react';
import { priceTierService } from '../services/priceTierService';
import { inventoryService } from '../services/inventoryService';
import { PriceTier, Inventory } from '../models';
import EmptyState from '../components/EmptyState';
import PriceTierDetailModal from '../components/modals/PriceTierDetailModal';

export default function PriceTiersPage() {
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [inventoryItems, setInventoryItems] = useState<Inventory[]>([]);
  const [selectedInventoryFilter, setSelectedInventoryFilter] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<PriceTier | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewTier, setIsNewTier] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tiersData, itemsData] = await Promise.all([
        priceTierService.getAllAsync(),
        inventoryService.getAllAsync(),
      ]);

      // Item bilgilerini price tiers'a ekle (API nested döndürmüyor)
      const itemMap = new Map<number, typeof itemsData[0]>();
      itemsData.forEach((i) => itemMap.set(i.ItemId, i));
      const tiersWithItems = tiersData.map((tier) => ({
        ...tier,
        Item: itemMap.get(tier.ItemId),
      }));

      setPriceTiers(tiersWithItems);
      setInventoryItems(itemsData);
    } catch (error) {
      console.error('Load price tiers error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterByItem = async () => {
    if (!selectedInventoryFilter) {
      loadData();
      return;
    }

    try {
      setLoading(true);
      const data = await priceTierService.getByItemAsync(selectedInventoryFilter.ItemId);
      
      // Item bilgisini ekle
      const tiersWithItem = data.map((tier) => ({
        ...tier,
        Item: selectedInventoryFilter,
      }));
      
      setPriceTiers(tiersWithItem);
    } catch (error) {
      console.error('Filter error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setSelectedTier(null);
    setIsNewTier(true);
    setIsModalOpen(true);
  };

  const handleOpenDetail = (tier: PriceTier) => {
    setSelectedTier(tier);
    setIsNewTier(false);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedTier(null);
    loadData();
  };

  const formatCurrency = (amount: number) => {
    return `₺${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
          <h1 className="text-3xl font-bold mb-2">Fiyat Tarifeleri</h1>
          <p className="text-text-secondary">Süreye göre fiyat çarpanları</p>
        </div>
        <button onClick={handleAddNew} className="btn-primary">
          + Yeni Tarife
        </button>
      </div>

      <div className="mb-6 flex gap-4">
        <select
          value={selectedInventoryFilter?.ItemId || ''}
          onChange={(e) => {
            const item = inventoryItems.find((i) => i.ItemId === Number(e.target.value));
            setSelectedInventoryFilter(item || null);
          }}
          className="input"
        >
          <option value="">Tüm Malzemeler</option>
          {inventoryItems.map((item) => (
            <option key={item.ItemId} value={item.ItemId}>
              {item.ItemName}
            </option>
          ))}
        </select>
        <button onClick={handleFilterByItem} className="btn-secondary">
          Filtrele
        </button>
        <button onClick={loadData} className="btn-secondary">
          Yenile
        </button>
      </div>

      {priceTiers.length === 0 ? (
        <EmptyState
          icon={<CurrencyCircleDollarIcon size={48} weight="duotone" />}
          title="Henüz fiyat tarifesi bulunmuyor"
          description="Süreye göre fiyat çarpanları tanımlayın"
        />
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full table-compact">
              <thead>
                <tr className="border-b border-background-border">
                  <th className="text-left p-4 font-semibold" style={{ width: '40%' }}>
                    Malzeme
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '20%' }}>
                    Min Gün
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '20%' }}>
                    Max Gün
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '20%' }}>
                    Çarpan
                  </th>
                </tr>
              </thead>
              <tbody>
                {priceTiers.map((tier) => (
                  <tr
                    key={tier.TierId}
                    className="border-b border-background-border hover:bg-background-hover cursor-pointer"
                    onClick={() => handleOpenDetail(tier)}
                  >
                    <td className="p-4">
                      <div className="font-medium">{tier.Item?.ItemName}</div>
                      <div className="text-sm text-text-secondary">
                        Günlük: {formatCurrency(tier.Item?.DailyPrice || 0)}
                      </div>
                    </td>
                    <td className="p-4 text-center">{tier.MinDays} gün</td>
                    <td className="p-4 text-center">{tier.MaxDays} gün</td>
                    <td className="p-4 text-center">
                      <span className="badge bg-blue-600 text-white">
                        x{tier.PriceMultiplier.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <PriceTierDetailModal
          tier={selectedTier}
          inventoryItems={inventoryItems}
          isNew={isNewTier}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}


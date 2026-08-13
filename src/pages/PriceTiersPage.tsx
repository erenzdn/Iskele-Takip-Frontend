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
      <div className="flex items-center justify-center py-16">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-2">
        <button onClick={loadData} className="btn-secondary py-2 px-3 text-sm">Yenile</button>
        <button onClick={handleAddNew} className="btn-primary py-2 px-3 text-sm">+ Yeni Tarife</button>
      </div>

      <div className="mb-2 rounded border border-background-border bg-background-panel p-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-secondary whitespace-nowrap">Kriterler:</span>
        <select
          value={selectedInventoryFilter?.ItemId || ''}
          onChange={(e) => {
            const item = inventoryItems.find((i) => i.ItemId === Number(e.target.value));
            setSelectedInventoryFilter(item || null);
          }}
          className="input py-2 px-3 text-sm flex-1 min-w-[180px]"
        >
          <option value="">Tüm Malzemeler</option>
          {inventoryItems.map((item) => (
            <option key={item.ItemId} value={item.ItemId}>{item.ItemName}</option>
          ))}
        </select>
        <button onClick={handleFilterByItem} className="btn-secondary py-2 px-3 text-sm">Filtrele</button>
      </div>

      {priceTiers.length === 0 ? (
        <EmptyState
          icon={<CurrencyCircleDollarIcon size={48} weight="duotone" />}
          title="Henüz fiyat tarifesi bulunmuyor"
          description="Süreye göre fiyat çarpanları tanımlayın"
        />
      ) : (
        <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
          <div className="overflow-auto max-h-[calc(100vh-160px)] min-h-[280px]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 border-b border-background-border">
                <tr>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Malzeme</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Min Gün</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Max Gün</th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">Çarpan</th>
                </tr>
              </thead>
              <tbody>
                {priceTiers.map((tier, index) => (
                  <tr
                    key={tier.TierId}
                    className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${index % 2 === 0 ? 'bg-background-panel' : 'bg-[#16162e]'}`}
                    onClick={() => handleOpenDetail(tier)}
                  >
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                      <span className="font-medium text-text-primary">{tier.Item?.ItemName}</span>
                      <span className="text-text-secondary ml-1">Günlük: {formatCurrency(tier.Item?.DailyPrice || 0)}</span>
                    </td>
                    <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0">{tier.MinDays} gün</td>
                    <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0">{tier.MaxDays} gün</td>
                    <td className="py-0.5 px-2 text-center align-middle">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-600 text-white">x{tier.PriceMultiplier.toFixed(2)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex items-center justify-between shrink-0">
            <span>Toplam: {priceTiers.length} tarife</span>
            <span className="text-text-secondary/80">Ekranda yaklaşık 25–40 satır görünür (pencere boyutuna göre)</span>
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


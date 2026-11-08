import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import InventoryDetailModal from '../components/modals/InventoryDetailModal';
import PageLoader from '../components/PageLoader';
import { useTab } from '../components/tabs/TabContext';
import { Inventory, MaterialCategory } from '../models';
import { inventoryService } from '../services/inventoryService';
import { invalidateData } from '../store/dataInvalidationStore';
import { useTabStore } from '../store/tabStore';

export default function InventoryDetailPage() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const tab = useTab();
  const requestClose = useTabStore((state) => state.requestClose);
  const rawId = params.id ?? params.itemId;
  const isNew = location.pathname.endsWith('/new') || rawId === 'new';
  const numericId = Number(rawId);
  const startInEditMode = Boolean((location.state as { startInEditMode?: boolean } | null)?.startInEditMode);
  const [item, setItem] = useState<Inventory | null>(null);
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void inventoryService.getAllCategoriesAsync().then(setCategories).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isNew) {
      setItem(null);
      setMissing(false);
      setLoading(false);
      return;
    }
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setMissing(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void inventoryService
      .getByIdAsync(numericId)
      .then((row) => {
        if (cancelled) return;
        setItem(row);
        setMissing(false);
      })
      .catch(() => {
        if (cancelled) return;
        setMissing(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isNew, numericId]);

  if (loading) return <PageLoader />;

  if (missing || (!isNew && !item)) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-sm text-text-secondary">
        <span>Malzeme bulunamadı.</span>
        <button type="button" className="btn-secondary" onClick={() => requestClose(tab.tabId)}>
          Sekmeyi kapat
        </button>
      </div>
    );
  }

  return (
    <InventoryDetailModal
      presentation="page"
      item={item}
      categories={categories}
      isNew={isNew}
      startInEditMode={isNew || startInEditMode}
      onCategoriesChanged={() => {
        void inventoryService.getAllCategoriesAsync().then(setCategories).catch(() => undefined);
      }}
      onCreated={(itemId) => {
        invalidateData('inventory');
        navigate(`/inventory/${itemId}`, { replace: true });
      }}
      onClose={() => requestClose(tab.tabId)}
    />
  );
}

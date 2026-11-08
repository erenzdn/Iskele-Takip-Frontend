import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import CustomerDetailModal from '../components/modals/CustomerDetailModal';
import PageLoader from '../components/PageLoader';
import { useTab } from '../components/tabs/TabContext';
import { Customer } from '../models';
import { customerService } from '../services/customerService';
import { invalidateData } from '../store/dataInvalidationStore';
import { useTabStore } from '../store/tabStore';
import type { CustomerTabState } from '../utils/entityNavigation';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const tab = useTab();
  const requestClose = useTabStore((state) => state.requestClose);
  const isNew = !id || id === 'new' || location.pathname.endsWith('/new');
  const numericId = Number(id);
  const tabState = (location.state ?? null) as CustomerTabState | null;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (isNew) {
      setCustomer(null);
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
    void customerService
      .getByIdAsync(numericId)
      .then((row) => {
        if (cancelled) return;
        setCustomer(row);
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
  }, [id, isNew, numericId]);

  if (loading) return <PageLoader />;

  if (missing || (!isNew && !customer)) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-sm text-text-secondary">
        <span>Müşteri bulunamadı.</span>
        <button type="button" className="btn-secondary" onClick={() => requestClose(tab.tabId)}>
          Sekmeyi kapat
        </button>
      </div>
    );
  }

  return (
    <CustomerDetailModal
      presentation="page"
      customer={customer}
      isNew={isNew}
      startInEditMode={isNew || Boolean(tabState?.startInEditMode)}
      initialTab={tabState?.initialTab ?? 'info'}
      onClose={() => requestClose(tab.tabId)}
      onSaved={({ customerId, isNew: created }) => {
        invalidateData('customers');
        if (created) navigate(`/customers/${customerId}`, { replace: true });
      }}
    />
  );
}

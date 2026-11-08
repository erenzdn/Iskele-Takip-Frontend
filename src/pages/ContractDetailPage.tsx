import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ContractDetailModal from '../components/modals/ContractDetailModal';
import PageLoader from '../components/PageLoader';
import { useTab } from '../components/tabs/TabContext';
import { Contract, ContractQuoteType } from '../models';
import { contractService } from '../services/contractService';
import { invalidateData } from '../store/dataInvalidationStore';
import { useTabStore } from '../store/tabStore';
import type { ContractTabState } from '../utils/entityNavigation';

export default function ContractDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tab = useTab();
  const requestClose = useTabStore((state) => state.requestClose);
  const isNew = location.pathname.endsWith('/new') || id === 'new';
  const numericId = Number(id);
  const defaultType: ContractQuoteType = searchParams.get('type') === 'sale' ? 'SALE' : 'RENTAL';
  const tabState = (location.state ?? null) as ContractTabState | null;
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (isNew) {
      setContract(null);
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
    void contractService
      .getByIdAsync(numericId)
      .then((row) => {
        if (cancelled) return;
        setContract(row);
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

  if (missing || (!isNew && !contract)) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-sm text-text-secondary">
        <span>Sözleşme bulunamadı.</span>
        <button type="button" className="btn-secondary" onClick={() => requestClose(tab.tabId)}>
          Sekmeyi kapat
        </button>
      </div>
    );
  }

  return (
    <ContractDetailModal
      presentation="page"
      contract={contract}
      isNew={isNew}
      initialTab={tabState?.initialTab ?? 'info'}
      defaultTypeForNew={defaultType}
      lockNewContractType
      onCreated={(contractId) => {
        invalidateData('contracts');
        navigate(`/contracts/${contractId}`, { replace: true });
      }}
      onDataChanged={() => {
        invalidateData('contracts');
      }}
      onClose={() => requestClose(tab.tabId)}
    />
  );
}

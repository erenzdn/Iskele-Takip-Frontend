import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import QuoteDetailModal from '../components/modals/QuoteDetailModal';
import PageLoader from '../components/PageLoader';
import { useTab } from '../components/tabs/TabContext';
import { ContractQuoteType, Quote } from '../models';
import { quoteService } from '../services/quoteService';
import { invalidateData } from '../store/dataInvalidationStore';
import { useTabStore } from '../store/tabStore';
import type { QuoteTabState } from '../utils/entityNavigation';

export default function QuoteDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tab = useTab();
  const requestClose = useTabStore((state) => state.requestClose);
  const isNew = location.pathname.endsWith('/new') || id === 'new';
  const numericId = Number(id);
  const defaultType: ContractQuoteType = searchParams.get('type') === 'sale' ? 'SALE' : 'RENTAL';
  const tabState = (location.state ?? null) as QuoteTabState | null;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (isNew) {
      setQuote(null);
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
    void quoteService
      .getByIdAsync(numericId)
      .then((row) => {
        if (cancelled) return;
        setQuote(row);
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

  if (missing || (!isNew && !quote)) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-sm text-text-secondary">
        <span>Teklif bulunamadı.</span>
        <button type="button" className="btn-secondary" onClick={() => requestClose(tab.tabId)}>
          Sekmeyi kapat
        </button>
      </div>
    );
  }

  return (
    <QuoteDetailModal
      presentation="page"
      quote={quote}
      isNew={isNew}
      defaultTypeForNew={defaultType}
      lockNewQuoteType
      startInEditMode={isNew || Boolean(tabState?.startInEditMode)}
      isClonedDraft={Boolean(tabState?.isClonedDraft)}
      onCreated={(quoteId) => {
        invalidateData('quotes');
        navigate(`/quotes/${quoteId}`, { replace: true, state: { startInEditMode: true } });
      }}
      onDataChanged={() => {
        invalidateData('quotes');
      }}
      onConverted={(contractId) => {
        invalidateData('quotes');
        invalidateData('contracts');
        navigate(`/contracts/${contractId}`);
      }}
      onQuoteCloned={(cloned) => {
        invalidateData('quotes');
        navigate(`/quotes/${cloned.QuoteId}`, {
          state: { startInEditMode: true, isClonedDraft: true },
        });
      }}
      onClose={() => requestClose(tab.tabId)}
    />
  );
}

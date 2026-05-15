import { useState, useEffect, useMemo, useCallback, useRef, type MouseEvent } from 'react';
import { ClipboardIcon, NotePencilIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { contractService } from '../services/contractService';
import { quoteService } from '../services/quoteService';
import { customerService } from '../services/customerService';
import { siteService } from '../services/siteService';
import {
  Contract,
  ContractQuoteType,
  Customer,
  ConstructionSite,
  Quote,
  QuoteStatus,
} from '../models';
import { formatShortDateTime } from '../utils/formatters';
import { getApiErrorMessage } from '../utils/apiError';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import EmptyState from '../components/EmptyState';
import ContractDetailModal from '../components/modals/ContractDetailModal';
import QuoteDetailModal from '../components/modals/QuoteDetailModal';
import ConfirmModal from '../components/modals/ConfirmModal';
import { toast } from '../hooks/useToast';
import {
  useContextMenu,
  useContextMenuHandlers,
  type ContractRowTarget,
  type QuoteRowTarget,
} from '../context-menu';

type TabType = 'active' | 'completed' | 'quotes';

/** Yerel takvim günü; planlanan bitiş bugünden önceyse ve sözleşme kapanmamışsa gecikmiş sayılır. */
function isRentalContractOverdue(contract: Contract): boolean {
  if (contract.IsCompleted || !contract.PlannedEndDate) return false;
  const end = new Date(contract.PlannedEndDate);
  if (isNaN(end.getTime())) return false;
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return endDay < today;
}

export type ContractsPageScope = 'rental' | 'sale';

interface ContractsPageProps {
  contractScope: ContractsPageScope;
}

export default function ContractsPage({ contractScope }: ContractsPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const scopeType: ContractQuoteType = contractScope === 'sale' ? 'SALE' : 'RENTAL';
  const isSaleScope = contractScope === 'sale';
  const [activeTab, setActiveTab] = useState<TabType>('quotes');
  const [contractsRaw, setContractsRaw] = useState<Contract[]>([]);
  const [quotesRaw, setQuotesRaw] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const consumedOpenContractIdRef = useRef<number | null>(null);
  const consumedOpenQuoteIdRef = useRef<number | null>(null);
  const returnOnCloseRef = useRef<boolean>(false);
  const returnToRef = useRef<{ path: string; state?: any } | null>(null);

  const salePlannedEndTooltip = 'Satışlarda planlanan bitiş tarihi kullanılmaz.';

  // Contract Modal State
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [isNewContract, setIsNewContract] = useState(false);
  const [contractInitialTab, setContractInitialTab] = useState<'info' | 'return' | 'returns' | 'history'>('info');
  const [contractInitiallyFullScreen, setContractInitiallyFullScreen] = useState(false);

  // Quote Modal State
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isNewQuote, setIsNewQuote] = useState(false);
  /**
   * Modal "kopyalanmış taslak" durumunda mı?
   * - true: modal doğrudan düzenleme modunda açılır ve "Taslak (kopya)" rozeti gösterilir.
   * - false: normal Detay görünümü.
   */
  const [isQuoteClonedDraft, setIsQuoteClonedDraft] = useState(false);
  /** Clone işlemi sırasında satır üzerinden tetiklendiğinde double-click'i engelle. */
  const [cloningQuoteId, setCloningQuoteId] = useState<number | null>(null);
  const { openContextMenu } = useContextMenu();

  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<{ contractId: number; contractCode?: string } | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  // Customer ve Site Map (tüm tab'lar için ortak)
  const [customerMap, setCustomerMap] = useState<Map<number, Customer>>(new Map());
  const [siteMap, setSiteMap] = useState<Map<number, ConstructionSite>>(new Map());
  const [searchText, setSearchText] = useState('');
  const debouncedContractSearch = useDebouncedValue(searchText, 300);
  const [quoteSearchText, setQuoteSearchText] = useState('');
  const debouncedQuoteSearch = useDebouncedValue(quoteSearchText, 300);
  const [quoteStatusFilter, setQuoteStatusFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [contractsError, setContractsError] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const hydratedSiteCustomersRef = useRef<Set<number>>(new Set());
  const hydratedCustomersRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    hydratedSiteCustomersRef.current.clear();
    hydratedCustomersRef.current.clear();
    setCustomerMap(new Map());
    setSiteMap(new Map());
  }, [contractScope]);

  useEffect(() => {
    setActiveTab('quotes');
  }, [contractScope]);

  useEffect(() => {
    const st = location.state as any;
    const openContractId = st?.openContractId;
    if (!openContractId) return;
    const idNum = Number(openContractId);
    if (!Number.isFinite(idNum) || idNum <= 0) return;
    if (consumedOpenContractIdRef.current === idNum) return;
    const preferTab = st?.preferTab;
    if (preferTab === 'active' || preferTab === 'completed' || preferTab === 'quotes') {
      setActiveTab(preferTab);
    } else {
      setActiveTab('active');
    }
    const initialTab = st?.initialTab;
    if (initialTab === 'info' || initialTab === 'return' || initialTab === 'returns' || initialTab === 'history') {
      setContractInitialTab(initialTab);
    } else {
      setContractInitialTab('info');
    }
    const found = contractsRaw.find((c) => c.ContractId === idNum);
    if (found) {
      setSelectedContract(found);
      setIsNewContract(false);
      setContractInitiallyFullScreen(Boolean(st?.returnTo?.path?.includes('/warehouses')));
      setIsContractModalOpen(true);
      consumedOpenContractIdRef.current = idNum;
      returnOnCloseRef.current = Boolean(st?.returnOnClose);
      const rt = st?.returnTo;
      returnToRef.current = rt && typeof rt.path === 'string' ? rt : null;
      // URL state'i temizle: modal kapanınca loadData tetiklenince tekrar açılmasın.
      navigate(location.pathname + location.search, { replace: true, state: null });
    }
  }, [contractsRaw, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    const st = location.state as any;
    const openQuoteId = st?.openQuoteId;
    if (!openQuoteId) return;
    const idNum = Number(openQuoteId);
    if (!Number.isFinite(idNum) || idNum <= 0) return;
    if (consumedOpenQuoteIdRef.current === idNum) return;

    setActiveTab('quotes');
    const found = quotesRaw.find((q) => q.QuoteId === idNum);
    if (found) {
      setSelectedQuote(found);
      setIsNewQuote(false);
      setIsQuoteClonedDraft(false);
      setIsQuoteModalOpen(true);
      consumedOpenQuoteIdRef.current = idNum;
      navigate(location.pathname + location.search, { replace: true, state: null });
    }
  }, [location.pathname, location.search, location.state, navigate, quotesRaw]);

  useEffect(() => {
    if (isSaleScope && activeTab === 'completed') {
      setActiveTab('active');
    }
  }, [isSaleScope, activeTab]);

  /** Liste: müşteri adı API `CustomerName`; şantiye için önceden yüklenen site haritası. */
  const contracts = useMemo(
    () =>
      (contractsRaw || []).map((contract) => ({
        ...contract,
        Site: contract.SiteId ? siteMap.get(contract.SiteId) : undefined,
      })),
    [contractsRaw, siteMap]
  );

  const overdueCount = useMemo(() => {
    if (contractScope !== 'rental' || activeTab !== 'active') return 0;
    return contracts.filter(isRentalContractOverdue).length;
  }, [contracts, contractScope, activeTab]);

  const displayedContracts = useMemo(() => {
    if (contractScope !== 'rental' || activeTab !== 'active' || !overdueOnly) {
      return contracts;
    }
    return contracts.filter(isRentalContractOverdue);
  }, [contracts, contractScope, activeTab, overdueOnly]);

  const quotes = useMemo(
    () =>
      (quotesRaw || []).map((quote) => ({
        ...quote,
        Site: quote.SiteId ? siteMap.get(quote.SiteId) : undefined,
      })),
    [quotesRaw, siteMap]
  );

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      if (activeTab === 'quotes') {
        setQuotesError(null);
        const statusArg: QuoteStatus | undefined =
          quoteStatusFilter === 'all'
            ? undefined
            : quoteStatusFilter === 'pending'
              ? QuoteStatus.Pending
              : quoteStatusFilter === 'accepted'
                ? QuoteStatus.Accepted
                : QuoteStatus.Rejected;
        const quotesData = await quoteService.getAllAsync({
          quoteType: scopeType,
          status: statusArg,
          search: debouncedQuoteSearch.trim() || undefined,
        });
        setQuotesRaw(quotesData || []);
      } else {
        setContractsError(null);
        const contractsData = await contractService.listAsync({
          status: isSaleScope ? undefined : activeTab === 'active' ? 'active' : 'completed',
          type: scopeType,
          search: debouncedContractSearch.trim() || undefined,
        });
        setContractsRaw(contractsData || []);
      }
    } catch (error) {
      console.error('Load data error:', error);
      if (activeTab === 'quotes') {
        setQuotesRaw([]);
        setQuotesError(getApiErrorMessage(error));
      } else {
        setContractsRaw([]);
        setContractsError(getApiErrorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  }, [
    activeTab,
    isSaleScope,
    scopeType,
    quoteStatusFilter,
    debouncedContractSearch,
    debouncedQuoteSearch,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const fetchCustomersByIds = useCallback(async (customerIds: number[]) => {
    if (customerIds.length === 0) return;
    try {
      const allCustomers = await customerService.getAllAsync();
      const wanted = new Set(customerIds);
      const nextCustomers = allCustomers.filter((c) => wanted.has(c.CustomerId));
      if (nextCustomers.length === 0) return;
      setCustomerMap((prev) => {
        const next = new Map(prev);
        nextCustomers.forEach((customer) => next.set(customer.CustomerId, customer));
        return next;
      });
    } catch (error) {
      console.error('Load customers by ids error:', error);
    }
  }, []);

  const hydrateAuxiliaryMaps = useCallback(async () => {
    const rows = activeTab === 'quotes' ? quotesRaw : contractsRaw;
    const customerIds = Array.from(
      new Set(rows.map((row) => row.CustomerId).filter((id): id is number => typeof id === 'number' && id > 0))
    );

    if (customerIds.length === 0) return;

    const missingSiteCustomers = customerIds.filter(
      (id) => !hydratedSiteCustomersRef.current.has(id)
    );
    if (missingSiteCustomers.length > 0) {
      try {
        const groupedSites = await siteService.getByCustomersBatchedAsync(missingSiteCustomers, {
          staleTimeMs: 120_000,
          concurrency: 4,
        });
        setSiteMap((prev) => {
          const next = new Map(prev);
          groupedSites.forEach((sites) => {
            sites.forEach((site) => next.set(site.SiteId, site));
          });
          return next;
        });
        missingSiteCustomers.forEach((id) => hydratedSiteCustomersRef.current.add(id));
      } catch (error) {
        console.error('Load sites by customer ids error:', error);
      }
    }

    const missingCustomers = customerIds.filter(
      (id) => !hydratedCustomersRef.current.has(id) && !customerMap.has(id)
    );
    if (missingCustomers.length > 0) {
      await fetchCustomersByIds(missingCustomers);
      missingCustomers.forEach((id) => hydratedCustomersRef.current.add(id));
    }
  }, [activeTab, contractsRaw, quotesRaw, customerMap, fetchCustomersByIds]);

  useEffect(() => {
    void hydrateAuxiliaryMaps();
  }, [hydrateAuxiliaryMaps]);

  const handleAddNew = () => {
    if (activeTab === 'quotes') {
      setSelectedQuote(null);
      setIsNewQuote(true);
      setIsQuoteClonedDraft(false);
      setIsQuoteModalOpen(true);
    } else {
      setSelectedContract(null);
      setIsNewContract(true);
      setContractInitiallyFullScreen(false);
      setIsContractModalOpen(true);
    }
  };

  const handleOpenContract = (contract: Contract, options?: { initialTab?: 'info' | 'return' | 'returns' | 'history' }) => {
    setSelectedContract(contract);
    setIsNewContract(false);
    setContractInitialTab(options?.initialTab ?? 'info');
    setContractInitiallyFullScreen(false);
    setIsContractModalOpen(true);
  };

  const handleOpenQuote = (quote: Quote, options?: { asClonedDraft?: boolean }) => {
    setSelectedQuote(quote);
    setIsNewQuote(false);
    setIsQuoteClonedDraft(Boolean(options?.asClonedDraft));
    setIsQuoteModalOpen(true);
  };

  /**
   * Backend tarafında /clone ile yeni teklif yaratıldıktan sonra modal bunu
   * parent'a iletir. Burada listeyi yeniler ve modalı yeni teklifle düzenleme
   * modunda yeniden açarız (mevcut update akışıyla kullanıcı serbestçe
   * düzenleyebilir; satır içi değişiklikler sırasında satır kalemleri
   * /quotes/:id endpoint'i ile zaten kopyalandığı için yeniden gönderilmez).
   */
  const handleQuoteCloned = useCallback(
    async (newQuote: Quote) => {
      try {
        await loadData();
      } catch (error) {
        console.error('Reload after clone failed:', error);
      }
      setSelectedQuote(newQuote);
      setIsNewQuote(false);
      setIsQuoteClonedDraft(true);
      setIsQuoteModalOpen(true);
    },
    [loadData]
  );

  /**
   * Liste satırından (sağ tık menüsü) kopyalama akışı.
   * - quotes_create yetkisi yoksa backend 403 döner; mesaj toast ile gösterilir.
   * - Aynı satıra ardışık tıklamayı `cloningQuoteId` ile engeller.
   */
  const handleQuoteCloneFromRow = useCallback(
    async (quoteId: number) => {
      if (!quoteId || cloningQuoteId === quoteId) return;
      try {
        setCloningQuoteId(quoteId);
        const result = await quoteService.cloneQuoteAsync(quoteId);
        const successMessage =
          (result.message && String(result.message).trim()) || 'Teklif kopyalandı.';
        toast.success(`${successMessage} (Yeni Teklif ID: ${result.QuoteId})`);
        await handleQuoteCloned(result);
      } catch (error) {
        console.error('Clone quote (row) error:', error);
        toast.error(getApiErrorMessage(error) || 'Teklif kopyalanamadı.');
      } finally {
        setCloningQuoteId(null);
      }
    },
    [cloningQuoteId, handleQuoteCloned]
  );

  const handleContractModalClose = () => {
    setIsContractModalOpen(false);
    setSelectedContract(null);
    setContractInitialTab('info');
    if (returnOnCloseRef.current) {
      returnOnCloseRef.current = false;
      const rt = returnToRef.current;
      returnToRef.current = null;
      if (rt?.path) {
        navigate(rt.path, { replace: true, state: rt.state ?? null });
      } else {
        navigate(-1);
      }
      return;
    }
    loadData();
  };

  const handleQuoteModalClose = () => {
    setIsQuoteModalOpen(false);
    setSelectedQuote(null);
    setIsQuoteClonedDraft(false);
    loadData();
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount == null) return '₺0,00';
    return `₺${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '-';
      return date.toLocaleDateString('tr-TR');
    } catch {
      return '-';
    }
  };

  const getQuoteStatusBadge = (status: QuoteStatus) => {
    const c = 'inline-block px-2 py-0.5 rounded text-xs font-medium';
    switch (status) {
      case QuoteStatus.Pending:
        return <span className={`${c} bg-yellow-700 text-yellow-100`}>Beklemede</span>;
      case QuoteStatus.Accepted:
        return <span className={`${c} bg-green-700 text-green-100`}>Kabul Edildi</span>;
      case QuoteStatus.Rejected:
        return <span className={`${c} bg-red-700 text-red-100`}>Reddedildi</span>;
      default:
        return <span className={`${c} bg-gray-700 text-gray-100`}>{status}</span>;
    }
  };

  const getAddButtonLabel = () => {
    return activeTab === 'quotes' ? '+ Yeni Teklif' : '+ Yeni Sözleşme';
  };

  const openContractContextMenu = (event: MouseEvent<HTMLTableRowElement>, contract: Contract) => {
    event.preventDefault();
    openContextMenu({
      menuKey: 'contractRow',
      x: event.clientX,
      y: event.clientY,
      target: {
        entityType: 'contract',
        entityId: contract.ContractId,
        itemName: contract.ContractCode || `#${contract.ContractId}`,
        rawData: {
          ContractId: contract.ContractId,
          ContractCode: contract.ContractCode,
          IsCompleted: Boolean(contract.IsCompleted),
          IsRental: contractScope === 'rental',
        },
      },
    });
  };

  const openQuoteContextMenu = (event: MouseEvent<HTMLTableRowElement>, quote: Quote) => {
    event.preventDefault();
    openContextMenu({
      menuKey: 'quoteRow',
      x: event.clientX,
      y: event.clientY,
      target: {
        entityType: 'quote',
        entityId: quote.QuoteId,
        itemName: quote.QuoteCode || `#${quote.QuoteId}`,
        rawData: {
          QuoteId: quote.QuoteId,
          QuoteCode: quote.QuoteCode,
          Status: quote.Status,
        },
      },
    });
  };

  useContextMenuHandlers(
    'contractRow',
    useMemo(
      () => ({
        'contract.open': (target) => {
          const row = target as ContractRowTarget;
          const contract = contracts.find((item) => item.ContractId === row.entityId);
          if (!contract) return;
          handleOpenContract(contract, { initialTab: 'info' });
        },
        'contract.returnTab': (target) => {
          const row = target as ContractRowTarget;
          const contract = contracts.find((item) => item.ContractId === row.entityId);
          if (!contract) return;
          handleOpenContract(contract, { initialTab: 'return' });
        },
        'contract.complete': async (target) => {
          const row = target as ContractRowTarget;
          const contract = contracts.find((item) => item.ContractId === row.entityId);
          if (!contract || contract.IsCompleted || contractScope !== 'rental') return;
          setCompleteTarget({ contractId: contract.ContractId, contractCode: contract.ContractCode ?? undefined });
          setShowCompleteConfirm(true);
        },
        'contract.copyCode': async (target) => {
          const row = target as ContractRowTarget;
          if (!row.rawData.ContractCode) {
            toast.warning('Sözleşme kodu bulunmuyor.');
            return;
          }
          await navigator.clipboard.writeText(row.rawData.ContractCode);
          toast.success('Sözleşme kodu kopyalandı.');
        },
      }),
      [contracts, contractScope, loadData]
    )
  );

  useContextMenuHandlers(
    'quoteRow',
    useMemo(
      () => ({
        'quote.open': (target) => {
          const row = target as QuoteRowTarget;
          const quote = quotes.find((item) => item.QuoteId === row.entityId);
          if (!quote) return;
          handleOpenQuote(quote);
        },
        'quote.copyCode': async (target) => {
          const row = target as QuoteRowTarget;
          if (!row.rawData.QuoteCode) {
            toast.warning('Teklif kodu bulunmuyor.');
            return;
          }
          await navigator.clipboard.writeText(row.rawData.QuoteCode);
          toast.success('Teklif kodu kopyalandı.');
        },
        'quote.accept': async (target) => {
          const row = target as QuoteRowTarget;
          if (row.rawData.Status === 'accepted') return;
          await quoteService.acceptQuoteAsync(row.entityId);
          toast.success('Teklif kabul edildi.');
          await loadData();
        },
        'quote.rollback': async (target) => {
          const row = target as QuoteRowTarget;
          if (row.rawData.Status === 'pending') return;
          await quoteService.updateAsync(row.entityId, { Status: QuoteStatus.Pending });
          toast.success('Teklif beklemede durumuna geri alındı.');
          await loadData();
        },
        'quote.convert': (target) => {
          const row = target as QuoteRowTarget;
          const quote = quotes.find((item) => item.QuoteId === row.entityId);
          if (!quote) return;
          if (quote.Status !== QuoteStatus.Accepted) {
            toast.warning('Önce teklifi kabul etmelisiniz.');
            return;
          }
          handleOpenQuote(quote);
          toast.info('Teklif detayindan "Sözleşmeye Dönüştür" adımını tamamlayabilirsiniz.');
        },
        'quote.clone': async (target) => {
          const row = target as QuoteRowTarget;
          await handleQuoteCloneFromRow(row.entityId);
        },
      }),
      [handleQuoteCloneFromRow, loadData, quotes]
    )
  );

  const renderContractsTable = () => {
    if (contracts.length === 0) {
      return (
        <EmptyState
          icon={<ClipboardIcon size={48} weight="duotone" />}
          title={isSaleScope ? 'Satış sözleşmesi bulunmuyor' : activeTab === 'active' ? 'Aktif sözleşme bulunmuyor' : 'Kapalı sözleşme bulunmuyor'}
          description={
            isSaleScope
              ? 'Henüz satış sözleşmesi yok'
              : activeTab === 'active'
              ? isSaleScope
                ? 'Yeni bir satış sözleşmesi oluşturun'
                : 'Yeni bir kiralama sözleşmesi oluşturun'
              : 'Henüz tamamlanmış sözleşme yok'
          }
        />
      );
    }

    if (displayedContracts.length === 0 && overdueOnly) {
      return (
        <EmptyState
          icon={<ClipboardIcon size={48} weight="duotone" />}
          title="Geciken aktif sözleşme yok"
          description="Planlanan bitiş tarihi geçmiş aktif kira sözleşmesi bulunmuyor. Filtreyi kapatıp tüm aktif sözleşmeleri görebilirsiniz."
        />
      );
    }

    return (
      <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
        <div className="overflow-auto max-h-[calc(100vh-260px)] min-h-[280px]">
          <table className="w-full text-xs border-collapse text-text-primary">
            <thead className="sticky top-0 z-10 border-b border-background-border">
              <tr>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">ID</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Kod</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Müşteri</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Şantiye</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Başlangıç</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Bitiş</th>
                {/* Dönüştürülme sütunu gizlendi (kullanıcı isteği) */}
                <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Tutar</th>
                <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Durum</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">Kayıt Bilgisi</th>
              </tr>
            </thead>
            <tbody>
              {displayedContracts.map((contract, index) => {
                const overdue =
                  contractScope === 'rental' && isRentalContractOverdue(contract);
                return (
                <tr
                  key={contract.ContractId}
                  className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${index % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'} ${overdue ? 'border-l-2 border-l-amber-500' : ''}`}
                  onClick={() => handleOpenContract(contract)}
                  onContextMenu={(event) => openContractContextMenu(event, contract)}
                >
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">#{contract.ContractId}</td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary">{contract.ContractCode || <span className="text-text-secondary">-</span>}</td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                    {(() => {
                      const rowCust = customerMap.get(contract.CustomerId);
                      return (
                        <>
                          <span className="font-medium text-text-primary">
                            {contract.CustomerName ?? rowCust?.Name ?? '—'}
                          </span>
                          {rowCust?.PhoneNumber ? (
                            <span className="text-text-secondary ml-1">• {rowCust.PhoneNumber}</span>
                          ) : null}
                        </>
                      );
                    })()}
                  </td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary">
                    {contract.Site ? <span>{contract.Site.SiteName}{contract.Site.ResponsiblePerson ? ` • ${contract.Site.ResponsiblePerson}` : ''}</span> : <span className="text-text-secondary">-</span>}
                  </td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">{formatDate(contract.StartDate)}</td>
                  <td
                    className={`py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 ${overdue ? 'text-amber-400 font-medium' : ''}`}
                    title={isSaleScope ? salePlannedEndTooltip : undefined}
                  >
                    {isSaleScope ? '—' : formatDate(contract.PlannedEndDate)}
                  </td>
                  <td className="py-0.5 px-2 text-right align-middle border-r border-background-border/60 last:border-r-0 text-green-500 font-medium">{formatCurrency(contract.InitialTotalPrice)}</td>
                  <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${contract.IsCompleted ? 'bg-green-700 text-green-100' : 'bg-blue-900 text-blue-100'}`}>
                        {contract.IsCompleted ? 'Tamamlandı' : 'Aktif'}
                      </span>
                      {overdue && (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-amber-900/90 text-amber-100 border border-amber-600/40">
                          Gecikmiş
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-0.5 px-2 align-middle text-text-secondary">
                    {contract.CreatedByUserFullName || contract.CreatedByUserName || '-'} • {formatShortDateTime(contract.CreatedAt)}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
        <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex flex-wrap items-center justify-between gap-2 shrink-0">
          <span>
            {overdueOnly ? (
              <>Gösterilen: {displayedContracts.length} / {contracts.length} sözleşme</>
            ) : (
              <>Toplam: {contracts.length} sözleşme</>
            )}
            {contractScope === 'rental' && activeTab === 'active' && overdueCount > 0 && (
              <span className="text-amber-400/90 ml-2">· Geciken: {overdueCount}</span>
            )}
          </span>
          <span className="text-text-secondary/80">Ekranda yaklaşık 25–40 satır görünür (pencere boyutuna göre)</span>
        </div>
      </div>
    );
  };

  const renderQuotesTable = () => {
    if (quotes.length === 0) {
      return (
        <EmptyState
          icon={<NotePencilIcon size={48} weight="duotone" />}
          title="Henüz teklif bulunmuyor"
          description={
            contractScope === 'sale' ? 'Yeni bir satış teklifi oluşturun' : 'Yeni bir kiralama teklifi oluşturun'
          }
        />
      );
    }

    return (
      <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
        <div className="overflow-auto max-h-[calc(100vh-260px)] min-h-[280px]">
          <table className="w-full text-xs border-collapse text-text-primary">
            <thead className="sticky top-0 z-10 border-b border-background-border">
              <tr>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">ID</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Kod</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Konu</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Müşteri</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Şantiye</th>
                {!isSaleScope && (
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    Süre (gün)
                  </th>
                )}
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Başlangıç</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Bitiş</th>
                {/* Tutar sütunu gizlendi (kullanıcı isteği) */}
                <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Durum</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">Oluşturma</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote, index) => (
                <tr
                  key={quote.QuoteId}
                  className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${index % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'}`}
                  onClick={() => handleOpenQuote(quote)}
                  onContextMenu={(event) => openQuoteContextMenu(event, quote)}
                >
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">#{quote.QuoteId}</td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary">{quote.QuoteCode || <span className="text-text-secondary">-</span>}</td>
                  <td
                    className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary max-w-[220px] truncate"
                    title={quote.Subject ?? undefined}
                  >
                    {quote.Subject ? quote.Subject : <span className="text-text-secondary">-</span>}
                  </td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 font-medium text-text-primary">
                    {quote.CustomerName ?? customerMap.get(quote.CustomerId)?.Name ?? '—'}
                  </td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary">{quote.Site ? quote.Site.SiteName : <span className="text-text-secondary">-</span>}</td>
                  {!isSaleScope && (
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary">
                      {quote.RentalDurationDays != null && Number(quote.RentalDurationDays) >= 1
                        ? String(quote.RentalDurationDays)
                        : '—'}
                    </td>
                  )}
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">{formatDate(quote.StartDate)}</td>
                  <td
                    className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0"
                    title={isSaleScope ? salePlannedEndTooltip : undefined}
                  >
                    {isSaleScope ? (
                      '—'
                    ) : quote.PlannedEndDate ? (
                      formatDate(quote.PlannedEndDate)
                    ) : (
                      <span className="text-text-secondary" title="Sözleşmede belirlenecek">
                        —
                      </span>
                    )}
                  </td>
                  <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0">{getQuoteStatusBadge(quote.Status)}</td>
                  <td className="py-0.5 px-2 align-middle text-text-secondary">{formatDate(quote.CreatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex items-center justify-between shrink-0">
          <span>Toplam: {quotes.length} teklif</span>
          <span className="text-text-secondary/80">Ekranda yaklaşık 25–40 satır görünür (pencere boyutuna göre)</span>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">
          {contractScope === 'sale' ? 'Satış teklifleri' : 'Kiralama teklifleri'}
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="btn-secondary py-2 px-3 text-sm">Yenile</button>
          <button onClick={handleAddNew} className="btn-primary py-2 px-3 text-sm">{getAddButtonLabel()}</button>
        </div>
      </div>

      {/* Sözleşme arama ve filtreleme alanı (sadece sözleşme tablarında) */}
      {activeTab !== 'quotes' && (
        <div className="mb-3 rounded border border-background-border bg-background-panel p-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-secondary whitespace-nowrap">Kriterler:</span>
          <div className="relative flex-1 min-w-[220px]">
            <span className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-text-secondary">
              <MagnifyingGlassIcon size={14} weight="regular" color="currentColor" aria-hidden />
            </span>
            <input
              type="text"
              className="input w-full pl-7 py-2 text-sm"
              placeholder="Müşteri adı veya sözleşme kodu (sunucu, 300ms)…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          {contractScope === 'rental' && activeTab === 'active' && (
            <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                className="rounded border-background-border"
                checked={overdueOnly}
                onChange={(e) => setOverdueOnly(e.target.checked)}
              />
              Sadece geciken
            </label>
          )}
          <button
            type="button"
            onClick={() => {
              setSearchText('');
              setOverdueOnly(false);
            }}
            className="btn-secondary py-2 px-3 text-sm"
          >
            Filtreleri Temizle
          </button>
        </div>
      )}

      {/* Teklif arama ve filtreleme alanı (sadece teklif tabında) */}
      {activeTab === 'quotes' && (
        <div className="mb-3 rounded border border-background-border bg-background-panel p-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-secondary whitespace-nowrap">Kriterler:</span>
          <div className="relative flex-1 min-w-[220px]">
            <span className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-text-secondary">
              <MagnifyingGlassIcon size={14} weight="regular" color="currentColor" aria-hidden />
            </span>
            <input
              type="text"
              className="input w-full pl-7 py-2 text-sm"
              placeholder="Müşteri adı, teklif kodu veya konu (sunucu, 300ms)…"
              value={quoteSearchText}
              onChange={(e) => setQuoteSearchText(e.target.value)}
            />
          </div>
          <select
            value={quoteStatusFilter}
            onChange={(e) =>
              setQuoteStatusFilter(
                e.target.value as 'all' | 'pending' | 'accepted' | 'rejected'
              )
            }
            className="input py-2 px-3 text-sm w-40"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="pending">Beklemede</option>
            <option value="accepted">Kabul Edilen</option>
            <option value="rejected">Reddedilen</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setQuoteSearchText('');
              setQuoteStatusFilter('all');
            }}
            className="btn-secondary py-2 px-3 text-sm"
          >
            Filtreleri Temizle
          </button>
        </div>
      )}

      <div className="mb-3 border-b border-background-border flex gap-1">
        <button onClick={() => setActiveTab('quotes')} className={`px-4 py-2 text-sm font-medium transition-colors relative ${activeTab === 'quotes' ? 'text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
          {contractScope === 'sale' ? 'Satış teklifleri' : 'Kiralama teklifleri'}
          {activeTab === 'quotes' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
        </button>
        <button onClick={() => setActiveTab('active')} className={`px-4 py-2 text-sm font-medium transition-colors relative ${activeTab === 'active' ? 'text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
          {isSaleScope ? 'Satış Sözleşmeleri' : 'Aktif Sözleşmeler'}
          {activeTab === 'active' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
        </button>
        {!isSaleScope && (
          <button onClick={() => setActiveTab('completed')} className={`px-4 py-2 text-sm font-medium transition-colors relative ${activeTab === 'completed' ? 'text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
            Kapalı Sözleşmeler
            {activeTab === 'completed' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
          </button>
        )}
      </div>

      {activeTab === 'quotes' && quotesError && (
        <div className="mb-3 rounded border border-red-700/50 bg-red-950/40 p-3 text-sm text-red-200">
          Teklifler yüklenemedi: {quotesError}
        </div>
      )}

      {activeTab !== 'quotes' && contractsError && (
        <div className="mb-3 rounded border border-red-700/50 bg-red-950/40 p-3 text-sm text-red-200">
          Sözleşmeler yüklenemedi: {contractsError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-text-secondary">Yükleniyor...</div>
        </div>
      ) : activeTab === 'quotes' ? (
        renderQuotesTable()
      ) : (
        renderContractsTable()
      )}

      {/* Contract Modal */}
      {isContractModalOpen && (
        <ContractDetailModal
          key={isNewContract ? `new-contract-${contractScope}` : `c-${selectedContract?.ContractId ?? 'x'}`}
          contract={selectedContract}
          isNew={isNewContract}
          initialTab={contractInitialTab}
          onClose={handleContractModalClose}
          defaultTypeForNew={scopeType}
          initiallyFullScreen={contractInitiallyFullScreen}
          lockNewContractType
        />
      )}

      {/* Quote Modal */}
      {isQuoteModalOpen && (
        <QuoteDetailModal
          key={
            isNewQuote
              ? `new-quote-${contractScope}`
              : `q-${selectedQuote?.QuoteId ?? 'x'}${isQuoteClonedDraft ? '-clone' : ''}`
          }
          quote={selectedQuote}
          isNew={isNewQuote}
          onClose={handleQuoteModalClose}
          onDataChanged={loadData}
          defaultTypeForNew={scopeType}
          lockNewQuoteType
          onQuoteCloned={handleQuoteCloned}
          startInEditMode={isQuoteClonedDraft}
          isClonedDraft={isQuoteClonedDraft}
        />
      )}

      <ConfirmModal
        open={showCompleteConfirm}
        title="Onaylıyor musunuz?"
        message={
          completeTarget?.contractCode
            ? `Sözleşmeyi tamamlamak istediğinizden emin misiniz?\n\nSözleşme: ${completeTarget.contractCode}\n\nBu işlemle birlikte kalan ürünlerin stokları geri eklenecektir.`
            : 'Sözleşmeyi tamamlamak istediğinizden emin misiniz?\n\nBu işlemle birlikte kalan ürünlerin stokları geri eklenecektir.'
        }
        confirmLabel="Tamamla"
        cancelLabel="Vazgeç"
        loading={isCompleting}
        onCancel={() => {
          if (isCompleting) return;
          setShowCompleteConfirm(false);
          setCompleteTarget(null);
        }}
        onConfirm={() => {
          if (!completeTarget?.contractId || isCompleting) return;
          const contractId = completeTarget.contractId;
          setIsCompleting(true);
          void (async () => {
            try {
              await contractService.completeContractAsync(contractId, new Date().toISOString());
              toast.success('Sözleşme tamamlandı.');
              setShowCompleteConfirm(false);
              setCompleteTarget(null);
              await loadData();
            } catch (error) {
              console.error('Complete contract error:', error);
              toast.error(getApiErrorMessage(error) || 'Tamamlama hatası');
            } finally {
              setIsCompleting(false);
            }
          })();
        }}
      />
    </div>
  );
}

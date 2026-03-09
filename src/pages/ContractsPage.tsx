import { useState, useEffect } from 'react';
import { ClipboardIcon, NotePencilIcon } from '@phosphor-icons/react';
import { contractService } from '../services/contractService';
import { quoteService } from '../services/quoteService';
import { customerService } from '../services/customerService';
import { siteService } from '../services/siteService';
import { Contract, Customer, ConstructionSite, Quote, QuoteStatus } from '../models';
import { formatShortDateTime } from '../utils/formatters';
import EmptyState from '../components/EmptyState';
import ContractDetailModal from '../components/modals/ContractDetailModal';
import QuoteDetailModal from '../components/modals/QuoteDetailModal';

type TabType = 'active' | 'completed' | 'quotes';

export default function ContractsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  // Contract Modal State
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [isNewContract, setIsNewContract] = useState(false);

  // Quote Modal State
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isNewQuote, setIsNewQuote] = useState(false);

  // Customer ve Site Map (tüm tab'lar için ortak)
  const [customerMap, setCustomerMap] = useState<Map<number, Customer>>(new Map());
  const [siteMap, setSiteMap] = useState<Map<number, ConstructionSite>>(new Map());

  useEffect(() => {
    loadCustomersAndSites();
  }, []);

  useEffect(() => {
    loadData();
  }, [activeTab, customerMap, siteMap]);

  const loadCustomersAndSites = async () => {
    try {
      const customers = await customerService.getAllAsync();
      const newCustomerMap = new Map<number, Customer>();
      customers.forEach((c) => newCustomerMap.set(c.CustomerId, c));
      setCustomerMap(newCustomerMap);

      // Şantiyeleri yükle
      const allSites: ConstructionSite[] = [];
      for (const customer of customers) {
        try {
          const customerSites = await siteService.getByCustomerAsync(customer.CustomerId);
          allSites.push(...customerSites);
        } catch {
          // Şantiye yükleme hatası varsa devam et
        }
      }
      const newSiteMap = new Map<number, ConstructionSite>();
      allSites.forEach((s) => newSiteMap.set(s.SiteId, s));
      setSiteMap(newSiteMap);
    } catch (error) {
      console.error('Load customers and sites error:', error);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);

      if (activeTab === 'quotes') {
        // Teklifleri yükle
        const quotesData = await quoteService.getAllAsync();
        const quotesWithCustomers = (quotesData || []).map((quote) => ({
          ...quote,
          Customer: customerMap.get(quote.CustomerId),
          Site: quote.SiteId ? siteMap.get(quote.SiteId) : undefined,
        }));
        setQuotes(quotesWithCustomers);
      } else {
        // Sözleşmeleri yükle
        const contractsData =
          activeTab === 'active'
            ? await contractService.getActiveContractsAsync()
            : await contractService.getCompletedContractsAsync();

        const contractsWithCustomersAndSites = (contractsData || []).map((contract) => ({
          ...contract,
          Customer: customerMap.get(contract.CustomerId),
          Site: contract.SiteId ? siteMap.get(contract.SiteId) : undefined,
        }));
        setContracts(contractsWithCustomersAndSites);
      }
    } catch (error) {
      console.error('Load data error:', error);
      if (activeTab === 'quotes') {
        setQuotes([]);
      } else {
        setContracts([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    if (activeTab === 'quotes') {
      setSelectedQuote(null);
      setIsNewQuote(true);
      setIsQuoteModalOpen(true);
    } else {
      setSelectedContract(null);
      setIsNewContract(true);
      setIsContractModalOpen(true);
    }
  };

  const handleOpenContract = (contract: Contract) => {
    setSelectedContract(contract);
    setIsNewContract(false);
    setIsContractModalOpen(true);
  };

  const handleOpenQuote = (quote: Quote) => {
    setSelectedQuote(quote);
    setIsNewQuote(false);
    setIsQuoteModalOpen(true);
  };

  const handleContractModalClose = () => {
    setIsContractModalOpen(false);
    setSelectedContract(null);
    loadData();
  };

  const handleQuoteModalClose = () => {
    setIsQuoteModalOpen(false);
    setSelectedQuote(null);
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

  const renderContractsTable = () => {
    if (contracts.length === 0) {
      return (
        <EmptyState
          icon={<ClipboardIcon size={48} weight="duotone" />}
          title={activeTab === 'active' ? 'Aktif sözleşme bulunmuyor' : 'Kapalı sözleşme bulunmuyor'}
          description={
            activeTab === 'active'
              ? 'Yeni bir kiralama sözleşmesi oluşturun'
              : 'Henüz tamamlanmış sözleşme yok'
          }
        />
      );
    }

    return (
      <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
        <div className="overflow-auto max-h-[calc(100vh-260px)] min-h-[280px]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 border-b border-background-border">
              <tr>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">ID</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Kod</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Müşteri</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Şantiye</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Başlangıç</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Bitiş</th>
                <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Tutar</th>
                <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Durum</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">Kayıt Bilgisi</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract, index) => (
                <tr
                  key={contract.ContractId}
                  className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${index % 2 === 0 ? 'bg-background-panel' : 'bg-[#16162e]'}`}
                  onClick={() => handleOpenContract(contract)}
                >
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">#{contract.ContractId}</td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary">{contract.ContractCode || <span className="text-text-secondary">-</span>}</td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                    <span className="font-medium text-text-primary">{contract.Customer?.Name}</span>
                    {contract.Customer?.PhoneNumber && <span className="text-text-secondary ml-1">• {contract.Customer.PhoneNumber}</span>}
                  </td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary">
                    {contract.Site ? <span>{contract.Site.SiteName}{contract.Site.ResponsiblePerson ? ` • ${contract.Site.ResponsiblePerson}` : ''}</span> : <span className="text-text-secondary">-</span>}
                  </td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">{formatDate(contract.StartDate)}</td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">{formatDate(contract.PlannedEndDate)}</td>
                  <td className="py-0.5 px-2 text-right align-middle border-r border-background-border/60 last:border-r-0 text-green-500 font-medium">{formatCurrency(contract.InitialTotalPrice)}</td>
                  <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${contract.IsCompleted ? 'bg-green-700 text-green-100' : 'bg-blue-900 text-blue-100'}`}>
                      {contract.IsCompleted ? 'Tamamlandı' : 'Aktif'}
                    </span>
                  </td>
                  <td className="py-0.5 px-2 align-middle text-text-secondary">
                    {contract.CreatedByUserFullName || contract.CreatedByUserName || '-'} • {formatShortDateTime(contract.CreatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex items-center justify-between shrink-0">
          <span>Toplam: {contracts.length} sözleşme</span>
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
          description="Yeni bir teklif oluşturun"
        />
      );
    }

    return (
      <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
        <div className="overflow-auto max-h-[calc(100vh-260px)] min-h-[280px]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 border-b border-background-border">
              <tr>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">ID</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Kod</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Müşteri</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Şantiye</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Başlangıç</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Bitiş</th>
                <th className="text-right py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Tutar</th>
                <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Durum</th>
                <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">Oluşturma</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote, index) => (
                <tr
                  key={quote.QuoteId}
                  className={`border-b border-background-border hover:bg-background-hover cursor-pointer ${index % 2 === 0 ? 'bg-background-panel' : 'bg-[#16162e]'}`}
                  onClick={() => handleOpenQuote(quote)}
                >
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">#{quote.QuoteId}</td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary">{quote.QuoteCode || <span className="text-text-secondary">-</span>}</td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 font-medium text-text-primary">{quote.CustomerName || quote.Customer?.Name}</td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary">{quote.Site ? quote.Site.SiteName : <span className="text-text-secondary">-</span>}</td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">{formatDate(quote.StartDate)}</td>
                  <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">{formatDate(quote.PlannedEndDate)}</td>
                  <td className="py-0.5 px-2 text-right align-middle border-r border-background-border/60 last:border-r-0 text-green-500 font-medium">{formatCurrency(quote.TotalPrice)}</td>
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
        <h1 className="text-xl font-semibold text-text-primary">Sözleşmeler ve Teklifler</h1>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="btn-secondary py-2 px-3 text-sm">Yenile</button>
          <button onClick={handleAddNew} className="btn-primary py-2 px-3 text-sm">{getAddButtonLabel()}</button>
        </div>
      </div>

      <div className="mb-3 border-b border-background-border flex gap-1">
        <button onClick={() => setActiveTab('active')} className={`px-4 py-2 text-sm font-medium transition-colors relative ${activeTab === 'active' ? 'text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
          Aktif Sözleşmeler
          {activeTab === 'active' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
        </button>
        <button onClick={() => setActiveTab('completed')} className={`px-4 py-2 text-sm font-medium transition-colors relative ${activeTab === 'completed' ? 'text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
          Kapalı Sözleşmeler
          {activeTab === 'completed' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
        </button>
        <button onClick={() => setActiveTab('quotes')} className={`px-4 py-2 text-sm font-medium transition-colors relative ${activeTab === 'quotes' ? 'text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
          Teklifler
          {activeTab === 'quotes' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
        </button>
      </div>

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
          contract={selectedContract}
          isNew={isNewContract}
          onClose={handleContractModalClose}
        />
      )}

      {/* Quote Modal */}
      {isQuoteModalOpen && (
        <QuoteDetailModal
          quote={selectedQuote}
          isNew={isNewQuote}
          onClose={handleQuoteModalClose}
        />
      )}
    </div>
  );
}

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
    switch (status) {
      case QuoteStatus.Pending:
        return <span className="badge bg-yellow-700 text-yellow-100">Beklemede</span>;
      case QuoteStatus.Accepted:
        return <span className="badge bg-green-700 text-green-100">Kabul Edildi</span>;
      case QuoteStatus.Rejected:
        return <span className="badge bg-red-700 text-red-100">Reddedildi</span>;
      default:
        return <span className="badge bg-gray-700 text-gray-100">{status}</span>;
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
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full table-compact">
            <thead>
              <tr className="border-b border-background-border">
                <th className="text-left p-4 font-semibold" style={{ width: '7%' }}>
                  ID
                </th>
                <th className="text-left p-4 font-semibold" style={{ width: '18%' }}>
                  Müşteri
                </th>
                <th className="text-left p-4 font-semibold" style={{ width: '16%' }}>
                  Şantiye
                </th>
                <th className="text-left p-4 font-semibold" style={{ width: '11%' }}>
                  Başlangıç
                </th>
                <th className="text-left p-4 font-semibold" style={{ width: '11%' }}>
                  Bitiş
                </th>
                <th className="text-right p-4 font-semibold" style={{ width: '12%' }}>
                  Tutar
                </th>
                <th className="text-center p-4 font-semibold" style={{ width: '11%' }}>
                  Durum
                </th>
                <th className="text-left p-4 font-semibold" style={{ width: '14%' }}>
                  Oluşturan / Son Güncelleyen
                </th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => (
                <tr
                  key={contract.ContractId}
                  className="border-b border-background-border hover:bg-background-hover cursor-pointer"
                  onClick={() => handleOpenContract(contract)}
                >
                  <td className="p-4">#{contract.ContractId}</td>
                  <td className="p-4">
                    <div className="font-medium">{contract.Customer?.Name}</div>
                    {contract.Customer?.PhoneNumber && (
                      <div className="text-sm text-text-secondary">
                        {contract.Customer.PhoneNumber}
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    {contract.Site ? (
                      <div>
                        <div className="font-medium">{contract.Site.SiteName}</div>
                        {contract.Site.ResponsiblePerson && (
                          <div className="text-sm text-text-secondary">
                            {contract.Site.ResponsiblePerson}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-text-secondary">-</span>
                    )}
                  </td>
                  <td className="p-4">{formatDate(contract.StartDate)}</td>
                  <td className="p-4">{formatDate(contract.PlannedEndDate)}</td>
                  <td className="p-4 text-right">
                    <span className="text-green-500 font-bold">
                      {formatCurrency(contract.InitialTotalPrice)}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <span
                      className={`badge ${
                        contract.IsCompleted
                          ? 'bg-green-700 text-green-100'
                          : 'bg-blue-900 text-blue-100'
                      }`}
                    >
                      {contract.IsCompleted ? 'Tamamlandı' : 'Aktif'}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-text-secondary">
                    <div>Oluşturan: {contract.CreatedByUserFullName || contract.CreatedByUserName || '-'}</div>
                    <div>{formatShortDateTime(contract.CreatedAt)}</div>
                    <div className="mt-1">Güncelleyen: {contract.LastModifiedByUserFullName || contract.LastModifiedByUserName || '-'}</div>
                    <div>{formatShortDateTime(contract.LastModifiedAt)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full table-compact">
            <thead>
              <tr className="border-b border-background-border">
                <th className="text-left p-4 font-semibold" style={{ width: '8%' }}>
                  ID
                </th>
                <th className="text-left p-4 font-semibold" style={{ width: '18%' }}>
                  Müşteri
                </th>
                <th className="text-left p-4 font-semibold" style={{ width: '15%' }}>
                  Şantiye
                </th>
                <th className="text-left p-4 font-semibold" style={{ width: '11%' }}>
                  Başlangıç
                </th>
                <th className="text-left p-4 font-semibold" style={{ width: '11%' }}>
                  Bitiş
                </th>
                <th className="text-right p-4 font-semibold" style={{ width: '13%' }}>
                  Tutar
                </th>
                <th className="text-center p-4 font-semibold" style={{ width: '12%' }}>
                  Durum
                </th>
                <th className="text-left p-4 font-semibold" style={{ width: '12%' }}>
                  Oluşturma
                </th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr
                  key={quote.QuoteId}
                  className="border-b border-background-border hover:bg-background-hover cursor-pointer"
                  onClick={() => handleOpenQuote(quote)}
                >
                  <td className="p-4">#{quote.QuoteId}</td>
                  <td className="p-4">
                    <div className="font-medium">{quote.CustomerName || quote.Customer?.Name}</div>
                  </td>
                  <td className="p-4">
                    {quote.Site ? (
                      <div className="font-medium">{quote.Site.SiteName}</div>
                    ) : (
                      <span className="text-text-secondary">-</span>
                    )}
                  </td>
                  <td className="p-4">{formatDate(quote.StartDate)}</td>
                  <td className="p-4">{formatDate(quote.PlannedEndDate)}</td>
                  <td className="p-4 text-right">
                    <span className="text-green-500 font-bold">
                      {formatCurrency(quote.TotalPrice)}
                    </span>
                  </td>
                  <td className="p-4 text-center">{getQuoteStatusBadge(quote.Status)}</td>
                  <td className="p-4 text-sm text-text-secondary">
                    {formatDate(quote.CreatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Sözleşmeler ve Teklifler</h1>
          <p className="text-text-secondary">Kiralama sözleşmelerini ve teklifleri yönetin</p>
        </div>
        <button onClick={handleAddNew} className="btn-primary">
          {getAddButtonLabel()}
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-background-border">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-6 py-3 font-medium transition-colors relative ${
              activeTab === 'active'
                ? 'text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Aktif Sözleşmeler
            {activeTab === 'active' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`px-6 py-3 font-medium transition-colors relative ${
              activeTab === 'completed'
                ? 'text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Kapalı Sözleşmeler
            {activeTab === 'completed' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('quotes')}
            className={`px-6 py-3 font-medium transition-colors relative ${
              activeTab === 'quotes'
                ? 'text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Teklifler
            {activeTab === 'quotes' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="mb-4">
        <button onClick={loadData} className="btn-secondary">
          Yenile
        </button>
      </div>

      {/* Content */}
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

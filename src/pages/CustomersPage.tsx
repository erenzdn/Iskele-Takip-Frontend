import { useState, useEffect } from 'react';
import { UsersIcon } from '@phosphor-icons/react';
import { customerService } from '../services/customerService';
import { Customer } from '../models';
import { formatShortDateTime } from '../utils/formatters';
import EmptyState from '../components/EmptyState';
import CustomerDetailModal from '../components/modals/CustomerDetailModal';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewCustomer, setIsNewCustomer] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const data = await customerService.getAllAsync();
      setCustomers(data);
    } catch (error) {
      console.error('Load customers error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchText.trim()) {
      loadCustomers();
      return;
    }

    try {
      setLoading(true);
      const data = await customerService.searchAsync(searchText);
      setCustomers(data);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setSelectedCustomer(null);
    setIsNewCustomer(true);
    setIsModalOpen(true);
  };

  const handleOpenDetail = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsNewCustomer(false);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedCustomer(null);
    loadCustomers();
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
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Müşteriler</h1>
        <div className="flex items-center gap-2">
          <button onClick={loadCustomers} className="btn-secondary py-2 px-3 text-sm">
            Yenile
          </button>
          <button onClick={handleAddNew} className="btn-primary py-2 px-3 text-sm">
            + Yeni Müşteri
          </button>
        </div>
      </div>

      <div className="mb-3 rounded border border-background-border bg-background-panel p-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-secondary whitespace-nowrap">Kriterler:</span>
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Müşteri adı, vergi no, e-posta, telefon..."
          className="input flex-1 min-w-[200px] py-2 px-3 text-sm"
        />
        <button onClick={handleSearch} className="btn-secondary py-2 px-3 text-sm">
          Ara
        </button>
      </div>

      {customers.length === 0 ? (
        <EmptyState
          icon={<UsersIcon size={48} weight="duotone" />}
          title="Henüz müşteri bulunmuyor"
          description="Yeni müşteri eklemek için yukarıdaki butonu kullanın"
        />
      ) : (
        <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
          {/* Sabit yükseklik: viewport - üst alan (~200px). Satır ~20px → 1080p'de ~40, 768p'de ~25 satır görünür */}
          <div className="overflow-auto max-h-[calc(100vh-200px)] min-h-[320px]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 border-b border-background-border">
                <tr>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    Müşteri Adı
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    Telefon
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    E-posta
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    Merkez Yetkili
                  </th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover" style={{ width: '6%' }}>
                    Sözleşme
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">
                    Kayıt Bilgisi
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer, index) => (
                  <tr
                    key={customer.CustomerId}
                    className={`border-b border-background-border cursor-pointer hover:bg-background-hover ${
                      index % 2 === 0 ? 'bg-background-panel' : 'bg-[#16162e]'
                    }`}
                    onClick={() => handleOpenDetail(customer)}
                  >
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                      <span className="font-medium text-text-primary">{customer.Name}</span>
                      {customer.TaxId && (
                        <span className="text-text-secondary ml-1">VN: {customer.TaxId}</span>
                      )}
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary">
                      {customer.PhoneNumber || '-'}
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary opacity-90">
                      {customer.Email || '-'}
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary">
                      {customer.CenterAuthorizedPerson ? (
                        <span>
                          {customer.CenterAuthorizedPerson}
                          {customer.CenterAuthorizedPhone ? ` • ${customer.CenterAuthorizedPhone}` : ''}
                        </span>
                      ) : (
                        <span className="text-text-secondary">-</span>
                      )}
                    </td>
                    <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0">
                      <span className="text-text-primary font-medium">{customer.Contracts?.length || 0}</span>
                    </td>
                    <td className="py-0.5 px-2 align-middle text-text-secondary">
                      {customer.CreatedByUserFullName || customer.CreatedByUserName || '-'} • {formatShortDateTime(customer.CreatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex items-center justify-between shrink-0">
            <span>Toplam: {customers.length} müşteri</span>
            <span className="text-text-secondary/80">Ekranda yaklaşık 25–40 satır görünür (pencere boyutuna göre)</span>
          </div>
        </div>
      )}

      {isModalOpen && (
        <CustomerDetailModal
          customer={selectedCustomer}
          isNew={isNewCustomer}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}


import { useState, useEffect } from 'react';
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Müşteriler</h1>
          <p className="text-text-secondary">Müşteri bilgilerini yönetin</p>
        </div>
        <button onClick={handleAddNew} className="btn-primary">
          + Yeni Müşteri
        </button>
      </div>

      <div className="mb-6 flex gap-4">
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Müşteri adı, vergi no, e-posta, telefon veya yetkili kişi ile ara..."
          className="input flex-1"
        />
        <button onClick={handleSearch} className="btn-secondary">
          Ara
        </button>
        <button onClick={loadCustomers} className="btn-secondary">
          Yenile
        </button>
      </div>

      {customers.length === 0 ? (
        <EmptyState
          icon="👥"
          title="Henüz müşteri bulunmuyor"
          description="Yeni müşteri eklemek için yukarıdaki butonu kullanın"
        />
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-background-border">
                  <th className="text-left p-4 font-semibold" style={{ width: '24%' }}>
                    Müşteri Adı
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '14%' }}>
                    Telefon
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '18%' }}>
                    E-posta
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '16%' }}>
                    Merkez Yetkili
                  </th>
                  <th className="text-center p-4 font-semibold" style={{ width: '10%' }}>
                    Sözleşme Sayısı
                  </th>
                  <th className="text-left p-4 font-semibold" style={{ width: '18%' }}>
                    Oluşturan / Son Güncelleyen
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr
                    key={customer.CustomerId}
                    className="border-b border-background-border hover:bg-background-hover cursor-pointer"
                    onClick={() => handleOpenDetail(customer)}
                  >
                    <td className="p-4">
                      <div className="font-medium">{customer.Name}</div>
                      {customer.TaxId && (
                        <div className="text-sm text-text-secondary">VN: {customer.TaxId}</div>
                      )}
                    </td>
                    <td className="p-4">{customer.PhoneNumber || '-'}</td>
                    <td className="p-4 opacity-80">{customer.Email || '-'}</td>
                    <td className="p-4">
                      {customer.CenterAuthorizedPerson ? (
                        <div>
                          <div className="font-medium text-sm">{customer.CenterAuthorizedPerson}</div>
                          {customer.CenterAuthorizedPhone && (
                            <div className="text-sm text-text-secondary">{customer.CenterAuthorizedPhone}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-text-secondary">-</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <span className="badge bg-blue-600 text-white">
                        {customer.Contracts?.length || 0}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-text-secondary">
                      <div>Oluşturan: {customer.CreatedByUserFullName || customer.CreatedByUserName || '-'}</div>
                      <div>{formatShortDateTime(customer.CreatedAt)}</div>
                      <div className="mt-1">Son güncelleyen: {customer.LastModifiedByUserFullName || customer.LastModifiedByUserName || '-'}</div>
                      <div>{formatShortDateTime(customer.LastModifiedAt)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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


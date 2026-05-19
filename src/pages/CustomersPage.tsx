import { useState, useEffect, useCallback, useRef, useMemo, type MouseEvent } from 'react';
import { UsersIcon } from '@phosphor-icons/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { customerService } from '../services/customerService';
import { Customer } from '../models';
import { formatShortDateTime } from '../utils/formatters';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import EmptyState from '../components/EmptyState';
import ExcelManager from '../components/ExcelManager';
import CustomerDetailModal from '../components/modals/CustomerDetailModal';
import { CUSTOMERS_EXCEL_HELP } from '../constants/customersExcel';
import { getPreferredCustomerContact } from '../utils/customerContacts';
import { getUserFacingErrorMessage } from '../utils/apiError';
import { toast } from '../hooks/useToast';
import { useAuthStore } from '../store/authStore';
import { useContextMenu, useContextMenuHandlers, type CustomerModalInitialTab, type CustomerRowTarget } from '../context-menu';
import { useHeaderActions } from '../layouts/HeaderActionsContext';

export default function CustomersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const permissions = user?.permissions ?? [];
  const canUpdate = permissions.includes('customers_update');
  const canDelete = permissions.includes('customers_delete');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebouncedValue(searchText, 300);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [hadFirstLoad, setHadFirstLoad] = useState(false);
  const hadFirstLoadRef = useRef(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [startInEditMode, setStartInEditMode] = useState(false);
  const [initialTab, setInitialTab] = useState<CustomerModalInitialTab>('info');
  const consumedOpenCustomerIdRef = useRef<number | null>(null);
  const fetchingOpenCustomerByIdRef = useRef<number | null>(null);
  const returnOnCloseRef = useRef<boolean>(false);
  const returnToRef = useRef<{ path: string; state?: any } | null>(null);
  const { openContextMenu } = useContextMenu();
  const { setActions } = useHeaderActions();

  const fetchCustomers = useCallback(async (forceRefresh = false) => {
    const q = debouncedSearch.trim() || undefined;
    try {
      if (!hadFirstLoadRef.current) setLoading(true);
      else setListLoading(true);
      const data = await customerService.getAllAsync(q, {
        forceRefresh,
        staleTimeMs: 120_000,
      });
      setCustomers(data);
    } catch (error) {
      console.error('Load customers error:', error);
    } finally {
      setLoading(false);
      setListLoading(false);
      if (!hadFirstLoadRef.current) {
        hadFirstLoadRef.current = true;
        setHadFirstLoad(true);
      }
    }
  }, [debouncedSearch]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  const loadCustomers = useCallback((forceRefresh = true) => {
    void fetchCustomers(forceRefresh);
  }, [fetchCustomers]);

  const handleAddNew = useCallback(() => {
    setSelectedCustomer(null);
    setIsNewCustomer(true);
    setStartInEditMode(true);
    setInitialTab('info');
    setIsModalOpen(true);
  }, []);

  const handleOpenDetail = useCallback((customer: Customer, options?: { startInEditMode?: boolean; initialTab?: CustomerModalInitialTab }) => {
    setSelectedCustomer(customer);
    setIsNewCustomer(false);
    setStartInEditMode(Boolean(options?.startInEditMode));
    setInitialTab(options?.initialTab ?? 'info');
    setIsModalOpen(true);
  }, []);

  useEffect(() => {
    const st = location.state as any;
    const openCustomerId = st?.openCustomerId;
    if (!openCustomerId) return;
    const idNum = Number(openCustomerId);
    if (!Number.isFinite(idNum) || idNum <= 0) return;
    if (consumedOpenCustomerIdRef.current === idNum) return;

    const found = customers.find((c) => c.CustomerId === idNum);
    if (found) {
      consumedOpenCustomerIdRef.current = idNum;
      returnOnCloseRef.current = Boolean(st?.returnOnClose);
      const rt = st?.returnTo;
      returnToRef.current = rt && typeof rt.path === 'string' ? rt : null;
      handleOpenDetail(found);
      navigate(location.pathname + location.search, { replace: true, state: null });
      return;
    }

    if (loading || !hadFirstLoadRef.current) return;
    if (fetchingOpenCustomerByIdRef.current === idNum) return;

    fetchingOpenCustomerByIdRef.current = idNum;
    void customerService
      .getByIdAsync(idNum)
      .then((c) => {
        fetchingOpenCustomerByIdRef.current = null;
        if (consumedOpenCustomerIdRef.current === idNum) return;
        consumedOpenCustomerIdRef.current = idNum;
        returnOnCloseRef.current = Boolean(st?.returnOnClose);
        const rt = st?.returnTo;
        returnToRef.current = rt && typeof rt.path === 'string' ? rt : null;
        handleOpenDetail(c);
        navigate(location.pathname + location.search, { replace: true, state: null });
      })
      .catch(() => {
        fetchingOpenCustomerByIdRef.current = null;
        consumedOpenCustomerIdRef.current = idNum;
        toast.warning('Müşteri bulunamadı.');
        navigate(location.pathname + location.search, { replace: true, state: null });
      });
  }, [customers, loading, location.pathname, location.search, location.state, navigate, handleOpenDetail]);

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedCustomer(null);
    setStartInEditMode(false);
    setInitialTab('info');
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
    loadCustomers(true);
  };

  const openCustomerContextMenu = (event: MouseEvent<HTMLTableRowElement>, customer: Customer) => {
    event.preventDefault();
    openContextMenu({
      menuKey: 'customerRow',
      x: event.clientX,
      y: event.clientY,
      target: {
        entityType: 'customer',
        entityId: customer.CustomerId,
        itemName: customer.Name,
        rawData: {
          CustomerId: customer.CustomerId,
          Name: customer.Name,
          PhoneNumber: customer.PhoneNumber,
          Email: customer.Email,
          ContractCount: customer.Contracts?.length ?? 0,
        },
      },
    });
  };

  useContextMenuHandlers(
    'customerRow',
    useMemo(
      () => ({
        'customer.detail': (target) => {
          const row = target as CustomerRowTarget;
          const customer = customers.find((entry) => entry.CustomerId === row.entityId);
          if (!customer) {
            toast.warning('Musteri kaydi bulunamadi.');
            return;
          }
          handleOpenDetail(customer, { initialTab: 'info' });
        },
        'customer.edit': (target) => {
          if (!canUpdate) return;
          const row = target as CustomerRowTarget;
          const customer = customers.find((entry) => entry.CustomerId === row.entityId);
          if (!customer) {
            toast.warning('Musteri kaydi bulunamadi.');
            return;
          }
          handleOpenDetail(customer, { startInEditMode: true, initialTab: 'info' });
        },
        'customer.sites': (target) => {
          if (!canUpdate) return;
          const row = target as CustomerRowTarget;
          const customer = customers.find((entry) => entry.CustomerId === row.entityId);
          if (!customer) {
            toast.warning('Musteri kaydi bulunamadi.');
            return;
          }
          handleOpenDetail(customer, { initialTab: 'sites' });
        },
        'customer.copyPhone': async (target) => {
          const row = target as CustomerRowTarget;
          if (!row.rawData.PhoneNumber) {
            toast.warning('Bu musteride telefon bilgisi yok.');
            return;
          }
          await navigator.clipboard.writeText(row.rawData.PhoneNumber);
          toast.success('Telefon numarasi kopyalandi.');
        },
        'customer.copyEmail': async (target) => {
          const row = target as CustomerRowTarget;
          if (!row.rawData.Email) {
            toast.warning('Bu musteride e-posta bilgisi yok.');
            return;
          }
          await navigator.clipboard.writeText(row.rawData.Email);
          toast.success('E-posta adresi kopyalandi.');
        },
        'customer.delete': async (target) => {
          if (!canDelete) return;
          const row = target as CustomerRowTarget;
          try {
            await customerService.deleteAsync(row.entityId);
            toast.success('Müşteri arşivlendi (listeden kaldırıldı).');
            loadCustomers(true);
          } catch (error) {
            toast.error(getUserFacingErrorMessage(error, 'Arşivleme sırasında hata oluştu.'));
          }
        },
      }),
      [canDelete, canUpdate, customers, loadCustomers, handleOpenDetail]
    )
  );

  const displayedCustomers = customers
    .slice()
    .sort((a, b) => (a.Name || '').localeCompare(b.Name || '', 'tr-TR'));

  const headerActions = useMemo(
    () => (
      <>
        <button onClick={() => loadCustomers(true)} className="btn-secondary py-2 px-3 text-sm">
          Yenile
        </button>
        <ExcelManager type="customers" onImportSuccess={() => void fetchCustomers(true)} />
        <button onClick={handleAddNew} className="btn-primary py-2 px-3 text-sm">
          + Yeni Müşteri
        </button>
      </>
    ),
    [fetchCustomers, handleAddNew, loadCustomers]
  );

  useEffect(() => {
    setActions(headerActions);
    return () => setActions(null);
  }, [headerActions, setActions]);

  if (loading && !hadFirstLoad) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-3 rounded border border-background-border bg-background-panel p-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-secondary whitespace-nowrap">Kriterler:</span>
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Müşteri adı veya vergi no (sunucu araması, 300ms gecikme)…"
          className="input flex-1 min-w-[200px] py-2 px-3 text-sm"
        />
      </div>

      {displayedCustomers.length === 0 ? (
        <EmptyState
          icon={<UsersIcon size={48} weight="duotone" />}
          title="Henüz müşteri bulunmuyor"
          description="Yeni müşteri eklemek için yukarıdaki butonu kullanın"
        />
      ) : (
        <div
          className={`border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col ${listLoading ? 'opacity-80' : ''}`}
        >
          {/* Sabit yükseklik: viewport - üst alan (~200px). Satır ~20px → 1080p'de ~40, 768p'de ~25 satır görünür */}
          <div className="overflow-auto max-h-[calc(100vh-200px)] min-h-[320px]">
            <table className="w-full text-xs border-collapse text-text-primary">
              <thead className="sticky top-0 z-10 border-b border-background-border">
                <tr>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover" style={{ width: '4%' }}>
                    ID
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    Müşteri Adı
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover" style={{ width: '10%' }}>
                    Telefon
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover" style={{ width: '8%' }}>
                    Vergi No
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover" style={{ width: '12%' }}>
                    E-posta
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">
                    Merkez Yetkili
                  </th>
                  <th className="text-center py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover" style={{ width: '6%' }}>
                    Sözleşme
                  </th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover" style={{ width: '15%' }}>
                    Kayıt Bilgisi
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedCustomers.map((customer, index) => {
                  const preferredContact = getPreferredCustomerContact(customer);
                  return (
                    <tr
                      key={customer.CustomerId}
                      className={`border-b border-background-border cursor-pointer hover:bg-background-hover ${
                        index % 2 === 0 ? 'bg-background-panel' : 'bg-background-surface'
                      }`}
                      onClick={() => handleOpenDetail(customer)}
                      onContextMenu={(event) => openCustomerContextMenu(event, customer)}
                    >
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-secondary">
                      #{customer.CustomerId}
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                      <span className="font-medium text-text-primary">{customer.Name}</span>
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary">
                      {customer.PhoneNumber || '-'}
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary opacity-90">
                      {customer.TaxId || '-'}
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary opacity-90 truncate max-w-[120px]" title={customer.Email || ''}>
                      {customer.Email || '-'}
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-primary">
                      {preferredContact?.Name ? (
                        <span>
                          {preferredContact.Name}
                          {preferredContact.Phone ? ` • ${preferredContact.Phone}` : ''}
                        </span>
                      ) : (
                        <span className="text-text-secondary">-</span>
                      )}
                    </td>
                    <td className="py-0.5 px-2 text-center align-middle border-r border-background-border/60 last:border-r-0">
                      <span className="text-text-primary font-medium">{customer.Contracts?.length || 0}</span>
                    </td>
                    <td className="py-0.5 px-2 align-middle text-text-secondary truncate max-w-[150px]" title={`${customer.CreatedByUserFullName || customer.CreatedByUserName || '-'} • ${formatShortDateTime(customer.CreatedAt)}`}>
                      {customer.CreatedByUserFullName || customer.CreatedByUserName || '-'} • {formatShortDateTime(customer.CreatedAt)}
                    </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex items-center justify-between shrink-0">
            <span className="flex items-center gap-2">
              Toplam: {displayedCustomers.length} müşteri
              {listLoading ? <span className="text-accent">Güncelleniyor…</span> : null}
            </span>
            <span className="text-text-secondary/80">Ekranda yaklaşık 25–40 satır görünür (pencere boyutuna göre)</span>
          </div>
        </div>
      )}

      <div className="mt-3 rounded border border-background-border bg-background-panel p-3 text-xs text-text-secondary space-y-1">
        <div className="font-medium text-text-primary">Müşteri Excel Bilgilendirmesi</div>
        <div>{CUSTOMERS_EXCEL_HELP.hint}</div>
        <div className="text-text-secondary">{CUSTOMERS_EXCEL_HELP.taxIdNote}</div>
        <div>Kontrol listesi: {CUSTOMERS_EXCEL_HELP.checklist}</div>
      </div>

      {isModalOpen && (
        <CustomerDetailModal
          customer={selectedCustomer}
          isNew={isNewCustomer}
          startInEditMode={startInEditMode}
          initialTab={initialTab}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}


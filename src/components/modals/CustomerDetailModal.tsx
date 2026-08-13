import { useState, useEffect, useCallback } from 'react';
import { HardHatIcon, MapPinIcon, UserIcon } from '@phosphor-icons/react';
import {
  AuditLog,
  AuthorizedContact,
  Customer,
  ConstructionSite,
  isCustomerArchived,
  pickCustomerDeletedAt,
} from '../../models';
import { customerService } from '../../services/customerService';
import { siteService } from '../../services/siteService';
import { getApiErrorMessage, getApiFieldErrors, getUserFacingErrorMessage } from '../../utils/apiError';
import { formatShortDateTime } from '../../utils/formatters';
import {
  firstValidationError,
  normalizeNumericText,
  normalizeText,
  validateEmail,
  validateName,
  validatePhone,
  validateRequired,
  validateTaxNumber,
} from '../../utils/validation';
import {
  normalizeAuthorizedContactsForPayload,
  validateAuthorizedContacts,
} from '../../utils/customerContacts';
import AuditLogTimeline from '../AuditLogTimeline';
import ConfirmModal from './ConfirmModal';
import { toast } from '../../hooks/useToast';
import type { CustomerModalInitialTab } from '../../context-menu';

interface CustomerDetailModalProps {
  customer: Customer | null;
  isNew: boolean;
  startInEditMode?: boolean;
  initialTab?: CustomerModalInitialTab;
  onClose: () => void;
  /** Kayıt başarılı olunca çağrılır (teklif ekranından yeni müşteri seçmek için). */
  onSaved?: (result: { customerId: number; isNew: boolean }) => void;
  overlayClassName?: string;
}

export default function CustomerDetailModal({
  customer,
  isNew,
  startInEditMode = false,
  initialTab = 'info',
  onClose,
  onSaved,
  overlayClassName = 'z-50',
}: CustomerDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'sites' | 'history'>(initialTab);
  const [isReadOnly, setIsReadOnly] = useState(!isNew && !startInEditMode);
  const [customerLogs, setCustomerLogs] = useState<AuditLog[]>([]);
  const [customerLogsLoading, setCustomerLogsLoading] = useState(false);
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [authorizedContacts, setAuthorizedContacts] = useState<AuthorizedContact[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isBusy, setIsBusy] = useState(false);
  const [totalContracts, setTotalContracts] = useState(0);
  const [activeContracts, setActiveContracts] = useState(0);

  // Telefon girişini sadece rakamla sınırla (max 11 hane: 0XXX XXX XX XX)
  const handlePhoneInput = (
    value: string,
    setter: (val: string) => void
  ) => {
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length <= 11) {
      setter(digitsOnly);
    }
  };

  // Vergi no: sadece rakam, max 11 hane (VKN 10 / TCKN 11)
  const handleTaxIdInput = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '').slice(0, 11);
    setTaxId(digitsOnly);
  };

  const normalizeContactFieldKey = (key: string): string => key.replace(/\[(\d+)\]/g, '.$1');

  const contactErrorFor = (index: number, field: 'Name' | 'Phone' | 'Email' | 'Title'): string | undefined => {
    const canonicalKey = `AuthorizedContacts.${index}.${field}`;
    const candidates = [
      canonicalKey,
      `authorizedContacts.${index}.${field}`,
      `AuthorizedContacts[${index}].${field}`,
      `authorizedContacts[${index}].${field}`,
      `authorizedcontacts.${index}.${field}`.toLowerCase(),
    ];
    for (const key of Object.keys(fieldErrors)) {
      const normalized = normalizeContactFieldKey(key);
      if (candidates.includes(normalized) || candidates.includes(normalized.toLowerCase())) {
        return fieldErrors[key];
      }
    }
    return undefined;
  };

  const topLevelErrorFor = (...fieldNames: string[]): string | undefined => {
    const lower = fieldNames.map((field) => field.toLowerCase());
    for (const [key, message] of Object.entries(fieldErrors)) {
      const normalized = key.toLowerCase();
      if (lower.some((field) => normalized === field || normalized.endsWith(`.${field}`))) {
        return message;
      }
    }
    return undefined;
  };

  const addAuthorizedContact = () => {
    if (isReadOnly) return;
    setAuthorizedContacts((prev) => [
      ...prev,
      {
        Name: '',
        Phone: '',
        Email: '',
        Title: '',
        IsPrimary: prev.length === 0,
        OrderNo: prev.length + 1,
      },
    ]);
  };

  const removeAuthorizedContact = (index: number) => {
    if (isReadOnly) return;
    setAuthorizedContacts((prev) => {
      const next = prev.filter((_, i) => i !== index);
      const hasPrimary = next.some((contact) => contact.IsPrimary);
      return next.map((contact, i) => ({
        ...contact,
        IsPrimary: hasPrimary ? Boolean(contact.IsPrimary) : i === 0,
        OrderNo: i + 1,
      }));
    });
  };

  const updateAuthorizedContact = (index: number, patch: Partial<AuthorizedContact>) => {
    setAuthorizedContacts((prev) =>
      prev.map((contact, i) => {
        if (i !== index) return contact;
        return { ...contact, ...patch };
      })
    );
  };

  const setPrimaryContact = (index: number) => {
    if (isReadOnly) return;
    setAuthorizedContacts((prev) =>
      prev.map((contact, i) => ({
        ...contact,
        IsPrimary: i === index,
      }))
    );
  };

  // Şantiye state'leri
  const [sites, setSites] = useState<ConstructionSite[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [editingSite, setEditingSite] = useState<ConstructionSite | null>(null);
  const [isNewSite, setIsNewSite] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [responsiblePhone, setResponsiblePhone] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteSiteConfirm, setShowDeleteSiteConfirm] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState<ConstructionSite | null>(null);

  const archived = Boolean(customer && !isNew && isCustomerArchived(customer));
  const archivedAtLabel = (() => {
    const raw = customer ? pickCustomerDeletedAt(customer) : undefined;
    if (!raw) return null;
    const formatted = formatShortDateTime(raw);
    return formatted && formatted !== '-' ? formatted : raw;
  })();

  const loadSites = useCallback(async (forceRefresh = false) => {
    if (!customer) return;
    try {
      setSitesLoading(true);
      const data = await siteService.getByCustomerAsync(customer.CustomerId, {
        forceRefresh,
        staleTimeMs: 120_000,
      });
      setSites(data);
    } catch (error) {
      console.error('Load sites error:', error);
    } finally {
      setSitesLoading(false);
    }
  }, [customer]);

  const loadCustomerLogs = useCallback(async () => {
    if (!customer) return;
    try {
      setCustomerLogsLoading(true);
      const data = await customerService.getAuditLogsByCustomerAsync(customer.CustomerId);
      setCustomerLogs(data ?? []);
    } catch (error) {
      console.error('Load customer audit logs error:', error);
      setCustomerLogs([]);
    } finally {
      setCustomerLogsLoading(false);
    }
  }, [customer]);

  useEffect(() => {
    if (customer) {
      setName(customer.Name);
      setTaxId(customer.TaxId || '');
      setTaxOffice(customer.TaxOffice || '');
      setPhoneNumber(customer.PhoneNumber || '');
      setEmail(customer.Email || '');
      setAddress(customer.Address || '');
      setAuthorizedContacts(
        (customer.AuthorizedContacts ?? [])
          .slice()
          .sort((a, b) => (a.OrderNo ?? Number.MAX_SAFE_INTEGER) - (b.OrderNo ?? Number.MAX_SAFE_INTEGER))
          .map((contact, index) => ({
            CustomerAuthorizedContactId: contact.CustomerAuthorizedContactId,
            Name: contact.Name ?? '',
            Phone: contact.Phone ?? '',
            Email: contact.Email ?? '',
            Title: contact.Title ?? '',
            IsPrimary: Boolean(contact.IsPrimary),
            OrderNo: contact.OrderNo ?? index + 1,
          }))
      );
      setFormError(null);
      setFieldErrors({});
      setTotalContracts(customer.Contracts?.length || 0);
      setActiveContracts(
        customer.Contracts?.filter((c) => !c.IsCompleted).length || 0
      );
      setSites(customer.Sites ?? []);
      setCustomerLogs([]);
      setActiveTab(initialTab);
    }
  }, [customer, initialTab]);

  useEffect(() => {
    if (!customer && isNew) {
      setName('');
      setTaxId('');
      setTaxOffice('');
      setPhoneNumber('');
      setEmail('');
      setAddress('');
      setAuthorizedContacts([]);
      setFormError(null);
      setFieldErrors({});
      setActiveTab(initialTab);
    }
  }, [customer, isNew, initialTab]);

  useEffect(() => {
    if (!isNew && customer && isCustomerArchived(customer)) {
      setIsReadOnly(true);
      return;
    }
    setIsReadOnly(!isNew && !startInEditMode);
  }, [isNew, startInEditMode, customer]);

  useEffect(() => {
    if (!customer || isNew) return;
    // Sekme başlığındaki sayacın doğru görünmesi için şantiyeleri önceden yükle.
    void loadSites();
  }, [customer?.CustomerId, isNew, loadSites]);

  useEffect(() => {
    if (!customer || isNew || activeTab !== 'sites') return;
    void loadSites();
  }, [customer?.CustomerId, isNew, activeTab, loadSites]);

  useEffect(() => {
    if (!customer || isNew || activeTab !== 'history') {
      setCustomerLogs([]);
      return;
    }
    void loadCustomerLogs();
  }, [customer?.CustomerId, isNew, activeTab, loadCustomerLogs]);

  const handleSave = async () => {
    const contactValidationError = validateAuthorizedContacts(authorizedContacts);
    if (contactValidationError) {
      setFormError(contactValidationError);
      return;
    }

    const validationError = firstValidationError([
      validateName(name, 'Müşteri Adı', true),
      validateRequired(taxOffice, 'Vergi dairesi'),
      validateTaxNumber(taxId, 'Vergi numarası'),
      validatePhone(phoneNumber, 'Telefon numarası'),
      validateEmail(email, 'E-posta adresi'),
    ]);
    if (validationError) {
      setFormError(validationError);
      toast.warning(validationError);
      return;
    }

    if (!isNew && customer && isCustomerArchived(customer)) {
      const msg = 'Arşivlenmiş müşteri düzenlenemez.';
      setFormError(msg);
      toast.warning(msg);
      return;
    }

    try {
      setIsBusy(true);
      setFormError(null);
      setFieldErrors({});
      const payload = {
        Name: normalizeText(name),
        TaxId: normalizeNumericText(taxId) || undefined,
        TaxOffice: normalizeText(taxOffice) || undefined,
        PhoneNumber: normalizeNumericText(phoneNumber) || undefined,
        Email: normalizeText(email) || undefined,
        Address: normalizeText(address) || undefined,
        AuthorizedContacts: normalizeAuthorizedContactsForPayload(authorizedContacts),
      };
      if (isNew) {
        const created = await customerService.createAsync(payload);
        onSaved?.({ customerId: created.CustomerId, isNew: true });
      } else if (customer) {
        await customerService.updateAsync(customer.CustomerId, payload);
        onSaved?.({ customerId: customer.CustomerId, isNew: false });
      }
      onClose();
    } catch (error: any) {
      console.error('Save customer error:', error);
      const apiFieldErrors = getApiFieldErrors(error);
      if (Object.keys(apiFieldErrors).length > 0) {
        setFieldErrors(apiFieldErrors);
      }
      if (error?.status === 400 || error?.status === 409) {
        const apiRaw = getApiErrorMessage(error);
        const lower = apiRaw.toLowerCase();
        let fallback =
          error?.status === 409
            ? 'Bu bilgilerle kayıtlı başka bir müşteri zaten mevcut.'
            : 'Form alanlarında doğrulama hataları var.';
        if (
          error?.status === 409 &&
          (lower.includes('silinmiş') ||
            lower.includes('silinmis') ||
            lower.includes('güncellenemez') ||
            lower.includes('guncellenemez') ||
            lower.includes('arşiv') ||
            lower.includes('arsiv'))
        ) {
          fallback = 'Arşivlenmiş müşteri düzenlenemez.';
        }
        const message = getUserFacingErrorMessage(error, fallback);
        setFormError(message);
        toast.error(message);
      } else {
        const message = getUserFacingErrorMessage(error, 'Kaydetme hatası');
        setFormError(message);
        toast.error(message);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteClick = () => {
    if (!customer) return;
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!customer) return;
    try {
      setIsBusy(true);
      await customerService.deleteAsync(customer.CustomerId);
      setShowDeleteConfirm(false);
      toast.success('Müşteri arşivlendi (listeden kaldırıldı).');
      onClose();
    } catch (error) {
      console.error('Delete customer error:', error);
      toast.error(getUserFacingErrorMessage(error, 'Arşivleme sırasında hata oluştu.'));
    } finally {
      setIsBusy(false);
    }
  };

  // Şantiye işlemleri
  const resetSiteForm = () => {
    setSiteName('');
    setSiteAddress('');
    setResponsiblePerson('');
    setResponsiblePhone('');
    setEditingSite(null);
    setIsNewSite(false);
  };

  const handleNewSite = () => {
    resetSiteForm();
    setIsNewSite(true);
  };

  const handleEditSite = (site: ConstructionSite) => {
    setEditingSite(site);
    setSiteName(site.SiteName);
    setSiteAddress(site.SiteAddress || '');
    setResponsiblePerson(site.ResponsiblePerson || '');
    setResponsiblePhone(site.ResponsiblePhone || '');
    setIsNewSite(false);
  };

  const handleSaveSite = async () => {
    if (!siteName.trim()) {
      toast.warning('Şantiye adı zorunludur');
      return;
    }

    if (!customer) return;

    if (isCustomerArchived(customer)) {
      toast.warning('Arşivlenmiş müşteride şantiye eklenemez veya değiştirilemez.');
      return;
    }

    try {
      setIsBusy(true);
      if (isNewSite) {
        await siteService.createAsync(customer.CustomerId, {
          SiteName: siteName,
          SiteAddress: siteAddress || undefined,
          ResponsiblePerson: responsiblePerson || undefined,
          ResponsiblePhone: responsiblePhone || undefined,
        });
      } else if (editingSite) {
        await siteService.updateAsync(editingSite.SiteId, {
          SiteName: siteName,
          SiteAddress: siteAddress || undefined,
          ResponsiblePerson: responsiblePerson || undefined,
          ResponsiblePhone: responsiblePhone || undefined,
        });
      }
      resetSiteForm();
      void loadSites(true);
    } catch (error) {
      console.error('Save site error:', error);
      toast.error('Şantiye kaydetme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteSiteClick = (site: ConstructionSite) => {
    setSiteToDelete(site);
    setShowDeleteSiteConfirm(true);
  };

  const handleDeleteSiteConfirm = async () => {
    if (!siteToDelete) return;
    try {
      setIsBusy(true);
      await siteService.deleteAsync(siteToDelete.SiteId);
      setShowDeleteSiteConfirm(false);
      setSiteToDelete(null);
      void loadSites(true);
    } catch (error) {
      console.error('Delete site error:', error);
      toast.error('Şantiye silme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className={`fixed inset-0 ${overlayClassName} bg-black/60 p-3`}>
      <div className="mx-auto flex h-[calc(100vh-1.5rem)] w-full max-w-[1600px] flex-col rounded-panel border border-background-border bg-background-panel p-4 shadow-2xl">
        <div className="mb-2 flex items-start justify-between rounded border border-background-border bg-background-surface px-3 py-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold">{isNew ? 'Yeni Müşteri' : 'Müşteri Detayı'}</h2>
              {archived && (
                <span className="rounded border border-amber-600/50 bg-amber-900/30 px-2 py-0.5 text-xs font-semibold text-amber-100">
                  Arşivlenmiş{archivedAtLabel ? ` • ${archivedAtLabel}` : ''}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-text-secondary">
              {isNew
                ? 'Yeni kayıt oluşturuyorsunuz.'
                : archived
                  ? 'Bu kayıt arşivlenmiştir; düzenleme ve arşivleme yapılamaz. Bilgiler salt okunurdur.'
                  : `${name || 'Müşteri'} bilgilerini görüntülüyor veya düzenliyorsunuz.`}
            </p>
          </div>
          {!isNew && customer && (
            <div className="rounded border border-background-border bg-background-hover px-2.5 py-1.5 text-xs text-text-secondary">
              <div>
                Müşteri No: <span className="font-semibold text-text-primary">#{customer.CustomerId}</span>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2 border-t border-background-border pt-1.5 text-[11px]">
                <div>
                  <div className="text-text-secondary/80">Toplam Sözleşme</div>
                  <div className="font-semibold text-text-primary">{totalContracts}</div>
                </div>
                <div>
                  <div className="text-text-secondary/80">Aktif Sözleşme</div>
                  <div className="font-semibold text-text-primary">{activeContracts}</div>
                </div>
                <div>
                  <div className="text-text-secondary/80">Müşteri ID</div>
                  <div className="font-semibold text-text-primary">#{customer.CustomerId}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tab Navigation - Sadece mevcut müşterilerde göster */}
        {!isNew && (
          <div className="mb-3 flex gap-2 rounded border border-background-border bg-background-surface p-1">
            <button
              onClick={() => setActiveTab('info')}
              className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'info'
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
              }`}
            >
              Bilgiler
            </button>
            <button
              onClick={() => setActiveTab('sites')}
              className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'sites'
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
              }`}
            >
              Şantiyeler ({sites.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'history'
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
              }`}
            >
              Geçmiş
            </button>
          </div>
        )}

        {/* Müşteri Bilgileri Tab */}
        {(activeTab === 'info' || isNew) && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="space-y-3 lg:col-span-5">
                <div>
                  <label className="mb-1 block text-sm font-medium">Müşteri Adı *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setFormError(null);
                  }}
                  disabled={isReadOnly}
                  placeholder="Müşteri veya firma adını girin"
                  className="input w-full"
                  required
                />
                {topLevelErrorFor('Name', 'name') && <p className="mt-1 text-xs text-red-400">{topLevelErrorFor('Name', 'name')}</p>}
              </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Vergi Numarası</label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => {
                      handleTaxIdInput(e.target.value);
                      setFormError(null);
                    }}
                    disabled={isReadOnly}
                    placeholder="Vergi numarası (opsiyonel)"
                    inputMode="numeric"
                    maxLength={11}
                    className="input w-full"
                  />
                  {topLevelErrorFor('TaxId', 'taxId') && <p className="mt-1 text-xs text-red-400">{topLevelErrorFor('TaxId', 'taxId')}</p>}
                </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Vergi Dairesi *</label>
                  <input
                    type="text"
                    value={taxOffice}
                    onChange={(e) => {
                      setTaxOffice(e.target.value);
                      setFormError(null);
                    }}
                    disabled={isReadOnly}
                    placeholder="Vergi dairesi"
                    className="input w-full"
                    required
                  />
                  {topLevelErrorFor('TaxOffice', 'taxOffice') && <p className="mt-1 text-xs text-red-400">{topLevelErrorFor('TaxOffice', 'taxOffice')}</p>}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Telefon Numarası</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => {
                    handlePhoneInput(e.target.value, setPhoneNumber);
                    setFormError(null);
                  }}
                  disabled={isReadOnly}
                  placeholder="05XX XXX XX XX"
                  maxLength={11}
                  className="input w-full"
                />
                {topLevelErrorFor('PhoneNumber', 'phoneNumber') && <p className="mt-1 text-xs text-red-400">{topLevelErrorFor('PhoneNumber', 'phoneNumber')}</p>}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">E-posta Adresi</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFormError(null);
                  }}
                  disabled={isReadOnly}
                  placeholder="ornek@email.com"
                  className="input w-full"
                />
                {topLevelErrorFor('Email', 'email') && <p className="mt-1 text-xs text-red-400">{topLevelErrorFor('Email', 'email')}</p>}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">Adres</label>
                <textarea
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setFormError(null);
                  }}
                  disabled={isReadOnly}
                  placeholder="Tam adres bilgisi"
                  className="input h-20 w-full resize-none"
                />
                {topLevelErrorFor('Address', 'address') && <p className="mt-1 text-xs text-red-400">{topLevelErrorFor('Address', 'address')}</p>}
                </div>
              </div>

              <div className="rounded border border-background-border bg-background-surface p-3 lg:col-span-7">
                <div className="mb-2 flex items-center justify-between border-b border-background-border pb-2">
                  <label className="block text-sm font-medium">Yetkililer</label>
                  {!isReadOnly && (
                    <button type="button" onClick={addAuthorizedContact} className="btn-secondary text-xs px-2 py-1">
                      + Yetkili Ekle
                    </button>
                  )}
                </div>
                {authorizedContacts.length === 0 ? (
                  <div className="text-xs text-text-secondary">Henüz yetkili eklenmedi.</div>
                ) : isReadOnly ? (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {authorizedContacts.map((contact, index) => (
                      <div key={`${contact.CustomerAuthorizedContactId ?? 'view'}-${index}`} className="rounded border border-background-border/70 p-2 text-sm">
                        <div className="font-medium text-text-primary flex items-center gap-2">
                          {contact.Name || '-'}
                          {contact.IsPrimary && <span className="text-[10px] rounded bg-accent/20 text-accent px-1.5 py-0.5">Birincil</span>}
                        </div>
                        <div className="text-xs text-text-secondary mt-1">
                          Tel: {contact.Phone || '-'} • E-posta: {contact.Email || '-'} • Unvan: {contact.Title || '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {authorizedContacts.map((contact, index) => (
                      <div key={`${contact.CustomerAuthorizedContactId ?? 'new'}-${index}`} className="rounded border border-background-border/70 p-2">
                        <div className="mb-1.5 flex items-center justify-between">
                          <div className="text-xs text-text-secondary">Yetkili #{index + 1}</div>
                          <div className="flex items-center gap-3">
                            <label className="inline-flex items-center gap-1 text-xs">
                              <input
                                type="radio"
                                name="primaryAuthorizedContact"
                                checked={Boolean(contact.IsPrimary)}
                                onChange={() => setPrimaryContact(index)}
                                disabled={isReadOnly}
                              />
                              Birincil
                            </label>
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() => removeAuthorizedContact(index)}
                                className="btn-danger text-xs px-2 py-1"
                              >
                                Sil
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium">Ad Soyad *</label>
                            <input
                              type="text"
                              value={contact.Name ?? ''}
                              onChange={(e) => {
                                updateAuthorizedContact(index, { Name: e.target.value });
                                setFormError(null);
                              }}
                              disabled={isReadOnly}
                              className="input w-full"
                              placeholder="Yetkili adı"
                            />
                            {contactErrorFor(index, 'Name') && <p className="mt-1 text-xs text-red-400">{contactErrorFor(index, 'Name')}</p>}
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium">Telefon</label>
                            <input
                              type="tel"
                              value={contact.Phone ?? ''}
                              onChange={(e) => {
                                const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                                updateAuthorizedContact(index, { Phone: digits });
                                setFormError(null);
                              }}
                              disabled={isReadOnly}
                              className="input w-full"
                              placeholder="05XX XXX XX XX"
                            />
                            {contactErrorFor(index, 'Phone') && <p className="mt-1 text-xs text-red-400">{contactErrorFor(index, 'Phone')}</p>}
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium">E-posta</label>
                            <input
                              type="email"
                              value={contact.Email ?? ''}
                              onChange={(e) => {
                                updateAuthorizedContact(index, { Email: e.target.value });
                                setFormError(null);
                              }}
                              disabled={isReadOnly}
                              className="input w-full"
                              placeholder="ornek@email.com"
                            />
                            {contactErrorFor(index, 'Email') && <p className="mt-1 text-xs text-red-400">{contactErrorFor(index, 'Email')}</p>}
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium">Unvan</label>
                            <input
                              type="text"
                              value={contact.Title ?? ''}
                              onChange={(e) => {
                                updateAuthorizedContact(index, { Title: e.target.value });
                                setFormError(null);
                              }}
                              disabled={isReadOnly}
                              className="input w-full"
                              placeholder="Satın alma sorumlusu vb."
                            />
                            {contactErrorFor(index, 'Title') && <p className="mt-1 text-xs text-red-400">{contactErrorFor(index, 'Title')}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {formError && (
                  <div className="text-xs text-red-400">{formError}</div>
                )}
              </div>
            </div>

            <div className="mt-3 flex gap-3 border-t border-background-border pt-3">
              {!isNew && isReadOnly && !archived && (
                <button onClick={() => setIsReadOnly(false)} className="btn-primary flex-1">
                  Düzenle
                </button>
              )}
              {!isReadOnly && (
                <>
                  {!isNew && customer && !archived && (
                    <button
                      onClick={handleDeleteClick}
                      disabled={isBusy}
                      className="btn-danger flex-1"
                    >
                      Arşivle
                    </button>
                  )}
                  <button onClick={onClose} className="btn-secondary flex-1">
                    İptal
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isBusy}
                    className="btn-primary flex-1"
                  >
                    {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
                  </button>
                </>
              )}
              {isReadOnly && !isNew && (
                <button onClick={onClose} className="btn-secondary flex-1">
                  Kapat
                </button>
              )}
            </div>
          </div>
        )}

        {/* Geçmiş Tab */}
        {activeTab === 'history' && !isNew && (
          <div className="rounded border border-background-border bg-background-surface p-3">
            <h3 className="mb-3 text-lg font-semibold">Aktivite Geçmişi</h3>
            <AuditLogTimeline logs={customerLogs} loading={customerLogsLoading} />
            <div className="mt-4 flex gap-3 border-t border-background-border pt-3">
              <button onClick={onClose} className="btn-secondary flex-1">
                Kapat
              </button>
            </div>
          </div>
        )}

        {/* Şantiyeler Tab */}
        {activeTab === 'sites' && !isNew && (
          <div className="rounded border border-background-border bg-background-surface p-3">
            {/* Şantiye Ekleme/Düzenleme Formu */}
            {(isNewSite || editingSite) && !archived && (
              <div className="mb-4 rounded border border-background-border bg-background-panel p-4">
                <h3 className="mb-4 text-lg font-semibold">
                  {isNewSite ? 'Yeni Şantiye' : 'Şantiye Düzenle'}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Şantiye Adı *</label>
                    <input
                      type="text"
                      value={siteName}
                      onChange={(e) => setSiteName(e.target.value)}
                      placeholder="Şantiye adı"
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Sorumlu Kişi</label>
                    <input
                      type="text"
                      value={responsiblePerson}
                      onChange={(e) => setResponsiblePerson(e.target.value)}
                      placeholder="Sorumlu kişi adı"
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Şantiye Adresi</label>
                    <input
                      type="text"
                      value={siteAddress}
                      onChange={(e) => setSiteAddress(e.target.value)}
                      placeholder="Şantiye adresi"
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Sorumlu Telefon</label>
                    <input
                      type="tel"
                      value={responsiblePhone}
                      onChange={(e) => handlePhoneInput(e.target.value, setResponsiblePhone)}
                      placeholder="05XX XXX XX XX"
                      maxLength={11}
                      className="input w-full"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={resetSiteForm} className="btn-secondary">
                    İptal
                  </button>
                  <button
                    onClick={handleSaveSite}
                    disabled={isBusy}
                    className="btn-primary"
                  >
                    {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
                  </button>
                </div>
              </div>
            )}

            {/* Şantiye Listesi Header */}
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Şantiyeler</h3>
              {!archived && !isNewSite && !editingSite && (
                <button onClick={handleNewSite} className="btn-primary text-sm">
                  + Yeni Şantiye
                </button>
              )}
            </div>

            {/* Şantiye Listesi */}
            {sitesLoading ? (
              <div className="text-center text-text-secondary py-8">Yükleniyor...</div>
            ) : sites.length === 0 ? (
              <div className="text-center py-8">
                <div className="mb-2 text-text-secondary [&_svg]:size-12"><HardHatIcon size={48} weight="duotone" /></div>
                <div className="text-text-secondary">Henüz şantiye eklenmemiş</div>
              </div>
            ) : (
              <div className="space-y-3">
                {sites.map((site) => (
                  <div
                    key={site.SiteId}
                    className="rounded border border-background-border bg-background-panel p-4 transition-colors hover:bg-background-hover"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-semibold text-lg">{site.SiteName}</div>
                        {site.SiteAddress && (
                          <div className="text-sm text-text-secondary mt-1 inline-flex items-center gap-1">
                            <MapPinIcon size={14} weight="regular" className="shrink-0" aria-hidden /> {site.SiteAddress}
                          </div>
                        )}
                        {site.ResponsiblePerson && (
                          <div className="text-sm text-text-secondary mt-1 inline-flex items-center gap-1">
                            <UserIcon size={14} weight="regular" className="shrink-0" aria-hidden /> {site.ResponsiblePerson}
                            {site.ResponsiblePhone && ` - ${site.ResponsiblePhone}`}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {!archived && (
                          <>
                            <button
                              onClick={() => handleEditSite(site)}
                              className="btn-secondary text-sm px-3 py-1"
                            >
                              Düzenle
                            </button>
                            <button
                              onClick={() => handleDeleteSiteClick(site)}
                              className="btn-danger text-sm px-3 py-1"
                            >
                              Sil
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex gap-3 border-t border-background-border pt-3">
              <button onClick={onClose} className="btn-secondary flex-1">
                Kapat
              </button>
            </div>
          </div>
        )}
      </div>
      <ConfirmModal
        open={showDeleteConfirm}
        title="Müşteriyi arşivlemek istiyor musunuz?"
        message="Bu müşteri listeden kaldırılır (arşivlenir). İsterseniz aynı vergi numarasıyla yeni aktif müşteri açabilirsiniz."
        variant="danger"
        loading={isBusy}
        confirmLabel="Arşivle"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />
      <ConfirmModal
        open={showDeleteSiteConfirm}
        title="Onaylıyor musunuz?"
        message={siteToDelete ? `"${siteToDelete.SiteName}" şantiyesini silmek istediğinizden emin misiniz?` : ''}
        variant="danger"
        loading={isBusy}
        onConfirm={handleDeleteSiteConfirm}
        onCancel={() => { setShowDeleteSiteConfirm(false); setSiteToDelete(null); }}
      />
    </div>
  );
}

import { useState, useEffect } from 'react';
import { AuditLog, Customer, ConstructionSite } from '../../models';
import { customerService } from '../../services/customerService';
import { siteService } from '../../services/siteService';
import AuditLogTimeline from '../AuditLogTimeline';
import ConfirmModal from './ConfirmModal';

interface CustomerDetailModalProps {
  customer: Customer | null;
  isNew: boolean;
  onClose: () => void;
}

export default function CustomerDetailModal({
  customer,
  isNew,
  onClose,
}: CustomerDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'sites' | 'history'>('info');
  const [isReadOnly, setIsReadOnly] = useState(!isNew);
  const [customerLogs, setCustomerLogs] = useState<AuditLog[]>([]);
  const [customerLogsLoading, setCustomerLogsLoading] = useState(false);
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [centerAuthorizedPerson, setCenterAuthorizedPerson] = useState('');
  const [centerAuthorizedPhone, setCenterAuthorizedPhone] = useState('');
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

  useEffect(() => {
    if (customer) {
      setName(customer.Name);
      setTaxId(customer.TaxId || '');
      setTaxOffice(customer.TaxOffice || '');
      setPhoneNumber(customer.PhoneNumber || '');
      setEmail(customer.Email || '');
      setAddress(customer.Address || '');
      setCenterAuthorizedPerson(customer.CenterAuthorizedPerson || '');
      setCenterAuthorizedPhone(customer.CenterAuthorizedPhone || '');
      setTotalContracts(customer.Contracts?.length || 0);
      setActiveContracts(
        customer.Contracts?.filter((c) => !c.IsCompleted).length || 0
      );
      loadSites();
    }
  }, [customer]);

  const loadSites = async () => {
    if (!customer) return;
    try {
      setSitesLoading(true);
      const data = await siteService.getByCustomerAsync(customer.CustomerId);
      setSites(data);
    } catch (error) {
      console.error('Load sites error:', error);
    } finally {
      setSitesLoading(false);
    }
  };

  const loadCustomerLogs = async () => {
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
  };

  useEffect(() => {
    if (customer && !isNew) {
      loadCustomerLogs();
    } else {
      setCustomerLogs([]);
    }
  }, [customer?.CustomerId, isNew]);

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Müşteri adı zorunludur');
      return;
    }
    if (!taxOffice.trim()) {
      alert('Vergi dairesi zorunludur');
      return;
    }

    try {
      setIsBusy(true);
      const payload = {
        Name: name,
        TaxId: taxId || undefined,
        TaxOffice: taxOffice || undefined,
        PhoneNumber: phoneNumber || undefined,
        Email: email || undefined,
        Address: address || undefined,
        CenterAuthorizedPerson: centerAuthorizedPerson || undefined,
        CenterAuthorizedPhone: centerAuthorizedPhone || undefined,
      };
      if (isNew) {
        await customerService.createAsync(payload);
      } else if (customer) {
        await customerService.updateAsync(customer.CustomerId, payload);
      }
      onClose();
    } catch (error: any) {
      console.error('Save customer error:', error);
      if (error?.status === 409) {
        alert('Bu bilgilerle kayıtlı başka bir müşteri zaten mevcut. Lütfen benzersiz değerler girin (Ad, Vergi No, Telefon veya Merkez Yetkili Telefon).');
      } else {
        alert('Kaydetme hatası');
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
      onClose();
    } catch (error) {
      console.error('Delete customer error:', error);
      alert('Silme hatası');
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
      alert('Şantiye adı zorunludur');
      return;
    }

    if (!customer) return;

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
      loadSites();
    } catch (error) {
      console.error('Save site error:', error);
      alert('Şantiye kaydetme hatası');
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
      loadSites();
    } catch (error) {
      console.error('Delete site error:', error);
      alert('Şantiye silme hatası');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-background-panel rounded-panel w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">
          {isNew ? 'Yeni Müşteri' : 'Müşteri Detayı'}
        </h2>

        {/* Tab Navigation - Sadece mevcut müşterilerde göster */}
        {!isNew && (
          <div className="flex gap-2 mb-6 border-b border-background-border">
            <button
              onClick={() => setActiveTab('info')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'info'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Bilgiler
            </button>
            <button
              onClick={() => setActiveTab('sites')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'sites'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Şantiyeler ({sites.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'history'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Geçmiş
            </button>
          </div>
        )}

        {/* Müşteri Bilgileri Tab */}
        {(activeTab === 'info' || isNew) && (
          <>
            {isReadOnly && !isNew && (
              <div className="mb-6 card bg-blue-900 p-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-text-secondary mb-1">Toplam Sözleşme</div>
                    <div className="text-xl font-bold">{totalContracts}</div>
                  </div>
                  <div>
                    <div className="text-text-secondary mb-1">Aktif Sözleşme</div>
                    <div className="text-xl font-bold">{activeContracts}</div>
                  </div>
                  <div>
                    <div className="text-text-secondary mb-1">Müşteri ID</div>
                    <div className="text-xl font-bold">#{customer?.CustomerId}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Müşteri Adı *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Müşteri veya firma adını girin"
                  className="input w-full"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Vergi Numarası</label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    disabled={isReadOnly}
                    placeholder="Vergi numarası (opsiyonel)"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Vergi Dairesi *</label>
                  <input
                    type="text"
                    value={taxOffice}
                    onChange={(e) => setTaxOffice(e.target.value)}
                    disabled={isReadOnly}
                    placeholder="Vergi dairesi"
                    className="input w-full"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Telefon Numarası</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => handlePhoneInput(e.target.value, setPhoneNumber)}
                  disabled={isReadOnly}
                  placeholder="05XX XXX XX XX"
                  maxLength={11}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">E-posta Adresi</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="ornek@email.com"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Adres</label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Tam adres bilgisi"
                  className="input w-full h-24 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Merkez Yetkili Kişi</label>
                  <input
                    type="text"
                    value={centerAuthorizedPerson}
                    onChange={(e) => setCenterAuthorizedPerson(e.target.value)}
                    disabled={isReadOnly}
                    placeholder="Merkez yetkili kişi adı"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Merkez Yetkili Telefon</label>
                  <input
                    type="tel"
                    value={centerAuthorizedPhone}
                    onChange={(e) => handlePhoneInput(e.target.value, setCenterAuthorizedPhone)}
                    disabled={isReadOnly}
                    placeholder="05XX XXX XX XX"
                    maxLength={11}
                    className="input w-full"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              {!isNew && isReadOnly && (
                <button onClick={() => setIsReadOnly(false)} className="btn-primary flex-1">
                  Düzenle
                </button>
              )}
              {!isReadOnly && (
                <>
                  {!isNew && customer && (
                    <button
                      onClick={handleDeleteClick}
                      disabled={isBusy}
                      className="btn-danger flex-1"
                    >
                      Sil
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
          </>
        )}

        {/* Geçmiş Tab */}
        {activeTab === 'history' && !isNew && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Aktivite Geçmişi</h3>
            <AuditLogTimeline logs={customerLogs} loading={customerLogsLoading} />
            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="btn-secondary flex-1">
                Kapat
              </button>
            </div>
          </div>
        )}

        {/* Şantiyeler Tab */}
        {activeTab === 'sites' && !isNew && (
          <div>
            {/* Şantiye Ekleme/Düzenleme Formu */}
            {(isNewSite || editingSite) && (
              <div className="card bg-background-secondary p-4 mb-4">
                <h3 className="text-lg font-semibold mb-4">
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
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Şantiyeler</h3>
              {!isNewSite && !editingSite && (
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
                <div className="text-4xl mb-2">🏗️</div>
                <div className="text-text-secondary">Henüz şantiye eklenmemiş</div>
              </div>
            ) : (
              <div className="space-y-3">
                {sites.map((site) => (
                  <div
                    key={site.SiteId}
                    className="card p-4 hover:bg-background-hover transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-semibold text-lg">{site.SiteName}</div>
                        {site.SiteAddress && (
                          <div className="text-sm text-text-secondary mt-1">
                            📍 {site.SiteAddress}
                          </div>
                        )}
                        {site.ResponsiblePerson && (
                          <div className="text-sm text-text-secondary mt-1">
                            👤 {site.ResponsiblePerson}
                            {site.ResponsiblePhone && ` - ${site.ResponsiblePhone}`}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
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
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="btn-secondary flex-1">
                Kapat
              </button>
            </div>
          </div>
        )}
      </div>
      <ConfirmModal
        open={showDeleteConfirm}
        title="Onaylıyor musunuz?"
        message="Bu müşteriyi silmek istediğinizden emin misiniz?"
        variant="danger"
        loading={isBusy}
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

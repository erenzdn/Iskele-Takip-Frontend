import { useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '@phosphor-icons/react';
import { ConstructionSite } from '../../models';
import { siteService } from '../../services/siteService';
import { getApiErrorMessage } from '../../utils/apiError';
import { firstValidationError, normalizeText, validatePhone, validateRequired } from '../../utils/validation';
import { toast } from '../../hooks/useToast';

interface SiteCreateModalProps {
  customerId: number;
  customerName?: string;
  onClose: () => void;
  onCreated: (site: ConstructionSite) => void;
}

export default function SiteCreateModal({
  customerId,
  customerName,
  onClose,
  onCreated,
}: SiteCreateModalProps) {
  const [siteName, setSiteName] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [responsiblePhone, setResponsiblePhone] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const handleSave = async () => {
    const validationError = firstValidationError([
      validateRequired(siteName, 'Şantiye adı'),
      ...(responsiblePhone.trim() ? [validatePhone(responsiblePhone, 'Sorumlu telefon')] : []),
    ]);
    if (validationError) {
      toast.warning(validationError);
      return;
    }

    try {
      setIsBusy(true);
      const created = await siteService.createAsync(customerId, {
        SiteName: normalizeText(siteName),
        SiteAddress: normalizeText(siteAddress) || undefined,
        ResponsiblePerson: normalizeText(responsiblePerson) || undefined,
        ResponsiblePhone: responsiblePhone.replace(/\D/g, '') || undefined,
      });
      toast.success('Şantiye oluşturuldu.');
      onCreated(created);
      onClose();
    } catch (error) {
      console.error('Create site error:', error);
      toast.error(getApiErrorMessage(error) || 'Şantiye kaydedilemedi.');
    } finally {
      setIsBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-background-main overflow-hidden">
      <header className="shrink-0 flex items-center justify-between px-3 py-2 bg-background-panel border-b border-background-border">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-text-primary tracking-tight">Yeni Şantiye</h1>
          <p className="text-[11px] text-text-secondary truncate">
            {customerName ? `${customerName} için yeni şantiye kaydı` : 'Yeni şantiye kaydı'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
          aria-label="Kapat"
        >
          <XIcon size={20} weight="regular" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        <div className="mx-auto w-full max-w-3xl rounded-lg border border-background-border bg-background-panel p-4 space-y-3">
          <p className="text-sm text-text-secondary">
            Şantiye kaydedildikten sonra teklif ekranında otomatik seçilir.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-text-secondary mb-0.5">Şantiye Adı *</label>
              <input
                type="text"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="Şantiye adı"
                className="input w-full text-sm py-1.5"
                autoFocus
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-text-secondary mb-0.5">Adres</label>
              <input
                type="text"
                value={siteAddress}
                onChange={(e) => setSiteAddress(e.target.value)}
                placeholder="Şantiye adresi"
                className="input w-full text-sm py-1.5"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-0.5">Sorumlu Kişi</label>
              <input
                type="text"
                value={responsiblePerson}
                onChange={(e) => setResponsiblePerson(e.target.value)}
                placeholder="Sorumlu kişi adı"
                className="input w-full text-sm py-1.5"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-0.5">Sorumlu Telefon</label>
              <input
                type="tel"
                value={responsiblePhone}
                onChange={(e) => setResponsiblePhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                placeholder="05XXXXXXXXX"
                maxLength={11}
                className="input w-full text-sm py-1.5"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-end gap-2 px-3 py-2 border-t border-background-border bg-background-panel">
        <button type="button" onClick={onClose} disabled={isBusy} className="btn-secondary !py-1.5 !px-3 text-xs">
          İptal
        </button>
        <button type="button" onClick={handleSave} disabled={isBusy} className="btn-primary !py-1.5 !px-3 text-xs">
          {isBusy ? 'Kaydediliyor...' : 'Şantiyeyi Kaydet'}
        </button>
      </div>
    </div>,
    document.body
  );
}

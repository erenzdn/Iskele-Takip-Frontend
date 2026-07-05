import { ConstructionSite } from '../models';
import { NEW_SITE_SELECT_VALUE, NewSiteFormState } from '../utils/siteSelection';

interface SiteSelectFieldProps {
  sites: ConstructionSite[];
  sitesLoading: boolean;
  selectedSiteId: number | '';
  isNewSiteMode: boolean;
  newSiteForm: NewSiteFormState;
  onSelectSite: (value: number | '' | typeof NEW_SITE_SELECT_VALUE) => void;
  onNewSiteFormChange: (field: keyof NewSiteFormState, value: string) => void;
  onCancelNewSite: () => void;
  required?: boolean;
  disabled?: boolean;
  label?: string;
}

export default function SiteSelectField({
  sites,
  sitesLoading,
  selectedSiteId,
  isNewSiteMode,
  newSiteForm,
  onSelectSite,
  onNewSiteFormChange,
  onCancelNewSite,
  required = false,
  disabled = false,
  label = 'Şantiye Seçimi',
}: SiteSelectFieldProps) {
  const selectValue = isNewSiteMode ? NEW_SITE_SELECT_VALUE : selectedSiteId;
  const requiredLabel = required ? ' *' : ' (Opsiyonel)';

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-text-primary">
        {label}
        {requiredLabel}
      </label>

      {sitesLoading ? (
        <div className="input w-full text-text-secondary text-sm py-2">Yükleniyor...</div>
      ) : (
        <select
          value={selectValue}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === NEW_SITE_SELECT_VALUE) {
              onSelectSite(NEW_SITE_SELECT_VALUE);
              return;
            }
            onSelectSite(raw ? Number(raw) : '');
          }}
          disabled={disabled || isNewSiteMode}
          className="input w-full text-sm py-1.5"
          required={required && !isNewSiteMode}
        >
          <option value="">Şantiye seçin</option>
          {sites.map((site) => (
            <option key={site.SiteId} value={site.SiteId}>
              {site.SiteName}
              {site.SiteAddress && ` - ${site.SiteAddress}`}
              {site.ResponsiblePerson && ` (${site.ResponsiblePerson})`}
            </option>
          ))}
          {!disabled && <option value={NEW_SITE_SELECT_VALUE}>+ Yeni şantiye ekle</option>}
        </select>
      )}

      {isNewSiteMode && !disabled && (
        <div className="rounded border border-background-border bg-background-panel p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-text-primary">Yeni Şantiye</span>
            <button type="button" onClick={onCancelNewSite} className="btn-secondary text-xs py-1 px-2">
              Mevcut şantiye seç
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Şantiye Adı *</label>
              <input
                type="text"
                value={newSiteForm.SiteName}
                onChange={(e) => onNewSiteFormChange('SiteName', e.target.value)}
                placeholder="Şantiye adı"
                className="input w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Adres</label>
              <input
                type="text"
                value={newSiteForm.SiteAddress}
                onChange={(e) => onNewSiteFormChange('SiteAddress', e.target.value)}
                placeholder="Şantiye adresi"
                className="input w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Sorumlu Kişi</label>
              <input
                type="text"
                value={newSiteForm.ResponsiblePerson}
                onChange={(e) => onNewSiteFormChange('ResponsiblePerson', e.target.value)}
                placeholder="Sorumlu kişi adı"
                className="input w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Sorumlu Telefon</label>
              <input
                type="text"
                value={newSiteForm.ResponsiblePhone}
                onChange={(e) => onNewSiteFormChange('ResponsiblePhone', e.target.value)}
                placeholder="Telefon"
                className="input w-full text-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

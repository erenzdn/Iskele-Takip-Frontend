import { ConstructionSite } from '../models';
import { CreateSiteRequest } from '../services/siteService';
import { siteService } from '../services/siteService';

export const NEW_SITE_SELECT_VALUE = '__new_site__';

export interface NewSiteFormState {
  SiteName: string;
  SiteAddress: string;
  ResponsiblePerson: string;
  ResponsiblePhone: string;
}

export const EMPTY_NEW_SITE_FORM: NewSiteFormState = {
  SiteName: '',
  SiteAddress: '',
  ResponsiblePerson: '',
  ResponsiblePhone: '',
};

export function buildNewSitePayload(form: NewSiteFormState): CreateSiteRequest {
  const payload: CreateSiteRequest = {
    SiteName: form.SiteName.trim(),
  };
  const address = form.SiteAddress.trim();
  const person = form.ResponsiblePerson.trim();
  const phone = form.ResponsiblePhone.trim();
  if (address) payload.SiteAddress = address;
  if (person) payload.ResponsiblePerson = person;
  if (phone) payload.ResponsiblePhone = phone;
  return payload;
}

export function buildSiteRequestFields(
  isNewSiteMode: boolean,
  newSiteForm: NewSiteFormState,
  selectedSiteId: number | ''
): { SiteId?: number; newSite?: CreateSiteRequest } {
  if (isNewSiteMode) {
    return { newSite: buildNewSitePayload(newSiteForm) };
  }
  if (selectedSiteId) {
    return { SiteId: Number(selectedSiteId) };
  }
  return {};
}

export function validateSiteSelection(params: {
  sites: ConstructionSite[];
  isNewSiteMode: boolean;
  selectedSiteId: number | '';
  newSiteName: string;
  siteRequired: boolean;
}): string | null {
  const { sites, isNewSiteMode, selectedSiteId, newSiteName, siteRequired } = params;
  if (isNewSiteMode) {
    if (!newSiteName.trim()) {
      return 'Yeni şantiye için SiteName zorunludur.';
    }
    return null;
  }
  if (siteRequired && sites.length > 0 && !selectedSiteId) {
    return 'Bu müşterinin şantiyeleri bulunuyor. Lütfen bir şantiye seçin veya newSite ile yeni şantiye ekleyin.';
  }
  return null;
}

export function isSaveBlockedByNewSite(isNewSiteMode: boolean, newSiteName: string): boolean {
  return isNewSiteMode && !newSiteName.trim();
}

export function isSiteRelatedApiMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    message.includes('SiteId ve newSite aynı anda gönderilemez') ||
    message.includes('Yeni şantiye için SiteName zorunludur') ||
    message.includes('Lütfen bir şantiye seçin veya newSite ile yeni şantiye ekleyin') ||
    message.includes('Seçilen şantiye bu müşteriye ait değil') ||
    m.includes('siteid') ||
    m.includes('newsite') ||
    m.includes('şantiye')
  );
}

export async function applyCreatedSiteId(params: {
  customerId: number;
  createdSiteId: number;
  setSites: (sites: ConstructionSite[]) => void;
  setSelectedSiteId: (id: number | '') => void;
  resetNewSiteMode: () => void;
}): Promise<void> {
  const { customerId, createdSiteId, setSites, setSelectedSiteId, resetNewSiteMode } = params;
  try {
    const refreshed = await siteService.getByCustomerAsync(customerId, { forceRefresh: true });
    setSites(refreshed);
    setSelectedSiteId(createdSiteId);
    resetNewSiteMode();
  } catch {
    setSelectedSiteId(createdSiteId);
    resetNewSiteMode();
  }
}

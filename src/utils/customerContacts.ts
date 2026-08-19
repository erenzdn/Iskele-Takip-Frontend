import { AuthorizedContact, Customer } from '../models';
import { isMobilePhone, normalizeNumericText, normalizeText, validateRequired } from './validation';

export function getPreferredCustomerContact(customer: Customer): AuthorizedContact | null {
  const contacts = customer.AuthorizedContacts ?? [];
  if (contacts.length === 0) return null;
  return contacts.find((contact) => contact.IsPrimary) ?? contacts[0];
}

export function normalizeAuthorizedContactsForPayload(
  contacts: AuthorizedContact[]
): AuthorizedContact[] {
  return contacts.map((contact, index) => ({
    CustomerAuthorizedContactId: contact.CustomerAuthorizedContactId || undefined,
    Name: normalizeText(contact.Name ?? ''),
    Phone: normalizeNumericText(contact.Phone ?? '') || null,
    Email: normalizeText(contact.Email ?? '') || null,
    Title: normalizeText(contact.Title ?? '') || null,
    IsPrimary: contact.IsPrimary === true,
    OrderNo: index + 1,
  }));
}

export function validateAuthorizedContacts(contacts: AuthorizedContact[]): string | null {
  const nameMissingIndex = contacts.findIndex(
    (contact) => !validateRequired(contact.Name ?? '', 'Yetkili adı').valid
  );
  if (nameMissingIndex >= 0) {
    return `Yetkili ${nameMissingIndex + 1}: Yetkili adı zorunludur.`;
  }

  // Yalnızca cep telefonları unique kısıtına tabidir; sabit hatlar birden fazla yetkilide kullanılabilir.
  const mobilePhones = contacts
    .map((contact) => contact.Phone ?? '')
    .filter((phone) => Boolean(phone) && isMobilePhone(phone))
    .map((phone) => normalizeNumericText(phone));
  const hasDuplicateMobile = mobilePhones.some(
    (phone, index) => mobilePhones.indexOf(phone) !== index
  );
  if (hasDuplicateMobile) {
    return 'Aynı müşteri içinde yetkili cep telefonu numaraları tekrar edemez.';
  }

  const primaryCount = contacts.filter((contact) => contact.IsPrimary).length;
  if (primaryCount > 1) {
    return 'Bir müşteri için en fazla bir birincil yetkili seçilebilir.';
  }

  return null;
}

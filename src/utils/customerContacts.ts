import { AuthorizedContact, Customer } from '../models';
import { normalizeNumericText, normalizeText, validateRequired } from './validation';

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

  const normalizedPhones = contacts
    .map((contact) => normalizeNumericText(contact.Phone ?? ''))
    .filter((phone) => Boolean(phone));
  const hasDuplicatePhone = normalizedPhones.some(
    (phone, index) => normalizedPhones.indexOf(phone) !== index
  );
  if (hasDuplicatePhone) {
    return 'Aynı müşteri içinde yetkili telefon numaraları tekrar edemez.';
  }

  const primaryCount = contacts.filter((contact) => contact.IsPrimary).length;
  if (primaryCount > 1) {
    return 'Bir müşteri için en fazla bir birincil yetkili seçilebilir.';
  }

  return null;
}

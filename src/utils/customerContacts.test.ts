import { describe, expect, it } from 'vitest';
import type { AuthorizedContact, Customer } from '../models';
import {
  getPreferredCustomerContact,
  normalizeAuthorizedContactsForPayload,
  validateAuthorizedContacts,
} from './customerContacts';
import { CUSTOMERS_EXCEL_HELP } from '../constants/customersExcel';

describe('customerContacts', () => {
  it('customer create validation: 0/1/N yetkili kabul eder', () => {
    expect(validateAuthorizedContacts([])).toBeNull();
    expect(validateAuthorizedContacts([{ Name: 'Ali', IsPrimary: true }])).toBeNull();
    expect(
      validateAuthorizedContacts([
        { Name: 'Ali', IsPrimary: true },
        { Name: 'Veli', IsPrimary: false },
      ])
    ).toBeNull();
  });

  it('customer update için payload listesi replace sırası ile normalize edilir', () => {
    const payload = normalizeAuthorizedContactsForPayload([
      { CustomerAuthorizedContactId: 2, Name: '  Ali  ', Phone: '0555 111 22 33', IsPrimary: true },
      { Name: 'Veli', Phone: '05554443322', IsPrimary: false },
    ]);
    expect(payload).toHaveLength(2);
    expect(payload[0].OrderNo).toBe(1);
    expect(payload[1].OrderNo).toBe(2);
    expect(payload[0].Phone).toBe('05551112233');
  });

  it('aynı müşteri içinde duplicate phone engellenir', () => {
    const error = validateAuthorizedContacts([
      { Name: 'Ali', Phone: '0555 111 22 33' },
      { Name: 'Veli', Phone: '05551112233' },
    ]);
    expect(error).toContain('telefon numaraları tekrar edemez');
  });

  it('bir müşteri için multiple primary engellenir', () => {
    const error = validateAuthorizedContacts([
      { Name: 'Ali', IsPrimary: true },
      { Name: 'Veli', IsPrimary: true },
    ]);
    expect(error).toContain('en fazla bir birincil');
  });

  it('list/detail gösterimi için primary fallback ilk eleman döner', () => {
    const customer: Customer = {
      CustomerId: 1,
      Name: 'Test',
      AuthorizedContacts: [
        { Name: 'Veli', IsPrimary: false },
        { Name: 'Ayse', IsPrimary: true, Phone: '0532' },
      ] as AuthorizedContact[],
    };
    expect(getPreferredCustomerContact(customer)?.Name).toBe('Ayse');

    const noPrimaryCustomer: Customer = {
      CustomerId: 2,
      Name: 'Test 2',
      AuthorizedContacts: [{ Name: 'Ilk Kisi' }],
    };
    expect(getPreferredCustomerContact(noPrimaryCustomer)?.Name).toBe('Ilk Kisi');
  });

  it('excel bilgilendirme metni 2 sayfa formatını içerir', () => {
    expect(CUSTOMERS_EXCEL_HELP.hint).toContain('Customers + CustomerContacts');
    expect(CUSTOMERS_EXCEL_HELP.checklist).toContain('Birincil Mi = Evet');
  });
});

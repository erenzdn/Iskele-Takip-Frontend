/**
 * Client-side Excel validasyonu — Müşteri içe aktarma
 *
 * Backend'e istek atmadan önce tüm satırları tarar ve sorunları toplu olarak raporlar.
 * Bu sayede kullanıcı önizleme ekranında tüm hataları bir arada görür.
 *
 * Kapsanan kurallar:
 *  - Customers sayfası: Müşteri Ünvanı (zorunlu), Vergi Numarası (zorunlu, 10-11 rakam),
 *    Vergi Dairesi (max 100), Adres (max 300), Telefon (opsiyonel ama format), E-posta (format),
 *    PhoneNumber max 20 karakter (DB kısıtlaması)
 *  - CustomerContacts sayfası: Müşteri Vergi Numarası (zorunlu), Yetkili Adı (zorunlu),
 *    Unvan/Title (max 20 — DB kısıtlaması), Telefon (format), E-posta (format)
 *  - Whitespace-only değerler boş kabul edilir
 *  - Baştaki/sondaki boşluklar trim edilir
 */

import * as XLSX from 'xlsx';
import type { ExcelImportRowErrors } from '../components/ExcelManager';
import { validateEmail, validatePhone, validateTaxNumber, normalizeNumericText, isMobilePhone } from './validation';
import { getValidationMessage } from './validationMessages';

// ─── Sabitler ──────────────────────────────────────────────────────────────────

const CUSTOMERS_SHEET = 'Customers';
const CONTACTS_SHEET = 'CustomerContacts';

/** Veritabanı VARCHAR uzunluk kısıtlamaları */
const DB_LIMITS = {
  customerName: 200,
  taxId: 11,
  taxOffice: 100,
  address: 500,
  phoneNumber: 20,
  email: 255,
  contactName: 200,
  contactTitle: 20,
  contactPhone: 20,
  contactEmail: 255,
  siteName: 200,
  siteAddress: 500,
} as const;

// ─── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────

function cellStr(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function isEmpty(value: string): boolean {
  return value === '';
}

function buildIssue(
  column: string,
  message: string,
  category: ExcelImportRowErrors['issues'][number]['category'],
  givenValue?: string | null
): ExcelImportRowErrors['issues'][number] {
  return { column, error: message, category, givenValue: givenValue ?? null, displayMessage: message };
}

function checkMaxLength(
  value: string,
  fieldLabel: string,
  column: string,
  max: number
): ExcelImportRowErrors['issues'][number] | null {
  if (value.length > max) {
    const msg = getValidationMessage(fieldLabel, 'tooLong', { max, length: value.length });
    return buildIssue(column, msg, 'VALIDATION', value.length > 40 ? `${value.slice(0, 40)}…` : value);
  }
  return null;
}

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

export interface CustomerExcelValidationResult {
  /** Tespit edilen tüm satır hataları */
  errorsByRow: ExcelImportRowErrors[];
  /** Dosyada hiç Customers sayfası yoksa true */
  missingSheet: boolean;
}

export function validateCustomersExcelFile(file: File): Promise<CustomerExcelValidationResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });

        const errorsByRow: ExcelImportRowErrors[] = [];

        // ── Customers sayfası ─────────────────────────────────────────────────
        const customersWs = workbook.Sheets[CUSTOMERS_SHEET];
        if (!customersWs) {
          resolve({ errorsByRow: [], missingSheet: true });
          return;
        }

        const customersRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(customersWs, {
          defval: '',
          raw: false,
        });

        // Duplicate vergi no tespiti: vergi no → excel satır numaraları
        const taxIdRowMap = new Map<string, number[]>();
        // Duplicate telefon tespiti: normalize telefon → excel satır numaraları
        const phoneRowMap = new Map<string, number[]>();
        for (let i = 0; i < customersRows.length; i++) {
          const row = customersRows[i];
          const taxId = normalizeNumericText(
            cellStr(row['Vergi Numarası'] ?? row['Vergi No'] ?? row['VergiNumarasi'] ?? '')
          );
          if (taxId) {
            const existing = taxIdRowMap.get(taxId) ?? [];
            existing.push(i + 2);
            taxIdRowMap.set(taxId, existing);
          }
          const rawPhone = cellStr(row['Telefon'] ?? '');
          // Yalnızca cep telefonları unique kısıtına tabidir; sabit hatlar atlanır.
          if (rawPhone && isMobilePhone(rawPhone)) {
            const phone = normalizeNumericText(rawPhone);
            const existing = phoneRowMap.get(phone) ?? [];
            existing.push(i + 2);
            phoneRowMap.set(phone, existing);
          }
        }
        // Birden fazla satırda geçen vergi numaraları
        const duplicateTaxIds = new Set<string>(
          [...taxIdRowMap.entries()]
            .filter(([, rows]) => rows.length > 1)
            .map(([taxId]) => taxId)
        );
        // Birden fazla satırda geçen telefon numaraları
        const duplicatePhones = new Set<string>(
          [...phoneRowMap.entries()]
            .filter(([, rows]) => rows.length > 1)
            .map(([phone]) => phone)
        );

        for (let i = 0; i < customersRows.length; i++) {
          const row = customersRows[i];
          const excelRow = i + 2; // başlık satırı 1
          const issues: ExcelImportRowErrors['issues'] = [];

          const name = cellStr(row['Müşteri Ünvanı'] ?? row['Musteri Unvani'] ?? row['MüşteriÜnvanı'] ?? '');
          const taxId = cellStr(row['Vergi Numarası'] ?? row['Vergi No'] ?? row['VergiNumarasi'] ?? '');
          const taxOffice = cellStr(row['Vergi Dairesi'] ?? '');
          const address = cellStr(row['Adres'] ?? '');
          const phone = cellStr(row['Telefon'] ?? '');
          const email = cellStr(row['E-posta'] ?? row['Email'] ?? row['E-Posta'] ?? '');

          // Müşteri ünvanı zorunlu
          if (isEmpty(name)) {
            issues.push(buildIssue('Müşteri Ünvanı', getValidationMessage('Müşteri ünvanı', 'required'), 'VALIDATION'));
          } else {
            const lenIssue = checkMaxLength(name, 'Müşteri ünvanı', 'Müşteri Ünvanı', DB_LIMITS.customerName);
            if (lenIssue) issues.push(lenIssue);
          }

          // Vergi numarası zorunlu + format + duplicate
          if (isEmpty(taxId)) {
            issues.push(buildIssue('Vergi Numarası', getValidationMessage('Vergi numarası', 'required'), 'VALIDATION'));
          } else {
            const taxResult = validateTaxNumber(taxId, 'Vergi numarası');
            if (!taxResult.valid) {
              issues.push(buildIssue('Vergi Numarası', taxResult.message!, 'VALIDATION', taxId));
            } else {
              const normalizedTaxId = normalizeNumericText(taxId);
              if (duplicateTaxIds.has(normalizedTaxId)) {
                const otherRows = (taxIdRowMap.get(normalizedTaxId) ?? []).filter((r) => r !== excelRow);
                issues.push(
                  buildIssue(
                    'Vergi Numarası',
                    `Bu vergi numarası tabloda birden fazla satırda kullanılmış (${otherRows.join(', ')}. satır ile aynı).`,
                    'BUSINESS',
                    taxId
                  )
                );
              }
            }
          }

          // Vergi dairesi uzunluk
          if (!isEmpty(taxOffice)) {
            const lenIssue = checkMaxLength(taxOffice, 'Vergi dairesi', 'Vergi Dairesi', DB_LIMITS.taxOffice);
            if (lenIssue) issues.push(lenIssue);
          }

          // Adres uzunluk
          if (!isEmpty(address)) {
            const lenIssue = checkMaxLength(address, 'Adres', 'Adres', DB_LIMITS.address);
            if (lenIssue) issues.push(lenIssue);
          }

          // Telefon — opsiyonel ama format + DB uzunluk + duplicate (yalnızca cep telefonları)
          if (!isEmpty(phone)) {
            const lenIssue = checkMaxLength(phone, 'Telefon', 'Telefon', DB_LIMITS.phoneNumber);
            if (lenIssue) {
              issues.push(lenIssue);
            } else {
              const phoneResult = validatePhone(phone, 'Telefon');
              if (!phoneResult.valid) {
                issues.push(buildIssue('Telefon', phoneResult.message!, 'VALIDATION', phone));
              } else if (isMobilePhone(phone)) {
                // Sabit hatlar birden fazla şirket tarafından kullanılabilir; unique kontrolü uygulanmaz.
                const normalizedPhone = normalizeNumericText(phone);
                if (duplicatePhones.has(normalizedPhone)) {
                  const otherRows = (phoneRowMap.get(normalizedPhone) ?? []).filter((r) => r !== excelRow);
                  issues.push(
                    buildIssue(
                      'Telefon',
                      `Bu cep telefonu numarası tabloda birden fazla satırda kullanılmış (${otherRows.join(', ')}. satır ile aynı).`,
                      'BUSINESS',
                      phone
                    )
                  );
                }
              }
            }
          }

          // E-posta — opsiyonel ama format
          if (!isEmpty(email)) {
            const emailResult = validateEmail(email, 'E-posta');
            if (!emailResult.valid) {
              issues.push(buildIssue('E-posta', emailResult.message!, 'VALIDATION', email));
            } else {
              const lenIssue = checkMaxLength(email, 'E-posta', 'E-posta', DB_LIMITS.email);
              if (lenIssue) issues.push(lenIssue);
            }
          }

          if (issues.length > 0) {
            errorsByRow.push({
              row: excelRow,
              sheet: CUSTOMERS_SHEET,
              errorCount: issues.length,
              columns: issues.map((iss) => iss.column),
              summary: `${issues.length} sorun tespit edildi.`,
              issues,
            });
          }
        }

        // ── CustomerContacts sayfası ──────────────────────────────────────────
        const contactsWs = workbook.Sheets[CONTACTS_SHEET];
        if (contactsWs) {
          const contactsRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(contactsWs, {
            defval: '',
            raw: false,
          });

          for (let i = 0; i < contactsRows.length; i++) {
            const row = contactsRows[i];
            const excelRow = i + 2;
            const issues: ExcelImportRowErrors['issues'] = [];

            const custTaxId = cellStr(row['Müşteri Vergi Numarası'] ?? row['Musteri Vergi No'] ?? '');
            const contactName = cellStr(row['Yetkili Adı'] ?? row['Yetkili Adi'] ?? row['Ad Soyad'] ?? '');
            const title = cellStr(row['Unvan'] ?? row['Title'] ?? '');
            const phone = cellStr(row['Telefon'] ?? '');
            const email = cellStr(row['E-posta'] ?? row['Email'] ?? '');

            // Müşteri vergi numarası zorunlu
            if (isEmpty(custTaxId)) {
              issues.push(
                buildIssue('Müşteri Vergi Numarası', getValidationMessage('Müşteri vergi numarası', 'required'), 'VALIDATION')
              );
            } else {
              const digits = normalizeNumericText(custTaxId);
              if (digits.length !== 10 && digits.length !== 11) {
                issues.push(
                  buildIssue(
                    'Müşteri Vergi Numarası',
                    getValidationMessage('Müşteri vergi numarası', 'invalidTaxNumber'),
                    'VALIDATION',
                    custTaxId
                  )
                );
              }
            }

            // Yetkili adı zorunlu
            if (isEmpty(contactName)) {
              issues.push(
                buildIssue('Yetkili Adı', getValidationMessage('Yetkili adı', 'required'), 'VALIDATION')
              );
            } else {
              const lenIssue = checkMaxLength(contactName, 'Yetkili adı', 'Yetkili Adı', DB_LIMITS.contactName);
              if (lenIssue) issues.push(lenIssue);
            }

            // Unvan — DB VARCHAR(20) — sık karşılaşılan hata
            if (!isEmpty(title)) {
              const lenIssue = checkMaxLength(title, 'Unvan', 'Unvan', DB_LIMITS.contactTitle);
              if (lenIssue) issues.push(lenIssue);
            }

            // Telefon
            if (!isEmpty(phone)) {
              const lenIssue = checkMaxLength(phone, 'Telefon', 'Telefon', DB_LIMITS.contactPhone);
              if (lenIssue) {
                issues.push(lenIssue);
              } else {
                const phoneResult = validatePhone(phone, 'Telefon');
                if (!phoneResult.valid) {
                  issues.push(buildIssue('Telefon', phoneResult.message!, 'VALIDATION', phone));
                }
              }
            }

            // E-posta
            if (!isEmpty(email)) {
              const emailResult = validateEmail(email, 'E-posta');
              if (!emailResult.valid) {
                issues.push(buildIssue('E-posta', emailResult.message!, 'VALIDATION', email));
              } else {
                const lenIssue = checkMaxLength(email, 'E-posta', 'E-posta', DB_LIMITS.contactEmail);
                if (lenIssue) issues.push(lenIssue);
              }
            }

            if (issues.length > 0) {
              errorsByRow.push({
                row: excelRow,
                sheet: CONTACTS_SHEET,
                errorCount: issues.length,
                columns: issues.map((iss) => iss.column),
                summary: `${issues.length} sorun tespit edildi.`,
                issues,
              });
            }
          }
        }

        resolve({ errorsByRow, missingSheet: false });
      } catch {
        // Parse hatası — backend'e bırak
        resolve({ errorsByRow: [], missingSheet: false });
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

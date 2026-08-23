import { getValidationMessage, ValidationCode } from './validationMessages';

export interface ValidationResult {
  valid: boolean;
  code?: ValidationCode;
  message?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IBAN_REGEX = /^TR\d{24}$/i;
const NAME_NO_DIGIT_REGEX = /^[^\d]+$/;

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeNumericText(value: string): string {
  return value.replace(/[^\d]/g, '');
}

export function validateRequired(value: string, fieldLabel: string): ValidationResult {
  if (!normalizeText(value)) {
    return { valid: false, code: 'required', message: getValidationMessage(fieldLabel, 'required') };
  }
  return { valid: true };
}

export function validateName(value: string, fieldLabel: string, required = false): ValidationResult {
  const raw = normalizeText(value);
  if (!raw) {
    if (required) {
      return { valid: false, code: 'required', message: getValidationMessage(fieldLabel, 'required') };
    }
    return { valid: true };
  }
  if (!NAME_NO_DIGIT_REGEX.test(raw)) {
    return { valid: false, code: 'invalidName', message: getValidationMessage(fieldLabel, 'invalidName') };
  }
  return { valid: true };
}

export function validateNumber(
  value: string | number,
  fieldLabel: string,
  opts?: { min?: number; max?: number; required?: boolean }
): ValidationResult {
  const raw = String(value ?? '').trim();
  if (!raw) {
    if (opts?.required) {
      return { valid: false, code: 'required', message: getValidationMessage(fieldLabel, 'required') };
    }
    return { valid: true };
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return { valid: false, code: 'invalidNumber', message: getValidationMessage(fieldLabel, 'invalidNumber') };
  }
  if (opts?.min != null && numeric < opts.min) {
    return {
      valid: false,
      code: 'minNumber',
      message: getValidationMessage(fieldLabel, 'minNumber', { min: opts.min }),
    };
  }
  if (opts?.max != null && numeric > opts.max) {
    return {
      valid: false,
      code: 'maxNumber',
      message: getValidationMessage(fieldLabel, 'maxNumber', { max: opts.max }),
    };
  }
  return { valid: true };
}

export function validateDate(value: string, fieldLabel: string, required = false): ValidationResult {
  const raw = value?.trim() ?? '';
  if (!raw) {
    if (required) {
      return { valid: false, code: 'required', message: getValidationMessage(fieldLabel, 'required') };
    }
    return { valid: true };
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { valid: false, code: 'invalidDate', message: getValidationMessage(fieldLabel, 'invalidDate') };
  }
  return { valid: true };
}

export function validateEmail(value: string, fieldLabel: string, required = false): ValidationResult {
  const raw = value?.trim() ?? '';
  if (!raw) {
    if (required) {
      return { valid: false, code: 'required', message: getValidationMessage(fieldLabel, 'required') };
    }
    return { valid: true };
  }
  if (!EMAIL_REGEX.test(raw)) {
    return { valid: false, code: 'invalidEmail', message: getValidationMessage(fieldLabel, 'invalidEmail') };
  }
  return { valid: true };
}

/**
 * Türkiye cep telefonu tespiti.
 * Ham değeri (rakamlar öncesi normalize edilmemiş) kabul eder.
 * 05xxxxxxxxx, 5xxxxxxxxx, +905xxxxxxxxx, 00905xxxxxxxxx → cep telefonu
 * Sabit hatlar (212…, 312…, 0212… vb.) → false döner.
 */
export function isMobilePhone(value: string): boolean {
  const trimmed = value.trim();
  // +90 veya 0090 ile başlıyorsa ülke kodunu soy
  const withoutCountryCode = trimmed.replace(/^(\+90|0090)/, '0');
  const digits = normalizeNumericText(withoutCountryCode);
  // 05XXXXXXXXX (11 hane) veya 5XXXXXXXXX (10 hane)
  return /^05\d{9}$/.test(digits) || /^5\d{9}$/.test(digits);
}

export function validatePhone(value: string, fieldLabel: string, required = false): ValidationResult {
  const digits = normalizeNumericText(value);
  if (!digits) {
    if (required) {
      return { valid: false, code: 'required', message: getValidationMessage(fieldLabel, 'required') };
    }
    return { valid: true };
  }
  if (digits.length < 7 || digits.length > 15) {
    return { valid: false, code: 'invalidPhone', message: getValidationMessage(fieldLabel, 'invalidPhone') };
  }
  return { valid: true };
}

export function validateTaxNumber(value: string, fieldLabel: string, required = false): ValidationResult {
  const digits = normalizeNumericText(value);
  if (!digits) {
    if (required) {
      return { valid: false, code: 'required', message: getValidationMessage(fieldLabel, 'required') };
    }
    return { valid: true };
  }
  if (!(digits.length === 10 || digits.length === 11)) {
    return { valid: false, code: 'invalidTaxNumber', message: getValidationMessage(fieldLabel, 'invalidTaxNumber') };
  }
  return { valid: true };
}

export function validateIban(value: string, fieldLabel: string, required = false): ValidationResult {
  const raw = value.replace(/\s+/g, '').toUpperCase();
  if (!raw) {
    if (required) {
      return { valid: false, code: 'required', message: getValidationMessage(fieldLabel, 'required') };
    }
    return { valid: true };
  }
  if (!IBAN_REGEX.test(raw)) {
    return { valid: false, code: 'invalidIban', message: getValidationMessage(fieldLabel, 'invalidIban') };
  }
  return { valid: true };
}

export function validateUuid(value: string, fieldLabel: string, required = false): ValidationResult {
  const raw = value?.trim() ?? '';
  if (!raw) {
    if (required) {
      return { valid: false, code: 'required', message: getValidationMessage(fieldLabel, 'required') };
    }
    return { valid: true };
  }
  if (!UUID_REGEX.test(raw)) {
    return { valid: false, code: 'invalidUuid', message: getValidationMessage(fieldLabel, 'invalidUuid') };
  }
  return { valid: true };
}

export function firstValidationError(results: ValidationResult[]): string | null {
  for (const result of results) {
    if (!result.valid) return result.message ?? 'Geçersiz veri';
  }
  return null;
}

type ImportErrorCategory = 'COERCION' | 'VALIDATION' | 'BUSINESS';

export interface ExcelImportErrorRow {
  row: number;
  sheet?: string | null;
  column: string;
  error: string;
  category?: ImportErrorCategory;
  givenValue?: string | null;
  displayMessage?: string;
}

export interface ExcelImportRowErrors {
  row: number;
  sheet: string;
  errorCount: number;
  columns: string[];
  summary: string;
  issues: Array<{
    column: string;
    error: string;
    category: ImportErrorCategory | null;
    givenValue: string | null;
    displayMessage: string;
  }>;
}

export interface ResolveExcelImportErrorsOptions {
  /** DB alan adlarını Excel TR sütun etiketine çevir (envanter). */
  mapInventoryColumns?: boolean;
  /** Teknik/ham mesajları yumuşat — yalnızca displayMessage yoksa. */
  softenTechnicalErrors?: boolean;
}

const INVENTORY_DB_FIELD_TO_COLUMN: Record<string, string> = {
  ItemName: 'Ürün Adı',
  ItemNameEn: 'Ürün Adı (EN)',
  ItemCode: 'Stok Kodu',
  Weight: 'Ağırlık (kg)',
  UnitPrice: 'Birim Fiyat (TL)',
  MonthlyListPrice: 'Liste Fiyatı (TL)',
  UnitPriceEur: 'Birim Fiyat (EUR)',
  MonthlyListPriceEur: 'Liste Fiyatı (EUR)',
  UnitPriceUsd: 'Birim Fiyat (USD)',
  MonthlyListPriceUsd: 'Liste Fiyatı (USD)',
  PurchasePrice: 'Satın Alma Fiyatı',
  TotalStock: 'Toplam Stok',
  CategoryId: 'Kategori ID',
};

export function localizeInventoryImportColumn(column: string): string {
  const trimmed = column.trim().replace(/\s*\*+\s*$/u, '').trim();
  return INVENTORY_DB_FIELD_TO_COLUMN[trimmed] ?? trimmed;
}

function looksTechnicalError(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes('must be a number') ||
    lower.includes('number.base') ||
    lower.includes('is not allowed') ||
    lower.includes('foreign key') ||
    lower.includes('violates foreign key') ||
    lower.includes('assertactiveinventory') ||
    lower.includes('deletedat') ||
    /\b(joi|sequelize|prisma|econnrefused)\b/i.test(error) ||
    /\bitemnameen\b/i.test(error) ||
    /\btotalstock\b/i.test(error)
  );
}

/** Yalnızca teknik/ham mesajlar için güvenlik ağı. Backend displayMessage varsa dokunulmaz. */
export function localizeInventoryImportError(error: string, column: string): string {
  if (!looksTechnicalError(error)) {
    return error;
  }

  const lower = error.toLowerCase();

  if (
    lower.includes('pasif') ||
    lower.includes('arşiv') ||
    lower.includes('arsiv') ||
    lower.includes('archived') ||
    lower.includes('deletedat') ||
    lower.includes('assertactiveinventory')
  ) {
    if (lower.includes('seçilemez') || lower.includes('secilemez')) {
      return error;
    }
    if (
      (lower.includes('bulunamadı') || lower.includes('bulunamadi')) &&
      (lower.includes('arşiv') || lower.includes('arsiv') || lower.includes('pasif'))
    ) {
      return 'Seçilen ürün bulunamadı veya pasif durumda.';
    }
    return 'Bu ürün pasif durumda; yeni işlemde eşleştirilemez.';
  }

  if (lower.includes('foreign key') || lower.includes('violates foreign key')) {
    return 'İlişkili kayıt bulunamadı veya kullanılamaz durumda.';
  }

  if (
    lower.includes('totalstock') &&
    (lower.includes('must be a number') || lower.includes('number.base'))
  ) {
    return 'Toplam Stok geçerli bir sayı olmalıdır. Boş bırakılırsa 0 kabul edilir.';
  }

  if (lower.includes('itemnameen') && (lower.includes('required') || lower.includes('zorunlu'))) {
    return 'Bu alan zorunludur ve boş bırakılamaz.';
  }

  if (lower.includes('must be a number') || lower.includes('number.base')) {
    return `${column} geçerli bir sayı olmalıdır.`;
  }

  if (lower.includes('is not allowed')) {
    return 'Bu sütun içe aktarmada kullanılmaz (dışa aktarma dosyasından gelmiş olabilir).';
  }

  return error;
}

function buildDisplayMessage(row: number, column: string, error: string, given?: string | null): string {
  const valueHint =
    given === null || given === undefined || given === ''
      ? ' (boş)'
      : given.trim() !== ''
        ? ` (girilen: ${given})`
        : '';
  return `Satır ${row}, ${column}: ${error}${valueHint}`;
}

function buildRowSummary(row: number, columns: string[]): string {
  const unique = [...new Set(columns.filter(Boolean))];
  if (unique.length === 0) {
    return `Satır ${row}: sorun var`;
  }
  if (unique.length === 1) {
    return `Satır ${row}: 1 sorun (${unique[0]})`;
  }
  return `Satır ${row}: ${unique.length} sorun (${unique.join(', ')})`;
}

function resolveColumn(column: string, mapInventoryColumns: boolean): string {
  return mapInventoryColumns ? localizeInventoryImportColumn(column) : column.trim() || column;
}

function resolveErrorText(
  error: string,
  column: string,
  softenTechnicalErrors: boolean
): string {
  if (!softenTechnicalErrors) return error;
  return localizeInventoryImportError(error, column);
}

export function enrichInventoryImportError(
  error: ExcelImportErrorRow,
  options: ResolveExcelImportErrorsOptions = {}
): ExcelImportErrorRow {
  const mapInventoryColumns = options.mapInventoryColumns ?? true;
  const softenTechnicalErrors = options.softenTechnicalErrors ?? true;
  const column = resolveColumn(error.column, mapInventoryColumns);
  const backendDisplay = error.displayMessage?.trim();

  // Backend birincil kaynak: dolu displayMessage aynen korunur.
  if (backendDisplay) {
    return {
      ...error,
      column,
      displayMessage: backendDisplay,
    };
  }

  const localizedError = resolveErrorText(error.error, column, softenTechnicalErrors);
  return {
    ...error,
    column,
    error: localizedError,
    displayMessage: buildDisplayMessage(error.row, column, localizedError, error.givenValue),
  };
}

export function enrichInventoryImportRowErrors(
  row: ExcelImportRowErrors,
  options: ResolveExcelImportErrorsOptions = {}
): ExcelImportRowErrors {
  const mapInventoryColumns = options.mapInventoryColumns ?? true;
  const softenTechnicalErrors = options.softenTechnicalErrors ?? true;

  const issues = row.issues.map((issue) => {
    const column = resolveColumn(issue.column, mapInventoryColumns);
    const backendDisplay = issue.displayMessage?.trim();

    if (backendDisplay) {
      return {
        ...issue,
        column,
        displayMessage: backendDisplay,
      };
    }

    const error = resolveErrorText(issue.error, column, softenTechnicalErrors);
    return {
      ...issue,
      column,
      error,
      displayMessage: buildDisplayMessage(row.row, column, error, issue.givenValue),
    };
  });

  const columns = issues.map((issue) => issue.column);
  const backendSummary = row.summary?.trim();

  return {
    ...row,
    columns,
    errorCount: issues.length,
    // Backend özeti varsa koru; yoksa sektör standardı satır özeti üret.
    summary: backendSummary || buildRowSummary(row.row, columns),
    issues,
  };
}

export function groupImportErrorsByRow(
  errors: ExcelImportErrorRow[],
  options: ResolveExcelImportErrorsOptions = {}
): ExcelImportRowErrors[] {
  const byRow = new Map<number, ExcelImportRowErrors>();

  for (const rawError of errors) {
    if (!rawError.row) continue;
    const error = enrichInventoryImportError(rawError, options);

    let rowErr = byRow.get(error.row);
    if (!rowErr) {
      rowErr = {
        row: error.row,
        sheet: error.sheet ?? '-',
        errorCount: 0,
        columns: [],
        summary: '',
        issues: [],
      };
      byRow.set(error.row, rowErr);
    }

    rowErr.issues.push({
      column: error.column,
      error: error.error,
      category: error.category ?? null,
      givenValue: error.givenValue ?? null,
      displayMessage:
        error.displayMessage ??
        buildDisplayMessage(error.row, error.column, error.error, error.givenValue),
    });
  }

  return Array.from(byRow.values())
    .map((row) => enrichInventoryImportRowErrors(row, options))
    .sort((a, b) => a.row - b.row);
}

/** Backend-first: displayMessage ve summary korunur; eksikse güvenli fallback. */
export function resolveExcelImportErrors(
  errors: ExcelImportErrorRow[],
  errorsByRow: ExcelImportRowErrors[],
  options: ResolveExcelImportErrorsOptions = {}
): { errors: ExcelImportErrorRow[]; errorsByRow: ExcelImportRowErrors[] } {
  const enrichedErrors = errors.map((error) => enrichInventoryImportError(error, options));
  const enrichedByRow =
    errorsByRow.length > 0
      ? errorsByRow.map((row) => enrichInventoryImportRowErrors(row, options))
      : groupImportErrorsByRow(enrichedErrors, options);

  return {
    errors: enrichedErrors,
    errorsByRow: enrichedByRow,
  };
}

/** @deprecated Prefer resolveExcelImportErrors — envanter varsayılanlarıyla aynı davranış. */
export function resolveInventoryImportErrors(
  errors: ExcelImportErrorRow[],
  errorsByRow: ExcelImportRowErrors[]
): { errors: ExcelImportErrorRow[]; errorsByRow: ExcelImportRowErrors[] } {
  return resolveExcelImportErrors(errors, errorsByRow, {
    mapInventoryColumns: true,
    softenTechnicalErrors: true,
  });
}

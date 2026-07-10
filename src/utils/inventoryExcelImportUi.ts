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
  const trimmed = column.trim();
  return INVENTORY_DB_FIELD_TO_COLUMN[trimmed] ?? trimmed;
}

export function localizeInventoryImportError(error: string, column: string): string {
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

  if (
    lower.includes('foreign key') ||
    lower.includes('violates foreign key') ||
    lower.includes('inventories')
  ) {
    return 'Bu ürün pasif veya geçmiş kayıtlarda kullanıldığı için eşleştirilemez.';
  }

  if (
    lower.includes('totalstock') &&
    (lower.includes('must be a number') || lower.includes('number.base'))
  ) {
    return 'Toplam Stok sayı olmalıdır. Boş bırakılırsanız 0 kabul edilir; backend güncel değilse bu hata görülebilir.';
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

export function enrichInventoryImportError(error: ExcelImportErrorRow): ExcelImportErrorRow {
  const column = localizeInventoryImportColumn(error.column);
  const localizedError = localizeInventoryImportError(error.error, column);

  return {
    ...error,
    column,
    error: localizedError,
    displayMessage:
      error.displayMessage?.trim() ||
      buildDisplayMessage(error.row, column, localizedError, error.givenValue),
  };
}

export function enrichInventoryImportRowErrors(row: ExcelImportRowErrors): ExcelImportRowErrors {
  const issues = row.issues.map((issue) => {
    const column = localizeInventoryImportColumn(issue.column);
    const error = localizeInventoryImportError(issue.error, column);
    return {
      ...issue,
      column,
      error,
      displayMessage:
        issue.displayMessage?.trim() || buildDisplayMessage(row.row, column, error, issue.givenValue),
    };
  });

  return {
    ...row,
    columns: issues.map((issue) => issue.column),
    errorCount: issues.length,
    summary: issues.map((issue) => `${issue.column}: ${issue.error}`).join('; '),
    issues,
  };
}

export function groupImportErrorsByRow(errors: ExcelImportErrorRow[]): ExcelImportRowErrors[] {
  const byRow = new Map<number, ExcelImportRowErrors>();

  for (const rawError of errors) {
    if (!rawError.row) continue;
    const error = enrichInventoryImportError(rawError);

    let rowErr = byRow.get(error.row);
    if (!rowErr) {
      rowErr = {
        row: error.row,
        sheet: error.sheet ?? 'INVENTORY',
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
      displayMessage: error.displayMessage ?? buildDisplayMessage(error.row, error.column, error.error, error.givenValue),
    });
  }

  return Array.from(byRow.values())
    .map(enrichInventoryImportRowErrors)
    .sort((a, b) => a.row - b.row);
}

export function resolveInventoryImportErrors(
  errors: ExcelImportErrorRow[],
  errorsByRow: ExcelImportRowErrors[]
): { errors: ExcelImportErrorRow[]; errorsByRow: ExcelImportRowErrors[] } {
  const enrichedErrors = errors.map(enrichInventoryImportError);
  const enrichedByRow =
    errorsByRow.length > 0
      ? errorsByRow.map(enrichInventoryImportRowErrors)
      : groupImportErrorsByRow(enrichedErrors);

  return {
    errors: enrichedErrors,
    errorsByRow: enrichedByRow,
  };
}

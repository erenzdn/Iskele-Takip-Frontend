import {
  INVENTORY_OPTIONAL_EXCEL_COLUMNS,
  INVENTORY_REQUIRED_EXCEL_COLUMNS,
} from '../constants/inventoryExcel';

export type ImportErrorCategory = 'COERCION' | 'VALIDATION' | 'BUSINESS';

export type InventoryRequiredExcelColumn = (typeof INVENTORY_REQUIRED_EXCEL_COLUMNS)[number];
export type InventoryOptionalExcelColumn = (typeof INVENTORY_OPTIONAL_EXCEL_COLUMNS)[number];
export type InventoryExcelColumn = InventoryRequiredExcelColumn | InventoryOptionalExcelColumn;

export interface InventoryImportError {
  row: number;
  sheet: string;
  column: InventoryExcelColumn | string;
  error: string;
  category: ImportErrorCategory;
  givenValue: string | null;
  displayMessage: string;
  code?: string;
}

export interface InventoryImportRowIssue {
  column: string;
  error: string;
  category: ImportErrorCategory | null;
  givenValue: string | null;
  displayMessage: string;
  code?: string;
}

export interface InventoryImportRowErrors {
  row: number;
  sheet: string;
  errorCount: number;
  columns: string[];
  summary: string;
  issues: InventoryImportRowIssue[];
}

export interface InventoryImportSummary {
  totalRows: number;
  successRows: number;
  failedRows: number;
  errorsByCategory: Record<ImportErrorCategory, number>;
}

export interface UnmatchedCategoryLookup {
  value: string;
  rowCount: number;
  rows: number[];
  reason: 'not_found' | 'ambiguous';
}

export interface UnmatchedLookups {
  categories: UnmatchedCategoryLookup[];
}

export interface InventoryCategoryMapping {
  from: string;
  toCategoryId?: number;
  toCategoryName?: string;
}

export type CategoryResolutionAction = 'create' | 'map' | 'skip';

export interface CategoryResolutionDecision {
  excelName: string;
  action: CategoryResolutionAction;
  createName?: string;
  mapCategoryId?: number;
}

export interface InventoryImportResponse {
  success: boolean;
  partial: boolean;
  message: string;
  count: number;
  summary: InventoryImportSummary;
  errors: InventoryImportError[];
  errorsByRow: InventoryImportRowErrors[];
  unmatchedLookups?: UnmatchedLookups;
}

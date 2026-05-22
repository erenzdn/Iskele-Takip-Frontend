import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  ArrowClockwiseIcon, 
  DownloadSimpleIcon, 
  UploadSimpleIcon, 
  XIcon, 
  WarningCircleIcon,
  CheckCircleIcon,
  FileTextIcon
} from '@phosphor-icons/react';
import { apiClient } from '../services/apiClient';
import { useAuthStore } from '../store/authStore';
import { toast } from '../hooks/useToast';
import { getApiErrorMessage } from '../utils/apiError';
import { CUSTOMERS_EXCEL_HELP } from '../constants/customersExcel';
import { INVENTORY_EXCEL_HELP } from '../constants/inventoryExcel';
import { resolveInventoryImportErrors } from '../utils/inventoryExcelImportUi';

export type ExcelModuleType = 'inventory' | 'customers' | 'checks' | 'stockReceipts';

const PERMISSIONS: Record<ExcelModuleType, { view: string; create: string }> = {
  inventory: { view: 'inventory_view', create: 'inventory_create' },
  customers: { view: 'customers_view', create: 'customers_create' },
  checks: { view: 'checks_view', create: 'checks_create' },
  stockReceipts: { view: 'stockReceipts_view', create: 'stockReceipts_create' },
};

export type ExcelErrorCategory = 'COERCION' | 'VALIDATION' | 'BUSINESS';

export interface ExcelImportErrorRow {
  row: number;
  sheet?: string | null;
  column: string;
  error: string;
  category?: ExcelErrorCategory;
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
    category: ExcelErrorCategory | null;
    givenValue: string | null;
    displayMessage: string;
  }>;
}

export interface ExcelImportSummary {
  totalRows: number;
  successRows: number;
  failedRows: number;
  errorsByCategory: Record<ExcelErrorCategory, number>;
}

interface ExcelImportResponse {
  success: boolean;
  partial?: boolean;
  canPartialImport?: boolean;
  validRowCount?: number;
  message?: string;
  summary?: ExcelImportSummary;
  errors?: ExcelImportErrorRow[];
  errorsByRow?: ExcelImportRowErrors[];
  count?: number;
}

type Busy = null | 'export' | 'import';
type ExcelImportMode = 'strict' | 'lenient' | 'force';

function normalizeExcelErrorRow(raw: unknown): ExcelImportErrorRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const rawRow = row.row ?? row.Row ?? row.rowNumber ?? row.RowNumber;
  const rowNumber = Number(rawRow);
  const rawCategory = row.category ?? row.Category;
  const category =
    rawCategory === 'COERCION' || rawCategory === 'VALIDATION' || rawCategory === 'BUSINESS'
      ? rawCategory
      : undefined;

  const column = String(row.column ?? row.Column ?? row.field ?? row.Field ?? '-');
  const errorMessage = String(row.error ?? row.Error ?? row.message ?? row.Message ?? 'Geçersiz değer');
  const displayMessageRaw = row.displayMessage ?? row.DisplayMessage;

  return {
    row: Number.isFinite(rowNumber) ? rowNumber : 0,
    sheet: (row.sheet ?? row.Sheet ?? null) as string | null,
    column,
    error: errorMessage,
    category,
    givenValue:
      row.givenValue !== undefined
        ? String(row.givenValue)
        : row.GivenValue !== undefined
          ? String(row.GivenValue)
          : null,
    displayMessage:
      typeof displayMessageRaw === 'string' && displayMessageRaw.trim()
        ? displayMessageRaw
        : undefined,
  };
}

function normalizeExcelImportRowErrors(row: unknown): ExcelImportRowErrors | null {
  if (!row || typeof row !== 'object') return null;
  const obj = row as Record<string, unknown>;
  const rowNumber = Number(obj.row ?? obj.Row);
  const rawIssues = Array.isArray(obj.issues) ? obj.issues : Array.isArray(obj.Issues) ? obj.Issues : [];
  const issues = rawIssues
    .map((issue) => {
      if (!issue || typeof issue !== 'object') return null;
      const i = issue as Record<string, unknown>;
      const rawCategory = i.category ?? i.Category;
      const category =
        rawCategory === 'COERCION' || rawCategory === 'VALIDATION' || rawCategory === 'BUSINESS'
          ? rawCategory
          : null;
      const column = String(i.column ?? i.Column ?? '-');
      const error = String(i.error ?? i.Error ?? 'Geçersiz değer');
      const displayMessageRaw = i.displayMessage ?? i.DisplayMessage;
      const displayMessage =
        typeof displayMessageRaw === 'string' && displayMessageRaw.trim()
          ? displayMessageRaw
          : `Satır ${Number.isFinite(rowNumber) ? rowNumber : '?'}, ${column}: ${error}`;

      return {
        column,
        error,
        category,
        givenValue:
          i.givenValue !== undefined
            ? String(i.givenValue)
            : i.GivenValue !== undefined
              ? String(i.GivenValue)
              : null,
        displayMessage,
      };
    })
    .filter((issue): issue is ExcelImportRowErrors['issues'][number] => issue !== null);

  return {
    row: Number.isFinite(rowNumber) ? rowNumber : 0,
    sheet: String(obj.sheet ?? obj.Sheet ?? 'INVENTORY'),
    errorCount: Number(obj.errorCount ?? obj.ErrorCount ?? issues.length) || issues.length,
    columns: Array.isArray(obj.columns)
      ? obj.columns.map(String)
      : Array.isArray(obj.Columns)
        ? obj.Columns.map(String)
        : issues.map((i) => i.column),
    summary: String(obj.summary ?? obj.Summary ?? ''),
    issues,
  };
}

function normalizeExcelImportSummary(summary: unknown): ExcelImportSummary | undefined {
  if (!summary || typeof summary !== 'object') return undefined;
  const obj = summary as Record<string, unknown>;
  const totalRows = Number(obj.totalRows ?? obj.TotalRows ?? 0);
  const successRows = Number(obj.successRows ?? obj.SuccessRows ?? 0);
  const failedRows = Number(obj.failedRows ?? obj.FailedRows ?? 0);
  const rawCategories = (obj.errorsByCategory ?? obj.ErrorsByCategory ?? {}) as Partial<
    Record<ExcelErrorCategory, number>
  >;

  return {
    totalRows: Number.isFinite(totalRows) ? totalRows : 0,
    successRows: Number.isFinite(successRows) ? successRows : 0,
    failedRows: Number.isFinite(failedRows) ? failedRows : 0,
    errorsByCategory: {
      COERCION: Number(rawCategories.COERCION ?? 0),
      VALIDATION: Number(rawCategories.VALIDATION ?? 0),
      BUSINESS: Number(rawCategories.BUSINESS ?? 0),
    },
  };
}

function normalizeExcelImportResponse(data: unknown): ExcelImportResponse | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const rawErrors = Array.isArray(obj.errors)
    ? obj.errors
    : Array.isArray(obj.Errors)
      ? obj.Errors
      : [];
  const errors = rawErrors
    .map(normalizeExcelErrorRow)
    .filter((row): row is ExcelImportErrorRow => row !== null);
  const rawErrorsByRow = Array.isArray(obj.errorsByRow)
    ? obj.errorsByRow
    : Array.isArray(obj.ErrorsByRow)
      ? obj.ErrorsByRow
      : [];
  const errorsByRow = rawErrorsByRow
    .map(normalizeExcelImportRowErrors)
    .filter((row): row is ExcelImportRowErrors => row !== null);

  return {
    success: Boolean(obj.success ?? obj.Success),
    partial: Boolean(obj.partial ?? obj.Partial),
    canPartialImport: 
      obj.canPartialImport !== undefined 
        ? Boolean(obj.canPartialImport) 
        : obj.CanPartialImport !== undefined 
          ? Boolean(obj.CanPartialImport) 
          : undefined,
    validRowCount:
      typeof obj.validRowCount === 'number'
        ? obj.validRowCount
        : typeof obj.ValidRowCount === 'number'
          ? obj.ValidRowCount
          : undefined,
    message:
      typeof obj.message === 'string'
        ? obj.message
        : typeof obj.Message === 'string'
          ? obj.Message
          : undefined,
    summary: normalizeExcelImportSummary(obj.summary ?? obj.Summary),
    errors,
    errorsByRow,
    count: typeof obj.count === 'number' ? obj.count : typeof obj.Count === 'number' ? obj.Count : undefined,
  };
}

function normalizeExcelImportError(error: unknown): ExcelImportResponse | null {
  const err = error as { responseText?: string; rawBody?: string; message?: string };
  const candidates = [err?.responseText, err?.rawBody, err?.message].filter(
    (value): value is string => typeof value === 'string' && value.trim().startsWith('{')
  );

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const normalized = normalizeExcelImportResponse(parsed);
      if (normalized && (normalized.errors?.length || normalized.message)) return normalized;
    } catch {
      // Ignore unparsable candidates and continue with the generic API error message.
    }
  }

  return null;
}

const CATEGORY_BADGE_LABELS: Record<ExcelErrorCategory, string> = {
  COERCION: 'Format',
  VALIDATION: 'Doğrulama',
  BUSINESS: 'İş Kuralı',
};

const CATEGORY_BADGE_CLASSES: Record<ExcelErrorCategory, string> = {
  COERCION: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  VALIDATION: 'bg-error/10 text-error border-error/20',
  BUSINESS: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
};

function categoryBadgeLabel(category: ExcelErrorCategory): string {
  return CATEGORY_BADGE_LABELS[category] ?? category;
}

function categoryBadgeClass(category: ExcelErrorCategory): string {
  return CATEGORY_BADGE_CLASSES[category] ?? '';
}

function prepareImportErrors(
  type: ExcelModuleType,
  errors: ExcelImportErrorRow[],
  errorsByRow: ExcelImportRowErrors[]
): { errors: ExcelImportErrorRow[]; errorsByRow: ExcelImportRowErrors[] } {
  if (type !== 'inventory') {
    return { errors, errorsByRow: errorsByRow.length > 0 ? errorsByRow : groupImportErrorsByRowGeneric(errors) };
  }
  return resolveInventoryImportErrors(errors, errorsByRow);
}

function groupImportErrorsByRowGeneric(errors: ExcelImportErrorRow[]): ExcelImportRowErrors[] {
  const byRow = new Map<number, ExcelImportRowErrors>();

  for (const err of errors) {
    if (!err.row) continue;
    let rowErr = byRow.get(err.row);
    if (!rowErr) {
      rowErr = {
        row: err.row,
        sheet: err.sheet ?? '-',
        errorCount: 0,
        columns: [],
        summary: '',
        issues: [],
      };
      byRow.set(err.row, rowErr);
    }

    const displayMessage =
      err.displayMessage?.trim() || `Satır ${err.row}, ${err.column}: ${err.error}`;

    rowErr.issues.push({
      column: err.column,
      error: err.error,
      category: err.category ?? null,
      givenValue: err.givenValue ?? null,
      displayMessage,
    });
  }

  return Array.from(byRow.values())
    .map((rowErr) => ({
      ...rowErr,
      errorCount: rowErr.issues.length,
      columns: rowErr.issues.map((issue) => issue.column),
      summary: rowErr.issues.map((issue) => `${issue.column}: ${issue.error}`).join('; '),
    }))
    .sort((a, b) => a.row - b.row);
}

function isExcelFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') return true;
  const mime = file.type.toLowerCase();
  return (
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel'
  );
}

function triggerBlobDownload(blob: Blob, fallbackName: string, serverFilename: string | null) {
  const name =
    serverFilename && serverFilename.replace(/[/\\]/g, '').length > 0 ? serverFilename : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface ExcelManagerProps {
  type: ExcelModuleType;
  title?: string;
  onImportSuccess?: () => void;
  className?: string;
  modalZClass?: string;
}

export default function ExcelManager({
  type,
  title,
  onImportSuccess,
  className = '',
  modalZClass = 'z-[70]',
}: ExcelManagerProps) {
  const user = useAuthStore((s) => s.user);
  const permissions = user?.permissions ?? [];
  const { view: viewPerm, create: createPerm } = PERMISSIONS[type];
  const canView = permissions.includes(viewPerm);
  const canImport = permissions.includes(createPerm);

  const [busy, setBusy] = useState<Busy>(null);
  const [dragActive, setDragActive] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [errorModal, setErrorModal] = useState<{
    message: string;
    errors: ExcelImportErrorRow[];
    errorsByRow: ExcelImportRowErrors[];
    count?: number;
    summary?: ExcelImportSummary;
    isPartialSuccess?: boolean;
    canSkipInvalidRows?: boolean;
    canImportAllRows?: boolean;
    validRowCount?: number;
  } | null>(null);
  const [importInfoModalType, setImportInfoModalType] = useState<ExcelModuleType | null>(null);

  // Otomatik hesaplama oranları state'leri
  const [usdRate, setUsdRate] = useState<string>('');
  const [eurRate, setEurRate] = useState<string>('');
  const [rentalRateTry, setRentalRateTry] = useState<string>('');
  const [rentalRateUsd, setRentalRateUsd] = useState<string>('');
  const [rentalRateEur, setRentalRateEur] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const runExport = useCallback(async () => {
    if (!canView) return;
    setBusy('export');
    try {
      const downloadPath =
        type === 'inventory' ? '/excel/template/inventory' : `/excel/export/${type}`;
      const { blob, filename } = await apiClient.getBlobDownload(downloadPath);
      const fallbackName = type === 'inventory' ? 'envanter_sablonu.xlsx' : `export_${type}.xlsx`;
      triggerBlobDownload(blob, fallbackName, filename);
      toast.success(
        type === 'customers'
          ? 'Müşteri Excel şablonu indirildi (Customers + CustomerContacts).'
          : type === 'inventory'
            ? 'Envanter Excel şablonu indirildi.'
            : 'Excel dosyası indirildi.'
      );
    } catch (e) {
      console.error('Excel export error:', e);
      toast.error(getApiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }, [canView, type]);

  const processFile = useCallback(
    async (file: File, mode: ExcelImportMode = 'strict') => {
      if (!canImport) return;
      if (!isExcelFile(file)) {
        toast.warning('Yalnızca .xlsx veya .xls dosyası yükleyebilirsiniz.');
        return;
      }

      // 10MB Limit Kontrolü
      if (file.size > 10 * 1024 * 1024) {
        toast.warning('Dosya boyutu 10MB limitini aşıyor.');
        return;
      }

      setBusy('import');
      try {
        const formData = new FormData();
        formData.append('file', file);
        if (type === 'inventory') {
          if (usdRate) formData.append('usdRate', usdRate);
          if (eurRate) formData.append('eurRate', eurRate);
          if (rentalRateTry) formData.append('rentalRateTry', rentalRateTry);
          if (rentalRateUsd) formData.append('rentalRateUsd', rentalRateUsd);
          if (rentalRateEur) formData.append('rentalRateEur', rentalRateEur);
        }

        // mode query parametresi eklendi
        const data = await apiClient.postFormData<ExcelImportResponse>(
          `/excel/import/${type}?mode=${mode}`,
          formData
        );

        // Tam Başarı (200 OK ve partial değil)
        if (data && typeof data === 'object' && data.success === true && !data.partial) {
          toast.success(
            data.message ||
              (type === 'customers'
                ? `${data.count || ''} satır başarıyla işlendi. Customers ve CustomerContacts sayfaları doğrulandı.`
                : `${data.count || ''} satır başarıyla işlendi.`)
          );
          setErrorModal(null);
          setLastFile(null);
          onImportSuccess?.();
          return;
        }

        // Kısmi Başarı (207) veya Hata (400+)
        if (data && typeof data === 'object') {
          const normalized = normalizeExcelImportResponse(data);
          const prepared = prepareImportErrors(
            type,
            normalized?.errors ?? [],
            normalized?.errorsByRow ?? []
          );
          const rows = prepared.errors;
          const rowsByRow = prepared.errorsByRow;

          if (normalized?.partial) {
            // Lenient modda bir başarı var; dosyayı temizle
            toast.warning(
              normalized.message ||
                (type === 'customers'
                  ? 'Müşteri içe aktarma kısmen tamamlandı. CustomerContacts iş kuralları nedeniyle bazı satırlar atlandı.'
                  : 'İçe aktarma kısmen tamamlandı.')
            );
            setLastFile(null);
            onImportSuccess?.();
          } else {
            setLastFile(file);
            toast.error(
              normalized?.message ||
                (type === 'inventory'
                  ? 'İçe aktarma başarısız. Excel’de işaretli satırları düzeltin veya hatalı satırları atlayarak yükleyin.'
                  : 'İçe aktarma başarısız. Hata detayları aşağıda.')
            );
          }

          setErrorModal({
            message: normalized?.message || 'İçe aktarma sırasında sorunlar oluştu.',
            errors: rows,
            errorsByRow: rowsByRow,
            count: normalized?.count,
            summary: normalized?.summary,
            isPartialSuccess: normalized?.partial,
            canSkipInvalidRows:
              !normalized?.partial && 
              normalized?.canPartialImport === true && 
              mode === 'strict',
            canImportAllRows:
              !normalized?.partial && (rowsByRow.length > 0 || rows.length > 0) && mode === 'strict',
            validRowCount: normalized?.validRowCount,
          });
          return;
        }

        toast.error('Beklenmeyen sunucu yanıtı.');
      } catch (e) {
        console.error('Excel import error:', e);
        const normalized = normalizeExcelImportError(e);
        if (normalized) {
          const prepared = prepareImportErrors(
            type,
            normalized.errors ?? [],
            normalized.errorsByRow ?? []
          );
          const rows = prepared.errors;
          const rowsByRow = prepared.errorsByRow;
          setLastFile(file);
          setErrorModal({
            message: normalized.message || getApiErrorMessage(e),
            errors: rows,
            errorsByRow: rowsByRow,
            count: normalized.count,
            summary: normalized.summary,
            isPartialSuccess: normalized.partial,
            canSkipInvalidRows:
              !normalized.partial && 
              normalized.canPartialImport === true && 
              mode === 'strict',
            canImportAllRows:
              !normalized.partial && (rowsByRow.length > 0 || rows.length > 0) && mode === 'strict',
            validRowCount: normalized.validRowCount,
          });
          toast.error(normalized.message || getApiErrorMessage(e));
          return;
        }
        toast.error(getApiErrorMessage(e));
      } finally {
        setBusy(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [canImport, type, onImportSuccess, usdRate, eurRate, rentalRateTry, rentalRateUsd, rentalRateEur]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportInfoModalType(null);
      void processFile(file);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (!canImport || busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setImportInfoModalType(null);
      void processFile(file);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (canImport && !busy) setDragActive(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  if (!canView) {
    return null;
  }

  const disabled = busy !== null;
  const dropHint =
    title ??
    (type === 'customers'
      ? `${CUSTOMERS_EXCEL_HELP.hint} Dosyayı seçin veya .xlsx / .xls dosyasını bu düğmelerin üzerine sürükleyip bırakın.`
      : type === 'inventory'
        ? `${INVENTORY_EXCEL_HELP.hint} Dosyayı seçin veya .xlsx / .xls dosyasını bu düğmelerin üzerine sürükleyip bırakın.`
        : 'Excel dosyası seçin veya .xlsx / .xls dosyasını bu düğmelerin üzerine sürükleyip bırakın.');
  const shouldShowImportInfoModal = type === 'customers' || type === 'inventory';
  const importInfoTitle = type === 'customers' ? 'Müşteri Excel İçe Aktarma' : 'Envanter Excel İçe Aktarma';
  const importInfoHint =
    type === 'customers' ? CUSTOMERS_EXCEL_HELP.hint : INVENTORY_EXCEL_HELP.hint;
  const importInfoChecklist =
    type === 'customers'
      ? `Kontrol listesi: ${CUSTOMERS_EXCEL_HELP.checklist}`
      : `Kontrol listesi: ${INVENTORY_EXCEL_HELP.checklist}`;
  const customerTaxIdNote = type === 'customers' ? CUSTOMERS_EXCEL_HELP.taxIdNote : null;

  return (
    <>
      <div
        className={`
          inline-flex items-center gap-1.5 rounded-md border transition-colors
          ${dragActive ? 'border-accent/60 bg-accent/5' : 'border-transparent'}
          ${className}
        `}
        onDrop={canImport ? onDrop : undefined}
        onDragOver={canImport ? onDragOver : undefined}
        onDragLeave={canImport ? onDragLeave : undefined}
        title={canImport ? dropHint : undefined}
      >
        <button
          type="button"
          onClick={() => void runExport()}
          disabled={disabled}
          className="btn-secondary py-1.5 px-2.5 text-xs inline-flex items-center gap-1.5 border-none bg-transparent hover:bg-background-hover"
        >
          {busy === 'export' ? (
            <ArrowClockwiseIcon size={14} className="animate-spin shrink-0" />
          ) : (
            <DownloadSimpleIcon size={14} weight="bold" className="shrink-0 text-accent" />
          )}
          Dışa aktar
        </button>

        {canImport && (
          <>
            <div className="w-px h-4 bg-background-border mx-1" />

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="sr-only"
              aria-hidden={true}
              tabIndex={-1}
              onChange={onInputChange}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                if (shouldShowImportInfoModal) {
                  setImportInfoModalType(type);
                  return;
                }
                fileInputRef.current?.click();
              }}
              className="btn-secondary py-1.5 px-2.5 text-xs inline-flex items-center gap-1.5 border-none bg-transparent hover:bg-background-hover"
            >
              {busy === 'import' ? (
                <ArrowClockwiseIcon size={14} className="animate-spin shrink-0" />
              ) : (
                <UploadSimpleIcon size={14} weight="bold" className="shrink-0 text-accent" />
              )}
              İçe aktar
            </button>
          </>
        )}
      </div>

      {importInfoModalType !== null && createPortal(
        <div
          className={`fixed inset-0 bg-black/50 flex items-center justify-center p-4 ${modalZClass}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="customer-import-help-title"
        >
          <div className="bg-background-panel rounded-panel w-full max-w-xl shadow-xl border border-background-border">
            <div className="flex items-start justify-between gap-3 p-4 border-b border-background-border">
              <div>
                <h3 id="customer-import-help-title" className="text-lg font-semibold text-text-primary">
                  {importInfoTitle}
                </h3>
                <p className="text-sm text-text-secondary mt-1">{importInfoHint}</p>
              </div>
              <button
                type="button"
                onClick={() => setImportInfoModalType(null)}
                className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-background-hover"
                aria-label="Kapat"
              >
                <XIcon size={22} />
              </button>
            </div>

            <div className="p-4 space-y-3 text-sm">
              <div className="rounded-md border border-background-border bg-background-muted/30 p-3 text-text-secondary">
                {importInfoChecklist}
              </div>
              {type === 'inventory' && (
                <div className="rounded-md border border-background-border bg-background-muted/20 p-3 space-y-2 text-text-secondary text-xs">
                  <div>
                    <span className="font-semibold text-text-primary">Zorunlu sütunlar: </span>
                    {INVENTORY_EXCEL_HELP.requiredLegend}
                  </div>
                  <div>
                    <span className="font-semibold text-text-primary">Opsiyonel sütunlar: </span>
                    {INVENTORY_EXCEL_HELP.optionalLegend}
                  </div>
                  <p>{INVENTORY_EXCEL_HELP.stockNote}</p>
                  <p className="text-text-secondary/80">{INVENTORY_EXCEL_HELP.notInTemplate}</p>
                  <p className="text-warning/90">{INVENTORY_EXCEL_HELP.exportNote}</p>
                </div>
              )}
              {type === 'inventory' && (
                <div className="grid grid-cols-2 gap-3 border border-background-border rounded-md p-3 bg-background-muted/10">
                  <h4 className="col-span-2 font-semibold text-text-primary text-xs">
                    Otomatik Hesaplama Oranları (Opsiyonel)
                  </h4>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-text-secondary">Dolar Kuru (USD)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Örn: 32.45"
                      value={usdRate}
                      onChange={(e) => setUsdRate(e.target.value)}
                      className="input text-xs py-1 px-2 border border-background-border rounded bg-background-panel"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-text-secondary">Euro Kuru (EUR)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Örn: 35.12"
                      value={eurRate}
                      onChange={(e) => setEurRate(e.target.value)}
                      className="input text-xs py-1 px-2 border border-background-border rounded bg-background-panel"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-text-secondary">Kiralama Çarpanı (TL %)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Örn: 0.05"
                      value={rentalRateTry}
                      onChange={(e) => setRentalRateTry(e.target.value)}
                      className="input text-xs py-1 px-2 border border-background-border rounded bg-background-panel"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-text-secondary">Kiralama Çarpanı (USD %)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Örn: 0.04"
                      value={rentalRateUsd}
                      onChange={(e) => setRentalRateUsd(e.target.value)}
                      className="input text-xs py-1 px-2 border border-background-border rounded bg-background-panel"
                    />
                  </div>
                  <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-[11px] font-bold text-text-secondary">Kiralama Çarpanı (EUR %)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Örn: 0.04"
                      value={rentalRateEur}
                      onChange={(e) => setRentalRateEur(e.target.value)}
                      className="input text-xs py-1 px-2 border border-background-border rounded bg-background-panel"
                    />
                  </div>
                </div>
              )}
              {customerTaxIdNote && (
                <div className="rounded-md border border-background-border bg-background-muted/30 p-3 text-text-secondary">
                  {customerTaxIdNote}
                </div>
              )}
              <p className="text-xs text-text-secondary">
                Desteklenen dosya tipleri: <code>.xlsx</code> / <code>.xls</code> (maksimum 10MB)
              </p>
            </div>

            <div className="p-4 border-t border-background-border flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportInfoModalType(null)}
                className="btn-secondary py-2 px-4 text-sm"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => fileInputRef.current?.click()}
                className="btn-primary py-2 px-4 text-sm inline-flex items-center gap-2"
              >
                {busy === 'import' ? (
                  <ArrowClockwiseIcon size={16} className="animate-spin shrink-0" />
                ) : (
                  <UploadSimpleIcon size={16} weight="bold" className="shrink-0" />
                )}
                Dosya Seç ve İçe Aktar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {errorModal && createPortal(
        <div
          className={`fixed inset-0 bg-black/50 flex items-center justify-center p-4 ${modalZClass}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="excel-error-title"
        >
          <div className="bg-background-panel rounded-panel w-full max-w-3xl max-h-[85vh] shadow-xl flex flex-col border border-background-border">
            <div className="flex items-start justify-between gap-3 p-4 border-b border-background-border shrink-0">
              <div>
                <h3 id="excel-error-title" className="text-lg font-semibold text-text-primary flex items-center gap-2">
                  {errorModal.isPartialSuccess ? (
                    <CheckCircleIcon size={24} weight="fill" className="text-success" />
                  ) : (
                    <WarningCircleIcon size={24} weight="fill" className="text-error" />
                  )}
                  {errorModal.isPartialSuccess ? 'Kısmi İçe Aktarma (207) – Özet ve Atlanan Satırlar' : 'Doğrulama Hataları (400)'}
                </h3>
                <p className="text-sm text-text-secondary mt-1">{errorModal.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setErrorModal(null)}
                className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-background-hover"
                aria-label="Kapat"
              >
                <XIcon size={22} />
              </button>
            </div>

            {errorModal.summary && (
              <div className="p-4 bg-background-muted/30 border-b border-background-border shrink-0 grid grid-cols-3 gap-4">
                <div className="bg-background-panel border border-background-border p-3 rounded-md flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent shrink-0">
                    <FileTextIcon size={20} weight="bold" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Toplam Satır</div>
                    <div className="text-xl font-bold text-text-primary tabular-nums">{errorModal.summary.totalRows}</div>
                  </div>
                </div>
                <div className="bg-background-panel border border-background-border p-3 rounded-md flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center text-success shrink-0">
                    <CheckCircleIcon size={20} weight="bold" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Başarılı</div>
                    <div className="text-xl font-bold text-success tabular-nums">{errorModal.summary.successRows}</div>
                  </div>
                </div>
                <div className="bg-background-panel border border-background-border p-3 rounded-md flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center text-error shrink-0">
                    <WarningCircleIcon size={20} weight="bold" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Hatalı / Atlanan</div>
                    <div className="text-xl font-bold text-error tabular-nums">{errorModal.summary.failedRows}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-auto flex-1 p-4 space-y-4">
              {errorModal.isPartialSuccess && (
                <p className="text-sm text-text-primary rounded-md border border-success/30 bg-success/5 px-3 py-2">
                  {errorModal.count ?? errorModal.summary?.successRows ?? 0} satır kaydedildi;{' '}
                  {errorModal.summary?.failedRows ?? 0} satır atlandı.
                </p>
              )}

              {errorModal.errorsByRow.length > 0 ? (
                <div className="import-errors space-y-3">
                  {errorModal.errorsByRow.map((rowErr) => (
                    <div
                      key={`${rowErr.sheet}-${rowErr.row}`}
                      className="rounded-md border border-background-border bg-background-muted/20 p-3"
                    >
                      <strong className="text-sm text-text-primary">
                        Excel&apos;de {rowErr.row}. satıra gidin
                      </strong>
                      {rowErr.summary && (
                        <p className="text-xs text-text-secondary mt-1">{rowErr.summary}</p>
                      )}
                      <ul className="mt-2 space-y-1.5 list-disc list-inside text-xs text-text-secondary">
                        {rowErr.issues.map((issue, i) => (
                          <li key={`${rowErr.row}-${issue.column}-${i}`} className="leading-relaxed">
                            <span>{issue.displayMessage}</span>
                            {issue.category && (
                              <span
                                className={`ml-2 px-1.5 py-0.5 rounded border text-[10px] font-bold align-middle ${categoryBadgeClass(issue.category)}`}
                              >
                                {categoryBadgeLabel(issue.category)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : errorModal.errors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-text-secondary">
                  <CheckCircleIcon size={48} weight="thin" />
                  <p className="mt-2 text-sm">Satır bazlı detaylı hata bulunmadı.</p>
                </div>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-background-border text-left text-text-secondary">
                      <th className="py-2 px-2 font-medium w-12 text-center">Satır</th>
                      <th className="py-2 px-2 font-medium w-28">Sayfa</th>
                      <th className="py-2 px-2 font-medium w-max min-w-[280px]">Mesaj</th>
                      <th className="py-2 px-2 font-medium w-24">Tip</th>
                      <th className="py-2 px-2 font-medium">Girdi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorModal.errors.map((err: ExcelImportErrorRow, i: number) => (
                      <tr
                        key={`${err.row}-${err.column}-${i}`}
                        className="border-b border-background-border/80 hover:bg-background-hover/40 transition-colors"
                      >
                        <td className="py-2 px-2 text-text-primary tabular-nums font-semibold text-center">{err.row}</td>
                        <td className="py-2 px-2 text-text-primary font-medium">{err.sheet ? String(err.sheet) : '-'}</td>
                        <td className="py-2 px-2 text-text-secondary leading-relaxed">
                          {err.displayMessage || err.error}
                        </td>
                        <td className="py-2 px-2">
                          {err.category && (
                            <span
                              className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${categoryBadgeClass(err.category)}`}
                            >
                              {categoryBadgeLabel(err.category)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          {err.givenValue !== undefined && (
                            <code className="text-[10px] bg-background-muted px-1 rounded text-text-primary">
                              {err.givenValue === null ? 'Boş' : String(err.givenValue)}
                            </code>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {(errorModal.canSkipInvalidRows || errorModal.canImportAllRows) && (
              <div className="px-4 py-2 bg-warning/10 border-b border-background-border space-y-1.5">
                <div className="flex items-center gap-2 text-warning text-[11px] font-medium">
                  <WarningCircleIcon size={16} weight="fill" />
                  <span>Strict modda hiçbir veri kaydedilmedi.</span>
                </div>
                {errorModal.canSkipInvalidRows && errorModal.validRowCount !== undefined && (
                  <p className="text-text-primary text-sm font-medium pl-6">
                    {errorModal.summary?.totalRows ?? 0} satırdan {errorModal.summary?.failedRows ?? 0} tanesi hatalı, {errorModal.validRowCount} tanesi geçerli.
                  </p>
                )}
              </div>
            )}

            <div className="p-4 border-t border-background-border flex justify-between items-center gap-3 shrink-0">
              <button 
                type="button" 
                onClick={() => { setErrorModal(null); setLastFile(null); }} 
                className="btn-secondary py-2 px-4 text-sm"
              >
                {errorModal.canSkipInvalidRows || errorModal.canImportAllRows ? 'İptal' : 'Kapat'}
              </button>

              {errorModal.canImportAllRows && lastFile && (
                <button
                  type="button"
                  disabled={busy === 'import'}
                  onClick={() => void processFile(lastFile, 'force')}
                  className="btn-secondary py-2 px-4 text-sm flex items-center gap-2"
                >
                  {busy === 'import' ? (
                    <ArrowClockwiseIcon size={18} className="animate-spin" />
                  ) : (
                    <UploadSimpleIcon size={18} weight="bold" />
                  )}
                  Tüm Tabloyu Yine de Yükle
                </button>
              )}

              {errorModal.canSkipInvalidRows && lastFile && (
                <button 
                  type="button" 
                  disabled={busy === 'import'}
                  onClick={() => void processFile(lastFile, 'lenient')} 
                  className="btn-primary py-2 px-6 text-sm flex items-center gap-2 shadow-lg shadow-primary/20"
                >
                  {busy === 'import' ? (
                    <ArrowClockwiseIcon size={18} className="animate-spin" />
                  ) : (
                    <CheckCircleIcon size={18} weight="bold" />
                  )}
                  Hatalı Satırları Atla ve Devam Et
                  {errorModal.validRowCount !== undefined && errorModal.validRowCount > 0 && (
                    <span className="font-semibold">({errorModal.validRowCount} satır)</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

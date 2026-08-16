import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  FileTextIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
  XIcon,
} from '@phosphor-icons/react';
import type { ExcelErrorCategory, ExcelImportRowErrors, ExcelImportSummary } from './ExcelManager';
import type { MaterialCategory } from '../models';
import type {
  CategoryResolutionDecision,
  UnmatchedCategoryLookup,
} from '../types/inventoryExcelImport';
import UnmatchedCategoryResolutionPanel from './UnmatchedCategoryResolutionPanel';

export interface ExcelPreviewValidRow {
  row: number;
  sheet: string;
  action?: 'create' | 'update';
  values: Record<string, string | number | boolean | null>;
}

interface ExcelImportPreviewModalProps {
  fileName: string;
  message?: string;
  summary?: ExcelImportSummary;
  validRows: ExcelPreviewValidRow[];
  errorsByRow: ExcelImportRowErrors[];
  validRowCount: number;
  canPartialImport: boolean;
  busy: boolean;
  modalZClass?: string;
  onCancel: () => void;
  onConfirmAll: () => void;
  onConfirmValidOnly: () => void;
  unmatchedCategories?: UnmatchedCategoryLookup[];
  categories?: MaterialCategory[];
  canCreateCategories?: boolean;
  skippedCategoryNames?: string[];
  resolvingCategories?: boolean;
  onResolveCategories?: (decisions: CategoryResolutionDecision[]) => void;
}

type PreviewTab = 'unmatched' | 'valid' | 'invalid';

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

function formatPreviewValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  return String(value);
}

function actionBadge(action?: 'create' | 'update') {
  if (action === 'update') {
    return (
      <span className="px-1.5 py-0.5 rounded border text-[10px] font-bold bg-accent/10 text-accent border-accent/20">
        Güncellenecek
      </span>
    );
  }
  if (action === 'create') {
    return (
      <span className="px-1.5 py-0.5 rounded border text-[10px] font-bold bg-success/10 text-success border-success/20">
        Yeni
      </span>
    );
  }
  return null;
}

export default function ExcelImportPreviewModal({
  fileName,
  message,
  summary,
  validRows,
  errorsByRow,
  validRowCount,
  canPartialImport,
  busy,
  modalZClass = 'z-[70]',
  onCancel,
  onConfirmAll,
  onConfirmValidOnly,
  unmatchedCategories = [],
  categories = [],
  canCreateCategories = false,
  skippedCategoryNames = [],
  resolvingCategories = false,
  onResolveCategories,
}: ExcelImportPreviewModalProps) {
  const problemCount = errorsByRow.length;
  const hasProblems = problemCount > 0;
  const hasUnmatchedCategories = unmatchedCategories.length > 0;
  const canImportAll = validRowCount > 0 && !hasProblems;
  const canImportValidOnly = canPartialImport && validRowCount > 0 && hasProblems;
  const nothingToImport = validRowCount === 0;
  const [tab, setTab] = useState<PreviewTab>(
    hasUnmatchedCategories ? 'unmatched' : hasProblems && validRowCount === 0 ? 'invalid' : 'valid'
  );
  const showUpsertBreakdown =
    typeof summary?.createCount === 'number' || typeof summary?.updateCount === 'number';
  const hasActionColumn = validRows.some((row) => row.action === 'create' || row.action === 'update');
  const isBusy = busy || resolvingCategories;

  useEffect(() => {
    if (!hasUnmatchedCategories && tab === 'unmatched') {
      setTab(validRowCount > 0 ? 'valid' : 'invalid');
    }
  }, [hasUnmatchedCategories, tab, validRowCount]);

  const previewColumns = useMemo(() => {
    const keys = new Set<string>();
    validRows.forEach((row) => {
      Object.keys(row.values || {}).forEach((key) => keys.add(key));
    });
    return Array.from(keys);
  }, [validRows]);

  return createPortal(
    <div
      className={`fixed inset-0 bg-black/50 flex items-center justify-center p-4 ${modalZClass}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="excel-preview-title"
    >
      <div className="bg-background-panel rounded-panel w-full max-w-4xl max-h-[85vh] shadow-xl flex flex-col border border-background-border">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-background-border shrink-0">
          <div>
            <h3 id="excel-preview-title" className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <FileTextIcon size={22} className="text-accent" />
              İçe aktarma önizlemesi
            </h3>
            <p className="text-sm text-text-secondary mt-1">
              {fileName}
              {message ? ` — ${message}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-background-hover"
            aria-label="Kapat"
          >
            <XIcon size={22} />
          </button>
        </div>

        {summary && (
          <div
            className={`p-4 bg-background-muted/30 border-b border-background-border shrink-0 grid gap-4 ${
              showUpsertBreakdown ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
            }`}
          >
            <div className="bg-background-panel border border-background-border p-3 rounded-md flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent shrink-0">
                <FileTextIcon size={20} weight="bold" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Toplam Satır</div>
                <div className="text-xl font-bold text-text-primary tabular-nums">{summary.totalRows}</div>
              </div>
            </div>
            {showUpsertBreakdown ? (
              <>
                <div className="bg-background-panel border border-background-border p-3 rounded-md flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center text-success shrink-0">
                    <CheckCircleIcon size={20} weight="bold" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Yeni</div>
                    <div className="text-xl font-bold text-success tabular-nums">{summary.createCount ?? 0}</div>
                  </div>
                </div>
                <div className="bg-background-panel border border-background-border p-3 rounded-md flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent shrink-0">
                    <UploadSimpleIcon size={20} weight="bold" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Güncellenecek</div>
                    <div className="text-xl font-bold text-accent tabular-nums">{summary.updateCount ?? 0}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-background-panel border border-background-border p-3 rounded-md flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center text-success shrink-0">
                  <CheckCircleIcon size={20} weight="bold" />
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Yüklenecek</div>
                  <div className="text-xl font-bold text-success tabular-nums">{validRowCount}</div>
                </div>
              </div>
            )}
            <div className="bg-background-panel border border-background-border p-3 rounded-md flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center text-error shrink-0">
                <WarningCircleIcon size={20} weight="bold" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Sorunlu</div>
                <div className="text-xl font-bold text-error tabular-nums">{problemCount}</div>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 pt-3 shrink-0 flex items-center gap-2 flex-wrap">
          {hasUnmatchedCategories && (
            <button
              type="button"
              onClick={() => setTab('unmatched')}
              className={`px-3 py-1.5 text-sm rounded-md border ${
                tab === 'unmatched'
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-background-border text-text-secondary hover:bg-background-hover'
              }`}
            >
              Eşleşmeyen kategoriler ({unmatchedCategories.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('valid')}
            className={`px-3 py-1.5 text-sm rounded-md border ${
              tab === 'valid'
                ? 'border-success/40 bg-success/10 text-success'
                : 'border-background-border text-text-secondary hover:bg-background-hover'
            }`}
          >
            Yüklenecek ({validRowCount})
          </button>
          <button
            type="button"
            onClick={() => setTab('invalid')}
            className={`px-3 py-1.5 text-sm rounded-md border ${
              tab === 'invalid'
                ? 'border-error/40 bg-error/10 text-error'
                : 'border-background-border text-text-secondary hover:bg-background-hover'
            }`}
          >
            Sorunlu ({problemCount})
          </button>
        </div>

        <div className="overflow-auto flex-1 p-4 space-y-3">
          {tab === 'unmatched' && onResolveCategories && (
            <UnmatchedCategoryResolutionPanel
              unmatchedCategories={unmatchedCategories}
              categories={categories}
              canCreateCategories={canCreateCategories}
              skippedNames={skippedCategoryNames}
              busy={isBusy}
              onApply={onResolveCategories}
            />
          )}

          {tab === 'valid' &&
            (validRows.length === 0 ? (
              <p className="text-sm text-text-secondary py-8 text-center">Yüklenebilir satır yok.</p>
            ) : (
              <div className="overflow-x-auto border border-background-border rounded-md">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-background-border text-left text-text-secondary bg-background-muted/40">
                      <th className="py-2 px-2 font-medium w-14 text-center">Satır</th>
                      {hasActionColumn && <th className="py-2 px-2 font-medium w-28">İşlem</th>}
                      {previewColumns.map((column) => (
                        <th key={column} className="py-2 px-2 font-medium whitespace-nowrap">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.map((row) => (
                      <tr key={`${row.sheet}-${row.row}`} className="border-b border-background-border/80">
                        <td className="py-2 px-2 text-center tabular-nums font-semibold text-text-primary">{row.row}</td>
                        {hasActionColumn && <td className="py-2 px-2">{actionBadge(row.action)}</td>}
                        {previewColumns.map((column) => (
                          <td key={column} className="py-2 px-2 text-text-secondary">
                            {formatPreviewValue(row.values[column])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

          {tab === 'invalid' &&
            (errorsByRow.length === 0 ? (
              <p className="text-sm text-text-secondary py-8 text-center">Sorunlu satır yok.</p>
            ) : (
              <div className="space-y-3">
                {errorsByRow.map((rowErr) => (
                  <div
                    key={`${rowErr.sheet}-${rowErr.row}`}
                    className="rounded-md border border-background-border bg-background-muted/20 p-3"
                  >
                    <strong className="text-sm text-text-primary">
                      Excel&apos;de {rowErr.sheet ? `${rowErr.sheet} / ` : ''}
                      {rowErr.row}. satır
                    </strong>
                    {rowErr.summary && <p className="text-xs text-text-secondary mt-1">{rowErr.summary}</p>}
                    <ul className="mt-2 space-y-1.5 list-disc list-inside text-xs text-text-secondary">
                      {rowErr.issues.map((issue, i) => (
                        <li key={`${rowErr.row}-${issue.column}-${i}`} className="leading-relaxed">
                          <span>{issue.displayMessage}</span>
                          {issue.category && (
                            <span
                              className={`ml-2 px-1.5 py-0.5 rounded border text-[10px] font-bold align-middle ${
                                CATEGORY_BADGE_CLASSES[issue.category]
                              }`}
                            >
                              {CATEGORY_BADGE_LABELS[issue.category]}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
        </div>

        {hasUnmatchedCategories && (
          <div className="px-4 py-2 bg-accent/10 border-t border-background-border text-sm text-text-primary">
            Eşleşmeyen kategorileri çözmeden bu satırlar yüklenmez. Önce oluşturun veya mevcut kategoriye eşleyin.
          </div>
        )}

        {hasProblems && canImportValidOnly && !hasUnmatchedCategories && (
          <div className="px-4 py-2 bg-warning/10 border-t border-background-border text-sm text-text-primary">
            Sorunlu satırlar içe aktarılmaz. İsterseniz yalnızca geçerli {validRowCount} satırı yükleyebilirsiniz.
          </div>
        )}

        {nothingToImport && (
          <div className="px-4 py-2 bg-error/10 border-t border-background-border text-sm text-error">
            Yüklenebilir satır yok. Excel dosyasındaki hataları düzeltip tekrar deneyin.
          </div>
        )}

        <div className="p-4 border-t border-background-border flex flex-wrap justify-between items-center gap-3 shrink-0">
          <button type="button" onClick={onCancel} disabled={isBusy} className="btn-secondary py-2 px-4 text-sm">
            Vazgeç
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {canImportValidOnly && (
              <button
                type="button"
                disabled={isBusy}
                onClick={onConfirmValidOnly}
                className="btn-secondary py-2 px-4 text-sm inline-flex items-center gap-2"
              >
                {isBusy ? (
                  <ArrowClockwiseIcon size={16} className="animate-spin shrink-0" />
                ) : (
                  <CheckCircleIcon size={16} weight="bold" />
                )}
                Geçerli {validRowCount} satırı yükle
              </button>
            )}
            {canImportAll && (
              <button
                type="button"
                disabled={isBusy}
                onClick={onConfirmAll}
                className="btn-primary py-2 px-4 text-sm inline-flex items-center gap-2"
              >
                {isBusy ? (
                  <ArrowClockwiseIcon size={16} className="animate-spin shrink-0" />
                ) : (
                  <UploadSimpleIcon size={16} weight="bold" />
                )}
                {validRowCount} satırı içe aktar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

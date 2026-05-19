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
  message?: string;
  summary?: ExcelImportSummary;
  errors?: ExcelImportErrorRow[];
  count?: number;
}

type Busy = null | 'export' | 'import';

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
    summary?: ExcelImportSummary;
    isPartialSuccess?: boolean;
    canRetry?: boolean;
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
      const { blob, filename } = await apiClient.getBlobDownload(`/excel/export/${type}`);
      triggerBlobDownload(blob, `export_${type}.xlsx`, filename);
      toast.success(
        type === 'customers'
          ? 'Müşteri Excel şablonu indirildi (Customers + CustomerContacts).'
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
    async (file: File, mode: 'strict' | 'lenient' = 'strict') => {
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
          const rows = Array.isArray(data.errors) ? data.errors : [];
          
          if (data.partial) {
            // Lenient modda bir başarı var; dosyayı temizle
            toast.warning(
              data.message ||
                (type === 'customers'
                  ? 'Müşteri içe aktarma kısmen tamamlandı. CustomerContacts iş kuralları nedeniyle bazı satırlar atlandı.'
                  : 'İçe aktarma kısmen tamamlandı.')
            );
            setLastFile(null);
            onImportSuccess?.();
          } else {
            // Hata var ve henüz bir şey kaydedilmedi (Strict moddayız muhtemelen)
            // Kullanıcı isterse "Esnek" (Lenient) modda retry yapabilir
            setLastFile(file);
          }

          setErrorModal({
            message: data.message || 'İçe aktarma sırasında sorunlar oluştu.',
            errors: rows,
            summary: data.summary,
            isPartialSuccess: data.partial,
            canRetry: !data.partial && rows.length > 0 && mode === 'strict',
          });
          return;
        }

        toast.error('Beklenmeyen sunucu yanıtı.');
      } catch (e) {
        console.error('Excel import error:', e);
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
      : 'Excel dosyası seçin veya .xlsx / .xls dosyasını bu düğmelerin üzerine sürükleyip bırakın.');
  const shouldShowImportInfoModal = type === 'customers' || type === 'inventory';
  const importInfoTitle = type === 'customers' ? 'Müşteri Excel İçe Aktarma' : 'Envanter Excel İçe Aktarma';
  const importInfoHint =
    type === 'customers'
      ? CUSTOMERS_EXCEL_HELP.hint
      : 'Envanter içe aktarma işlemi için dosyanızı buradan seçebilirsiniz.';
  const importInfoChecklist =
    type === 'customers'
      ? `Kontrol listesi: ${CUSTOMERS_EXCEL_HELP.checklist}`
      : 'Kontrol listesi: Şablonu dışa aktar ile indirip doldurun, ardından bu pencereden dosyayı seçin.';
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

      {errorModal && (
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

            <div className="overflow-auto flex-1 p-4">
              {errorModal.errors.length === 0 ? (
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
                      <th className="py-2 px-2 font-medium w-32">Sütun</th>
                      <th className="py-2 px-2 font-medium w-max min-w-[220px]">Hata</th>
                      <th className="py-2 px-2 font-medium w-24">Tip</th>
                      <th className="py-2 px-2 font-medium">Girdi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorModal.errors.map((err: ExcelImportErrorRow, i: number) => {
                      const categoryLabels: Record<string, string> = {
                        COERCION: 'Format',
                        VALIDATION: 'Doğrulama',
                        BUSINESS: 'İş Kuralı',
                      };
                      const categoryColors: Record<string, string> = {
                        COERCION: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
                        VALIDATION: 'bg-error/10 text-error border-error/20',
                        BUSINESS: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
                      };

                      return (
                        <tr
                          key={`${err.row}-${err.column}-${i}`}
                          className="border-b border-background-border/80 hover:bg-background-hover/40 transition-colors"
                        >
                          <td className="py-2 px-2 text-text-primary tabular-nums font-semibold text-center">{err.row}</td>
                          <td className="py-2 px-2 text-text-primary font-medium">{err.sheet ? String(err.sheet) : '-'}</td>
                          <td className="py-2 px-2 text-text-primary font-medium">{err.column}</td>
                          <td className="py-2 px-2 text-text-secondary leading-relaxed">{err.error}</td>
                          <td className="py-2 px-2">
                            {err.category && (
                              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${categoryColors[err.category] || ''}`}>
                                {categoryLabels[err.category] || err.category}
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
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {errorModal.canRetry && (
              <div className="px-4 py-2 bg-warning/10 border-b border-background-border flex items-center gap-2 text-warning text-[11px] font-medium">
                <WarningCircleIcon size={16} weight="fill" />
                <span>Hata bulguları nedeniyle hiçbir veri kaydedilmedi. Hataları atlayarak sadece doğru satırları yüklemek ister misiniz?</span>
              </div>
            )}

            <div className="p-4 border-t border-background-border flex justify-between items-center gap-3 shrink-0">
              <button 
                type="button" 
                onClick={() => { setErrorModal(null); setLastFile(null); }} 
                className="btn-secondary py-2 px-4 text-sm"
              >
                {errorModal.canRetry ? 'Tamamını İptal Et' : 'Kapat'}
              </button>

              {errorModal.canRetry && lastFile && (
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
                  Hataları Atla ve Yine de Yükle
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

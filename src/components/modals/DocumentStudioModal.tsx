import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowClockwiseIcon,
  CopyIcon,
  FileDocIcon,
  FilePdfIcon,
  FileTextIcon,
  GearSixIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  PencilSimpleIcon,
  PlusIcon,
  StarIcon,
  WarningIcon,
  XIcon,
} from '@phosphor-icons/react';
import { usePortalTarget } from '../tabs/TabContext';
import { getApiErrorMessage } from '../../utils/apiError';
import PdfPagesView, { validatePdfBlob } from './PdfPagesView';

export interface DocumentStudioTemplate {
  TemplateId: number;
  TemplateName: string;
  IsDefault?: boolean;
}

/** Belge Merkezi'nde seçilebilen bir belge türü (Teklif, Sözleşme, Kullanım Extresi …). */
export interface DocumentStudioKind {
  id: string;
  label: string;
  /** Liste üstünde gösterilen kısa açıklama (örn. hangi kaydın verisi kullanılıyor). */
  hint?: string;
  templates: DocumentStudioTemplate[];
  selectedTemplateId: number | '';
  onSelect: (templateId: number) => void;
  /** Seçili şablonu kaydın verisiyle PDF olarak üretir. */
  render: (templateId: number) => Promise<Blob>;
  /** Verilmezse indirme düğmeleri gizlenir. */
  download?: (templateId: number, format: 'pdf' | 'docx') => Promise<void>;
  onEdit?: (templateId: number) => void;
  onCreate?: () => void;
  onCopy?: (templateId: number) => Promise<void>;
  /** Tür ilk kez seçildiğinde çalışır (örn. Extre şablonu yoksa oluştur). */
  onActivate?: () => Promise<void>;
  emptyText?: string;
}

interface DocumentStudioModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  kinds: DocumentStudioKind[];
  activeKindId: string;
  onActiveKindChange: (kindId: string) => void;
  onClose: () => void;
  onManageTemplates?: () => void;
  /** Değiştiğinde (şablon kaydedildi, kayıt güncellendi…) önbellekteki önizlemeler atılır. */
  refreshToken?: string | number;
  /** Üstte gösterilecek uyarı (örn. kaydedilmemiş değişiklikler). */
  notice?: string | null;
}

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5];
const A4_WIDTH_PX = 794;

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error'; message: string };

export default function DocumentStudioModal({
  open,
  title,
  subtitle,
  kinds,
  activeKindId,
  onActiveKindChange,
  onClose,
  onManageTemplates,
  refreshToken,
  notice,
}: DocumentStudioModalProps) {
  const portalTarget = usePortalTarget();
  const activeKind = kinds.find((k) => k.id === activeKindId) ?? kinds[0];
  const selectedTemplateId = activeKind?.selectedTemplateId || null;

  const cacheRef = useRef(new Map<string, string>());
  const requestSeq = useRef(0);
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle' });
  const [reloadNonce, setReloadNonce] = useState(0);
  const [activatingKind, setActivatingKind] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<'pdf' | 'docx' | null>(null);
  const [copyingId, setCopyingId] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState(0);

  const viewerRef = useRef<HTMLDivElement>(null);
  const [viewerWidth, setViewerWidth] = useState(A4_WIDTH_PX);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');

  const clearCache = useCallback(() => {
    cacheRef.current.forEach((url) => URL.revokeObjectURL(url));
    cacheRef.current.clear();
  }, []);

  // Kayıt/şablon değişince önbelleği at.
  useEffect(() => {
    clearCache();
  }, [refreshToken, clearCache]);

  // Kapanınca / unmount'ta blob URL'leri serbest bırak.
  useEffect(() => {
    if (!open) clearCache();
    return () => clearCache();
  }, [open, clearCache]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = viewerRef.current;
    if (!el) return;
    const update = () => setViewerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // Seçili şablonun önizlemesini getir (önbellekten veya sunucudan).
  useEffect(() => {
    if (!open || !activeKind || !selectedTemplateId) {
      setPreview({ status: 'idle' });
      return;
    }
    const cacheKey = `${activeKind.id}:${selectedTemplateId}:${refreshToken ?? ''}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setPreview({ status: 'ready', url: cached });
      return;
    }
    const seq = ++requestSeq.current;
    setPreview({ status: 'loading' });
    setPageCount(0);
    (async () => {
      try {
        const blob = await activeKind.render(Number(selectedTemplateId));
        const invalid = await validatePdfBlob(blob);
        if (seq !== requestSeq.current) return;
        if (invalid) {
          setPreview({ status: 'error', message: invalid });
          return;
        }
        const url = URL.createObjectURL(blob);
        cacheRef.current.set(cacheKey, url);
        setPreview({ status: 'ready', url });
      } catch (error) {
        if (seq !== requestSeq.current) return;
        setPreview({ status: 'error', message: getApiErrorMessage(error) || 'Önizleme oluşturulamadı' });
      }
    })();
    // activeKind.render her render'da yeni referans olabilir; tür/şablon/yenileme yeterli anahtar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeKind?.id, selectedTemplateId, refreshToken, reloadNonce]);

  const handleKindChange = async (kind: DocumentStudioKind) => {
    onActiveKindChange(kind.id);
    if (kind.onActivate) {
      try {
        setActivatingKind(kind.id);
        await kind.onActivate();
      } finally {
        setActivatingKind(null);
      }
    }
  };

  const handleReload = () => {
    if (!activeKind || !selectedTemplateId) return;
    const prefix = `${activeKind.id}:${selectedTemplateId}:`;
    for (const [key, url] of cacheRef.current) {
      if (key.startsWith(prefix)) {
        URL.revokeObjectURL(url);
        cacheRef.current.delete(key);
      }
    }
    setReloadNonce((n) => n + 1);
  };

  const handleDownload = async (format: 'pdf' | 'docx') => {
    if (!activeKind?.download || !selectedTemplateId) return;
    try {
      setDownloading(format);
      await activeKind.download(Number(selectedTemplateId), format);
    } finally {
      setDownloading(null);
    }
  };

  const handleCopy = async (templateId: number) => {
    if (!activeKind?.onCopy) return;
    try {
      setCopyingId(templateId);
      await activeKind.onCopy(templateId);
    } finally {
      setCopyingId(null);
    }
  };

  const fitWidth = Math.max(320, Math.min(viewerWidth - 48, A4_WIDTH_PX));
  const pageWidth = zoom === 'fit' ? fitWidth : Math.round(A4_WIDTH_PX * zoom);
  const zoomPercent = Math.round((pageWidth / A4_WIDTH_PX) * 100);

  const stepZoom = (dir: 1 | -1) => {
    const current = pageWidth / A4_WIDTH_PX;
    const next =
      dir === 1
        ? ZOOM_STEPS.find((z) => z > current + 0.001)
        : [...ZOOM_STEPS].reverse().find((z) => z < current - 0.001);
    if (next) setZoom(next);
  };

  if (!open || !activeKind) return null;

  const selectedTemplate = activeKind.templates.find((t) => t.TemplateId === selectedTemplateId);
  const isActivating = activatingKind === activeKind.id;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-background-main" role="dialog" aria-label={title}>
      {/* Üst çubuk */}
      <header className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-background-border bg-background-panel">
        <FileTextIcon size={22} className="text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-text-primary truncate">{title}</h2>
          {subtitle && <p className="text-[11px] text-text-secondary truncate">{subtitle}</p>}
        </div>
        {activeKind.download && (
          <>
            <button
              type="button"
              onClick={() => void handleDownload('docx')}
              disabled={!selectedTemplateId || downloading !== null}
              className="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1.5"
            >
              <FileDocIcon size={16} />
              {downloading === 'docx' ? 'Hazırlanıyor…' : 'Word'}
            </button>
            <button
              type="button"
              onClick={() => void handleDownload('pdf')}
              disabled={!selectedTemplateId || downloading !== null}
              className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1.5"
            >
              <FilePdfIcon size={16} />
              {downloading === 'pdf' ? 'Hazırlanıyor…' : 'PDF indir'}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
          aria-label="Kapat"
          title="Kapat"
        >
          <XIcon size={20} />
        </button>
      </header>

      {notice && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 text-[11px] bg-warning/10 text-warning border-b border-warning/30">
          <WarningIcon size={14} className="shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        {/* Sol panel: belge türü + şablonlar */}
        <aside className="w-[280px] shrink-0 flex flex-col border-r border-background-border bg-background-panel">
          {kinds.length > 1 && (
            <div className="p-3 border-b border-background-border">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-1.5">
                Belge türü
              </div>
              <div className="flex flex-col gap-1">
                {kinds.map((kind) => {
                  const isActive = kind.id === activeKind.id;
                  return (
                    <button
                      key={kind.id}
                      type="button"
                      onClick={() => void handleKindChange(kind)}
                      disabled={activatingKind !== null}
                      className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-left transition-colors ${
                        isActive
                          ? 'bg-primary text-white'
                          : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
                      }`}
                    >
                      <span className="font-medium">{kind.label}</span>
                      <span className={`text-[10px] ${isActive ? 'text-white/80' : 'text-text-secondary'}`}>
                        {activatingKind === kind.id ? '…' : kind.templates.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="px-3 pt-3 pb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
              {activeKind.label} şablonları
            </span>
            {activeKind.onCreate && (
              <button
                type="button"
                onClick={activeKind.onCreate}
                className="flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <PlusIcon size={12} weight="bold" />
                Yeni
              </button>
            )}
          </div>
          {activeKind.hint && <p className="px-3 pb-2 text-[11px] text-text-secondary">{activeKind.hint}</p>}

          <div className="flex-1 min-h-0 overflow-auto px-2 pb-2">
            {isActivating ? (
              <div className="px-2 py-6 text-center text-xs text-text-secondary">Hazırlanıyor…</div>
            ) : activeKind.templates.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-text-secondary">
                {activeKind.emptyText ?? 'Bu tür için şablon yok.'}
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {activeKind.templates.map((t) => {
                  const isSelected = t.TemplateId === selectedTemplateId;
                  return (
                    <li key={t.TemplateId}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => activeKind.onSelect(t.TemplateId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            activeKind.onSelect(t.TemplateId);
                          }
                        }}
                        onDoubleClick={() => activeKind.onEdit?.(t.TemplateId)}
                        className={`group flex items-center gap-2 rounded-md border px-2.5 py-2 cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/10'
                            : 'border-transparent hover:bg-background-hover'
                        }`}
                        title={activeKind.onEdit ? 'Seç · çift tıkla düzenle' : undefined}
                      >
                        <FileTextIcon
                          size={16}
                          className={isSelected ? 'text-primary shrink-0' : 'text-text-secondary shrink-0'}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-text-primary truncate">{t.TemplateName}</div>
                          {t.IsDefault && (
                            <div className="flex items-center gap-0.5 text-[10px] text-warning">
                              <StarIcon size={10} weight="fill" />
                              Varsayılan
                            </div>
                          )}
                        </div>
                        <div
                          className={`flex items-center gap-0.5 ${
                            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          } transition-opacity`}
                        >
                          {activeKind.onCopy && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleCopy(t.TemplateId);
                              }}
                              disabled={copyingId !== null}
                              className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-background-border"
                              title="Kopyasını oluştur"
                            >
                              <CopyIcon size={14} />
                            </button>
                          )}
                          {activeKind.onEdit && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                activeKind.onEdit?.(t.TemplateId);
                              }}
                              className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-background-border"
                              title="Şablonu düzenle"
                            >
                              <PencilSimpleIcon size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {onManageTemplates && (
            <button
              type="button"
              onClick={onManageTemplates}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 border-t border-background-border text-[11px] text-text-secondary hover:text-text-primary hover:bg-background-hover"
            >
              <GearSixIcon size={14} />
              Tüm şablonları yönet
            </button>
          )}
        </aside>

        {/* Önizleme */}
        <section className="flex-1 min-w-0 flex flex-col">
          <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-background-border bg-background-panel/60">
            <span className="text-xs text-text-primary font-medium truncate">
              {selectedTemplate ? selectedTemplate.TemplateName : 'Şablon seçilmedi'}
            </span>
            {pageCount > 0 && preview.status === 'ready' && (
              <span className="text-[11px] text-text-secondary">· {pageCount} sayfa</span>
            )}
            <div className="ml-auto flex items-center gap-1">
              {selectedTemplateId && activeKind.onEdit && (
                <button
                  type="button"
                  onClick={() => activeKind.onEdit?.(Number(selectedTemplateId))}
                  className="btn-secondary !py-1 !px-2.5 text-[11px] flex items-center gap-1 mr-2"
                >
                  <PencilSimpleIcon size={13} />
                  Düzenle
                </button>
              )}
              <button
                type="button"
                onClick={() => stepZoom(-1)}
                className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-background-hover"
                title="Uzaklaştır"
              >
                <MagnifyingGlassMinusIcon size={16} />
              </button>
              <button
                type="button"
                onClick={() => setZoom('fit')}
                className={`min-w-[52px] rounded px-1.5 py-0.5 text-[11px] tabular-nums ${
                  zoom === 'fit' ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
                title="Genişliğe sığdır"
              >
                {zoomPercent}%
              </button>
              <button
                type="button"
                onClick={() => stepZoom(1)}
                className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-background-hover"
                title="Yakınlaştır"
              >
                <MagnifyingGlassPlusIcon size={16} />
              </button>
              <button
                type="button"
                onClick={handleReload}
                disabled={!selectedTemplateId || preview.status === 'loading'}
                className="ml-1 p-1 rounded text-text-secondary hover:text-text-primary hover:bg-background-hover disabled:opacity-40"
                title="Önizlemeyi yenile"
              >
                <ArrowClockwiseIcon size={16} />
              </button>
            </div>
          </div>

          <div ref={viewerRef} className="flex-1 min-h-0 overflow-auto bg-background-main">
            <div className="flex flex-col items-center gap-4 py-6 px-6 min-h-full">
              {preview.status === 'idle' && (
                <div className="mt-20 text-sm text-text-secondary">
                  Önizlemek için soldan bir şablon seçin.
                </div>
              )}
              {preview.status === 'loading' && (
                <div className="mt-20 flex flex-col items-center gap-3 text-sm text-text-secondary">
                  <div className="animate-spin w-7 h-7 border-2 border-primary border-t-transparent rounded-full" />
                  Belge hazırlanıyor…
                </div>
              )}
              {preview.status === 'error' && (
                <div className="mt-20 flex flex-col items-center gap-3 max-w-md text-center">
                  <WarningIcon size={28} className="text-error" />
                  <div className="text-sm text-error">{preview.message}</div>
                  <button type="button" onClick={handleReload} className="btn-secondary !py-1 !px-3 text-xs">
                    Tekrar dene
                  </button>
                </div>
              )}
              {preview.status === 'ready' && (
                <PdfPagesView pdfUrl={preview.url} pageWidth={pageWidth} onPageCount={setPageCount} />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>,
    portalTarget
  );
}

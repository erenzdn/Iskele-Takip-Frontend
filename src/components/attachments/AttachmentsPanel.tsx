import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DownloadSimpleIcon,
  FilePdfIcon,
  PaperclipIcon,
  TrashIcon,
  UploadSimpleIcon,
  XIcon,
} from '@phosphor-icons/react';
import type { Attachment, AttachmentCategory, AttachmentEntityType } from '../../models';
import {
  ACCEPTED_ATTACHMENT_TYPES,
  ATTACHMENT_CATEGORY_LABELS,
  attachmentService,
} from '../../services/attachmentService';
import { useAuthStore } from '../../store/authStore';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatDateTime } from '../../utils/formatters';
import { toast } from '../../hooks/useToast';
import { usePortalTarget } from '../tabs/TabContext';
import PdfPreviewModal from '../modals/PdfPreviewModal';
import ConfirmModal from '../modals/ConfirmModal';

interface AttachmentsPanelProps {
  entityType: AttachmentEntityType;
  entityId: number;
  /** Seçilebilir kategoriler; ilki varsayılan */
  categories: AttachmentCategory[];
  /** true: yükleme/silme gizlenir (yalnızca görüntüleme) */
  readOnly?: boolean;
  title?: string;
  /** Liste değiştiğinde (yükleme/silme) güncel ek sayısı */
  onCountChange?: (count: number) => void;
  /** Liste değiştiğinde güncel ekler (kategoriye göre kontrol için) */
  onItemsChange?: (items: Attachment[]) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const isImage = (a: Attachment) => a.MimeType.startsWith('image/');

function triggerDownload(url: string, fileName: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Bir kayda (sevkiyat fişi, sözleşme…) bağlı dosya ekleri: listeleme, sürükle-bırak yükleme,
 * görsel/PDF önizleme, indirme ve silme. Görseller yüklemeden önce sıkıştırılır.
 */
export default function AttachmentsPanel({
  entityType,
  entityId,
  categories,
  readOnly = false,
  title = 'Dosya ekleri',
  onCountChange,
  onItemsChange,
}: AttachmentsPanelProps) {
  const user = useAuthStore((s) => s.user);
  const canUpload = !readOnly && Boolean(user?.permissions?.includes('attachments_upload'));
  const canDelete = !readOnly && Boolean(user?.permissions?.includes('attachments_delete'));
  const portalTarget = usePortalTarget();

  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState<AttachmentCategory>(categories[0] ?? 'OTHER');
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [imagePreview, setImagePreview] = useState<Attachment | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; attachment: Attachment } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbsRef = useRef<Record<number, string>>({});
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;
  const onItemsChangeRef = useRef(onItemsChange);
  onItemsChangeRef.current = onItemsChange;

  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      setItems(await attachmentService.listAsync(entityType, entityId));
      setLoaded(true);
    } catch (err) {
      setLoadError(getApiErrorMessage(err) || 'Dosya ekleri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  // Liste yüklendikten sonraki her değişimde sayıyı üst bileşene bildir (rozetler için)
  useEffect(() => {
    if (loaded) onCountChangeRef.current?.(items.length);
  }, [loaded, items.length]);

  useEffect(() => {
    if (loaded) onItemsChangeRef.current?.(items);
  }, [loaded, items]);

  useEffect(() => {
    void load();
  }, [load]);

  // Görsel küçük resimleri: her görsel bir kez indirilir, panel kapanınca blob URL'leri bırakılır
  useEffect(() => {
    let cancelled = false;
    const missing = items.filter((a) => isImage(a) && !thumbsRef.current[a.AttachmentId]);
    for (const a of missing) {
      attachmentService
        .getFileBlobAsync(a.AttachmentId)
        .then((blob) => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          thumbsRef.current = { ...thumbsRef.current, [a.AttachmentId]: url };
          setThumbs(thumbsRef.current);
        })
        .catch(() => {
          /* küçük resim gösterilemezse dosya simgesi kalır */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(
    () => () => {
      Object.values(thumbsRef.current).forEach((url) => URL.revokeObjectURL(url));
    },
    []
  );

  useEffect(
    () => () => {
      if (pdfPreview) URL.revokeObjectURL(pdfPreview.url);
    },
    [pdfPreview]
  );

  const uploadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0 || uploadProgress) return;
    const uploaded: Attachment[] = [];
    setUploadProgress({ done: 0, total: files.length });
    for (const [index, file] of files.entries()) {
      try {
        uploaded.push(await attachmentService.uploadAsync({ entityType, entityId, file, category }));
      } catch (err) {
        toast.error(getApiErrorMessage(err) || `"${file.name}" yüklenemedi.`);
      }
      setUploadProgress({ done: index + 1, total: files.length });
    }
    setUploadProgress(null);
    if (uploaded.length > 0) {
      setItems((prev) => [...prev, ...uploaded]);
      toast.success(uploaded.length === 1 ? 'Dosya eklendi.' : `${uploaded.length} dosya eklendi.`);
    }
  };

  const openAttachment = async (a: Attachment) => {
    if (isImage(a)) {
      setImagePreview(a);
      return;
    }
    try {
      const blob = await attachmentService.getFileBlobAsync(a.AttachmentId);
      setPdfPreview({ url: URL.createObjectURL(blob), attachment: a });
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Dosya açılamadı.');
    }
  };

  const download = async (a: Attachment) => {
    const cached = thumbs[a.AttachmentId];
    if (cached) {
      triggerDownload(cached, a.FileName);
      return;
    }
    try {
      const url = URL.createObjectURL(await attachmentService.getFileBlobAsync(a.AttachmentId));
      triggerDownload(url, a.FileName);
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Dosya indirilemedi.');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await attachmentService.deleteAsync(deleteTarget.AttachmentId);
      const deletedId = deleteTarget.AttachmentId;
      setItems((prev) => prev.filter((a) => a.AttachmentId !== deletedId));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Dosya silinemedi.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h5 className="text-xs font-semibold flex items-center gap-1">
          <PaperclipIcon size={14} /> {title}
          {items.length > 0 && <span className="text-text-secondary font-normal">({items.length})</span>}
        </h5>
        {canUpload && (
          <div className="ml-auto flex items-center gap-1.5">
            {categories.length > 1 && (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as AttachmentCategory)}
                className="input py-0.5 px-1.5 text-xs"
                title="Eklenecek dosyaların türü"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {ATTACHMENT_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="btn-secondary py-0.5 px-2 text-xs inline-flex items-center gap-1 disabled:opacity-60"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadProgress != null}
            >
              <UploadSimpleIcon size={13} />
              {uploadProgress ? `Yükleniyor ${uploadProgress.done}/${uploadProgress.total}` : 'Dosya ekle'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_ATTACHMENT_TYPES.join(',')}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void uploadFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-[11px] text-text-secondary">Yükleniyor…</p>
      ) : loadError ? (
        <p className="text-[11px] text-red-400">{loadError}</p>
      ) : (
        <div
          className={`rounded border border-dashed p-2 transition-colors ${
            dragOver ? 'border-accent bg-accent/10' : 'border-background-border'
          }`}
          onDragOver={(e) => {
            if (!canUpload) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            if (!canUpload) return;
            e.preventDefault();
            setDragOver(false);
            void uploadFiles(e.dataTransfer.files);
          }}
        >
          {items.length === 0 ? (
            <p className="text-[11px] text-text-secondary text-center py-2">
              {canUpload
                ? 'Henüz dosya yok. İmzalı irsaliyeyi veya fotoğrafları buraya sürükleyin ya da "Dosya ekle"ye tıklayın.'
                : 'Henüz dosya eklenmemiş.'}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {items.map((a) => (
                <li
                  key={a.AttachmentId}
                  className="group relative w-28 rounded border border-background-border bg-background-panel overflow-hidden"
                  title={[
                    a.FileName,
                    ATTACHMENT_CATEGORY_LABELS[a.Category],
                    a.UploadedByName ? `Yükleyen: ${a.UploadedByName}` : null,
                    formatDateTime(a.UploadedAt),
                    a.Description,
                  ]
                    .filter(Boolean)
                    .join('\n')}
                >
                  <button
                    type="button"
                    className="block w-full h-20 bg-background-surface flex items-center justify-center"
                    onClick={() => void openAttachment(a)}
                    aria-label={`${a.FileName} aç`}
                  >
                    {isImage(a) && thumbs[a.AttachmentId] ? (
                      <img src={thumbs[a.AttachmentId]} alt={a.FileName} className="w-full h-full object-cover" />
                    ) : isImage(a) ? (
                      <span className="text-[10px] text-text-secondary">Yükleniyor…</span>
                    ) : (
                      <FilePdfIcon size={32} className="text-red-400" />
                    )}
                  </button>
                  <div className="px-1.5 py-1">
                    <div className="text-[10px] truncate">{a.FileName}</div>
                    <div className="text-[10px] text-text-secondary truncate">
                      {ATTACHMENT_CATEGORY_LABELS[a.Category]} · {formatSize(a.FileSize)}
                    </div>
                  </div>
                  <div className="absolute top-1 right-1 hidden group-hover:flex gap-0.5">
                    <button
                      type="button"
                      className="p-0.5 rounded bg-black/60 text-white hover:bg-black/80"
                      onClick={() => void download(a)}
                      title="İndir"
                      aria-label={`${a.FileName} indir`}
                    >
                      <DownloadSimpleIcon size={13} />
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        className="p-0.5 rounded bg-black/60 text-red-300 hover:bg-black/80"
                        onClick={() => setDeleteTarget(a)}
                        title="Sil"
                        aria-label={`${a.FileName} sil`}
                      >
                        <TrashIcon size={13} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {imagePreview &&
        createPortal(
          <div
            className="fixed inset-0 z-[150] bg-black/85 flex flex-col"
            role="dialog"
            aria-modal="true"
            onClick={() => setImagePreview(null)}
          >
            <div className="flex items-center gap-3 px-4 py-2 text-white text-sm" onClick={(e) => e.stopPropagation()}>
              <span className="truncate">{imagePreview.FileName}</span>
              <span className="text-white/60 text-xs">{ATTACHMENT_CATEGORY_LABELS[imagePreview.Category]}</span>
              <div className="ml-auto flex gap-1">
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-white/10"
                  onClick={() => void download(imagePreview)}
                  title="İndir"
                  aria-label="İndir"
                >
                  <DownloadSimpleIcon size={18} />
                </button>
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-white/10"
                  onClick={() => setImagePreview(null)}
                  title="Kapat"
                  aria-label="Kapat"
                >
                  <XIcon size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center p-4">
              {thumbs[imagePreview.AttachmentId] ? (
                <img
                  src={thumbs[imagePreview.AttachmentId]}
                  alt={imagePreview.FileName}
                  className="max-w-full max-h-full object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="text-white/70 text-sm">Yükleniyor…</span>
              )}
            </div>
          </div>,
          portalTarget
        )}

      <PdfPreviewModal
        open={pdfPreview != null}
        pdfUrl={pdfPreview?.url ?? null}
        title={pdfPreview?.attachment.FileName ?? 'Belge'}
        downloadFileName={pdfPreview?.attachment.FileName ?? 'belge.pdf'}
        onClose={() => setPdfPreview(null)}
      />

      <ConfirmModal
        open={deleteTarget != null}
        title="Dosya silinsin mi?"
        message={deleteTarget ? `"${deleteTarget.FileName}" ekler listesinden kaldırılacak.` : ''}
        confirmLabel="Sil"
        cancelLabel="Vazgeç"
        variant="danger"
        loading={deleting}
        zIndexClass="z-[160]"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { PlusIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
import type { DocumentCategory } from '../../models';
import {
  DOCUMENT_CATEGORY_COLORS,
  documentCategoryService,
  useDocumentCategoryStore,
} from '../../services/documentCategoryService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toast } from '../../hooks/useToast';
import ConfirmModal from '../modals/ConfirmModal';

interface DocumentCategoryManagerModalProps {
  open: boolean;
  onClose: () => void;
  /** Ad/renk değişikliği veya silme sonrası listelerin yenilenmesi için */
  onChanged?: () => void;
}

function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {DOCUMENT_CATEGORY_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={`h-5 w-5 rounded-full border-2 ${value.toLowerCase() === color ? 'border-text-primary' : 'border-transparent'}`}
          style={{ backgroundColor: color }}
          aria-label={`Renk ${color}`}
        />
      ))}
    </div>
  );
}

/** Teklif / sözleşme kategorilerini oluşturma, yeniden adlandırma, renk değiştirme ve silme. */
export default function DocumentCategoryManagerModal({ open, onClose, onChanged }: DocumentCategoryManagerModalProps) {
  const categories = useDocumentCategoryStore((s) => s.categories);
  const loading = useDocumentCategoryStore((s) => s.loading);
  const load = useDocumentCategoryStore((s) => s.load);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(DOCUMENT_CATEGORY_COLORS[0]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocumentCategory | null>(null);

  useEffect(() => {
    if (!open) return;
    void load(true);
    setEditingId(null);
    setNewName('');
  }, [open, load]);

  useEffect(() => {
    setNewColor(DOCUMENT_CATEGORY_COLORS[categories.length % DOCUMENT_CATEGORY_COLORS.length]);
  }, [categories.length]);

  if (!open) return null;

  const run = async (action: () => Promise<unknown>, success: string) => {
    if (busy) return false;
    try {
      setBusy(true);
      await action();
      await load(true);
      onChanged?.();
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(getApiErrorMessage(error) || 'İşlem başarısız.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    const ok = await run(() => documentCategoryService.createAsync({ Name: name, Color: newColor }), 'Kategori oluşturuldu.');
    if (ok) setNewName('');
  };

  const startEdit = (category: DocumentCategory) => {
    setEditingId(category.DocumentCategoryId);
    setEditName(category.Name);
    setEditColor(category.Color);
  };

  const handleSaveEdit = async () => {
    if (editingId == null) return;
    const name = editName.trim();
    if (!name) {
      toast.warning('Kategori adı boş olamaz.');
      return;
    }
    const ok = await run(
      () => documentCategoryService.updateAsync(editingId, { Name: name, Color: editColor }),
      'Kategori güncellendi.'
    );
    if (ok) setEditingId(null);
  };

  const usage = (c: DocumentCategory) => {
    const parts: string[] = [];
    if (c.QuoteCount) parts.push(`${c.QuoteCount} teklif`);
    if (c.ContractCount) parts.push(`${c.ContractCount} sözleşme`);
    return parts.length ? parts.join(' · ') : 'Kullanılmıyor';
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="bg-background-panel rounded-panel w-full max-w-lg shadow-xl flex flex-col max-h-[85vh]">
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div>
            <h3 className="text-xl font-bold">Teklif / Sözleşme Kategorileri</h3>
            <p className="text-xs text-text-secondary mt-1">
              Kategoriler teklif ve sözleşmelerde ortaktır; teklif sözleşmeye dönüşünce kategorileri de taşınır.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-text-secondary hover:text-text-primary p-1" aria-label="Kapat">
            <XIcon size={18} />
          </button>
        </div>

        <div className="px-5 pb-3">
          <div className="rounded border border-background-border p-2.5 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1 py-1.5 px-2 text-sm"
                placeholder="Yeni kategori adı (ör. Belediye işi)"
                maxLength={60}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleCreate();
                  }
                }}
              />
              <button
                type="button"
                className="btn-primary py-1.5 px-3 text-sm inline-flex items-center gap-1"
                onClick={() => void handleCreate()}
                disabled={busy || !newName.trim()}
              >
                <PlusIcon size={14} />
                Ekle
              </button>
            </div>
            <ColorSwatches value={newColor} onChange={setNewColor} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {loading && categories.length === 0 && <p className="text-sm text-text-secondary py-4">Yükleniyor…</p>}
          {!loading && categories.length === 0 && (
            <p className="text-sm text-text-secondary py-4">Henüz kategori yok. Yukarıdan ilk kategorinizi ekleyin.</p>
          )}
          <ul className="divide-y divide-background-border">
            {categories.map((category) =>
              editingId === category.DocumentCategoryId ? (
                <li key={category.DocumentCategoryId} className="py-2 space-y-2">
                  <input
                    autoFocus
                    type="text"
                    className="input w-full py-1.5 px-2 text-sm"
                    maxLength={60}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleSaveEdit();
                      } else if (e.key === 'Escape') {
                        e.stopPropagation();
                        setEditingId(null);
                      }
                    }}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <ColorSwatches value={editColor} onChange={setEditColor} />
                    <div className="flex gap-1.5 shrink-0">
                      <button type="button" className="btn-secondary py-1 px-2.5 text-xs" onClick={() => setEditingId(null)} disabled={busy}>
                        Vazgeç
                      </button>
                      <button type="button" className="btn-primary py-1 px-2.5 text-xs" onClick={() => void handleSaveEdit()} disabled={busy}>
                        Kaydet
                      </button>
                    </div>
                  </div>
                </li>
              ) : (
                <li key={category.DocumentCategoryId} className="py-2 flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: category.Color }} />
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left"
                    onClick={() => startEdit(category)}
                    title="Düzenlemek için tıklayın"
                  >
                    <span className="block text-sm font-medium truncate">{category.Name}</span>
                    <span className="block text-[11px] text-text-secondary">{usage(category)}</span>
                  </button>
                  <button
                    type="button"
                    className="text-xs text-text-secondary hover:text-text-primary px-1.5 py-1"
                    onClick={() => startEdit(category)}
                  >
                    Düzenle
                  </button>
                  <button
                    type="button"
                    className="text-text-secondary hover:text-red-400 p-1"
                    onClick={() => setDeleteTarget(category)}
                    aria-label={`${category.Name} kategorisini sil`}
                    title="Sil"
                  >
                    <TrashIcon size={15} />
                  </button>
                </li>
              )
            )}
          </ul>
        </div>
      </div>

      <ConfirmModal
        open={deleteTarget != null}
        title="Kategori silinsin mi?"
        message={
          deleteTarget
            ? `"${deleteTarget.Name}" kategorisi silinecek (${usage(deleteTarget)}).\n\nTeklif ve sözleşmelerin kendisi silinmez; yalnızca bu kategori üzerlerinden kaldırılır.`
            : ''
        }
        confirmLabel="Sil"
        cancelLabel="Vazgeç"
        variant="danger"
        loading={busy}
        zIndexClass="z-[70]"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          if (!target) return;
          void run(() => documentCategoryService.deleteAsync(target.DocumentCategoryId), 'Kategori silindi.').then(() =>
            setDeleteTarget(null)
          );
        }}
      />
    </div>
  );
}

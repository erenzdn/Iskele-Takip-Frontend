import { useEffect, useState } from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleNotchIcon,
  PencilSimpleIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import type { DocumentCategory } from '../../models';
import {
  DOCUMENT_CATEGORY_COLORS,
  documentCategoryService,
  useDocumentCategoryStore,
} from '../../services/documentCategoryService';
import { useAuthStore } from '../../store/authStore';
import { invalidateData } from '../../store/dataInvalidationStore';
import { getApiErrorMessage } from '../../utils/apiError';
import { toast } from '../../hooks/useToast';
import ConfirmModal from '../modals/ConfirmModal';

function ColorSwatches({ value, onChange, disabled }: { value: string; onChange: (color: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DOCUMENT_CATEGORY_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          disabled={disabled}
          onClick={() => onChange(color)}
          className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
            value.toLowerCase() === color ? 'border-text-primary scale-110' : 'border-transparent'
          }`}
          style={{ backgroundColor: color }}
          aria-label={`Renk ${color}`}
          aria-pressed={value.toLowerCase() === color}
        />
      ))}
    </div>
  );
}

function usageText(c: DocumentCategory) {
  const parts: string[] = [];
  if (c.QuoteCount) parts.push(`${c.QuoteCount} teklif`);
  if (c.ContractCount) parts.push(`${c.ContractCount} sözleşme`);
  return parts.length ? parts.join(' · ') : 'Henüz kullanılmıyor';
}

interface DocumentCategoryManagerPanelProps {
  /** Ad/renk değişikliği, sıralama veya silme sonrası */
  onChanged?: () => void;
  /** Liste alanının en fazla yüksekliği (modal içinde kaydırma için) */
  listClassName?: string;
}

/**
 * Teklif / sözleşme kategorilerini oluşturma, yeniden adlandırma, renk, sıralama ve silme.
 * Hem Sistem Ayarları'nda hem listelerdeki "Kategorileri yönet" penceresinde kullanılır.
 */
export default function DocumentCategoryManagerPanel({ onChanged, listClassName = '' }: DocumentCategoryManagerPanelProps) {
  const categories = useDocumentCategoryStore((s) => s.categories);
  const loading = useDocumentCategoryStore((s) => s.loading);
  const loaded = useDocumentCategoryStore((s) => s.loaded);
  const loadError = useDocumentCategoryStore((s) => s.error);
  const load = useDocumentCategoryStore((s) => s.load);
  const permissions = useAuthStore((s) => s.user?.permissions);
  const canManage = Boolean(permissions?.includes('quotes_update') || permissions?.includes('contracts_update'));

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(DOCUMENT_CATEGORY_COLORS[0]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocumentCategory | null>(null);

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    setNewColor(DOCUMENT_CATEGORY_COLORS[categories.length % DOCUMENT_CATEGORY_COLORS.length]);
  }, [categories.length]);

  const run = async (action: () => Promise<unknown>, success: string | null) => {
    if (busy) return false;
    try {
      setBusy(true);
      await action();
      await load(true);
      invalidateData('quotes');
      invalidateData('contracts');
      onChanged?.();
      if (success) toast.success(success);
      return true;
    } catch (error) {
      toast.error(getApiErrorMessage(error) || 'İşlem başarısız.');
      await load(true);
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

  /** Sırayı değiştirir; yalnızca SortOrder'ı değişen kayıtlar güncellenir. */
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    const changes = next
      .map((c, i) => ({ id: c.DocumentCategoryId, order: i + 1, current: c.SortOrder }))
      .filter((c) => c.order !== c.current);
    void run(
      () => Promise.all(changes.map((c) => documentCategoryService.updateAsync(c.id, { SortOrder: c.order }))),
      null
    );
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="rounded-xl border border-background-border bg-background-elevated/30 p-4 space-y-3">
          <label htmlFor="new-document-category" className="block text-xs font-medium text-text-secondary">
            Yeni kategori ekle
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="new-document-category"
              type="text"
              className="input flex-1 py-2.5"
              placeholder="Örn: Belediye işi, Acil, Cephe iskelesi"
              maxLength={60}
              value={newName}
              disabled={busy}
              autoComplete="off"
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
              className="btn-primary py-2.5 px-4 flex items-center justify-center gap-1.5 shrink-0"
              onClick={() => void handleCreate()}
              disabled={busy || !newName.trim()}
            >
              {busy && editingId == null && !deleteTarget ? (
                <CircleNotchIcon size={16} className="animate-spin" />
              ) : (
                <PlusIcon size={16} />
              )}
              Ekle
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-text-secondary">Renk</span>
            <ColorSwatches value={newColor} onChange={setNewColor} disabled={busy} />
          </div>
        </div>
      )}

      {!loaded && loading ? (
        <div className="text-sm text-text-secondary flex items-center gap-2 py-8 justify-center">
          <CircleNotchIcon size={16} className="animate-spin" />
          Kategoriler yükleniyor...
        </div>
      ) : !loaded && loadError ? (
        <div className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          Kategoriler yüklenemedi: {loadError}
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-background-border px-4 py-10 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <TagIcon size={20} weight="duotone" />
          </div>
          <p className="text-sm font-medium text-text-primary">Henüz kategori yok</p>
          <p className="mt-1 text-xs text-text-secondary">
            {canManage ? 'Yukarıdaki alandan ilk kategorinizi ekleyin.' : 'Kategori eklemek için teklif veya sözleşme güncelleme yetkisi gerekir.'}
          </p>
        </div>
      ) : (
        <ul className={`space-y-2 ${listClassName}`}>
          {categories.map((category, index) =>
            editingId === category.DocumentCategoryId ? (
              <li
                key={category.DocumentCategoryId}
                className="rounded-xl border border-primary/40 bg-background-elevated/40 px-3.5 py-3 space-y-3"
              >
                <input
                  autoFocus
                  type="text"
                  className="input w-full py-2"
                  maxLength={60}
                  value={editName}
                  disabled={busy}
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <ColorSwatches value={editColor} onChange={setEditColor} disabled={busy} />
                  <div className="flex gap-2 shrink-0">
                    <button type="button" className="btn-secondary py-1.5 px-3 text-sm" onClick={() => setEditingId(null)} disabled={busy}>
                      Vazgeç
                    </button>
                    <button type="button" className="btn-primary py-1.5 px-3 text-sm" onClick={() => void handleSaveEdit()} disabled={busy}>
                      Kaydet
                    </button>
                  </div>
                </div>
              </li>
            ) : (
              <li
                key={category.DocumentCategoryId}
                className="group flex items-center gap-3 rounded-xl border border-background-border bg-background-panel px-3.5 py-2.5 transition-colors hover:border-primary/25 hover:bg-background-elevated/40"
              >
                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: category.Color }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-text-primary truncate">{category.Name}</span>
                  <span className="block text-[11px] text-text-secondary">{usageText(category)}</span>
                </span>
                {canManage && (
                  <span className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={busy || index === 0}
                      title="Yukarı taşı"
                      aria-label={`${category.Name} kategorisini yukarı taşı`}
                      className="rounded-lg p-1.5 text-text-secondary hover:bg-background-hover hover:text-text-primary disabled:opacity-30"
                    >
                      <ArrowUpIcon size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={busy || index === categories.length - 1}
                      title="Aşağı taşı"
                      aria-label={`${category.Name} kategorisini aşağı taşı`}
                      className="rounded-lg p-1.5 text-text-secondary hover:bg-background-hover hover:text-text-primary disabled:opacity-30"
                    >
                      <ArrowDownIcon size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(category)}
                      disabled={busy}
                      title="Adı veya rengi düzenle"
                      aria-label={`${category.Name} kategorisini düzenle`}
                      className="rounded-lg p-1.5 text-text-secondary hover:bg-background-hover hover:text-text-primary disabled:opacity-30"
                    >
                      <PencilSimpleIcon size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(category)}
                      disabled={busy}
                      title="Sil"
                      aria-label={`${category.Name} kategorisini sil`}
                      className="rounded-lg p-1.5 text-text-secondary hover:bg-error/10 hover:text-error disabled:opacity-30"
                    >
                      <TrashIcon size={15} />
                    </button>
                  </span>
                )}
              </li>
            )
          )}
        </ul>
      )}

      <ConfirmModal
        open={deleteTarget != null}
        title="Kategori silinsin mi?"
        message={
          deleteTarget
            ? `"${deleteTarget.Name}" kategorisi silinecek (${usageText(deleteTarget)}).\n\nTeklif ve sözleşmelerin kendisi silinmez; yalnızca bu kategori üzerlerinden kaldırılır.`
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

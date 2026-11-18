import { useEffect, useMemo, useState } from 'react';
import { PlusIcon, TagIcon } from '@phosphor-icons/react';
import type { DocumentCategoryRef } from '../../models';
import {
  DOCUMENT_CATEGORY_COLORS,
  documentCategoryService,
  useDocumentCategoryStore,
} from '../../services/documentCategoryService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toast } from '../../hooks/useToast';

export type CategorizableEntity = { type: 'quote' | 'contract'; id: number; label: string };

interface DocumentCategoryPickerModalProps {
  open: boolean;
  entity: CategorizableEntity | null;
  initialCategoryIds: number[];
  onClose: () => void;
  /** Kayıt başarılı olunca sunucudan dönen güncel kategori listesiyle çağrılır. */
  onSaved: (categories: DocumentCategoryRef[]) => void;
  onManage?: () => void;
}

/** Bir teklifin / sözleşmenin kategorilerini seçme (ve hızlıca yeni kategori açma) penceresi. */
export default function DocumentCategoryPickerModal({
  open,
  entity,
  initialCategoryIds,
  onClose,
  onSaved,
  onManage,
}: DocumentCategoryPickerModalProps) {
  const categories = useDocumentCategoryStore((s) => s.categories);
  const load = useDocumentCategoryStore((s) => s.load);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    void load();
    setSelected(new Set(initialCategoryIds));
    setSearch('');
    // initialCategoryIds her render'da yeni dizi olabilir; yalnızca açılışta senkronla
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entity?.type, entity?.id]);

  const query = search.trim();
  const visible = useMemo(() => {
    const q = query.toLocaleLowerCase('tr-TR');
    if (!q) return categories;
    return categories.filter((c) => c.Name.toLocaleLowerCase('tr-TR').includes(q));
  }, [categories, query]);
  const exactMatch = categories.some(
    (c) => c.Name.trim().toLocaleLowerCase('tr-TR') === query.toLocaleLowerCase('tr-TR')
  );

  if (!open || !entity) return null;

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!query || exactMatch || creating) return;
    try {
      setCreating(true);
      const created = await documentCategoryService.createAsync({
        Name: query,
        Color: DOCUMENT_CATEGORY_COLORS[categories.length % DOCUMENT_CATEGORY_COLORS.length],
      });
      await load(true);
      setSelected((prev) => new Set(prev).add(created.DocumentCategoryId));
      setSearch('');
    } catch (error) {
      toast.error(getApiErrorMessage(error) || 'Kategori oluşturulamadı.');
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    try {
      setSaving(true);
      const ids = Array.from(selected);
      const result =
        entity.type === 'quote'
          ? await documentCategoryService.setQuoteCategoriesAsync(entity.id, ids)
          : await documentCategoryService.setContractCategoriesAsync(entity.id, ids);
      toast.success('Kategoriler güncellendi.');
      void load(true); // kullanım sayıları değişti
      onSaved(Array.isArray(result) ? result : []);
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error) || 'Kategoriler kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div className="bg-background-panel rounded-panel w-full max-w-sm shadow-xl flex flex-col max-h-[80vh]">
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <TagIcon size={18} />
            Kategoriler
          </h3>
          <p className="text-xs text-text-secondary mt-0.5 truncate">
            {entity.type === 'quote' ? 'Teklif' : 'Sözleşme'}: {entity.label}
          </p>
        </div>
        <div className="px-4 pb-2">
          <input
            autoFocus
            type="text"
            className="input w-full py-1.5 px-2 text-sm"
            placeholder="Ara veya yeni kategori adı yaz…"
            value={search}
            maxLength={60}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (query && !exactMatch) void handleCreate();
                else if (visible.length === 1) toggle(visible[0].DocumentCategoryId);
              }
            }}
          />
        </div>
        <div className="flex-1 overflow-y-auto px-2 min-h-[120px]">
          {visible.map((category) => (
            <label
              key={category.DocumentCategoryId}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-background-hover"
            >
              <input
                type="checkbox"
                className="rounded border-background-border"
                checked={selected.has(category.DocumentCategoryId)}
                onChange={() => toggle(category.DocumentCategoryId)}
              />
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.Color }} />
              <span className="truncate">{category.Name}</span>
            </label>
          ))}
          {query && !exactMatch && (
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-primary hover:bg-background-hover text-left"
            >
              <PlusIcon size={14} />
              {creating ? 'Oluşturuluyor…' : `"${query}" kategorisini oluştur`}
            </button>
          )}
          {categories.length === 0 && !query && (
            <p className="px-2 py-3 text-xs text-text-secondary">
              Henüz kategori yok. Yukarıya bir ad yazıp Enter'a basarak ilk kategoriyi oluşturabilirsiniz.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-background-border px-4 py-3">
          {onManage ? (
            <button type="button" className="text-xs text-text-secondary hover:text-text-primary mr-auto" onClick={onManage}>
              Yönet…
            </button>
          ) : (
            <span className="mr-auto" />
          )}
          <button type="button" className="btn-secondary py-1.5 px-3 text-sm" onClick={onClose} disabled={saving}>
            Vazgeç
          </button>
          <button type="button" className="btn-primary py-1.5 px-3 text-sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

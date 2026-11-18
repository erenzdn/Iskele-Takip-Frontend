import { useEffect, useMemo, useRef, useState } from 'react';
import { CaretDownIcon, GearSixIcon, TagIcon } from '@phosphor-icons/react';
import { useDocumentCategoryStore } from '../../services/documentCategoryService';

/** Filtrede "kategorisiz kayıtlar" seçeneğinin değeri (backend'de categoryIds=0). */
export const UNCATEGORIZED_FILTER_ID = 0;

interface DocumentCategoryFilterProps {
  value: number[];
  onChange: (next: number[]) => void;
  /** Verilirse açılır listenin altında "Kategorileri yönet" bağlantısı gösterilir. */
  onManage?: () => void;
}

/** Çoklu seçimli kategori filtresi: seçilenlerden herhangi birine sahip kayıtlar listelenir. */
export default function DocumentCategoryFilter({ value, onChange, onManage }: DocumentCategoryFilterProps) {
  const categories = useDocumentCategoryStore((s) => s.categories);
  const load = useDocumentCategoryStore((s) => s.load);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = useMemo(() => new Set(value), [value]);
  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return categories;
    return categories.filter((c) => c.Name.toLocaleLowerCase('tr-TR').includes(q));
  }, [categories, search]);

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  const label = (() => {
    if (value.length === 0) return 'Tüm Kategoriler';
    if (value.length === 1) {
      if (value[0] === UNCATEGORIZED_FILTER_ID) return 'Kategorisiz';
      return categories.find((c) => c.DocumentCategoryId === value[0])?.Name ?? '1 kategori';
    }
    return `${value.length} kategori`;
  })();
  const singleColor =
    value.length === 1 ? categories.find((c) => c.DocumentCategoryId === value[0])?.Color : undefined;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`input py-1.5 px-3 text-sm w-48 flex items-center gap-1.5 text-left ${value.length > 0 ? 'border-primary/60' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Kategoriye göre filtrele"
      >
        {singleColor ? (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: singleColor }} />
        ) : (
          <TagIcon size={14} className="shrink-0 text-text-secondary" />
        )}
        <span className="flex-1 truncate">{label}</span>
        <CaretDownIcon size={12} className="shrink-0 text-text-secondary" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 rounded border border-background-border bg-background-panel shadow-xl">
          {categories.length > 6 && (
            <div className="p-1.5 border-b border-background-border">
              <input
                autoFocus
                type="text"
                className="input w-full py-1 px-2 text-sm"
                placeholder="Kategori ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto py-1" role="listbox" aria-multiselectable="true">
            {visible.map((category) => (
              <label
                key={category.DocumentCategoryId}
                className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-background-hover"
              >
                <input
                  type="checkbox"
                  className="rounded border-background-border"
                  checked={selected.has(category.DocumentCategoryId)}
                  onChange={() => toggle(category.DocumentCategoryId)}
                />
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: category.Color }} />
                <span className="truncate">{category.Name}</span>
              </label>
            ))}
            {categories.length === 0 && (
              <div className="px-2 py-2 text-xs text-text-secondary">Henüz kategori tanımlanmadı.</div>
            )}
            {!search.trim() && (
              <label className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-background-hover border-t border-background-border mt-1 pt-1.5">
                <input
                  type="checkbox"
                  className="rounded border-background-border"
                  checked={selected.has(UNCATEGORIZED_FILTER_ID)}
                  onChange={() => toggle(UNCATEGORIZED_FILTER_ID)}
                />
                <span className="text-text-secondary italic">Kategorisiz</span>
              </label>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-background-border px-2 py-1.5">
            <button
              type="button"
              className="text-xs text-text-secondary hover:text-text-primary disabled:opacity-40"
              disabled={value.length === 0}
              onClick={() => onChange([])}
            >
              Seçimi temizle
            </button>
            {onManage && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                onClick={() => {
                  setOpen(false);
                  onManage();
                }}
              >
                <GearSixIcon size={12} />
                Kategorileri yönet
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

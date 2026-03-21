import { useState, useRef, useEffect, useCallback } from 'react';
import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import { Inventory } from '../models';
import { normalizeText } from '../utils/validation';

type ItemRecord = Inventory & Record<string, unknown>;

const safeStr = (v: unknown): string =>
  v != null && typeof v === 'string' ? v : '';

function getItemId(i: ItemRecord): number {
  return Number(i.ItemId ?? i.itemId ?? 0) || 0;
}

function getName(i: ItemRecord): string {
  return (
    safeStr(
      i.ItemName ??
        i.itemName ??
        (i.Item as { ItemName?: string })?.ItemName ??
        (i.Item as { itemName?: string })?.itemName
    ) || ''
  );
}

function getCode(i: ItemRecord): string {
  return safeStr(i.ItemCode ?? i.itemCode) || '';
}

function getCatName(i: ItemRecord): string {
  const cats = i.Categories ?? i.categories;
  if (Array.isArray(cats) && cats.length > 0) {
    return cats
      .map((c: { CategoryName?: string; categoryName?: string }) =>
        c.CategoryName ?? c.categoryName ?? ''
      )
      .filter(Boolean)
      .join(', ');
  }
  const c = i.Category ?? i.category;
  return (
    safeStr(
      (c as { CategoryName?: string })?.CategoryName ??
        (c as { categoryName?: string })?.categoryName
    ) || ''
  );
}

export type ItemDisplayMode = 'contract' | 'quote';

interface SearchableItemComboboxProps {
  items: Inventory[];
  value: number | '';
  onChange: (itemId: number | '') => void;
  displayMode?: ItemDisplayMode;
  placeholder?: string;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function SearchableItemCombobox({
  items = [],
  value,
  onChange,
  displayMode = 'contract',
  placeholder = 'Malzeme adı, kodu veya kategori ile ara...',
  disabled = false,
  onOpenChange,
}: SearchableItemComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const q = searchText.trim().toLocaleLowerCase('tr-TR');
  const filtered =
    !q
      ? (items || [])
      : (items || []).filter((item) => {
          const i = item as ItemRecord;
          return (
            getName(i).toLocaleLowerCase('tr-TR').includes(q) ||
            getCode(i).toLocaleLowerCase('tr-TR').includes(q) ||
            getCatName(i).toLocaleLowerCase('tr-TR').includes(q)
          );
        });

  const selectedItem = (items || []).find((item) => getItemId(item as ItemRecord) === value) as
    | ItemRecord
    | undefined;
  const displayValue = selectedItem ? getName(selectedItem) : '';

  const handleSelect = useCallback(
    (item: ItemRecord) => {
      onChange(getItemId(item));
      setSearchText('');
      setIsOpen(false);
      onOpenChange?.(false);
    },
    [onChange, onOpenChange]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = normalizeText(e.target.value);
    setSearchText(v);
    if (!isOpen) {
      setIsOpen(true);
      onOpenChange?.(true);
    }
    setHighlightedIndex(0);
    if (!v) {
      onChange('');
    }
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    onOpenChange?.(true);
    setHighlightedIndex(0);
  };

  const handleClear = () => {
    setSearchText('');
    onChange('');
    setIsOpen(true);
    setHighlightedIndex(0);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        onOpenChange?.(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onOpenChange]);

  useEffect(() => {
    if (isOpen && listRef.current && filtered.length > 0) {
      const el = listRef.current.children[highlightedIndex] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen, filtered.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[highlightedIndex] as ItemRecord | undefined;
      if (item) handleSelect(item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      onOpenChange?.(false);
    }
  };

  const getMonthlyPrice = (i: ItemRecord) =>
    Number(
      (i as { MonthlyListPrice?: number; monthlyListPrice?: number })
        .MonthlyListPrice ?? (i as { monthlyListPrice?: number }).monthlyListPrice ?? 0
    ) || 0;

  const getStock = (i: ItemRecord) =>
    (Number((i as { TotalStock?: number; totalStock?: number }).TotalStock ?? (i as { totalStock?: number }).totalStock ?? 0) || 0) -
    (Number((i as { OnRent?: number; onRent?: number }).OnRent ?? (i as { onRent?: number }).onRent ?? 0) || 0);

  const inputValue = isOpen ? searchText : displayValue;

  return (
    <div ref={containerRef} className="relative flex-1 min-w-[200px]">
      <div className="flex items-stretch rounded-input border border-background-border bg-background-panel overflow-hidden focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-1 focus-within:ring-offset-background-main">
        <span className="flex items-center justify-center w-10 shrink-0 text-text-secondary pointer-events-none bg-transparent">
          <MagnifyingGlassIcon size={20} weight="regular" color="currentColor" aria-hidden />
        </span>
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 min-w-0 px-3 py-2.5 bg-transparent border-0 text-text-primary placeholder-gray-500 focus:outline-none focus:ring-0 text-sm"
          style={{ boxSizing: 'border-box' }}
          aria-label="Malzeme ara"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          role="combobox"
        />
        {inputValue ? (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 w-10 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-background-hover transition-colors"
            aria-label="Temizle"
          >
            <XIcon size={18} weight="regular" color="currentColor" aria-hidden />
          </button>
        ) : (
          <span className="w-2 shrink-0" aria-hidden />
        )}
      </div>
      {isOpen && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-[200] left-0 right-0 mt-1 max-h-72 overflow-auto rounded-lg border border-background-border bg-background-panel shadow-lg py-1 min-w-[280px]"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-4 text-sm text-text-secondary">
              Sonuç bulunamadı. Farklı anahtar kelimeler deneyin.
            </li>
          ) : (
            filtered.map((item, idx) => {
              const i = item as ItemRecord;
              const id = getItemId(i);
              const name = getName(i);
              const code = getCode(i);
              const catName = getCatName(i);
              const price = getMonthlyPrice(i);
              const stock = getStock(i);
              const isHighlighted = idx === highlightedIndex;
              return (
                <li
                  key={id}
                  role="option"
                  aria-selected={id === value}
                  className={`mx-1 rounded-md cursor-pointer text-sm transition-colors ${
                    isHighlighted
                      ? 'bg-blue-900 text-white'
                      : 'bg-background-panel hover:bg-background-hover'
                  }`}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(i);
                  }}
                >
                  <div className="px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium truncate">{name}</span>
                      <span className={`flex-shrink-0 ${isHighlighted ? 'text-blue-200' : 'text-primary'}`}>
                        ₺{price.toFixed(2)}/ay
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {code && (
                        <span className={`text-xs px-2 py-0.5 rounded ${isHighlighted ? 'bg-blue-800 text-blue-200' : 'bg-background-hover text-text-secondary'}`}>
                          {code}
                        </span>
                      )}
                      {catName && (
                        <span className={`text-xs px-2 py-0.5 rounded ${isHighlighted ? 'bg-blue-800/70 text-blue-200' : 'bg-background-hover text-text-secondary'}`}>
                          {catName}
                        </span>
                      )}
                      {displayMode === 'quote' && (
                        <span className={`text-xs ml-auto ${isHighlighted ? 'text-blue-200' : 'text-text-secondary'}`}>
                          Stok: {stock}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

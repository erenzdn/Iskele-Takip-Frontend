import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  MagnifyingGlassIcon,
  CaretRightIcon,
  CaretDownIcon,
  CheckCircleIcon,
} from '@phosphor-icons/react';
import { Inventory, MaterialCategory, SubCategory } from '../models';
import { inventoryService } from '../services/inventoryService';
import { subcategoryService } from '../services/subcategoryService';
import { normalizeText } from '../utils/validation';

type ItemRecord = Inventory & Record<string, unknown>;

const safeStr = (v: unknown): string =>
  v != null && typeof v === 'string' ? v : '';

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

function getNameEn(i: ItemRecord): string {
  return (
    safeStr(
      i.ItemNameEn ??
        i.itemNameEn ??
        (i.Item as { ItemNameEn?: string })?.ItemNameEn ??
        (i.Item as { itemNameEn?: string })?.itemNameEn
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

function getMonthlyPrice(i: ItemRecord): number {
  return (
    Number(
      (i as { MonthlyListPrice?: number; monthlyListPrice?: number })
        .MonthlyListPrice ?? (i as { monthlyListPrice?: number }).monthlyListPrice ?? 0
    ) || 0
  );
}

function getMonthlyPriceEur(i: ItemRecord): number {
  return (
    Number(
      (i as { MonthlyListPriceEur?: number; monthlyListPriceEur?: number })
        .MonthlyListPriceEur ?? (i as { monthlyListPriceEur?: number }).monthlyListPriceEur ?? 0
    ) || 0
  );
}

function getMonthlyPriceUsd(i: ItemRecord): number {
  return (
    Number(
      (i as { MonthlyListPriceUsd?: number; monthlyListPriceUsd?: number })
        .MonthlyListPriceUsd ?? (i as { monthlyListPriceUsd?: number }).monthlyListPriceUsd ?? 0
    ) || 0
  );
}

function getUnitPrice(i: ItemRecord): number {
  return (
    Number((i as { UnitPrice?: number; unitPrice?: number }).UnitPrice ?? (i as { unitPrice?: number }).unitPrice ?? 0) ||
    0
  );
}

function getUnitPriceEur(i: ItemRecord): number {
  return (
    Number(
      (i as { UnitPriceEur?: number; unitPriceEur?: number }).UnitPriceEur ??
        (i as { unitPriceEur?: number }).unitPriceEur ??
        0
    ) || 0
  );
}

function getUnitPriceUsd(i: ItemRecord): number {
  return (
    Number(
      (i as { UnitPriceUsd?: number; unitPriceUsd?: number }).UnitPriceUsd ??
        (i as { unitPriceUsd?: number }).unitPriceUsd ??
        0
    ) || 0
  );
}

function getStock(i: ItemRecord): number {
  return (
    (Number((i as { TotalStock?: number; totalStock?: number }).TotalStock ?? (i as { totalStock?: number }).totalStock ?? 0) || 0) -
    (Number((i as { OnRent?: number; onRent?: number }).OnRent ?? (i as { onRent?: number }).onRent ?? 0) || 0)
  );
}

/** Ürün adının ilk karakteri, Türkçe büyük harf (filtreleme için). Rakam ise "0", harf değilse "#". */
function getFirstChar(i: ItemRecord): string {
  const name = getName(i).trim();
  if (!name) return '#';
  const first = name.charAt(0);
  if (/\d/.test(first)) return '0';
  const upper = first.toLocaleUpperCase('tr-TR');
  return /[A-ZÇĞİÖŞÜ]/.test(upper) ? upper : '#';
}

/** Türkçe alfabe (hızlı filtre kutucukları sırası). */
const TURKISH_LETTERS = ['A', 'B', 'C', 'Ç', 'D', 'E', 'F', 'G', 'Ğ', 'H', 'I', 'İ', 'J', 'K', 'L', 'M', 'N', 'O', 'Ö', 'P', 'R', 'S', 'Ş', 'T', 'U', 'Ü', 'V', 'Y', 'Z'];

export type ItemDisplayMode = 'contract' | 'quote';

/** Teklif ürün seçicide: kiralama aylık liste, satış birim fiyat. */
export type QuotePricingMode = 'rental' | 'sale';

export interface ItemPickerPanelProps {
  items: Inventory[];
  onItemSelect: (item: Inventory) => void;
  displayMode?: ItemDisplayMode;
  /** displayMode=quote için: satış teklifinde birim fiyat sütunu. */
  quotePricing?: QuotePricingMode;
  className?: string;
  /** Seçilen para birimi; fiyat bu birimde gösterilir. */
  currency?: 'TRY' | 'EUR' | 'USD';
  /** Son eklenen / vurgulanacak ürün satırları (kısa süreli geri bildirim). */
  highlightedItemIds?: ReadonlySet<number>;
  /** Kalem listesinde olan ürünler (kalıcı «seçili» görünümü). */
  pickedItemIds?: ReadonlySet<number>;
}

type SelectionType = 'all' | { categoryId: number } | { categoryId: number; subCategoryId: number };

export default function ItemPickerPanel({
  items,
  onItemSelect,
  displayMode = 'contract',
  quotePricing = 'rental',
  className,
  currency = 'TRY',
  highlightedItemIds,
  pickedItemIds,
}: ItemPickerPanelProps) {
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [allSubCategories, setAllSubCategories] = useState<SubCategory[]>([]);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<number>>(new Set());
  const [selection, setSelection] = useState<SelectionType>('all');
  const [searchText, setSearchText] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement | null>>(new Map());
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCategoriesLoading(true);
      try {
        const [categoriesData, subCategoriesData] = await Promise.all([
          inventoryService.getAllCategoriesAsync(),
          subcategoryService.getAllAsync(),
        ]);
        if (!cancelled) {
          setCategories(categoriesData);
          setAllSubCategories(Array.isArray(subCategoriesData) ? subCategoriesData : []);
        }
      } catch {
        if (!cancelled) {
          setCategories([]);
          setAllSubCategories([]);
        }
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Kategori ID'ye göre gruplanmış alt kategoriler (API'nin categoryId filtresi olmasa da çalışır). */
  const subCategoriesByCategory = useMemo(() => {
    const map: Record<number, SubCategory[]> = {};
    for (const sub of allSubCategories) {
      const cid = sub.CategoryId ?? (sub as { categoryId?: number }).categoryId;
      if (cid != null) {
        if (!map[cid]) map[cid] = [];
        map[cid].push(sub);
      }
    }
    return map;
  }, [allSubCategories]);

  const toggleCategory = (categoryId: number) => {
    setExpandedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  /** Kategoriye doğrudan veya bu kategoriye ait bir alt kategori üzerinden bağlı ürünler dahil edilir. */
  const itemBelongsToCategory = (item: Inventory, categoryId: number) =>
    (item.Categories ?? []).some((c) => c.CategoryId === categoryId) ||
    (item.SubCategories ?? []).some((s) => s.CategoryId === categoryId);

  const filteredBySelection = useMemo(() => {
    if (selection === 'all') return items;
    if ('subCategoryId' in selection) {
      return items.filter((item) =>
        (item.SubCategories ?? []).some((s) => s.SubCategoryId === selection.subCategoryId)
      );
    }
    return items.filter((item) => itemBelongsToCategory(item, selection.categoryId));
  }, [items, selection]);

  /** Seçili harfe göre filtrele + ada göre (Türkçe) sıralama. */
  const filteredByLetter = useMemo(() => {
    let list = filteredBySelection;
    if (selectedLetter) {
      list = list.filter((item) => getFirstChar(item as ItemRecord) === selectedLetter);
    }
    return [...list].sort((a, b) =>
      getName(a as ItemRecord).localeCompare(getName(b as ItemRecord), 'tr-TR')
    );
  }, [filteredBySelection, selectedLetter]);

  /** Mevcut listede hangi harflerin ürünü var (alfabe kutucuklarında sayı/aktif göstermek için). */
  const lettersWithCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of filteredBySelection) {
      const ch = getFirstChar(item as ItemRecord);
      map.set(ch, (map.get(ch) ?? 0) + 1);
    }
    return map;
  }, [filteredBySelection]);

  const q = searchText.trim().toLocaleLowerCase('tr-TR');
  const filteredItems = useMemo(() => {
    if (!q) return filteredByLetter;
    return filteredByLetter.filter((item) => {
      const i = item as ItemRecord;
      return (
        getName(i).toLocaleLowerCase('tr-TR').includes(q) ||
        getNameEn(i).toLocaleLowerCase('tr-TR').includes(q) ||
        getCode(i).toLocaleLowerCase('tr-TR').includes(q) ||
        getCatName(i).toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [filteredByLetter, q]);

  useEffect(() => {
    if (filteredItems.length === 0) {
      setActiveItemId(null);
      return;
    }
    setActiveItemId((current) => {
      if (current != null && filteredItems.some((item) => item.ItemId === current)) return current;
      return filteredItems[0].ItemId;
    });
  }, [filteredItems]);

  useEffect(() => {
    if (activeItemId == null) return;
    rowRefs.current.get(activeItemId)?.scrollIntoView({ block: 'nearest' });
  }, [activeItemId]);

  const moveActiveSelection = useCallback(
    (direction: 1 | -1) => {
      if (filteredItems.length === 0) return;
      const currentIndex = filteredItems.findIndex((item) => item.ItemId === activeItemId);
      const startIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex =
        direction === 1
          ? (startIndex + 1) % filteredItems.length
          : (startIndex - 1 + filteredItems.length) % filteredItems.length;
      setActiveItemId(filteredItems[nextIndex].ItemId);
    },
    [activeItemId, filteredItems]
  );

  const focusSearchInput = useCallback(() => {
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, []);

  const handleKeyboardSelect = useCallback(() => {
    if (activeItemId == null) return;
    const item = filteredItems.find((entry) => entry.ItemId === activeItemId);
    if (item) {
      onItemSelect(item);
      // Enter ile seçimden sonra odağı panel içinde tut.
      focusSearchInput();
    }
  }, [activeItemId, filteredItems, focusSearchInput, onItemSelect]);

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveActiveSelection(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveActiveSelection(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleKeyboardSelect();
      }
    },
    [handleKeyboardSelect, moveActiveSelection]
  );

  useEffect(() => {
    if (!rootRef.current) return;
    focusSearchInput();
  }, [focusSearchInput]);

  const categoryCount = (categoryId: number) =>
    items.filter((item) => itemBelongsToCategory(item, categoryId)).length;

  const subCategoryCount = (subCategoryId: number) =>
    items.filter((item) =>
      (item.SubCategories ?? []).some((s) => s.SubCategoryId === subCategoryId)
    ).length;

  return (
    <div
      ref={rootRef}
      className={`flex border border-background-border rounded-lg overflow-hidden bg-background-panel ${className ?? ''}`}
      onKeyDownCapture={handleListKeyDown}
    >
      {/* Sol panel - Kategori ağacı */}
      <div className="w-[260px] flex-shrink-0 border-r border-background-border flex flex-col">
        <div className="p-2 border-b border-background-border bg-background-secondary">
          <span className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Gruplar
          </span>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0 py-1">
          {categoriesLoading ? (
            <div className="px-3 py-4 text-sm text-text-secondary">Yükleniyor...</div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSelection('all')}
                className={`w-full text-left px-3 py-2 text-sm rounded-none transition-colors ${
                  selection === 'all'
                    ? 'bg-primary/20 text-primary font-medium'
                    : 'hover:bg-background-hover text-text-primary'
                }`}
              >
                Hepsi ({items.length})
              </button>
              {categories.map((cat) => {
                const isExpanded = expandedCategoryIds.has(cat.CategoryId);
                const subs = subCategoriesByCategory[cat.CategoryId] ?? [];
                const isCategorySelected =
                  selection !== 'all' &&
                  'subCategoryId' in selection === false &&
                  selection.categoryId === cat.CategoryId;
                return (
                  <div key={cat.CategoryId}>
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => toggleCategory(cat.CategoryId)}
                        className="p-1 text-text-secondary hover:text-text-primary"
                        aria-label={isExpanded ? 'Daralt' : 'Genişlet'}
                      >
                        {subs.length > 0 || !isExpanded ? (
                          isExpanded ? (
                            <CaretDownIcon size={16} weight="bold" />
                          ) : (
                            <CaretRightIcon size={16} weight="bold" />
                          )
                        ) : (
                          <span className="w-4 inline-block" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelection({ categoryId: cat.CategoryId })}
                        className={`flex-1 text-left px-2 py-1.5 text-sm rounded transition-colors ${
                          isCategorySelected
                            ? 'bg-primary/20 text-primary font-medium'
                            : 'hover:bg-background-hover text-text-primary'
                        }`}
                      >
                        {cat.CategoryName} ({categoryCount(cat.CategoryId)})
                      </button>
                    </div>
                    {isExpanded &&
                      subs.map((sub) => {
                        const isSubSelected =
                          selection !== 'all' &&
                          'subCategoryId' in selection &&
                          selection.subCategoryId === sub.SubCategoryId;
                        return (
                          <button
                            key={sub.SubCategoryId}
                            type="button"
                            onClick={() =>
                              setSelection({
                                categoryId: cat.CategoryId,
                                subCategoryId: sub.SubCategoryId,
                              })
                            }
                            className={`w-full text-left pl-8 pr-3 py-1.5 text-sm rounded-none transition-colors ${
                              isSubSelected
                                ? 'bg-primary/20 text-primary font-medium'
                                : 'hover:bg-background-hover text-text-primary'
                            }`}
                          >
                            {sub.SubCategoryName} ({subCategoryCount(sub.SubCategoryId)})
                          </button>
                        );
                      })}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* Sağ panel - Ürün listesi */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Alfabe hızlı filtre - arama çubuğunun üstünde */}
        <div className="px-2 pt-2 pb-1 border-b border-background-border">
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectedLetter(null)}
              className={`min-w-[22px] h-6 px-1 text-xs font-medium rounded transition-colors ${
                selectedLetter === null
                  ? 'bg-primary text-white'
                  : 'bg-background-secondary text-text-secondary hover:bg-background-hover hover:text-text-primary'
              }`}
              title="Tümü"
            >
              Tümü
            </button>
            {lettersWithCount.get('0') !== undefined && (
              <button
                type="button"
                onClick={() => setSelectedLetter(selectedLetter === '0' ? null : '0')}
                className={`min-w-[22px] h-6 px-1 text-xs font-medium rounded transition-colors ${
                  selectedLetter === '0'
                    ? 'bg-primary text-white'
                    : 'bg-background-secondary text-text-secondary hover:bg-background-hover hover:text-text-primary'
                }`}
                title="Rakam ile başlayanlar"
              >
                0-9
              </button>
            )}
            {TURKISH_LETTERS.map((letter) => {
              const count = lettersWithCount.get(letter) ?? 0;
              const isSelected = selectedLetter === letter;
              return (
                <button
                  key={letter}
                  type="button"
                  onClick={() => setSelectedLetter(isSelected ? null : letter)}
                  disabled={count === 0}
                  className={`min-w-[22px] h-6 px-1 text-xs font-medium rounded transition-colors ${
                    isSelected
                      ? 'bg-primary text-white'
                      : count === 0
                        ? 'bg-background-secondary/50 text-text-secondary/50 cursor-default'
                        : 'bg-background-secondary text-text-secondary hover:bg-background-hover hover:text-text-primary'
                  }`}
                  title={count === 0 ? `${letter} ile ürün yok` : `${letter} (${count})`}
                >
                  {letter}
                </button>
              );
            })}
            {lettersWithCount.get('#') !== undefined && (
              <button
                type="button"
                onClick={() => setSelectedLetter(selectedLetter === '#' ? null : '#')}
                className={`min-w-[22px] h-6 px-1 text-xs font-medium rounded transition-colors ${
                  selectedLetter === '#'
                    ? 'bg-primary text-white'
                    : 'bg-background-secondary text-text-secondary hover:bg-background-hover hover:text-text-primary'
                }`}
                title="Diğer"
              >
                #
              </button>
            )}
          </div>
        </div>
        <div className="p-2 border-b border-background-border flex items-center gap-2 flex-wrap">
          <span className="text-text-secondary text-sm">göre ara:</span>
          <div className="relative flex-1 min-w-[180px] max-w-md">
            <span className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-text-secondary">
              <MagnifyingGlassIcon size={18} weight="regular" />
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(normalizeText(e.target.value))}
              autoFocus
              placeholder="Malzeme adı, kodu veya kategori ile ara..."
              className="input w-full pl-8 py-1.5 text-sm"
              aria-label="Ürün ara"
            />
          </div>
        </div>
        <div
          className="overflow-auto flex-1 min-h-[280px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          tabIndex={0}
        >
          <table className="w-full text-sm border-collapse text-text-primary" aria-label={displayMode === 'quote' ? 'Teklif ürün listesi' : 'Sözleşme ürün listesi'}>
            <thead className="sticky top-0 bg-background-secondary z-10">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-text-secondary border-b border-background-border">
                  Ürün Kodu
                </th>
                <th className="text-left px-3 py-2 font-semibold text-text-secondary border-b border-background-border">
                  Ürün Adı
                </th>
                <th className="text-left px-3 py-2 font-semibold text-text-secondary border-b border-background-border w-20">
                  Birim
                </th>
                <th className="text-left px-3 py-2 font-semibold text-text-secondary border-b border-background-border">
                  Kategori
                </th>
                <th className="text-right px-3 py-2 font-semibold text-text-secondary border-b border-background-border w-20">
                  Stok
                </th>
                <th className="text-right px-3 py-2 font-semibold text-text-secondary border-b border-background-border w-28">
                  {displayMode === 'quote' && quotePricing === 'sale' ? 'Birim' : 'Fiyat'}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-text-secondary"
                  >
                    {q
                      ? 'Sonuç bulunamadı. Farklı anahtar kelimeler deneyin.'
                      : selectedLetter
                        ? `"${selectedLetter === '0' ? '0-9' : selectedLetter === '#' ? 'Diğer' : selectedLetter}" ile başlayan ürün yok.`
                        : 'Bu kategoride ürün yok.'}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const i = item as ItemRecord;
                  const isFlash = highlightedItemIds?.has(item.ItemId) ?? false;
                  const isPicked = pickedItemIds?.has(item.ItemId) ?? false;
                  const isActive = activeItemId === item.ItemId;
                  return (
                    <tr
                      key={item.ItemId}
                      ref={(node) => {
                        rowRefs.current.set(item.ItemId, node);
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                      }}
                      onClick={() => {
                        onItemSelect(item);
                        focusSearchInput();
                      }}
                      onMouseEnter={() => setActiveItemId(item.ItemId)}
                      className={`border-b border-background-border bg-background-surface hover:bg-background-hover cursor-pointer transition-colors ${
                        isPicked ? 'bg-primary/12 border-l-[3px] border-l-primary' : ''
                      } ${isFlash ? 'ring-1 ring-inset ring-primary/40' : ''} ${
                        isActive ? 'bg-primary/20 ring-2 ring-inset ring-primary/70' : ''
                      }`}
                      aria-selected={isPicked}
                    >
                      <td className="px-3 py-2 text-text-secondary">
                        <span className="inline-flex items-center gap-2">
                          {isPicked && (
                            <CheckCircleIcon
                              size={18}
                              weight="fill"
                              className="shrink-0 text-primary"
                              aria-hidden
                            />
                          )}
                          {!isPicked && isFlash && (
                            <CheckCircleIcon
                              size={18}
                              weight="fill"
                              className="shrink-0 text-green-400"
                              aria-hidden
                            />
                          )}
                          <span>{getCode(i) || '—'}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-text-primary leading-tight">{getName(i)}</div>
                        {getNameEn(i).trim() ? (
                          <div className="text-xs text-text-secondary mt-0.5 leading-tight">{getNameEn(i).trim()}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">Adet</td>
                      <td className="px-3 py-2 text-text-secondary">{getCatName(i) || '—'}</td>
                      <td className="px-3 py-2 text-right text-text-secondary">
                        {getStock(i)}
                      </td>
                      <td className="px-3 py-2 text-right text-primary">
                        {displayMode === 'quote' && quotePricing === 'sale'
                          ? currency === 'EUR'
                            ? `€${getUnitPriceEur(i).toFixed(2)}`
                            : currency === 'USD'
                              ? `$${getUnitPriceUsd(i).toFixed(2)}`
                              : `₺${getUnitPrice(i).toFixed(2)}`
                          : currency === 'EUR'
                            ? `€${getMonthlyPriceEur(i).toFixed(2)}/ay`
                            : currency === 'USD'
                              ? `$${getMonthlyPriceUsd(i).toFixed(2)}/ay`
                              : `₺${getMonthlyPrice(i).toFixed(2)}/ay`}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

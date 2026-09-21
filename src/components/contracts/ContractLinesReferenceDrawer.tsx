import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MagnifyingGlassIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import type { ContractLineItem, ContractQuoteType, CurrencyCode, Inventory } from '../../models';
import {
  contractLineRentedQuantity,
  filterContractLinesForPeek,
  remainingContractLineQuantity,
  resolveInventoryForContractLine,
} from '../../utils/contractLinePeek';
import { formatInventoryBilingualLabel, formatMoney } from '../../utils/formatters';

type InventoryContractLine = Extract<ContractLineItem, { kind: 'inventory' }>;

interface ContractLinesReferenceDrawerProps {
  open: boolean;
  onClose: () => void;
  lines: ContractLineItem[];
  contractType: ContractQuoteType;
  currency?: CurrencyCode;
  /** Sözleşmede olup bu zeyilname taslağında da geçen ürünler */
  highlightedItemIds?: ReadonlySet<number>;
  highlightLabel?: string;
  zIndexClass?: string;
  /** Stok kartı çözümü (tıklayınca ekleme için) */
  items?: readonly Inventory[];
  /**
   * Verilirse stok satırına tıklayınca ürün eklenir.
   * Verilmezse ekran yalnızca referans kalır.
   */
  onSelectInventory?: (item: Inventory, line: InventoryContractLine) => void;
}

function lineKey(line: ContractLineItem, index: number): string {
  if (line.kind === 'inventory') {
    return `inv-${line.DetailId || index}-${line.ItemId}-${line.WarehouseId}`;
  }
  return `man-${line.DetailId ?? line.ClientId ?? index}`;
}

function lineTitle(line: ContractLineItem): string {
  if (line.kind === 'manual') return line.Description || 'Manuel kalem';
  return formatInventoryBilingualLabel(line.ItemName, line.ItemNameEn);
}

export default function ContractLinesReferenceDrawer({
  open,
  onClose,
  lines,
  contractType,
  currency = 'TRY',
  highlightedItemIds,
  highlightLabel = 'Bu zeyilnamede',
  zIndexClass = 'z-[80]',
  items = [],
  onSelectInventory,
}: ContractLinesReferenceDrawerProps) {
  const isRental = contractType === 'RENTAL';
  const selectable = typeof onSelectInventory === 'function';
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  const filtered = useMemo(() => filterContractLinesForPeek(lines, query), [lines, query]);

  const usageByItemId = useMemo(() => {
    const map = new Map<number, number>();
    for (const line of lines) {
      if (line.kind !== 'inventory') continue;
      map.set(line.ItemId, (map.get(line.ItemId) ?? 0) + contractLineRentedQuantity(line));
    }
    return map;
  }, [lines]);

  const handleSelectLine = (line: ContractLineItem) => {
    if (!selectable || line.kind !== 'inventory') return;
    const item = resolveInventoryForContractLine(line, items);
    if (!item) return;
    onSelectInventory(item, line);
  };

  if (!open) return null;

  const drawer = (
    <div className={`fixed inset-0 ${zIndexClass} flex justify-end`} role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} aria-hidden />
      <aside className="relative h-full w-full max-w-lg bg-background-panel border-l border-background-border shadow-2xl flex flex-col">
        <header className="shrink-0 px-4 py-3.5 border-b border-background-border">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-text-primary">Sözleşmedeki ürünler</h2>
              <p className="text-[11px] text-text-secondary mt-0.5">
                {selectable
                  ? 'Stok satırına tıklayarak ekleyin. Zeyilname ve taslak kapanmaz.'
                  : 'Yalnızca referans. Zeyilname ve eklediğiniz taslak kapanmaz.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary"
              aria-label="Kapat"
            >
              <XIcon size={18} />
            </button>
          </div>
          <div className="relative mt-3">
            <MagnifyingGlassIcon
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input w-full pl-8 text-sm py-1.5"
              placeholder="Ürün, kod veya depo ara"
              autoFocus
            />
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-auto">
          {lines.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-text-secondary">
              Bu sözleşmede henüz kalem yok.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-text-secondary">
              Aramaya uyan kalem bulunamadı.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background-surface text-text-secondary border-b border-background-border">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Ürün</th>
                  <th className="text-right font-medium px-3 py-2 whitespace-nowrap">
                    Sözleşmede
                  </th>
                  <th className="text-left font-medium px-3 py-2">Depo</th>
                  {selectable ? <th className="w-10 px-2 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((line, index) => {
                  const highlighted =
                    line.kind === 'inventory' && highlightedItemIds?.has(line.ItemId);
                  const rented = contractLineRentedQuantity(line);
                  const remaining = remainingContractLineQuantity(line);
                  const returned =
                    line.kind === 'inventory' && (line.ReturnedQuantity ?? 0) > 0
                      ? line.ReturnedQuantity
                      : 0;
                  const totalForItem =
                    line.kind === 'inventory' ? usageByItemId.get(line.ItemId) ?? rented : rented;
                  const canSelect = selectable && line.kind === 'inventory';
                  return (
                    <tr
                      key={lineKey(line, index)}
                      className={`border-b border-background-border/60 ${
                        highlighted ? 'bg-amber-500/10' : ''
                      } ${canSelect ? 'cursor-pointer hover:bg-background-hover/80' : ''}`}
                      onClick={() => handleSelectLine(line)}
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-text-primary leading-snug">
                          {lineTitle(line)}
                        </div>
                        {line.kind === 'inventory' && line.ItemCode && (
                          <div className="font-mono text-[10px] text-text-secondary mt-0.5">
                            {line.ItemCode}
                          </div>
                        )}
                        {highlighted && (
                          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/40 text-amber-200 bg-amber-500/15">
                            {highlightLabel}
                          </span>
                        )}
                        <div className="text-[10px] text-text-secondary mt-1 tabular-nums">
                          {formatMoney(Number(line.UnitPriceSnapshot) || 0, currency)}
                          {isRental ? ' / gün' : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right align-top tabular-nums text-text-primary whitespace-nowrap">
                        <div className="font-semibold">{rented} adet</div>
                        {totalForItem !== rented ? (
                          <div className="text-[10px] text-text-secondary">toplam {totalForItem}</div>
                        ) : null}
                        {isRental && remaining !== rented ? (
                          <div className="text-[10px] text-text-secondary">kirada {remaining}</div>
                        ) : null}
                        {returned ? (
                          <div className="text-[10px] text-text-secondary">iade {returned}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top text-text-secondary">
                        {line.kind === 'inventory' ? line.WarehouseName || '—' : '—'}
                      </td>
                      {selectable ? (
                        <td className="px-2 py-2 align-middle text-center">
                          {canSelect ? (
                            <button
                              type="button"
                              className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-blue-400 bg-blue-500/15 hover:bg-blue-500/25"
                              aria-label={`${lineTitle(line)} ekle`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectLine(line);
                              }}
                            >
                              <PlusIcon size={14} weight="bold" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-text-secondary">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className="shrink-0 px-4 py-2.5 border-t border-background-border text-[11px] text-text-secondary">
          {filtered.length} / {lines.length} kalem
          {selectable ? ' · Stok ürününe tıklayınca eklenir' : ''}
        </footer>
      </aside>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(drawer, document.body) : null;
}

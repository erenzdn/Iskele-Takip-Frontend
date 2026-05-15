import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircleIcon, MinusCircleIcon, XIcon } from '@phosphor-icons/react';
import { Inventory } from '../../models';
import ItemPickerPanel, { ItemDisplayMode, QuotePricingMode } from '../ItemPickerPanel';
import { formatInventoryBilingualLabel } from '../../utils/formatters';

const FLASH_MS = 1400;

/** `false`: işlem başarısız (geri bildirim yok). Diğerleri başarılı işlem türü. */
export type ProductPickResult = 'added' | 'removed' | false | true | void;

interface ProductPickerModalProps {
  open: boolean;
  onClose: () => void;
  items: Inventory[];
  /**
   * Tek tıkta listeye ekle veya çıkar (parent karar verir).
   * `false`: hata; `removed`: listeden çıkarıldı; `true`/`void`/`added`: eklendi.
   */
  onItemSelect: (item: Inventory, quantity: number) => ProductPickResult | Promise<ProductPickResult>;
  displayMode?: ItemDisplayMode;
  /** displayMode=quote için satış / kiralama fiyat sütunu */
  quotePricing?: QuotePricingMode;
  currency?: 'TRY' | 'EUR' | 'USD';
  /** Tanımlıysa satırlarda listede olan ürünler kalıcı işaretlenir (teklif/sözleşme). */
  pickedItemIds?: ReadonlySet<number>;
}

function normalizePickResult(raw: ProductPickResult): 'added' | 'removed' | null {
  if (raw === false) return null;
  if (raw === 'removed') return 'removed';
  return 'added';
}

function tryGetComputedDailyPreview(
  item: Inventory,
  displayMode: ItemDisplayMode,
  quotePricing: QuotePricingMode,
  currency: 'TRY' | 'EUR' | 'USD'
): string | null {
  const monthly =
    currency === 'EUR'
      ? item.MonthlyListPriceEur
      : currency === 'USD'
        ? item.MonthlyListPriceUsd
        : item.MonthlyListPrice;
  const unit =
    currency === 'EUR' ? item.UnitPriceEur : currency === 'USD' ? item.UnitPriceUsd : item.UnitPrice;

  if (displayMode === 'quote' && quotePricing === 'sale') {
    if (unit == null) return null;
    const v = Number(unit);
    if (!Number.isFinite(v) || v <= 0) return null;
    const s = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : '₺';
    return `Hesaplanan Birim Fiyat: ${s}${v.toFixed(2)}`;
  }

  if (monthly == null) return null;
  const m = Number(monthly);
  if (!Number.isFinite(m) || m <= 0) return null;
  const d = m / 30;
  const s = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : '₺';
  return `Hesaplanan Günlük Fiyat: ${s}${d.toFixed(2)}`;
}

export default function ProductPickerModal({
  open,
  onClose,
  items,
  onItemSelect,
  displayMode = 'contract',
  quotePricing = 'rental',
  currency = 'TRY',
  pickedItemIds,
}: ProductPickerModalProps) {
  const [highlightedItemIds, setHighlightedItemIds] = useState<Set<number>>(() => new Set());
  const [toast, setToast] = useState<{ message: string; kind: 'added' | 'removed' } | null>(null);
  const flashTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFlashTimeouts = useCallback(() => {
    flashTimeoutsRef.current.forEach((t) => clearTimeout(t));
    flashTimeoutsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!open) {
      setHighlightedItemIds(new Set());
      setToast(null);
      clearFlashTimeouts();
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
    }
  }, [open, clearFlashTimeouts]);

  useEffect(
    () => () => {
      clearFlashTimeouts();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    },
    [clearFlashTimeouts]
  );

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  const scheduleHighlightClear = (itemId: number) => {
    const prev = flashTimeoutsRef.current.get(itemId);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      setHighlightedItemIds((s) => {
        const n = new Set(s);
        n.delete(itemId);
        return n;
      });
      flashTimeoutsRef.current.delete(itemId);
    }, FLASH_MS);
    flashTimeoutsRef.current.set(itemId, t);
  };

  const handleRowClick = async (item: Inventory) => {
    const action = normalizePickResult(await Promise.resolve(onItemSelect(item, 1)));
    if (action === null) return;
    const itemId = item.ItemId;
    setHighlightedItemIds((s) => new Set(s).add(itemId));
    scheduleHighlightClear(itemId);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    const label = formatInventoryBilingualLabel(item.ItemName, item.ItemNameEn);
    const preview = tryGetComputedDailyPreview(item, displayMode, quotePricing, currency);
    const messageSuffix = preview ? ` • ${preview}` : '';
    if (action === 'removed') {
      setToast({ message: `${label} listeden çıkarıldı${messageSuffix}`, kind: 'removed' });
    } else {
      setToast({ message: `${label} eklendi${messageSuffix}`, kind: 'added' });
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 2200);
  };

  if (!open) return null;

  const hintWithToggle =
    pickedItemIds !== undefined
      ? 'Listede olan satıra tekrar tıklayarak kalemi çıkarın. Yeni ürün eklemek için satıra bir kez tıklayın; miktarı alttaki listedeki sütundan düzenleyin.'
      : 'Satıra tıklayarak ekleyin; miktarı alttaki listedeki miktar sütunundan düzenleyin.';

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/60"
      aria-modal="true"
      role="dialog"
    >
      <div className="flex h-full w-full min-h-0 flex-col bg-background-panel shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-background-border shrink-0 bg-background-secondary/50">
          <h2 className="text-lg font-semibold text-text-primary">Ürün Seçimi</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
            aria-label="Kapat"
          >
            <XIcon size={22} weight="regular" />
          </button>
        </div>
        <div className="flex-1 min-h-0 p-3 sm:p-4 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-hidden border border-background-border bg-background-panel">
            <ItemPickerPanel
              items={items}
              onItemSelect={handleRowClick}
              displayMode={displayMode}
              quotePricing={quotePricing}
              currency={currency}
              highlightedItemIds={highlightedItemIds}
              pickedItemIds={pickedItemIds}
              className="h-full rounded-none border-0"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-background-border shrink-0 bg-background-secondary/30 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          {toast && (
            <div className="w-full sm:w-auto sm:flex-1 flex justify-center sm:justify-start order-first sm:order-none" role="status" aria-live="polite">
              {toast.kind === 'added' ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-green-400 bg-green-500/15 border border-green-500/30 rounded-full px-3 py-1.5">
                  <CheckCircleIcon size={18} weight="fill" className="shrink-0" aria-hidden />
                  {toast.message}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-full px-3 py-1.5">
                  <MinusCircleIcon size={18} weight="fill" className="shrink-0" aria-hidden />
                  {toast.message}
                </span>
              )}
            </div>
          )}
          <p className="text-sm text-text-secondary flex-1 min-w-0 order-2 sm:order-none">{hintWithToggle}</p>
          <button type="button" onClick={onClose} className="btn-secondary py-2 px-4 shrink-0 order-3 sm:order-none">
            Ekle
          </button>
        </div>
      </div>
    </div>
  );
}

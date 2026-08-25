import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PackageIcon, XIcon } from '@phosphor-icons/react';
import type {
  AddendumDetail,
  ChangeType,
  ContractLineItem,
  ContractQuoteType,
  Inventory,
  Warehouse,
  WarehouseStock,
} from '../../models';
import {
  addendumService,
  type CreateAddendumDetailRequest,
  type UpdateAddendumDetailRequest,
} from '../../services/addendumService';
import { inventoryService } from '../../services/inventoryService';
import { getApiErrorMessage, getUserFacingApiErrorMessage } from '../../utils/apiError';
import { getChangeTypeLabel } from '../../utils/addendum';
import { toast } from '../../hooks/useToast';
import { firstValidationError, validateNumber, validateRequired } from '../../utils/validation';
import { isStockErrorMessage } from '../../utils/parseStockError';
import { formatInventoryBilingualLabel, formatMoney } from '../../utils/formatters';
import StockErrorPanel from '../StockErrorPanel';
import ItemPickerPanel from '../ItemPickerPanel';

type AddKind = 'inventory' | 'manual';

interface AddendumLineItemModalProps {
  open: boolean;
  addendumId: number;
  contractType: ContractQuoteType;
  contractLines: ContractLineItem[];
  items: Inventory[];
  warehouses: Warehouse[];
  /** Düzenleme modu */
  editingDetail?: AddendumDetail | null;
  /** Yeni kalemde başlangıç tipi (örn. mevcut kalem değiştir → INCREASE) */
  initialChangeType?: ChangeType;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  zIndexClass?: string;
}

function parseIntQty(raw: string): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? n : NaN;
}

function parsePositiveInt(raw: string): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function lineLabel(line: ContractLineItem): string {
  const id = line.DetailId ?? '?';
  if (line.kind === 'manual') {
    return `Manuel #${id}: ${line.Description || '—'}`;
  }
  const code = line.ItemCode ? `${line.ItemCode} — ` : '';
  return `#${id}: ${code}${line.ItemName} (kirada: ${line.RentedQuantity})`;
}

function contractLineDetailRows(line: ContractLineItem): { label: string; value: string }[] {
  if (line.kind === 'manual') {
    return [
      { label: 'Açıklama', value: line.Description || '—' },
      { label: 'Miktar', value: String(line.RentedQuantity) },
      {
        label: 'Birim fiyat',
        value: line.UnitPriceSnapshot != null ? formatMoney(line.UnitPriceSnapshot) : '—',
      },
    ];
  }
  const rows: { label: string; value: string }[] = [
    {
      label: 'Ürün',
      value: formatInventoryBilingualLabel(line.ItemName, line.ItemNameEn),
    },
    { label: 'Ürün kodu', value: line.ItemCode || '—' },
    { label: 'Depo', value: line.WarehouseName || `#${line.WarehouseId}` },
    { label: 'Kiralanan miktar', value: String(line.RentedQuantity) },
    { label: 'İade edilen', value: String(line.ReturnedQuantity ?? 0) },
    {
      label: 'Birim fiyat',
      value: line.UnitPriceSnapshot != null ? formatMoney(line.UnitPriceSnapshot) : '—',
    },
  ];
  if (line.MonthlyPriceOverride != null) {
    rows.push({ label: 'Aylık override', value: formatMoney(line.MonthlyPriceOverride) });
  }
  return rows;
}

function selectedItemSummary(item: Inventory): { label: string; value: string }[] {
  const available = Math.max(0, (item.TotalStock ?? 0) - (item.OnRent ?? 0));
  const categories =
    item.Categories?.map((c) => c.CategoryName).filter(Boolean).join(', ') || '—';
  const rows: { label: string; value: string }[] = [
    {
      label: 'Ürün adı',
      value: formatInventoryBilingualLabel(item.ItemName, item.ItemNameEn),
    },
    { label: 'Ürün kodu', value: item.ItemCode || '—' },
    { label: 'Kategori', value: categories },
    { label: 'Toplam stok', value: String(item.TotalStock ?? 0) },
    { label: 'Kirada', value: String(item.OnRent ?? 0) },
    { label: 'Müsait', value: String(available) },
  ];
  if (item.UnitName) rows.push({ label: 'Birim', value: item.UnitName });
  if (item.MonthlyListPrice != null && item.MonthlyListPrice > 0) {
    rows.push({ label: 'Aylık liste fiyatı', value: formatMoney(item.MonthlyListPrice) });
  }
  if (item.UnitPrice != null && item.UnitPrice > 0) {
    rows.push({ label: 'Birim fiyat', value: formatMoney(item.UnitPrice) });
  }
  if (item.DailyPrice != null && item.DailyPrice > 0) {
    rows.push({ label: 'Günlük fiyat', value: formatMoney(item.DailyPrice) });
  }
  return rows;
}

export default function AddendumLineItemModal({
  open,
  addendumId,
  contractType,
  contractLines,
  items,
  warehouses,
  editingDetail = null,
  initialChangeType = 'INCREASE',
  onClose,
  onSaved,
  zIndexClass = 'z-[70]',
}: AddendumLineItemModalProps) {
  const isRental = contractType === 'RENTAL';
  const isSale = contractType === 'SALE';
  const isEdit = Boolean(editingDetail?.DetailId);

  const [changeType, setChangeType] = useState<ChangeType>('ADD');
  const [addKind, setAddKind] = useState<AddKind>('inventory');
  const [isBusy, setIsBusy] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [itemWarehouseStocks, setItemWarehouseStocks] = useState<WarehouseStock[]>([]);
  const [stocksLoading, setStocksLoading] = useState(false);

  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | ''>('');
  const [selectedContractDetailId, setSelectedContractDetailId] = useState<number | ''>('');
  const [quantityStr, setQuantityStr] = useState('1');
  const [manualDescription, setManualDescription] = useState('');
  const [unitPriceStr, setUnitPriceStr] = useState('');
  const [monthlyOverrideStr, setMonthlyOverrideStr] = useState('');

  const sortedItems = useMemo(() => {
    const list = [...(items || [])];
    list.sort((a, b) => (a.ItemName || '').localeCompare(b.ItemName || '', 'tr'));
    return list;
  }, [items]);

  const selectableLines = useMemo(
    () => contractLines.filter((l) => l.DetailId != null && Number(l.DetailId) > 0),
    [contractLines]
  );

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return sortedItems.find((it) => it.ItemId === Number(selectedItemId)) ?? null;
  }, [sortedItems, selectedItemId]);

  const selectedContractLine = useMemo(() => {
    if (!selectedContractDetailId) return null;
    return selectableLines.find((l) => l.DetailId === Number(selectedContractDetailId)) ?? null;
  }, [selectableLines, selectedContractDetailId]);

  const isInventoryAdd = changeType === 'ADD' && addKind === 'inventory';
  const requestedQty = parsePositiveInt(quantityStr);

  const selectedWarehouseStock = useMemo(() => {
    if (!selectedWarehouseId) return null;
    const whId = Number(selectedWarehouseId);
    return itemWarehouseStocks.find((s) => s.WarehouseId === whId)?.Quantity ?? null;
  }, [itemWarehouseStocks, selectedWarehouseId]);

  const stockInlineWarning =
    isInventoryAdd &&
    selectedWarehouseId &&
    selectedWarehouseStock != null &&
    requestedQty > selectedWarehouseStock
      ? `Seçili depoda yalnızca ${selectedWarehouseStock} adet müsait; talep ${requestedQty} adet.`
      : null;

  const highlightedItemIds = useMemo(() => {
    if (!selectedItemId) return undefined;
    return new Set([Number(selectedItemId)]);
  }, [selectedItemId]);

  useEffect(() => {
    if (!open) return;
    setIsBusy(false);
    setStockError(null);
    setItemWarehouseStocks([]);

    if (editingDetail) {
      setChangeType(editingDetail.ChangeType);
      setAddKind(editingDetail.IsManual ? 'manual' : 'inventory');
      setSelectedItemId(editingDetail.ItemId ?? '');
      setSelectedWarehouseId(editingDetail.WarehouseId ?? '');
      setSelectedContractDetailId(editingDetail.ContractDetailId ?? '');
      setManualDescription(editingDetail.Description ?? '');
      const qty = editingDetail.QuantityChange;
      if (editingDetail.ChangeType === 'DECREASE' && qty != null) {
        setQuantityStr(String(Math.abs(qty)));
      } else if (qty != null) {
        setQuantityStr(String(qty));
      } else {
        setQuantityStr('1');
      }
      setUnitPriceStr(
        editingDetail.NewUnitPrice != null && Number.isFinite(editingDetail.NewUnitPrice)
          ? String(editingDetail.NewUnitPrice)
          : ''
      );
      setMonthlyOverrideStr(
        editingDetail.NewMonthlyOverride != null && Number.isFinite(editingDetail.NewMonthlyOverride)
          ? String(editingDetail.NewMonthlyOverride)
          : ''
      );
    } else {
      setChangeType(initialChangeType);
      setAddKind('inventory');
      setSelectedItemId('');
      setSelectedWarehouseId('');
      setSelectedContractDetailId('');
      setQuantityStr('1');
      setManualDescription('');
      setUnitPriceStr('');
      setMonthlyOverrideStr('');
    }
  }, [open, editingDetail, initialChangeType]);

  useEffect(() => {
    if (!open || changeType !== 'ADD' || addKind !== 'inventory' || !selectedItemId) {
      setItemWarehouseStocks([]);
      return;
    }
    let cancelled = false;
    setStocksLoading(true);
    inventoryService
      .getWarehousesByItemAsync(Number(selectedItemId))
      .then((stocks) => {
        if (!cancelled) setItemWarehouseStocks(stocks);
      })
      .catch(() => {
        if (!cancelled) setItemWarehouseStocks([]);
      })
      .finally(() => {
        if (!cancelled) setStocksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, changeType, addKind, selectedItemId]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, isBusy, onClose]);

  if (!open) return null;

  const buildPayload = (): CreateAddendumDetailRequest | null => {
    if (changeType === 'ADD') {
      if (addKind === 'inventory') {
        const qty = parseIntQty(quantityStr);
        const err = firstValidationError([
          validateRequired(String(selectedItemId || ''), 'Ürün'),
          validateRequired(String(selectedWarehouseId || ''), 'Depo'),
          validateNumber(qty, 'Miktar', { min: 1 }),
        ]);
        if (err) {
          toast.warning(err);
          return null;
        }
        return {
          ChangeType: 'ADD',
          ItemId: Number(selectedItemId),
          WarehouseId: Number(selectedWarehouseId),
          QuantityChange: qty,
          IsManual: false,
        };
      }
      const qty = parseIntQty(quantityStr);
      const price = unitPriceStr.trim() === '' ? undefined : Number(unitPriceStr);
      const err = firstValidationError([
        validateRequired(manualDescription.trim(), 'Açıklama'),
        validateNumber(qty, 'Miktar', { min: 1 }),
        ...(price === undefined ? [] : [validateNumber(price, 'Birim fiyat', { min: 0 })]),
      ]);
      if (err) {
        toast.warning(err);
        return null;
      }
      return {
        ChangeType: 'ADD',
        IsManual: true,
        Description: manualDescription.trim(),
        QuantityChange: qty,
        ...(price !== undefined ? { NewUnitPrice: price } : {}),
      };
    }

    if (changeType === 'INCREASE' || changeType === 'DECREASE') {
      const absQty = parseIntQty(quantityStr);
      const err = firstValidationError([
        validateRequired(String(selectedContractDetailId || ''), 'Sözleşme kalemi'),
        validateNumber(absQty, 'Miktar', { min: 1 }),
      ]);
      if (err) {
        toast.warning(err);
        return null;
      }
      if (changeType === 'DECREASE' && selectedContractLine) {
        const rented = selectedContractLine.RentedQuantity ?? 0;
        if (absQty > rented) {
          toast.warning(
            `Azaltma miktarı mevcut kiralanan miktardan (${rented}) fazla olamaz.`
          );
          return null;
        }
      }
      return {
        ChangeType: changeType,
        ContractDetailId: Number(selectedContractDetailId),
        QuantityChange: changeType === 'DECREASE' ? -absQty : absQty,
      };
    }

    const price = Number(unitPriceStr);
    const monthly =
      monthlyOverrideStr.trim() === '' ? undefined : Number(monthlyOverrideStr);
    const err = firstValidationError([
      validateRequired(String(selectedContractDetailId || ''), 'Sözleşme kalemi'),
      validateNumber(price, 'Yeni birim fiyat', { min: 0 }),
      ...(monthly === undefined
        ? []
        : [validateNumber(monthly, 'Aylık override', { min: 0 })]),
    ]);
    if (err) {
      toast.warning(err);
      return null;
    }
    return {
      ChangeType: 'PRICE_CHANGE',
      ContractDetailId: Number(selectedContractDetailId),
      NewUnitPrice: price,
      ...(isRental && monthly !== undefined ? { NewMonthlyOverride: monthly } : {}),
    };
  };

  const handleReduceQuantity = (available: number) => {
    setQuantityStr(String(Math.max(1, available)));
    setStockError(null);
  };

  const handleSave = async () => {
    const payload = buildPayload();
    if (!payload) return;

    try {
      setIsBusy(true);
      setStockError(null);
      if (isEdit && editingDetail) {
        const patch: UpdateAddendumDetailRequest = { ...payload };
        await addendumService.updateDetailAsync(addendumId, editingDetail.DetailId, patch);
        toast.success('Kalem güncellendi');
      } else {
        await addendumService.addDetailAsync(addendumId, payload);
        toast.success('Kalem eklendi');
      }
      await Promise.resolve(onSaved());
      onClose();
    } catch (error) {
      console.error('Addendum line save error:', error);
      const msg = getApiErrorMessage(error) || 'Kalem kaydedilemedi';
      if (isStockErrorMessage(msg)) {
        setStockError(msg);
      } else {
        toast.error(getUserFacingApiErrorMessage(error, 'addendum'));
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleItemPick = (item: Inventory) => {
    setSelectedItemId(item.ItemId);
    setSelectedWarehouseId('');
    setStockError(null);
  };

  const changeTypes: ChangeType[] = ['ADD', 'INCREASE', 'DECREASE', 'PRICE_CHANGE'];

  const pickerDisplayMode = isSale ? 'quote' : 'contract';
  const pickerQuotePricing = isSale ? 'sale' : 'rental';

  const renderChangeTypeTabs = () => (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
        Değişiklik tipi
      </div>
      <div className="flex flex-wrap gap-2">
        {changeTypes.map((ct) => (
          <button
            key={ct}
            type="button"
            onClick={() => setChangeType(ct)}
            className={changeType === ct ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
            disabled={isBusy}
          >
            {getChangeTypeLabel(ct)}
          </button>
        ))}
      </div>
    </div>
  );

  const renderAddKindTabs = () => (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
        Kalem tipi
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAddKind('inventory')}
          className={addKind === 'inventory' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
          disabled={isBusy}
        >
          Envanter Ürünü
        </button>
        <button
          type="button"
          onClick={() => setAddKind('manual')}
          className={addKind === 'manual' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
          disabled={isBusy}
        >
          Manuel Kalem
        </button>
      </div>
    </div>
  );

  const renderWarehouseFields = () => (
    <>
      <div>
        <label className="block text-xs font-medium text-text-primary mb-1.5">Depo *</label>
        <select
          value={selectedWarehouseId}
          onChange={(e) => {
            setSelectedWarehouseId(Number(e.target.value) || '');
            setStockError(null);
          }}
          className="input w-full"
          disabled={isBusy || !selectedItemId}
        >
          <option value="">Depo seçin</option>
          {warehouses.map((wh) => {
            const stock = itemWarehouseStocks.find((s) => s.WarehouseId === wh.WarehouseId);
            const stockLabel =
              selectedItemId && stock != null ? ` (${stock.Quantity} adet)` : '';
            return (
              <option key={wh.WarehouseId} value={wh.WarehouseId}>
                {wh.WarehouseName}
                {stockLabel}
              </option>
            );
          })}
        </select>
        {selectedItemId && stocksLoading && (
          <div className="text-xs text-text-secondary mt-1.5">Stok bilgisi yükleniyor...</div>
        )}
        {selectedItemId && !stocksLoading && selectedWarehouseStock != null && (
          <div className="text-xs text-text-secondary mt-1.5">
            Seçili depoda müsait: <span className="font-medium text-text-primary">{selectedWarehouseStock}</span> adet
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-text-primary mb-1.5">Miktar *</label>
        <input
          type="number"
          min={1}
          value={quantityStr}
          onChange={(e) => {
            setQuantityStr(e.target.value);
            setStockError(null);
          }}
          className="input w-full"
          disabled={isBusy}
        />
        {stockInlineWarning && (
          <p className="text-xs text-amber-400 mt-1.5">{stockInlineWarning}</p>
        )}
      </div>

      {selectedItemId && !stocksLoading && itemWarehouseStocks.length > 0 && (
        <div className="rounded-lg border border-background-border bg-background-secondary/30 overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wider border-b border-background-border">
            Depo stok dağılımı
          </div>
          <div className="max-h-36 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-secondary border-b border-background-border/60">
                  <th className="text-left py-1.5 px-3 font-medium">Depo</th>
                  <th className="text-right py-1.5 px-3 font-medium">Müsait</th>
                </tr>
              </thead>
              <tbody>
                {itemWarehouseStocks.map((s) => {
                  const wh = warehouses.find((w) => w.WarehouseId === s.WarehouseId);
                  const isSelected = selectedWarehouseId === s.WarehouseId;
                  return (
                    <tr
                      key={s.WarehouseId}
                      className={`border-b border-background-border/40 ${isSelected ? 'bg-primary/10' : ''}`}
                    >
                      <td className="py-1.5 px-3 text-text-primary">{wh?.WarehouseName ?? s.WarehouseId}</td>
                      <td className="py-1.5 px-3 text-right font-medium text-text-primary">{s.Quantity}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );

  const renderSelectedProductPanel = () => {
    if (!selectedItem) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center rounded-xl border border-dashed border-background-border bg-background-secondary/20">
          <PackageIcon size={40} className="text-text-secondary/60" weight="duotone" />
          <div>
            <p className="text-sm font-medium text-text-primary">Ürün seçilmedi</p>
            <p className="text-xs text-text-secondary mt-1">
              Soldaki listeden bir ürüne tıklayarak seçin. Arama ve kategori filtrelerini kullanabilirsiniz.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-background-border bg-background-secondary/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-background-border bg-background-secondary/40">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
            Seçili ürün
          </p>
          <p className="text-sm font-semibold text-text-primary leading-snug">
            {formatInventoryBilingualLabel(selectedItem.ItemName, selectedItem.ItemNameEn)}
          </p>
          {selectedItem.ItemCode && (
            <p className="text-xs font-mono text-text-secondary mt-0.5">{selectedItem.ItemCode}</p>
          )}
        </div>
        <dl className="divide-y divide-background-border/60">
          {selectedItemSummary(selectedItem).map((row) => (
            <div key={row.label} className="flex justify-between gap-3 px-4 py-2 text-xs">
              <dt className="text-text-secondary shrink-0">{row.label}</dt>
              <dd className="text-text-primary text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  };

  const renderContractLinePanel = () => {
    if (!selectedContractLine) {
      return (
        <div className="rounded-xl border border-dashed border-background-border bg-background-secondary/20 px-4 py-8 text-center">
          <p className="text-sm text-text-secondary">
            Sözleşme kalemi seçildiğinde mevcut bilgiler burada görüntülenir.
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-background-border bg-background-secondary/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-background-border bg-background-secondary/40">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
            Seçili sözleşme kalemi
          </p>
          <p className="text-sm font-semibold text-text-primary">
            {lineLabel(selectedContractLine)}
          </p>
        </div>
        <dl className="divide-y divide-background-border/60">
          {contractLineDetailRows(selectedContractLine).map((row) => (
            <div key={row.label} className="flex justify-between gap-3 px-4 py-2 text-xs">
              <dt className="text-text-secondary shrink-0">{row.label}</dt>
              <dd className="text-text-primary text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  };

  const modalTree = (
    <div
      className={`fixed inset-0 ${zIndexClass} flex flex-col bg-black/60`}
      aria-modal="true"
      role="dialog"
    >
      <div className="flex h-full w-full min-h-0 flex-col bg-background-panel shadow-2xl overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-background-border shrink-0 bg-background-secondary/50">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {isEdit ? 'Kalem Düzenle' : 'Zeyilname Kalemi Ekle'}
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              {isInventoryAdd
                ? 'Ürün listesinden seçim yapın, ardından depo ve miktarı belirleyin.'
                : 'Değişiklik tipini seçin ve ilgili alanları doldurun.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
            aria-label="Kapat"
            disabled={isBusy}
          >
            <XIcon size={22} weight="regular" />
          </button>
        </header>

        <div className="px-5 py-3 border-b border-background-border shrink-0 bg-background-panel space-y-3">
          {stockError && (
            <StockErrorPanel
              message={stockError}
              onRetry={handleSave}
              onReduceQuantity={isInventoryAdd ? handleReduceQuantity : undefined}
              onDismiss={() => setStockError(null)}
            />
          )}
          {renderChangeTypeTabs()}
          {changeType === 'ADD' && renderAddKindTabs()}
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {isInventoryAdd ? (
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
              <div className="flex-1 min-h-[280px] lg:min-h-0 p-3 sm:p-4 overflow-hidden flex flex-col">
                <div className="flex-1 min-h-0 overflow-hidden border border-background-border bg-background-panel rounded-lg">
                  <ItemPickerPanel
                    items={sortedItems}
                    onItemSelect={handleItemPick}
                    displayMode={pickerDisplayMode}
                    quotePricing={pickerQuotePricing}
                    highlightedItemIds={highlightedItemIds}
                    pickedItemIds={highlightedItemIds}
                    className="h-full rounded-lg border-0"
                  />
                </div>
              </div>
              <aside className="w-full lg:w-[420px] xl:w-[460px] shrink-0 border-t lg:border-t-0 lg:border-l border-background-border overflow-y-auto bg-background-secondary/20">
                <div className="p-4 space-y-4">
                  {renderSelectedProductPanel()}
                  {renderWarehouseFields()}
                </div>
              </aside>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto w-full p-5 sm:p-6 space-y-5">
                {changeType === 'ADD' && addKind === 'manual' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-text-primary mb-1.5">
                        Açıklama *
                      </label>
                      <textarea
                        value={manualDescription}
                        onChange={(e) => setManualDescription(e.target.value)}
                        className="input w-full min-h-[88px] resize-y"
                        disabled={isBusy}
                        placeholder="Örn: Nakliye, montaj veya hizmet bedeli açıklaması"
                        rows={3}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-primary mb-1.5">
                        Miktar *
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={quantityStr}
                        onChange={(e) => setQuantityStr(e.target.value)}
                        className="input w-full"
                        disabled={isBusy}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-primary mb-1.5">
                        Birim fiyat (opsiyonel)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={unitPriceStr}
                        onChange={(e) => setUnitPriceStr(e.target.value)}
                        className="input w-full"
                        disabled={isBusy}
                        placeholder="Boş bırakılabilir"
                      />
                      <p className="text-xs text-text-secondary mt-1.5">
                        Manuel kalemlerde birim fiyat belirtilmezse sözleşme fiyatlandırma kuralları uygulanır.
                      </p>
                    </div>
                  </div>
                )}

                {(changeType === 'INCREASE' || changeType === 'DECREASE') && (
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-text-primary mb-1.5">
                          Sözleşme kalemi *
                        </label>
                        <select
                          value={selectedContractDetailId}
                          onChange={(e) => setSelectedContractDetailId(Number(e.target.value) || '')}
                          className="input w-full"
                          disabled={isBusy}
                        >
                          <option value="">Kalem seçin</option>
                          {selectableLines.map((line) => (
                            <option key={line.DetailId} value={line.DetailId}>
                              {lineLabel(line)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-text-primary mb-1.5">
                          {changeType === 'DECREASE' ? 'Azaltılacak miktar *' : 'Artırılacak miktar *'}
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={quantityStr}
                          onChange={(e) => setQuantityStr(e.target.value)}
                          className="input w-full"
                          disabled={isBusy}
                        />
                        {changeType === 'DECREASE' && selectedContractLine && (
                          <p className="text-xs text-text-secondary mt-1.5">
                            Mevcut kiralanan miktar: {selectedContractLine.RentedQuantity}. Azaltma API&apos;ye negatif olarak gönderilir.
                          </p>
                        )}
                      </div>
                    </div>
                    <div>{renderContractLinePanel()}</div>
                  </div>
                )}

                {changeType === 'PRICE_CHANGE' && (
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-text-primary mb-1.5">
                          Sözleşme kalemi *
                        </label>
                        <select
                          value={selectedContractDetailId}
                          onChange={(e) => setSelectedContractDetailId(Number(e.target.value) || '')}
                          className="input w-full"
                          disabled={isBusy}
                        >
                          <option value="">Kalem seçin</option>
                          {selectableLines.map((line) => (
                            <option key={line.DetailId} value={line.DetailId}>
                              {lineLabel(line)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-text-primary mb-1.5">
                          Yeni birim fiyat *
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={unitPriceStr}
                          onChange={(e) => setUnitPriceStr(e.target.value)}
                          className="input w-full"
                          disabled={isBusy}
                        />
                      </div>
                      {isRental && (
                        <div>
                          <label className="block text-xs font-medium text-text-primary mb-1.5">
                            Aylık override (opsiyonel)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={monthlyOverrideStr}
                            onChange={(e) => setMonthlyOverrideStr(e.target.value)}
                            className="input w-full"
                            disabled={isBusy}
                            placeholder="Boş bırakılabilir"
                          />
                        </div>
                      )}
                    </div>
                    <div>{renderContractLinePanel()}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-background-border shrink-0 bg-background-secondary/30">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isBusy}>
            İptal
          </button>
          <button type="button" onClick={handleSave} className="btn-primary" disabled={isBusy}>
            {isBusy ? 'Kaydediliyor...' : isEdit ? 'Güncelle' : 'Ekle'}
          </button>
        </footer>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalTree, document.body) : null;
}

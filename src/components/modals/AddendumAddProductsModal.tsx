import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PlusIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
import type { ContractQuoteType, CurrencyCode, Inventory, Warehouse } from '../../models';
import { addendumService } from '../../services/addendumService';
import { inventoryService } from '../../services/inventoryService';
import { getApiErrorMessage, getUserFacingApiErrorMessage } from '../../utils/apiError';
import {
  clampDiscountPercent,
  discountPercentFromNet,
  lineNetFromGross,
} from '../../utils/lineDiscount';
import { formatInventoryBilingualLabel, formatMoney } from '../../utils/formatters';
import { isStockErrorMessage } from '../../utils/parseStockError';
import { toast } from '../../hooks/useToast';
import ProductPickerModal from './ProductPickerModal';
import StockErrorPanel from '../StockErrorPanel';

type StagingLine = {
  key: string;
  item: Inventory;
  quantity: number;
  warehouseId: number | '';
  /** Liste / brüt birim fiyat (satış: birim; kiralama: günlük) */
  unitPrice: number;
  discountPercent: number;
};

interface AddendumAddProductsModalProps {
  open: boolean;
  addendumId: number;
  contractType: ContractQuoteType;
  items: Inventory[];
  warehouses: Warehouse[];
  currency?: CurrencyCode;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  zIndexClass?: string;
}

function unitPriceForInventory(
  inv: Inventory,
  cur: CurrencyCode,
  cType: ContractQuoteType
): number {
  if (cType === 'SALE') {
    return cur === 'EUR'
      ? inv.UnitPriceEur ?? 0
      : cur === 'USD'
        ? inv.UnitPriceUsd ?? 0
        : inv.UnitPrice ?? 0;
  }
  return cur === 'EUR'
    ? (inv.MonthlyListPriceEur ?? 0) / 30
    : cur === 'USD'
      ? (inv.MonthlyListPriceUsd ?? 0) / 30
      : (inv.MonthlyListPrice || 0) / 30;
}

function parseDecimalInput(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export default function AddendumAddProductsModal({
  open,
  addendumId,
  contractType,
  items,
  warehouses,
  currency = 'TRY',
  onClose,
  onSaved,
  zIndexClass = 'z-[75]',
}: AddendumAddProductsModalProps) {
  const isRental = contractType === 'RENTAL';
  const [lines, setLines] = useState<StagingLine[]>([]);
  const [defaultWarehouseId, setDefaultWarehouseId] = useState<number | ''>('');
  const [globalIskonto, setGlobalIskonto] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [lineNetDrafts, setLineNetDrafts] = useState<Record<string, string>>({});
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [iskontoDrafts, setIskontoDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setLines([]);
    setDefaultWarehouseId('');
    setGlobalIskonto(0);
    setShowPicker(false);
    setIsBusy(false);
    setStockError(null);
    setLineNetDrafts({});
    setQtyDrafts({});
    setPriceDrafts({});
    setIskontoDrafts({});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showPicker && !isBusy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, showPicker, isBusy, onClose]);

  const pickedItemIds = useMemo(() => new Set(lines.map((l) => l.item.ItemId)), [lines]);

  const formatCur = (amount: number) => formatMoney(amount, currency);

  const getGross = (line: StagingLine) =>
    Math.max(0, line.unitPrice) * Math.max(0, line.quantity);

  const getNet = (line: StagingLine) =>
    lineNetFromGross(getGross(line), line.discountPercent);

  const getEffectiveUnitPrice = (line: StagingLine) => {
    const qty = Math.max(1, line.quantity);
    return lineNetFromGross(line.unitPrice * qty, line.discountPercent) / qty;
  };

  const addOrToggleItem = (item: Inventory, quantity: number) => {
    const existing = lines.find((l) => l.item.ItemId === item.ItemId);
    if (existing) {
      setLines((prev) => prev.filter((l) => l.item.ItemId !== item.ItemId));
      setLineNetDrafts((prev) => {
        const next = { ...prev };
        delete next[existing.key];
        return next;
      });
      return 'removed' as const;
    }
    const key = `add-${item.ItemId}-${Date.now()}`;
    const unitPrice = unitPriceForInventory(item, currency, contractType);
    setLines((prev) => [
      ...prev,
      {
        key,
        item,
        quantity: Math.max(1, quantity),
        warehouseId: defaultWarehouseId,
        unitPrice,
        discountPercent: globalIskonto,
      },
    ]);
    return 'added' as const;
  };

  const applyDefaultWarehouseToAll = () => {
    if (!defaultWarehouseId) {
      toast.warning('Önce varsayılan depo seçin');
      return;
    }
    setLines((prev) => prev.map((l) => ({ ...l, warehouseId: defaultWarehouseId })));
    toast.success('Depo tüm satırlara uygulandı');
  };

  const applyGlobalIskontoToAll = (pct: number) => {
    const clamped = clampDiscountPercent(pct);
    setGlobalIskonto(clamped);
    setLines((prev) => prev.map((l) => ({ ...l, discountPercent: clamped })));
    setLineNetDrafts({});
    setIskontoDrafts({});
  };

  const updateLine = (key: string, patch: Partial<StagingLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
    setLineNetDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const applyNetTarget = (line: StagingLine, targetNet: number) => {
    const gross = getGross(line);
    const result = discountPercentFromNet(gross, targetNet);
    updateLine(line.key, { discountPercent: result.discountPercent });
    if (result.reason === 'net_above_gross') {
      toast.warning('Satır tutarı brüt tutarı aşamaz; iskonto %0 yapıldı.');
    } else if (result.reason === 'gross_zero') {
      toast.warning('Brüt tutar 0 iken iskonto hesaplanamaz.');
    }
    return result;
  };

  const handleSave = async () => {
    if (lines.length === 0) {
      toast.warning('En az bir ürün ekleyin');
      return;
    }
    for (const line of lines) {
      if (!line.warehouseId) {
        toast.warning(
          `"${formatInventoryBilingualLabel(line.item.ItemName, line.item.ItemNameEn)}" için depo seçin`
        );
        return;
      }
      if (!Number.isFinite(line.quantity) || line.quantity < 1) {
        toast.warning('Miktarlar en az 1 olmalıdır');
        return;
      }
    }

    try {
      setIsBusy(true);
      setStockError(null);

      for (const line of lines) {
        const whId = Number(line.warehouseId);
        try {
          const whStocks = await inventoryService.getWarehousesByItemAsync(line.item.ItemId);
          const available = whStocks.find((s) => s.WarehouseId === whId)?.Quantity ?? 0;
          if (line.quantity > available) {
            const whName = warehouses.find((w) => w.WarehouseId === whId)?.WarehouseName ?? 'depo';
            throw new Error(
              `Yetersiz depo stoku! "${formatInventoryBilingualLabel(line.item.ItemName, line.item.ItemNameEn)}" için ${whName} müsait: ${available}, istenen: ${line.quantity}`
            );
          }
        } catch (stockCheckErr) {
          const msg = getApiErrorMessage(stockCheckErr) || String(stockCheckErr);
          if (isStockErrorMessage(msg) || msg.includes('Yetersiz depo')) {
            setStockError(msg);
            toast.error(msg);
            return;
          }
          // Stok sorgusu başarısızsa API kayda bırak
        }

        const effectiveUnit = getEffectiveUnitPrice(line);
        await addendumService.addDetailAsync(addendumId, {
          ChangeType: 'ADD',
          ItemId: line.item.ItemId,
          WarehouseId: whId,
          QuantityChange: Math.floor(line.quantity),
          IsManual: false,
          ...(effectiveUnit > 0 || line.discountPercent > 0
            ? { NewUnitPrice: Number(effectiveUnit.toFixed(4)) }
            : {}),
        });
      }

      toast.success(`${lines.length} ürün zeyilnameye eklendi`);
      await Promise.resolve(onSaved());
      onClose();
    } catch (error) {
      console.error('Addendum multi-add error:', error);
      const msg = getApiErrorMessage(error) || 'Ürünler eklenemedi';
      if (isStockErrorMessage(msg)) {
        setStockError(msg);
      }
      toast.error(getUserFacingApiErrorMessage(error, 'addendum'));
    } finally {
      setIsBusy(false);
    }
  };

  if (!open) return null;

  const modalTree = (
    <div className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-black/60" onClick={() => !isBusy && onClose()} aria-hidden />
      <div
        className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl border border-background-border bg-background-panel shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="addendum-add-products-title"
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-background-border shrink-0">
          <div>
            <h2 id="addendum-add-products-title" className="text-lg font-semibold text-text-primary">
              Ürün Ekle — Ek Protokol
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Teklifteki gibi birden fazla ürün seçin; ardından depo ve ücret/iskonto ayarlayın.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary"
            aria-label="Kapat"
            disabled={isBusy}
          >
            <XIcon size={22} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {stockError && (
            <StockErrorPanel
              message={stockError}
              onDismiss={() => setStockError(null)}
            />
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px]">
              <label className="block text-xs font-medium text-text-primary mb-1">
                Varsayılan depo
              </label>
              <select
                value={defaultWarehouseId}
                onChange={(e) => setDefaultWarehouseId(Number(e.target.value) || '')}
                className="input w-full"
                disabled={isBusy}
              >
                <option value="">Depo seçin…</option>
                {warehouses.map((wh) => (
                  <option key={wh.WarehouseId} value={wh.WarehouseId}>
                    {wh.WarehouseName}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn-secondary text-sm"
              disabled={isBusy || !defaultWarehouseId || lines.length === 0}
              onClick={applyDefaultWarehouseToAll}
            >
              Depoyu tüm satırlara uygula
            </button>
            <div className="min-w-[120px]">
              <label className="block text-xs font-medium text-text-primary mb-1">
                Genel iskonto %
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={globalIskonto}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  applyGlobalIskontoToAll(Number.isFinite(v) ? v : 0);
                }}
                className="input w-full text-right"
                disabled={isBusy}
              />
            </div>
            <div className="flex-1" />
            <button
              type="button"
              className="btn-primary text-sm inline-flex items-center gap-1.5"
              disabled={isBusy}
              onClick={() => setShowPicker(true)}
            >
              <PlusIcon size={16} weight="bold" />
              Ürün Seç
            </button>
          </div>

          {lines.length === 0 ? (
            <div className="text-center py-14 text-text-secondary text-sm border border-dashed border-background-border rounded-xl">
              Henüz ürün yok. <strong className="text-text-primary">Ürün Seç</strong> ile teklifteki
              gibi birden fazla ürün ekleyin.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-background-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-secondary border-b border-background-border bg-background-surface">
                    <th className="px-3 py-2 font-medium">Ürün</th>
                    <th className="px-3 py-2 font-medium w-24">Miktar</th>
                    <th className="px-3 py-2 font-medium min-w-[160px]">Depo *</th>
                    <th className="px-3 py-2 font-medium text-right whitespace-nowrap">
                      {isRental ? 'Günlük fiyat' : 'Birim fiyat'}
                    </th>
                    <th className="px-3 py-2 font-medium text-right w-24">İskonto %</th>
                    <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Toplam</th>
                    <th className="px-2 py-2 font-medium w-12" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const gross = getGross(line);
                    const net = getNet(line);
                    return (
                      <tr key={line.key} className="border-b border-background-border/70">
                        <td className="px-3 py-2">
                          <div className="font-medium text-text-primary">
                            {formatInventoryBilingualLabel(line.item.ItemName, line.item.ItemNameEn)}
                          </div>
                          {line.item.ItemCode && (
                            <div className="text-xs text-text-secondary font-mono">
                              {line.item.ItemCode}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            className="input w-20 text-right"
                            disabled={isBusy}
                            value={qtyDrafts[line.key] ?? String(line.quantity)}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '');
                              setQtyDrafts((prev) => ({ ...prev, [line.key]: digits }));
                              const n = Math.floor(Number(digits));
                              if (Number.isFinite(n) && n >= 1) {
                                updateLine(line.key, { quantity: n });
                                setLineNetDrafts((prev) => {
                                  if (!(line.key in prev)) return prev;
                                  const next = { ...prev };
                                  delete next[line.key];
                                  return next;
                                });
                              }
                            }}
                            onBlur={() => {
                              const raw = qtyDrafts[line.key];
                              const n = Math.floor(Number(raw));
                              const qty = Number.isFinite(n) && n >= 1 ? n : 1;
                              updateLine(line.key, { quantity: qty });
                              setQtyDrafts((prev) => {
                                const next = { ...prev };
                                delete next[line.key];
                                return next;
                              });
                            }}
                            aria-label="Miktar"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="input w-full"
                            disabled={isBusy}
                            value={line.warehouseId}
                            onChange={(e) =>
                              updateLine(line.key, {
                                warehouseId: Number(e.target.value) || '',
                              })
                            }
                          >
                            <option value="">Depo seçin…</option>
                            {warehouses.map((wh) => (
                              <option key={wh.WarehouseId} value={wh.WarehouseId}>
                                {wh.WarehouseName}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            className="input w-28 text-right ml-auto"
                            disabled={isBusy}
                            value={
                              priceDrafts[line.key] ??
                              (Number.isFinite(line.unitPrice) ? String(line.unitPrice) : '')
                            }
                            onChange={(e) => {
                              const raw = e.target.value;
                              setPriceDrafts((prev) => ({ ...prev, [line.key]: raw }));
                              const n = parseDecimalInput(raw);
                              if (n != null && n >= 0) {
                                updateLine(line.key, { unitPrice: n });
                                setLineNetDrafts((prev) => {
                                  if (!(line.key in prev)) return prev;
                                  const next = { ...prev };
                                  delete next[line.key];
                                  return next;
                                });
                              }
                            }}
                            onBlur={() => {
                              const n = parseDecimalInput(priceDrafts[line.key] ?? '');
                              if (n == null || n < 0) {
                                toast.warning('Birim fiyat geçerli bir sayı olmalıdır');
                              } else {
                                updateLine(line.key, { unitPrice: n });
                              }
                              setPriceDrafts((prev) => {
                                const next = { ...prev };
                                delete next[line.key];
                                return next;
                              });
                            }}
                            aria-label={isRental ? 'Günlük fiyat' : 'Birim fiyat'}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.01}
                            className="input w-20 text-right ml-auto"
                            disabled={isBusy}
                            value={
                              iskontoDrafts[line.key] ??
                              String(line.discountPercent)
                            }
                            onChange={(e) => {
                              const raw = e.target.value;
                              setIskontoDrafts((prev) => ({ ...prev, [line.key]: raw }));
                              const v = parseFloat(raw);
                              if (Number.isFinite(v)) {
                                updateLine(line.key, {
                                  discountPercent: clampDiscountPercent(v),
                                });
                                setLineNetDrafts((prev) => {
                                  if (!(line.key in prev)) return prev;
                                  const next = { ...prev };
                                  delete next[line.key];
                                  return next;
                                });
                              }
                            }}
                            onBlur={() => {
                              setIskontoDrafts((prev) => {
                                const next = { ...prev };
                                delete next[line.key];
                                return next;
                              });
                            }}
                            aria-label="İskonto %"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            className="input w-28 text-right ml-auto font-medium text-green-500"
                            disabled={isBusy}
                            title="Net tutarı değiştirirseniz iskonto % otomatik ayarlanır"
                            value={lineNetDrafts[line.key] ?? String(net)}
                            onChange={(e) => {
                              setLineNetDrafts((prev) => ({
                                ...prev,
                                [line.key]: e.target.value,
                              }));
                            }}
                            onBlur={() => {
                              const raw = lineNetDrafts[line.key];
                              if (raw == null) return;
                              const n = parseDecimalInput(raw);
                              if (n == null) {
                                toast.warning('Satır tutarı geçerli bir sayı olmalıdır');
                                setLineNetDrafts((prev) => {
                                  const next = { ...prev };
                                  delete next[line.key];
                                  return next;
                                });
                                return;
                              }
                              applyNetTarget(line, n);
                              setLineNetDrafts((prev) => {
                                const next = { ...prev };
                                delete next[line.key];
                                return next;
                              });
                            }}
                            aria-label="İskontolu satır tutarı"
                          />
                          {line.discountPercent > 0 && (
                            <div className="text-[10px] text-text-secondary mt-0.5">
                              Brüt {formatCur(gross)}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10"
                            disabled={isBusy}
                            onClick={() => removeLine(line.key)}
                            aria-label="Satırı kaldır"
                          >
                            <TrashIcon size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 px-5 py-4 border-t border-background-border shrink-0">
          <button type="button" className="btn-secondary" disabled={isBusy} onClick={onClose}>
            İptal
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={isBusy || lines.length === 0}
            onClick={() => void handleSave()}
          >
            {isBusy ? 'Kaydediliyor…' : `Zeyilnameye Ekle (${lines.length})`}
          </button>
        </footer>
      </div>

      <ProductPickerModal
        open={showPicker}
        onClose={() => setShowPicker(false)}
        items={items}
        displayMode="quote"
        quotePricing={isRental ? 'rental' : 'sale'}
        currency={currency}
        pickedItemIds={pickedItemIds}
        zIndexClass="z-[80]"
        onItemSelect={(item, quantity) => addOrToggleItem(item, quantity)}
      />
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalTree, document.body) : null;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget } from '../tabs/TabContext';
import { PlusIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
import type {
  ContractLineItem,
  ContractQuoteType,
  CurrencyCode,
  Inventory,
  Warehouse,
} from '../../models';
import { addendumService } from '../../services/addendumService';
import { applyWarehouseIdToLines } from '../../utils/addendum';
import { resolveAddendumAddedItemPricing } from '../../utils/addendumAddPricing';
import { getApiErrorMessage, getUserFacingApiErrorMessage } from '../../utils/apiError';
import {
  clampDiscountRange,
  discountPercentFromNet,
  lineNetFromGross,
} from '../../utils/lineDiscount';
import { formatInventoryBilingualLabel, formatMoney } from '../../utils/formatters';
import { isStockErrorMessage } from '../../utils/parseStockError';
import { toast } from '../../hooks/useToast';
import { useItemWarehouseStocks } from '../../hooks/useItemWarehouseStocks';
import { useAuthStore } from '../../store/authStore';
import { invalidateData } from '../../store/dataInvalidationStore';
import {
  computeStockShortages,
  shortageMap,
  stockNeedKey,
  usableWarehouseStock,
  type StockNeed,
} from '../../utils/stockShortage';
import ProductPickerModal from './ProductPickerModal';
import QuickStockEntryModal from './QuickStockEntryModal';
import StockErrorPanel from '../StockErrorPanel';
import StockShortagePanel from '../StockShortagePanel';
import ContractLinesReferenceDrawer from '../contracts/ContractLinesReferenceDrawer';
import DataTable from '../DataTable';

type StagingLine = {
  key: string;
  item: Inventory;
  quantity: number;
  warehouseId: number | '';
  /** Liste / brüt birim fiyat (satış: birim; kiralama: günlük) */
  unitPrice: number;
  discountPercent: number;
};

type SeedPick = {
  item: Inventory;
  warehouseId?: number | '';
};

interface AddendumAddProductsModalProps {
  open: boolean;
  addendumId: number;
  contractType: ContractQuoteType;
  items: Inventory[];
  warehouses: Warehouse[];
  currency?: CurrencyCode;
  /** Aynı ürün sözleşmede varsa ilk fiyat buradan gelir */
  contractLines?: ContractLineItem[];
  /** Sözleşme genel iskontosu; yeni üründe ve satır iskontosu yoksa kullanılır */
  contractDiscountPercent?: number;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  zIndexClass?: string;
  /** Modal açılınca listeye düşecek ürünler (sözleşme satırından tıklama) */
  seedPicks?: SeedPick[];
  onSeedConsumed?: () => void;
}

function parseDecimalInput(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function buildStagingLine(opts: {
  item: Inventory;
  quantity: number;
  warehouseId: number | '';
  contractType: ContractQuoteType;
  currency: CurrencyCode;
  contractLines: ContractLineItem[];
  fallbackDiscountPercent: number;
  keySuffix?: string | number;
}): StagingLine {
  const pricing = resolveAddendumAddedItemPricing({
    item: opts.item,
    contractType: opts.contractType,
    currency: opts.currency,
    contractLines: opts.contractLines,
    preferredWarehouseId: opts.warehouseId,
    fallbackDiscountPercent: opts.fallbackDiscountPercent,
  });
  return {
    key: `add-${opts.item.ItemId}-${Date.now()}-${opts.keySuffix ?? ''}`,
    item: opts.item,
    quantity: Math.max(1, opts.quantity),
    warehouseId: opts.warehouseId,
    unitPrice: pricing.unitPrice,
    discountPercent: pricing.discountPercent,
  };
}

export default function AddendumAddProductsModal({
  open,
  addendumId,
  contractType,
  items,
  warehouses,
  currency = 'TRY',
  contractLines = [],
  contractDiscountPercent = 0,
  onClose,
  onSaved,
  zIndexClass = 'z-[75]',
  seedPicks,
  onSeedConsumed,
}: AddendumAddProductsModalProps) {
  const portalTarget = usePortalTarget();
  const isRental = contractType === 'RENTAL';
  const [lines, setLines] = useState<StagingLine[]>([]);
  const [defaultWarehouseId, setDefaultWarehouseId] = useState<number | ''>('');
  const [globalIskonto, setGlobalIskonto] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [showContractPeek, setShowContractPeek] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [showQuickStock, setShowQuickStock] = useState(false);
  const canCreateStockReceipt = useAuthStore((s) =>
    Boolean(s.user?.permissions?.includes('stockReceipts_create'))
  );
  const [lineNetDrafts, setLineNetDrafts] = useState<Record<string, string>>({});
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [iskontoDrafts, setIskontoDrafts] = useState<Record<string, string>>({});
  const seedPicksRef = useRef(seedPicks);
  seedPicksRef.current = seedPicks;
  const onSeedConsumedRef = useRef(onSeedConsumed);
  onSeedConsumedRef.current = onSeedConsumed;

  useEffect(() => {
    if (!open) return;
    const discount = clampDiscountRange(contractDiscountPercent);
    const seed = seedPicksRef.current ?? [];
    const seen = new Set<number>();
    const seededLines: StagingLine[] = [];
    seed.forEach((pick, index) => {
      if (seen.has(pick.item.ItemId)) return;
      seen.add(pick.item.ItemId);
      const warehouseId =
        pick.warehouseId && Number(pick.warehouseId) > 0 ? Number(pick.warehouseId) : '';
      seededLines.push(
        buildStagingLine({
          item: pick.item,
          quantity: 1,
          warehouseId,
          contractType,
          currency,
          contractLines,
          fallbackDiscountPercent: discount,
          keySuffix: index,
        })
      );
    });
    setLines(seededLines);
    setDefaultWarehouseId('');
    setGlobalIskonto(discount);
    setShowPicker(false);
    setShowContractPeek(false);
    setIsBusy(false);
    setStockError(null);
    setShowQuickStock(false);
    setLineNetDrafts({});
    setQtyDrafts({});
    setPriceDrafts({});
    setIskontoDrafts({});
    if (seed.length) onSeedConsumedRef.current?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showPicker && !showContractPeek && !showQuickStock && !isBusy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, showPicker, showContractPeek, showQuickStock, isBusy, onClose]);

  const pickedItemIds = useMemo(() => new Set(lines.map((l) => l.item.ItemId)), [lines]);

  // Depo stokları: satıra ürün girince yüklenir, her satırda kullanılabilir/eksik adet görünür.
  const lineItemIds = useMemo(() => lines.map((l) => l.item.ItemId), [lines]);
  const { stocks, refresh: refreshStocks } = useItemWarehouseStocks(lineItemIds, open);
  const stockNeeds = useMemo<StockNeed[]>(
    () =>
      lines.flatMap((l) =>
        l.warehouseId
          ? [
              {
                ItemId: l.item.ItemId,
                WarehouseId: Number(l.warehouseId),
                label: formatInventoryBilingualLabel(l.item.ItemName, l.item.ItemNameEn),
                required: l.quantity,
              },
            ]
          : []
      ),
    [lines]
  );
  const shortages = useMemo(() => computeStockShortages(stockNeeds, stocks), [stockNeeds, stocks]);
  const shortageByKey = useMemo(() => shortageMap(shortages), [shortages]);

  /** Hızlı stok girişi satırları: eksik olanlar; sunucu hatasında eksik görünmüyorsa tüm satırlar. */
  const quickStockLines = useMemo(() => {
    const source = shortages.length > 0 ? shortages : stockNeeds;
    const seen = new Set<string>();
    return source.flatMap((l) => {
      const key = stockNeedKey(l.ItemId, l.WarehouseId);
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ ItemId: l.ItemId, label: l.label, warehouseId: l.WarehouseId, key }];
    });
  }, [shortages, stockNeeds]);

  const getRequiredQuantity = (itemId: number, warehouseId: number) =>
    stockNeeds
      .filter((n) => n.ItemId === itemId && n.WarehouseId === warehouseId)
      .reduce((sum, n) => sum + n.required, 0);

  const openQuickStock = canCreateStockReceipt ? () => setShowQuickStock(true) : undefined;

  const formatCur = (amount: number) => formatMoney(amount, currency);

  const getGross = (line: StagingLine) =>
    Math.max(0, line.unitPrice) * Math.max(0, line.quantity);

  const getNet = (line: StagingLine) =>
    lineNetFromGross(getGross(line), line.discountPercent);

  const addOrToggleItem = (
    item: Inventory,
    quantity: number,
    opts?: { warehouseId?: number | '' }
  ) => {
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
    const warehouseId =
      defaultWarehouseId ||
      (opts?.warehouseId && Number(opts.warehouseId) > 0 ? Number(opts.warehouseId) : '');
    setLines((prev) => [
      ...prev,
      buildStagingLine({
        item,
        quantity,
        warehouseId,
        contractType,
        currency,
        contractLines,
        fallbackDiscountPercent: globalIskonto,
      }),
    ]);
    return 'added' as const;
  };

  const applyWarehouseToAllLines = (warehouseId: number, { notify }: { notify?: boolean } = {}) => {
    setLines((prev) => applyWarehouseIdToLines(prev, warehouseId));
    if (notify) toast.success('Depo tüm satırlara uygulandı');
  };

  const handleDefaultWarehouseChange = (raw: string) => {
    const nextId = Number(raw) || '';
    setDefaultWarehouseId(nextId);
    if (!nextId) return;
    applyWarehouseToAllLines(nextId);
  };

  const applyDefaultWarehouseToAll = () => {
    if (!defaultWarehouseId) {
      toast.warning('Önce varsayılan depo seçin');
      return;
    }
    applyWarehouseToAllLines(defaultWarehouseId, { notify: true });
  };

  const applyGlobalIskontoToAll = (pct: number) => {
    const clamped = clampDiscountRange(pct);
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

    setIsBusy(true);
    setStockError(null);
    // Önce tüm satırlar için güncel stok kontrolü: eksik varsa hiçbir satır kaydedilmez,
    // kullanıcı eksiklerin tamamını tek listede görür, stok ekleyip aynı yerden devam eder.
    const freshStocks = await refreshStocks();
    const freshShortages = computeStockShortages(stockNeeds, freshStocks);
    if (freshShortages.length > 0) {
      setIsBusy(false);
      const total = freshShortages.reduce((sum, x) => sum + x.missing, 0);
      toast.warning(
        `${freshShortages.length} üründe toplam ${total} adet stok eksik. Eksikleri stoğa ekleyip tekrar deneyin.`
      );
      return;
    }

    const savedKeys = new Set<string>();
    try {
      for (const line of lines) {
        const whId = Number(line.warehouseId);
        // Brüt fiyat + satır iskontosu ayrı gönderilir; sözleşme satırı aynı iskonto ile oluşur.
        // (Net fiyatı birim fiyata gömmek sözleşmede İskonto tutarını kaybettiriyor ve
        // 4 haneye yuvarlanan net fiyat toplamları kaydırıyordu.)
        const grossUnit = Math.max(0, line.unitPrice);
        await addendumService.addDetailAsync(addendumId, {
          ChangeType: 'ADD',
          ItemId: line.item.ItemId,
          WarehouseId: whId,
          QuantityChange: Math.floor(line.quantity),
          IsManual: false,
          ...(grossUnit > 0
            ? {
                NewUnitPrice: Number(grossUnit.toFixed(4)),
                // Kiralamada aylık fiyat tam değeriyle: günlük snapshot 4 haneye kırpılınca ×30 kuruş kaydırır
                ...(isRental ? { NewMonthlyOverride: Number((grossUnit * 30).toFixed(4)) } : {}),
              }
            : {}),
          Iskonto: Number(clampDiscountRange(line.discountPercent).toFixed(10)),
        });
        savedKeys.add(line.key);
      }

      toast.success(`${lines.length} ürün zeyilnameye eklendi`);
      await Promise.resolve(onSaved());
      onClose();
    } catch (error) {
      console.error('Addendum multi-add error:', error);
      const msg = getApiErrorMessage(error) || 'Ürünler eklenemedi';
      if (savedKeys.size > 0) {
        // Kaydedilen satırlar listeden çıkar; tekrar denemede aynı ürün iki kez eklenmez.
        setLines((prev) => prev.filter((l) => !savedKeys.has(l.key)));
        toast.info(`${savedKeys.size} ürün zeyilnameye eklendi; kalanlar listede bekliyor.`);
        await Promise.resolve(onSaved());
      }
      if (isStockErrorMessage(msg)) {
        setStockError(msg);
        void refreshStocks();
      }
      toast.error(getUserFacingApiErrorMessage(error, 'addendum'));
    } finally {
      setIsBusy(false);
    }
  };

  if (!open) return null;

  const modalTree = (
    <div className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-black/60" onClick={() => !isBusy && !showPicker && !showContractPeek && onClose()} aria-hidden />
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
          <StockShortagePanel
            shortages={shortages}
            warehouses={warehouses}
            onAddStock={openQuickStock}
          />
          {stockError && (
            <StockErrorPanel
              message={stockError}
              onDismiss={() => setStockError(null)}
              onStockTransfer={openQuickStock}
              showStockTransferLink={false}
            />
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px]">
              <label className="block text-xs font-medium text-text-primary mb-1">
                Varsayılan depo
              </label>
              <select
                value={defaultWarehouseId}
                onChange={(e) => handleDefaultWarehouseChange(e.target.value)}
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
                step="any"
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
              className="btn-secondary text-sm"
              disabled={isBusy}
              onClick={() => setShowContractPeek(true)}
            >
              Sözleşme ürünleri
              {contractLines.length > 0 ? ` (${contractLines.length})` : ''}
            </button>
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
              <DataTable tableId="AddendumAddProductsModal" className="w-full text-sm">
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
                    const itemStocks = stocks[line.item.ItemId];
                    const lineShortage = line.warehouseId
                      ? shortageByKey.get(stockNeedKey(line.item.ItemId, Number(line.warehouseId)))
                      : undefined;
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
                                {itemStocks !== undefined
                                  ? ` (${usableWarehouseStock(itemStocks, wh.WarehouseId)} adet)`
                                  : ''}
                              </option>
                            ))}
                          </select>
                          {line.warehouseId && itemStocks !== undefined && (
                            <div
                              className={`text-[11px] mt-1 ${
                                lineShortage ? 'text-red-400' : 'text-text-secondary'
                              }`}
                            >
                              Kullanılabilir {usableWarehouseStock(itemStocks, Number(line.warehouseId))}
                              {lineShortage && (
                                <>
                                  {' · '}
                                  <strong>{lineShortage.missing} eksik</strong>
                                </>
                              )}
                            </div>
                          )}
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
                            step="any"
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
                                  discountPercent: clampDiscountRange(v),
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
              </DataTable>
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

      {showQuickStock && quickStockLines.length > 0 && (
        <QuickStockEntryModal
          warehouses={warehouses}
          lines={quickStockLines}
          getRequiredQuantity={getRequiredQuantity}
          title="Eksik Stoğu Ekle"
          description="Zeyilname ürün eklemesi için stok girişi"
          zIndexClass="z-[95]"
          onClose={() => setShowQuickStock(false)}
          onSaved={async () => {
            setStockError(null);
            invalidateData('inventory');
            const fresh = await refreshStocks();
            if (computeStockShortages(stockNeeds, fresh).length === 0) {
              toast.info('Eksik kalmadı; "Zeyilnameye Ekle" ile devam edebilirsiniz.');
            }
          }}
        />
      )}

      <ProductPickerModal
        open={showPicker}
        onClose={() => setShowPicker(false)}
        items={items}
        displayMode="quote"
        quotePricing={isRental ? 'rental' : 'sale'}
        currency={currency}
        pickedItemIds={pickedItemIds}
        zIndexClass="z-[90]"
        onItemSelect={(item, quantity) => addOrToggleItem(item, quantity)}
      />
      <ContractLinesReferenceDrawer
        open={showContractPeek}
        onClose={() => setShowContractPeek(false)}
        lines={contractLines}
        contractType={contractType}
        currency={currency}
        highlightedItemIds={pickedItemIds}
        highlightLabel="Ekleniyor"
        zIndexClass="z-[85]"
        items={items}
        onSelectInventory={(item, line) => {
          const result = addOrToggleItem(item, 1, { warehouseId: line.WarehouseId });
          const label = formatInventoryBilingualLabel(item.ItemName, item.ItemNameEn);
          if (result === 'added') toast.success(`${label} listeye eklendi`);
          else toast.info(`${label} listeden çıkarıldı`);
        }}
      />
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalTree, portalTarget) : null;
}

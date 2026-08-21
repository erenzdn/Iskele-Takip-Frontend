import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '@phosphor-icons/react';
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
import StockErrorPanel from '../StockErrorPanel';

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
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  zIndexClass?: string;
}

function parseIntQty(raw: string): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? n : NaN;
}

function lineLabel(line: ContractLineItem): string {
  const id = line.DetailId ?? '?';
  if (line.kind === 'manual') {
    return `Manuel #${id}: ${line.Description || '—'}`;
  }
  const code = line.ItemCode ? `${line.ItemCode} — ` : '';
  return `#${id}: ${code}${line.ItemName} (kirada: ${line.RentedQuantity})`;
}

export default function AddendumLineItemModal({
  open,
  addendumId,
  contractType,
  contractLines,
  items,
  warehouses,
  editingDetail = null,
  onClose,
  onSaved,
  zIndexClass = 'z-[70]',
}: AddendumLineItemModalProps) {
  const isRental = contractType === 'RENTAL';
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

  const selectedContractLine = useMemo(() => {
    if (!selectedContractDetailId) return null;
    return selectableLines.find((l) => l.DetailId === Number(selectedContractDetailId)) ?? null;
  }, [selectableLines, selectedContractDetailId]);

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
      setChangeType('ADD');
      setAddKind('inventory');
      setSelectedItemId('');
      setSelectedWarehouseId('');
      setSelectedContractDetailId('');
      setQuantityStr('1');
      setManualDescription('');
      setUnitPriceStr('');
      setMonthlyOverrideStr('');
    }
  }, [open, editingDetail]);

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

  const selectedWarehouseStock = useMemo(() => {
    if (!selectedWarehouseId) return null;
    const whId = Number(selectedWarehouseId);
    return itemWarehouseStocks.find((s) => s.WarehouseId === whId)?.Quantity ?? null;
  }, [itemWarehouseStocks, selectedWarehouseId]);

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

    // PRICE_CHANGE
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

  const changeTypes: ChangeType[] = ['ADD', 'INCREASE', 'DECREASE', 'PRICE_CHANGE'];

  const modalTree = (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/60 p-4`}
    >
      <div className="w-full max-w-xl rounded-xl border border-background-border bg-background-panel shadow-xl max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between px-5 py-4 border-b border-background-border sticky top-0 bg-background-panel z-10">
          <h2 className="text-lg font-semibold text-text-primary">
            {isEdit ? 'Kalem Düzenle' : 'Zeyilname Kalemi Ekle'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-text-secondary hover:bg-background-hover hover:text-text-primary transition-colors"
            aria-label="Kapat"
            disabled={isBusy}
          >
            <XIcon size={20} weight="regular" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          {stockError && (
            <StockErrorPanel
              message={stockError}
              onRetry={handleSave}
              onDismiss={() => setStockError(null)}
            />
          )}

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

          {changeType === 'ADD' && (
            <>
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

              {addKind === 'inventory' ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-text-primary mb-1">Ürün *</label>
                    <select
                      value={selectedItemId}
                      onChange={(e) => setSelectedItemId(Number(e.target.value) || '')}
                      className="input w-full"
                      disabled={isBusy}
                    >
                      <option value="">Ürün seçin</option>
                      {sortedItems.map((it) => (
                        <option key={it.ItemId} value={it.ItemId}>
                          {(it.ItemCode ? `${it.ItemCode} — ` : '') + it.ItemName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-primary mb-1">Depo *</label>
                    <select
                      value={selectedWarehouseId}
                      onChange={(e) => {
                        setSelectedWarehouseId(Number(e.target.value) || '');
                        setStockError(null);
                      }}
                      className="input w-full"
                      disabled={isBusy}
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
                      <div className="text-[11px] text-text-secondary mt-1">Stok bilgisi yükleniyor...</div>
                    )}
                    {selectedItemId && !stocksLoading && selectedWarehouseStock != null && (
                      <div className="text-[11px] text-text-secondary mt-1">
                        Seçili depoda müsait: {selectedWarehouseStock} adet
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-primary mb-1">Miktar *</label>
                    <input
                      type="number"
                      min={1}
                      value={quantityStr}
                      onChange={(e) => setQuantityStr(e.target.value)}
                      className="input w-full"
                      disabled={isBusy}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-text-primary mb-1">Açıklama *</label>
                    <input
                      type="text"
                      value={manualDescription}
                      onChange={(e) => setManualDescription(e.target.value)}
                      className="input w-full"
                      disabled={isBusy}
                      placeholder="Örn: Nakliye / Montaj"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-primary mb-1">Miktar *</label>
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
                    <label className="block text-xs font-medium text-text-primary mb-1">
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
                  </div>
                </div>
              )}
            </>
          )}

          {(changeType === 'INCREASE' || changeType === 'DECREASE') && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-text-primary mb-1">
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
                <label className="block text-xs font-medium text-text-primary mb-1">
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
                  <p className="text-[11px] text-text-secondary mt-1">
                    Mevcut miktar: {selectedContractLine.RentedQuantity}. API&apos;ye negatif olarak
                    gönderilir.
                  </p>
                )}
              </div>
            </div>
          )}

          {changeType === 'PRICE_CHANGE' && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-text-primary mb-1">
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
                <label className="block text-xs font-medium text-text-primary mb-1">
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
                  <label className="block text-xs font-medium text-text-primary mb-1">
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
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-background-border sticky bottom-0 bg-background-panel">
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

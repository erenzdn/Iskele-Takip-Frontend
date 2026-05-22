import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '@phosphor-icons/react';
import type { ContractQuoteType, Inventory, Warehouse } from '../../models';
import { contractService, type AddContractDetailsRequestBody } from '../../services/contractService';
import { getApiErrorMessage } from '../../utils/apiError';
import { toast } from '../../hooks/useToast';
import { firstValidationError, validateNumber, validateRequired } from '../../utils/validation';

type LineItemKind = 'inventory' | 'manual';

interface ContractAddLineItemModalProps {
  open: boolean;
  contractId: number;
  contractType: ContractQuoteType;
  items: Inventory[];
  warehouses: Warehouse[];
  onClose: () => void;
  onAdded: () => Promise<void> | void;
}

function todayDateInputValue(): string {
  return new Date().toISOString().split('T')[0];
}

export default function ContractAddLineItemModal({
  open,
  contractId,
  contractType,
  items,
  warehouses,
  onClose,
  onAdded,
}: ContractAddLineItemModalProps) {
  const isRental = contractType === 'RENTAL';
  const isSale = contractType === 'SALE';

  const [kind, setKind] = useState<LineItemKind>('inventory');
  const [isBusy, setIsBusy] = useState(false);

  // Inventory fields
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | ''>('');
  const [quantityStr, setQuantityStr] = useState<string>('1');
  const [itemCodeOverride, setItemCodeOverride] = useState<string>('');
  const [effectiveStartDate, setEffectiveStartDate] = useState<string>(todayDateInputValue());

  // Sale option
  const [decrementStock, setDecrementStock] = useState<boolean>(true);

  // Manual fields
  const [manualDescription, setManualDescription] = useState<string>('');
  const [manualQuantityStr, setManualQuantityStr] = useState<string>('1');
  const [manualDailyPriceStr, setManualDailyPriceStr] = useState<string>('');

  const sortedItems = useMemo(() => {
    const list = [...(items || [])];
    list.sort((a, b) => (a.ItemName || '').localeCompare(b.ItemName || '', 'tr'));
    return list;
  }, [items]);

  useEffect(() => {
    if (!open) return;
    // Her açılışta minimal reset
    setKind('inventory');
    setIsBusy(false);
    setSelectedItemId('');
    setSelectedWarehouseId('');
    setQuantityStr('1');
    setItemCodeOverride('');
    setEffectiveStartDate(todayDateInputValue());
    setDecrementStock(true);
    setManualDescription('');
    setManualQuantityStr('1');
    setManualDailyPriceStr('');
  }, [open]);

  if (!open) return null;

  const parsePositiveInt = (raw: string): number => {
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const handleAdd = async () => {
    const qty = parsePositiveInt(kind === 'inventory' ? quantityStr : manualQuantityStr);
    const dailyPrice =
      manualDailyPriceStr.trim() === '' ? undefined : Number(manualDailyPriceStr);

    const validationError = firstValidationError(
      kind === 'inventory'
        ? [
            validateRequired(String(selectedItemId || ''), 'Ürün'),
            validateRequired(String(selectedWarehouseId || ''), 'Depo'),
            validateNumber(qty, 'Miktar', { min: 1 }),
            ...(isRental ? [validateRequired(effectiveStartDate, 'Ücret başlangıç tarihi')] : []),
          ]
        : [
            validateRequired(manualDescription.trim(), 'Açıklama'),
            validateNumber(qty, 'Miktar', { min: 1 }),
            ...(dailyPrice === undefined
              ? []
              : [validateNumber(dailyPrice, 'Opsiyonel fiyat', { min: 0 })]),
          ]
    );

    if (validationError) {
      toast.warning(validationError);
      return;
    }

    const body: AddContractDetailsRequestBody = { details: [] };

    if (kind === 'inventory') {
      const codeOverride = itemCodeOverride.trim();
      const detail: AddContractDetailsRequestBody['details'][number] = {
        ItemId: Number(selectedItemId),
        WarehouseId: Number(selectedWarehouseId),
        RentedQuantity: qty,
        IsManual: false,
        ...(codeOverride ? { ItemCodeOverride: codeOverride } : {}),
      };
      if (isRental) {
        // UI default: bugün. Kullanıcı değiştirirse ISO8601 gönder.
        detail.EffectiveStartDate = new Date(effectiveStartDate).toISOString();
      }
      body.details = [detail];
      body.decrementStock = true; // kiralamada stok düşümü beklenir
      if (isSale) {
        body.decrementStock = decrementStock;
      }
    } else {
      const detail: any = {
        IsManual: true,
        Description: manualDescription.trim(),
        RentedQuantity: qty,
      };
      if (dailyPrice !== undefined) {
        detail.UnitPriceSnapshot = dailyPrice;
      }
      body.details = [detail];
      body.decrementStock = isSale ? decrementStock : true;
    }

    try {
      setIsBusy(true);
      const result = await contractService.addDetailsAsync(contractId, body);
      if (Array.isArray(result?.warnings) && result.warnings.length > 0) {
        toast.warning(result.warnings.join('\n'));
      }
      toast.success(
        Array.isArray(result?.detailIds) && result.detailIds.length > 0
          ? `Kalem eklendi. (DetailId: ${result.detailIds.join(', ')})`
          : 'Kalem eklendi.'
      );
      await Promise.resolve(onAdded());
      onClose();
    } catch (error) {
      console.error('Add contract detail error:', error);
      toast.error(getApiErrorMessage(error) || 'Kalem eklenemedi');
    } finally {
      setIsBusy(false);
    }
  };

  const modalTree = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-xl border border-background-border bg-background-panel shadow-xl">
        <header className="flex items-center justify-between px-5 py-4 border-b border-background-border">
          <h2 className="text-lg font-semibold text-text-primary">Kalem Ekle</h2>
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
          <div className="space-y-2">
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Kalem tipi
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setKind('inventory')}
                className={kind === 'inventory' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
                disabled={isBusy}
              >
                Envanter Ürünü
              </button>
              <button
                type="button"
                onClick={() => setKind('manual')}
                className={kind === 'manual' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
                disabled={isBusy}
              >
                Manuel Kalem
              </button>
            </div>
          </div>

          {kind === 'inventory' ? (
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

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-text-primary mb-1">
                  Ürün Kodu Override
                </label>
                <input
                  type="text"
                  value={itemCodeOverride}
                  onChange={(e) => setItemCodeOverride(e.target.value.slice(0, 50))}
                  className="input w-full font-mono"
                  disabled={isBusy}
                  placeholder="Boş bırakılırsa orijinal ürün kodu kullanılır"
                  maxLength={50}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Depo *</label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(Number(e.target.value) || '')}
                  className="input w-full"
                  disabled={isBusy}
                >
                  <option value="">Depo seçin</option>
                  {warehouses.map((wh) => (
                    <option key={wh.WarehouseId} value={wh.WarehouseId}>
                      {wh.WarehouseName}
                    </option>
                  ))}
                </select>
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

              {isRental && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-text-primary mb-1">
                    Ücret başlangıç tarihi
                  </label>
                  <input
                    type="date"
                    value={effectiveStartDate}
                    onChange={(e) => setEffectiveStartDate(e.target.value)}
                    className="input w-full"
                    disabled={isBusy}
                  />
                  <div className="text-[11px] text-text-secondary mt-1">
                    Bu tarih kiralama ücretini başlatır (default: bugün).
                  </div>
                </div>
              )}

              {isSale && (
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-background-border"
                      checked={decrementStock}
                      onChange={(e) => setDecrementStock(e.target.checked)}
                      disabled={isBusy}
                    />
                    Stok düş (varsayılan açık)
                  </label>
                </div>
              )}
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
                  placeholder="Örn: Nakliye / Montaj / Hizmet bedeli"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Miktar *</label>
                <input
                  type="number"
                  min={1}
                  value={manualQuantityStr}
                  onChange={(e) => setManualQuantityStr(e.target.value)}
                  className="input w-full"
                  disabled={isBusy}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">
                  Opsiyonel fiyat (UnitPriceSnapshot)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={manualDailyPriceStr}
                  onChange={(e) => setManualDailyPriceStr(e.target.value)}
                  className="input w-full"
                  disabled={isBusy}
                  placeholder="Boş bırakabilirsiniz"
                />
              </div>
              {isSale && (
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-background-border"
                      checked={decrementStock}
                      onChange={(e) => setDecrementStock(e.target.checked)}
                      disabled={isBusy}
                    />
                    Stok düş (varsayılan açık)
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-background-border">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isBusy}>
            İptal
          </button>
          <button type="button" onClick={handleAdd} className="btn-primary" disabled={isBusy}>
            {isBusy ? 'Ekleniyor...' : 'Ekle'}
          </button>
        </footer>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalTree, document.body) : null;
}


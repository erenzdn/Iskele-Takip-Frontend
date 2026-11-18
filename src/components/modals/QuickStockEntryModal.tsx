import { useEffect, useState } from 'react';
import { Warehouse, WarehouseStock } from '../../models';
import { inventoryService } from '../../services/inventoryService';
import { stockReceiptService } from '../../services/stockReceiptService';
import { getUserFacingApiErrorMessage } from '../../utils/apiError';
import { toast } from '../../hooks/useToast';

export interface QuickStockEntryLine {
  ItemId: number;
  label: string;
}

interface QuickStockEntryModalProps {
  warehouses: Warehouse[];
  lines: QuickStockEntryLine[];
  /** Seçili depoda kalemin ihtiyaç duyduğu miktar; eksik kadar adet önceden doldurulur. */
  getRequiredQuantity: (itemId: number, warehouseId: number) => number;
  defaultWarehouseId?: number | null;
  /** Oluşturulan giriş fişlerinin açıklaması */
  description?: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

interface RowState {
  warehouseId: number | '';
  quantity: string;
}

/**
 * Bulunduğu ekrandan çıkmadan ürün → depo → adet girip stok giriş (IN) fişi oluşturur.
 * Depo başına bir giriş fişi açılır.
 */
export default function QuickStockEntryModal({
  warehouses,
  lines,
  getRequiredQuantity,
  defaultWarehouseId,
  description,
  onClose,
  onSaved,
}: QuickStockEntryModalProps) {
  const initialWarehouse = defaultWarehouseId ?? warehouses[0]?.WarehouseId ?? '';
  const [stocks, setStocks] = useState<Record<number, WarehouseStock[]> | null>(null);
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getStock = (source: Record<number, WarehouseStock[]> | null, itemId: number, warehouseId: number) =>
    source?.[itemId]?.find((s) => s.WarehouseId === warehouseId)?.Quantity ?? 0;

  const shortageFor = (
    source: Record<number, WarehouseStock[]> | null,
    itemId: number,
    warehouseId: number | ''
  ) => {
    if (warehouseId === '') return 0;
    return Math.max(0, getRequiredQuantity(itemId, warehouseId) - getStock(source, itemId, warehouseId));
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<number, WarehouseStock[]> = {};
      await Promise.all(
        lines.map(async (line) => {
          try {
            next[line.ItemId] = await inventoryService.getWarehousesByItemAsync(line.ItemId);
          } catch {
            next[line.ItemId] = [];
          }
        })
      );
      if (cancelled) return;
      setStocks(next);
      // Eksik kadar adet önceden doldur.
      const prefilled: Record<number, RowState> = {};
      for (const line of lines) {
        const shortage = shortageFor(next, line.ItemId, initialWarehouse);
        prefilled[line.ItemId] = {
          warehouseId: initialWarehouse,
          quantity: shortage > 0 ? String(shortage) : '',
        };
      }
      setRows(prefilled);
    })();
    return () => {
      cancelled = true;
    };
    // Yalnızca açılışta yükle.
  }, []);

  const updateRow = (itemId: number, patch: Partial<RowState>) =>
    setRows((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? { warehouseId: initialWarehouse, quantity: '' }), ...patch },
    }));

  const handleSave = async () => {
    setError(null);
    const byWarehouse = new Map<number, { ItemId: number; Quantity: number }[]>();
    for (const line of lines) {
      const row = rows[line.ItemId];
      const qty = Math.floor(Number(row?.quantity) || 0);
      if (qty <= 0) continue;
      if (!row || row.warehouseId === '') {
        setError(`"${line.label}" için depo seçin.`);
        return;
      }
      const list = byWarehouse.get(row.warehouseId) ?? [];
      list.push({ ItemId: line.ItemId, Quantity: qty });
      byWarehouse.set(row.warehouseId, list);
    }
    if (byWarehouse.size === 0) {
      setError('En az bir ürün için adet girin.');
      return;
    }

    setBusy(true);
    let created = 0;
    try {
      for (const [warehouseId, items] of byWarehouse) {
        await stockReceiptService.createAsync({
          ReceiptType: 'IN',
          WarehouseId: warehouseId,
          ...(description ? { Description: description } : {}),
          items,
        });
        created += 1;
      }
      toast.success('Stok eklendi.');
      await onSaved();
      onClose();
    } catch (err) {
      const msg = getUserFacingApiErrorMessage(err, 'stock-receipt');
      setError(created > 0 ? `Bazı depolara eklendi, kalanında hata: ${msg}` : msg);
      if (created > 0) await onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4">
      <div className="bg-background-panel rounded-panel w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-1">Hızlı Stok Ekle</h3>
        <p className="text-sm text-text-secondary mb-4">
          Hangi ürünün hangi depoya kaç adet ekleneceğini girin. Eksik miktarlar önceden doldurulur.
        </p>

        {stocks == null ? (
          <p className="text-sm text-text-secondary">Stoklar yükleniyor...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-text-secondary border-b border-background-border text-xs">
                  <th className="text-left py-2 pr-2 font-medium">Ürün</th>
                  <th className="text-left py-2 px-2 font-medium">Depo</th>
                  <th className="text-right py-2 px-2 font-medium">Depoda</th>
                  <th className="text-right py-2 pl-2 font-medium">Eklenecek adet</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const row = rows[line.ItemId];
                  const warehouseId = row?.warehouseId ?? initialWarehouse;
                  const inWarehouse = warehouseId === '' ? 0 : getStock(stocks, line.ItemId, warehouseId);
                  const shortage = shortageFor(stocks, line.ItemId, warehouseId);
                  return (
                    <tr key={line.ItemId} className="border-b border-background-border/60">
                      <td className="py-2 pr-2">{line.label}</td>
                      <td className="py-2 px-2">
                        <select
                          value={warehouseId}
                          onChange={(e) => updateRow(line.ItemId, { warehouseId: Number(e.target.value) || '' })}
                          className="input w-full text-sm py-1"
                          disabled={busy}
                        >
                          <option value="">Depo seçin</option>
                          {warehouses.map((wh) => (
                            <option key={wh.WarehouseId} value={wh.WarehouseId}>
                              {wh.WarehouseName}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {inWarehouse}
                        {shortage > 0 && (
                          <span className="block text-[11px] text-amber-400">eksik {shortage}</span>
                        )}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="off"
                          value={row?.quantity ?? ''}
                          placeholder="Adet"
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) =>
                            updateRow(line.ItemId, {
                              quantity: e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, ''),
                            })
                          }
                          className="input w-24 text-right text-sm py-1"
                          disabled={busy}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-400 whitespace-pre-wrap">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleSave()}
            disabled={busy || stocks == null}
          >
            {busy ? 'Kaydediliyor...' : 'Stoğa ekle'}
          </button>
        </div>
      </div>
    </div>
  );
}

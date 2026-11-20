import type { Warehouse } from '../models';
import type { StockShortage } from '../utils/stockShortage';

interface StockShortagePanelProps {
  shortages: StockShortage[];
  warehouses: Warehouse[];
  /** stockReceipts_create izni varsa "Eksikleri stoğa ekle" gösterilir */
  onAddStock?: () => void;
  /** İzin yoksa gösterilecek açıklama */
  noPermissionHint?: string;
  description?: string;
}

/**
 * Hangi ürünün hangi depoda kaç adet eksik olduğunu listeler; tek tıkla hızlı stok girişine geçer.
 */
export default function StockShortagePanel({
  shortages,
  warehouses,
  onAddStock,
  noPermissionHint = 'Stok eklemek için stok fişi oluşturma yetkisi gerekir.',
  description,
}: StockShortagePanelProps) {
  if (shortages.length === 0) return null;
  const totalMissing = shortages.reduce((sum, s) => sum + s.missing, 0);
  const warehouseName = (id: number) =>
    warehouses.find((w) => w.WarehouseId === id)?.WarehouseName ?? `Depo #${id}`;

  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-500/50 bg-amber-950/30 p-3 text-sm space-y-2"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-amber-100">
            Stok yetersiz — {shortages.length} üründe toplam {totalMissing} adet eksik
          </p>
          <p className="text-xs text-amber-200/80 mt-0.5">
            {description ??
              'Eksik stoğu buradan ekleyebilirsiniz; girdiğiniz bilgiler korunur, ekledikten sonra kaldığınız yerden devam edin.'}
          </p>
        </div>
        {onAddStock ? (
          <button type="button" className="btn-primary text-xs py-1.5 px-3 shrink-0" onClick={onAddStock}>
            Eksikleri stoğa ekle
          </button>
        ) : (
          <span className="text-[11px] text-amber-200/70">{noPermissionHint}</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-amber-200/80 border-b border-amber-700/40">
              <th className="text-left py-1 pr-3 font-medium">Ürün</th>
              <th className="text-left py-1 pr-3 font-medium">Depo</th>
              <th className="text-right py-1 pr-3 font-medium">Gereken</th>
              <th className="text-right py-1 pr-3 font-medium">Kullanılabilir</th>
              <th className="text-right py-1 font-medium">Eksik</th>
            </tr>
          </thead>
          <tbody>
            {shortages.map((s) => (
              <tr key={`${s.ItemId}:${s.WarehouseId}`} className="border-b border-amber-900/30 last:border-0">
                <td className="py-1 pr-3 text-text-primary">{s.label}</td>
                <td className="py-1 pr-3 text-text-secondary">{warehouseName(s.WarehouseId)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{s.required}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{s.available}</td>
                <td className="py-1 text-right tabular-nums font-semibold text-red-300">{s.missing}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import {
  extractStockErrorQuantities,
  isStockErrorMessage,
  parseStockError,
} from '../utils/parseStockError';

interface StockErrorPanelProps {
  message: string;
  onRetry?: () => void;
  onReduceQuantity?: (available: number) => void;
  onDismiss?: () => void;
  retryLabel?: string;
  showStockTransferLink?: boolean;
}

export default function StockErrorPanel({
  message,
  onRetry,
  onReduceQuantity,
  onDismiss,
  retryLabel = 'Tekrar dene',
  showStockTransferLink = true,
}: StockErrorPanelProps) {
  if (!message.trim()) return null;

  const parsed = isStockErrorMessage(message) ? parseStockError(message) : null;
  const quantities = extractStockErrorQuantities(message);
  const canReduce =
    quantities.available != null &&
    quantities.available > 0 &&
    onReduceQuantity != null &&
    (quantities.requested == null || quantities.requested > quantities.available);

  return (
    <div
      role="alert"
      className="rounded-lg border border-red-600/60 bg-red-950/45 p-3 text-sm text-red-100 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 min-w-0 flex-1">
          <p className="font-medium text-red-50">Stok hatası</p>
          <p className="whitespace-pre-wrap break-words">
            {parsed?.summary || message}
          </p>
          {parsed && parsed.warehouses.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse mt-1">
                <thead>
                  <tr className="text-red-200/80 border-b border-red-800/50">
                    <th className="text-left py-1 pr-3 font-medium">Depo</th>
                    <th className="text-right py-1 font-medium">Müsait</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.warehouses.map((wh) => (
                    <tr key={wh.name} className="border-b border-red-900/30 last:border-0">
                      <td className="py-1 pr-3">{wh.name}</td>
                      <td className="py-1 text-right tabular-nums">
                        {wh.quantity > 0 ? (
                          <span className="text-green-300">{wh.quantity} adet</span>
                        ) : (
                          <span className="text-red-300/80">0 adet</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {parsed && parsed.warehouses.length === 0 && message.includes('Depo stok durumu:') && (
            <p className="text-xs text-red-200/80">Hiçbir depoda stok bulunmuyor.</p>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-red-300 hover:text-red-100 text-lg leading-none px-1"
            aria-label="Hatayı kapat"
          >
            ×
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn-secondary text-xs py-1 px-2">
            {retryLabel}
          </button>
        )}
        {canReduce && (
          <button
            type="button"
            onClick={() => onReduceQuantity!(quantities.available!)}
            className="btn-secondary text-xs py-1 px-2"
          >
            Miktarı düşür ({quantities.available} adet)
          </button>
        )}
        {showStockTransferLink && (
          <Link
            to="/stock-receipts"
            className="btn-secondary text-xs py-1 px-2 inline-flex items-center"
            onClick={onDismiss}
          >
            Stok transferi yap
          </Link>
        )}
      </div>
      <p className="text-[11px] text-red-200/70">
        Depo seçimini güncelleyip tekrar deneyebilirsiniz. Sunucu stok kontrolü her zaman geçerlidir.
      </p>
    </div>
  );
}

import { ArchiveIcon } from '@phosphor-icons/react';
import { formatShortDateTime } from '../utils/formatters';
import { pickWarehouseDeletedAt } from '../models';

interface ArchivedWarehouseBannerProps {
  warehouseName?: string;
  deletedAt?: string | null;
}

export default function ArchivedWarehouseBanner({ warehouseName, deletedAt }: ArchivedWarehouseBannerProps) {
  const at = deletedAt ? formatShortDateTime(deletedAt) : null;
  return (
    <div
      className="rounded-lg border border-amber-700/50 bg-amber-950/40 px-4 py-3 flex items-start gap-3"
      role="status"
    >
      <ArchiveIcon size={22} weight="duotone" className="text-amber-300 shrink-0 mt-0.5" aria-hidden />
      <div>
        <div className="font-semibold text-amber-100">
          Bu depo pasif durumda. Yeni işlem yapılamaz.
        </div>
        <p className="text-sm text-amber-200/90 mt-1">
          {warehouseName ? `"${warehouseName}" ` : ''}
          kullanımdan kaldırılmıştır; geçmiş sözleşme ve hareket kayıtları korunur.
          {at && at !== '-' ? ` Pasife alınma: ${at}.` : ''}
        </p>
      </div>
    </div>
  );
}

export function warehouseDeletedAtLabel(
  w: { DeletedAt?: string | null; deletedAt?: string | null }
): string | null {
  const raw = pickWarehouseDeletedAt(w);
  if (!raw) return null;
  const formatted = formatShortDateTime(raw);
  return formatted && formatted !== '-' ? formatted : raw;
}

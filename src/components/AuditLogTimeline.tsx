import { AuditLog, AuditAction } from '../models';
import { formatDateTime } from '../utils/formatters';
import { buildAuditLogSummary } from '../utils/formatters';

const ACTION_LABELS: Record<AuditAction, string> = {
  [AuditAction.Create]: 'Oluşturma',
  [AuditAction.Update]: 'Güncelleme',
  [AuditAction.Delete]: 'Silme',
};

interface AuditLogTimelineProps {
  logs: AuditLog[];
  loading: boolean;
}

export default function AuditLogTimeline({ logs, loading }: AuditLogTimelineProps) {
  if (loading) {
    return (
      <div className="py-6 text-center text-text-secondary">
        Geçmiş yükleniyor...
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="py-8 text-center text-text-secondary">
        Bu kayıt için henüz geçmiş bulunmuyor.
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-80 overflow-y-auto">
      {logs.map((log) => (
        <div
          key={log.LogId}
          className="flex gap-3 p-3 rounded-lg border border-background-border bg-background-secondary"
        >
          <div className="flex-shrink-0 text-sm text-text-secondary whitespace-nowrap">
            {formatDateTime(log.Timestamp)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">
                {log.UserFullName || log.UserName || `#${log.UserId}`}
              </span>
              <span
                className={`badge text-xs ${
                  log.Action === AuditAction.Create
                    ? 'bg-green-600 text-white'
                    : log.Action === AuditAction.Update
                      ? 'bg-blue-600 text-white'
                      : 'bg-red-600 text-white'
                }`}
              >
                {ACTION_LABELS[log.Action as AuditAction] ?? log.Action}
              </span>
            </div>
            <div className="text-sm text-text-secondary mt-1">
              {buildAuditLogSummary(log.ChangedColumns, log.Action)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

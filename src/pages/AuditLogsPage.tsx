import { useState, useEffect, useCallback } from 'react';
import { auditLogService, AuditLogsParams } from '../services/auditLogService';
import { AuditLog, AuditAction } from '../models';
import { useAuthStore } from '../store/authStore';
import { formatDateTime } from '../utils/formatters';
import EmptyState from '../components/EmptyState';

const ACTION_LABELS: Record<AuditAction, string> = {
  [AuditAction.Create]: 'Ekleme',
  [AuditAction.Update]: 'Güncelleme',
  [AuditAction.Delete]: 'Silme',
};

export default function AuditLogsPage() {
  const user = useAuthStore((state) => state.user);
  const hasPermission = user?.Permissions?.includes('auditLogs_view');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUserId, setFilterUserId] = useState('');
  const [filterTableName, setFilterTableName] = useState('');
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterLimit, setFilterLimit] = useState(100);

  const loadLogs = useCallback(async () => {
    if (!hasPermission) return;
    try {
      setLoading(true);
      const params: AuditLogsParams = {
        limit: filterLimit || 100,
      };
      if (filterUserId.trim()) params.userId = parseInt(filterUserId, 10);
      if (filterTableName.trim()) params.tableName = filterTableName.trim();
      if (filterAction !== '') params.action = parseInt(filterAction, 10);
      if (filterDateFrom) params.dateFrom = new Date(filterDateFrom).toISOString();
      if (filterDateTo) params.dateTo = new Date(filterDateTo).toISOString();
      const data = await auditLogService.getAuditLogsAsync(params);
      setLogs(data ?? []);
    } catch (error) {
      console.error('Load audit logs error:', error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [hasPermission, filterUserId, filterTableName, filterAction, filterDateFrom, filterDateTo, filterLimit]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleApplyFilters = () => {
    loadLogs();
  };

  const handleResetFilters = () => {
    setFilterUserId('');
    setFilterTableName('');
    setFilterAction('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterLimit(100);
  };

  if (!hasPermission) {
    return (
      <div className="p-8">
        <div className="card p-8 text-center">
          <p className="text-lg text-text-secondary">Bu sayfayı görüntüleme yetkiniz yok.</p>
          <p className="text-sm text-text-secondary mt-2">Audit logları için <code>auditLogs_view</code> izni gerekir.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-text-secondary">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Audit Logları</h1>
        <p className="text-text-secondary">Sistemdeki kullanıcı işlemlerini inceleyin</p>
      </div>

      <div className="card p-4 mb-6">
        <h2 className="font-semibold mb-3">Filtreler</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">Kullanıcı ID</label>
            <input
              type="number"
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              placeholder="Örn. 1"
              className="input w-full"
              min={1}
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Tablo</label>
            <input
              type="text"
              value={filterTableName}
              onChange={(e) => setFilterTableName(e.target.value)}
              placeholder="Örn. Customers, Contracts"
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">İşlem</label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="input w-full"
            >
              <option value="">Tümü</option>
              <option value={AuditAction.Create}>Ekleme</option>
              <option value={AuditAction.Update}>Güncelleme</option>
              <option value={AuditAction.Delete}>Silme</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Başlangıç Tarihi</label>
            <input
              type="datetime-local"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Bitiş Tarihi</label>
            <input
              type="datetime-local"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Limit (1-500)</label>
            <input
              type="number"
              value={filterLimit}
              onChange={(e) => setFilterLimit(parseInt(e.target.value, 10) || 100)}
              className="input w-full"
              min={1}
              max={500}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={handleApplyFilters} className="btn-primary">
            Uygula
          </button>
          <button onClick={handleResetFilters} className="btn-secondary">
            Sıfırla
          </button>
          <button onClick={loadLogs} className="btn-secondary">
            Yenile
          </button>
        </div>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon="📋"
          title="Kayıt bulunamadı"
          description="Seçilen filtrelere uygun audit log kaydı yok"
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-background-border bg-background-hover">
                  <th className="text-left p-4 font-semibold">Tarih</th>
                  <th className="text-left p-4 font-semibold">Kullanıcı</th>
                  <th className="text-left p-4 font-semibold">Tablo</th>
                  <th className="text-left p-4 font-semibold">Kayıt ID</th>
                  <th className="text-left p-4 font-semibold">İşlem</th>
                  <th className="text-left p-4 font-semibold">Özet</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.LogId}
                    className="border-b border-background-border hover:bg-background-hover"
                  >
                    <td className="p-4 text-sm text-text-secondary whitespace-nowrap">
                      {formatDateTime(log.Timestamp)}
                    </td>
                    <td className="p-4">
                      <div className="font-medium">
                        {log.UserFullName || log.UserName || `#${log.UserId}`}
                      </div>
                      {log.UserName && log.UserFullName && (
                        <div className="text-sm text-text-secondary">{log.UserName}</div>
                      )}
                    </td>
                    <td className="p-4">{log.TableName}</td>
                    <td className="p-4">{log.RecordId}</td>
                    <td className="p-4">
                      <span
                        className={`badge ${
                          log.Action === AuditAction.Create
                            ? 'bg-green-600 text-white'
                            : log.Action === AuditAction.Update
                              ? 'bg-blue-600 text-white'
                              : 'bg-red-600 text-white'
                        }`}
                      >
                        {ACTION_LABELS[log.Action as AuditAction] ?? log.Action}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-text-secondary max-w-xs truncate" title={log.ChangedColumns ?? undefined}>
                      {log.ChangedColumns || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

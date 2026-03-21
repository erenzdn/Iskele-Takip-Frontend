import { useState, useEffect, useCallback } from 'react';
import { ScrollIcon } from '@phosphor-icons/react';
import { auditLogService, AuditLogsParams } from '../services/auditLogService';
import { userService } from '../services/userService';
import { AuditLog, AuditAction, User } from '../models';
import { useAuthStore } from '../store/authStore';
import { formatDateTime, buildAuditLogSummary } from '../utils/formatters';
import EmptyState from '../components/EmptyState';

const ACTION_LABELS: Record<AuditAction, string> = {
  [AuditAction.Create]: 'Oluşturma',
  [AuditAction.Update]: 'Güncelleme',
  [AuditAction.Delete]: 'Silme',
};

const MODULE_OPTIONS: { value: string; label: string }[] = [
  { value: 'Customers', label: 'Müşteriler' },
  { value: 'Contracts', label: 'Sözleşmeler' },
  { value: 'Warehouses', label: 'Depolar' },
  { value: 'Inventories', label: 'Envanter' },
  { value: 'Users', label: 'Kullanıcılar' },
  { value: 'PricingRules', label: 'Fiyatlama Kuralları' },
  { value: 'PriceTiers', label: 'Fiyat Kademeleri' },
  { value: 'ContractTemplates', label: 'Sözleşme Şablonları' },
  { value: 'TemplateImages', label: 'Şablon Görselleri' },
];

function toDatetimeLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

export default function AuditLogsPage() {
  const user = useAuthStore((state) => state.user);
  const hasPermission = user?.Permissions?.includes('auditLogs_view');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [selectedTableNames, setSelectedTableNames] = useState<string[]>([]);
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterLimit, setFilterLimit] = useState(100);

  useEffect(() => {
    if (!hasPermission) return;
    let cancelled = false;
    setUsersLoading(true);
    userService
      .getAllAsync()
      .then((data) => {
        if (!cancelled) setUsers(data ?? []);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasPermission]);

  const loadLogs = useCallback(async () => {
    if (!hasPermission) return;
    try {
      setLoading(true);
      const params: AuditLogsParams = {
        limit: filterLimit || 100,
      };
      if (selectedUserIds.length > 0) params.userIds = selectedUserIds;
      if (selectedTableNames.length > 0) params.tableNames = selectedTableNames;
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
  }, [
    hasPermission,
    selectedUserIds,
    selectedTableNames,
    filterAction,
    filterDateFrom,
    filterDateTo,
    filterLimit,
  ]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleApplyFilters = () => {
    loadLogs();
  };

  const handleResetFilters = () => {
    setSelectedUserIds([]);
    setSelectedTableNames([]);
    setFilterAction('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterLimit(100);
  };

  const setDateRangeToday = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getTime());
    setFilterDateFrom(toDatetimeLocal(start));
    setFilterDateTo(toDatetimeLocal(end));
  };

  const setDateRangeLast7Days = () => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    setFilterDateFrom(toDatetimeLocal(start));
    setFilterDateTo(toDatetimeLocal(end));
  };

  const toggleUser = (userId: number) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleTableName = (tableName: string) => {
    setSelectedTableNames((prev) =>
      prev.includes(tableName) ? prev.filter((t) => t !== tableName) : [...prev, tableName]
    );
  };

  if (!hasPermission) {
    return (
      <div className="p-8">
        <div className="card p-8 text-center">
          <p className="text-lg text-text-secondary">Bu sayfayı görüntüleme yetkiniz yok.</p>
          <p className="text-sm text-text-secondary mt-2">
            Audit logları için <code>auditLogs_view</code> izni gerekir.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">Audit Logları</h1>
        <button onClick={loadLogs} className="btn-secondary py-2 px-3 text-sm">Yenile</button>
      </div>

      <div className="card p-4 mb-3">
        <h2 className="font-semibold mb-3">Filtreler</h2>

        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-2">Tarih Aralığı</label>
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" onClick={setDateRangeToday} className="btn-secondary text-sm">
              Bugün
            </button>
            <button type="button" onClick={setDateRangeLast7Days} className="btn-secondary text-sm">
              Son 7 Gün
            </button>
            <span className="text-text-secondary text-sm mr-2">Başlangıç:</span>
            <input
              type="datetime-local"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="input w-48"
            />
            <span className="text-text-secondary text-sm mr-2">Bitiş:</span>
            <input
              type="datetime-local"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="input w-48"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-2">Modül</label>
          <div className="flex flex-wrap gap-4">
            {MODULE_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedTableNames.includes(opt.value)}
                  onChange={() => toggleTableName(opt.value)}
                  className="rounded border-gray-600 bg-gray-700 text-blue-600"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-2">İşlem Tipi</label>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="input w-48"
          >
            <option value="">Tümü</option>
            <option value={AuditAction.Create}>Oluşturma</option>
            <option value={AuditAction.Update}>Güncelleme</option>
            <option value={AuditAction.Delete}>Silme</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-2">Kullanıcı (bu işlemi kim yaptı)</label>
          {usersLoading ? (
            <span className="text-sm text-text-secondary">Kullanıcı listesi yükleniyor...</span>
          ) : (
            <div className="flex flex-wrap gap-3 max-h-32 overflow-y-auto p-2 border border-background-border rounded-lg">
              {users.map((u) => (
                <label key={u.UserId} className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(u.UserId)}
                    onChange={() => toggleUser(u.UserId)}
                    className="rounded border-gray-600 bg-gray-700 text-blue-600"
                  />
                  <span className="text-sm">{u.FullName || u.Username}</span>
                </label>
              ))}
              {users.length === 0 && (
                <span className="text-sm text-text-secondary">Kullanıcı listesi alınamadı</span>
              )}
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-1">Limit (1-500)</label>
          <input
            type="number"
            value={filterLimit}
            onChange={(e) => setFilterLimit(parseInt(e.target.value, 10) || 100)}
            className="input w-24"
            min={1}
            max={500}
          />
        </div>

        <div className="flex gap-2">
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

      {loading ? (
        <div className="flex items-center justify-center py-12 text-text-secondary">
          Yükleniyor...
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<ScrollIcon size={48} weight="duotone" />}
          title="Kayıt bulunamadı"
          description="Seçilen filtrelere uygun audit log kaydı yok"
        />
      ) : (
        <div className="border border-background-border rounded-panel overflow-hidden bg-background-panel flex flex-col">
          <div className="overflow-auto max-h-[calc(100vh-420px)] min-h-[280px]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 border-b border-background-border">
                <tr>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Tarih</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Kullanıcı</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Tablo</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">Kayıt ID</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap border-r border-background-border last:border-r-0 bg-background-hover">İşlem</th>
                  <th className="text-left py-1 px-2 font-medium text-text-secondary whitespace-nowrap bg-background-hover">Özet</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, index) => (
                  <tr
                    key={log.LogId}
                    className={`border-b border-background-border hover:bg-background-hover ${index % 2 === 0 ? 'bg-background-panel' : 'bg-[#16162e]'}`}
                  >
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0 text-text-secondary whitespace-nowrap">{formatDateTime(log.Timestamp)}</td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                      <span className="font-medium text-text-primary">{log.UserFullName || log.UserName || `#${log.UserId}`}</span>
                      {log.UserName && log.UserFullName && <span className="text-text-secondary ml-1">({log.UserName})</span>}
                    </td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">{log.TableName}</td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">{log.RecordId}</td>
                    <td className="py-0.5 px-2 align-middle border-r border-background-border/60 last:border-r-0">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${log.Action === AuditAction.Create ? 'bg-green-600 text-white' : log.Action === AuditAction.Update ? 'bg-blue-600 text-white' : 'bg-red-600 text-white'}`}>
                        {ACTION_LABELS[log.Action as AuditAction] ?? log.Action}
                      </span>
                    </td>
                    <td className="py-0.5 px-2 align-middle text-text-secondary max-w-xs truncate" title={log.ChangedColumns ?? undefined}>
                      {buildAuditLogSummary(log.ChangedColumns, log.Action)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-background-hover border-t border-background-border px-2 py-1 text-xs text-text-secondary flex items-center justify-between shrink-0">
            <span>Toplam: {logs.length} kayıt</span>
            <span className="text-text-secondary/80">Ekranda yaklaşık 25–40 satır görünür (pencere boyutuna göre)</span>
          </div>
        </div>
      )}
    </div>
  );
}

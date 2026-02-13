import { apiClient } from './apiClient';
import { AuditLog } from '../models';

export interface AuditLogsParams {
  limit?: number;
  userId?: number;
  userIds?: number[];
  tableName?: string;
  tableNames?: string[];
  action?: number;
  dateFrom?: string;
  dateTo?: string;
  recordId?: number;
}

export const auditLogService = {
  async getAuditLogsAsync(params?: AuditLogsParams): Promise<AuditLog[]> {
    const searchParams = new URLSearchParams();
    if (params?.limit != null) searchParams.set('limit', String(params.limit));
    if (params?.userId != null) searchParams.set('userId', String(params.userId));
    if (params?.userIds != null && params.userIds.length > 0) {
      searchParams.set('userIds', params.userIds.join(','));
    }
    if (params?.tableName != null) searchParams.set('tableName', params.tableName);
    if (params?.tableNames != null && params.tableNames.length > 0) {
      searchParams.set('tableNames', params.tableNames.join(','));
    }
    if (params?.action != null) searchParams.set('action', String(params.action));
    if (params?.dateFrom != null) searchParams.set('dateFrom', params.dateFrom);
    if (params?.dateTo != null) searchParams.set('dateTo', params.dateTo);
    if (params?.recordId != null) searchParams.set('recordId', String(params.recordId));
    const query = searchParams.toString();
    const url = query ? `/audit-logs?${query}` : '/audit-logs';
    return apiClient.get<AuditLog[]>(url);
  },
};

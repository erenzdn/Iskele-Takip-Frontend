import { apiClient } from './apiClient';

export interface SystemBackupStatusResponse {
  lastAutoBackupAt?: string | null;
  lastManualBackupAt?: string | null;
}

export const adminService = {
  async downloadSystemBackupAsync(): Promise<Blob> {
    return apiClient.postBlob('/api/v1/admin/system/backup');
  },

  async getSystemBackupStatusAsync(): Promise<SystemBackupStatusResponse | null> {
    const candidateEndpoints = [
      '/api/v1/admin/system/backup/status',
      '/api/v1/admin/system/backup-status',
      '/api/v1/admin/system/backup/info',
    ];

    for (const endpoint of candidateEndpoints) {
      try {
        const raw = await apiClient.get<Record<string, unknown>>(endpoint);
        const src: any = (raw as any)?.data ?? (raw as any)?.result ?? (raw as any)?.backup ?? raw;

        const pick = (...keys: string[]) => {
          for (const key of keys) {
            const v = src?.[key];
            if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
          }
          return null;
        };

        return {
          lastAutoBackupAt:
            pick(
              'lastAutoBackupAt',
              'last_auto_backup_at',
              'lastAutoBackup',
              'last_auto_backup',
              'lastAutoAt',
              'last_auto_at',
              'lastAutoBackupDate',
              'last_auto_backup_date'
            ),
          lastManualBackupAt:
            pick(
              'lastManualBackupAt',
              'last_manual_backup_at',
              'lastManualBackup',
              'last_manual_backup',
              'lastManualAt',
              'last_manual_at',
              'lastManualBackupDate',
              'last_manual_backup_date'
            ),
        };
      } catch (err) {
        const status = (err as any)?.status as number | undefined;
        if (status === 404) continue;
        throw err;
      }
    }

    return null;
  },
};


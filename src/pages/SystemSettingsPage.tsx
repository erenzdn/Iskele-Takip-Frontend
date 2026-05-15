import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  ArrowClockwiseIcon,
  DownloadSimpleIcon,
  InfoIcon,
  MoonIcon,
  SunIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import ConfirmModal from '../components/modals/ConfirmModal';
import { adminService } from '../services/adminService';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { isAdminUser } from '../utils/authHelpers';

type StatusMessage = { type: 'success' | 'error'; text: string } | null;

const LAST_BACKUP_AT_KEY = 'system_last_backup_at';
const LAST_AUTO_BACKUP_AT_KEY = 'system_last_auto_backup_at';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function buildBackupFilename(now = new Date()) {
  const y = now.getFullYear();
  const m = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  const hh = pad2(now.getHours());
  const mm = pad2(now.getMinutes());
  const ss = pad2(now.getSeconds());
  return `iskele-backup-${y}${m}${d}-${hh}${mm}${ss}.sql.gz`;
}

function formatTrDateTime(raw?: unknown) {
  if (raw === undefined || raw === null) return '-';
  const iso = String(raw).trim();
  if (!iso) return '-';

  // Epoch seconds/millis gelebilir (örn: "1712345678" veya 1712345678000)
  if (/^\d+$/.test(iso)) {
    const n = Number(iso);
    const dt = new Date(n < 1e12 ? n * 1000 : n);
    if (!Number.isNaN(dt.getTime())) {
      return new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(dt);
    }
  }

  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '-';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(dt);
}

export default function SystemSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminUser(user);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(
    () => localStorage.getItem(LAST_BACKUP_AT_KEY)
  );
  const [lastAutoBackupAt, setLastAutoBackupAt] = useState<string | null>(
    () => localStorage.getItem(LAST_AUTO_BACKUP_AT_KEY)
  );

  const confirmMessage = useMemo(() => {
    return [
      'Bu işlem veritabanının tam yedeğini alır ve `.sql.gz` dosyası olarak indirir.',
      'Saatte en fazla 1 kez manuel yedek alınabilir (rate limit).',
      'İndirme birkaç saniye sürebilir.',
      '',
      'Devam etmek istiyor musunuz?',
    ].join('\n');
  }, []);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    let mounted = true;
    const fetchBackupStatus = async () => {
      try {
        const statusInfo = await adminService.getSystemBackupStatusAsync();
        if (!mounted || !statusInfo) return;

        if (statusInfo.lastManualBackupAt) {
          setLastBackupAt(statusInfo.lastManualBackupAt);
          localStorage.setItem(LAST_BACKUP_AT_KEY, statusInfo.lastManualBackupAt);
        }
        if (statusInfo.lastAutoBackupAt) {
          setLastAutoBackupAt(statusInfo.lastAutoBackupAt);
          localStorage.setItem(LAST_AUTO_BACKUP_AT_KEY, statusInfo.lastAutoBackupAt);
        }
      } catch (err) {
        // Otomatik yedek bilgisi yardımcı bilgidir; başarısız olursa ekranı engelleme.
        console.warn('Backup status alınamadı:', err);
      }
    };
    fetchBackupStatus();
    return () => {
      mounted = false;
    };
  }, []);

  const downloadBlobAsFile = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    } finally {
      window.URL.revokeObjectURL(url);
    }
  };

  const normalizeErrorMessage = (err: unknown): StatusMessage => {
    const anyErr = err as any;
    const statusCode: number | undefined = anyErr?.status;
    const responseText: string | undefined = anyErr?.responseText;
    const message: string = anyErr?.message ?? '';

    // Ağ / bağlantı kopması (tarafımızdan veya fetch'ten gelen teknik mesajı gizle)
    if (!statusCode && /Failed to fetch|NetworkError/i.test(message)) {
      return {
        type: 'error',
        text: 'Yedek hazırlanırken sunucu ile bağlantı kesildi. (Backup preparation lost connection to the server.)',
      };
    }

    if (statusCode === 403) {
      return { type: 'error', text: 'Bu işlem sadece admin yetkisine sahip kullanıcılar tarafından yapılabilir.' };
    }
    if (statusCode === 429) {
      return { type: 'error', text: 'Saatte sadece 1 kez manuel yedek alabilirsiniz. Lütfen daha sonra tekrar deneyin.' };
    }

    if (responseText) {
      return { type: 'error', text: responseText };
    }
    return { type: 'error', text: 'Yedekleme sırasında bir hata oluştu.' };
  };

  const handleConfirm = async () => {
    setStatus(null);
    setBusy(true);
    try {
      const blob = await adminService.downloadSystemBackupAsync();
      const now = new Date();
      const filename = buildBackupFilename(now);
      downloadBlobAsFile(blob, filename);

      const iso = now.toISOString();
      setLastBackupAt(iso);
      localStorage.setItem(LAST_BACKUP_AT_KEY, iso);
      setStatus({ type: 'success', text: 'Yedek başarıyla indirildi.' });
      setConfirmOpen(false);
    } catch (e) {
      console.error('Backup error:', e);
      setStatus(normalizeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary mb-1">Sistem Ayarları</h1>
        <p className="text-text-secondary text-sm">
          Veritabanının anlık yedeğini `.sql.gz` olarak indirir. Bu alan sadece admin kullanıcılar içindir.
        </p>
      </div>

      {status && (
        <div
          className={`mb-6 rounded-panel border p-4 text-sm ${
            status.type === 'success'
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-error/40 bg-error/10 text-error'
          }`}
        >
          {status.text}
        </div>
      )}

      <div className="card mb-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-[260px]">
            <div className="flex items-center gap-2 mb-2">
              <SunIcon size={18} className="text-primary" />
              <h2 className="text-lg font-semibold">Görünüm</h2>
            </div>
            <p className="text-text-secondary text-sm">Arayüz temasını buradan değiştirebilirsiniz.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`btn-secondary flex items-center gap-2 ${theme === 'light' ? '!bg-primary !text-white' : ''}`}
            >
              <SunIcon size={16} />
              Aydınlık
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`btn-secondary flex items-center gap-2 ${theme === 'dark' ? '!bg-primary !text-white' : ''}`}
            >
              <MoonIcon size={16} />
              Koyu
            </button>
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-[260px]">
            <div className="flex items-center gap-2 mb-2">
              <InfoIcon size={18} className="text-primary" />
              <h2 className="text-lg font-semibold">Teklif ve Kategori Yönetimi</h2>
            </div>
            <p className="text-text-secondary text-sm">
              Teklif yönetimi ve kategori işlemlerine ayarlar ekranından hızlı erişim sağlayın.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/offer-management?tab=templates" className="btn-secondary">
              Teklif Yönetimi
            </Link>
            <Link to="/offer-management?tab=categories" className="btn-secondary">
              Kategori Yönetimi
            </Link>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-[260px]">
            <div className="flex items-center gap-2 mb-2">
              <InfoIcon size={18} className="text-primary" />
              <h2 className="text-lg font-semibold">Manuel Yedekleme</h2>
            </div>
            <div className="text-text-secondary text-sm space-y-1">
              <div className="flex items-center gap-2">
                <WarningIcon size={16} className="text-warning" />
                <span>Saatte en fazla 1 kez manuel yedek alabilirsiniz.</span>
              </div>
              <div>
                <span className="text-text-secondary">Son alınan yedek:</span>{' '}
                <span className="text-text-primary font-medium">{formatTrDateTime(lastBackupAt)}</span>
              </div>
              <div>
                <span className="text-text-secondary">Son otomatik yedek:</span>{' '}
                <span className="text-text-primary font-medium">{formatTrDateTime(lastAutoBackupAt)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
              className="btn-primary flex items-center gap-2"
            >
              {busy ? (
                <ArrowClockwiseIcon size={18} className="animate-spin" />
              ) : (
                <DownloadSimpleIcon size={18} />
              )}
              {busy ? 'Yedek alınıyor...' : 'Manuel Yedek Al'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Manuel yedek alınacak"
        message={confirmMessage}
        confirmLabel="Evet, yedeği indir"
        cancelLabel="Vazgeç"
        onCancel={() => (busy ? null : setConfirmOpen(false))}
        onConfirm={handleConfirm}
        loading={busy}
        variant="default"
      />
    </div>
  );
}


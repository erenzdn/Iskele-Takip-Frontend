import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  ArrowClockwiseIcon,
  CircleNotchIcon,
  DownloadSimpleIcon,
  InfoIcon,
  MoonIcon,
  SunIcon,
  WarningIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react';
import ConfirmModal from '../components/modals/ConfirmModal';
import { adminService } from '../services/adminService';
import { inventoryService, ExchangeRateResponse, PricingPresetResponse } from '../services/inventoryService';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { isAdminUser } from '../utils/authHelpers';
import { useUpdateStore } from '../store/updateStore';
import { toast } from '../hooks/useToast';
import { unitService } from '../services/unitService';
import { Unit } from '../models';

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
  const [isInstalling, setIsInstalling] = useState(false);

  const [usdRate, setUsdRate] = useState<number | ''>('');
  const [eurRate, setEurRate] = useState<number | ''>('');
  const [exchangeNotes, setExchangeNotes] = useState('');
  const [activeRates, setActiveRates] = useState<ExchangeRateResponse | null>(null);

  const [rentalRateTry, setRentalRateTry] = useState<number | ''>('');
  const [rentalRateUsd, setRentalRateUsd] = useState<number | ''>('');
  const [rentalRateEur, setRentalRateEur] = useState<number | ''>('');
  const [presetNotes, setPresetNotes] = useState('');
  const [activePreset, setActivePreset] = useState<PricingPresetResponse | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [newUnitName, setNewUnitName] = useState('');
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [busyUnits, setBusyUnits] = useState(false);

  const { 
    isUpdateAvailable, 
    isDownloading, 
    isDownloaded, 
    isChecking,
    progress: updateProgress, 
    updateInfo, 
    error: updateError 
  } = useUpdateStore();

  const updateStatus = useMemo(() => {
    if (updateError) return 'error';
    if (isChecking) return 'checking';
    if (isDownloaded) return 'downloaded';
    if (isDownloading) return 'downloading';
    if (isUpdateAvailable) return 'available';
    return 'uptodate';
  }, [isUpdateAvailable, isDownloading, isDownloaded, isChecking, updateError]);

  const confirmMessage = useMemo(() => {
    return [
      'Bu işlem veritabanının tam yedeğini alır ve `.sql.gz` dosyası olarak indirir.',
      'Saatte en fazla 1 kez manuel yedek alınabilir (rate limit).',
      'İndirme birkaç saniye sürebilir.',
      '',
      'Devam etmek istiyor musunuz?',
    ].join('\n');
  }, []);

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
        console.warn('Backup status alınamadı:', err);
      }
    };
    fetchBackupStatus();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const fetchRatesAndPresets = async () => {
      try {
        const rates = await inventoryService.getExchangeRatesAsync();
        setActiveRates(rates);
        setUsdRate(rates.UsdRate);
        setEurRate(rates.EurRate);
        setExchangeNotes(rates.Notes || '');
      } catch (err) {
        console.warn('Döviz kurları alınamadı:', err);
      }

      try {
        const preset = await inventoryService.getPricingPresetAsync();
        setActivePreset(preset);
        setRentalRateTry(preset.RentalRateTry);
        setRentalRateUsd(preset.RentalRateUsd);
        setRentalRateEur(preset.RentalRateEur);
        setPresetNotes(preset.Notes || '');
      } catch (err) {
        console.warn('Kiralama oranları alınamadı:', err);
      }
    };
    fetchRatesAndPresets();
  }, []);

  useEffect(() => {
    const loadUnits = async () => {
      try {
        setLoadingUnits(true);
        const data = await unitService.getAllAsync();
        setUnits(data);
      } catch (error) {
        console.error('Load units error:', error);
        toast.error('Birimler yüklenemedi.');
      } finally {
        setLoadingUnits(false);
      }
    };
    loadUnits();
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

    if (!statusCode && /Failed to fetch|NetworkError/i.test(message)) {
      return {
        type: 'error',
        text: 'Yedek hazırlanırken sunucu ile bağlantı kesildi.',
      };
    }

    if (statusCode === 403) {
      return { type: 'error', text: 'Bu işlem sadece admin yetkisine sahip kullanıcılar tarafından yapılabilir.' };
    }
    if (statusCode === 429) {
      return { type: 'error', text: 'Saatte sadece 1 kez manuel yedek alabilirsiniz.' };
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

  const handleCheckUpdates = () => {
    if (window.electron) {
      toast.info('Güncelleme kontrol ediliyor...');
      window.electron.updates.checkForUpdates();
    }
  };

  const handleDownload = () => {
    if (window.electron) {
      window.electron.updates.startDownload();
    }
  };

  const handleInstall = () => {
    if (window.electron) {
      setIsInstalling(true);
      window.electron.updates.installUpdate();
    }
  };

  const handleSaveRates = async () => {
    if (usdRate === '' || eurRate === '') {
      toast.warning('USD ve EUR kurları zorunludur.');
      return;
    }
    try {
      setBusy(true);
      await inventoryService.updateExchangeRatesAsync({
        UsdRate: Number(usdRate),
        EurRate: Number(eurRate),
        Notes: exchangeNotes,
      });
      toast.success('Kurlar güncellendi');
      const rates = await inventoryService.getExchangeRatesAsync();
      setActiveRates(rates);
    } catch (err) {
      console.error('Kurlar güncellenemedi:', err);
      toast.error('Kurlar güncellenirken hata oluştu.');
    } finally {
      setBusy(false);
    }
  };

  const handleSavePreset = async () => {
    if (rentalRateTry === '' || rentalRateUsd === '' || rentalRateEur === '') {
      toast.warning('Tüm kiralama oranları zorunludur.');
      return;
    }
    try {
      setBusy(true);
      await inventoryService.updatePricingPresetAsync({
        RentalRateTry: Number(rentalRateTry),
        RentalRateUsd: Number(rentalRateUsd),
        RentalRateEur: Number(rentalRateEur),
        Notes: presetNotes,
      });
      toast.success('Kiralama oranları güncellendi');
      const preset = await inventoryService.getPricingPresetAsync();
      setActivePreset(preset);
    } catch (err) {
      console.error('Preset güncellenemedi:', err);
      toast.error('Kiralama oranları güncellenirken hata oluştu.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddUnit = async () => {
    if (!newUnitName.trim()) {
      toast.warning('Birim adı boş olamaz.');
      return;
    }
    try {
      setBusyUnits(true);
      await unitService.createAsync({ UnitName: newUnitName.trim() });
      toast.success('Birim eklendi');
      setNewUnitName('');
      const data = await unitService.getAllAsync();
      setUnits(data);
    } catch (error) {
      console.error('Add unit error:', error);
      toast.error('Birim eklenirken hata oluştu.');
    } finally {
      setBusyUnits(false);
    }
  };

  const handleDeleteUnit = async (id: number) => {
    try {
      setBusyUnits(true);
      await unitService.deleteAsync(id);
      toast.success('Birim silindi');
      const data = await unitService.getAllAsync();
      setUnits(data);
    } catch (error) {
      console.error('Delete unit error:', error);
      toast.error('Birim silinirken hata oluştu.');
    } finally {
      setBusyUnits(false);
    }
  };

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary mb-1">Sistem Ayarları</h1>
        <p className="text-text-secondary text-sm">
          Uygulama tercihlerini, veritabanı yedeklerini ve yazılım güncellemelerini buradan yönetin.
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

      {/* Yazılım Güncelleme Bölümü */}
      <div className={`card mb-6 overflow-hidden relative transition-all duration-500 ${
        (updateStatus === 'available' || updateStatus === 'downloaded') 
          ? 'border-error/50 shadow-[0_0_15px_rgba(239,68,68,0.1)] ring-1 ring-error/20' 
          : ''
      }`}>
        {/* Arka plan süslemesi */}
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <ArrowClockwiseIcon size={120} />
        </div>

        <div className="flex items-start justify-between gap-6 flex-wrap relative z-10">
          <div className="min-w-[260px] flex-1">
            <div className="flex items-center gap-2 mb-2">
              <ArrowClockwiseIcon size={18} className={(updateStatus === 'available' || updateStatus === 'downloaded') ? 'text-error animate-pulse' : 'text-primary'} />
              <h2 className="text-lg font-semibold">Yazılım Güncelleme</h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-text-secondary text-sm">Durum:</span>
                <span className={`badge flex items-center gap-1.5 ${
                  updateStatus === 'uptodate' ? 'bg-success/10 text-success' :
                  updateStatus === 'available' ? 'bg-error/10 text-error animate-pulse' :
                  updateStatus === 'checking' ? 'bg-info/10 text-info' :
                  updateStatus === 'downloaded' ? 'bg-primary/10 text-primary' :
                  updateStatus === 'downloading' ? 'bg-info/10 text-info' :
                  updateStatus === 'error' ? 'bg-error/10 text-error' :
                  'bg-background-elevated text-text-secondary'
                }`}>
                  {(updateStatus === 'available' || updateStatus === 'error') && <WarningIcon size={14} />}
                  {updateStatus === 'checking' && (
                    <>
                      <CircleNotchIcon size={14} className="animate-spin" />
                      Kontrol ediliyor...
                    </>
                  )}
                  {updateStatus === 'uptodate' && (
                    <>
                      <ShieldCheckIcon size={14} />
                      Yazılımınız Güncel
                    </>
                  )}
                  {updateStatus === 'available' && 'Yeni Güncelleme Mevcut!'}
                  {updateStatus === 'downloading' && 'İndiriliyor...'}
                  {updateStatus === 'downloaded' && 'Yüklemeye Hazır'}
                  {updateStatus === 'error' && 'Hata Oluştu'}
                </span>
              </div>
              <div className="text-xs text-text-secondary flex items-center gap-2">
                <InfoIcon size={14} />
                <span>Mevcut Versiyon: v{window.electron?.appVersion || '1.4.5'}</span>
              </div>

              {updateInfo && (
                <div className="text-sm">
                  <span className="text-text-secondary">Yeni Sürüm:</span>{' '}
                  <span className="text-text-primary font-mono font-bold">{updateInfo.version}</span>
                </div>
              )}

              {updateError && (
                <div className="text-error text-xs flex items-center gap-1">
                  <WarningIcon size={14} />
                  <span>{updateError}</span>
                </div>
              )}

              {updateStatus === 'downloading' && (
                <div className="w-full max-w-md mt-4">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-medium text-text-secondary">İndirme İlerlemesi</span>
                    <span className="text-xs font-bold text-primary">%{updateProgress.toFixed(0)}</span>
                  </div>
                  <div className="w-full bg-background-elevated rounded-full h-2 overflow-hidden border border-background-border-muted">
                    <div 
                      className="bg-primary h-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(15,118,110,0.5)]" 
                      style={{ width: `${updateProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            {updateStatus === 'uptodate' || updateStatus === 'error' || updateStatus === 'checking' ? (
              <button
                type="button"
                onClick={handleCheckUpdates}
                disabled={isChecking}
                className="btn-secondary flex items-center gap-2 min-w-[180px] justify-center"
              >
                {isChecking ? (
                  <CircleNotchIcon size={18} className="animate-spin" />
                ) : (
                  <ArrowClockwiseIcon size={18} />
                )}
                {isChecking ? 'Denetleniyor...' : 'Güncellemeleri Denetle'}
              </button>
            ) : null}

            {updateStatus === 'available' && (
              <button
                type="button"
                onClick={handleDownload}
                className="btn-primary flex items-center gap-2 shadow-lg shadow-primary/20"
              >
                <DownloadSimpleIcon size={18} />
                Güncellemeyi Şimdi İndir
              </button>
            )}

            {updateStatus === 'downloaded' && (
              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={handleInstall}
                  disabled={isInstalling}
                  className="btn-success flex items-center gap-2 shadow-lg shadow-success/20"
                >
                  {isInstalling ? (
                    <CircleNotchIcon size={18} className="animate-spin" />
                  ) : (
                    <ArrowClockwiseIcon size={18} />
                  )}
                  {isInstalling ? 'Hazırlanıyor...' : 'Yükle ve Yeniden Başlat'}
                </button>
                {isInstalling && (
                  <p className="text-xs text-success font-medium animate-pulse">
                    Uygulama saniyeler içinde güncellenip yeniden başlatılacak...
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

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

      {/* Döviz Kuru Yönetimi */}
      <div className="card mb-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-[260px] flex-1">
            <div className="flex items-center gap-2 mb-2">
              <InfoIcon size={18} className="text-primary" />
              <h2 className="text-lg font-semibold">Döviz Kuru Yönetimi</h2>
            </div>
            <p className="text-text-secondary text-sm mb-4">
              Uygulama genelinde kullanılacak USD ve EUR kurlarını buradan güncelleyebilirsiniz.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium mb-1">USD Kuru ($)</label>
                <input
                  type="number"
                  value={usdRate}
                  onChange={(e) => setUsdRate(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input w-full"
                  step="0.01"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">EUR Kuru (€)</label>
                <input
                  type="number"
                  value={eurRate}
                  onChange={(e) => setEurRate(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input w-full"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-xs font-medium mb-1">Notlar</label>
              <input
                type="text"
                value={exchangeNotes}
                onChange={(e) => setExchangeNotes(e.target.value)}
                className="input w-full"
                placeholder="Örn: Mayıs 2026 kuru"
              />
            </div>
            
            {activeRates && (
              <div className="text-xs text-text-secondary bg-background-secondary p-2 rounded-lg">
                <span className="font-medium">Mevcut Aktif Kur:</span> $1 = ₺{activeRates.UsdRate.toFixed(2)} | €1 = ₺{activeRates.EurRate.toFixed(2)}
                <br />
                <span className="font-medium">Son Güncelleme:</span> {formatTrDateTime(activeRates.UpdatedAt)}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveRates}
              disabled={busy}
              className="btn-primary flex items-center gap-2"
            >
              {busy ? (
                <CircleNotchIcon size={18} className="animate-spin" />
              ) : (
                <ArrowClockwiseIcon size={18} />
              )}
              {busy ? 'Kaydediliyor...' : 'Kurları Kaydet'}
            </button>
          </div>
        </div>
      </div>

      {/* Kiralama Oranı Ön Ayarı */}
      <div className="card mb-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-[260px] flex-1">
            <div className="flex items-center gap-2 mb-2">
              <InfoIcon size={18} className="text-primary" />
              <h2 className="text-lg font-semibold">Kiralama Oranı Ön Ayarı</h2>
            </div>
            <p className="text-text-secondary text-sm mb-4">
              Her para birimi için varsayılan kiralama çarpanlarını (oranlarını) buradan belirleyebilirsiniz.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium mb-1">TL Oranı</label>
                <input
                  type="number"
                  value={rentalRateTry}
                  onChange={(e) => setRentalRateTry(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input w-full"
                  step="0.001"
                  min="0"
                />
                <span className="text-xs text-text-secondary">%{((Number(rentalRateTry) || 0) * 100).toFixed(1)}</span>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">USD Oranı</label>
                <input
                  type="number"
                  value={rentalRateUsd}
                  onChange={(e) => setRentalRateUsd(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input w-full"
                  step="0.001"
                  min="0"
                />
                <span className="text-xs text-text-secondary">%{((Number(rentalRateUsd) || 0) * 100).toFixed(1)}</span>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">EUR Oranı</label>
                <input
                  type="number"
                  value={rentalRateEur}
                  onChange={(e) => setRentalRateEur(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input w-full"
                  step="0.001"
                  min="0"
                />
                <span className="text-xs text-text-secondary">%{((Number(rentalRateEur) || 0) * 100).toFixed(1)}</span>
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-xs font-medium mb-1">Notlar</label>
              <input
                type="text"
                value={presetNotes}
                onChange={(e) => setPresetNotes(e.target.value)}
                className="input w-full"
                placeholder="Örn: Standart kiralama oranı"
              />
            </div>
            
            {!activePreset && (
              <div className="text-yellow-500 text-xs bg-yellow-900/20 p-2 rounded-lg">
                Henüz oran tanımlanmamış.
              </div>
            )}
            
            {activePreset && (
              <div className="text-xs text-text-secondary bg-background-secondary p-2 rounded-lg">
                <span className="font-medium">Son Güncelleme:</span> {formatTrDateTime(activePreset.UpdatedAt || activePreset.CreatedAt)}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSavePreset}
              disabled={busy}
              className="btn-primary flex items-center gap-2"
            >
              {busy ? (
                <CircleNotchIcon size={18} className="animate-spin" />
              ) : (
                <ArrowClockwiseIcon size={18} />
              )}
              {busy ? 'Kaydediliyor...' : 'Oranları Kaydet'}
            </button>
          </div>
        </div>
      </div>

      {/* Birim Tanımları */}
      <div className="card mb-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-[260px] flex-1">
            <div className="flex items-center gap-2 mb-2">
              <InfoIcon size={18} className="text-primary" />
              <h2 className="text-lg font-semibold">Birim Tanımları</h2>
            </div>
            <p className="text-text-secondary text-sm mb-4">
              Envanter için kullanılacak birimleri buradan yönetebilirsiniz.
            </p>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                placeholder="Örn: ton, paket, koli"
                className="input flex-1"
                disabled={busyUnits}
              />
              <button
                type="button"
                onClick={handleAddUnit}
                disabled={busyUnits || !newUnitName.trim()}
                className="btn-primary"
              >
                {busyUnits ? <CircleNotchIcon size={16} className="animate-spin" /> : 'Ekle'}
              </button>
            </div>

            {loadingUnits ? (
              <div className="text-sm text-text-secondary flex items-center gap-2">
                <CircleNotchIcon size={16} className="animate-spin" />
                Yükleniyor...
              </div>
            ) : units.length === 0 ? (
              <div className="text-sm text-text-secondary">Henüz birim tanımlanmamış.</div>
            ) : (
              <div className="border border-background-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-background-hover text-text-secondary text-xs">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium">Birim Adı</th>
                      <th className="text-right py-2 px-3 font-medium">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((u) => (
                      <tr key={u.UnitId} className="border-t border-background-border/60">
                        <td className="py-2 px-3 text-text-primary">{u.UnitName}</td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteUnit(u.UnitId)}
                            disabled={busyUnits}
                            className="text-error hover:text-error-hover text-xs font-medium"
                          >
                            Sil
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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


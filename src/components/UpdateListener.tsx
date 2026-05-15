import { useEffect, useRef } from 'react';
import { useUpdateStore } from '../store/updateStore';
import { toast } from '../hooks/useToast';

export default function UpdateListener() {
  const { setUpdateAvailable, setDownloading, setDownloaded, setError, setChecking } = useUpdateStore();
  const isInitialCheck = useRef(true);

  useEffect(() => {
    if (!window.electron) return;

    const unsubs = [
      window.electron.updates.onUpdateChecking(() => {
        setChecking(true);
      }),
      window.electron.updates.onUpdateAvailable((info: any) => {
        setUpdateAvailable(true, info);
        toast.info(`Yeni bir yazılım güncellemesi mevcut: v${info.version}`, 8000);
      }),
      window.electron.updates.onUpdateNotAvailable(() => {
        setUpdateAvailable(false);
        if (!isInitialCheck.current) {
          toast.success('Yazılımınız güncel. Harika!');
        }
        isInitialCheck.current = false;
      }),
      window.electron.updates.onUpdateError((err: string) => {
        setError(err);
        if (!isInitialCheck.current) {
          toast.error('Güncelleme kontrolü sırasında bir hata oluştu.');
        }
        isInitialCheck.current = false;
      }),
      window.electron.updates.onUpdateDownloadProgress((progress: any) => {
        setDownloading(true, progress.percent);
      }),
      window.electron.updates.onUpdateDownloaded((info: any) => {
        setDownloaded(true, info);
        toast.success(`Güncelleme (v${info.version}) indirildi. Yüklemeye hazır!`, 10000);
      }),
    ];

    // Initial check (Startup)
    window.electron.updates.checkForUpdates();

    // 3 saniye sonra 'başlangıç kontrolü' sessizliğini boz. 
    // Böylece kullanıcı butona bastığında her zaman geri bildirim alır.
    const silenceTimer = setTimeout(() => {
      isInitialCheck.current = false;
    }, 3000);

    return () => {
      unsubs.forEach((unsub) => unsub());
      clearTimeout(silenceTimer);
    };
  }, [setUpdateAvailable, setDownloading, setDownloaded, setError]);

  return null;
}

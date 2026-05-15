import { useEffect, useRef } from 'react';
import { useUpdateStore } from '../store/updateStore';
import { toast } from '../hooks/useToast';

export default function UpdateListener() {
  const { setUpdateAvailable, setDownloading, setDownloaded, setError } = useUpdateStore();
  const isInitialCheck = useRef(true);

  useEffect(() => {
    if (!window.electron) return;

    const unsubs = [
      window.electron.updates.onUpdateChecking(() => {
        // Checking started
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

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [setUpdateAvailable, setDownloading, setDownloaded, setError]);

  return null;
}

import { useEffect } from 'react';
import { useUpdateStore } from '../store/updateStore';

export default function UpdateListener() {
  const { setUpdateAvailable, setDownloading, setDownloaded, setError } = useUpdateStore();

  useEffect(() => {
    if (!window.electron) return;

    const unsubs = [
      window.electron.updates.onUpdateAvailable((info: any) => {
        setUpdateAvailable(true, info);
      }),
      window.electron.updates.onUpdateNotAvailable(() => {
        setUpdateAvailable(false);
      }),
      window.electron.updates.onUpdateError((err: string) => {
        setError(err);
      }),
      window.electron.updates.onUpdateDownloadProgress((progress: any) => {
        setDownloading(true, progress.percent);
      }),
      window.electron.updates.onUpdateDownloaded((info: any) => {
        setDownloaded(true, info);
      }),
    ];

    // Initial check
    window.electron.updates.checkForUpdates();

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [setUpdateAvailable, setDownloading, setDownloaded, setError]);

  return null;
}

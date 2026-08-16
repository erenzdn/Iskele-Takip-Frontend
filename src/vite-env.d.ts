/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
type LiveExchangeRatesResult =
  | {
      ok: true;
      usdSelling: number;
      eurSelling: number;
      date: string;
      source: string;
    }
  | {
      ok: false;
      error: string;
    };

interface Window {
  electron?: {
    platform: string;
    appVersion: string;
    updates: {
      onUpdateChecking: (callback: () => void) => () => void;
      onUpdateAvailable: (callback: (info: any) => void) => () => void;
      onUpdateNotAvailable: (callback: (info: any) => void) => () => void;
      onUpdateError: (callback: (error: string) => void) => () => void;
      onUpdateDownloadProgress: (callback: (progress: any) => void) => () => void;
      onUpdateDownloaded: (callback: (info: any) => void) => () => void;
      startDownload: () => void;
      installUpdate: () => void;
      checkForUpdates: () => void;
    };
    getLiveExchangeRates?: () => Promise<LiveExchangeRatesResult>;
  };
}

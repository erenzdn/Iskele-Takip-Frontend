export type LiveExchangeRatesResult =
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

interface ElectronAPI {
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
  getLiveExchangeRates: () => Promise<LiveExchangeRatesResult>;
  saveFile: (options: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }) => Promise<string | null>;
  writeFile: (filePath: string, data: ArrayBuffer) => Promise<boolean>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};

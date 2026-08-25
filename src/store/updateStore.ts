import { create } from 'zustand';

interface UpdateState {
  isUpdateAvailable: boolean;
  isDownloading: boolean;
  isDownloaded: boolean;
  isChecking: boolean;
  progress: number;
  updateInfo: any | null;
  error: string | null;
  
  setUpdateAvailable: (available: boolean, info?: any) => void;
  setDownloading: (downloading: boolean, progress?: number) => void;
  setDownloaded: (downloaded: boolean, info?: any) => void;
  setChecking: (checking: boolean) => void;
  setError: (error: string | null) => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  isUpdateAvailable: false,
  isDownloading: false,
  isDownloaded: false,
  isChecking: false,
  progress: 0,
  updateInfo: null,
  error: null,

  setUpdateAvailable: (available, info) => set({ 
    isUpdateAvailable: available, 
    updateInfo: available ? (info || null) : null,
    isDownloading: false,
    isDownloaded: false,
    isChecking: false,
    error: null,
  }),
  setChecking: (checking) => set({
    isChecking: checking,
    ...(checking ? { error: null } : {}),
  }),
  setDownloading: (downloading, progress) => set({ 
    isDownloading: downloading, 
    progress: progress ?? 0,
    isChecking: false,
    error: null,
  }),
  setDownloaded: (downloaded, info) => set({ 
    isDownloaded: downloaded, 
    updateInfo: info || null,
    isDownloading: false,
    isChecking: false,
    error: null,
  }),
  setError: (error) => set({ error, isChecking: false }),
}));

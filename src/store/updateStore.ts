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
    updateInfo: info || null,
    isDownloading: false,
    isDownloaded: false,
    isChecking: false
  }),
  setChecking: (checking) => set({ isChecking: checking }),
  setDownloading: (downloading, progress) => set({ 
    isDownloading: downloading, 
    progress: progress ?? 0,
    isChecking: false
  }),
  setDownloaded: (downloaded, info) => set({ 
    isDownloaded: downloaded, 
    updateInfo: info || null,
    isDownloading: false,
    isChecking: false
  }),
  setError: (error) => set({ error, isChecking: false }),
}));

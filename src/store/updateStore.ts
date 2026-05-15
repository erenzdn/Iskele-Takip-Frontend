import { create } from 'zustand';

interface UpdateState {
  isUpdateAvailable: boolean;
  isDownloading: boolean;
  isDownloaded: boolean;
  progress: number;
  updateInfo: any | null;
  error: string | null;
  
  setUpdateAvailable: (available: boolean, info?: any) => void;
  setDownloading: (downloading: boolean, progress?: number) => void;
  setDownloaded: (downloaded: boolean, info?: any) => void;
  setError: (error: string | null) => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  isUpdateAvailable: false,
  isDownloading: false,
  isDownloaded: false,
  progress: 0,
  updateInfo: null,
  error: null,

  setUpdateAvailable: (available, info) => set({ 
    isUpdateAvailable: available, 
    updateInfo: info || null,
    isDownloading: false,
    isDownloaded: false 
  }),
  setDownloading: (downloading, progress) => set({ 
    isDownloading: downloading, 
    progress: progress ?? 0 
  }),
  setDownloaded: (downloaded, info) => set({ 
    isDownloaded: downloaded, 
    updateInfo: info || null,
    isDownloading: false 
  }),
  setError: (error) => set({ error }),
}));

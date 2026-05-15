import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  /** Otomatik kapanma süresi (ms). 0 ise kapanmaz. Varsayılan variant'a göre değişir. */
  duration: number;
  createdAt: number;
}

interface ToastStore {
  toasts: Toast[];
  /** Yeni toast ekler. Dönen id ile programatik olarak kapatılabilir. */
  addToast: (message: string, variant: ToastVariant, duration?: number) => string;
  /** Belirli bir toast'ı kaldırır. */
  removeToast: (id: string) => void;
  /** Tüm toast'ları temizler. */
  clearAll: () => void;
}

/** Variant'a göre varsayılan süre (ms) */
const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
  success: 3500,
  error: 6000,
  warning: 5000,
  info: 4000,
};

const MAX_TOASTS = 5;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (message, variant, duration?) => {
    const id = crypto.randomUUID();
    const toast: Toast = {
      id,
      message,
      variant,
      duration: duration ?? DEFAULT_DURATIONS[variant],
      createdAt: Date.now(),
    };

    set((state) => {
      // Aynı mesajla kısa sürede çift toast gönderimini önle
      const isDuplicate = state.toasts.some(
        (t) => t.message === message && t.variant === variant && Date.now() - t.createdAt < 800
      );
      if (isDuplicate) return state;

      const next = [...state.toasts, toast];
      // Maksimum sayıyı aşarsa en eski kaldırılır
      if (next.length > MAX_TOASTS) next.shift();
      return { toasts: next };
    });

    return id;
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearAll: () => {
    set({ toasts: [] });
  },
}));

// ─── Kısa yollar (import edip doğrudan çağrılabilir) ─────────────────────────
// Böylece her yerde useToastStore.getState().addToast(...) yerine toast.success(...) yeter.

function success(message: string, duration?: number): string {
  return useToastStore.getState().addToast(message, 'success', duration);
}

function error(message: string, duration?: number): string {
  return useToastStore.getState().addToast(message, 'error', duration);
}

function warning(message: string, duration?: number): string {
  return useToastStore.getState().addToast(message, 'warning', duration);
}

function info(message: string, duration?: number): string {
  return useToastStore.getState().addToast(message, 'info', duration);
}

export const toast = { success, error, warning, info } as const;

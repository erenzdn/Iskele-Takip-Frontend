import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'ui_theme';
const DEFAULT_THEME: ThemeMode = 'dark';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

function readPersistedTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeMode(stored)) return stored;
  } catch {
    // localStorage erişimi engellenirse güvenli varsayılanı kullan
  }
  return DEFAULT_THEME;
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function applyInitialTheme() {
  const theme = readPersistedTheme();
  applyTheme(theme);
  return theme;
}

interface ThemeState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const initialTheme = applyInitialTheme();

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // yazma hatasında state güncellemesini engelleme
    }
    set({ theme });
  },
  toggleTheme: () => {
    const current = get().theme;
    const nextTheme: ThemeMode = current === 'dark' ? 'light' : 'dark';
    get().setTheme(nextTheme);
  },
}));

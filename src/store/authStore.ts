import { create } from 'zustand';
import { LoginUserDto } from '../models';

interface AuthState {
  token: string | null;
  user: LoginUserDto | null;
  isAuthenticated: boolean;
  login: (token: string, user: LoginUserDto) => void;
  logout: () => void | Promise<void>;
  setToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Zero-Trust: Uygulama açıldığında token/user null, kullanıcı login ekranına yönlendirilir
  token: null,
  user: null,
  isAuthenticated: false,

  login: (token: string, user: LoginUserDto) => {
    // Token ve kullanıcı bilgisini sadece RAM'de (Zustand state) tutuyoruz
    set({ token, user, isAuthenticated: true });
  },

  logout: async () => {
    // State'i temizle
    set({ token: null, user: null, isAuthenticated: false });

    // Backend'e logout isteği at (httpOnly cookie temizliği için)
    try {
      const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      await fetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include', // Refresh token cookie'sini gönder
      });
    } catch (error) {
      console.warn('[AUTH] Logout isteği başarısız oldu:', error);
      // Hata olsa bile client tarafında state temizlendi, devam et
    }
  },

  // Silent refresh sonrası yeni accessToken'ı set etmek için
  setToken: (token: string) => {
    const currentUser = get().user;
    if (currentUser) {
      set({ token, isAuthenticated: true });
    }
  },
}));

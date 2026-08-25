import { create } from 'zustand';
import { LoginUserDto } from '../models';

interface AuthState {
  /** Access token — yalnızca bellek (Zustand); refresh HttpOnly cookie’de. */
  accessToken: string | null;
  user: LoginUserDto | null;
  isAuthenticated: boolean;
  login: (accessToken: string, user: LoginUserDto) => void;
  logout: () => void | Promise<void>;
  setAccessToken: (accessToken: string) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Zero-Trust: Uygulama açıldığında token/user null
  accessToken: null,
  user: null,
  isAuthenticated: false,

  login: (accessToken: string, user: LoginUserDto) => {
    set({ accessToken, user, isAuthenticated: true });
  },

  logout: async () => {
    set({ accessToken: null, user: null, isAuthenticated: false });

    try {
      const { authService } = await import('../services/authService');
      await authService.logoutAsync();
    } catch (error) {
      console.warn('[AUTH] Logout isteği başarısız oldu:', error);
    }
  },

  setAccessToken: (accessToken: string) => {
    const currentUser = get().user;
    if (currentUser) {
      set({ accessToken, isAuthenticated: true });
    }
  },
}));

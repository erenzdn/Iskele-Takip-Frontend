import { create } from 'zustand';
import { LoginResponse, LoginUserDto } from '../models';
import { getClockSkewMs } from '../utils/jwt';

interface AuthState {
  /** Access token — yalnızca bellek (Zustand). */
  accessToken: string | null;
  /** Refresh token — yalnızca bellek; uygulama kapanınca oturum biter. */
  refreshToken: string | null;
  user: LoginUserDto | null;
  isAuthenticated: boolean;
  /** Mutlak oturum sonu (sunucu saatiyle ms); bu anda şifre yeniden istenir. */
  sessionExpiresAt: number | null;
  /** Sunucu saati − cihaz saati (ms); süre karşılaştırmaları `getServerNow()` ile yapılır. */
  clockSkewMs: number;
  /**
   * Kilitli oturum: token'lar silinmiştir ama kullanıcı ve açık ekranlar korunur.
   * Şifre girilince kaldığı yerden devam edilir; bekleyen istekler kilit açılınca gönderilir.
   */
  isLocked: boolean;
  lockMessage: string | null;
  /** Oturum kullanıcı isteği dışında bittiyse login ekranında gösterilecek açıklama. */
  sessionEndMessage: string | null;
  login: (response: LoginResponse) => void;
  logout: (sessionEndMessage?: string) => Promise<void>;
  lock: (message: string) => Promise<void>;
  unlock: (response: LoginResponse) => void;
  setTokens: (accessToken: string, refreshToken?: string | null, sessionExpiresAt?: string | null) => void;
  clearSessionEndMessage: () => void;
}

function parseExpiry(value?: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

async function revokeRefreshToken(refreshToken: string | null): Promise<void> {
  try {
    const { authService } = await import('../services/authService');
    await authService.logoutAsync(refreshToken);
  } catch (error) {
    console.warn('[AUTH] Logout isteği başarısız oldu:', error);
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Zero-Trust: Uygulama açıldığında token/user null
  accessToken: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  sessionExpiresAt: null,
  clockSkewMs: 0,
  isLocked: false,
  lockMessage: null,
  sessionEndMessage: null,

  login: (response: LoginResponse) => {
    set({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken ?? null,
      user: response.user,
      isAuthenticated: true,
      sessionExpiresAt: parseExpiry(response.sessionExpiresAt),
      clockSkewMs: getClockSkewMs(response.accessToken),
      isLocked: false,
      lockMessage: null,
      sessionEndMessage: null,
    });
  },

  logout: async (sessionEndMessage?: string) => {
    const { refreshToken } = get();

    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      sessionExpiresAt: null,
      isLocked: false,
      lockMessage: null,
      sessionEndMessage: sessionEndMessage ?? null,
    });

    await revokeRefreshToken(refreshToken);
  },

  lock: async (message: string) => {
    const { refreshToken, user, isLocked } = get();
    if (!user || isLocked) return;

    set({
      accessToken: null,
      refreshToken: null,
      sessionExpiresAt: null,
      isLocked: true,
      lockMessage: message,
    });

    if (refreshToken) await revokeRefreshToken(refreshToken);
  },

  unlock: (response: LoginResponse) => {
    set({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken ?? null,
      user: response.user,
      sessionExpiresAt: parseExpiry(response.sessionExpiresAt),
      clockSkewMs: getClockSkewMs(response.accessToken),
      isLocked: false,
      lockMessage: null,
    });
  },

  setTokens: (accessToken: string, refreshToken?: string | null, sessionExpiresAt?: string | null) => {
    const state = get();
    if (!state.user || state.isLocked) {
      // Kilit/çıkış sırasında yolda olan bir refresh yanıtı: sunucuda geçerli token bırakma
      if (refreshToken) void revokeRefreshToken(refreshToken);
      return;
    }
    set({
      accessToken,
      refreshToken: refreshToken ?? state.refreshToken,
      sessionExpiresAt: parseExpiry(sessionExpiresAt) ?? state.sessionExpiresAt,
      clockSkewMs: getClockSkewMs(accessToken),
    });
  },

  clearSessionEndMessage: () => set({ sessionEndMessage: null }),
}));

/** Sunucu saatine göre şimdiki an (ms); token ve oturum süreleri bununla karşılaştırılır. */
export function getServerNow(): number {
  return Date.now() + useAuthStore.getState().clockSkewMs;
}

/** Kilit açılınca true, oturum tamamen kapatılırsa false döner. */
export function waitForUnlock(): Promise<boolean> {
  const current = useAuthStore.getState();
  if (!current.isLocked) return Promise.resolve(current.isAuthenticated);
  return new Promise((resolve) => {
    const unsubscribe = useAuthStore.subscribe((state) => {
      if (!state.isLocked) {
        unsubscribe();
        resolve(state.isAuthenticated);
      }
    });
  });
}

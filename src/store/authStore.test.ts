import { beforeEach, describe, expect, it, vi } from 'vitest';

const logoutAsync = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/authService', () => ({ authService: { logoutAsync } }));

import { getServerNow, useAuthStore, waitForUnlock } from './authStore';
import { getJwtExpiryMs } from '../utils/jwt';
import type { LoginResponse } from '../models';

function jwt(payload: object): string {
  return `header.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.signature`;
}

const user = { userId: 7, username: 'ahmet', permissions: ['customers_view'] };

function loginResponse(overrides: Partial<LoginResponse> = {}): LoginResponse {
  return {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    sessionExpiresAt: '2026-10-29T00:00:00.000Z',
    user,
    ...overrides,
  };
}

beforeEach(() => {
  logoutAsync.mockClear();
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
    sessionExpiresAt: null,
    clockSkewMs: 0,
    isLocked: false,
    lockMessage: null,
    sessionEndMessage: null,
  });
});

describe('authStore oturum kilidi', () => {
  it('kilitlenince token silinir, kullanıcı ve oturum korunur, refresh token iptal edilir', async () => {
    useAuthStore.getState().login(loginResponse());

    await useAuthStore.getState().lock('Süre doldu');

    const state = useAuthStore.getState();
    expect(state.isLocked).toBe(true);
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(user);
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.lockMessage).toBe('Süre doldu');
    expect(logoutAsync).toHaveBeenCalledWith('refresh-1');
  });

  it('bekleyen istekler kilit açılınca devam eder', async () => {
    useAuthStore.getState().login(loginResponse());
    await useAuthStore.getState().lock('Süre doldu');

    const pending = waitForUnlock();
    useAuthStore.getState().unlock(loginResponse({ accessToken: 'access-2', refreshToken: 'refresh-2' }));

    await expect(pending).resolves.toBe(true);
    expect(useAuthStore.getState().accessToken).toBe('access-2');
    expect(useAuthStore.getState().sessionExpiresAt).toBe(Date.parse('2026-10-29T00:00:00.000Z'));
  });

  it('kilitteyken çıkış yapılırsa bekleyen istekler iptal olur', async () => {
    useAuthStore.getState().login(loginResponse());
    await useAuthStore.getState().lock('Süre doldu');

    const pending = waitForUnlock();
    await useAuthStore.getState().logout();

    await expect(pending).resolves.toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('kilitliyken gelen geç refresh yanıtı oturumu açmaz ve yeni token sunucuda iptal edilir', async () => {
    useAuthStore.getState().login(loginResponse());
    await useAuthStore.getState().lock('Süre doldu');
    logoutAsync.mockClear();

    useAuthStore.getState().setTokens('late-access', 'late-refresh');
    await vi.waitFor(() => expect(logoutAsync).toHaveBeenCalledWith('late-refresh'));

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().isLocked).toBe(true);
  });
});

describe('saat sapması', () => {
  it('cihaz saati sunucudan 20 dk ileriyken token süresi sunucu saatine göre hesaplanır', () => {
    const deviceNow = Date.parse('2026-10-28T12:20:00Z');
    vi.useFakeTimers({ now: deviceNow });
    try {
      // Sunucu 12:00'de imzalamış, 15 dk ömür
      const iat = Date.parse('2026-10-28T12:00:00Z') / 1000;
      const accessToken = jwt({ iat, exp: iat + 15 * 60 });
      useAuthStore.getState().login(loginResponse({ accessToken }));

      expect(getServerNow()).toBe(Date.parse('2026-10-28T12:00:00Z'));
      expect((getJwtExpiryMs(accessToken) ?? 0) - getServerNow()).toBe(15 * 60 * 1000);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getJwtExpiryMs', () => {
  it('exp alanını milisaniyeye çevirir', () => {
    const payload = btoa(JSON.stringify({ exp: 1_800_000_000 })).replace(/=+$/, '');
    expect(getJwtExpiryMs(`header.${payload}.signature`)).toBe(1_800_000_000_000);
  });

  it('bozuk token için null döner', () => {
    expect(getJwtExpiryMs('bozuk')).toBeNull();
    expect(getJwtExpiryMs(null)).toBeNull();
  });
});

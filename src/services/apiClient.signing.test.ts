import { afterEach, describe, expect, it, vi } from 'vitest';

function jwt(payload: object): string {
  return `header.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.signature`;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});

describe('istek imzalama saat sapması', () => {
  it('cihaz saati 20 dk ileriyken imza zaman damgası sunucu saatiyle atılır', async () => {
    vi.stubEnv('VITE_SIGNING_ENABLED', 'true');
    vi.stubEnv('VITE_SIGNING_SECRET', 'test-signing-secret-at-least-32-chars');
    vi.resetModules();

    const serverNow = Date.parse('2026-10-28T12:00:00Z');
    vi.useFakeTimers({ now: serverNow + 20 * 60 * 1000, toFake: ['Date'] });

    const { useAuthStore } = await import('../store/authStore');
    const { apiClient } = await import('./apiClient');

    const iat = serverNow / 1000;
    useAuthStore.getState().login({
      accessToken: jwt({ iat, exp: iat + 15 * 60 }),
      refreshToken: 'refresh-1',
      user: { userId: 1, username: 'admin', permissions: [] },
    });

    const fetchMock = vi.fn(async (_request: Request) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.get('/customers');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = fetchMock.mock.calls[0][0];
    expect(Number(sent.headers.get('X-Timestamp'))).toBe(serverNow);
  });
});

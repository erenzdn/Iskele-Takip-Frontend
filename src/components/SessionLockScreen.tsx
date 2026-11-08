import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/authService';
import { getUserFacingErrorMessage } from '../utils/apiError';
import { normalizeText } from '../utils/validation';

// Kilitliyken klavye olayları alttaki ekranın window/document dinleyicilerine ulaşmasın
// (örn. Escape açık modalı kapatıp veri kaybettirmesin). Modül yüklenirken eklenir ki
// bileşenlerin sonradan eklediği capture dinleyicilerinden önce çalışsın. Yayılımı
// durdurmak varsayılan davranışı (yazma, Enter ile gönderme) engellemez.
if (typeof window !== 'undefined') {
  const blockWhileLocked = (event: KeyboardEvent) => {
    if (useAuthStore.getState().isLocked) event.stopImmediatePropagation();
  };
  (['keydown', 'keyup', 'keypress'] as const).forEach((type) =>
    window.addEventListener(type, blockWhileLocked, true)
  );
}

const stopPropagation = (event: React.SyntheticEvent) => event.stopPropagation();

/**
 * Oturum süresi dolduğunda açık ekranın üstünü kapatır; şifre girilince aynı kullanıcı
 * kaldığı yerden devam eder (açık formlar ve bekleyen istekler korunur).
 */
export default function SessionLockScreen() {
  const user = useAuthStore((state) => state.user);
  const lockMessage = useAuthStore((state) => state.lockMessage);
  const unlock = useAuthStore((state) => state.unlock);
  const logout = useAuthStore((state) => state.logout);

  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setErrorMessage('Şifre zorunludur.');
      return;
    }
    setErrorMessage(null);
    setIsBusy(true);
    try {
      const response = await authService.loginAsync({
        username: user.username,
        password: normalizeText(password),
      });
      if (!response?.accessToken || response.user?.userId !== user.userId) {
        throw new Error('Oturum yenilenemedi.');
      }
      setPassword('');
      unlock(response);
    } catch (error) {
      const status = (error as { status?: number }).status;
      setErrorMessage(
        status === 401 ? 'Şifre hatalı.' : getUserFacingErrorMessage(error, 'Oturum yenilenemedi.')
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-background-main p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-lock-title"
      onMouseDown={stopPropagation}
      onPointerDown={stopPropagation}
      onClick={stopPropagation}
      onContextMenu={stopPropagation}
    >
      <div className="card w-full max-w-md">
        <div className="text-center mb-6">
          <h1 id="session-lock-title" className="text-2xl font-bold mb-2">
            Oturum kilitlendi
          </h1>
          <p className="text-text-secondary text-sm">{lockMessage}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Kullanıcı</label>
            <div className="input w-full opacity-70">{user.fullName || user.username}</div>
          </div>

          <div>
            <label htmlFor="session-lock-password" className="block text-sm font-medium mb-2">
              Şifre
            </label>
            <input
              id="session-lock-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full"
              placeholder="Şifrenizi girin"
              autoFocus
              disabled={isBusy}
            />
          </div>

          {errorMessage && <div className="text-error text-sm">{errorMessage}</div>}

          <button
            type="submit"
            disabled={isBusy}
            className={`btn-primary w-full ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isBusy ? 'Doğrulanıyor...' : 'Devam et'}
          </button>

          <button
            type="button"
            onClick={() => void logout()}
            disabled={isBusy}
            className="btn-secondary w-full"
          >
            Farklı kullanıcıyla giriş yap
          </button>
        </form>
      </div>
    </div>
  );
}

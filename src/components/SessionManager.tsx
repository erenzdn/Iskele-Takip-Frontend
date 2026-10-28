import { useCallback, useEffect, useRef, useState } from 'react';
import { getServerNow, useAuthStore } from '../store/authStore';
import { apiClient } from '../services/apiClient';
import { getJwtExpiryMs } from '../utils/jwt';
import ConfirmModal from './modals/ConfirmModal';
import SessionLockScreen from './SessionLockScreen';

const IDLE_TIMEOUT_MS = (Number(import.meta.env.VITE_SESSION_IDLE_MINUTES) || 60) * 60_000;
const WARNING_BEFORE_MS = 2 * 60_000;
const REFRESH_BEFORE_EXPIRY_MS = 2 * 60_000;
const REFRESH_RETRY_MS = 30_000;
const TICK_MS = 1_000;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const;

const IDLE_LOCK_MESSAGE = 'Uzun süre işlem yapılmadığı için oturumunuz kilitlendi. Devam etmek için şifrenizi girin.';
const DAILY_LOCK_MESSAGE = 'Günlük oturum süreniz doldu. Kaldığınız yerden devam etmek için şifrenizi girin.';

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Oturum yaşam döngüsü:
 * - Kullanıcı aktifken access token dolmadan sessizce yenilenir (login ekranına atılmaz).
 * - Hareketsizlik süresi dolmadan önce uyarı gösterilir; yanıt gelmezse oturum kilitlenir.
 * - Günlük oturum sonunda (sessionExpiresAt) oturum kilitlenir.
 * Kilitte açık ekranlar korunur; şifre girilince kaldığı yerden devam edilir.
 */
export default function SessionManager() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLocked = useAuthStore((state) => state.isLocked);
  const [warningRemainingMs, setWarningRemainingMs] = useState<number | null>(null);
  const lastActivityRef = useRef(Date.now());
  const warningOpenRef = useRef(false);
  const lastRefreshAttemptRef = useRef(0);

  const closeWarning = useCallback(() => {
    warningOpenRef.current = false;
    setWarningRemainingMs(null);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || isLocked) {
      closeWarning();
      return;
    }

    lastActivityRef.current = Date.now();

    const onActivity = () => {
      // Uyarı açıkken kullanıcı açıkça "Oturumda kal" demeli
      if (!warningOpenRef.current) lastActivityRef.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, onActivity, { capture: true, passive: true })
    );

    const tick = () => {
      const now = Date.now();
      const serverNow = getServerNow();
      const { accessToken, sessionExpiresAt, lock } = useAuthStore.getState();

      if (sessionExpiresAt !== null && serverNow >= sessionExpiresAt) {
        closeWarning();
        void lock(DAILY_LOCK_MESSAGE);
        return;
      }

      const idleMs = now - lastActivityRef.current;

      if (idleMs >= IDLE_TIMEOUT_MS) {
        closeWarning();
        void lock(IDLE_LOCK_MESSAGE);
        return;
      }

      if (idleMs >= IDLE_TIMEOUT_MS - WARNING_BEFORE_MS) {
        warningOpenRef.current = true;
        setWarningRemainingMs(IDLE_TIMEOUT_MS - idleMs);
        return;
      }

      // Kullanıcı form doldururken API çağrısı olmasa da refresh token canlı kalmalı
      const expiresAt = getJwtExpiryMs(accessToken);
      if (
        expiresAt !== null &&
        expiresAt - serverNow < REFRESH_BEFORE_EXPIRY_MS &&
        now - lastRefreshAttemptRef.current > REFRESH_RETRY_MS
      ) {
        lastRefreshAttemptRef.current = now;
        void apiClient.refreshSession();
      }
    };

    const intervalId = window.setInterval(tick, TICK_MS);

    return () => {
      window.clearInterval(intervalId);
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, onActivity, { capture: true })
      );
    };
  }, [isAuthenticated, isLocked, closeWarning]);

  const handleStayLoggedIn = () => {
    lastActivityRef.current = Date.now();
    closeWarning();
  };

  const handleLogout = () => {
    closeWarning();
    void useAuthStore.getState().logout();
  };

  if (isAuthenticated && isLocked) {
    return <SessionLockScreen />;
  }

  return (
    <ConfirmModal
      open={isAuthenticated && warningRemainingMs !== null}
      title="Oturumunuz kilitlenmek üzere"
      message={`Uzun süredir işlem yapılmadı. Güvenliğiniz için oturumunuz ${formatRemaining(
        warningRemainingMs ?? 0
      )} sonra kilitlenecek.`}
      confirmLabel="Oturumda kal"
      cancelLabel="Çıkış yap"
      onConfirm={handleStayLoggedIn}
      onCancel={handleLogout}
      zIndexClass="z-[10000]"
    />
  );
}

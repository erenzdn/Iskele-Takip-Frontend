import { Navigate } from 'react-router-dom';
import { LockKeyIcon } from '@phosphor-icons/react';
import { useAuthStore } from '../store/authStore';
import { useTabStore } from '../store/tabStore';
import { isAdminUser } from '../utils/authHelpers';
import { useTabOptional } from './tabs/TabContext';

interface PageGuardProps {
  children: React.ReactNode;
  requiredPermission?: string;
  adminOnly?: boolean;
}

/**
 * Sayfa seviyesi yetki kontrolü - MainLayout'un altında kullanılır.
 * Sekme içinde yönlendirme yapılmaz; yetkisiz sekme açıklama ile kalır, böylece
 * (ör. geri yüklenen) arka plan sekmeleri kullanıcıyı başka sayfaya atmaz.
 */
export function PageGuard({
  children,
  requiredPermission,
  adminOnly = false,
}: PageGuardProps) {
  const user = useAuthStore((state) => state.user);
  const permissions = user?.permissions ?? [];
  const allowed =
    (!adminOnly || isAdminUser(user)) &&
    (!requiredPermission || permissions.includes(requiredPermission));

  if (allowed) return <>{children}</>;
  return <AccessDenied />;
}

function AccessDenied() {
  const tab = useTabOptional();
  const requestClose = useTabStore((state) => state.requestClose);

  if (!tab) return <Navigate to="/" replace />;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-text-secondary">
      <LockKeyIcon size={32} className="text-text-secondary" />
      <p>Bu sayfayı görüntüleme yetkiniz yok.</p>
      {tab.tabId !== '/' && (
        <button type="button" className="btn-secondary" onClick={() => requestClose(tab.tabId)}>
          Sekmeyi kapat
        </button>
      )}
    </div>
  );
}

import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { isAdminUser } from '../utils/authHelpers';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: string;
  adminOnly?: boolean;
}

export default function ProtectedRoute({
  children,
  requiredPermission,
  adminOnly = false,
}: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdminUser(user)) {
    return <Navigate to="/" replace />;
  }

  if (requiredPermission) {
    const permissions = user?.permissions ?? [];
    if (!permissions.includes(requiredPermission)) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}


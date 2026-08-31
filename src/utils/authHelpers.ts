import type { LoginUserDto } from '../models';

export function isAdminUser(user: LoginUserDto | null | undefined): boolean {
  if (!user) return false;

  const permissions = user.permissions ?? [];
  if (permissions.includes('admin_access')) return true;

  if ((user.username ?? '').toLowerCase() === 'admin') return true;

  // Geriye dönük kurulumlar
  if (user.userId === 1) return true;
  if (user.role === 'admin') return true;
  if (user.roleId === 1) return true;
  if ((user.roleName ?? '').toLowerCase() === 'admin') return true;

  return false;
}


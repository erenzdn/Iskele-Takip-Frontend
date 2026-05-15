import type { LoginUserDto } from '../models';

export function isAdminUser(user: LoginUserDto | null | undefined): boolean {
  if (!user) return false;

  // Projede sık görülen varsayılan admin: userId=1
  if (user.userId === 1) return true;

  // Bazı kurulumlarda admin kullanıcı adı ile ayırt edilebilir
  if ((user.username ?? '').toLowerCase() === 'admin') return true;

  // En güvenilir kontrol: explicit role
  if (user.role === 'admin') return true;

  if (user.roleId === 1) return true;

  if ((user.roleName ?? '').toLowerCase() === 'admin') return true;

  return false;
}


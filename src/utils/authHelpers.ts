import type { LoginUserDto } from '../models';

export function isAdminUser(user: LoginUserDto | null | undefined): boolean {
  if (!user) return false;

  // Projede sık görülen varsayılan admin: UserId=1
  if (user.UserId === 1) return true;

  // Bazı kurulumlarda admin kullanıcı adı ile ayırt edilebilir
  if ((user.Username ?? '').toLowerCase() === 'admin') return true;

  // En güvenilir kontrol: explicit role
  if (user.role === 'admin') return true;

  // Alternatif payload alanı
  if (user.roleId === 1) return true;

  // Mevcut modellerdeki alan
  if (user.RoleId === 1) return true;

  // Bazı sistemlerde RoleName 'admin' olarak gelebilir
  if ((user.RoleName ?? '').toLowerCase() === 'admin') return true;

  return false;
}


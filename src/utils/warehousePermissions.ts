import type { LoginUserDto } from '../models';
import { isAdminUser } from './authHelpers';

/** Backend: warehouses_delete */
export function canDeleteWarehouse(user: LoginUserDto | null | undefined): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  return (user.permissions ?? []).includes('warehouses_delete');
}

/** Backend: warehouses_update (stok ekleme/güncelleme/silme dahil) */
export function canUpdateWarehouse(user: LoginUserDto | null | undefined): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  return (user.permissions ?? []).includes('warehouses_update');
}

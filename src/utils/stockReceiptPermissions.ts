import type { LoginUserDto } from '../models';
import { isAdminUser } from './authHelpers';

export function isStockReceiptCancelled(status: string | null | undefined): boolean {
  return String(status ?? '').toUpperCase() === 'CANCELLED';
}

/** Backend: stockReceipts_delete (admin kullanıcılar genelde tüm izinlere sahiptir). */
export function canDeleteStockReceipt(user: LoginUserDto | null | undefined): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  return (user.permissions ?? []).includes('stockReceipts_delete');
}

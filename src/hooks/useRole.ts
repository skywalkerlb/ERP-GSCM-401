import { shopPath } from '@/lib/businessContext';
import { useAuth, type AppRole } from './useAuth';

export const STAFF_ROLES: AppRole[] = ['owner', 'admin', 'manager', 'cashier', 'baker'];

export interface RoleInfo {
  role: AppRole | null;
  isManager: boolean;
  isCashier: boolean;
  isBaker: boolean;
  isCustomer: boolean;
  /** Manager, cashier or baker. */
  isStaff: boolean;
  /** True when the signed-in role is one of `roles`. Managers always pass for staff-only checks that list manager. */
  hasRole: (...roles: AppRole[]) => boolean;
}

/** `const { role, isManager, hasRole } = useRole()` */
export function useRole(): RoleInfo {
  const { profile } = useAuth();
  const role = profile?.role ?? null;
  return {
    role,
    isManager: role === 'owner' || role === 'admin' || role === 'manager',
    isCashier: role === 'cashier',
    isBaker: role === 'baker',
    isCustomer: role === 'customer',
    isStaff: role !== null && role !== 'customer',
    hasRole: (...roles) => role !== null && (roles.includes(role) || ((role === 'owner' || role === 'admin') && roles.includes('manager'))),
  };
}

/** Where each role lands after signing in. */
export function homeFor(role: AppRole | null | undefined): string {
  switch (role) {
    case 'customer':
      return shopPath('');
    case 'cashier':
      return '/pos';
    case 'baker':
      return '/forecast';
    default:
      return '/';
  }
}

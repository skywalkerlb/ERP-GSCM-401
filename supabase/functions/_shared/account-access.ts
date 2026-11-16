export type AccountRole = 'owner' | 'admin' | 'manager' | 'cashier' | 'baker' | 'customer';

const grants: Record<AccountRole, readonly AccountRole[]> = {
  owner: ['admin', 'manager', 'cashier', 'baker', 'customer'],
  admin: ['manager', 'cashier', 'baker', 'customer'],
  manager: ['cashier', 'baker', 'customer'],
  cashier: [], baker: [], customer: [],
};

export function assignableRoles(actorRole: string | null | undefined): readonly AccountRole[] {
  return grants[actorRole as AccountRole] ?? [];
}
export function canManageAccount(actorRole: string | null | undefined, targetRole: string, actorId?: string, targetId?: string): boolean {
  return !(actorId && targetId && actorId === targetId) && assignableRoles(actorRole).includes(targetRole as AccountRole);
}
export function canAssignAccountRole(actorRole: string | null | undefined, targetRole: string, newRole: string, actorId?: string, targetId?: string): boolean {
  return canManageAccount(actorRole, targetRole, actorId, targetId) && assignableRoles(actorRole).includes(newRole as AccountRole);
}

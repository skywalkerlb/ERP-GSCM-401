import type { AppRole } from '@/hooks/useAuth';

/**
 * Who can open what (docs/ARCHITECTURE.md section 4). One place, used by the nav and by route `handle`s.
 * Managers can open everything. Customers only use /shop.
 */
export const ACCESS = {
  /** Any staff role. */
  owner: ['owner'],
  staff: ['owner', 'admin', 'manager', 'cashier', 'baker'],
  /** Managers only: purchasing, suppliers, MRP, finance, reports, settings, items, customers, dashboard. */
  manager: ['owner', 'admin', 'manager'],
  /** Counter work: POS, sales, orders, returns. */
  sell: ['owner', 'admin', 'manager', 'cashier'],
  /** Kitchen work: forecast, bake plan, production, receiving, adjustments, labels. */
  bakery: ['owner', 'admin', 'manager', 'baker'],
} as const satisfies Record<string, readonly AppRole[]>;

export type Access = (typeof ACCESS)[keyof typeof ACCESS];

/** Put this in a route's `handle` to restrict it: `{ path: 'pos', handle: { roles: ACCESS.sell } }`. */
export interface RouteHandle {
  roles?: readonly AppRole[];
}

import type { RouteObject } from 'react-router-dom';
import { ACCESS } from '@/app/access';
import { lazyPage } from '@/app/lazyPage';

/** Routes for the inventory feature, mounted under the staff layout by src/app/routes.tsx. Edit freely. */
export const inventoryRoutes: RouteObject[] = [
  { path: 'inventory', handle: { roles: ACCESS.staff }, lazy: lazyPage(() => import('./InventoryPage')) },
  { path: 'inventory/transfers', handle: { roles: ACCESS.staff }, lazy: lazyPage(() => import('./TransfersPage')) },
  { path: 'inventory/adjust', handle: { roles: ACCESS.bakery }, lazy: lazyPage(() => import('./AdjustPage')) },
  { path: 'inventory/receive', handle: { roles: ACCESS.bakery }, lazy: lazyPage(() => import('./ReceivePage')) },
  { path: 'inventory/:itemId', handle: { roles: ACCESS.staff }, lazy: lazyPage(() => import('./ItemLedgerPage')) },
];

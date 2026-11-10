import type { RouteObject } from 'react-router-dom';
import { ACCESS } from '@/app/access';
import { lazyPage } from '@/app/lazyPage';

/** Routes for the purchasing feature, mounted under the staff layout by src/app/routes.tsx. Edit freely. */
export const purchasingRoutes: RouteObject[] = [
  { path: 'purchasing', handle: { roles: ACCESS.manager }, lazy: lazyPage(() => import('./PurchasingPage')) },
  { path: 'purchasing/new', handle: { roles: ACCESS.manager }, lazy: lazyPage(() => import('./NewPurchaseOrderPage')) },
  { path: 'purchasing/replenish', handle: { roles: ACCESS.manager }, lazy: lazyPage(() => import('./ReplenishPage')) },
  { path: 'purchasing/review', handle: { roles: ACCESS.manager }, lazy: lazyPage(() => import('./ReviewPage')) },
  { path: 'purchasing/:id', handle: { roles: ACCESS.manager }, lazy: lazyPage(() => import('./PurchaseOrderPage')) },
  { path: 'purchasing/:id/print', handle: { roles: ACCESS.manager }, lazy: lazyPage(() => import('./PurchaseOrderPrintPage')) },
];

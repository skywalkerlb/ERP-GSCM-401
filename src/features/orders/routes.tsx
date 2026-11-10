import type { RouteObject } from 'react-router-dom';
import { ACCESS } from '@/app/access';
import { lazyPage } from '@/app/lazyPage';

/** Routes for the orders feature, mounted under the staff layout by src/app/routes.tsx. Edit freely. */
export const ordersRoutes: RouteObject[] = [
  { path: 'orders', handle: { roles: ACCESS.sell }, lazy: lazyPage(() => import('./OrdersPage')) },
  { path: 'orders/new', handle: { roles: ACCESS.sell }, lazy: lazyPage(() => import('./OrderNewPage')) },
  { path: 'orders/:id', handle: { roles: ACCESS.sell }, lazy: lazyPage(() => import('./OrderDetailPage')) },
];

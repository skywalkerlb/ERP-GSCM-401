import type { RouteObject } from 'react-router-dom';
import { ACCESS } from '@/app/access';
import { lazyPage } from '@/app/lazyPage';

/** Routes for the customers feature, mounted under the staff layout by src/app/routes.tsx. Edit freely. */
export const customersRoutes: RouteObject[] = [
  { path: 'customers', handle: { roles: ACCESS.manager }, lazy: lazyPage(() => import('./CustomersPage')) },
  { path: 'customers/:id', handle: { roles: ACCESS.manager }, lazy: lazyPage(() => import('./CustomerDetailPage')) },
];

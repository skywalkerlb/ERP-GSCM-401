import type { RouteObject } from 'react-router-dom';
import { ACCESS } from '@/app/access';
import { lazyPage } from '@/app/lazyPage';

/** Routes for the suppliers feature, mounted under the staff layout by src/app/routes.tsx. Edit freely. */
export const suppliersRoutes: RouteObject[] = [
  { path: 'suppliers', handle: { roles: ACCESS.manager }, lazy: lazyPage(() => import('./SuppliersPage')) },
  { path: 'suppliers/scorecard', handle: { roles: ACCESS.manager }, lazy: lazyPage(() => import('./ScorecardPage')) },
  { path: 'suppliers/:id', handle: { roles: ACCESS.manager }, lazy: lazyPage(() => import('./SupplierDetailPage')) },
];

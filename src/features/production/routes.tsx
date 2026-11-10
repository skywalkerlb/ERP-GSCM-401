import type { RouteObject } from 'react-router-dom';
import { ACCESS } from '@/app/access';
import { lazyPage } from '@/app/lazyPage';

/** Routes for the production feature, mounted under the staff layout by src/app/routes.tsx. Edit freely. */
export const productionRoutes: RouteObject[] = [
  { path: 'production', handle: { roles: ACCESS.bakery }, lazy: lazyPage(() => import('./ProductionPage')) },
  { path: 'production/report', handle: { roles: ACCESS.bakery }, lazy: lazyPage(() => import('./ProductionReportPage')) },
  { path: 'production/:id', handle: { roles: ACCESS.bakery }, lazy: lazyPage(() => import('./ProductionDetailPage')) },
];

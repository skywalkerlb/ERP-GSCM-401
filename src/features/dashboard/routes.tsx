import type { RouteObject } from 'react-router-dom';
import { ACCESS } from '@/app/access';
import { lazyPage } from '@/app/lazyPage';

/** Routes for the dashboard feature, mounted under the staff layout by src/app/routes.tsx. Edit freely. */
export const dashboardRoutes: RouteObject[] = [
  { index: true, handle: { roles: ACCESS.manager }, lazy: lazyPage(() => import('./DashboardPage')) },
];

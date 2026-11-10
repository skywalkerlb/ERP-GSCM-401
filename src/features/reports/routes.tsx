import type { RouteObject } from 'react-router-dom';
import { ACCESS } from '@/app/access';
import { lazyPage } from '@/app/lazyPage';

/** Routes for the reports feature, mounted under the staff layout by src/app/routes.tsx. Edit freely. */
export const reportsRoutes: RouteObject[] = [
  { path: 'reports', handle: { roles: ACCESS.manager }, lazy: lazyPage(() => import('./ReportsPage')) },
];

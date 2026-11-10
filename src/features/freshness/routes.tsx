import type { RouteObject } from 'react-router-dom';
import { ACCESS } from '@/app/access';
import { lazyPage } from '@/app/lazyPage';

/** Routes for the freshness feature, mounted under the staff layout by src/app/routes.tsx. Edit freely. */
export const freshnessRoutes: RouteObject[] = [
  { path: 'freshness', handle: { roles: ACCESS.staff }, lazy: lazyPage(() => import('./FreshnessPage')) },
];

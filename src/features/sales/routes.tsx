import type { RouteObject } from 'react-router-dom';
import { ACCESS } from '@/app/access';
import { lazyPage } from '@/app/lazyPage';

/** Routes for the sales feature, mounted under the staff layout by src/app/routes.tsx. Edit freely. */
export const salesRoutes: RouteObject[] = [
  { path: 'sales', handle: { roles: ACCESS.sell }, lazy: lazyPage(() => import('./SalesPage')) },
];

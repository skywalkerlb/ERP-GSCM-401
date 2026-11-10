import type { RouteObject } from 'react-router-dom';
import { ACCESS } from '@/app/access';
import { lazyPage } from '@/app/lazyPage';

/** Routes for the mrp feature, mounted under the staff layout by src/app/routes.tsx. Edit freely. */
export const mrpRoutes: RouteObject[] = [
  { path: 'mrp', handle: { roles: ACCESS.manager }, lazy: lazyPage(() => import('./MrpPage')) },
];

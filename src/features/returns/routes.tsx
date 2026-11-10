import type { RouteObject } from 'react-router-dom';
import { ACCESS } from '@/app/access';
import { lazyPage } from '@/app/lazyPage';

/** Routes for the returns feature, mounted under the staff layout by src/app/routes.tsx. Edit freely. */
export const returnsRoutes: RouteObject[] = [
  { path: 'returns', handle: { roles: ACCESS.sell }, lazy: lazyPage(() => import('./ReturnsPage')) },
];

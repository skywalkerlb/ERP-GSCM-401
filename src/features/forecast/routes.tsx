import type { RouteObject } from 'react-router-dom';
import { ACCESS } from '@/app/access';
import { lazyPage } from '@/app/lazyPage';

/** Routes for the forecast feature, mounted under the staff layout by src/app/routes.tsx. Edit freely. */
export const forecastRoutes: RouteObject[] = [
  { path: 'forecast', handle: { roles: ACCESS.bakery }, lazy: lazyPage(() => import('./ForecastPage')) },
];

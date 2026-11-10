import type { RouteObject } from 'react-router-dom';
import { ACCESS } from '@/app/access';
import { lazyPage } from '@/app/lazyPage';

/** Routes for the labels feature, mounted under the staff layout by src/app/routes.tsx. Edit freely. */
export const labelsRoutes: RouteObject[] = [
  { path: 'inventory/labels', handle: { roles: ACCESS.bakery }, lazy: lazyPage(() => import('./LabelsPage')) },
];

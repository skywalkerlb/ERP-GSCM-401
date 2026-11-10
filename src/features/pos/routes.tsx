import type { RouteObject } from 'react-router-dom';
import { ACCESS } from '@/app/access';
import { lazyPage } from '@/app/lazyPage';

/** Routes for the pos feature, mounted under the staff layout by src/app/routes.tsx. Edit freely. */
export const posRoutes: RouteObject[] = [
  { path: 'pos', handle: { roles: ACCESS.sell }, lazy: lazyPage(() => import('./PosPage')) },
  { path: 'pos/receipt/:id', handle: { roles: ACCESS.sell }, lazy: lazyPage(() => import('./ReceiptPage')) },
];

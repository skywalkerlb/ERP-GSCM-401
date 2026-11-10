import type { RouteObject } from 'react-router-dom';
import { lazyPage } from '@/app/lazyPage';

/**
 * Customer portal pages. Mounted as children of /shop by src/app/routes.tsx, inside the light PortalLayout
 * (which already requires a signed-in user). /shop/login and /shop/signup live in src/app and are not part of this file.
 */
export const portalRoutes: RouteObject[] = [
  { index: true, lazy: lazyPage(() => import('./PortalHomePage')) },
  { path: 'cart', lazy: lazyPage(() => import('./PortalCartPage')) },
  { path: 'orders', lazy: lazyPage(() => import('./PortalOrdersPage')) },
];

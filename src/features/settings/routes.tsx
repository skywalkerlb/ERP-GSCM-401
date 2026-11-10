import type { RouteObject } from 'react-router-dom';
import { ACCESS } from '@/app/access';
import { lazyPage } from '@/app/lazyPage';

/** Routes for the settings feature, mounted under the staff layout by src/app/routes.tsx. Edit freely. */
export const settingsRoutes: RouteObject[] = [
  { path: 'settings', handle: { roles: ACCESS.manager }, lazy: lazyPage(() => import('./SettingsPage')) },
];

import { Navigate, createBrowserRouter, type RouteObject } from 'react-router-dom';
import { APP_BASE_PATH } from '@/lib/appUrl';
import { customersRoutes } from '@/features/customers/routes';
import { dashboardRoutes } from '@/features/dashboard/routes';
import { financeRoutes } from '@/features/finance/routes';
import { forecastRoutes } from '@/features/forecast/routes';
import { freshnessRoutes } from '@/features/freshness/routes';
import { inventoryRoutes } from '@/features/inventory/routes';
import { itemsRoutes } from '@/features/items/routes';
import { labelsRoutes } from '@/features/labels/routes';
import { mrpRoutes } from '@/features/mrp/routes';
import { ordersRoutes } from '@/features/orders/routes';
import { portalRoutes } from '@/features/portal/routes';
import { posRoutes } from '@/features/pos/routes';
import { productionRoutes } from '@/features/production/routes';
import { purchasingRoutes } from '@/features/purchasing/routes';
import { reportsRoutes } from '@/features/reports/routes';
import { returnsRoutes } from '@/features/returns/routes';
import { salesRoutes } from '@/features/sales/routes';
import { settingsRoutes } from '@/features/settings/routes';
import { suppliersRoutes } from '@/features/suppliers/routes';
import { AboutRoute } from './AboutPage';
import PeoplePage from '@/features/people/PeoplePage';
import { ACCESS } from './access';
import { LoginPage, PortalLoginPage, PortalSignupPage, PasswordRecoveryPage, PasswordUpdatePage } from './AuthPages';
import { NotFoundPage } from './NotFoundPage';
import { PortalLayout } from './PortalLayout';
import { StaffLayout } from './AppShell';

/**
 * Every route in the app. Staff screens live under StaffLayout (sidebar and top bar); each feature owns its
 * own routes.tsx and sets `handle: { roles }` to restrict who can open a screen (see src/app/access.ts).
 */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <PasswordRecoveryPage /> },
  { path: '/update-password', element: <PasswordUpdatePage /> },
  { path: '/accept-invite', element: <PasswordUpdatePage /> },
  { path: '/about', element: <AboutRoute /> },
  { path: '/shop/login', element: <PortalLoginPage /> },
  { path: '/shop/signup', element: <PortalSignupPage /> },
  { path: '/shop', element: <PortalLayout />, children: portalRoutes },
  {
    path: '/',
    element: <StaffLayout />,
    children: [
      ...dashboardRoutes,
      ...posRoutes,
      ...salesRoutes,
      ...ordersRoutes,
      ...returnsRoutes,
      ...forecastRoutes,
      ...productionRoutes,
      ...freshnessRoutes,
      // Static inventory paths (labels, transfers...) win over /inventory/:itemId automatically.
      ...inventoryRoutes,
      ...labelsRoutes,
      ...purchasingRoutes,
      ...suppliersRoutes,
      ...mrpRoutes,
      ...reportsRoutes,
      ...financeRoutes,
      ...itemsRoutes,
      ...customersRoutes,
      ...settingsRoutes,
      { path: 'people', element: <PeoplePage />, handle: { roles: ACCESS.people } },
    ],
  },
  { path: '/portal', element: <Navigate to="/shop" replace /> },
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes, { basename: APP_BASE_PATH.replace(/\/$/, '') || '/' });

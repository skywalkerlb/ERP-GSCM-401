import type { IconName } from '@/components/Icon';
import type { AppRole } from '@/hooks/useAuth';
import { ACCESS } from './access';

export interface NavItem {
  /** The route path. Also used as the active-item value. */
  to: string;
  label: string;
  icon: IconName;
  roles: readonly AppRole[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Sidebar, grouped per docs/ARCHITECTURE.md section 6. Items are hidden for roles that cannot open them. */
export const NAV: NavSection[] = [
  {
    title: 'Sell',
    items: [
      { to: '/pos', label: 'Point of sale', icon: 'cart', roles: ACCESS.sell },
      { to: '/sales', label: 'Sales', icon: 'receipt', roles: ACCESS.sell },
      { to: '/orders', label: 'Orders', icon: 'clipboard', roles: ACCESS.sell },
      { to: '/returns', label: 'Returns', icon: 'undo', roles: ACCESS.sell },
    ],
  },
  {
    title: 'Make',
    items: [
      { to: '/forecast', label: 'Forecast and bake plan', icon: 'trendingUp', roles: ACCESS.bakery },
      { to: '/production', label: 'Production', icon: 'factory', roles: ACCESS.bakery },
      { to: '/freshness', label: 'Freshness and waste', icon: 'leaf', roles: ACCESS.staff },
    ],
  },
  {
    title: 'Stock',
    items: [
      { to: '/inventory', label: 'Inventory', icon: 'box', roles: ACCESS.staff },
      { to: '/inventory/transfers', label: 'Transfers', icon: 'swap', roles: ACCESS.staff },
      { to: '/inventory/adjust', label: 'Adjust stock', icon: 'edit', roles: ACCESS.bakery },
      { to: '/inventory/receive', label: 'Receive stock', icon: 'truck', roles: ACCESS.bakery },
      { to: '/inventory/labels', label: 'Barcode Labels', icon: 'tag', roles: ACCESS.bakery }, // ds-exception: User-requested page-name capitalization.
    ],
  },
  {
    title: 'Buy',
    items: [
      { to: '/purchasing', label: 'Purchasing', icon: 'bag', roles: ACCESS.manager },
      { to: '/suppliers', label: 'Suppliers', icon: 'building', roles: ACCESS.manager },
      { to: '/mrp', label: 'Material planning', icon: 'layers', roles: ACCESS.manager },
    ],
  },
  {
    title: 'Insights',
    items: [
      { to: '/', label: 'Dashboard', icon: 'home', roles: ACCESS.manager },
      { to: '/reports', label: 'Reports', icon: 'chart', roles: ACCESS.manager },
      { to: '/finance', label: 'Finance', icon: 'bank', roles: ACCESS.manager },
    ],
  },
  {
    title: 'Setup',
    items: [
      { to: '/items', label: 'Items', icon: 'package', roles: ACCESS.manager },
      { to: '/customers', label: 'Customers', icon: 'users', roles: ACCESS.manager },
      { to: '/people', label: 'People', icon: 'users', roles: ACCESS.people },
      { to: '/settings', label: 'Settings', icon: 'settings', roles: ACCESS.manager },
      { to: '/about', label: 'About this system', icon: 'info', roles: ACCESS.staff },
    ],
  },
];

/** Sections with only the items this role can open. Empty sections are dropped. */
export function navFor(role: AppRole | null): NavSection[] {
  if (!role) return [];
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(role)) })).filter((s) => s.items.length > 0);
}

/** The nav item whose path is the longest match for the current URL. */
export function activeNavPath(pathname: string, sections: NavSection[]): string | undefined {
  let best: string | undefined;
  for (const item of sections.flatMap((s) => s.items)) {
    const hit = item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`);
    if (hit && (!best || item.to.length > best.length)) best = item.to;
  }
  return best;
}

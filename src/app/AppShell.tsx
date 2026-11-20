import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useMatches, useNavigate, Navigate } from 'react-router-dom';
import { RequireRole } from '@/components/RequireRole';
import { SidebarNav } from '@/components/SidebarNav';
import { useAuth } from '@/hooks/useAuth';
import { LocationProvider, useSelectedLocation } from '@/hooks/useLocations';
import { usePresence } from '@/hooks/usePresence';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { homeFor, STAFF_ROLES } from '@/hooks/useRole';
import { cx } from '@/lib/cx';
import { activeNavPath, navFor } from './nav';
import type { RouteHandle } from './access';
import { Topbar } from './Topbar';

/** Sidebar, top bar and content area for signed-in staff. Wrap any staff screen in it. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <LocationProvider>
      <ShellFrame>{children}</ShellFrame>
    </LocationProvider>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const { status } = useRealtimeInvalidation();
  const { locationId, loading: locationsLoading } = useSelectedLocation();
  const { users } = usePresence(locationId);

  const sections = useMemo(() => navFor(profile?.role ?? null), [profile?.role]);
  const active = activeNavPath(pathname, sections);

  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

  return (
    <div className="app">
      <a className="gz-skip" href="#main">
        Skip to content
      </a>
      <aside id="app-sidebar" className={cx('app-sidebar', drawer && 'is-open')}>
        {/* ds-exception: user requested an exclamation point in the sidebar wordmark only. */}
        <SidebarNav
          brand="Glazed!"
          active={active}
          onSelect={(to) => navigate(to)}
          sections={sections.map((s) => ({
            title: s.title,
            items: s.items.map((i) => ({ value: i.to, label: i.label, icon: i.icon, href: i.to })),
          }))}
        />
      </aside>
      <div className={cx('app-scrim', drawer && 'is-open')} onClick={() => setDrawer(false)} aria-hidden="true" />
      <div className="app-main">
        <Topbar onMenu={() => setDrawer(true)} status={status} users={users} />
        <main id="main" className="app-content" tabIndex={-1}>
          {!locationsLoading && locationId === null && <Alert tone="info" title="Add a location to start trading" action={(profile?.role === 'owner' || profile?.role === 'admin') && pathname !== '/settings' ? <Button onClick={() => navigate('/settings')}>Open settings</Button> : undefined}>
            {profile?.role === 'owner' || profile?.role === 'admin' ? 'Create your real shops and kitchens in Settings, then add suppliers, items and opening stock.' : 'Ask an owner or admin to create an active location and assign your shop in People.'}
          </Alert>}
          {children}
        </main>
      </div>
    </div>
  );
}

/** Blocks a route when its `handle.roles` does not include the signed-in role. */
function RouteRoleGate({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const matches = useMatches();
  const role = profile?.role;
  const restrictions = matches.map((m) => (m.handle as RouteHandle | undefined)?.roles).filter((r): r is NonNullable<typeof r> => Boolean(r));
  const allowed = !role || restrictions.every((r) => r.includes(role));
  if (allowed) return <>{children}</>;
  return <Navigate to={homeFor(role)} replace />;
}

/** Layout route for every staff screen: requires a staff sign-in, then checks the route's roles. */
export function StaffLayout() {
  return (
    <RequireRole roles={STAFF_ROLES}>
      <AppShell>
        <RouteRoleGate>
          <Outlet />
        </RouteRoleGate>
      </AppShell>
    </RequireRole>
  );
}

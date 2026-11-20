import { shopPath } from '@/lib/businessContext';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { RequireRole } from '@/components/RequireRole';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { cx } from '@/lib/cx';
import { BusinessSwitcher } from './BusinessSwitcher';
import { ThemeToggle } from './ThemeToggle';

const LINKS: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
  { to: shopPath(''), label: 'Shop', icon: 'store', end: true },
  { to: shopPath('/orders'), label: 'My orders', icon: 'clipboard' },
];

function PortalFrame() {
  const { signOut, profile, user } = useAuth();
  const navigate = useNavigate();
  useRealtimeInvalidation(); // order status changes arrive live, with a toast
  const name = profile?.full_name ?? user?.email ?? '';

  return (
    <div className="portal">
      <a className="gz-skip" href="#main">
        Skip to content
      </a>
      <header className="portal-header">
        <Logo to={shopPath('')} />
        <nav className="portal-nav" aria-label="Shop">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => cx('portal-link', isActive && 'is-active')}>
              <Icon name={l.icon} size={18} />
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="app-topbar__spacer" />
        <NavLink to={shopPath('/cart')} className={({ isActive }) => cx('portal-link', isActive && 'is-active')} aria-label="Cart">
          <Icon name="bag" size={18} />
          <span>Cart</span>
        </NavLink>
        <BusinessSwitcher />
        <ThemeToggle />
        {name && <span className="app-hide-sm gz-muted text-body-sm">{name}</span>}
        <Button
          variant="ghost"
          icon="logout"
          aria-label="Sign out"
          onClick={async () => {
            await signOut();
            navigate(shopPath('/login'), { replace: true });
          }}
        />
      </header>
      <main id="main" className="portal-main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

/** Light layout for the customer portal at /shop. Requires a signed-in user. */
export function PortalLayout() {
  return (
    <RequireRole loginPath={shopPath('/login')}>
      <PortalFrame />
    </RequireRole>
  );
}

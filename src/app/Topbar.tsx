import { useEffect, useState } from 'react';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Select } from '@/components/Select';
import { useSelectedLocation } from '@/hooks/useLocations';
import type { OnlineUser } from '@/hooks/usePresence';
import type { ConnectionStatus } from '@/hooks/useRealtimeInvalidation';
import { OnlineUsers } from './OnlineUsers';
import { QuickSearch } from './QuickSearch';
import { ThemeToggle } from './ThemeToggle';
import { BusinessSwitcher } from './BusinessSwitcher';
import { UserMenu } from './UserMenu';

const STATUS: Record<ConnectionStatus, { tone: 'success' | 'warning' | 'danger'; label: string; hint: string }> = {
  live: { tone: 'success', label: 'Live', hint: 'Updates arrive instantly' },
  connecting: { tone: 'warning', label: 'Connecting', hint: 'Connecting to live updates' },
  offline: { tone: 'danger', label: 'Offline', hint: 'Live updates are paused. Screens refresh every 30 seconds' },
};

export interface TopbarProps {
  onMenu: () => void;
  status: ConnectionStatus;
  users: OnlineUser[];
}

/** Top bar: menu (small screens), location switcher, scan or search, who is online, live status, theme and account. */
export function Topbar({ onMenu, status, users }: TopbarProps) {
  const { locations, locationId, setLocationId } = useSelectedLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const live = STATUS[status];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="app-topbar">
      <Button className="app-menu-btn" variant="ghost" icon="menu" aria-label="Open menu" aria-controls="app-sidebar" onClick={onMenu} />
      {locations.length > 0 && (
        <Select
          className="app-topbar__location"
          aria-label="Location"
          value={locationId ?? ''}
          onChange={(e) => setLocationId(Number(e.target.value))}
          options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
        />
      )}
      <Button className="app-search" icon="scan" aria-label="Scan or search" onClick={() => setSearchOpen(true)}>
        Scan or search
      </Button>
      <div className="app-topbar__spacer" />
      <BusinessSwitcher />
      <OnlineUsers users={users} />
      <span title={live.hint}>
        <Badge tone={live.tone}>{live.label}</Badge>
      </span>
      <ThemeToggle />
      <UserMenu />
      <QuickSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}

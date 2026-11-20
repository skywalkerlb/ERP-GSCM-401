import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import { initials, sentenceCase } from '@/lib/format';

/** Avatar button with a small menu: who you are, and Sign out. */
export function UserMenu() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const name = profile?.full_name ?? user?.email ?? 'Account';

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-user" ref={wrap}>
      <button ref={trigger} type="button" className="app-user__btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu for ${name}`} onClick={() => setOpen((v) => !v)}>
        <span className="app-avatar app-avatar--lg is-me text-caption" aria-hidden="true">
          {initials(name)}
        </span>
        <span className="app-hide-sm text-body-strong">{name}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div className="app-menu" role="menu">
          <div className="app-menu__who">
            <span className="app-avatar app-avatar--lg is-me text-caption" aria-hidden="true">
              {initials(name)}
            </span>
            <div>
              <div className="app-menu__name">{name}</div>
              {profile && <Badge tone="accent">{sentenceCase(profile.role)}</Badge>}
            </div>
          </div>
          <Button variant="ghost" role="menuitem" onClick={() => { setOpen(false); navigate('/create-business'); }}>Create a business</Button>
          <Button variant="ghost" icon="logout" role="menuitem" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      )}
    </div>
  );
}

import { initials } from '@/lib/format';
import { cx } from '@/lib/cx';
import type { OnlineUser } from '@/hooks/usePresence';

const MAX = 4;

/** Stacked avatars for everyone online right now. */
export function OnlineUsers({ users }: { users: OnlineUser[] }) {
  if (users.length === 0) return null;
  const shown = users.slice(0, MAX);
  const extra = users.length - shown.length;
  const names = users.map((u) => (u.isMe ? `${u.name} (you)` : u.name)).join(', ');
  return (
    <div className="app-avatars app-hide-sm" role="group" aria-label={`Online now: ${names}`} title={names}>
      {shown.map((u) => (
        <span key={u.userId} className={cx('app-avatar', 'text-caption', u.isMe && 'is-me')} aria-hidden="true">
          {initials(u.name)}
        </span>
      ))}
      {extra > 0 && (
        <span className="app-avatar text-caption" aria-hidden="true">
          +{extra}
        </span>
      )}
    </div>
  );
}

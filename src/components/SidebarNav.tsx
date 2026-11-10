import type { MouseEvent, ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';

export interface SidebarNavProps {
  brand?: ReactNode;
  active?: string;
  onSelect?: (value: string) => void;
  sections: Array<{
    title?: string;
    items: Array<{ value: string; label: string; icon?: IconName; href?: string; badge?: number | string }>;
  }>;
  className?: string;
}

export function SidebarNav({ brand, active, onSelect, sections, className }: SidebarNavProps) {
  function click(e: MouseEvent<HTMLAnchorElement>, value: string) {
    if (!onSelect) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // keep open-in-new-tab working
    e.preventDefault();
    onSelect(value);
  }
  return (
    <nav className={cx('gz-nav', className)} aria-label="Main">
      {brand && (
        <div className="gz-nav__brand">
          <span className="gz-nav__mark" aria-hidden="true" />
          {brand}
        </div>
      )}
      {sections.map((s, si) => (
        <div key={s.title ?? si} className="gz-nav__section">
          {s.title && <div className="gz-nav__title">{s.title}</div>}
          {s.items.map((it) => {
            const on = it.value === active;
            return (
              <a
                key={it.value}
                href={it.href ?? '#'}
                className={cx('gz-nav__item', on && 'is-active')}
                aria-current={on ? 'page' : undefined}
                onClick={(e) => click(e, it.value)}
              >
                {it.icon && <Icon name={it.icon} size={18} />}
                <span>{it.label}</span>
                {it.badge != null && <span className="gz-nav__badge">{it.badge}</span>}
              </a>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

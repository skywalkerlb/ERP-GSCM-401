import { useRef, useState, type KeyboardEvent } from 'react';
import { cx } from '@/lib/cx';

export interface TabsProps {
  items: Array<{ value: string; label: string; count?: number }>;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  /** Accessible name for the tab list, for example "Order status". */
  'aria-label'?: string;
}

/** Arrow keys, Home and End move between tabs; only the active tab is in the tab order. */
export function Tabs({ items, value, onChange, className, 'aria-label': ariaLabel }: TabsProps) {
  const [inner, setInner] = useState(value ?? items[0]?.value);
  const current = value ?? inner;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function select(v: string) {
    setInner(v);
    onChange?.(v);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const idx = items.findIndex((t) => t.value === current);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % items.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    select(items[next]!.value);
    refs.current[next]?.focus();
  }

  return (
    <div className={cx('gz-tabs', className)} role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {items.map((t, i) => {
        const on = t.value === current;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            className={cx('gz-tab', on && 'is-active')}
            onClick={() => select(t.value)}
          >
            {t.label}
            {t.count != null && <span className="gz-tab__count">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

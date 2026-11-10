import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export interface BadgeProps {
  tone?: 'neutral' | 'success' | 'accent' | 'warning' | 'info' | 'danger';
  dot?: boolean;
  children?: ReactNode;
  className?: string;
}

/** Always include the word: color alone never carries the status. */
export function Badge({ tone = 'neutral', dot, children, className }: BadgeProps) {
  return (
    <span className={cx('gz-badge', `gz-badge--${tone}`, className)}>
      {dot !== false && <span className="gz-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

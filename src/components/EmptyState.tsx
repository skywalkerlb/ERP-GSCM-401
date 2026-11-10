import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';

export interface EmptyStateProps {
  icon?: IconName;
  /** One sentence. A little sweetness is welcome here, never in errors. */
  title: string;
  description?: ReactNode;
  /** A Button, usually primary, to create the first record. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon = 'box', title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx('gz-empty', className)}>
      <span className="gz-empty__icon gz-tint--pink">
        <Icon name={icon} size={22} />
      </span>
      <h2 className="text-h2 gz-empty__title">{title}</h2>
      {description && <p className="text-body gz-empty__desc">{description}</p>}
      {action && <div className="gz-empty__action">{action}</div>}
    </div>
  );
}

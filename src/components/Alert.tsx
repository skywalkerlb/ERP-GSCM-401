import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';

export interface AlertProps {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

const ICONS: Record<NonNullable<AlertProps['tone']>, IconName> = {
  info: 'info',
  success: 'checkCircle',
  warning: 'alert',
  danger: 'alert',
};

export function Alert({ tone = 'info', title, children, action, className }: AlertProps) {
  return (
    <div className={cx('gz-alert', `gz-alert--${tone}`, className)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={ICONS[tone]} size={18} />
      <div className="gz-alert__body">
        {title && <div className="gz-alert__title">{title}</div>}
        {children && <div>{children}</div>}
      </div>
      {action && <div className="gz-alert__action">{action}</div>}
    </div>
  );
}

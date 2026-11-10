import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
  caption?: string;
  icon?: IconName;
  tint?: 'pink' | 'cocoa' | 'mint' | 'butter' | 'lilac';
  className?: string;
}

export function StatCard({ label, value, delta, trend, caption, icon, tint = 'pink', className }: StatCardProps) {
  const up = trend === 'up';
  const down = trend === 'down';
  return (
    <div className={cx('gz-stat', className)}>
      <div className="gz-stat__top">
        <span className="gz-stat__label">{label}</span>
        {icon && (
          <span className={cx('gz-stat__icon', `gz-tint--${tint}`)}>
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
      <div className="gz-stat__value">{value}</div>
      {(delta || caption) && (
        <div className="gz-stat__foot">
          {delta && (
            <span className={cx('gz-delta', up && 'is-up', down && 'is-down')}>
              {(up || down) && <Icon name={up ? 'arrowUp' : 'arrowDown'} size={14} />}
              {delta}
            </span>
          )}
          {caption && <span className="gz-stat__cap">{caption}</span>}
        </div>
      )}
    </div>
  );
}

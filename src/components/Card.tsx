import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Pass false for tables so they run edge to edge. */
  padded?: boolean;
  children?: ReactNode;
  className?: string;
}

export function Card({ title, subtitle, actions, padded, children, className }: CardProps) {
  return (
    <section className={cx('gz-card', padded === false && 'gz-card--flush', className)}>
      {(title || actions) && (
        <header className="gz-card__head">
          <div>
            {title && <h2 className="gz-card__title">{title}</h2>}
            {subtitle && <p className="gz-card__sub">{subtitle}</p>}
          </div>
          {actions && <div className="gz-card__actions">{actions}</div>}
        </header>
      )}
      <div className="gz-card__body">{children}</div>
    </section>
  );
}

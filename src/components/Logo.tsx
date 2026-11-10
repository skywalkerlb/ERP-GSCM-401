import { Link } from 'react-router-dom';
import { cx } from '@/lib/cx';

export interface LogoProps {
  /** Make the logo a link. */
  to?: string;
  className?: string;
}

/**
 * The official Glazed logo: the donut ring mark and the "Glazed" wordmark in Fredoka 600.
 * Built from the same classes as SidebarNav, so it follows the design system everywhere.
 */
export function Logo({ to, className }: LogoProps) {
  const inner = (
    <>
      <span className="gz-nav__mark" aria-hidden="true" />
      Glazed
    </>
  );
  return to ? (
    <Link to={to} className={cx('gz-nav__brand', 'gz-logo', className)} aria-label="Glazed home">
      {inner}
    </Link>
  ) : (
    <span className={cx('gz-nav__brand', 'gz-logo', className)}>{inner}</span>
  );
}

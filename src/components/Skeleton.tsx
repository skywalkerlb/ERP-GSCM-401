import { cx } from '@/lib/cx';

export interface SkeletonProps {
  /** Shape of the block it stands in for. */
  variant?: 'text' | 'title' | 'block' | 'circle';
  /** CSS width such as "60%". Defaults to the full width of the parent. */
  width?: string;
  className?: string;
}

/** Loading placeholder in `surface-sunken`, shaped like the content it replaces. */
export function Skeleton({ variant = 'text', width, className }: SkeletonProps) {
  return <span className={cx('gz-skeleton', `gz-skeleton--${variant}`, className)} style={width ? { width } : undefined} aria-hidden="true" />;
}

/** A few stacked text lines. The last one is shorter. */
export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <span className="gz-skeleton-lines" role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '60%' : undefined} />
      ))}
    </span>
  );
}

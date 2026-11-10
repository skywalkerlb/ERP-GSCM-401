import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export interface ToolbarProps {
  /** Tabs, search and filters on the left. */
  children?: ReactNode;
  /** Export, filter and other actions on the right. */
  end?: ReactNode;
  className?: string;
}

/** The row above a table: Tabs, search and filters on the left, actions on the right. */
export function Toolbar({ children, end, className }: ToolbarProps) {
  return (
    <div className={cx('gz-toolbar', className)} role="toolbar">
      <div className="gz-toolbar__start">{children}</div>
      {end && <div className="gz-toolbar__end">{end}</div>}
    </div>
  );
}

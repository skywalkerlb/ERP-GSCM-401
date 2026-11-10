import { formatNumber } from '@/lib/format';
import { Button } from './Button';

export interface PaginationProps {
  /** Zero-based page index. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** Below a table, right-aligned: "1 to 25 of 340" with Previous and Next. */
export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const last = Math.max(0, Math.ceil(total / pageSize) - 1);
  return (
    <nav className="gz-pagination text-body-sm" aria-label="Pagination">
      <span>
        {formatNumber(from)} to {formatNumber(to)} of {formatNumber(total)}
      </span>
      <Button size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 0}>
        Previous
      </Button>
      <Button size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= last}>
        Next
      </Button>
    </nav>
  );
}

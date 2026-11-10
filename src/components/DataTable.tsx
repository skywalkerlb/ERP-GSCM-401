import { useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon } from './Icon';
import { Skeleton } from './Skeleton';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DataTableColumn<R = any> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  mono?: boolean;
  render?: (row: R) => ReactNode;
  /** Lets people sort by this column. Sorts on the cell value, or on `sortValue(row)` when given. */
  sortable?: boolean;
  sortValue?: (row: R) => string | number | boolean | Date | null | undefined;
}

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DataTableProps<R = any> {
  columns: DataTableColumn<R>[];
  rows: R[];
  rowKey?: string;
  selectedKeys?: Array<string | number>;
  density?: 'default' | 'compact';
  empty?: ReactNode;
  onRowClick?: (row: R) => void;
  /** Controlled sort. Pass with `onSortChange` to sort on the server; rows are then shown as given. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /** Initial sort for an uncontrolled table. */
  defaultSort?: SortState;
  /** Show skeleton rows while data loads. */
  loading?: boolean;
  /** Cap the height at the viewport and scroll inside the table so the header stays visible. Header is sticky either way. */
  scroll?: boolean;
  /** Accessible name for the table. */
  'aria-label'?: string;
  className?: string;
}

const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"], [data-row-ignore]';

function comparable(v: unknown): string | number {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  const s = String(v);
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) ? n : s.toLowerCase();
}

function compare(a: unknown, b: unknown): number {
  const x = comparable(a);
  const y = comparable(b);
  if (x === '' && y !== '') return 1; // empty values sort last
  if (y === '' && x !== '') return -1;
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  return String(x).localeCompare(String(y), 'en', { numeric: true });
}

export function DataTable<R>({
  columns,
  rows,
  rowKey = 'id',
  selectedKeys = [],
  density,
  empty,
  onRowClick,
  sort: sortProp,
  onSortChange,
  defaultSort,
  loading,
  scroll,
  className,
  'aria-label': ariaLabel,
}: DataTableProps<R>) {
  const [innerSort, setInnerSort] = useState<SortState | null>(defaultSort ?? null);
  const controlled = sortProp !== undefined;
  const sort = controlled ? sortProp : innerSort;

  const shown = useMemo(() => {
    if (controlled || !sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = (r: R) => (col.sortValue ? col.sortValue(r) : (r as Record<string, unknown>)[col.key]);
    const sorted = [...rows].sort((a, b) => compare(get(a), get(b)));
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
  }, [rows, columns, sort, controlled]);

  function toggleSort(key: string) {
    let next: SortState | null;
    if (!sort || sort.key !== key) next = { key, dir: 'asc' };
    else if (sort.dir === 'asc') next = { key, dir: 'desc' };
    else next = null;
    if (!controlled) setInnerSort(next);
    onSortChange?.(next);
  }

  const keyOf = (r: R, i: number): string | number => {
    const v = (r as Record<string, unknown>)[rowKey];
    return v !== null && v !== undefined ? (v as string | number) : i;
  };

  function onKeyDown(e: KeyboardEvent<HTMLTableRowElement>, row: R) {
    if (e.target !== e.currentTarget) return; // let buttons and inputs inside the row handle their own keys
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick?.(row);
    }
  }

  function onClick(e: MouseEvent<HTMLTableRowElement>, row: R) {
    if ((e.target as HTMLElement).closest(INTERACTIVE) && e.target !== e.currentTarget) return;
    onRowClick?.(row);
  }

  const clickable = Boolean(onRowClick);

  return (
    <div className={cx('gz-table-wrap', scroll && 'gz-table-wrap--scroll', className)}>
      <table className={cx('gz-table', density === 'compact' && 'gz-table--compact')} aria-label={ariaLabel} aria-busy={loading || undefined}>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key ? sort : null;
              return (
                <th
                  key={c.key}
                  scope="col"
                  style={{ textAlign: c.align ?? 'left', width: c.width }}
                  aria-sort={active ? (active.dir === 'asc' ? 'ascending' : 'descending') : c.sortable ? 'none' : undefined}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      className={cx('gz-th-sort', c.align === 'right' && 'is-right', c.align === 'center' && 'is-center')}
                      onClick={() => toggleSort(c.key)}
                    >
                      {c.header}
                      <Icon name={active?.dir === 'desc' ? 'arrowDown' : 'arrowUp'} size={14} className={cx('gz-th-sort__icon', active && 'is-on')} />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }, (_, i) => (
              <tr key={`sk-${i}`}>
                {columns.map((c) => (
                  <td key={c.key}>
                    <Skeleton />
                  </td>
                ))}
              </tr>
            ))
          ) : shown.length ? (
            shown.map((r, i) => {
              const k = keyOf(r, i);
              return (
                <tr
                  key={k}
                  className={cx(selectedKeys.includes(k) && 'is-selected', clickable && 'is-clickable')}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? (e) => onClick(e, r) : undefined}
                  onKeyDown={clickable ? (e) => onKeyDown(e, r) : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={c.mono ? 'gz-mono' : undefined} style={{ textAlign: c.align ?? 'left' }}>
                      {c.render ? c.render(r) : (((r as Record<string, unknown>)[c.key] as ReactNode) ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })
          ) : (
            <tr>
              <td className="gz-table__empty" colSpan={columns.length}>
                {empty ?? 'Nothing here yet.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

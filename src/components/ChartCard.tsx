import { useState, type ReactElement, type ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { cx } from '@/lib/cx';
import { Button } from './Button';
import { Card } from './Card';
import { DataTable, type DataTableColumn } from './DataTable';

export interface ChartCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** A Tabs or Select for the range or grouping, shown at the top right. */
  controls?: ReactNode;
  /** A visible total or one-line takeaway, so meaning never depends on color alone. */
  summary?: ReactNode;
  /** The Recharts chart (BarChart, LineChart, AreaChart, PieChart...). It is wrapped in a ResponsiveContainer. */
  children: ReactNode;
  height?: 'sm' | 'md' | 'lg';
  /** A text equivalent of the data. When given, a "View as table" button appears and the chart is hidden from screen readers. */
  table?: { columns: DataTableColumn[]; rows: unknown[]; rowKey?: string };
  /** Shown instead of the chart when there is nothing to plot. */
  empty?: ReactNode;
  loading?: boolean;
  className?: string;
}

/** A Card that holds a chart styled with the --chart-* tokens (see charts.tsx for axis, grid and tooltip helpers). */
export function ChartCard({ title, subtitle, controls, summary, children, height = 'md', table, empty, loading, className }: ChartCardProps) {
  const [asTable, setAsTable] = useState(false);
  const actions = (
    <>
      {table && !empty && (
        <Button variant="ghost" size="sm" icon={asTable ? 'chart' : 'file'} onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? 'View as chart' : 'View as table'}
        </Button>
      )}
      {controls}
    </>
  );
  return (
    <Card title={title} subtitle={subtitle} actions={actions} className={cx('gz-chartcard', className)}>
      {summary && <div className="gz-chartcard__summary text-body-strong">{summary}</div>}
      {loading ? (
        <div className={cx('gz-chart', `gz-chart--${height}`, 'gz-chart--loading')} role="status" aria-label="Loading chart" />
      ) : empty ? (
        <div className={cx('gz-chart', `gz-chart--${height}`, 'gz-chart--empty')}>{empty}</div>
      ) : asTable && table ? (
        <DataTable columns={table.columns} rows={table.rows} rowKey={table.rowKey} density="compact" scroll />
      ) : (
        <div className={cx('gz-chart', `gz-chart--${height}`, 'text-caption')} aria-hidden={table ? true : undefined}>
          <ResponsiveContainer width="100%" height="100%">
            {children as ReactElement}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

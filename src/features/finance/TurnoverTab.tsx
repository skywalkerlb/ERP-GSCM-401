import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { axisProps, chartColor, ChartTooltip, gridProps } from '@/components/charts';
import { ChartCard } from '@/components/ChartCard';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { Select } from '@/components/Select';
import { StatCard } from '@/components/StatCard';
import { Toolbar } from '@/components/Toolbar';
import { MoneyCell } from '@/components/cells';
import { downloadCsv, type CsvColumn } from '@/features/reports/csv';
import { rangeForPreset, ReportFilters, type DateRange, type RangePreset } from '@/features/reports/ReportFilters';
import { daysBetween, formatMoney, formatNumber } from '@/lib/format';
import { rpcErrorMessage } from '@/lib/rpc';
import { useTurnover } from './api';
import { HowCalculated } from './HowCalculated';

type GroupBy = 'item' | 'category';

interface TurnRow {
  key: string;
  label: string;
  sub: string;
  cogs: number;
  avg_inventory: number;
  turnover: number | null;
  days_on_hand: number | null;
}

export function TurnoverTab() {
  const [preset, setPreset] = useState<RangePreset>('90d');
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('90d')!);
  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  const q = useTurnover(range);
  const days = daysBetween(range.from, range.to) + 1;

  const total = (q.data ?? []).find((r) => r.item_id === null);
  const rows: TurnRow[] = useMemo(() => {
    const items = (q.data ?? []).filter((r) => r.item_id !== null);
    if (groupBy === 'item') {
      return items.map((r) => ({ key: String(r.item_id), label: r.name, sub: r.sku, cogs: r.cogs, avg_inventory: r.avg_inventory, turnover: r.turnover, days_on_hand: r.days_on_hand }));
    }
    const map = new Map<string, { cogs: number; inv: number }>();
    for (const r of items) {
      const k = r.category ?? 'Uncategorized';
      const g = map.get(k) ?? { cogs: 0, inv: 0 };
      g.cogs += r.cogs;
      g.inv += r.avg_inventory;
      map.set(k, g);
    }
    return [...map.entries()].map(([k, g]) => {
      const turn = g.inv > 0 ? g.cogs / g.inv : null;
      return { key: k, label: k, sub: '', cogs: g.cogs, avg_inventory: g.inv, turnover: turn, days_on_hand: turn && turn > 0 ? days / turn : null };
    });
  }, [q.data, groupBy, days]);

  const columns: DataTableColumn<TurnRow>[] = [
    { key: 'label', header: groupBy === 'item' ? 'Item' : 'Category', sortable: true, render: (r) => <>{r.label}{r.sub && <> <span className="gz-mono gz-muted">{r.sub}</span></>}</> },
    { key: 'cogs', header: 'Cost of goods', align: 'right', sortable: true, render: (r) => <MoneyCell value={r.cogs} /> },
    { key: 'avg_inventory', header: 'Average inventory', align: 'right', sortable: true, render: (r) => <MoneyCell value={r.avg_inventory} /> },
    { key: 'turnover', header: 'Turns', align: 'right', sortable: true, render: (r) => formatNumber(r.turnover, 2) },
    { key: 'days_on_hand', header: 'Days on hand', align: 'right', sortable: true, render: (r) => formatNumber(r.days_on_hand, 1) },
  ];
  const csv: CsvColumn<TurnRow>[] = [
    { header: groupBy, value: (r) => r.label },
    { header: 'SKU', value: (r) => r.sub },
    { header: 'Cost of goods', value: (r) => r.cogs },
    { header: 'Average inventory', value: (r) => r.avg_inventory },
    { header: 'Turns', value: (r) => r.turnover },
    { header: 'Days on hand', value: (r) => r.days_on_hand },
  ];
  const chartRows = [...rows].filter((r) => r.days_on_hand !== null).sort((a, b) => (b.cogs - a.cogs)).slice(0, 10);
  const annual = total?.turnover ? total.turnover * (365 / days) : null;

  return (
    <div className="gz-stack gz-stack--sm">
      <HowCalculated>
        Turnover is cost of goods sold divided by average inventory, and days on hand is the days in the range divided by turnover. The company total uses GL 5000
        for cost of goods and the average of the GL 1200 balance before and at the end of the range. Item and category rows use the stock ledger (sales, returns and
        production issues), so they will not add up exactly to the total.
      </HowCalculated>
      <Toolbar end={<Button variant="secondary" icon="download" disabled={rows.length === 0} onClick={() => downloadCsv(`inventory-turnover-${range.from}-to-${range.to}`, csv, rows)}>Export CSV</Button>}>
        <div className="ins-filters">
          <ReportFilters preset={preset} range={range} onRangeChange={(p, r) => { setPreset(p); setRange(r); }} />
          <Select label="Group by" value={groupBy} options={[{ value: 'category', label: 'Category' }, { value: 'item', label: 'Item' }]} onChange={(e) => setGroupBy(e.target.value as GroupBy)} />
        </div>
      </Toolbar>
      {q.isError && <Alert tone="danger" title="Could not load turnover">{rpcErrorMessage(q.error)} Refresh the page to try again.</Alert>}
      <div className="gz-grid-stats">
        <StatCard label="Turnover" icon="refresh" value={formatNumber(total?.turnover, 2)} caption={`turns in ${days} days`} />
        <StatCard label="Annualized turnover" icon="trendingUp" tint="mint" value={formatNumber(annual, 1)} caption="turns per year at this pace" />
        <StatCard label="Days on hand" icon="clock" tint="lilac" value={formatNumber(total?.days_on_hand, 1)} caption="of cost of goods in stock" />
        <StatCard label="Average inventory" icon="box" tint="cocoa" value={formatMoney(total?.avg_inventory)} caption={`${formatMoney(total?.cogs)} cost of goods`} />
      </div>
      <ChartCard
        title="Days on hand"
        subtitle={groupBy === 'item' ? 'The ten items with the most cost of goods.' : 'By category.'}
        loading={q.isLoading}
        height="sm"
        empty={chartRows.length === 0 && !q.isLoading ? 'No sales or stock movement in this range.' : undefined}
        table={{ columns, rows, rowKey: 'key' }}
      >
        <BarChart data={chartRows}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval={0} angle={groupBy === 'item' ? -20 : 0} textAnchor={groupBy === 'item' ? 'end' : 'middle'} height={groupBy === 'item' ? 64 : 30} />
          <YAxis {...axisProps} />
          <Tooltip content={<ChartTooltip valueFormatter={(v) => `${formatNumber(Number(v), 1)} days`} />} cursor={{ fill: 'var(--surface-hover)' }} />
          <Bar dataKey="days_on_hand" name="Days on hand" fill={chartColor(1)} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>
      <DataTable columns={columns} rows={rows} rowKey="key" loading={q.isLoading} density="compact" aria-label="Inventory turnover" defaultSort={{ key: 'cogs', dir: 'desc' }} empty="No movement in this range." />
    </div>
  );
}

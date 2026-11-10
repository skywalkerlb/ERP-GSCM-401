import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { axisProps, chartColor, ChartTooltip, gridProps } from '@/components/charts';
import { ChartCard } from '@/components/ChartCard';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatCard } from '@/components/StatCard';
import { Toolbar } from '@/components/Toolbar';
import { MoneyCell } from '@/components/cells';
import { downloadCsv, type CsvColumn } from '@/features/reports/csv';
import { previousRange, rangeForPreset, ReportFilters, type DateRange, type RangePreset } from '@/features/reports/ReportFilters';
import { formatDate, formatMoney, formatNumber, formatPct } from '@/lib/format';
import { rpcErrorMessage } from '@/lib/rpc';
import type { PnlLine } from '@/types/domain';
import { usePnl } from './api';
import { HowCalculated } from './HowCalculated';

interface PnlRow {
  key: string;
  label: string;
  account_code: string | null;
  line_type: PnlLine['line_type'];
  cur: number | null;
  prev: number | null;
}

const compactMoney = (v: number | string) => formatMoney(Number(v), { compact: true });

function change(row: PnlRow): { abs: number | null; pct: number | null } {
  if (row.cur === null || row.prev === null) return { abs: null, pct: null };
  const abs = row.cur - row.prev;
  return { abs, pct: row.line_type !== 'pct' && row.prev !== 0 ? abs / Math.abs(row.prev) : null };
}

export function PnlTab() {
  const [preset, setPreset] = useState<RangePreset>('mtd');
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('mtd')!);
  const [locationId, setLocationId] = useState('');
  const prevRange = useMemo(() => previousRange(range), [range]);
  const cur = usePnl(range, locationId, 'current');
  const prev = usePnl(prevRange, locationId, 'previous');
  const loading = cur.isLoading || prev.isLoading;

  const rows: PnlRow[] = useMemo(() => {
    const prevMap = new Map((prev.data ?? []).map((l) => [l.line_key, l.amount]));
    return (cur.data ?? []).map((l) => ({
      key: l.line_key, label: l.label, account_code: l.account_code, line_type: l.line_type, cur: l.amount, prev: prevMap.get(l.line_key) ?? null,
    }));
  }, [cur.data, prev.data]);
  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  const journalLink = (code: string) => `/finance?tab=journal&account=${code}&from=${range.from}&to=${range.to}`;
  const money = (row: PnlRow, v: number | null) => {
    if (v === null) return '—';
    if (row.line_type === 'pct') return formatPct(v, 1, { scale: 'percent' });
    const strong = row.line_type === 'subtotal' || row.line_type === 'total';
    return <MoneyCell value={v} strong={strong} />;
  };
  const columns: DataTableColumn<PnlRow>[] = [
    {
      key: 'label', header: 'Line',
      render: (r) => (r.line_type === 'subtotal' || r.line_type === 'total' ? <strong>{r.label}</strong> : r.line_type === 'pct' ? <em>{r.label}</em> : r.label),
    },
    {
      key: 'account_code', header: 'Account', mono: true,
      render: (r) => (r.account_code ? <Link className="ins-link" to={journalLink(r.account_code)} title="See the journal entries behind this line">{r.account_code}</Link> : ''),
    },
    { key: 'cur', header: `${formatDate(range.from)} to ${formatDate(range.to)}`, align: 'right', render: (r) => money(r, r.cur) },
    { key: 'prev', header: `Previous: ${formatDate(prevRange.from)} to ${formatDate(prevRange.to)}`, align: 'right', render: (r) => money(r, r.prev) },
    {
      key: 'change', header: 'Change', align: 'right',
      render: (r) => {
        const c = change(r);
        if (c.abs === null) return '—';
        if (r.line_type === 'pct') return `${c.abs > 0 ? '+' : ''}${formatNumber(c.abs, 1)} pts`;
        return `${c.abs > 0 ? '+' : ''}${formatMoney(c.abs)}${c.pct !== null ? ` (${c.pct > 0 ? '+' : ''}${formatPct(c.pct, 0)})` : ''}`;
      },
    },
  ];
  const csv: CsvColumn<PnlRow>[] = [
    { header: 'Line', value: (r) => r.label },
    { header: 'Account', value: (r) => r.account_code },
    { header: `${range.from} to ${range.to}`, value: (r) => r.cur },
    { header: `${prevRange.from} to ${prevRange.to}`, value: (r) => r.prev },
  ];

  const stat = (key: string) => byKey.get(key);
  const delta = (key: string, kind: 'pct' | 'money') => {
    const r = stat(key);
    if (!r || r.cur === null || r.prev === null) return {};
    const d = r.cur - r.prev;
    const trend = d > 0 ? ('up' as const) : d < 0 ? ('down' as const) : ('flat' as const);
    if (kind === 'pct') return { delta: `${d > 0 ? '+' : ''}${formatNumber(d, 1)} pts`, trend };
    const p = r.prev !== 0 ? ` (${formatPct(Math.abs(d / r.prev), 0)})` : '';
    return { delta: `${d > 0 ? '+' : d < 0 ? '-' : ''}${formatMoney(Math.abs(d))}${p}`, trend };
  };
  const chartKeys = [['net_sales', 'Net sales'], ['total_costs', 'Costs and losses'], ['gross_profit', 'Gross profit'], ['total_opex', 'Operating expenses'], ['operating_income', 'Operating income']] as const;
  const chartData = chartKeys.map(([k, name]) => ({ name, current: stat(k)?.cur ?? 0, previous: stat(k)?.prev ?? 0 }));
  const noSales = !loading && (stat('gross_sales')?.cur ?? 0) === 0 && (stat('total_opex')?.cur ?? 0) === 0;

  return (
    <div className="gz-stack gz-stack--sm">
      <HowCalculated>
        Gross sales (GL 4000) less returns (4100) and discounts (4200) is net sales. Cost of goods (5000), waste (5100), quality returns (5150), scrap (5200) and
        stock adjustments (5300) come off to give gross profit; operating expenses (6xxx) then give operating income. Every line adds up journal lines by posting
        date, and the previous period is the same number of days just before. Click an account number to see its journal entries.
        {locationId ? ' With a location chosen, only journal lines tagged to that location count, so expenses recorded without a location are left out.' : ''}
      </HowCalculated>
      <Toolbar end={<Button variant="secondary" icon="download" disabled={rows.length === 0} onClick={() => downloadCsv(`pnl-${range.from}-to-${range.to}`, csv, rows)}>Export CSV</Button>}>
        <div className="ins-filters">
          <ReportFilters
            preset={preset}
            range={range}
            onRangeChange={(p, r) => {
              setPreset(p);
              setRange(r);
            }}
            locationId={locationId}
            onLocationChange={setLocationId}
          />
        </div>
      </Toolbar>
      {(cur.isError || prev.isError) && <Alert tone="danger" title="Could not load the P&L">{rpcErrorMessage(cur.error ?? prev.error)} Refresh the page to try again.</Alert>}
      <div className="gz-grid-stats">
        <StatCard label="Net sales" icon="money" value={formatMoney(stat('net_sales')?.cur)} caption="vs previous period" {...delta('net_sales', 'money')} />
        <StatCard label="Gross profit" icon="trendingUp" tint="mint" value={formatMoney(stat('gross_profit')?.cur)} caption="vs previous period" {...delta('gross_profit', 'money')} />
        <StatCard label="Gross margin" icon="chart" tint="lilac" value={formatPct(stat('gross_margin_pct')?.cur, 1, { scale: 'percent' })} caption="vs previous period" {...delta('gross_margin_pct', 'pct')} />
        <StatCard label="Operating income" icon="bank" tint="cocoa" value={formatMoney(stat('operating_income')?.cur)} caption="vs previous period" {...delta('operating_income', 'money')} />
      </div>
      <ChartCard
        title="This period against the previous period"
        loading={loading}
        height="sm"
        empty={noSales ? 'No journal activity in this range.' : undefined}
        summary={`Operating income ${formatMoney(stat('operating_income')?.cur)} on net sales of ${formatMoney(stat('net_sales')?.cur)}`}
        table={{
          columns: [
            { key: 'name', header: 'Line' },
            { key: 'current', header: 'This period', align: 'right', render: (r: { current: number }) => formatMoney(r.current) },
            { key: 'previous', header: 'Previous period', align: 'right', render: (r: { previous: number }) => formatMoney(r.previous) },
          ],
          rows: chartData,
          rowKey: 'name',
        }}
      >
        <BarChart data={chartData}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="name" {...axisProps} interval={0} />
          <YAxis {...axisProps} tickFormatter={compactMoney} />
          <Tooltip content={<ChartTooltip valueFormatter={(v) => formatMoney(Number(v))} />} cursor={{ fill: 'var(--surface-hover)' }} />
          <Legend />
          <Bar dataKey="current" name="This period" fill={chartColor(0)} radius={[4, 4, 0, 0]} />
          <Bar dataKey="previous" name="Previous period" fill={chartColor(1)} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>
      <DataTable columns={columns} rows={rows} rowKey="key" loading={loading} aria-label="Profit and loss" />
    </div>
  );
}

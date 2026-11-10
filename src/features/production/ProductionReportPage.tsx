import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis, BarChart } from 'recharts';
import {
  Alert, Badge, Button, Card, ChartCard, ChartTooltip, DataTable, DocNo, EmptyState, MoneyCell, PageHeader, QtyCell, Skeleton, StatCard,
  Tabs, TextField, axisProps, chartColor, gridProps, type DataTableColumn,
} from '@/components';
import { addDays, businessDate, formatDate, formatMoney, formatNumber, formatPct, formatDateTime } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { reports, rpcErrorMessage } from '@/lib/rpc';
import type { ProductionReport } from '@/types/domain';
import { formatDuration } from './api';

type ReportOrder = ProductionReport['orders'][number];
type ReportItem = ProductionReport['by_item'][number];
type ReportDay = ProductionReport['by_day'][number];

export default function ProductionReportPage() {
  const navigate = useNavigate();
  const today = businessDate();
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [pareto, setPareto] = useState<'scrap' | 'rework'>('scrap');
  const valid = Boolean(from) && Boolean(to) && from <= to;

  const q = useQuery({
    queryKey: queryKeys.reports.scope('production', { from, to }),
    enabled: valid,
    queryFn: () => reports.productionReport({ from, to }),
  });
  const r = q.data;
  const s = r?.summary;

  const orderCols: DataTableColumn<ReportOrder>[] = [
    { key: 'mo_number', header: 'Order', sortable: true, render: (o) => <Link className="gz-link" to={`/production/${o.mo_id}`}><DocNo value={o.mo_number} /></Link> },
    { key: 'name', header: 'Item', sortable: true },
    { key: 'finished_at', header: 'Finished', sortable: true, render: (o) => formatDateTime(o.finished_at) },
    { key: 'qty_planned', header: 'Planned', align: 'right', render: (o) => <QtyCell qty={o.qty_planned} /> },
    { key: 'qty_good', header: 'Good', align: 'right', render: (o) => <QtyCell qty={o.qty_good} strong /> },
    { key: 'qty_scrapped', header: 'Scrap', align: 'right', render: (o) => formatNumber(o.qty_scrapped) },
    { key: 'yield', header: 'Yield', align: 'right', sortable: true, render: (o) => formatPct(o.yield) },
    { key: 'cycle_hours', header: 'Cycle time', align: 'right', sortable: true, render: (o) => formatDuration(o.cycle_hours) },
    { key: 'cost_per_dozen', header: 'Cost / dozen', align: 'right', sortable: true, render: (o) => <MoneyCell value={o.cost_per_dozen} /> },
    { key: 'on_time', header: 'On time', render: (o) => (o.on_time ? <Badge tone="success">On time</Badge> : <Badge tone="warning">Late</Badge>) },
  ];

  const itemCols: DataTableColumn<ReportItem>[] = [
    { key: 'name', header: 'Item', sortable: true },
    { key: 'orders', header: 'Orders', align: 'right', sortable: true },
    { key: 'qty_good', header: 'Good', align: 'right', sortable: true, render: (o) => <QtyCell qty={o.qty_good} /> },
    { key: 'qty_scrapped', header: 'Scrap', align: 'right', sortable: true, render: (o) => formatNumber(o.qty_scrapped) },
    { key: 'yield', header: 'Yield', align: 'right', sortable: true, render: (o) => formatPct(o.yield) },
    { key: 'scrap_rate', header: 'Scrap rate', align: 'right', sortable: true, render: (o) => formatPct(o.scrap_rate) },
    { key: 'first_pass_yield', header: 'First-pass yield', align: 'right', sortable: true, render: (o) => formatPct(o.first_pass_yield) },
    { key: 'schedule_attainment', header: 'Schedule attainment', align: 'right', sortable: true, render: (o) => formatPct(o.schedule_attainment) },
    { key: 'cost_per_dozen', header: 'Cost / dozen', align: 'right', sortable: true, render: (o) => <MoneyCell value={o.cost_per_dozen} /> },
  ];

  const dayCols: DataTableColumn<ReportDay>[] = [
    { key: 'date', header: 'Day', sortable: true, render: (d) => formatDate(d.date) },
    { key: 'orders', header: 'Orders', align: 'right' },
    { key: 'qty_started', header: 'Started', align: 'right', render: (d) => formatNumber(d.qty_started) },
    { key: 'qty_good', header: 'Good', align: 'right', render: (d) => formatNumber(d.qty_good) },
    { key: 'qty_scrapped', header: 'Scrap', align: 'right', render: (d) => formatNumber(d.qty_scrapped) },
    { key: 'yield', header: 'Yield', align: 'right', render: (d) => formatPct(d.yield) },
  ];

  const paretoRows = (pareto === 'scrap' ? r?.scrap_pareto : r?.rework_pareto) ?? [];
  const paretoData = paretoRows.map((p) => ({
    reason: p.label ?? p.reason_code, qty: Number(p.qty), cum: p.cum_pct === null ? null : Number(p.cum_pct) * 100,
  }));
  const dayData = (r?.by_day ?? []).map((d) => ({
    date: d.date, good: Number(d.qty_good), scrap: Number(d.qty_scrapped), yield: d.yield === null ? null : Number(d.yield) * 100,
  }));
  const topScrap = paretoRows[0];

  return (
    <div className="gz-stack">
      <PageHeader
        title="Production report"
        breadcrumb={[{ label: 'Make' }, { label: 'Production', to: '/production' }, { label: 'Production report' }]}
        subtitle="Yield, scrap and schedule attainment from completed production orders."
        actions={<Button icon="factory" onClick={() => navigate('/production')}>Production orders</Button>}
      />

      <div className="gz-row" style={{ alignItems: 'end' }}>
        <TextField label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="To" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
        <Button onClick={() => { setFrom(addDays(today, -6)); setTo(today); }}>Last 7 days</Button>
        <Button onClick={() => { setFrom(addDays(today, -29)); setTo(today); }}>Last 30 days</Button>
        <Button onClick={() => { setFrom(addDays(today, -89)); setTo(today); }}>Last 90 days</Button>
      </div>

      {!valid && <Alert tone="warning" title="Check the dates">The start date must be on or before the end date.</Alert>}
      {q.error && <Alert tone="danger" title="Could not load the report">{rpcErrorMessage(q.error)}</Alert>}

      {q.isLoading && (
        <div className="gz-grid-stats">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} variant="block" />)}
        </div>
      )}

      {r && s && s.orders === 0 && (
        <EmptyState icon="factory" title="No completed orders in this range" description="Pick a longer range, or complete a production order to see it here." />
      )}

      {r && s && s.orders > 0 && (
        <>
          <div className="gz-grid-stats">
            <StatCard label="Yield" icon="checkCircle" tint="mint" value={formatPct(s.yield)} caption="Good units divided by units started" />
            <StatCard label="Scrap rate" icon="alert" tint="butter" value={formatPct(s.scrap_rate)} caption="Scrapped units divided by units started" />
            <StatCard label="First-pass yield" icon="sparkles" tint="lilac" value={formatPct(s.first_pass_yield)} caption="(Good minus reworked) divided by started" />
            <StatCard label="Schedule attainment" icon="calendar" tint="cocoa" value={formatPct(s.schedule_attainment)} caption="Good units divided by units planned" />
            <StatCard label="On-time completion" icon="clock" tint="mint" value={formatPct(s.on_time_rate)} caption="Orders finished on or before the due date" />
            <StatCard label="Avg cycle time" icon="refresh" tint="lilac" value={formatDuration(s.avg_cycle_hours)} caption="Average of finish time minus start time" />
            <StatCard label="Cost per dozen" icon="money" tint="pink" value={formatMoney(s.cost_per_dozen)} caption="12 x ingredients issued divided by good units" />
            <StatCard label="Orders completed" icon="factory" tint="cocoa" value={formatNumber(s.orders)} caption={`${formatNumber(s.qty_good)} good of ${formatNumber(s.qty_started)} started`} />
          </div>

          <div className="gz-grid-2">
            <ChartCard
              title={pareto === 'scrap' ? 'Scrap reasons (Pareto)' : 'Rework reasons (Pareto)'}
              subtitle="Bars are units, the line is the cumulative share."
              controls={<Tabs aria-label="Defect type" items={[{ value: 'scrap', label: 'Scrap' }, { value: 'rework', label: 'Rework' }]} value={pareto} onChange={(v) => setPareto(v as 'scrap' | 'rework')} />}
              summary={topScrap ? `${topScrap.label ?? topScrap.reason_code} is the top ${pareto} reason at ${formatPct(topScrap.pct)} of units.` : undefined}
              empty={paretoRows.length === 0 ? `No ${pareto} logged in this range.` : undefined}
              table={{
                columns: [
                  { key: 'reason', header: 'Reason' },
                  { key: 'qty', header: 'Units', align: 'right', render: (p: (typeof paretoData)[number]) => formatNumber(p.qty) },
                  { key: 'cum', header: 'Cumulative', align: 'right', render: (p: (typeof paretoData)[number]) => (p.cum === null ? '—' : `${formatNumber(p.cum, 1)}%`) },
                ],
                rows: paretoData,
                rowKey: 'reason',
              }}
            >
              <ComposedChart data={paretoData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="reason" {...axisProps} interval={0} />
                <YAxis yAxisId="qty" {...axisProps} allowDecimals={false} />
                <YAxis yAxisId="cum" orientation="right" domain={[0, 100]} unit="%" {...axisProps} />
                <Tooltip content={<ChartTooltip valueFormatter={(v, n) => (n === 'Cumulative share' ? `${formatNumber(Number(v), 1)}%` : formatNumber(Number(v)))} />} />
                <Legend />
                <Bar yAxisId="qty" dataKey="qty" name="Units" fill={chartColor(0)} radius={[4, 4, 0, 0]} />
                <Line yAxisId="cum" dataKey="cum" name="Cumulative share" stroke={chartColor(1)} strokeWidth={2} dot />
              </ComposedChart>
            </ChartCard>

            <ChartCard
              title="Output by day"
              subtitle="Good and scrapped units from orders finished each day."
              summary={`${formatNumber(s.qty_good)} good and ${formatNumber(s.qty_scrapped)} scrapped over ${dayData.length} ${dayData.length === 1 ? 'day' : 'days'}.`}
              table={{ columns: dayCols, rows: r.by_day, rowKey: 'date' }}
            >
              <BarChart data={dayData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} tickFormatter={(d: string) => formatDate(d).replace(/, \d{4}$/, '')} minTickGap={24} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => formatNumber(Number(v))} labelFormatter={(l) => formatDate(String(l))} />} />
                <Legend />
                <Bar dataKey="good" name="Good" stackId="out" fill={chartColor(2)} />
                <Bar dataKey="scrap" name="Scrap" stackId="out" fill={chartColor(0)} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
          </div>

          <Card title="By item" padded={false}>
            <DataTable columns={itemCols} rows={r.by_item} rowKey="item_id" defaultSort={{ key: 'qty_good', dir: 'desc' }} density="compact" aria-label="Production by item" />
          </Card>

          <Card title="By day" padded={false}>
            <DataTable columns={dayCols} rows={r.by_day} rowKey="date" defaultSort={{ key: 'date', dir: 'desc' }} density="compact" aria-label="Production by day" />
          </Card>

          <Card title="Completed orders" subtitle={`${formatNumber(r.orders.length)} orders finished between ${formatDate(from)} and ${formatDate(to)}.`} padded={false}>
            <DataTable columns={orderCols} rows={r.orders} rowKey="mo_id" defaultSort={{ key: 'finished_at', dir: 'desc' }} scroll aria-label="Completed production orders" />
          </Card>
        </>
      )}
    </div>
  );
}

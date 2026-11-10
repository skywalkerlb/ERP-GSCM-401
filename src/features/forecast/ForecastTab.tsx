import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Alert, Badge, Button, Card, ChartCard, ChartTooltip, DataTable, EmptyState, Select, StatCard, TextField, axisProps, chartColor,
  gridProps, useToast, type DataTableColumn,
} from '@/components';
import { useLocations } from '@/hooks/useLocations';
import { useRole } from '@/hooks/useRole';
import { addDays, businessDate, formatDate, formatDateTime, formatNumber, formatPct, formatWeekday } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { rpc, rpcErrorMessage } from '@/lib/rpc';
import { invalidateMake } from '@/features/production/api';
import { canCall } from '@/types/domain';
import { getActualVsForecast, getForecastForDate, type ForecastRow } from './api';

const times = (n: number, digits = 2) => `×${n.toFixed(digits)}`;
type Row = ForecastRow & { rowId: string };

export function ForecastTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { role } = useRole();
  const { data: locations = [] } = useLocations();
  const shops = locations.filter((l) => l.kind === 'shop');
  const shopName = (id: number) => locations.find((l) => l.id === id)?.name ?? `Location ${id}`;

  const today = businessDate();
  const [date, setDate] = useState(addDays(today, 1));
  const [horizon, setHorizon] = useState('14');
  const [shopFilter, setShopFilter] = useState('all');
  const [itemSel, setItemSel] = useState('');
  const [shopSel, setShopSel] = useState('');

  const fc = useQuery({
    queryKey: queryKeys.forecast.scope('date', { date }),
    queryFn: () => getForecastForDate(date),
  });

  const generate = useMutation({
    mutationFn: () => rpc.generateForecast({ as_of: today, start: today, days: Number(horizon) }),
    onSuccess: () => {
      invalidateMake(qc);
      toast.success('Forecast refreshed', `Demand for the next ${horizon} days is ready.`);
    },
    onError: (e) => toast.error('Could not generate the forecast', rpcErrorMessage(e)),
  });

  const rows = useMemo(() => {
    const all: Row[] = (fc.data?.rows ?? []).map((r) => ({ ...r, rowId: `${r.item_id}-${r.location_id}` }));
    return all
      .filter((r) => shopFilter === 'all' || String(r.location_id) === shopFilter)
      .sort((a, b) => (a.items?.name ?? '').localeCompare(b.items?.name ?? '') || shopName(a.location_id).localeCompare(shopName(b.location_id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fc.data, shopFilter, locations]);

  const totalUnits = rows.reduce((s, r) => s + Number(r.qty), 0);
  const promoRows = rows.filter((r) => Number(r.promo_lift) > 1);
  const byShop = new Map<number, number>();
  for (const r of rows) byShop.set(r.location_id, (byShop.get(r.location_id) ?? 0) + Number(r.qty));
  const topShop = [...byShop.entries()].sort((a, b) => b[1] - a[1])[0];

  // Selected item and shop for the history chart default to the biggest forecast line.
  const biggest = [...(fc.data?.rows ?? [])].sort((a, b) => Number(b.qty) - Number(a.qty))[0];
  const itemId = Number(itemSel || biggest?.item_id || 0);
  const locId = Number(shopSel || biggest?.location_id || shops[0]?.id || 0);
  const itemOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of fc.data?.rows ?? []) if (!seen.has(r.item_id)) seen.set(r.item_id, r.items?.name ?? `Item ${r.item_id}`);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value: String(value), label }));
  }, [fc.data]);

  const histFrom = addDays(today, -56);
  const histTo = addDays(today, -1);
  const series = useQuery({
    queryKey: queryKeys.forecast.scope('series', { itemId, locId, histFrom }),
    enabled: itemId > 0 && locId > 0,
    queryFn: () => getActualVsForecast(itemId, locId, histFrom, histTo),
  });
  const points = series.data ?? [];
  const scored = points.filter((p) => p.forecast !== null);
  const sumA = scored.reduce((s, p) => s + p.actual, 0);
  const wape = sumA > 0 ? scored.reduce((s, p) => s + Math.abs(p.actual - (p.forecast ?? 0)), 0) / sumA : null;

  const columns: DataTableColumn<Row>[] = [
    { key: 'item', header: 'Item', sortable: true, sortValue: (r) => r.items?.name, render: (r) => r.items?.name ?? `Item ${r.item_id}` },
    { key: 'shop', header: 'Shop', sortable: true, sortValue: (r) => shopName(r.location_id), render: (r) => shopName(r.location_id) },
    { key: 'qty', header: 'Forecast (donuts)', align: 'right', sortable: true, sortValue: (r) => Number(r.qty), render: (r) => <strong className="gz-num">{formatNumber(r.qty, 0)}</strong> },
    { key: 'dozens', header: 'Dozens', align: 'right', sortValue: (r) => Number(r.qty), render: (r) => formatNumber(Number(r.qty) / 12, 1) },
    { key: 'base', header: 'Base / day', align: 'right', render: (r) => formatNumber(r.base, 1) },
    { key: 'weekday_idx', header: 'Weekday index', align: 'right', render: (r) => times(Number(r.weekday_idx)) },
    { key: 'trend_factor', header: 'Trend', align: 'right', render: (r) => times(Number(r.trend_factor)) },
    {
      key: 'season_factor', header: 'Season', align: 'right',
      render: (r) => (Number(r.season_factor) === 0 ? <Badge tone="neutral">Off season</Badge> : times(Number(r.season_factor))),
    },
    {
      key: 'promo_lift', header: 'Promo lift', align: 'right',
      render: (r) => (Number(r.promo_lift) > 1 ? <Badge tone="accent">{times(Number(r.promo_lift))}</Badge> : times(Number(r.promo_lift))),
    },
  ];

  const example = rows.find((r) => r.location_id === locId && r.item_id === itemId) ?? rows[0];
  const canGenerate = canCall(role, 'generate_forecast');
  const run = fc.data?.run;

  return (
    <div className="gz-stack">
      <div className="gz-row" style={{ alignItems: 'end' }}>
        <TextField label="Forecast date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <Select
          label="Shop"
          value={shopFilter}
          onChange={(e) => setShopFilter(e.target.value)}
          options={[{ value: 'all', label: 'All shops' }, ...shops.map((s) => ({ value: String(s.id), label: s.name }))]}
        />
        {canGenerate && (
          <>
            <Select
              label="Days to forecast"
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
              options={[{ value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: '28', label: '28 days' }, { value: '56', label: '56 days' }]}
            />
            <Button variant="primary" icon="refresh" disabled={generate.isPending} onClick={() => generate.mutate()}>
              {generate.isPending ? 'Generating' : 'Generate forecast'}
            </Button>
          </>
        )}
      </div>

      {fc.error && <Alert tone="danger" title="Could not load the forecast">{rpcErrorMessage(fc.error)}</Alert>}

      <div className="gz-grid-stats">
        <StatCard label={`Forecast for ${formatWeekday(date)}`} icon="trendingUp" value={`${formatNumber(totalUnits / 12, 1)} dozen`} caption={`${formatNumber(totalUnits)} donuts before the bake buffer`} />
        <StatCard label="Item and shop lines" icon="layers" tint="cocoa" value={formatNumber(rows.length)} caption={`${formatNumber(new Set(rows.map((r) => r.item_id)).size)} items across ${formatNumber(byShop.size)} shops`} />
        <StatCard label="Busiest shop" icon="store" tint="mint" value={topShop ? shopName(topShop[0]) : '—'} caption={topShop ? `${formatNumber(topShop[1] / 12, 1)} dozen expected` : 'No forecast for this date'} />
        <StatCard label="Promo lines" icon="tag" tint="butter" value={formatNumber(promoRows.length)} caption="Lines lifted by an active promotion" />
      </div>

      <Card
        title="Forecast by item and shop"
        subtitle={run ? `Run ${run.id}, made ${formatDateTime(run.created_at)} using sales before ${formatDate(run.as_of)}.` : `For ${formatDate(date)}`}
        padded={false}
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey="rowId"
          loading={fc.isLoading}
          scroll
          density="compact"
          defaultSort={{ key: 'qty', dir: 'desc' }}
          aria-label="Forecast by item and shop"
          empty={
            <EmptyState
              icon="trendingUp"
              title="No forecast for this date"
              description="Either the shops are closed that day, or no run covers it yet. Generate a forecast to fill it in."
            />
          }
          onRowClick={(r) => { setItemSel(String(r.item_id)); setShopSel(String(r.location_id)); }}
          selectedKeys={[`${itemId}-${locId}`]}
        />
      </Card>

      <ChartCard
        title="Actual sales vs forecast, last 8 weeks"
        subtitle="Bars are what sold. The line is what the forecast said that morning."
        controls={
          <div className="gz-row">
            <Select label="Item" value={String(itemId || '')} onChange={(e) => setItemSel(e.target.value)} options={itemOptions.length ? itemOptions : [{ value: '', label: 'No forecast yet' }]} />
            <Select label="Shop" value={String(locId || '')} onChange={(e) => setShopSel(e.target.value)} options={shops.map((s) => ({ value: String(s.id), label: s.name }))} />
          </div>
        }
        summary={wape === null ? undefined : `Over these weeks the forecast was off by ${formatPct(wape)} (WAPE), so it was right about ${formatPct(1 - wape, 0)} of the time.`}
        loading={series.isLoading}
        empty={!series.isLoading && points.length === 0 ? 'No sales or past forecasts for this item and shop yet.' : undefined}
        height="lg"
        table={{
          columns: [
            { key: 'date', header: 'Day', render: (p: (typeof points)[number]) => formatWeekday(p.date) },
            { key: 'actual', header: 'Actual', align: 'right', render: (p: (typeof points)[number]) => formatNumber(p.actual) },
            { key: 'forecast', header: 'Forecast', align: 'right', render: (p: (typeof points)[number]) => (p.forecast === null ? '—' : formatNumber(p.forecast, 0)) },
          ],
          rows: points,
          rowKey: 'date',
        }}
      >
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="date" {...axisProps} tickFormatter={(d: string) => formatDate(d).replace(/, \d{4}$/, '')} minTickGap={28} />
          <YAxis {...axisProps} allowDecimals={false} />
          <Tooltip content={<ChartTooltip valueFormatter={(v) => formatNumber(Number(v), 0)} labelFormatter={(l) => formatWeekday(String(l))} />} />
          <Legend />
          <Bar dataKey="actual" name="Actual sold" fill={chartColor(1)} radius={[3, 3, 0, 0]} />
          <Line dataKey="forecast" name="Forecast" stroke={chartColor(0)} strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>
      </ChartCard>

      <Card title="How the forecast works" subtitle="One line you can say out loud: demand is the recent level, shaped by the day of the week, the trend, the season and any promotion.">
        <div className="gz-stack gz-stack--sm">
          <p className="text-body">
            <strong>Forecast = base × weekday index × trend × season × promo lift</strong>, worked out for every shop and every finished item.
          </p>
          <ul className="text-body" style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
            <li><strong>Base:</strong> the last 28 days of sales (promotion days adjusted down), divided by the sum of their weekday indexes, so it is an average open day.</li>
            <li><strong>Weekday index:</strong> 12 weeks of history. Average sales on that weekday divided by the average of all open days, so Saturdays run above 1.00.</li>
            <li><strong>Trend:</strong> the slope of the last 8 weekly levels, capped at 3% a week so one odd week cannot swing the plan.</li>
            <li><strong>Season:</strong> 0 outside an item&apos;s season window, and a 14-day launch ramp from 60% up to 100% when the season starts.</li>
            <li><strong>Promo lift:</strong> the expected lift of any promotion running that day for that shop and item, otherwise 1.00.</li>
          </ul>
          <p className="text-body-sm gz-muted">
            Closed days produce no forecast. Each run only looks at sales before its as-of date, so past runs are honest backtests, which is how the Accuracy tab scores them.
            The bake plan then rounds up to whole dozens: planned = (forecast × (1 + buffer) + confirmed orders) / 12, rounded up.
          </p>
          {example && (
            <Alert tone="info" title="Worked example">
              {example.items?.name} at {shopName(example.location_id)} on {formatWeekday(date)}: {formatNumber(example.base, 1)} base {times(Number(example.weekday_idx))} weekday{' '}
              {times(Number(example.trend_factor))} trend {times(Number(example.season_factor))} season {times(Number(example.promo_lift))} promo ={' '}
              <strong>{formatNumber(example.qty, 0)} donuts</strong> ({formatNumber(Number(example.qty) / 12, 1)} dozen).
            </Alert>
          )}
        </div>
      </Card>
    </div>
  );
}

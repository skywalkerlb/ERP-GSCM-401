import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert, Badge, Button, Card, ChartCard, ChartTooltip, DataTable, EmptyState, Select, Skeleton, StatCard, TextField, axisProps, chartColor, gridProps, type DataTableColumn } from '@/components';
import { useLocations } from '@/hooks/useLocations';
import { addDays, businessDate, formatDate, formatNumber, formatPct } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { reports, rpcErrorMessage } from '@/lib/rpc';
import type { ForecastAccuracy } from '@/types/domain';

type ItemStat = ForecastAccuracy['by_item'][number];
type ShopStat = ForecastAccuracy['by_location'][number];

/** Bias reads as a word, so the color never carries it alone. */
function BiasBadge({ bias }: { bias: number | null }) {
  if (bias === null) return <>—</>;
  if (Math.abs(bias) < 0.05) return <Badge tone="success">Balanced {formatPct(bias)}</Badge>;
  return bias > 0 ? <Badge tone="warning">Over-forecast {formatPct(bias)}</Badge> : <Badge tone="info">Under-forecast {formatPct(bias)}</Badge>;
}

export function AccuracyTab() {
  const today = businessDate();
  const { data: locations = [] } = useLocations();
  const shops = locations.filter((l) => l.kind === 'shop');
  const [from, setFrom] = useState(addDays(today, -28));
  const [to, setTo] = useState(addDays(today, -1));
  const [shop, setShop] = useState('all');
  const valid = from <= to;

  const q = useQuery({
    queryKey: queryKeys.forecast.scope('accuracy', { from, to, shop }),
    enabled: valid,
    queryFn: () => reports.forecastAccuracy({ from, to, location: shop === 'all' ? null : Number(shop) }),
  });
  const a = q.data;
  const o = a?.overall;

  const dayData = (a?.by_day ?? []).map((d) => ({ date: d.date, actual: Number(d.actual), forecast: Number(d.forecast), wape: d.wape === null ? null : Number(d.wape) * 100 }));
  const itemData = [...(a?.by_item ?? [])]
    .filter((i) => i.wape !== null)
    .sort((x, y) => Number(y.wape) - Number(x.wape))
    .map((i) => ({ name: i.name, wape: Number(i.wape) * 100 }));
  const best = [...(a?.by_item ?? [])].filter((i) => i.wape !== null).sort((x, y) => Number(x.wape) - Number(y.wape))[0];

  const itemCols: DataTableColumn<ItemStat>[] = [
    { key: 'name', header: 'Item', sortable: true },
    { key: 'actual', header: 'Actual sold', align: 'right', sortable: true, render: (r) => formatNumber(r.actual) },
    { key: 'forecast', header: 'Forecast', align: 'right', sortable: true, render: (r) => formatNumber(r.forecast) },
    { key: 'wape', header: 'WAPE', align: 'right', sortable: true, render: (r) => formatPct(r.wape) },
    { key: 'bias', header: 'Bias', align: 'right', sortable: true, render: (r) => <BiasBadge bias={r.bias} /> },
  ];
  const shopCols: DataTableColumn<ShopStat>[] = [
    { key: 'name', header: 'Shop', sortable: true },
    { key: 'actual', header: 'Actual sold', align: 'right', render: (r) => formatNumber(r.actual) },
    { key: 'forecast', header: 'Forecast', align: 'right', render: (r) => formatNumber(r.forecast) },
    { key: 'wape', header: 'WAPE', align: 'right', sortable: true, render: (r) => formatPct(r.wape) },
    { key: 'bias', header: 'Bias', align: 'right', render: (r) => <BiasBadge bias={r.bias} /> },
  ];

  return (
    <div className="gz-stack">
      <div className="gz-row" style={{ alignItems: 'end' }}>
        <TextField label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="To" type="date" value={to} min={from} max={addDays(today, -1)} onChange={(e) => setTo(e.target.value)} />
        <Select label="Shop" value={shop} onChange={(e) => setShop(e.target.value)} options={[{ value: 'all', label: 'All shops' }, ...shops.map((s) => ({ value: String(s.id), label: s.name }))]} />
        <Button onClick={() => { setFrom(addDays(today, -28)); setTo(addDays(today, -1)); }}>Last 4 weeks</Button>
        <Button onClick={() => { setFrom(addDays(today, -56)); setTo(addDays(today, -1)); }}>Last 8 weeks</Button>
      </div>

      {!valid && <Alert tone="warning" title="Check the dates">The start date must be on or before the end date.</Alert>}
      {q.error && <Alert tone="danger" title="Could not load accuracy">{rpcErrorMessage(q.error)}</Alert>}
      {q.isLoading && <div className="gz-grid-stats">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} variant="block" />)}</div>}

      {a && o && o.n === 0 && (
        <EmptyState icon="trendingUp" title="Nothing to score in this range" description="Accuracy compares each past day's forecast with what sold. Pick days that already have both." />
      )}

      {a && o && o.n > 0 && (
        <>
          <div className="gz-grid-stats">
            <StatCard label="Forecast accuracy" icon="checkCircle" tint="mint" value={o.wape === null ? '—' : formatPct(1 - Number(o.wape))} caption="One minus WAPE. Higher is better" />
            <StatCard label="WAPE" icon="chart" tint="cocoa" value={formatPct(o.wape)} caption="Sum of absolute misses divided by units sold" />
            <StatCard label="Bias" icon="trendingUp" tint="butter" value={formatPct(o.bias)} caption="Forecast minus actual, over actual. Positive means over-forecast" />
            <StatCard label="Days scored" icon="calendar" tint="lilac" value={formatNumber(o.n)} caption={`${formatNumber(o.actual)} sold vs ${formatNumber(o.forecast)} forecast`} />
          </div>

          <div className="gz-grid-2">
            <ChartCard
              title="Actual vs forecast by day"
              subtitle="All items in the selection, scored against the newest forecast made on or before each day."
              summary={best ? `Most accurate item: ${best.name} at ${formatPct(best.wape)} WAPE.` : undefined}
              table={{
                columns: [
                  { key: 'date', header: 'Day', render: (d: (typeof dayData)[number]) => formatDate(d.date) },
                  { key: 'actual', header: 'Actual', align: 'right', render: (d: (typeof dayData)[number]) => formatNumber(d.actual) },
                  { key: 'forecast', header: 'Forecast', align: 'right', render: (d: (typeof dayData)[number]) => formatNumber(d.forecast) },
                  { key: 'wape', header: 'WAPE', align: 'right', render: (d: (typeof dayData)[number]) => (d.wape === null ? '—' : `${formatNumber(d.wape, 1)}%`) },
                ],
                rows: dayData,
                rowKey: 'date',
              }}
            >
              <ComposedChart data={dayData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} tickFormatter={(d: string) => formatDate(d).replace(/, \d{4}$/, '')} minTickGap={28} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => formatNumber(Number(v))} labelFormatter={(l) => formatDate(String(l))} />} />
                <Legend />
                <Bar dataKey="actual" name="Actual sold" fill={chartColor(1)} radius={[3, 3, 0, 0]} />
                <Line dataKey="forecast" name="Forecast" stroke={chartColor(0)} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ChartCard>

            <ChartCard
              title="Error by item (WAPE)"
              subtitle="Lower is better. Sorted from the biggest miss."
              table={{
                columns: [
                  { key: 'name', header: 'Item' },
                  { key: 'wape', header: 'WAPE', align: 'right', render: (d: (typeof itemData)[number]) => `${formatNumber(d.wape, 1)}%` },
                ],
                rows: itemData,
                rowKey: 'name',
              }}
              empty={itemData.length === 0 ? 'No item has sales to score yet.' : undefined}
            >
              <BarChart data={itemData} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 16 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" unit="%" {...axisProps} />
                <YAxis type="category" dataKey="name" width={120} {...axisProps} interval={0} />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => `${formatNumber(Number(v), 1)}%`} />} />
                <Bar dataKey="wape" name="WAPE" fill={chartColor(0)} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartCard>
          </div>

          <Card title="By shop" padded={false}>
            <DataTable columns={shopCols} rows={a.by_location} rowKey="location_id" density="compact" aria-label="Forecast accuracy by shop" />
          </Card>
          <Card title="By item" padded={false}>
            <DataTable columns={itemCols} rows={a.by_item} rowKey="item_id" density="compact" defaultSort={{ key: 'wape', dir: 'desc' }} aria-label="Forecast accuracy by item" />
          </Card>

          <Alert tone="info" title="How to read this">
            WAPE is the sum of the absolute misses divided by the units that sold, so one bad day cannot hide behind a good one. Bias shows the direction:
            over-forecast means we baked more than people bought, and under-forecast means we ran short. Within 5% either way counts as balanced.
          </Alert>
        </>
      )}
    </div>
  );
}

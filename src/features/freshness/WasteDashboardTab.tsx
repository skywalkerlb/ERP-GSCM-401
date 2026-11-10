import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Alert, Button, Card, ChartCard, ChartTooltip, DataTable, EmptyState, MoneyCell, QtyCell, Select, Skeleton, StatCard, TextField, axisProps,
  chartColor, gridProps, type DataTableColumn,
} from '@/components';
import { useLocations } from '@/hooks/useLocations';
import { addDays, businessDate, formatDate, formatMoney, formatNumber, formatPct } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { reports, rpcErrorMessage } from '@/lib/rpc';
import type { WasteReport } from '@/types/domain';
import { getMarkdownPct, getSoldLines, getWasteRows, wasteSuggestions } from './api';

type ItemRow = WasteReport['by_item'][number];
type ReasonRow = WasteReport['by_reason'][number];
type LocRow = WasteReport['by_location'][number];
type DayRow = WasteReport['by_day'][number];

export function WasteDashboardTab() {
  const today = businessDate();
  const { data: locations = [] } = useLocations();
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [loc, setLoc] = useState('all');
  const location = loc === 'all' ? null : Number(loc);
  const valid = from <= to;

  const report = useQuery({
    queryKey: queryKeys.freshness.scope('waste-report', { from, to, location }),
    enabled: valid,
    queryFn: () => reports.wasteReport({ from, to, location }),
  });
  const sold = useQuery({
    queryKey: queryKeys.freshness.scope('sold-lines', { from, to, location }),
    enabled: valid,
    queryFn: () => getSoldLines(from, to, location),
  });
  const wasteRows = useQuery({
    queryKey: queryKeys.freshness.scope('waste-rows', { from, to, location }),
    enabled: valid,
    queryFn: () => getWasteRows(from, to, location),
  });
  const markdownQ = useQuery({ queryKey: queryKeys.settings.scope('make-markdown'), staleTime: 60_000, queryFn: getMarkdownPct });

  const r = report.data;
  const s = r?.summary;

  // Day-old markdown recovery, from stored sale lines.
  const dayOld = (sold.data ?? []).filter((l) => l.condition === 'day_old');
  const dayOldRevenue = dayOld.reduce((t, l) => t + Number(l.line_net), 0);
  const dayOldUnits = dayOld.reduce((t, l) => t + Number(l.qty), 0);
  const avoidedCost = dayOld.reduce((t, l) => t + Number(l.cogs_total), 0);
  const expired = r?.by_reason.find((x) => x.reason_code === 'EXPIRED');
  const expiredUnits = Number(expired?.qty ?? 0);
  const expiredCost = Number(expired?.cost ?? 0);
  const recoveryRate = dayOldUnits + expiredUnits > 0 ? dayOldUnits / (dayOldUnits + expiredUnits) : null;

  const shopIds = new Set(locations.filter((l) => l.kind === 'shop').map((l) => l.id));
  const suggestions = wasteSuggestions(wasteRows.data ?? [], sold.data ?? [], from, to, shopIds).slice(0, 3);
  const top5 = [...(r?.by_item ?? [])].sort((a, b) => Number(b.cost) - Number(a.cost)).slice(0, 5);

  const trendData = (r?.by_day ?? []).map((d) => ({ date: d.business_date, cost: Number(d.cost), qty: Number(d.qty) }));
  const reasonData = (r?.by_reason ?? []).map((x) => ({ reason: x.label ?? x.reason_code ?? 'Other', cost: Number(x.cost), qty: Number(x.qty) }));
  const itemData = [...(r?.by_item ?? [])].sort((a, b) => Number(b.cost) - Number(a.cost)).slice(0, 8).map((x) => ({ name: x.name, cost: Number(x.cost), pct: x.waste_pct_of_production_cost === null ? null : Number(x.waste_pct_of_production_cost) * 100 }));
  const locData = (r?.by_location ?? []).map((x) => ({ name: x.name, cost: Number(x.cost), qty: Number(x.qty) }));
  const recoveryData = [
    { label: 'Day-old sales revenue', amount: dayOldRevenue },
    { label: 'Waste avoided (cost)', amount: avoidedCost },
    { label: 'Still written off (expired)', amount: expiredCost },
  ];

  const itemCols: DataTableColumn<ItemRow>[] = [
    { key: 'name', header: 'Item', sortable: true },
    { key: 'qty', header: 'Wasted', align: 'right', sortable: true, render: (x) => <QtyCell qty={x.qty} uom="each" /> },
    { key: 'cost', header: 'Waste cost', align: 'right', sortable: true, render: (x) => <MoneyCell value={x.cost} strong /> },
    { key: 'produced_qty', header: 'Produced', align: 'right', sortable: true, render: (x) => <QtyCell qty={x.produced_qty} uom="each" /> },
    { key: 'waste_pct_of_production_cost', header: 'Waste % of production cost', align: 'right', sortable: true, render: (x) => formatPct(x.waste_pct_of_production_cost) },
  ];
  const reasonCols: DataTableColumn<ReasonRow>[] = [
    { key: 'label', header: 'Reason', render: (x) => x.label ?? x.reason_code ?? 'Other' },
    { key: 'qty', header: 'Units', align: 'right', render: (x) => formatNumber(x.qty) },
    { key: 'cost', header: 'Cost', align: 'right', render: (x) => <MoneyCell value={x.cost} /> },
    { key: 'pct_of_waste', header: 'Share of waste', align: 'right', render: (x) => formatPct(x.pct_of_waste) },
  ];
  const locCols: DataTableColumn<LocRow>[] = [
    { key: 'name', header: 'Location' },
    { key: 'qty', header: 'Units', align: 'right', render: (x) => formatNumber(x.qty) },
    { key: 'cost', header: 'Cost', align: 'right', render: (x) => <MoneyCell value={x.cost} /> },
  ];
  const dayCols: DataTableColumn<DayRow>[] = [
    { key: 'business_date', header: 'Day', render: (x) => formatDate(x.business_date) },
    { key: 'qty', header: 'Units', align: 'right', render: (x) => formatNumber(x.qty) },
    { key: 'cost', header: 'Cost', align: 'right', render: (x) => <MoneyCell value={x.cost} /> },
  ];

  const money = (v: number | string) => formatMoney(Number(v));

  return (
    <div className="gz-stack">
      <div className="gz-row" style={{ alignItems: 'end' }}>
        <TextField label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="To" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
        <Select label="Location" value={loc} onChange={(e) => setLoc(e.target.value)} options={[{ value: 'all', label: 'All locations' }, ...locations.map((l) => ({ value: String(l.id), label: l.name }))]} />
        <Button onClick={() => { setFrom(addDays(today, -6)); setTo(today); }}>Last 7 days</Button>
        <Button onClick={() => { setFrom(addDays(today, -29)); setTo(today); }}>Last 30 days</Button>
      </div>

      {!valid && <Alert tone="warning" title="Check the dates">The start date must be on or before the end date.</Alert>}
      {report.error && <Alert tone="danger" title="Could not load the waste report">{rpcErrorMessage(report.error)}</Alert>}
      {report.isLoading && <div className="gz-grid-stats">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} variant="block" />)}</div>}

      {r && s && (
        <>
          <div className="gz-grid-stats">
            <StatCard label="Waste cost" icon="trash" tint="pink" value={formatMoney(s.waste_cost)} caption="Cost of everything written off in the range" />
            <StatCard label="Waste units" icon="leaf" tint="butter" value={formatNumber(s.waste_qty)} caption={`${formatNumber(Number(s.waste_qty) / 12, 1)} dozen wasted`} />
            <StatCard label="Waste % of production cost" icon="chart" tint="cocoa" value={formatPct(s.waste_pct_of_production_cost)} caption="Waste cost divided by cost of what was produced" />
            <StatCard label="Production cost" icon="factory" tint="mint" value={formatMoney(s.production_cost)} caption={`${formatNumber(Number(s.production_qty) / 12, 1)} dozen produced`} />
          </div>

          {Number(s.waste_cost) === 0 && (
            <EmptyState icon="leaf" title="No waste in this range" description="Nothing was written off between these dates. Pick a longer range to see trends." />
          )}

          {suggestions.length > 0 && (
            <Card title="Suggestions" subtitle="Where baking less would cut waste, based on expired and overproduced units against what each shop sold.">
              <ul className="gz-stack gz-stack--sm" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {suggestions.map((x) => (
                  <li key={`${x.item_id}-${x.location_id}`}>
                    <strong>Lower {x.item_name} bake at {x.location_name} by {x.dozens} dozen.</strong>{' '}
                    <span className="gz-muted">
                      {formatNumber(x.wasteUnits)} wasted ({formatMoney(x.wasteCost)}) against {formatNumber(x.soldUnits)} sold, so {formatPct(x.wastePct, 0)} of what reached the shop went to waste.
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="gz-grid-2">
            <ChartCard
              title="Waste cost by day"
              summary={`${formatMoney(s.waste_cost)} over ${trendData.length} ${trendData.length === 1 ? 'day' : 'days'} with waste.`}
              table={{ columns: dayCols, rows: r.by_day, rowKey: 'business_date' }}
              empty={trendData.length === 0 ? 'No waste days in this range.' : undefined}
            >
              <AreaChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} tickFormatter={(d: string) => formatDate(d).replace(/, \d{4}$/, '')} minTickGap={28} />
                <YAxis {...axisProps} tickFormatter={(v: number) => formatMoney(v, { compact: true })} />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => money(v)} labelFormatter={(l) => formatDate(String(l))} />} />
                <Area dataKey="cost" name="Waste cost" stroke={chartColor(0)} fill={chartColor(0)} fillOpacity={0.2} strokeWidth={2} />
              </AreaChart>
            </ChartCard>

            <ChartCard
              title="Waste cost by reason"
              summary={reasonData[0] ? `${reasonData.slice().sort((a, b) => b.cost - a.cost)[0]!.reason} is the biggest reason.` : undefined}
              table={{ columns: reasonCols, rows: r.by_reason, rowKey: 'reason_code' }}
              empty={reasonData.length === 0 ? 'No waste reasons in this range.' : undefined}
            >
              <BarChart data={reasonData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="reason" {...axisProps} interval={0} />
                <YAxis {...axisProps} tickFormatter={(v: number) => formatMoney(v, { compact: true })} />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => money(v)} />} />
                <Bar dataKey="cost" name="Waste cost" fill={chartColor(1)} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Waste cost by item"
              subtitle="Top 8 by cost."
              table={{ columns: itemCols, rows: r.by_item, rowKey: 'item_id' }}
              empty={itemData.length === 0 ? 'No item waste in this range.' : undefined}
            >
              <BarChart data={itemData} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 16 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" {...axisProps} tickFormatter={(v: number) => formatMoney(v, { compact: true })} />
                <YAxis type="category" dataKey="name" width={130} {...axisProps} interval={0} />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => money(v)} />} />
                <Bar dataKey="cost" name="Waste cost" fill={chartColor(0)} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Waste cost by location"
              table={{ columns: locCols, rows: r.by_location, rowKey: 'location_id' }}
              empty={locData.length === 0 ? 'No location waste in this range.' : undefined}
            >
              <BarChart data={locData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="name" {...axisProps} interval={0} />
                <YAxis {...axisProps} tickFormatter={(v: number) => formatMoney(v, { compact: true })} />
                <Tooltip content={<ChartTooltip valueFormatter={(v) => money(v)} />} />
                <Bar dataKey="cost" name="Waste cost" fill={chartColor(2)} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
          </div>

          <ChartCard
            title="Day-old markdown recovery"
            subtitle={markdownQ.data !== undefined ? `Day-old donuts sell at ${formatNumber(markdownQ.data * 100, 0)}% off list price (Settings).` : undefined}
            summary={
              <>
                {formatNumber(dayOldUnits / 12, 1)} dozen of day-old stock sold for {formatMoney(dayOldRevenue)}, which kept {formatMoney(avoidedCost)} of cost out of waste.
                {recoveryRate !== null && <> Recovery rate {formatPct(recoveryRate, 0)} of day-old units.</>}
              </>
            }
            loading={sold.isLoading}
            table={{
              columns: [
                { key: 'label', header: 'Measure' },
                { key: 'amount', header: 'Amount', align: 'right', render: (x: (typeof recoveryData)[number]) => <MoneyCell value={x.amount} /> },
              ],
              rows: recoveryData,
              rowKey: 'label',
            }}
            height="sm"
          >
            <BarChart data={recoveryData} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 16 }}>
              <CartesianGrid {...gridProps} horizontal={false} vertical />
              <XAxis type="number" {...axisProps} tickFormatter={(v: number) => formatMoney(v, { compact: true })} />
              <YAxis type="category" dataKey="label" width={170} {...axisProps} interval={0} />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => money(v)} />} />
              <Bar dataKey="amount" name="Amount" fill={chartColor(2)} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartCard>

          <Card title="Top 5 waste items" subtitle="Ranked by cost." padded={false}>
            <DataTable columns={itemCols} rows={top5} rowKey="item_id" density="compact" aria-label="Top five waste items" empty="No item waste in this range." />
          </Card>
        </>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert } from '@/components/Alert';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { axisProps, chartColor, ChartTooltip, gridProps } from '@/components/charts';
import { ChartCard } from '@/components/ChartCard';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Select } from '@/components/Select';
import { StatusBadge } from '@/components/StatusBadge';
import { Tabs } from '@/components/Tabs';
import { Toolbar } from '@/components/Toolbar';
import { MoneyCell } from '@/components/cells';
import { useSelectedLocation } from '@/hooks/useLocations';
import { formatDate, formatItemQty, formatMoney, formatNumber, formatPct, formatQty } from '@/lib/format';
import { rpcErrorMessage } from '@/lib/rpc';
import type { ItemAvailability, ReorderAnalysisRow, SalesGrain, SalesSummaryRow, SupplierScorecardRow, TopSellerRow } from '@/types/domain';
import {
  useInventoryValuation, useItemAvailability, useReorderAnalysis, useSalesSummary, useSupplierScorecard, useTopSellers,
} from './api';
import { downloadCsv, type CsvColumn } from './csv';
import { ReportFilters, rangeForPreset, type DateRange, type RangePreset } from './ReportFilters';
import './insights.css';

type TabId = 'sales' | 'top' | 'lowstock' | 'inventory' | 'suppliers';

const TABS: Array<{ value: TabId; label: string }> = [
  { value: 'sales', label: 'Sales by period' },
  { value: 'top', label: 'Top sellers' },
  { value: 'lowstock', label: 'Low stock' },
  { value: 'inventory', label: 'Inventory by location' },
  { value: 'suppliers', label: 'Supplier performance' },
];

interface FilterState {
  preset: RangePreset;
  range: DateRange;
  locationId: string;
  setRange: (preset: RangePreset, range: DateRange) => void;
  setLocationId: (id: string) => void;
}

const compactMoney = (v: number | string) => formatMoney(Number(v), { compact: true });
const moneyTip = (v: number | string) => formatMoney(Number(v));

function ExportButton<R>({ filename, columns, rows }: { filename: string; columns: CsvColumn<R>[]; rows: R[] }) {
  return (
    <Button variant="secondary" icon="download" disabled={rows.length === 0} onClick={() => downloadCsv(filename, columns, rows)}>
      Export CSV
    </Button>
  );
}

function ErrorAlert({ error }: { error: unknown }) {
  return (
    <Alert tone="danger" title="Could not load this report">
      {rpcErrorMessage(error)} Refresh the page, or check your connection.
    </Alert>
  );
}

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'sales') as TabId;
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [range, setRangeState] = useState<DateRange>(() => rangeForPreset('30d')!);
  const [locationId, setLocationId] = useState('');
  const filters: FilterState = {
    preset,
    range,
    locationId,
    setRange: (p, r) => {
      setPreset(p);
      setRangeState(r);
    },
    setLocationId,
  };

  return (
    <>
      <PageHeader title="Reports" breadcrumb={[{ label: 'Insights' }, { label: 'Reports' }]} subtitle="Every number comes from stored sales, stock and purchasing records, and updates when other people sell or receive." />
      <Tabs
        aria-label="Report"
        items={TABS}
        value={tab}
        onChange={(v) => setParams(v === 'sales' ? {} : { tab: v }, { replace: true })}
      />
      <div role="tabpanel" className="gz-stack gz-stack--sm" style={{ marginTop: 'var(--space-4)' }}>
        {tab === 'sales' && <SalesTab f={filters} />}
        {tab === 'top' && <TopSellersTab f={filters} />}
        {tab === 'lowstock' && <LowStockTab />}
        {tab === 'inventory' && <InventoryTab f={filters} />}
        {tab === 'suppliers' && <SuppliersTab />}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ sales by day / week */

function SalesTab({ f }: { f: FilterState }) {
  const [grain, setGrain] = useState<SalesGrain>('day');
  const q = useSalesSummary(f.range, grain, f.locationId);
  const rows = q.data ?? [];
  const totals = useMemo(
    () => ({
      net: rows.reduce((s, r) => s + r.net_sales, 0),
      gp: rows.reduce((s, r) => s + r.gross_profit, 0),
      tickets: rows.reduce((s, r) => s + r.tickets, 0),
    }),
    [rows],
  );
  const columns: DataTableColumn<SalesSummaryRow>[] = [
    { key: 'period_start', header: grain === 'week' ? 'Week of' : 'Day', sortable: true, render: (r) => formatDate(r.period_start) },
    { key: 'tickets', header: 'Tickets', align: 'right', sortable: true, render: (r) => formatNumber(r.tickets) },
    { key: 'units', header: 'Units', align: 'right', sortable: true, render: (r) => formatNumber(r.units) },
    { key: 'gross_sales', header: 'Gross sales', align: 'right', sortable: true, render: (r) => <MoneyCell value={r.gross_sales} /> },
    { key: 'discounts', header: 'Discounts', align: 'right', render: (r) => <MoneyCell value={r.discounts} /> },
    { key: 'returns', header: 'Returns', align: 'right', render: (r) => <MoneyCell value={r.returns} /> },
    { key: 'net_sales', header: 'Net sales', align: 'right', sortable: true, render: (r) => <MoneyCell value={r.net_sales} strong /> },
    { key: 'cogs', header: 'Cost of goods', align: 'right', render: (r) => <MoneyCell value={r.cogs} /> },
    { key: 'gross_profit', header: 'Gross profit', align: 'right', sortable: true, render: (r) => <MoneyCell value={r.gross_profit} /> },
    { key: 'avg_ticket', header: 'Avg ticket', align: 'right', render: (r) => <MoneyCell value={r.avg_ticket} /> },
  ];
  const csv: CsvColumn<SalesSummaryRow>[] = [
    { header: grain === 'week' ? 'Week start' : 'Date', value: (r) => r.period_start },
    { header: 'Tickets', value: (r) => r.tickets },
    { header: 'Units', value: (r) => r.units },
    { header: 'Gross sales', value: (r) => r.gross_sales },
    { header: 'Discounts', value: (r) => r.discounts },
    { header: 'Returns', value: (r) => r.returns },
    { header: 'Net sales', value: (r) => r.net_sales },
    { header: 'Cost of goods', value: (r) => r.cogs },
    { header: 'Gross profit', value: (r) => r.gross_profit },
    { header: 'Average ticket', value: (r) => r.avg_ticket },
  ];
  return (
    <>
      <Toolbar end={<ExportButton filename={`sales-by-${grain}-${f.range.from}-to-${f.range.to}`} columns={csv} rows={rows} />}>
        <div className="ins-filters">
          <ReportFilters {...f} onRangeChange={f.setRange} onLocationChange={f.setLocationId} />
          <Select label="Group by" value={grain} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]} onChange={(e) => setGrain(e.target.value as SalesGrain)} />
        </div>
      </Toolbar>
      {q.isError && <ErrorAlert error={q.error} />}
      <ChartCard
        title={grain === 'week' ? 'Sales by week' : 'Sales by day'}
        subtitle="Net sales are gross sales less discounts and returns. Gross profit also removes cost of goods."
        summary={`${formatMoney(totals.net)} net sales and ${formatMoney(totals.gp)} gross profit from ${formatNumber(totals.tickets)} tickets`}
        loading={q.isLoading}
        empty={rows.length === 0 && !q.isLoading ? 'No sales in this range.' : undefined}
        table={{ columns, rows, rowKey: 'period_start' }}
        height="md"
      >
        <BarChart data={rows}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="period_label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...axisProps} tickFormatter={compactMoney} />
          <Tooltip content={<ChartTooltip valueFormatter={moneyTip} />} cursor={{ fill: 'var(--surface-hover)' }} />
          <Legend />
          <Bar dataKey="net_sales" name="Net sales" fill={chartColor(0)} radius={[4, 4, 0, 0]} />
          <Bar dataKey="gross_profit" name="Gross profit" fill={chartColor(1)} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>
      <DataTable columns={columns} rows={rows} rowKey="period_start" loading={q.isLoading} density="compact" aria-label="Sales by period" empty="No sales in this range." defaultSort={{ key: 'period_start', dir: 'desc' }} />
    </>
  );
}

/* ------------------------------------------------------------------ top sellers */

function TopSellersTab({ f }: { f: FilterState }) {
  const [by, setBy] = useState<'revenue' | 'units'>('revenue');
  const [limit, setLimit] = useState('10');
  const q = useTopSellers(f.range, f.locationId, by, Number(limit));
  const rows = q.data ?? [];
  const columns: DataTableColumn<TopSellerRow>[] = [
    { key: 'rank', header: '#', width: 56, sortable: true },
    { key: 'sku', header: 'SKU', mono: true },
    { key: 'name', header: 'Item', sortable: true },
    { key: 'category', header: 'Category' },
    { key: 'units', header: 'Units', align: 'right', sortable: true, render: (r) => formatNumber(r.units) },
    { key: 'revenue', header: 'Revenue', align: 'right', sortable: true, render: (r) => <MoneyCell value={r.revenue} strong /> },
    { key: 'cogs', header: 'Cost of goods', align: 'right', render: (r) => <MoneyCell value={r.cogs} /> },
    { key: 'margin', header: 'Margin', align: 'right', sortable: true, render: (r) => <MoneyCell value={r.margin} /> },
    { key: 'margin_pct', header: 'Margin %', align: 'right', sortValue: (r) => (r.revenue ? r.margin / r.revenue : 0), sortable: true, render: (r) => formatPct(r.revenue ? r.margin / r.revenue : null) },
  ];
  const csv: CsvColumn<TopSellerRow>[] = [
    { header: 'Rank', value: (r) => r.rank },
    { header: 'SKU', value: (r) => r.sku },
    { header: 'Item', value: (r) => r.name },
    { header: 'Category', value: (r) => r.category },
    { header: 'Units', value: (r) => r.units },
    { header: 'Revenue', value: (r) => r.revenue },
    { header: 'Cost of goods', value: (r) => r.cogs },
    { header: 'Margin', value: (r) => r.margin },
  ];
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  return (
    <>
      <Toolbar end={<ExportButton filename={`top-sellers-${f.range.from}-to-${f.range.to}`} columns={csv} rows={rows} />}>
        <div className="ins-filters">
          <ReportFilters {...f} onRangeChange={f.setRange} onLocationChange={f.setLocationId} />
          <Select label="Rank by" value={by} options={[{ value: 'revenue', label: 'Revenue' }, { value: 'units', label: 'Units' }]} onChange={(e) => setBy(e.target.value as 'revenue' | 'units')} />
          <Select label="Show" value={limit} options={[{ value: '5', label: 'Top 5' }, { value: '10', label: 'Top 10' }, { value: '20', label: 'Top 20' }]} onChange={(e) => setLimit(e.target.value)} />
        </div>
      </Toolbar>
      {q.isError && <ErrorAlert error={q.error} />}
      <ChartCard
        title={by === 'revenue' ? 'Top sellers by revenue' : 'Top sellers by units'}
        subtitle="Revenue is net of returned quantities."
        summary={`${formatMoney(totalRevenue)} from the items shown`}
        loading={q.isLoading}
        height="lg"
        empty={rows.length === 0 && !q.isLoading ? 'No sales in this range.' : undefined}
        table={{ columns, rows, rowKey: 'item_id' }}
      >
        <BarChart data={rows} layout="vertical" margin={{ left: 16 }}>
          <CartesianGrid {...gridProps} horizontal={false} vertical />
          <XAxis type="number" {...axisProps} tickFormatter={by === 'revenue' ? compactMoney : (v: number) => formatNumber(v)} />
          <YAxis type="category" dataKey="name" width={150} {...axisProps} interval={0} />
          <Tooltip content={<ChartTooltip valueFormatter={(v, n) => (n === 'Units' ? formatNumber(Number(v)) : moneyTip(v))} />} cursor={{ fill: 'var(--surface-hover)' }} />
          <Bar dataKey={by} name={by === 'revenue' ? 'Revenue' : 'Units'} fill={chartColor(0)} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ChartCard>
      <DataTable columns={columns} rows={rows} rowKey="item_id" loading={q.isLoading} density="compact" aria-label="Top sellers" empty="No sales in this range." />
    </>
  );
}

/* ------------------------------------------------------------------ low stock */

function LowStockTab() {
  const q = useReorderAnalysis();
  const [show, setShow] = useState<'below' | 'all'>('below');
  const all = q.data ?? [];
  const rows = useMemo(
    () => [...(show === 'all' ? all : all.filter((r) => r.below_rop || r.urgency !== 'ok'))].sort((a, b) => (a.order_by_date ?? '9999').localeCompare(b.order_by_date ?? '9999')),
    [all, show],
  );
  const chartRows = rows.slice(0, 12).map((r) => ({ name: r.name, position: r.inventory_position, rop: r.rop_calc }));
  const columns: DataTableColumn<ReorderAnalysisRow>[] = [
    { key: 'name', header: 'Item', sortable: true, render: (r) => <><span>{r.name}</span> <span className="gz-mono gz-muted">{r.sku}</span></> },
    { key: 'supplier_name', header: 'Supplier', sortable: true },
    { key: 'on_hand', header: 'On hand', align: 'right', sortable: true, render: (r) => formatQty(r.on_hand, r.uom, { dozens: false }) },
    { key: 'on_order', header: 'On order', align: 'right', render: (r) => formatQty(r.on_order, r.uom, { dozens: false }) },
    { key: 'inventory_position', header: 'Position', align: 'right', sortable: true, render: (r) => formatQty(r.inventory_position, r.uom, { dozens: false }) },
    { key: 'rop_calc', header: 'Reorder point', align: 'right', sortable: true, render: (r) => formatQty(Math.round(r.rop_calc * 10) / 10, r.uom, { dozens: false }) },
    { key: 'suggested_qty', header: 'Suggested order', align: 'right', sortable: true, render: (r) => (r.suggested_qty > 0 ? <strong className="gz-num">{formatQty(r.suggested_qty, r.uom, { dozens: false })}</strong> : '—') },
    { key: 'days_of_cover', header: 'Days of cover', align: 'right', sortable: true, render: (r) => formatNumber(r.days_of_cover, 1) },
    { key: 'order_by_date', header: 'Order by', sortable: true, render: (r) => formatDate(r.order_by_date) },
    { key: 'urgency', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.urgency === 'ok' ? 'in_stock' : r.urgency} label={r.urgency === 'ok' ? 'OK' : r.urgency === 'late' ? 'Late' : 'Order now'} /> },
  ];
  const csv: CsvColumn<ReorderAnalysisRow>[] = [
    { header: 'SKU', value: (r) => r.sku },
    { header: 'Item', value: (r) => r.name },
    { header: 'Supplier', value: (r) => r.supplier_name },
    { header: 'Unit', value: (r) => r.uom },
    { header: 'On hand', value: (r) => r.on_hand },
    { header: 'On order', value: (r) => r.on_order },
    { header: 'Backordered', value: (r) => r.backordered },
    { header: 'Inventory position', value: (r) => r.inventory_position },
    { header: 'Reorder point', value: (r) => r.rop_calc },
    { header: 'Safety stock', value: (r) => r.safety_stock },
    { header: 'EOQ', value: (r) => r.eoq },
    { header: 'Suggested order qty', value: (r) => r.suggested_qty },
    { header: 'Days of cover', value: (r) => r.days_of_cover },
    { header: 'Stockout date', value: (r) => r.stockout_date },
    { header: 'Order by date', value: (r) => r.order_by_date },
    { header: 'Status', value: (r) => r.urgency },
  ];
  return (
    <>
      <Toolbar end={<ExportButton filename="low-stock" columns={csv} rows={rows} />}>
        <div className="ins-filters">
          <Select label="Show" value={show} options={[{ value: 'below', label: 'Needs ordering' }, { value: 'all', label: 'All purchased items' }]} onChange={(e) => setShow(e.target.value as 'below' | 'all')} />
          <p className="text-body-sm ins-note">Shows stock right now across all locations, so the date and location filters do not apply.</p>
        </div>
      </Toolbar>
      {q.isError && <ErrorAlert error={q.error} />}
      <ChartCard
        title="Inventory position against reorder point"
        subtitle="Position is on hand plus on order minus backordered. Items at or under the reorder point need an order."
        summary={`${formatNumber(all.filter((r) => r.below_rop).length)} of ${formatNumber(all.length)} purchased items are at or below their reorder point`}
        loading={q.isLoading}
        height="md"
        empty={chartRows.length === 0 && !q.isLoading ? 'Nothing is below its reorder point.' : undefined}
        table={{ columns, rows, rowKey: 'item_id' }}
      >
        <BarChart data={chartRows}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="name" {...axisProps} interval={0} angle={-20} textAnchor="end" height={64} />
          <YAxis {...axisProps} />
          <Tooltip content={<ChartTooltip valueFormatter={(v) => formatNumber(Number(v), 1)} />} cursor={{ fill: 'var(--surface-hover)' }} />
          <Legend />
          <Bar dataKey="position" name="Position" fill={chartColor(0)} radius={[4, 4, 0, 0]} />
          <Bar dataKey="rop" name="Reorder point" fill={chartColor(1)} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>
      <DataTable columns={columns} rows={rows} rowKey="item_id" loading={q.isLoading} density="compact" aria-label="Low stock" empty="Nothing needs ordering right now." />
    </>
  );
}

/* ------------------------------------------------------------------ inventory by location */

interface StockRow extends ItemAvailability {
  key: string;
  value: number;
  avg_cost: number | null;
}

function InventoryTab({ f }: { f: FilterState }) {
  const avail = useItemAvailability();
  const val = useInventoryValuation();
  const { locations } = useSelectedLocation();
  const loading = avail.isLoading || val.isLoading;

  const valueByKey = useMemo(() => {
    const m = new Map<string, { value: number; avg: number | null }>();
    for (const v of val.data ?? []) m.set(`${v.item_id}-${v.location_id}`, { value: v.value, avg: v.avg_cost });
    return m;
  }, [val.data]);

  const rows: StockRow[] = useMemo(
    () =>
      (avail.data ?? [])
        .filter((a) => (!f.locationId || String(a.location_id) === f.locationId) && (a.on_hand !== 0 || a.on_order !== 0 || a.backordered !== 0))
        .map((a) => {
          const v = valueByKey.get(`${a.item_id}-${a.location_id}`);
          return { ...a, key: `${a.item_id}-${a.location_id}`, value: v?.value ?? 0, avg_cost: v?.avg ?? null };
        }),
    [avail.data, valueByKey, f.locationId],
  );

  const chart = useMemo(() => {
    const types = ['raw', 'packaging', 'finished', 'resale', 'kit'] as const;
    return locations
      .filter((l) => !f.locationId || String(l.id) === f.locationId)
      .map((l) => {
        const row: Record<string, string | number> = { name: l.name };
        for (const t of types) row[t] = 0;
        for (const v of val.data ?? []) if (v.location_id === l.id) row[v.item_type] = Number(row[v.item_type] ?? 0) + v.value;
        return row;
      });
  }, [locations, val.data, f.locationId]);
  const total = rows.reduce((s, r) => s + r.value, 0);

  const columns: DataTableColumn<StockRow>[] = [
    { key: 'name', header: 'Item', sortable: true, render: (r) => <><span>{r.name}</span> <span className="gz-mono gz-muted">{r.sku}</span></> },
    { key: 'location_name', header: 'Location', sortable: true },
    { key: 'on_hand', header: 'On hand', align: 'right', sortable: true, render: (r) => formatItemQty(r.on_hand, r) },
    { key: 'allocated', header: 'Allocated', align: 'right', render: (r) => formatItemQty(r.allocated, r) },
    { key: 'available', header: 'Available', align: 'right', render: (r) => formatItemQty(r.available, r) },
    { key: 'backordered', header: 'Backordered', align: 'right', render: (r) => (r.backordered > 0 ? <Badge tone="warning">{formatItemQty(r.backordered, r)}</Badge> : '—') },
    { key: 'on_order', header: 'On order', align: 'right', render: (r) => formatItemQty(r.on_order, r) },
    { key: 'avg_cost', header: 'Avg cost', align: 'right', render: (r) => <MoneyCell value={r.avg_cost} unitCost /> },
    { key: 'value', header: 'Value', align: 'right', sortable: true, render: (r) => <MoneyCell value={r.value} strong /> },
  ];
  const csv: CsvColumn<StockRow>[] = [
    { header: 'SKU', value: (r) => r.sku },
    { header: 'Item', value: (r) => r.name },
    { header: 'Category', value: (r) => r.category },
    { header: 'Location', value: (r) => r.location_name },
    { header: 'On hand', value: (r) => r.on_hand },
    { header: 'Allocated', value: (r) => r.allocated },
    { header: 'Available', value: (r) => r.available },
    { header: 'Backordered', value: (r) => r.backordered },
    { header: 'On order', value: (r) => r.on_order },
    { header: 'Average cost', value: (r) => r.avg_cost },
    { header: 'Value', value: (r) => r.value },
  ];
  const typeSeries = [
    ['raw', 'Raw'], ['packaging', 'Packaging'], ['finished', 'Finished'], ['resale', 'Resale'], ['kit', 'Kits'],
  ] as const;
  return (
    <>
      <Toolbar end={<ExportButton filename="inventory-by-location" columns={csv} rows={rows} />}>
        <div className="ins-filters">
          <ReportFilters {...f} showDates={false} onRangeChange={f.setRange} onLocationChange={f.setLocationId} includeKitchen />
          <p className="text-body-sm ins-note">Stock right now, so the date range does not apply.</p>
        </div>
      </Toolbar>
      {(avail.isError || val.isError) && <ErrorAlert error={avail.error ?? val.error} />}
      <ChartCard
        title="Inventory value by location"
        subtitle="Quantity times weighted average cost, split by item type."
        summary={`${formatMoney(total)} on hand across ${formatNumber(rows.length)} item and location rows`}
        loading={loading}
        height="md"
        empty={chart.length === 0 && !loading ? 'No stock on hand.' : undefined}
        table={{
          columns: [{ key: 'name', header: 'Location' }, ...typeSeries.map(([k, label]) => ({ key: k, header: label, align: 'right' as const, render: (r: Record<string, string | number>) => formatMoney(Number(r[k] ?? 0)) }))],
          rows: chart,
          rowKey: 'name',
        }}
      >
        <BarChart data={chart}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={compactMoney} />
          <Tooltip content={<ChartTooltip valueFormatter={moneyTip} />} cursor={{ fill: 'var(--surface-hover)' }} />
          <Legend />
          {typeSeries.map(([k, label], i) => (
            <Bar key={k} dataKey={k} name={label} stackId="v" fill={chartColor(i)} />
          ))}
        </BarChart>
      </ChartCard>
      <DataTable columns={columns} rows={rows} rowKey="key" loading={loading} density="compact" aria-label="Inventory by location" empty="No stock on hand." defaultSort={{ key: 'value', dir: 'desc' }} />
    </>
  );
}

/* ------------------------------------------------------------------ supplier performance */

function SuppliersTab() {
  const q = useSupplierScorecard();
  const rows = (q.data ?? []).filter((r) => r.po_count > 0 || r.rating !== 'unrated');
  const chartRows = rows.map((r) => ({ name: r.name, quoted: r.avg_quoted_lead_days ?? r.quoted_lead_time_days, actual: r.avg_actual_lead_days ?? 0 }));
  const columns: DataTableColumn<SupplierScorecardRow>[] = [
    { key: 'name', header: 'Supplier', sortable: true },
    { key: 'po_count', header: 'POs', align: 'right', sortable: true },
    { key: 'on_time_rate', header: 'On time', align: 'right', sortable: true, render: (r) => formatPct(r.on_time_rate, 0) },
    { key: 'fill_rate', header: 'Fill rate', align: 'right', sortable: true, render: (r) => formatPct(r.fill_rate, 0) },
    { key: 'avg_quoted_lead_days', header: 'Quoted lead', align: 'right', render: (r) => `${formatNumber(r.avg_quoted_lead_days ?? r.quoted_lead_time_days, 1)} d` },
    { key: 'avg_actual_lead_days', header: 'Actual lead', align: 'right', sortable: true, render: (r) => (r.avg_actual_lead_days === null ? '—' : `${formatNumber(r.avg_actual_lead_days, 1)} d`) },
    {
      key: 'delta', header: 'Difference', align: 'right',
      sortValue: (r) => (r.avg_actual_lead_days ?? 0) - (r.avg_quoted_lead_days ?? r.quoted_lead_time_days), sortable: true,
      render: (r) => {
        if (r.avg_actual_lead_days === null) return '—';
        const d = r.avg_actual_lead_days - (r.avg_quoted_lead_days ?? r.quoted_lead_time_days);
        return `${d > 0 ? '+' : ''}${formatNumber(d, 1)} d`;
      },
    },
    { key: 'score', header: 'Score', align: 'right', sortable: true, render: (r) => formatNumber(r.score, 1) },
    { key: 'rating', header: 'Rating', sortable: true, render: (r) => <StatusBadge status={r.rating} label={r.rating === 'unrated' ? 'Not rated' : undefined} /> },
  ];
  const csv: CsvColumn<SupplierScorecardRow>[] = [
    { header: 'Supplier', value: (r) => r.name },
    { header: 'POs (last 180 days)', value: (r) => r.po_count },
    { header: 'On-time rate', value: (r) => r.on_time_rate },
    { header: 'Fill rate', value: (r) => r.fill_rate },
    { header: 'Quoted lead days', value: (r) => r.avg_quoted_lead_days ?? r.quoted_lead_time_days },
    { header: 'Actual lead days', value: (r) => r.avg_actual_lead_days },
    { header: 'Score', value: (r) => r.score },
    { header: 'Rating', value: (r) => r.rating },
    { header: 'Amount owed', value: (r) => r.amount_owed },
    { header: 'Overdue amount', value: (r) => r.overdue_amount },
  ];
  return (
    <>
      <Toolbar end={<ExportButton filename="supplier-performance" columns={csv} rows={rows} />}>
        <p className="text-body-sm ins-note">Based on purchase orders sent in the last 180 days, so the date and location filters do not apply. Weights and thresholds are in Settings.</p>
      </Toolbar>
      {q.isError && <ErrorAlert error={q.error} />}
      <ChartCard
        title="Quoted against actual lead time"
        subtitle="Days from sending a purchase order to the first receipt."
        summary={rows.length ? `${formatNumber(rows.filter((r) => r.rating === 'keep').length)} keep, ${formatNumber(rows.filter((r) => r.rating === 'watch').length)} watch, ${formatNumber(rows.filter((r) => r.rating === 'replace').length)} replace` : undefined}
        loading={q.isLoading}
        empty={chartRows.length === 0 && !q.isLoading ? 'No received purchase orders in the last 180 days.' : undefined}
        table={{ columns, rows, rowKey: 'supplier_id' }}
      >
        <BarChart data={chartRows}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="name" {...axisProps} interval={0} angle={-15} textAnchor="end" height={64} />
          <YAxis {...axisProps} unit=" d" />
          <Tooltip content={<ChartTooltip valueFormatter={(v) => `${formatNumber(Number(v), 1)} days`} />} cursor={{ fill: 'var(--surface-hover)' }} />
          <Legend />
          <Bar dataKey="quoted" name="Quoted" fill={chartColor(2)} radius={[4, 4, 0, 0]} />
          <Bar dataKey="actual" name="Actual" fill={chartColor(0)} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>
      {rows.length === 0 && !q.isLoading ? (
        <EmptyState icon="truck" title="No supplier history yet" description="Receive a purchase order and its lead time shows up here." />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey="supplier_id" loading={q.isLoading} density="compact" aria-label="Supplier performance" defaultSort={{ key: 'score', dir: 'desc' }} />
      )}
    </>
  );
}

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert } from '@/components/Alert';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { axisProps, chartColor, ChartTooltip, gridProps } from '@/components/charts';
import { ChartCard } from '@/components/ChartCard';
import { Card } from '@/components/Card';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { Select } from '@/components/Select';
import { Toolbar } from '@/components/Toolbar';
import { MoneyCell } from '@/components/cells';
import { downloadCsv, type CsvColumn } from '@/features/reports/csv';
import { ReportFilters } from '@/features/reports/ReportFilters';
import { formatItemQty, formatMoney, formatNumber, formatPct } from '@/lib/format';
import { rpcErrorMessage } from '@/lib/rpc';
import type { InventoryValuationRow } from '@/types/domain';
import { useGlCheck, useValuationRows } from './api';
import { HowCalculated } from './HowCalculated';

type GroupBy = 'item' | 'location' | 'category';

interface GroupRow {
  key: string;
  label: string;
  sub: string;
  items: number;
  qty: number | null;
  qtyText: string;
  avg_cost: number | null;
  value: number;
  pct: number;
}

const compactMoney = (v: number | string) => formatMoney(Number(v), { compact: true });

export function ValuationTab() {
  const [groupBy, setGroupBy] = useState<GroupBy>('item');
  const [locationId, setLocationId] = useState('');
  const val = useValuationRows();
  const check = useGlCheck();

  const filtered: InventoryValuationRow[] = useMemo(
    () => (val.data ?? []).filter((r) => !locationId || String(r.location_id) === locationId),
    [val.data, locationId],
  );
  const total = filtered.reduce((s, r) => s + r.value, 0);

  const rows: GroupRow[] = useMemo(() => {
    const map = new Map<string, { label: string; sub: string; items: Set<number>; qty: number; value: number; first: InventoryValuationRow }>();
    for (const r of filtered) {
      const key = groupBy === 'item' ? String(r.item_id) : groupBy === 'location' ? String(r.location_id) : r.category ?? 'Uncategorized';
      const label = groupBy === 'item' ? r.name : groupBy === 'location' ? r.location_name : r.category ?? 'Uncategorized';
      const sub = groupBy === 'item' ? r.sku : '';
      const g = map.get(key) ?? { label, sub, items: new Set<number>(), qty: 0, value: 0, first: r };
      g.items.add(r.item_id);
      g.qty += r.qty_on_hand;
      g.value += r.value;
      map.set(key, g);
    }
    return [...map.entries()]
      .map(([key, g]) => ({
        key,
        label: g.label,
        sub: g.sub,
        items: g.items.size,
        qty: groupBy === 'item' ? g.qty : null,
        qtyText: groupBy === 'item' ? formatItemQty(g.qty, g.first) : '',
        avg_cost: groupBy === 'item' && g.qty > 0 ? g.value / g.qty : null,
        value: g.value,
        pct: total ? g.value / total : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filtered, groupBy, total]);

  const columns: DataTableColumn<GroupRow>[] = [
    { key: 'label', header: groupBy === 'item' ? 'Item' : groupBy === 'location' ? 'Location' : 'Category', sortable: true, render: (r) => <>{r.label}{r.sub && <> <span className="gz-mono gz-muted">{r.sub}</span></>}</> },
    ...(groupBy === 'item'
      ? [
          { key: 'qty', header: 'On hand', align: 'right' as const, sortable: true, render: (r: GroupRow) => r.qtyText },
          { key: 'avg_cost', header: 'Weighted avg cost', align: 'right' as const, render: (r: GroupRow) => <MoneyCell value={r.avg_cost} unitCost /> },
        ]
      : [{ key: 'items', header: 'Items', align: 'right' as const, sortable: true }]),
    { key: 'value', header: 'Value', align: 'right', sortable: true, render: (r) => <MoneyCell value={r.value} strong /> },
    { key: 'pct', header: 'Share', align: 'right', sortable: true, render: (r) => formatPct(r.pct, 1) },
  ];
  const csv: CsvColumn<GroupRow>[] = [
    { header: groupBy, value: (r) => r.label },
    { header: 'SKU', value: (r) => r.sub },
    { header: 'Items', value: (r) => r.items },
    { header: 'Quantity', value: (r) => r.qty },
    { header: 'Weighted average cost', value: (r) => r.avg_cost },
    { header: 'Value', value: (r) => r.value },
  ];
  const chartRows = groupBy === 'item' ? rows.slice(0, 10) : rows;
  const g = check.data;
  const tied = g ? Math.abs(g.valuation_vs_gl) < 0.005 && Math.abs(g.ledger_vs_gl) < 0.005 && Math.abs(g.costs_vs_gl) < 0.005 : false;

  return (
    <div className="gz-stack gz-stack--sm">
      <HowCalculated>
        Each item is valued at quantity on hand times its weighted average cost, the running total of what was paid for stock in hand. Receiving at a new price
        moves the average; selling or wasting stock takes it out at the current average. The footer checks the total against GL account 1200 (Inventory), which
        the journal builds from the same stock movements.
      </HowCalculated>
      <Toolbar end={<Button variant="secondary" icon="download" disabled={rows.length === 0} onClick={() => downloadCsv(`inventory-valuation-by-${groupBy}`, csv, rows)}>Export CSV</Button>}>
        <div className="ins-filters">
          <Select label="Group by" value={groupBy} options={[{ value: 'item', label: 'Item' }, { value: 'location', label: 'Location' }, { value: 'category', label: 'Category' }]} onChange={(e) => setGroupBy(e.target.value as GroupBy)} />
          <ReportFilters preset="30d" range={{ from: '', to: '' }} onRangeChange={() => undefined} showDates={false} locationId={locationId} onLocationChange={setLocationId} includeKitchen />
        </div>
      </Toolbar>
      {val.isError && <Alert tone="danger" title="Could not load the valuation">{rpcErrorMessage(val.error)} Refresh the page to try again.</Alert>}
      <ChartCard
        title={groupBy === 'item' ? 'Most valuable items' : groupBy === 'location' ? 'Value by location' : 'Value by category'}
        summary={`${formatMoney(total)} of inventory${locationId ? ' at the chosen location' : ''}`}
        loading={val.isLoading}
        height="sm"
        empty={rows.length === 0 && !val.isLoading ? 'No stock on hand.' : undefined}
        table={{ columns, rows, rowKey: 'key' }}
      >
        <BarChart data={chartRows}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval={0} angle={groupBy === 'item' ? -20 : 0} textAnchor={groupBy === 'item' ? 'end' : 'middle'} height={groupBy === 'item' ? 64 : 30} />
          <YAxis {...axisProps} tickFormatter={compactMoney} />
          <Tooltip content={<ChartTooltip valueFormatter={(v) => formatMoney(Number(v))} />} cursor={{ fill: 'var(--surface-hover)' }} />
          <Bar dataKey="value" name="Value" fill={chartColor(0)} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>
      <DataTable columns={columns} rows={rows} rowKey="key" loading={val.isLoading} density="compact" aria-label="Inventory valuation" defaultSort={{ key: 'value', dir: 'desc' }} empty="No stock on hand." />
      <Card title="Reconciliation to the general ledger" subtitle="Company-wide, whatever location is chosen above.">
        {check.isLoading || !g ? (
          <p className="text-body-sm ins-note">{check.isError ? `${rpcErrorMessage(check.error)} Refresh to try again.` : 'Checking…'}</p>
        ) : (
          <div className="ins-recon">
            <dl className="text-body-sm">
              <div><dt>Valuation total</dt><dd>{formatMoney(g.valuation_value)}</dd></div>
              <div><dt>Stock ledger</dt><dd>{formatMoney(g.ledger_value)}</dd></div>
              <div><dt>GL 1200 Inventory</dt><dd>{formatMoney(g.gl_1200_balance)}</dd></div>
              <div><dt>Difference</dt><dd className={tied ? 'ins-diff-ok' : 'ins-diff-bad'}>{formatMoney(g.valuation_vs_gl)}</dd></div>
            </dl>
            <Badge tone={tied ? 'success' : 'danger'}>{tied ? 'Ties to GL 1200' : `Out by ${formatNumber(Math.abs(g.valuation_vs_gl), 2)}`}</Badge>
          </div>
        )}
      </Card>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Badge, BarcodeLabel, Button, Card, ChartCard, ChartTooltip, DataTable, EmptyState, MoneyCell, PageHeader, Pagination,
  QtyCell, Select, Skeleton, StatusBadge, axisProps, chartColor, gridProps, type DataTableColumn,
} from '@/components';
import {
  indexBy, toNumber, useBomLines, useItemCosts, useItemSuppliers, useItems, useReasonCodes, useScorecard, useSuppliers,
} from '@/features/items/api';
import { ErrorAlert, ItemCell, RatingBadge } from '@/features/items/ui';
import { useRole } from '@/hooks/useRole';
import { formatDate, formatDateTime, formatMoney, formatNumber, formatUnitCost, sentenceCase } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import type { ItemSupplier } from '@/types/domain';
import {
  LEDGER_PAGE, TXN_LABELS, fetchCostHistory, fetchLedgerPage, useItemAvailability, useItemReorder, useItemValuation, type CostPoint, type LedgerRow,
} from './api';

export default function ItemLedgerPage() {
  const { itemId: raw } = useParams();
  const itemId = Number(raw);
  const navigate = useNavigate();
  const { isManager, hasRole } = useRole();

  const itemsQ = useItems();
  const suppliersQ = useSuppliers();
  const costsQ = useItemCosts();
  const itemSuppliersQ = useItemSuppliers();
  const bomQ = useBomLines();
  const availQ = useItemAvailability(itemId);
  const valuationQ = useItemValuation(itemId);
  const reorderQ = useItemReorder(itemId);
  const reasonsQ = useReasonCodes();

  const [page, setPage] = useState(0);
  const [locFilter, setLocFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const ledgerQ = useQuery({
    queryKey: queryKeys.inventory.scope('ledger', { itemId, page, locFilter, typeFilter }),
    enabled: Number.isFinite(itemId),
    queryFn: () => fetchLedgerPage(itemId, page, {
      locationId: locFilter === 'all' ? undefined : Number(locFilter),
      txnType: typeFilter === 'all' ? undefined : typeFilter,
    }),
  });
  const costHistoryQ = useQuery({
    queryKey: queryKeys.inventory.scope('cost-history', { itemId }),
    enabled: Number.isFinite(itemId),
    queryFn: () => fetchCostHistory(itemId),
  });
  const scoreQ = useScorecard();

  const item = itemsQ.data?.find((i) => i.id === itemId);
  const itemMap = useMemo(() => indexBy(itemsQ.data, (i) => i.id), [itemsQ.data]);
  const supplierMap = useMemo(() => indexBy(suppliersQ.data, (s) => s.id), [suppliersQ.data]);
  const costMap = useMemo(() => indexBy(costsQ.data, (c) => c.item_id), [costsQ.data]);
  const reasonMap = useMemo(() => indexBy(reasonsQ.data, (r) => r.code), [reasonsQ.data]);
  const ratingMap = useMemo(() => new Map((scoreQ.data ?? []).map((r) => [r.supplier_id, r.rating])), [scoreQ.data]);
  const cost = costMap.get(itemId);
  const reorder = reorderQ.data;
  const locations = useMemo(() => (availQ.data ?? []).map((a) => ({ id: a.location_id, name: a.location_name })), [availQ.data]);

  const bomLines = useMemo(() => (bomQ.data ?? []).filter((b) => b.parent_item_id === itemId), [bomQ.data, itemId]);
  const whereUsed = useMemo(() => (bomQ.data ?? []).filter((b) => b.component_item_id === itemId), [bomQ.data, itemId]);
  const rolledCost = bomLines.reduce((s, b) => s + toNumber(b.qty_per) * toNumber(costMap.get(b.component_item_id)?.avg_cost), 0);
  const suppliedBy = useMemo(() => (itemSuppliersQ.data ?? []).filter((s) => s.item_id === itemId), [itemSuppliersQ.data, itemId]);

  if (!Number.isFinite(itemId)) {
    return <EmptyState icon="box" title="That item link is not valid" description="Open an item from the inventory list." action={<Button variant="primary" onClick={() => navigate('/inventory')}>Back to inventory</Button>} />;
  }
  if (itemsQ.isLoading) {
    return (
      <div className="gz-stack">
        <PageHeader title="Item" breadcrumb={[{ label: 'Stock' }, { label: 'Inventory', to: '/inventory' }, { label: 'Item' }]} />
        <Skeleton variant="block" />
        <Skeleton variant="block" />
      </div>
    );
  }
  if (itemsQ.error) return <ErrorAlert error={itemsQ.error} onRetry={() => void itemsQ.refetch()} />;
  if (!item) {
    return <EmptyState icon="box" title="We could not find that item" description="It may have been removed. Pick another from the inventory list." action={<Button variant="primary" onClick={() => navigate('/inventory')}>Back to inventory</Button>} />;
  }

  const preferred = item.preferred_supplier_id ? supplierMap.get(item.preferred_supplier_id) : undefined;
  const avgCost = cost?.avg_cost ?? null;
  const itemFmt = { uom: item.uom, item_type: item.item_type };
  const onHandTotal = (availQ.data ?? []).reduce((s, a) => s + toNumber(a.on_hand), 0);
  const stockValue = (valuationQ.data ?? []).reduce((s, v) => s + toNumber(v.value), 0);

  const balanceColumns: DataTableColumn<NonNullable<typeof availQ.data>[number]>[] = [
    { key: 'location_name', header: 'Location', render: (a) => <strong>{a.location_name}</strong> },
    { key: 'fresh', header: 'Fresh', align: 'right', render: (a) => <QtyCell qty={a.on_hand_fresh} item={itemFmt} /> },
    { key: 'dayold', header: 'Day-old', align: 'right', render: (a) => (toNumber(a.on_hand_day_old) > 0 ? <QtyCell qty={a.on_hand_day_old} item={itemFmt} /> : <span className="gz-muted">—</span>) },
    { key: 'on_hand', header: 'On hand', align: 'right', render: (a) => <QtyCell qty={a.on_hand} item={itemFmt} strong /> },
    { key: 'allocated', header: 'Allocated', align: 'right', render: (a) => <QtyCell qty={a.allocated} item={itemFmt} /> },
    { key: 'available', header: 'Available', align: 'right', render: (a) => <QtyCell qty={a.available} item={itemFmt} /> },
    { key: 'backordered', header: 'Backordered', align: 'right', render: (a) => (toNumber(a.backordered) > 0 ? <Badge tone="warning">{formatNumber(a.backordered)}</Badge> : <span className="gz-muted">—</span>) },
    { key: 'on_order', header: 'On order', align: 'right', render: (a) => (toNumber(a.on_order) > 0 ? <QtyCell qty={a.on_order} item={itemFmt} /> : <span className="gz-muted">—</span>) },
    { key: 'est', header: 'Est. available', render: (a) => (toNumber(a.available) > 0 ? <span className="gz-muted">Now</span> : <span className="gz-num">{formatDate(a.est_available_date)}</span>) },
    {
      key: 'value', header: 'Value', align: 'right',
      render: (a) => <MoneyCell value={(valuationQ.data ?? []).find((v) => v.location_id === a.location_id)?.value ?? 0} />,
    },
  ];

  const ledgerColumns: DataTableColumn<LedgerRow>[] = [
    { key: 'txn_at', header: 'When', render: (r) => <span className="gz-num">{formatDateTime(r.txn_at)}</span> },
    { key: 'location', header: 'Location', render: (r) => locations.find((l) => l.id === r.location_id)?.name ?? `Location ${r.location_id}` },
    { key: 'txn_type', header: 'Type', render: (r) => TXN_LABELS[r.txn_type] ?? sentenceCase(r.txn_type) },
    { key: 'condition', header: 'Stock', render: (r) => <StatusBadge status={r.condition} /> },
    {
      key: 'reason', header: 'Reason',
      render: (r) => (r.reason_code ? <span title={reasonMap.get(r.reason_code)?.label}><span className="gz-mono">{r.reason_code}</span></span> : <span className="gz-muted">—</span>),
    },
    {
      key: 'qty_delta', header: 'Quantity', align: 'right',
      render: (r) => (
        <span className="gz-num" style={{ color: toNumber(r.qty_delta) < 0 ? 'var(--danger)' : undefined }}>
          {toNumber(r.qty_delta) > 0 ? '+' : ''}
          {formatNumber(r.qty_delta, Number.isInteger(toNumber(r.qty_delta)) ? 0 : 2)}
        </span>
      ),
    },
    { key: 'unit_cost', header: 'Unit cost', align: 'right', render: (r) => <MoneyCell value={r.unit_cost} unitCost /> },
    { key: 'value_delta', header: 'Value', align: 'right', render: (r) => <MoneyCell value={r.value_delta} /> },
    {
      key: 'ref', header: 'Document',
      render: (r) => {
        if (r.ref_label && r.ref_to) return <Link className="gz-link gz-mono" to={r.ref_to}>{r.ref_label}</Link>;
        if (r.ref_label) return <span className="gz-mono">{r.ref_label}</span>;
        return r.note ? <span className="gz-muted">{r.note}</span> : <span className="gz-muted">—</span>;
      },
    },
  ];

  const costPoints: CostPoint[] = costHistoryQ.data ?? [];
  const firstCost = costPoints.find((p) => p.avgCost > 0);
  const lastCost = costPoints[costPoints.length - 1];

  return (
    <div className="gz-stack">
      <PageHeader
        title={item.name}
        breadcrumb={[{ label: 'Stock' }, { label: 'Inventory', to: '/inventory' }, { label: item.name }]}
        subtitle={<><span className="gz-mono">{item.sku}</span> · {sentenceCase(item.item_type)} · {item.category ?? 'No category'}</>}
        actions={
          <>
            {isManager && <Button icon="edit" onClick={() => navigate(`/items?edit=${item.id}`)}>Edit item</Button>}
            <Button icon="tag" onClick={() => navigate('/inventory/labels')}>Print label</Button>
            {hasRole('manager', 'baker') && <Button variant="primary" icon="clipboard" onClick={() => navigate(`/inventory/adjust?item=${item.id}`)}>Adjust stock</Button>}
          </>
        }
      />

      <div className="gz-detail">
        <Card title="Item details">
          <div className="gz-row" style={{ marginBottom: 'var(--space-4)' }}>
            {item.is_active ? <StatusBadge status="active" /> : <StatusBadge status="inactive" />}
            {item.season_start_md && <StatusBadge status="seasonal" label={`Seasonal ${item.season_start_md} to ${item.season_end_md ?? ''}`} />}
            {!reorderQ.isLoading && reorder?.urgency && reorder.urgency !== 'ok' && <StatusBadge status={reorder.urgency} />}
          </div>
          <dl className="stk-facts">
            <div><dt>On hand (all locations)</dt><dd>{availQ.isLoading ? <Skeleton width="60%" /> : <QtyCell qty={onHandTotal} item={itemFmt} strong />}</dd></div>
            <div><dt>Stock value</dt><dd>{valuationQ.isLoading ? <Skeleton width="60%" /> : formatMoney(stockValue)}</dd></div>
            <div><dt>Weighted-average cost</dt><dd>{avgCost === null ? '—' : formatUnitCost(avgCost)}</dd></div>
            <div><dt>List price</dt><dd>{item.list_price === null ? 'Not sold' : formatMoney(item.list_price)}</dd></div>
            <div><dt>Reorder point (stored)</dt><dd>{formatNumber(item.reorder_point, 0)}</dd></div>
            <div>
              <dt>Reorder point (computed)</dt>
              <dd>{reorderQ.isLoading ? <Skeleton width="60%" /> : reorder ? formatNumber(reorder.rop_calc, 1) : 'Not purchased'}</dd>
            </div>
            <div><dt>Lead time</dt><dd>{item.lead_time_days} {item.lead_time_days === 1 ? 'day' : 'days'}</dd></div>
            <div><dt>Pack size</dt><dd>{formatNumber(item.pack_size, 0)}</dd></div>
            <div><dt>Shelf life</dt><dd>{item.shelf_life_days === null ? '—' : `${item.shelf_life_days} days`}</dd></div>
            <div>
              <dt>Preferred supplier</dt>
              <dd>{preferred ? <Link className="gz-link" to={`/suppliers/${preferred.id}`}>{preferred.name}</Link> : '—'}</dd>
            </div>
          </dl>
        </Card>
        <Card title="Barcode" subtitle="Scan this at the counter, when receiving, or when counting.">
          {item.barcode ? <BarcodeLabel value={item.barcode} /> : <p className="gz-muted">This item has no barcode yet. A manager can add one in Items.</p>}
        </Card>
      </div>

      <Card title="Balances by location" subtitle="Fresh and day-old stock, what is promised to open orders, and when more is due." padded={false}>
        {availQ.error ? <ErrorAlert error={availQ.error} /> : (
          <DataTable aria-label="Balances by location" columns={balanceColumns} rows={availQ.data ?? []} rowKey="location_id" density="compact" loading={availQ.isLoading} />
        )}
      </Card>

      <ChartCard
        title="Weighted-average cost over time"
        subtitle="Rebuilt from the stock ledger. Receipts at a new price move it; transfers and sales do not."
        summary={firstCost && lastCost ? `${formatUnitCost(firstCost.avgCost)} on ${formatDate(firstCost.date)}, now ${formatUnitCost(lastCost.avgCost)}` : undefined}
        loading={costHistoryQ.isLoading}
        empty={!costHistoryQ.isLoading && costPoints.length === 0 ? 'No stock movements yet.' : undefined}
        table={{
          rowKey: 'date',
          rows: [...costPoints].reverse().slice(0, 60),
          columns: [
            { key: 'date', header: 'Date', render: (r: CostPoint) => formatDate(r.date) },
            { key: 'avgCost', header: 'Average cost', align: 'right', render: (r: CostPoint) => formatUnitCost(r.avgCost) },
            { key: 'qty', header: 'Quantity on hand', align: 'right', render: (r: CostPoint) => formatNumber(r.qty, 1) },
            { key: 'value', header: 'Value', align: 'right', render: (r: CostPoint) => formatMoney(r.value) },
          ],
        }}
      >
        <LineChart data={costPoints} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="date" {...axisProps} tickFormatter={(d: string) => formatDate(d).replace(/, \d{4}$/, '')} minTickGap={32} />
          <YAxis {...axisProps} tickFormatter={(v: number) => formatMoney(v)} width={64} domain={['auto', 'auto']} />
          <Tooltip content={<ChartTooltip valueFormatter={(v) => formatUnitCost(toNumber(v))} labelFormatter={(l) => formatDate(String(l))} />} />
          <Line type="stepAfter" dataKey="avgCost" name="Average cost" stroke={chartColor(0)} strokeWidth={2} dot={false} />
        </LineChart>
      </ChartCard>

      <Card
        title="Stock ledger"
        subtitle="Every movement for this item, newest first."
        padded={false}
        actions={
          <>
            <Select
              aria-label="Filter ledger by location" value={locFilter} onChange={(e) => { setLocFilter(e.target.value); setPage(0); }}
              options={[{ value: 'all', label: 'All locations' }, ...locations.map((l) => ({ value: String(l.id), label: l.name }))]}
            />
            <Select
              aria-label="Filter ledger by type" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
              options={[{ value: 'all', label: 'All movement types' }, ...Object.entries(TXN_LABELS).map(([value, label]) => ({ value, label }))]}
            />
          </>
        }
      >
        {ledgerQ.error ? <ErrorAlert error={ledgerQ.error} onRetry={() => void ledgerQ.refetch()} /> : (
          <>
            <DataTable
              aria-label="Stock ledger" columns={ledgerColumns} rows={ledgerQ.data?.rows ?? []} density="compact" loading={ledgerQ.isLoading}
              empty="No movements match these filters."
            />
            <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
              <Pagination page={page} pageSize={LEDGER_PAGE} total={ledgerQ.data?.total ?? 0} onPageChange={setPage} />
            </div>
          </>
        )}
      </Card>

      {bomLines.length > 0 && (
        <Card title="Recipe (bill of materials)" subtitle={`What goes into one ${item.name.toLowerCase()}. Rolled-up cost ${formatUnitCost(rolledCost)}.`} padded={false}>
          <DataTable
            aria-label="Bill of materials" rowKey="id" density="compact" rows={bomLines}
            columns={[
              { key: 'component', header: 'Component', render: (b) => <ItemCell item={itemMap.get(b.component_item_id)} to /> },
              { key: 'qty_per', header: 'Quantity per', align: 'right', render: (b) => <span className="gz-num">{formatNumber(b.qty_per, 3)} {itemMap.get(b.component_item_id)?.uom ?? ''}</span> },
              { key: 'cost', header: 'Unit cost', align: 'right', render: (b) => <MoneyCell value={costMap.get(b.component_item_id)?.avg_cost} unitCost /> },
              { key: 'ext', header: 'Cost per unit made', align: 'right', render: (b) => <MoneyCell value={toNumber(b.qty_per) * toNumber(costMap.get(b.component_item_id)?.avg_cost)} unitCost /> },
              { key: 'oh', header: 'On hand', align: 'right', render: (b) => <QtyCell qty={costMap.get(b.component_item_id)?.qty_total} item={itemMap.get(b.component_item_id)} /> },
            ]}
          />
        </Card>
      )}

      {whereUsed.length > 0 && (
        <Card title="Where used" subtitle="Items whose recipe or kit includes this one." padded={false}>
          <DataTable
            aria-label="Where used" rowKey="id" density="compact" rows={whereUsed}
            columns={[
              { key: 'parent', header: 'Used in', render: (b) => <ItemCell item={itemMap.get(b.parent_item_id)} to /> },
              { key: 'type', header: 'Type', render: (b) => sentenceCase(itemMap.get(b.parent_item_id)?.item_type ?? '') },
              { key: 'qty_per', header: 'Quantity per', align: 'right', render: (b) => <span className="gz-num">{formatNumber(b.qty_per, 3)} {item.uom}</span> },
            ]}
          />
        </Card>
      )}

      {suppliedBy.length > 0 && (
        <Card title="Suppliers" subtitle="Who can supply this item and at what price." padded={false}>
          <DataTable<ItemSupplier>
            aria-label="Suppliers for this item" rowKey="supplier_id" density="compact" rows={suppliedBy}
            columns={[
              { key: 'supplier', header: 'Supplier', render: (s) => <Link className="gz-link" to={`/suppliers/${s.supplier_id}`}>{supplierMap.get(s.supplier_id)?.name ?? `Supplier ${s.supplier_id}`}</Link> },
              { key: 'rating', header: 'Rating', render: (s) => <RatingBadge rating={ratingMap.get(s.supplier_id)} /> },
              { key: 'sku', header: 'Supplier SKU', mono: true, render: (s) => s.supplier_sku ?? '—' },
              { key: 'cost', header: 'Unit cost', align: 'right', render: (s) => <MoneyCell value={s.unit_cost} unitCost /> },
              { key: 'lead', header: 'Lead time', align: 'right', render: (s) => `${s.quoted_lead_time_days ?? supplierMap.get(s.supplier_id)?.quoted_lead_time_days ?? '—'} days` },
              { key: 'pack', header: 'Pack size', align: 'right', render: (s) => formatNumber(s.pack_size, 0) },
              { key: 'pref', header: '', render: (s) => (s.is_preferred ? <Badge tone="accent">Preferred</Badge> : null) },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

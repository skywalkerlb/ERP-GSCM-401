import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert, Badge, Button, Card, Checkbox, DataTable, Dialog, EmptyState, MoneyCell, PageHeader, QtyCell, Select, StatCard, StatusBadge, TextField, Toolbar,
  type DataTableColumn,
} from '@/components';
import {
  STOCK_DOMAINS, costLookup, indexBy, toNumber, useAction, useBomLines, useItemCosts, useItemSuppliers, useItems,
} from '@/features/items/api';
import { ErrorAlert, plural } from '@/features/items/ui';
import { useLocations } from '@/hooks/useLocations';
import { formatDate, formatMoney, formatNumber, formatWeekday } from '@/lib/format';
import { rpc } from '@/lib/rpc';
import type { AutoReplenishPo, Item, MrpRow } from '@/types/domain';
import { driversFor, useMrpWeekly, usePlacedOrders, type DriverRow } from './api';
import '@/features/items/stock.css';

interface ItemPlan { item_id: number; sku: string; name: string; uom: MrpRow['uom']; supplier_id: number | null; supplier_name: string | null; lead: number; pack: number; weeks: MrpRow[]; planned: number; expedite: boolean }

export default function MrpPage() {
  const navigate = useNavigate();
  const [forecast, setForecast] = useState(false);
  const [onlyOrders, setOnlyOrders] = useState(false);
  const [search, setSearch] = useState('');
  const [horizon, setHorizon] = useState('7');
  const [drill, setDrill] = useState<ItemPlan | null>(null);
  const [made, setMade] = useState<AutoReplenishPo[] | null>(null);

  const mrpQ = useMrpWeekly(forecast);
  const baseQ = useMrpWeekly(false);
  const ordersQ = usePlacedOrders();
  const bomQ = useBomLines();
  const itemsQ = useItems();
  const costsQ = useItemCosts();
  const suppliedQ = useItemSuppliers();
  const locationsQ = useLocations();

  const itemMap = useMemo(() => indexBy(itemsQ.data, (i) => i.id), [itemsQ.data]);
  const costOf = useMemo(() => costLookup(costsQ.data, suppliedQ.data, itemsQ.data), [costsQ.data, suppliedQ.data, itemsQ.data]);
  const kitchen = locationsQ.data?.find((l) => l.kind === 'kitchen') ?? locationsQ.data?.[0];
  const recipeParents = (itemsQ.data ?? []).filter((i) => i.is_active && bomQ.data?.some((b) => b.parent_item_id === i.id));
  const queries = [mrpQ, baseQ, ordersQ, bomQ, itemsQ, costsQ, suppliedQ, locationsQ];
  const error = queries.find((q) => q.error)?.error;
  const retry = () => { for (const q of queries) void q.refetch(); };

  const plans = useMemo<ItemPlan[]>(() => {
    const by = new Map<number, ItemPlan>();
    for (const r of mrpQ.data ?? []) {
      let p = by.get(r.item_id);
      if (!p) {
        p = { item_id: r.item_id, sku: r.sku, name: r.item_name, uom: r.uom, supplier_id: r.supplier_id, supplier_name: r.supplier_name, lead: r.lead_time_days, pack: toNumber(r.pack_size, 1), weeks: [], planned: 0, expedite: false };
        by.set(r.item_id, p);
      }
      p.weeks.push(r);
      p.planned += toNumber(r.planned_order_qty);
      if (r.is_expedite && toNumber(r.planned_order_qty) > 0) p.expedite = true;
    }
    for (const p of by.values()) p.weeks.sort((a, b) => a.week_no - b.week_no);
    return [...by.values()].sort((a, b) => Number(b.expedite) - Number(a.expedite) || Number(b.planned > 0) - Number(a.planned > 0) || a.name.localeCompare(b.name));
  }, [mrpQ.data]);

  const weekDefs = useMemo(() => {
    const seen = new Map<number, { week_no: number; week_start: string; week_end: string }>();
    for (const r of mrpQ.data ?? []) seen.set(r.week_no, { week_no: r.week_no, week_start: r.week_start, week_end: r.week_end });
    return [...seen.values()].sort((a, b) => a.week_no - b.week_no);
  }, [mrpQ.data]);

  const planned = useMemo(
    () => (mrpQ.data ?? []).filter((r) => toNumber(r.planned_order_qty) > 0).sort((a, b) => (a.order_by_date ?? '').localeCompare(b.order_by_date ?? '') || a.item_name.localeCompare(b.item_name)),
    [mrpQ.data],
  );
  const plannedValue = planned.reduce((s, r) => s + toNumber(r.planned_order_qty) * costOf(r.item_id), 0);
  const expediteCount = plans.filter((p) => p.expedite).length;

  const shown = plans.filter((p) => (!onlyOrders || p.planned > 0) && (!search.trim() || `${p.name} ${p.sku}`.toLowerCase().includes(search.trim().toLowerCase())));

  const createAll = useAction(
    () => rpc.autoReplenish({ use_rop: false, use_mrp: true, horizon_days: Number(horizon) }),
    {
      invalidate: STOCK_DOMAINS, errorTitle: 'Could not create the purchase orders',
      success: (r) => (r.length ? `${plural(r.length, 'draft purchase order')} created from the plan.` : 'No planned orders are due to be placed in that window.'),
      onSuccess: setMade,
    },
  );
  const createOne = useAction(
    (r: MrpRow) => rpc.createPurchaseOrder({ supplier: r.supplier_id!, ship_to: kitchen!.id, source: 'manual', notes: `Material plan, week ${r.week_no}`, lines: [{ item_id: r.item_id, qty: toNumber(r.planned_order_qty) }] }),
    { invalidate: STOCK_DOMAINS, errorTitle: 'Could not create the purchase order', success: 'Draft purchase order created.', onSuccess: (id) => navigate(`/purchasing/${id}`) },
  );

  const plannedColumns: DataTableColumn<MrpRow>[] = [
    { key: 'item', header: 'Component', render: (r) => <span className="stk-item"><span className="stk-item__name">{r.item_name}</span><span className="stk-item__sub gz-mono text-body-sm">{r.sku}</span></span> },
    { key: 'supplier', header: 'Supplier', render: (r) => r.supplier_name ?? <span className="gz-muted">No preferred supplier</span> },
    { key: 'week', header: 'Week', render: (r) => `Week ${r.week_no}, from ${formatWeekday(r.week_start)}` },
    { key: 'req', header: 'Needed by', render: (r) => <span className="gz-num">{formatDate(r.requirement_date)}</span> },
    { key: 'lead', header: 'Lead time', align: 'right', render: (r) => `${r.lead_time_days} days` },
    { key: 'order_by', header: 'Order by', sortable: true, sortValue: (r) => r.order_by_date ?? '', render: (r) => <span className="gz-num">{formatDate(r.order_by_date)}</span> },
    { key: 'flag', header: '', render: (r) => (r.is_expedite ? <StatusBadge status="expedite" label="Expedite" /> : <Badge tone="info">On schedule</Badge>) },
    { key: 'qty', header: 'Planned order', align: 'right', render: (r) => <QtyCell qty={r.planned_order_qty} uom={r.uom} dozens={false} strong /> },
    { key: 'cost', header: 'Est. cost', align: 'right', render: (r) => <MoneyCell value={toNumber(r.planned_order_qty) * costOf(r.item_id)} /> },
    {
      key: 'po', header: '', align: 'right',
      render: (r) => <Button size="sm" disabled={forecast || !!error || loading || !r.supplier_id || !kitchen || createOne.isPending || createAll.isPending} onClick={() => createOne.mutate(r)}>Create PO</Button>,
    },
  ];

  const baseByKey = useMemo(() => new Map((baseQ.data ?? []).map((r) => [`${r.item_id}:${r.week_no}`, r])), [baseQ.data]);
  const loading = queries.some((q) => q.isLoading);

  return (
    <div className="gz-stack">
      <PageHeader
        title="Material planning"
        breadcrumb={[{ label: 'Buy' }, { label: 'Material planning' }]}
        subtitle="What confirmed orders will need over the next four weeks, what is on order, and when to order the rest."
        actions={
          <Button variant="primary" icon="sparkles" onClick={() => createAll.mutate(undefined)} disabled={forecast || !!error || loading || createAll.isPending || createOne.isPending || planned.length === 0}>
            {createAll.isPending ? 'Creating' : 'Create POs for planned orders'}
          </Button>
        }
      />
      {error && <ErrorAlert error={error} onRetry={retry} />}

      {made && (
        <Alert tone={made.length ? 'success' : 'info'} title={made.length ? `${plural(made.length, 'draft PO')} created` : 'Nothing due to order yet'} action={<Button size="sm" onClick={() => setMade(null)}>Dismiss</Button>}>
          {made.length
            ? <>{made.map((p, i) => <span key={p.po_id}>{i > 0 && ', '}<Link className="gz-link" to={`/purchasing/${p.po_id}`}>{p.po_number}</Link> ({p.supplier}, {formatMoney(p.total)})</span>)}.</>
            : `No planned order has an order-by date within the next ${horizon} days. Widen the window to include later weeks.`}
        </Alert>
      )}

      <div className="gz-grid-stats">
        <StatCard label="Components with demand" value={formatNumber(plans.length)} icon="layers" tint="lilac" caption="Over the next 4 weeks" />
        <StatCard label="Need an order" value={formatNumber(plans.filter((p) => p.planned > 0).length)} icon="bag" tint="pink" caption={`${plural(planned.length, 'planned order')}`} />
        <StatCard label="Expedite" value={formatNumber(expediteCount)} icon="alert" tint={expediteCount ? 'butter' : 'mint'} caption="Order-by date already passed" />
        <StatCard label="Planned spend" value={formatMoney(plannedValue)} icon="money" tint="mint" caption="At average or quoted cost" />
      </div>

      <Card title="How this plan is worked out" subtitle="Single-level MRP, one component at a time, week by week.">
        <div className="gz-grid-2 text-body-sm">
          <ul style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
            <li><strong>Gross requirement</strong> = confirmed sales-order quantity × each recipe or kit quantity per parent{forecast ? ', plus the latest forecast × quantity per' : ''}. Overdue orders count in week 1.</li>
            <li><strong>Scheduled receipts</strong> = quantity still due on sent purchase orders, using each line&apos;s expected date. Received and cancelled quantities are excluded.</li>
            <li><strong>Net requirement</strong> = the largest shortage during the week after subtracting starting stock and receipts due by each requirement date. A later receipt cannot cover an earlier need.</li>
          </ul>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
            <li><strong>Planned order</strong> = net requirement rounded up to the supplier pack size.</li>
            <li><strong>Order by</strong> = date it is first needed − the item&apos;s lead time. If that date has passed, the order is flagged <strong>Expedite</strong>.</li>
            <li><strong>Projected on hand</strong> = start + receipts + planned order − gross, carried into the next week.</li>
            <li>Stock is pooled across locations. Manufacturing issues recipe components when a batch starts; selling a kit issues its components at checkout.</li>
          </ul>
        </div>
      </Card>

      <Card
        title="Planned orders"
        subtitle="Every week where stock and open orders fall short."
        padded={false}
        actions={
          <Select
            label="Create orders due within" value={horizon} onChange={(e) => setHorizon(e.target.value)}
            options={[{ value: '3', label: 'Order-by within 3 days' }, { value: '7', label: 'Order-by within 7 days' }, { value: '14', label: 'Order-by within 14 days' }, { value: '28', label: 'Order-by within 28 days' }]}
          />
        }
      >
        <DataTable<MrpRow>
          aria-label="Planned orders" rows={planned.map((r) => ({ ...r, id: `${r.item_id}-${r.week_no}` })) as unknown as MrpRow[]} rowKey="id" columns={plannedColumns} density="compact" loading={loading}
          empty={<EmptyState icon="checkCircle" title={error ? 'Plan unavailable' : 'No planned orders'} description={error ? 'Retry loading the plan before making purchasing decisions.' : 'Stock and open orders cover everything confirmed for the next four weeks.'} />}
        />
      </Card>

      <div>
        <Toolbar end={<span className="gz-muted text-body-sm">{plural(shown.length, 'component')}</span>}>
          <TextField label="Search components" icon="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or SKU" className="stk-toolbar-field" />
          <Checkbox label="Include the forecast" checked={forecast} onChange={(e) => setForecast(e.target.checked)} />
          <Checkbox label="Only components that need an order" checked={onlyOrders} onChange={(e) => setOnlyOrders(e.target.checked)} />
        </Toolbar>
        {forecast && <Alert tone="info" title="Forecast demand is included">Gross requirements also count the newest forecast run. Turn this off to create purchase orders from confirmed demand.</Alert>}
        <div className="gz-stack gz-stack--sm" style={{ marginTop: 'var(--space-4)' }}>
          {loading && <Card><DataTable aria-label="Loading" columns={[{ key: 'a', header: 'Component' }]} rows={[]} loading /></Card>}
          {!loading && !error && shown.length === 0 && <EmptyState icon="layers" title="No demand to plan" description="Confirmed sales orders will show the components they need here." />}
          {shown.map((p) => (
            <Card
              key={p.item_id}
              title={<span className="gz-row" style={{ gap: 'var(--space-2)' }}><Link className="gz-link" to={`/inventory/${p.item_id}`}>{p.name}</Link><span className="gz-mono text-body-sm gz-muted">{p.sku}</span>{p.expedite && <StatusBadge status="expedite" label="Expedite" />}</span>}
              subtitle={`${p.supplier_name ?? 'No preferred supplier'} · lead time ${p.lead} days · packs of ${formatNumber(p.pack, 3)} · ${p.uom}`}
              padded={false}
              actions={<Button size="sm" icon="search" onClick={() => setDrill(p)}>What drives this</Button>}
            >
              <WeekGrid plan={p} />
            </Card>
          ))}
        </div>
      </div>

      <Card title="Parent items and bills of material" subtitle={`${recipeParents.length} active parent items with recipes or kits. Quantities below are per one parent unit.`} padded={false} actions={<Link className="gz-link" to="/items">Manage items and recipes</Link>}>
        {!itemsQ.isLoading && !bomQ.isLoading && !itemsQ.error && !bomQ.error && recipeParents.length < 5 && <Alert tone="warning" title="Add at least five parent items">Open Items to add recipes or kits and their component quantities.</Alert>}
        <DataTable<Item> aria-label="Parent bills of material" rows={recipeParents} loading={itemsQ.isLoading || bomQ.isLoading} columns={[
          { key: 'name', header: 'Parent item', render: (i) => <Link className="gz-link" to={`/items?edit=${i.id}`}>{i.name}</Link> },
          { key: 'sku', header: 'SKU', mono: true },
          { key: 'components', header: 'Components per unit · lead time', render: (i) => <ul style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>{(bomQ.data ?? []).filter((b) => b.parent_item_id === i.id).map((b) => {
            const component = itemMap.get(b.component_item_id);
            return <li key={b.id}>{component?.name ?? 'Unknown component'}: {formatNumber(b.qty_per, 5)} {component?.uom} · {component?.lead_time_days ?? '—'} days</li>;
          })}</ul> },
        ]} />
      </Card>

      <DrillDialog
        plan={drill} onClose={() => setDrill(null)} weeks={weekDefs} itemMap={itemMap}
        orders={ordersQ.data ?? []} bom={bomQ.data ?? []} forecast={forecast} base={baseByKey}
      />
    </div>
  );
}

function WeekGrid({ plan }: { plan: ItemPlan }) {
  const q = (n: number | string | null | undefined) => <QtyCell qty={n} uom={plan.uom} dozens={false} />;
  const metrics: Array<{ key: string; label: string; cell: (w: MrpRow) => React.ReactNode }> = [
    { key: 'start', label: 'On hand at start', cell: (w) => q(w.beginning_on_hand) },
    { key: 'gross', label: 'Gross requirements', cell: (w) => q(w.gross_req) },
    { key: 'sched', label: 'Scheduled receipts', cell: (w) => q(w.scheduled_receipts) },
    { key: 'net', label: 'Net requirements', cell: (w) => (toNumber(w.net_req) > 0 ? <strong>{q(w.net_req)}</strong> : q(0)) },
    { key: 'planned', label: 'Planned order', cell: (w) => (toNumber(w.planned_order_qty) > 0 ? <Badge tone="info">{formatNumber(w.planned_order_qty, 3)}</Badge> : <span className="gz-muted">—</span>) },
    { key: 'proj', label: 'Projected on hand', cell: (w) => q(w.projected_on_hand) },
    {
      key: 'by', label: 'Order by',
      cell: (w) => toNumber(w.planned_order_qty) > 0 ? (
        <span className="gz-row" style={{ gap: 'var(--space-1)', justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
          <span className="gz-num">{formatDate(w.order_by_date)}</span>{w.is_expedite && <StatusBadge status="expedite" label="Expedite" />}
        </span>
      ) : <span className="gz-muted">—</span>,
    },
  ];
  const columns: DataTableColumn<{ id: string; key: string; label: string; cell: (w: MrpRow) => React.ReactNode }>[] = [
    { key: 'label', header: 'Row', render: (m) => m.label },
    ...plan.weeks.map((w) => ({
      key: `w${w.week_no}`, align: 'right' as const,
      header: <span>Week {w.week_no}<span className="stk-sub">{formatWeekday(w.week_start)}</span></span>,
      render: (m: { cell: (w: MrpRow) => React.ReactNode }) => m.cell(w),
    })),
  ];
  return <DataTable aria-label={`Weekly plan for ${plan.name}`} className="stk-mrp-grid" density="compact" columns={columns} rows={metrics.map((m) => ({ ...m, id: m.key }))} />;
}

function DrillDialog({ plan, onClose, weeks, itemMap, orders, bom, forecast, base }: {
  plan: ItemPlan | null; onClose: () => void; weeks: Array<{ week_no: number; week_start: string; week_end: string }>; itemMap: Map<number, Item>;
  orders: ReturnType<typeof usePlacedOrders>['data'] & object; bom: Parameters<typeof driversFor>[2]; forecast: boolean; base: Map<string, MrpRow>;
}) {
  const locationsQ = useLocations();
  const locMap = useMemo(() => indexBy(locationsQ.data, (l) => l.id), [locationsQ.data]);
  const rows = useMemo<DriverRow[]>(() => {
    if (!plan) return [];
    const list = driversFor(plan.item_id, orders, bom, itemMap, weeks);
    if (forecast) {
      for (const w of plan.weeks) {
        const diff = toNumber(w.gross_req) - toNumber(base.get(`${plan.item_id}:${w.week_no}`)?.gross_req);
        if (diff > 0.0005) list.push({ key: `fc-${w.week_no}`, soId: null, soNumber: null, locationId: null, needDate: w.week_start, weekNo: w.week_no, parent: null, parentQty: 0, qtyPer: 0, qty: diff, kind: 'forecast' });
      }
    }
    return list.sort((a, b) => a.weekNo - b.weekNo || (a.needDate ?? '').localeCompare(b.needDate ?? ''));
  }, [plan, orders, bom, itemMap, weeks, forecast, base]);
  const total = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <Dialog
      open={plan !== null} onClose={onClose} size="lg" title={plan ? `What drives ${plan.name}` : 'Drivers'}
      description="Open sales orders and the parent items that need this component."
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {plan && (
        <DataTable<DriverRow>
          aria-label="Demand drivers" rowKey="key" density="compact" rows={rows}
          empty="No open sales orders need this component. Its demand may come entirely from the forecast."
          columns={[
            { key: 'week', header: 'Week', render: (r) => `Week ${r.weekNo}` },
            { key: 'need', header: 'Needed', render: (r) => <span className="gz-num">{formatDate(r.needDate)}</span> },
            { key: 'so', header: 'Source', render: (r) => (r.kind === 'forecast' ? <Badge tone="accent">Forecast</Badge> : <Link className="gz-link gz-mono" to={`/orders/${r.soId}`}>{r.soNumber}</Link>) },
            { key: 'loc', header: 'Pickup at', render: (r) => (r.locationId ? locMap.get(r.locationId)?.name ?? '—' : '—') },
            { key: 'parent', header: 'Parent item', render: (r) => (r.parent ? r.parent.name : r.kind === 'forecast' ? 'Forecast sales' : 'This item') },
            { key: 'pq', header: 'Parent qty', align: 'right', render: (r) => (r.kind === 'forecast' ? '—' : formatNumber(r.parentQty, 0)) },
            { key: 'per', header: 'Qty per', align: 'right', render: (r) => (r.kind === 'forecast' ? '—' : formatNumber(r.qtyPer, 3)) },
            { key: 'qty', header: `Requirement (${plan.uom})`, align: 'right', render: (r) => <strong className="gz-num">{formatNumber(r.qty, 2)}</strong> },
          ]}
        />
      )}
      {plan && rows.length > 0 && <p className="gz-muted text-body-sm" style={{ marginTop: 'var(--space-3)' }}>Total gross requirement over four weeks: {formatNumber(total, 2)} {plan.uom}.</p>}
    </Dialog>
  );
}

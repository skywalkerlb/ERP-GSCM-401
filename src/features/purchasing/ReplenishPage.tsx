import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert, Badge, Button, Card, Checkbox, DataTable, EmptyState, MoneyCell, PageHeader, QtyCell, Select, StatCard, StatusBadge, Toolbar,
  type DataTableColumn,
} from '@/components';
import { STOCK_DOMAINS, indexBy, toNumber, useAction, useAppSettings, useItems } from '@/features/items/api';
import { ErrorAlert, ItemCell, plural } from '@/features/items/ui';
import { formatDate, formatMoney, formatNumber, formatUnitCost } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { reports, rpc, views } from '@/lib/rpc';
import type { AutoReplenishPo, ReorderAnalysisRow, ReplenishSuggestion } from '@/types/domain';

const SOURCE_LABEL: Record<string, string> = { rop: 'Reorder point', mrp: 'Material plan', 'rop+mrp': 'Both' };

export default function ReplenishPage() {
  const navigate = useNavigate();
  const itemsQ = useItems();
  const settingsQ = useAppSettings();
  const [useRop, setUseRop] = useState(true);
  const [useMrp, setUseMrp] = useState(true);
  const [horizon, setHorizon] = useState('7');
  const [created, setCreated] = useState<AutoReplenishPo[] | null>(null);
  const [formulaItem, setFormulaItem] = useState<string>('');

  const sugQ = useQuery({
    queryKey: queryKeys.purchasing.scope('replenish', { useRop, useMrp, horizon }),
    queryFn: () => reports.replenishSuggestions({ use_rop: useRop, use_mrp: useMrp, horizon_days: Number(horizon) }),
  });
  const analysisQ = useQuery({ queryKey: queryKeys.purchasing.scope('reorder-analysis'), queryFn: () => views.reorderAnalysis() });

  const itemMap = useMemo(() => indexBy(itemsQ.data, (i) => i.id), [itemsQ.data]);
  const analysis = useMemo(() => indexBy(analysisQ.data, (a) => a.item_id), [analysisQ.data]);
  const rows = useMemo(() => sugQ.data ?? [], [sugQ.data]);
  const orderable = rows.filter((r) => !r.has_open_draft);
  const totalSpend = orderable.reduce((s, r) => s + toNumber(r.line_total), 0);
  const supplierCount = new Set(orderable.map((r) => r.supplier_id)).size;
  const lateCount = orderable.filter((r) => r.urgency === 'late').length;

  const run = useAction(
    () => rpc.autoReplenish({ use_rop: useRop, use_mrp: useMrp, horizon_days: Number(horizon) }),
    {
      invalidate: STOCK_DOMAINS, errorTitle: 'Could not create the draft orders',
      success: (r) => (r.length ? `${plural(r.length, 'draft purchase order')} created.` : 'Nothing needed ordering right now.'),
      onSuccess: setCreated,
    },
  );
  const send = useAction((poId: number) => rpc.sendPurchaseOrder({ po_id: poId }), {
    invalidate: STOCK_DOMAINS, success: 'Order sent.', errorTitle: 'Could not send the order',
  });
  const [sent, setSent] = useState<Set<number>>(new Set());
  async function sendOne(poId: number) {
    await send.mutateAsync(poId).then(() => setSent((s) => new Set(s).add(poId))).catch(() => undefined);
  }

  const columns: DataTableColumn<ReplenishSuggestion>[] = [
    { key: 'item', header: 'Item', sortable: true, sortValue: (r) => r.name, render: (r) => <ItemCell item={{ id: r.item_id, name: r.name, sku: r.sku }} to /> },
    { key: 'supplier', header: 'Supplier', sortable: true, sortValue: (r) => r.supplier_name, render: (r) => <Link className="gz-link" to={`/suppliers/${r.supplier_id}`}>{r.supplier_name}</Link> },
    { key: 'why', header: 'Why', render: (r) => <Why row={r} a={analysis.get(r.item_id)} /> },
    { key: 'eoq', header: 'EOQ', align: 'right', render: (r) => { const e = analysis.get(r.item_id)?.eoq; return e ? <QtyCell qty={e} uom={r.uom} dozens={false} /> : <span className="gz-muted">—</span>; } },
    { key: 'qty', header: 'Order qty', align: 'right', sortable: true, render: (r) => <QtyCell qty={r.qty} uom={r.uom} dozens={false} strong /> },
    { key: 'unit_cost', header: 'Unit cost', align: 'right', render: (r) => <MoneyCell value={r.unit_cost} unitCost /> },
    { key: 'line_total', header: 'Line total', align: 'right', sortable: true, render: (r) => <MoneyCell value={r.line_total} strong /> },
    { key: 'order_by', header: 'Order by', sortable: true, sortValue: (r) => r.order_by_date ?? '9999', render: (r) => <span className="gz-num">{r.order_by_date ? formatDate(r.order_by_date) : '—'}</span> },
    {
      key: 'urgency', header: 'Status',
      render: (r) =>
        r.has_open_draft ? <Badge tone="neutral">On a draft PO</Badge>
        : r.urgency === 'ok' ? <Badge tone="info">Planned</Badge>
        : <StatusBadge status={r.urgency} />,
    },
  ];

  const formulaChoices = rows.filter((r) => analysis.get(r.item_id));
  const chosen = formulaChoices.find((r) => String(r.item_id) === formulaItem) ?? formulaChoices[0];
  const chosenAnalysis = chosen ? analysis.get(chosen.item_id) : undefined;

  const poTotal = created?.reduce((s, p) => s + toNumber(p.total), 0) ?? 0;

  return (
    <div className="gz-stack">
      <PageHeader
        title="Auto-replenish"
        breadcrumb={[{ label: 'Buy' }, { label: 'Purchasing', to: '/purchasing' }, { label: 'Auto-replenish' }]}
        subtitle="What to order now, why, and how much. One click turns it into draft purchase orders grouped by supplier."
        actions={
          <Button variant="primary" icon="sparkles" onClick={() => run.mutate(undefined)} disabled={run.isPending || orderable.length === 0}>
            {run.isPending ? 'Creating' : 'Create draft POs'}
          </Button>
        }
      />
      {(sugQ.error || analysisQ.error) && <ErrorAlert error={sugQ.error ?? analysisQ.error} onRetry={() => { void sugQ.refetch(); void analysisQ.refetch(); }} />}

      {created && (
        <Card
          title={created.length ? `${plural(created.length, 'draft PO')} created, ${formatMoney(poTotal)} in total` : 'Nothing to order'}
          subtitle={created.length ? 'Review them, then send each one to its supplier.' : 'Everything is above its reorder point and covered by open orders.'}
          actions={created.length ? <Button variant="ghost" onClick={() => setCreated(null)}>Dismiss</Button> : undefined}
        >
          <div className="gz-stack gz-stack--sm">
            {created.map((p) => (
              <div key={p.po_id} className="gz-card" style={{ padding: 'var(--space-4)', boxShadow: 'none' }}>
                <div className="gz-row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong>{p.supplier}</strong>{' '}
                    <Link className="gz-link gz-mono" to={`/purchasing/${p.po_id}`}>{p.po_number}</Link>
                    <span className="stk-sub text-body-sm">{plural(p.lines.length, 'line')}: {p.lines.map((l) => l.name).join(', ')}</span>
                  </div>
                  <div className="gz-row">
                    <strong className="gz-num">{formatMoney(p.total)}</strong>
                    <Button size="sm" icon="printer" onClick={() => navigate(`/purchasing/${p.po_id}/print`)}>Print</Button>
                    {sent.has(p.po_id) ? <StatusBadge status="sent" label="Order sent" /> : <Button size="sm" icon="truck" onClick={() => void sendOne(p.po_id)} disabled={send.isPending}>Send</Button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="gz-grid-stats">
        <StatCard label="Items to order" value={formatNumber(orderable.length)} icon="package" tint="pink" caption={`${plural(rows.length - orderable.length, 'item')} already on a draft`} />
        <StatCard label="Suppliers" value={formatNumber(supplierCount)} icon="building" tint="lilac" caption="One draft PO each" />
        <StatCard label="Estimated spend" value={formatMoney(totalSpend)} icon="money" tint="mint" caption="At each supplier's quoted cost" />
        <StatCard label="Late to order" value={formatNumber(lateCount)} icon="clock" tint={lateCount ? 'butter' : 'mint'} caption="Order-by date already passed" />
      </div>

      <div>
        <Toolbar end={<Button variant="ghost" onClick={() => navigate('/purchasing/review')}>Periodic review instead</Button>}>
          <Checkbox label="Reorder point and EOQ" checked={useRop} onChange={(e) => setUseRop(e.target.checked)} />
          <Checkbox label="Material plan (MRP)" checked={useMrp} onChange={(e) => setUseMrp(e.target.checked)} />
          <Select
            label="MRP horizon" value={horizon} onChange={(e) => setHorizon(e.target.value)} className="stk-toolbar-field--sm"
            options={[{ value: '3', label: 'Next 3 days' }, { value: '7', label: 'Next 7 days' }, { value: '14', label: 'Next 14 days' }, { value: '28', label: 'Next 28 days' }]}
          />
        </Toolbar>
        <DataTable<ReplenishSuggestion>
          aria-label="Replenishment suggestions" columns={columns} rows={rows} rowKey="item_id" loading={sugQ.isLoading || itemsQ.isLoading}
          defaultSort={{ key: 'order_by', dir: 'asc' }}
          empty={<EmptyState icon="checkCircle" title="Nothing needs ordering" description="Every item is above its reorder point and covered by open orders. Nice and stocked." />}
        />
      </div>

      <Card
        title="How the numbers are worked out"
        subtitle="Live inputs for one item. Pick an item to see its own numbers."
        actions={
          formulaChoices.length > 0 ? (
            <Select
              aria-label="Item to explain" value={String(chosen?.item_id ?? '')} onChange={(e) => setFormulaItem(e.target.value)} className="stk-toolbar-field--sm"
              options={formulaChoices.map((r) => ({ value: String(r.item_id), label: itemMap.get(r.item_id)?.name ?? r.name }))}
            />
          ) : undefined
        }
      >
        {chosenAnalysis && settingsQ.data ? <Formulas a={chosenAnalysis} z={toNumber(settingsQ.data.service_level_z)} /> : <p className="gz-muted">Suggestions appear here once there is something to order.</p>}
      </Card>
    </div>
  );
}

function Why({ row, a }: { row: ReplenishSuggestion; a: ReorderAnalysisRow | undefined }) {
  const rop = a ? toNumber(a.rop_calc) : null;
  return (
    <span>
      {a && rop !== null && (row.source === 'rop' || row.source === 'rop+mrp') && (
        <span className="gz-num">Position {formatNumber(a.inventory_position, 1)} is at or under reorder point {formatNumber(rop, 1)}</span>
      )}
      {(row.source === 'mrp' || row.source === 'rop+mrp') && <span className="stk-sub text-body-sm">Material plan needs {formatNumber(row.mrp_qty, 1)} {row.uom}</span>}
      <span className="stk-sub text-body-sm">Source: {SOURCE_LABEL[row.source] ?? row.source}</span>
    </span>
  );
}

function Formulas({ a, z }: { a: ReorderAnalysisRow; z: number }) {
  const D = toNumber(a.annual_demand);
  const S = toNumber(a.ordering_cost);
  const H = toNumber(a.holding_cost_rate);
  const C = toNumber(a.unit_cost);
  const pack = toNumber(a.pack_size, 1);
  const eoqRaw = H * C > 0 ? Math.sqrt((2 * D * S) / (H * C)) : 0;
  const eoqPacked = pack > 0 ? Math.ceil(eoqRaw / pack - 1e-9) * pack : eoqRaw;
  const d = toNumber(a.avg_daily_usage);
  const sd = toNumber(a.sigma_daily_usage);
  const L = toNumber(a.lead_time_days);
  const sL = toNumber(a.sigma_lead_days);
  const ss = z * Math.sqrt(L * sd * sd + d * d * sL * sL);
  const f = (n: number, dec = 2) => formatNumber(n, dec);
  const blocks: Array<{ name: string; eq: string; live: string; out: string; note?: string }> = [
    {
      name: 'Economic order quantity',
      eq: 'EOQ = √(2 · D · S / H)',
      live: `√(2 · ${f(D, 0)} · ${formatMoney(S)} / (${f(H * 100, 0)}% · ${formatUnitCost(C)}))`,
      out: `${f(eoqRaw, 1)}, rounded up to packs of ${f(pack, 0)} = ${f(eoqPacked, 0)}. Database: ${a.eoq ? f(toNumber(a.eoq), 0) : '—'}`,
      note: 'D is yearly demand, S the cost of placing an order, H the yearly holding cost per unit.',
    },
    {
      name: 'Safety stock',
      eq: 'SS = z · √(L · σd² + d̄² · σL²)',
      live: `${f(z)} · √(${f(L, 1)} · ${f(sd)}² + ${f(d)}² · ${f(sL)}²)`,
      out: `${f(ss, 1)}. Database: ${f(toNumber(a.safety_stock), 1)}`,
      note: 'z comes from the service level in settings. σd is daily usage variation, σL is lead time variation.',
    },
    {
      name: 'Reorder point',
      eq: 'ROP = d̄ · L + SS',
      live: `${f(d)} · ${f(L, 1)} + ${f(toNumber(a.safety_stock), 1)}`,
      out: `${f(toNumber(a.rop_calc), 1)} (stored on the item: ${f(toNumber(a.rop_stored), 1)})`,
      note: 'd̄ is average daily usage and L the lead time in days.',
    },
    {
      name: 'When to order, and how much',
      eq: 'IP = on hand + on order − backordered. Order when IP ≤ ROP, for ROP + EOQ − IP',
      live: `IP = ${f(toNumber(a.on_hand), 1)} + ${f(toNumber(a.on_order), 1)} − ${f(toNumber(a.backordered), 1)} = ${f(toNumber(a.inventory_position), 1)}`,
      out: a.below_rop ? `Order ${f(toNumber(a.suggested_qty), 0)} (to the next full pack)` : 'Above the reorder point, no order yet',
      note: a.order_by_date ? `Stock-out expected ${formatDate(a.stockout_date)}, so order by ${formatDate(a.order_by_date)}.` : undefined,
    },
  ];
  return (
    <div className="gz-stack gz-stack--sm">
      <p className="gz-muted text-body-sm" style={{ margin: 0 }}>
        {a.name}: uses {f(d)} a day, takes {f(L, 1)} days to arrive. Numbers are recalculated here and shown beside the database values.
      </p>
      {blocks.map((b) => (
        <div key={b.name} className="stk-formula">
          <strong>{b.name}</strong>
          <span className="stk-formula__eq">{b.eq}</span>
          <span className="stk-formula__live">{b.live}</span>
          <span className="stk-formula__out">{b.out}</span>
          {b.note && <span className="gz-muted text-body-sm">{b.note}</span>}
        </div>
      ))}
      <Alert tone="info" title="Two sources, one order">
        Reorder-point suggestions look back at usage. Material-plan suggestions look ahead at confirmed sales orders. When both fire for the same item, the larger quantity wins.
      </Alert>
    </div>
  );
}

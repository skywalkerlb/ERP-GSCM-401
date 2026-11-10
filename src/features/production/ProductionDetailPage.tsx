import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Badge, Button, Card, ConfirmDialog, DataTable, DocNo, EmptyState, MoneyCell, PageHeader, QtyCell, Select, Skeleton,
  StatusBadge, TextField, useToast, type DataTableColumn,
} from '@/components';
import { useRole } from '@/hooks/useRole';
import { businessDate, daysBetween, formatDate, formatDateTime, formatItemQty, formatMoney, formatNumber, formatPct, formatUnitCost } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { rpc, rpcErrorMessage } from '@/lib/rpc';
import { canCall, type DefectInput } from '@/types/domain';
import { RequirementsTable } from './RequirementsTable';
import {
  formatDuration, getBakePlanNo, getIssuedComponents, getProductionDefects, getProductionOrder, invalidateMake, useMakeRefs,
  useReasonCodes, type ProductionOrderRow, type Requirement,
} from './api';

interface DefectRow { reason: string; qty: string }

export default function ProductionDetailPage() {
  const { id } = useParams();
  const moId = Number(id);
  const { role } = useRole();
  const refs = useMakeRefs();

  const order = useQuery({
    queryKey: queryKeys.production.detail(moId),
    enabled: Number.isFinite(moId),
    queryFn: () => getProductionOrder(moId),
  });
  const mo = order.data ?? null;
  const started = mo !== null && mo.status !== 'planned' && mo.status !== 'cancelled';

  const issued = useQuery({
    queryKey: queryKeys.production.scope('issued', { moId }),
    enabled: Boolean(mo) && started,
    queryFn: () => getIssuedComponents(moId),
  });
  const defects = useQuery({
    queryKey: queryKeys.production.scope('defects', { moId }),
    enabled: mo?.status === 'completed',
    queryFn: () => getProductionDefects(moId),
  });
  const plan = useQuery({
    queryKey: queryKeys.bakeplan.detail(mo?.bake_plan_id ?? 0),
    enabled: Boolean(mo?.bake_plan_id),
    queryFn: () => getBakePlanNo(mo!.bake_plan_id!),
  });

  if (order.isLoading) {
    return (
      <div className="gz-stack">
        <PageHeader title="Production order" breadcrumb={[{ label: 'Make' }, { label: 'Production', to: '/production' }, { label: 'Loading' }]} />
        <Skeleton variant="block" />
      </div>
    );
  }
  if (order.error) {
    return (
      <div className="gz-stack">
        <PageHeader title="Production order" breadcrumb={[{ label: 'Make' }, { label: 'Production', to: '/production' }, { label: 'Order' }]} />
        <Alert tone="danger" title="Could not load this order">{rpcErrorMessage(order.error)}</Alert>
      </div>
    );
  }
  if (!mo) {
    return (
      <div className="gz-stack">
        <PageHeader title="Production order" breadcrumb={[{ label: 'Make' }, { label: 'Production', to: '/production' }, { label: 'Order' }]} />
        <EmptyState icon="factory" title="We could not find that order" description="It may have been removed. Go back to the list and pick another." action={<Link className="gz-link" to="/production">Back to production</Link>} />
      </div>
    );
  }

  const mayAct = canCall(role, 'start_production_order');

  return (
    <div className="gz-stack">
      <OrderHeader mo={mo} mayAct={mayAct} />
      <div className="gz-detail">
        <div className="gz-stack">
          {mo.status === 'planned' && mayAct && <StartCard mo={mo} refs={refs} />}
          {mo.status === 'planned' && !mayAct && (
            <Alert tone="info" title="Waiting to be started">A baker or manager starts this order when the ovens are ready.</Alert>
          )}
          {mo.status === 'in_progress' && mayAct && <CompleteCard mo={mo} />}
          {mo.status === 'cancelled' && <Alert tone="info" title="This order was cancelled">No ingredients were used.</Alert>}

          {started ? (
            <Card title="Components consumed" subtitle="What the recipe pulled from stock when the order started." padded={false}>
              <ConsumedTable mo={mo} refs={refs} issued={issued.data} loading={issued.isLoading} />
            </Card>
          ) : mo.status === 'planned' ? (
            <Card title="Recipe for the planned quantity" subtitle="Per the bill of materials; stock is checked at this location.">
              <RequirementsTable
                rows={refs.requirementsFor(mo.item_id, mo.qty_planned, mo.location_id)}
                where={mo.locations?.name}
              />
            </Card>
          ) : null}

          {mo.status === 'completed' && (
            <Card title="Scrap and rework" padded={false}>
              <DataTable
                columns={[
                  { key: 'kind', header: 'Type', render: (d) => <Badge tone={d.kind === 'scrap' ? 'danger' : 'warning'}>{d.kind === 'scrap' ? 'Scrap' : 'Rework'}</Badge> },
                  { key: 'reason_code', header: 'Reason', render: (d) => <span className="gz-mono">{d.reason_code}</span> },
                  { key: 'qty', header: 'Units', align: 'right', render: (d) => formatNumber(d.qty) },
                ]}
                rows={defects.data ?? []}
                loading={defects.isLoading}
                density="compact"
                empty="No scrap or rework was logged. A clean run."
                aria-label="Scrap and rework lines"
              />
            </Card>
          )}
        </div>

        <SummaryCard mo={mo} planNo={plan.data?.plan_no} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- header with cancel
function OrderHeader({ mo, mayAct }: { mo: ProductionOrderRow; mayAct: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const cancel = useMutation({
    mutationFn: () => rpc.cancelProductionOrder({ mo_id: mo.id }),
    onSuccess: () => {
      invalidateMake(qc);
      toast.success('Order cancelled', mo.mo_number);
    },
    onError: (e) => toast.error('Could not cancel the order', rpcErrorMessage(e)),
  });
  return (
    <>
      <PageHeader
        title={mo.mo_number}
        breadcrumb={[{ label: 'Make' }, { label: 'Production', to: '/production' }, { label: mo.mo_number }]}
        subtitle={<>{mo.items?.name ?? 'Item'} at {mo.locations?.name ?? 'kitchen'}, due {formatDate(mo.due_date)}</>}
        actions={
          <>
            <StatusBadge status={mo.status} />
            {mo.status === 'planned' && mayAct && (
              <Button variant="secondary" size="lg" icon="x" onClick={() => setConfirm(true)}>Cancel order</Button>
            )}
          </>
        }
      />
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Cancel this order?"
        confirmLabel="Cancel order"
        tone="danger"
        onConfirm={async () => {
          await cancel.mutateAsync().catch(() => undefined);
        }}
      >
        {mo.mo_number} has not started, so no ingredients have been used. You cannot undo this.
      </ConfirmDialog>
    </>
  );
}

// ---------------------------------------------------------------- start (issue components)
function StartCard({ mo, refs }: { mo: ProductionOrderRow; refs: ReturnType<typeof useMakeRefs> }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [qty, setQty] = useState(String(mo.qty_planned));
  const n = Number(qty);
  const reqs = refs.requirementsFor(mo.item_id, Number.isFinite(n) ? n : 0, mo.location_id);
  const error = !(n > 0) ? 'Enter a quantity above 0.' : undefined;
  const short = reqs.some((r) => r.short);

  const start = useMutation({
    mutationFn: () => rpc.startProductionOrder({ mo_id: mo.id, qty_started: n }),
    onSuccess: (res) => {
      invalidateMake(qc);
      toast.success('Production started', `${formatMoney(res.issued_value)} of ingredients issued to work in progress.`);
    },
    onError: (e) => toast.error('Could not start production', rpcErrorMessage(e)),
  });

  return (
    <Card title="Start production" subtitle="Starting takes the ingredients out of stock and into work in progress.">
      <div className="gz-stack gz-stack--sm">
        <TextField
          label="Quantity started (donuts)"
          type="number"
          min={1}
          step={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          error={error}
          hint={n > 0 ? `${formatItemQty(n, mo.items ?? {})}; planned ${formatItemQty(mo.qty_planned, mo.items ?? {})}` : undefined}
        />
        <RequirementsTable rows={reqs} where={mo.locations?.name} />
        {short && <p className="text-body-sm gz-muted">Starting will fail until the short components are in stock.</p>}
        <div className="gz-row">
          <Button variant="primary" size="lg" icon="flame" disabled={Boolean(error) || start.isPending} onClick={() => start.mutate()}>
            {start.isPending ? 'Starting' : 'Start production'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- complete (good, scrap, rework)
function CompleteCard({ mo }: { mo: ProductionOrderRow }) {
  const qc = useQueryClient();
  const toast = useToast();
  const codes = useReasonCodes(['scrap', 'rework']);
  const options = useMemo(() => {
    const seen = new Set<string>();
    return (codes.data ?? []).filter((c) => (seen.has(c.code) ? false : (seen.add(c.code), true)));
  }, [codes.data]);
  const firstReason = options[0]?.code ?? 'MISSHAPEN';

  const started = Number(mo.qty_started);
  const [good, setGood] = useState(String(started));
  const [scrap, setScrap] = useState<DefectRow[]>([]);
  const [rework, setRework] = useState<DefectRow[]>([]);

  const goodN = Number(good);
  const validGood = Number.isFinite(goodN) && goodN >= 0 && goodN <= started;
  const needed = validGood ? started - goodN : 0;
  const scrapSum = scrap.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const reworkSum = rework.reduce((s, r) => s + (Number(r.qty) || 0), 0);

  // With one scrap line (or none), keep it equal to started minus good so the baker only picks a reason.
  useEffect(() => {
    setScrap((cur) => {
      if (cur.length > 1) return cur;
      if (needed <= 0) return cur.length ? [] : cur;
      const reason = cur[0]?.reason || firstReason;
      if (cur[0] && cur[0].reason === reason && Number(cur[0].qty) === needed) return cur;
      return [{ reason, qty: String(needed) }];
    });
  }, [needed, firstReason]);

  const issuedValue = Number(mo.issued_value);
  const unitCost = started > 0 ? issuedValue / started : 0;
  const goodValue = validGood ? Math.round(goodN * unitCost * 100) / 100 : 0;
  const scrapValue = Math.round((issuedValue - goodValue) * 100) / 100;

  const problems: string[] = [];
  if (!validGood) problems.push(`Good quantity must be between 0 and ${formatNumber(started)}.`);
  else if (scrapSum !== needed) problems.push(`Scrap reasons add up to ${formatNumber(scrapSum)} but ${formatNumber(needed)} units were scrapped (started ${formatNumber(started)} minus good ${formatNumber(goodN)}).`);
  if ([...scrap, ...rework].some((r) => !(Number(r.qty) > 0) || !r.reason)) problems.push('Every scrap and rework line needs a reason and a quantity above 0.');
  if (validGood && reworkSum > goodN) problems.push(`Reworked units (${formatNumber(reworkSum)}) cannot be more than good units (${formatNumber(goodN)}).`);

  const complete = useMutation({
    mutationFn: () => {
      const defects: DefectInput[] = [
        ...scrap.map((r) => ({ kind: 'scrap' as const, qty: Number(r.qty), reason_code: r.reason })),
        ...rework.map((r) => ({ kind: 'rework' as const, qty: Number(r.qty), reason_code: r.reason })),
      ];
      return rpc.completeProductionOrder({ mo_id: mo.id, qty_good: goodN, defects });
    },
    onSuccess: (res) => {
      invalidateMake(qc);
      toast.success('Production completed', `${formatNumber(res.qty_good)} good at ${formatUnitCost(res.unit_cost)} each.`);
    },
    onError: (e) => toast.error('Could not complete the order', rpcErrorMessage(e)),
  });

  const defectEditor = (kind: 'scrap' | 'rework', rows: DefectRow[], setRows: (r: DefectRow[]) => void) => (
    <div className="gz-stack gz-stack--sm">
      <div className="gz-row">
        <h3 className="text-h3">{kind === 'scrap' ? 'Scrap' : 'Rework'}</h3>
        <span className="text-body-sm gz-muted">
          {kind === 'scrap'
            ? `Explain ${formatNumber(needed)} scrapped ${needed === 1 ? 'unit' : 'units'} (${formatNumber(scrapSum)} explained).`
            : 'Good donuts that needed fixing. Counted within good.'}
        </span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="gz-form-grid" style={{ alignItems: 'end' }}>
          <Select
            label="Reason"
            value={r.reason}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))}
            options={options.map((o) => ({ value: o.code, label: o.label }))}
          />
          <div className="gz-row" style={{ alignItems: 'end', flexWrap: 'nowrap' }}>
            <TextField
              label="Units"
              type="number"
              min={1}
              step={1}
              value={r.qty}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
            />
            <Button variant="ghost" size="lg" icon="trash" aria-label={`Remove ${kind} line ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))} />
          </div>
        </div>
      ))}
      <div className="gz-row">
        <Button size="lg" icon="plus" onClick={() => setRows([...rows, { reason: firstReason, qty: '' }])}>
          Add {kind} reason
        </Button>
      </div>
    </div>
  );

  return (
    <Card title="Complete production" subtitle={`Started ${formatNumber(started)} donuts (${formatItemQty(started, mo.items ?? {})}). Log how many came out good.`}>
      <div className="gz-stack gz-stack--sm">
        <TextField
          label="Good quantity (donuts)"
          type="number"
          min={0}
          max={started}
          step={1}
          value={good}
          onChange={(e) => setGood(e.target.value)}
          error={!validGood ? `Enter a number from 0 to ${formatNumber(started)}.` : undefined}
          hint={validGood ? `${formatItemQty(goodN, mo.items ?? {})} good, yield ${formatPct(started > 0 ? goodN / started : null)}` : undefined}
        />
        {defectEditor('scrap', scrap, setScrap)}
        {defectEditor('rework', rework, setRework)}

        <Alert tone="info" title="Rolled-up cost">
          Ingredients issued: {formatMoney(issuedValue)}. Good units cost {formatUnitCost(unitCost)} each ({formatMoney(unitCost * 12)} a dozen).
          {scrapValue > 0 && <> {formatMoney(scrapValue)} of scrapped ingredients moves to production scrap.</>}
        </Alert>
        {problems.length > 0 && <Alert tone="warning" title="Check these before completing">{problems.join(' ')}</Alert>}

        <div className="gz-row">
          <Button variant="primary" size="lg" icon="checkCircle" disabled={problems.length > 0 || complete.isPending} onClick={() => complete.mutate()}>
            {complete.isPending ? 'Completing' : 'Complete production'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- components consumed
function ConsumedTable({ mo, refs, issued, loading }: {
  mo: ProductionOrderRow; refs: ReturnType<typeof useMakeRefs>; issued: Array<{ item_id: number; qty: number; value: number }> | undefined; loading: boolean;
}) {
  // Prefer the ledger (actual qty and value). Fall back to the recipe if the ledger rows cannot be read.
  const rows: Requirement[] = useMemo(() => {
    if (issued && issued.length > 0) {
      return issued.map((r) => {
        const item = refs.itemById.get(r.item_id);
        const bomLine = refs.bom.find((b) => b.parent_item_id === mo.item_id && b.component_item_id === r.item_id);
        return {
          item_id: r.item_id, name: item?.name ?? `Item ${r.item_id}`, sku: item?.sku ?? '', uom: item?.uom ?? 'each', item_type: item?.item_type ?? 'raw',
          qty_per: Number(bomLine?.qty_per ?? 0), required: r.qty, available: 0, remaining: 0, short: false,
          unit_cost: r.qty > 0 ? r.value / r.qty : 0, cost: r.value,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
    }
    return refs.requirementsFor(mo.item_id, Number(mo.qty_started), mo.location_id);
  }, [issued, refs, mo]);

  const total = rows.reduce((s, r) => s + r.cost, 0);
  const columns: DataTableColumn<Requirement>[] = [
    { key: 'name', header: 'Component', render: (r) => <div><div>{r.name}</div><div className="gz-mono gz-muted text-caption">{r.sku}</div></div> },
    { key: 'qty_per', header: 'Per donut', align: 'right', render: (r) => <QtyCell qty={r.qty_per} uom={r.uom} dozens={false} /> },
    { key: 'required', header: 'Consumed', align: 'right', render: (r) => <QtyCell qty={r.required} uom={r.uom} dozens={false} /> },
    { key: 'unit_cost', header: 'Unit cost', align: 'right', render: (r) => <MoneyCell value={r.unit_cost} unitCost /> },
    { key: 'cost', header: 'Cost', align: 'right', render: (r) => <MoneyCell value={r.cost} strong /> },
  ];
  return (
    <div>
      <DataTable columns={columns} rows={rows} rowKey="item_id" density="compact" loading={loading} empty="No components recorded." aria-label="Components consumed" />
      <p className="text-body-sm gz-muted" style={{ padding: 'var(--space-3) var(--space-4)' }}>
        Total issued: {formatMoney(mo.issued_value || total)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- side summary
function SummaryCard({ mo, planNo }: { mo: ProductionOrderRow; planNo?: string }) {
  const item = mo.items ?? {};
  const done = mo.status === 'completed';
  const yieldPct = done && Number(mo.qty_started) > 0 ? Number(mo.qty_good) / Number(mo.qty_started) : null;
  const cycleHours = mo.started_at && mo.finished_at ? (new Date(mo.finished_at).getTime() - new Date(mo.started_at).getTime()) / 3_600_000 : null;
  const finishedDay = mo.finished_at ? businessDate(mo.finished_at) : null;
  const lateDays = finishedDay ? daysBetween(mo.due_date, finishedDay) : null;

  const row = (label: string, value: ReactNode) => (
    <div className="gz-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
      <span className="gz-muted">{label}</span>
      <span className="gz-num" style={{ textAlign: 'right' }}>{value}</span>
    </div>
  );

  return (
    <Card title="Summary">
      <div className="gz-stack gz-stack--sm text-body">
        {row('Status', <StatusBadge status={mo.status} />)}
        {row('Item', mo.items?.name ?? '—')}
        {row('Location', mo.locations?.name ?? '—')}
        {row('Due', formatDate(mo.due_date))}
        {mo.bake_plan_id && row('Bake plan', <Link className="gz-link" to="/forecast?tab=bake"><DocNo value={planNo ?? `#${mo.bake_plan_id}`} /></Link>)}
        {row('Planned', formatItemQty(mo.qty_planned, item))}
        {mo.status !== 'planned' && mo.status !== 'cancelled' && row('Started', formatItemQty(mo.qty_started, item))}
        {done && (
          <>
            {row('Good', formatItemQty(mo.qty_good, item))}
            {row('Scrapped', `${formatNumber(mo.qty_scrapped)} units`)}
            {row('Reworked', `${formatNumber(mo.qty_reworked)} units`)}
            {row('Yield', formatPct(yieldPct))}
            {row('Unit cost', formatUnitCost(mo.unit_cost))}
            {row('Cost per dozen', formatMoney(Number(mo.unit_cost) * 12))}
          </>
        )}
        {mo.status === 'in_progress' && row('Ingredients issued', formatMoney(mo.issued_value))}
        {mo.started_at && row('Started at', formatDateTime(mo.started_at))}
        {mo.finished_at && row('Finished at', formatDateTime(mo.finished_at))}
        {done && row('Cycle time', formatDuration(cycleHours))}
        {done && lateDays !== null && row('Schedule', lateDays <= 0 ? <Badge tone="success">On time</Badge> : <Badge tone="warning">{lateDays} {lateDays === 1 ? 'day' : 'days'} late</Badge>)}
      </div>
    </Card>
  );
}

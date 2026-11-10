import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Badge, Button, Card, DataTable, Dialog, DocNo, EmptyState, QtyCell, StatCard, StatusBadge, TextField, useToast,
  type DataTableColumn,
} from '@/components';
import { RequirementsTable } from '@/features/production/RequirementsTable';
import { invalidateMake, unwrap, useMakeRefs } from '@/features/production/api';
import { useLocations } from '@/hooks/useLocations';
import { useRole } from '@/hooks/useRole';
import { addDays, businessDate, formatDate, formatNumber, formatPct } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { rpc, rpcErrorMessage } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import { canCall, type ReleaseBakePlanResult, type StartBakeDayResult } from '@/types/domain';
import { getBakePlanByDate, getPlanDocs, type BakePlanLineRow } from './api';

export function BakePlanTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { role } = useRole();
  const refs = useMakeRefs();
  const { data: locations = [] } = useLocations();
  const kitchen = locations.find((l) => l.kind === 'kitchen') ?? null;
  const shopName = (id: number) => locations.find((l) => l.id === id)?.name ?? `Location ${id}`;

  const today = businessDate();
  const [date, setDate] = useState(addDays(today, 1));
  const [bufferText, setBufferText] = useState('');
  const [dayDialog, setDayDialog] = useState(false);
  const [yieldText, setYieldText] = useState('96');
  const [released, setReleased] = useState<ReleaseBakePlanResult | null>(null);
  const [dayResult, setDayResult] = useState<StartBakeDayResult | null>(null);

  const settings = useQuery({
    queryKey: queryKeys.settings.scope('make-bake-buffer'),
    staleTime: 60_000,
    queryFn: async () => unwrap<{ bake_buffer_pct: number }>('app_settings', await supabase.from('app_settings').select('bake_buffer_pct').eq('id', 1).single()),
  });
  const defaultBuffer = Number(settings.data?.bake_buffer_pct ?? 0.08);

  const planQ = useQuery({ queryKey: queryKeys.bakeplan.scope('plan', { date }), queryFn: () => getBakePlanByDate(date) });
  const plan = planQ.data?.plan ?? null;
  const lines = useMemo(
    () => [...(planQ.data?.lines ?? [])].sort((a, b) => (a.items?.name ?? '').localeCompare(b.items?.name ?? '') || shopName(a.location_id).localeCompare(shopName(b.location_id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planQ.data, locations],
  );
  const docsQ = useQuery({
    queryKey: queryKeys.bakeplan.scope('docs', { planId: plan?.id }),
    enabled: plan?.status === 'released',
    queryFn: () => getPlanDocs(plan!.id),
  });

  useEffect(() => {
    setReleased(null);
    setDayResult(null);
  }, [date]);

  const bufferPct = bufferText.trim() === '' ? undefined : Number(bufferText) / 100;
  const bufferError = bufferPct !== undefined && !(bufferPct >= 0 && bufferPct <= 1) ? 'Enter a percentage from 0 to 100.' : undefined;

  const build = useMutation({
    mutationFn: () => rpc.buildBakePlan({ plan_date: date, buffer_pct: bufferPct ?? null }),
    onSuccess: () => {
      invalidateMake(qc);
      toast.success('Bake plan built', `Draft plan for ${formatDate(date)} is ready to review.`);
    },
    onError: (e) => toast.error('Could not build the bake plan', rpcErrorMessage(e)),
  });
  const release = useMutation({
    mutationFn: () => rpc.releaseBakePlan({ plan_id: plan!.id }),
    onSuccess: (res) => {
      setReleased(res);
      invalidateMake(qc);
      toast.success('Bake plan released', `${res.mo_ids.length} production orders and ${res.transfer_ids.length} transfers created.`);
    },
    onError: (e) => toast.error('Could not release the bake plan', rpcErrorMessage(e)),
  });
  const bakeDay = useMutation({
    mutationFn: () => rpc.startBakeDay({ plan_id: plan!.id, yield: Number(yieldText) / 100 }),
    onSuccess: (res) => {
      setDayResult(res);
      setDayDialog(false);
      invalidateMake(qc);
      toast.success('Bake day ran', `${res.orders_completed} orders completed and ${res.transfers_completed} transfers sent.`);
    },
    onError: (e) => toast.error('Could not run the bake day', rpcErrorMessage(e)),
  });
  const override = useMutation({
    mutationFn: (v: { item_id: number; location_id: number; override_qty: number | null }) => rpc.updateBakePlanLine({ plan_id: plan!.id, ...v }),
    onSuccess: () => invalidateMake(qc),
    onError: (e) => toast.error('Could not save that quantity', rpcErrorMessage(e)),
  });

  const draft = plan?.status === 'draft';
  const mayEdit = canCall(role, 'update_bake_plan_line') && draft;

  // Component needs, from the final quantity of every line.
  const byItem = new Map<number, number>();
  for (const l of lines) byItem.set(l.item_id, (byItem.get(l.item_id) ?? 0) + Number(l.final_qty));
  const reqs = refs.requirementsForMany([...byItem.entries()].map(([item_id, qty]) => ({ item_id, qty })), kitchen?.id ?? null);

  const totalForecast = lines.reduce((s, l) => s + Number(l.forecast_qty), 0);
  const totalOrders = lines.reduce((s, l) => s + Number(l.so_qty), 0);
  const totalFinal = lines.reduce((s, l) => s + Number(l.final_qty), 0);
  const edited = lines.filter((l) => l.override_qty !== null).length;

  const columns: DataTableColumn<BakePlanLineRow>[] = [
    { key: 'item', header: 'Item', sortable: true, sortValue: (l) => l.items?.name, render: (l) => l.items?.name ?? `Item ${l.item_id}` },
    { key: 'shop', header: 'Shop', sortable: true, sortValue: (l) => shopName(l.location_id), render: (l) => shopName(l.location_id) },
    { key: 'forecast_qty', header: 'Forecast', align: 'right', render: (l) => formatNumber(l.forecast_qty, 0) },
    { key: 'so_qty', header: 'Confirmed orders', align: 'right', render: (l) => formatNumber(l.so_qty, 0) },
    { key: 'buffer', header: 'Buffer', align: 'right', render: () => formatPct(plan?.buffer_pct ?? 0, 0) },
    { key: 'planned_qty', header: 'Planned', align: 'right', render: (l) => <QtyCell qty={l.planned_qty} uom="each" /> },
    {
      key: 'override', header: 'Your override (dozen)', align: 'right',
      render: (l) =>
        mayEdit ? (
          <OverrideInput
            line={l}
            disabled={override.isPending}
            onCommit={(dozens) => override.mutate({ item_id: l.item_id, location_id: l.location_id, override_qty: dozens === null ? null : dozens * 12 })}
          />
        ) : l.override_qty === null ? '—' : <QtyCell qty={l.override_qty} uom="each" />,
    },
    { key: 'final_qty', header: 'Bake', align: 'right', render: (l) => <QtyCell qty={l.final_qty} uom="each" strong /> },
  ];

  const docs = docsQ.data;
  const justReleased = released && plan && released.plan_id === plan.id;

  return (
    <div className="gz-stack">
      <div className="gz-row" style={{ alignItems: 'end' }}>
        <TextField label="Bake date" type="date" min={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        {(!plan || draft) && canCall(role, 'build_bake_plan') && (
          <>
            <TextField
              label="Buffer (%)"
              type="number"
              min={0}
              max={100}
              step={1}
              value={bufferText}
              placeholder={formatNumber(defaultBuffer * 100, 0)}
              onChange={(e) => setBufferText(e.target.value)}
              error={bufferError}
              hint="Extra baked above forecast. Blank uses the Settings value."
            />
            {plan && (
              <Button icon="refresh" disabled={build.isPending || Boolean(bufferError)} onClick={() => build.mutate()}>
                {build.isPending ? 'Rebuilding' : 'Rebuild plan'}
              </Button>
            )}
          </>
        )}
        {plan && canCall(role, 'start_bake_day') && (
          <Button icon="flame" onClick={() => setDayDialog(true)}>Start bake day (demo)</Button>
        )}
        {draft && canCall(role, 'release_bake_plan') && (
          <Button variant="primary" icon="checkCircle" disabled={release.isPending || lines.length === 0} onClick={() => release.mutate()}>
            {release.isPending ? 'Releasing' : 'Release bake plan'}
          </Button>
        )}
      </div>

      {planQ.error && <Alert tone="danger" title="Could not load the bake plan">{rpcErrorMessage(planQ.error)}</Alert>}

      {!planQ.isLoading && !plan && (
        <EmptyState
          icon="clipboard"
          title={`No bake plan for ${formatDate(date)} yet`}
          description="Build one from the forecast and the confirmed orders for that day. You can adjust it before it goes to the kitchen."
          action={
            canCall(role, 'build_bake_plan') ? (
              <Button variant="primary" icon="plus" size="lg" disabled={build.isPending || Boolean(bufferError)} onClick={() => build.mutate()}>
                {build.isPending ? 'Building' : 'Build bake plan'}
              </Button>
            ) : undefined
          }
        />
      )}

      {plan && (
        <>
          <div className="gz-grid-stats">
            <StatCard label="Plan" icon="clipboard" value={<span className="gz-mono">{plan.plan_no}</span>} caption={`${formatDate(plan.plan_date)}, ${plan.status === 'released' ? 'released' : 'draft'}`} />
            <StatCard label="To bake" icon="flame" tint="cocoa" value={`${formatNumber(totalFinal / 12)} dozen`} caption={`${formatNumber(edited)} ${edited === 1 ? 'line' : 'lines'} changed by hand`} />
            <StatCard label="Forecast" icon="trendingUp" tint="mint" value={`${formatNumber(totalForecast / 12, 1)} dozen`} caption={`Plus ${formatNumber(totalOrders / 12, 1)} dozen confirmed orders`} />
            <StatCard label="Buffer" icon="layers" tint="butter" value={formatPct(plan.buffer_pct, 0)} caption="Added on top of forecast, then rounded up to a dozen" />
          </div>

          {dayResult && (
            <Alert tone="success" title="Bake day finished">
              {dayResult.orders_completed} production orders completed and {dayResult.transfers_completed} transfers sent to the shops.
            </Alert>
          )}
          {justReleased && (
            <Alert tone="success" title={`${plan.plan_no} released`}>
              Created {released.mo_ids.length} production orders and {released.transfer_ids.length} planned transfers. Links are below.
            </Alert>
          )}

          {reqs.some((r) => r.short) && draft && (
            <Alert tone="warning" title="Some ingredients are short for this plan">
              Bakers can still release the plan, but production will not start until the short components are received. Check Material planning for what to order.
            </Alert>
          )}

          <Card title="Plan lines" subtitle={draft ? 'Type a number of dozens to override a line. Clear the box to go back to the planned quantity.' : 'Released plans are locked.'} padded={false}>
            <DataTable
              columns={columns}
              rows={lines.map((l) => ({ ...l, rowId: `${l.item_id}-${l.location_id}` }))}
              rowKey="rowId"
              loading={planQ.isLoading}
              scroll
              density="compact"
              aria-label="Bake plan lines"
              empty="Nothing to bake. The forecast and orders for this day are zero."
            />
          </Card>

          <Card title="Ingredient check at the kitchen" subtitle={`Components for ${formatNumber(totalFinal / 12)} dozen, from each item's recipe, against stock at ${kitchen?.name ?? 'the kitchen'}.`}>
            <RequirementsTable rows={reqs} where={kitchen?.name} emptyText="No recipes found for the items on this plan." />
          </Card>

          {plan.status === 'released' && (
            <Card title="Created from this plan" subtitle={plan.released_at ? `Released ${formatDate(plan.released_at)}.` : undefined}>
              <div className="gz-grid-2">
                <div className="gz-stack gz-stack--sm">
                  <h3 className="text-h3">Production orders</h3>
                  {docs?.orders.length ? (
                    <ul className="gz-stack gz-stack--sm" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {docs.orders.map((o) => (
                        <li key={o.id} className="gz-row">
                          <Link className="gz-link" to={`/production/${o.id}`}><DocNo value={o.mo_number} /></Link>
                          <span>{o.items?.name}</span>
                          <span className="gz-muted">{formatNumber(Number(o.qty_planned) / 12, 1)} dozen</span>
                          <StatusBadge status={o.status} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="gz-muted">{docsQ.isLoading ? 'Loading' : 'No production orders were created.'}</p>
                  )}
                </div>
                <div className="gz-stack gz-stack--sm">
                  <h3 className="text-h3">Transfers to shops</h3>
                  {docs?.transfers.length ? (
                    <ul className="gz-stack gz-stack--sm" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {docs.transfers.map((t) => (
                        <li key={t.id} className="gz-row">
                          <Link className="gz-link" to="/inventory/transfers"><DocNo value={t.trf_no} /></Link>
                          <span>to {shopName(t.to_location_id)}</span>
                          <StatusBadge status={t.status} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="gz-muted">{docsQ.isLoading ? 'Loading' : 'No transfers were created.'}</p>
                  )}
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      <Dialog
        open={dayDialog}
        onClose={() => setDayDialog(false)}
        size="sm"
        title="Start bake day"
        description="A demo helper that runs the whole day in one step."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDayDialog(false)}>Cancel</Button>
            <Button variant="primary" disabled={bakeDay.isPending || !(Number(yieldText) > 0 && Number(yieldText) <= 100)} onClick={() => bakeDay.mutate()}>
              {bakeDay.isPending ? 'Running' : 'Start bake day'}
            </Button>
          </>
        }
      >
        <div className="gz-stack gz-stack--sm">
          <p>
            This releases {plan?.plan_no ?? 'the plan'} if it is still a draft, starts and completes every planned production order at the yield below
            (the rest is scrapped as misshapen), then sends what the kitchen actually made to the shops.
          </p>
          <TextField label="Yield (%)" type="number" min={1} max={100} step={1} value={yieldText} onChange={(e) => setYieldText(e.target.value)} hint="Good units as a share of units started." />
          {plan?.status === 'draft' && <Badge tone="info">Will release the plan first</Badge>}
        </div>
      </Dialog>
    </div>
  );
}

/** A whole-dozen box that saves when you leave it or press Enter. */
function OverrideInput({ line, onCommit, disabled }: { line: BakePlanLineRow; onCommit: (dozens: number | null) => void; disabled: boolean }) {
  const current = line.override_qty === null ? '' : String(Math.round(Number(line.override_qty) / 12));
  const [text, setText] = useState(current);
  useEffect(() => setText(current), [current]);

  function commit() {
    if (text === current) return;
    if (text.trim() === '') return onCommit(null);
    const dozens = Math.max(0, Math.round(Number(text)));
    if (!Number.isFinite(dozens)) return setText(current);
    setText(String(dozens));
    onCommit(dozens);
  }
  return (
    <div style={{ width: 'calc(var(--space-12) * 2)', marginLeft: 'auto' }}>
      <TextField
        aria-label={`Override dozens for ${line.items?.name ?? 'item'}`}
        type="number"
        min={0}
        step={1}
        value={text}
        placeholder={String(Math.round(Number(line.planned_qty) / 12))}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
    </div>
  );
}

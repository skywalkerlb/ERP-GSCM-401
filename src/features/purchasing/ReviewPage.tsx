import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert, Button, Card, Checkbox, DataTable, EmptyState, MoneyCell, PageHeader, QtyCell, StatCard, StatusBadge, Badge, type DataTableColumn,
} from '@/components';
import { STOCK_DOMAINS, toNumber, useAction, useAppSettings } from '@/features/items/api';
import { ErrorAlert, ItemCell, plural } from '@/features/items/ui';
import { formatMoney, formatNumber } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { rpc, views } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import type { PeriodicReviewRow } from '@/types/domain';
import { useDraftItems } from './api';

interface Made { poId: number; supplier: string; lines: number; total: number }

export default function PeriodicReviewPage() {
  const navigate = useNavigate();
  const reviewQ = useQuery({ queryKey: queryKeys.purchasing.scope('periodic-review'), queryFn: () => views.periodicReview() });
  const draftsQ = useDraftItems();
  const settingsQ = useAppSettings();
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const [made, setMade] = useState<Made[] | null>(null);

  const rows = useMemo(() => reviewQ.data ?? [], [reviewQ.data]);
  const drafts = draftsQ.data;
  const orderable = (r: PeriodicReviewRow) => toNumber(r.order_qty) > 0 && r.supplier_id !== null && !drafts?.has(r.item_id);
  // Until the person changes anything, every row that needs an order is selected.
  const selected = useMemo(() => picked ?? new Set(rows.filter(orderable).map((r) => r.item_id)), [picked, rows, drafts]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: number, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id); else next.delete(id);
    setPicked(next);
  };

  const chosen = rows.filter((r) => selected.has(r.item_id) && orderable(r));
  const spend = chosen.reduce((s, r) => s + toNumber(r.order_qty) * toNumber(r.unit_cost), 0);
  const suppliers = new Set(chosen.map((r) => r.supplier_id));

  const create = useAction(
    async () => {
      const bySupplier = new Map<number, PeriodicReviewRow[]>();
      for (const r of chosen) bySupplier.set(r.supplier_id!, [...(bySupplier.get(r.supplier_id!) ?? []), r]);
      const out: Made[] = [];
      for (const [supplierId, list] of bySupplier) {
        const poId = await rpc.createPurchaseOrder({
          supplier: supplierId, ship_to: await kitchenId(), source: 'manual', notes: 'Created from periodic review',
          lines: list.map((r) => ({ item_id: r.item_id, qty: toNumber(r.order_qty) })),
        });
        out.push({ poId, supplier: list[0]!.supplier_name ?? 'Supplier', lines: list.length, total: list.reduce((s, r) => s + toNumber(r.order_qty) * toNumber(r.unit_cost), 0) });
      }
      return out;
    },
    { invalidate: STOCK_DOMAINS, errorTitle: 'Could not create the purchase orders', success: (r) => `${plural(r.length, 'draft purchase order')} created.`, onSuccess: (r) => { setMade(r); setPicked(null); } },
  );

  const R = rows[0]?.review_period_days ?? settingsQ.data?.review_period_days ?? 7;
  const columns: DataTableColumn<PeriodicReviewRow>[] = [
    {
      key: 'pick', header: '', width: 40,
      render: (r) => <Checkbox aria-label={`Select ${r.name}`} checked={selected.has(r.item_id) && orderable(r)} disabled={!orderable(r)} onChange={(e) => toggle(r.item_id, e.target.checked)} />,
    },
    { key: 'item', header: 'Item', sortable: true, sortValue: (r) => r.name, render: (r) => <ItemCell item={{ id: r.item_id, name: r.name, sku: r.sku }} to /> },
    { key: 'supplier', header: 'Supplier', render: (r) => (r.supplier_id ? <Link className="gz-link" to={`/suppliers/${r.supplier_id}`}>{r.supplier_name}</Link> : <span className="gz-muted">No supplier</span>) },
    { key: 'r', header: 'Review period R', align: 'right', render: (r) => `${r.review_period_days} days` },
    { key: 'l', header: 'Lead time L', align: 'right', render: (r) => `${formatNumber(r.lead_time_days, 1)} days` },
    { key: 'd', header: 'Daily use', align: 'right', render: (r) => <span className="gz-num">{formatNumber(r.avg_daily_usage, 1)} {r.uom}</span> },
    { key: 's', header: 'Target level S', align: 'right', sortable: true, sortValue: (r) => toNumber(r.order_up_to_level), render: (r) => <QtyCell qty={Math.round(toNumber(r.order_up_to_level) * 10) / 10} uom={r.uom} dozens={false} /> },
    { key: 'ip', header: 'Position IP', align: 'right', sortable: true, sortValue: (r) => toNumber(r.inventory_position), render: (r) => <QtyCell qty={Math.round(toNumber(r.inventory_position) * 10) / 10} uom={r.uom} dozens={false} /> },
    { key: 'q', header: 'Order qty', align: 'right', sortable: true, sortValue: (r) => toNumber(r.order_qty), render: (r) => <QtyCell qty={r.order_qty} uom={r.uom} dozens={false} strong /> },
    { key: 'cost', header: 'Line total', align: 'right', render: (r) => <MoneyCell value={toNumber(r.order_qty) * toNumber(r.unit_cost)} /> },
    {
      key: 'status', header: 'Status',
      render: (r) => drafts?.has(r.item_id) ? <Badge tone="neutral">{`On ${drafts.get(r.item_id)}`}</Badge> : toNumber(r.order_qty) <= 0 ? <Badge tone="success">Covered</Badge> : r.urgency === 'ok' ? <Badge tone="info">Review due</Badge> : <StatusBadge status={r.urgency} />,
    },
  ];

  return (
    <div className="gz-stack">
      <PageHeader
        title="Periodic review"
        breadcrumb={[{ label: 'Buy' }, { label: 'Purchasing', to: '/purchasing' }, { label: 'Periodic review' }]}
        subtitle={`Every ${R} days, order enough to bring each item back up to its target level.`}
        actions={<Button variant="primary" icon="bag" onClick={() => create.mutate(undefined)} disabled={create.isPending || chosen.length === 0}>{create.isPending ? 'Creating' : `Create POs for ${plural(chosen.length, 'item')}`}</Button>}
      />
      {(reviewQ.error || draftsQ.error) && <ErrorAlert error={reviewQ.error ?? draftsQ.error} onRetry={() => void reviewQ.refetch()} />}

      {made && (
        <Card title={`${plural(made.length, 'draft PO')} created`} subtitle="Review and send them from purchasing." actions={<Button variant="ghost" onClick={() => setMade(null)}>Dismiss</Button>}>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
            {made.map((m) => <li key={m.poId}><Link className="gz-link" to={`/purchasing/${m.poId}`}>{m.supplier}</Link>: {plural(m.lines, 'line')}, {formatMoney(m.total)}</li>)}
          </ul>
        </Card>
      )}

      <div className="gz-grid-stats">
        <StatCard label="Review period" value={`${R} days`} icon="calendar" tint="lilac" caption="Set in Settings" />
        <StatCard label="Selected items" value={formatNumber(chosen.length)} icon="check" tint="pink" caption={`${formatNumber(rows.filter(orderable).length)} need an order`} />
        <StatCard label="Suppliers" value={formatNumber(suppliers.size)} icon="building" tint="cocoa" caption="One draft PO each" />
        <StatCard label="Estimated spend" value={formatMoney(spend)} icon="money" tint="mint" caption="At quoted cost" />
      </div>

      <Alert tone="info" title="How periodic review works">
        S = d̄ · (L + R) + z · σd · √(L + R) is the level to order up to. Order quantity = max(0, S − IP), rounded up to the pack size. Unlike a reorder point, the shop checks on a fixed schedule instead of whenever stock dips.
      </Alert>

      <DataTable<PeriodicReviewRow>
        aria-label="Periodic review" columns={columns} rows={rows} rowKey="item_id" loading={reviewQ.isLoading} scroll density="compact"
        empty={<EmptyState icon="checkCircle" title="No items to review" description="Purchased items with a supplier show up here." />}
      />
      <span className="gz-muted text-body-sm">
        Orders go to the Central Kitchen. <Button variant="ghost" size="sm" onClick={() => navigate('/purchasing')}>Back to purchasing</Button>
      </span>
    </div>
  );
}

let cachedKitchen: number | null = null;
async function kitchenId(): Promise<number> {
  if (cachedKitchen) return cachedKitchen;
  const { data, error } = await supabase.from('locations').select('id').eq('kind', 'kitchen').order('id').limit(1);
  if (error || !data?.[0]) throw new Error('No kitchen location was found. Add one in Settings, then try again.');
  cachedKitchen = (data[0] as { id: number }).id;
  return cachedKitchen;
}

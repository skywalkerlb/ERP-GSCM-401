import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, DataTable, EmptyState, MoneyCell, PageHeader, Skeleton, StatCard, StatusBadge } from '@/components';
import { fetchRows, indexBy, toNumber, useItemSuppliers, useItems, useScorecard, useSuppliers } from '@/features/items/api';
import { ErrorAlert, ItemCell, KeyValue, RatingBadge, TimelinessBadge, plural } from '@/features/items/ui';
import { PaymentDialog, type PayableBill } from '@/features/purchasing/PaymentDialog';
import { poStatusKey, usePurchaseOrders, type PoView } from '@/features/purchasing/api';
import { businessDate, daysBetween, formatDate, formatMoney, formatNumber, formatPct, formatUnitCost } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import type { ApBill, PoReceipt } from '@/types/domain';
import { SupplierFormDialog } from './SupplierForm';

export default function SupplierDetailPage() {
  const { id: raw } = useParams();
  const id = Number(raw);
  const navigate = useNavigate();
  const suppliersQ = useSuppliers();
  const scoreQ = useScorecard();
  const itemsQ = useItems();
  const suppliedQ = useItemSuppliers();
  const posQ = usePurchaseOrders();
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState<PayableBill | null>(null);

  const billsQ = useQuery({
    queryKey: queryKeys.suppliers.scope('bills', { id }),
    enabled: Number.isFinite(id),
    queryFn: () => fetchRows<ApBill>('ap_bills', { eq: { supplier_id: id }, order: [['due_date', false]] }),
  });
  const receiptsQ = useQuery({
    queryKey: queryKeys.suppliers.scope('receipts', { id }),
    enabled: Number.isFinite(id),
    queryFn: async () => {
      const poIds = (await fetchRows<{ id: number }>('purchase_orders', { columns: 'id', eq: { supplier_id: id } })).map((p) => p.id);
      return fetchRows<PoReceipt>('po_receipts', { in: ['po_id', poIds], order: [['received_on']] });
    },
  });

  const itemMap = useMemo(() => indexBy(itemsQ.data, (i) => i.id), [itemsQ.data]);
  const supplier = suppliersQ.data?.find((s) => s.id === id);
  const score = scoreQ.data?.find((s) => s.supplier_id === id);
  const supplied = useMemo(() => (suppliedQ.data ?? []).filter((s) => s.supplier_id === id), [suppliedQ.data, id]);
  const pos = useMemo(() => (posQ.data ?? []).filter((p) => p.supplier_id === id), [posQ.data, id]);
  const poMap = useMemo(() => indexBy(posQ.data, (p) => p.id), [posQ.data]);

  const receiptSummary = useMemo(() => {
    const m = new Map<number, { first: string; last: string }>();
    for (const r of receiptsQ.data ?? []) {
      const cur = m.get(r.po_id);
      m.set(r.po_id, { first: cur?.first ?? r.received_on, last: r.received_on });
    }
    return m;
  }, [receiptsQ.data]);

  if (suppliersQ.isLoading) return <div className="gz-stack"><PageHeader title="Supplier" breadcrumb={[{ label: 'Buy' }, { label: 'Suppliers', to: '/suppliers' }, { label: 'Supplier' }]} /><Skeleton variant="block" /></div>;
  if (suppliersQ.error) return <ErrorAlert error={suppliersQ.error} onRetry={() => void suppliersQ.refetch()} />;
  if (!supplier) return <EmptyState icon="building" title="We could not find that supplier" action={<Button variant="primary" onClick={() => navigate('/suppliers')}>Back to suppliers</Button>} />;

  const today = businessDate();
  const bills = billsQ.data ?? [];
  const owed = bills.reduce((s, b) => s + (toNumber(b.amount) - toNumber(b.amount_paid)), 0);

  return (
    <div className="gz-stack">
      <PageHeader
        title={supplier.name}
        breadcrumb={[{ label: 'Buy' }, { label: 'Suppliers', to: '/suppliers' }, { label: supplier.name }]}
        subtitle={<span className="gz-row" style={{ gap: 'var(--space-2)' }}><span className="gz-mono">{supplier.code}</span><StatusBadge status={supplier.is_active ? 'active' : 'inactive'} /><RatingBadge rating={score?.rating} /></span>}
        actions={<><Button icon="edit" onClick={() => setEditing(true)}>Edit supplier</Button><Button variant="primary" icon="plus" onClick={() => navigate(`/purchasing/new?supplier=${supplier.id}`)} disabled={!supplier.is_active}>New purchase order</Button></>}
      />

      <div className="gz-grid-stats">
        <StatCard label="Score" value={score?.score != null ? formatNumber(score.score, 0) : '—'} icon="chart" tint="pink" caption={score ? `${plural(score.po_count, 'order')} in the last 180 days` : 'No qualifying orders yet'} />
        <StatCard label="On time" value={formatPct(score?.on_time_rate, 0)} icon="clock" tint="mint" caption={score?.avg_actual_lead_days != null ? `${formatNumber(score.avg_actual_lead_days, 1)} days actual vs ${formatNumber(score.avg_quoted_lead_days, 1)} quoted` : 'Needs received orders'} />
        <StatCard label="Fill rate" value={formatPct(score?.fill_rate, 0)} icon="package" tint="lilac" caption="Units received vs ordered" />
        <StatCard label="Owed" value={formatMoney(owed)} icon="bank" tint={score && toNumber(score.overdue_amount) > 0 ? 'butter' : 'cocoa'} caption={score && toNumber(score.overdue_amount) > 0 ? `${formatMoney(score.overdue_amount)} overdue` : score?.next_due_date ? `Next due ${formatDate(score.next_due_date)}` : 'Nothing due'} />
      </div>

      <div className="gz-detail">
        <div className="gz-stack">
          <Card title="Purchase order history" subtitle="Expected against what actually arrived." padded={false}>
            <DataTable<PoView>
              aria-label="Purchase order history" density="compact" rows={pos} loading={posQ.isLoading || receiptsQ.isLoading}
              onRowClick={(p) => navigate(`/purchasing/${p.id}`)} defaultSort={{ key: 'po_number', dir: 'desc' }}
              empty="No purchase orders for this supplier yet."
              columns={[
                { key: 'po_number', header: 'Order', mono: true, sortable: true },
                { key: 'status', header: 'Status', render: (p) => { const s = poStatusKey(p); return <StatusBadge status={s.status} label={s.label} />; } },
                { key: 'sent_on', header: 'Sent', render: (p) => <span className="gz-num">{formatDate(p.sent_on)}</span> },
                { key: 'expected', header: 'Expected', render: (p) => <span className="gz-num">{formatDate(p.expected_on)}</span> },
                { key: 'actual', header: 'Last received', render: (p) => <span className="gz-num">{formatDate(receiptSummary.get(p.id)?.last)}</span> },
                { key: 'timely', header: 'Result', render: (p) => { const last = receiptSummary.get(p.id)?.last; return last ? <TimelinessBadge expectedOn={p.expected_on} receivedOn={last} /> : p.late ? <StatusBadge status="late" label={`${p.daysLate} days late`} /> : <span className="gz-muted">—</span>; } },
                { key: 'lead', header: 'Lead time', align: 'right', render: (p) => { const first = receiptSummary.get(p.id)?.first; return first && p.sent_on ? `${daysBetween(p.sent_on, first)} of ${p.quoted_lead_days ?? supplier.quoted_lead_time_days} days` : '—'; } },
                { key: 'fill', header: 'Filled', align: 'right', render: (p) => (p.status === 'draft' || p.ordered === 0 ? '—' : formatPct(p.received / p.ordered, 0)) },
                { key: 'total', header: 'Total', align: 'right', render: (p) => <MoneyCell value={p.total} /> },
              ]}
            />
          </Card>

          <Card title="Bills" subtitle="Accounts payable for this supplier." padded={false}>
            <DataTable<ApBill>
              aria-label="Supplier bills" density="compact" rows={bills} loading={billsQ.isLoading} empty="No bills yet. A bill is created each time an order is received."
              columns={[
                { key: 'po', header: 'Order', render: (b) => (b.po_id ? <Link className="gz-link gz-mono" to={`/purchasing/${b.po_id}`}>{poMap.get(b.po_id)?.po_number ?? `PO ${b.po_id}`}</Link> : '—') },
                { key: 'bill_date', header: 'Billed', render: (b) => <span className="gz-num">{formatDate(b.bill_date)}</span> },
                { key: 'due_date', header: 'Due', render: (b) => <span className="gz-num">{formatDate(b.due_date)}</span> },
                { key: 'amount', header: 'Amount', align: 'right', render: (b) => <MoneyCell value={b.amount} /> },
                { key: 'paid', header: 'Paid', align: 'right', render: (b) => <MoneyCell value={b.amount_paid} /> },
                { key: 'balance', header: 'Balance', align: 'right', render: (b) => <MoneyCell value={toNumber(b.amount) - toNumber(b.amount_paid)} strong /> },
                {
                  key: 'status', header: 'Status',
                  render: (b) => { const bal = toNumber(b.amount) - toNumber(b.amount_paid); return bal <= 0 ? <StatusBadge status="paid" /> : b.due_date < today ? <StatusBadge status="overdue" label={`${daysBetween(b.due_date, today)} days overdue`} /> : <StatusBadge status="open" label="Open" />; },
                },
                {
                  key: 'pay', header: '', align: 'right',
                  render: (b) => { const bal = toNumber(b.amount) - toNumber(b.amount_paid); return bal > 0 ? <Button size="sm" onClick={() => setPaying({ id: b.id, supplierName: supplier.name, poNumber: b.po_id ? poMap.get(b.po_id)?.po_number ?? null : null, dueDate: b.due_date, balance: bal })}>Record payment</Button> : null; },
                },
              ]}
            />
          </Card>
        </div>

        <div className="gz-stack">
          <Card title="Details">
            <KeyValue
              rows={[
                ['Contact', supplier.contact_name ?? '—'],
                ['Email', supplier.email ? <a className="gz-link" href={`mailto:${supplier.email}`}>{supplier.email}</a> : '—'],
                ['Phone', supplier.phone ?? '—'],
                ['Address', supplier.address ?? '—'],
                ['Payment terms', `${supplier.terms_label} (${supplier.terms_days} days)`],
                ['Quoted lead time', `${supplier.quoted_lead_time_days} days`],
              ]}
            />
            {supplier.notes && <p className="gz-muted text-body-sm" style={{ marginTop: 'var(--space-4)' }}>{supplier.notes}</p>}
          </Card>
          <Card title="Items supplied" padded={false}>
            <DataTable
              aria-label="Items supplied" rowKey="item_id" density="compact" rows={supplied} loading={suppliedQ.isLoading || itemsQ.isLoading} empty="No items linked yet. Link items in Items."
              columns={[
                { key: 'item', header: 'Item', render: (s) => <ItemCell item={itemMap.get(s.item_id)} to /> },
                { key: 'cost', header: 'Unit cost', align: 'right', render: (s) => formatUnitCost(s.unit_cost) },
                { key: 'pack', header: 'Pack', align: 'right', render: (s) => formatNumber(s.pack_size, 0) },
                { key: 'pref', header: '', render: (s) => (s.is_preferred ? <Badge tone="accent">Preferred</Badge> : null) },
              ]}
            />
          </Card>
        </div>
      </div>

      <SupplierFormDialog open={editing} supplier={supplier} onClose={() => setEditing(false)} />
      <PaymentDialog bill={paying} onClose={() => setPaying(null)} />
    </div>
  );
}

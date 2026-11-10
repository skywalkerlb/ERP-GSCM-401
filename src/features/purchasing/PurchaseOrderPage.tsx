import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, MoneyCell, PageHeader, QtyCell, Skeleton, StatusBadge,
} from '@/components';
import { STOCK_DOMAINS, indexBy, toNumber, useAction, useItems, useSuppliers } from '@/features/items/api';
import { ErrorAlert, ItemCell, KeyValue, LateBadge, TimelinessBadge, plural, sourceLabel } from '@/features/items/ui';
import { useLocations } from '@/hooks/useLocations';
import { useRole } from '@/hooks/useRole';
import { businessDate, daysBetween, formatDate, formatMoney, formatNumber } from '@/lib/format';
import { rpc } from '@/lib/rpc';
import { PaymentDialog, type PayableBill } from './PaymentDialog';
import { poStatusKey, usePurchaseOrder, type BillView } from './api';

export default function PurchaseOrderPage() {
  const { id: raw } = useParams();
  const id = Number(raw);
  const navigate = useNavigate();
  const { hasRole } = useRole();
  const detailQ = usePurchaseOrder(id);
  const suppliersQ = useSuppliers();
  const itemsQ = useItems();
  const locationsQ = useLocations();
  const [confirm, setConfirm] = useState<'send' | 'close' | null>(null);
  const [paying, setPaying] = useState<PayableBill | null>(null);

  const itemMap = useMemo(() => indexBy(itemsQ.data, (i) => i.id), [itemsQ.data]);
  const supplierMap = useMemo(() => indexBy(suppliersQ.data, (s) => s.id), [suppliersQ.data]);
  const locMap = useMemo(() => indexBy(locationsQ.data, (l) => l.id), [locationsQ.data]);

  const send = useAction(() => rpc.sendPurchaseOrder({ po_id: id }), {
    invalidate: STOCK_DOMAINS, success: 'Order sent. The expected date is set from the supplier lead time.', errorTitle: 'Could not send the order',
  });
  const close = useAction(() => rpc.closePurchaseOrder({ po_id: id }), {
    invalidate: STOCK_DOMAINS, success: 'Purchase order closed.', errorTitle: 'Could not close the order',
  });

  if (!Number.isFinite(id)) {
    return <EmptyState icon="bag" title="That purchase order link is not valid" action={<Button variant="primary" onClick={() => navigate('/purchasing')}>Back to purchasing</Button>} />;
  }
  if (detailQ.isLoading) {
    return (
      <div className="gz-stack">
        <PageHeader title="Purchase order" breadcrumb={[{ label: 'Buy' }, { label: 'Purchasing', to: '/purchasing' }, { label: 'Purchase order' }]} />
        <Skeleton variant="block" />
        <Skeleton variant="block" />
      </div>
    );
  }
  if (detailQ.error) return <ErrorAlert error={detailQ.error} onRetry={() => void detailQ.refetch()} />;
  const detail = detailQ.data;
  if (!detail) {
    return <EmptyState icon="bag" title="We could not find that purchase order" description="It may have been removed." action={<Button variant="primary" onClick={() => navigate('/purchasing')}>Back to purchasing</Button>} />;
  }

  const { po, receipts, bills } = detail;
  const supplier = supplierMap.get(po.supplier_id);
  const status = poStatusKey(po);
  const isDraft = po.status === 'draft';
  const isOpen = po.status === 'sent';
  const canReceive = isOpen && hasRole('manager', 'baker');
  const firstReceipt = receipts[0];
  const lastReceipt = receipts[receipts.length - 1];
  const actualLead = po.sent_on && firstReceipt ? daysBetween(po.sent_on, firstReceipt.received_on) : null;
  const remainingValue = po.lines.reduce(
    (s, l) => s + Math.max(0, toNumber(l.qty_ordered) - toNumber(l.qty_received) - toNumber(l.qty_cancelled)) * toNumber(l.unit_cost),
    0,
  );

  return (
    <div className="gz-stack">
      <PageHeader
        title={po.po_number}
        breadcrumb={[{ label: 'Buy' }, { label: 'Purchasing', to: '/purchasing' }, { label: po.po_number }]}
        subtitle={
          <span className="gz-row" style={{ gap: 'var(--space-2)' }}>
            <StatusBadge status={status.status} label={status.label} />
            <LateBadge expectedOn={po.expected_on} open={po.open > 0 && isOpen} />
            <span>{supplier?.name ?? ''}</span>
          </span>
        }
        actions={
          <>
            <Button icon="printer" onClick={() => navigate(`/purchasing/${po.id}/print`)}>Print</Button>
            {isDraft && <Button variant="danger" onClick={() => setConfirm('close')}>Cancel order</Button>}
            {isOpen && <Button onClick={() => setConfirm('close')}>Close order</Button>}
            {isDraft && <Button variant="primary" icon="truck" onClick={() => setConfirm('send')}>Send to supplier</Button>}
            {canReceive && <Button variant="primary" icon="truck" onClick={() => navigate(`/inventory/receive?po=${po.id}`)}>Receive stock</Button>}
          </>
        }
      />

      {po.partial && (
        <Alert tone="warning" title="Partially received">
          {formatNumber(po.open)} units ({formatMoney(remainingValue)}) are still on backorder{po.expected_on ? `, expected ${formatDate(po.expected_on)}` : ''}. Receive the rest when it arrives, or close the order to cancel it.
        </Alert>
      )}
      {po.late && !po.partial && (
        <Alert tone="danger" title={`This order is ${po.daysLate} ${po.daysLate === 1 ? 'day' : 'days'} late`}>
          It was expected {formatDate(po.expected_on)}. Call {supplier?.contact_name ?? 'the supplier'}{supplier?.phone ? ` on ${supplier.phone}` : ''}.
        </Alert>
      )}
      {isDraft && <Alert tone="info" title="This order is a draft">Nothing is ordered until you send it. Sending sets the expected date from the lead time.</Alert>}

      <div className="gz-detail">
        <div className="gz-stack">
          <Card title="Lines" padded={false}>
            <DataTable
              aria-label="Purchase order lines" rowKey="id" density="compact" rows={po.lines}
              columns={[
                { key: 'item', header: 'Item', render: (l) => <ItemCell item={itemMap.get(l.item_id)} to /> },
                { key: 'ordered', header: 'Ordered', align: 'right', render: (l) => <QtyCell qty={l.qty_ordered} item={itemMap.get(l.item_id)} /> },
                { key: 'received', header: 'Received', align: 'right', render: (l) => <QtyCell qty={l.qty_received} item={itemMap.get(l.item_id)} /> },
                { key: 'cancelled', header: 'Cancelled', align: 'right', render: (l) => (toNumber(l.qty_cancelled) > 0 ? <QtyCell qty={l.qty_cancelled} item={itemMap.get(l.item_id)} /> : <span className="gz-muted">—</span>) },
                {
                  key: 'open', header: 'Still expected', align: 'right',
                  render: (l) => {
                    const open = Math.max(0, toNumber(l.qty_ordered) - toNumber(l.qty_received) - toNumber(l.qty_cancelled));
                    return open > 0 && !isDraft ? <Badge tone="warning">{formatNumber(open)}</Badge> : <span className="gz-muted">—</span>;
                  },
                },
                { key: 'unit_cost', header: 'Unit cost', align: 'right', render: (l) => <MoneyCell value={l.unit_cost} unitCost /> },
                { key: 'total', header: 'Line total', align: 'right', render: (l) => <MoneyCell value={toNumber(l.qty_ordered) * toNumber(l.unit_cost)} /> },
                { key: 'expected', header: 'Expected', render: (l) => <span className="gz-num">{l.expected_on ? formatDate(l.expected_on) : '—'}</span> },
              ]}
            />
            <div className="stk-total-row"><span>{plural(po.lines.length, 'line')}</span><strong>{formatMoney(po.total)}</strong></div>
          </Card>

          <Card title="Receipt history" subtitle="Each delivery against this order, and whether it came on time." padded={false}>
            <DataTable
              aria-label="Receipts" rowKey="id" density="compact" rows={receipts}
              empty="Nothing received yet."
              columns={[
                { key: 'receipt_no', header: 'Receipt', mono: true },
                { key: 'received_on', header: 'Received', render: (r) => <span className="gz-num">{formatDate(r.received_on)}</span> },
                { key: 'timely', header: 'Against expected', render: (r) => <TimelinessBadge expectedOn={po.expected_on} receivedOn={r.received_on} /> },
                { key: 'location', header: 'Location', render: (r) => locMap.get(r.location_id)?.name ?? '—' },
                { key: 'lines', header: 'Lines', align: 'right', render: (r) => r.lines.length },
                { key: 'amount', header: 'Amount', align: 'right', render: (r) => <MoneyCell value={r.amount} strong /> },
              ]}
            />
          </Card>
        </div>

        <div className="gz-stack">
          <Card title="Details">
            <KeyValue
              rows={[
                ['Supplier', supplier ? <Link className="gz-link" to={`/suppliers/${supplier.id}`}>{supplier.name}</Link> : '—'],
                ['Ship to', locMap.get(po.ship_to_location_id)?.name ?? '—'],
                ['Created', formatDate(po.created_on)],
                ['Sent', po.sent_on ? formatDate(po.sent_on) : 'Not sent yet'],
                ['Expected', po.expected_on ? formatDate(po.expected_on) : 'Set when sent'],
                ['Quoted lead time', po.quoted_lead_days !== null ? `${po.quoted_lead_days} days` : `${supplier?.quoted_lead_time_days ?? '—'} days`],
                ['Actual lead time', actualLead !== null ? `${actualLead} ${actualLead === 1 ? 'day' : 'days'}` : '—'],
                ['Last received', lastReceipt ? formatDate(lastReceipt.received_on) : '—'],
                ['Source', sourceLabel(po.source)],
                ['Total', <strong key="t">{formatMoney(po.total)}</strong>],
              ]}
            />
            {po.notes && <p className="gz-muted text-body-sm" style={{ marginTop: 'var(--space-4)' }}>{po.notes}</p>}
          </Card>

          <Card title="Supplier bill" subtitle={supplier ? `${supplier.terms_label}. Billed when stock is received.` : undefined}>
            {bills.length === 0 ? (
              <p className="gz-muted">No bill yet. The bill is created when stock is received, with the due date from the payment terms.</p>
            ) : (
              <div className="gz-stack gz-stack--sm">
                {bills.map((b) => (
                  <BillBlock
                    key={b.id}
                    bill={b}
                    onPay={() => setPaying({ id: b.id, supplierName: supplier?.name ?? 'Supplier', poNumber: po.po_number, dueDate: b.due_date, balance: toNumber(b.amount) - toNumber(b.amount_paid) })}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'send'} onClose={() => setConfirm(null)} title={`Send ${po.po_number}?`} confirmLabel="Send order" cancelLabel="Not yet"
        onConfirm={async () => { await send.mutateAsync(undefined).catch(() => undefined); }}
      >
        This marks the order as sent to {supplier?.name ?? 'the supplier'} and sets the expected delivery date from their lead time. Print it first if you need to send a copy.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'close'} onClose={() => setConfirm(null)} tone="danger"
        title={isDraft ? `Cancel ${po.po_number}?` : `Close ${po.po_number}?`} confirmLabel={isDraft ? 'Cancel order' : 'Close order'} cancelLabel="Keep it"
        onConfirm={async () => { await close.mutateAsync(undefined).catch(() => undefined); }}
      >
        {isDraft
          ? 'The draft is cancelled and nothing is ordered.'
          : `Anything not yet received (${formatNumber(po.open)} units) is cancelled and counts against the supplier's fill rate.`}
      </ConfirmDialog>
      <PaymentDialog bill={paying} onClose={() => setPaying(null)} />
    </div>
  );
}

function BillBlock({ bill, onPay }: { bill: BillView; onPay: () => void }) {
  const balance = toNumber(bill.amount) - toNumber(bill.amount_paid);
  const overdue = balance > 0 && bill.due_date < businessDate();
  return (
    <div className="gz-stack gz-stack--sm">
      <KeyValue
        rows={[
          ['Bill date', formatDate(bill.bill_date)],
          ['Due date', <span key="d">{formatDate(bill.due_date)} {overdue && <StatusBadge status="overdue" label={`${daysBetween(bill.due_date, businessDate())} days overdue`} />}</span>],
          ['Amount', formatMoney(bill.amount)],
          ['Paid', formatMoney(bill.amount_paid)],
          ['Balance', <strong key="b">{formatMoney(balance)}</strong>],
          ['Status', <StatusBadge key="s" status={balance > 0 ? 'open' : 'paid'} label={balance > 0 ? 'Open' : 'Paid'} />],
        ]}
      />
      {bill.payments.length > 0 && (
        <ul className="gz-muted text-body-sm" style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
          {bill.payments.map((p) => <li key={p.id}>{formatMoney(p.amount)} on {formatDate(p.paid_on)} by {p.method.toUpperCase()}</li>)}
        </ul>
      )}
      {balance > 0 && <Button onClick={onPay}>Record payment</Button>}
    </div>
  );
}

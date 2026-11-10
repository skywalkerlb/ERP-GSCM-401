import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, ConfirmDialog, DataTable, EmptyState, MoneyCell, PageHeader, SkeletonLines, StatusBadge, TextField, useToast, type DataTableColumn } from '@/components';
import { Icon } from '@/components/Icon';
import { PaymentDialog } from '@/features/pos/PaymentDialog';
import { invalidateSelling, useAvailability } from '@/features/pos/api';
import { computeTotals, splitMessage } from '@/features/pos/calc';
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPct, formatTime, formatWeekday } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { rpc, rpcErrorMessage } from '@/lib/rpc';
import type { Payment } from '@/types/domain';
import { CHANNEL_LABEL, fetchOrder, STATUS_LABEL, type OrderDetail } from './api';
import './orders.css';

type Line = OrderDetail['so_lines'][number];

interface Step {
  label: string;
  when: string | null;
  note?: string | null;
  state: 'done' | 'current' | 'pending' | 'stopped';
}

function buildSteps(o: OrderDetail): Step[] {
  const steps: Step[] = [{ label: 'Order placed', when: o.created_at, state: 'done' }];
  if (o.status === 'cancelled') {
    steps.push({ label: 'Cancelled', when: null, note: o.cancelled_reason ? `Reason: ${o.cancelled_reason}` : 'No reason was given.', state: 'stopped' });
    return steps;
  }
  steps.push({ label: 'Fulfilled', when: o.fulfilled_at, state: o.fulfilled_at ? 'done' : 'current' });
  steps.push({ label: 'Closed', when: o.closed_at, state: o.closed_at ? 'done' : o.fulfilled_at ? 'current' : 'pending' });
  return steps;
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const orderId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const orderQ = useQuery({ queryKey: queryKeys.orders.detail(orderId), enabled: Number.isFinite(orderId), queryFn: () => fetchOrder(orderId) });
  const order = orderQ.data;
  const availQ = useAvailability(order?.location_id ?? null);

  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reason, setReason] = useState('');

  const fulfill = useMutation({
    mutationFn: (payment: Payment) => rpc.fulfillSalesOrder({ so_id: orderId, payment }),
    onSuccess: (res) => {
      invalidateSelling(qc);
      setPayOpen(false);
      toast.success('Order fulfilled', `${res.receipt_no} for ${formatMoney(res.total)}`);
    },
  });

  const crumbs = [{ label: 'Sell' }, { label: 'Orders', to: '/orders' }, { label: order?.so_number ?? 'Order' }];

  if (orderQ.isLoading) {
    return (
      <>
        <PageHeader title="Order" breadcrumb={crumbs} />
        <Card>
          <SkeletonLines lines={6} />
        </Card>
      </>
    );
  }
  if (orderQ.isError || !order) {
    return (
      <>
        <PageHeader title="Order" breadcrumb={crumbs} />
        {orderQ.isError ? (
          <Alert tone="danger" title="Could not load the order" action={<Button size="sm" onClick={() => void orderQ.refetch()}>Try again</Button>}>
            {rpcErrorMessage(orderQ.error)}
          </Alert>
        ) : (
          <EmptyState
            icon="clipboard"
            title="That order does not exist"
            description="It may have been removed, or the link is wrong. Check the order number in the list."
            action={
              <Button variant="primary" onClick={() => navigate('/orders')}>
                Back to orders
              </Button>
            }
          />
        )}
      </>
    );
  }

  const placed = order.status === 'placed';
  const taxRate = order.locations?.tax_rate ?? 0;
  const totals = computeTotals(order.so_lines.map((l) => ({ qty: l.qty, unitPrice: l.unit_price, discountPct: 0 })), null, taxRate);
  const avail = availQ.data;
  const shortLines = placed ? order.so_lines.filter((l) => l.qty > Number(avail?.get(l.item_id)?.on_hand ?? 0)) : [];
  const fulfillError = fulfill.isError ? rpcErrorMessage(fulfill.error) : null;

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action();
      invalidateSelling(qc);
      toast.success(done, order?.so_number);
    } catch (e) {
      toast.error('That did not go through', rpcErrorMessage(e));
    }
  }

  const placedColumns: DataTableColumn<Line>[] = [
    { key: 'on_hand', header: 'On hand', align: 'right', render: (l) => <span className="gz-num">{avail ? formatNumber(avail.get(l.item_id)?.on_hand ?? 0) : '—'}</span> },
    { key: 'backordered', header: 'Backordered', align: 'right', render: (l) => <span className="gz-num">{avail ? formatNumber(avail.get(l.item_id)?.backordered ?? 0) : '—'}</span> },
    {
      key: 'ready',
      header: 'Availability',
      render: (l) => {
        const av = avail?.get(l.item_id);
        if (!av) return <span className="gz-muted">—</span>;
        const short = l.qty - Number(av.on_hand);
        return short <= 0 ? (
          <StatusBadge status="in_stock" label="Ready" />
        ) : (
          <span className="gz-row" style={{ gap: 'var(--space-2)', flexWrap: 'nowrap' }}>
            <StatusBadge status="backordered" label={`Short by ${formatNumber(short)}`} />
            <span className="text-body-sm gz-muted">ready by {formatDate(av.est_available_date)}</span>
          </span>
        );
      },
    },
  ];
  const doneColumns: DataTableColumn<Line>[] = [
    { key: 'filled', header: 'Filled', align: 'right', render: (l) => <span className="gz-num">{formatNumber(l.qty_fulfilled)}</span> },
  ];
  const extraColumns = placed ? placedColumns : doneColumns;

  const columns: DataTableColumn<Line>[] = [
    {
      key: 'item',
      header: 'Item',
      render: (l) => (
        <div>
          <div className="text-body-strong">{l.items?.name ?? 'Item'}</div>
          <div className="gz-mono text-caption gz-muted">{l.items?.sku}</div>
        </div>
      ),
    },
    { key: 'qty', header: 'Ordered', align: 'right', render: (l) => <span className="gz-num">{formatNumber(l.qty)}</span> },
    { key: 'price', header: 'Price', align: 'right', render: (l) => <MoneyCell value={l.unit_price} /> },
    { key: 'total', header: 'Line total', align: 'right', render: (l) => <MoneyCell value={l.qty * l.unit_price} strong /> },
    ...extraColumns,
  ];
  return (
    <>
      <PageHeader
        title={order.so_number}
        breadcrumb={crumbs}
        subtitle={
          <>
            For {order.customers?.name ?? 'a customer'} at {order.locations?.name ?? 'a shop'}, needed {formatWeekday(order.requested_for)}, {formatTime(order.requested_for)}
          </>
        }
        actions={
          <>
            <StatusBadge status={order.status} label={STATUS_LABEL[order.status]} />
            {order.sale_id && (
              <Button icon="receipt" onClick={() => navigate(`/pos/receipt/${order.sale_id}`)}>
                View receipt
              </Button>
            )}
            {placed && (
              <>
                <Button
                  onClick={() => {
                    setReason('');
                    setCancelOpen(true);
                  }}
                >
                  Cancel order
                </Button>
                <Button
                  variant="primary"
                  icon="check"
                  onClick={() => {
                    fulfill.reset();
                    setPayOpen(true);
                  }}
                >
                  Fulfill order
                </Button>
              </>
            )}
            {order.status === 'fulfilled' && (
              <Button variant="primary" icon="check" onClick={() => setCloseOpen(true)}>
                Close order
              </Button>
            )}
          </>
        }
      />

      <div className="gz-detail">
        <div className="gz-stack">
          {shortLines.length > 0 && (
            <Alert tone="warning" title={`${shortLines.length === 1 ? 'One item is' : `${shortLines.length} items are`} short right now`}>
              {shortLines.map((l) => l.items?.name).join(', ')}. You can still fulfill once the stock arrives, or move stock in from the kitchen first.
            </Alert>
          )}
          <Card title="Items" padded={false}>
            <DataTable aria-label="Order items" columns={columns} rows={order.so_lines} />
          </Card>
          {placed && <p className="text-body-sm ord-hint">Backordered counts every open order at this shop, not just this one.</p>}
        </div>

        <div className="gz-stack gz-stack--sm">
          <Card title="Progress">
            <ol className="ord-timeline">
              {buildSteps(order).map((s) => (
                <li key={s.label} className={`ord-step is-${s.state === 'done' ? 'done' : s.state}`}>
                  <span className="ord-step__dot" aria-hidden="true">
                    <Icon name={s.state === 'done' ? 'check' : s.state === 'stopped' ? 'x' : 'clock'} size={14} />
                  </span>
                  <div>
                    <div className="ord-step__label">{s.label}</div>
                    <div className="ord-step__when text-body-sm">{s.when ? formatDateTime(s.when) : (s.note ?? (s.state === 'current' ? 'Waiting' : 'Not yet'))}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Order details">
            <dl className="ord-facts text-body-sm">
              <dt>Customer</dt>
              <dd>{order.customers?.name ?? '—'}</dd>
              {order.customers?.phone && (
                <>
                  <dt>Phone</dt>
                  <dd>{order.customers.phone}</dd>
                </>
              )}
              {order.customers?.email && (
                <>
                  <dt>Email</dt>
                  <dd>{order.customers.email}</dd>
                </>
              )}
              <dt>Shop</dt>
              <dd>{order.locations?.name ?? '—'}</dd>
              <dt>Channel</dt>
              <dd>{CHANNEL_LABEL[order.channel] ?? order.channel}</dd>
              <dt>Needed by</dt>
              <dd>{formatDateTime(order.requested_for)}</dd>
              {order.notes && (
                <>
                  <dt>Notes</dt>
                  <dd>{order.notes}</dd>
                </>
              )}
            </dl>
          </Card>

          <Card title="Totals">
            <dl className="ord-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatMoney(totals.subtotal)}</dd>
              </div>
              <div>
                <dt>{order.sale_id ? 'Tax' : 'Estimated tax'} ({formatPct(taxRate, 2)})</dt>
                <dd>{formatMoney(totals.tax)}</dd>
              </div>
              <div className="is-total">
                <dt>{order.sale_id ? 'Total' : 'Estimated total'}</dt>
                <dd className="text-h2">{formatMoney(totals.total)}</dd>
              </div>
            </dl>
            {order.sale_id && (
              <p className="text-body-sm ord-hint">
                Paid on <Link className="gz-link" to={`/pos/receipt/${order.sale_id}`}>the receipt</Link>.
              </p>
            )}
          </Card>
        </div>
      </div>

      <PaymentDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={`Fulfill ${order.so_number}`}
        total={totals.total}
        busy={fulfill.isPending}
        confirmLabel="Fulfill order"
        onConfirm={(p) => fulfill.mutate(p)}
        error={
          fulfillError && (
            <Alert tone="danger" title="This order cannot be fulfilled yet">
              {splitMessage(fulfillError).length > 1 ? (
                <ul className="sell-list">
                  {splitMessage(fulfillError).map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              ) : (
                fulfillError
              )}
              <div className="text-body-sm">Move stock in from another location or wait for the bake, then try again.</div>
            </Alert>
          )
        }
      />

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        tone="danger"
        title={`Cancel ${order.so_number}?`}
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        onConfirm={() => run(() => rpc.cancelSalesOrder({ so_id: orderId, reason: reason.trim() || null }), 'Order cancelled')}
      >
        <div className="gz-stack gz-stack--sm">
          <p className="text-body" style={{ margin: 0 }}>
            The stock set aside for this order goes back on the shelf. This cannot be undone.
          </p>
          <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} hint="For example, customer changed the date." autoComplete="off" />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title={`Close ${order.so_number}?`}
        confirmLabel="Close order"
        cancelLabel="Not yet"
        onConfirm={() => run(() => rpc.closeSalesOrder({ so_id: orderId }), 'Order closed')}
      >
        <p className="text-body" style={{ margin: 0 }}>
          Closing marks the order as done. Use it after the customer has picked it up or it has been delivered.
        </p>
      </ConfirmDialog>
    </>
  );
}

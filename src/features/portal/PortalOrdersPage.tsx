import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, ConfirmDialog, EmptyState, PageHeader, SkeletonLines, StatusBadge, Tabs, TextField, useToast } from '@/components';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { rpc, rpcErrorMessage } from '@/lib/rpc';
import type { MyOrder, SalesOrderStatus } from '@/types/domain';
import { useMyOrders } from './api';
import './portal.css';

const STATUS_LABEL: Record<SalesOrderStatus, string> = {
  placed: 'Order placed',
  fulfilled: 'Picked up',
  closed: 'Complete',
  cancelled: 'Cancelled',
};

const STATUS_NOTE: Record<SalesOrderStatus, string> = {
  placed: 'The shop has your order and is getting it ready.',
  fulfilled: 'Picked up and paid. Thank you.',
  closed: 'All done. Thank you for ordering.',
  cancelled: 'This order was cancelled.',
};

export default function PortalOrdersPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const ordersQ = useMyOrders();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [cancelling, setCancelling] = useState<MyOrder | null>(null);
  const [reason, setReason] = useState('');

  const orders = useMemo(() => ordersQ.data ?? [], [ordersQ.data]);
  const upcoming = useMemo(() => orders.filter((o) => o.status === 'placed').sort((a, b) => a.requested_for.localeCompare(b.requested_for)), [orders]);
  const past = useMemo(() => orders.filter((o) => o.status !== 'placed'), [orders]);
  const shown = tab === 'upcoming' ? upcoming : past;

  const cancel = useMutation({
    mutationFn: (o: MyOrder) => rpc.cancelSalesOrder({ so_id: o.id, reason: reason.trim() || null }),
    onSuccess: (_d, o) => {
      void qc.invalidateQueries({ queryKey: queryKeys.orders.all });
      void qc.invalidateQueries({ queryKey: queryKeys.catalog.all });
      toast.success('Order cancelled', o.so_number);
    },
  });

  return (
    <>
      <PageHeader
        title="My orders"
        breadcrumb={[{ label: 'Shop', to: '/shop' }, { label: 'My orders' }]}
        subtitle="Your pickup orders. Status updates here as soon as the shop changes it."
      />

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Tabs
          aria-label="Orders"
          items={[
            { value: 'upcoming', label: 'Upcoming', count: upcoming.length },
            { value: 'past', label: 'Past', count: past.length },
          ]}
          value={tab}
          onChange={(v) => setTab(v as 'upcoming' | 'past')}
        />
      </div>

      {ordersQ.isError && (
        <Alert tone="danger" title="Could not load your orders" action={<Button size="sm" onClick={() => void ordersQ.refetch()}>Try again</Button>}>
          {rpcErrorMessage(ordersQ.error)}
        </Alert>
      )}
      {cancel.isError && (
        <Alert tone="danger" title="Could not cancel the order">
          {rpcErrorMessage(cancel.error)} If the shop has already started on it, call the shop.
        </Alert>
      )}

      {ordersQ.isLoading ? (
        <Card>
          <SkeletonLines lines={4} />
        </Card>
      ) : shown.length === 0 ? (
        <EmptyState
          icon="clipboard"
          title={tab === 'upcoming' ? 'No orders on the way' : 'No past orders yet'}
          description={tab === 'upcoming' ? 'Order ahead and skip the line. Your next pickup will show up here.' : 'Finished and cancelled orders are kept here.'}
          action={
            <Button variant="primary" onClick={() => navigate('/shop')}>
              Browse the shop
            </Button>
          }
        />
      ) : (
        <div className="gz-stack gz-stack--sm">
          {shown.map((o) => (
            <Card key={o.id}>
              <div className="shop-order">
                <div className="shop-order__head">
                  <div>
                    <span className="gz-mono text-h3">{o.so_number}</span>
                    <div className="text-body-sm gz-muted">
                      Pickup at {o.location_name}, {formatDateTime(o.requested_for)}
                    </div>
                  </div>
                  <StatusBadge status={o.status} label={STATUS_LABEL[o.status]} />
                </div>
                <p className="text-body-sm" style={{ margin: 0 }}>
                  {STATUS_NOTE[o.status]}
                  {o.status === 'cancelled' && o.cancelled_reason ? ` Reason: ${o.cancelled_reason}.` : ''}
                </p>
                <ul className="shop-order__lines text-body">
                  {o.lines.map((l) => (
                    <li key={`${o.id}-${l.item_id}`}>
                      <span>
                        {formatNumber(l.qty)} x {l.name}
                      </span>
                      <span className="gz-num">{formatMoney(l.qty * l.unit_price)}</span>
                    </li>
                  ))}
                </ul>
                <div className="shop-order__foot">
                  <span className="text-body-strong">Subtotal before tax: {formatMoney(o.total)}</span>
                  {o.status === 'placed' && (
                    <Button
                      onClick={() => {
                        setReason('');
                        cancel.reset();
                        setCancelling(o);
                      }}
                    >
                      Cancel order
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        tone="danger"
        title={`Cancel ${cancelling?.so_number ?? 'this order'}?`}
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        onConfirm={async () => {
          if (cancelling) await cancel.mutateAsync(cancelling).catch(() => undefined);
        }}
      >
        <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} hint="Tell us why so we can do better." autoComplete="off" />
      </ConfirmDialog>
    </>
  );
}

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { SkeletonLines } from '@/components/Skeleton';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Tabs } from '@/components/Tabs';
import { MoneyCell } from '@/components/cells';
import '@/features/reports/insights.css';
import { useSelectedLocation } from '@/hooks/useLocations';
import { formatDate, formatDateTime, formatMoney, formatNumber, sentenceCase } from '@/lib/format';
import { rpcErrorMessage } from '@/lib/rpc';
import { useCustomer, useCustomerOrders, useCustomerReturns, useCustomerSales, type CustomerOrder, type CustomerReturn, type CustomerSale } from './api';
import { CustomerDialog } from './CustomerDialog';
import { KindBadge } from './CustomersPage';

type TabId = 'orders' | 'sales' | 'returns';

export default function CustomerDetailPage() {
  const id = Number(useParams().id);
  const { locations } = useSelectedLocation();
  const customer = useCustomer(id);
  const orders = useCustomerOrders(id);
  const sales = useCustomerSales(id);
  const saleIds = useMemo(() => (sales.data ?? []).map((s) => s.id), [sales.data]);
  const returns = useCustomerReturns(id, saleIds);
  const [tab, setTab] = useState<TabId>('orders');
  const [editing, setEditing] = useState(false);
  const shop = (locId: number) => locations.find((l) => l.id === locId)?.name ?? '';

  const c = customer.data;
  const orderRows = orders.data ?? [];
  const saleRows = sales.data ?? [];
  const returnRows = returns.data ?? [];
  const spend = saleRows.reduce((s, r) => s + r.total, 0);
  const refunds = returnRows.reduce((s, r) => s + r.refund_total, 0);
  const lastOrder = orderRows.filter((o) => o.status !== 'cancelled')[0]?.requested_for ?? null;

  const orderCols: DataTableColumn<CustomerOrder>[] = [
    { key: 'so_number', header: 'Order', mono: true, render: (r) => <Link className="ins-link" to={`/orders/${r.id}`}>{r.so_number}</Link> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'channel', header: 'Channel', render: (r) => sentenceCase(r.channel) },
    { key: 'requested_for', header: 'Wanted for', sortable: true, render: (r) => formatDateTime(r.requested_for) },
    { key: 'location', header: 'Shop', render: (r) => shop(r.location_id) },
    { key: 'total', header: 'Total', align: 'right', render: (r) => <MoneyCell value={r.total} strong /> },
  ];
  const saleCols: DataTableColumn<CustomerSale>[] = [
    { key: 'receipt_no', header: 'Receipt', mono: true, render: (r) => <Link className="ins-link" to={`/pos/receipt/${r.id}`}>{r.receipt_no}</Link> },
    { key: 'sold_at', header: 'Sold', sortable: true, render: (r) => formatDateTime(r.sold_at) },
    { key: 'location', header: 'Shop', render: (r) => shop(r.location_id) },
    { key: 'channel', header: 'Channel', render: (r) => sentenceCase(r.channel) },
    { key: 'subtotal', header: 'Subtotal', align: 'right', render: (r) => <MoneyCell value={r.subtotal} /> },
    { key: 'discount_total', header: 'Discount', align: 'right', render: (r) => <MoneyCell value={r.discount_total} /> },
    { key: 'tax_total', header: 'Tax', align: 'right', render: (r) => <MoneyCell value={r.tax_total} /> },
    { key: 'total', header: 'Total', align: 'right', render: (r) => <MoneyCell value={r.total} strong /> },
    { key: 'payment_method', header: 'Paid by', render: (r) => sentenceCase(r.payment_method) },
  ];
  const receiptOf = (saleId: number) => saleRows.find((s) => s.id === saleId);
  const returnCols: DataTableColumn<CustomerReturn>[] = [
    { key: 'return_no', header: 'Return', mono: true },
    { key: 'sale_id', header: 'Receipt', mono: true, render: (r) => <Link className="ins-link" to={`/pos/receipt/${r.sale_id}`}>{receiptOf(r.sale_id)?.receipt_no ?? r.sale_id}</Link> },
    { key: 'returned_at', header: 'Returned', sortable: true, render: (r) => formatDateTime(r.returned_at) },
    { key: 'kind', header: 'Kind', render: (r) => sentenceCase(r.kind) },
    { key: 'refund_total', header: 'Refunded', align: 'right', render: (r) => <MoneyCell value={r.refund_total} strong /> },
    { key: 'net_due', header: 'Net due', align: 'right', render: (r) => <MoneyCell value={r.net_due} /> },
  ];

  if (customer.isLoading) {
    return (
      <>
        <PageHeader title="Customer" breadcrumb={[{ label: 'Setup' }, { label: 'Customers', to: '/customers' }, { label: 'Loading' }]} />
        <Card><SkeletonLines lines={5} /></Card>
      </>
    );
  }
  if (customer.isError || !c) {
    return (
      <>
        <PageHeader title="Customer" breadcrumb={[{ label: 'Setup' }, { label: 'Customers', to: '/customers' }, { label: 'Not found' }]} />
        {customer.isError ? (
          <Alert tone="danger" title="Could not load this customer">{rpcErrorMessage(customer.error)} Go back to the list and try again.</Alert>
        ) : (
          <EmptyState icon="users" title="That customer does not exist" description="It may have been removed. Pick one from the list." action={<Link className="ins-link" to="/customers">Back to customers</Link>} />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={c.name}
        breadcrumb={[{ label: 'Setup' }, { label: 'Customers', to: '/customers' }, { label: c.name }]}
        subtitle={<><KindBadge kind={c.kind} /> {c.is_active ? '' : 'Inactive. '}Customer since {formatDate(c.created_at)}</>}
        actions={<Button variant="secondary" icon="edit" onClick={() => setEditing(true)}>Edit customer</Button>}
      />
      <div className="gz-stack">
        <div className="gz-grid-stats">
          <StatCard label="Orders" icon="clipboard" value={formatNumber(orderRows.filter((o) => o.status !== 'cancelled').length)} caption={`${formatNumber(orderRows.filter((o) => o.status === 'placed').length)} open`} />
          <StatCard label="Lifetime spend" icon="money" tint="mint" value={formatMoney(spend)} caption={`${formatNumber(saleRows.length)} sales`} />
          <StatCard label="Returns" icon="undo" tint="butter" value={formatMoney(refunds)} caption={`${formatNumber(returnRows.length)} returns`} />
          <StatCard label="Last order" icon="calendar" tint="lilac" value={lastOrder ? formatDate(lastOrder) : '—'} caption={shop(c.home_location_id ?? -1) ? `Home shop: ${shop(c.home_location_id ?? -1)}` : 'No home shop'} />
        </div>
        <div className="gz-detail">
          <div className="gz-stack gz-stack--sm">
            <Tabs
              aria-label="Customer history"
              value={tab}
              onChange={(v) => setTab(v as TabId)}
              items={[
                { value: 'orders', label: 'Orders', count: orderRows.length },
                { value: 'sales', label: 'Sales', count: saleRows.length },
                { value: 'returns', label: 'Returns', count: returnRows.length },
              ]}
            />
            {tab === 'orders' && <DataTable columns={orderCols} rows={orderRows} loading={orders.isLoading} density="compact" aria-label="Orders" empty="No orders yet." defaultSort={{ key: 'requested_for', dir: 'desc' }} />}
            {tab === 'sales' && <DataTable columns={saleCols} rows={saleRows} loading={sales.isLoading} density="compact" aria-label="Sales" empty="No sales tied to this customer yet." defaultSort={{ key: 'sold_at', dir: 'desc' }} />}
            {tab === 'returns' && <DataTable columns={returnCols} rows={returnRows} loading={sales.isLoading || returns.isLoading} density="compact" aria-label="Returns" empty="No returns." defaultSort={{ key: 'returned_at', dir: 'desc' }} />}
          </div>
          <Card title="Contact">
            <dl className="ins-dl">
              <div className="gz-stack gz-stack--sm">
                <div><dt className="text-body-sm">Email</dt><dd>{c.email ?? '—'}</dd></div>
                <div><dt className="text-body-sm">Phone</dt><dd>{c.phone ?? '—'}</dd></div>
                <div><dt className="text-body-sm">Home shop</dt><dd>{shop(c.home_location_id ?? -1) || '—'}</dd></div>
                <div><dt className="text-body-sm">Portal account</dt><dd>{c.auth_user_id ? 'Linked' : 'None'}</dd></div>
              </div>
            </dl>
          </Card>
        </div>
      </div>
      <CustomerDialog open={editing} customer={c} onClose={() => setEditing(false)} />
    </>
  );
}

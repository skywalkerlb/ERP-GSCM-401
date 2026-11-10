import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, DataTable, EmptyState, MoneyCell, PageHeader, Pagination, Select, StatusBadge, Tabs, Toolbar, type DataTableColumn } from '@/components';
import { useSelectedLocation } from '@/hooks/useLocations';
import { formatNumber, formatTime, formatWeekday } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { rpcErrorMessage } from '@/lib/rpc';
import type { SalesOrderStatus } from '@/types/domain';
import { CHANNEL_LABEL, fetchOrders, STATUS_LABEL, STATUS_ORDER, type OrderListRow } from './api';

const PAGE_SIZE = 25;

export default function OrdersPage() {
  const navigate = useNavigate();
  const { locationId, shops } = useSelectedLocation();
  const [status, setStatus] = useState<SalesOrderStatus>('placed');
  const [loc, setLoc] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    setLoc(locationId !== null && shops.some((s) => s.id === locationId) ? String(locationId) : '');
  }, [locationId, shops]);
  useEffect(() => setPage(0), [status, loc]);

  const ordersQ = useQuery({ queryKey: queryKeys.orders.list({ scope: 'all' }), queryFn: fetchOrders });

  const inShop = useMemo(() => (ordersQ.data ?? []).filter((o) => !loc || o.location_id === Number(loc)), [ordersQ.data, loc]);
  const counts = useMemo(() => {
    const c: Record<SalesOrderStatus, number> = { placed: 0, fulfilled: 0, closed: 0, cancelled: 0 };
    for (const o of inShop) c[o.status] += 1;
    return c;
  }, [inShop]);

  const rows = useMemo(() => {
    const list = inShop.filter((o) => o.status === status);
    // Open orders: soonest first. Finished orders: newest first.
    return status === 'placed' ? list : [...list].reverse();
  }, [inShop, status]);

  const now = Date.now();
  const isEmpty = !ordersQ.isLoading && !ordersQ.isError && rows.length === 0;
  const columns: DataTableColumn<OrderListRow>[] = [
    {
      key: 'so_number',
      header: 'Order',
      render: (o) => (
        <Link className="gz-link gz-mono" to={`/orders/${o.id}`}>
          {o.so_number}
        </Link>
      ),
    },
    { key: 'customer', header: 'Customer', render: (o) => o.customers?.name ?? '—' },
    { key: 'shop', header: 'Shop', render: (o) => o.locations?.name ?? '—' },
    {
      key: 'requested_for',
      header: 'Needed by',
      render: (o) => (
        <span className="gz-row" style={{ gap: 'var(--space-2)', flexWrap: 'nowrap' }}>
          {formatWeekday(o.requested_for)}, {formatTime(o.requested_for)}
          {o.status === 'placed' && new Date(o.requested_for).getTime() < now && <StatusBadge status="late" />}
        </span>
      ),
    },
    { key: 'channel', header: 'Channel', render: (o) => CHANNEL_LABEL[o.channel] ?? o.channel },
    { key: 'units', header: 'Items', align: 'right', render: (o) => formatNumber(o.units) },
    { key: 'value', header: 'Value', align: 'right', render: (o) => <MoneyCell value={o.value} strong /> },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} label={STATUS_LABEL[o.status]} /> },
  ];

  return (
    <>
      <PageHeader
        title="Orders"
        breadcrumb={[{ label: 'Sell' }, { label: 'Orders' }]}
        subtitle="Catering and pickup orders, from placed to closed. Value is before tax."
        actions={
          <Button variant={isEmpty ? 'secondary' : 'primary'} icon="plus" onClick={() => navigate('/orders/new')}>
            New order
          </Button>
        }
      />
      <Toolbar
        end={
          <Select
            label="Shop"
            value={loc}
            onChange={(e) => setLoc(e.target.value)}
            options={[{ value: '', label: 'All shops' }, ...shops.map((s) => ({ value: String(s.id), label: s.name }))]}
          />
        }
      >
        <Tabs
          aria-label="Order status"
          items={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s], count: counts[s] }))}
          value={status}
          onChange={(v) => setStatus(v as SalesOrderStatus)}
        />
      </Toolbar>

      {ordersQ.isError && (
        <Alert tone="danger" title="Could not load orders" action={<Button size="sm" onClick={() => void ordersQ.refetch()}>Try again</Button>}>
          {rpcErrorMessage(ordersQ.error)}
        </Alert>
      )}

      {isEmpty ? (
        <EmptyState
          icon="clipboard"
          title={status === 'placed' ? 'No open orders' : `No ${STATUS_LABEL[status].toLowerCase()} orders`}
          description={status === 'placed' ? 'Take a catering or pickup order and it will wait here until it is fulfilled.' : 'Orders show up here as they move along.'}
          action={
            <Button variant="primary" icon="plus" onClick={() => navigate('/orders/new')}>
              New order
            </Button>
          }
        />
      ) : (
        <>
          <DataTable
            aria-label={`${STATUS_LABEL[status]} orders`}
            columns={columns}
            rows={rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)}
            loading={ordersQ.isLoading}
            onRowClick={(o) => navigate(`/orders/${o.id}`)}
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPageChange={setPage} />
        </>
      )}
    </>
  );
}

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge, Button, DataTable, EmptyState, MoneyCell, PageHeader, StatCard, StatusBadge, Tabs, Toolbar, type DataTableColumn,
} from '@/components';
import { indexBy, toNumber, useSuppliers } from '@/features/items/api';
import { ErrorAlert, sourceLabel } from '@/features/items/ui';
import { useLocations } from '@/hooks/useLocations';
import { formatDate, formatMoney, formatNumber, formatPct } from '@/lib/format';
import { poStatusKey, useOpenBills, usePurchaseOrders, type PoView } from './api';

type Tab = 'all' | 'draft' | 'sent' | 'received' | 'closed';

const inTab = (po: PoView, tab: Tab): boolean => {
  switch (tab) {
    case 'draft': return po.status === 'draft';
    case 'sent': return po.status === 'sent';
    case 'received': return po.status === 'received';
    case 'closed': return po.status === 'closed' || po.status === 'cancelled';
    default: return true;
  }
};

export default function PurchasingPage() {
  const navigate = useNavigate();
  const posQ = usePurchaseOrders();
  const suppliersQ = useSuppliers();
  const locationsQ = useLocations();
  const billsQ = useOpenBills();
  const [tab, setTab] = useState<Tab>('sent');

  const supplierMap = useMemo(() => indexBy(suppliersQ.data, (s) => s.id), [suppliersQ.data]);
  const locMap = useMemo(() => indexBy(locationsQ.data, (l) => l.id), [locationsQ.data]);
  const pos = useMemo(() => posQ.data ?? [], [posQ.data]);

  const counts = useMemo(() => ({
    all: pos.length,
    draft: pos.filter((p) => inTab(p, 'draft')).length,
    sent: pos.filter((p) => inTab(p, 'sent')).length,
    received: pos.filter((p) => inTab(p, 'received')).length,
    closed: pos.filter((p) => inTab(p, 'closed')).length,
  }), [pos]);
  const shown = useMemo(() => pos.filter((p) => inTab(p, tab)), [pos, tab]);

  const sentValue = pos.filter((p) => p.status === 'sent').reduce((s, p) => s + toNumber(p.total), 0);
  const lateCount = pos.filter((p) => p.late).length;
  const owed = (billsQ.data ?? []).reduce((s, b) => s + toNumber(b.balance), 0);
  const overdue = (billsQ.data ?? []).filter((b) => b.is_overdue).length;

  const columns: DataTableColumn<PoView>[] = [
    { key: 'po_number', header: 'Purchase order', mono: true, sortable: true },
    { key: 'supplier', header: 'Supplier', sortable: true, sortValue: (p) => supplierMap.get(p.supplier_id)?.name, render: (p) => <strong>{supplierMap.get(p.supplier_id)?.name ?? '—'}</strong> },
    { key: 'ship', header: 'Ship to', render: (p) => locMap.get(p.ship_to_location_id)?.name ?? '—' },
    {
      key: 'status', header: 'Status',
      render: (p) => {
        const s = poStatusKey(p);
        return <StatusBadge status={s.status} label={s.label} />;
      },
    },
    {
      key: 'progress', header: 'Received',
      render: (p) => {
        if (p.status === 'draft' || p.status === 'cancelled') return <span className="gz-muted">—</span>;
        const pct = p.ordered > 0 ? p.received / p.ordered : 0;
        return (
          <span>
            <span className="gz-num">{formatPct(pct, 0)}</span>
            <span className="stk-sub text-body-sm">{formatNumber(p.received)} of {formatNumber(p.ordered)}</span>
          </span>
        );
      },
    },
    {
      key: 'expected_on', header: 'Expected', sortable: true,
      render: (p) => (
        <span className="gz-row" style={{ gap: 'var(--space-2)', flexWrap: 'nowrap' }}>
          <span className="gz-num">{p.expected_on ? formatDate(p.expected_on) : <span className="gz-muted">Set when sent</span>}</span>
          {p.late && <StatusBadge status="late" label={`${p.daysLate} ${p.daysLate === 1 ? 'day' : 'days'} late`} />}
        </span>
      ),
    },
    { key: 'source', header: 'Source', render: (p) => (p.source === 'auto_replenish' ? <Badge tone="accent">{sourceLabel(p.source)}</Badge> : <span className="gz-muted">{sourceLabel(p.source)}</span>) },
    { key: 'created_on', header: 'Created', sortable: true, render: (p) => <span className="gz-num">{formatDate(p.created_on)}</span> },
    { key: 'total', header: 'Total', align: 'right', sortable: true, render: (p) => <MoneyCell value={p.total} strong /> },
  ];

  return (
    <div className="gz-stack">
      <PageHeader
        title="Purchasing"
        breadcrumb={[{ label: 'Buy' }, { label: 'Purchasing' }]}
        subtitle="Purchase orders from draft to received. Late orders are flagged."
        actions={
          <>
            <Button icon="refresh" onClick={() => navigate('/purchasing/review')}>Periodic review</Button>
            <Button icon="sparkles" onClick={() => navigate('/purchasing/replenish')}>Auto-replenish</Button>
            <Button variant="primary" icon="plus" onClick={() => navigate('/purchasing/new')}>New purchase order</Button>
          </>
        }
      />
      {(posQ.error || suppliersQ.error) && <ErrorAlert error={posQ.error ?? suppliersQ.error} onRetry={() => void posQ.refetch()} />}

      <div className="gz-grid-stats">
        <StatCard label="Drafts to send" value={formatNumber(counts.draft)} icon="edit" tint="lilac" caption="Created but not yet sent" />
        <StatCard label="On order" value={formatMoney(sentValue)} icon="truck" tint="mint" caption={`${formatNumber(counts.sent)} open orders`} />
        <StatCard label="Late deliveries" value={formatNumber(lateCount)} icon="clock" tint={lateCount ? 'butter' : 'mint'} caption="Past the expected date" />
        <StatCard label="Owed to suppliers" value={formatMoney(owed)} icon="bank" tint="cocoa" caption={overdue ? `${formatNumber(overdue)} bills overdue` : 'Nothing overdue'} />
      </div>

      <div>
        <Toolbar>
          <Tabs
            aria-label="Purchase order status" value={tab} onChange={(v) => setTab(v as Tab)}
            items={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'draft', label: 'Draft', count: counts.draft },
              { value: 'sent', label: 'Order sent', count: counts.sent },
              { value: 'received', label: 'Received', count: counts.received },
              { value: 'closed', label: 'Closed', count: counts.closed },
            ]}
          />
        </Toolbar>
        <DataTable<PoView>
          aria-label="Purchase orders" columns={columns} rows={shown} loading={posQ.isLoading}
          onRowClick={(p) => navigate(`/purchasing/${p.id}`)} defaultSort={{ key: tab === 'sent' ? 'expected_on' : 'po_number', dir: tab === 'sent' ? 'asc' : 'desc' }}
          empty={
            <EmptyState
              icon="bag" title={tab === 'draft' ? 'No drafts waiting' : 'No purchase orders here yet'}
              description="Create one by hand, or let auto-replenish draft what the shop needs."
              action={<Button onClick={() => navigate('/purchasing/replenish')}>See what to reorder</Button>}
            />
          }
        />
      </div>
    </div>
  );
}

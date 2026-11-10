import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert } from '@/components/Alert';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Select } from '@/components/Select';
import { TextField } from '@/components/TextField';
import { Toolbar } from '@/components/Toolbar';
import { MoneyCell } from '@/components/cells';
import '@/features/reports/insights.css';
import { useSelectedLocation } from '@/hooks/useLocations';
import { formatDate, formatNumber, sentenceCase } from '@/lib/format';
import { rpcErrorMessage } from '@/lib/rpc';
import type { Customer } from '@/types/domain';
import { useCustomers, type CustomerStats } from './api';
import { CustomerDialog } from './CustomerDialog';

interface Row extends Customer {
  stats: CustomerStats;
  home: string;
}

export function KindBadge({ kind }: { kind: string }) {
  return <Badge tone={kind === 'business' ? 'accent' : 'neutral'}>{kind === 'walk_in' ? 'Walk-in' : sentenceCase(kind)}</Badge>;
}

export default function CustomersPage() {
  const navigate = useNavigate();
  const { locations } = useSelectedLocation();
  const q = useCustomers();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [creating, setCreating] = useState(false);

  const rows: Row[] = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const empty: CustomerStats = { orders: 0, openOrders: 0, spend: 0, lastOrder: null };
    return (q.data?.customers ?? [])
      .filter((c) => (!kind || c.kind === kind) && (!needle || [c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(needle))))
      .map((c) => ({ ...c, stats: q.data?.stats.get(c.id) ?? empty, home: locations.find((l) => l.id === c.home_location_id)?.name ?? '' }));
  }, [q.data, search, kind, locations]);

  const columns: DataTableColumn<Row>[] = [
    { key: 'name', header: 'Name', sortable: true, render: (r) => <><strong>{r.name}</strong>{!r.is_active && <> <Badge tone="neutral">Inactive</Badge></>}</> },
    { key: 'kind', header: 'Kind', sortable: true, render: (r) => <KindBadge kind={r.kind} /> },
    { key: 'email', header: 'Email', sortable: true },
    { key: 'phone', header: 'Phone' },
    { key: 'home', header: 'Home shop', sortable: true },
    { key: 'orders', header: 'Orders', align: 'right', sortable: true, sortValue: (r) => r.stats.orders, render: (r) => (r.stats.openOrders > 0 ? <>{formatNumber(r.stats.orders)} <Badge tone="info">{`${r.stats.openOrders} open`}</Badge></> : formatNumber(r.stats.orders)) },
    { key: 'spend', header: 'Lifetime spend', align: 'right', sortable: true, sortValue: (r) => r.stats.spend, render: (r) => <MoneyCell value={r.stats.spend} /> },
    { key: 'last', header: 'Last order', sortable: true, sortValue: (r) => r.stats.lastOrder, render: (r) => (r.stats.lastOrder ? formatDate(r.stats.lastOrder) : '—') },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        breadcrumb={[{ label: 'Setup' }, { label: 'Customers' }]}
        subtitle="Businesses and regulars who order from the shops."
        actions={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New customer</Button>}
      />
      <Toolbar>
        <TextField label="Search" icon="search" placeholder="Name, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select label="Kind" value={kind} options={[{ value: '', label: 'All kinds' }, { value: 'business', label: 'Business' }, { value: 'retail', label: 'Retail' }, { value: 'walk_in', label: 'Walk-in' }]} onChange={(e) => setKind(e.target.value)} />
      </Toolbar>
      {q.isError && <Alert tone="danger" title="Could not load customers">{rpcErrorMessage(q.error)} Refresh the page to try again.</Alert>}
      {!q.isLoading && (q.data?.customers.length ?? 0) === 0 ? (
        <EmptyState icon="users" title="No customers yet" description="Add the first customer to start taking catering and pickup orders." action={<Button variant="secondary" onClick={() => setCreating(true)}>New customer</Button>} />
      ) : (
        <DataTable columns={columns} rows={rows} loading={q.isLoading} aria-label="Customers" empty="No customers match that search." onRowClick={(r) => navigate(`/customers/${r.id}`)} defaultSort={{ key: 'name', dir: 'asc' }} />
      )}
      <CustomerDialog open={creating} customer={null} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/customers/${id}`)} />
    </>
  );
}

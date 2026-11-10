import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Checkbox, DataTable, EmptyState, MoneyCell, PageHeader, StatusBadge, TextField, Toolbar, type DataTableColumn } from '@/components';
import { indexBy, useScorecard, useSuppliers } from '@/features/items/api';
import { ErrorAlert, RatingBadge, plural } from '@/features/items/ui';
import { formatDate } from '@/lib/format';
import type { Supplier } from '@/types/domain';
import { SupplierFormDialog } from './SupplierForm';

export default function SuppliersPage() {
  const navigate = useNavigate();
  const suppliersQ = useSuppliers();
  const scoreQ = useScorecard();
  const [search, setSearch] = useState('');
  const [inactive, setInactive] = useState(false);
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);

  const score = useMemo(() => indexBy(scoreQ.data, (s) => s.supplier_id), [scoreQ.data]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (suppliersQ.data ?? []).filter((s) => (inactive || s.is_active) && (!q || `${s.name} ${s.code} ${s.contact_name ?? ''}`.toLowerCase().includes(q)));
  }, [suppliersQ.data, search, inactive]);

  const columns: DataTableColumn<Supplier>[] = [
    { key: 'code', header: 'Code', mono: true, sortable: true },
    { key: 'name', header: 'Supplier', sortable: true, render: (s) => <strong>{s.name}</strong> },
    { key: 'contact', header: 'Contact', render: (s) => (<span>{s.contact_name ?? '—'}<span className="stk-sub text-body-sm">{s.email ?? ''}</span></span>) },
    { key: 'phone', header: 'Phone', render: (s) => <span className="gz-num">{s.phone ?? '—'}</span> },
    { key: 'terms', header: 'Terms', render: (s) => s.terms_label },
    { key: 'lead', header: 'Quoted lead time', align: 'right', sortable: true, sortValue: (s) => s.quoted_lead_time_days, render: (s) => `${s.quoted_lead_time_days} days` },
    { key: 'rating', header: 'Rating', render: (s) => <RatingBadge rating={score.get(s.id)?.rating} /> },
    { key: 'owed', header: 'Owed', align: 'right', sortable: true, sortValue: (s) => score.get(s.id)?.amount_owed ?? 0, render: (s) => <MoneyCell value={score.get(s.id)?.amount_owed ?? 0} /> },
    { key: 'due', header: 'Next due', render: (s) => <span className="gz-num">{formatDate(score.get(s.id)?.next_due_date)}</span> },
    { key: 'active', header: 'Status', render: (s) => <StatusBadge status={s.is_active ? 'active' : 'inactive'} /> },
    { key: 'edit', header: '', align: 'right', render: (s) => <Button size="sm" variant="ghost" icon="edit" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)} /> },
  ];

  return (
    <div className="gz-stack">
      <PageHeader
        title="Suppliers"
        breadcrumb={[{ label: 'Buy' }, { label: 'Suppliers' }]}
        subtitle="Who you buy from, on what terms, and how they perform."
        actions={<><Button icon="chart" onClick={() => navigate('/suppliers/scorecard')}>Scorecard</Button><Button variant="primary" icon="plus" onClick={() => setEditing('new')}>New supplier</Button></>}
      />
      {suppliersQ.error && <ErrorAlert error={suppliersQ.error} onRetry={() => void suppliersQ.refetch()} />}
      <div>
        <Toolbar end={<span className="gz-muted text-body-sm">{plural(rows.length, 'supplier')}</span>}>
          <TextField label="Search suppliers" icon="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, code or contact" className="stk-toolbar-field" />
          <Checkbox label="Show inactive" checked={inactive} onChange={(e) => setInactive(e.target.checked)} />
        </Toolbar>
        <DataTable<Supplier>
          aria-label="Suppliers" columns={columns} rows={rows} loading={suppliersQ.isLoading} onRowClick={(s) => navigate(`/suppliers/${s.id}`)}
          defaultSort={{ key: 'name', dir: 'asc' }}
          empty={<EmptyState icon="building" title="No suppliers match" description="Add your first supplier, or clear the search." action={<Button onClick={() => setEditing('new')}>New supplier</Button>} />}
        />
      </div>
      <SupplierFormDialog open={editing !== null} supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(id) => { if (editing === 'new') navigate(`/suppliers/${id}`); }} />
    </div>
  );
}

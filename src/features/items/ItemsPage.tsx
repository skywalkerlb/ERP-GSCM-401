import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Badge, Button, Checkbox, ConfirmDialog, DataTable, EmptyState, MoneyCell, PageHeader, Select, StatusBadge, TextField, Toolbar, type DataTableColumn,
} from '@/components';
import { queryKeys } from '@/lib/queryKeys';
import { formatNumber } from '@/lib/format';
import { rpc, views } from '@/lib/rpc';
import { ITEM_TYPE_LABELS, MASTER_DOMAINS, indexBy, toNumber, useAction, useItemCosts, useItems, useSuppliers } from './api';
import { ItemEditor } from './ItemEditor';
import { ErrorAlert, plural } from './ui';
import type { Item } from '@/types/domain';

export default function ItemsPage() {
  const [params, setParams] = useSearchParams();
  const itemsQ = useItems();
  const costsQ = useItemCosts();
  const suppliersQ = useSuppliers();
  const analysisQ = useQuery({ queryKey: queryKeys.items.scope('reorder-all'), queryFn: () => views.reorderAnalysis() });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [type, setType] = useState('all');
  const [inactive, setInactive] = useState(false);
  const [target, setTarget] = useState<number | 'new' | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const opened = useRef(false);

  // /items?edit=ID opens that item (used by the links from the inventory screens).
  useEffect(() => {
    const id = Number(params.get('edit'));
    if (!opened.current && id && itemsQ.data?.some((i) => i.id === id)) {
      opened.current = true;
      setTarget(id);
      setParams({}, { replace: true });
    }
  }, [params, itemsQ.data, setParams]);

  const costMap = useMemo(() => indexBy(costsQ.data, (c) => c.item_id), [costsQ.data]);
  const supplierMap = useMemo(() => indexBy(suppliersQ.data, (s) => s.id), [suppliersQ.data]);
  const ropMap = useMemo(() => indexBy(analysisQ.data, (a) => a.item_id), [analysisQ.data]);
  const categories = useMemo(() => [...new Set((itemsQ.data ?? []).map((i) => i.category).filter((c): c is string => Boolean(c)))].sort(), [itemsQ.data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (itemsQ.data ?? []).filter((i) =>
      (inactive || i.is_active) && (category === 'all' || i.category === category) && (type === 'all' || i.item_type === type) &&
      (!q || `${i.name} ${i.sku} ${i.barcode ?? ''}`.toLowerCase().includes(q)),
    );
  }, [itemsQ.data, search, category, type, inactive]);

  const differing = (analysisQ.data ?? []).filter((a) => Math.abs(toNumber(a.rop_calc) - toNumber(a.rop_stored)) >= 0.5);

  const applyAll = useAction(() => rpc.applyComputedReorderPoints({}), {
    invalidate: MASTER_DOMAINS, errorTitle: 'Could not apply reorder points',
    success: (n) => `${plural(Number(n), 'reorder point')} updated from the computed values.`,
  });

  const columns: DataTableColumn<Item>[] = [
    { key: 'sku', header: 'SKU', mono: true, sortable: true },
    { key: 'name', header: 'Item', sortable: true, render: (i) => <strong>{i.name}</strong> },
    { key: 'category', header: 'Category', sortable: true, render: (i) => i.category ?? '—' },
    { key: 'type', header: 'Type', sortable: true, sortValue: (i) => i.item_type, render: (i) => <Badge tone="neutral" dot={false}>{ITEM_TYPE_LABELS[i.item_type] ?? i.item_type}</Badge> },
    { key: 'barcode', header: 'Barcode', mono: true, render: (i) => i.barcode ?? '—' },
    { key: 'cost', header: 'Avg. cost', align: 'right', sortable: true, sortValue: (i) => toNumber(costMap.get(i.id)?.avg_cost), render: (i) => <MoneyCell value={costMap.get(i.id)?.avg_cost} unitCost /> },
    { key: 'price', header: 'List price', align: 'right', sortable: true, sortValue: (i) => toNumber(i.list_price), render: (i) => (i.list_price === null ? <span className="gz-muted">—</span> : <MoneyCell value={i.list_price} />) },
    { key: 'rop', header: 'ROP stored', align: 'right', render: (i) => <span className="gz-num">{formatNumber(i.reorder_point, 1)}</span> },
    {
      key: 'rop_calc', header: 'ROP computed', align: 'right',
      render: (i) => {
        const a = ropMap.get(i.id);
        if (!a) return <span className="gz-muted">—</span>;
        const off = Math.abs(toNumber(a.rop_calc) - toNumber(i.reorder_point)) >= Math.max(1, toNumber(i.reorder_point) * 0.1);
        return <span className="gz-row" style={{ gap: 'var(--space-1)', justifyContent: 'flex-end', flexWrap: 'nowrap' }}><span className="gz-num">{formatNumber(a.rop_calc, 1)}</span>{off && <Badge tone="warning">Review</Badge>}</span>;
      },
    },
    { key: 'lead', header: 'Lead time', align: 'right', render: (i) => `${i.lead_time_days} days` },
    { key: 'supplier', header: 'Supplier', render: (i) => (i.preferred_supplier_id ? supplierMap.get(i.preferred_supplier_id)?.name ?? '—' : '—') },
    { key: 'active', header: 'Status', render: (i) => <StatusBadge status={i.is_active ? 'active' : 'inactive'} /> },
  ];

  return (
    <div className="gz-stack">
      <PageHeader
        title="Items"
        breadcrumb={[{ label: 'Setup' }, { label: 'Items' }]}
        subtitle="The item master: prices, costs, reorder points, suppliers and recipes."
        actions={
          <>
            <Button icon="refresh" onClick={() => setConfirmAll(true)} disabled={differing.length === 0}>{differing.length ? `Apply computed ROPs (${differing.length})` : 'Reorder points are current'}</Button>
            <Button variant="primary" icon="plus" onClick={() => setTarget('new')}>New item</Button>
          </>
        }
      />
      {(itemsQ.error || analysisQ.error) && <ErrorAlert error={itemsQ.error ?? analysisQ.error} onRetry={() => void itemsQ.refetch()} />}
      <div>
        <Toolbar end={<span className="gz-muted text-body-sm">{plural(rows.length, 'item')}</span>}>
          <TextField label="Search items" icon="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, SKU or barcode" className="stk-toolbar-field" />
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="stk-toolbar-field--sm" options={[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: c }))]} />
          <Select label="Type" value={type} onChange={(e) => setType(e.target.value)} className="stk-toolbar-field--sm" options={[{ value: 'all', label: 'All types' }, ...Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => ({ value, label }))]} />
          <Checkbox label="Show inactive" checked={inactive} onChange={(e) => setInactive(e.target.checked)} />
        </Toolbar>
        <DataTable<Item>
          aria-label="Items" columns={columns} rows={rows} density="compact" scroll loading={itemsQ.isLoading} onRowClick={(i) => setTarget(i.id)}
          defaultSort={{ key: 'name', dir: 'asc' }}
          empty={<EmptyState icon="package" title="No items match" description="Clear the filters, or add a new item." />}
        />
      </div>

      <ItemEditor target={target} onClose={() => setTarget(null)} onCreated={(id) => setTarget(id)} categories={categories} />

      <ConfirmDialog
        open={confirmAll} onClose={() => setConfirmAll(false)} title="Apply computed reorder points?" confirmLabel="Apply to all items" cancelLabel="Not now"
        onConfirm={async () => { await applyAll.mutateAsync(undefined).catch(() => undefined); }}
      >
        This copies the computed reorder point onto every purchased item, replacing the stored values. {plural(differing.length, 'item')} currently differ. You can still change any of them by hand afterward. To go back to a single item, open it and edit the stored value.
      </ConfirmDialog>
    </div>
  );
}

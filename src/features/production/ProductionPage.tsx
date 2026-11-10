import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Button, DataTable, Dialog, DocNo, EmptyState, PageHeader, Pagination, QtyCell, Select, StatusBadge, Tabs, TextField,
  Toolbar, useToast, type DataTableColumn,
} from '@/components';
import { useLocations } from '@/hooks/useLocations';
import { useRole } from '@/hooks/useRole';
import { addDays, businessDate, formatDate, formatItemQty, formatNumber, formatUnitCost } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { rpc, rpcErrorMessage } from '@/lib/rpc';
import { canCall, type MoStatus } from '@/types/domain';
import { RequirementsTable } from './RequirementsTable';
import { invalidateMake, listProductionOrders, productionCounts, useMakeRefs, type ProductionOrderRow } from './api';

const PAGE_SIZE = 25;

const TABS: Array<{ value: MoStatus; label: string }> = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function ProductionPage() {
  const navigate = useNavigate();
  const { role } = useRole();
  const [status, setStatus] = useState<MoStatus>('planned');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [newOpen, setNewOpen] = useState(false);

  const counts = useQuery({ queryKey: queryKeys.production.scope('counts'), queryFn: productionCounts });
  const list = useQuery({ queryKey: queryKeys.production.list({ status }), queryFn: () => listProductionOrders(status) });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = list.data ?? [];
    return q ? all.filter((r) => r.mo_number.toLowerCase().includes(q) || (r.items?.name ?? '').toLowerCase().includes(q)) : all;
  }, [list.data, search]);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const columns: DataTableColumn<ProductionOrderRow>[] = [
    { key: 'mo_number', header: 'Order', sortable: true, render: (r) => <Link className="gz-link" to={`/production/${r.id}`}><DocNo value={r.mo_number} /></Link> },
    { key: 'item', header: 'Item', sortable: true, sortValue: (r) => r.items?.name, render: (r) => r.items?.name ?? '—' },
    { key: 'location', header: 'Location', render: (r) => r.locations?.name ?? '—' },
    { key: 'qty_planned', header: 'Planned', align: 'right', sortable: true, render: (r) => <QtyCell qty={r.qty_planned} item={r.items ?? undefined} /> },
    ...(status === 'planned' || status === 'cancelled'
      ? []
      : ([
          { key: 'qty_started', header: 'Started', align: 'right', render: (r) => <QtyCell qty={r.qty_started} item={r.items ?? undefined} /> },
        ] satisfies DataTableColumn<ProductionOrderRow>[])),
    ...(status === 'completed'
      ? ([
          { key: 'qty_good', header: 'Good', align: 'right', render: (r) => <QtyCell qty={r.qty_good} item={r.items ?? undefined} strong /> },
          { key: 'qty_scrapped', header: 'Scrap', align: 'right', render: (r) => <QtyCell qty={r.qty_scrapped} uom="each" dozens={false} /> },
          { key: 'unit_cost', header: 'Unit cost', align: 'right', render: (r) => formatUnitCost(r.unit_cost) },
        ] satisfies DataTableColumn<ProductionOrderRow>[])
      : []),
    { key: 'due_date', header: 'Due', sortable: true, render: (r) => formatDate(r.due_date) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="gz-stack">
      <PageHeader
        title="Production"
        breadcrumb={[{ label: 'Make' }, { label: 'Production' }]}
        subtitle="Production orders from planned to completed."
        actions={
          <>
            <Button icon="chart" onClick={() => navigate('/production/report')}>Production report</Button>
            {canCall(role, 'create_production_order') && (
              <Button variant="primary" icon="plus" onClick={() => setNewOpen(true)}>New production order</Button>
            )}
          </>
        }
      />

      <div className="gz-stack gz-stack--sm">
        <Toolbar
          end={<TextField label="Search orders" icon="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="MO-00012 or item" />}
        >
          <Tabs
            aria-label="Order status"
            items={TABS.map((t) => ({ ...t, count: counts.data?.[t.value] }))}
            value={status}
            onChange={(v) => { setStatus(v as MoStatus); setPage(0); }}
          />
        </Toolbar>

        {list.error ? (
          <Alert tone="danger" title="Could not load production orders">{rpcErrorMessage(list.error)}</Alert>
        ) : (
          <>
            <DataTable
              key={status}
              columns={columns}
              rows={pageRows}
              loading={list.isLoading}
              onRowClick={(r) => navigate(`/production/${r.id}`)}
              defaultSort={status === 'completed' || status === 'cancelled' ? undefined : { key: 'due_date', dir: 'asc' }}
              aria-label={`${TABS.find((t) => t.value === status)?.label ?? ''} production orders`}
              empty={
                <EmptyState
                  icon="factory"
                  title={search ? 'No orders match that search' : `No ${TABS.find((t) => t.value === status)?.label.toLowerCase()} orders`}
                  description={status === 'planned' ? 'Release a bake plan or create an order to get the ovens going.' : undefined}
                />
              }
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPageChange={setPage} />
          </>
        )}
      </div>

      <NewOrderDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

function NewOrderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const refs = useMakeRefs();
  const { data: locations = [] } = useLocations();
  const kitchens = locations.filter((l) => l.kind === 'kitchen');
  const makeable = refs.items.filter((i) => i.is_manufactured && i.is_active);

  const [itemId, setItemId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [qty, setQty] = useState('10');
  const [due, setDue] = useState(addDays(businessDate(), 1));

  const item = makeable.find((i) => String(i.id) === itemId) ?? null;
  const dozens = !item || (item.uom === 'each' && item.item_type === 'finished');
  const unitQty = Number(qty) * (dozens ? 12 : 1);
  const effectiveLocation = Number(locationId || kitchens[0]?.id || 0) || null;
  const locationName = kitchens.find((k) => k.id === effectiveLocation)?.name;
  const reqs = refs.requirementsFor(item?.id ?? null, Number.isFinite(unitQty) ? unitQty : 0, effectiveLocation);
  const hasRecipe = !item || refs.bom.some((b) => b.parent_item_id === item.id);

  const create = useMutation({
    mutationFn: () =>
      rpc.createProductionOrder({ item: item!.id, qty_planned: unitQty, due_date: due, location_id: effectiveLocation }),
    onSuccess: (id) => {
      invalidateMake(qc);
      toast.success('Production order created', item ? `${formatItemQty(unitQty, item)} of ${item.name}` : undefined);
      onClose();
      navigate(`/production/${id}`);
    },
    onError: (e) => toast.error('Could not create the order', rpcErrorMessage(e)),
  });

  const qtyError = !(Number(qty) > 0) ? 'Enter a quantity above 0.' : undefined;
  const canSave = Boolean(item) && !qtyError && Boolean(due) && hasRecipe && Boolean(effectiveLocation);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="New production order"
      description="Choose what to make and check the ingredients before you schedule it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canSave || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating' : 'Create order'}
          </Button>
        </>
      }
    >
      <div className="gz-stack gz-stack--sm">
        <div className="gz-form-grid">
          <Select
            label="Item to make"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            options={[{ value: '', label: 'Choose an item' }, ...makeable.map((i) => ({ value: String(i.id), label: i.name }))]}
          />
          <TextField
            label={dozens ? 'Quantity (dozen)' : `Quantity (${item?.uom ?? 'units'})`}
            type="number"
            min={1}
            step={dozens ? 1 : 'any'}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            error={qtyError}
            hint={dozens && Number(qty) > 0 ? `${formatNumber(unitQty)} donuts` : undefined}
          />
          <Select
            label="Location"
            value={String(effectiveLocation ?? '')}
            onChange={(e) => setLocationId(e.target.value)}
            options={kitchens.map((k) => ({ value: String(k.id), label: k.name }))}
          />
          <TextField label="Due date" type="date" min={businessDate()} value={due} onChange={(e) => setDue(e.target.value)} />
        </div>

        {item && !hasRecipe && (
          <Alert tone="danger" title="This item has no recipe">Add its recipe (bill of materials) in Items before scheduling production.</Alert>
        )}
        {item && hasRecipe && (
          <section aria-label="Ingredients">
            <h3 className="text-h3">Ingredients needed</h3>
            <RequirementsTable rows={reqs} where={locationName} />
          </section>
        )}
      </div>
    </Dialog>
  );
}

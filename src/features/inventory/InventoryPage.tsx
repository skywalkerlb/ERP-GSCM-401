import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge, Checkbox, DataTable, EmptyState, MoneyCell, PageHeader, QtyCell, Select, StatCard, StatusBadge, TextField, Toolbar,
  useToast, type DataTableColumn,
} from '@/components';
import { ErrorAlert, plural } from '@/features/items/ui';
import { toNumber, useItems } from '@/features/items/api';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { useLocations } from '@/hooks/useLocations';
import { formatDate, formatMoney, formatNumber, formatItemQty } from '@/lib/format';
import type { ItemAvailability, ItemType, Uom } from '@/types/domain';
import { useAvailability, useGlCheck, useValuation } from './api';

type StockState = 'ok' | 'low' | 'out';

interface GridRow {
  item_id: number;
  sku: string;
  name: string;
  category: string | null;
  item_type: ItemType;
  uom: Uom;
  reorder_point: number;
  byLocation: Map<number, ItemAvailability>;
  onHand: number;
  fresh: number;
  dayOld: number;
  allocated: number;
  available: number;
  backordered: number;
  onOrder: number;
  est: string | null;
  value: number;
  state: StockState;
}

const EACH_LABEL = (r: Pick<GridRow, 'uom' | 'item_type'>) => ({ uom: r.uom, item_type: r.item_type });

export default function InventoryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const avail = useAvailability();
  const valuation = useValuation();
  const glCheck = useGlCheck();
  const locationsQ = useLocations();
  const itemsQ = useItems();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [locationId, setLocationId] = useState('all');
  const [lowOnly, setLowOnly] = useState(false);

  const locations = useMemo(() => (locationsQ.data ?? []).filter((l) => l.kind === 'shop' || l.kind === 'kitchen'), [locationsQ.data]);

  // Scan an item barcode anywhere on this screen to open it.
  useBarcodeScanner({
    onScan: (code) => {
      const hit = itemsQ.data?.find((i) => i.barcode === code || i.sku.toLowerCase() === code.toLowerCase());
      if (hit) navigate(`/inventory/${hit.id}`);
      else toast.warning('Barcode not recognized', `No item matches ${code}. Check the label and try again.`);
    },
  });

  const rows = useMemo<GridRow[]>(() => {
    const byItem = new Map<number, GridRow>();
    const scoped = locationId === 'all' ? null : Number(locationId);
    for (const a of avail.data ?? []) {
      let row = byItem.get(a.item_id);
      if (!row) {
        row = {
          item_id: a.item_id, sku: a.sku, name: a.name, category: a.category, item_type: a.item_type, uom: a.uom,
          reorder_point: toNumber(a.reorder_point), byLocation: new Map(), onHand: 0, fresh: 0, dayOld: 0, allocated: 0,
          available: 0, backordered: 0, onOrder: 0, est: null, value: 0, state: 'ok',
        };
        byItem.set(a.item_id, row);
      }
      row.byLocation.set(a.location_id, a);
    }
    const valueByItem = new Map<number, number>();
    for (const v of valuation.data ?? []) {
      if (scoped !== null && v.location_id !== scoped) continue;
      valueByItem.set(v.item_id, (valueByItem.get(v.item_id) ?? 0) + toNumber(v.value));
    }
    for (const row of byItem.values()) {
      let companyOnHand = 0;
      const shortDates: string[] = [];
      const arrivalDates: string[] = [];
      for (const a of row.byLocation.values()) {
        companyOnHand += toNumber(a.on_hand);
        if (scoped !== null && a.location_id !== scoped) continue;
        row.onHand += toNumber(a.on_hand);
        row.fresh += toNumber(a.on_hand_fresh);
        row.dayOld += toNumber(a.on_hand_day_old);
        row.allocated += toNumber(a.allocated);
        row.available += toNumber(a.available);
        row.backordered += toNumber(a.backordered);
        row.onOrder += toNumber(a.on_order);
        if (toNumber(a.backordered) > 0) shortDates.push(a.est_available_date);
        if (toNumber(a.on_order) > 0) arrivalDates.push(a.est_available_date);
      }
      const earliest = (d: string[]) => (d.length ? [...d].sort()[0]! : null);
      row.est = earliest(shortDates) ?? (row.onHand <= 0 ? earliest(arrivalDates) : null);
      row.value = valueByItem.get(row.item_id) ?? 0;
      // Low stock is judged on company-wide stock, because reorder points are company-wide.
      row.state = companyOnHand <= 0 ? 'out' : row.reorder_point > 0 && companyOnHand <= row.reorder_point ? 'low' : 'ok';
    }
    return [...byItem.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [avail.data, valuation.data, locationId]);

  const categories = useMemo(() => ['all', ...[...new Set(rows.map((r) => r.category).filter((c): c is string => Boolean(c)))].sort()], [rows]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== 'all' && r.category !== category) return false;
      if (lowOnly && r.state === 'ok') return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.sku.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, category, lowOnly]);

  const totalValue = useMemo(() => rows.reduce((s, r) => s + r.value, 0), [rows]);
  const lowCount = rows.filter((r) => r.state !== 'ok').length;
  const backorderedCount = rows.filter((r) => r.backordered > 0).length;
  const onOrderCount = rows.filter((r) => r.onOrder > 0).length;
  const gl = glCheck.data;
  const glTied = gl ? Math.abs(toNumber(gl.valuation_vs_gl)) < 0.005 : null;

  const columns = useMemo<DataTableColumn<GridRow>[]>(() => {
    const locCols: DataTableColumn<GridRow>[] = locations
      .filter((l) => locationId === 'all' || String(l.id) === locationId)
      .map((l) => ({
        key: `loc-${l.id}`,
        header: l.name.replace(/ shop$/, ''),
        align: 'right',
        sortable: true,
        sortValue: (r) => toNumber(r.byLocation.get(l.id)?.on_hand),
        render: (r) => {
          const a = r.byLocation.get(l.id);
          if (!a) return <span className="gz-muted">—</span>;
          const dayOld = toNumber(a.on_hand_day_old);
          return (
            <span>
              <QtyCell qty={a.on_hand} item={EACH_LABEL(r)} />
              {dayOld > 0 && <span className="stk-sub text-body-sm">{formatItemQty(dayOld, EACH_LABEL(r))} day-old</span>}
            </span>
          );
        },
      }));
    return [
      {
        key: 'name', header: 'Item', sortable: true,
        render: (r) => (
          <span className="stk-item">
            <span className="stk-item__name">{r.name}</span>
            <span className="stk-item__sub gz-mono text-body-sm">{r.sku}</span>
          </span>
        ),
      },
      { key: 'category', header: 'Category', sortable: true, render: (r) => r.category ?? '—' },
      ...locCols,
      { key: 'onHand', header: 'On hand', align: 'right', sortable: true, render: (r) => <QtyCell qty={r.onHand} item={EACH_LABEL(r)} strong /> },
      { key: 'available', header: 'Available', align: 'right', sortable: true, render: (r) => <QtyCell qty={r.available} item={EACH_LABEL(r)} /> },
      { key: 'allocated', header: 'Allocated', align: 'right', sortable: true, render: (r) => <QtyCell qty={r.allocated} item={EACH_LABEL(r)} /> },
      {
        key: 'backordered', header: 'Backordered', align: 'right', sortable: true,
        render: (r) => (r.backordered > 0 ? <Badge tone="warning">{formatItemQty(r.backordered, EACH_LABEL(r))}</Badge> : <span className="gz-muted">—</span>),
      },
      { key: 'onOrder', header: 'On order', align: 'right', sortable: true, render: (r) => (r.onOrder > 0 ? <QtyCell qty={r.onOrder} item={EACH_LABEL(r)} /> : <span className="gz-muted">—</span>) },
      {
        key: 'est', header: 'Est. available', sortable: true, sortValue: (r) => r.est ?? '9999',
        render: (r) => (r.est ? <span className="gz-num">{formatDate(r.est)}</span> : <span className="gz-muted">{r.available > 0 ? 'Now' : '—'}</span>),
      },
      { key: 'value', header: 'Value at avg. cost', align: 'right', sortable: true, render: (r) => <MoneyCell value={r.value} /> },
      {
        key: 'state', header: 'Status',
        render: (r) => <StatusBadge status={r.state === 'out' ? 'out_of_stock' : r.state === 'low' ? 'low_stock' : 'in_stock'} />,
      },
    ];
  }, [locations, locationId]);

  const loading = avail.isLoading || valuation.isLoading || locationsQ.isLoading;
  const error = avail.error ?? valuation.error ?? locationsQ.error;

  return (
    <div className="gz-stack">
      <PageHeader
        title="Inventory"
        breadcrumb={[{ label: 'Stock' }, { label: 'Inventory' }]}
        subtitle="Stock by item and location at weighted-average cost. Scan an item barcode to open it."
      />

      {error && <ErrorAlert error={error} onRetry={() => { void avail.refetch(); void valuation.refetch(); void locationsQ.refetch(); }} />}

      <div className="gz-grid-stats">
        <StatCard
          label={locationId === 'all' ? 'Inventory value' : 'Value at this location'} value={formatMoney(totalValue)} icon="money" tint="mint"
          caption={glTied === null ? 'Weighted-average cost' : glTied ? 'Matches the general ledger' : 'Differs from the general ledger'}
        />
        <StatCard label="Low or out of stock" value={formatNumber(lowCount)} icon="alert" tint="butter" caption="Against company-wide reorder points" />
        <StatCard label="Items backordered" value={formatNumber(backorderedCount)} icon="clock" tint="lilac" caption="Open orders waiting on stock" />
        <StatCard label="Items on order" value={formatNumber(onOrderCount)} icon="truck" tint="cocoa" caption="Sent purchase orders not yet received" />
      </div>

      <div>
        <Toolbar
          end={<span className="gz-muted text-body-sm">{plural(shown.length, 'item')} shown</span>}
        >
          <TextField label="Search items" icon="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or SKU" className="stk-toolbar-field" />
          <Select
            label="Category" value={category} onChange={(e) => setCategory(e.target.value)}
            options={categories.map((c) => ({ value: c, label: c === 'all' ? 'All categories' : c }))} className="stk-toolbar-field--sm"
          />
          <Select
            label="Location" value={locationId} onChange={(e) => setLocationId(e.target.value)} className="stk-toolbar-field--sm"
            options={[{ value: 'all', label: 'All locations' }, ...locations.map((l) => ({ value: String(l.id), label: l.name }))]}
          />
          <Checkbox label="Low stock only" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
        </Toolbar>
        <DataTable<GridRow>
          aria-label="Inventory by item and location"
          columns={columns}
          rows={shown}
          rowKey="item_id"
          density="compact"
          scroll
          loading={loading}
          onRowClick={(r) => navigate(`/inventory/${r.item_id}`)}
          defaultSort={{ key: 'name', dir: 'asc' }}
          empty={
            <EmptyState
              icon="box"
              title={lowOnly ? 'Nothing is running low' : 'No items match'}
              description={lowOnly ? 'Every item is above its reorder point. Nice and stocked.' : 'Try a different search, category or location.'}
            />
          }
        />
      </div>
    </div>
  );
}

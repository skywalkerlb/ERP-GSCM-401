import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, DataTable, EmptyState, MoneyCell, PageHeader, Select, TextField } from '@/components';
import { STOCK_DOMAINS, indexBy, toNumber, useAction, useItemSuppliers, useItems, useSuppliers } from '@/features/items/api';
import { ErrorAlert, ItemCell, ItemPicker, KeyValue, plural } from '@/features/items/ui';
import { useLocations } from '@/hooks/useLocations';
import { formatDate, formatMoney, formatNumber, formatUnitCost } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { rpc, views } from '@/lib/rpc';
import type { Item, ItemSupplier } from '@/types/domain';
import { estimateExpected } from './api';

interface Line { item: Item; supply: ItemSupplier; qty: string; cost: string }

export default function NewPurchaseOrderPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const suppliersQ = useSuppliers();
  const itemsQ = useItems();
  const suppliedQ = useItemSuppliers();
  const locationsQ = useLocations();

  const [supplierId, setSupplierId] = useState(params.get('supplier') ?? '');
  const [shipTo, setShipTo] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seeded = useRef(false);

  const suppliers = useMemo(() => (suppliersQ.data ?? []).filter((s) => s.is_active), [suppliersQ.data]);
  const supplier = suppliers.find((s) => String(s.id) === supplierId);
  const itemMap = useMemo(() => indexBy(itemsQ.data, (i) => i.id), [itemsQ.data]);

  useEffect(() => {
    if (!shipTo && locationsQ.data) setShipTo(String(locationsQ.data.find((l) => l.kind === 'kitchen')?.id ?? locationsQ.data[0]?.id ?? ''));
  }, [shipTo, locationsQ.data]);

  const supplied = useMemo(() => (suppliedQ.data ?? []).filter((s) => String(s.supplier_id) === supplierId), [suppliedQ.data, supplierId]);
  const pickable = useMemo(
    () => supplied.map((s) => itemMap.get(s.item_id)).filter((i): i is Item => Boolean(i && i.is_active)),
    [supplied, itemMap],
  );
  const supplyOf = (itemId: number) => supplied.find((s) => s.item_id === itemId);

  const reorderQ = useQuery({
    queryKey: queryKeys.purchasing.scope('reorder-for-supplier', { supplierId }),
    enabled: Boolean(supplierId),
    queryFn: () => views.reorderAnalysis({ supplier_id: Number(supplierId) }),
  });
  const belowRop = (reorderQ.data ?? []).filter((r) => r.below_rop && toNumber(r.suggested_qty) > 0);

  function addItem(item: Item, qty?: number) {
    const supply = supplyOf(item.id);
    if (!supply) return;
    setError(null);
    setLines((cur) => {
      if (cur.some((l) => l.item.id === item.id)) return cur;
      const pack = toNumber(supply.pack_size, 1);
      return [...cur, { item, supply, qty: String(qty ?? pack), cost: String(toNumber(supply.unit_cost)) }];
    });
  }

  // `?item=` adds that item as soon as the supplier's items are known.
  useEffect(() => {
    const wanted = Number(params.get('item'));
    if (seeded.current || !wanted || pickable.length === 0) return;
    const hit = pickable.find((i) => i.id === wanted);
    if (hit) { seeded.current = true; addItem(hit); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickable]);

  const create = useAction(
    (v: { supplier: number; ship_to: number; lines: Array<{ item_id: number; qty: number; unit_cost: number }>; notes: string | null }) =>
      rpc.createPurchaseOrder({ ...v, source: 'manual' }),
    { invalidate: STOCK_DOMAINS, errorTitle: 'Could not create the purchase order', success: 'Draft purchase order created. Review it, then send it.', onSuccess: (id) => navigate(`/purchasing/${id}`) },
  );

  const total = lines.reduce((s, l) => s + toNumber(l.qty) * toNumber(l.cost), 0);
  const leadDays = lines.map((l) => l.supply.quoted_lead_time_days ?? supplier?.quoted_lead_time_days ?? 0);
  const expected = estimateExpected(leadDays);
  const notPacked = lines.filter((l) => toNumber(l.supply.pack_size, 1) > 1 && toNumber(l.qty) % toNumber(l.supply.pack_size, 1) !== 0);

  function submit() {
    const payload = lines.map((l) => ({ item_id: l.item.id, qty: toNumber(l.qty), unit_cost: toNumber(l.cost) })).filter((l) => l.qty > 0);
    if (!supplier) return setError('Choose a supplier first.');
    if (!shipTo) return setError('Choose where the order should be delivered.');
    if (payload.length === 0) return setError('Add at least one item with a quantity above zero.');
    setError(null);
    create.mutate({ supplier: supplier.id, ship_to: Number(shipTo), lines: payload, notes: notes.trim() || null });
  }

  return (
    <div className="gz-stack">
      <PageHeader
        title="New purchase order"
        breadcrumb={[{ label: 'Buy' }, { label: 'Purchasing', to: '/purchasing' }, { label: 'New purchase order' }]}
        subtitle="Pick a supplier, add items at their quoted cost, and save a draft. Nothing is ordered until you send it."
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/purchasing')}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={create.isPending}>{create.isPending ? 'Saving' : 'Create draft'}</Button>
          </>
        }
      />
      {(suppliersQ.error || itemsQ.error || suppliedQ.error) && <ErrorAlert error={suppliersQ.error ?? itemsQ.error ?? suppliedQ.error} />}
      {error && <Alert tone="danger" title={error} />}

      <div className="gz-detail">
        <div className="gz-stack">
          <Card title="Order details">
            <div className="gz-form-grid">
              <Select
                label="Supplier" value={supplierId}
                onChange={(e) => { setSupplierId(e.target.value); setLines([]); }}
                options={[{ value: '', label: 'Choose a supplier' }, ...suppliers.map((s) => ({ value: String(s.id), label: s.name }))]}
              />
              <Select
                label="Ship to" value={shipTo} onChange={(e) => setShipTo(e.target.value)}
                options={(locationsQ.data ?? []).map((l) => ({ value: String(l.id), label: l.name }))}
              />
              <TextField label="Notes for the supplier (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery window, dock instructions" />
            </div>
          </Card>

          <Card title="Items" padded={false}>
            {!supplier ? (
              <EmptyState icon="building" title="Choose a supplier to add items" description="Only items this supplier carries can go on the order, at their quoted cost." />
            ) : (
              <>
                <div className="stk-lines-add" style={{ padding: 'var(--space-4) var(--space-4) 0' }}>
                  <div className="gz-row" style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <ItemPicker items={pickable} onPick={(i) => addItem(i)} exclude={new Set(lines.map((l) => l.item.id))} renderMeta={(i) => formatUnitCost(supplyOf(i.id)?.unit_cost)} />
                    </div>
                    <Button
                      icon="sparkles" disabled={belowRop.length === 0}
                      onClick={() => belowRop.forEach((r) => { const it = itemMap.get(r.item_id); if (it) addItem(it, toNumber(r.suggested_qty)); })}
                    >
                      {belowRop.length ? `Add ${plural(belowRop.length, 'item')} below reorder point` : 'Nothing below reorder point'}
                    </Button>
                  </div>
                </div>
                <DataTable<Line>
                  aria-label="Purchase order lines" density="compact" rows={lines.map((l) => ({ ...l, id: l.item.id }))}
                  empty="Scan or search for an item to add it."
                  columns={[
                    { key: 'item', header: 'Item', render: (l) => <ItemCell item={l.item} /> },
                    { key: 'sku', header: 'Supplier SKU', mono: true, render: (l) => l.supply.supplier_sku ?? '—' },
                    { key: 'pack', header: 'Pack size', align: 'right', render: (l) => formatNumber(l.supply.pack_size, 0) },
                    {
                      key: 'cost', header: 'Unit cost', align: 'right',
                      render: (l) => (
                        <TextField
                          aria-label={`Unit cost for ${l.item.name}`} className="stk-cell-input" type="number" inputMode="decimal" min={0} step="0.0001"
                          value={l.cost} onChange={(e) => setLines((cur) => cur.map((x) => (x.item.id === l.item.id ? { ...x, cost: e.target.value } : x)))}
                        />
                      ),
                    },
                    {
                      key: 'qty', header: 'Quantity', align: 'right',
                      render: (l) => (
                        <TextField
                          aria-label={`Quantity for ${l.item.name}`} className="stk-cell-input" type="number" inputMode="decimal" min={0} step={toNumber(l.supply.pack_size, 1)}
                          value={l.qty} onChange={(e) => setLines((cur) => cur.map((x) => (x.item.id === l.item.id ? { ...x, qty: e.target.value } : x)))}
                        />
                      ),
                    },
                    { key: 'total', header: 'Line total', align: 'right', render: (l) => <MoneyCell value={toNumber(l.qty) * toNumber(l.cost)} /> },
                    { key: 'remove', header: '', align: 'right', render: (l) => <Button size="sm" variant="ghost" icon="trash" aria-label={`Remove ${l.item.name}`} onClick={() => setLines((cur) => cur.filter((x) => x.item.id !== l.item.id))} /> },
                  ]}
                />
                {lines.length > 0 && <div className="stk-total-row"><span>{plural(lines.length, 'line')}</span><strong>{formatMoney(total)}</strong></div>}
              </>
            )}
          </Card>
        </div>

        <div className="gz-stack">
          <Card title="Summary">
            <KeyValue
              rows={[
                ['Supplier', supplier?.name ?? '—'],
                ['Payment terms', supplier?.terms_label ?? '—'],
                ['Lead time', supplier ? `${supplier.quoted_lead_time_days} days quoted` : '—'],
                ['Expected if sent today', expected ? formatDate(expected) : '—'],
                ['Order total', formatMoney(total)],
              ]}
            />
            <p className="gz-muted text-body-sm" style={{ marginTop: 'var(--space-4)' }}>
              The expected date uses the longest lead time on the order: the item&apos;s quoted time, or the supplier&apos;s. It is set for real when you send the order.
            </p>
          </Card>
          {notPacked.length > 0 && (
            <Alert tone="warning" title="Quantities are not in whole packs">
              {notPacked.map((l) => l.item.name).join(', ')} {notPacked.length === 1 ? 'is' : 'are'} sold in packs. Suppliers usually ship full packs, so round up before you send.
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}

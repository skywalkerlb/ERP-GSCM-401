import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Alert, Badge, Button, Card, DataTable, EmptyState, MoneyCell, PageHeader, QtyCell, Select, TextField, useToast,
} from '@/components';
import { STOCK_DOMAINS, indexBy, toNumber, useAction, useItems, useSuppliers } from '@/features/items/api';
import { ErrorAlert, ItemCell, ItemPicker, KeyValue, LateBadge, TimelinessBadge, plural } from '@/features/items/ui';
import { usePurchaseOrders, type PoView } from '@/features/purchasing/api';
import { useLocations } from '@/hooks/useLocations';
import { businessDate, daysBetween, formatDate, formatMoney, formatNumber } from '@/lib/format';
import { rpc } from '@/lib/rpc';
import type { Item, PoLine, ReceivePurchaseOrderResult } from '@/types/domain';

const openQty = (l: PoLine) => Math.max(0, toNumber(l.qty_ordered) - toNumber(l.qty_received) - toNumber(l.qty_cancelled));

export default function ReceivePage() {
  const toast = useToast();
  const [params] = useSearchParams();
  const posQ = usePurchaseOrders();
  const itemsQ = useItems();
  const suppliersQ = useSuppliers();
  const locationsQ = useLocations();

  const [poId, setPoId] = useState<string>(params.get('po') ?? '');
  const [qty, setQty] = useState<Record<number, string>>({});
  const [locationId, setLocationId] = useState('');
  const [receivedOn, setReceivedOn] = useState(businessDate());
  const [candidates, setCandidates] = useState<{ item: Item; pos: PoView[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ res: ReceivePurchaseOrderResult; po: PoView; backordered: number } | null>(null);

  const itemMap = useMemo(() => indexBy(itemsQ.data, (i) => i.id), [itemsQ.data]);
  const supplierMap = useMemo(() => indexBy(suppliersQ.data, (s) => s.id), [suppliersQ.data]);
  const openPos = useMemo(() => (posQ.data ?? []).filter((p) => p.status === 'sent' && p.open > 0).sort((a, b) => (a.expected_on ?? '').localeCompare(b.expected_on ?? '')), [posQ.data]);
  const po = openPos.find((p) => String(p.id) === poId);
  const locations = locationsQ.data ?? [];

  // Default the receiving location to the PO's ship-to, else the Central Kitchen.
  const lastPo = useRef('');
  useEffect(() => {
    const key = String(po?.id ?? 'none');
    if (!locations.length || lastPo.current === key) return;
    lastPo.current = key;
    const kitchen = locations.find((l) => l.kind === 'kitchen');
    setLocationId(String(po?.ship_to_location_id ?? kitchen?.id ?? locations[0]?.id ?? ''));
  }, [po, locations]);

  function choosePo(id: string) {
    setPoId(id);
    setQty({});
    setError(null);
    setResult(null);
    setCandidates(null);
  }

  function bump(target: PoView, item: Item) {
    const line = target.lines.find((l) => l.item_id === item.id && openQty(l) > 0);
    if (!line) return toast.warning('Not on this order', `${item.name} has nothing left to receive on ${target.po_number}.`);
    setQty((cur) => ({ ...cur, [line.id]: String(toNumber(cur[line.id]) + 1) }));
  }

  function onPick(item: Item) {
    setResult(null);
    setError(null);
    if (po) return bump(po, item);
    const matches = openPos.filter((p) => p.lines.some((l) => l.item_id === item.id && openQty(l) > 0));
    if (matches.length === 0) return toast.warning('No open order', `${item.name} is not on any order waiting to be received.`);
    if (matches.length === 1) {
      const only = matches[0]!;
      setPoId(String(only.id));
      setQty({});
      const line = only.lines.find((l) => l.item_id === item.id && openQty(l) > 0)!;
      setQty({ [line.id]: '1' });
      return;
    }
    setCandidates({ item, pos: matches });
  }

  const lines = po?.lines ?? [];
  const computed = lines.map((l) => {
    const entered = qty[l.id] === undefined || qty[l.id] === '' ? 0 : toNumber(qty[l.id]);
    const open = openQty(l);
    return { line: l, entered, open, over: entered > open + 1e-9, after: Math.max(0, open - entered), value: entered * toNumber(l.unit_cost) };
  });
  const receiving = computed.filter((c) => c.entered > 0);
  const total = receiving.reduce((s, c) => s + c.value, 0);
  const backorderedAfter = computed.reduce((s, c) => s + c.after, 0);
  const lateDays = po?.expected_on ? daysBetween(po.expected_on, receivedOn) : null;

  const receive = useAction(
    (v: { po_id: number; location_id: number; received_on: string; lines: Array<{ po_line_id: number; qty: number }> }) => rpc.receivePurchaseOrder(v),
    { invalidate: STOCK_DOMAINS, errorTitle: 'Could not receive the order' },
  );

  async function submit() {
    if (!po) return setError('Choose a purchase order first.');
    if (receiving.length === 0) return setError('Enter a received quantity for at least one line.');
    if (computed.some((c) => c.over)) return setError('A received quantity is more than what is still expected. Lower it, or ask the supplier about the extra.');
    if (!locationId) return setError('Choose where the stock is being received.');
    setError(null);
    try {
      const res = await receive.mutateAsync({
        po_id: po.id, location_id: Number(locationId), received_on: receivedOn,
        lines: receiving.map((c) => ({ po_line_id: c.line.id, qty: c.entered })),
      });
      setResult({ res, po, backordered: backorderedAfter });
      setQty({});
      setPoId('');
    } catch {
      /* the toast explains */
    }
  }

  const scanItems = useMemo(() => {
    if (po) return po.lines.map((l) => itemMap.get(l.item_id)).filter((i): i is Item => Boolean(i));
    const ids = new Set(openPos.flatMap((p) => p.lines.map((l) => l.item_id)));
    return (itemsQ.data ?? []).filter((i) => ids.has(i.id));
  }, [po, openPos, itemMap, itemsQ.data]);

  return (
    <div className="gz-stack">
      <PageHeader
        title="Receive stock"
        breadcrumb={[{ label: 'Stock' }, { label: 'Inventory', to: '/inventory' }, { label: 'Receive stock' }]}
        subtitle="Pick the order that arrived, or scan an item to find it. Scanning adds one to that line."
        actions={<Button variant="primary" icon="truck" onClick={() => void submit()} disabled={receive.isPending || !po || receiving.length === 0}>{receive.isPending ? 'Receiving' : 'Receive stock'}</Button>}
      />
      {(posQ.error || itemsQ.error) && <ErrorAlert error={posQ.error ?? itemsQ.error} onRetry={() => void posQ.refetch()} />}

      {result && (
        <Alert
          tone={result.backordered > 0 ? 'warning' : 'success'}
          title={`Received ${result.res.receipt_no}, ${formatMoney(result.res.amount)}`}
          action={<Link className="gz-link" to={`/purchasing/${result.po.id}`}>Open {result.po.po_number}</Link>}
        >
          {result.backordered > 0
            ? `${result.po.po_number} is partially received. ${formatNumber(result.backordered)} units are on backorder${result.po.expected_on ? `, still expected ${formatDate(result.po.expected_on)}` : ''}.`
            : `${result.po.po_number} is fully received.`}
          {result.res.bill_id ? ' A supplier bill was created.' : ''}
        </Alert>
      )}

      <div className="gz-detail">
        <div className="gz-stack">
          <Card title="Which order arrived?">
            <div className="gz-stack gz-stack--sm">
              <Select
                label="Open purchase order" value={poId} onChange={(e) => choosePo(e.target.value)}
                options={[
                  { value: '', label: openPos.length ? 'Choose an order' : 'No orders are waiting' },
                  ...openPos.map((p) => ({ value: String(p.id), label: `${p.po_number} · ${supplierMap.get(p.supplier_id)?.name ?? ''} · due ${formatDate(p.expected_on)}${p.late ? ' · late' : ''}` })),
                ]}
              />
              <ItemPicker
                items={scanItems} onPick={onPick} continuous
                label={po ? `Scan items on ${po.po_number}` : 'Or scan an item to find its order'}
                hint="Click the box, then scan. Each scan adds one to the line."
              />
              {candidates && (
                <Alert tone="info" title={`${candidates.item.name} is on ${candidates.pos.length} open orders`}>
                  <span className="gz-row">
                    {candidates.pos.map((p) => (
                      <Button key={p.id} size="sm" onClick={() => { setPoId(String(p.id)); const l = p.lines.find((x) => x.item_id === candidates.item.id && openQty(x) > 0)!; setQty({ [l.id]: '1' }); setCandidates(null); }}>
                        {p.po_number} ({supplierMap.get(p.supplier_id)?.name})
                      </Button>
                    ))}
                  </span>
                </Alert>
              )}
            </div>
          </Card>

          <Card title={po ? `Lines on ${po.po_number}` : 'Lines'} padded={false}>
            {!po ? (
              <EmptyState icon="truck" title="Choose an order to start receiving" description="Pick an order above, or scan one of its items." />
            ) : (
              <DataTable
                aria-label="Receiving lines" rowKey="id" density="compact"
                rows={computed.map((c) => ({ ...c, id: c.line.id }))}
                columns={[
                  { key: 'item', header: 'Item', render: (c) => <ItemCell item={itemMap.get(c.line.item_id)} /> },
                  { key: 'ordered', header: 'Ordered', align: 'right', render: (c) => <QtyCell qty={c.line.qty_ordered} item={itemMap.get(c.line.item_id)} /> },
                  { key: 'got', header: 'Already received', align: 'right', render: (c) => <QtyCell qty={c.line.qty_received} item={itemMap.get(c.line.item_id)} /> },
                  { key: 'open', header: 'Still expected', align: 'right', render: (c) => (c.open > 0 ? <QtyCell qty={c.open} item={itemMap.get(c.line.item_id)} strong /> : <Badge tone="success">Complete</Badge>) },
                  {
                    key: 'now', header: 'Receive now', align: 'right',
                    render: (c) => c.open > 0 ? (
                      <span className="gz-row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap', gap: 'var(--space-2)' }}>
                        <TextField
                          aria-label={`Received quantity for ${itemMap.get(c.line.item_id)?.name ?? 'item'}`} className="stk-cell-input" type="number" inputMode="decimal" min={0} step="any"
                          value={qty[c.line.id] ?? ''} placeholder="0"
                          onChange={(e) => setQty((cur) => ({ ...cur, [c.line.id]: e.target.value }))}
                          error={c.over ? `Max ${formatNumber(c.open)}` : undefined}
                        />
                        <Button size="sm" variant="ghost" onClick={() => setQty((cur) => ({ ...cur, [c.line.id]: String(c.open) }))}>All</Button>
                      </span>
                    ) : null,
                  },
                  { key: 'after', header: 'Backordered after', align: 'right', render: (c) => (c.open > 0 && c.after > 0 ? <Badge tone="warning">{formatNumber(c.after)}</Badge> : <span className="gz-muted">—</span>) },
                  { key: 'value', header: 'Value', align: 'right', render: (c) => <MoneyCell value={c.value} /> },
                ]}
              />
            )}
          </Card>
          {error && <Alert tone="danger" title={error} />}
        </div>

        <div className="gz-stack">
          <Card title="Delivery details">
            <div className="gz-stack gz-stack--sm">
              <Select label="Receiving location" value={locationId} onChange={(e) => setLocationId(e.target.value)} options={locations.map((l) => ({ value: String(l.id), label: l.name }))} />
              <TextField label="Date received" type="date" max={businessDate()} value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
            </div>
          </Card>
          <Card title="This delivery">
            {po ? (
              <KeyValue
                rows={[
                  ['Supplier', supplierMap.get(po.supplier_id)?.name ?? '—'],
                  ['Expected', <span key="e">{formatDate(po.expected_on)} <LateBadge expectedOn={po.expected_on} open /></span>],
                  ['Received', formatDate(receivedOn)],
                  ['On time?', receiving.length === 0 && lateDays === null ? '—' : <TimelinessBadge key="t" expectedOn={po.expected_on} receivedOn={receivedOn} />],
                  ['Lines receiving', plural(receiving.length, 'line')],
                  ['Backordered after', backorderedAfter > 0 ? <Badge key="b" tone="warning">{`${formatNumber(backorderedAfter)} units`}</Badge> : 'None'],
                  ['Receipt value', <strong key="v">{formatMoney(total)}</strong>],
                ]}
              />
            ) : (
              <p className="gz-muted">Details appear once you choose an order.</p>
            )}
            {po && backorderedAfter > 0 && receiving.length > 0 && (
              <p className="gz-muted text-body-sm" style={{ marginTop: 'var(--space-3)' }}>
                The order stays open as partially received. The remainder keeps its expected date and counts against the supplier&apos;s fill rate if you later close it.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

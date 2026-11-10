import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, DataTable, EmptyState, MoneyCell, PageHeader, Select, TextField, useToast, type DataTableColumn } from '@/components';
import { Icon } from '@/components/Icon';
import { CustomerPicker } from '@/features/pos/CustomerPicker';
import { QtyStepper } from '@/features/pos/QtyStepper';
import { invalidateSelling, useAvailability, useSellableItems, useSellSettings, type SellableItem } from '@/features/pos/api';
import { computeTotals } from '@/features/pos/calc';
import { zonedIso } from '@/features/sales/time';
import { useSelectedLocation } from '@/hooks/useLocations';
import { businessDate, formatDate, formatMoney, formatNumber, formatPct } from '@/lib/format';
import { rpc, rpcErrorMessage } from '@/lib/rpc';
import type { SalesOrderChannel } from '@/types/domain';
import { CHANNEL_LABEL } from './api';
import './orders.css';

interface Line {
  id: number;
  item: SellableItem;
  qty: number;
}

const CHANNELS: SalesOrderChannel[] = ['counter', 'phone', 'catering', 'online'];

export default function OrderNewPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { locationId, shops } = useSelectedLocation();
  const itemsQ = useSellableItems();
  const settingsQ = useSellSettings();

  const [customerId, setCustomerId] = useState<number | null>(null);
  const [shopId, setShopId] = useState<number | null>(null);
  const [date, setDate] = useState(() => businessDate());
  const [time, setTime] = useState('09:00');
  const [channel, setChannel] = useState<SalesOrderChannel>('counter');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState('');
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (shopId === null && shops.length > 0) setShopId(shops.find((s) => s.id === locationId)?.id ?? shops[0]!.id);
  }, [shops, locationId, shopId]);

  const shop = shops.find((s) => s.id === shopId) ?? null;
  const availQ = useAvailability(shopId);
  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  const taxRate = Number(shop?.tax_rate ?? settingsQ.data?.default_tax_rate ?? 0);
  const totals = computeTotals(lines.map((l) => ({ qty: l.qty, unitPrice: l.item.list_price, discountPct: 0 })), null, taxRate);

  const create = useMutation({
    mutationFn: () =>
      rpc.createSalesOrder({
        customer_id: customerId as number,
        location_id: shopId as number,
        requested_for: zonedIso(date, time),
        lines: lines.map((l) => ({ item_id: l.item.id, qty: l.qty })),
        channel,
        notes: notes.trim() || null,
      }),
    onSuccess: (id) => {
      invalidateSelling(qc);
      toast.success('Order placed', 'The shop will see it on the Orders list.');
      navigate(`/orders/${id}`);
    },
  });

  function addPicked() {
    const item = items.find((i) => String(i.id) === pick);
    if (!item) return;
    setLines((cur) => (cur.some((l) => l.item.id === item.id) ? cur.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l)) : [...cur, { id: item.id, item, qty: 1 }]));
    setPick('');
  }

  const problems = {
    customer: customerId === null ? 'Choose who the order is for, or add a new customer.' : undefined,
    shop: shopId === null ? 'Choose the shop that will fill this order.' : undefined,
    when: !date || !time ? 'Choose a date and time.' : undefined,
    lines: lines.length === 0 ? 'Add at least one item.' : undefined,
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.values(problems).some(Boolean)) return;
    create.mutate();
  }

  const columns: DataTableColumn<Line>[] = [
    { key: 'name', header: 'Item', render: (l) => <span className="text-body-strong">{l.item.name}</span> },
    {
      key: 'stock',
      header: 'At this shop now',
      render: (l) => {
        const av = availQ.data?.get(l.item.id);
        if (!av) return <span className="gz-muted">—</span>;
        const onHand = Number(av.on_hand);
        return l.qty > onHand ? (
          <span className="ord-warn text-body-sm">
            <Icon name="alert" size={16} />
            {formatNumber(onHand)} on hand, ready by {formatDate(av.est_available_date)}
          </span>
        ) : (
          <span className="gz-muted text-body-sm">{formatNumber(onHand)} on hand</span>
        );
      },
    },
    { key: 'price', header: 'Price', align: 'right', render: (l) => <MoneyCell value={l.item.list_price} /> },
    {
      key: 'qty',
      header: 'Quantity',
      align: 'right',
      render: (l) => (
        <QtyStepper
          size="sm"
          label={`Quantity of ${l.item.name}`}
          value={l.qty}
          onChange={(n) => setLines((cur) => cur.map((x) => (x.item.id === l.item.id ? { ...x, qty: n } : x)))}
        />
      ),
    },
    { key: 'total', header: 'Line total', align: 'right', render: (l) => <MoneyCell value={l.qty * l.item.list_price} strong /> },
    {
      key: 'remove',
      header: <span className="gz-sr-only">Remove</span>,
      align: 'right',
      render: (l) => <Button size="sm" variant="ghost" icon="x" aria-label={`Remove ${l.item.name}`} onClick={() => setLines((cur) => cur.filter((x) => x.item.id !== l.item.id))} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="New order"
        breadcrumb={[{ label: 'Sell' }, { label: 'Orders', to: '/orders' }, { label: 'New order' }]}
        subtitle="Take a catering or pickup order. Stock is set aside when you place it."
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/orders')} disabled={create.isPending}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="new-order-form" disabled={create.isPending}>
              {create.isPending ? 'Placing order' : 'Place order'}
            </Button>
          </>
        }
      />

      <form id="new-order-form" onSubmit={submit} noValidate className="gz-detail">
        <div className="gz-stack">
          {create.isError && (
            <Alert tone="danger" title="Could not place the order">
              {rpcErrorMessage(create.error)}
            </Alert>
          )}
          {tried && Object.values(problems).some(Boolean) && (
            <Alert tone="warning" title="A few things need attention">
              {Object.values(problems).filter(Boolean).join(' ')}
            </Alert>
          )}

          <Card title="Who and when">
            <div className="gz-form-grid">
              <CustomerPicker value={customerId} onChange={setCustomerId} noneLabel={null} error={tried ? problems.customer : undefined} />
              <Select
                label="Shop"
                required
                value={shopId === null ? '' : String(shopId)}
                onChange={(e) => setShopId(Number(e.target.value))}
                options={shops.map((s) => ({ value: String(s.id), label: s.name }))}
              />
              <TextField label="Pickup or delivery date" type="date" required min={businessDate()} value={date} onChange={(e) => setDate(e.target.value)} />
              <TextField label="Time" type="time" required step={900} value={time} onChange={(e) => setTime(e.target.value)} hint="Times are in Mountain time, the same as the shops." />
              <Select
                label="Channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value as SalesOrderChannel)}
                options={CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
              />
              <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} hint="Delivery address, allergies, name on the box." />
            </div>
          </Card>

          <Card title="Items" padded={false}>
            <div className="ord-lines" style={{ padding: 'var(--space-4)' }}>
              <div className="ord-add">
                <Select
                  label="Add an item"
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                  options={[{ value: '', label: itemsQ.isLoading ? 'Loading items' : 'Choose an item' }, ...items.map((i) => ({ value: String(i.id), label: `${i.name} (${formatMoney(i.list_price)})` }))]}
                />
                <Button icon="plus" onClick={addPicked} disabled={!pick}>
                  Add item
                </Button>
              </div>
              {lines.length === 0 && (
                <EmptyState icon="box" title="No items yet" description="Choose an item above to start the order." />
              )}
            </div>
            {lines.length > 0 && <DataTable aria-label="Order items" columns={columns} rows={lines} />}
          </Card>
        </div>

        <Card title="Order summary">
          <dl className="ord-totals">
            <div>
              <dt>Items</dt>
              <dd>{formatNumber(lines.reduce((s, l) => s + l.qty, 0))}</dd>
            </div>
            <div>
              <dt>Subtotal</dt>
              <dd>{formatMoney(totals.subtotal)}</dd>
            </div>
            <div>
              <dt>Estimated tax ({formatPct(taxRate, 2)})</dt>
              <dd>{formatMoney(totals.tax)}</dd>
            </div>
            <div className="is-total">
              <dt>Estimated total</dt>
              <dd className="text-h2">{formatMoney(totals.total)}</dd>
            </div>
          </dl>
          <p className="text-body-sm ord-hint">Payment is taken when the order is fulfilled.</p>
        </Card>
      </form>
    </>
  );
}

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, EmptyState, PageHeader, Select, SkeletonLines, TextField, useToast } from '@/components';
import { Icon } from '@/components/Icon';
import { QtyStepper } from '@/features/pos/QtyStepper';
import { computeTotals } from '@/features/pos/calc';
import { slotLabel, timeSlots, zonedIso } from '@/features/sales/time';
import { addDays, businessDate, businessNowParts, formatDate, formatMoney, formatNumber, formatPct, formatWeekday } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { rpc, rpcErrorMessage } from '@/lib/rpc';
import { groupCatalog, useCatalog, useShops, type ShopInfo } from './api';
import { useCart } from './cartStore';
import './portal.css';

const DAYS_AHEAD = 14;
/** Orders need a little lead time, so today's earliest slot is this many minutes from now. */
const LEAD_MINUTES = 30;

/** The next open dates for a shop, starting today. */
function openDates(shop: ShopInfo | undefined): string[] {
  const out: string[] = [];
  const today = businessDate();
  for (let i = 0; i <= DAYS_AHEAD; i++) {
    const d = addDays(today, i);
    const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (!shop?.closed_weekdays.includes(weekday)) out.push(d);
  }
  return out;
}

function slotsFor(shop: ShopInfo | undefined, date: string): string[] {
  const all = timeSlots(shop?.open_time, shop?.close_time, 30);
  if (date !== businessDate()) return all;
  const now = businessNowParts();
  const earliest = now.hour * 60 + now.minute + LEAD_MINUTES;
  return all.filter((s) => {
    const [h, m] = s.split(':').map(Number) as [number, number];
    return h * 60 + m >= earliest;
  });
}

export default function PortalCartPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const cart = useCart();
  const catalogQ = useCatalog();
  const shopsQ = useShops();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');

  const shops = useMemo(() => shopsQ.data ?? [], [shopsQ.data]);
  const items = useMemo(() => groupCatalog(catalogQ.data ?? []), [catalogQ.data]);
  const byId = useMemo(() => new Map(items.map((i) => [i.item_id, i])), [items]);

  // Default to the shop chosen while browsing, or the first shop.
  const shopId = cart.location_id !== null && shops.some((s) => s.id === cart.location_id) ? cart.location_id : (shops[0]?.id ?? null);
  const shop = shops.find((s) => s.id === shopId);

  const dates = useMemo(() => openDates(shop).filter((d) => slotsFor(shop, d).length > 0), [shop]);
  const slots = useMemo(() => slotsFor(shop, date), [shop, date]);
  useEffect(() => {
    if (dates.length > 0 && !dates.includes(date)) setDate(dates[0]!);
  }, [dates, date]);
  useEffect(() => {
    if (slots.length > 0 && !slots.includes(time)) setTime(slots.includes('09:00') ? '09:00' : slots[0]!);
  }, [slots, time]);

  const lines = cart.lines
    .map((l) => ({ ...l, item: byId.get(l.item_id) }))
    .filter((l): l is typeof l & { item: NonNullable<typeof l.item> } => Boolean(l.item));
  const unavailableLines = cart.lines.filter((l) => !byId.has(l.item_id));
  const unavailableAtShop = lines.filter((l) => shopId === null || !l.item.byShop.has(shopId));
  const totals = computeTotals(lines.map((l) => ({ qty: l.qty, unitPrice: l.item.list_price, discountPct: 0 })), null, shop?.tax_rate ?? 0);

  // Where the order is short of stock, the pickup should wait for the date the shop expects more.
  const shortages = lines
    .map((l) => ({ line: l, row: shopId === null ? undefined : l.item.byShop.get(shopId) }))
    .filter(({ line, row }) => row && line.qty > row.available_qty);
  const readyBy = shortages.reduce((latest, { row }) => (row && row.est_available_date > latest ? row.est_available_date : latest), '');
  const tooEarly = readyBy !== '' && date !== '' && date < readyBy;
  const canPlace = !catalogQ.isError && !shopsQ.isError && shopId !== null && lines.length > 0 &&
    unavailableLines.length === 0 && unavailableAtShop.length === 0 && dates.includes(date) && slots.includes(time);

  const place = useMutation({
    mutationFn: () =>
      rpc.placePickupOrder({
        location_id: shopId as number,
        pickup_at: zonedIso(date, time),
        lines: lines.map((l) => ({ item_id: l.item_id, qty: l.qty })),
        notes: notes.trim() || null,
      }),
    onSuccess: (res) => {
      cart.clear();
      void qc.invalidateQueries({ queryKey: queryKeys.orders.all });
      void qc.invalidateQueries({ queryKey: queryKeys.catalog.all });
      void qc.invalidateQueries({ queryKey: queryKeys.mrp.all });
      toast.success('Order placed', `${res.so_number} for ${formatMoney(res.total)} before tax. Track your pickup in My orders.`);
      navigate('/shop/orders');
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (canPlace && !place.isPending) place.mutate();
  }

  const crumbs = [{ label: 'Shop', to: '/shop' }, { label: 'Cart' }];
  if (catalogQ.isLoading || shopsQ.isLoading) {
    return (
      <>
        <PageHeader title="Your cart" breadcrumb={crumbs} />
        <Card>
          <SkeletonLines lines={5} />
        </Card>
      </>
    );
  }
  if (catalogQ.isError || shopsQ.isError) {
    return <>
      <PageHeader title="Your cart" breadcrumb={crumbs} />
      <Alert tone="danger" title="Could not check pickup availability" action={<Button onClick={() => { void catalogQ.refetch(); void shopsQ.refetch(); }}>Try again</Button>}>
        {rpcErrorMessage(catalogQ.error ?? shopsQ.error)} Your cart is saved. Reload availability before placing the order.
      </Alert>
    </>;
  }
  if (cart.lines.length === 0) {
    return (
      <>
        <PageHeader title="Your cart" breadcrumb={crumbs} />
        <EmptyState
          icon="bag"
          title="Your cart is empty"
          description="Add a few donuts and come back here to choose a pickup time."
          action={
            <Button variant="primary" onClick={() => navigate('/shop')}>
              Browse the shop
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Your cart"
        breadcrumb={crumbs}
        subtitle="Choose where and when to pick up. You pay at the shop."
        actions={
          <Button variant="primary" type="submit" form="pickup-form" disabled={place.isPending || !canPlace}>
            {place.isPending ? 'Placing order' : 'Place pickup order'}
          </Button>
        }
      />
      <form id="pickup-form" className="gz-detail" onSubmit={submit} noValidate>
        <div className="gz-stack">
          {(unavailableLines.length > 0 || unavailableAtShop.length > 0) && <Alert tone="warning" title="Some items are unavailable at this shop">
            Choose another pickup shop or remove the unavailable items before ordering.
            {unavailableLines.map((l) => <div key={l.item_id}><Button size="sm" onClick={() => cart.remove(l.item_id)}>Remove unavailable item {l.item_id}</Button></div>)}
          </Alert>}
          {place.isError && (
            <Alert tone="danger" title="We could not place your order">
              {rpcErrorMessage(place.error)} Check the pickup time and quantities, then try again.
            </Alert>
          )}
          {tooEarly && (
            <Alert tone="warning" title="Some items will not be ready by then">
              More stock of {shortages.map(({ line }) => line.item.name).join(', ')} is estimated at {shop?.name} on {formatDate(readyBy)}. Choose a later pickup or contact the shop to confirm the full quantity.
            </Alert>
          )}

          <Card title="Your items">
            {lines.map((l) => {
              const row = shopId === null ? undefined : l.item.byShop.get(shopId);
              const short = row && l.qty > row.available_qty;
              return (
                <div key={l.item_id} className="shop-cart-line">
                  <div>
                    <div className="text-body-strong">{l.item.name}</div>
                    <div className="text-body-sm gz-muted">{formatMoney(l.item.list_price)} each</div>
                    <div className="text-body-sm gz-muted">{row ? `${formatNumber(row.available_qty)} available at ${shop?.name}` : 'Unavailable at this pickup shop'}</div>
                  </div>
                  <QtyStepper min={1} max={500} label={`Quantity of ${l.item.name}`} value={l.qty} onChange={(n) => cart.setQty(l.item_id, n)} />
                  <div className="gz-row" style={{ flexWrap: 'nowrap', gap: 'var(--space-2)' }}>
                    <span className="text-body-strong gz-num">{formatMoney(l.qty * l.item.list_price)}</span>
                    <Button size="sm" variant="ghost" icon="x" aria-label={`Remove ${l.item.name}`} onClick={() => cart.remove(l.item_id)} />
                  </div>
                  {short && row && (
                    <span className="shop-cart-line__note shop-warn text-body-sm">
                      <Icon name="alert" size={16} />
                      {shop?.name} has {formatNumber(row.available_qty)} right now. More stock is estimated {formatDate(row.est_available_date)}; contact the shop to confirm larger quantities.
                    </span>
                  )}
                </div>
              );
            })}
          </Card>

          <Card title="Pickup">
            <div className="gz-form-grid">
              <Select
                label="Pickup shop"
                value={shopId === null ? '' : String(shopId)}
                onChange={(e) => cart.setLocation(Number(e.target.value))}
                options={shops.map((s) => ({ value: String(s.id), label: s.address ? `${s.name}, ${s.address}` : s.name }))}
              />
              <div />
              <Select
                label="Day"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                options={dates.map((d) => ({ value: d, label: d === businessDate() ? `Today, ${formatWeekday(d)}` : formatWeekday(d) }))}
                hint={dates.length === 0 ? 'This shop has no pickup times left. Try another shop.' : undefined}
              />
              <Select label="Time" value={time} onChange={(e) => setTime(e.target.value)} options={slots.map((s) => ({ value: s, label: slotLabel(s) }))} />
              <TextField className="shop-cart-line__note" label="Note for the shop (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} hint="Name on the box, allergies, anything we should know." />
            </div>
          </Card>
        </div>

        <Card title="Order summary">
          <dl className="shop-sum">
            <div>
              <dt>Items</dt>
              <dd>{formatNumber(cart.count)}</dd>
            </div>
            <div>
              <dt>Subtotal</dt>
              <dd>{formatMoney(totals.subtotal)}</dd>
            </div>
            <div>
              <dt>Estimated tax ({formatPct(shop?.tax_rate ?? 0, 2)})</dt>
              <dd>{formatMoney(totals.tax)}</dd>
            </div>
            <div className="is-total">
              <dt>Estimated total</dt>
              <dd className="text-h2">{formatMoney(totals.total)}</dd>
            </div>
          </dl>
          <p className="text-body-sm gz-muted" style={{ marginBottom: 0 }}>
            Prices are set by the shop when you order. Tax and payment are handled at pickup.
          </p>
        </Card>
      </form>
    </>
  );
}

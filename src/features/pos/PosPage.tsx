import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Select, Skeleton, Tabs, TextField, useToast } from '@/components';
import { Icon } from '@/components/Icon';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { useSelectedLocation } from '@/hooks/useLocations';
import { formatMoney, formatNumber, formatPct } from '@/lib/format';
import { rpc, rpcErrorMessage } from '@/lib/rpc';
import type { OrderDiscount, Payment, StockCondition } from '@/types/domain';
import { invalidateSelling, stockFor, useAvailability, useCustomerOptions, useSellableItems, useSellSettings, type SellableItem } from './api';
import { computeTotals, splitMessage, toNumber, unitPriceFor } from './calc';
import { CustomerPicker } from './CustomerPicker';
import { PaymentDialog } from './PaymentDialog';
import { QtyStepper } from './QtyStepper';
import './pos.css';

// The camera scanner pulls in the barcode decoder, so it only loads when someone opens it.
const CameraScanner = lazy(() => import('@/components/CameraScanner').then((m) => ({ default: m.CameraScanner })));

interface CartLine {
  key: string;
  item: SellableItem;
  condition: StockCondition;
  qty: number;
  discountPct: number;
}

const lineKey = (itemId: number, condition: StockCondition) => `${itemId}:${condition}`;
const OTHER = 'Other';

export default function PosPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { location, locationId, loading: locationLoading } = useSelectedLocation();
  const itemsQ = useSellableItems();
  const availQ = useAvailability(locationId);
  const settingsQ = useSellSettings();
  useCustomerOptions(); // warm the picker

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [discType, setDiscType] = useState<'pct' | 'amount'>('pct');
  const [discValue, setDiscValue] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoaded, setCameraLoaded] = useState(false);
  const [announce, setAnnounce] = useState('');

  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  const avail = availQ.data;
  const markdown = settingsQ.data?.day_old_markdown_pct ?? 0.5;
  const taxRate = Number(location?.tax_rate ?? settingsQ.data?.default_tax_rate ?? 0);
  const isShop = location?.kind === 'shop';

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) counts.set(i.category ?? OTHER, (counts.get(i.category ?? OTHER) ?? 0) + 1);
    return [{ value: 'all', label: 'All items', count: items.length }, ...[...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([c, n]) => ({ value: c, label: c, count: n }))];
  }, [items]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        (category === 'all' || (i.category ?? OTHER) === category) &&
        (!q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || (i.barcode ?? '').toLowerCase().includes(q)),
    );
  }, [items, search, category]);

  const orderDiscount: OrderDiscount | null = toNumber(discValue) > 0 ? { type: discType, value: toNumber(discValue) } : null;
  const totals = useMemo(
    () =>
      computeTotals(
        lines.map((l) => ({ qty: l.qty, unitPrice: unitPriceFor(l.item.list_price, l.condition, markdown), discountPct: l.discountPct })),
        orderDiscount,
        taxRate,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, markdown, discType, discValue, taxRate],
  );

  const addItem = useCallback(
    (item: SellableItem, preferred?: StockCondition) => {
      const av = avail?.get(item.id);
      let condition: StockCondition = preferred ?? 'fresh';
      if (!preferred && item.item_type === 'finished' && av && Number(av.on_hand_fresh) <= 0 && Number(av.on_hand_day_old) > 0) condition = 'day_old';
      if (item.item_type !== 'finished') condition = 'fresh';
      const key = lineKey(item.id, condition);
      setLines((cur) => {
        const found = cur.find((l) => l.key === key);
        if (found) return cur.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
        return [...cur, { key, item, condition, qty: 1, discountPct: 0 }];
      });
      setAnnounce(`${item.name} added`);
    },
    [avail],
  );

  const handleScan = useCallback(
    (raw: string) => {
      const code = raw.trim().toLowerCase();
      const item = items.find((i) => i.barcode?.toLowerCase() === code || i.sku.toLowerCase() === code);
      if (!item) {
        toast.warning(`No item found for ${raw.trim()}`, 'Check the label, or search for the item by name.');
        return;
      }
      setSearch('');
      addItem(item);
    },
    [items, addItem, toast],
  );

  useBarcodeScanner({ onScan: handleScan, enabled: isShop && !payOpen && !cameraOpen });

  function patch(key: string, change: Partial<CartLine>) {
    setLines((cur) =>
      cur.flatMap((l) => {
        if (l.key !== key) return [l];
        const next = { ...l, ...change };
        // Switching fresh/day-old can merge into a line that already exists.
        return [{ ...next, key: lineKey(next.item.id, next.condition) }];
      }),
    );
  }
  function setCondition(key: string, condition: StockCondition) {
    setLines((cur) => {
      const line = cur.find((l) => l.key === key);
      if (!line || line.condition === condition) return cur;
      const newKey = lineKey(line.item.id, condition);
      const other = cur.find((l) => l.key === newKey);
      if (other) return cur.filter((l) => l.key !== key).map((l) => (l.key === newKey ? { ...l, qty: l.qty + line.qty } : l));
      return cur.map((l) => (l.key === key ? { ...l, condition, key: newKey } : l));
    });
  }
  const remove = (key: string) => setLines((cur) => cur.filter((l) => l.key !== key));

  function clearSale() {
    setLines([]);
    setCustomerId(null);
    setDiscValue('');
    setDiscType('pct');
    sale.reset();
  }

  const sale = useMutation({
    mutationFn: (payment: Payment) =>
      rpc.completeSale({
        location_id: locationId as number,
        lines: lines.map((l) => ({
          item_id: l.item.id,
          qty: l.qty,
          condition: l.condition,
          ...(l.discountPct > 0 ? { discount_pct: l.discountPct } : {}),
        })),
        order_discount: orderDiscount,
        payment,
        customer_id: customerId,
      }),
    onSuccess: (res) => {
      invalidateSelling(qc);
      toast.success('Sale completed', `${res.receipt_no} for ${formatMoney(res.total)}`);
      setLines([]);
      setCustomerId(null);
      setDiscValue('');
      setPayOpen(false);
      navigate(`/pos/receipt/${res.sale_id}`);
    },
  });

  const saleError = sale.isError ? rpcErrorMessage(sale.error) : null;
  const errorAlert = saleError ? (
    <Alert tone="danger" title="Could not complete the sale">
      {splitMessage(saleError).length > 1 ? (
        <ul className="sell-list">
          {splitMessage(saleError).map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : (
        saleError
      )}
      <div className="text-body-sm">Lower the quantity or remove the item, then charge again.</div>
    </Alert>
  ) : null;

  const unitCount = lines.reduce((s, l) => s + l.qty, 0);

  if (locationLoading || itemsQ.isLoading) {
    return (
      <>
        <PageHeader title="Point of sale" breadcrumb={[{ label: 'Sell' }, { label: 'Point of sale' }]} />
        <div className="pos">
          <div className="pos-grid">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} variant="block" />
            ))}
          </div>
          <Skeleton variant="block" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Point of sale"
        breadcrumb={[{ label: 'Sell' }, { label: 'Point of sale' }]}
        subtitle={location ? `Ringing up at ${location.name}. Scan an item or tap a tile.` : undefined}
        actions={
          <Button icon="undo" onClick={() => navigate('/returns')}>
            Start a return
          </Button>
        }
      />
      <div className="gz-sr-only" role="status" aria-live="polite">
        {announce}
      </div>

      {!isShop && (
        <Alert tone="warning" title="Choose a shop to sell">
          {location?.name ?? 'This location'} is a kitchen, and sales are rung up at shops. Switch to a shop in the location menu at the top of the page.
        </Alert>
      )}
      {itemsQ.isError && (
        <Alert tone="danger" title="Could not load the items" action={<Button size="sm" onClick={() => void itemsQ.refetch()}>Try again</Button>}>
          {rpcErrorMessage(itemsQ.error)}
        </Alert>
      )}

      <div className="pos" style={{ marginTop: isShop ? 0 : 'var(--space-4)' }}>
        <section className="pos-main" aria-label="Items">
          <div className="pos-find">
            <TextField
              label="Search or scan"
              icon="search"
              placeholder="Name, SKU or barcode"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-scan-target
              autoComplete="off"
              disabled={!isShop}
            />
            <Button
              size="lg"
              icon="camera"
              disabled={!isShop}
              onClick={() => {
                setCameraLoaded(true);
                setCameraOpen(true);
              }}
            >
              Scan with camera
            </Button>
          </div>
          <div className="pos-cats">
            <Tabs aria-label="Category" items={categories} value={category} onChange={setCategory} />
          </div>

          {shown.length === 0 ? (
            <EmptyState
              icon="search"
              title={items.length === 0 ? 'No items to sell yet' : 'No items match that'}
              description={items.length === 0 ? 'Mark items as sellable in Items, then they show up here.' : 'Try a different word or category.'}
              action={
                items.length > 0 ? (
                  <Button
                    onClick={() => {
                      setSearch('');
                      setCategory('all');
                    }}
                  >
                    Show all items
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="pos-grid">
              {shown.map((item) => {
                const av = avail?.get(item.id);
                const fresh = stockFor(av, item, 'fresh');
                const dayOld = item.item_type === 'finished' ? stockFor(av, item, 'day_old') : 0;
                const out = availQ.isSuccess && fresh + dayOld <= 0;
                const inCart = lines.filter((l) => l.item.id === item.id).reduce((s, l) => s + l.qty, 0);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="pos-tile"
                    disabled={!isShop || out}
                    onClick={() => addItem(item)}
                    aria-label={`Add ${item.name}, ${formatMoney(item.list_price)}${out ? ', sold out' : ''}`}
                  >
                    <span className="pos-tile__name text-body-strong">{item.name}</span>
                    <span className="pos-tile__meta gz-mono text-caption">{item.sku}</span>
                    <span className="pos-tile__foot">
                      <span className="pos-tile__price text-h3">{formatMoney(item.list_price)}</span>
                      {inCart > 0 ? (
                        <Badge tone="accent" dot={false}>
                          {formatNumber(inCart)} in cart
                        </Badge>
                      ) : !availQ.isSuccess ? null : out ? (
                        <Badge tone="danger">Sold out</Badge>
                      ) : (
                        <span className={fresh > 0 && fresh <= 6 ? 'pos-tile__stock is-low text-caption' : 'pos-tile__stock gz-muted text-caption'}>
                          {formatNumber(fresh > 0 ? fresh : dayOld)}
                          {fresh > 0 ? ' left' : ' day-old'}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="pos-cart" aria-label="Current sale">
          <Card
            title="Current sale"
            subtitle={unitCount > 0 ? `${formatNumber(unitCount)} ${unitCount === 1 ? 'item' : 'items'}` : undefined}
            actions={
              lines.length > 0 ? (
                <Button size="sm" variant="ghost" icon="trash" onClick={clearSale}>
                  Clear
                </Button>
              ) : undefined
            }
          >
            <CustomerPicker value={customerId} onChange={setCustomerId} />

            {lines.length === 0 ? (
              <p className="pos-empty text-body">Nothing in the sale yet. Tap an item or scan a barcode to start.</p>
            ) : (
              <ul className="pos-lines">
                {lines.map((l, idx) => {
                  const unit = unitPriceFor(l.item.list_price, l.condition, markdown);
                  const stock = stockFor(avail?.get(l.item.id), l.item, l.condition);
                  const amounts = totals.lines[idx];
                  return (
                    <li key={l.key} className="pos-line">
                      <div className="pos-line__top">
                        <div>
                          <div className="pos-line__name">{l.item.name}</div>
                          <div className="pos-line__price text-body-sm">
                            {formatMoney(unit)} each{l.condition === 'day_old' ? `, day-old (${formatPct(markdown, 0)} off)` : ''}
                          </div>
                        </div>
                        <div className="gz-row" style={{ flexWrap: 'nowrap', gap: 'var(--space-1)' }}>
                          <div className="pos-line__total">{formatMoney(amounts?.net ?? 0)}</div>
                          <Button size="sm" variant="ghost" icon="x" aria-label={`Remove ${l.item.name}`} onClick={() => remove(l.key)} />
                        </div>
                      </div>
                      <div className="pos-line__ctrl">
                        <QtyStepper size="lg" label={`Quantity of ${l.item.name}`} value={l.qty} onChange={(n) => patch(l.key, { qty: n })} />
                        <TextField
                          className="pos-line__disc"
                          label="Discount %"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={100}
                          step="any"
                          value={l.discountPct === 0 ? '' : String(l.discountPct)}
                          placeholder="0"
                          onChange={(e) => patch(l.key, { discountPct: Math.min(100, Math.max(0, toNumber(e.target.value))) })}
                        />
                      </div>
                      {l.item.item_type === 'finished' && (
                        <Tabs
                          aria-label={`Freshness of ${l.item.name}`}
                          items={[
                            { value: 'fresh', label: 'Fresh' },
                            { value: 'day_old', label: 'Day-old' },
                          ]}
                          value={l.condition}
                          onChange={(v) => setCondition(l.key, v as StockCondition)}
                        />
                      )}
                      {availQ.isSuccess && l.qty > stock && (
                        <span className="pos-warn text-body-sm">
                          <Icon name="alert" size={16} />
                          Only {formatNumber(stock)} {l.condition === 'day_old' ? 'day-old ' : ''}in stock here
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="pos-disc">
              <Select
                label="Order discount"
                value={discType}
                onChange={(e) => setDiscType(e.target.value as 'pct' | 'amount')}
                options={[
                  { value: 'pct', label: 'Percent (%)' },
                  { value: 'amount', label: 'Amount ($)' },
                ]}
              />
              <TextField
                label={discType === 'pct' ? 'Percent off' : 'Dollars off'}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                placeholder="0"
                value={discValue}
                onChange={(e) => setDiscValue(e.target.value)}
              />
            </div>

            <dl className="pos-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatMoney(totals.subtotal)}</dd>
              </div>
              {totals.discountTotal > 0 && (
                <div>
                  <dt>Discounts</dt>
                  <dd>{formatMoney(-totals.discountTotal)}</dd>
                </div>
              )}
              <div>
                <dt>Tax ({formatPct(taxRate, 2)})</dt>
                <dd>{formatMoney(totals.tax)}</dd>
              </div>
              <div className="is-total">
                <dt>Total</dt>
                <dd className="text-h1">{formatMoney(totals.total)}</dd>
              </div>
            </dl>

            {errorAlert && !payOpen && errorAlert}
            <Button
              variant="primary"
              size="lg"
              className="pos-charge"
              disabled={!isShop || lines.length === 0}
              onClick={() => {
                sale.reset();
                setPayOpen(true);
              }}
            >
              {lines.length === 0 ? 'Charge' : `Charge ${formatMoney(totals.total)}`}
            </Button>
          </Card>
        </aside>
      </div>

      <PaymentDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Take payment"
        total={totals.total}
        busy={sale.isPending}
        error={errorAlert}
        confirmLabel="Complete sale"
        onConfirm={(payment) => sale.mutate(payment)}
      />

      {cameraLoaded && (
        <Suspense fallback={null}>
          <CameraScanner
            open={cameraOpen}
            onClose={() => setCameraOpen(false)}
            onScan={(code) => handleScan(code)}
            title="Scan an item"
            continuous={false}
          />
        </Suspense>
      )}
    </>
  );
}

import { shopPath } from '@/lib/businessContext';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Select, Skeleton, Tabs, TextField } from '@/components';
import { QtyStepper } from '@/features/pos/QtyStepper';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { rpcErrorMessage } from '@/lib/rpc';
import type { CatalogRow } from '@/types/domain';
import { groupCatalog, useCatalog, type CatalogItem } from './api';
import { useCart } from './cartStore';
import './portal.css';

const OTHER = 'Other';

function Availability({ row, shopName }: { row: CatalogRow | undefined; shopName?: string }) {
  if (!row) return null;
  const inStock = row.in_stock && row.available_qty > 0;
  return (
    <li>
      <span className="text-body-sm">{shopName ?? row.location_name}</span>
      {inStock ? (
        <Badge tone="success">{formatNumber(row.available_qty)} available</Badge>
      ) : (
        <span className="gz-row" style={{ gap: 'var(--space-2)', flexWrap: 'nowrap' }}>
          <Badge tone="warning">Sold out</Badge>
          <span className="text-caption gz-muted">estimated restock {formatDate(row.est_available_date)}</span>
        </span>
      )}
    </li>
  );
}

export default function PortalHomePage() {
  const navigate = useNavigate();
  const catalogQ = useCatalog();
  const cart = useCart();
  const [shop, setShop] = useState('');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const items = useMemo(() => groupCatalog(catalogQ.data ?? []), [catalogQ.data]);
  const shops = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of catalogQ.data ?? []) m.set(r.location_id, r.location_name);
    return [...m.entries()].sort(([a], [b]) => a - b);
  }, [catalogQ.data]);
  const shopId = shop ? Number(shop) : null;

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) counts.set(i.category ?? OTHER, (counts.get(i.category ?? OTHER) ?? 0) + 1);
    return [{ value: 'all', label: 'Everything', count: items.length }, ...[...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([c, n]) => ({ value: c, label: c, count: n }))];
  }, [items]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => (category === 'all' || (i.category ?? OTHER) === category) && (!q || i.name.toLowerCase().includes(q)) && (shopId === null || i.byShop.has(shopId)));
  }, [items, category, search, shopId]);

  const byId = useMemo(() => new Map(items.map((i) => [i.item_id, i])), [items]);
  const subtotal = cart.lines.reduce((s, l) => s + (byId.get(l.item_id)?.list_price ?? 0) * l.qty, 0);

  function pickup(item: CatalogItem) {
    cart.add(item.item_id);
    if (shopId !== null) cart.setLocation(shopId);
  }

  return (
    <>
      <PageHeader title="Shop" subtitle="Fresh donuts, baked every morning. Pick a shop to see what is ready, then choose a pickup time." />

      {catalogQ.isError && (
        <Alert tone="danger" title="Could not load the menu" action={<Button size="sm" onClick={() => void catalogQ.refetch()}>Try again</Button>}>
          {rpcErrorMessage(catalogQ.error)}
        </Alert>
      )}

      <div className="shop-filters">
        <Select
          label="Shop"
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          options={[{ value: '', label: 'All shops' }, ...shops.map(([id, name]) => ({ value: String(id), label: name }))]}
        />
        <TextField label="Search" icon="search" placeholder="Glazed, maple, cake" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
      </div>
      <div className="shop-cats">
        <Tabs aria-label="Category" items={categories} value={category} onChange={setCategory} />
      </div>

      {catalogQ.isLoading ? (
        <div className="shop-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} variant="block" />
          ))}
        </div>
      ) : catalogQ.isError ? null : shown.length === 0 ? (
        <EmptyState
          icon="store"
          title={items.length === 0 ? 'Online ordering is not available yet' : 'Nothing matches that'}
          description={items.length === 0 ? 'There are no menu items available for pickup. Check back after the business adds its menu and pickup shops.' : 'Try another word, category or shop.'}
          action={
            items.length > 0 ? (
              <Button
                onClick={() => {
                  setSearch('');
                  setCategory('all');
                  setShop('');
                }}
              >
                Show everything
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="shop-grid">
          {shown.map((item) => {
            const inCart = cart.lines.find((l) => l.item_id === item.item_id)?.qty ?? 0;
            const rows = shopId === null ? [...item.byShop.values()].sort((a, b) => a.location_id - b.location_id) : [item.byShop.get(shopId)];
            return (
              <Card key={item.item_id} className="shop-card">
                <div className="shop-card__top">
                  <div>
                    <h2 className="shop-card__name text-h3">{item.name}</h2>
                    {item.category && <span className="text-body-sm gz-muted">{item.category}</span>}
                  </div>
                  <span className="shop-card__price text-h3">{formatMoney(item.list_price)}</span>
                </div>
                <ul className="shop-avail" aria-label={`Availability of ${item.name}`}>
                  {rows.map((r) => (
                    <Availability key={r?.location_id ?? 0} row={r} />
                  ))}
                </ul>
                <div className="shop-card__foot">
                  {inCart > 0 ? (
                    <>
                      <QtyStepper min={0} max={500} label={`Quantity of ${item.name} in your cart`} value={inCart} onChange={(n) => cart.setQty(item.item_id, n)} />
                      <span className="text-body-sm gz-muted">in your cart</span>
                    </>
                  ) : (
                    <Button icon="plus" disabled={catalogQ.isError} onClick={() => pickup(item)} aria-label={`Add ${item.name} to cart`}>
                      Add to cart
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {cart.count > 0 && (
        <div className="shop-bar" role="region" aria-label="Your cart">
          <span className="text-body-strong">
            {formatNumber(cart.count)} {cart.count === 1 ? 'item' : 'items'} in your cart · {formatMoney(subtotal)}
          </span>
          <Button variant="primary" iconRight="chevronRight" onClick={() => navigate(shopPath('/cart'))}>
            View cart
          </Button>
        </div>
      )}
    </>
  );
}

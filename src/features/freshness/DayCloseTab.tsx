import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, MoneyCell, QtyCell, Select, Skeleton, StatCard, useToast, type DataTableColumn } from '@/components';
import { invalidateMake } from '@/features/production/api';
import { useLocations } from '@/hooks/useLocations';
import { useRole } from '@/hooks/useRole';
import { businessDate, formatDate, formatMoney, formatNumber, formatTime } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { rpc, rpcErrorMessage } from '@/lib/rpc';
import { canCall, type CloseBusinessDayResult } from '@/types/domain';
import { getDayCloses, getFreshStock, getMarkdownPct, type FreshStockRow } from './api';

interface ShopTotals { location_id: number; name: string; fresh: number; dayOld: number; dayOldValue: number; freshValue: number }
type StockRow = FreshStockRow & { rowId: string; dayOldValue: number };

export function DayCloseTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { role } = useRole();
  const { data: locations = [] } = useLocations();
  const shops = locations.filter((l) => l.kind === 'shop');
  const today = businessDate();
  const mayClose = canCall(role, 'close_business_day');

  const stockQ = useQuery({ queryKey: queryKeys.freshness.scope('stock'), queryFn: getFreshStock });
  const closesQ = useQuery({ queryKey: queryKeys.freshness.scope('closes'), queryFn: getDayCloses });
  const markdownQ = useQuery({ queryKey: queryKeys.settings.scope('make-markdown'), staleTime: 60_000, queryFn: getMarkdownPct });

  const [shopFilter, setShopFilter] = useState('all');
  const [confirm, setConfirm] = useState<number | 'all' | null>(null);
  const [results, setResults] = useState<Array<CloseBusinessDayResult & { shop: string }>>([]);

  const shopIds = new Set(shops.map((s) => s.id));
  const stock: StockRow[] = useMemo(
    () => (stockQ.data ?? []).filter((r) => shopIds.has(r.location_id) && (Number(r.qty_fresh) > 0 || Number(r.qty_day_old) > 0))
      .map((r) => ({ ...r, rowId: `${r.item_id}-${r.location_id}`, dayOldValue: Number(r.qty_day_old) * Number(r.avg_cost ?? 0) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stockQ.data, locations],
  );

  const totals: ShopTotals[] = shops.map((s) => {
    const rows = stock.filter((r) => r.location_id === s.id);
    return {
      location_id: s.id, name: s.name,
      fresh: rows.reduce((t, r) => t + Number(r.qty_fresh), 0),
      dayOld: rows.reduce((t, r) => t + Number(r.qty_day_old), 0),
      dayOldValue: rows.reduce((t, r) => t + r.dayOldValue, 0),
      freshValue: rows.reduce((t, r) => t + Number(r.qty_fresh) * Number(r.avg_cost ?? 0), 0),
    };
  });
  const closedToday = new Set((closesQ.data ?? []).filter((c) => c.business_date === today).map((c) => c.location_id));
  const lastClose = (id: number) => (closesQ.data ?? []).find((c) => c.location_id === id);

  const close = useMutation({
    mutationFn: async (target: number | 'all') => {
      const ids = target === 'all' ? shops.map((s) => s.id) : [target];
      const out: Array<CloseBusinessDayResult & { shop: string }> = [];
      for (const id of ids) {
        const res = await rpc.closeBusinessDay({ location: id });
        out.push({ ...res, shop: shops.find((s) => s.id === id)?.name ?? `Location ${id}` });
      }
      return out;
    },
    onSuccess: (res) => {
      setResults(res);
      invalidateMake(qc);
      const expired = res.reduce((s, r) => s + Number(r.expired_value), 0);
      toast.success('Day closed', `${formatMoney(expired)} of day-old stock written off. Fresh stock is now day-old.`);
    },
    onError: (e) => toast.error('Could not close the day', rpcErrorMessage(e)),
  });

  const visible = stock.filter((r) => shopFilter === 'all' || String(r.location_id) === shopFilter);
  const columns: DataTableColumn<StockRow>[] = [
    { key: 'name', header: 'Item', sortable: true, render: (r) => <div><div>{r.name}</div><div className="gz-mono gz-muted text-caption">{r.sku}</div></div> },
    { key: 'location_name', header: 'Shop', sortable: true },
    { key: 'qty_fresh', header: 'Fresh', align: 'right', sortable: true, render: (r) => <QtyCell qty={r.qty_fresh} uom="each" /> },
    { key: 'qty_day_old', header: 'Day-old', align: 'right', sortable: true, render: (r) => <QtyCell qty={r.qty_day_old} uom="each" /> },
    { key: 'dayOldValue', header: 'Day-old value', align: 'right', sortable: true, render: (r) => <MoneyCell value={r.dayOldValue} /> },
  ];

  const totalFresh = totals.reduce((s, t) => s + t.fresh, 0);
  const totalDayOld = totals.reduce((s, t) => s + t.dayOld, 0);
  const totalAtRisk = totals.reduce((s, t) => s + t.dayOldValue, 0);
  const pendingTotals = confirm === 'all' ? totals : totals.filter((t) => t.location_id === confirm);
  const pendingExpire = pendingTotals.reduce((s, t) => s + t.dayOldValue, 0);
  const pendingDayOld = pendingTotals.reduce((s, t) => s + t.dayOld, 0);
  const pendingFresh = pendingTotals.reduce((s, t) => s + t.fresh, 0);
  const markdown = markdownQ.data;

  return (
    <div className="gz-stack">
      <div className="gz-row" style={{ justifyContent: 'space-between' }}>
        <p className="text-body gz-muted" style={{ margin: 0, maxWidth: '60ch' }}>
          Closing the day writes off yesterday&apos;s day-old stock as expired waste, then turns today&apos;s fresh stock into day-old at the same cost.
          {markdown !== undefined && <> Day-old donuts sell at {formatNumber(markdown * 100, 0)}% off list price.</>}
        </p>
        {mayClose ? (
          <Button variant="primary" size="lg" icon="moon" disabled={close.isPending || shops.length === 0} onClick={() => setConfirm('all')}>
            Close day for all shops
          </Button>
        ) : (
          <Badge tone="neutral">Counter staff and managers close the day</Badge>
        )}
      </div>

      <div className="gz-grid-stats">
        <StatCard label="Fresh on hand" icon="sun" tint="mint" value={`${formatNumber(totalFresh / 12, 1)} dozen`} caption="Becomes day-old tonight" />
        <StatCard label="Day-old on hand" icon="clock" tint="butter" value={`${formatNumber(totalDayOld / 12, 1)} dozen`} caption="Expires at close if unsold" />
        <StatCard label="Waste at risk" icon="alert" tint="pink" value={formatMoney(totalAtRisk)} caption="Cost of day-old stock that would expire" />
        <StatCard label="Shops closed today" icon="checkCircle" tint="lilac" value={`${closedToday.size} of ${shops.length}`} caption={formatDate(today)} />
      </div>

      {stockQ.isLoading ? (
        <div className="gz-grid-stats"><Skeleton variant="block" /><Skeleton variant="block" /><Skeleton variant="block" /></div>
      ) : (
        <div className="gz-grid-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(calc(var(--space-12) * 5), 1fr))' }}>
          {totals.map((t) => {
            const last = lastClose(t.location_id);
            const done = closedToday.has(t.location_id);
            return (
              <Card key={t.location_id} title={t.name} actions={done ? <Badge tone="success">Closed today</Badge> : <Badge tone="info">Open</Badge>}>
                <div className="gz-stack gz-stack--sm">
                  <div className="gz-row" style={{ justifyContent: 'space-between' }}>
                    <span className="gz-muted">Fresh</span><strong className="gz-num">{formatNumber(t.fresh / 12, 1)} dozen</strong>
                  </div>
                  <div className="gz-row" style={{ justifyContent: 'space-between' }}>
                    <span className="gz-muted">Day-old</span><strong className="gz-num">{formatNumber(t.dayOld / 12, 1)} dozen</strong>
                  </div>
                  <div className="gz-row" style={{ justifyContent: 'space-between' }}>
                    <span className="gz-muted">To expire at close</span><span className="gz-num">{formatMoney(t.dayOldValue)}</span>
                  </div>
                  <p className="text-body-sm gz-muted" style={{ margin: 0 }}>
                    {last ? `Last closed ${formatDate(last.business_date)} at ${formatTime(last.closed_at)}.` : 'Never closed.'}
                  </p>
                  {mayClose && (
                    <Button size="lg" icon="moon" disabled={close.isPending} onClick={() => setConfirm(t.location_id)}>
                      {done ? 'Check close' : 'Close day'}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {results.length > 0 && (
        <Card title="Result of the last close" subtitle="Each shop closes once a day. Closing again returns the first result.">
          <DataTable
            columns={[
              { key: 'shop', header: 'Shop' },
              { key: 'business_date', header: 'Business day', render: (r: (typeof results)[number]) => formatDate(r.business_date) },
              { key: 'expired_qty', header: 'Expired (waste)', align: 'right', render: (r: (typeof results)[number]) => <QtyCell qty={r.expired_qty} uom="each" /> },
              { key: 'expired_value', header: 'Waste cost', align: 'right', render: (r: (typeof results)[number]) => <MoneyCell value={r.expired_value} strong /> },
              { key: 'reclassified_qty', header: 'Now day-old', align: 'right', render: (r: (typeof results)[number]) => <QtyCell qty={r.reclassified_qty} uom="each" /> },
              { key: 'already_closed', header: 'Status', render: (r: (typeof results)[number]) => (r.already_closed ? <Badge tone="neutral">Already closed</Badge> : <Badge tone="success">Closed</Badge>) },
            ]}
            rows={results}
            rowKey="day_close_id"
            density="compact"
            aria-label="Day close results"
          />
        </Card>
      )}

      <Card
        title="Stock by condition"
        subtitle="Finished donuts at the shops."
        actions={<Select aria-label="Filter by shop" value={shopFilter} onChange={(e) => setShopFilter(e.target.value)} options={[{ value: 'all', label: 'All shops' }, ...shops.map((s) => ({ value: String(s.id), label: s.name }))]} />}
        padded={false}
      >
        <DataTable
          columns={columns}
          rows={visible}
          rowKey="rowId"
          loading={stockQ.isLoading}
          scroll
          density="compact"
          defaultSort={{ key: 'qty_day_old', dir: 'desc' }}
          aria-label="Stock by condition"
          empty={<EmptyState icon="leaf" title="No finished donuts on hand" description="Release a bake plan or complete a production order to stock the shops." />}
        />
      </Card>

      {stockQ.error && <Alert tone="danger" title="Could not load stock">{rpcErrorMessage(stockQ.error)}</Alert>}

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'all' ? 'Close the day for all shops?' : `Close the day at ${pendingTotals[0]?.name ?? 'this shop'}?`}
        confirmLabel="Close day"
        cancelLabel="Not yet"
        onConfirm={async () => {
          if (confirm !== null) await close.mutateAsync(confirm).catch(() => undefined);
        }}
      >
        <div className="gz-stack gz-stack--sm">
          <p>
            {formatNumber(pendingDayOld / 12, 1)} dozen of day-old stock ({formatMoney(pendingExpire)}) will be written off as expired waste.
          </p>
          <p>{formatNumber(pendingFresh / 12, 1)} dozen of fresh stock will become day-old at the same cost. You cannot undo a close.</p>
        </div>
      </ConfirmDialog>
    </div>
  );
}

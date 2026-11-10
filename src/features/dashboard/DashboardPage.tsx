import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert } from '@/components/Alert';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { axisProps, chartColor, ChartTooltip, gridProps } from '@/components/charts';
import { ChartCard } from '@/components/ChartCard';
import { EmptyState } from '@/components/EmptyState';
import { Icon, type IconName } from '@/components/Icon';
import { PageHeader } from '@/components/PageHeader';
import { SkeletonLines } from '@/components/Skeleton';
import { StatCard, type StatCardProps } from '@/components/StatCard';
import { useApBills } from '@/features/finance/api';
import { useItemAvailability, useReorderAnalysis } from '@/features/reports/api';
import '@/features/reports/insights.css';
import { useAuth } from '@/hooks/useAuth';
import { useSelectedLocation } from '@/hooks/useLocations';
import { businessDate, businessNowParts, daysBetween, formatDate, formatItemQty, formatMoney, formatNumber, formatPct, formatRelative, initials, sentenceCase } from '@/lib/format';
import { rpcErrorMessage } from '@/lib/rpc';
import {
  useActivityFeed, useInventoryValue, useLatePurchaseOrders, useMarginMtd, useMrpExpedites, useNow, useOnlineNow, useOpenOrders,
  useSalesTrend, useTodaySales, useWasteWeek, useWeekOrders,
} from './api';
import './dashboard.css';

function greeting(hour: number): string {
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

function weekdayName(ymd: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${ymd}T00:00:00Z`));
}

type Delta = Pick<StatCardProps, 'delta' | 'trend'>;

/** Percent change as an arrow and an unsigned figure. */
function pctDelta(cur: number, base: number): Delta {
  if (!base) return {};
  const d = (cur - base) / Math.abs(base);
  return { delta: formatPct(Math.abs(d), 1), trend: d > 0.0005 ? 'up' : d < -0.0005 ? 'down' : 'flat' };
}

const compactMoney = (v: number | string) => formatMoney(Number(v), { compact: true });

export default function DashboardPage() {
  const { user } = useAuth();
  const { shops } = useSelectedLocation();
  const now = useNow();

  const sales = useTodaySales();
  const margin = useMarginMtd();
  const value = useInventoryValue();
  const open = useOpenOrders();
  const week = useWeekOrders();
  const reorder = useReorderAnalysis();
  const waste = useWasteWeek();

  const hour = businessNowParts(now).hour;
  const catering = week.data?.catering ?? 0;
  const lead = week.isLoading
    ? 'here is how the shops are doing'
    : catering > 0
      ? `${formatNumber(catering)} catering ${catering === 1 ? 'order' : 'orders'} this week`
      : week.data && week.data.total > 0
        ? `${formatNumber(week.data.total)} ${week.data.total === 1 ? 'order' : 'orders'} this week`
        : sales.data
          ? `${formatMoney(sales.data.todayNet)} in sales so far today`
          : 'here is how the shops are doing';

  const s = sales.data;
  const salesCmp = s ? (s.lastWeekSoFar > 0 ? s.lastWeekSoFar : s.lastWeekFullDay) : 0;
  const salesCaption = s
    ? salesCmp > 0
      ? `vs ${formatMoney(salesCmp)} ${s.lastWeekSoFar > 0 ? 'by this time' : 'all day'} last ${weekdayName(s.today)}`
      : `no sales last ${weekdayName(s.today)}`
    : undefined;

  const m = margin.data;
  const marginDelta: Delta =
    m && m.margin !== null && m.prevMargin !== null
      ? { delta: `${formatNumber(Math.abs(m.margin - m.prevMargin), 1)} pts`, trend: m.margin - m.prevMargin > 0.05 ? 'up' : m.margin - m.prevMargin < -0.05 ? 'down' : 'flat' }
      : {};

  const v = value.data;
  const valueDelta: Delta = v && v.weekAgo !== null && v.weekAgo !== 0 ? pctDelta(v.value, v.weekAgo) : {};

  const lowCount = (reorder.data ?? []).filter((r) => r.below_rop).length;
  const lateCount = (reorder.data ?? []).filter((r) => r.urgency === 'late').length;

  const w = waste.data;
  const wasteDelta: Delta =
    w && w.pct !== null && w.prevPct !== null
      ? { delta: `${formatNumber(Math.abs(w.pct - w.prevPct), 1)} pts ${w.pct <= w.prevPct ? 'lower' : 'higher'}`, trend: 'flat' }
      : {};

  const stats = [
    { key: 'sales', loading: sales.isLoading, props: { label: 'Sales today', icon: 'receipt', value: formatMoney(s?.todayNet ?? 0), caption: salesCaption, ...(s && salesCmp > 0 ? pctDelta(s.todayNet, salesCmp) : {}) } },
    { key: 'margin', loading: margin.isLoading, props: { label: 'Gross margin, month to date', icon: 'chart', tint: 'mint', value: formatPct(m?.margin, 1, { scale: 'percent' }), caption: m?.prevMargin != null ? `vs ${formatPct(m.prevMargin, 1, { scale: 'percent' })} same days last month` : 'no sales yet this month', ...marginDelta } },
    { key: 'value', loading: value.isLoading, props: { label: 'Inventory value', icon: 'box', tint: 'cocoa', value: formatMoney(v?.value), caption: v?.weekAgo != null ? `vs ${formatMoney(v.weekAgo)} a week ago` : 'GL account 1200', ...valueDelta } },
    { key: 'orders', loading: open.isLoading, props: { label: 'Open orders', icon: 'clipboard', tint: 'lilac', value: formatNumber(open.data?.open ?? 0), delta: open.data ? `${formatNumber(open.data.newThisWeek)} placed this week` : undefined, trend: 'flat', caption: open.data ? `${formatNumber(open.data.dueSoon)} due in 7 days` : undefined } },
    { key: 'low', loading: reorder.isLoading, props: { label: 'Low-stock items', icon: 'alert', tint: 'butter', value: formatNumber(lowCount), delta: lateCount > 0 ? `${formatNumber(lateCount)} already late to order` : 'none late to order', trend: 'flat', caption: 'at or below reorder point' } },
    { key: 'waste', loading: waste.isLoading, props: { label: 'Waste this week', icon: 'leaf', value: formatPct(w?.pct, 1, { scale: 'percent' }), caption: w ? `${formatMoney(w.cost)} of production cost${w.prevPct != null ? `, last week ${formatPct(w.prevPct, 1, { scale: 'percent' })}` : ''}` : undefined, ...wasteDelta } },
  ] as Array<{ key: string; loading: boolean; props: StatCardProps }>;

  const hasError = [sales, margin, value, open, week, reorder, waste].find((q) => q.isError);

  return (
    <>
      <PageHeader title="Dashboard" breadcrumb={[{ label: 'Insights' }, { label: 'Dashboard' }]} />
      <div className="gz-stack">
        <h2 className="text-display ins-greeting">{`${greeting(hour)} — ${lead}`}</h2>
        {hasError && <Alert tone="danger" title="Some figures could not load">{rpcErrorMessage(hasError.error)} They retry on their own every 30 seconds.</Alert>}
        <div className="ins-grid-6">
          {stats.map((c) => (c.loading ? <div key={c.key} className="gz-stat"><SkeletonLines lines={3} /></div> : <StatCard key={c.key} {...c.props} />))}
        </div>
        <div className="ins-split">
          <div className="gz-stack">
            <SalesTrendCard shops={shops.map((x) => ({ id: x.id, name: x.name }))} />
            <NeedsAttention reorderLoading={reorder.isLoading} />
          </div>
          <div className="gz-stack">
            <ActivityCard now={now} />
            <OnlineCard myUserId={user?.id ?? null} />
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ sales trend */

function SalesTrendCard({ shops }: { shops: Array<{ id: number; name: string }> }) {
  const q = useSalesTrend(shops);
  const rows = q.data?.rows ?? [];
  const total = rows.reduce((sum, r) => sum + Number(r.total), 0);
  const names = q.data?.shops.map((x) => x.name) ?? [];
  const columns = [
    { key: 'label', header: 'Day' },
    ...names.map((n) => ({ key: n, header: n, align: 'right' as const, render: (r: Record<string, string | number>) => formatMoney(Number(r[n] ?? 0)) })),
    { key: 'total', header: 'All shops', align: 'right' as const, render: (r: Record<string, string | number>) => formatMoney(Number(r.total)) },
  ];
  return (
    <ChartCard
      title="Net sales, last 30 days"
      subtitle="By shop. Net of discounts and returns, before tax."
      summary={`${formatMoney(total)} across ${names.length} shops`}
      loading={q.isLoading || (shops.length === 0)}
      empty={!q.isLoading && shops.length > 0 && total === 0 ? 'No sales in the last 30 days.' : undefined}
      table={{ columns, rows, rowKey: 'date' }}
    >
      <LineChart data={rows}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...axisProps} tickFormatter={compactMoney} />
        <Tooltip content={<ChartTooltip valueFormatter={(val) => formatMoney(Number(val))} />} />
        <Legend />
        {names.map((n, i) => (
          <Line key={n} type="monotone" dataKey={n} name={n} stroke={chartColor(i)} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ needs attention */

interface AttentionItem {
  id: string;
  badge: string;
  tone: 'danger' | 'warning';
  title: string;
  meta: string;
  to: string;
}

interface AttentionGroup {
  key: string;
  title: string;
  seeAll: string;
  items: AttentionItem[];
  loading: boolean;
}

function NeedsAttention({ reorderLoading }: { reorderLoading: boolean }) {
  const today = businessDate();
  const late = useLatePurchaseOrders();
  const expedites = useMrpExpedites();
  const reorder = useReorderAnalysis();
  const ap = useApBills();
  const avail = useItemAvailability();

  const groups: AttentionGroup[] = useMemo(() => {
    const lowItems = (reorder.data ?? [])
      .filter((r) => r.urgency !== 'ok')
      .sort((a, b) => (a.order_by_date ?? '9999').localeCompare(b.order_by_date ?? '9999'));
    return [
      {
        key: 'po', title: 'Late purchase orders', seeAll: '/purchasing', loading: late.isLoading,
        items: (late.data ?? []).map((r) => ({
          id: `po-${r.id}`, badge: 'Late', tone: 'danger' as const, title: `${r.po_number} from ${r.supplier}`,
          meta: `Expected ${formatDate(r.expected_on)}, ${daysBetween(r.expected_on, today)} days late. ${formatMoney(r.total)}`, to: `/purchasing/${r.id}`,
        })),
      },
      {
        key: 'mrp', title: 'Material planning expedites', seeAll: '/mrp', loading: expedites.isLoading,
        items: (expedites.data ?? []).map((r) => ({
          id: `mrp-${r.item_id}`, badge: 'Expedite', tone: 'danger' as const, title: r.item_name,
          meta: `Needed ${formatDate(r.requirement_date)}; should have been ordered by ${formatDate(r.order_by_date)}. Plan ${formatItemQty(r.planned_order_qty, { uom: r.uom })}`, to: '/mrp',
        })),
      },
      {
        key: 'low', title: 'Low stock', seeAll: '/purchasing/replenish', loading: reorderLoading || reorder.isLoading,
        items: lowItems.map((r) => ({
          id: `low-${r.item_id}`, badge: r.urgency === 'late' ? 'Late' : 'Order now', tone: r.urgency === 'late' ? ('danger' as const) : ('warning' as const), title: r.name,
          meta: `${formatItemQty(r.on_hand, r)} on hand. Order by ${formatDate(r.order_by_date)}${r.suggested_qty > 0 ? `, suggest ${formatItemQty(r.suggested_qty, r)}` : ''}`, to: '/purchasing/replenish',
        })),
      },
      {
        key: 'ap', title: 'Overdue bills', seeAll: '/finance?tab=ap', loading: ap.isLoading,
        items: (ap.data ?? []).filter((b) => b.is_overdue).sort((a, b) => b.days_overdue - a.days_overdue).map((b) => ({
          id: `ap-${b.bill_id}`, badge: 'Overdue', tone: 'danger' as const, title: `${b.supplier_name}${b.po_number ? `, ${b.po_number}` : ''}`,
          meta: `${formatMoney(b.balance)} was due ${formatDate(b.due_date)}, ${b.days_overdue} days overdue`, to: '/finance?tab=ap',
        })),
      },
      {
        key: 'bo', title: 'Backordered sales orders', seeAll: '/orders', loading: avail.isLoading,
        items: (avail.data ?? []).filter((r) => r.backordered > 0).sort((a, b) => b.backordered - a.backordered).map((r) => ({
          id: `bo-${r.item_id}-${r.location_id}`, badge: 'Backordered', tone: 'warning' as const, title: `${r.name} at ${r.location_name}`,
          meta: `${formatItemQty(r.backordered, r)} short for placed orders. Expected ${formatDate(r.est_available_date)}`, to: '/orders',
        })),
      },
    ];
  }, [late.data, late.isLoading, expedites.data, expedites.isLoading, reorder.data, reorder.isLoading, reorderLoading, ap.data, ap.isLoading, avail.data, avail.isLoading, today]);

  const loading = groups.every((g) => g.loading);
  const total = groups.reduce((sum, g) => sum + g.items.length, 0);
  const nonEmpty = groups.filter((g) => g.items.length > 0);

  return (
    <Card title="Needs attention" subtitle="Each item opens the screen where you can fix it." actions={total > 0 ? <Badge tone="warning">{`${total} open`}</Badge> : undefined}>
      {loading ? (
        <SkeletonLines lines={5} />
      ) : nonEmpty.length === 0 ? (
        <EmptyState icon="checkCircle" title="Nothing needs attention" description="No late purchase orders, low stock or overdue bills right now." />
      ) : (
        <div className="gz-stack gz-stack--sm">
          {nonEmpty.map((g) => (
            <section key={g.key} aria-label={g.title}>
              <div className="ins-group-head">
                <h3 className="text-h3">{`${g.title} (${g.items.length})`}</h3>
                {g.items.length > 3 && <Link className="ins-link text-body-sm" to={g.seeAll}>See all</Link>}
              </div>
              <ul className="ins-list">
                {g.items.slice(0, 3).map((it) => (
                  <li key={it.id}>
                    <Badge tone={it.tone}>{it.badge}</Badge>
                    <div className="ins-list__main">
                      <Link className="ins-link text-body-strong" to={it.to}>{it.title}</Link>
                      <div className="text-body-sm ins-list__meta">{it.meta}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ live activity */

function topicIcon(topic: string): IconName {
  const p = topic.split('.')[0];
  switch (p) {
    case 'sale': return 'receipt';
    case 'return': return 'undo';
    case 'so': return 'clipboard';
    case 'po': return 'truck';
    case 'mo': return 'factory';
    case 'transfer': return 'swap';
    case 'inventory': return 'box';
    case 'waste':
    case 'day': return 'leaf';
    case 'forecast':
    case 'bakeplan': return 'trendingUp';
    case 'expense': return 'money';
    case 'settings': return 'settings';
    default: return 'bell';
  }
}

function ActivityCard({ now }: { now: Date }) {
  const q = useActivityFeed(20);
  const { locations } = useSelectedLocation();
  const code = (id: number | null) => (id === null ? null : locations.find((l) => l.id === id)?.code ?? null);
  return (
    <Card title="Live activity" subtitle="Updates as soon as anyone sells, receives or bakes." actions={<Badge tone="success">Live</Badge>}>
      {q.isLoading ? (
        <SkeletonLines lines={6} />
      ) : q.isError ? (
        <Alert tone="danger" title="Could not load activity">{rpcErrorMessage(q.error)} It retries on its own.</Alert>
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState icon="bell" title="Quiet so far" description="Sales, receipts and bakes show up here the moment they happen." />
      ) : (
        <ul className="ins-list" aria-live="polite">
          {(q.data ?? []).map((e) => (
            <li key={e.id}>
              <span className="ins-avatar" aria-hidden="true"><Icon name={topicIcon(e.topic)} size={16} /></span>
              <div className="ins-list__main">
                <div className="ins-list__title text-body">{e.summary || sentenceCase(e.topic.replace('.', ' '))}</div>
                <div className="text-caption ins-list__meta">{code(e.location_id) ? `${code(e.location_id)} · ` : ''}{formatRelative(e.at, now)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ who is online */

function OnlineCard({ myUserId }: { myUserId: string | null }) {
  const users = useOnlineNow(myUserId);
  const { locations } = useSelectedLocation();
  const where = (id: number | null) => (id === null ? null : locations.find((l) => l.id === id)?.name ?? null);
  return (
    <Card title="Who is online" subtitle={users.length ? `${users.length} signed in right now` : undefined}>
      {users.length === 0 ? (
        <p className="text-body-sm ins-note">Only you, or the connection is still starting.</p>
      ) : (
        <ul className="ins-list">
          {users.map((u) => (
            <li key={u.userId}>
              <span className={`ins-avatar${u.isMe ? ' is-me' : ''}`} aria-hidden="true">{initials(u.name)}</span>
              <div className="ins-list__main">
                <div className="text-body-strong">{u.name}{u.isMe ? ' (you)' : ''}</div>
                <div className="text-body-sm ins-list__meta">{sentenceCase(u.role)}{where(u.locationId) ? ` at ${where(u.locationId)}` : ''}</div>
              </div>
              <span className="ins-pulse" role="img" aria-label="Online" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

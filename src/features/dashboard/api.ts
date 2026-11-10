import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { addDays, businessDate, dateRange, formatDate, startOfWeek } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { RpcError, reports, views } from '@/lib/rpc';
import { lastMonthEnd, monthStart } from '@/features/reports/ReportFilters';
import type { OnlineUser } from '@/hooks/usePresence';
import type { AppEvent, SalesSummaryRow } from '@/types/domain';

function fail(source: string, e: { message: string; code?: string }): never {
  throw new RpcError(source, e.message, { code: e.code });
}

/* ------------------------------------------------------------------ sales today vs the same weekday last week */

export interface TodaySales {
  today: string;
  lastWeek: string;
  todayNet: number;
  todayTickets: number;
  /** Last week's same weekday, only the sales up to this time of day. */
  lastWeekSoFar: number;
  lastWeekFullDay: number;
}

/**
 * Net of discounts, before tax. Compares today so far with the same weekday last week up to the same time, so a
 * half-finished day is not set against a whole one.
 */
export function useTodaySales() {
  return useQuery({
    queryKey: queryKeys.sales.scope('dash-today'),
    queryFn: async (): Promise<TodaySales> => {
      const today = businessDate();
      const lastWeek = addDays(today, -7);
      const { data, error } = await supabase
        .from('sales')
        .select('business_date, sold_at, subtotal, discount_total, ticket_count')
        .in('business_date', [today, lastWeek]);
      if (error) fail('sales', error);
      const cutoff = Date.now() - 7 * 86_400_000;
      const out: TodaySales = { today, lastWeek, todayNet: 0, todayTickets: 0, lastWeekSoFar: 0, lastWeekFullDay: 0 };
      for (const r of (data ?? []) as Array<{ business_date: string; sold_at: string; subtotal: number; discount_total: number; ticket_count: number }>) {
        const net = Number(r.subtotal) - Number(r.discount_total);
        if (r.business_date === today) {
          out.todayNet += net;
          out.todayTickets += Number(r.ticket_count);
        } else {
          out.lastWeekFullDay += net;
          if (new Date(r.sold_at).getTime() <= cutoff) out.lastWeekSoFar += net;
        }
      }
      return out;
    },
  });
}

/* ------------------------------------------------------------------ gross margin month to date */

export function useMarginMtd() {
  return useQuery({
    queryKey: queryKeys.finance.scope('dash-margin'),
    queryFn: async () => {
      const today = businessDate();
      const from = monthStart(today);
      const prevEnd = lastMonthEnd(today);
      const prevFrom = monthStart(prevEnd);
      const prevTo = [addDays(prevFrom, Number(today.slice(8)) - 1), prevEnd].sort()[0]!;
      const [cur, prev] = await Promise.all([reports.pnl({ from, to: today }), reports.pnl({ from: prevFrom, to: prevTo })]);
      const pick = (lines: typeof cur, key: string) => lines.find((l) => l.line_key === key)?.amount ?? null;
      return {
        margin: pick(cur, 'gross_margin_pct'),
        prevMargin: pick(prev, 'gross_margin_pct'),
        netSales: pick(cur, 'net_sales'),
      };
    },
  });
}

/* ------------------------------------------------------------------ inventory value */

export function useInventoryValue() {
  return useQuery({
    queryKey: queryKeys.inventory.scope('dash-value'),
    queryFn: async () => {
      const check = await views.inventoryGlCheck();
      // gl_balance_on is added by migration 20261109040001; without it the card simply has no change figure.
      const { data, error } = await supabase.rpc('gl_balance_on', { p_account: '1200', p_date: addDays(businessDate(), -7) });
      return { value: check.gl_1200_balance, weekAgo: error || data === null ? null : Number(data) };
    },
  });
}

/* ------------------------------------------------------------------ orders */

export function useOpenOrders() {
  return useQuery({
    queryKey: queryKeys.orders.scope('dash-open'),
    queryFn: async () => {
      const { data, error } = await supabase.from('sales_orders').select('id, requested_for, created_at').eq('status', 'placed');
      if (error) fail('sales_orders', error);
      const rows = (data ?? []) as Array<{ id: number; requested_for: string; created_at: string }>;
      const today = businessDate();
      const weekEnd = addDays(today, 7);
      return {
        open: rows.length,
        dueSoon: rows.filter((r) => businessDate(r.requested_for) <= weekEnd).length,
        newThisWeek: rows.filter((r) => Date.now() - new Date(r.created_at).getTime() <= 7 * 86_400_000).length,
      };
    },
  });
}

/** Orders (not cancelled) wanted this Monday to Sunday, split by channel. */
export function useWeekOrders() {
  return useQuery({
    queryKey: queryKeys.orders.scope('dash-week'),
    queryFn: async () => {
      const monday = startOfWeek(businessDate());
      const sunday = addDays(monday, 6);
      const { data, error } = await supabase
        .from('sales_orders')
        .select('id, channel, status, requested_for')
        .gte('requested_for', `${addDays(monday, -1)}T00:00:00Z`)
        .lt('requested_for', `${addDays(sunday, 2)}T00:00:00Z`)
        .neq('status', 'cancelled');
      if (error) fail('sales_orders', error);
      const rows = ((data ?? []) as Array<{ channel: string; requested_for: string }>).filter((r) => {
        const d = businessDate(r.requested_for);
        return d >= monday && d <= sunday;
      });
      return { total: rows.length, catering: rows.filter((r) => r.channel === 'catering').length };
    },
  });
}

/* ------------------------------------------------------------------ waste this week */

export function useWasteWeek() {
  return useQuery({
    queryKey: queryKeys.freshness.scope('dash-waste'),
    queryFn: async () => {
      const today = businessDate();
      const from = startOfWeek(today);
      const [cur, prev] = await Promise.all([
        reports.wasteReport({ from, to: today }),
        reports.wasteReport({ from: addDays(from, -7), to: addDays(today, -7) }),
      ]);
      return {
        pct: cur.summary.waste_pct_of_production_cost,
        cost: cur.summary.waste_cost,
        prevPct: prev.summary.waste_pct_of_production_cost,
      };
    },
  });
}

/* ------------------------------------------------------------------ 30-day sales trend by shop */

export interface TrendData {
  shops: Array<{ id: number; name: string }>;
  rows: Array<Record<string, string | number>>;
}

export function useSalesTrend(shops: Array<{ id: number; name: string }>) {
  const ids = shops.map((s) => s.id);
  return useQuery({
    queryKey: queryKeys.sales.scope('dash-trend', { ids }),
    enabled: shops.length > 0,
    queryFn: async (): Promise<TrendData> => {
      const to = businessDate();
      const from = addDays(to, -29);
      const perShop = await Promise.all(shops.map((s) => reports.salesSummary({ from, to, grain: 'day', location: s.id })));
      const days = dateRange(from, to);
      const rows = days.map((d) => {
        const row: Record<string, string | number> = { date: d, label: formatDate(d).replace(/, \d{4}$/, '') };
        let total = 0;
        shops.forEach((s, i) => {
          const hit = (perShop[i] ?? []).find((r: SalesSummaryRow) => r.period_start === d);
          const v = hit ? hit.net_sales : 0;
          row[s.name] = v;
          total += v;
        });
        row.total = total;
        return row;
      });
      return { shops, rows };
    },
  });
}

/* ------------------------------------------------------------------ needs attention */

export function useLatePurchaseOrders() {
  return useQuery({
    queryKey: queryKeys.purchasing.scope('dash-late'),
    queryFn: async () => {
      const today = businessDate();
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, po_number, expected_on, total, suppliers(name)')
        .eq('status', 'sent')
        .lt('expected_on', today)
        .order('expected_on');
      if (error) fail('purchase_orders', error);
      return ((data ?? []) as unknown as Array<{ id: number; po_number: string; expected_on: string; total: number; suppliers: { name: string } | null }>).map((r) => ({
        id: r.id, po_number: r.po_number, expected_on: r.expected_on, total: r.total, supplier: r.suppliers?.name ?? 'Supplier',
      }));
    },
  });
}

export function useMrpExpedites() {
  return useQuery({
    queryKey: queryKeys.mrp.scope('dash-expedite'),
    queryFn: async () => {
      const rows = await reports.mrpWeekly({ weeks: 4, include_forecast: false });
      const byItem = new Map<number, (typeof rows)[number]>();
      for (const r of rows) {
        if (!r.is_expedite) continue;
        const cur = byItem.get(r.item_id);
        if (!cur || (r.order_by_date ?? '') < (cur.order_by_date ?? '')) byItem.set(r.item_id, r);
      }
      return [...byItem.values()].sort((a, b) => (a.order_by_date ?? '').localeCompare(b.order_by_date ?? ''));
    },
  });
}

/* ------------------------------------------------------------------ live activity feed */

export function useActivityFeed(limit = 20) {
  return useQuery({
    queryKey: queryKeys.events.list({ limit }),
    queryFn: async (): Promise<AppEvent[]> => {
      const { data, error } = await supabase.from('app_events').select('*').neq('topic', 'inventory.changed').order('at', { ascending: false }).order('id', { ascending: false }).limit(limit);
      if (error) fail('app_events', error);
      return (data ?? []) as AppEvent[];
    },
  });
}

/* ------------------------------------------------------------------ who is online */

interface PresenceMeta {
  user_id?: string;
  name: string;
  role: string;
  location_id: number | null;
}

/**
 * Reads the presence channel the app shell already joined ("glazed-presence") without joining it again. Presence
 * callbacks cannot be added to a channel that is already subscribed, so this samples its state every few seconds.
 */
export function useOnlineNow(myUserId: string | null, intervalMs = 3000): OnlineUser[] {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  useEffect(() => {
    function read() {
      const channel = supabase.getChannels().find((c) => c.topic === 'realtime:glazed-presence');
      if (!channel) {
        setUsers((prev) => (prev.length ? [] : prev));
        return;
      }
      const state = channel.presenceState<PresenceMeta>();
      const byUser = new Map<string, OnlineUser>();
      for (const metas of Object.values(state)) {
        for (const m of metas) {
          if (!m.user_id) continue;
          byUser.set(m.user_id, { userId: m.user_id, name: m.name, role: m.role, locationId: m.location_id ?? null, isMe: m.user_id === myUserId });
        }
      }
      const next = [...byUser.values()].sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name));
      setUsers((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    }
    read();
    const t = window.setInterval(read, intervalMs);
    return () => window.clearInterval(t);
  }, [myUserId, intervalMs]);
  return users;
}

/** Re-renders every `ms` so relative times ("2 min ago") stay current. */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

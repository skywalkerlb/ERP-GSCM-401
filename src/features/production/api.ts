/**
 * Data access for the Make module (production, forecast and bake plan, freshness). Wrappers around tables and views that
 * `src/lib/rpc.ts` does not cover, plus the hooks that load recipes (BOMs), items and stock for requirement checks.
 * Names follow supabase/CONTRACT.md. Writes always go through `rpc.*` from '@/lib/rpc'.
 */
import { useMemo } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { RpcError, views } from '@/lib/rpc';
import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import type { BomLine, Item, ItemAvailability, MoStatus, ProductionDefect, ProductionOrder } from '@/types/domain';

/** Rows per page when we page through PostgREST (the server caps a response at about 1000 rows). */
const PAGE = 1000;
const MAX_PAGES = 20;

interface PageResult {
  data: unknown[] | null;
  error: { message: string; code?: string; hint?: string; details?: string } | null;
}

/** Collects every row of a query by paging with `.range()`. `build` must return a fresh query for each page. */
export async function fetchAll<T>(name: string, build: (from: number, to: number) => PromiseLike<PageResult>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await build(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new RpcError(name, error.message, { code: error.code, hint: error.hint, details: error.details });
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Throws an RpcError when a PostgREST call failed. */
export function unwrap<T>(name: string, res: { data: unknown; error: PageResult['error'] }): T {
  if (res.error) throw new RpcError(name, res.error.message, { code: res.error.code, hint: res.error.hint, details: res.error.details });
  return res.data as T;
}

/** Refresh everything a Make action can change. */
export function invalidateMake(qc: QueryClient): void {
  for (const key of [
    queryKeys.production.all, queryKeys.forecast.all, queryKeys.bakeplan.all, queryKeys.freshness.all,
    queryKeys.inventory.all, queryKeys.transfers.all, queryKeys.finance.all, queryKeys.reports.all, queryKeys.events.all,
  ]) {
    void qc.invalidateQueries({ queryKey: key });
  }
}

// ---------------------------------------------------------------- reference data (items, recipes, stock, costs)
export function useItems() {
  return useQuery({
    queryKey: queryKeys.items.scope('make-all'),
    staleTime: 60_000,
    queryFn: async (): Promise<Item[]> =>
      unwrap<Item[]>('items', await supabase.from('items').select('*').order('name')),
  });
}

export function useBom() {
  return useQuery({
    queryKey: queryKeys.items.scope('make-bom'),
    staleTime: 60_000,
    queryFn: async (): Promise<BomLine[]> =>
      unwrap<BomLine[]>('bom_lines', await supabase.from('bom_lines').select('*')),
  });
}

/** Every item x location row of `v_item_availability`. */
export function useAvailability() {
  return useQuery({
    queryKey: queryKeys.inventory.scope('make-availability'),
    queryFn: () => views.itemAvailability(),
  });
}

/** Company-wide weighted average cost per item. */
export function useItemCosts() {
  return useQuery({
    queryKey: queryKeys.inventory.scope('make-costs'),
    queryFn: async (): Promise<Map<number, number>> => {
      const rows = unwrap<Array<{ item_id: number; avg_cost: number | null }>>(
        'item_costs',
        await supabase.from('item_costs').select('item_id, avg_cost'),
      );
      return new Map(rows.map((r) => [r.item_id, Number(r.avg_cost ?? 0)]));
    },
  });
}

export interface Requirement {
  item_id: number;
  name: string;
  sku: string;
  uom: string;
  item_type: string;
  qty_per: number;
  required: number;
  available: number;
  /** available - required (negative = short) */
  remaining: number;
  short: boolean;
  unit_cost: number;
  cost: number;
}

export interface MakeRefs {
  items: Item[];
  itemById: Map<number, Item>;
  bom: BomLine[];
  availability: ItemAvailability[];
  costs: Map<number, number>;
  loading: boolean;
  error: Error | null;
  /** Components needed to make `qty` of `parentId`, checked against stock at `locationId` (fresh stock). */
  requirementsFor: (parentId: number | null, qty: number, locationId: number | null) => Requirement[];
  /** Sums requirements for several parent items (for a whole bake plan) at one location. */
  requirementsForMany: (lines: Array<{ item_id: number; qty: number }>, locationId: number | null) => Requirement[];
}

/** Everything needed to turn a production quantity into component requirements and check stock. */
export function useMakeRefs(): MakeRefs {
  const itemsQ = useItems();
  const bomQ = useBom();
  const availQ = useAvailability();
  const costsQ = useItemCosts();

  return useMemo<MakeRefs>(() => {
    const items = itemsQ.data ?? [];
    const itemById = new Map(items.map((i) => [i.id, i]));
    const bom = bomQ.data ?? [];
    const availability = availQ.data ?? [];
    const costs = costsQ.data ?? new Map<number, number>();

    const stock = (itemId: number, locationId: number | null): number => {
      let total = 0;
      for (const a of availability) {
        if (a.item_id !== itemId) continue;
        if (locationId !== null && a.location_id !== locationId) continue;
        total += Number(a.on_hand_fresh ?? a.on_hand ?? 0);
      }
      return total;
    };

    const build = (needs: Map<number, { qty_per: number; required: number }>, locationId: number | null): Requirement[] =>
      [...needs.entries()]
        .map(([id, n]) => {
          const item = itemById.get(id);
          const available = stock(id, locationId);
          const unit_cost = costs.get(id) ?? 0;
          return {
            item_id: id,
            name: item?.name ?? `Item ${id}`,
            sku: item?.sku ?? '',
            uom: item?.uom ?? 'each',
            item_type: item?.item_type ?? 'raw',
            qty_per: n.qty_per,
            required: n.required,
            available,
            remaining: available - n.required,
            short: available < n.required,
            unit_cost,
            cost: n.required * unit_cost,
          };
        })
        .sort((a, b) => Number(b.short) - Number(a.short) || a.name.localeCompare(b.name));

    const requirementsForMany: MakeRefs['requirementsForMany'] = (lines, locationId) => {
      const needs = new Map<number, { qty_per: number; required: number }>();
      for (const line of lines) {
        for (const b of bom) {
          if (b.parent_item_id !== line.item_id) continue;
          const cur = needs.get(b.component_item_id) ?? { qty_per: 0, required: 0 };
          cur.qty_per += Number(b.qty_per);
          cur.required += Math.round(line.qty * Number(b.qty_per) * 1000) / 1000;
          needs.set(b.component_item_id, cur);
        }
      }
      return build(needs, locationId);
    };

    return {
      items, itemById, bom, availability, costs,
      loading: itemsQ.isLoading || bomQ.isLoading || availQ.isLoading || costsQ.isLoading,
      error: (itemsQ.error ?? bomQ.error ?? availQ.error ?? costsQ.error) as Error | null,
      requirementsFor: (parentId, qty, locationId) => (parentId === null ? [] : requirementsForMany([{ item_id: parentId, qty }], locationId)),
      requirementsForMany,
    };
  }, [itemsQ.data, bomQ.data, availQ.data, costsQ.data, itemsQ.isLoading, bomQ.isLoading, availQ.isLoading, costsQ.isLoading,
      itemsQ.error, bomQ.error, availQ.error, costsQ.error]);
}

// ---------------------------------------------------------------- production orders
export interface ProductionOrderRow extends ProductionOrder {
  items: { name: string; sku: string; uom: string; item_type: string } | null;
  locations: { code: string; name: string } | null;
}

const MO_SELECT = '*, items(name, sku, uom, item_type), locations(code, name)';

export async function listProductionOrders(status: MoStatus): Promise<ProductionOrderRow[]> {
  // Newest first; completed history can be long, so the list shows the latest 300.
  const res = await supabase
    .from('production_orders')
    .select(MO_SELECT)
    .eq('status', status)
    .order('due_date', { ascending: status === 'planned' || status === 'in_progress' })
    .order('id', { ascending: false })
    .limit(300);
  return unwrap<ProductionOrderRow[]>('production_orders', res);
}

export async function productionCounts(): Promise<Record<MoStatus, number>> {
  const statuses: MoStatus[] = ['planned', 'in_progress', 'completed', 'cancelled'];
  const results = await Promise.all(
    statuses.map((s) => supabase.from('production_orders').select('id', { count: 'exact', head: true }).eq('status', s)),
  );
  const out = { planned: 0, in_progress: 0, completed: 0, cancelled: 0 } as Record<MoStatus, number>;
  results.forEach((r, i) => {
    if (r.error) throw new RpcError('production_orders', r.error.message);
    out[statuses[i]!] = r.count ?? 0;
  });
  return out;
}

export async function getProductionOrder(id: number): Promise<ProductionOrderRow | null> {
  const res = await supabase.from('production_orders').select(MO_SELECT).eq('id', id).maybeSingle();
  return unwrap<ProductionOrderRow | null>('production_orders', res);
}

export async function getProductionDefects(moId: number): Promise<ProductionDefect[]> {
  const res = await supabase.from('production_defects').select('*').eq('mo_id', moId).order('id');
  return unwrap<ProductionDefect[]>('production_defects', res);
}

export interface IssuedComponent { item_id: number; qty: number; value: number }

/** What a started order actually consumed: its `prod_issue` ledger rows (qty and value are positive). */
export async function getIssuedComponents(moId: number): Promise<IssuedComponent[]> {
  const res = await supabase
    .from('inventory_transactions')
    .select('item_id, qty_delta, value_delta')
    .eq('ref_type', 'production_order')
    .eq('ref_id', moId)
    .eq('txn_type', 'prod_issue');
  const rows = unwrap<Array<{ item_id: number; qty_delta: number; value_delta: number }>>('inventory_transactions', res);
  return rows.map((r) => ({ item_id: r.item_id, qty: -Number(r.qty_delta), value: -Number(r.value_delta) }));
}

export async function getBakePlanNo(planId: number): Promise<{ id: number; plan_no: string; plan_date: string } | null> {
  const res = await supabase.from('bake_plans').select('id, plan_no, plan_date').eq('id', planId).maybeSingle();
  return unwrap<{ id: number; plan_no: string; plan_date: string } | null>('bake_plans', res);
}

/** Scrap and rework reason codes (reason_codes table). */
export async function listReasonCodes(categories: string[]): Promise<Array<{ code: string; category: string; label: string }>> {
  const res = await supabase.from('reason_codes').select('code, category, label').in('category', categories).order('label');
  return unwrap<Array<{ code: string; category: string; label: string }>>('reason_codes', res);
}

export function useReasonCodes(categories: string[]) {
  return useQuery({
    queryKey: queryKeys.settings.scope('make-reason-codes', { categories }),
    staleTime: 5 * 60_000,
    queryFn: () => listReasonCodes(categories),
  });
}

/** Whole dozens from a count of donuts. */
export const toDozens = (units: number): number => Math.round((units / 12) * 100) / 100;

/** 2.5 -> "2 hr 30 min"; 0.4 -> "24 min". */
export function formatDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—';
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

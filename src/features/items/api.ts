/**
 * Shared data helpers for the stock and buying screens (inventory, purchasing, suppliers, mrp, items).
 * Reads go through `fetchRows` (pages past PostgREST's 1,000 row cap); writes use RPCs from `@/lib/rpc`
 * or, for master data, direct table writes that managers are allowed by RLS (see supabase/CONTRACT.md section 6).
 */
import { useCallback, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components';
import { queryKeys, type QueryDomain } from '@/lib/queryKeys';
import { RpcError, rpcErrorMessage, views } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import type {
  AppSettings, BomLine, Item, ItemCost, ItemSupplier, ReasonCategory, ReasonCodeRow, Supplier,
} from '@/types/domain';

// ---------------------------------------------------------------- generic reads
export interface RowQuery {
  columns?: string;
  eq?: Record<string, string | number | boolean | null>;
  in?: [column: string, values: Array<string | number>];
  /** [column, ascending] pairs in order. */
  order?: Array<[string, boolean?]>;
  limit?: number;
}

const PAGE = 1000;

/** Selects rows from a table or view, paging past the 1,000 row limit. Throws `RpcError` with the database text. */
export async function fetchRows<T>(table: string, q: RowQuery = {}): Promise<T[]> {
  if (q.in && q.in[1].length === 0) return [];
  const out: T[] = [];
  for (let from = 0; from < 100_000; from += PAGE) {
    let query = supabase.from(table).select(q.columns ?? '*');
    for (const [col, val] of Object.entries(q.eq ?? {})) query = query.eq(col, val as never);
    if (q.in) query = query.in(q.in[0], q.in[1] as never[]);
    for (const [col, asc] of q.order ?? []) query = query.order(col, { ascending: asc ?? true });
    const to = (q.limit ? Math.min(from + PAGE, q.limit) : from + PAGE) - 1;
    const { data, error } = await query.range(from, to);
    if (error) throw new RpcError(table, error.message, { code: error.code, hint: error.hint, details: error.details });
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < to - from + 1) break;
    if (q.limit && out.length >= q.limit) break;
  }
  return out;
}

/** Writes to a master data table. Throws `RpcError` with the database text. */
export function failOn(table: string, error: { message: string; code?: string; hint?: string; details?: string } | null): void {
  if (error) throw new RpcError(table, error.message, { code: error.code, hint: error.hint, details: error.details });
}

export function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------- lookups (small tables, cached)
const LOOKUP_STALE = 30_000;

export function useItems() {
  return useQuery({
    queryKey: queryKeys.items.list(),
    staleTime: LOOKUP_STALE,
    queryFn: () => fetchRows<Item>('items', { order: [['name']] }),
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: queryKeys.suppliers.list(),
    staleTime: LOOKUP_STALE,
    queryFn: () => fetchRows<Supplier>('suppliers', { order: [['name']] }),
  });
}

export function useItemCosts() {
  return useQuery({
    queryKey: queryKeys.items.scope('costs'),
    staleTime: LOOKUP_STALE,
    queryFn: () => fetchRows<ItemCost>('item_costs'),
  });
}

export function useItemSuppliers() {
  return useQuery({
    queryKey: queryKeys.items.scope('item-suppliers'),
    staleTime: LOOKUP_STALE,
    queryFn: () => fetchRows<ItemSupplier>('item_suppliers'),
  });
}

export function useBomLines() {
  return useQuery({
    queryKey: queryKeys.items.scope('bom'),
    staleTime: LOOKUP_STALE,
    queryFn: () => fetchRows<BomLine>('bom_lines', { order: [['parent_item_id'], ['id']] }),
  });
}

export function useScorecard() {
  return useQuery({
    queryKey: queryKeys.suppliers.scope('scorecard'),
    queryFn: () => views.supplierScorecard(),
  });
}

export function useReasonCodes(category?: ReasonCategory) {
  return useQuery({
    queryKey: queryKeys.settings.scope('reason-codes', { category }),
    staleTime: 5 * 60_000,
    queryFn: () => fetchRows<ReasonCodeRow>('reason_codes', { eq: category ? { category } : undefined, order: [['code']] }),
  });
}

export function useAppSettings() {
  return useQuery({
    queryKey: queryKeys.settings.detail(1),
    staleTime: LOOKUP_STALE,
    queryFn: async (): Promise<AppSettings> => {
      const rows = await fetchRows<AppSettings>('app_settings', { eq: { id: 1 } });
      const row = rows[0];
      if (!row) throw new Error('Settings are missing. Ask a manager to run the database setup.');
      return row;
    },
  });
}

export function indexBy<T, K extends string | number>(rows: readonly T[] | undefined, key: (row: T) => K): Map<K, T> {
  const map = new Map<K, T>();
  for (const r of rows ?? []) map.set(key(r), r);
  return map;
}

/** Cost to value a movement: weighted average cost, else the preferred supplier's cost, else zero. */
export function costLookup(costs: readonly ItemCost[] | undefined, supplied: readonly ItemSupplier[] | undefined, items: readonly Item[] | undefined) {
  const avg = indexBy(costs, (c) => c.item_id);
  const preferredSupplier = new Map(items?.map((i) => [i.id, i.preferred_supplier_id]) ?? []);
  const sup = new Map<number, number>();
  for (const s of supplied ?? []) {
    const wanted = preferredSupplier.get(s.item_id);
    if (s.is_preferred || s.supplier_id === wanted || !sup.has(s.item_id)) sup.set(s.item_id, toNumber(s.unit_cost));
  }
  return (itemId: number): number => {
    const c = avg.get(itemId);
    const a = c?.avg_cost;
    if (a !== null && a !== undefined && toNumber(c?.qty_total) > 0) return toNumber(a);
    return sup.get(itemId) ?? 0;
  };
}

// ---------------------------------------------------------------- mutations
/** Domains that go stale after stock, buying or master data changes. */
export const STOCK_DOMAINS: QueryDomain[] = ['inventory', 'catalog', 'mrp', 'purchasing', 'suppliers', 'finance', 'transfers', 'adjustments', 'reports', 'events'];
export const MASTER_DOMAINS: QueryDomain[] = ['items', 'suppliers', 'inventory', 'catalog', 'mrp', 'purchasing', 'events'];

export function useInvalidate() {
  const qc = useQueryClient();
  return useCallback(
    (...domains: QueryDomain[]) => Promise.all(domains.map((d) => qc.invalidateQueries({ queryKey: queryKeys[d].all }))),
    [qc],
  );
}

export interface ActionOptions<V, R> {
  /** Query domains to refresh once the call succeeds. */
  invalidate: QueryDomain[];
  /** Toast shown on success. A function can use the result. */
  success?: string | ((result: R, vars: V) => { title: string; description?: ReactNode } | string);
  /** Title of the toast shown when the call fails. The database message goes in the description. */
  errorTitle?: string;
  onSuccess?: (result: R, vars: V) => void;
}

/** A mutation that refreshes the right queries and tells the person what happened, in the shop's voice. */
export function useAction<V, R = unknown>(fn: (vars: V) => Promise<R>, opts: ActionOptions<V, R>) {
  const invalidate = useInvalidate();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result, vars) => {
      await invalidate(...opts.invalidate);
      if (opts.success) {
        const msg = typeof opts.success === 'function' ? opts.success(result, vars) : opts.success;
        if (typeof msg === 'string') toast.success(msg);
        else toast.success(msg.title, msg.description);
      }
      opts.onSuccess?.(result, vars);
    },
    onError: (e) => toast.error(opts.errorTitle ?? 'That did not go through', rpcErrorMessage(e)),
  });
}

// ---------------------------------------------------------------- item master writes
export type ItemDraft = Omit<Item, 'id' | 'is_active'> & { is_active: boolean };

/** Next barcode in the shop's GZ1xxxxx format. */
export function nextBarcode(items: readonly Item[]): string {
  let max = 0;
  for (const i of items) {
    const m = /^GZ1(\d{5})$/.exec(i.barcode ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `GZ1${String(max + 1).padStart(5, '0')}`;
}

export async function saveItem(id: number | null, draft: Partial<ItemDraft>): Promise<number> {
  if (id === null) {
    const { data, error } = await supabase.from('items').insert(draft).select('id').single();
    failOn('items', error);
    return (data as { id: number }).id;
  }
  const { error } = await supabase.from('items').update(draft).eq('id', id);
  failOn('items', error);
  return id;
}

export async function saveSupplier(id: number | null, draft: Partial<Omit<Supplier, 'id'>>): Promise<number> {
  if (id === null) {
    const { data, error } = await supabase.from('suppliers').insert(draft).select('id').single();
    failOn('suppliers', error);
    return (data as { id: number }).id;
  }
  const { error } = await supabase.from('suppliers').update(draft).eq('id', id);
  failOn('suppliers', error);
  return id;
}

export async function upsertItemSupplier(row: ItemSupplier): Promise<void> {
  const { error } = await supabase.from('item_suppliers').upsert(row, { onConflict: 'item_id,supplier_id' });
  failOn('item_suppliers', error);
}

export async function deleteItemSupplier(itemId: number, supplierId: number): Promise<void> {
  const { error } = await supabase.from('item_suppliers').delete().eq('item_id', itemId).eq('supplier_id', supplierId);
  failOn('item_suppliers', error);
}

/** Makes one supplier the preferred one for an item (item_suppliers flags and items.preferred_supplier_id). */
export async function setPreferredSupplier(itemId: number, supplierId: number): Promise<void> {
  const { error: e1 } = await supabase.from('item_suppliers').update({ is_preferred: false }).eq('item_id', itemId);
  failOn('item_suppliers', e1);
  const { error: e2 } = await supabase.from('item_suppliers').update({ is_preferred: true }).eq('item_id', itemId).eq('supplier_id', supplierId);
  failOn('item_suppliers', e2);
  const { error: e3 } = await supabase.from('items').update({ preferred_supplier_id: supplierId }).eq('id', itemId);
  failOn('items', e3);
}

export async function addBomLine(parentId: number, componentId: number, qtyPer: number): Promise<void> {
  const { error } = await supabase.from('bom_lines').insert({ parent_item_id: parentId, component_item_id: componentId, qty_per: qtyPer });
  failOn('bom_lines', error);
}

export async function updateBomLine(id: number, qtyPer: number): Promise<void> {
  const { error } = await supabase.from('bom_lines').update({ qty_per: qtyPer }).eq('id', id);
  failOn('bom_lines', error);
}

export async function removeBomLine(id: number): Promise<void> {
  const { error } = await supabase.from('bom_lines').delete().eq('id', id);
  failOn('bom_lines', error);
}

export const ITEM_TYPE_LABELS: Record<string, string> = {
  raw: 'Raw material',
  packaging: 'Packaging',
  finished: 'Finished donut',
  resale: 'Resale',
  kit: 'Kit',
};

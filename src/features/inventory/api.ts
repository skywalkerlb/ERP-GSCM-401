import { useQuery } from '@tanstack/react-query';
import { fetchRows, toNumber } from '@/features/items/api';
import { queryKeys } from '@/lib/queryKeys';
import { views } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import type {
  AdjustmentLine, InventoryAdjustment, InventoryTransaction, ItemAvailability, InventoryValuationRow, Transfer, TransferLine, TxnType,
} from '@/types/domain';

export const TXN_LABELS: Record<TxnType, string> = {
  opening: 'Opening balance',
  receipt_po: 'PO receipt',
  sale: 'Sale',
  sale_return: 'Sale return',
  return_scrap: 'Return scrapped',
  transfer_out: 'Transfer out',
  transfer_in: 'Transfer in',
  adjust_count: 'Count adjustment',
  adjust_damage: 'Damage',
  waste: 'Waste',
  dayold_out: 'To day-old (out)',
  dayold_in: 'To day-old (in)',
  prod_issue: 'Production issue',
  prod_receipt: 'Production receipt',
};

export function useAvailability() {
  return useQuery({ queryKey: queryKeys.inventory.scope('availability'), queryFn: () => views.itemAvailability() });
}

export function useValuation() {
  return useQuery({ queryKey: queryKeys.inventory.scope('valuation'), queryFn: () => views.inventoryValuation() });
}

export function useGlCheck() {
  return useQuery({ queryKey: queryKeys.inventory.scope('gl-check'), queryFn: () => views.inventoryGlCheck() });
}

export function useItemAvailability(itemId: number) {
  return useQuery({
    queryKey: queryKeys.inventory.scope('item-availability', { itemId }),
    enabled: Number.isFinite(itemId),
    queryFn: () => views.itemAvailability({ item_id: itemId }),
  });
}

export function useItemValuation(itemId: number) {
  return useQuery({
    queryKey: queryKeys.inventory.scope('item-valuation', { itemId }),
    enabled: Number.isFinite(itemId),
    queryFn: () => views.inventoryValuation({ item_id: itemId }),
  });
}

export function useItemReorder(itemId: number) {
  return useQuery({
    queryKey: queryKeys.inventory.scope('item-reorder', { itemId }),
    enabled: Number.isFinite(itemId),
    queryFn: async () => (await views.reorderAnalysis({ item_id: itemId }))[0] ?? null,
  });
}

// ---------------------------------------------------------------- ledger
export interface LedgerRow extends InventoryTransaction {
  ref_label: string | null;
  ref_to: string | null;
}

export const LEDGER_PAGE = 25;

interface RefSource { table: string; label: string; id: string; extra?: string; link: (row: Record<string, unknown>) => string | null }
const REF_SOURCES: Record<string, RefSource> = {
  po_receipt: { table: 'po_receipts', label: 'receipt_no', id: 'id', extra: 'po_id', link: (r) => (r.po_id ? `/purchasing/${r.po_id}` : null) },
  sale: { table: 'sales', label: 'receipt_no', id: 'id', link: (r) => `/pos/receipt/${r.id}` },
  transfer: { table: 'transfers', label: 'trf_no', id: 'id', link: () => '/inventory/transfers' },
  adjustment: { table: 'inventory_adjustments', label: 'adj_no', id: 'id', link: () => null },
  production_order: { table: 'production_orders', label: 'mo_number', id: 'id', link: (r) => `/production/${r.id}` },
  return: { table: 'returns', label: 'return_no', id: 'id', link: () => null },
};

async function attachRefs(rows: InventoryTransaction[]): Promise<LedgerRow[]> {
  const idsByType = new Map<string, Set<number>>();
  for (const r of rows) {
    if (r.ref_type && r.ref_id !== null && REF_SOURCES[r.ref_type]) {
      if (!idsByType.has(r.ref_type)) idsByType.set(r.ref_type, new Set());
      idsByType.get(r.ref_type)!.add(r.ref_id);
    }
  }
  const labels = new Map<string, { label: string; to: string | null }>();
  await Promise.all(
    [...idsByType].map(async ([type, ids]) => {
      const src = REF_SOURCES[type]!;
      try {
        const cols = [src.id, src.label, src.extra].filter(Boolean).join(',');
        const found = await fetchRows<Record<string, unknown>>(src.table, { columns: cols, in: [src.id, [...ids]] });
        for (const f of found) labels.set(`${type}:${String(f[src.id])}`, { label: String(f[src.label]), to: src.link(f) });
      } catch {
        /* a missing document name should never hide the ledger itself */
      }
    }),
  );
  return rows.map((r) => {
    const hit = r.ref_type && r.ref_id !== null ? labels.get(`${r.ref_type}:${r.ref_id}`) : undefined;
    return { ...r, ref_label: hit?.label ?? null, ref_to: hit?.to ?? null };
  });
}

export interface LedgerFilter { locationId?: number; txnType?: string }

export async function fetchLedgerPage(itemId: number, page: number, filter: LedgerFilter): Promise<{ rows: LedgerRow[]; total: number }> {
  let q = supabase.from('inventory_transactions').select('*', { count: 'exact' }).eq('item_id', itemId);
  if (filter.locationId) q = q.eq('location_id', filter.locationId);
  if (filter.txnType) q = q.eq('txn_type', filter.txnType);
  const { data, error, count } = await q.order('id', { ascending: false }).range(page * LEDGER_PAGE, page * LEDGER_PAGE + LEDGER_PAGE - 1);
  if (error) throw new Error(error.message);
  return { rows: await attachRefs((data ?? []) as unknown as InventoryTransaction[]), total: count ?? 0 };
}

export interface CostPoint { date: string; avgCost: number; qty: number; value: number }

/** Weighted average cost at the end of each business day, rebuilt from the whole ledger (company wide, like item_costs). */
export async function fetchCostHistory(itemId: number): Promise<CostPoint[]> {
  const rows = await fetchRows<Pick<InventoryTransaction, 'id' | 'business_date' | 'qty_delta' | 'value_delta'>>('inventory_transactions', {
    columns: 'id,business_date,qty_delta,value_delta',
    eq: { item_id: itemId },
    order: [['id']],
  });
  let qty = 0;
  let value = 0;
  let last = 0;
  const byDate = new Map<string, CostPoint>();
  for (const r of rows) {
    qty += toNumber(r.qty_delta);
    value += toNumber(r.value_delta);
    if (qty > 0.0005) last = value / qty;
    byDate.set(r.business_date, { date: r.business_date, avgCost: Math.round(last * 10_000) / 10_000, qty, value });
  }
  return [...byDate.values()];
}

// ---------------------------------------------------------------- transfers
export interface TransferView extends Transfer { lines: TransferLine[] }

export function useTransfers() {
  return useQuery({
    queryKey: queryKeys.transfers.list(),
    queryFn: async (): Promise<TransferView[]> => {
      const transfers = await fetchRows<Transfer>('transfers', { order: [['id', false]], limit: 200 });
      const lines = await fetchRows<TransferLine>('transfer_lines', { in: ['transfer_id', transfers.map((t) => t.id)] });
      const byTransfer = new Map<number, TransferLine[]>();
      for (const l of lines) byTransfer.set(l.transfer_id, [...(byTransfer.get(l.transfer_id) ?? []), l]);
      return transfers.map((t) => ({ ...t, lines: byTransfer.get(t.id) ?? [] }));
    },
  });
}

// ---------------------------------------------------------------- adjustments
export interface AdjustmentView extends InventoryAdjustment { lines: AdjustmentLine[]; value: number }

export function useRecentAdjustments(limit = 8) {
  return useQuery({
    queryKey: queryKeys.adjustments.list({ limit }),
    queryFn: async (): Promise<AdjustmentView[]> => {
      const adjustments = await fetchRows<InventoryAdjustment>('inventory_adjustments', {
        order: [['id', false]],
        limit: limit * 3,
      });
      const picked = adjustments.filter((a) => a.kind === 'cycle_count' || a.kind === 'damage').slice(0, limit);
      const lines = await fetchRows<AdjustmentLine>('adjustment_lines', { in: ['adj_id', picked.map((a) => a.id)] });
      return picked.map((a) => {
        const own = lines.filter((l) => l.adj_id === a.id);
        return { ...a, lines: own, value: own.reduce((s, l) => s + toNumber(l.value_delta), 0) };
      });
    },
  });
}

export type { ItemAvailability, InventoryValuationRow };

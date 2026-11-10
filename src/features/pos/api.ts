import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { views } from '@/lib/rpc';
import { queryKeys } from '@/lib/queryKeys';
import type { ItemAvailability, ItemType, Sale, StockCondition, Uom } from '@/types/domain';

/** Throws the database's message so the UI can show it. */
function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export interface SellableItem {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  barcode: string | null;
  item_type: ItemType;
  uom: Uom;
  list_price: number;
}

/** Items that can be sold, with prices. Staff only. */
export function useSellableItems() {
  return useQuery({
    queryKey: queryKeys.items.scope('sellable'),
    staleTime: 60_000,
    queryFn: async (): Promise<SellableItem[]> => {
      const rows = check(
        await supabase
          .from('items')
          .select('id, sku, name, category, barcode, item_type, uom, list_price')
          .eq('is_sellable', true)
          .eq('is_active', true)
          .order('name'),
      ) as SellableItem[];
      return rows.map((r) => ({ ...r, list_price: Number(r.list_price ?? 0) }));
    },
  });
}

/** Stock by item at one location (v_item_availability), keyed by item id. */
export function useAvailability(locationId: number | null) {
  return useQuery({
    queryKey: queryKeys.inventory.scope('availability', { locationId }),
    enabled: locationId !== null,
    queryFn: async (): Promise<Map<number, ItemAvailability>> => {
      const rows = await views.itemAvailability({ location_id: locationId ?? undefined });
      return new Map(rows.map((r) => [r.item_id, r]));
    },
  });
}

export interface SellSettings {
  day_old_markdown_pct: number;
  default_tax_rate: number;
  business_name: string;
}

export function useSellSettings() {
  return useQuery({
    queryKey: queryKeys.settings.scope('selling'),
    staleTime: 60_000,
    queryFn: async (): Promise<SellSettings> => {
      const row = check(
        await supabase.from('app_settings').select('day_old_markdown_pct, default_tax_rate, business_name').eq('id', 1).maybeSingle(),
      ) as SellSettings | null;
      return {
        day_old_markdown_pct: Number(row?.day_old_markdown_pct ?? 0.5),
        default_tax_rate: Number(row?.default_tax_rate ?? 0),
        business_name: row?.business_name ?? 'Glazed',
      };
    },
  });
}

export interface CustomerOption {
  id: number;
  name: string;
  kind: string;
  email: string | null;
  phone: string | null;
}

export function useCustomerOptions() {
  return useQuery({
    queryKey: queryKeys.customers.scope('picker'),
    staleTime: 30_000,
    queryFn: async (): Promise<CustomerOption[]> =>
      check(await supabase.from('customers').select('id, name, kind, email, phone').eq('is_active', true).order('name')) as CustomerOption[],
  });
}

/** Stock the item has in the given condition: donuts track fresh and day-old apart, everything else is one pile. */
export function stockFor(av: ItemAvailability | undefined, item: { item_type: ItemType }, condition: StockCondition): number {
  if (!av) return 0;
  if (item.item_type !== 'finished') return Number(av.on_hand);
  return Number(condition === 'fresh' ? av.on_hand_fresh : av.on_hand_day_old);
}

export interface SaleDetail extends Sale {
  locations: { name: string; address: string | null; code: string } | null;
  customers: { name: string } | null;
  sale_lines: Array<{
    id: number;
    item_id: number;
    condition: StockCondition;
    qty: number;
    unit_price: number;
    discount_amt: number;
    line_net: number;
    qty_returned: number;
    items: { name: string; sku: string } | null;
  }>;
}

const SALE_SELECT =
  '*, locations(name, address, code), customers(name), sale_lines(id, item_id, condition, qty, unit_price, discount_amt, line_net, qty_returned, items(name, sku))';

function normalizeSale(row: SaleDetail): SaleDetail {
  const n = (v: unknown) => Number(v ?? 0);
  return {
    ...row,
    subtotal: n(row.subtotal),
    discount_total: n(row.discount_total),
    tax_rate: n(row.tax_rate),
    tax_total: n(row.tax_total),
    total: n(row.total),
    tendered: n(row.tendered),
    change_due: n(row.change_due),
    sale_lines: [...(row.sale_lines ?? [])]
      .sort((a, b) => a.id - b.id)
      .map((l) => ({
        ...l,
        qty: n(l.qty),
        unit_price: n(l.unit_price),
        discount_amt: n(l.discount_amt),
        line_net: n(l.line_net),
        qty_returned: n(l.qty_returned),
      })),
  };
}

export async function fetchSaleById(id: number): Promise<SaleDetail | null> {
  const row = check(await supabase.from('sales').select(SALE_SELECT).eq('id', id).maybeSingle()) as SaleDetail | null;
  return row ? normalizeSale(row) : null;
}

/** "RCPT-00123", "rcpt-123" and "123" all find receipt RCPT-00123. */
export function normalizeReceiptNo(text: string): string {
  const t = text.trim().toUpperCase();
  const m = /^(?:RCPT-?)?(\d{1,})$/.exec(t);
  return m ? `RCPT-${m[1]!.padStart(5, '0')}` : t;
}

export async function fetchSaleByReceipt(receiptNo: string): Promise<SaleDetail | null> {
  const row = check(await supabase.from('sales').select(SALE_SELECT).eq('receipt_no', normalizeReceiptNo(receiptNo)).maybeSingle()) as SaleDetail | null;
  return row ? normalizeSale(row) : null;
}

export function useSale(id: number | null) {
  return useQuery({
    queryKey: queryKeys.sales.detail(id ?? 0),
    enabled: id !== null && Number.isFinite(id),
    queryFn: () => fetchSaleById(id as number),
  });
}

/** Refresh everything a sale, order or return touches (realtime does this for other users). */
export function invalidateSelling(qc: QueryClient): void {
  for (const key of [
    queryKeys.sales.all,
    queryKeys.orders.all,
    queryKeys.returns.all,
    queryKeys.inventory.all,
    queryKeys.catalog.all,
    queryKeys.finance.all,
    queryKeys.reports.all,
  ]) {
    void qc.invalidateQueries({ queryKey: key });
  }
}

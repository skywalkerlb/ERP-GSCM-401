import { supabase } from '@/lib/supabase';
import { round2 } from '@/features/pos/calc';
import type { SalesOrder, SalesOrderChannel, SalesOrderStatus } from '@/types/domain';

export const STATUS_ORDER: SalesOrderStatus[] = ['placed', 'fulfilled', 'closed', 'cancelled'];

/** Tab and badge labels. "placed" reads "Order placed" everywhere in the staff app. */
export const STATUS_LABEL: Record<SalesOrderStatus, string> = {
  placed: 'Order placed',
  fulfilled: 'Fulfilled',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export const CHANNEL_LABEL: Record<SalesOrderChannel, string> = {
  counter: 'Counter',
  phone: 'Phone',
  catering: 'Catering',
  online: 'Online pickup',
};

export interface OrderListRow extends SalesOrder {
  customers: { name: string } | null;
  locations: { name: string; code: string } | null;
  so_lines: Array<{ qty: number; unit_price: number }>;
  /** Sum of line prices before tax. */
  value: number;
  units: number;
}

export async function fetchOrders(): Promise<OrderListRow[]> {
  const { data, error } = await supabase
    .from('sales_orders')
    .select('*, customers(name), locations(name, code), so_lines(qty, unit_price)')
    .order('requested_for', { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as OrderListRow[]).map((o) => {
    const lines = (o.so_lines ?? []).map((l) => ({ qty: Number(l.qty), unit_price: Number(l.unit_price) }));
    return {
      ...o,
      so_lines: lines,
      value: round2(lines.reduce((s, l) => s + round2(l.qty * l.unit_price), 0)),
      units: lines.reduce((s, l) => s + l.qty, 0),
    };
  });
}

export interface OrderDetail extends SalesOrder {
  customers: { name: string; email: string | null; phone: string | null; kind: string } | null;
  locations: { name: string; code: string; address: string | null; tax_rate: number } | null;
  so_lines: Array<{
    id: number;
    item_id: number;
    qty: number;
    unit_price: number;
    qty_fulfilled: number;
    items: { name: string; sku: string; item_type: string; uom: string } | null;
  }>;
}

export async function fetchOrder(id: number): Promise<OrderDetail | null> {
  const { data, error } = await supabase
    .from('sales_orders')
    .select('*, customers(name, email, phone, kind), locations(name, code, address, tax_rate), so_lines(id, item_id, qty, unit_price, qty_fulfilled, items(name, sku, item_type, uom))')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const o = data as unknown as OrderDetail;
  return {
    ...o,
    locations: o.locations ? { ...o.locations, tax_rate: Number(o.locations.tax_rate) } : null,
    so_lines: [...(o.so_lines ?? [])]
      .sort((a, b) => a.id - b.id)
      .map((l) => ({ ...l, qty: Number(l.qty), unit_price: Number(l.unit_price), qty_fulfilled: Number(l.qty_fulfilled) })),
  };
}

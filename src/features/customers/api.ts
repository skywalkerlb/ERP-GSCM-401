import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { RpcError, rpc } from '@/lib/rpc';
import type { Customer, CustomerKind } from '@/types/domain';

function fail(source: string, e: { message: string; code?: string }): never {
  throw new RpcError(source, e.message, { code: e.code });
}

export interface CustomerStats {
  orders: number;
  openOrders: number;
  spend: number;
  lastOrder: string | null;
}

/** All customers with their order count and lifetime spend (fulfilled sales). */
export function useCustomers() {
  return useQuery({
    queryKey: queryKeys.customers.list(),
    queryFn: async () => {
      const [cust, orders, sales] = await Promise.all([
        supabase.from('customers').select('*').order('name'),
        supabase.from('sales_orders').select('customer_id, status, requested_for'),
        supabase.from('sales').select('customer_id, total').not('customer_id', 'is', null),
      ]);
      if (cust.error) fail('customers', cust.error);
      if (orders.error) fail('sales_orders', orders.error);
      if (sales.error) fail('sales', sales.error);
      const stats = new Map<number, CustomerStats>();
      const get = (id: number) => {
        let s = stats.get(id);
        if (!s) {
          s = { orders: 0, openOrders: 0, spend: 0, lastOrder: null };
          stats.set(id, s);
        }
        return s;
      };
      for (const o of (orders.data ?? []) as Array<{ customer_id: number; status: string; requested_for: string }>) {
        const s = get(o.customer_id);
        if (o.status !== 'cancelled') s.orders += 1;
        if (o.status === 'placed') s.openOrders += 1;
        if (o.status !== 'cancelled' && (!s.lastOrder || o.requested_for > s.lastOrder)) s.lastOrder = o.requested_for;
      }
      for (const s of (sales.data ?? []) as Array<{ customer_id: number; total: number }>) get(s.customer_id).spend += Number(s.total);
      return { customers: (cust.data ?? []) as Customer[], stats };
    },
  });
}

export function useCustomer(id: number) {
  return useQuery({
    queryKey: queryKeys.customers.detail(id),
    enabled: Number.isFinite(id),
    queryFn: async (): Promise<Customer | null> => {
      const { data, error } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
      if (error) fail('customers', error);
      return (data as Customer | null) ?? null;
    },
  });
}

export interface CustomerOrder {
  id: number;
  so_number: string;
  status: string;
  channel: string;
  requested_for: string;
  created_at: string;
  location_id: number;
  total: number;
}

export function useCustomerOrders(id: number) {
  return useQuery({
    queryKey: queryKeys.orders.scope('customer', { id }),
    enabled: Number.isFinite(id),
    queryFn: async (): Promise<CustomerOrder[]> => {
      const { data, error } = await supabase
        .from('sales_orders')
        .select('id, so_number, status, channel, requested_for, created_at, location_id, so_lines(qty, unit_price)')
        .eq('customer_id', id)
        .order('requested_for', { ascending: false });
      if (error) fail('sales_orders', error);
      return ((data ?? []) as unknown as Array<CustomerOrder & { so_lines: Array<{ qty: number; unit_price: number }> }>).map((o) => ({
        id: o.id, so_number: o.so_number, status: o.status, channel: o.channel, requested_for: o.requested_for, created_at: o.created_at,
        location_id: o.location_id, total: (o.so_lines ?? []).reduce((s, l) => s + Number(l.qty) * Number(l.unit_price), 0),
      }));
    },
  });
}

export interface CustomerSale {
  id: number;
  receipt_no: string;
  location_id: number;
  sold_at: string;
  channel: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  payment_method: string;
}

export function useCustomerSales(id: number) {
  return useQuery({
    queryKey: queryKeys.sales.scope('customer', { id }),
    enabled: Number.isFinite(id),
    queryFn: async (): Promise<CustomerSale[]> => {
      const { data, error } = await supabase
        .from('sales')
        .select('id, receipt_no, location_id, sold_at, channel, subtotal, discount_total, tax_total, total, payment_method')
        .eq('customer_id', id)
        .order('sold_at', { ascending: false });
      if (error) fail('sales', error);
      return (data ?? []) as CustomerSale[];
    },
  });
}

export interface CustomerReturn {
  id: number;
  return_no: string;
  sale_id: number;
  returned_at: string;
  kind: string;
  refund_total: number;
  net_due: number;
}

export function useCustomerReturns(id: number, saleIds: number[]) {
  return useQuery({
    queryKey: queryKeys.returns.scope('customer', { id, saleIds }),
    enabled: Number.isFinite(id) && saleIds.length > 0,
    queryFn: async (): Promise<CustomerReturn[]> => {
      const { data, error } = await supabase
        .from('returns')
        .select('id, return_no, sale_id, returned_at, kind, refund_total, net_due')
        .in('sale_id', saleIds)
        .order('returned_at', { ascending: false });
      if (error) fail('returns', error);
      return (data ?? []) as CustomerReturn[];
    },
  });
}

export interface CustomerInput {
  name: string;
  kind: CustomerKind;
  email: string;
  phone: string;
  home_location_id: number | null;
  is_active: boolean;
}

/** Creates through the create_customer RPC; edits are direct updates (managers only, under RLS). */
export function useSaveCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: number | null; input: CustomerInput }): Promise<number> => {
      const email = input.email.trim() || null;
      const phone = input.phone.trim() || null;
      if (id === null) {
        return rpc.createCustomer({ name: input.name.trim(), kind: input.kind, email, phone, home_location_id: input.home_location_id });
      }
      const { data, error } = await supabase
        .from('customers')
        .update({ name: input.name.trim(), kind: input.kind, email, phone, home_location_id: input.home_location_id, is_active: input.is_active })
        .eq('id', id)
        .select();
      if (error) fail('customers', error);
      if (!data || data.length === 0) throw new Error('The customer was not saved. Only managers can edit customers.');
      return id;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.customers.all });
      void qc.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
  });
}

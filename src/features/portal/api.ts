import { useQuery } from '@tanstack/react-query';
import { rpc } from '@/lib/rpc';
import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import type { CatalogRow } from '@/types/domain';

/** What each shop has of each item, with no costs (get_catalog_availability). Refreshes on inventory events. */
export function useCatalog() {
  return useQuery({
    queryKey: queryKeys.catalog.scope('availability'),
    queryFn: async (): Promise<CatalogRow[]> =>
      (await rpc.getCatalogAvailability()).map((r) => ({ ...r, list_price: Number(r.list_price), available_qty: Number(r.available_qty) })),
  });
}

export interface CatalogItem {
  item_id: number;
  sku: string;
  name: string;
  category: string | null;
  list_price: number;
  byShop: Map<number, CatalogRow>;
}

/** One entry per item, with its availability at every shop. */
export function groupCatalog(rows: CatalogRow[]): CatalogItem[] {
  const map = new Map<number, CatalogItem>();
  for (const r of rows) {
    let item = map.get(r.item_id);
    if (!item) {
      item = { item_id: r.item_id, sku: r.sku, name: r.name, category: r.category, list_price: r.list_price, byShop: new Map() };
      map.set(r.item_id, item);
    }
    item.byShop.set(r.location_id, r);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface ShopInfo {
  id: number;
  code: string;
  name: string;
  address: string | null;
  tax_rate: number;
  open_time: string | null;
  close_time: string | null;
  closed_weekdays: number[];
}

/** Shops a customer can pick up from. Customers may read the locations table. */
export function useShops() {
  return useQuery({
    queryKey: queryKeys.locations.scope('portal-shops'),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ShopInfo[]> => {
      const { data, error } = await supabase
        .from('locations')
        .select('id, code, name, address, tax_rate, open_time, close_time, closed_weekdays')
        .eq('kind', 'shop')
        .eq('is_active', true)
        .order('id');
      if (error) throw new Error(error.message);
      return ((data ?? []) as ShopInfo[]).map((s) => ({ ...s, tax_rate: Number(s.tax_rate), closed_weekdays: s.closed_weekdays ?? [] }));
    },
  });
}

/** The signed-in customer's orders. Status changes arrive through the realtime events the portal shell subscribes to. */
export function useMyOrders() {
  return useQuery({
    queryKey: queryKeys.orders.scope('mine'),
    queryFn: async () =>
      (await rpc.getMyOrders()).map((o) => ({
        ...o,
        total: Number(o.total),
        lines: (o.lines ?? []).map((l) => ({ ...l, qty: Number(l.qty), unit_price: Number(l.unit_price) })),
      })),
  });
}

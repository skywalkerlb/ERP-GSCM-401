import { useQuery } from '@tanstack/react-query';
import { fetchRows, toNumber } from '@/features/items/api';
import { businessDate } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { reports } from '@/lib/rpc';
import type { BomLine, Item, MrpRow, SalesOrder, SoLine } from '@/types/domain';

export const MRP_WEEKS = 4;

export function useMrpWeekly(includeForecast: boolean) {
  return useQuery({
    queryKey: queryKeys.mrp.scope('weekly', { includeForecast }),
    queryFn: () => reports.mrpWeekly({ start: businessDate(), weeks: MRP_WEEKS, include_forecast: includeForecast }),
  });
}

export interface PlacedOrder { order: SalesOrder; lines: SoLine[] }

/** Open (placed) sales orders and their lines: the demand behind the plan. */
export function usePlacedOrders() {
  return useQuery({
    queryKey: queryKeys.mrp.scope('placed-orders'),
    queryFn: async (): Promise<PlacedOrder[]> => {
      const orders = await fetchRows<SalesOrder>('sales_orders', { eq: { status: 'placed' }, order: [['requested_for']] });
      const lines = await fetchRows<SoLine>('so_lines', { in: ['so_id', orders.map((o) => o.id)] });
      return orders.map((o) => ({ order: o, lines: lines.filter((l) => l.so_id === o.id) }));
    },
  });
}

export interface DriverRow {
  key: string;
  soId: number | null;
  soNumber: string | null;
  locationId: number | null;
  needDate: string | null;
  weekNo: number;
  parent: Item | null;
  parentQty: number;
  qtyPer: number;
  qty: number;
  kind: 'order' | 'forecast';
}

/** Which sales orders (and parent items) create a component's gross requirement. Mirrors mrp_weekly's explosion. */
export function driversFor(
  componentId: number, orders: PlacedOrder[], bom: readonly BomLine[], items: Map<number, Item>,
  weeks: Array<{ week_no: number; week_start: string; week_end: string }>,
): DriverRow[] {
  if (weeks.length === 0) return [];
  const first = weeks[0]!;
  const weekOf = (date: string): number | null => {
    if (date < first.week_start) return first.week_no; // past-due orders count in week 1
    return weeks.find((w) => date >= w.week_start && date <= w.week_end)?.week_no ?? null;
  };
  const out: DriverRow[] = [];
  for (const { order, lines } of orders) {
    const needDate = businessDate(new Date(order.requested_for));
    const weekNo = weekOf(needDate);
    if (weekNo === null) continue;
    for (const l of lines) {
      const remaining = Math.max(0, toNumber(l.qty) - toNumber(l.qty_fulfilled));
      if (remaining <= 0) continue;
      const parent = items.get(l.item_id) ?? null;
      if (l.item_id === componentId) {
        out.push({ key: `${order.id}-${l.id}-direct`, soId: order.id, soNumber: order.so_number, locationId: order.location_id, needDate, weekNo, parent, parentQty: remaining, qtyPer: 1, qty: remaining, kind: 'order' });
      }
      for (const b of bom) {
        if (b.parent_item_id === l.item_id && b.component_item_id === componentId) {
          out.push({ key: `${order.id}-${l.id}-${b.id}`, soId: order.id, soNumber: order.so_number, locationId: order.location_id, needDate, weekNo, parent, parentQty: remaining, qtyPer: toNumber(b.qty_per), qty: remaining * toNumber(b.qty_per), kind: 'order' });
        }
      }
    }
  }
  return out;
}

export type { MrpRow };

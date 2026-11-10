/** Data access for freshness and waste: stock by condition, day closes, day-old sales, markdown setting and waste suggestions. */
import { supabase } from '@/lib/supabase';
import { daysBetween } from '@/lib/format';
import { fetchAll, unwrap } from '@/features/production/api';
import type { DayClose, WasteSummaryRow } from '@/types/domain';

export interface FreshStockRow {
  item_id: number;
  sku: string;
  name: string;
  location_id: number;
  location_name: string;
  qty_fresh: number;
  qty_day_old: number;
  avg_cost: number | null;
}

/** Finished goods by condition at every location (`v_inventory_valuation`). */
export async function getFreshStock(): Promise<FreshStockRow[]> {
  const res = await supabase
    .from('v_inventory_valuation')
    .select('item_id, sku, name, location_id, location_name, qty_fresh, qty_day_old, avg_cost')
    .eq('item_type', 'finished');
  return unwrap<FreshStockRow[]>('v_inventory_valuation', res);
}

/** Recent day closes, newest first. */
export async function getDayCloses(): Promise<DayClose[]> {
  const res = await supabase.from('day_closes').select('*').order('business_date', { ascending: false }).order('id', { ascending: false }).limit(60);
  return unwrap<DayClose[]>('day_closes', res);
}

/** Day-old markdown as a fraction (0.5 = half price). Owned by the Settings page. */
export async function getMarkdownPct(): Promise<number> {
  const res = await supabase.from('app_settings').select('day_old_markdown_pct').eq('id', 1).single();
  return Number(unwrap<{ day_old_markdown_pct: number }>('app_settings', res).day_old_markdown_pct);
}

export async function getRecentWaste(limit = 15): Promise<WasteSummaryRow[]> {
  const res = await supabase.from('v_waste_summary').select('*').order('business_date', { ascending: false }).limit(limit);
  return unwrap<WasteSummaryRow[]>('v_waste_summary', res);
}

export interface SoldLine {
  item_id: number;
  condition: 'fresh' | 'day_old';
  qty: number;
  line_net: number;
  cogs_total: number;
  sales: { location_id: number; business_date: string };
}

/** Sale lines in a date range, for day-old recovery and the sold side of waste suggestions. */
export async function getSoldLines(from: string, to: string, locationId: number | null): Promise<SoldLine[]> {
  return fetchAll<SoldLine>('sale_lines', (a, b) => {
    let q = supabase
      .from('sale_lines')
      .select('item_id, condition, qty, line_net, cogs_total, sales!inner(location_id, business_date)')
      .gte('sales.business_date', from)
      .lte('sales.business_date', to);
    if (locationId !== null) q = q.eq('sales.location_id', locationId);
    return q.range(a, b);
  });
}

/** Waste rows (ledger grain) in a range. */
export async function getWasteRows(from: string, to: string, locationId: number | null): Promise<WasteSummaryRow[]> {
  return fetchAll<WasteSummaryRow>('v_waste_summary', (a, b) => {
    let q = supabase.from('v_waste_summary').select('*').gte('business_date', from).lte('business_date', to);
    if (locationId !== null) q = q.eq('location_id', locationId);
    return q.range(a, b);
  });
}

export interface WasteSuggestion {
  item_id: number;
  item_name: string;
  location_id: number;
  location_name: string;
  dozens: number;
  wasteUnits: number;
  soldUnits: number;
  wasteCost: number;
  /** Waste units as a share of units made available (sold + wasted) */
  wastePct: number;
}

/**
 * Suggests baking less where overproduction shows up as waste: expired or overproduced units at a shop,
 * measured against what that shop sold of the same item. One dozen per ~12 units wasted per day, at least one.
 */
export function wasteSuggestions(waste: WasteSummaryRow[], sold: SoldLine[], from: string, to: string, shopIds: Set<number>): WasteSuggestion[] {
  const days = Math.max(1, daysBetween(from, to) + 1);
  const soldBy = new Map<string, number>();
  for (const s of sold) {
    const k = `${s.item_id}|${s.sales.location_id}`;
    soldBy.set(k, (soldBy.get(k) ?? 0) + Number(s.qty));
  }
  const acc = new Map<string, WasteSuggestion>();
  for (const w of waste) {
    if (!shopIds.has(w.location_id)) continue;
    if (w.reason_code !== 'EXPIRED' && w.reason_code !== 'OVERPROD') continue;
    const k = `${w.item_id}|${w.location_id}`;
    const cur = acc.get(k) ?? {
      item_id: w.item_id, item_name: w.item_name, location_id: w.location_id, location_name: w.location_name,
      dozens: 0, wasteUnits: 0, soldUnits: soldBy.get(k) ?? 0, wasteCost: 0, wastePct: 0,
    };
    cur.wasteUnits += Number(w.qty);
    cur.wasteCost += Number(w.cost);
    acc.set(k, cur);
  }
  const out: WasteSuggestion[] = [];
  for (const s of acc.values()) {
    const perDay = s.wasteUnits / days;
    if (perDay < 4) continue; // less than a third of a dozen a day is noise
    s.dozens = Math.max(1, Math.round(perDay / 12));
    s.wastePct = s.wasteUnits / Math.max(1, s.wasteUnits + s.soldUnits);
    out.push(s);
  }
  return out.sort((a, b) => b.wasteCost - a.wasteCost);
}

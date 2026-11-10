/** Data access for the forecast, bake plan and accuracy views (tables that rpc.ts does not wrap). Names follow supabase/CONTRACT.md. */
import { RpcError } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import { addDays } from '@/lib/format';
import { fetchAll, unwrap } from '@/features/production/api';
import type { BakePlan, BakePlanLine, DemandForecast, ForecastRun, ProductionOrder, Transfer } from '@/types/domain';

export type ItemRef = { name: string; sku: string; uom: string; item_type: string };

export interface ForecastRow extends DemandForecast {
  items: ItemRef | null;
}

/** The newest forecast run that has rows for `date`, with those rows. */
export async function getForecastForDate(date: string): Promise<{ run: ForecastRun | null; rows: ForecastRow[] }> {
  const latest = unwrap<Array<{ run_id: number }>>(
    'demand_forecasts',
    await supabase.from('demand_forecasts').select('run_id').eq('forecast_date', date).order('run_id', { ascending: false }).limit(1),
  );
  const runId = latest[0]?.run_id;
  if (runId === undefined) return { run: null, rows: [] };
  const [runRes, rowsRes] = await Promise.all([
    supabase.from('forecast_runs').select('*').eq('id', runId).maybeSingle(),
    supabase.from('demand_forecasts').select('*, items(name, sku, uom, item_type)').eq('run_id', runId).eq('forecast_date', date),
  ]);
  return { run: unwrap<ForecastRun | null>('forecast_runs', runRes), rows: unwrap<ForecastRow[]>('demand_forecasts', rowsRes) };
}

export interface SeriesPoint { date: string; actual: number; forecast: number | null }

/**
 * Daily actual units sold next to the forecast made for that day, for one item and shop.
 * Each day uses the newest run made on or before that day (an honest backtest), else the oldest later run.
 */
export async function getActualVsForecast(itemId: number, locationId: number, from: string, to: string): Promise<SeriesPoint[]> {
  const [sales, fcs] = await Promise.all([
    fetchAll<{ qty: number; sales: { business_date: string } }>('sale_lines', (a, b) =>
      supabase
        .from('sale_lines')
        .select('qty, sales!inner(business_date, location_id)')
        .eq('item_id', itemId)
        .eq('sales.location_id', locationId)
        .gte('sales.business_date', from)
        .lte('sales.business_date', to)
        .range(a, b),
    ),
    fetchAll<{ forecast_date: string; qty: number; run_id: number; forecast_runs: { as_of: string } }>('demand_forecasts', (a, b) =>
      supabase
        .from('demand_forecasts')
        .select('forecast_date, qty, run_id, forecast_runs!inner(as_of)')
        .eq('item_id', itemId)
        .eq('location_id', locationId)
        .gte('forecast_date', from)
        .lte('forecast_date', to)
        .range(a, b),
    ),
  ]);

  const actual = new Map<string, number>();
  for (const s of sales) actual.set(s.sales.business_date, (actual.get(s.sales.business_date) ?? 0) + Number(s.qty));

  const best = new Map<string, { as_of: string; run_id: number; qty: number }>();
  for (const f of fcs) {
    const asOf = f.forecast_runs.as_of;
    const cur = best.get(f.forecast_date);
    const eligible = asOf <= f.forecast_date;
    const curEligible = cur ? cur.as_of <= f.forecast_date : false;
    let take = false;
    if (!cur) take = true;
    else if (eligible && !curEligible) take = true;
    else if (eligible && curEligible) take = asOf > cur.as_of || (asOf === cur.as_of && f.run_id > cur.run_id);
    else if (!eligible && !curEligible) take = asOf < cur.as_of;
    if (take) best.set(f.forecast_date, { as_of: asOf, run_id: f.run_id, qty: Number(f.qty) });
  }

  const out: SeriesPoint[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const f = best.get(d);
    const a = actual.get(d);
    if (a === undefined && f === undefined) continue;
    out.push({ date: d, actual: a ?? 0, forecast: f ? f.qty : null });
  }
  return out;
}

// ---------------------------------------------------------------- bake plan
export interface BakePlanLineRow extends BakePlanLine {
  items: ItemRef | null;
}

export async function getBakePlanByDate(date: string): Promise<{ plan: BakePlan | null; lines: BakePlanLineRow[] }> {
  const planRes = await supabase.from('bake_plans').select('*').eq('plan_date', date).maybeSingle();
  const plan = unwrap<BakePlan | null>('bake_plans', planRes);
  if (!plan) return { plan: null, lines: [] };
  const lines = unwrap<BakePlanLineRow[]>(
    'bake_plan_lines',
    await supabase.from('bake_plan_lines').select('*, items(name, sku, uom, item_type)').eq('plan_id', plan.id),
  );
  return { plan, lines };
}

export interface PlanDocs {
  orders: Array<Pick<ProductionOrder, 'id' | 'mo_number' | 'item_id' | 'qty_planned' | 'status'> & { items: { name: string } | null }>;
  transfers: Array<Pick<Transfer, 'id' | 'trf_no' | 'status' | 'to_location_id'>>;
}

/** Production orders and transfers created by releasing a plan. */
export async function getPlanDocs(planId: number): Promise<PlanDocs> {
  const [mo, trf] = await Promise.all([
    supabase.from('production_orders').select('id, mo_number, item_id, qty_planned, status, items(name)').eq('bake_plan_id', planId).order('id'),
    supabase.from('transfers').select('id, trf_no, status, to_location_id').eq('bake_plan_id', planId).order('id'),
  ]);
  if (mo.error) throw new RpcError('production_orders', mo.error.message);
  if (trf.error) throw new RpcError('transfers', trf.error.message);
  return { orders: (mo.data ?? []) as unknown as PlanDocs['orders'], transfers: (trf.data ?? []) as unknown as PlanDocs['transfers'] };
}

/** Promotions active on a date (shown next to the promo lift). */
export async function getPromotionsOn(date: string): Promise<Array<{ id: number; name: string; location_id: number | null; item_id: number | null; expected_lift: number }>> {
  const res = await supabase.from('promotions').select('id, name, location_id, item_id, expected_lift').lte('starts_on', date).gte('ends_on', date);
  return unwrap('promotions', res);
}

// The demand model: expected daily units per shop and item, before noise.
// Pure functions of (date, shop, sku) so the production planner and the opening-balance sizing can reuse them.

import {
  DEMAND, DONUT_SKUS, EVENTS, ITEM_BY_SKU, LOCATIONS, WEEKDAY_INDEX, promotionsBetween,
  type LocCode, type PromoDef,
} from './catalog.js';
import { diffDays, dow, md, monthsBetween, addDays } from './dates.js';

export interface ModelCtx {
  start: string; // first simulated date; growth is measured from here
  promos: PromoDef[];
}

export function makeCtx(start: string, end: string): ModelCtx {
  return { start, promos: promotionsBetween(start, end) };
}

export function isClosed(shop: LocCode, date: string): boolean {
  const loc = LOCATIONS.find((l) => l.code === shop)!;
  return loc.closed_weekdays.includes(dow(date));
}

export function sizeFactor(ctx: ModelCtx, shop: LocCode, date: string): number {
  const base = LOCATIONS.find((l) => l.code === shop)!.size_factor;
  const months = monthsBetween(ctx.start, date);
  const g = shop === 'LEH' ? 1.02 : 1.004;
  return base * Math.pow(g, months);
}

/** Provo is quiet while students are away (May to mid-August) and spikes at back-to-school. */
export function provoSeason(date: string): number {
  const m = md(date);
  if (m >= '05-01' && m <= '08-14') return 0.75;
  if (m >= '08-15' && m <= '08-21') return 0.75 + (0.25 * (diffDays(date, date.slice(0, 5) + '08-15') + 1)) / 7;
  if (m >= '08-22' && m <= '08-29') return 1.3;
  return 1.0;
}

export function itemSeason(date: string, sku: string): number {
  const m = md(date);
  const mon = Number(m.slice(0, 2));
  switch (sku) {
    case 'DN-PSC': {
      if (m < '09-01' || m > '11-30') return 0;
      const since = diffDays(date, date.slice(0, 5) + '09-01');
      let f = Math.min(1, 0.4 + (0.6 * since) / 14);
      if (mon === 10) f *= 1.15;
      if (m >= '11-24') f *= 0.8;
      return f;
    }
    case 'DN-FRT':
      return mon >= 9 && mon <= 11 ? 1.15 : 1;
    case 'DN-GLZ':
      return m >= '09-01' && m <= '11-30' ? 0.96 : 1;
    case 'BV-CBR':
      if (mon >= 6 && mon <= 8) return 1.4;
      if (mon === 5 || mon === 9) return 1.15;
      return 1;
    case 'BV-DRP':
      if (mon >= 10) return 1.2;
      if (mon === 9) return 1.1;
      if (mon >= 6 && mon <= 8) return 0.92;
      return 1;
    case 'BV-CML':
      return mon >= 6 && mon <= 8 ? 1.1 : 1;
    default:
      return 1;
  }
}

export function eventMult(date: string, sku: string): number {
  let mult = 1;
  for (const e of EVENTS) {
    if (!e.covers(date)) continue;
    const applies = e.items === 'all' || (e.items === 'donuts' ? DONUT_SKUS.includes(sku) : e.items.includes(sku));
    if (applies) mult *= e.mult;
  }
  return mult;
}

export function promoFor(ctx: ModelCtx, date: string, shop: LocCode, sku: string): PromoDef | undefined {
  return ctx.promos.find(
    (p) => date >= p.starts_on && date <= p.ends_on && (p.location === null || p.location === shop) && (p.sku === null || p.sku === sku),
  );
}
/** Only "Fritter Friday" has a modelled demand lift; National Donut Day is already a calendar event. */
export function promoLift(ctx: ModelCtx, date: string, shop: LocCode, sku: string): number {
  const p = promoFor(ctx, date, shop, sku);
  return p && p.name === 'Fritter Friday' ? p.expected_lift : 1;
}

export function weekdayIndex(shop: LocCode, date: string): number {
  return WEEKDAY_INDEX[dow(date)];
}

/** Expected units sold per day (all hours), before weather and noise. */
export function expectedDaily(ctx: ModelCtx, shop: LocCode, sku: string, date: string): number {
  const d = DEMAND[sku];
  if (!d || isClosed(shop, date)) return 0;
  const season = itemSeason(date, sku);
  if (season <= 0) return 0;
  return (
    d.base *
    sizeFactor(ctx, shop, date) *
    weekdayIndex(shop, date) *
    d.wd[dow(date)] *
    (d.shop?.[shop] ?? 1) *
    season *
    (shop === 'PRV' ? provoSeason(date) : 1) *
    eventMult(date, sku) *
    promoLift(ctx, date, shop, sku)
  );
}

/** What a planner can know ahead: same as the model but without weather noise. Used for new-season launches. */
export function plannerBaseline(ctx: ModelCtx, shop: LocCode, sku: string, date: string): number {
  return expectedDaily(ctx, shop, sku, date);
}

/** Average expected daily units company-wide over the week starting `date` (used to size opening stock). */
export function weeklyAverageExpected(ctx: ModelCtx, sku: string, date: string): number {
  let t = 0;
  for (let i = 0; i < 7; i++) {
    for (const s of ['PRV', 'ORM', 'LEH'] as LocCode[]) t += expectedDaily(ctx, s, sku, addDays(date, i));
  }
  return t / 7;
}

export function cost(sku: string): number {
  return ITEM_BY_SKU[sku].cost;
}

// A replica of the database's `mrp_weekly(start, 4, false)` (confirmed sales orders only), used to size the scripted
// future orders and to preview the dry run. Mirrors migration 20261116000101_mrp_receipt_timing.sql:
//   gross  = open sales-order qty x BOM (plus purchasable parents themselves), bucketed by requested date (past dates count in week 1)
//   SR     = remaining qty on sent POs, bucketed by expected date (overdue receipts count in week 1)
//   net_w  = peak dated shortage after beginning stock and receipts due by each day; planned supply is pack-rounded

import { BOMS, ITEM_BY_SKU, SUPPLIERS, isPurchased, type LocCode } from './catalog.js';
import type { Ev } from './events.js';
import { addDays } from './dates.js';
import type { PoRec } from './simulate.js';

export interface MrpRow {
  sku: string;
  week: number; // 1..4
  weekStart: string;
  beginning: number;
  gross: number;
  sr: number;
  net: number;
  planned: number;
  requirementDate: string | null;
  orderBy: string | null;
  expedite: boolean;
}

export function mrpPlan(today: string, orders: Ev[], inv: Map<string, number>, pos: PoRec[]): MrpRow[] {
  const weeks = 4;
  const end = addDays(today, weeks * 7 - 1);
  // gross by component and date
  const byDate: Record<string, Map<string, number>> = {};
  const add = (sku: string, d: string, q: number) => {
    if (!isPurchased(ITEM_BY_SKU[sku])) return;
    const m = (byDate[sku] ??= new Map());
    m.set(d, (m.get(d) ?? 0) + q);
  };
  for (const e of orders) {
    if (e.t !== 'so_create') continue;
    const d = e.requested.d < today ? today : e.requested.d;
    if (d > end) continue;
    for (const l of e.lines) {
      add(l.sku, d, l.qty);
      for (const [c, q] of Object.entries(BOMS[l.sku] ?? {})) add(c, d, l.qty * q);
    }
  }
  const out: MrpRow[] = [];
  for (const [sku, dates] of Object.entries(byDate)) {
    const it = ITEM_BY_SKU[sku];
    const lead = it.supplier ? SUPPLIERS.find((s) => s.code === it.supplier)!.quoted_lead_time_days : 0;
    const pack = it.pack ?? 1;
    let poh = 0;
    for (const l of ['KIT', 'PRV', 'ORM', 'LEH'] as LocCode[]) poh += (inv.get(`${l}|${sku}|fresh`) ?? 0) + (inv.get(`${l}|${sku}|day_old`) ?? 0);
    const receipts = new Map<string, number>();
    for (const p of pos) {
      if (p.closed) continue;
      for (const l of p.lines) {
        if (l.sku !== sku) continue;
        const rem = l.qty - l.received - l.cancelled;
        if (rem <= 0 || p.expected >= addDays(today, weeks * 7)) continue;
        const d = p.expected < today ? today : p.expected;
        receipts.set(d, (receipts.get(d) ?? 0) + rem);
      }
    }
    for (let w = 1; w <= weeks; w++) {
      const wStart = addDays(today, (w - 1) * 7);
      const wEnd = addDays(today, w * 7 - 1);
      const days = [...new Set([...dates.keys(), ...receipts.keys()])]
        .filter((d) => d >= wStart && d <= wEnd).sort();
      let g = 0, sr = 0, peak = 0;
      let req: string | null = null;
      for (const d of days) {
        g += dates.get(d) ?? 0;
        sr += receipts.get(d) ?? 0;
        peak = Math.max(peak, g - sr);
        if (req === null && g - sr > poh + 1e-9) req = d;
      }
      const net = Math.max(0, peak - poh);
      const planned = net > 0 ? Math.ceil(net / pack - 1e-9) * pack : 0;
      const orderBy = req ? addDays(req, -lead) : null;
      out.push({ sku, week: w, weekStart: wStart, beginning: poh, gross: g, sr, net, planned, requirementDate: req, orderBy, expedite: !!orderBy && orderBy < today });
      poh = poh + sr + planned - g;
    }
  }
  return out.filter((r) => r.gross > 0);
}

export const planned = (rows: MrpRow[]) => rows.filter((r) => r.planned > 0);

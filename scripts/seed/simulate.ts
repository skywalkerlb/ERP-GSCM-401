// Deterministic day-by-day simulation of the Glazed business. Produces an ordered list of business events
// (see events.ts) while keeping a quantity-only shadow inventory so it never sells or issues more than is on hand.
// Run `npm run simulate` for a dry run with realism statistics (no database).

import {
  BOMS, CUSTOMERS, DEMAND, DONUT_SKUS, FILLED_SKUS, FUTURE_GIFT_ORDERS, FUTURE_ORDERS, FUTURE_PICKUPS, HOUR_CURVES, ITEMS, ITEM_BY_SKU, KIT_SKUS,
  LOCATIONS, OPEN_HOURS, SHOPS, SUPPLIERS, TAX_RATE, isPurchased, thanksgiving,
  type ItemDef, type LocCode, type SupCode, type SupplierDef,
} from './catalog.js';
import type { Cond, Ev, Payment } from './events.js';
import {
  addDays, diffDays, dow, md, month, range, todayDenver, yesterdayDenver, dayOfMonth, daysInMonth, year,
} from './dates.js';
import { Rng, ROOT_SEED } from './rng.js';
import { mrpPlan, planned as plannedRows } from './mrp.js';
import { eventMult, expectedDaily, isClosed, makeCtx, promoFor, weeklyAverageExpected, type ModelCtx } from './model.js';

export interface SimOptions {
  end: string;
  days: number;
  seed: number;
}

export const ORDERING_COST = 45;
export const HOLDING_RATE = 0.25;
export const SERVICE_Z = 1.65;
export const BAKE_BUFFER = 0.08;
export const DAY_OLD_MARKDOWN = 0.5;
const DAY_OLD_SHARE = 0.1;
const MAX_COVER_DAYS = 60;
const REVIEW_DAYS = 7;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const ceilTo = (n: number, k: number) => Math.ceil(n / k - 1e-9) * k;

export interface PoRec {
  key: string;
  supplier: SupCode;
  sent: string;
  expected: string;
  lines: Array<{ sku: string; qty: number; cost: number; received: number; cancelled: number }>;
  firstReceipt?: string;
  lastReceipt?: string;
  closed?: boolean;
  forced?: boolean;
  arrivalOverride?: string;
  receipts: Array<{ date: string; rcpt: string; amount: number; due: string }>;
  receiptLines: Array<{ date: string; sku: string; qty: number }>;
}

export interface Scenario {
  /** PO (supplier -> sent date) that must arrive after the end of the simulation (overdue / open). */
  lateOn: Partial<Record<SupCode, { sent: string; arriveOn: string }>>;
  /** POs to force-create (supplier -> date). */
  forceCreate: Partial<Record<SupCode, string>>;
  /** Sweet Peak crisis: purchasing pauses new Sweet Peak orders from this date; a small top-up PO goes out on topUpOn. */
  /** Sweet Peak rationing: from this date an item is neither ordered nor shipped; the receipt on that date is trimmed by `trim`. */
  swpCut?: Record<string, { from: string; trim: number }>;
  topUpOn?: string;
  crisis?: boolean;
}

export interface DayRec {
  date: string;
  shop: LocCode;
  revenue: number;
  units: number;
  donuts: number;
  lost: number;
  lostRevenue: number;
  tickets: number;
}

export interface SimResult {
  opts: SimOptions;
  start: string;
  end: string;
  today: string;
  ctx: ModelCtx;
  events: Ev[];
  todayEvents: Ev[];
  futureEvents: Ev[];
  daily: DayRec[];
  pos: PoRec[];
  initialRop: Record<string, number>;
  inv: Map<string, number>;
  usageSales: Map<string, number[]>; // DB-style usage (parent sales x qty_per), per day index
  usageActual: Map<string, number[]>;
  production: Array<{ date: string; sku: string; planned: number; started: number; good: number; scrap: number; rework: number; scrapByReason: Record<string, number> }>;
  waste: Array<{ date: string; loc: LocCode; sku: string; cond: Cond; qty: number; reason: string }>;
  returns: number;
  exchanges: number;
  salesOrders: { total: number; cancelled: number };
  apBills: Array<{ rcpt: string; supplier: SupCode; billed: string; due: string; amount: number; paidOn?: string }>;
  ledgerRows: number;
  lostUnits: Record<string, number>;
  expenses: Array<{ date: string; account: string; amount: number }>;
  supplierLeads: Record<string, number[]>;
  futureScale: number;
  cuts: Array<{ date: string; comp: string; sku: string; units: number }>;
  kitStart: Record<string, number[]>;
}

// ------------------------------------------------------------------------------------------------

class Sim {
  readonly start: string;
  readonly end: string;
  readonly today: string;
  readonly ctx: ModelCtx;
  readonly root: Rng;
  inv = new Map<string, number>();
  events: Ev[] = [];
  dayBuf: Ev[] = [];
  today_: Ev[] = [];
  future: Ev[] = [];
  sched = new Map<string, Array<() => void>>();
  daily: DayRec[] = [];
  pos: PoRec[] = [];
  poSeq = 0;
  mapSeq = 0;
  keySeq = 0;
  dayIdx = 0;
  nDays: number;
  usageSales = new Map<string, number[]>();
  usageActual = new Map<string, number[]>();
  synth = new Map<string, number>();
  demHist = new Map<string, Map<string, number>>(); // shop|sku -> date -> demand (walk-in, incl. lost)
  shopUse = new Map<string, number[]>(); // shop|sku -> daily usage
  production: SimResult['production'] = [];
  waste: SimResult['waste'] = [];
  returns = 0;
  exchanges = 0;
  soTotal = 0;
  soCancelled = 0;
  soByDate = new Map<string, Array<{ key: string; shop: LocCode; lines: Array<{ sku: string; qty: number }>; hour: number; cancelled: boolean; customer: string }>>();
  apBills: SimResult['apBills'] = [];
  ledgerRows = 0;
  lostUnits: Record<string, number> = {};
  expenses: SimResult['expenses'] = [];
  supplierLeads: Record<string, number[]> = {};
    initialRop: Record<string, number> = {};
  curDate = '';
  rSales: Rng;
  rProd: Rng;
  rSup: Rng;
  rMisc: Rng;
  rOrd: Rng;
  priceNoise = new Map<string, number>();
  strat = new Map<string, number>();
  /** Low-discrepancy yes/no draw so each supplier's long-run rates match its profile closely (no unlucky clumps). */
  stratified(stream: string, p: number): boolean {
    const n = (this.strat.get(stream) ?? 0) + 1;
    this.strat.set(stream, n);
    let off = 0;
    for (let i = 0; i < stream.length; i++) off = (off * 31 + stream.charCodeAt(i)) % 997;
    const u = (off / 997 + n * 0.6180339887498949) % 1;
    return u < p;
  }

  constructor(public opts: SimOptions, public scenario: Scenario) {
    this.end = opts.end;
    this.start = addDays(opts.end, -(opts.days - 1));
    this.today = addDays(opts.end, 1);
    this.nDays = opts.days + 1;
    this.ctx = makeCtx(this.start, addDays(this.end, 1));
    this.root = new Rng(opts.seed);
    this.rSales = this.root.fork('sales');
    this.rProd = this.root.fork('prod');
    this.rSup = this.root.fork('supply');
    this.rMisc = this.root.fork('misc');
    this.rOrd = this.root.fork('orders');
  }

  // ---- shadow inventory -------------------------------------------------------------------------
  private k(loc: LocCode, sku: string, cond: Cond) {
    return `${loc}|${sku}|${cond}`;
  }
  qty(loc: LocCode, sku: string, cond: Cond = 'fresh'): number {
    return this.inv.get(this.k(loc, sku, cond)) ?? 0;
  }
  add(loc: LocCode, sku: string, cond: Cond, delta: number) {
    const key = this.k(loc, sku, cond);
    const v = r3((this.inv.get(key) ?? 0) + delta);
    if (v < -0.0005) throw new Error(`shadow inventory negative: ${key} ${v} (${this.curDate})`);
    this.inv.set(key, Math.max(0, v));
    this.ledgerRows++;
  }
  total(sku: string): number {
    let t = 0;
    for (const l of LOCATIONS) t += this.qty(l.code, sku, 'fresh') + this.qty(l.code, sku, 'day_old');
    return t;
  }

  // ---- event plumbing ---------------------------------------------------------------------------
  emit(ev: Ev) {
    this.dayBuf.push(ev);
  }
  at(date: string, fn: () => void) {
    const a = this.sched.get(date) ?? [];
    a.push(fn);
    this.sched.set(date, a);
  }
  flushDay() {
    // stable sort by minute so time order is respected (generation order already respects stock causality)
    const idx = this.dayBuf.map((e, i) => [e, i] as const);
    idx.sort((a, b) => a[0].m - b[0].m || a[1] - b[1]);
    for (const [e] of idx) this.events.push(e);
    this.dayBuf = [];
  }
  key(prefix: string) {
    return `${prefix}${++this.keySeq}`;
  }

  // ---- usage tracking ---------------------------------------------------------------------------
  private bump(m: Map<string, number[]>, sku: string, qty: number) {
    let a = m.get(sku);
    if (!a) {
      a = new Array(this.nDays).fill(0);
      m.set(sku, a);
    }
    a[this.dayIdx] += qty;
  }
  /** Record a sale of `qty` units of `sku` (DB-style usage counts parent sales x qty_per for components). */
  recordSaleUsage(shop: LocCode, sku: string, qty: number) {
    this.bump(this.usageSales, sku, qty);
    this.bumpShop(shop, sku, qty);
    const bom = BOMS[sku];
    if (bom) {
      for (const [c, q] of Object.entries(bom)) {
        this.bump(this.usageSales, c, qty * q);
        if (KIT_SKUS.includes(sku)) {
          this.bump(this.usageActual, c, qty * q);
          this.bumpShop(shop, c, qty * q);
        }
      }
    } else {
      this.bump(this.usageActual, sku, qty);
    }
  }
  private bumpShop(shop: LocCode, sku: string, qty: number) {
    const key = `${shop}|${sku}`;
    let a = this.shopUse.get(key);
    if (!a) {
      a = new Array(this.nDays).fill(0);
      this.shopUse.set(key, a);
    }
    a[this.dayIdx] += qty;
  }
  /** Mean and sd of daily actual usage over a trailing window. */
  usageStats(sku: string, window = 90): { mean: number; sd: number } {
    const a = this.usageActual.get(sku) ?? [];
    const n = Math.min(window, this.dayIdx); // completed days only
    const vals: number[] = [];
    for (let i = this.dayIdx - n; i < this.dayIdx; i++) vals.push(a[i] ?? 0);
    const synth = this.synth.get(sku) ?? 0;
    // pad with the synthetic expectation until we have two weeks of history
    while (vals.length < 14) vals.push(synth * this.rMisc.range(0.85, 1.15));
    const mean = vals.reduce((x, y) => x + y, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, vals.length - 1));
    return { mean, sd };
  }
  shopUsage(shop: LocCode, sku: string, window = 14): number {
    const a = this.shopUse.get(`${shop}|${sku}`) ?? [];
    const n = Math.min(window, this.dayIdx);
    if (n < 3) return this.synthShop(shop, sku);
    let t = 0;
    for (let i = this.dayIdx - n; i < this.dayIdx; i++) t += a[i] ?? 0;
    return t / n;
  }
  synthShop(shop: LocCode, sku: string): number {
    let t = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(this.start, i);
      const direct = expectedDaily(this.ctx, shop, sku, d);
      let comp = 0;
      for (const kit of KIT_SKUS) if (BOMS[kit][sku]) comp += expectedDaily(this.ctx, shop, kit, d) * BOMS[kit][sku];
      t += direct + comp;
    }
    return t / 7;
  }

  // ---- prices ------------------------------------------------------------------------------------
  unitCost(sku: string, date: string): number {
    const base = ITEM_BY_SKU[sku].cost;
    const m = md(date);
    let mult = 1;
    // small monthly drift for everything, deterministic
    const nk = `${sku}|${date.slice(0, 7)}`;
    if (!this.priceNoise.has(nk)) this.priceNoise.set(nk, this.rSup.range(-0.015, 0.015));
    mult *= 1 + (this.priceNoise.get(nk) ?? 0);
    switch (sku) {
      case 'RM-FLR':
        if (m >= '09-01') mult *= 1.08;
        break;
      case 'RM-SUG':
        if (m >= '07-15') mult *= 1.03;
        break;
      case 'RM-EGG':
        if (m >= '08-10') mult *= 1.07;
        break;
      case 'RM-BTR': {
        const mon = month(date);
        mult *= 1 + 0.06 * Math.sin(mon * 1.7);
        break;
      }
      case 'RM-APL':
        mult *= m >= '09-01' && m <= '10-31' ? 0.88 : m >= '04-01' && m <= '08-31' ? 1.12 : 1;
        break;
      case 'RM-CBN':
        if (m >= '10-01') mult *= 1.05;
        break;
      case 'RM-OIL':
        if (m >= '06-01' && m <= '08-31') mult *= 1.04;
        break;
    }
    return r2(base * mult * 100) / 100 === 0 ? base : Math.round(base * mult * 10000) / 10000;
  }

  // ---- opening balances ---------------------------------------------------------------------------
  opening() {
    const lines: Array<{ sku: string; loc: LocCode; qty: number; cost: number }> = [];
    for (const it of ITEMS) {
      const avg = this.expectedUsage(it.sku);
      this.synth.set(it.sku, avg);
      if (!isPurchased(it) || avg <= 0) {
        if (isPurchased(it) && it.sku === 'RM-PSS' || it.sku === 'RM-PMP') {
          /* seasonal ingredients start at a small stock */
        }
      }
    }
    for (const it of ITEMS) {
      if (!isPurchased(it)) continue;
      const sup = SUPPLIERS.find((s) => s.code === it.supplier)!;
      const pack = it.pack ?? 1;
      const avg = this.synth.get(it.sku) ?? 0;
      let kitQty: number;
      if (avg > 0.01) kitQty = ceilTo(avg * (sup.quoted_lead_time_days + 9), pack);
      else kitQty = pack; // out-of-season ingredient: one pack
      if (it.sku === 'RM-PMP' || it.sku === 'RM-PSS') kitQty = pack * 2;
      lines.push({ sku: it.sku, loc: 'KIT', qty: kitQty, cost: it.cost });
      this.add('KIT', it.sku, 'fresh', kitQty);
    }
    // shop stock for resale items, cups, lids, bulk beans, gift boxes: about 3 days
    for (const shop of SHOPS) {
      for (const sku of SHOP_STOCKED) {
        const it = ITEM_BY_SKU[sku];
        const par = this.shopPar(shop, sku, 3);
        const q = this.xferRound(sku, par);
        if (q <= 0) continue;
        // opening stock at shops is posted as opening balance as well
        lines.push({ sku, loc: shop, qty: q, cost: it.cost });
        this.add(shop, sku, 'fresh', q);
      }
    }
    this.emit({ d: this.start, m: 5, t: 'opening', lines });
    this.flushDay();
    // initial stored reorder points: planner math for purchased items, half a day of demand (in dozens) for made items
    for (const it of ITEMS) {
      if (isPurchased(it)) {
        const p = this.planFor(it.sku, this.start);
        this.initialRop[it.sku] = Math.max(it.pack ?? 1, Math.ceil(p.rop));
      } else {
        const avg = weeklyAverageExpected(this.ctx, it.sku, this.start);
        const seasonAvg = DEMAND[it.sku] ? Math.max(avg, DEMAND[it.sku].base * 2.35 * 0.8) : avg;
        this.initialRop[it.sku] = it.type === 'finished' ? Math.max(12, Math.ceil((seasonAvg * 0.5) / 12) * 12) : Math.max(2, Math.ceil(seasonAvg * 2));
      }
    }
  }

  expectedUsage(sku: string): number {
    const it = ITEM_BY_SKU[sku];
    let direct = 0;
    if (DEMAND[sku]) direct += weeklyAverageExpected(this.ctx, sku, this.start);
    let viaParents = 0;
    for (const [parent, bom] of Object.entries(BOMS)) {
      if (!bom[sku]) continue;
      // use a mid-season week for seasonal parents so ROP reflects a normal week
      viaParents += weeklyAverageExpected(this.ctx, parent, this.start) * bom[sku];
    }
    if (it.sku === 'RM-PMP' || it.sku === 'RM-PSS') {
      viaParents = 0;
    }
    return (direct + viaParents) * (it.type === 'raw' || it.type === 'packaging' ? 1.1 : 1);
  }

  // ---- shop par / transfer helpers ----------------------------------------------------------------
  shopPar(shop: LocCode, sku: string, coverDays: number): number {
    return Math.max(this.shopUsage(shop, sku), this.synthShop(shop, sku) * 0.5) * coverDays * 1.3;
  }
  xferRound(sku: string, q: number): number {
    const step: Record<string, number> = { 'BV-CBR': 6, 'BV-CML': 6, 'RS-BNS': 6, 'RS-MUG': 2, 'RM-CBN': 5, 'PK-CUP': 100, 'PK-LID': 100, 'PK-GBX': 5 };
    return ceilTo(Math.max(0, q), step[sku] ?? 1);
  }

  // ---- main loop ---------------------------------------------------------------------------------
  run(): SimResult {
    const days = range(this.start, this.end);
    this.dayIdx = 0;
    this.curDate = this.start;
    this.opening();
    for (const date of days) {
      this.curDate = date;
      this.runDay(date);
      this.dayIdx++;
    }
    // Overdue / open bill adjustments and today's morning run (production + transfers) so shops have stock.
    for (const sku of ['RM-CHC', 'RM-MPL', 'RM-RSP', 'RM-CRM']) (this.kitStart[sku] ??= [])[this.dayIdx] = this.qty('KIT', sku);
    this.postProcessAp();
    this.curDate = this.today;
    this.dayBuf = [];
    this.productionPhase(this.today);
    this.transferPhase(this.today);
    this.today_ = this.dayBuf.slice();
    this.today_.sort((a, b) => a.m - b.m);
    this.dayBuf = [];
    this.futureOrders();
    return this.result();
  }

  runDay(date: string) {
    const d = this.dayBuf;
    d.length = 0;
    for (const sku of ['RM-CHC', 'RM-MPL', 'RM-RSP', 'RM-CRM']) (this.kitStart[sku] ??= [])[this.dayIdx] = this.qty('KIT', sku);
    this.placeSalesOrders(date);
    this.productionPhase(date);
    this.transferPhase(date);
    this.fulfillOrders(date);
    for (const shop of SHOPS) this.shopSales(date, shop);
    // scheduled receipts, closes, payments
    for (const fn of this.sched.get(date) ?? []) fn();
    this.sched.delete(date);
    for (const shop of SHOPS) this.closeDay(date, shop);
    this.wasteAndCounts(date);
    this.endScenario(date);
    this.expensePhase(date);
    this.purchasing(date);
    this.flushDay();
  }

  // ---- forecast ----------------------------------------------------------------------------------
  forecast(shop: LocCode, sku: string, date: string): number {
    if (isClosed(shop, date)) return 0;
    const season = (expectedDaily(this.ctx, shop, sku, date));
    if (season <= 0) return 0;
    const hist = this.demHist.get(`${shop}|${sku}`);
    const obs: number[] = [];
    if (hist) {
      for (let w = 1; w <= 6; w++) {
        const v = hist.get(addDays(date, -7 * w));
        if (v !== undefined) obs.push(v);
      }
    }
    const known = Math.pow(eventMult(date, sku), 0.85) * (promoFor(this.ctx, date, shop, sku)?.name === 'Fritter Friday' ? 1.4 : 1);
    if (obs.length >= 2 && !this.newSeason(sku, date)) {
      const w = [0.22, 0.2, 0.18, 0.16, 0.13, 0.11].slice(0, obs.length);
      const wsum = w.reduce((a, b) => a + b, 0);
      const base = obs.reduce((acc, v, i) => acc + v * w[i], 0) / wsum;
      return base * known;
    }
    // launch of a seasonal item or no history: planner uses a conservative estimate
    return expectedDaily(this.ctx, shop, sku, date) * 0.88;
  }
  private newSeason(sku: string, date: string): boolean {
    const it = ITEM_BY_SKU[sku];
    if (!it.seasonStart) return false;
    const s = date.slice(0, 5) + it.seasonStart;
    const since = diffDays(date, s);
    return since >= 0 && since < 21;
  }

  // ---- production --------------------------------------------------------------------------------
  productionPhase(date: string) {
    const rng = this.rProd.fork('prod:' + date);
    let idx = 0;
    for (const sku of DONUT_SKUS) {
      const it = ITEM_BY_SKU[sku];
      const fcShop: Record<string, number> = {};
      const soShop: Record<string, number> = {};
      let tot = 0;
      for (const shop of SHOPS) {
        fcShop[shop] = this.forecast(shop, sku, date) * (1 + BAKE_BUFFER);
        const so = (this.soByDate.get(date) ?? []).filter((o) => o.shop === shop && !o.cancelled).reduce((a, o) => a + (o.lines.find((l) => l.sku === sku)?.qty ?? 0), 0);
        soShop[shop] = so * 1.03;
        tot += fcShop[shop] + soShop[shop];
      }
      if (tot < 1) {
        continue;
      }
      let planned = ceilTo(tot, 12);
      // component feasibility at the kitchen
      const bom = BOMS[sku];
      let maxStart = Infinity;
      let limiter = '';
      for (const [c, q] of Object.entries(bom)) {
        const m = this.qty('KIT', c) / q;
        if (m < maxStart) {
          maxStart = m;
          limiter = c;
        }
      }
      if (maxStart < planned) {
        this.cuts.push({ date, comp: limiter, sku, units: planned - Math.floor(maxStart / 12) * 12 });
        this.lostUnits['_short_' + limiter] = (this.lostUnits['_short_' + limiter] ?? 0) + (planned - Math.floor(maxStart / 12) * 12);
        planned = Math.floor(maxStart / 12) * 12;
      }
      if (planned < 12) {
        this.lostUnits['_prod_' + sku] = (this.lostUnits['_prod_' + sku] ?? 0) + tot;
        continue;
      }
      const startMin = 180 + idx * 12 + rng.int(0, 5);
      const doneMin = startMin + 75 + rng.int(0, 20);
      const key = this.key('MO');
      this.emit({ d: date, m: 150 + idx, t: 'mo_create', key, sku, qty: planned });
      this.emit({ d: date, m: startMin, t: 'mo_start', key, qty: planned });
      for (const [c, q] of Object.entries(bom)) {
        this.add('KIT', c, 'fresh', -planned * q);
        this.bump(this.usageActual, c, planned * q);
      }
      // yield, scrap and rework
      const meanYield: Record<string, number> = { 'DN-GLZ': 0.972, 'DN-CHF': 0.963, 'DN-MPL': 0.955, 'DN-RSP': 0.943, 'DN-BCR': 0.945, 'DN-FRT': 0.935, 'DN-PSC': 0.958 };
      let y = rng.normal(meanYield[sku], 0.011);
      if (rng.chance(0.04)) y -= 0.05; // a bad batch now and then
      y = Math.min(0.985, Math.max(0.89, y));
      const scrap = Math.round(planned * (1 - y));
      const good = planned - scrap;
      const defects: Array<{ kind: 'scrap' | 'rework'; qty: number; reason: string }> = [];
      const scrapByReason: Record<string, number> = {};
      const reasons = FILLED_SKUS.includes(sku)
        ? { FILL_LEAK: 0.4, UNDERPROOF: 0.2, MISSHAPEN: 0.2, GLAZE_DEFECT: 0.2 }
        : sku === 'DN-FRT'
          ? { MISSHAPEN: 0.45, UNDERPROOF: 0.25, GLAZE_DEFECT: 0.3 }
          : { UNDERPROOF: 0.35, MISSHAPEN: 0.3, GLAZE_DEFECT: 0.35 };
      let left = scrap;
      const rk = Object.keys(reasons);
      const rw = Object.values(reasons);
      while (left > 0) {
        const r = rng.weighted(rk, rw);
        const q = Math.min(left, Math.max(1, Math.round(scrap * rng.range(0.3, 0.7))));
        const ex = defects.find((x) => x.kind === 'scrap' && x.reason === r);
        if (ex) ex.qty += q;
        else defects.push({ kind: 'scrap', qty: q, reason: r });
        scrapByReason[r] = (scrapByReason[r] ?? 0) + q;
        left -= q;
      }
      const rework = Math.min(good, Math.round(good * rng.range(0.008, 0.035)));
      if (rework > 0) defects.push({ kind: 'rework', qty: rework, reason: rng.weighted(['GLAZE_DEFECT', 'MISSHAPEN', 'UNDERPROOF'], [0.6, 0.25, 0.15]) });
      this.emit({ d: date, m: doneMin, t: 'mo_complete', key, good, defects });
      this.add('KIT', sku, 'fresh', good);
      this.production.push({ date, sku, planned, started: planned, good, scrap, rework, scrapByReason });
      // remember per-shop plan for allocation
      this.lastPlan.set(sku, { fcShop, soShop, good });
      idx++;
    }
  }
  kitStart: Record<string, number[]> = {};
  cuts: Array<{ date: string; comp: string; sku: string; units: number }> = [];
  lastPlan = new Map<string, { fcShop: Record<string, number>; soShop: Record<string, number>; good: number }>();

  // ---- transfers ---------------------------------------------------------------------------------
  transferPhase(date: string) {
    const lines: Record<string, Array<{ sku: string; qty: number }>> = { PRV: [], ORM: [], LEH: [] };
    for (const sku of DONUT_SKUS) {
      const p = this.lastPlan.get(sku);
      if (!p || this.qty('KIT', sku) <= 0) continue;
      const good = this.qty('KIT', sku);
      let remaining = good;
      const alloc: Record<string, number> = { PRV: 0, ORM: 0, LEH: 0 };
      for (const s of SHOPS) {
        const so = Math.min(Math.ceil(p.soShop[s] / 1.03), remaining);
        alloc[s] += so;
        remaining -= so;
      }
      const fcSum = SHOPS.reduce((a, s) => a + p.fcShop[s], 0);
      if (fcSum > 0 && remaining > 0) {
        const shares = SHOPS.map((s) => ({ s, x: (remaining * p.fcShop[s]) / fcSum }));
        let given = 0;
        for (const sh of shares) {
          const f = Math.floor(sh.x);
          alloc[sh.s] += f;
          given += f;
        }
        let rest = remaining - given;
        const order = [...shares].sort((a, b) => (b.x % 1) - (a.x % 1));
        for (let i = 0; rest > 0; i = (i + 1) % order.length) {
          if (p.fcShop[order[i].s] <= 0 && fcSum > 0) continue;
          alloc[order[i].s] += 1;
          rest--;
        }
      } else if (remaining > 0) {
        alloc.ORM += remaining; // no forecast anywhere: should not happen
      }
      for (const s of SHOPS) if (alloc[s] > 0) lines[s].push({ sku, qty: alloc[s] });
    }
    this.lastPlan.clear();
    const reserved: Record<string, number> = {};
    // resale / consumable top-ups: scheduled Monday and Thursday, plus emergency top-ups
    for (const shop of SHOPS) {
      const scheduled = dow(date) === 1 || dow(date) === 4;
      const cover = dow(date) === 4 ? 4 : 3.5;
      for (const sku of SHOP_STOCKED) {
        const avg = Math.max(this.shopUsage(shop, sku), this.synthShop(shop, sku) * 0.5);
        const onHand = this.qty(shop, sku);
        const low = onHand < avg * 1.2;
        if (!scheduled && !low) continue;
        const want = this.xferRound(sku, this.shopPar(shop, sku, cover) - onHand);
        const step = this.xferRound(sku, 1) || 1;
        const avail = this.qty('KIT', sku) - (reserved[sku] ?? 0);
        const q = Math.min(want, Math.floor(avail / step + 1e-9) * step);
        if (q > 0 && want > 0) {
          lines[shop].push({ sku, qty: q });
          reserved[sku] = (reserved[sku] ?? 0) + q;
        }
      }
    }
    let n = 0;
    for (const shop of SHOPS) {
      if (lines[shop].length === 0) continue;
      if (isClosed(shop, date)) continue;
      const key = this.key('TRF');
      for (const l of lines[shop]) {
        this.add('KIT', l.sku, 'fresh', -l.qty);
        this.add(shop, l.sku, 'fresh', l.qty);
      }
      this.emit({ d: date, m: 368 + n * 4, t: 'transfer', key, from: 'KIT', to: shop, lines: lines[shop] });
      n++;
    }
  }

  // ---- shop sales --------------------------------------------------------------------------------
  shopSales(date: string, shop: LocCode) {
    if (isClosed(shop, date)) return;
    const rng = this.rSales.fork(`sales:${date}:${shop}`);
    const sunday = dow(date) === 0;
    const open = sunday ? OPEN_HOURS.sunday : OPEN_HOURS.weekday;
    // hourly register batches until noon, then two-hour blocks (keeps the ledger near 100k rows)
    const buckets: Array<{ from: number; to: number }> = [];
    for (let hh = open.from; hh < open.to; ) {
      const span = hh >= 12 && hh + 2 <= open.to ? 2 : 1;
      buckets.push({ from: hh, to: hh + span });
      hh += span;
    }
    let dayFactor = rng.gamma(80, 1 / 80);
    if (rng.chance(0.03)) dayFactor *= 0.65; // a storm day
    else if (rng.chance(0.02)) dayFactor *= 1.3; // a nearby event
    const sellables = Object.keys(DEMAND);
    const dailyMean: Record<string, number> = {};
    for (const sku of sellables) dailyMean[sku] = expectedDaily(this.ctx, shop, sku, date) * dayFactor;
    const rec: DayRec = { date, shop, revenue: 0, units: 0, donuts: 0, lost: 0, lostRevenue: 0, tickets: 0 };
    const dayDemand: Record<string, number> = {};
    for (const bk of buckets) {
      const h = bk.from;
      const lines: Array<{ sku: string; qty: number; cond: Cond; disc: number }> = [];
      let est = 0;
      let units = 0;
      for (const sku of sellables) {
        if (dailyMean[sku] <= 0) continue;
        const it = ITEM_BY_SKU[sku];
        const curve = HOUR_CURVES[DEMAND[sku].curve];
        let wsum = 0;
        for (let hh = open.from; hh < open.to; hh++) wsum += curve[hh - 6];
        let wb = 0;
        for (let hh = bk.from; hh < bk.to; hh++) wb += curve[hh - 6];
        const demand = rng.poissonGamma(dailyMean[sku] * (wb / wsum), 14 * (bk.to - bk.from));
        if (demand <= 0) continue;
        dayDemand[sku] = (dayDemand[sku] ?? 0) + demand;
        const promo = promoFor(this.ctx, date, shop, sku);
        const disc = promo ? promo.discount_pct / 100 : 0;
        const isDonut = DONUT_SKUS.includes(sku);
        let freshSold = 0;
        let oldSold = 0;
        let lost = 0;
        if (KIT_SKUS.includes(sku)) {
          const bom = BOMS[sku];
          let avail = Infinity;
          for (const [c, q] of Object.entries(bom)) avail = Math.min(avail, Math.floor(this.qty(shop, c) / q + 1e-9));
          freshSold = Math.min(demand, avail);
          lost = demand - freshSold;
          if (freshSold > 0) for (const [c, q] of Object.entries(bom)) this.add(shop, c, 'fresh', -freshSold * q);
        } else if (isDonut) {
          const pool = this.qty(shop, sku, 'day_old');
          const wantOld = h < 11 ? Math.min(pool, Math.round(demand * DAY_OLD_SHARE * 1.5)) : 0;
          const fresh = this.qty(shop, sku, 'fresh');
          freshSold = Math.min(fresh, demand - wantOld);
          let unmet = demand - wantOld - freshSold;
          const extraOld = h < 14 ? Math.min(pool - wantOld, unmet) : 0;
          oldSold = wantOld + extraOld;
          unmet -= extraOld;
          lost = unmet;
          if (freshSold > 0) this.add(shop, sku, 'fresh', -freshSold);
          if (oldSold > 0) this.add(shop, sku, 'day_old', -oldSold);
        } else {
          freshSold = Math.min(demand, this.qty(shop, sku));
          lost = demand - freshSold;
          if (freshSold > 0) this.add(shop, sku, 'fresh', -freshSold);
        }
        if (lost > 0) {
          this.lostUnits[sku] = (this.lostUnits[sku] ?? 0) + lost;
          rec.lost += lost;
          rec.lostRevenue += lost * (it.price ?? 0);
        }
        if (freshSold > 0) {
          lines.push({ sku, qty: freshSold, cond: 'fresh', disc });
          est += freshSold * (it.price ?? 0) * (1 - disc);
          units += freshSold;
          this.recordSaleUsage(shop, sku, freshSold);
          if (isDonut) rec.donuts += freshSold;
        }
        if (oldSold > 0) {
          lines.push({ sku, qty: oldSold, cond: 'day_old', disc: 0 });
          est += oldSold * (it.price ?? 0) * (1 - DAY_OLD_MARKDOWN);
          units += oldSold;
          this.recordSaleUsage(shop, sku, oldSold);
          rec.donuts += oldSold;
        }
      }
      if (lines.length === 0) continue;
      const tickets = Math.max(1, rng.poisson(units / 2.4));
      const method = rng.weighted(['card', 'cash', 'other'] as const, [0.68, 0.22, 0.1]);
      const total = est * (1 + TAX_RATE);
      const payment: Payment = { method, tendered: method === 'cash' ? Math.ceil((total + 5) / 20) * 20 : null };
      const key = this.key('S');
      const minute = h * 60 + (bk.to - bk.from) * 30 + rng.int(-10, 10);
      this.emit({ d: date, m: minute, t: 'sale', key, loc: shop, lines, payment, tickets });
      rec.revenue += est;
      rec.units += units;
      rec.tickets += tickets;
      this.afterSale(date, shop, key, lines, minute, rng);
    }
    for (const sku of sellables) {
      if (dailyMean[sku] > 0) {
        const hk = `${shop}|${sku}`;
        const m = this.demHist.get(hk) ?? new Map<string, number>();
        m.set(date, dayDemand[sku] ?? 0);
        this.demHist.set(hk, m);
      }
    }
    this.daily.push(rec);
  }

  /** Returns and exchanges against a register batch (about 0.3% of lines). */
  afterSale(date: string, shop: LocCode, saleKey: string, lines: Array<{ sku: string; qty: number; cond: Cond; disc: number }>, minute: number, rng: Rng) {
    for (const l of lines) {
      if (KIT_SKUS.includes(l.sku)) continue;
      if (!rng.chance(0.0032 * Math.min(3, Math.max(1, l.qty / 6)))) continue;
      const it = ITEM_BY_SKU[l.sku];
      const isDonut = DONUT_SKUS.includes(l.sku);
      const exchange = rng.chance(0.4);
      const m = Math.min(18 * 60 + 15, minute + rng.int(30, 120));
      if (isDonut) {
        const reason = rng.weighted(['QUALITY_STALE', 'FOREIGN_OBJ', 'WRONG_ITEM'], [0.62, 0.1, 0.28]);
        const ex = exchange && this.qty(shop, l.sku) >= 1;
        this.emit({
          d: date, m, t: 'return', saleKey, loc: shop, refundMethod: 'card',
          lines: [{ sku: l.sku, cond: l.cond, qty: 1, disposition: 'quality_failure', reason }],
          exchange: ex ? [{ sku: l.sku, qty: 1 }] : [],
        });
        if (ex) {
          this.add(shop, l.sku, 'fresh', -1);
          this.recordSaleUsage(shop, l.sku, 1);
          this.exchanges++;
        } else this.returns++;
      } else if (it.type === 'resale') {
        const restock = rng.chance(0.6);
        if (restock) {
          const reason = rng.weighted(['CHANGED_MIND', 'WRONG_ITEM'], [0.7, 0.3]);
          this.emit({ d: date, m, t: 'return', saleKey, loc: shop, refundMethod: 'card', lines: [{ sku: l.sku, cond: l.cond, qty: 1, disposition: 'restock', reason }], exchange: [] });
          this.add(shop, l.sku, 'fresh', 1);
          this.returns++;
        } else {
          const reason = l.sku === 'BV-CML' ? 'QUALITY_STALE' : 'FOREIGN_OBJ';
          this.emit({ d: date, m, t: 'return', saleKey, loc: shop, refundMethod: 'card', lines: [{ sku: l.sku, cond: l.cond, qty: 1, disposition: 'quality_failure', reason }], exchange: [] });
          this.returns++;
        }
      }
    }
  }

  // ---- sales orders (catering and pickup) -----------------------------------------------------------
  placeSalesOrders(date: string) {
    const rng = this.rOrd.fork('place:' + date);
    for (const c of CUSTOMERS) {
      if (c.ordersPerMonth <= 0) continue;
      const biz = c.kind === 'business';
      const wd = dow(date);
      let p = (c.ordersPerMonth * 1.2) / 30.4;
      if (biz) p = wd >= 1 && wd <= 5 ? (c.ordersPerMonth * 1.2) / 21.7 : 0;
      else p *= wd === 0 || wd === 6 ? 1.5 : 0.9;
      if (!rng.chance(p)) continue;
      const home = c.home ?? 'PRV';
      let req = addDays(date, biz ? rng.int(2, 9) : rng.int(1, 4));
      for (let i = 0; i < 3 && (dow(req) === 0 || isClosed(home, req)); i++) req = addDays(req, 1);
      if (req > this.end) continue; // orders after the window are scripted in futureOrders()
      const nLines = biz ? rng.int(2, 4) : rng.int(1, 2);
      const skus: string[] = [];
      const pool = DONUT_SKUS.filter((s) => expectedDaily(this.ctx, home, s, req) > 0);
      const wts = pool.map((s) => ({ 'DN-GLZ': 4, 'DN-CHF': 2.5, 'DN-MPL': 1.5, 'DN-RSP': 1.5, 'DN-BCR': 1.5, 'DN-FRT': 1, 'DN-PSC': 2 } as Record<string, number>)[s]);
      while (skus.length < Math.min(nLines, pool.length)) {
        const s = rng.weighted(pool, wts);
        if (!skus.includes(s)) skus.push(s);
      }
      const dozens = rng.int(c.dozens[0], c.dozens[1]);
      const lines: Array<{ sku: string; qty: number }> = skus.map((s) => ({ sku: s, qty: 12 }));
      let left = Math.max(0, dozens - skus.length);
      while (left > 0) {
        lines[rng.int(0, lines.length - 1)].qty += 12;
        left--;
      }
      const hour = biz ? rng.int(7, 10) : rng.int(7, 14);
      const key = this.key('SO');
      const cancelled = rng.chance(0.05);
      const channel = biz ? (rng.chance(0.65) ? 'catering' : 'phone') : rng.weighted(['online', 'phone', 'counter'] as const, [0.6, 0.25, 0.15]);
      const note = biz ? rng.pick(['Please include napkins', 'Deliver to loading dock', 'Label boxes by flavor', 'Weekly standing order', 'Event setup at 7:30 AM']) : '';
      this.emit({ d: date, m: 11 * 60 + rng.int(0, 120), t: 'so_create', key, customer: c.name, loc: home, requested: { d: req, m: hour * 60 }, channel, lines, note });
      this.soTotal++;
      const rec = { key, shop: home, lines, hour, cancelled, customer: c.name };
      const list = this.soByDate.get(req) ?? [];
      list.push(rec);
      this.soByDate.set(req, list);
      if (cancelled) {
        this.soCancelled++;
        const cdate = diffDays(req, date) >= 2 ? addDays(req, -1) : date;
        const reason = rng.pick(['Event postponed', 'Customer changed plans', 'Duplicate order', 'Budget not approved']);
        this.at(cdate === date ? addDays(date, 0) : cdate, () => {
          /* cancellation event is emitted below at its own date */
        });
        // emit the cancel as a scheduled event so it lands on its own day
        this.at(cdate === date ? date : cdate, () => this.emit({ d: cdate, m: 15 * 60, t: 'so_cancel', key, reason }));
        if (cdate === date) {
          // same-day cancel: scheduled closure for this date already ran earlier in runDay? (placeSalesOrders is first), so emit now
          this.sched.get(date)?.pop();
          this.emit({ d: date, m: 15 * 60 + 30, t: 'so_cancel', key, reason });
        }
      }
    }
  }

  fulfillOrders(date: string) {
    const list = this.soByDate.get(date) ?? [];
    const rng = this.rOrd.fork('fulfill:' + date);
    for (const o of list) {
      if (o.cancelled) continue;
      // can we fill from fresh stock at the shop?
      const ok = o.lines.every((l) => this.qty(o.shop, l.sku) >= l.qty);
      if (!ok) {
        o.cancelled = true;
        this.soCancelled++;
        this.emit({ d: date, m: o.hour * 60 - 20, t: 'so_cancel', key: o.key, reason: 'Could not fill from stock; customer notified' });
        continue;
      }
      let rev = 0;
      for (const l of o.lines) {
        this.add(o.shop, l.sku, 'fresh', -l.qty);
        this.recordSaleUsage(o.shop, l.sku, l.qty);
        rev += l.qty * (ITEM_BY_SKU[l.sku].price ?? 0);
      }
      const rec = this.daily.find((r) => r.date === date && r.shop === o.shop);
      const method = rng.weighted(['card', 'cash'] as const, [0.85, 0.15]);
      const total = rev * (1 + TAX_RATE);
      this.emit({ d: date, m: o.hour * 60 + rng.int(0, 25), t: 'so_fulfill', key: o.key, payment: { method, tendered: method === 'cash' ? Math.ceil((total + 5) / 20) * 20 : null } });
      this.soRevenue.set(date, (this.soRevenue.get(date) ?? 0) + rev);
        void rec;
      const closeDate = addDays(date, 1);
      this.at(closeDate, () => this.emit({ d: closeDate, m: 9 * 60 + 15, t: 'so_close', key: o.key }));
    }
  }
  soRevenue = new Map<string, number>();

  // ---- close, waste, counts ---------------------------------------------------------------------------
  closeDay(date: string, shop: LocCode) {
    // Provo is also "closed" on Sundays; its Sunday close expires Saturday's day-old stock.
    for (const sku of DONUT_SKUS) {
      const old = this.qty(shop, sku, 'day_old');
      const fresh = this.qty(shop, sku, 'fresh');
      if (old > 0) {
        this.add(shop, sku, 'day_old', -old);
        this.waste.push({ date, loc: shop, sku, cond: 'day_old', qty: old, reason: 'EXPIRED' });
      }
      if (fresh > 0) {
        this.add(shop, sku, 'fresh', -fresh);
        this.add(shop, sku, 'day_old', fresh);
      }
    }
    this.emit({ d: date, m: 18 * 60 + 30 + SHOPS.indexOf(shop) * 3, t: 'day_close', loc: shop });
  }

  wasteAndCounts(date: string) {
    const rng = this.rMisc.fork('waste:' + date);
    for (const shop of SHOPS) {
      if (isClosed(shop, date)) continue;
      if (rng.chance(0.4)) {
        const sku = rng.weighted(DONUT_SKUS, [4, 2.5, 1.5, 1.5, 1.5, 1, 2]);
        const q = Math.min(rng.int(1, 6), this.qty(shop, sku));
        if (q > 0) {
          this.add(shop, sku, 'fresh', -q);
          this.waste.push({ date, loc: shop, sku, cond: 'fresh', qty: q, reason: 'DROPPED' });
          this.emit({ d: date, m: 17 * 60 + 55, t: 'waste', loc: shop, lines: [{ sku, cond: 'fresh', qty: q, reason: 'DROPPED' }] });
        }
      }
      if (rng.chance(0.06)) {
        const q = Math.min(0.5, this.qty(shop, 'RM-CBN'));
        if (q > 0.05) {
          this.add(shop, 'RM-CBN', 'fresh', -q);
          this.waste.push({ date, loc: shop, sku: 'RM-CBN', cond: 'fresh', qty: q, reason: 'BURNT' });
          this.emit({ d: date, m: 17 * 60 + 57, t: 'waste', loc: shop, lines: [{ sku: 'RM-CBN', cond: 'fresh', qty: q, reason: 'BURNT' }] });
        }
      }
    }
    // kitchen: perishable ingredients now and then
    if (rng.chance(0.18)) {
      const sku = rng.pick(['RM-APL', 'RM-MLK', 'RM-EGG', 'RM-BTR']);
      const lim = this.qty('KIT', sku);
      const q = Math.min(sku === 'RM-MLK' ? rng.int(1, 3) : rng.int(2, 9), Math.floor(lim));
      if (q > 0) {
        this.add('KIT', sku, 'fresh', -q);
        this.waste.push({ date, loc: 'KIT', sku, cond: 'fresh', qty: q, reason: sku === 'RM-APL' || sku === 'RM-MLK' ? 'EXPIRED' : 'DROPPED' });
        this.emit({ d: date, m: 12 * 60 + 40, t: 'waste', loc: 'KIT', lines: [{ sku, cond: 'fresh', qty: q, reason: sku === 'RM-APL' || sku === 'RM-MLK' ? 'EXPIRED' : 'DROPPED' }] });
      }
    }
    // weekly cycle counts (Monday): three kitchen items, one shop item; plus occasional damage
    if (dow(date) === 1) {
      const wk = Math.floor(diffDays(date, this.start) / 7);
      const pool = ITEMS.filter((i) => isPurchased(i) && i.type !== 'resale').map((i) => i.sku);
      const pick = [0, 1, 2].map((i) => pool[(wk * 3 + i) % pool.length]);
      const lines: Array<{ sku: string; cond: Cond; counted: number; reason: string }> = [];
      for (const sku of pick) {
        const sys = this.qty('KIT', sku);
        if (sys <= 0) continue;
        let counted = sys;
        if (rng.chance(0.65)) counted = sys * (1 + rng.normal(-0.004, 0.012));
        counted = ITEM_BY_SKU[sku].uom === 'each' ? Math.round(counted) : Math.round(counted * 10) / 10;
        counted = Math.max(0, counted);
        if (counted === sys) {
          counted = sys + (ITEM_BY_SKU[sku].uom === 'each' ? -1 : -0.5);
          if (counted < 0) counted = 0;
        }
        this.add('KIT', sku, 'fresh', counted - sys);
        lines.push({ sku, cond: 'fresh', counted, reason: 'COUNT' });
      }
      if (lines.length) this.emit({ d: date, m: 13 * 60, t: 'adjust', loc: 'KIT', kind: 'cycle_count', lines });
      const shop = SHOPS[wk % 3];
      const sline: Array<{ sku: string; cond: Cond; counted: number; reason: string }> = [];
      for (const sku of ['RS-MUG', 'RS-BNS']) {
        const sys = this.qty(shop, sku);
        if (sys > 3) {
          const counted = sys - (rng.chance(0.5) ? 1 : 0);
          if (counted !== sys) {
            this.add(shop, sku, 'fresh', counted - sys);
            sline.push({ sku, cond: 'fresh', counted, reason: 'COUNT' });
          }
        }
      }
      if (sline.length) this.emit({ d: date, m: 18 * 60 + 45, t: 'adjust', loc: shop, kind: 'cycle_count', lines: sline });
    }
    if (dow(date) === 3 && rng.chance(0.55)) {
      const sku = rng.pick(['PK-BOX', 'PK-BAG', 'PK-GBX', 'RM-FLR']);
      const q = sku === 'PK-GBX' ? 2 : sku === 'RM-FLR' ? 50 : rng.int(5, 30);
      const avail = this.qty('KIT', sku);
      if (avail > q + 1) {
        this.add('KIT', sku, 'fresh', -q);
        this.emit({ d: date, m: 13 * 60 + 10, t: 'adjust', loc: 'KIT', kind: 'damage', lines: [{ sku, cond: 'fresh', delta: -q, reason: 'DAMAGE' }] });
      }
    }
    if (dow(date) === 5 && rng.chance(0.3)) {
      const shop = rng.pick(SHOPS);
      if (this.qty(shop, 'RS-MUG') >= 1) {
        this.add(shop, 'RS-MUG', 'fresh', -1);
        this.emit({ d: date, m: 18 * 60 + 40, t: 'adjust', loc: shop, kind: 'damage', lines: [{ sku: 'RS-MUG', cond: 'fresh', delta: -1, reason: 'DAMAGE' }] });
      }
    }
  }

  /** The last two days of history: a storage mishap and a supplier outage that leave long-lead components lean. */
  endScenario(date: string) {
    if (!this.scenario.crisis) return;
    if (date === addDays(this.end, -1)) {
      // a retail shelf collapses in the dry store: gift cartons and glazed mugs are crushed
      const lines: Array<{ sku: string; cond: Cond; delta: number; reason: string }> = [];
      for (const [sku, target] of [['PK-GBX', 60], ['RS-MUG', 12]] as const) {
        const q = Math.floor(this.qty('KIT', sku) - target);
        if (q <= 5) continue;
        this.add('KIT', sku, 'fresh', -q);
        lines.push({ sku, cond: 'fresh', delta: -q, reason: 'DAMAGE' });
      }
      if (lines.length) this.emit({ d: date, m: 13 * 60 + 15, t: 'adjust', loc: 'KIT', kind: 'damage', note: 'Retail shelf collapsed in the dry store: gift cartons and mugs crushed', lines });
    }
    if (date !== this.end) return;
    // Sweet Peak cancels every open order except the small top-up
    let m = 11 * 60;
    for (const po of this.pos) {
      if (po.supplier !== 'SWP' || po.closed || po.sent === this.scenario.topUpOn) continue;
      if (po.lines.every((l) => l.received + l.cancelled >= l.qty)) continue;
      for (const l of po.lines) l.cancelled += Math.max(0, l.qty - l.received - l.cancelled);
      po.closed = true;
      this.emit({ d: date, m: m++, t: 'po_close', key: po.key });
    }
    // a partial loss in the walk-in cooler: only what is left over the planner's target, capped at about $1,300
    const want: Array<{ sku: string; q: number; v: number }> = [];
    for (const sku of ['RM-CHC', 'RM-MPL', 'RM-RSP', 'RM-CRM']) {
      const target = Math.ceil(this.usageStats(sku, 30).mean * 1.5);
      const q = Math.floor(this.qty('KIT', sku) - target);
      if (q > 0) want.push({ sku, q, v: q * ITEM_BY_SKU[sku].cost });
    }
    const totalV = want.reduce((a, w) => a + w.v, 0);
    const k = totalV > 1300 ? 1300 / totalV : 1;
    const lines: Array<{ sku: string; cond: Cond; qty: number; reason: string }> = [];
    for (const w of want) {
      const q = Math.floor(w.q * k);
      if (q <= 0) continue;
      this.add('KIT', w.sku, 'fresh', -q);
      lines.push({ sku: w.sku, cond: 'fresh', qty: q, reason: 'EXPIRED' });
      this.waste.push({ date, loc: 'KIT', sku: w.sku, cond: 'fresh', qty: q, reason: 'EXPIRED' });
    }
    if (lines.length) this.emit({ d: date, m: 12 * 60, t: 'waste', loc: 'KIT', note: 'Walk-in cooler 2 compressor failure: part of a shelf of icing and filling spoiled', lines });
  }

  // ---- expenses -----------------------------------------------------------------------------------
  expensePhase(date: string) {
    const dm = dayOfMonth(date);
    if ((dm !== 1 && dm !== 15) || date === this.start) return;
    const rng = this.rMisc.fork('exp:' + date);
    // revenue over the pay period just ended (previous ~15 days), by shop
    const from = addDays(date, -15);
    const revByShop: Record<string, number> = { PRV: 0, ORM: 0, LEH: 0 };
    for (const d of this.daily) if (d.date >= from && d.date < date) revByShop[d.shop] += d.revenue;
    for (const [d, rev] of this.soRevenue) if (d >= from && d < date) revByShop.PRV += rev * 0.4, (revByShop.ORM += rev * 0.3), (revByShop.LEH += rev * 0.3);
    const total = revByShop.PRV + revByShop.ORM + revByShop.LEH;
    if (total <= 0) return;
    const labor = total * rng.range(0.355, 0.395);
    const split: Array<[LocCode, number]> = [['KIT', labor * 0.2], ...SHOPS.map((s): [LocCode, number] => [s, (labor * 0.8 * revByShop[s]) / total])];
    let m = 17 * 60;
    for (const [loc, amt] of split) {
      const amount = r2(amt);
      this.emit({ d: date, m: m++, t: 'expense', account: '6000', amount, memo: `Payroll, ${from} to ${addDays(date, -1)}`, loc });
      this.expenses.push({ date, account: '6000', amount });
    }
    if (dm === 1) {
      const rent: Record<LocCode, number> = { PRV: 4300, ORM: 3600, LEH: 3700, KIT: 4100 };
      for (const loc of ['PRV', 'ORM', 'LEH', 'KIT'] as LocCode[]) {
        const amount = r2(rent[loc] + rng.range(-120, 160) + (loc === 'KIT' ? rng.range(300, 700) : rng.range(150, 450)));
        this.emit({ d: date, m: m++, t: 'expense', account: '6100', amount, memo: 'Rent and utilities', loc });
        this.expenses.push({ date, account: '6100', amount });
      }
    }
  }

  // ---- purchasing ----------------------------------------------------------------------------------
  openOrder(sku: string): number {
    let t = 0;
    for (const po of this.pos) {
      if (po.closed) continue;
      if (this.curDate > addDays(po.expected, 3) && !po.firstReceipt) continue; // badly overdue: the planner stops counting on it
      for (const l of po.lines) if (l.sku === sku) t += Math.max(0, l.qty - l.received - l.cancelled);
    }
    return t;
  }
  supplierSigmaL(sup: SupplierDef): number {
    const a = this.supplierLeads[sup.code] ?? [];
    if (a.length < 5) return sup.quoted_lead_time_days * 0.2 + 0.4;
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
  }
  /** Expected company-wide daily usage of a component over the next `days` days (the planner knows the season calendar). */
  forwardUsage(sku: string, date: string, days: number): number {
    let t = 0;
    for (let i = 0; i < days; i++) {
      const d = addDays(date, i);
      let u = 0;
      for (const shop of SHOPS) {
        if (DEMAND[sku]) u += expectedDaily(this.ctx, shop, sku, d);
        for (const [parent, bom] of Object.entries(BOMS)) if (bom[sku]) u += expectedDaily(this.ctx, shop, parent, d) * bom[sku];
      }
      t += u;
    }
    return (t / days) * (ITEM_BY_SKU[sku].type === 'raw' || ITEM_BY_SKU[sku].type === 'packaging' ? 1.1 : 1);
  }
  planFor(sku: string, date: string) {
    const it = ITEM_BY_SKU[sku];
    const sup = SUPPLIERS.find((s) => s.code === it.supplier)!;
    let { mean, sd } = this.usageStats(sku);
    const seasonal = sku === 'RM-PMP' || sku === 'RM-PSS';
    const a = this.supplierLeads[sup.code] ?? [];
    // the planner plans on the lead time the supplier actually delivers, not just the quote
    const L = a.length >= 5 ? Math.max(sup.quoted_lead_time_days, a.reduce((x, y) => x + y, 0) / a.length) : sup.quoted_lead_time_days;
    if (seasonal) {
      const fwd = this.forwardUsage(sku, date, Math.ceil(L) + 14);
      if (fwd > mean) {
        sd = Math.max(sd, fwd * 0.25);
        mean = fwd;
      }
    }
    const sL = this.supplierSigmaL(sup);
    const z = sup.onTime >= 0.9 ? SERVICE_Z : sup.onTime >= 0.8 ? 2.6 : 3.6;
    const ss = z * Math.sqrt(L * sd * sd + mean * mean * sL * sL);
    const rop = mean * L + ss;
    const cost = this.unitCost(sku, date);
    const eoq = mean > 0 ? Math.sqrt((2 * 365 * mean * ORDERING_COST) / (HOLDING_RATE * cost)) : 0;
    return { mean, sd, L, ss, rop, eoq, cost, sup };
  }
  purchasing(date: string) {
    const bySup = new Map<SupCode, Array<{ sku: string; qty: number; cost: number }>>();
    const monday = dow(date) === 1;
    for (const it of ITEMS) {
      if (!isPurchased(it)) continue;
      const cut = this.scenario.swpCut?.[it.sku];
      if (cut && date >= cut.from && date < this.end) continue;
      const p = this.planFor(it.sku, date);
      if (p.mean < 0.02) continue;
      const ip = this.total(it.sku) + this.openOrder(it.sku);
      const need = ip <= p.rop;
      const review = monday && ip - p.mean * REVIEW_DAYS <= p.rop;
      if (!need && !review) continue;
      const pack = it.pack ?? 1;
      const cover = it.shelfLife ? Math.min(MAX_COVER_DAYS, it.shelfLife * 0.6) : MAX_COVER_DAYS;
      let qty = Math.min(p.eoq, p.mean * cover);
      qty = Math.max(qty, p.rop - ip + p.mean * REVIEW_DAYS);
      qty = Math.max(pack, ceilTo(qty, pack));
      const lines = bySup.get(p.sup.code) ?? [];
      lines.push({ sku: it.sku, qty, cost: p.cost });
      bySup.set(p.sup.code, lines);
    }
    // scenario: forced POs
    for (const [sup, when] of Object.entries(this.scenario.forceCreate) as Array<[SupCode, string]>) {
      if (when !== date) continue;
      const lines = (bySup.get(sup) ?? []).slice();
      for (const it of ITEMS.filter((i) => i.supplier === sup)) {
        if (lines.some((l) => l.sku === it.sku)) continue;
        const p = this.planFor(it.sku, date);
        if (p.mean < 0.05) continue;
        const pack = it.pack ?? 1;
        lines.push({ sku: it.sku, qty: Math.max(pack, ceilTo(Math.min(p.eoq, p.mean * MAX_COVER_DAYS * 0.6), pack)), cost: p.cost });
      }
      bySup.set(sup, lines);
    }
    if (this.scenario.topUpOn === date) {
      // Sweet Peak only agreed to ship one pack each of chocolate icing and pumpkin puree; the rest is on allocation
      bySup.set('SWP', ['RM-CHC', 'RM-PMP'].map((sku) => ({ sku, qty: ITEM_BY_SKU[sku].pack ?? 1, cost: this.unitCost(sku, date) })));
    }
    for (const [sup, lines] of bySup) this.createPo(date, sup, lines);
  }

  createPo(date: string, supCode: SupCode, lines: Array<{ sku: string; qty: number; cost: number }>) {
    const sup = SUPPLIERS.find((s) => s.code === supCode)!;
    const rng = this.rSup.fork(`po:${date}:${supCode}`);
    const key = this.key('PO');
    const expected = addDays(date, sup.quoted_lead_time_days);
    const po: PoRec = { key, supplier: supCode, sent: date, expected, lines: lines.map((l) => ({ ...l, received: 0, cancelled: 0 })), receipts: [], receiptLines: [] };
    this.pos.push(po);
    this.emit({ d: date, m: 16 * 60 + 29, t: 'po_create', key, supplier: supCode, lines });
    this.emit({ d: date, m: 16 * 60 + 31, t: 'po_send', key });
    // plan delivery behaviour
    const late = this.scenario.lateOn[supCode]?.sent === date;
    const pBackorderLate = sup.shortProb * sup.backorderShare;
    const pDelay = Math.max(0, 1 - sup.onTime / Math.max(0.01, 1 - pBackorderLate));
    let delay = this.stratified('late:' + supCode, pDelay) ? Math.max(1, Math.round(1 + -Math.log(1 - rng.uniform()) * (sup.lateMean - 1))) : 0;
    let arrival = addDays(expected, delay);
    if (late) {
      const forced = this.scenario.lateOn[supCode]!.arriveOn;
      if (arrival < forced) arrival = forced;
      po.forced = true;
      po.arrivalOverride = arrival;
      delay = diffDays(arrival, expected);
    }
    const short = this.stratified('short:' + supCode, sup.shortProb);
    const backorder = short && this.stratified('bo:' + supCode, sup.backorderShare);
    const firstQty: number[] = po.lines.map((l): number => {
      let q = l.qty;
      if (short && rng.chance(0.75)) {
        const frac = Math.min(0.6, Math.max(0.05, rng.normal(sup.shortMean, 0.08)));
        const pack = ITEM_BY_SKU[l.sku].pack ?? 1;
        q = Math.max(0, Math.floor((l.qty * (1 - frac)) / pack) * pack);
      }
      return q;
    });
    if (short && !firstQty.some((q, i) => q < po.lines[i].qty)) {
      const pack = ITEM_BY_SKU[po.lines[0].sku].pack ?? 1;
      firstQty[0] = Math.max(0, po.lines[0].qty - pack);
    }
    if (!firstQty.some((q) => q > 0)) firstQty[0] = po.lines[0].qty;
    this.at(arrival, () => this.receive(po, firstQty, arrival, backorder, short, rng));
  }

  receive(po: PoRec, qtys: number[], date: string, backorder: boolean, short: boolean, rng: Rng) {
    if (po.closed) return; // cancelled by the supplier before it shipped
    if (po.supplier === 'SWP' && this.scenario.swpCut) {
      qtys = qtys.slice();
      po.lines.forEach((l, i) => {
        const cut = this.scenario.swpCut![l.sku];
        if (!cut) return;
        if (date > cut.from) qtys[i] = 0;
        else if (date === cut.from) qtys[i] = Math.max(0, qtys[i] - cut.trim);
        else return;
        backorder = false; // whatever Sweet Peak does not ship is cancelled
      });
      if (!qtys.some((q) => q > 0)) {
        const cd = addDays(date, 1);
        this.at(cd, () => {
          if (po.closed) return;
          po.lines.forEach((l) => (l.cancelled += Math.max(0, l.qty - l.received - l.cancelled)));
          po.closed = true;
          this.emit({ d: cd, m: 9 * 60, t: 'po_close', key: po.key });
        });
        return;
      }
    }
    const lines: Array<{ sku: string; qty: number }> = [];
    let amount = 0;
    po.lines.forEach((l, i) => {
      const q = Math.min(qtys[i], l.qty - l.received - l.cancelled);
      if (q <= 0) return;
      l.received += q;
      lines.push({ sku: l.sku, qty: q });
      po.receiptLines.push({ date, sku: l.sku, qty: q });
      amount += r2(q * l.cost);
      this.add('KIT', l.sku, 'fresh', q);
    });
    if (lines.length === 0) return;
    const rcpt = this.key('RC');
    const m = 8 * 60 + 30 + rng.int(0, 150);
    this.emit({ d: date, m, t: 'po_receive', key: po.key, rcpt, lines });
    if (!po.firstReceipt) {
      po.firstReceipt = date;
      (this.supplierLeads[po.supplier] ??= []).push(diffDays(date, po.sent));
    }
    po.lastReceipt = date;
    // accounts payable
    const sup = SUPPLIERS.find((s) => s.code === po.supplier)!;
    const due = addDays(date, sup.terms_days);
    po.receipts.push({ date, rcpt, amount: r2(amount), due });
    const bill = { rcpt, supplier: po.supplier, billed: date, due, amount: r2(amount) } as SimResult['apBills'][number];
    this.apBills.push(bill);
    const prng = this.rSup.fork('pay:' + rcpt);
    let payDate = addDays(due, prng.int(-2, 2));
    if (prng.chance(sup.payLateProb)) payDate = addDays(due, prng.int(sup.payLateDays[0], sup.payLateDays[1]));
    if (payDate > addDays(this.end, -3)) {
      // stays open
    } else {
      bill.paidOn = payDate;
      this.at(payDate, () => this.emit({ d: payDate, m: 10 * 60 + prng.int(0, 60), t: 'ap_pay', rcpt, method: prng.chance(0.7) ? 'ach' : 'check' }));
    }
    const remaining = po.lines.some((l) => l.qty - l.received - l.cancelled > 0);
    if (remaining && backorder) {
      const d2 = addDays(date, prng.int(2, 5));
      const rest = po.lines.map((l) => l.qty - l.received - l.cancelled);
      this.at(d2, () => this.receive(po, rest, d2, false, false, rng));
    } else {
      const cd = addDays(date, 1);
      this.at(cd, () => {
        if (po.closed) return;
        po.lines.forEach((l) => (l.cancelled += Math.max(0, l.qty - l.received - l.cancelled)));
        po.closed = true;
        this.emit({ d: cd, m: 9 * 60, t: 'po_close', key: po.key });
      });
    }
    void short;
  }

  /** Keep the payables story coherent: our slowest-paid supplier (Intermountain) has a bill that is clearly overdue. */
  postProcessAp() {
    const cutoff = this.end;
    const slow = this.apBills.filter((b) => b.supplier === 'INT' && b.due <= addDays(cutoff, -4) && b.due >= addDays(cutoff, -21)).pop();
    if (!slow || !slow.paidOn) {
      if (slow || this.apBills.some((b) => !b.paidOn && b.due <= cutoff)) return;
    }
    if (!slow) return;
    const idx = this.events.findIndex((e) => e.t === 'ap_pay' && e.rcpt === slow.rcpt);
    if (idx >= 0) this.events.splice(idx, 1);
    slow.paidOn = undefined;
  }

  // ---- scripted future data ------------------------------------------------------------------------
  futureScale = 1;
  futureOrders() {
    const today = this.today;
    const tg = thanksgiving(year(today) + (thanksgiving(year(today)) < today ? 1 : 0));
    const placeFor = (off: number | string) => {
      if (typeof off === 'number') return addDays(today, off);
      const n = Number(off.split('-')[1]);
      return addDays(tg, -n);
    };
    const build = (scale: number, kits: number): Ev[] => {
      const out: Ev[] = [];
      let seq = 0;
      for (const fo of FUTURE_ORDERS) {
        let req = placeFor(fo.offset);
        for (let i = 0; i < 3 && (dow(req) === 0 || isClosed(fo.shop, req)); i++) req = addDays(req, 1);
        const placed = addDays(this.end, -(fo.placedDaysAgo - 1));
        out.push({ d: placed, m: 10 * 60 + seq * 7, t: 'so_create', key: `FUT${++seq}`, customer: fo.customer, loc: fo.shop, requested: { d: req, m: fo.hour * 60 }, channel: fo.channel, lines: fo.lines.map(([sku, dz]) => ({ sku, qty: Math.max(1, Math.round(dz * scale)) * 12 })), note: fo.note });
      }
      for (const g of FUTURE_GIFT_ORDERS) {
        let req = addDays(today, g.offset);
        for (let i = 0; i < 3 && (dow(req) === 0 || isClosed(g.shop, req)); i++) req = addDays(req, 1);
        out.push({ d: addDays(this.end, -2), m: 14 * 60 + seq * 5, t: 'so_create', key: `FUT${++seq}`, customer: g.customer, loc: g.shop, requested: { d: req, m: g.hour * 60 }, channel: 'catering', lines: [{ sku: 'KT-GFT', qty: Math.max(6, Math.round(kits * g.share)) }], note: g.note });
      }
      for (const fp of FUTURE_PICKUPS) {
        let req = addDays(today, fp.offset);
        for (let i = 0; i < 3 && (dow(req) === 0 || isClosed(fp.shop, req)); i++) req = addDays(req, 1);
        out.push({ d: this.end, m: 19 * 60 + seq, t: 'so_create', key: `FUT${++seq}`, customer: fp.customer, loc: fp.shop, requested: { d: req, m: fp.hour * 60 }, channel: 'online', lines: fp.lines.map(([sku, dz]) => ({ sku, qty: dz * 12 })), note: 'Placed in the customer portal' });
      }
      return out;
    };
    // The examples above are the baseline. If the MRP grid is not yet rich enough (at least 4 components, 2 from Sweet Peak,
    // 1 from Beehive), scale the orders up gently. No cap other than 2x the baseline.
    const good = (rows: ReturnType<typeof plannedRows>) => {
      const sup = (r: { sku: string }) => ITEM_BY_SKU[r.sku].supplier;
      const comps = new Set(rows.map((r) => r.sku));
      return comps.size >= 4 && new Set(rows.filter((r) => sup(r) === 'SWP').map((r) => r.sku)).size >= 2 && rows.some((r) => sup(r) === 'BHP');
    };
    let chosen = 1;
    let kitsChosen = 100;
    let events = build(1, 100);
    search: for (let scale = 1; scale <= 1.451; scale += 0.05) {
      for (let kits = 100; kits <= 340; kits += 20) {
        const ev = build(scale, kits);
        chosen = scale;
        kitsChosen = kits;
        events = ev;
        const rows = plannedRows(mrpPlan(today, ev, this.inv, this.pos));
        if (good(rows) && rows.length >= 5 && new Set(rows.map((r) => r.week)).size >= 3 && rows.some((r) => ITEM_BY_SKU[r.sku].supplier === 'BHP' && r.expedite)) break search;
      }
    }
    void kitsChosen;
    this.futureScale = Math.round(chosen * 10) / 10;
    this.future = events;
  }

  result(): SimResult {
    const initialRop: Record<string, number> = { ...this.initialRop };
    return {
      opts: this.opts, start: this.start, end: this.end, today: this.today, ctx: this.ctx,
      events: this.events, todayEvents: this.today_, futureEvents: this.future, daily: this.daily, pos: this.pos,
      initialRop, inv: this.inv, usageSales: this.usageSales, usageActual: this.usageActual, production: this.production,
      waste: this.waste, returns: this.returns, exchanges: this.exchanges, salesOrders: { total: this.soTotal, cancelled: this.soCancelled },
      apBills: this.apBills, ledgerRows: this.ledgerRows, lostUnits: this.lostUnits, expenses: this.expenses, supplierLeads: this.supplierLeads, futureScale: this.futureScale, cuts: this.cuts, kitStart: this.kitStart,
    };
  }
}

const SHOP_STOCKED = ['BV-CBR', 'BV-CML', 'RS-BNS', 'RS-MUG', 'RM-CBN', 'PK-CUP', 'PK-LID', 'PK-GBX'];
function range2(from: number, to: number): number[] {
  const out: number[] = [];
  for (let h = from; h < to; h++) out.push(h);
  return out;
}

export function defaultOptions(argv: string[] = []): SimOptions {
  let end = yesterdayDenver();
  let days = 210;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--end') end = argv[++i];
    else if (argv[i] === '--days') days = Number(argv[++i]);
  }
  return { end, days, seed: ROOT_SEED };
}

/** Two-pass simulation: pass one finds the natural PO schedule; pass two scripts the overdue / open POs. */
export function simulate(opts: SimOptions): SimResult {
  const pass1 = new Sim(opts, { lateOn: {}, forceCreate: {} }).run();
  const end = opts.end;
  // Sweet Peak crisis: it rations shipments of the four icing and filling items. For each item we find, from the first pass,
  // the receipt after which no more stock arrives (and trim that last receipt) so about two days of use is left at the end.
  const nDays = opts.days;
  const swpCut: Record<string, { from: string; trim: number }> = {};
  for (const sku of ['RM-CHC', 'RM-MPL', 'RM-RSP', 'RM-CRM']) {
    const u = pass1.usageActual.get(sku) ?? [];
    const useM = u.slice(Math.max(0, nDays - 30), nDays).reduce((x, y) => x + y, 0) / 30;
    const target = Math.ceil(3.0 * useM);
    const need = (pass1.kitStart[sku]?.[nDays] ?? 0) - target;
    if (need <= 0) continue;
    const rec = pass1.pos
      .filter((p) => p.supplier === 'SWP')
      .flatMap((p) => p.receiptLines.filter((l) => l.sku === sku))
      .filter((l) => l.date >= addDays(end, -75))
      .sort((a, b) => (a.date < b.date ? 1 : -1)); // latest first
    let cum = 0;
    for (const r of rec) {
      if (cum + r.qty >= need) {
        swpCut[sku] = { from: r.date, trim: need - cum };
        break;
      }
      cum += r.qty;
      swpCut[sku] = { from: r.date, trim: r.qty }; // fallback: stop all shipments back to the earliest receipt in the window
    }
  }
  const scenario: Scenario = {
    lateOn: { SWP: { sent: addDays(end, -12), arriveOn: addDays(end, 4) } },
    forceCreate: {},
    swpCut,
    topUpOn: addDays(end, -12),
    crisis: true,
  };
  // Beehive: a PO in flight, due next week (its quoted lead time is 14 days)
  const bhp = pass1.pos.filter((p) => p.supplier === 'BHP' && p.sent >= addDays(end, -9) && p.sent <= addDays(end, -3)).pop();
  if (bhp) scenario.lateOn.BHP = { sent: bhp.sent, arriveOn: addDays(bhp.expected, 1) };
  else {
    scenario.forceCreate.BHP = addDays(end, -6);
    scenario.lateOn.BHP = { sent: addDays(end, -6), arriveOn: addDays(end, 9) };
  }
  return new Sim(opts, scenario).run();
}

export { Sim };


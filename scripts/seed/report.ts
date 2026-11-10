// Dry-run statistics: what a planner or an instructor would check to decide the data looks like a real donut business.

import { BOMS, DEMAND, DONUT_SKUS, ITEMS, ITEM_BY_SKU, SHOPS, SUPPLIERS, isPurchased, type LocCode } from './catalog.js';
import { addDays, dow, fmtMoney, month, range } from './dates.js';
import { mrpPlan, planned as plannedRows } from './mrp.js';
import { DAY_OLD_MARKDOWN, HOLDING_RATE, ORDERING_COST, SERVICE_Z, type SimResult } from './simulate.js';

const pad = (s: string | number, n: number, right = false) => (right ? String(s).padEnd(n) : String(s).padStart(n));
const fmt0 = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmt1 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (n: number) => (n * 100).toFixed(1) + '%';
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sd = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1));
};
const h = (t: string) => console.log(`\n=== ${t} ===`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface Checks {
  fails: string[];
  warns: string[];
}

export function itemRevenue(res: SimResult) {
  const units: Record<string, number> = {};
  const rev: Record<string, number> = {};
  const weeklyPsc: Record<string, number> = {};
  for (const e of res.events) {
    if (e.t === 'sale') {
      for (const l of e.lines) {
        const p = ITEM_BY_SKU[l.sku].price!;
        units[l.sku] = (units[l.sku] ?? 0) + l.qty;
        rev[l.sku] = (rev[l.sku] ?? 0) + l.qty * p * (l.cond === 'day_old' ? 1 - DAY_OLD_MARKDOWN : 1 - l.disc);
        if (l.sku === 'DN-PSC') {
          const wk = weekStart(e.d);
          weeklyPsc[wk] = (weeklyPsc[wk] ?? 0) + l.qty;
        }
      }
    } else if (e.t === 'so_fulfill') {
      const so = res.events.find((x) => x.t === 'so_create' && x.key === e.key);
      if (so && so.t === 'so_create') {
        for (const l of so.lines) {
          units[l.sku] = (units[l.sku] ?? 0) + l.qty;
          rev[l.sku] = (rev[l.sku] ?? 0) + l.qty * ITEM_BY_SKU[l.sku].price!;
          if (l.sku === 'DN-PSC') weeklyPsc[weekStart(e.d)] = (weeklyPsc[weekStart(e.d)] ?? 0) + l.qty;
        }
      }
    }
  }
  return { units, rev, weeklyPsc };
}
function weekStart(d: string) {
  return addDays(d, -((dow(d) + 6) % 7)); // Monday
}

export function printReport(res: SimResult): Checks {
  const checks: Checks = { fails: [], warns: [] };
  const days = range(res.start, res.end);
  console.log(`Simulation window: ${res.start} to ${res.end} (${days.length} days). Today = ${res.today}.`);
  const count: Record<string, number> = {};
  for (const e of res.events) count[e.t] = (count[e.t] ?? 0) + 1;
  console.log('History events:', Object.entries(count).map(([k, v]) => `${k}=${fmt0(v)}`).join(' '));
  console.log(`Today's morning run: ${res.todayEvents.length} events; scripted future orders: ${res.futureEvents.length}`);

  // --- revenue ------------------------------------------------------------------------------------
  h('Revenue (net of discounts, before tax; includes catering orders)');
  const so = new Map<string, number>();
  const soEv = new Map<string, any>();
  for (const e of res.events) if (e.t === 'so_create') soEv.set(e.key, e);
  for (const e of res.events) {
    if (e.t !== 'so_fulfill') continue;
    const c = soEv.get(e.key);
    const rev = c.lines.reduce((a: number, l: any) => a + l.qty * ITEM_BY_SKU[l.sku].price!, 0);
    so.set(`${c.loc}|${e.d}`, (so.get(`${c.loc}|${e.d}`) ?? 0) + rev);
  }
  const byMonth: Record<string, Record<string, number>> = {};
  const shopDays: Record<string, number[]> = { PRV: [], ORM: [], LEH: [] };
  const shopDonuts: Record<string, number[]> = { PRV: [], ORM: [], LEH: [] };
  const wdRev: Record<string, number[][]> = { PRV: [[], [], [], [], [], [], []], ORM: [[], [], [], [], [], [], []], LEH: [[], [], [], [], [], [], []] };
  let total = 0;
  for (const r of res.daily) {
    const rev = r.revenue + (so.get(`${r.shop}|${r.date}`) ?? 0);
    const ym = r.date.slice(0, 7);
    byMonth[ym] ??= { PRV: 0, ORM: 0, LEH: 0 };
    byMonth[ym][r.shop] += rev;
    shopDays[r.shop].push(rev);
    shopDonuts[r.shop].push(r.donuts);
    wdRev[r.shop][dow(r.date)].push(rev);
    total += rev;
  }
  console.log(pad('Month', 10, true) + SHOPS.map((s) => pad(s, 14)).join('') + pad('Total', 14));
  for (const ym of Object.keys(byMonth).sort()) {
    const row = byMonth[ym];
    console.log(pad(`${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`, 10, true) + SHOPS.map((s) => pad(fmtMoney(row[s]), 14)).join('') + pad(fmtMoney(SHOPS.reduce((a, s) => a + row[s], 0)), 14));
  }
  console.log(`Total revenue ${fmtMoney(total)}; average ${fmtMoney(total / days.length)} per day`);
  for (const s of SHOPS) {
    const d = shopDays[s];
    console.log(`  ${s}: avg ${fmtMoney(mean(d))}/day (min ${fmtMoney(Math.min(...d))}, max ${fmtMoney(Math.max(...d))}); donuts/day avg ${fmt0(mean(shopDonuts[s]))} (max ${fmt0(Math.max(...shopDonuts[s]))})`);
    if (mean(d) < 800 || mean(d) > 3500) checks.fails.push(`${s} average daily revenue ${mean(d).toFixed(0)} outside $800-$3,500`);
  }

  // --- top items -----------------------------------------------------------------------------------
  h('Top 10 items by revenue');
  const ir = itemRevenue(res);
  const top = Object.entries(ir.rev).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [sku, r] of top) console.log(`  ${pad(sku, 8, true)} ${pad(ITEM_BY_SKU[sku].name, 26, true)} ${pad(fmtMoney(r), 14)} ${pad(fmt0(ir.units[sku]), 9)} units`);

  // --- weekday index ---------------------------------------------------------------------------------
  h('Weekday index (average daily revenue, 1.00 = shop mean)');
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  console.log(pad('', 5) + names.map((n) => pad(n, 7)).join(''));
  for (const s of SHOPS) {
    const m = mean(shopDays[s]);
    console.log(pad(s, 5, true) + names.map((_, i) => pad(wdRev[s][i].length ? (mean(wdRev[s][i]) / m).toFixed(2) : 'closed', 7)).join(''));
  }

  // --- pumpkin spice -----------------------------------------------------------------------------------
  h('Pumpkin spice cake: units per week (season Sep 1 - Nov 30)');
  const psw = Object.keys(ir.weeklyPsc).sort();
  console.log(psw.length ? psw.map((w) => `${w.slice(5)}:${fmt0(ir.weeklyPsc[w])}`).join('  ') : '  none in window');

  // --- demand by month for seasonal items -------------------------------------------------------------
  h('Units per month for seasonal and trend items');
  const mu: Record<string, Record<string, number>> = {};
  for (const e of res.events) {
    if (e.t !== 'sale') continue;
    const ym = e.d.slice(0, 7);
    mu[ym] ??= {};
    for (const l of e.lines) mu[ym][l.sku] = (mu[ym][l.sku] ?? 0) + l.qty;
  }
  const watch = ['DN-GLZ', 'DN-FRT', 'DN-PSC', 'BV-CBR', 'BV-DRP', 'KT-GFT'];
  console.log(pad('Month', 10, true) + watch.map((s) => pad(s, 9)).join(''));
  for (const ym of Object.keys(mu).sort()) console.log(pad(ym, 10, true) + watch.map((s) => pad(fmt0(mu[ym][s] ?? 0), 9)).join(''));

  // --- planning parameters ---------------------------------------------------------------------------------
  h(`Implied ROP and EOQ per purchased item (DB-style: 90-day sales-based usage, S=$${ORDERING_COST}, H=${HOLDING_RATE * 100}%, z=${SERVICE_Z})`);
  console.log(`${pad('SKU', 8, true)}${pad('Item', 24, true)}${pad('d/day', 9)}${pad('sd', 8)}${pad('L', 4)}${pad('ROP', 9)}${pad('EOQ', 9)}${pad('EOQ days', 9)}${pad('ROP days', 9)}  Note`);
  const n = res.usageSales.get('DN-GLZ')!.length;
  const idxEnd = days.length; // completed days are indices 0..idxEnd-1
  const exceptions: string[] = [];
  for (const it of ITEMS) {
    if (!isPurchased(it)) continue;
    const sup = SUPPLIERS.find((s) => s.code === it.supplier)!;
    const arr = res.usageSales.get(it.sku) ?? new Array(n).fill(0);
    const win = arr.slice(Math.max(0, idxEnd - 90), idxEnd);
    const d = mean(win);
    const s = sd(win);
    const leads = res.supplierLeads[sup.code] ?? [];
    const sL = leads.length > 2 ? sd(leads) : 0;
    const L = sup.quoted_lead_time_days;
    const ss = SERVICE_Z * Math.sqrt(L * s * s + d * d * sL * sL);
    const rop = d * L + ss;
    const cost = lastCost(res, it.sku) ?? it.cost;
    const eoqRaw = d > 0 ? Math.sqrt((2 * 365 * d * ORDERING_COST) / (HOLDING_RATE * cost)) : 0;
    const pack = it.pack ?? 1;
    const eoq = Math.ceil(eoqRaw / pack) * pack;
    const eoqDays = d > 0 ? eoq / d : 0;
    let note = '';
    if (d <= 0.001) note = 'no recent usage (out of season)';
    else if (eoqDays > 60) note = `long cover: low annual spend ($${fmt0(d * 365 * cost)}/yr)`;
    else if (eoqDays < 3) note = 'short cover';
    if (note && d > 0.001) exceptions.push(`${it.sku} ${note}`);
    console.log(`${pad(it.sku, 8, true)}${pad(it.name, 24, true)}${pad(d.toFixed(d < 10 ? 2 : 1), 9)}${pad(s.toFixed(s < 10 ? 2 : 1), 8)}${pad(L, 4)}${pad(rop.toFixed(rop < 10 ? 1 : 0), 9)}${pad(fmt0(eoq), 9)}${pad(eoqDays.toFixed(0), 9)}${pad((d > 0 ? rop / d : 0).toFixed(1), 9)}  ${note}`);
    if (d > 0.001 && (rop <= 0 || eoq <= 0)) checks.fails.push(`${it.sku} zero ROP/EOQ`);
  }
  if (exceptions.length) checks.warns.push(`EOQ outside 3-60 days of supply: ${exceptions.join('; ')}`);

  // --- supplier scorecards --------------------------------------------------------------------------------
  h('Supplier scorecards (from PO history, last 180 days; weights .40 on-time / .35 fill / .25 lead)');
  console.log(`${pad('Supplier', 28, true)}${pad('POs', 5)}${pad('on-time', 9)}${pad('fill', 8)}${pad('quoted', 8)}${pad('actual', 8)}${pad('delay', 7)}${pad('score', 7)}  rating (expected)`);
  const cutoff = addDays(res.end, -180);
  for (const sup of SUPPLIERS) {
    const ps = res.pos.filter((p) => p.supplier === sup.code && p.sent >= cutoff && p.lastReceipt && (p.closed || p.lines.every((l) => l.received + l.cancelled >= l.qty)));
    if (!ps.length) continue;
    const onTime = ps.filter((p) => p.lastReceipt! <= p.expected).length / ps.length;
    const ordered = ps.reduce((a, p) => a + p.lines.reduce((x, l) => x + l.qty, 0), 0);
    const received = ps.reduce((a, p) => a + p.lines.reduce((x, l) => x + l.received, 0), 0);
    const fill = received / ordered;
    const act = mean(ps.map((p) => (new Date(p.firstReceipt!).getTime() - new Date(p.sent).getTime()) / 86400000));
    const q = sup.quoted_lead_time_days;
    const lead = Math.min(1, Math.max(0, 1 - Math.max(0, act - q) / q));
    const score = 100 * (0.4 * onTime + 0.35 * fill + 0.25 * lead);
    const rating = score >= 90 ? 'keep' : score >= 75 ? 'watch' : 'replace';
    console.log(`${pad(sup.name, 28, true)}${pad(ps.length, 5)}${pad(pct(onTime), 9)}${pad(pct(fill), 8)}${pad(q + ' d', 8)}${pad(act.toFixed(1) + ' d', 8)}${pad('+' + (act - q).toFixed(1), 7)}${pad(score.toFixed(1), 7)}  ${rating} (${sup.expectedRating})`);
    if (rating !== sup.expectedRating) checks.fails.push(`${sup.name} rated ${rating}, expected ${sup.expectedRating}`);
  }
  const open = res.pos.filter((p) => !p.closed && p.lines.some((l) => l.received + l.cancelled < l.qty));
  console.log(`Open POs at the end: ${open.map((p) => `${p.supplier} sent ${p.sent} expected ${p.expected}${p.expected < res.today ? ' (OVERDUE)' : ''}`).join('; ') || 'none'}`);
  if (!open.some((p) => p.expected < res.today)) checks.fails.push('no overdue open PO');

  // --- AP -----------------------------------------------------------------------------------------------------
  h('Accounts payable');
  const unpaid = res.apBills.filter((b) => !b.paidOn);
  const overdue = unpaid.filter((b) => b.due < res.today);
  console.log(`Bills: ${res.apBills.length}; open: ${unpaid.length} totalling ${fmtMoney(unpaid.reduce((a, b) => a + b.amount, 0))}; overdue: ${overdue.length} (${overdue.map((b) => `${b.supplier} ${fmtMoney(b.amount)} due ${b.due}`).join('; ')})`);
  if (overdue.length < 1) checks.fails.push('no overdue AP bill');

  // --- production -------------------------------------------------------------------------------------------------
  h('Production');
  const pr: Record<string, { planned: number; good: number; scrap: number; rework: number }> = {};
  const scrapReasons: Record<string, number> = {};
  for (const p of res.production) {
    const r = (pr[p.sku] ??= { planned: 0, good: 0, scrap: 0, rework: 0 });
    r.planned += p.started;
    r.good += p.good;
    r.scrap += p.scrap;
    r.rework += p.rework;
    for (const [k, v] of Object.entries(p.scrapByReason)) scrapReasons[k] = (scrapReasons[k] ?? 0) + v;
  }
  let tg = 0, ts = 0, tp = 0, trw = 0;
  for (const [sku, r] of Object.entries(pr)) {
    console.log(`  ${pad(sku, 8, true)} started ${pad(fmt0(r.planned), 8)} good ${pad(fmt0(r.good), 8)} yield ${pct(r.good / r.planned)} scrap ${pct(r.scrap / r.planned)} rework ${pct(r.rework / r.planned)}`);
    tg += r.good; ts += r.scrap; tp += r.planned; trw += r.rework;
  }
  console.log(`  All donuts: ${fmt0(tp)} started, yield ${pct(tg / tp)}, scrap ${pct(ts / tp)}, first-pass yield ${pct((tg - trw) / tp)}; scrap reasons: ${Object.entries(scrapReasons).map(([k, v]) => `${k} ${fmt0(v)}`).join(', ')}`);
  console.log(`  Production orders: ${res.production.length}`);

  // --- waste & lost sales -------------------------------------------------------------------------------------------
  h('Waste and lost sales');
  const wByReason: Record<string, { q: number; c: number }> = {};
  let donutWasteUnits = 0;
  let wasteCost = 0;
  for (const w of res.waste) {
    const c = w.qty * ITEM_BY_SKU[w.sku].cost;
    const r = (wByReason[w.reason] ??= { q: 0, c: 0 });
    r.q += w.qty;
    r.c += c;
    wasteCost += c;
    if (DONUT_SKUS.includes(w.sku)) donutWasteUnits += w.qty;
  }
  for (const [k, v] of Object.entries(wByReason)) console.log(`  ${pad(k, 10, true)} ${pad(fmt0(v.q), 8)} units ~${fmtMoney(v.c)}`);
  const wastePct = donutWasteUnits / tg;
  console.log(`  Donut waste (expired + dropped) is ${pct(wastePct)} of good production`);
  if (wastePct > 0.12 || wastePct < 0.02) checks.warns.push(`donut waste ${pct(wastePct)} outside 2-12%`);
  const lostU = Object.entries(res.lostUnits).filter(([k]) => !k.startsWith('_'));
  const totalLost = lostU.reduce((a, [, v]) => a + v, 0);
  const totalSold = Object.values(ir.units).reduce((a, b) => a + b, 0);
  console.log(`  Lost sales: ${fmt0(totalLost)} units (${pct(totalLost / (totalLost + totalSold))} of demand): ${lostU.sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${fmt0(v)}`).join(', ')}`);
  const shortC = Object.entries(res.lostUnits).filter(([k]) => k.startsWith('_short_'));
  if (shortC.length) checks.warns.push(`production cut for lack of components: ${shortC.map(([k, v]) => `${k.slice(7)} ${fmt0(v)} donuts`).join(', ')}`);
  if (res.cuts.length) console.log('  Production cuts (date, component, donuts short): ' + res.cuts.slice(0, 12).map((c) => `${c.date} ${c.comp} ${c.units}`).join('; ') + (res.cuts.length > 12 ? ` ... (${res.cuts.length} total)` : ''));
  const prodSkip = Object.entries(res.lostUnits).filter(([k]) => k.startsWith('_prod_'));
  if (prodSkip.length) checks.warns.push(`production skipped entirely: ${prodSkip.map(([k, v]) => `${k.slice(6)} ${fmt0(v)} units`).join(', ')}`);

  // --- end inventory ---------------------------------------------------------------------------------------------------
  h('Ending inventory (shadow state after today\'s 4 AM run)');
  let negative = 0;
  for (const [k, v] of res.inv) if (v < 0) negative++;
  console.log(`  Negative balances: ${negative}`);
  if (negative) checks.fails.push('negative inventory');
  const eo: string[] = [];
  for (const it of ITEMS) {
    if (!isPurchased(it)) continue;
    let q = 0;
    for (const l of ['KIT', 'PRV', 'ORM', 'LEH'] as LocCode[]) q += res.inv.get(`${l}|${it.sku}|fresh`) ?? 0;
    const arr = res.usageActual.get(it.sku) ?? [];
    const d = mean(arr.slice(Math.max(0, idxEnd - 30), idxEnd));
    eo.push(`${it.sku} ${fmt0(q)}${d > 0.001 ? ` (${fmt1(q / d)}d)` : ''}`);
  }
  console.log('  On hand (days of supply on last-30-day actual use): ' + eo.join(' | '));
  const fin = DONUT_SKUS.map((s) => `${s} ${SHOPS.map((l) => fmt0((res.inv.get(`${l}|${s}|fresh`) ?? 0))).join('/')}`).join('  ');
  console.log('  Fresh donuts at PRV/ORM/LEH this morning: ' + fin);

  // --- returns, orders ------------------------------------------------------------------------------------------------
  h('Other activity');
  console.log(`  Returns ${res.returns}, exchanges ${res.exchanges}; sales orders ${res.salesOrders.total} (cancelled ${res.salesOrders.cancelled}, ${pct(res.salesOrders.cancelled / Math.max(1, res.salesOrders.total))}); POs ${res.pos.length}; AP bills ${res.apBills.length}`);
  const lab = res.expenses.filter((e) => e.account === '6000').reduce((a, e) => a + e.amount, 0);
  const rent = res.expenses.filter((e) => e.account === '6100').reduce((a, e) => a + e.amount, 0);
  console.log(`  Expenses: labor ${fmtMoney(lab)}, rent and utilities ${fmtMoney(rent)} (${pct(lab / total)} and ${pct(rent / total)} of revenue)`);

  // --- MRP preview -------------------------------------------------------------------------------------------------------
  h('MRP preview: mrp_weekly(today, 4, false), confirmed orders only (replica of the database function)');
  const kitsTotal = res.futureEvents.reduce((a, e) => a + (e.t === 'so_create' ? e.lines.filter((l) => l.sku === 'KT-GFT').reduce((x, l) => x + l.qty, 0) : 0), 0);
  const dz = res.futureEvents.reduce((a, e) => a + (e.t === 'so_create' ? e.lines.filter((l) => l.sku.startsWith('DN-')).reduce((x, l) => x + l.qty, 0) : 0), 0) / 12;
  console.log(`  ${res.futureEvents.filter((e) => e.t === 'so_create').length} future orders: ${dz.toFixed(0)} dozen donuts and ${kitsTotal} gift kits (order scale x${res.futureScale})`);
  const prow = plannedRows(mrpPlan(res.today, res.futureEvents, res.inv, res.pos));
  console.log(`  ${prow.length} planned order(s) across ${new Set(prow.map((p) => p.sku)).size} components:`);
  for (const p of prow) {
    const it = ITEM_BY_SKU[p.sku];
    console.log(`    ${p.sku} ${pad(it.name, 22, true)} ${SUPPLIERS.find((s) => s.code === it.supplier)!.code}  week ${p.week}  on hand ${p.beginning.toFixed(0)}, gross ${p.gross.toFixed(0)}, receipts ${p.sr.toFixed(0)}, net ${p.net.toFixed(0)}, planned ${p.planned}  order by ${p.orderBy}${p.expedite ? ' (expedite)' : ''}`);
  }
  if (prow.length < 4) checks.warns.push(`only ${prow.length} MRP planned orders`);

  // --- volume --------------------------------------------------------------------------------------------------------------
  h('Row-count estimates');
  const sales = count.sale ?? 0;
  let saleLines = 0;
  for (const e of res.events) if (e.t === 'sale') saleLines += e.lines.length;
  console.log(`  sales rows ~${fmt0(sales + (count.so_fulfill ?? 0))}, sale_lines ~${fmt0(saleLines)}, inventory ledger rows ~${fmt0(res.ledgerRows)} (target <= ~100k)`);
  if (res.ledgerRows > 115000) checks.warns.push(`ledger rows ${res.ledgerRows} above 115k`);
  const wacCheck = SUPPLIERS.map((s) => s.code).length;
  void wacCheck; void month;

  h('Result');
  if (checks.fails.length === 0) console.log('PASS: no hard failures');
  else checks.fails.forEach((f) => console.log('FAIL: ' + f));
  checks.warns.forEach((w) => console.log('WARN: ' + w));
  return checks;
}

function lastCost(res: SimResult, sku: string): number | undefined {
  for (let i = res.pos.length - 1; i >= 0; i--) {
    const l = res.pos[i].lines.find((x) => x.sku === sku);
    if (l) return l.cost;
  }
  return undefined;
}

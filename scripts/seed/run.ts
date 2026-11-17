// Seed runner.
//   npm run seed       full reset: truncate, master data, opening balances, replay history through the real RPCs,
//                      future data, forecast backtest, demo auth users
//   npm run demo:prep  morning of the demo: close days, release today's bake plan, run production and transfers
// Requires DATABASE_URL (direct or session-pooler connection, not the transaction pooler) in ../../.env.local.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { A, type Sql } from './api.js';
import {
  BOMS, CUSTOMERS, DEMO_USERS, ITEMS, LOCATIONS, SUPPLIERS, TAX_RATE, isPurchased, isSellable,
  promotionsBetween, thanksgivingPromo, type LocCode,
} from './catalog.js';
import type { Ev } from './events.js';
import { addDays, range, ts, todayDenver } from './dates.js';
import { defaultOptions, simulate, type SimResult } from './simulate.js';
import { assertDisposableDemo } from '../../supabase/functions/_shared/protected-projects.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
dotenv.config({ path: path.join(root, '.env.local') });

const KEEP_TABLES = ['gl_accounts', 'reason_codes', 'app_settings', 'doc_sequences'];

// ------------------------------------------------------------------------------------------------
function connectionUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // fallback: build a session-pooler URL from the linked project (supabase/.temp) and SUPABASE_DB_PASSWORD
  const pw = process.env.SUPABASE_DB_PASSWORD;
  const poolerFile = path.join(root, 'supabase/.temp/pooler-url');
  if (pw && fs.existsSync(poolerFile)) {
    const u = new URL(fs.readFileSync(poolerFile, 'utf8').trim());
    u.password = pw;
    u.port = '5432';
    return u.toString();
  }
  throw new Error('DATABASE_URL is not set in .env.local. Use the direct or session-pooler connection string (port 5432).');
}

function connect() {
  const sql = postgres(connectionUrl(), {
    max: 1,
    prepare: false,
    idle_timeout: 0,
    connect_timeout: 30,
    onnotice: () => {},
    types: { bigint: { to: 20, from: [20], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) } },
  });
  return sql;
}

const log = (...a: unknown[]) => console.log(...a);
const fmt = (n: number) => n.toLocaleString('en-US');

// ------------------------------------------------------------------------------------------------
// Generic insert that only uses columns the table actually has (and says which it dropped).
const colCache = new Map<string, Set<string>>();
async function insertRows(sql: Sql, table: string, rows: Array<Record<string, unknown>>): Promise<any[]> {
  if (!colCache.has(table)) {
    const cols = await (sql as any).unsafe(`select column_name from information_schema.columns where table_schema='public' and table_name=$1`, [table]);
    colCache.set(table, new Set(cols.map((c: any) => c.column_name)));
  }
  const have = colCache.get(table)!;
  const keys = Object.keys(rows[0]);
  const used = keys.filter((k) => have.has(k));
  const dropped = keys.filter((k) => !have.has(k));
  if (dropped.length) log(`  note: ${table} has no column(s) ${dropped.join(', ')}; skipped`);
  const params: unknown[] = [];
  const tuples = rows.map((r) => `(${used.map((k) => { params.push(r[k] ?? null); return `$${params.length}`; }).join(', ')})`);
  return (sql as any).unsafe(`insert into ${table} (${used.join(', ')}) values ${tuples.join(', ')} returning *`, params);
}

// ------------------------------------------------------------------------------------------------
interface Ids {
  loc: Record<string, number>;
  sup: Record<string, number>;
  item: Record<string, number>;
  cust: Record<string, number>;
  itemSku: Record<number, string>;
}

async function truncateAll(sql: Sql) {
  try {
    await (sql as any).unsafe('select _reset_demo_data(true)');
    log('Reset business data with _reset_demo_data(true)');
    return;
  } catch (err: any) {
    log(`_reset_demo_data not available (${String(err?.message ?? err).slice(0, 80)}); truncating tables directly`);
  }
  const rows = await (sql as any)`select tablename from pg_tables where schemaname = 'public'`;
  const tables = rows.map((r: any) => r.tablename).filter((t: string) => !KEEP_TABLES.includes(t));
  log(`Truncating ${tables.length} tables (keeping ${KEEP_TABLES.join(', ')})`);
  await (sql as any).unsafe(`truncate table ${tables.map((t: string) => `public."${t}"`).join(', ')} restart identity cascade`);
  await (sql as any).unsafe(`update doc_sequences set next_no = 1`);
}

async function masterData(sql: Sql, res: SimResult): Promise<Ids> {
  const ids: Ids = { loc: {}, sup: {}, item: {}, cust: {}, itemSku: {} };
  const locs = await insertRows(sql, 'locations', LOCATIONS.map((l) => ({
    code: l.code, name: l.name, kind: l.kind, address: l.address, size_factor: l.size_factor, tax_rate: l.kind === 'shop' ? TAX_RATE : 0,
    open_time: l.open_time, close_time: l.close_time, closed_weekdays: `{${l.closed_weekdays.join(',')}}`,
  })));
  locs.forEach((r) => (ids.loc[r.code] = r.id));
  const sups = await insertRows(sql, 'suppliers', SUPPLIERS.map((s) => ({
    code: s.code, name: s.name, contact_name: s.contact_name, email: s.email, phone: s.phone, address: s.address,
    terms_label: s.terms_label, terms_days: s.terms_days, quoted_lead_time_days: s.quoted_lead_time_days, notes: s.notes,
  })));
  sups.forEach((r) => (ids.sup[r.code] = r.id));
  const items = await insertRows(sql, 'items', ITEMS.map((i) => ({
    sku: i.sku, name: i.name, category: i.category, barcode: i.barcode, item_type: i.type,
    is_sellable: isSellable(i), is_purchasable: isPurchased(i), is_manufactured: i.type === 'finished',
    uom: i.uom, list_price: i.price ?? null, reorder_point: res.initialRop[i.sku] ?? 0,
    preferred_supplier_id: i.supplier ? ids.sup[i.supplier] : null,
    lead_time_days: i.supplier ? SUPPLIERS.find((s) => s.code === i.supplier)!.quoted_lead_time_days : i.leadDays,
    shelf_life_days: i.shelfLife ?? null, season_start_md: i.seasonStart ?? null, season_end_md: i.seasonEnd ?? null,
    pack_size: i.type === 'finished' ? 12 : i.pack ?? 1,
  })));
  items.forEach((r) => { ids.item[r.sku] = r.id; ids.itemSku[r.id] = r.sku; });
  await insertRows(sql, 'item_suppliers', ITEMS.filter((i) => i.supplier).map((i) => ({
    item_id: ids.item[i.sku], supplier_id: ids.sup[i.supplier!], supplier_sku: `${i.supplier}-${i.sku}`, unit_cost: i.cost,
    quoted_lead_time_days: SUPPLIERS.find((s) => s.code === i.supplier)!.quoted_lead_time_days, pack_size: i.pack ?? 1, is_preferred: true,
  })));
  const bom: Array<Record<string, unknown>> = [];
  for (const [parent, comps] of Object.entries(BOMS)) for (const [c, q] of Object.entries(comps)) bom.push({ parent_item_id: ids.item[parent], component_item_id: ids.item[c], qty_per: q });
  await insertRows(sql, 'bom_lines', bom);
  const custs = await insertRows(sql, 'customers', CUSTOMERS.map((c) => ({
    name: c.name, kind: c.kind, email: c.email, phone: c.phone, home_location_id: c.home ? ids.loc[c.home] : null,
  })));
  custs.forEach((r) => (ids.cust[r.name] = r.id));
  const promos = [...promotionsBetween(res.start, res.end), thanksgivingPromo(res.end)];
  await insertRows(sql, 'promotions', promos.map((p) => ({
    name: p.name, starts_on: p.starts_on, ends_on: p.ends_on, location_id: p.location ? ids.loc[p.location] : null,
    item_id: p.sku ? ids.item[p.sku] : null, discount_pct: p.discount_pct, expected_lift: p.expected_lift,
  })));
  log(`Master data: ${locs.length} locations, ${sups.length} suppliers, ${items.length} items, ${bom.length} BOM lines, ${custs.length} customers, ${promos.length} promotions`);
  return ids;
}

// ------------------------------------------------------------------------------------------------
// Event handlers
interface State {
  mo: Map<string, number>;
  sale: Map<string, number>;
  so: Map<string, number>;
  po: Map<string, { id: number; lines: Map<string, number> }>;
  bill: Map<string, number>;
}
const newState = (): State => ({ mo: new Map(), sale: new Map(), so: new Map(), po: new Map(), bill: new Map() });

class Skip extends Error {}
const need = <T,>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new Skip(`missing ${what} (an earlier event failed)`);
  return v;
};

async function handle(sql: Sql, ids: Ids, st: State, e: Ev): Promise<void> {
  const at = ts(e.d, e.m);
  const L = (c: LocCode) => ids.loc[c];
  const I = (s: string) => ids.item[s];
  switch (e.t) {
    case 'opening':
      await A.opening(sql, { lines: e.lines.map((l) => ({ item_id: I(l.sku), location_id: L(l.loc), qty: l.qty, unit_cost: l.cost, condition: 'fresh' })), cash: 60000, at });
      return;
    case 'mo_create': {
      const id = await A.createMo(sql, { item: I(e.sku), qty: e.qty, due: e.d, at });
      st.mo.set(e.key, id);
      return;
    }
    case 'mo_start':
      await A.startMo(sql, { mo: need(st.mo.get(e.key), 'production order'), qty: e.qty, at });
      return;
    case 'mo_complete':
      await A.completeMo(sql, { mo: need(st.mo.get(e.key), 'production order'), good: e.good, defects: e.defects.map((d) => ({ kind: d.kind, qty: d.qty, reason_code: d.reason })), at });
      return;
    case 'transfer':
      await A.transfer(sql, { from: L(e.from), to: L(e.to), lines: e.lines.map((l) => ({ item_id: I(l.sku), qty: l.qty })), at });
      return;
    case 'sale': {
      const r = await A.completeSale(sql, {
        loc: L(e.loc), customer: ids.cust['Walk-in customer'], tickets: e.tickets, at,
        lines: e.lines.map((l) => ({ item_id: I(l.sku), qty: l.qty, condition: l.cond, discount_pct: Math.round(l.disc * 10000) / 100 })),
        payment: e.payment.method === 'cash' ? { method: 'cash', tendered: e.payment.tendered } : { method: e.payment.method },
      });
      st.sale.set(e.key, r.sale_id);
      return;
    }
    case 'return': {
      const saleId = need(st.sale.get(e.saleKey), 'sale');
      const rows = await (sql as any).unsafe('select id, item_id, condition from sale_lines where sale_id = $1', [saleId]);
      const lineId = (sku: string, cond: string) => rows.find((r: any) => r.item_id === I(sku) && r.condition === cond)?.id;
      await A.processReturn(sql, {
        sale: saleId, method: e.refundMethod, at,
        lines: e.lines.map((l) => ({ sale_line_id: need(lineId(l.sku, l.cond), 'sale line'), qty: l.qty, disposition: l.disposition, reason_code: l.reason })),
        exchange: e.exchange.map((x) => ({ item_id: I(x.sku), qty: x.qty })),
      });
      return;
    }
    case 'so_create': {
      const id = await A.createSo(sql, {
        customer: ids.cust[e.customer], loc: L(e.loc), requestedFor: ts(e.requested.d, e.requested.m), channel: e.channel, notes: e.note, at,
        lines: e.lines.map((l) => ({ item_id: I(l.sku), qty: l.qty })),
      });
      st.so.set(e.key, id);
      return;
    }
    case 'so_fulfill':
      await A.fulfillSo(sql, { so: need(st.so.get(e.key), 'sales order'), payment: e.payment.method === 'cash' ? { method: 'cash', tendered: e.payment.tendered } : { method: e.payment.method }, at });
      return;
    case 'so_close':
      await A.closeSo(sql, { so: need(st.so.get(e.key), 'sales order'), at });
      return;
    case 'so_cancel':
      await A.cancelSo(sql, { so: need(st.so.get(e.key), 'sales order'), reason: e.reason, at });
      return;
    case 'day_close':
      await A.closeDay(sql, { loc: L(e.loc), date: e.d, at });
      return;
    case 'waste':
      await A.waste(sql, { loc: L(e.loc), note: e.note, lines: e.lines.map((l) => ({ item_id: I(l.sku), condition: l.cond, qty: l.qty, reason_code: l.reason })), at });
      return;
    case 'adjust':
      await A.adjust(sql, {
        loc: L(e.loc), kind: e.kind, note: e.note, at,
        lines: e.lines.map((l) => ({ item_id: I(l.sku), condition: l.cond, reason_code: l.reason, ...(l.counted !== undefined ? { counted_qty: l.counted } : { qty_delta: l.delta }) })),
      });
      return;
    case 'po_create': {
      const id = await A.createPo(sql, { supplier: ids.sup[e.supplier], shipTo: L('KIT'), lines: e.lines.map((l) => ({ item_id: I(l.sku), qty: l.qty, unit_cost: l.cost })), at });
      const rows = await (sql as any).unsafe('select id, item_id from po_lines where po_id = $1', [id]);
      st.po.set(e.key, { id, lines: new Map(rows.map((r: any) => [ids.itemSku[r.item_id], r.id])) });
      return;
    }
    case 'po_send':
      await A.sendPo(sql, { po: need(st.po.get(e.key), 'purchase order').id, at });
      return;
    case 'po_receive': {
      const po = need(st.po.get(e.key), 'purchase order');
      const r = await A.receivePo(sql, { po: po.id, loc: L('KIT'), on: e.d, at, lines: e.lines.map((l) => ({ po_line_id: need(po.lines.get(l.sku), 'po line'), qty: l.qty })) });
      if (r.bill_id) st.bill.set(e.rcpt, r.bill_id);
      return;
    }
    case 'po_close':
      await A.closePo(sql, { po: need(st.po.get(e.key), 'purchase order').id, at });
      return;
    case 'ap_pay': {
      const bill = need(st.bill.get(e.rcpt), 'bill');
      const rows = await (sql as any).unsafe('select amount - amount_paid as owed from ap_bills where id = $1', [bill]);
      const owed = Number(rows[0]?.owed ?? 0);
      if (owed > 0) await A.payBill(sql, { bill, amount: owed, on: e.d, method: e.method, at });
      return;
    }
    case 'expense':
      await A.expense(sql, { date: e.d, account: e.account, amount: e.amount, memo: e.memo, loc: e.loc ? L(e.loc) : null, at });
      return;
  }
}

// ------------------------------------------------------------------------------------------------
interface Failure { date: string; type: string; message: string }

async function replayDay(sql: Sql, ids: Ids, st: State, evs: Ev[], lenient: boolean, failures: Failure[]) {
  await (sql as any).begin(async (tx: Sql) => {
    for (const e of evs) {
      if (!lenient) {
        await handle(tx, ids, st, e);
        continue;
      }
      try {
        await (tx as any).savepoint(async (sp: Sql) => handle(sp, ids, st, e));
      } catch (err: any) {
        failures.push({ date: e.d, type: e.t, message: String(err?.message ?? err).slice(0, 240) });
      }
    }
  });
}

async function replay(sql: Sql, ids: Ids, st: State, byDay: Map<string, Ev[]>, label: string, failures: Failure[]) {
  const dates = [...byDay.keys()].sort();
  const t0 = Date.now();
  let n = 0;
  for (const d of dates) {
    const evs = byDay.get(d)!;
    try {
      await replayDay(sql, ids, st, evs, false, failures);
    } catch (err: any) {
      log(`  ${d}: ${String(err?.message ?? err).slice(0, 200)}; replaying the day event by event`);
      await replayDay(sql, ids, st, evs, true, failures);
    }
    n++;
    const el = (Date.now() - t0) / 1000;
    if (n % 5 === 0 || n === dates.length) log(`  ${label} ${d} (${n}/${dates.length}) ${evs.length} events, ${el.toFixed(0)}s elapsed, ~${((el / n) * (dates.length - n)).toFixed(0)}s left`);
  }
}

const groupByDay = (evs: Ev[]) => {
  const m = new Map<string, Ev[]>();
  for (const e of evs) (m.get(e.d) ?? m.set(e.d, []).get(e.d)!).push(e);
  return m;
};

// ------------------------------------------------------------------------------------------------
async function authUsers(sql: Sql, ids: Ids) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.DEMO_PASSWORD;
  if (!url || !key || !password) {
    log('Skipping demo users: set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEMO_PASSWORD in .env.local');
    return;
  }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const existing = new Map<string, string>();
  for (let page = 1; page < 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    data.users.forEach((u) => u.email && existing.set(u.email.toLowerCase(), u.id));
    if (data.users.length < 200) break;
  }
  for (const u of DEMO_USERS) {
    const attrs: any = {
      email: u.email, password, email_confirm: true, user_metadata: { full_name: u.full_name },
      app_metadata: u.role === 'customer' ? {} : { role: u.role, home_location_code: u.home },
    };
    let uid = existing.get(u.email);
    if (uid) {
      const { error } = await admin.auth.admin.updateUserById(uid, attrs);
      if (error) throw error;
    } else {
      const { data, error } = await admin.auth.admin.createUser(attrs);
      if (error) throw error;
      uid = data.user.id;
    }
    const custId = u.customer ? ids.cust[u.customer] : null;
    await (sql as any).unsafe(
      `insert into profiles (user_id, full_name, role, home_location_id, customer_id) values ($1, $2, $3::app_role, $4, $5)
       on conflict (user_id) do update set full_name = excluded.full_name, role = excluded.role, home_location_id = excluded.home_location_id, customer_id = excluded.customer_id`,
      [uid, u.full_name, u.role, u.home ? ids.loc[u.home] : null, custId],
    );
    if (custId) await (sql as any).unsafe('update customers set auth_user_id = $1 where id = $2', [uid, custId]);
  }
  log(`Demo users ready: ${DEMO_USERS.map((u) => u.email).join(', ')}`);
}

// ------------------------------------------------------------------------------------------------
async function verifyShadow(sql: Sql, ids: Ids, res: SimResult) {
  const rows = await (sql as any).unsafe(`select i.sku, l.code, b.condition, b.qty_on_hand::float8 as q from inventory_balances b join items i on i.id = b.item_id join locations l on l.id = b.location_id`);
  const db = new Map<string, number>();
  rows.forEach((r: any) => db.set(`${r.code}|${r.sku}|${r.condition}`, Number(r.q)));
  let bad = 0;
  const samples: string[] = [];
  const keys = new Set([...db.keys(), ...res.inv.keys()]);
  for (const k of keys) {
    const a = db.get(k) ?? 0;
    const b = res.inv.get(k) ?? 0;
    if (Math.abs(a - b) > 0.01) {
      bad++;
      if (samples.length < 12) samples.push(`${k}: db ${a} vs simulator ${b}`);
    }
  }
  log(bad === 0 ? 'Inventory check: database balances match the simulator for every item, location and condition' : `Inventory check: ${bad} balance(s) differ from the simulator\n  ${samples.join('\n  ')}`);
}

async function summary(sql: Sql) {
  const q = async (t: string) => Number((await (sql as any).unsafe(`select count(*)::int as n from ${t}`))[0].n);
  const parts: string[] = [];
  for (const t of ['sales', 'sale_lines', 'inventory_transactions', 'journal_lines', 'purchase_orders', 'production_orders', 'sales_orders', 'app_events']) parts.push(`${t} ${fmt(await q(t))}`);
  log('Row counts: ' + parts.join(', '));
  const gl = await (sql as any).unsafe(`select (select coalesce(sum(value_delta),0) from inventory_transactions) as ledger, (select coalesce(sum(debit-credit),0) from journal_lines where account_code='1200') as gl1200, (select coalesce(sum(value_total),0) from item_costs) as costs`);
  log(`Inventory value: ledger ${gl[0].ledger}, GL 1200 ${gl[0].gl1200}, item costs ${gl[0].costs}`);
  const sc = await (sql as any).unsafe(`select name, score, rating from v_supplier_scorecard order by name`);
  log('Scorecards: ' + sc.map((r: any) => `${r.name} ${r.score} ${r.rating}`).join('; '));
  const mrp = await (sql as any).unsafe(`select count(*)::int as n from mrp_weekly() where planned_order_qty > 0`);
  log(`MRP planned orders in the next 4 weeks: ${mrp[0].n}`);
}

// ------------------------------------------------------------------------------------------------
async function seed(argv: string[]) {
  assertDisposableDemo(process.env.DEMO_PROJECT_REF, connectionUrl());
  const opts = defaultOptions(argv);
  const noAuth = argv.includes('--no-auth');
  log(`Simulating ${opts.days} days ending ${opts.end}...`);
  const res = simulate(opts);
  log(`  ${fmt(res.events.length)} history events, ${res.todayEvents.length} for this morning, ${res.futureEvents.length} future orders`);
  const sql = connect();
  const failures: Failure[] = [];
  try {
    await (sql as any).unsafe('set statement_timeout = 0');
    await (sql as any).unsafe('set synchronous_commit = off');
    await truncateAll(sql);
    const ids = await masterData(sql, res);
    const st = newState();
    log('Replaying history through the RPCs...');
    await replay(sql, ids, st, groupByDay(res.events), 'day', failures);
    log("Today's 4 AM production and transfers...");
    await replay(sql, ids, st, groupByDay(res.todayEvents), 'today', failures);
    log('Confirmed future orders...');
    await replay(sql, ids, st, groupByDay(res.futureEvents), 'orders', failures);

    // forecast backtest: one run per past day (using only earlier sales), then a live 14-day run and tomorrow's draft bake plan
    log('Forecast backtest for the last 56 days...');
    for (const d of range(addDays(res.end, -55), res.end)) await A.forecast(sql, { asOf: d, start: d, days: 1, at: ts(d, 4 * 60) });
    await A.forecast(sql, { asOf: res.today, start: res.today, days: 14, at: ts(res.today, 4 * 60 + 30) });
    try {
      await A.bakePlan(sql, { date: addDays(res.today, 1), at: ts(res.today, 18 * 60) });
      log('Draft bake plan created for tomorrow');
    } catch (err: any) {
      failures.push({ date: res.today, type: 'bake_plan', message: String(err?.message ?? err).slice(0, 240) });
    }
    try {
      const n = await A.applyRop(sql);
      log(`Stored reorder points updated from the calculated values (${n} items)`);
    } catch (err: any) {
      failures.push({ date: res.today, type: 'apply_rop', message: String(err?.message ?? err).slice(0, 240) });
    }
    await verifyShadow(sql, ids, res);
    await summary(sql);
    if (!noAuth) await authUsers(sql, ids);
    if (failures.length) {
      log(`\n${failures.length} event(s) failed (first 15):`);
      failures.slice(0, 15).forEach((f) => log(`  ${f.date} ${f.type}: ${f.message}`));
      process.exitCode = failures.length > 25 ? 2 : 0;
    } else log('\nSeed complete with no failed events.');
  } finally {
    await (sql as any).end({ timeout: 5 });
  }
}

// ------------------------------------------------------------------------------------------------
async function demoPrep() {
  assertDisposableDemo(process.env.DEMO_PROJECT_REF, connectionUrl());
  const sql = connect();
  try {
    await (sql as any).unsafe('set statement_timeout = 0');
    const today = todayDenver();
    log(`Demo prep for ${today}`);
    const shops = await (sql as any).unsafe(`select id, code from locations where kind = 'shop' and is_active order by id`);
    for (const s of shops) {
      const last = (await (sql as any).unsafe('select max(business_date)::text as d from day_closes where location_id = $1', [s.id]))[0].d;
      const from = last ? addDays(last, 1) : addDays(today, -1);
      for (const d of range(from, addDays(today, -1))) {
        const r = await A.closeDay(sql, { loc: s.id, date: d, at: ts(d, 18 * 60 + 30) });
        if (!r.already_closed) log(`  closed ${s.code} ${d}: ${r.expired_qty} expired, ${r.reclassified_qty} moved to day-old`);
      }
    }
    const hasRun = (await (sql as any).unsafe('select 1 from forecast_runs where as_of = $1::date limit 1', [today])).length > 0;
    if (!hasRun) await A.forecast(sql, { asOf: today, start: today, days: 14, at: null });
    let plan = (await (sql as any).unsafe('select id, status from bake_plans where plan_date = $1::date', [today]))[0];
    if (!plan) {
      const id = await A.bakePlan(sql, { date: today, at: null });
      plan = { id, status: 'draft' };
    }
    const r = await A.startBakeDay(sql, { plan: plan.id, yield: 0.96, at: null });
    log(`  bake plan ${plan.id}: ${r.orders_completed} production orders and ${r.transfers_completed} transfers completed`);
    const tomorrow = addDays(today, 1);
    const hasTomorrow = (await (sql as any).unsafe('select 1 from bake_plans where plan_date = $1::date', [tomorrow])).length > 0;
    if (!hasTomorrow) {
      await A.bakePlan(sql, { date: tomorrow, at: null });
      log("  drafted tomorrow's bake plan");
    }
    const stock = await (sql as any).unsafe(`select l.code, i.sku, b.qty_on_hand::float8 as q from inventory_balances b join items i on i.id = b.item_id join locations l on l.id = b.location_id where i.item_type = 'finished' and b.condition = 'fresh' and l.kind = 'shop' order by l.code, i.sku`);
    const by: Record<string, string[]> = {};
    stock.forEach((s: any) => (by[s.code] ??= []).push(`${s.sku} ${s.q}`));
    for (const [k, v] of Object.entries(by)) log(`  fresh at ${k}: ${v.join(', ')}`);
    log('Demo prep done.');
  } finally {
    await (sql as any).end({ timeout: 5 });
  }
}

// ------------------------------------------------------------------------------------------------
const [cmd, ...rest] = process.argv.slice(2);
(async () => {
  if (cmd === 'seed') await seed(rest);
  else if (cmd === 'demo-prep') await demoPrep();
  else {
    console.log('usage: tsx run.ts seed [--end YYYY-MM-DD] [--days N] [--no-auth] | demo-prep');
    process.exitCode = 1;
  }
})().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});

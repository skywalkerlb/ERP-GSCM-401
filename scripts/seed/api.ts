// The only place that knows RPC names and parameter names. Each function maps one simulator event onto the
// real database function (see supabase/migrations). If a signature changes, change it here.

import type postgres from 'postgres';

export type Sql = postgres.Sql<any> | postgres.TransactionSql<any>;
export type Arg = [name: string, value: unknown, cast?: string];

const json = (v: unknown) => JSON.stringify(v);

/** Call `select * from fn(named => $n, ...)` and unwrap scalar / jsonb results. */
export async function rpc(sql: Sql, fn: string, args: Arg[]): Promise<any> {
  const params: unknown[] = [];
  const parts: string[] = [];
  for (const [name, value, cast] of args) {
    if (value === undefined) continue;
    params.push(typeof value === 'object' && value !== null && !(value instanceof Date) ? json(value) : value);
    const c = cast ?? (typeof value === 'object' && value !== null ? 'jsonb' : undefined);
    // send as text and cast server-side so the driver never reinterprets dates or json
    const viaText = c === 'timestamptz' || c === 'date' || c === 'jsonb';
    parts.push(`${name} => $${params.length}${viaText ? '::text' : ''}${c ? '::' + c : ''}`);
  }
  const rows = await (sql as any).unsafe(`select * from ${fn}(${parts.join(', ')})`, params as any[]);
  if (rows.length === 1) {
    const keys = Object.keys(rows[0]);
    if (keys.length === 1) return rows[0][keys[0]];
    return rows[0];
  }
  return rows;
}

const AT = 'timestamptz';

export const A = {
  completeSale: (sql: Sql, a: { loc: number; lines: unknown[]; payment: unknown; customer: number | null; tickets: number; at: string }) =>
    rpc(sql, 'complete_sale', [
      ['p_location_id', a.loc, 'bigint'], ['p_lines', a.lines], ['p_payment', a.payment], ['p_customer_id', a.customer, 'bigint'],
      ['p_channel', 'history_batch', 'text'], ['p_ticket_count', a.tickets, 'int'], ['p_at', a.at, AT],
    ]),
  processReturn: (sql: Sql, a: { sale: number; lines: unknown[]; exchange: unknown[] | null; method: string; at: string }) =>
    rpc(sql, 'process_return', [
      ['p_sale_id', a.sale, 'bigint'], ['p_lines', a.lines], ['p_exchange_lines', a.exchange && a.exchange.length ? a.exchange : null, 'jsonb'],
      ['p_refund_method', a.method, 'text'], ['p_at', a.at, AT],
    ]),
  createSo: (sql: Sql, a: { customer: number; loc: number; requestedFor: string; lines: unknown[]; channel: string; notes: string; at: string }) =>
    rpc(sql, 'create_sales_order', [
      ['p_customer_id', a.customer, 'bigint'], ['p_location_id', a.loc, 'bigint'], ['p_requested_for', a.requestedFor, AT],
      ['p_lines', a.lines], ['p_channel', a.channel, 'text'], ['p_notes', a.notes || null, 'text'], ['p_at', a.at, AT],
    ]),
  fulfillSo: (sql: Sql, a: { so: number; payment: unknown; at: string }) =>
    rpc(sql, 'fulfill_sales_order', [['p_so_id', a.so, 'bigint'], ['p_payment', a.payment], ['p_at', a.at, AT]]),
  closeSo: (sql: Sql, a: { so: number; at: string }) => rpc(sql, 'close_sales_order', [['p_so_id', a.so, 'bigint'], ['p_at', a.at, AT]]),
  cancelSo: (sql: Sql, a: { so: number; reason: string; at: string }) =>
    rpc(sql, 'cancel_sales_order', [['p_so_id', a.so, 'bigint'], ['p_reason', a.reason, 'text'], ['p_at', a.at, AT]]),
  createMo: (sql: Sql, a: { item: number; qty: number; due: string; at: string }) =>
    rpc(sql, 'create_production_order', [['p_item', a.item, 'bigint'], ['p_qty_planned', a.qty, 'numeric'], ['p_due_date', a.due, 'date'], ['p_at', a.at, AT]]),
  startMo: (sql: Sql, a: { mo: number; qty: number; at: string }) =>
    rpc(sql, 'start_production_order', [['p_mo_id', a.mo, 'bigint'], ['p_qty_started', a.qty, 'numeric'], ['p_at', a.at, AT]]),
  completeMo: (sql: Sql, a: { mo: number; good: number; defects: unknown[]; at: string }) =>
    rpc(sql, 'complete_production_order', [['p_mo_id', a.mo, 'bigint'], ['p_qty_good', a.good, 'numeric'], ['p_defects', a.defects], ['p_at', a.at, AT]]),
  transfer: (sql: Sql, a: { from: number; to: number; lines: unknown[]; at: string }) =>
    rpc(sql, 'create_transfer', [['p_from', a.from, 'bigint'], ['p_to', a.to, 'bigint'], ['p_lines', a.lines], ['p_complete', true, 'boolean'], ['p_at', a.at, AT]]),
  closeDay: (sql: Sql, a: { loc: number; date: string; at: string }) =>
    rpc(sql, 'close_business_day', [['p_location', a.loc, 'bigint'], ['p_date', a.date, 'date'], ['p_at', a.at, AT]]),
  waste: (sql: Sql, a: { loc: number; lines: unknown[]; note?: string; at: string }) =>
    rpc(sql, 'log_waste', [['p_location', a.loc, 'bigint'], ['p_lines', a.lines], ['p_note', a.note ?? null, 'text'], ['p_at', a.at, AT]]),
  adjust: (sql: Sql, a: { loc: number; kind: string; lines: unknown[]; note?: string; at: string }) =>
    rpc(sql, 'post_adjustment', [['p_location', a.loc, 'bigint'], ['p_kind', a.kind, 'text'], ['p_lines', a.lines], ['p_note', a.note ?? null, 'text'], ['p_at', a.at, AT]]),
  createPo: (sql: Sql, a: { supplier: number; shipTo: number; lines: unknown[]; at: string }) =>
    rpc(sql, 'create_purchase_order', [['p_supplier', a.supplier, 'bigint'], ['p_ship_to', a.shipTo, 'bigint'], ['p_lines', a.lines], ['p_source', 'sim', 'text'], ['p_at', a.at, AT]]),
  sendPo: (sql: Sql, a: { po: number; at: string }) => rpc(sql, 'send_purchase_order', [['p_po_id', a.po, 'bigint'], ['p_at', a.at, AT]]),
  receivePo: (sql: Sql, a: { po: number; loc: number; on: string; lines: unknown[]; at: string }) =>
    rpc(sql, 'receive_purchase_order', [['p_po_id', a.po, 'bigint'], ['p_location_id', a.loc, 'bigint'], ['p_received_on', a.on, 'date'], ['p_lines', a.lines], ['p_at', a.at, AT]]),
  closePo: (sql: Sql, a: { po: number; at: string }) => rpc(sql, 'close_purchase_order', [['p_po_id', a.po, 'bigint'], ['p_at', a.at, AT]]),
  payBill: (sql: Sql, a: { bill: number; amount: number; on: string; method: string; at: string }) =>
    rpc(sql, 'record_ap_payment', [['p_bill_id', a.bill, 'bigint'], ['p_amount', a.amount, 'numeric'], ['p_paid_on', a.on, 'date'], ['p_method', a.method, 'text'], ['p_at', a.at, AT]]),
  expense: (sql: Sql, a: { date: string; account: string; amount: number; memo: string; loc: number | null; at: string }) =>
    rpc(sql, 'record_expense', [['p_date', a.date, 'date'], ['p_account', a.account, 'text'], ['p_amount', a.amount, 'numeric'], ['p_memo', a.memo, 'text'], ['p_location_id', a.loc, 'bigint'], ['p_at', a.at, AT]]),
  opening: (sql: Sql, a: { lines: unknown[]; cash: number; at: string }) =>
    rpc(sql, '_post_opening', [['p_lines', a.lines], ['p_cash', a.cash, 'numeric'], ['p_at', a.at, AT]]),
  forecast: (sql: Sql, a: { asOf: string; start: string; days: number; at: string | null }) =>
    rpc(sql, 'generate_forecast', [['p_as_of', a.asOf, 'date'], ['p_start', a.start, 'date'], ['p_days', a.days, 'int'], ['p_at', a.at, AT]]),
  bakePlan: (sql: Sql, a: { date: string; at: string | null }) => rpc(sql, 'build_bake_plan', [['p_plan_date', a.date, 'date'], ['p_at', a.at, AT]]),
  startBakeDay: (sql: Sql, a: { plan: number; yield: number; at: string | null }) =>
    rpc(sql, 'start_bake_day', [['p_plan_id', a.plan, 'bigint'], ['p_yield', a.yield, 'numeric'], ['p_at', a.at, AT]]),
  applyRop: (sql: Sql) => rpc(sql, 'apply_computed_reorder_points', []),
};

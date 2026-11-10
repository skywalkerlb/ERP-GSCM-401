// Business events produced by the simulator and replayed by the runner through the real RPCs.
// Every event carries the Denver calendar date and minute-of-day at which it happened (the runner turns
// these into the `p_at` timestamp). Cross-event references use string keys (sale keys, PO keys, ...).

import type { LocCode, SupCode } from './catalog.js';

export type Cond = 'fresh' | 'day_old';
interface Base {
  d: string; // business date
  m: number; // minute of day
}
export type Payment = { method: 'cash' | 'card' | 'other'; tendered: number | null };

export type Ev = Base &
  (
    | { t: 'opening'; lines: Array<{ sku: string; loc: LocCode; qty: number; cost: number }> }
    | { t: 'mo_create'; key: string; sku: string; qty: number }
    | { t: 'mo_start'; key: string; qty: number }
    | { t: 'mo_complete'; key: string; good: number; defects: Array<{ kind: 'scrap' | 'rework'; qty: number; reason: string }> }
    | { t: 'transfer'; key: string; from: LocCode; to: LocCode; lines: Array<{ sku: string; qty: number }> }
    | { t: 'sale'; key: string; loc: LocCode; lines: Array<{ sku: string; qty: number; cond: Cond; disc: number }>; payment: Payment; tickets: number }
    | { t: 'return'; saleKey: string; loc: LocCode; lines: Array<{ sku: string; cond: Cond; qty: number; disposition: 'restock' | 'quality_failure'; reason: string }>; exchange: Array<{ sku: string; qty: number }>; refundMethod: 'cash' | 'card' }
    | { t: 'so_create'; key: string; customer: string; loc: LocCode; requested: { d: string; m: number }; channel: 'catering' | 'phone' | 'online' | 'counter'; lines: Array<{ sku: string; qty: number }>; note: string }
    | { t: 'so_fulfill'; key: string; payment: Payment }
    | { t: 'so_close'; key: string }
    | { t: 'so_cancel'; key: string; reason: string }
    | { t: 'day_close'; loc: LocCode }
    | { t: 'waste'; loc: LocCode; lines: Array<{ sku: string; cond: Cond; qty: number; reason: string }>; note?: string }
    | { t: 'adjust'; loc: LocCode; kind: 'cycle_count' | 'damage'; lines: Array<{ sku: string; cond: Cond; counted?: number; delta?: number; reason: string }>; note?: string }
    | { t: 'po_create'; key: string; supplier: SupCode; lines: Array<{ sku: string; qty: number; cost: number }> }
    | { t: 'po_send'; key: string }
    | { t: 'po_receive'; key: string; rcpt: string; lines: Array<{ sku: string; qty: number }> }
    | { t: 'po_close'; key: string }
    | { t: 'ap_pay'; rcpt: string; method: 'ach' | 'check' }
    | { t: 'expense'; account: '6000' | '6100'; amount: number; memo: string; loc: LocCode | null }
  );

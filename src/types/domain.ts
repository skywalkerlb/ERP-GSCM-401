/**
 * Glazed ERP domain types (hand-written contract; mirrors supabase/CONTRACT.md).
 *
 * Conventions
 * - Money, quantities and costs are `number` (PostgREST serializes numeric as JSON numbers).
 * - Dates are 'YYYY-MM-DD' strings (business dates, America/Denver); timestamps are ISO strings.
 * - ids are numbers; profile / auth user ids are uuid strings.
 * - Generated Postgres types live in ./db.ts (supabase gen types). Prefer these domain types in UI code.
 */

// ---------------------------------------------------------------- enums and unions
/** Same union as `AppRole` exported by src/hooks/useAuth.tsx (structurally identical; either can be used). */
export type { AppRole } from '@/hooks/useAuth';
import type { AppRole } from '@/hooks/useAuth';
export type StaffRole = Exclude<AppRole, 'customer'>;
export type ItemType = 'raw' | 'packaging' | 'finished' | 'resale' | 'kit';
export type StockCondition = 'fresh' | 'day_old';
export type LocationKind = 'shop' | 'kitchen';
export type Uom = 'each' | 'lb' | 'gal';
export type ReasonCategory = 'adjustment' | 'waste' | 'scrap' | 'rework' | 'return';
export type TxnType =
  | 'opening' | 'receipt_po' | 'sale' | 'sale_return' | 'return_scrap'
  | 'transfer_out' | 'transfer_in' | 'adjust_count' | 'adjust_damage'
  | 'waste' | 'dayold_out' | 'dayold_in' | 'prod_issue' | 'prod_receipt';
export type CustomerKind = 'walk_in' | 'retail' | 'business';
export type SaleChannel = 'pos' | 'sales_order' | 'exchange' | 'history_batch';
export type PaymentMethod = 'cash' | 'card' | 'other';
export type RefundMethod = 'cash' | 'card';
export type SalesOrderChannel = 'counter' | 'phone' | 'catering' | 'online';
export type SalesOrderStatus = 'placed' | 'fulfilled' | 'closed' | 'cancelled';
export type ReturnKind = 'return' | 'exchange';
export type ReturnDisposition = 'restock' | 'quality_failure';
export type TransferStatus = 'planned' | 'completed' | 'cancelled';
export type AdjustmentKind = 'cycle_count' | 'damage' | 'waste' | 'day_close';
/** Kinds accepted by `post_adjustment`. */
export type PostAdjustmentKind = 'cycle_count' | 'damage';
export type MoStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';
export type DefectKind = 'scrap' | 'rework';
export type PoStatus = 'draft' | 'sent' | 'received' | 'closed' | 'cancelled';
export type PoSource = 'manual' | 'auto_replenish' | 'sim';
export type ApBillStatus = 'open' | 'paid';
export type BakePlanStatus = 'draft' | 'released';
export type SupplierRating = 'keep' | 'watch' | 'replace' | 'unrated';
export type ReorderUrgency = 'ok' | 'order_now' | 'late';
export type GlAccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'contra_revenue' | 'expense';
export type SalesGrain = 'day' | 'week';
export type PnlLineType = 'line' | 'subtotal' | 'total' | 'pct';

/** Reason codes seeded by migration 0015. */
export type AdjustmentReason = 'COUNT' | 'DAMAGE';
export type WasteReason = 'EXPIRED' | 'DROPPED' | 'BURNT' | 'OVERPROD';
export type ScrapReason = 'UNDERPROOF' | 'MISSHAPEN' | 'FILL_LEAK' | 'GLAZE_DEFECT';
export type ReturnReason = 'QUALITY_STALE' | 'FOREIGN_OBJ' | 'WRONG_ITEM' | 'CHANGED_MIND';
export type ReasonCode = AdjustmentReason | WasteReason | ScrapReason | ReturnReason;

/** `app_events.topic` values written by the RPCs. */
export type EventTopic =
  | 'sale.completed' | 'return.processed'
  | 'so.placed' | 'so.fulfilled' | 'so.closed' | 'so.cancelled'
  | 'po.created' | 'po.sent' | 'po.received' | 'po.closed' | 'po.paid'
  | 'mo.created' | 'mo.started' | 'mo.completed' | 'mo.cancelled'
  | 'transfer.created' | 'transfer.completed' | 'transfer.cancelled'
  | 'inventory.adjusted' | 'inventory.changed' | 'waste.logged' | 'day.closed'
  | 'forecast.generated' | 'forecast.bakeplan_built' | 'bakeplan.released'
  | 'expense.recorded' | 'settings.updated';

// ---------------------------------------------------------------- table rows
export interface Location {
  id: number; code: string; name: string; kind: LocationKind; address: string | null;
  size_factor: number; tax_rate: number; open_time: string | null; close_time: string | null;
  /** 0 = Sunday ... 6 = Saturday */
  closed_weekdays: number[]; is_active: boolean;
}
export interface Supplier {
  id: number; code: string; name: string; contact_name: string | null; email: string | null; phone: string | null;
  address: string | null; terms_label: string; terms_days: number; quoted_lead_time_days: number;
  notes: string | null; is_active: boolean;
}
export interface Item {
  id: number; sku: string; name: string; category: string | null; barcode: string | null; item_type: ItemType;
  is_sellable: boolean; is_purchasable: boolean; is_manufactured: boolean; uom: Uom; list_price: number | null;
  reorder_point: number; safety_stock_override: number | null; preferred_supplier_id: number | null;
  lead_time_days: number; shelf_life_days: number | null;
  /** 'MM-DD' */
  season_start_md: string | null; season_end_md: string | null; pack_size: number; is_active: boolean;
}
export interface ItemSupplier {
  item_id: number; supplier_id: number; supplier_sku: string | null; unit_cost: number;
  quoted_lead_time_days: number | null; pack_size: number; is_preferred: boolean;
}
export interface BomLine { id: number; parent_item_id: number; component_item_id: number; qty_per: number }
export interface Customer {
  id: number; auth_user_id: string | null; name: string; kind: CustomerKind; email: string | null; phone: string | null;
  home_location_id: number | null; is_active: boolean; created_at: string;
}
/** Same shape as `Profile` in src/hooks/useAuth.tsx. */
export interface Profile {
  user_id: string; full_name: string | null; role: AppRole; home_location_id: number | null; customer_id: number | null;
}
export interface ReasonCodeRow { code: ReasonCode | string; category: ReasonCategory; label: string }
export interface Promotion {
  id: number; name: string; starts_on: string; ends_on: string; location_id: number | null; item_id: number | null;
  discount_pct: number; expected_lift: number;
}
export interface AppSettings {
  id: 1; ordering_cost_per_po: number; holding_cost_rate_annual: number; service_level_z: number; usage_window_days: number;
  review_period_days: number; use_actual_lead_time: boolean; bake_buffer_pct: number; day_old_markdown_pct: number;
  score_w_ontime: number; score_w_fill: number; score_w_lead: number; keep_threshold: number; watch_threshold: number;
  default_tax_rate: number; timezone: string; business_name: string; updated_at: string;
}
export interface GlAccount {
  code: string; name: string; type: GlAccountType; statement: 'balance_sheet' | 'income'; normal_side: 'debit' | 'credit';
}
export interface JournalEntry { id: number; entry_date: string; source_type: string; source_id: number | null; memo: string | null; created_at: string }
export interface JournalLine {
  id: number; entry_id: number; account_code: string; location_id: number | null; debit: number; credit: number;
}
export interface InventoryTransaction {
  id: number; txn_at: string; business_date: string; item_id: number; location_id: number; condition: StockCondition;
  txn_type: TxnType; qty_delta: number; unit_cost: number; value_delta: number; reason_code: string | null;
  ref_type: string | null; ref_id: number | null; ref_line_id: number | null; journal_entry_id: number | null;
  user_id: string | null; note: string | null;
}
export interface InventoryBalance { item_id: number; location_id: number; condition: StockCondition; qty_on_hand: number }
export interface ItemCost { item_id: number; qty_total: number; value_total: number; avg_cost: number | null }

export interface Sale {
  id: number; receipt_no: string; location_id: number; business_date: string; sold_at: string; cashier_id: string | null;
  customer_id: number | null; channel: SaleChannel; ticket_count: number;
  /** gross, before discounts */ subtotal: number; discount_total: number; tax_rate: number; tax_total: number; total: number;
  payment_method: PaymentMethod; tendered: number; change_due: number; sales_order_id: number | null;
  exchange_return_id: number | null;
}
export interface SaleLine {
  id: number; sale_id: number; item_id: number; condition: StockCondition; qty: number; unit_price: number;
  discount_amt: number; line_net: number; unit_cost: number; cogs_total: number; qty_returned: number;
}
export interface ReturnDoc {
  id: number; return_no: string; sale_id: number; location_id: number; kind: ReturnKind; refund_net: number;
  tax_refund: number; refund_total: number; net_due: number; refund_method: string; exchange_sale_id: number | null;
  processed_by: string | null; returned_at: string; business_date: string;
}
export interface ReturnLine {
  id: number; return_id: number; sale_line_id: number; item_id: number; qty: number; disposition: ReturnDisposition;
  reason_code: string | null; refund_amt: number; gross_amt: number; cost_amt: number;
}
export interface SalesOrder {
  id: number; so_number: string; customer_id: number; location_id: number; channel: SalesOrderChannel;
  status: SalesOrderStatus; requested_for: string; fulfilled_at: string | null; closed_at: string | null;
  cancelled_reason: string | null; sale_id: number | null; notes: string | null; created_at: string;
}
export interface SoLine { id: number; so_id: number; item_id: number; qty: number; unit_price: number; qty_fulfilled: number }
export interface Transfer {
  id: number; trf_no: string; from_location_id: number; to_location_id: number; status: TransferStatus;
  bake_plan_id: number | null; completed_at: string | null; created_at: string;
}
export interface TransferLine { id: number; transfer_id: number; item_id: number; condition: StockCondition; qty: number }
export interface InventoryAdjustment {
  id: number; adj_no: string; location_id: number; kind: AdjustmentKind; note: string | null; posted_at: string; business_date: string;
}
export interface AdjustmentLine {
  id: number; adj_id: number; item_id: number; condition: StockCondition; system_qty: number; counted_qty: number | null;
  qty_delta: number; reason_code: string | null; value_delta: number;
}
export interface DayClose {
  id: number; location_id: number; business_date: string; closed_at: string; expired_qty: number; expired_value: number;
  reclassified_qty: number; adj_id: number | null;
}
export interface ProductionOrder {
  id: number; mo_number: string; item_id: number; location_id: number; status: MoStatus; qty_planned: number;
  qty_started: number; qty_good: number; qty_scrapped: number; qty_reworked: number; due_date: string;
  started_at: string | null; finished_at: string | null; unit_cost: number; issued_value: number; bake_plan_id: number | null;
}
export interface ProductionDefect { id: number; mo_id: number; kind: DefectKind; qty: number; reason_code: string }
export interface PurchaseOrder {
  id: number; po_number: string; supplier_id: number; ship_to_location_id: number; status: PoStatus; source: PoSource;
  created_on: string; sent_on: string | null; expected_on: string | null; quoted_lead_days: number | null; total: number;
  notes: string | null; created_at: string;
}
export interface PoLine {
  id: number; po_id: number; item_id: number; qty_ordered: number; unit_cost: number; qty_received: number;
  qty_cancelled: number; expected_on: string | null;
}
export interface PoReceipt {
  id: number; receipt_no: string; po_id: number; location_id: number; received_on: string; received_at: string;
  received_by: string | null; amount: number;
}
export interface PoReceiptLine { id: number; receipt_id: number; po_line_id: number; qty: number; unit_cost: number; value: number }
export interface ApBill {
  id: number; supplier_id: number; po_id: number | null; receipt_id: number | null; bill_date: string; due_date: string;
  amount: number; amount_paid: number; status: ApBillStatus;
}
export interface ApPayment { id: number; bill_id: number; paid_on: string; amount: number; method: string }
export interface Expense {
  id: number; expense_date: string; account_code: string; amount: number; memo: string | null; location_id: number | null;
}
export interface ForecastRun { id: number; as_of: string; created_at: string }
export interface DemandForecast {
  run_id: number; item_id: number; location_id: number; forecast_date: string; qty: number; base: number;
  weekday_idx: number; trend_factor: number; season_factor: number; promo_lift: number;
}
export interface BakePlan {
  id: number; plan_no: string; plan_date: string; status: BakePlanStatus; buffer_pct: number;
  forecast_run_id: number | null; released_at: string | null;
}
export interface BakePlanLine {
  id: number; plan_id: number; item_id: number; location_id: number; forecast_qty: number; so_qty: number;
  planned_qty: number; override_qty: number | null; final_qty: number;
}
export interface AppEvent {
  id: number; topic: EventTopic | string; entity: string | null; entity_id: number | null; location_id: number | null;
  customer_id: number | null; actor_id: string | null; summary: string | null; at: string;
}

// ---------------------------------------------------------------- view / report rows
export interface ItemAvailability {
  item_id: number; sku: string; name: string; category: string | null; item_type: ItemType; uom: Uom;
  location_id: number; location_code: string; location_name: string; location_kind: LocationKind;
  on_hand: number; on_hand_fresh: number; on_hand_day_old: number;
  /** open `placed` sales-order qty at the location */ allocated: number;
  available: number; backordered: number; on_order: number; reorder_point: number;
  est_available_date: string;
}
export interface CatalogRow {
  location_id: number; location_code: string; location_name: string; item_id: number; sku: string; name: string;
  category: string | null; list_price: number; available_qty: number; in_stock: boolean; est_available_date: string;
}
export interface InventoryValuationRow {
  item_id: number; sku: string; name: string; category: string | null; item_type: ItemType; uom: Uom;
  location_id: number; location_code: string; location_name: string; qty_on_hand: number; qty_fresh: number;
  qty_day_old: number; avg_cost: number | null; value: number;
}
export interface InventoryGlCheck {
  ledger_value: number; item_costs_value: number; valuation_value: number; gl_1200_balance: number;
  ledger_vs_gl: number; costs_vs_gl: number; valuation_vs_gl: number;
}
export interface ItemDailyUsage { item_id: number; usage_date: string; qty: number }
export interface ReorderAnalysisRow {
  item_id: number; sku: string; name: string; category: string | null; uom: Uom; supplier_id: number | null;
  supplier_name: string | null; pack_size: number; unit_cost: number;
  quoted_lead_days: number; actual_lead_days: number | null; sigma_lead_days: number;
  /** L actually used (quoted, or actual when settings.use_actual_lead_time) */ lead_time_days: number;
  avg_daily_usage: number; sigma_daily_usage: number; safety_stock: number;
  rop_calc: number; rop_stored: number; annual_demand: number; ordering_cost: number; holding_cost_rate: number;
  eoq: number | null; on_hand: number; on_order: number; backordered: number; inventory_position: number;
  below_rop: boolean; suggested_qty: number; days_of_cover: number | null; stockout_date: string | null;
  order_by_date: string | null; urgency: ReorderUrgency;
}
export interface PeriodicReviewRow {
  item_id: number; sku: string; name: string; category: string | null; uom: Uom; supplier_id: number | null;
  supplier_name: string | null; pack_size: number; unit_cost: number; review_period_days: number; lead_time_days: number;
  avg_daily_usage: number; sigma_daily_usage: number; order_up_to_level: number; inventory_position: number;
  order_qty: number; urgency: ReorderUrgency;
}
export interface SupplierScorecardRow {
  supplier_id: number; code: string; name: string; terms_label: string; quoted_lead_time_days: number; po_count: number;
  on_time_rate: number | null; avg_actual_lead_days: number | null; avg_quoted_lead_days: number | null;
  fill_rate: number | null; lead_score: number | null; score: number | null; rating: SupplierRating;
  amount_owed: number; next_due_date: string | null; overdue_amount: number; pct_paid_on_time: number | null;
}
export interface MrpRow {
  item_id: number; sku: string; item_name: string; uom: Uom; supplier_id: number | null; supplier_name: string | null;
  lead_time_days: number; pack_size: number; week_no: number; week_start: string; week_end: string;
  beginning_on_hand: number; gross_req: number; scheduled_receipts: number; net_req: number; planned_order_qty: number;
  projected_on_hand: number; requirement_date: string | null; order_by_date: string | null; is_expedite: boolean;
}
export interface ReplenishSuggestion {
  item_id: number; sku: string; name: string; uom: Uom; supplier_id: number; supplier_name: string; qty: number;
  unit_cost: number; line_total: number; source: 'rop' | 'mrp' | 'rop+mrp'; rop_qty: number; mrp_qty: number;
  order_by_date: string | null; urgency: ReorderUrgency; has_open_draft: boolean;
}
export interface ApOpenBill {
  bill_id: number; supplier_id: number; supplier_name: string; po_id: number | null; po_number: string | null;
  receipt_id: number | null; bill_date: string; due_date: string; amount: number; amount_paid: number; balance: number;
  days_overdue: number; is_overdue: boolean;
}
export interface TrialBalanceRow {
  account_code: string; name: string; type: GlAccountType; normal_side: 'debit' | 'credit'; debit: number; credit: number; balance: number;
}
export interface PnlLine {
  sort_order: number; line_key: string; label: string; account_code: string | null; amount: number | null; line_type: PnlLineType;
}
export interface TurnoverRow {
  /** null on the company total row (sku 'TOTAL') */ item_id: number | null; sku: string; name: string; category: string | null;
  cogs: number; avg_inventory: number; turnover: number | null; days_on_hand: number | null;
}
export interface SalesSummaryRow {
  period_start: string; period_label: string; tickets: number; units: number; gross_sales: number; discounts: number;
  returns: number; net_sales: number; tax: number; cogs: number; gross_profit: number; avg_ticket: number | null;
}
export interface TopSellerRow {
  rank: number; item_id: number; sku: string; name: string; category: string | null; units: number; revenue: number;
  cogs: number; margin: number;
}
export interface WasteSummaryRow {
  business_date: string; location_id: number; location_code: string; location_name: string; item_id: number; sku: string;
  item_name: string; category: string | null; reason_code: string | null; reason_label: string | null;
  condition: StockCondition; qty: number; cost: number;
}
export interface WasteReport {
  summary: { waste_qty: number; waste_cost: number; production_cost: number; production_qty: number; waste_pct_of_production_cost: number | null };
  by_reason: Array<{ reason_code: string | null; label: string | null; qty: number; cost: number; pct_of_waste: number | null }>;
  by_item: Array<{ item_id: number; sku: string; name: string; qty: number; cost: number; produced_qty: number; produced_cost: number; waste_pct_of_production_cost: number | null }>;
  by_location: Array<{ location_id: number; code: string; name: string; qty: number; cost: number }>;
  by_day: Array<{ business_date: string; qty: number; cost: number }>;
}
export interface ForecastAccuracyStat { actual: number; forecast: number; wape: number | null; bias: number | null }
export interface ForecastAccuracy {
  overall: { n: number; actual: number; forecast: number; wape: number | null; bias: number | null };
  by_item: Array<ForecastAccuracyStat & { item_id: number; sku: string; name: string }>;
  by_location: Array<ForecastAccuracyStat & { location_id: number; code: string; name: string }>;
  by_day: Array<{ date: string; actual: number; forecast: number; wape: number | null }>;
}
export interface ProductionKpis {
  yield: number | null; scrap_rate: number | null; first_pass_yield: number | null; schedule_attainment: number | null;
}
export interface ProductionReport {
  summary: ProductionKpis & {
    orders: number; qty_planned: number; qty_started: number; qty_good: number; qty_scrapped: number; qty_reworked: number;
    on_time_rate: number | null; avg_cycle_hours: number | null; cost_per_dozen: number | null;
  };
  by_item: Array<ProductionKpis & {
    item_id: number; sku: string; name: string; orders: number; qty_planned: number; qty_started: number; qty_good: number;
    qty_scrapped: number; qty_reworked: number; cost_per_dozen: number | null;
  }>;
  by_day: Array<{ date: string; orders: number; qty_started: number; qty_good: number; qty_scrapped: number; yield: number | null }>;
  scrap_pareto: ParetoRow[];
  rework_pareto: ParetoRow[];
  orders: Array<{
    mo_id: number; mo_number: string; item_id: number; sku: string; name: string; due_date: string; finished_at: string;
    qty_planned: number; qty_started: number; qty_good: number; qty_scrapped: number; qty_reworked: number;
    yield: number | null; cycle_hours: number | null; cost_per_dozen: number | null; on_time: boolean;
  }>;
}
export interface ParetoRow { reason_code: string; label: string | null; qty: number; pct: number | null; cum_pct: number | null }

// ---------------------------------------------------------------- RPC parameter and result types
/** Optional on every posting RPC; honored only for admin/seed sessions. Ignored (server time used) for everyone else. */
export interface WithAt { at?: string }

export interface SaleLineInput {
  item_id: number; qty: number; condition?: StockCondition;
  /** 0-100, per-line discount */ discount_pct?: number;
}
export interface OrderDiscount { type: 'pct' | 'amount'; value: number }
export interface Payment { method: PaymentMethod; tendered?: number }

export interface CompleteSaleParams extends WithAt {
  location_id: number; lines: SaleLineInput[]; order_discount?: OrderDiscount | null; payment?: Payment;
  customer_id?: number | null;
  /** 'history_batch' is honored for admin sessions only */ channel?: 'pos' | 'history_batch';
  /** only used with channel history_batch */ ticket_count?: number;
}
export interface CompleteSaleResult {
  sale_id: number; receipt_no: string; subtotal: number; discount_total: number; tax_total: number; total: number; change_due: number;
}

export interface ReturnLineInput { sale_line_id: number; qty: number; disposition: ReturnDisposition; reason_code?: ReturnReason | string | null }
export interface ProcessReturnParams extends WithAt {
  sale_id: number; lines: ReturnLineInput[]; exchange_lines?: SaleLineInput[] | null; refund_method?: RefundMethod;
}
export interface ProcessReturnResult {
  return_id: number; return_no: string; refund_total: number; exchange_sale_id: number | null;
  /** exchange total - refund; > 0 the customer pays, < 0 the shop refunds */ net_due: number;
}

export interface CreateCustomerParams { name: string; kind?: CustomerKind; email?: string | null; phone?: string | null; home_location_id?: number | null }
export interface OrderLineInput { item_id: number; qty: number }
export interface CreateSalesOrderParams extends WithAt {
  customer_id: number; location_id: number; requested_for: string; lines: OrderLineInput[];
  channel?: SalesOrderChannel; notes?: string | null;
}
export interface PlacePickupOrderParams { location_id: number; pickup_at: string; lines: OrderLineInput[]; notes?: string | null }
export interface PlacePickupOrderResult { so_id: number; so_number: string; total: number }
export interface FulfillSalesOrderParams extends WithAt { so_id: number; payment?: Payment }
export interface CancelSalesOrderParams extends WithAt { so_id: number; reason?: string | null }

export interface MyOrderLine { item_id: number; name: string; sku: string; qty: number; unit_price: number }
export interface MyOrder {
  id: number; so_number: string; status: SalesOrderStatus; channel: SalesOrderChannel; requested_for: string;
  fulfilled_at: string | null; closed_at: string | null; cancelled_reason: string | null; notes: string | null;
  created_at: string; location_id: number; location_name: string; total: number; lines: MyOrderLine[];
}

export interface TransferLineInput { item_id: number; qty: number; condition?: StockCondition }
export interface CreateTransferParams extends WithAt {
  from: number; to: number; lines: TransferLineInput[]; complete?: boolean; bake_plan_id?: number | null;
}
export interface AdjustmentLineInput {
  item_id: number; condition?: StockCondition; reason_code?: AdjustmentReason | string;
  /** give exactly one of counted_qty / qty_delta */ counted_qty?: number; qty_delta?: number;
}
export interface PostAdjustmentParams extends WithAt { location: number; kind: PostAdjustmentKind; lines: AdjustmentLineInput[]; note?: string | null }
export interface WasteLineInput { item_id: number; qty: number; reason_code: WasteReason | string; condition?: StockCondition }
export interface LogWasteParams extends WithAt { location: number; lines: WasteLineInput[]; note?: string | null }
export interface CloseBusinessDayParams extends WithAt { location: number; date?: string | null }
export interface CloseBusinessDayResult {
  day_close_id: number; already_closed: boolean; business_date: string; expired_qty: number; expired_value: number; reclassified_qty: number;
}

export interface PoLineInput { item_id: number; qty: number; unit_cost?: number }
export interface CreatePurchaseOrderParams extends WithAt { supplier: number; ship_to: number; lines: PoLineInput[]; notes?: string | null; source?: PoSource }
export interface ReceivePurchaseOrderParams extends WithAt {
  po_id: number; location_id?: number | null; received_on?: string | null;
  /** omit to receive everything still open */ lines?: Array<{ po_line_id: number; qty: number }> | null;
}
export interface ReceivePurchaseOrderResult { receipt_id: number; receipt_no: string; amount: number; bill_id: number | null; po_status: PoStatus }
export interface RecordApPaymentParams extends WithAt { bill_id: number; amount: number; paid_on?: string | null; method?: string }
export interface RecordExpenseParams extends WithAt { date: string; account: string; amount: number; memo?: string | null; location_id?: number | null }
export interface AutoReplenishParams extends WithAt { use_rop?: boolean; use_mrp?: boolean; horizon_days?: number }
export interface AutoReplenishPo {
  po_id: number; po_number: string; supplier_id: number; supplier: string; total: number;
  lines: Array<{ item_id: number; sku: string; name: string; qty: number; unit_cost: number; line_total: number; source: 'rop' | 'mrp' | 'rop+mrp' }>;
}

export interface CreateProductionOrderParams extends WithAt { item: number; qty_planned: number; due_date: string; location_id?: number | null; bake_plan_id?: number | null }
export interface StartProductionOrderResult { mo_id: number; qty_started: number; issued_value: number }
export interface DefectInput { kind: DefectKind; qty: number; reason_code: ScrapReason | string }
export interface CompleteProductionOrderParams extends WithAt { mo_id: number; qty_good: number; defects?: DefectInput[] }
export interface CompleteProductionOrderResult {
  mo_id: number; qty_good: number; qty_scrapped: number; qty_reworked: number; unit_cost: number; good_value: number; scrap_value: number;
}

export interface GenerateForecastParams extends WithAt { as_of?: string | null; start?: string | null; days?: number }
export interface BuildBakePlanParams extends WithAt { plan_date: string; buffer_pct?: number | null }
export interface UpdateBakePlanLineParams { plan_id: number; item_id: number; location_id: number; override_qty: number | null }
export interface ReleaseBakePlanResult { plan_id: number; mo_ids: number[]; transfer_ids: number[] }
export interface StartBakeDayResult { plan_id: number; orders_completed: number; transfers_completed: number }

/** Roles that may call each RPC (manager is always allowed). Used by the UI to hide actions. */
export const RPC_ROLES = {
  complete_sale: ['cashier'], process_return: ['cashier'], create_customer: ['cashier'],
  create_sales_order: ['cashier'], fulfill_sales_order: ['cashier'], close_sales_order: ['cashier'],
  cancel_sales_order: ['cashier', 'customer'], place_pickup_order: ['customer'],
  create_transfer: ['cashier', 'baker'], complete_transfer: ['cashier', 'baker'], cancel_transfer: ['cashier', 'baker'],
  post_adjustment: ['cashier', 'baker'], log_waste: ['cashier', 'baker'], close_business_day: ['cashier'],
  create_purchase_order: [], send_purchase_order: [], close_purchase_order: [], record_ap_payment: [], record_expense: [],
  receive_purchase_order: ['baker'], auto_replenish: [], apply_computed_reorder_points: [],
  create_production_order: ['baker'], start_production_order: ['baker'], complete_production_order: ['baker'],
  cancel_production_order: ['baker'], generate_forecast: ['baker'], build_bake_plan: ['baker'],
  update_bake_plan_line: ['baker'], release_bake_plan: ['baker'], start_bake_day: ['baker'],
} as const satisfies Record<string, readonly AppRole[]>;
export type RpcName = keyof typeof RPC_ROLES;

/** True when `role` may call `rpc` (managers always can). */
export function canCall(role: AppRole | null | undefined, rpc: RpcName): boolean {
  if (!role) return false;
  if (role === 'owner' || role === 'admin' || role === 'manager') return true;
  return (RPC_ROLES[rpc] as readonly AppRole[]).includes(role);
}

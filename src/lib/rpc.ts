/**
 * Typed wrappers for every Glazed RPC, view and report function (see supabase/CONTRACT.md).
 *
 *   import { rpc, views, reports } from '@/lib/rpc';
 *   const sale = await rpc.completeSale({ location_id: 1, lines: [{ item_id: 3, qty: 2 }], payment: { method: 'card' } });
 *   const stock = await views.itemAvailability({ location_id: 1 });
 *   const pnl = await reports.pnl({ from: '2026-11-01', to: '2026-11-09' });
 *
 * - Param objects use the SQL parameter names without the `p_` prefix (snake_case): `at` -> `p_at`.
 *   Undefined values are omitted so SQL defaults apply.
 * - Failures throw `RpcError` whose `message` is the database's user-facing text
 *   (for example "Only 4 Original glazed left at Provo").
 * - `at` is ignored unless the caller is an admin/seed session; the UI should never send it.
 */
import { supabase } from '@/lib/supabase';
import type {
  ApOpenBill, AutoReplenishParams, AutoReplenishPo, BuildBakePlanParams, CancelSalesOrderParams, CatalogRow,
  CloseBusinessDayParams, CloseBusinessDayResult, CompleteProductionOrderParams, CompleteProductionOrderResult,
  CompleteSaleParams, CompleteSaleResult, CreateCustomerParams, CreateProductionOrderParams, CreatePurchaseOrderParams,
  CreateSalesOrderParams, CreateTransferParams, FulfillSalesOrderParams, ForecastAccuracy, GenerateForecastParams,
  InventoryGlCheck, InventoryValuationRow, ItemAvailability, ItemDailyUsage, LogWasteParams, MrpRow, MyOrder,
  PeriodicReviewRow, PlacePickupOrderParams, PlacePickupOrderResult, PnlLine, PostAdjustmentParams, ProcessReturnParams,
  ProcessReturnResult, ProductionReport, ReceivePurchaseOrderParams, ReceivePurchaseOrderResult, RecordApPaymentParams,
  RecordExpenseParams, ReleaseBakePlanResult, ReorderAnalysisRow, ReplenishSuggestion, SalesGrain, SalesSummaryRow,
  StartBakeDayResult, StartProductionOrderResult, SupplierScorecardRow, TopSellerRow, TrialBalanceRow, TurnoverRow,
  UpdateBakePlanLineParams, WasteReport, WasteSummaryRow,
} from '@/types/domain';

export class RpcError extends Error {
  readonly fn: string;
  readonly code?: string;
  readonly hint?: string;
  readonly details?: string;
  constructor(fn: string, message: string, extra: { code?: string; hint?: string; details?: string } = {}) {
    super(message);
    this.name = 'RpcError';
    this.fn = fn;
    this.code = extra.code;
    this.hint = extra.hint;
    this.details = extra.details;
  }
}

/** Message to show a user for any thrown value. */
export function rpcErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'Something went wrong. Try again.';
}

function toArgs(params: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) out[`p_${k}`] = v;
  }
  return out;
}

async function call<T>(fn: string, params: object = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, toArgs(params));
  if (error) throw new RpcError(fn, error.message, { code: error.code, hint: error.hint, details: error.details });
  return data as T;
}

type Filters = Record<string, string | number | boolean | null | undefined>;

async function selectView<T>(view: string, opts: { eq?: Filters; order?: string; ascending?: boolean; limit?: number } = {}): Promise<T[]> {
  let q = supabase.from(view).select('*');
  for (const [col, val] of Object.entries(opts.eq ?? {})) {
    if (val !== undefined) q = q.eq(col, val as never);
  }
  if (opts.order) q = q.order(opts.order, { ascending: opts.ascending ?? true });
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw new RpcError(view, error.message, { code: error.code, hint: error.hint, details: error.details });
  return (data ?? []) as unknown as T[];
}

// ---------------------------------------------------------------- RPCs (writes)
export const rpc = {
  // selling
  completeSale: (p: CompleteSaleParams) => call<CompleteSaleResult>('complete_sale', p),
  processReturn: (p: ProcessReturnParams) => call<ProcessReturnResult>('process_return', p),
  createCustomer: (p: CreateCustomerParams) => call<number>('create_customer', p),
  createSalesOrder: (p: CreateSalesOrderParams) => call<number>('create_sales_order', p),
  placePickupOrder: (p: PlacePickupOrderParams) => call<PlacePickupOrderResult>('place_pickup_order', p),
  fulfillSalesOrder: (p: FulfillSalesOrderParams) => call<CompleteSaleResult>('fulfill_sales_order', p),
  closeSalesOrder: (p: { so_id: number }) => call<void>('close_sales_order', p),
  cancelSalesOrder: (p: CancelSalesOrderParams) => call<void>('cancel_sales_order', p),
  getMyOrders: () => call<MyOrder[]>('get_my_orders'),
  getCatalogAvailability: () => call<CatalogRow[]>('get_catalog_availability'),

  // stock
  createTransfer: (p: CreateTransferParams) => call<number>('create_transfer', p),
  completeTransfer: (p: { id: number }) => call<void>('complete_transfer', p),
  cancelTransfer: (p: { id: number }) => call<void>('cancel_transfer', p),
  postAdjustment: (p: PostAdjustmentParams) => call<number>('post_adjustment', p),
  logWaste: (p: LogWasteParams) => call<number>('log_waste', p),
  closeBusinessDay: (p: CloseBusinessDayParams) => call<CloseBusinessDayResult>('close_business_day', p),

  // purchasing and payables
  createPurchaseOrder: (p: CreatePurchaseOrderParams) => call<number>('create_purchase_order', p),
  sendPurchaseOrder: (p: { po_id: number }) => call<void>('send_purchase_order', p),
  receivePurchaseOrder: (p: ReceivePurchaseOrderParams) => call<ReceivePurchaseOrderResult>('receive_purchase_order', p),
  closePurchaseOrder: (p: { po_id: number }) => call<void>('close_purchase_order', p),
  recordApPayment: (p: RecordApPaymentParams) => call<number>('record_ap_payment', p),
  recordExpense: (p: RecordExpenseParams) => call<number>('record_expense', p),
  autoReplenish: (p: AutoReplenishParams = {}) => call<AutoReplenishPo[]>('auto_replenish', p),
  applyComputedReorderPoints: (p: { item_ids?: number[] | null } = {}) => call<number>('apply_computed_reorder_points', p),

  // production
  createProductionOrder: (p: CreateProductionOrderParams) => call<number>('create_production_order', p),
  startProductionOrder: (p: { mo_id: number; qty_started?: number | null }) => call<StartProductionOrderResult>('start_production_order', p),
  completeProductionOrder: (p: CompleteProductionOrderParams) => call<CompleteProductionOrderResult>('complete_production_order', p),
  cancelProductionOrder: (p: { mo_id: number }) => call<void>('cancel_production_order', p),

  // forecast and bake plan
  generateForecast: (p: GenerateForecastParams = {}) => call<number>('generate_forecast', p),
  buildBakePlan: (p: BuildBakePlanParams) => call<number>('build_bake_plan', p),
  updateBakePlanLine: (p: UpdateBakePlanLineParams) => call<void>('update_bake_plan_line', p),
  releaseBakePlan: (p: { plan_id: number }) => call<ReleaseBakePlanResult>('release_bake_plan', p),
  startBakeDay: (p: { plan_id: number; yield?: number }) => call<StartBakeDayResult>('start_bake_day', p),
} as const;

// ---------------------------------------------------------------- views (reads, security_invoker: staff only)
export const views = {
  itemAvailability: (f: { location_id?: number; item_id?: number; location_kind?: 'shop' | 'kitchen' } = {}) =>
    selectView<ItemAvailability>('v_item_availability', { eq: f, order: 'name' }),
  inventoryValuation: (f: { location_id?: number; item_id?: number; category?: string } = {}) =>
    selectView<InventoryValuationRow>('v_inventory_valuation', { eq: f, order: 'name' }),
  inventoryGlCheck: async (): Promise<InventoryGlCheck> => (await selectView<InventoryGlCheck>('v_inventory_gl_check'))[0],
  itemDailyUsage: (f: { item_id?: number } = {}) => selectView<ItemDailyUsage>('v_item_daily_usage', { eq: f, order: 'usage_date' }),
  reorderAnalysis: (f: { item_id?: number; supplier_id?: number; urgency?: string } = {}) =>
    selectView<ReorderAnalysisRow>('v_reorder_analysis', { eq: f, order: 'name' }),
  periodicReview: (f: { supplier_id?: number } = {}) => selectView<PeriodicReviewRow>('v_periodic_review', { eq: f, order: 'name' }),
  supplierScorecard: () => selectView<SupplierScorecardRow>('v_supplier_scorecard', { order: 'score', ascending: false }),
  apOpenBills: (f: { supplier_id?: number } = {}) => selectView<ApOpenBill>('v_ap_open_bills', { eq: f, order: 'due_date' }),
  trialBalance: () => selectView<TrialBalanceRow>('v_trial_balance'),
  wasteSummary: (f: { location_id?: number; item_id?: number; reason_code?: string } = {}) =>
    selectView<WasteSummaryRow>('v_waste_summary', { eq: f, order: 'business_date', ascending: false }),
} as const;

// ---------------------------------------------------------------- report and planning functions (reads)
export const reports = {
  mrpWeekly: (p: { start?: string | null; weeks?: number; include_forecast?: boolean } = {}) => call<MrpRow[]>('mrp_weekly', p),
  replenishSuggestions: (p: { use_rop?: boolean; use_mrp?: boolean; horizon_days?: number } = {}) =>
    call<ReplenishSuggestion[]>('replenish_suggestions', p),
  pnl: (p: { from: string; to: string; location?: number | null }) => call<PnlLine[]>('pnl', p),
  inventoryTurnover: (p: { from: string; to: string }) => call<TurnoverRow[]>('inventory_turnover', p),
  salesSummary: (p: { from: string; to: string; grain?: SalesGrain; location?: number | null }) => call<SalesSummaryRow[]>('sales_summary', p),
  topSellers: (p: { from: string; to: string; location?: number | null; limit?: number; by?: 'revenue' | 'units' }) =>
    call<TopSellerRow[]>('top_sellers', p),
  wasteReport: (p: { from: string; to: string; location?: number | null }) => call<WasteReport>('waste_report', p),
  forecastAccuracy: (p: { from: string; to: string; location?: number | null }) => call<ForecastAccuracy>('forecast_accuracy', p),
  productionReport: (p: { from: string; to: string }) => call<ProductionReport>('production_report', p),
} as const;

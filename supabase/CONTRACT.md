# Glazed ERP database contract (workstream B)

The exact surface that the UI (`src/lib/rpc.ts`, `src/types/domain.ts`), the seed runner (`scripts/seed`) and the verify scripts code against. It describes the schema and RPCs in `supabase/migrations/`, including username signup and the uniquely versioned MRP, BOM-consumption guard and customer-pickup migrations (`20261116000101..103`). If this file and the SQL disagree, the SQL wins; fix this file in the same change.

Typed wrappers: `src/lib/rpc.ts` (`rpc.*`, `views.*`, `reports.*`) and `src/types/domain.ts`. Generated Postgres types: `src/types/db.ts` (after the project is linked).

## 0. Differences from docs/ARCHITECTURE.md

**Names and signatures are the same as ARCHITECTURE section 2 unless listed here.**

1. **Extra trailing params.** Every posting RPC has a trailing `p_at timestamptz default null` (see 1.2). Others added at the end, all optional: `complete_sale(p_channel, p_ticket_count)`, `place_pickup_order(p_notes)`, `create_purchase_order(p_notes, p_source)`, `create_production_order(p_location_id, p_bake_plan_id)`, `create_transfer(p_bake_plan_id)`, `record_expense(p_location_id)`, `post_adjustment(p_note)`, `log_waste(p_note)`, `receive_purchase_order(... p_lines default null = receive everything open)`.
2. **`p_payment` default.** In PostgreSQL a parameter after a defaulted one must also have a default, so `complete_sale(p_location_id, p_lines, p_order_discount default null, p_payment default '{"method":"card"}', ...)`.
3. **New RPCs** (not in section 2): `create_customer`, `get_my_orders`, `cancel_transfer`, `cancel_production_order`, `update_bake_plan_line`, `start_bake_day`, `replenish_suggestions` (read-only), `_post_opening` and `_reset_demo_data` (admin only).
4. **`_post_inventory` returns a row** `(txn_id, unit_cost, value_delta)` instead of a bare numeric (callers need the value for the journal), and takes extra optional `p_value` (force the signed value; used by paired moves and production receipts so rounding never drifts) and `p_note`. Journal linkage is done by the caller (`update inventory_transactions set journal_entry_id ...`).
5. **`_move_inventory`** is a new internal helper for cost-neutral transfers and day-old reclass (out leg at weighted average cost, in leg takes exactly the same value).
6. **Quality-failure returns** post the restock first and then scrap: Dr 1200 / Cr 5000 at the original sale cost, then Dr 5150 / Cr 1200 at current weighted average cost. So `return_lines.cost_amt` is set for every return line, and GL 5000 = sum(`sale_lines.cogs_total`) - sum(`return_lines.cost_amt`).
7. **Discounts on returns.** A return debits 4100 at the gross value and credits 4200 for the discount share, so net sales stay exact. GL 4000 is **gross** sales = sum(`line_net + discount_amt`); `sales.subtotal` is gross; `discount_total` is line discounts including the allocated order discount.
8. **Tax.** `sales.tax_rate` (copied from `locations.tax_rate`, 7.25%) is stored. `tax_total = round((subtotal - discount_total) * tax_rate, 2)`, charged on the whole ticket. A return refunds tax cumulatively so a full return gives back exactly the tax charged.
9. **Document prefixes.** Receipts are `RCPT-`, PO receipts `RCV-` (new), sales orders `ORD-`, returns `RET-`, POs `PO-`, MOs `MO-`, transfers `TRF-`, adjustments and waste `ADJ-`, bake plans `BAKE-`. Format `PREFIX-00001`.
10. **New columns / tables.** `expenses` table (every `record_expense` row); `app_settings.default_tax_rate`, `business_name`; `gl_accounts.normal_side`; GL account `6200 Marketing and other`; `sales.tax_rate`; `returns.refund_net, tax_refund, refund_method, business_date`; `return_lines.gross_amt, cost_amt`; `transfer_lines.condition`; `po_receipts.receipt_no, amount`; `bake_plans.forecast_run_id, released_at`; `bake_plan_lines.final_qty` (generated = `coalesce(override_qty, planned_qty)`); `day_closes.id, closed_by, expired_*, reclassified_qty, adj_id`; `inventory_adjustments.business_date`; `purchase_orders.created_on`.
11. **`mrp_weekly`** is a SQL function (recursive CTE) rather than a plpgsql loop. Same inputs and the same logic. `production_report`, `waste_report` and `forecast_accuracy` return one `jsonb` object with sections (shape in section 4).
12. **`closed_weekdays`** uses Postgres `extract(dow)`: 0 = Sunday ... 6 = Saturday. Provo = `{0}`.
13. **Event topics** are listed in section 5. `po.paid` is used for AP payments so the existing `po.` mapping in `src/lib/realtimeTopics.ts` refreshes finance and suppliers. **Topics not yet mapped in `realtimeTopics.ts`** (lead/A to add): `expense.recorded` (finance, reports), `forecast.bakeplan_built` is covered by the `forecast.` prefix, `transfer.` and `so.` already exist.
14. **Reference tables created by migration 0015** (do not truncate): `gl_accounts`, `reason_codes`, `app_settings` (row 1), `doc_sequences`. Locations, suppliers, items, BOMs, customers and promotions are seeded by `scripts/seed`.

## 1. Conventions

### 1.1 Data types
Money `numeric(12,2)`, unit costs `numeric(14,4)`, quantities `numeric(12,3)` in the item base unit. Over PostgREST numerics and bigints arrive as JSON numbers. Dates are `YYYY-MM-DD` business dates (America/Denver); timestamps are ISO strings.

### 1.2 `p_at` (seed replay)
Every posting RPC takes `p_at timestamptz default null`. It is honored **only** when `_is_system()` is true: `session_user` is `postgres` / `supabase_admin` (direct or pooler login), or the `role` setting is `service_role`. The check reads the `role` setting, so `set local role authenticated` turns it off even on a postgres connection. For everyone else `p_at` is ignored and `now()` is used.
- `receive_purchase_order`: if `p_at` is null, the caller is system and `p_received_on` is given, the posting time is 09:00 on that date.
- `close_business_day`: if `p_at` is null, the caller is system and `p_date` is given, the posting time is 21:30 on that date.
- `record_ap_payment` / `record_expense`: the journal date is `p_paid_on` / `p_date` when given.
- `p_at` also sets `created_at` on documents it creates (sales orders, POs, MOs, transfers, bake plans).

Actor names in `app_events.summary` come from the JWT user (`profiles.full_name`); a seed session without a user shows "System". To get names in the feed, the seed may run `select set_config('request.jwt.claim.sub', '<profile uuid>', true)` inside the transaction before the call.

### 1.3 Roles (`_require_role`)
`manager` passes every check. Otherwise the caller needs one of the listed roles. System sessions pass. Errors: not signed in -> `28000` "Sign in to continue."; wrong role -> `42501` "Your cashier account cannot do this. Ask a manager."

### 1.4 Errors
All business errors are `raise exception` with a user-facing message, for example `Only 4 Original glazed left at Provo`, `No Chocolate icing left at Central Kitchen`, `Cash tendered ($5.00) is less than the total ($7.15).`, `Only 6 of Original glazed can still be returned from this receipt.` Multiple shortages are joined with `. ` in one message (sorted by item name). The location name in stock messages is `locations.name` as seeded. PostgREST returns the text as `error.message`. Every RPC runs in one transaction; a failure leaves nothing behind.

### 1.5 Locking
Every RPC that moves stock first locks the involved `item_costs` rows in ascending `item_id` order, then posts. Two cashiers selling the last donut: one succeeds, the other gets the "Only N left" message. `inventory_balances` has `check (qty_on_hand >= 0)` as a backstop.

### 1.6 jsonb line shapes
| Shape | Fields |
|---|---|
| sale line | `{item_id, qty, condition?: 'fresh'\|'day_old', discount_pct?: 0..100}` (price is ignored; read on the server). Kits explode into components. Only `finished` items may be `day_old`; day-old price = `round(list_price * (1 - app_settings.day_old_markdown_pct), 2)`. |
| order discount | `{type: 'pct'\|'amount', value}`; applied after line discounts and allocated across lines. |
| payment | `{method: 'cash'\|'card'\|'other', tendered?}`; cash requires `tendered >= total`; `change_due = tendered - total`. Non-cash: `tendered = total`. |
| return line | `{sale_line_id, qty, disposition: 'restock'\|'quality_failure', reason_code?}`; reason required for `quality_failure` and must be a `return` code. |
| order line (SO, pickup) | `{item_id, qty}` |
| transfer line | `{item_id, qty, condition?}` |
| adjustment line | `{item_id, condition?, counted_qty \| qty_delta, reason_code?}` (reason defaults `COUNT` / `DAMAGE`, must be an `adjustment` code) |
| waste line | `{item_id, condition?, qty, reason_code}` (reason must be a `waste` code) |
| PO line | `{item_id, qty, unit_cost?}` (unit cost defaults to `item_suppliers.unit_cost`; the item must be supplied by that supplier) |
| receipt line | `{po_line_id, qty}` |
| defect | `{kind: 'scrap'\|'rework', qty, reason_code}` (scrap or rework codes) |

## 2. Public RPCs

All are `SECURITY DEFINER`, `set search_path = public`, executable by `authenticated` (and `service_role`), never by `anon`. "Roles" lists who may call (manager always can). `at` = optional trailing `p_at`.

### 2.1 Selling
| RPC | Params | Returns | Roles | Events |
|---|---|---|---|---|
| `complete_sale` | `p_location_id bigint, p_lines jsonb, p_order_discount jsonb = null, p_payment jsonb = '{"method":"card"}', p_customer_id bigint = null, p_channel text = 'pos', p_ticket_count int = 1, p_at` | `{sale_id, receipt_no, subtotal, discount_total, tax_total, total, change_due}` | cashier | `sale.completed`, `inventory.changed` (none for `history_batch`) |
| `process_return` | `p_sale_id bigint, p_lines jsonb, p_exchange_lines jsonb = null, p_refund_method text = 'cash', p_at` | `{return_id, return_no, refund_total, exchange_sale_id, net_due}` (`net_due > 0` customer pays, `< 0` shop refunds) | cashier | `return.processed`, `inventory.changed` (+ `sale.completed` for the exchange) |
| `create_customer` | `p_name text, p_kind text = 'retail', p_email text = null, p_phone text = null, p_home_location_id bigint = null` | `bigint` customer id | cashier | none |
| `create_sales_order` | `p_customer_id bigint, p_location_id bigint, p_requested_for timestamptz, p_lines jsonb, p_channel text = 'counter', p_notes text = null, p_at` | `bigint` so id | cashier | `so.placed`, `inventory.changed` |
| `place_pickup_order` | `p_location_id bigint, p_pickup_at timestamptz, p_lines jsonb, p_notes text = null` | `{so_id, so_number, total}` | customer | `so.placed` (+ `inventory.changed`) |
| `fulfill_sales_order` | `p_so_id bigint, p_payment jsonb = '{"method":"card"}', p_at` | same as `complete_sale` | cashier | `sale.completed`, `so.fulfilled`, `inventory.changed` |
| `close_sales_order` | `p_so_id bigint, p_at` | void | cashier | `so.closed` |
| `cancel_sales_order` | `p_so_id bigint, p_reason text = null, p_at` | void | cashier; a customer for their own `placed` order | `so.cancelled`, `inventory.changed` |
| `get_my_orders` | none | `jsonb` array `[{id, so_number, status, channel, requested_for, fulfilled_at, closed_at, cancelled_reason, notes, created_at, location_id, location_name, total, lines:[{item_id,name,sku,qty,unit_price}]}]`, newest first | customer (anyone signed in; others get `[]`) | none |
| `get_catalog_availability` | none | table, see 3.2 | any signed-in user | none |

Behavior notes
- `complete_sale`/`fulfill_sales_order`: only at `kind = 'shop'` locations. Stock out per line at weighted average cost; `sale_lines.unit_cost/cogs_total` stored; journal Dr 1000 total, Dr 4200 discounts, Cr 4000 gross, Cr 2100 tax, Dr 5000 / Cr 1200 cogs. `channel = 'history_batch'` (with `ticket_count`) is honored only for system sessions; everyone else gets `pos`.
- `fulfill_sales_order` uses the unit prices stored on the order, fails with the shortage list if stock is missing, sets `so_lines.qty_fulfilled`, status `fulfilled`, `sale_id`. Only `placed` orders.
- `process_return`: location = the sale's shop. Restock puts stock back at the original sale cost (reverses the original ledger rows proportionally, so kits restore their components). Exchange creates a `channel='exchange'` sale in the same call; cash is netted by `net_due`.
- `place_pickup_order`: `my_customer_id()` is the customer; pickup must be in the future and within 60 days at an active shop, on an open weekday and during opening hours in America/Denver (opening inclusive, closing exclusive; defaults 06:00–18:00 when unset). Maximum 500 units per item after aggregating duplicate item IDs; prices read on the server; no stock is moved (allocation shows in `v_item_availability`).

### 2.2 Stock
| RPC | Params | Returns | Roles | Events |
|---|---|---|---|---|
| `create_transfer` | `p_from bigint, p_to bigint, p_lines jsonb, p_complete boolean = true, p_bake_plan_id bigint = null, p_at` | `bigint` transfer id | cashier, baker | `transfer.created`; with `p_complete`: `transfer.completed`, `inventory.changed` |
| `complete_transfer` | `p_id bigint, p_at` | void (fails with a shortage list) | cashier, baker | `transfer.completed`, `inventory.changed` |
| `cancel_transfer` | `p_id bigint` | void (planned only) | cashier, baker | `transfer.cancelled` |
| `post_adjustment` | `p_location bigint, p_kind text ('cycle_count'\|'damage'), p_lines jsonb, p_note text = null, p_at` | `bigint` adjustment id | cashier, baker | `inventory.adjusted`, `inventory.changed` |
| `log_waste` | `p_location bigint, p_lines jsonb, p_note text = null, p_at` | `bigint` adjustment id (kind `waste`) | cashier, baker | `waste.logged`, `inventory.changed` |
| `close_business_day` | `p_location bigint, p_date date = null, p_at` | `{day_close_id, already_closed, business_date, expired_qty, expired_value, reclassified_qty}` | cashier | `day.closed`, `inventory.changed` |

- Transfers and day-old reclass are cost neutral (no journal). Adjustments: loss Dr 5300 / Cr 1200, gain Dr 1200 / Cr 5300, valued at weighted average cost (preferred supplier cost if the item has no stock anywhere). A cycle count with `counted_qty` records `system_qty` and the delta; zero deltas are recorded with no ledger row.
- `close_business_day`: shops only, finished items only. Day-old stock becomes waste (reason `EXPIRED`, Dr 5100 / Cr 1200, one `kind='day_close'` adjustment), then fresh stock becomes day-old at the same cost. Idempotent per shop and date (a second call returns the first result with `already_closed: true`). Cannot close a future day.
- `log_waste`: any location; `condition` per line (`day_old` for yesterday's stock).

### 2.3 Purchasing and payables
| RPC | Params | Returns | Roles | Events |
|---|---|---|---|---|
| `create_purchase_order` | `p_supplier bigint, p_ship_to bigint, p_lines jsonb, p_notes text = null, p_source text = 'manual' ('manual'\|'auto_replenish'\|'sim'), p_at` | `bigint` po id (status `draft`) | manager | `po.created` |
| `send_purchase_order` | `p_po_id bigint, p_at` | void. Sets `sent_on` (business date), line `expected_on = sent_on + coalesce(item_suppliers.quoted_lead_time_days, suppliers.quoted_lead_time_days)`, header `expected_on` = latest line, `quoted_lead_days` | manager | `po.sent` |
| `receive_purchase_order` | `p_po_id bigint, p_location_id bigint = null (default ship-to), p_received_on date = null, p_lines jsonb = null (all open), p_at` | `{receipt_id, receipt_no, amount, bill_id, po_status}` | baker | `po.received`, `inventory.changed` |
| `close_purchase_order` | `p_po_id bigint, p_at` | void. A draft becomes `cancelled`; otherwise open qty becomes `qty_cancelled` and status `closed` | manager | `po.closed` |
| `record_ap_payment` | `p_bill_id bigint, p_amount numeric, p_paid_on date = null, p_method text = 'ach', p_at` | `bigint` payment id | manager | `po.paid` |
| `record_expense` | `p_date date, p_account text (6xxx), p_amount numeric, p_memo text = null, p_location_id bigint = null, p_at` | `bigint` expense id | manager | `expense.recorded` |
| `auto_replenish` | `p_use_rop boolean = true, p_use_mrp boolean = true, p_horizon_days int = 7, p_at` | `jsonb` array `[{po_id, po_number, supplier_id, supplier, total, lines:[{item_id, sku, name, qty, unit_cost, line_total, source}]}]` (empty when nothing is needed) | manager | `po.created` per PO |
| `apply_computed_reorder_points` | `p_item_ids bigint[] = null` | `integer` rows updated | manager | `settings.updated` |

- `receive_purchase_order`: PO must be `sent`. Over-receipt is rejected. Ledger `receipt_po` in at the PO line cost (this is what moves weighted average cost); Dr 1200 / Cr 2000; an `ap_bills` row (`bill_date = received_on`, `due_date = bill_date + terms_days`). PO becomes `received` when every line has `qty_received + qty_cancelled >= qty_ordered`; a partial receipt leaves it `sent` (UI: "Partially received"; the remainder is a PO-level backorder with its expected date).
- `auto_replenish`: groups by `items.preferred_supplier_id`, ship-to = the kitchen, quantity = `max(ROP suggestion, MRP planned qty)` rounded up to pack size, skips items that already sit on a draft PO, creates drafts with `source = 'auto_replenish'`. MRP source = `mrp_weekly(today, 4, false)` planned orders whose `order_by_date <= today + p_horizon_days`; ROP source = `v_reorder_analysis` rows with `below_rop`.
- `apply_computed_reorder_points`: sets `items.reorder_point = round(rop_calc, 3)`.

### 2.4 Production, forecast, bake plan
| RPC | Params | Returns | Roles | Events |
|---|---|---|---|---|
| `create_production_order` | `p_item bigint, p_qty_planned numeric, p_due_date date, p_location_id bigint = null (first kitchen), p_bake_plan_id bigint = null, p_at` | `bigint` mo id | baker | `mo.created` |
| `start_production_order` | `p_mo_id bigint, p_qty_started numeric = null (= planned), p_at` | `{mo_id, qty_started, issued_value}` | baker | `mo.started`, `inventory.changed` |
| `complete_production_order` | `p_mo_id bigint, p_qty_good numeric, p_defects jsonb = '[]', p_at` | `{mo_id, qty_good, qty_scrapped, qty_reworked, unit_cost, good_value, scrap_value}` | baker | `mo.completed`, `inventory.changed` |
| `cancel_production_order` | `p_mo_id bigint, p_at` | void (planned only) | baker | `mo.cancelled` |
| `generate_forecast` | `p_as_of date = today, p_start date = as_of, p_days int = 14 (1..60), p_at` | `bigint` run id | baker | `forecast.generated` (only when `p_at` is null) |
| `build_bake_plan` | `p_plan_date date, p_buffer_pct numeric = null (= app_settings.bake_buffer_pct), p_at` | `bigint` plan id | baker | `forecast.bakeplan_built` (and `forecast.generated` if it had to run a forecast) |
| `update_bake_plan_line` | `p_plan_id bigint, p_item_id bigint, p_location_id bigint, p_override_qty numeric` (null clears) | void | baker | none |
| `release_bake_plan` | `p_plan_id bigint, p_at` | `{plan_id, mo_ids: [..], transfer_ids: [..]}` | baker | `bakeplan.released` |
| `start_bake_day` | `p_plan_id bigint, p_yield numeric = 0.96, p_at` | `{plan_id, orders_completed, transfers_completed}` | baker | all of the above |

- `start_production_order`: needs a BOM (`create_production_order` rejects items without one). Issues `qty_started x qty_per` of each component at the MO location (fails with the shortage list), journal Dr 1300 WIP / Cr 1200, stores `issued_value`.
- `complete_production_order`: `good + scrap = started`. Scrap defects must add up to `started - good` exactly (error otherwise); rework defects are counted within good and cannot exceed it. Good units go in at `issued_value / qty_started` (rounded to cents in total); Dr 1200 (good value) + Dr 5200 (scrap value = issued - good value) / Cr 1300, so WIP returns to zero exactly. `production_orders.unit_cost` is that rolled-up cost.
- `generate_forecast`: per shop x finished item (closed weekdays and out-of-season days produce no row). `base` = trailing 28 days of promo-adjusted sales / sum of weekday indexes; `weekday_idx` from 12 weeks of history; `trend_factor` from the 8-week weekly regression slope, capped at +/-3% per week; `season_factor` 0 outside the window with a 14-day launch ramp; `promo_lift` = max `promotions.expected_lift` active that day. Uses only sales with `business_date < p_as_of`, so past runs (`as_of` in the past) are honest backtests. For backtests call `generate_forecast(d, d, 1, p_at)`.
- `build_bake_plan`: one plan per date (`plan_date` unique); rebuilds a draft, refuses a released plan. Uses today's forecast run for that date (creates one if missing). `planned_qty = ceil((forecast * (1 + buffer) + placed sales-order qty for that shop and date) / 12) * 12` per item and shop.
- `release_bake_plan`: draft only. One production order per item at the kitchen (qty = sum of `final_qty`, due on the plan date) plus one `planned` transfer from the kitchen to each shop. Production orders are then started/completed by the baker; transfers by `complete_transfer`.
- `start_bake_day`: demo helper. Releases the plan if still draft, starts and completes every planned MO at `floor(planned x yield)` good (scrap reason `MISSHAPEN`), trims the planned transfers to what the kitchen actually has and completes them.

## 3. Views (all `security_invoker`, staff only via RLS; customers see nothing)

### 3.1 Tables the UI reads directly (staff `select`)
Every table in section 6 is readable by staff. PostgREST embeds follow the foreign keys (for example `purchase_orders?select=*,suppliers(name),po_lines(*,items(name))`). Costs live in `item_costs` and `inventory_transactions`, so customers cannot see them.

### 3.2 `get_catalog_availability()` (definer function; customers use this)
Columns: `location_id, location_code, location_name, item_id, sku, name, category, list_price, available_qty, in_stock, est_available_date`. Shops only, sellable active items, fresh stock minus outstanding confirmed reservations (never negative). Direct non-kit orders reserve the item; kit orders reserve each BOM component, shared across every kit and direct component sale. Kit availability is the floored capacity of the scarcest free fresh component. Day-old stock is excluded from pickup availability; unavailable items show an estimated date no earlier than tomorrow. No costs.

### 3.3 Inventory
**`v_item_availability`** (item x active location, all items): `item_id, sku, name, category, item_type, uom, location_id, location_code, location_name, location_kind, on_hand, on_hand_fresh, on_hand_day_old, allocated, available, backordered, on_order, reorder_point, est_available_date`.
- `allocated` = open `placed` sales-order qty at that location; `available = on_hand - allocated`; `backordered = max(0, allocated - on_hand)`; `on_order` = remaining qty on `sent` POs shipping to that location.
- Kits: `on_hand` is derived from components (floor of the scarcest component).
- `est_available_date`: today if `available > 0`; kit: today + longest component lead; manufactured: earliest open (`planned`/`in_progress`) production order due date (not before today), else tomorrow; purchased: the earliest `sent` PO line `expected_on` whose cumulative remaining qty covers the shortage (+1 day when the PO ships elsewhere and this location is a shop), else today + `items.lead_time_days` (+1 for a shop).

**`v_inventory_valuation`**: `item_id, sku, name, category, item_type, uom, location_id, location_code, location_name, qty_on_hand, qty_fresh, qty_day_old, avg_cost, value`. `value` = qty x weighted average cost, with the rounding remainder put on the item's largest location so each item sums exactly to `item_costs.value_total`.

**`v_inventory_gl_check`** (one row): `ledger_value, item_costs_value, valuation_value, gl_1200_balance, ledger_vs_gl, costs_vs_gl, valuation_vs_gl` (the three diffs must be 0.00).

### 3.4 Planning
**`v_item_daily_usage`**: `item_id, usage_date, qty`. Zero-filled over `app_settings.usage_window_days` ending yesterday. Direct net sales (minus restocked returns) plus BOM-exploded parent sales.

**`v_reorder_analysis`** (active purchasable items, company-wide): `item_id, sku, name, category, uom, supplier_id, supplier_name, pack_size, unit_cost, quoted_lead_days, actual_lead_days, sigma_lead_days, lead_time_days, avg_daily_usage, sigma_daily_usage, safety_stock, rop_calc, rop_stored, annual_demand, ordering_cost, holding_cost_rate, eoq, on_hand, on_order, backordered, inventory_position, below_rop, suggested_qty, days_of_cover, stockout_date, order_by_date, urgency`.
- `lead_time_days` = L used: `items.lead_time_days`, or the average actual lead time when `use_actual_lead_time`. `sigma_lead_days` from received POs in the last 180 days (first receipt - sent_on).
- `safety_stock = z * sqrt(L * sigma_d^2 + dbar^2 * sigma_L^2)` (z = `service_level_z`), or `items.safety_stock_override`. `rop_calc = dbar * L + safety_stock`. `annual_demand = 365 * dbar`. `eoq = ceil_pack(sqrt(2 * D * S / (H * unit_cost)))` with S = `ordering_cost_per_po`, H = `holding_cost_rate_annual`, `unit_cost` = weighted average cost (preferred supplier cost if none).
- `inventory_position = on_hand + on_order - backordered`. `below_rop = inventory_position <= rop_calc`. `suggested_qty = ceil_pack(rop_calc + eoq - inventory_position)` when below ROP, else 0. `stockout_date = today + inventory_position / dbar`, `order_by_date = stockout_date - ceil(L)`. `urgency`: `late` (order_by before today), `order_now` (below ROP), else `ok`.

**`v_periodic_review`**: `item_id, sku, name, category, uom, supplier_id, supplier_name, pack_size, unit_cost, review_period_days, lead_time_days, avg_daily_usage, sigma_daily_usage, order_up_to_level, inventory_position, order_qty, urgency`. `order_up_to_level = dbar*(L+R) + z*sigma_d*sqrt(L+R)`; `order_qty = ceil_pack(max(0, S - IP))`.

**`v_supplier_scorecard`** (active suppliers; POs `received`/`closed` sent in the last 180 days): `supplier_id, code, name, terms_label, quoted_lead_time_days, po_count, on_time_rate, avg_actual_lead_days, avg_quoted_lead_days, fill_rate, lead_score, score, rating, amount_owed, next_due_date, overdue_amount, pct_paid_on_time`.
- `on_time_rate` = share of POs whose last receipt date <= `expected_on`. `fill_rate` = sum received / sum ordered. `lead_score = clamp(1 - max(0, actual - quoted)/quoted, 0, 1)`. `score = 100 * (w_ontime*on_time + w_fill*fill + w_lead*lead_score)` (weights from `app_settings`). `rating`: `keep` >= `keep_threshold` (90), `watch` >= `watch_threshold` (75), else `replace`; `unrated` when the supplier has no qualifying POs. Payment columns come from AP and are not scored.

**`mrp_weekly(p_start date = today, p_weeks int = 4 (1..26), p_include_forecast boolean = false)`** (invoker; long format, one row per item x week, only items with gross demand in the horizon): `item_id, sku, item_name, uom, supplier_id, supplier_name, lead_time_days, pack_size, week_no, week_start, week_end, beginning_on_hand, gross_req, scheduled_receipts, net_req, planned_order_qty, projected_on_hand, requirement_date, order_by_date, is_expedite`.
- Items: purchasable items, from `placed` sales-order qty (BOM-exploded; past-due orders count in week 1) plus, optionally, the newest forecast run x qty_per. `beginning_on_hand` of week 1 = company-wide on hand.
- `net_req = max(0, max_d(cumulative_gross_through_d - cumulative_receipts_through_d) - beginning_on_hand)` within each week; `planned_order_qty = ceil_pack(net_req)`; `projected_on_hand = beginning + receipts + planned - gross` carries into the next week. This preserves shortages before late same-week receipts. Scheduled receipts are `qty_ordered - qty_received - qty_cancelled` on `sent` POs, using the line expected date (header fallback); overdue dates land on the horizon start. Undated receipts are not assumed available.
- `requirement_date` = first demand date in the week not covered by carried-in stock and receipts due by that date; `order_by_date = requirement_date - items.lead_time_days` (calendar days); `is_expedite` when `order_by_date < today`. Planned supply is assumed available by the first shortage. This is single-level, company-wide planning; it does not schedule transfers or nested assemblies. Forecast is opt-in; PO creation on the Material planning screen requires confirmed-demand mode.

**`replenish_suggestions(p_use_rop = true, p_use_mrp = true, p_horizon_days = 7)`** (invoker, what `auto_replenish` would order): `item_id, sku, name, uom, supplier_id, supplier_name, qty, unit_cost, line_total, source ('rop'|'mrp'|'rop+mrp'), rop_qty, mrp_qty, order_by_date, urgency, has_open_draft`.

### 3.5 Suppliers and payables
**`v_ap_open_bills`**: `bill_id, supplier_id, supplier_name, po_id, po_number, receipt_id, bill_date, due_date, amount, amount_paid, balance, days_overdue, is_overdue`.

### 3.6 Finance and reports (functions are SECURITY INVOKER: staff get data, customers get nothing)
**`pnl(p_from date, p_to date, p_location bigint = null)`** -> rows `sort_order, line_key, label, account_code, amount, line_type` (`line|subtotal|total|pct`), read only from `journal_lines` by `entry_date`. Amounts are **positive magnitudes**; the label says whether it is a deduction. Lines in order: `gross_sales`(4000), `returns`(4100), `discounts`(4200), `net_sales`, `cogs`(5000), `waste`(5100), `quality_returns`(5150), `scrap`(5200), `adjustments`(5300), `total_costs`, `gross_profit`, `gross_margin_pct`(`pct`, percent with 1 decimal, null when no sales), `opex_6000`, `opex_6100`, `opex_6200` (every 6xxx account), `total_opex`, `operating_income`. With `p_location`, only journal lines tagged with that location are included (expenses recorded without a location are excluded).

**`inventory_turnover(p_from date, p_to date)`** -> `item_id, sku, name, category, cogs, avg_inventory, turnover, days_on_hand`. First row is the company total (`item_id` null, sku `TOTAL`): COGS = GL 5000 net in range, average inventory = (GL 1200 before `p_from` + GL 1200 at `p_to`)/2, days on hand = period days / turnover. Item rows: COGS = consumption from the ledger (`sale`, `sale_return`, `prod_issue`), average of ledger value before `p_from` and at `p_to`.

**`sales_summary(p_from date, p_to date, p_grain text = 'day'|'week', p_location bigint = null)`** -> `period_start, period_label, tickets, units, gross_sales, discounts, returns, net_sales, tax, cogs, gross_profit, avg_ticket`. `tickets` sums `ticket_count` (history batches count their tickets). Ties to the P&L: `returns` = gross value returned, `discounts` net of reversals, `net_sales = gross - discounts - returns`, `cogs` net of restocked cost. Weeks start Monday.

**`top_sellers(p_from, p_to, p_location = null, p_limit = 10, p_by = 'revenue'|'units')`** -> `rank, item_id, sku, name, category, units, revenue, cogs, margin` (net of returned qty).

**`v_waste_summary`** (ledger grain, `txn_type = 'waste'`): `business_date, location_id, location_code, location_name, item_id, sku, item_name, category, reason_code, reason_label, condition, qty, cost` (qty and cost positive).

**`waste_report(p_from, p_to, p_location = null)`** -> `jsonb`: `{summary:{waste_qty, waste_cost, production_cost, production_qty, waste_pct_of_production_cost}, by_reason:[{reason_code,label,qty,cost,pct_of_waste}], by_item:[{item_id,sku,name,qty,cost,produced_qty,produced_cost,waste_pct_of_production_cost}], by_location:[{location_id,code,name,qty,cost}], by_day:[{business_date,qty,cost}]}`. Production cost = value of `prod_receipt` rows in the range.

**`forecast_accuracy(p_from, p_to, p_location = null)`** -> `jsonb`: `{overall:{n,actual,forecast,wape,bias}, by_item:[{item_id,sku,name,actual,forecast,wape,bias}], by_location:[{location_id,code,name,actual,forecast,wape,bias}], by_day:[{date,actual,forecast,wape}]}`. Each (item, shop, day) is scored against the newest forecast run made on or before that day; only past days. `wape = sum|a-f| / sum a`, `bias = (sum f - sum a) / sum a` (fractions).

**`production_report(p_from, p_to)`** -> `jsonb` over completed orders by finish date (Denver): `{summary:{orders, qty_planned, qty_started, qty_good, qty_scrapped, qty_reworked, yield, scrap_rate, first_pass_yield, schedule_attainment, on_time_rate, avg_cycle_hours, cost_per_dozen}, by_item:[{item_id,sku,name,orders,qty_*,yield,scrap_rate,first_pass_yield,schedule_attainment,cost_per_dozen}], by_day:[{date,orders,qty_started,qty_good,qty_scrapped,yield}], scrap_pareto:[{reason_code,label,qty,pct,cum_pct}], rework_pareto:[...], orders:[{mo_id,mo_number,item_id,sku,name,due_date,finished_at,qty_planned,qty_started,qty_good,qty_scrapped,qty_reworked,yield,cycle_hours,cost_per_dozen,on_time}]}`. Ratios are fractions (0.9458 = 94.58%). `yield = good/started`, `first_pass_yield = (good - reworked)/started`, `schedule_attainment = good/planned`, `cost_per_dozen = 12 * issued_value / good`.

**`v_trial_balance`**: `account_code, name, type, normal_side, debit, credit, balance` (balance on the account's normal side).

## 4. Internal helpers (not callable through the API)

`EXECUTE` is revoked from `public`, `anon` and `authenticated` on every `_` function, except the pure read helpers `_bdate`, `_today`, `_ts_on`, `_fmt_qty`, `_in_season`, `_season_start`, `_mrp_demand` (invoker views and report functions call them). The seed connects as `postgres` and can call any of them.

| Helper | Purpose |
|---|---|
| `_is_system() -> boolean` | admin/seed session (see 1.2) |
| `_now(p_at) -> timestamptz` | `p_at` for system sessions, else `now()` |
| `_require_role(app_role[])` | role gate (owner, admin and manager always pass) |
| `_next_doc_no(prefix) -> text` | `PREFIX-00001` from `doc_sequences` |
| `_emit_event(topic, entity, entity_id, location_id, customer_id, summary, at)` | insert into `app_events` |
| `_emit_inventory_changed(location_id, at)` | customer-visible stock ping (skipped for seed replays) |
| `_lock_items(bigint[])`, `_check_stock(location, jsonb)` | sorted locking; one message listing every shortage |
| `_post_inventory(item, loc, cond, qty_delta, txn_type, unit_cost, ref_type, ref_id, ref_line_id, reason, at, value, note) -> (txn_id, unit_cost, value_delta)` | the only writer of `inventory_transactions`, `inventory_balances`, `item_costs` |
| `_move_inventory(...)` | cost-neutral transfer / day-old reclass |
| `_post_journal(date, source_type, source_id, memo, lines jsonb) -> bigint` | lines `[{account, debit, credit, location_id}]`, drops zeros, refuses unbalanced input; a deferred constraint trigger re-checks every entry at commit |
| `_post_sale(...)` | shared by POS, sales orders and exchanges |
| `_post_opening(p_lines jsonb, p_cash numeric = 0, p_at)` | seed only: opening stock `[{item_id, location_id, qty, unit_cost, condition?}]` plus opening cash; Dr 1200 + Dr 1000 / Cr 3000 |
| `_reset_demo_data(p_include_master boolean = false)` | seed only: truncates business data, restarts identities, doc numbers and settings. `true` also truncates items, suppliers, customers, locations, promotions, BOMs and profiles |

Weighted-average cost: inbound `value = round(qty * cost, 2)`; outbound `value = -round(qty * avg_cost, 2)` where `avg_cost = value_total / qty_total` (company-wide); taking the last unit company-wide uses `-value_total`. So sum(`item_costs.value_total`) = sum(ledger `value_delta`) = GL 1200 to the cent.

## 5. Events (`app_events`)

Realtime publication contains `app_events` and `profiles`. Auth subscribes only to its own profile changes and refetches the authoritative profile; profile RLS still applies. Event fields: `topic, entity, entity_id, location_id, customer_id, actor_id, summary, at`. Staff see all; customers see rows with their `customer_id` plus topic `inventory.changed`.

`sale.completed`, `return.processed`, `so.placed`, `so.fulfilled`, `so.closed`, `so.cancelled`, `po.created`, `po.sent`, `po.received`, `po.closed`, `po.paid`, `mo.created`, `mo.started`, `mo.completed`, `mo.cancelled`, `transfer.created`, `transfer.completed`, `transfer.cancelled`, `inventory.adjusted`, `inventory.changed`, `waste.logged`, `day.closed`, `forecast.generated`, `forecast.bakeplan_built`, `bakeplan.released`, `expense.recorded`, `settings.updated` (also written by a trigger when a manager edits `app_settings`).

Seed replays (`p_at` from a system session): `history_batch` sales emit no events and `inventory.changed` is skipped; everything else emits an event stamped with the replay time.

## 6. Tables, RLS and grants

| Group | Tables | Staff | Manager | Customer |
|---|---|---|---|---|
| Master data | `locations`, `suppliers`, `items`, `item_suppliers`, `bom_lines`, `customers`, `promotions`, `reason_codes` | select | insert / update / delete | `locations`, `reason_codes` select; own `customers` row |
| Settings / profiles | `app_settings` (row id 1), `profiles` | select | settings update only; no profile writes | own `profiles` row |
| Ledger and GL | `inventory_transactions`, `inventory_balances`, `item_costs`, `gl_accounts`, `journal_entries`, `journal_lines` | select | select | none |
| Documents | `sales`, `sale_lines`, `returns`, `return_lines`, `transfers`, `transfer_lines`, `inventory_adjustments`, `adjustment_lines`, `day_closes`, `production_orders`, `production_defects`, `purchase_orders`, `po_lines`, `po_receipts`, `po_receipt_lines`, `ap_bills`, `ap_payments`, `expenses`, `forecast_runs`, `demand_forecasts`, `bake_plans`, `bake_plan_lines` | select | select | none |
| Sales orders | `sales_orders`, `so_lines` | select | select | only rows where `customer_id = my_customer_id()` |
| Events | `app_events` | select | select | own events + `inventory.changed` |
| Internal | `doc_sequences` | none | none | none |

Ledger, document and GL tables have **no INSERT/UPDATE/DELETE policies and no write grants** for `authenticated`; only RPCs write them. `anon` has no table or function privileges at all. Roles: enum `app_role` (`owner, admin, manager, cashier, baker, customer`); `auth_role()`, `is_staff()`, `my_customer_id()` are definer helpers (executable by signed-in users, they read `profiles`).

**Accounts.** Staff users are created through the admin API with `app_metadata = {"role": "admin|manager|cashier|baker", "home_location_code": "PRV"}` (and `user_metadata.full_name`); the signup trigger `on_auth_user_created` creates their `profiles` row. Any other signup becomes a `customer`: the trigger creates a customer row linked by Auth user ID and a customer profile. Matching an unverified email never claims an existing customer row. Users cannot set `app_metadata`, so no one can self-assign a staff role.

## 7. Adding migrations (streams D-G)

- Use your own timestamp block (`20261109000100+`). Every new table: `alter table ... enable row level security`, add policies (usually `to authenticated using ((select is_staff()))`), and **grant explicitly**: default privileges give `authenticated` only SELECT on new tables and revoke everything from `anon`.
- New functions: `set search_path = public`; `language ... security definer` for writes; end the migration with `revoke execute on function ... from public, anon;` and `grant execute on function ... to authenticated;` (internal ones: also `revoke ... from authenticated`). `scripts/verify/run.mjs` fails if `anon` or `public` can execute anything, if a function lacks `search_path`, if a view is not `security_invoker`, or if any table lacks RLS.
- Never add write policies to ledger, document or GL tables.

## 8. Verification

MRP regressions: `scripts/seed/node_modules/.bin/tsx --test scripts/verify/mrp.test.ts`. On a migrated disposable PostgreSQL database, run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify/mrp_planning.sql` and the same command with `scripts/verify/bom_consumption.sql`. These SQL suites create transaction-local fixtures and roll back. Also run the same psql command with `scripts/verify/customer_portal.sql` for customer signup role isolation, location-specific catalog allocations, owned pickup orders feeding MRP, future backorders, business hours, aggregate limits and anonymous denial. `npm run test:browser` exercises the UI against mocked API responses, including customer sign-in, per-shop stock, pickup confirmation, failed availability and stale cart items in both themes. They cover five BOM parents, partial fulfillment, receipt timing/status, lead-time offsets, four-week boundaries, stock carryover, atomic production/kit consumption, missing-recipe rejection and function permissions. Trigger guards reject kit sale lines without a BOM and production transitions to `in_progress` without a current recipe. Internal guard functions are not API-callable.

`node scripts/verify/run.mjs [--no-rls] [--skip-data]` runs `scripts/verify/assertions.sql` (one query per check, passes when it returns no rows), `scripts/verify/rls_tests.sql` and `scripts/verify/access_security.sql` (role/access tests inside rolled-back transactions). Checks cover: ledger = balances = `item_costs` = GL 1200; journals balance; no negative stock; AP = GL 2000; GL 4000/4100/4200/5000/2100/1000 tie to the document tables; WIP = value issued to in-progress orders; document totals; reference data; minimum data volumes; scorecard has keep/watch/replace; MRP has a planned order; RLS on every table; no write policies on protected tables; `anon`/`public` cannot execute; helpers not executable by users; functions pin `search_path`; views are `security_invoker`; realtime publishes only `app_events` and `profiles`.



## 9. Delegated account access (2026-11-12)

`owner` and `admin` inherit all manager operational permissions. Account management follows a strict hierarchy across all shops: owner manages admin/manager/cashier/baker/customer; admin manages manager/cashier/baker/customer; manager manages cashier/baker/customer. The same allowed set applies to both current target role and requested new role. No caller can change themselves, peers or superiors. Home location remains a default, not an authorization boundary. A partial unique index permits at most one owner; trusted setup assigns the first owner using `supabase/bootstrap-owner.sql` with a verified signup email. Owner assignment/transfer is never a public API action. All signed-in browser roles have profile UPDATE revoked; a trigger additionally protects role, identity, location and customer linkage. Public signup remains customer-only, and the migration backfills missing profiles without promoting historical metadata or deleting records.

Deploy `supabase/functions/people/index.ts` and set server-only `APP_URL` to the full canonical frontend base URL (`https://skywalkerlb.github.io/ERP-GSCM-401/`). Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; never expose the latter in Vite variables. The endpoint verifies the JWT with Auth `getUser`, checks the current database profile for an account-management role, and uses an `accept-invite` redirect beneath that base path, with CORS restricted to its origin. Add that exact URL to Supabase Auth's redirect allowlist. It accepts POST JSON:

- `{action:"list"}` returns `{users:[{user_id,email,username,full_name,role,home_location_id,status}]}`, with status `active`, `invited` or `unconfirmed`.
- `{action:"invite",email,role,home_location_id:null|number}` invites a new account or grants access to an existing account without duplicating customer records.
- `{action:"resend",user_id}` resends an unaccepted invitation; active users use password recovery.
- `{action:"set-role",user_id,role,home_location_id:null|number}` updates an existing non-owner account. Assignable roles depend on the caller hierarchy; owner changes are rejected.
- `{action:"reset-password",user_id,password}` sets a new password (minimum 6 characters) for a lower-level username account only. `_authorize_password_reset(p_actor,p_user)` rechecks the current hierarchy and logs an authorized attempt in `account_password_reset_audit` before the Auth API update. Auth update and authorization are separate transactions; the audit records attempts, not completion. Failed Auth updates return an error. No passwords enter logs, audit or demo storage. Operators must verify the account holder and share the password privately. Legacy email accounts use email recovery.

The browser and endpoint share pure hierarchy helpers in `supabase/functions/_shared/account-access.ts`. `_set_account_access(p_actor uuid,p_user uuid,p_role app_role,p_home_location bigint = null)` is service-only; it locks actor and target profile rows in UUID order, checks their current database roles and applies the change in the same transaction. The old actor-free signature is removed. `_authorize_account_access(p_actor,p_user,p_role)` provides service-only preauthorization before invitation email, with null target allowed only for new users. Each successful assignment appends actor, target, old/new role and home location, and timestamp to `account_access_audit`; browser roles cannot read or write that audit table. Existing customer linkage is preserved.

Invitation authorization happens before sending email. Auth email and database updates cannot share a transaction: if the email was sent but assignment fails, the endpoint returns 409 with `{error,invitation_sent:true}` and tells the operator to refresh and retry the role update. It never reports that partial outcome as success.

Failures return `{error}` with an appropriate non-2xx status. Deploy the same endpoint to the isolated demo project with `DEMO_MODE=true`; it rejects all mutation actions even if a visitor knows the demo owner's credentials. The demo People UI simulates mutations locally. No real email is sent from demo account management.

Run `node --test scripts/verify/people_endpoint.test.mjs` for mocked endpoint authorization/invitation tests. Run `scripts/verify/access_security.sql` in a trusted database connection after migrations. It performs rolled-back permission tests. The migrations and endpoint still require hosted verification before release.

## 10. Username signup (2026-11-16)

Public signup requires only username and password. Normalize usernames by trimming and lowercasing; accept 3–30 ASCII letters, digits or underscores. The browser uses Supabase password Auth with the internal identifier `<username>@users.glazed.invalid`, and supplies matching `user_metadata.username`. The Auth email identity and unique immutable `profiles.username` enforce uniqueness; a trigger rejects malformed/mismatched reserved identifiers and subsequent identity changes. Customer contact email is null for these accounts. The shared identity helpers live in `supabase/functions/_shared/identity.ts`. The People API returns username and an empty email for these identities and refuses to invite/resend to the reserved domain.

Set local `auth.email.enable_confirmations=false` and separately disable hosted Confirm email. Successful signup returns a session, loads the new customer profile and opens `/shop`. An unexpected missing session is reported as backend setup failure, with no email-confirmation instructions for the customer. Existing email accounts keep their login, invitations and recovery routes. Signup never accepts a requested staff role. Owner username recovery requires trusted backend administration because the public hierarchy cannot reset the owner.


## 11. First-owner business setup (2026-11-17)

The real backend is `wzsbtfzettxpczgulibd` (formerly demo). Former backend `eaphbcbklbcadokfcewc` remains protected. Neither may host public demo identities or receive demo resets/prep. Business data is preserved during promotion; seeded demo identities are disabled before real access. Former backend was permanently deleted with explicit user authorization on 2026-11-19; its ID remains protected against demo resets/prep. Separate disposable demo project `wnsimxaopjqwiajbiina` retains sample data; the permanent project was cleaned on 2026-11-19 with genuine accounts and permanent owner setup preserved. See PROGRESS.md for verification status.

This is a single-business installation, not a multi-tenant service. Apply migration `20261117000001_business_onboarding.sql`, deploy `onboarding` with gateway JWT verification disabled (the function verifies protected actions with Auth `getUser`), and configure server-only `APP_URL` and `OWNER_SETUP_CODE` (16–256 random characters). The public status action reveals availability only. CORS uses the canonical app origin. Demo mode closes setup.

POST JSON actions:

- `{action:"status"}` → `{available:boolean}`; unavailable when unconfigured or already claimed.
- `{action:"locations",setup_code}` → `{locations:[{id,name,address}]}`; requires an authenticated real email account and correct code before disclosing existing active locations.
- `{action:"complete",setup_code,business_name,location_id?,location_name?,location_address?}` → `{completed:true,location_id}`; select an existing active location, or provide a shop name/address when none exist. New shops default to 7.25% tax. Errors return `{error}` with non-2xx status.

The setup account uses real email Auth and initially has ordinary customer permissions. Editable metadata cannot grant owner. Existing email accounts may complete setup without a duplicate Auth identity. Public and first-owner registration remain confirmation-free with hosted `mailer_autoconfirm=true`; Auth sets `email_confirmed_at` automatically and returns an immediate session. The onboarding endpoint/database check that Auth state; no verification email or SMTP setup is required for owner signup. Invitation acceptance establishes email access for invited staff. Emails remain Auth identities, not legacy `profiles.username` values.

Service-only `_business_setup_status`, `_business_setup_attempt` and `_complete_business_setup` control access. Attempts commit before code validation, allowing five requests per account and thirty globally per fifteen-minute fixed window. Both location lookup and completion consume attempts. The code is compared through fixed-length digests and is never stored in database/audit. Completion locks the singleton `business_setup` row and writes settings, location, role, home location and access audit atomically. Retries by the winning owner return the recorded result. Competing owners fail. A trigger closes setup on trusted owner assignment; its marker survives owner deletion. Existing owners close setup during migration. The trusted bootstrap script shares the permanent guard.

Deploy backend before frontend. Verify email delivery/SMTP and the repository-prefixed `/accept-invite` redirect before inviting real staff. Do not claim the production owner for a smoke test. Run `node --test scripts/verify/onboarding_endpoint.test.mjs` and execute `scripts/verify/onboarding_security.sql` through a trusted database connection; SQL fixtures roll back.

`save_business_location(p_id bigint, p_location jsonb)` creates/updates location details for owner/admin only; fields are code, name, kind, address, tax_rate, open_time, close_time, closed_weekdays and is_active. Returns location ID; deactivation preserves history.

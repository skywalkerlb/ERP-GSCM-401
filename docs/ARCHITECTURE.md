# Glazed ERP architecture (build contract)

> The approved architecture for the build, produced by a planning subagent on 2026-11-09 and approved by the user. Every agent building features follows it. If the code has to differ, update this file in the same change.
> Decisions made after this spec (they override it): 4 locations (Provo, Orem, Lehi shops + Central Kitchen Lindon); wow factors = forecast/bake plan, freshness & waste, auto-replenish; generic role logins; tax 7.25%; approved design tokens z-index/motion/breakpoints/chart + Dialog/ChartCard.


I read README.md, PROGRESS.md, DESIGN_SYSTEM.md, components/index.d.ts, tokens.json, and also scripts/check-design.sh. These project rules change the plan:

- **Design lint scope.** `check-design.sh` lints every `.ts/.tsx/.css/.html` file except files under `scripts/` and `design-system/`. So:
  - The seed generator should live in `scripts/seed/`.
  - Chart colors must be `var(--pink-500)` and the like. SVG `fill` accepts CSS variables.
  - The barcode and label colors must not be written as hex in our code.
  - `.sql` files are not linted.
- **Missing components.** The design system has no Dialog/Modal, Drawer, Chart, z-index or breakpoint tokens. Build Dialog and ChartCard from tokens (`radius-xl`, `shadow-lg`, `overlay`), tell the user, and ask before adding a z-index token.
- **Parallel agents and PROGRESS.md.** Hooks block edits until each agent has read README, PROGRESS and DESIGN_SYSTEM. Each session also has to add a PROGRESS.md entry, so parallel agents will collide on PROGRESS.md. Run each workstream in its own git worktree or branch. The lead merges them in order and consolidates the changelog (at most 10 entries, archive the overflow).

---

## 1. Postgres schema

**Conventions**
- Primary keys are `bigint generated always as identity`. Profiles are the exception and use the auth uuid.
- Money is `numeric(12,2)`. Unit costs are `numeric(14,4)`. Quantities are `numeric(12,3)`, in the item's base unit.
- Every operational table has `created_at` and `created_by uuid`.
- `business_date` is calculated as `(now() at time zone 'America/Denver')::date`.

**Reference data**
- `locations(id, code PRV|ORM|LEH|KIT, name, kind shop|kitchen, address, size_factor, tax_rate, open_time, close_time, closed_weekdays int[])`. The Provo shop is closed Sundays, which gives a realistic weekday pattern.
- `items`:
  - Identity: `id, sku (unique, mono), name, category, barcode (unique), item_type raw|packaging|finished|resale|kit`.
  - Flags: `is_sellable, is_purchasable, is_manufactured`.
  - Units and price: `uom (each|lb|gal)`, `list_price`.
  - Planning: `reorder_point` (stored and editable), `safety_stock_override`, `preferred_supplier_id`, `lead_time_days`.
  - Freshness: `shelf_life_days`.
  - Seasonality: `season_start_md`, `season_end_md`.
  - Other: `pack_size`, `is_active`.
- `item_suppliers(item_id, supplier_id, supplier_sku, unit_cost, quoted_lead_time_days, pack_size, is_preferred)`
- `bom_lines(parent_item_id, component_item_id, qty_per)`. These are single-level. Kits (`item_type='kit'`) are assembled when sold. Finished donuts are made by production orders.
- `suppliers(id, code, name, contact_name, email, phone, address, terms_label 'Net 30', terms_days, quoted_lead_time_days, notes, is_active)`
- `customers(id, auth_user_id null, name, kind walk_in|retail|business, email, phone, home_location_id)`
- `profiles(user_id uuid PK, full_name, role app_role, home_location_id, customer_id)`
- `reason_codes(code PK, category adjustment|waste|scrap|rework|return, label)`. Codes:
  - Adjustment: COUNT, DAMAGE.
  - Waste: EXPIRED, DROPPED, BURNT, OVERPROD.
  - Scrap and rework: UNDERPROOF, MISSHAPEN, FILL_LEAK, GLAZE_DEFECT.
  - Returns: QUALITY_STALE, FOREIGN_OBJ, WRONG_ITEM, CHANGED_MIND.
- `promotions(id, name, starts_on, ends_on, location_id null, item_id null, discount_pct, expected_lift)`
- `app_settings`, a single row (id=1):
  - EOQ costs: `ordering_cost_per_po` (45.00) and `holding_cost_rate_annual` (0.25).
  - Planning: `service_level_z` (1.65), `usage_window_days` (90), `review_period_days` (7), `use_actual_lead_time` (false), `bake_buffer_pct` (0.08).
  - Freshness: `day_old_markdown_pct` (0.50).
  - Scorecard: `score_w_ontime/.40`, `score_w_fill/.35`, `score_w_lead/.25`, `keep_threshold` (90), `watch_threshold` (75).
  - Other: `timezone`.
- `doc_sequences(prefix PK, next_no)`. Document numbers are `ORD-00481`, `RCPT-`, `RET-`, `PO-`, `MO-`, `TRF-`, `ADJ-`, `BAKE-`.

**Inventory: ledger plus balances**
- `inventory_transactions` is the source of truth:
  - Key fields: `id, txn_at, business_date, item_id, location_id, condition fresh|day_old, qty_delta (signed), unit_cost, value_delta (rounded to cents)`.
  - `txn_type` values: opening, receipt_po, sale, sale_return, return_scrap, transfer_out, transfer_in, adjust_count, adjust_damage, waste, dayold_out, dayold_in, prod_issue, prod_receipt.
  - Links: `reason_code, ref_type, ref_id, ref_line_id, journal_entry_id, user_id, note`.
- `inventory_balances(item_id, location_id, condition, qty_on_hand)` with PK (item, location, condition) and `check (qty_on_hand >= 0)`. It is maintained only by `_post_inventory`.
- `item_costs(item_id PK, qty_total, value_total, avg_cost generated as value_total/nullif(qty_total,0))`. This holds a company-wide weighted average cost. Transfers and day-old reclassification don't change cost.

**Weighted-average cost rule (inside `_post_inventory`)**
1. Lock the `item_costs` row `FOR UPDATE`.
2. Inbound (receipt, production receipt, opening, restock return): `value_delta = round(qty * given_cost, 2)`.
3. Outbound: `value_delta = -round(qty * avg_cost, 2)`. If the movement takes the last unit company-wide, `value_delta = -value_total` so no rounding residue is left.
4. Update `qty_total` and `value_total`, then upsert the balance row.

Result: Σ`value_total` equals Σ ledger `value_delta`, which equals GL account 1200 to the cent. This is the main reconciliation assertion.

**Freshness**
- Finished donuts carry a condition: fresh or day_old.
- `close_business_day` turns yesterday's day_old stock into waste (EXPIRED) and today's fresh stock into day_old.
- The POS charges day_old lines at `list_price*(1-markdown)`.
- `day_closes(location_id, business_date)` makes the close idempotent.

**Documents**
- Sales:
  - `sales(id, receipt_no, location_id, business_date, sold_at, cashier_id, customer_id, channel pos|sales_order|exchange|history_batch, ticket_count, subtotal, discount_total, tax_total, total, payment_method, tendered, change_due, sales_order_id, exchange_return_id)`
  - `sale_lines(id, sale_id, item_id, condition, qty, unit_price, discount_amt, line_net, unit_cost, cogs_total, qty_returned)`. Kit lines store the cost of their exploded components.
- Returns:
  - `returns(id, return_no, sale_id, location_id, kind return|exchange, refund_total, net_due, exchange_sale_id, processed_by, returned_at)`
  - `return_lines(return_id, sale_line_id, item_id, qty, disposition restock|quality_failure, reason_code, refund_amt, cost_amt)`
- Sales orders:
  - `sales_orders(id, so_number ORD-, customer_id, location_id, channel counter|phone|catering|online, status placed|fulfilled|closed|cancelled, requested_for timestamptz, fulfilled_at, closed_at, cancelled_reason, sale_id, notes)`
  - `so_lines(so_id, item_id, qty, unit_price, qty_fulfilled)`
- Transfers:
  - `transfers(id, trf_no, from_location_id, to_location_id, status planned|completed|cancelled, bake_plan_id, completed_at)`
  - `transfer_lines(transfer_id, item_id, qty)`
- Adjustments:
  - `inventory_adjustments(id, adj_no, location_id, kind cycle_count|damage|waste|day_close, note, posted_at)`
  - `adjustment_lines(adj_id, item_id, condition, system_qty, counted_qty, qty_delta, reason_code, value_delta)`
- Production:
  - `production_orders(id, mo_number, item_id, location_id, status planned|in_progress|completed|cancelled, qty_planned, qty_started, qty_good, qty_scrapped, qty_reworked, due_date, started_at, finished_at, unit_cost, issued_value, bake_plan_id)`
  - `production_defects(mo_id, kind scrap|rework, qty, reason_code)`
- Purchasing:
  - `purchase_orders(id, po_number, supplier_id, ship_to_location_id, status draft|sent|received|closed|cancelled, source manual|auto_replenish|sim, sent_on, expected_on, quoted_lead_days, total, notes)`. A partial receipt keeps the status at `sent` and the UI shows a "Partially received" badge.
  - `po_lines(po_id, item_id, qty_ordered, unit_cost, qty_received, qty_cancelled, expected_on)`
  - `po_receipts(id, po_id, location_id, received_on, received_by)`
  - `po_receipt_lines(receipt_id, po_line_id, qty)`
- Accounts payable:
  - `ap_bills(id, supplier_id, po_id, receipt_id, bill_date, due_date = bill_date + terms_days, amount, amount_paid, status open|paid)`
  - `ap_payments(id, bill_id, paid_on, amount, method)`
- Forecasting:
  - `forecast_runs(id, as_of, created_at)`
  - `demand_forecasts(run_id, item_id, location_id, forecast_date, qty, base, weekday_idx, trend_factor, season_factor, promo_lift)`
  - `bake_plans(id, plan_no, plan_date, status draft|released, buffer_pct)`
  - `bake_plan_lines(plan_id, item_id, location_id, forecast_qty, so_qty, planned_qty, override_qty)`
- `app_events(id, topic, entity, entity_id, location_id, customer_id, actor_id, summary, at)`. This is the realtime feed and also the activity log.

**GL-lite**
- `gl_accounts(code PK, name, type, statement)`
- `journal_entries(id, entry_date, source_type, source_id, memo)`
- `journal_lines(entry_id, account_code, location_id, debit, credit)`
- Accounts:
  - 1000 Cash, 1200 Inventory, 1300 WIP
  - 2000 Accounts payable, 2100 Sales tax payable
  - 3000 Owner equity
  - 4000 Sales, 4100 Sales returns (contra), 4200 Discounts (contra)
  - 5000 COGS, 5100 Waste and spoilage, 5150 Quality returns, 5200 Production scrap, 5300 Inventory adjustments
  - 6000 Labor, 6100 Rent and utilities
- A constraint trigger checks that Σdebit = Σcredit for each entry.

---

## 2. RPC functions

**Shared rules for all public RPCs**
- `SECURITY DEFINER`, `set search_path = public`, and one transaction per call.
- Each starts with `perform _require_role(...)` and finishes with `_emit_event`.
- Each accepts an optional `p_at timestamptz` that is honored only when `_is_system()` is true (`session_user='postgres' or auth.role()='service_role'`). Use `session_user`, not `current_user`, because `current_user` inside a definer function is always the owner. This override is how the seed replays history through the same code the UI uses.
- Items are locked in sorted `item_id` order to avoid deadlocks.
- Prices are always read on the server. The client price is never trusted.

**Internal helpers** (EXECUTE revoked from public, anon and authenticated)

`_post_inventory(item, loc, cond, qty_delta, txn_type, unit_cost?, ref_type, ref_id, ref_line_id, reason, at, journal_id) → numeric cost`, `_post_journal(date, source_type, source_id, memo, lines jsonb) → id`, `_post_sale(...)` (shared by POS, sales orders and exchanges), `_next_doc_no(prefix)`, `_emit_event(...)`, `_require_role(roles[])`, `_is_system()`, `_now(p_at)`.

**Public RPCs: what each one writes**

| RPC | Inventory ledger | Cost | GL |
|---|---|---|---|
| `complete_sale(p_location_id, p_lines[{item_id,qty,condition,discount_pct?}], p_order_discount{type,value}?, p_payment{method,tendered}, p_customer_id?)` → `{sale_id, receipt_no, total, change_due}` | `sale` out per line. Kits explode to their components. | WAC out; `sale_lines.unit_cost` stored | Dr Cash / Cr Sales, Cr Tax; Dr COGS / Cr Inventory |
| `process_return(p_sale_id, p_lines[{sale_line_id,qty,disposition,reason_code}], p_exchange_lines?, p_refund_method)` → `{return_id, return_no, refund_total, exchange_sale_id, net_due}` | `sale_return` in at the original `unit_cost`. A quality failure is also posted as `return_scrap` out with its reason. | Restock updates WAC | Dr Sales returns, Dr Tax / Cr Cash; Dr Inventory / Cr COGS; quality failure: Dr 5150 / Cr Inventory. An exchange also calls `_post_sale`, so cash is netted. |
| `create_sales_order(p_customer_id, p_location_id, p_requested_for, p_lines, p_channel, p_notes)` → so_id | none (stock is allocated through a view) | – | – |
| `place_pickup_order(p_location_id, p_pickup_at, p_lines)` (customer) | none | – | – |
| `fulfill_sales_order(p_so_id, p_payment)` | via `_post_sale`. Fails with a shortage list if stock is missing. | WAC | same as a sale |
| `close_sales_order`, `cancel_sales_order(p_so_id, p_reason)` | – | – | – |
| `create_transfer(p_from, p_to, p_lines, p_complete=true)`, `complete_transfer(p_id)` | out and in at avg cost | none | none |
| `post_adjustment(p_location, p_kind, p_lines[{item_id,condition,counted_qty \| qty_delta,reason_code}])` | adjust_count or adjust_damage | WAC | Dr/Cr 5300 ↔ 1200 |
| `log_waste(p_location, p_lines[{item_id,condition,qty,reason_code}])` | waste | WAC | Dr 5100 / Cr 1200 |
| `close_business_day(p_location, p_date)` | dayold_out/in reclass; day-old waste with reason EXPIRED | – | Dr 5100 for the waste |
| `create_purchase_order(p_supplier, p_ship_to, p_lines)` → draft; `send_purchase_order(p_po_id)` sets sent_on and expected_on (sent date + quoted lead time) | – | – | – |
| `receive_purchase_order(p_po_id, p_location_id, p_received_on, p_lines[{po_line_id,qty}])` | receipt_po in | WAC is recalculated at the PO unit cost | Dr 1200 / Cr 2000; creates `ap_bills` with the due date from the supplier's terms. Status becomes received when every line is complete. |
| `close_purchase_order(p_po_id)` | – (whatever is still open becomes `qty_cancelled`, which lowers fill rate) | – | – |
| `record_ap_payment(p_bill_id, p_amount, p_paid_on, p_method)` | – | – | Dr 2000 / Cr 1000 |
| `auto_replenish(p_use_rop=true, p_use_mrp=true, p_horizon_days=7)` → `[{po_id, supplier, lines, total}]` | – | – | Creates draft POs grouped by preferred supplier. Skips items that already have an open draft. |
| `apply_computed_reorder_points(p_item_ids?)` | – | – | Copies the calculated ROP into `items.reorder_point` |
| `create_production_order(p_item, p_qty_planned, p_due_date)` | – | – | – |
| `start_production_order(p_mo_id, p_qty_started)` | prod_issue: qty_started × BOM. Fails with a shortage list. | WAC out | Dr 1300 WIP / Cr 1200 |
| `complete_production_order(p_mo_id, p_qty_good, p_defects[{kind,qty,reason_code}])` (good + scrap = started; rework is counted within good) | prod_receipt: good units at the rolled-up unit cost (`issued_value / qty_started`) | WAC in | Dr 1200 (good) and Dr 5200 (scrap) / Cr 1300 |
| `generate_forecast(p_as_of, p_start, p_days)` → run_id | – | – | – |
| `build_bake_plan(p_plan_date, p_buffer_pct?)` → plan_id. Planned qty = forecast × (1 + buffer) + confirmed sales-order qty for that date, rounded up to whole dozens. | – | – | – |
| `release_bake_plan(p_plan_id)`: **one click** creates one production order per item at the kitchen plus a planned transfer from the kitchen to each shop | – | – | – |
| `record_expense(p_date, p_account, p_amount, p_memo)` | – | – | Dr 6xxx / Cr 1000 |

**Backorders and estimated availability**
- `v_item_availability(item, location)` shows:
  - on_hand (fresh and day_old)
  - allocated: open `placed` sales-order qty at that location
  - available = on_hand − allocated
  - backordered = max(0, allocated − on_hand)
  - on_order: remaining qty on open POs
  - est_available_date
- How `est_available_date` is chosen:
  - If available > 0, it's today.
  - For a manufactured item, it's the earliest due date of an open production order, or tomorrow.
  - For a purchased item, it's the earliest open PO line `expected_on` whose cumulative remaining qty covers the shortage. If no PO covers it, it's today + the quoted lead time (+1 day if the item must be transferred to a shop).
- PO-level backorders: a partially received PO line has remaining qty = ordered − received − cancelled and keeps its expected date.

---

## 3. Views and SQL

- **Usage from sales history** (`v_item_daily_usage`):
  - Uses `generate_series` over the usage window, so days with no sales count as zero.
  - Each item's usage is its direct net sales, minus restocked returns, plus Σ(parent qty sold × `bom.qty_per`) for every parent item that contains it.
- **`v_reorder_analysis`** (purchasable items, company-wide):
  - d̄ and σ_d come from daily usage.
  - L is the quoted lead time, or the actual average when `use_actual_lead_time` is on. σ_L comes from receipts.
  - SS = z·√(L·σ_d² + d̄²·σ_L²)
  - ROP = d̄·L + SS
  - D = 365·d̄
  - EOQ = √(2·D·S / (H_rate·avg_cost)), rounded up to the pack size.
  - IP = on_hand + on_order − backordered.
  - The suggested qty applies when IP ≤ ROP: ceil_pack(ROP + EOQ − IP).
  - stockout_date = today + IP/d̄
  - order_by = stockout_date − L, flagged "Order now" or "Late".
  - It shows the stored ROP next to the calculated ROP.
- **`v_periodic_review`**: S = d̄(L+R) + z·σ_d·√(L+R) and order = max(0, S − IP). R is the review period.
- **`v_supplier_scorecard`** (from closed or received POs over the last 180 days):
  - on_time_rate: the share of POs whose last receipt was on or before expected_on.
  - avg_actual_lead and avg_quoted_lead (first receipt minus sent_on).
  - fill_rate = Σreceived / Σordered.
  - lead_score = clamp(1 − max(0, actual − quoted)/quoted, 0, 1).
  - score = 100·(w1·on_time + w2·fill + w3·lead_score).
  - rating: keep at 90 or above, watch at 75 or above, otherwise replace.
  - Payments: amount_owed, next_due_date, overdue_amount and pct_paid_on_time from the AP tables. These are shown but not scored.
- **`mrp_weekly(p_start=current_date, p_weeks=4, p_include_forecast=false)`**: a plpgsql loop over component × week.
  - gross = Σ `placed` sales-order qty in that week × qty_per (plus forecast × qty_per when the toggle is on).
  - SR = scheduled receipts: remaining PO qty by `expected_on` week.
  - Net requirement for week w = max(0, gross_w − (POH_{w−1} + SR_w)). The starting POH is total on_hand.
  - Planned order = ceil_pack(net).
  - requirement_date = the first sales-order date in that week that causes the shortage.
  - order_by = requirement_date − lead time. Past order_by dates are flagged "Expedite".
  - Returns long-format rows, which the UI pivots into the weekly grid.
- **`production_report(p_from, p_to)`**:
  - Reports qty planned, started, good, scrapped and reworked.
  - Calculated metrics:
    - yield = good/started
    - scrap rate
    - first-pass yield = (good − reworked)/started
    - schedule attainment = good/planned
    - on-time completion
    - average cycle time (finished − started)
    - cost per dozen
  - Also shows a Pareto of scrap reasons, broken down by item and by day.
- **`pnl(p_from, p_to, p_location?)`** reads only from `journal_lines`:
  - Gross sales − returns − discounts = net sales.
  - Then COGS, waste, quality returns, scrap and adjustments give gross profit and gross margin %.
  - Then operating expenses give operating income.
- **`v_inventory_valuation`**: qty × avg_cost by item and location, rolled up by category. A footer checks it against GL 1200.
- **`inventory_turnover(p_from, p_to)`**:
  - COGS (5000 net, from the journal) / average inventory.
  - Average inventory = (GL 1200 balance at p_from + balance at p_to)/2.
  - Days on hand = period days / turnover.
  - The per-item version uses Σ ledger `value_delta` up to each date.
- **Report functions**: `sales_summary(p_from, p_to, p_grain day|week, p_location?)`, `top_sellers(...)`, `v_waste_summary` (qty, cost and waste % of production cost, by reason/item/location/day), `forecast_accuracy(p_from, p_to)` (WAPE = Σ|a−f|/Σa, bias, by item and shop), `v_ap_open_bills`.
- **Forecast**:
  - base = trailing 28-day average ÷ weekday index.
  - weekday_idx comes from 12 weeks of history, per shop and item.
  - The trend factor is the weekly regression slope over 8 weeks, capped at ±3% per week.
  - The season factor is 0 outside a seasonal item's window, plus a launch ramp.
  - promo_lift comes from `promotions`.
  - Accuracy uses rolling-origin backtest runs: one run per past day, using only data before that day.

---

## 4. Auth, roles, RLS, realtime

**Roles**
- `app_role` enum: owner, admin, manager, cashier, baker, customer.
- `auth_role()` is a STABLE SECURITY DEFINER function that reads profiles. `is_staff()` builds on it.
- A trigger on `auth.users` creates a customer profile when someone signs up through the portal.

**RLS**
- Enable RLS on every table. Revoke all access from anon.
- Staff get `SELECT` on operational tables. All staff can see all locations; the top-bar location switcher filters the screens.
- Owners, admins and managers can write master data (items, item_suppliers, bom_lines, suppliers, customers, promotions, app_settings), through direct table writes under RLS.
- Ledger, document and GL tables have **no INSERT/UPDATE/DELETE policies at all**. They can be written only through RPCs.
- Customers never read base tables. They use `get_catalog_availability()` (definer: shop locations, sellable items, price, available qty, est date, no costs) and RLS on `sales_orders` and `so_lines` (`customer_id = my_customer_id()`).

**Permissions by role**

| Role | Can use |
|---|---|
| Owner | All operations; grants admin and lower roles |
| Admin | All operations; manages manager/cashier/baker/customer accounts |
| Manager | All operations; manages cashier/baker/customer accounts |
| Cashier | POS, returns, sales orders, shop transfers, waste, day close, inventory view |
| Baker | Production, bake plan, kitchen receiving, adjustments, transfers, waste |
| Customer | Customer portal only |

All account-management changes target lower-level accounts only: no self, peer, superior or owner changes. Management spans all shops; home location is a default. Public signup requires email confirmation and creates customers.

**Demo accounts** are created by the seed through the admin API with `email_confirm: true`:
- owner@example.com
- admin@example.com
- manager@example.com
- cashier.provo@example.com
- cashier.orem@example.com
- baker@example.com
- two customers, ava@example.com and liam@example.com

The login page has a credential-free demo role selector. Keep demo credentials in environment settings, not in the repo. Demo business workflows use a separate sandbox; People invitations and access edits are simulated in the browser without sending emails. Never reset the persistent backend.

**Realtime**
- Business RPCs insert into `app_events`. The `supabase_realtime` publication contains `app_events` plus `profiles` for access changes. Auth subscribes to its own profile, treats events as invalidations and refetches through RLS; focus and 30-second polling provide fallbacks.
- `useRealtimeInvalidation()` makes one subscription and maps each topic prefix to query keys. For example, `sale.*` maps to `['sales']`, `['inventory']`, `['finance']` and `['reports']`, and `po.*` maps to `['purchasing']`, `['inventory']`, `['suppliers']` and `['mrp']`.
- RLS on `app_events`: staff see all events; customers see their own order events and `inventory.changed`.
- The dashboard has an activity feed, for example "Cashier sold 6 items at Provo".
- A Presence channel shows who is online.
- The fallback is `refetchInterval: 30s`.

---

## 5. Seed strategy (`scripts/seed/`, TypeScript, mulberry32 with seed 401)

**Approach**
- The simulator generates business events in chronological order and keeps its own **quantity-only** shadow state. It uses that state to make decisions and never sells more than is in stock; unmet demand is recorded as lost sales.
- The runner then **replays the events through the real RPCs with `p_at`** over a direct Postgres connection (`postgres` npm library, `DATABASE_URL` in a gitignored `.env.local`), in one transaction per simulated day.
- So weighted-average cost, the ledger, the GL and balances are all calculated by the production code, and the seed can't drift from the live behavior.
- Run order: truncate, master data, opening balances (Dr 1200/1000, Cr 3000), the daily loop, future data, forecast backtest, then auth users.

**Volume: history is stored as hourly register batches**
- One `sales` row per shop per open hour (`channel='history_batch'`, `ticket_count` set). That's about 3 × 13 h × 210 d ≈ 8k sales and about 50k lines.
- The ledger is about 70k rows, journal lines about 60k, and the database about 60 MB in total.
- Live demo sales are individual tickets.
- Per-ticket history (about 60k sales, over 1M rows) would make free-tier loading and views slow.

**Window**
- 210 days ending yesterday (`--end`, defaulting to yesterday in America/Denver). That stays above 6 months even if you reseed later.
- Today's 4 AM production and transfers are also posted, so the POS has fresh stock.

**Daily loop**
1. **Kitchen bake.** Per item: the simulator's forecast (trailing same-weekday average) × 1.08. Then `create`, `start` and `complete` the production order with a yield of 93–98% and random scrap or rework reasons, and start/finish times between 3 and 6 AM.
2. **Transfers.** Kitchen to shops for donuts. Resale items, beans, cups and lids go to shops twice a week against par levels.
3. **Hourly shop demand** = shop size × weekday × hour curve × season × trend × promo × Poisson-gamma noise.
   - Shop size: Provo 1.0, Orem 0.75, Lehi 0.6 with +2% per month growth.
   - Weekday index: Mon .85, Tue .8, Wed .85, Thu .95, Fri 1.25, Sat 1.45. Sunday is 0.7 at Orem and Lehi; Provo is closed.
   - Provo is down 25% from May to mid-August (students are away), with a back-to-school spike.
   - Pumpkin spice runs Sep 1 – Nov 30 with a launch ramp. Fritters are +15% in fall. Cold brew is +40% in summer and drip coffee is up in fall.
   - Events: National Donut Day (Jun 5) ×2.2, July 4, Pioneer Day (Jul 24), Halloween week, and "Fritter Friday" in October (20% off, lift 1.5).
   - 10% of demand can be met by day-old stock at the markdown price.
4. **Returns.** About 0.3% of lines: 60% quality failure (reason codes) and 40% exchanges.
5. **`close_business_day`** for each shop, plus occasional `log_waste` (DROPPED, BURNT).
6. **Purchasing.**
   - A continuous ROP check, plus a periodic review every Monday.
   - Purchase qty is the EOQ rounded up to the pack size. POs are sent the same day.
   - Receipts arrive at actual lead time = quoted + the supplier's delay distribution. Partial shipments create a backorder and a later second receipt.
   - Suppliers also raise prices at times (flour +8% in September, butter fluctuates) so weighted-average cost changes visibly.
7. **AP.** Bills are created at receipt and paid on the due date ±2 days. One supplier is usually paid late. The last 30 days stay open, so there is an amount owed and one overdue bill.
8. **Weekly cycle counts** on 3 items with small differences, plus occasional damage.
9. **Historical catering and pickup sales orders** (about 4 per week), each placed, then fulfilled and closed. About 5% are cancelled.
10. **Monthly expenses**: labor and rent.

**Future data**
- About 14 confirmed (`placed`) catering and pickup sales orders over the next 4 weeks, sized so the MRP grid shows shortages, with a large Thanksgiving week. Examples:
  - BYU Student Life: 30 dozen Original glazed + 10 dozen Maple bar for finals week.
  - A Lehi coworking space holiday party: 20 dozen assorted.
- 3 open POs: Sweet Peak is overdue and Beehive is due next week. These are the MRP's scheduled receipts.
- A planned "Thanksgiving dozen" promotion that the forecast picks up.
- A draft bake plan for tomorrow.
- 2 open customer pickup orders.
- After the history loop: `generate_forecast` for each of the last 56 days, to feed forecast accuracy.

**Item catalog (35 items, barcode `GZ1xxxxx`, Code 128)**

| SKU | Item | Type/uom | Cost | Price | Supplier (quoted lead time) |
|---|---|---|---|---|---|
| DN-GLZ | Original glazed | finished/each | rolled up ≈0.29 | 1.79 | Kitchen (1 d) |
| DN-CHF | Chocolate frosted | finished | ≈0.33 | 1.99 | Kitchen |
| DN-MPL | Maple bar | finished | ≈0.42 | 2.49 | Kitchen |
| DN-RSP | Raspberry filled | finished | ≈0.48 | 2.49 | Kitchen |
| DN-BCR | Boston cream | finished | ≈0.50 | 2.59 | Kitchen |
| DN-FRT | Apple fritter | finished | ≈0.62 | 3.49 | Kitchen |
| DN-PSC | Pumpkin spice cake (Sep–Nov) | finished | ≈0.36 | 2.29 | Kitchen |
| KT-GFT | Coffee gift kit | kit | ≈12.50 | 29.99 | assembled at sale |
| BV-DRP | Drip coffee 16 oz | kit | ≈0.45 | 2.49 | assembled at sale |
| BV-CBR | Cold brew bottle | resale | 1.10 | 3.99 | Bonneville (7) |
| BV-CML | Chocolate milk pint | resale | 0.85 | 2.49 | Cache Valley (2) |
| RS-BNS | House blend beans 12 oz | resale | 6.20 | 14.99 | Bonneville (7) |
| RS-MUG | Glazed mug | resale | 4.50 | 12.99 | Bonneville (7) |
| RM-FLR | Bread flour (lb) | raw | 0.42 | – | Wasatch Mill (3) |
| RM-SUG | Granulated sugar (lb) | raw | 0.55 | – | Wasatch Mill (3) |
| RM-PSG | Powdered sugar (lb) | raw | 0.78 | – | Wasatch Mill (3) |
| RM-YST | Instant yeast (lb) | raw | 4.20 | – | Intermountain (5) |
| RM-OIL | Frying oil (lb) | raw | 1.15 | – | Intermountain (5) |
| RM-CIN | Cinnamon (lb) | raw | 6.50 | – | Intermountain (5) |
| RM-PSS | Pumpkin pie spice (lb) | raw | 9.80 | – | Intermountain (5) |
| RM-VAN | Vanilla glaze base (lb) | raw | 2.40 | – | Intermountain (5) |
| RM-EGG | Liquid eggs (lb) | raw | 2.10 | – | Cache Valley (2) |
| RM-MLK | Whole milk (gal) | raw | 3.80 | – | Cache Valley (2) |
| RM-BTR | Butter (lb) | raw | 3.60 | – | Cache Valley (2) |
| RM-CHC | Chocolate icing base (lb) | raw | 3.20 | – | Sweet Peak (10) |
| RM-MPL | Maple glaze base (lb) | raw | 3.40 | – | Sweet Peak (10) |
| RM-RSP | Raspberry filling (lb) | raw | 3.90 | – | Sweet Peak (10) |
| RM-CRM | Bavarian cream (lb) | raw | 3.50 | – | Sweet Peak (10) |
| RM-PMP | Pumpkin puree (lb) | raw | 1.60 | – | Sweet Peak (10) |
| RM-APL | Diced apples (lb) | raw | 1.80 | – | Harvest Valley (3) |
| RM-CBN | Bulk coffee beans (lb) | raw | 7.50 | – | Bonneville (7) |
| PK-BAG | Donut bag | packaging | 0.06 | – | Beehive (14) |
| PK-BOX | Dozen box | packaging | 0.42 | – | Beehive (14) |
| PK-CUP / PK-LID | Hot cup / lid | packaging | 0.11 / 0.04 | – | Beehive (14) |
| PK-GBX | Gift box | packaging | 1.80 | – | Beehive (14) |

**BOMs (per 1 donut or 1 kit; 9 parent items)**
- **Base dough** (used in Original glazed): flour .090, sugar .012, yeast .002, eggs .010, milk .004 gal, butter .008, oil .030, vanilla glaze .040, bag .30, box .06.
- **Chocolate frosted** = base dough with vanilla glaze .015 + chocolate icing .035.
- **Maple bar** = base dough ×1.3 + maple glaze .045 (no vanilla glaze).
- **Raspberry filled** = base dough + raspberry filling .060 + powdered sugar .015 (no glaze).
- **Boston cream** = base dough + Bavarian cream .070 + chocolate icing .030.
- **Apple fritter**: flour .14, sugar .02, yeast .003, eggs .015, milk .006, butter .012, oil .05, apples .08, cinnamon .002, vanilla glaze .05, bag .3, box .06.
- **Pumpkin spice cake**: flour .08, sugar .025, eggs .02, milk .004, butter .01, oil .03, pumpkin puree .04, pumpkin spice .003, vanilla glaze .03, bag .3, box .06.
- **Coffee gift kit**: beans bag 1, mug 1, gift box 1.
- **Drip coffee**: bulk beans .04 lb, cup 1, lid 1.

**Suppliers: terms, reliability and expected rating**

| Supplier | Terms | Actual vs quoted lead time, on-time, fill | Rating |
|---|---|---|---|
| Wasatch Mill & Grain | Net 30 | +0.1 d, 97% on-time, 99% fill | keep |
| Intermountain Foodservice | Net 30 | +1.0 d, 85%, 95% | watch |
| Cache Valley Dairy | Net 15 | +0 d, 98%, 99% | keep |
| Sweet Peak Confections | Net 45 | +3.2 d, 58%, 87% | replace |
| Beehive Packaging Co. | Net 30 | +1.5 d, 78%, 93% | watch |
| Bonneville Coffee Roasters | Net 30 | +0.3 d, 94%, 98% | keep |
| Harvest Valley Produce | Net 15 | +0.5 d, 90%, 96% | keep |

**Customers (13)**
- Walk-in customer.
- Businesses: BYU Student Life Office, Orem Fire Station 2, Silicon Slopes Cowork (Lehi), Provo High PTA, Timpanogos Dental, Utah Valley Realty Group.
- Individuals: Ava Thompson, Liam Nguyen, Sofia Martinez, Noah Peterson, Emma Jensen, Ethan Clark.

---

## 6. Frontend

**Staff app** (`SidebarNav` with the donut mark; nav items filtered by role)
- **Sell**
  - `/pos`: scan to add, fresh or day-old, discounts, tender
  - `/pos/receipt/:id`: prints, with a Code 128 receipt number that can be scanned to start a return
  - `/sales`
  - `/orders`: tabs by status, with `/orders/new` and `/orders/:id`
  - `/returns`: scan a receipt, then return or exchange
- **Make**
  - `/forecast`: tabs for Forecast, Bake plan and Accuracy
  - `/production` and `/production/:id`
  - `/production/report`
  - `/freshness`: day close, waste log and waste dashboard
- **Stock**
  - `/inventory`: item × location grid, backordered qty, est. date available
  - `/inventory/:itemId`: ledger and cost history
  - `/inventory/transfers`
  - `/inventory/adjust`: scan to count or adjust
  - `/inventory/receive`: scan to receive against a PO
  - `/inventory/labels`
- **Buy**
  - `/purchasing` and `/purchasing/:id`
  - `/purchasing/:id/print`
  - `/purchasing/replenish`: one-click replenishment, with ROP/EOQ and MRP sources
  - `/purchasing/review`: periodic review
  - `/suppliers` and `/suppliers/:id`
  - `/suppliers/scorecard`
  - `/mrp`
- **Insights**
  - `/` dashboard
  - `/reports`
  - `/finance`: P&L, valuation, turnover, AP, journal
- **Setup**
  - `/items`: master data, BOM, barcode
  - `/customers`
  - `/settings`
  - `/about`

**Customer portal** (`/shop`, a separate light layout):
- `/shop`: catalog with availability by shop
- `/shop/cart`: choose a pickup time
- `/shop/orders`: live status
- `/shop/login` and `/shop/signup`

**Shared libraries**
- `src/lib/supabase.ts`, `queryClient.ts`, and `queryKeys.ts` (all keys defined up front).
- `src/lib/format.ts` (en-US Intl):
  - `formatMoney` → $342.75
  - `formatDate` → Nov 9, 2026
  - `formatTime` → 9:00 AM
  - `formatQty(q, uom)` → "14 dozen" when the item is a donut and q is divisible by 12
  - `formatPct`
  - `docNo`, rendered in mono
  - business-date helpers in the America/Denver time zone
- `src/hooks/useBarcodeScanner({onScan, minLength=6})`:
  - Handles keyboard-wedge scanners: keystrokes arriving less than 40 ms apart and ending in Enter.
  - Ignores normal typing in fields unless the field has `data-scan-target`.
- `CameraScanner`: `@zxing/browser`, which handles Code 128 on iOS Safari.
- `BarcodeLabel`: JsBarcode SVG inside a container forced to `data-theme="light"`.
- `useRealtimeInvalidation`, `usePresence`, `useRole`, and `<RequireRole>`.
- Charts use Recharts inside a token-styled `ChartCard`.
- `Dialog`, built from tokens.
- Print CSS that hides the app shell.
- `vercel.json` rewrites all routes to `/index.html` (SPA).
- Env: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The service-role key is local-only for the seed.

---

## 7. Workstreams

**Phase 0 (lead, done first, about 1–2 h): agree the contracts**
- `src/types/domain.ts`: enums for roles, item types, conditions, txn types, statuses, dispositions and reason categories, plus the parameter and return types for every RPC in §2.
- `supabase/CONTRACT.md`: RPC signatures, the `app_events` topic list (`sale.completed`, `return.processed`, `so.*`, `po.*`, `mo.*`, `transfer.*`, `inventory.adjusted`, `waste.logged`, `day.closed`, `bakeplan.released`, `settings.updated`) and view column lists.
- `src/lib/queryKeys.ts`, the route table and the nav config.
- Migration number blocks per stream: B 0001–0099, D 0100s, E 0200s, F 0300s, G 0400s, as `YYYYMMDDHHMMSS` prefixes per block.

| Stream | Owns | Depends on |
|---|---|---|
| **A** Scaffold and shell | Vite/TS/router/Query setup, `src/components/*` (12 ports plus the noted accessibility fixes, Dialog, ChartCard), app shell, top bar with location switcher and theme toggle, login with demo buttons, `src/lib/*`, `src/hooks/*` (scanner, realtime, role), BarcodeLabel, print CSS, placeholder pages in every `src/features/<x>/index.tsx`, `/about`, vercel.json, README §4 | Phase 0 |
| **B** Database | All core migrations (schema, posting helpers, every RPC in §2, views and functions in §3, RLS, grants, realtime publication), `src/lib/rpc.ts` typed wrappers, `src/types/db.ts` (`supabase gen types --linked`), `scripts/verify/assertions.sql` | Phase 0 |
| **C** Seed | `scripts/seed/*`: simulator, catalog, runner, auth users, `npm run seed` / `seed:check` / `demo:prep` | Contract (writes simulator code in parallel); runs after B is pushed |
| **D** Selling | `features/pos`, `returns`, `orders`, `portal` (`/shop`), `labels` | A and B |
| **E** Stock and buying | `features/inventory` (on-hand, transfers, adjust, receive), `purchasing` (including print and replenish/review), `suppliers` (scorecard), `mrp`, `items` (BOM editor) | A and B |
| **F** Make | `features/forecast` (bake plan, accuracy), `production` (+ report), `freshness` (day close, waste dashboard) | A and B |
| **G** Insights | `features/dashboard` (KPIs, activity feed, presence), `reports`, `finance`, `settings`, `customers` | A and B |

**Order**
1. Phase 0.
2. A, B and C in parallel.
3. B pushes migrations and generates types, then C seeds the hosted DB.
4. D, E, F and G in parallel. Each replaces only its own feature folder. If a stream needs a new view, it adds a migration in its own block.
5. Integration: the lead merges branches in order (A, B, C, then D–G) and consolidates PROGRESS.md.
6. Verification and the demo run-through.

---

## 8. Risks and verification

**Risks**
- **Free Supabase projects pause after 7 days of inactivity.** Open the app daily, or upgrade during demo week.
- **The seed must be fresh before the demo.** Reseed the night before so history ends yesterday, and run `demo:prep` that morning (release the bake plan, complete production). The "Start day" button on the bake plan screen is the backup.
- **Business dates must use America/Denver everywhere.** UTC rollover at 5 PM local would otherwise shift the business date.
- **The public demo URL allows writes.** Keep `npm run seed` able to reset everything, and keep a database backup taken right after seeding.
- **Camera scanning needs HTTPS.** Vercel provides it. For phone testing in dev, use `@vitejs/plugin-basic-ssl` with `--host`. iOS has no `BarcodeDetector`, so ZXing is required.
- **Labels must scan.** Print at 100% scale, black on white, with quiet zones. Test the USB scanner's Enter suffix.
- **RLS and grant mistakes are the biggest security risk.** Supabase grants EXECUTE on functions to anon and authenticated by default. Revoke it on every `_` helper and on all functions for anon. Every definer function needs `search_path` set. Check with `supabase db lint` and the Security Advisor.
- **`_is_system()` must use `session_user`.** Verify which session user the pooler reports before relying on `p_at`.
- **Concurrency.** Row locks in item order and the non-negative check constraint make two cashiers selling the last donut fail cleanly with a "only N left" message.
- **Seed size and timeouts.** Use hourly batches, run one transaction per simulated day with `statement_timeout = 0`, and connect directly or through the session pooler. Never paste the seed into the SQL editor.
- **Realtime may drop.** Show a reconnect indicator, and keep the 30 s refetch fallback.
- **Generated types drift.** Regenerate them after every migration.

**Verification**

1. **SQL assertions** (`scripts/verify/run.ts` runs `assertions.sql` against the hosted DB; it passes when no rows come back):
   - balances equal ledger sums
   - Σ`item_costs.value_total` equals Σ`value_delta`, which equals GL 1200
   - every journal entry balances
   - no negative balances
   - GL 2000 equals open AP
   - GL 4000 equals Σ sales line net
   - net GL COGS equals Σ sale COGS − restocked returns
   - WIP is 0 once production orders are complete
   - minimum data counts: ≥25 items, each with barcode, cost, price, ROP and lead time; ≥5 BOM parents; ≥6 suppliers; ≥10 customers; history spanning at least 183 days
   - at least one keep, one watch and one replace rating
   - at least one MRP planned order in the next 4 weeks
   - RLS is enabled on every public table
   - anon can't execute any function
2. **RPC and RLS tests** in `BEGIN … ROLLBACK`:
   - Run each RPC with `set local role authenticated` and `request.jwt.claims` set to each role.
   - Cashiers can't create POs, and customers can't see costs or other customers' orders.
   - Use pgTAP with `supabase test db --linked` if the CLI supports it; otherwise use the Node runner.
3. **Playwright against the Vercel preview**, with two contexts (manager and cashier) to check realtime. Scans are simulated by typing quickly and pressing Enter.

**Demo script (one per requirement)**
1. **POS:** sell three lines with a discount, then show the receipt. Valuation drops and the P&L rises live in the manager window.
2. **Inventory:** transfer stock, do a count adjustment (COUNT) and a damage adjustment, then show the backorder and est. date available on an item.
3. **Barcodes:** print labels, scan with the USB scanner in the POS, then with the phone camera on the receive screen.
4. **Sales orders:** create one, then fulfill and close it, and cancel another.
5. **Returns:** scan a receipt, restock one item and record a quality failure on another, run an exchange, and show the P&L returns and COGS lines change.
6. **Production:** start an order (components drop), complete it with scrap and rework, and show the metrics and the date-range report.
7. **Purchasing:**
   - Edit a supplier.
   - Run auto-replenish, open the printable PO and mark it sent; check the expected date.
   - Receive part of it (the backorder remains), then close it.
   - Change the ordering cost and watch EOQ change. Change a lead time and watch ROP change.
   - Show the periodic review and the scorecard (keep, watch, replace, and amount owed).
8. **MRP:** add a confirmed sales order and watch the weekly grid and order-by dates update.
9. **Finance:** P&L, valuation and turnover update after the steps above.
10. **Reports:** sales by day and week, top sellers, low stock with order-by dates, inventory by location, supplier performance.
11. **Customer portal:** log in as Ava, check availability, place a pickup order, and see it appear live for the cashier.
12. **Multiple users:** two staff browsers side by side, showing presence and the live activity feed.
13. **Wow features:** forecast to bake plan to one-click release (production orders plus transfers), with accuracy (WAPE); then day close, the day-old markdown and the waste dashboard.

### Critical Files for Implementation
- /Users/masonbriggs/ERP Project (GSCM401)/supabase/migrations/ (core schema, `_post_inventory`/`_post_journal`, RPCs, views, RLS; to be created)
- /Users/masonbriggs/ERP Project (GSCM401)/src/types/domain.ts and /Users/masonbriggs/ERP Project (GSCM401)/supabase/CONTRACT.md (the shared contract; to be created)
- /Users/masonbriggs/ERP Project (GSCM401)/scripts/seed/ (simulator and runner; to be created)
- /Users/masonbriggs/ERP Project (GSCM401)/design-system/components/index.d.ts and /Users/masonbriggs/ERP Project (GSCM401)/design-system/DESIGN_SYSTEM.md (component props and UI rules to port)
- /Users/masonbriggs/ERP Project (GSCM401)/scripts/check-design.sh (lint scope that decides where the seed code and chart colors can live)
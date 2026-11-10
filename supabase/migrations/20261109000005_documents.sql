-- 0005: business documents. Written only by RPCs (no INSERT/UPDATE/DELETE policies).

-- ---------------------------------------------------------------- sales orders
create table sales_orders (
  id               bigint generated always as identity primary key,
  so_number        text not null unique,                       -- ORD-00481
  customer_id      bigint not null references customers(id),
  location_id      bigint not null references locations(id),
  channel          text not null default 'counter' check (channel in ('counter', 'phone', 'catering', 'online')),
  status           text not null default 'placed' check (status in ('placed', 'fulfilled', 'closed', 'cancelled')),
  requested_for    timestamptz not null,
  fulfilled_at     timestamptz,
  closed_at        timestamptz,
  cancelled_reason text,
  sale_id          bigint,                                     -- fk added below
  notes            text,
  created_at       timestamptz not null default now(),
  created_by       uuid
);
create index so_status_idx   on sales_orders (status, requested_for);
create index so_customer_idx on sales_orders (customer_id);
create index so_location_idx on sales_orders (location_id, status);

create table so_lines (
  id             bigint generated always as identity primary key,
  so_id          bigint not null references sales_orders(id) on delete cascade,
  item_id        bigint not null references items(id),
  qty            numeric(12,3) not null check (qty > 0),
  unit_price     numeric(12,2) not null check (unit_price >= 0),
  qty_fulfilled  numeric(12,3) not null default 0 check (qty_fulfilled >= 0)
);
create index so_lines_so_idx   on so_lines (so_id);
create index so_lines_item_idx on so_lines (item_id);

-- ---------------------------------------------------------------- sales
create table sales (
  id                  bigint generated always as identity primary key,
  receipt_no          text not null unique,                    -- RCPT-00123
  location_id         bigint not null references locations(id),
  business_date       date not null,
  sold_at             timestamptz not null,
  cashier_id          uuid,
  customer_id         bigint references customers(id),
  channel             text not null default 'pos' check (channel in ('pos', 'sales_order', 'exchange', 'history_batch')),
  ticket_count        int  not null default 1 check (ticket_count >= 1),
  subtotal            numeric(12,2) not null default 0,        -- gross, before discounts
  discount_total      numeric(12,2) not null default 0,
  tax_rate            numeric(6,4)  not null default 0,
  tax_total           numeric(12,2) not null default 0,
  total               numeric(12,2) not null default 0,
  payment_method      text not null default 'card' check (payment_method in ('cash', 'card', 'other')),
  tendered            numeric(12,2) not null default 0,
  change_due          numeric(12,2) not null default 0,
  sales_order_id      bigint references sales_orders(id),
  exchange_return_id  bigint,                                  -- fk added below
  journal_entry_id    bigint references journal_entries(id),
  created_at          timestamptz not null default now(),
  created_by          uuid
);
create index sales_date_loc_idx  on sales (business_date, location_id);
create index sales_customer_idx  on sales (customer_id);
create index sales_so_idx        on sales (sales_order_id);
alter table sales_orders add constraint sales_orders_sale_fk foreign key (sale_id) references sales(id);

create table sale_lines (
  id            bigint generated always as identity primary key,
  sale_id       bigint not null references sales(id) on delete cascade,
  item_id       bigint not null references items(id),
  condition     stock_condition not null default 'fresh',
  qty           numeric(12,3) not null check (qty > 0),
  unit_price    numeric(12,2) not null,
  discount_amt  numeric(12,2) not null default 0,
  line_net      numeric(12,2) not null,                        -- qty*unit_price - discount_amt
  unit_cost     numeric(14,4) not null default 0,
  cogs_total    numeric(12,2) not null default 0,
  qty_returned  numeric(12,3) not null default 0 check (qty_returned >= 0)
);
create index sale_lines_sale_idx on sale_lines (sale_id);
create index sale_lines_item_idx on sale_lines (item_id);

-- ---------------------------------------------------------------- returns
create table returns (
  id                bigint generated always as identity primary key,
  return_no         text not null unique,                      -- RET-00007
  sale_id           bigint not null references sales(id),
  location_id       bigint not null references locations(id),
  kind              text not null default 'return' check (kind in ('return', 'exchange')),
  refund_net        numeric(12,2) not null default 0,          -- net of discount, before tax
  tax_refund        numeric(12,2) not null default 0,
  refund_total      numeric(12,2) not null default 0,          -- refund_net + tax_refund
  net_due           numeric(12,2) not null default 0,          -- exchange total - refund_total (>0 customer pays)
  refund_method     text not null default 'cash',
  exchange_sale_id  bigint references sales(id),
  processed_by      uuid,
  returned_at       timestamptz not null,
  business_date     date not null,
  journal_entry_id  bigint references journal_entries(id),
  created_at        timestamptz not null default now(),
  created_by        uuid
);
create index returns_sale_idx on returns (sale_id);
create index returns_date_idx on returns (business_date);
alter table sales add constraint sales_exchange_return_fk foreign key (exchange_return_id) references returns(id);

create table return_lines (
  id            bigint generated always as identity primary key,
  return_id     bigint not null references returns(id) on delete cascade,
  sale_line_id  bigint not null references sale_lines(id),
  item_id       bigint not null references items(id),
  qty           numeric(12,3) not null check (qty > 0),
  disposition   text not null check (disposition in ('restock', 'quality_failure')),
  reason_code   text references reason_codes(code),
  refund_amt    numeric(12,2) not null default 0,              -- net of discount, before tax
  gross_amt     numeric(12,2) not null default 0,              -- refund_amt + discount reversed
  cost_amt      numeric(12,2) not null default 0               -- inventory value returned (COGS reversed)
);
create index return_lines_return_idx on return_lines (return_id);
create index return_lines_saleline_idx on return_lines (sale_line_id);

-- ---------------------------------------------------------------- bake plans (referenced by transfers / MOs)
create table forecast_runs (
  id          bigint generated always as identity primary key,
  as_of       date not null,
  created_at  timestamptz not null default now(),
  created_by  uuid
);
create index forecast_runs_asof_idx on forecast_runs (as_of, id);

create table demand_forecasts (
  run_id         bigint not null references forecast_runs(id) on delete cascade,
  item_id        bigint not null references items(id),
  location_id    bigint not null references locations(id),
  forecast_date  date   not null,
  qty            numeric(12,3) not null,
  base           numeric(12,3) not null default 0,
  weekday_idx    numeric(8,4)  not null default 1,
  trend_factor   numeric(8,4)  not null default 1,
  season_factor  numeric(8,4)  not null default 1,
  promo_lift     numeric(8,4)  not null default 1,
  primary key (run_id, item_id, location_id, forecast_date)
);
create index demand_forecasts_date_idx on demand_forecasts (forecast_date, item_id, location_id);

create table bake_plans (
  id          bigint generated always as identity primary key,
  plan_no     text not null unique,                            -- BAKE-00012
  plan_date   date not null unique,
  status      text not null default 'draft' check (status in ('draft', 'released')),
  buffer_pct  numeric(6,4) not null default 0.08,
  forecast_run_id bigint references forecast_runs(id),
  released_at timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid
);

create table bake_plan_lines (
  id            bigint generated always as identity primary key,
  plan_id       bigint not null references bake_plans(id) on delete cascade,
  item_id       bigint not null references items(id),
  location_id   bigint not null references locations(id),      -- destination shop
  forecast_qty  numeric(12,3) not null default 0,
  so_qty        numeric(12,3) not null default 0,
  planned_qty   numeric(12,3) not null default 0,
  override_qty  numeric(12,3) check (override_qty is null or override_qty >= 0),
  final_qty     numeric(12,3) generated always as (coalesce(override_qty, planned_qty)) stored,
  unique (plan_id, item_id, location_id)
);

-- ---------------------------------------------------------------- transfers
create table transfers (
  id                bigint generated always as identity primary key,
  trf_no            text not null unique,                      -- TRF-00041
  from_location_id  bigint not null references locations(id),
  to_location_id    bigint not null references locations(id),
  status            text not null default 'planned' check (status in ('planned', 'completed', 'cancelled')),
  bake_plan_id      bigint references bake_plans(id),
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  check (from_location_id <> to_location_id)
);
create table transfer_lines (
  id           bigint generated always as identity primary key,
  transfer_id  bigint not null references transfers(id) on delete cascade,
  item_id      bigint not null references items(id),
  condition    stock_condition not null default 'fresh',
  qty          numeric(12,3) not null check (qty > 0)
);
create index transfer_lines_idx on transfer_lines (transfer_id);

-- ---------------------------------------------------------------- adjustments / waste / day close
create table inventory_adjustments (
  id           bigint generated always as identity primary key,
  adj_no       text not null unique,                           -- ADJ-00019
  location_id  bigint not null references locations(id),
  kind         text not null check (kind in ('cycle_count', 'damage', 'waste', 'day_close')),
  note         text,
  posted_at    timestamptz not null,
  business_date date not null,
  created_at   timestamptz not null default now(),
  created_by   uuid
);
create index inv_adj_date_idx on inventory_adjustments (business_date, kind);

create table adjustment_lines (
  id           bigint generated always as identity primary key,
  adj_id       bigint not null references inventory_adjustments(id) on delete cascade,
  item_id      bigint not null references items(id),
  condition    stock_condition not null default 'fresh',
  system_qty   numeric(12,3) not null default 0,
  counted_qty  numeric(12,3),
  qty_delta    numeric(12,3) not null,
  reason_code  text references reason_codes(code),
  value_delta  numeric(12,2) not null default 0
);
create index adj_lines_idx on adjustment_lines (adj_id);

create table day_closes (
  id               bigint generated always as identity primary key,
  location_id      bigint not null references locations(id),
  business_date    date not null,
  closed_at        timestamptz not null,
  closed_by        uuid,
  expired_qty      numeric(12,3) not null default 0,
  expired_value    numeric(12,2) not null default 0,
  reclassified_qty numeric(12,3) not null default 0,
  adj_id           bigint references inventory_adjustments(id),
  unique (location_id, business_date)
);

-- ---------------------------------------------------------------- production
create table production_orders (
  id             bigint generated always as identity primary key,
  mo_number      text not null unique,                         -- MO-00031
  item_id        bigint not null references items(id),
  location_id    bigint not null references locations(id),     -- kitchen
  status         text not null default 'planned' check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
  qty_planned    numeric(12,3) not null check (qty_planned > 0),
  qty_started    numeric(12,3) not null default 0,
  qty_good       numeric(12,3) not null default 0,
  qty_scrapped   numeric(12,3) not null default 0,
  qty_reworked   numeric(12,3) not null default 0,
  due_date       date not null,
  started_at     timestamptz,
  finished_at    timestamptz,
  unit_cost      numeric(14,4) not null default 0,
  issued_value   numeric(12,2) not null default 0,
  bake_plan_id   bigint references bake_plans(id),
  created_at     timestamptz not null default now(),
  created_by     uuid
);
create index mo_status_idx on production_orders (status, due_date);
create index mo_item_idx   on production_orders (item_id);

create table production_defects (
  id           bigint generated always as identity primary key,
  mo_id        bigint not null references production_orders(id) on delete cascade,
  kind         text not null check (kind in ('scrap', 'rework')),
  qty          numeric(12,3) not null check (qty > 0),
  reason_code  text not null references reason_codes(code)
);
create index prod_defects_idx on production_defects (mo_id);

-- ---------------------------------------------------------------- purchasing
create table purchase_orders (
  id                  bigint generated always as identity primary key,
  po_number           text not null unique,                    -- PO-00102
  supplier_id         bigint not null references suppliers(id),
  ship_to_location_id bigint not null references locations(id),
  status              text not null default 'draft' check (status in ('draft', 'sent', 'received', 'closed', 'cancelled')),
  source              text not null default 'manual' check (source in ('manual', 'auto_replenish', 'sim')),
  created_on          date not null default public._today(),
  sent_on             date,
  expected_on         date,
  quoted_lead_days    int,
  total               numeric(12,2) not null default 0,
  notes               text,
  created_at          timestamptz not null default now(),
  created_by          uuid
);
create index po_status_idx   on purchase_orders (status, expected_on);
create index po_supplier_idx on purchase_orders (supplier_id);

create table po_lines (
  id             bigint generated always as identity primary key,
  po_id          bigint not null references purchase_orders(id) on delete cascade,
  item_id        bigint not null references items(id),
  qty_ordered    numeric(12,3) not null check (qty_ordered > 0),
  unit_cost      numeric(14,4) not null check (unit_cost >= 0),
  qty_received   numeric(12,3) not null default 0 check (qty_received >= 0),
  qty_cancelled  numeric(12,3) not null default 0 check (qty_cancelled >= 0),
  expected_on    date
);
create index po_lines_po_idx   on po_lines (po_id);
create index po_lines_item_idx on po_lines (item_id);

create table po_receipts (
  id           bigint generated always as identity primary key,
  receipt_no   text not null unique,                           -- RCV-00045 (document number, prefix 'RCV')
  po_id        bigint not null references purchase_orders(id),
  location_id  bigint not null references locations(id),
  received_on  date not null,
  received_at  timestamptz not null,
  received_by  uuid,
  amount       numeric(12,2) not null default 0,
  journal_entry_id bigint references journal_entries(id),
  created_at   timestamptz not null default now()
);
create index po_receipts_po_idx on po_receipts (po_id);

create table po_receipt_lines (
  id           bigint generated always as identity primary key,
  receipt_id   bigint not null references po_receipts(id) on delete cascade,
  po_line_id   bigint not null references po_lines(id),
  qty          numeric(12,3) not null check (qty > 0),
  unit_cost    numeric(14,4) not null,
  value        numeric(12,2) not null
);
create index po_receipt_lines_idx on po_receipt_lines (receipt_id);

-- ---------------------------------------------------------------- accounts payable
create table ap_bills (
  id           bigint generated always as identity primary key,
  supplier_id  bigint not null references suppliers(id),
  po_id        bigint references purchase_orders(id),
  receipt_id   bigint references po_receipts(id),
  bill_date    date not null,
  due_date     date not null,
  amount       numeric(12,2) not null check (amount >= 0),
  amount_paid  numeric(12,2) not null default 0 check (amount_paid >= 0),
  status       text not null default 'open' check (status in ('open', 'paid')),
  created_at   timestamptz not null default now(),
  check (amount_paid <= amount)
);
create index ap_bills_status_idx on ap_bills (status, due_date);
create index ap_bills_supplier_idx on ap_bills (supplier_id);

create table ap_payments (
  id        bigint generated always as identity primary key,
  bill_id   bigint not null references ap_bills(id),
  paid_on   date not null,
  amount    numeric(12,2) not null check (amount > 0),
  method    text not null default 'ach',
  journal_entry_id bigint references journal_entries(id),
  created_at timestamptz not null default now(),
  created_by uuid
);
create index ap_payments_bill_idx on ap_payments (bill_id);

-- ---------------------------------------------------------------- expenses, events
create table expenses (
  id            bigint generated always as identity primary key,
  expense_date  date not null,
  account_code  text not null references gl_accounts(code),
  amount        numeric(12,2) not null check (amount > 0),
  memo          text,
  location_id   bigint references locations(id),
  journal_entry_id bigint references journal_entries(id),
  created_at    timestamptz not null default now(),
  created_by    uuid
);
create index expenses_date_idx on expenses (expense_date);

create table app_events (
  id           bigint generated always as identity primary key,
  topic        text not null,
  entity       text,
  entity_id    bigint,
  location_id  bigint references locations(id),
  customer_id  bigint references customers(id),
  actor_id     uuid,
  summary      text,
  at           timestamptz not null default now()
);
create index app_events_at_idx    on app_events (at desc);
create index app_events_topic_idx on app_events (topic, at desc);

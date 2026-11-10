-- 0002: reference / master data tables.

create table locations (
  id              bigint generated always as identity primary key,
  code            text not null unique,                       -- PRV, ORM, LEH, KIT
  name            text not null,
  kind            location_kind not null,
  address         text,
  size_factor     numeric(6,3) not null default 1,
  tax_rate        numeric(6,4) not null default 0.0725,
  open_time       time,
  close_time      time,
  closed_weekdays int[] not null default '{}',                -- 0 = Sunday ... 6 = Saturday
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid
);

create table suppliers (
  id                      bigint generated always as identity primary key,
  code                    text not null unique,
  name                    text not null,
  contact_name            text,
  email                   text,
  phone                   text,
  address                 text,
  terms_label             text not null default 'Net 30',
  terms_days              int  not null default 30 check (terms_days >= 0),
  quoted_lead_time_days   int  not null default 3 check (quoted_lead_time_days >= 0),
  notes                   text,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  created_by              uuid
);

create table items (
  id                     bigint generated always as identity primary key,
  sku                    text not null unique,
  name                   text not null,
  category               text,
  barcode                text unique,
  item_type              item_type not null,
  is_sellable            boolean not null default false,
  is_purchasable         boolean not null default false,
  is_manufactured        boolean not null default false,
  uom                    text not null default 'each' check (uom in ('each', 'lb', 'gal')),
  list_price             numeric(12,2) check (list_price is null or list_price >= 0),
  reorder_point          numeric(12,3) not null default 0 check (reorder_point >= 0),
  safety_stock_override  numeric(12,3) check (safety_stock_override is null or safety_stock_override >= 0),
  preferred_supplier_id  bigint references suppliers(id),
  lead_time_days         int not null default 0 check (lead_time_days >= 0),
  shelf_life_days        int check (shelf_life_days is null or shelf_life_days >= 0),
  season_start_md        text check (season_start_md is null or season_start_md ~ '^\d\d-\d\d$'),  -- 'MM-DD'
  season_end_md          text check (season_end_md   is null or season_end_md   ~ '^\d\d-\d\d$'),
  pack_size              numeric(12,3) not null default 1 check (pack_size > 0),
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  created_by             uuid,
  check (not is_sellable or list_price is not null)
);
create index items_type_idx on items (item_type);
create index items_supplier_idx on items (preferred_supplier_id);

create table item_suppliers (
  item_id                bigint not null references items(id) on delete cascade,
  supplier_id            bigint not null references suppliers(id),
  supplier_sku           text,
  unit_cost              numeric(14,4) not null check (unit_cost >= 0),
  quoted_lead_time_days  int check (quoted_lead_time_days is null or quoted_lead_time_days >= 0),
  pack_size              numeric(12,3) not null default 1 check (pack_size > 0),
  is_preferred           boolean not null default false,
  primary key (item_id, supplier_id)
);
create index item_suppliers_supplier_idx on item_suppliers (supplier_id);

-- Single-level BOM. Kits are exploded when sold; finished donuts are made by production orders.
create table bom_lines (
  id                 bigint generated always as identity primary key,
  parent_item_id     bigint not null references items(id) on delete cascade,
  component_item_id  bigint not null references items(id),
  qty_per            numeric(12,5) not null check (qty_per > 0),
  unique (parent_item_id, component_item_id),
  check (parent_item_id <> component_item_id)
);
create index bom_component_idx on bom_lines (component_item_id);

create table customers (
  id               bigint generated always as identity primary key,
  auth_user_id     uuid unique references auth.users(id) on delete set null,
  name             text not null,
  kind             text not null default 'retail' check (kind in ('walk_in', 'retail', 'business')),
  email            text,
  phone            text,
  home_location_id bigint references locations(id),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  created_by       uuid
);
create index customers_email_idx on customers (lower(email));

create table profiles (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  full_name         text not null default '',
  role              app_role not null,
  home_location_id  bigint references locations(id),
  customer_id       bigint references customers(id),
  created_at        timestamptz not null default now()
);

create table reason_codes (
  code      text primary key,
  category  reason_category not null,
  label     text not null
);

create table promotions (
  id            bigint generated always as identity primary key,
  name          text not null,
  starts_on     date not null,
  ends_on       date not null check (ends_on >= starts_on),
  location_id   bigint references locations(id),
  item_id       bigint references items(id),
  discount_pct  numeric(5,2) not null default 0 check (discount_pct >= 0 and discount_pct <= 100),
  expected_lift numeric(6,3) not null default 1 check (expected_lift >= 0),   -- 1.5 = +50% demand
  created_at    timestamptz not null default now(),
  created_by    uuid
);

create table app_settings (
  id                        int primary key default 1 check (id = 1),
  ordering_cost_per_po      numeric(12,2) not null default 45.00 check (ordering_cost_per_po >= 0),
  holding_cost_rate_annual  numeric(6,4)  not null default 0.25 check (holding_cost_rate_annual > 0),
  service_level_z           numeric(6,3)  not null default 1.65,
  usage_window_days         int           not null default 90 check (usage_window_days >= 7),
  review_period_days        int           not null default 7 check (review_period_days >= 1),
  use_actual_lead_time      boolean       not null default false,
  bake_buffer_pct           numeric(6,4)  not null default 0.08,
  day_old_markdown_pct      numeric(6,4)  not null default 0.50,
  score_w_ontime            numeric(5,4)  not null default 0.40,
  score_w_fill              numeric(5,4)  not null default 0.35,
  score_w_lead              numeric(5,4)  not null default 0.25,
  keep_threshold            numeric(6,2)  not null default 90,
  watch_threshold           numeric(6,2)  not null default 75,
  default_tax_rate          numeric(6,4)  not null default 0.0725,
  timezone                  text          not null default 'America/Denver',
  business_name             text          not null default 'Glazed',
  updated_at                timestamptz   not null default now(),
  updated_by                uuid
);

create table doc_sequences (
  prefix   text primary key,
  next_no  bigint not null default 1
);

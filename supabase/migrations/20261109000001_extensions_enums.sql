-- Glazed ERP, workstream B (database). Migration block 0001-0099.
-- 0001: enums and the two tiny time helpers everything else depends on.
-- Conventions: bigint identity PKs, money numeric(12,2), unit cost numeric(14,4),
-- quantities numeric(12,3) in the item base unit. Business dates are America/Denver.

create type app_role        as enum ('manager', 'cashier', 'baker', 'customer');
create type item_type       as enum ('raw', 'packaging', 'finished', 'resale', 'kit');
create type stock_condition as enum ('fresh', 'day_old');
create type location_kind   as enum ('shop', 'kitchen');
create type reason_category as enum ('adjustment', 'waste', 'scrap', 'rework', 'return');
create type txn_type        as enum (
  'opening', 'receipt_po', 'sale', 'sale_return', 'return_scrap',
  'transfer_out', 'transfer_in', 'adjust_count', 'adjust_damage',
  'waste', 'dayold_out', 'dayold_in', 'prod_issue', 'prod_receipt'
);

-- Business date for any timestamp (the shop runs on Utah time; never use UTC dates).
create function _bdate(p_ts timestamptz) returns date
language sql immutable parallel safe
set search_path = public
as $$ select (p_ts at time zone 'America/Denver')::date $$;

-- Today's business date.
create function _today() returns date
language sql stable
set search_path = public
as $$ select (now() at time zone 'America/Denver')::date $$;

-- Noon-ish timestamp on a business date (used when a replay passes a date but no p_at).
create function _ts_on(p_date date, p_time time default '12:00') returns timestamptz
language sql immutable
set search_path = public
as $$ select ((p_date + p_time) at time zone 'America/Denver') $$;

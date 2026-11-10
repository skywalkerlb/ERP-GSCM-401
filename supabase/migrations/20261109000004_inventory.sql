-- 0004: inventory ledger (source of truth), balances (derived), weighted-average costs.

create table inventory_transactions (
  id                bigint generated always as identity primary key,
  txn_at            timestamptz not null,
  business_date     date not null,
  item_id           bigint not null references items(id),
  location_id       bigint not null references locations(id),
  condition         stock_condition not null default 'fresh',
  txn_type          txn_type not null,
  qty_delta         numeric(12,3) not null check (qty_delta <> 0),
  unit_cost         numeric(14,4) not null default 0,
  value_delta       numeric(12,2) not null default 0,
  reason_code       text references reason_codes(code),
  ref_type          text,
  ref_id            bigint,
  ref_line_id       bigint,
  journal_entry_id  bigint references journal_entries(id),
  user_id           uuid,
  note              text,
  created_at        timestamptz not null default now()
);
create index invtx_item_loc_idx  on inventory_transactions (item_id, location_id, txn_at);
create index invtx_date_idx      on inventory_transactions (business_date, txn_type);
create index invtx_ref_idx       on inventory_transactions (ref_type, ref_id, ref_line_id);
create index invtx_journal_idx   on inventory_transactions (journal_entry_id);
create index invtx_type_idx      on inventory_transactions (txn_type, item_id);

create table inventory_balances (
  item_id      bigint not null references items(id),
  location_id  bigint not null references locations(id),
  condition    stock_condition not null default 'fresh',
  qty_on_hand  numeric(12,3) not null default 0 check (qty_on_hand >= 0),
  primary key (item_id, location_id, condition)
);
create index invbal_loc_idx on inventory_balances (location_id);

-- Company-wide weighted average cost. Transfers and day-old reclassification do not change it.
create table item_costs (
  item_id      bigint primary key references items(id) on delete cascade,
  qty_total    numeric(14,3) not null default 0 check (qty_total >= 0),
  value_total  numeric(14,2) not null default 0,
  avg_cost     numeric generated always as (value_total / nullif(qty_total, 0)) stored
);

-- Every item gets a cost row, so _post_inventory can always lock it.
create function _items_cost_row() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into item_costs (item_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger items_cost_row after insert on items for each row execute function _items_cost_row();

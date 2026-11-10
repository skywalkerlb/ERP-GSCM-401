-- 0006: auth helpers and internal posting helpers (all `_` functions are revoked from API roles in 0014).

-- ---------------------------------------------------------------- auth helpers (called by RLS policies)
create function auth_role() returns app_role
language sql stable security definer
set search_path = public
as $$ select role from profiles where user_id = auth.uid() $$;

create function is_staff() returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce((select role in ('manager', 'cashier', 'baker') from profiles where user_id = auth.uid()), false) $$;

create function my_customer_id() returns bigint
language sql stable security definer
set search_path = public
as $$ select customer_id from profiles where user_id = auth.uid() and role = 'customer' $$;

-- ---------------------------------------------------------------- session helpers
-- True for the seed / admin connections (direct postgres login or the service_role key).
-- Uses session_user (not current_user, which inside a definer function is always the owner)
-- and the `role` GUC, so `set local role authenticated` in a test turns it off again.
create function _is_system() returns boolean
language sql stable
set search_path = public
as $$
  select coalesce(nullif(current_setting('role', true), 'none'), session_user)
         in ('postgres', 'supabase_admin', 'service_role')
$$;

-- Effective timestamp for a posting: p_at is honored only for system sessions (seed replay).
create function _now(p_at timestamptz default null) returns timestamptz
language sql stable
set search_path = public
as $$ select case when p_at is not null and _is_system() then p_at else now() end $$;

-- Manager always passes. Everyone else must hold one of p_roles. System sessions pass.
create function _require_role(p_roles app_role[]) returns void
language plpgsql stable security definer
set search_path = public
as $$
declare v_role app_role;
begin
  if _is_system() then return; end if;
  v_role := auth_role();
  if v_role is null then
    raise exception 'Sign in to continue.' using errcode = '28000';
  end if;
  if v_role = 'manager' or v_role = any (p_roles) then return; end if;
  raise exception 'Your % account cannot do this. Ask a manager.', v_role using errcode = '42501';
end $$;

create function _actor_name() returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce((select coalesce(nullif(full_name, ''), initcap(role::text)) from profiles where user_id = auth.uid()),
                  case when _is_system() then 'System' else 'Someone' end)
$$;

create function _fmt_qty(p_qty numeric) returns text
language sql immutable
set search_path = public
as $$ select trim_scale(round(p_qty, 3))::text $$;

-- ---------------------------------------------------------------- document numbers and events
create function _next_doc_no(p_prefix text) returns text
language plpgsql
set search_path = public
as $$
declare v_no bigint;
begin
  insert into doc_sequences (prefix, next_no) values (p_prefix, 2)
  on conflict (prefix) do update set next_no = doc_sequences.next_no + 1
  returning next_no - 1 into v_no;
  return p_prefix || '-' || lpad(v_no::text, 5, '0');
end $$;

create function _emit_event(
  p_topic text, p_entity text, p_entity_id bigint, p_location_id bigint,
  p_customer_id bigint, p_summary text, p_at timestamptz default null
) returns void
language plpgsql
set search_path = public
as $$
begin
  insert into app_events (topic, entity, entity_id, location_id, customer_id, actor_id, summary, at)
  values (p_topic, p_entity, p_entity_id, p_location_id, p_customer_id, auth.uid(), p_summary, _now(p_at));
end $$;

-- Customer-visible "stock changed" ping. Skipped during seed replay (p_at given by a system session).
create function _emit_inventory_changed(p_location_id bigint, p_at timestamptz default null) returns void
language plpgsql
set search_path = public
as $$
begin
  if p_at is not null and _is_system() then return; end if;
  insert into app_events (topic, entity, location_id, actor_id, summary, at)
  values ('inventory.changed', 'inventory', p_location_id, auth.uid(), 'Stock changed', now());
end $$;

-- ---------------------------------------------------------------- locking and stock checks
-- Lock item cost rows in sorted id order (deadlock avoidance). Every posting also locks its own row.
create function _lock_items(p_ids bigint[]) returns void
language plpgsql
set search_path = public
as $$
begin
  perform 1 from item_costs
   where item_id = any (p_ids)
   order by item_id
   for update;
end $$;

-- p_need: jsonb array of {item_id, condition, qty}. Raises one message listing every shortage.
create function _check_stock(p_loc bigint, p_need jsonb) returns void
language plpgsql
set search_path = public
as $$
declare v_msg text;
begin
  select string_agg(
           case when coalesce(b.qty_on_hand, 0) <= 0
                then 'No ' || i.name || case when n.cond = 'day_old' then ' (day-old)' else '' end || ' left at ' || l.name
                else 'Only ' || _fmt_qty(b.qty_on_hand) || ' ' || i.name
                     || case when n.cond = 'day_old' then ' (day-old)' else '' end || ' left at ' || l.name end,
           '. ' order by i.name)
    into v_msg
    from (select (e->>'item_id')::bigint as item_id,
                 coalesce(e->>'condition', 'fresh')::stock_condition as cond,
                 sum((e->>'qty')::numeric) as qty
            from jsonb_array_elements(p_need) e group by 1, 2) n
    join items i on i.id = n.item_id
    join locations l on l.id = p_loc
    left join inventory_balances b on b.item_id = n.item_id and b.location_id = p_loc and b.condition = n.cond
   where coalesce(b.qty_on_hand, 0) < n.qty;
  if v_msg is not null then
    raise exception '%', v_msg using errcode = 'P0001', hint = 'Reduce the quantity or choose another location.';
  end if;
end $$;

-- ---------------------------------------------------------------- the inventory poster (weighted average cost)
-- Every stock movement in the system goes through here. Locks item_costs, computes value, updates
-- item_costs + inventory_balances, inserts the ledger row. Journal linkage is done by the caller.
-- p_value (signed) forces the value (used by paired moves and production receipts so rounding cannot drift).
create function _post_inventory(
  p_item bigint, p_loc bigint, p_cond stock_condition, p_qty numeric, p_type txn_type,
  p_unit_cost numeric default null, p_ref_type text default null, p_ref_id bigint default null,
  p_ref_line bigint default null, p_reason text default null, p_at timestamptz default null,
  p_value numeric default null, p_note text default null
) returns table (txn_id bigint, unit_cost numeric, value_delta numeric)
language plpgsql
set search_path = public
as $$
declare
  c        item_costs%rowtype;
  v_avg    numeric;
  v_val    numeric;
  v_cost   numeric;
  v_have   numeric;
  v_at     timestamptz := _now(p_at);
  v_id     bigint;
begin
  if p_qty is null or p_qty = 0 then
    raise exception 'Quantity cannot be zero.';
  end if;

  select * into c from item_costs where item_id = p_item for update;
  if not found then
    insert into item_costs (item_id) values (p_item) on conflict do nothing;
    select * into c from item_costs where item_id = p_item for update;
  end if;
  v_avg := case when c.qty_total > 0 then c.value_total / c.qty_total end;

  if p_qty > 0 then
    if p_value is not null then
      v_val  := round(p_value, 2);
      v_cost := round(v_val / p_qty, 4);
    else
      v_cost := coalesce(p_unit_cost, v_avg,
                  (select s.unit_cost from item_suppliers s where s.item_id = p_item order by s.is_preferred desc, s.unit_cost limit 1),
                  0);
      v_val  := round(p_qty * v_cost, 2);
      v_cost := round(v_cost, 4);
    end if;
  else
    select qty_on_hand into v_have from inventory_balances
     where item_id = p_item and location_id = p_loc and condition = p_cond;
    if coalesce(v_have, 0) < -p_qty then
      perform _check_stock(p_loc, jsonb_build_array(jsonb_build_object('item_id', p_item, 'condition', p_cond, 'qty', -p_qty)));
    end if;
    if p_value is not null then
      v_val := -abs(round(p_value, 2));
    elsif -p_qty >= c.qty_total then
      v_val := -c.value_total;                          -- last unit company-wide: leave no rounding residue
    else
      v_val := -round(-p_qty * v_avg, 2);
    end if;
    v_cost := round(abs(v_val) / -p_qty, 4);
  end if;

  update item_costs set qty_total = qty_total + p_qty, value_total = value_total + v_val
   where item_id = p_item;

  update inventory_balances set qty_on_hand = qty_on_hand + p_qty
   where item_id = p_item and location_id = p_loc and condition = p_cond;
  if not found then
    insert into inventory_balances (item_id, location_id, condition, qty_on_hand)
    values (p_item, p_loc, p_cond, p_qty);
  end if;

  insert into inventory_transactions
    (txn_at, business_date, item_id, location_id, condition, txn_type, qty_delta, unit_cost, value_delta,
     reason_code, ref_type, ref_id, ref_line_id, user_id, note)
  values
    (v_at, _bdate(v_at), p_item, p_loc, p_cond, p_type, p_qty, v_cost, v_val,
     p_reason, p_ref_type, p_ref_id, p_ref_line, auth.uid(), p_note)
  returning id into v_id;

  return query select v_id, v_cost, v_val;
end $$;

-- Cost-neutral move of stock between locations and/or conditions (transfers, day-old reclass).
-- Returns the value moved. Out leg at weighted average cost; in leg takes exactly the same value.
create function _move_inventory(
  p_item bigint, p_from_loc bigint, p_from_cond stock_condition, p_to_loc bigint, p_to_cond stock_condition,
  p_qty numeric, p_out_type txn_type, p_in_type txn_type, p_ref_type text, p_ref_id bigint,
  p_ref_line bigint, p_at timestamptz
) returns numeric
language plpgsql
set search_path = public
as $$
declare v_val numeric;
begin
  select o.value_delta into v_val
    from _post_inventory(p_item, p_from_loc, p_from_cond, -p_qty, p_out_type, null, p_ref_type, p_ref_id, p_ref_line, null, p_at) o;
  perform _post_inventory(p_item, p_to_loc, p_to_cond, p_qty, p_in_type, null, p_ref_type, p_ref_id, p_ref_line, null, p_at, -v_val);
  return -v_val;
end $$;

-- ---------------------------------------------------------------- the journal poster
-- p_lines: [{account, debit, credit, location_id}]. Zero lines are dropped. Returns null if nothing to post.
create function _post_journal(
  p_date date, p_source_type text, p_source_id bigint, p_memo text, p_lines jsonb
) returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_id    bigint;
  v_debit numeric;
  v_credit numeric;
begin
  select coalesce(sum((e->>'debit')::numeric), 0), coalesce(sum((e->>'credit')::numeric), 0)
    into v_debit, v_credit
    from jsonb_array_elements(p_lines) e;
  if v_debit <> v_credit then
    raise exception 'Journal for % % does not balance (debit %, credit %).', p_source_type, p_source_id, v_debit, v_credit;
  end if;
  if v_debit = 0 then return null; end if;

  insert into journal_entries (entry_date, source_type, source_id, memo, created_by)
  values (p_date, p_source_type, p_source_id, p_memo, auth.uid())
  returning id into v_id;

  insert into journal_lines (entry_id, account_code, location_id, debit, credit)
  select v_id, e->>'account', nullif(e->>'location_id', '')::bigint,
         coalesce((e->>'debit')::numeric, 0), coalesce((e->>'credit')::numeric, 0)
    from jsonb_array_elements(p_lines) e
   where coalesce((e->>'debit')::numeric, 0) <> 0 or coalesce((e->>'credit')::numeric, 0) <> 0;
  return v_id;
end $$;

-- ---------------------------------------------------------------- opening balances (seed only)
-- p_lines: [{item_id, location_id, qty, unit_cost, condition?}]. Posts Dr 1200 (and Dr 1000 for p_cash) / Cr 3000.
create function _post_opening(p_lines jsonb, p_cash numeric default 0, p_at timestamptz default null)
returns bigint
language plpgsql
set search_path = public
as $$
declare
  r       record;
  v_at    timestamptz := coalesce(p_at, now());
  v_total numeric := 0;
  v_j     bigint;
begin
  if not _is_system() then raise exception 'Opening balances can only be posted by an admin session.' using errcode = '42501'; end if;
  perform _lock_items((select coalesce(array_agg(distinct (e->>'item_id')::bigint), '{}') from jsonb_array_elements(p_lines) e));
  for r in
    select (e->>'item_id')::bigint as item_id, (e->>'location_id')::bigint as loc,
           coalesce(e->>'condition', 'fresh')::stock_condition as cond,
           (e->>'qty')::numeric as qty, (e->>'unit_cost')::numeric as cost
      from jsonb_array_elements(p_lines) e order by 1, 2
  loop
    continue when r.qty = 0;
    select v_total + p.value_delta into v_total
      from _post_inventory(r.item_id, r.loc, r.cond, r.qty, 'opening', r.cost, 'opening', null, null, null, v_at) p;
  end loop;
  v_j := _post_journal(_bdate(v_at), 'opening', null, 'Opening balances',
    jsonb_build_array(
      jsonb_build_object('account', '1200', 'debit', v_total, 'credit', 0),
      jsonb_build_object('account', '1000', 'debit', p_cash, 'credit', 0),
      jsonb_build_object('account', '3000', 'debit', 0, 'credit', v_total + p_cash)));
  update inventory_transactions set journal_entry_id = v_j
   where txn_type = 'opening' and journal_entry_id is null;
  return v_j;
end $$;

-- ---------------------------------------------------------------- shared sale poster (POS, sales orders, exchanges)
-- p_lines: [{item_id, qty, condition?, discount_pct?, unit_price?}]; unit_price only honored when p_price_override.
-- Returns {sale_id, receipt_no, subtotal, discount_total, tax_total, total, change_due}.
create function _post_sale(
  p_location bigint, p_lines jsonb, p_order_discount jsonb, p_payment jsonb, p_customer bigint,
  p_channel text, p_at timestamptz, p_so_id bigint default null, p_ticket_count int default 1,
  p_price_override boolean default false
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_at      timestamptz := _now(p_at);
  v_loc     locations%rowtype;
  v_set     app_settings%rowtype;
  v_sale    bigint;
  v_receipt text;
  v_need    jsonb;
  v_ids     bigint[];
  v_sub     numeric;
  v_ldisc   numeric;
  v_base    numeric;
  v_odisc   numeric := 0;
  v_alloc   numeric;
  v_left    numeric;
  v_remain_base numeric;
  v_net     numeric;
  v_tax     numeric;
  v_total   numeric;
  v_method  text := coalesce(p_payment->>'method', 'card');
  v_tender  numeric;
  v_change  numeric := 0;
  v_cogs    numeric := 0;
  v_line_cogs numeric;
  v_j       bigint;
  r         record;
  c         record;
  v_nlines  int;
  v_units   numeric;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item to the sale.';
  end if;
  select * into v_loc from locations where id = p_location and is_active;
  if not found then raise exception 'Unknown location.'; end if;
  if v_loc.kind <> 'shop' then raise exception 'Sales can only be rung up at a shop, not %.', v_loc.name; end if;
  if v_method not in ('cash', 'card', 'other') then raise exception 'Payment method must be cash, card or other.'; end if;
  select * into v_set from app_settings where id = 1;

  -- validate lines
  for r in
    select (e->>'item_id')::bigint as item_id, (e->>'qty')::numeric as qty,
           coalesce(e->>'condition', 'fresh') as cond, coalesce((e->>'discount_pct')::numeric, 0) as dpct
      from jsonb_array_elements(p_lines) e
  loop
    if r.item_id is null then raise exception 'Every line needs an item.'; end if;
    if r.qty is null or r.qty <= 0 then raise exception 'Quantity must be at least 1 (or more than 0).'; end if;
    if r.cond not in ('fresh', 'day_old') then raise exception 'Condition must be fresh or day_old.'; end if;
    if r.dpct < 0 or r.dpct > 100 then raise exception 'Line discount must be between 0 and 100 percent.'; end if;
    if not exists (select 1 from items i where i.id = r.item_id and i.is_sellable and i.is_active) then
      raise exception 'Item % cannot be sold.', r.item_id;
    end if;
    if r.cond = 'day_old' and not exists (select 1 from items i where i.id = r.item_id and i.item_type = 'finished') then
      raise exception 'Only finished donuts can be sold as day-old.';
    end if;
  end loop;

  -- lock every item involved (kits include their components), in sorted id order
  select array_agg(distinct x order by x) into v_ids from (
    select (e->>'item_id')::bigint as x from jsonb_array_elements(p_lines) e
    union
    select b.component_item_id from jsonb_array_elements(p_lines) e
      join bom_lines b on b.parent_item_id = (e->>'item_id')::bigint
      join items k on k.id = b.parent_item_id and k.item_type = 'kit') q;
  perform _lock_items(v_ids);

  -- document header
  v_receipt := _next_doc_no('RCPT');
  insert into sales (receipt_no, location_id, business_date, sold_at, cashier_id, customer_id, channel, ticket_count,
                     tax_rate, payment_method, sales_order_id, created_by)
  values (v_receipt, p_location, _bdate(v_at), v_at, auth.uid(), p_customer, p_channel, greatest(coalesce(p_ticket_count, 1), 1),
          v_loc.tax_rate, v_method, p_so_id, auth.uid())
  returning id into v_sale;

  -- lines at server-side prices
  insert into sale_lines (sale_id, item_id, condition, qty, unit_price, discount_amt, line_net)
  select v_sale, i.id, s.cond, s.qty, pr.price, d.disc, d.gross - d.disc
    from (select (e->>'item_id')::bigint as item_id, (e->>'qty')::numeric as qty,
                 coalesce(e->>'condition', 'fresh')::stock_condition as cond,
                 coalesce((e->>'discount_pct')::numeric, 0) as dpct,
                 (e->>'unit_price')::numeric as uprice, ord
            from jsonb_array_elements(p_lines) with ordinality t(e, ord)) s
    join items i on i.id = s.item_id
    cross join lateral (select case when p_price_override and s.uprice is not null then s.uprice
                                    when s.cond = 'day_old' then round(i.list_price * (1 - v_set.day_old_markdown_pct), 2)
                                    else i.list_price end as price) pr
    cross join lateral (select round(s.qty * pr.price, 2) as gross) g
    cross join lateral (select g.gross, round(g.gross * s.dpct / 100, 2) as disc) d
   order by s.ord;

  -- stock check (kits explode into components)
  select coalesce(jsonb_agg(jsonb_build_object('item_id', q.item_id, 'condition', q.cond, 'qty', q.qty)), '[]') into v_need from (
    select sl.item_id, sl.condition::text as cond, sl.qty
      from sale_lines sl join items i on i.id = sl.item_id
     where sl.sale_id = v_sale and i.item_type <> 'kit'
    union all
    select b.component_item_id, 'fresh', sl.qty * b.qty_per
      from sale_lines sl join items i on i.id = sl.item_id and i.item_type = 'kit'
      join bom_lines b on b.parent_item_id = sl.item_id
     where sl.sale_id = v_sale) q;
  perform _check_stock(p_location, v_need);

  -- order-level discount, allocated across lines in proportion (last line takes the rounding remainder)
  select sum(round(unit_price * qty, 2) - discount_amt) into v_base from sale_lines where sale_id = v_sale;
  if p_order_discount is not null and jsonb_typeof(p_order_discount) = 'object' and (p_order_discount->>'value') is not null then
    if p_order_discount->>'type' = 'pct' then
      if (p_order_discount->>'value')::numeric < 0 or (p_order_discount->>'value')::numeric > 100 then
        raise exception 'Order discount must be between 0 and 100 percent.'; end if;
      v_odisc := round(v_base * (p_order_discount->>'value')::numeric / 100, 2);
    elsif p_order_discount->>'type' in ('amount', 'amt', 'fixed') then
      if (p_order_discount->>'value')::numeric < 0 then raise exception 'Discount cannot be negative.'; end if;
      v_odisc := least(round((p_order_discount->>'value')::numeric, 2), v_base);
    else
      raise exception 'Order discount type must be pct or amount.';
    end if;
  end if;
  if v_odisc > 0 and v_base > 0 then
    v_left := v_odisc;
    v_remain_base := v_base;
    for r in select id, (round(unit_price * qty, 2) - discount_amt) as base from sale_lines where sale_id = v_sale order by id loop
      v_alloc := case when v_remain_base - r.base <= 0 then v_left
                      else least(round(v_odisc * r.base / v_base, 2), v_left, r.base) end;
      v_left := v_left - v_alloc;
      v_remain_base := v_remain_base - r.base;
      update sale_lines set discount_amt = discount_amt + v_alloc, line_net = line_net - v_alloc where id = r.id;
    end loop;
  end if;

  select sum(round(unit_price * qty, 2)), sum(discount_amt) into v_sub, v_ldisc from sale_lines where sale_id = v_sale;
  v_net   := v_sub - v_ldisc;
  v_tax   := round(v_net * v_loc.tax_rate, 2);
  v_total := v_net + v_tax;
  if v_method = 'cash' then
    v_tender := coalesce((p_payment->>'tendered')::numeric, v_total);
    if v_tender < v_total then
      raise exception 'Cash tendered ($%) is less than the total ($%).', to_char(v_tender, 'FM999990.00'), to_char(v_total, 'FM999990.00');
    end if;
    v_change := v_tender - v_total;
  else
    v_tender := v_total;
  end if;

  -- post stock out at weighted average cost
  for r in select sl.id, sl.item_id, sl.condition, sl.qty, i.item_type
             from sale_lines sl join items i on i.id = sl.item_id where sl.sale_id = v_sale order by sl.id loop
    v_line_cogs := 0;
    if r.item_type = 'kit' then
      for c in select b.component_item_id, round(r.qty * b.qty_per, 3) as q
                 from bom_lines b where b.parent_item_id = r.item_id order by b.component_item_id loop
        continue when c.q = 0;
        select v_line_cogs + abs(x.value_delta) into v_line_cogs
          from _post_inventory(c.component_item_id, p_location, 'fresh', -c.q, 'sale', null, 'sale', v_sale, r.id, null, v_at) x;
      end loop;
    else
      select abs(x.value_delta) into v_line_cogs
        from _post_inventory(r.item_id, p_location, r.condition, -r.qty, 'sale', null, 'sale', v_sale, r.id, null, v_at) x;
    end if;
    update sale_lines set cogs_total = v_line_cogs, unit_cost = round(v_line_cogs / qty, 4) where id = r.id;
    v_cogs := v_cogs + v_line_cogs;
  end loop;

  update sales set subtotal = v_sub, discount_total = v_ldisc, tax_total = v_tax, total = v_total,
                   tendered = v_tender, change_due = v_change
   where id = v_sale;

  v_j := _post_journal(_bdate(v_at), 'sale', v_sale, 'Sale ' || v_receipt, jsonb_build_array(
    jsonb_build_object('account', '1000', 'location_id', p_location, 'debit', v_total, 'credit', 0),
    jsonb_build_object('account', '4200', 'location_id', p_location, 'debit', v_ldisc, 'credit', 0),
    jsonb_build_object('account', '4000', 'location_id', p_location, 'debit', 0, 'credit', v_sub),
    jsonb_build_object('account', '2100', 'location_id', p_location, 'debit', 0, 'credit', v_tax),
    jsonb_build_object('account', '5000', 'location_id', p_location, 'debit', v_cogs, 'credit', 0),
    jsonb_build_object('account', '1200', 'location_id', p_location, 'debit', 0, 'credit', v_cogs)));
  update sales set journal_entry_id = v_j where id = v_sale;
  update inventory_transactions set journal_entry_id = v_j where ref_type = 'sale' and ref_id = v_sale;

  if p_channel <> 'history_batch' then
    select count(*), coalesce(sum(qty), 0) into v_nlines, v_units from sale_lines where sale_id = v_sale;
    perform _emit_event('sale.completed', 'sale', v_sale, p_location, p_customer,
      _actor_name() || ' sold ' || _fmt_qty(v_units) || case when v_units = 1 then ' item' else ' items' end || ' at ' || v_loc.name, p_at);
    perform _emit_inventory_changed(p_location, p_at);
  end if;

  return jsonb_build_object('sale_id', v_sale, 'receipt_no', v_receipt, 'subtotal', v_sub,
    'discount_total', v_ldisc, 'tax_total', v_tax, 'total', v_total, 'change_due', v_change);
end $$;

-- 0008: stock RPCs: transfers, adjustments, waste, day close.

-- ---------------------------------------------------------------- transfers
create function _create_transfer(
  p_from bigint, p_to bigint, p_lines jsonb, p_bake_plan bigint, p_at timestamptz
) returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_id bigint;
  v_no text;
begin
  if p_from is null or p_to is null or p_from = p_to then
    raise exception 'Choose two different locations for the transfer.'; end if;
  if not exists (select 1 from locations where id = p_from and is_active)
     or not exists (select 1 from locations where id = p_to and is_active) then
    raise exception 'Unknown location.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item to the transfer.'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) e where coalesce((e->>'qty')::numeric, 0) <= 0) then
    raise exception 'Quantity must be more than 0.'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) e
              left join items i on i.id = (e->>'item_id')::bigint where i.id is null) then
    raise exception 'Unknown item on the transfer.'; end if;

  v_no := _next_doc_no('TRF');
  insert into transfers (trf_no, from_location_id, to_location_id, bake_plan_id, created_at, created_by)
  values (v_no, p_from, p_to, p_bake_plan, _now(p_at), auth.uid())
  returning id into v_id;
  insert into transfer_lines (transfer_id, item_id, condition, qty)
  select v_id, (e->>'item_id')::bigint, coalesce(e->>'condition', 'fresh')::stock_condition, sum((e->>'qty')::numeric)
    from jsonb_array_elements(p_lines) e
   group by 2, 3 order by 2, 3;
  return v_id;
end $$;

create function _complete_transfer(p_id bigint, p_at timestamptz) returns void
language plpgsql
set search_path = public
as $$
declare
  t      transfers%rowtype;
  v_at   timestamptz := _now(p_at);
  r      record;
  v_from text;
  v_to   text;
begin
  select * into t from transfers where id = p_id for update;
  if not found then raise exception 'Transfer not found.'; end if;
  if t.status <> 'planned' then
    raise exception 'Transfer % is % and cannot be completed.', t.trf_no, t.status; end if;
  perform _lock_items((select array_agg(distinct item_id) from transfer_lines where transfer_id = p_id));
  perform _check_stock(t.from_location_id,
    (select jsonb_agg(jsonb_build_object('item_id', item_id, 'condition', condition, 'qty', qty)) from transfer_lines where transfer_id = p_id));
  for r in select * from transfer_lines where transfer_id = p_id order by item_id, condition loop
    perform _move_inventory(r.item_id, t.from_location_id, r.condition, t.to_location_id, r.condition, r.qty,
                            'transfer_out', 'transfer_in', 'transfer', t.id, r.id, p_at);
  end loop;
  update transfers set status = 'completed', completed_at = v_at where id = p_id;
  select name into v_from from locations where id = t.from_location_id;
  select name into v_to from locations where id = t.to_location_id;
  perform _emit_event('transfer.completed', 'transfer', p_id, t.to_location_id, null,
    'Transfer ' || t.trf_no || ' completed: ' || v_from || ' to ' || v_to, p_at);
  perform _emit_inventory_changed(t.to_location_id, p_at);
end $$;

create function create_transfer(
  p_from bigint, p_to bigint, p_lines jsonb, p_complete boolean default true,
  p_bake_plan_id bigint default null, p_at timestamptz default null
) returns bigint
language plpgsql security definer
set search_path = public
as $$
declare v_id bigint; v_no text;
begin
  perform _require_role('{cashier,baker}');
  v_id := _create_transfer(p_from, p_to, p_lines, p_bake_plan_id, p_at);
  select trf_no into v_no from transfers where id = v_id;
  perform _emit_event('transfer.created', 'transfer', v_id, p_to, null, 'Transfer ' || v_no || ' planned', p_at);
  if p_complete then perform _complete_transfer(v_id, p_at); end if;
  return v_id;
end $$;

create function complete_transfer(p_id bigint, p_at timestamptz default null) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform _require_role('{cashier,baker}');
  perform _complete_transfer(p_id, p_at);
end $$;

create function cancel_transfer(p_id bigint) returns void
language plpgsql security definer
set search_path = public
as $$
declare t transfers%rowtype;
begin
  perform _require_role('{cashier,baker}');
  select * into t from transfers where id = p_id for update;
  if not found then raise exception 'Transfer not found.'; end if;
  if t.status <> 'planned' then raise exception 'Only planned transfers can be cancelled.'; end if;
  update transfers set status = 'cancelled' where id = p_id;
  perform _emit_event('transfer.cancelled', 'transfer', p_id, t.to_location_id, null, 'Transfer ' || t.trf_no || ' cancelled');
end $$;

-- ---------------------------------------------------------------- adjustments (cycle count / damage)
-- p_lines: [{item_id, condition?, counted_qty | qty_delta, reason_code?}]
create function post_adjustment(
  p_location bigint, p_kind text, p_lines jsonb, p_note text default null, p_at timestamptz default null
) returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_at    timestamptz := _now(p_at);
  v_adj   bigint;
  v_no    text;
  v_loc   locations%rowtype;
  r       record;
  v_sys   numeric;
  v_delta numeric;
  v_reason text;
  v_val   numeric;
  v_loss  numeric := 0;
  v_gain  numeric := 0;
  v_j     bigint;
  v_n     int := 0;
begin
  perform _require_role('{cashier,baker}');
  if p_kind not in ('cycle_count', 'damage') then raise exception 'Adjustment kind must be cycle_count or damage.'; end if;
  select * into v_loc from locations where id = p_location and is_active;
  if not found then raise exception 'Unknown location.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item to the adjustment.'; end if;

  perform _lock_items((select array_agg(distinct (e->>'item_id')::bigint) from jsonb_array_elements(p_lines) e));

  v_no := _next_doc_no('ADJ');
  insert into inventory_adjustments (adj_no, location_id, kind, note, posted_at, business_date, created_by)
  values (v_no, p_location, p_kind, nullif(trim(p_note), ''), v_at, _bdate(v_at), auth.uid())
  returning id into v_adj;

  for r in
    select (e->>'item_id')::bigint as item_id, coalesce(e->>'condition', 'fresh')::stock_condition as cond,
           (e->>'counted_qty')::numeric as counted, (e->>'qty_delta')::numeric as delta,
           nullif(e->>'reason_code', '') as reason
      from jsonb_array_elements(p_lines) e order by 1, 2
  loop
    if not exists (select 1 from items where id = r.item_id) then raise exception 'Unknown item on the adjustment.'; end if;
    if r.counted is null and r.delta is null then
      raise exception 'Each line needs a counted quantity or a quantity change.'; end if;
    select coalesce((select qty_on_hand from inventory_balances
                      where item_id = r.item_id and location_id = p_location and condition = r.cond), 0) into v_sys;
    v_delta := coalesce(r.delta, r.counted - v_sys);
    if v_sys + v_delta < 0 then
      raise exception 'Only % % at %; the count cannot go below zero.', _fmt_qty(v_sys), (select name from items where id = r.item_id), v_loc.name;
    end if;
    if p_kind = 'damage' and v_delta > 0 then raise exception 'Damage must reduce stock.'; end if;
    v_reason := coalesce(r.reason, case when p_kind = 'damage' then 'DAMAGE' else 'COUNT' end);
    if not exists (select 1 from reason_codes where code = v_reason and category = 'adjustment') then
      raise exception 'Unknown adjustment reason %.', v_reason; end if;

    v_val := 0;
    if v_delta <> 0 then
      select x.value_delta into v_val
        from _post_inventory(r.item_id, p_location, r.cond, v_delta,
               case when p_kind = 'damage' then 'adjust_damage'::txn_type else 'adjust_count'::txn_type end,
               null, 'adjustment', v_adj, null, v_reason, p_at) x;
      if v_val < 0 then v_loss := v_loss - v_val; else v_gain := v_gain + v_val; end if;
      v_n := v_n + 1;
    end if;
    insert into adjustment_lines (adj_id, item_id, condition, system_qty, counted_qty, qty_delta, reason_code, value_delta)
    values (v_adj, r.item_id, r.cond, v_sys, v_sys + v_delta, v_delta, v_reason, v_val);
  end loop;

  v_j := _post_journal(_bdate(v_at), 'adjustment', v_adj, 'Adjustment ' || v_no, jsonb_build_array(
    jsonb_build_object('account', '5300', 'location_id', p_location, 'debit', v_loss, 'credit', 0),
    jsonb_build_object('account', '1200', 'location_id', p_location, 'debit', 0, 'credit', v_loss),
    jsonb_build_object('account', '1200', 'location_id', p_location, 'debit', v_gain, 'credit', 0),
    jsonb_build_object('account', '5300', 'location_id', p_location, 'debit', 0, 'credit', v_gain)));
  update inventory_transactions set journal_entry_id = v_j where ref_type = 'adjustment' and ref_id = v_adj;

  perform _emit_event('inventory.adjusted', 'adjustment', v_adj, p_location, null,
    _actor_name() || ' posted ' || case when p_kind = 'damage' then 'a damage adjustment' else 'a count adjustment' end
      || ' at ' || v_loc.name || ' (' || v_no || ')', p_at);
  perform _emit_inventory_changed(p_location, p_at);
  return v_adj;
end $$;

-- ---------------------------------------------------------------- waste
-- p_lines: [{item_id, condition?, qty, reason_code}]  (reason must be a waste code)
create function log_waste(
  p_location bigint, p_lines jsonb, p_note text default null, p_at timestamptz default null
) returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_at   timestamptz := _now(p_at);
  v_adj  bigint;
  v_no   text;
  v_loc  locations%rowtype;
  r      record;
  v_val  numeric;
  v_total numeric := 0;
  v_qty  numeric := 0;
  v_j    bigint;
begin
  perform _require_role('{cashier,baker}');
  select * into v_loc from locations where id = p_location and is_active;
  if not found then raise exception 'Unknown location.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item to the waste log.'; end if;
  perform _lock_items((select array_agg(distinct (e->>'item_id')::bigint) from jsonb_array_elements(p_lines) e));
  perform _check_stock(p_location, (select jsonb_agg(jsonb_build_object('item_id', (e->>'item_id')::bigint,
            'condition', coalesce(e->>'condition', 'fresh'), 'qty', (e->>'qty')::numeric)) from jsonb_array_elements(p_lines) e));

  v_no := _next_doc_no('ADJ');
  insert into inventory_adjustments (adj_no, location_id, kind, note, posted_at, business_date, created_by)
  values (v_no, p_location, 'waste', nullif(trim(p_note), ''), v_at, _bdate(v_at), auth.uid())
  returning id into v_adj;

  for r in
    select (e->>'item_id')::bigint as item_id, coalesce(e->>'condition', 'fresh')::stock_condition as cond,
           (e->>'qty')::numeric as qty, nullif(e->>'reason_code', '') as reason
      from jsonb_array_elements(p_lines) e order by 1, 2
  loop
    if r.qty is null or r.qty <= 0 then raise exception 'Waste quantity must be more than 0.'; end if;
    if r.reason is null or not exists (select 1 from reason_codes where code = r.reason and category = 'waste') then
      raise exception 'Choose a waste reason (expired, dropped, burnt or overproduced).'; end if;
    select x.value_delta into v_val
      from _post_inventory(r.item_id, p_location, r.cond, -r.qty, 'waste', null, 'adjustment', v_adj, null, r.reason, p_at) x;
    insert into adjustment_lines (adj_id, item_id, condition, system_qty, counted_qty, qty_delta, reason_code, value_delta)
    values (v_adj, r.item_id, r.cond, 0, null, -r.qty, r.reason, v_val);
    v_total := v_total - v_val;
    v_qty := v_qty + r.qty;
  end loop;

  v_j := _post_journal(_bdate(v_at), 'waste', v_adj, 'Waste ' || v_no, jsonb_build_array(
    jsonb_build_object('account', '5100', 'location_id', p_location, 'debit', v_total, 'credit', 0),
    jsonb_build_object('account', '1200', 'location_id', p_location, 'debit', 0, 'credit', v_total)));
  update inventory_transactions set journal_entry_id = v_j where ref_type = 'adjustment' and ref_id = v_adj;

  perform _emit_event('waste.logged', 'adjustment', v_adj, p_location, null,
    _actor_name() || ' logged ' || _fmt_qty(v_qty) || ' wasted at ' || v_loc.name || ' ($' || to_char(v_total, 'FM999,990.00') || ')', p_at);
  perform _emit_inventory_changed(p_location, p_at);
  return v_adj;
end $$;

-- ---------------------------------------------------------------- day close
-- Yesterday's day-old stock becomes EXPIRED waste; today's fresh stock becomes day-old. Idempotent per shop/day.
create function close_business_day(
  p_location bigint, p_date date default null, p_at timestamptz default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_loc    locations%rowtype;
  v_at     timestamptz;
  v_date   date;
  v_existing day_closes%rowtype;
  v_adj    bigint;
  v_no     text;
  r        record;
  v_val    numeric;
  v_exp_q  numeric := 0;
  v_exp_v  numeric := 0;
  v_re_q   numeric := 0;
  v_j      bigint;
  v_dc     bigint;
begin
  perform _require_role('{cashier}');
  select * into v_loc from locations where id = p_location and is_active;
  if not found then raise exception 'Unknown location.'; end if;
  if v_loc.kind <> 'shop' then raise exception 'Day close applies to shops only.'; end if;
  v_at := case when p_at is null and p_date is not null and _is_system() then _ts_on(p_date, '21:30') else _now(p_at) end;
  v_date := coalesce(p_date, _bdate(v_at));
  if v_date > _bdate(case when _is_system() then v_at else now() end) then
    raise exception 'Cannot close a future day.'; end if;

  select * into v_existing from day_closes where location_id = p_location and business_date = v_date;
  if found then
    return jsonb_build_object('day_close_id', v_existing.id, 'already_closed', true, 'business_date', v_date,
      'expired_qty', v_existing.expired_qty, 'expired_value', v_existing.expired_value,
      'reclassified_qty', v_existing.reclassified_qty);
  end if;

  perform _lock_items((select array_agg(distinct b.item_id) from inventory_balances b
                         join items i on i.id = b.item_id and i.item_type = 'finished'
                        where b.location_id = p_location and b.qty_on_hand > 0));

  -- 1) day-old stock expires
  for r in select b.item_id, b.qty_on_hand from inventory_balances b join items i on i.id = b.item_id and i.item_type = 'finished'
            where b.location_id = p_location and b.condition = 'day_old' and b.qty_on_hand > 0 order by b.item_id loop
    if v_adj is null then
      v_no := _next_doc_no('ADJ');
      insert into inventory_adjustments (adj_no, location_id, kind, note, posted_at, business_date, created_by)
      values (v_no, p_location, 'day_close', 'Day close ' || v_date, v_at, v_date, auth.uid()) returning id into v_adj;
    end if;
    select x.value_delta into v_val
      from _post_inventory(r.item_id, p_location, 'day_old', -r.qty_on_hand, 'waste', null, 'adjustment', v_adj, null, 'EXPIRED', v_at, null, 'Expired at day close') x;
    insert into adjustment_lines (adj_id, item_id, condition, system_qty, counted_qty, qty_delta, reason_code, value_delta)
    values (v_adj, r.item_id, 'day_old', r.qty_on_hand, 0, -r.qty_on_hand, 'EXPIRED', v_val);
    v_exp_q := v_exp_q + r.qty_on_hand;
    v_exp_v := v_exp_v - v_val;
  end loop;
  if v_adj is not null then
    v_j := _post_journal(v_date, 'day_close', v_adj, 'Expired day-old stock ' || v_date, jsonb_build_array(
      jsonb_build_object('account', '5100', 'location_id', p_location, 'debit', v_exp_v, 'credit', 0),
      jsonb_build_object('account', '1200', 'location_id', p_location, 'debit', 0, 'credit', v_exp_v)));
    update inventory_transactions set journal_entry_id = v_j where ref_type = 'adjustment' and ref_id = v_adj;
  end if;

  -- 2) fresh stock becomes day-old (cost neutral)
  for r in select b.item_id, b.qty_on_hand from inventory_balances b join items i on i.id = b.item_id and i.item_type = 'finished'
            where b.location_id = p_location and b.condition = 'fresh' and b.qty_on_hand > 0 order by b.item_id loop
    perform _move_inventory(r.item_id, p_location, 'fresh', p_location, 'day_old', r.qty_on_hand,
                            'dayold_out', 'dayold_in', 'day_close', null, null, v_at);
    v_re_q := v_re_q + r.qty_on_hand;
  end loop;

  insert into day_closes (location_id, business_date, closed_at, closed_by, expired_qty, expired_value, reclassified_qty, adj_id)
  values (p_location, v_date, v_at, auth.uid(), v_exp_q, v_exp_v, v_re_q, v_adj)
  returning id into v_dc;

  perform _emit_event('day.closed', 'day_close', v_dc, p_location, null,
    v_loc.name || ' closed ' || to_char(v_date, 'Mon FMDD') || ': ' || _fmt_qty(v_exp_q) || ' expired, '
      || _fmt_qty(v_re_q) || ' moved to day-old', p_at);
  perform _emit_inventory_changed(p_location, p_at);
  return jsonb_build_object('day_close_id', v_dc, 'already_closed', false, 'business_date', v_date,
    'expired_qty', v_exp_q, 'expired_value', v_exp_v, 'reclassified_qty', v_re_q);
end $$;

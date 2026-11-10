-- 0010: production orders, demand forecast, bake plans.

-- ---------------------------------------------------------------- production
create function _create_mo(
  p_item bigint, p_qty numeric, p_due date, p_location bigint, p_bake_plan bigint, p_at timestamptz
) returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_loc bigint := p_location;
  v_id  bigint;
  v_no  text;
begin
  if v_loc is null then select id into v_loc from locations where kind = 'kitchen' and is_active order by id limit 1; end if;
  if v_loc is null or not exists (select 1 from locations where id = v_loc and kind = 'kitchen') then
    raise exception 'Production runs at the kitchen.'; end if;
  if not exists (select 1 from items where id = p_item and is_manufactured and is_active) then
    raise exception 'This item is not made in-house.'; end if;
  if not exists (select 1 from bom_lines where parent_item_id = p_item) then
    raise exception 'Add a recipe (BOM) for this item before scheduling production.'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Planned quantity must be more than 0.'; end if;
  if p_due is null then raise exception 'Choose a due date.'; end if;
  v_no := _next_doc_no('MO');
  insert into production_orders (mo_number, item_id, location_id, qty_planned, due_date, bake_plan_id, created_at, created_by)
  values (v_no, p_item, v_loc, p_qty, p_due, p_bake_plan, _now(p_at), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function create_production_order(
  p_item bigint, p_qty_planned numeric, p_due_date date, p_location_id bigint default null,
  p_bake_plan_id bigint default null, p_at timestamptz default null
) returns bigint
language plpgsql security definer
set search_path = public
as $$
declare v_id bigint; v_no text; v_name text;
begin
  perform _require_role('{baker}');
  v_id := _create_mo(p_item, p_qty_planned, p_due_date, p_location_id, p_bake_plan_id, p_at);
  select mo_number into v_no from production_orders where id = v_id;
  select name into v_name from items where id = p_item;
  perform _emit_event('mo.created', 'production_order', v_id, (select location_id from production_orders where id = v_id), null,
    v_no || ' scheduled: ' || _fmt_qty(p_qty_planned) || ' ' || v_name, p_at);
  return v_id;
end $$;

create function cancel_production_order(p_mo_id bigint, p_at timestamptz default null) returns void
language plpgsql security definer
set search_path = public
as $$
declare mo production_orders%rowtype;
begin
  perform _require_role('{baker}');
  select * into mo from production_orders where id = p_mo_id for update;
  if not found then raise exception 'Production order not found.'; end if;
  if mo.status <> 'planned' then raise exception '% is % and cannot be cancelled.', mo.mo_number, mo.status; end if;
  update production_orders set status = 'cancelled' where id = p_mo_id;
  perform _emit_event('mo.cancelled', 'production_order', p_mo_id, mo.location_id, null, mo.mo_number || ' cancelled', p_at);
end $$;

create function start_production_order(p_mo_id bigint, p_qty_started numeric default null, p_at timestamptz default null) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  mo      production_orders%rowtype;
  v_at    timestamptz := _now(p_at);
  v_qty   numeric;
  v_need  jsonb;
  r       record;
  v_val   numeric;
  v_total numeric := 0;
  v_j     bigint;
  v_name  text;
begin
  perform _require_role('{baker}');
  select * into mo from production_orders where id = p_mo_id for update;
  if not found then raise exception 'Production order not found.'; end if;
  if mo.status <> 'planned' then raise exception '% is % and cannot be started.', mo.mo_number, mo.status; end if;
  v_qty := coalesce(p_qty_started, mo.qty_planned);
  if v_qty <= 0 then raise exception 'Started quantity must be more than 0.'; end if;
  select name into v_name from items where id = mo.item_id;

  perform _lock_items((select array_agg(distinct component_item_id) from bom_lines where parent_item_id = mo.item_id));
  select jsonb_agg(jsonb_build_object('item_id', component_item_id, 'condition', 'fresh', 'qty', round(v_qty * qty_per, 3)))
    into v_need from bom_lines where parent_item_id = mo.item_id and round(v_qty * qty_per, 3) > 0;
  perform _check_stock(mo.location_id, v_need);

  for r in select component_item_id, round(v_qty * qty_per, 3) as q from bom_lines
            where parent_item_id = mo.item_id and round(v_qty * qty_per, 3) > 0 order by component_item_id loop
    select x.value_delta into v_val
      from _post_inventory(r.component_item_id, mo.location_id, 'fresh', -r.q, 'prod_issue', null,
                           'production_order', mo.id, null, null, p_at) x;
    v_total := v_total - v_val;
  end loop;

  v_j := _post_journal(_bdate(v_at), 'production_start', mo.id, 'Issue to ' || mo.mo_number, jsonb_build_array(
    jsonb_build_object('account', '1300', 'location_id', mo.location_id, 'debit', v_total, 'credit', 0),
    jsonb_build_object('account', '1200', 'location_id', mo.location_id, 'debit', 0, 'credit', v_total)));
  update inventory_transactions set journal_entry_id = v_j where ref_type = 'production_order' and ref_id = mo.id and txn_type = 'prod_issue';
  update production_orders set status = 'in_progress', qty_started = v_qty, started_at = v_at, issued_value = v_total
   where id = p_mo_id;
  perform _emit_event('mo.started', 'production_order', p_mo_id, mo.location_id, null,
    _actor_name() || ' started ' || mo.mo_number || ': ' || _fmt_qty(v_qty) || ' ' || v_name, p_at);
  perform _emit_inventory_changed(mo.location_id, p_at);
  return jsonb_build_object('mo_id', p_mo_id, 'qty_started', v_qty, 'issued_value', v_total);
end $$;

-- p_defects: [{kind scrap|rework, qty, reason_code}]. Scrap qty must equal started - good; rework is counted within good.
create function complete_production_order(
  p_mo_id bigint, p_qty_good numeric, p_defects jsonb default '[]', p_at timestamptz default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  mo       production_orders%rowtype;
  v_at     timestamptz := _now(p_at);
  v_scrap  numeric;
  v_rework numeric;
  v_good_val numeric;
  v_scrap_val numeric;
  v_unit   numeric;
  v_j      bigint;
  v_name   text;
  d        record;
begin
  perform _require_role('{baker}');
  select * into mo from production_orders where id = p_mo_id for update;
  if not found then raise exception 'Production order not found.'; end if;
  if mo.status <> 'in_progress' then raise exception '% is % and cannot be completed.', mo.mo_number, mo.status; end if;
  if p_qty_good is null or p_qty_good < 0 or p_qty_good > mo.qty_started then
    raise exception 'Good quantity must be between 0 and % (the quantity started).', _fmt_qty(mo.qty_started); end if;
  p_defects := coalesce(p_defects, '[]');
  v_scrap := mo.qty_started - p_qty_good;
  for d in select e->>'kind' as kind, (e->>'qty')::numeric as qty, e->>'reason_code' as reason from jsonb_array_elements(p_defects) e loop
    if d.kind not in ('scrap', 'rework') then raise exception 'Defect kind must be scrap or rework.'; end if;
    if d.qty is null or d.qty <= 0 then raise exception 'Defect quantity must be more than 0.'; end if;
    if d.reason is null or not exists (select 1 from reason_codes where code = d.reason and category in ('scrap', 'rework')) then
      raise exception 'Choose a defect reason (underproof, misshapen, fill leak or glaze defect).'; end if;
  end loop;
  if coalesce((select sum((e->>'qty')::numeric) from jsonb_array_elements(p_defects) e where e->>'kind' = 'scrap'), 0) <> v_scrap then
    raise exception 'Scrap reasons add up to % but % units were scrapped (started % minus good %).',
      _fmt_qty(coalesce((select sum((e->>'qty')::numeric) from jsonb_array_elements(p_defects) e where e->>'kind' = 'scrap'), 0)),
      _fmt_qty(v_scrap), _fmt_qty(mo.qty_started), _fmt_qty(p_qty_good); end if;
  v_rework := coalesce((select sum((e->>'qty')::numeric) from jsonb_array_elements(p_defects) e where e->>'kind' = 'rework'), 0);
  if v_rework > p_qty_good then raise exception 'Reworked units (%) cannot exceed good units (%).', _fmt_qty(v_rework), _fmt_qty(p_qty_good); end if;

  perform _lock_items(array[mo.item_id]);
  v_good_val  := round(p_qty_good * mo.issued_value / mo.qty_started, 2);
  v_scrap_val := mo.issued_value - v_good_val;
  v_unit      := round(mo.issued_value / mo.qty_started, 4);
  if p_qty_good > 0 then
    perform _post_inventory(mo.item_id, mo.location_id, 'fresh', p_qty_good, 'prod_receipt', null,
                            'production_order', mo.id, null, null, p_at, v_good_val);
  end if;
  insert into production_defects (mo_id, kind, qty, reason_code)
  select p_mo_id, e->>'kind', (e->>'qty')::numeric, e->>'reason_code' from jsonb_array_elements(p_defects) e;

  v_j := _post_journal(_bdate(v_at), 'production_finish', mo.id, 'Finish ' || mo.mo_number, jsonb_build_array(
    jsonb_build_object('account', '1200', 'location_id', mo.location_id, 'debit', v_good_val, 'credit', 0),
    jsonb_build_object('account', '5200', 'location_id', mo.location_id, 'debit', v_scrap_val, 'credit', 0),
    jsonb_build_object('account', '1300', 'location_id', mo.location_id, 'debit', 0, 'credit', mo.issued_value)));
  update inventory_transactions set journal_entry_id = v_j where ref_type = 'production_order' and ref_id = mo.id and txn_type = 'prod_receipt';
  update production_orders set status = 'completed', finished_at = greatest(v_at, coalesce(mo.started_at, v_at)),
         qty_good = p_qty_good, qty_scrapped = v_scrap, qty_reworked = v_rework, unit_cost = v_unit
   where id = p_mo_id;
  select name into v_name from items where id = mo.item_id;
  perform _emit_event('mo.completed', 'production_order', p_mo_id, mo.location_id, null,
    _actor_name() || ' completed ' || mo.mo_number || ': ' || _fmt_qty(p_qty_good) || ' good ' || v_name
      || case when v_scrap > 0 then ', ' || _fmt_qty(v_scrap) || ' scrapped' else '' end, p_at);
  perform _emit_inventory_changed(mo.location_id, p_at);
  return jsonb_build_object('mo_id', p_mo_id, 'qty_good', p_qty_good, 'qty_scrapped', v_scrap, 'qty_reworked', v_rework,
    'unit_cost', v_unit, 'good_value', v_good_val, 'scrap_value', v_scrap_val);
end $$;

-- ---------------------------------------------------------------- forecast
create function _in_season(p_start text, p_end text, p_date date) returns boolean
language sql immutable
set search_path = public
as $$
  select case when p_start is null or p_end is null then true
              when p_start <= p_end then to_char(p_date, 'MM-DD') between p_start and p_end
              else to_char(p_date, 'MM-DD') >= p_start or to_char(p_date, 'MM-DD') <= p_end end
$$;

-- Most recent season start on or before p_date (for launch ramps).
create function _season_start(p_start text, p_date date) returns date
language sql immutable
set search_path = public
as $$
  select case when p_start is null then null
         else case when make_date(extract(year from p_date)::int, substr(p_start, 1, 2)::int, substr(p_start, 4, 2)::int) <= p_date
                    then make_date(extract(year from p_date)::int, substr(p_start, 1, 2)::int, substr(p_start, 4, 2)::int)
                    else make_date(extract(year from p_date)::int - 1, substr(p_start, 1, 2)::int, substr(p_start, 4, 2)::int) end end
$$;

-- Forecast = base x weekday index x trend x season x promo, per shop and finished item.
--   weekday index: 12 weeks of history, avg qty on that weekday / avg qty on all open days
--   base: trailing 28 days of (promo-adjusted) sales divided by the sum of their weekday indexes
--   trend: weekly regression slope over 8 weeks, as a % of the mean, capped at +/-3% per week
--   season: 0 outside the item's window, launch ramp over the first 14 days
-- Uses only sales with business_date < p_as_of, so past runs are honest backtests.
create function generate_forecast(
  p_as_of date default null, p_start date default null, p_days int default 14, p_at timestamptz default null
) returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_as_of date := coalesce(p_as_of, _bdate(_now(p_at)));
  v_start date := coalesce(p_start, coalesce(p_as_of, _bdate(_now(p_at))));
  v_run   bigint;
begin
  perform _require_role('{baker}');
  if p_days < 1 or p_days > 60 then raise exception 'Forecast horizon must be 1 to 60 days.'; end if;
  insert into forecast_runs (as_of, created_at, created_by) values (v_as_of, _now(p_at), auth.uid())
  returning id into v_run;

  insert into demand_forecasts (run_id, item_id, location_id, forecast_date, qty, base, weekday_idx, trend_factor, season_factor, promo_lift)
  with combos as (
    select i.id as item_id, i.season_start_md, i.season_end_md, l.id as location_id, l.closed_weekdays
      from items i cross join locations l
     where i.item_type = 'finished' and i.is_sellable and i.is_active and l.kind = 'shop' and l.is_active
  ), loc_start as (
    select location_id, min(business_date) as first_day from sales where business_date < v_as_of group by 1
  ), actual as (
    select sa.location_id, sl.item_id, sa.business_date, sum(sl.qty) as qty
      from sales sa join sale_lines sl on sl.sale_id = sa.id
     where sa.business_date >= v_as_of - 84 and sa.business_date < v_as_of
     group by 1, 2, 3
  ), hist as (
    select c.item_id, c.location_id, dd.d, extract(dow from dd.d)::int as dow,
           coalesce(a.qty, 0) / pr.lift as qty
      from combos c
      join loc_start ls on ls.location_id = c.location_id
      cross join lateral generate_series(greatest(v_as_of - 84, ls.first_day), v_as_of - 1, interval '1 day') g(d0)
      cross join lateral (select g.d0::date as d) dd
      left join actual a on a.item_id = c.item_id and a.location_id = c.location_id and a.business_date = dd.d
      cross join lateral (
        select coalesce(max(p.expected_lift), 1) as lift_raw from promotions p
         where dd.d between p.starts_on and p.ends_on
           and (p.location_id is null or p.location_id = c.location_id)
           and (p.item_id is null or p.item_id = c.item_id)) pl
      cross join lateral (select greatest(pl.lift_raw, 0.01) as lift) pr
     where not (extract(dow from dd.d)::int = any (c.closed_weekdays))
       and _in_season(c.season_start_md, c.season_end_md, dd.d)
  ), idx as (
    select h.item_id, h.location_id, h.dow,
           case when tot.avg_q > 0 then avg(h.qty) / tot.avg_q else 1 end as w_idx
      from hist h
      join (select item_id, location_id, avg(qty) as avg_q from hist group by 1, 2) tot using (item_id, location_id)
     group by h.item_id, h.location_id, h.dow, tot.avg_q
  ), hx as (
    select h.*, coalesce(ix.w_idx, 1) as w_idx
      from hist h left join idx ix on ix.item_id = h.item_id and ix.location_id = h.location_id and ix.dow = h.dow
  ), base_calc as (
    select item_id, location_id,
           case when sum(w_idx) > 0 then sum(qty) / sum(w_idx) else 0 end as base,
           count(*) as n
      from hx where d >= v_as_of - 28 group by 1, 2
  ), blocks as (
    select item_id, location_id, (v_as_of - 1 - d) / 7 as k,
           case when sum(w_idx) > 0 then sum(qty) / sum(w_idx) else 0 end as lvl
      from hx where d >= v_as_of - 56 group by 1, 2, 3
  ), trend as (
    select item_id, location_id,
           case when avg(lvl) > 0 and count(*) >= 3
                then greatest(-0.03, least(0.03, (coalesce(regr_slope(lvl, (8 - k)::numeric), 0))::numeric / avg(lvl))) else 0 end as g
      from blocks group by 1, 2
  ), loc_avg as (
    select b.location_id, avg(b.base) as avg_base
      from base_calc b join combos c on c.item_id = b.item_id and c.location_id = b.location_id
     where c.season_start_md is null group by 1
  ), fdays as (
    select g::date as fd from generate_series(v_start, v_start + p_days - 1, interval '1 day') g
  ), grid as (
    select c.item_id, c.location_id, f.fd, extract(dow from f.fd)::int as dow,
           c.season_start_md, c.season_end_md,
           coalesce(bc.base, 0.5 * coalesce(la.avg_base, 0)) as base,
           coalesce(t.g, 0) as g
      from combos c cross join fdays f
      left join base_calc bc on bc.item_id = c.item_id and bc.location_id = c.location_id
      left join trend t on t.item_id = c.item_id and t.location_id = c.location_id
      left join loc_avg la on la.location_id = c.location_id
     where not (extract(dow from f.fd)::int = any (c.closed_weekdays))
       and _in_season(c.season_start_md, c.season_end_md, f.fd)
  )
  select v_run, g.item_id, g.location_id, g.fd,
         round(greatest(0, g.base * coalesce(ix.w_idx, 1) * tf.v * sf.v * pf.v), 3),
         round(g.base, 3), round(coalesce(ix.w_idx, 1), 4), round(tf.v, 4), round(sf.v, 4), round(pf.v, 4)
    from grid g
    left join idx ix on ix.item_id = g.item_id and ix.location_id = g.location_id and ix.dow = g.dow
    cross join lateral (select greatest(0.5, 1 + g.g * ((g.fd - (v_as_of - 14))::numeric / 7)) as v) tf
    cross join lateral (select case when g.season_start_md is null then 1::numeric
                                    else least(1, 0.6 + 0.4 * (g.fd - _season_start(g.season_start_md, g.fd))::numeric / 14) end as v) sf
    cross join lateral (select coalesce((select max(p.expected_lift) from promotions p
                                          where g.fd between p.starts_on and p.ends_on
                                            and (p.location_id is null or p.location_id = g.location_id)
                                            and (p.item_id is null or p.item_id = g.item_id)), 1) as v) pf;

  if p_at is null then
    perform _emit_event('forecast.generated', 'forecast_run', v_run, null, null,
      'Forecast refreshed for ' || to_char(v_start, 'Mon FMDD') || ' (' || p_days || ' days)', p_at);
  end if;
  return v_run;
end $$;

-- ---------------------------------------------------------------- bake plans
create function build_bake_plan(p_plan_date date, p_buffer_pct numeric default null, p_at timestamptz default null) returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_today  date := _bdate(_now(p_at));
  v_buffer numeric;
  v_plan   bigint;
  v_run    bigint;
  pl       bake_plans%rowtype;
begin
  perform _require_role('{baker}');
  if p_plan_date is null then raise exception 'Choose a plan date.'; end if;
  if p_plan_date < v_today and not _is_system() then raise exception 'Bake plans cannot be built for past days.'; end if;
  select coalesce(p_buffer_pct, bake_buffer_pct) into v_buffer from app_settings where id = 1;

  select * into pl from bake_plans where plan_date = p_plan_date for update;
  if found and pl.status = 'released' then
    raise exception 'The bake plan for % is already released.', to_char(p_plan_date, 'Mon FMDD'); end if;

  -- newest forecast for that date; make a fresh one when today's run does not cover it
  select fr.id into v_run from demand_forecasts df join forecast_runs fr on fr.id = df.run_id
   where df.forecast_date = p_plan_date and fr.as_of = v_today order by fr.id desc limit 1;
  if v_run is null then
    v_run := generate_forecast(v_today, p_plan_date, 14, p_at);
  end if;

  if pl.id is null then
    insert into bake_plans (plan_no, plan_date, buffer_pct, forecast_run_id, created_at, created_by)
    values (_next_doc_no('BAKE'), p_plan_date, v_buffer, v_run, _now(p_at), auth.uid()) returning id into v_plan;
  else
    v_plan := pl.id;
    delete from bake_plan_lines where plan_id = v_plan;
    update bake_plans set buffer_pct = v_buffer, forecast_run_id = v_run where id = v_plan;
  end if;

  insert into bake_plan_lines (plan_id, item_id, location_id, forecast_qty, so_qty, planned_qty)
  select v_plan, x.item_id, x.location_id, x.f, x.s, ceil((x.f * (1 + v_buffer) + x.s) / 12) * 12
    from (
      select coalesce(f.item_id, s.item_id) as item_id, coalesce(f.location_id, s.location_id) as location_id,
             coalesce(f.qty, 0) as f, coalesce(s.qty, 0) as s
        from (select item_id, location_id, qty from demand_forecasts where run_id = v_run and forecast_date = p_plan_date) f
        full join (select sl.item_id, so.location_id, sum(sl.qty - sl.qty_fulfilled) as qty
                     from sales_orders so join so_lines sl on sl.so_id = so.id
                     join items i on i.id = sl.item_id and i.item_type = 'finished'
                    where so.status = 'placed' and (so.requested_for at time zone 'America/Denver')::date = p_plan_date
                    group by 1, 2) s using (item_id, location_id)
    ) x
   where x.f > 0 or x.s > 0;

  perform _emit_event('forecast.bakeplan_built', 'bake_plan', v_plan, null, null,
    'Bake plan for ' || to_char(p_plan_date, 'Mon FMDD') || ' drafted', p_at);
  return v_plan;
end $$;

create function update_bake_plan_line(
  p_plan_id bigint, p_item_id bigint, p_location_id bigint, p_override_qty numeric
) returns void
language plpgsql security definer
set search_path = public
as $$
declare pl bake_plans%rowtype;
begin
  perform _require_role('{baker}');
  select * into pl from bake_plans where id = p_plan_id for update;
  if not found then raise exception 'Bake plan not found.'; end if;
  if pl.status <> 'draft' then raise exception 'The bake plan is already released.'; end if;
  if p_override_qty is not null and p_override_qty < 0 then raise exception 'Quantity cannot be negative.'; end if;
  update bake_plan_lines set override_qty = p_override_qty
   where plan_id = p_plan_id and item_id = p_item_id and location_id = p_location_id;
  if not found then raise exception 'That item and shop are not on this bake plan.'; end if;
end $$;

-- One click: a production order per item at the kitchen plus a planned transfer kitchen -> each shop.
create function release_bake_plan(p_plan_id bigint, p_at timestamptz default null) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  pl      bake_plans%rowtype;
  v_k     bigint;
  r       record;
  v_mos   bigint[] := '{}';
  v_trfs  bigint[] := '{}';
begin
  perform _require_role('{baker}');
  select * into pl from bake_plans where id = p_plan_id for update;
  if not found then raise exception 'Bake plan not found.'; end if;
  if pl.status <> 'draft' then raise exception '% is already released.', pl.plan_no; end if;
  select id into v_k from locations where kind = 'kitchen' and is_active order by id limit 1;
  if v_k is null then raise exception 'Add a kitchen location first.'; end if;

  for r in select item_id, sum(final_qty) as qty from bake_plan_lines where plan_id = p_plan_id and final_qty > 0 group by 1 order by 1 loop
    v_mos := v_mos || _create_mo(r.item_id, r.qty, pl.plan_date, v_k, p_plan_id, p_at);
  end loop;
  for r in select location_id,
                  jsonb_agg(jsonb_build_object('item_id', item_id, 'qty', final_qty) order by item_id) as lines
             from bake_plan_lines where plan_id = p_plan_id and final_qty > 0 group by 1 order by 1 loop
    v_trfs := v_trfs || _create_transfer(v_k, r.location_id, r.lines, p_plan_id, p_at);
  end loop;
  update bake_plans set status = 'released', released_at = _now(p_at) where id = p_plan_id;
  perform _emit_event('bakeplan.released', 'bake_plan', p_plan_id, null, null,
    pl.plan_no || ' released: ' || coalesce(array_length(v_mos, 1), 0) || ' production orders, '
      || coalesce(array_length(v_trfs, 1), 0) || ' transfers', p_at);
  return jsonb_build_object('plan_id', p_plan_id, 'mo_ids', to_jsonb(v_mos), 'transfer_ids', to_jsonb(v_trfs));
end $$;

-- Demo helper ("Start day"): release the plan if needed, run every planned production order at p_yield,
-- then complete the planned transfers. Stops with a clear message if ingredients are short.
create function start_bake_day(p_plan_id bigint, p_yield numeric default 0.96, p_at timestamptz default null) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  pl     bake_plans%rowtype;
  r      record;
  v_good numeric;
  v_done int := 0;
  v_t    int := 0;
begin
  perform _require_role('{baker}');
  select * into pl from bake_plans where id = p_plan_id;
  if not found then raise exception 'Bake plan not found.'; end if;
  if pl.status = 'draft' then perform release_bake_plan(p_plan_id, p_at); end if;
  for r in select id, qty_planned from production_orders where bake_plan_id = p_plan_id and status = 'planned' order by id loop
    perform start_production_order(r.id, null, p_at);
    v_good := floor(r.qty_planned * p_yield);
    perform complete_production_order(r.id, v_good,
      case when r.qty_planned - v_good > 0
           then jsonb_build_array(jsonb_build_object('kind', 'scrap', 'qty', r.qty_planned - v_good, 'reason_code', 'MISSHAPEN'))
           else '[]'::jsonb end, p_at);
    v_done := v_done + 1;
  end loop;
  for r in select id, from_location_id from transfers where bake_plan_id = p_plan_id and status = 'planned' order by id loop
    -- ship what the kitchen actually has (yield loss means less than planned)
    delete from transfer_lines tl where tl.transfer_id = r.id and coalesce((select b.qty_on_hand from inventory_balances b
             where b.item_id = tl.item_id and b.location_id = r.from_location_id and b.condition = tl.condition), 0) <= 0;
    update transfer_lines tl set qty = least(tl.qty, (select b.qty_on_hand from inventory_balances b
             where b.item_id = tl.item_id and b.location_id = r.from_location_id and b.condition = tl.condition))
     where tl.transfer_id = r.id;
    continue when not exists (select 1 from transfer_lines where transfer_id = r.id);
    perform _complete_transfer(r.id, p_at);
    v_t := v_t + 1;
  end loop;
  return jsonb_build_object('plan_id', p_plan_id, 'orders_completed', v_done, 'transfers_completed', v_t);
end $$;

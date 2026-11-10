-- 0010: planning views: usage, reorder analysis (SS / ROP / EOQ), periodic review, supplier scorecard, MRP.

-- Daily usage over the settings window ending yesterday. Zero-filled. Includes BOM explosion:
-- usage of a component = its direct net sales + sum(parent qty sold x qty_per) over every parent that contains it.
create view v_item_daily_usage with (security_invoker = true) as
with w as (select usage_window_days as n from app_settings where id = 1),
days as (
  select g::date as usage_date from w, generate_series(_today() - w.n, _today() - 1, interval '1 day') g
), direct as (
  select item_id, d, sum(q) as q from (
    select sl.item_id, sa.business_date as d, sl.qty as q
      from sale_lines sl join sales sa on sa.id = sl.sale_id, w
     where sa.business_date >= _today() - w.n and sa.business_date < _today()
    union all
    select rl.item_id, r.business_date, -rl.qty
      from return_lines rl join returns r on r.id = rl.return_id, w
     where rl.disposition = 'restock' and r.business_date >= _today() - w.n and r.business_date < _today()
  ) u group by 1, 2
), exploded as (
  select b.component_item_id as item_id, dr.d, sum(dr.q * b.qty_per) as q
    from direct dr join bom_lines b on b.parent_item_id = dr.item_id group by 1, 2
), combined as (
  select item_id, d, q from direct union all select item_id, d, q from exploded
)
select i.id as item_id, dd.usage_date, coalesce(sum(c.q), 0)::numeric(14,3) as qty
  from items i
  cross join days dd
  left join combined c on c.item_id = i.id and c.d = dd.usage_date
 where i.is_active
 group by i.id, dd.usage_date;

-- Company-wide reorder analysis for purchasable items.
--   SS  = z * sqrt(L * sd_d^2 + dbar^2 * sd_L^2)  (or items.safety_stock_override)
--   ROP = dbar * L + SS
--   EOQ = sqrt(2 * D * S / (H * avg_cost)), D = 365 * dbar, rounded up to the pack size
--   IP  = on hand + on order - backordered; order when IP <= ROP for ceil_pack(ROP + EOQ - IP)
create view v_reorder_analysis with (security_invoker = true) as
with st as (select * from app_settings where id = 1),
usage as (
  select item_id, avg(qty) as dbar, coalesce(stddev_samp(qty), 0) as sd_d from v_item_daily_usage group by 1
), lead as (
  select pl.item_id, avg(fr.first_rcpt - po.sent_on)::numeric as actual_lead,
         coalesce(stddev_samp((fr.first_rcpt - po.sent_on)::numeric), 0) as sd_l, count(*) as n
    from po_lines pl
    join purchase_orders po on po.id = pl.po_id and po.status in ('received', 'closed')
    join (select po_id, min(received_on) as first_rcpt from po_receipts group by 1) fr on fr.po_id = po.id
   where po.sent_on >= _today() - 180
   group by 1
), stock as (
  select item_id, sum(qty_on_hand) as on_hand from inventory_balances group by 1
), pipeline as (
  select pl.item_id, sum(pl.qty_ordered - pl.qty_received - pl.qty_cancelled) as on_order
    from po_lines pl join purchase_orders po on po.id = pl.po_id and po.status = 'sent'
   group by 1
), backord as (
  select item_id, sum(backordered) as backordered from v_item_availability group by 1
), core as (
  select i.id as item_id, i.sku, i.name, i.category, i.uom, i.reorder_point as rop_stored, i.safety_stock_override,
         i.preferred_supplier_id as supplier_id, sp.name as supplier_name,
         coalesce(ps.pack_size, i.pack_size) as pack_size,
         coalesce(c.avg_cost, ps.unit_cost, 0) as unit_cost,
         i.lead_time_days as quoted_lead, ld.actual_lead, coalesce(ld.sd_l, 0) as sd_l,
         case when st.use_actual_lead_time and ld.actual_lead is not null then ld.actual_lead else i.lead_time_days end as lead,
         coalesce(u.dbar, 0) as dbar, coalesce(u.sd_d, 0) as sd_d,
         coalesce(s.on_hand, 0) as on_hand, coalesce(p.on_order, 0) as on_order, coalesce(b.backordered, 0) as backordered,
         st.service_level_z as z, st.ordering_cost_per_po as s_cost, st.holding_cost_rate_annual as h_rate
    from items i
    cross join st
    left join suppliers sp on sp.id = i.preferred_supplier_id
    left join item_suppliers ps on ps.item_id = i.id and ps.supplier_id = i.preferred_supplier_id
    left join item_costs c on c.item_id = i.id
    left join usage u on u.item_id = i.id
    left join lead ld on ld.item_id = i.id
    left join stock s on s.item_id = i.id
    left join pipeline p on p.item_id = i.id
    left join backord b on b.item_id = i.id
   where i.is_purchasable and i.is_active
), calc as (
  select core.*,
         core.z * sqrt(core.lead * power(core.sd_d, 2) + power(core.dbar, 2) * power(core.sd_l, 2)) as ss_calc,
         365 * core.dbar as annual_demand,
         core.on_hand + core.on_order - core.backordered as ip
    from core
), calc2 as (
  select calc.*,
         coalesce(calc.safety_stock_override, calc.ss_calc) as safety_stock,
         calc.dbar * calc.lead + coalesce(calc.safety_stock_override, calc.ss_calc) as rop_calc,
         case when calc.annual_demand > 0 and calc.unit_cost > 0
              then sqrt(2 * calc.annual_demand * calc.s_cost / (calc.h_rate * calc.unit_cost)) end as eoq_raw
    from calc
), calc3 as (
  select calc2.*,
         case when calc2.eoq_raw is not null then ceil(calc2.eoq_raw / calc2.pack_size) * calc2.pack_size end as eoq
    from calc2
)
select item_id, sku, name, category, uom, supplier_id, supplier_name, pack_size, unit_cost,
       quoted_lead as quoted_lead_days, round(actual_lead, 2) as actual_lead_days, round(sd_l, 3) as sigma_lead_days,
       round(lead, 2) as lead_time_days,
       round(dbar, 4) as avg_daily_usage, round(sd_d, 4) as sigma_daily_usage,
       round(safety_stock, 3) as safety_stock, round(rop_calc, 3) as rop_calc, rop_stored,
       round(annual_demand, 2) as annual_demand, s_cost as ordering_cost, h_rate as holding_cost_rate,
       round(eoq, 3) as eoq,
       on_hand, on_order, backordered, round(ip, 3) as inventory_position,
       (ip <= rop_calc and (dbar > 0 or rop_calc > 0)) as below_rop,
       case when ip <= rop_calc and eoq is not null
            then ceil(greatest(rop_calc + eoq - ip, 0) / pack_size) * pack_size else 0 end as suggested_qty,
       case when dbar > 0 then round(greatest(ip, 0) / dbar, 1) end as days_of_cover,
       case when dbar > 0 then _today() + (greatest(ip, 0) / dbar)::int end as stockout_date,
       case when dbar > 0 then _today() + (greatest(ip, 0) / dbar)::int - ceil(lead)::int end as order_by_date,
       case when dbar = 0 then 'ok'
            when _today() + (greatest(ip, 0) / dbar)::int - ceil(lead)::int < _today() then 'late'
            when ip <= rop_calc then 'order_now'
            else 'ok' end as urgency
  from calc3;

-- Periodic review (every R days): order up to S = dbar*(L+R) + z*sd*sqrt(L+R).
create view v_periodic_review with (security_invoker = true) as
select a.item_id, a.sku, a.name, a.category, a.uom, a.supplier_id, a.supplier_name, a.pack_size, a.unit_cost,
       st.review_period_days as review_period_days, a.lead_time_days, a.avg_daily_usage, a.sigma_daily_usage,
       round(a.avg_daily_usage * (a.lead_time_days + st.review_period_days)
             + st.service_level_z * a.sigma_daily_usage * sqrt(a.lead_time_days + st.review_period_days), 3) as order_up_to_level,
       a.inventory_position,
       ceil(greatest(0, a.avg_daily_usage * (a.lead_time_days + st.review_period_days)
             + st.service_level_z * a.sigma_daily_usage * sqrt(a.lead_time_days + st.review_period_days) - a.inventory_position)
            / a.pack_size) * a.pack_size as order_qty,
       a.urgency
  from v_reorder_analysis a cross join (select * from app_settings where id = 1) st;

-- Supplier scorecard from POs sent in the last 180 days that are received or closed.
create view v_supplier_scorecard with (security_invoker = true) as
with st as (select * from app_settings where id = 1),
pos as (
  select po.id, po.supplier_id, po.sent_on, po.expected_on, po.quoted_lead_days,
         (select min(r.received_on) from po_receipts r where r.po_id = po.id) as first_rcpt,
         (select max(r.received_on) from po_receipts r where r.po_id = po.id) as last_rcpt,
         (select sum(l.qty_ordered) from po_lines l where l.po_id = po.id) as ordered,
         (select sum(l.qty_received) from po_lines l where l.po_id = po.id) as received
    from purchase_orders po
   where po.status in ('received', 'closed') and po.sent_on >= _today() - 180
), agg as (
  select supplier_id, count(*) as po_count,
         (count(*) filter (where last_rcpt is not null and last_rcpt <= expected_on))::numeric / count(*) as on_time_rate,
         avg(first_rcpt - sent_on) filter (where first_rcpt is not null) as avg_actual_lead,
         avg(quoted_lead_days) as avg_quoted_lead,
         sum(received) / nullif(sum(ordered), 0) as fill_rate
    from pos group by 1
), bills as (
  select b.supplier_id,
         coalesce(sum(b.amount - b.amount_paid) filter (where b.status = 'open'), 0) as amount_owed,
         min(b.due_date) filter (where b.status = 'open') as next_due_date,
         coalesce(sum(b.amount - b.amount_paid) filter (where b.status = 'open' and b.due_date < _today()), 0) as overdue_amount,
         (count(*) filter (where b.status = 'paid' and (select max(p.paid_on) from ap_payments p where p.bill_id = b.id) <= b.due_date))::numeric
           / nullif(count(*) filter (where b.status = 'paid'), 0) as pct_paid_on_time
    from ap_bills b group by 1
), scored as (
  select s.id as supplier_id, s.code, s.name, s.terms_label, s.quoted_lead_time_days,
         a.po_count, a.on_time_rate, a.avg_actual_lead, a.avg_quoted_lead, a.fill_rate,
         case when a.po_count is null then null
              when coalesce(a.avg_quoted_lead, 0) <= 0 then case when coalesce(a.avg_actual_lead, 0) <= 0 then 1 else 0 end
              else greatest(0, least(1, 1 - greatest(0, a.avg_actual_lead - a.avg_quoted_lead) / a.avg_quoted_lead)) end as lead_score
    from suppliers s left join agg a on a.supplier_id = s.id
   where s.is_active
)
select sc.supplier_id, sc.code, sc.name, sc.terms_label, sc.quoted_lead_time_days,
       coalesce(sc.po_count, 0) as po_count,
       round(sc.on_time_rate, 4) as on_time_rate, round(sc.avg_actual_lead, 2) as avg_actual_lead_days,
       round(sc.avg_quoted_lead, 2) as avg_quoted_lead_days, round(sc.fill_rate, 4) as fill_rate, round(sc.lead_score, 4) as lead_score,
       round(100 * (st.score_w_ontime * sc.on_time_rate + st.score_w_fill * sc.fill_rate + st.score_w_lead * sc.lead_score), 1) as score,
       case when sc.po_count is null then 'unrated'
            when 100 * (st.score_w_ontime * sc.on_time_rate + st.score_w_fill * sc.fill_rate + st.score_w_lead * sc.lead_score) >= st.keep_threshold then 'keep'
            when 100 * (st.score_w_ontime * sc.on_time_rate + st.score_w_fill * sc.fill_rate + st.score_w_lead * sc.lead_score) >= st.watch_threshold then 'watch'
            else 'replace' end as rating,
       coalesce(bl.amount_owed, 0) as amount_owed, bl.next_due_date, coalesce(bl.overdue_amount, 0) as overdue_amount,
       round(bl.pct_paid_on_time, 4) as pct_paid_on_time
  from scored sc cross join st left join bills bl on bl.supplier_id = sc.supplier_id;

-- ---------------------------------------------------------------- MRP
-- Demand on purchasable items from confirmed sales orders (BOM-exploded), optionally plus the newest forecast.
create function _mrp_demand(p_start date, p_end date, p_forecast boolean)
returns table (item_id bigint, d date, qty numeric)
language sql stable
set search_path = public
as $$
  with parent as (
    select sl.item_id, greatest((so.requested_for at time zone 'America/Denver')::date, p_start) as d, sl.qty - sl.qty_fulfilled as qty
      from sales_orders so join so_lines sl on sl.so_id = so.id
     where so.status = 'placed' and sl.qty - sl.qty_fulfilled > 0
       and (so.requested_for at time zone 'America/Denver')::date <= p_end
    union all
    select df.item_id, df.forecast_date, df.qty
      from demand_forecasts df
     where p_forecast and df.run_id = (select id from forecast_runs order by as_of desc, id desc limit 1)
       and df.forecast_date between p_start and p_end
  ), exploded as (
    select p.item_id, p.d, p.qty from parent p
    union all
    select b.component_item_id, p.d, p.qty * b.qty_per from parent p join bom_lines b on b.parent_item_id = p.item_id
  )
  select e.item_id, e.d, sum(e.qty)
    from exploded e join items i on i.id = e.item_id and i.is_purchasable and i.is_active
   group by 1, 2
$$;

-- Weekly MRP grid in long format (item x week).
--   net = max(0, gross - (projected on hand carried in + scheduled receipts)); planned order = ceil_pack(net)
--   requirement_date = first demand date in the week that the carried-in stock and receipts cannot cover
--   order_by_date = requirement_date - lead time; is_expedite when that date is already past
create function mrp_weekly(p_start date default null, p_weeks int default 4, p_include_forecast boolean default false)
returns table (
  item_id bigint, sku text, item_name text, uom text, supplier_id bigint, supplier_name text,
  lead_time_days int, pack_size numeric,
  week_no int, week_start date, week_end date,
  beginning_on_hand numeric, gross_req numeric, scheduled_receipts numeric, net_req numeric,
  planned_order_qty numeric, projected_on_hand numeric,
  requirement_date date, order_by_date date, is_expedite boolean
)
language sql stable
set search_path = public
as $$
  with recursive
  p as (select coalesce(p_start, _today()) as s, greatest(least(p_weeks, 26), 1) as n),
  dem as (select m.* from p, _mrp_demand(p.s, p.s + p.n * 7 - 1, p_include_forecast) m),
  gross as (
    select dem.item_id, ((dem.d - p.s) / 7) + 1 as w, sum(dem.qty) as g from dem, p group by 1, 2
  ),
  sr as (
    select pl.item_id, least(greatest(((coalesce(pl.expected_on, po.expected_on) - p.s) / 7) + 1, 1), p.n) as w,
           sum(pl.qty_ordered - pl.qty_received - pl.qty_cancelled) as q
      from po_lines pl join purchase_orders po on po.id = pl.po_id and po.status = 'sent', p
     where pl.qty_ordered - pl.qty_received - pl.qty_cancelled > 0
       and coalesce(pl.expected_on, po.expected_on) < p.s + p.n * 7
     group by 1, 2
  ),
  tracked as (select distinct item_id from gross),
  info as (
    select i.id as item_id, i.sku, i.name, i.uom, i.preferred_supplier_id as supplier_id, sp.name as supplier_name,
           i.lead_time_days, coalesce(ps.pack_size, i.pack_size) as pack_size,
           coalesce((select sum(b.qty_on_hand) from inventory_balances b where b.item_id = i.id), 0) as on_hand
      from tracked t join items i on i.id = t.item_id
      left join suppliers sp on sp.id = i.preferred_supplier_id
      left join item_suppliers ps on ps.item_id = i.id and ps.supplier_id = i.preferred_supplier_id
  ),
  calc as (
    select n.item_id, 0 as w, n.on_hand as poh_end, 0::numeric as poh_start, 0::numeric as g, 0::numeric as s_r,
           0::numeric as net, 0::numeric as planned
      from info n
    union all
    select c.item_id, c.w + 1,
           c.poh_end + coalesce(r.q, 0) + pl.planned - coalesce(g.g, 0),
           c.poh_end, coalesce(g.g, 0), coalesce(r.q, 0), pl.net, pl.planned
      from calc c
      join info n on n.item_id = c.item_id
      left join gross g on g.item_id = c.item_id and g.w = c.w + 1
      left join sr r on r.item_id = c.item_id and r.w = c.w + 1
      cross join lateral (
        select greatest(0, coalesce(g.g, 0) - (c.poh_end + coalesce(r.q, 0))) as net,
               case when coalesce(g.g, 0) - (c.poh_end + coalesce(r.q, 0)) > 0
                    then ceil((coalesce(g.g, 0) - (c.poh_end + coalesce(r.q, 0))) / n.pack_size) * n.pack_size else 0 end as planned
      ) pl
     where c.w < (select n from p)
  )
  select n.item_id, n.sku, n.name, n.uom, n.supplier_id, n.supplier_name, n.lead_time_days, n.pack_size,
         c.w, p.s + (c.w - 1) * 7, p.s + c.w * 7 - 1,
         round(c.poh_start, 3), round(c.g, 3), round(c.s_r, 3), round(c.net, 3), round(c.planned, 3), round(c.poh_end, 3),
         rq.d, rq.d - n.lead_time_days,
         (rq.d is not null and rq.d - n.lead_time_days < _today())
    from calc c
    join info n on n.item_id = c.item_id
    cross join p
    left join lateral (
      select min(x.d) as d from (
        select dm.d, sum(dm.qty) over (order by dm.d) as cum
          from dem dm
         where dm.item_id = c.item_id and dm.d between p.s + (c.w - 1) * 7 and p.s + c.w * 7 - 1) x
       where c.net > 0 and x.cum > c.poh_start + c.s_r) rq on true
   where c.w >= 1
   order by n.name, c.w
$$;

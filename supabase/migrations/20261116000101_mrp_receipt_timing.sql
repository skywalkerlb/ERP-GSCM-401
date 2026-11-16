-- Preserve the weekly API while netting supply in requirement-date order.
-- Net is the largest within-week shortage before planned receipts; planned supply
-- arrives by the first shortage date, with any excess carried into the next week.
-- Sent POs count only for their unreceived, uncancelled balance and expected date.
create or replace function mrp_weekly(p_start date default null, p_weeks int default 4, p_include_forecast boolean default false)
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
  receipts as (
    select pl.item_id, greatest(coalesce(pl.expected_on, po.expected_on), p.s) as d,
           sum(pl.qty_ordered - pl.qty_received - pl.qty_cancelled) as qty
      from po_lines pl join purchase_orders po on po.id = pl.po_id and po.status = 'sent', p
     where pl.qty_ordered - pl.qty_received - pl.qty_cancelled > 0
       and coalesce(pl.expected_on, po.expected_on) < p.s + p.n * 7
     group by 1, 2
  ),
  -- Net chronologically inside each week: Friday's receipt cannot cover Monday's demand.
  events as (
    select item_id, d, qty as g, 0::numeric as r from dem
    union all
    select item_id, d, 0::numeric, qty from receipts
  ),
  daily as (
    select e.item_id, e.d, ((e.d - p.s) / 7) + 1 as w, sum(e.g) as g, sum(e.r) as r
      from events e cross join p group by 1, 2, 3
  ),
  profile as (
    select daily.*, sum(g - r) over (partition by item_id, w order by d) as deficit
      from daily
  ),
  weekly as (
    select item_id, w, sum(g) as g, sum(r) as r, max(deficit) as peak
      from profile group by 1, 2
  ),
  tracked as (select distinct item_id from dem),
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
           c.poh_end + coalesce(w.r, 0) + pl.planned - coalesce(w.g, 0),
           c.poh_end, coalesce(w.g, 0), coalesce(w.r, 0), pl.net, pl.planned
      from calc c
      join info n on n.item_id = c.item_id
      left join weekly w on w.item_id = c.item_id and w.w = c.w + 1
      cross join lateral (
        select greatest(0, coalesce(w.peak, 0) - c.poh_end) as net,
               ceil(greatest(0, coalesce(w.peak, 0) - c.poh_end) / n.pack_size) * n.pack_size as planned
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
      select min(x.d) as d from profile x
       where x.item_id = c.item_id and x.w = c.w
         and c.net > 0 and x.deficit > c.poh_start) rq on true
   where c.w >= 1
   order by n.name, c.w
$$;

revoke execute on function mrp_weekly(date, int, boolean) from public, anon;
grant execute on function mrp_weekly(date, int, boolean) to authenticated, service_role;

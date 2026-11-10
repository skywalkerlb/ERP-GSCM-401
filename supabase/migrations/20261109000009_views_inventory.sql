-- 0009: inventory views. All views are security_invoker, so base-table RLS applies to whoever queries them
-- (staff read everything; customers read nothing and use get_catalog_availability()).

-- Per item and location: stock, allocations to confirmed sales orders, backorders, PO pipeline, estimated date.
create view v_item_availability with (security_invoker = true) as
with locs as (
  select id, code, name, kind from locations where is_active
), bal as (
  select item_id, location_id,
         sum(qty_on_hand) as total,
         coalesce(sum(qty_on_hand) filter (where condition = 'fresh'), 0) as fresh,
         coalesce(sum(qty_on_hand) filter (where condition = 'day_old'), 0) as day_old
    from inventory_balances group by 1, 2
), kit_stock as (   -- a kit is only as available as its scarcest component
  select b.parent_item_id as item_id, l.id as location_id,
         floor(min(coalesce(bl.total, 0) / b.qty_per)) as total
    from bom_lines b
    join items k on k.id = b.parent_item_id and k.item_type = 'kit'
    cross join locs l
    left join bal bl on bl.item_id = b.component_item_id and bl.location_id = l.id
   group by 1, 2
), stock as (
  select item_id, location_id, total, fresh, day_old from bal
  union all
  select item_id, location_id, total, total, 0 from kit_stock
), alloc as (
  select sl.item_id, so.location_id, sum(sl.qty - sl.qty_fulfilled) as qty
    from sales_orders so join so_lines sl on sl.so_id = so.id
   where so.status = 'placed' group by 1, 2
), onord as (
  select pl.item_id, po.ship_to_location_id as location_id,
         sum(pl.qty_ordered - pl.qty_received - pl.qty_cancelled) as qty
    from po_lines pl join purchase_orders po on po.id = pl.po_id and po.status = 'sent'
   where pl.qty_ordered - pl.qty_received - pl.qty_cancelled > 0 group by 1, 2
), base as (
  select i.id as item_id, i.sku, i.name, i.category, i.item_type, i.uom, i.reorder_point,
         i.is_manufactured, i.is_purchasable, i.lead_time_days,
         l.id as location_id, l.code as location_code, l.name as location_name, l.kind as location_kind,
         coalesce(st.total, 0) as on_hand, coalesce(st.fresh, 0) as on_hand_fresh, coalesce(st.day_old, 0) as on_hand_day_old,
         coalesce(al.qty, 0) as allocated,
         coalesce(st.total, 0) - coalesce(al.qty, 0) as available,
         greatest(0, coalesce(al.qty, 0) - coalesce(st.total, 0)) as backordered,
         coalesce(oo.qty, 0) as on_order
    from items i
    cross join locs l
    left join stock st on st.item_id = i.id and st.location_id = l.id
    left join alloc al on al.item_id = i.id and al.location_id = l.id
    left join onord oo on oo.item_id = i.id and oo.location_id = l.id
   where i.is_active
)
select b.item_id, b.sku, b.name, b.category, b.item_type, b.uom, b.location_id, b.location_code, b.location_name, b.location_kind,
       b.on_hand, b.on_hand_fresh, b.on_hand_day_old, b.allocated, b.available, b.backordered, b.on_order,
       b.reorder_point,
       case
         when b.available > 0 then _today()
         when b.item_type = 'kit' then _today() + coalesce((select max(c.lead_time_days) from bom_lines bm join items c on c.id = bm.component_item_id
                                                             where bm.parent_item_id = b.item_id), 1)
         when b.is_manufactured then
           coalesce((select greatest(min(po.due_date), _today()) from production_orders po
                      where po.item_id = b.item_id and po.status in ('planned', 'in_progress') having count(*) > 0), _today() + 1)
         else coalesce(
           (select min(x.adj_date) from (
              select y.adj_date, sum(y.rem) over (order by y.adj_date, y.line_id) as cum
                from (select pl.id as line_id, pl.qty_ordered - pl.qty_received - pl.qty_cancelled as rem,
                             greatest(coalesce(pl.expected_on, po.expected_on), _today())
                               + case when b.location_kind = 'shop' and po.ship_to_location_id <> b.location_id then 1 else 0 end as adj_date
                        from po_lines pl join purchase_orders po on po.id = pl.po_id and po.status = 'sent'
                       where pl.item_id = b.item_id and pl.qty_ordered - pl.qty_received - pl.qty_cancelled > 0) y) x
             where x.cum >= greatest(0.001, -b.available + 0.001)),
           _today() + b.lead_time_days + case when b.location_kind = 'shop' then 1 else 0 end)
       end as est_available_date
  from base b;

-- Customer portal catalog: shops, sellable items, price and what is available. No costs, no other customers.
create function get_catalog_availability()
returns table (
  location_id bigint, location_code text, location_name text, item_id bigint, sku text, name text,
  category text, list_price numeric, available_qty numeric, in_stock boolean, est_available_date date
)
language sql stable security definer
set search_path = public
as $$
  select a.location_id, a.location_code, a.location_name, i.id, i.sku, i.name, i.category, i.list_price,
         greatest(least(a.on_hand_fresh, a.available), 0), greatest(least(a.on_hand_fresh, a.available), 0) > 0,
         a.est_available_date
    from v_item_availability a
    join items i on i.id = a.item_id
   where a.location_kind = 'shop' and i.is_sellable and i.is_active
   order by a.location_name, i.category, i.name
$$;

-- Qty x weighted average cost by item and location. The largest location absorbs the rounding so that
-- each item's rows add up exactly to item_costs.value_total (and therefore to GL 1200).
create view v_inventory_valuation with (security_invoker = true) as
with b as (
  select item_id, location_id, sum(qty_on_hand) as qty,
         coalesce(sum(qty_on_hand) filter (where condition = 'fresh'), 0) as qty_fresh,
         coalesce(sum(qty_on_hand) filter (where condition = 'day_old'), 0) as qty_day_old
    from inventory_balances where qty_on_hand <> 0 group by 1, 2
), r as (
  select b.*, c.avg_cost, c.value_total,
         round(b.qty * coalesce(c.value_total / nullif(c.qty_total, 0), 0), 2) as raw_val,
         row_number() over (partition by b.item_id order by b.qty desc, b.location_id) as rn
    from b join item_costs c on c.item_id = b.item_id
)
select r.item_id, i.sku, i.name, i.category, i.item_type, i.uom,
       r.location_id, l.code as location_code, l.name as location_name,
       r.qty as qty_on_hand, r.qty_fresh, r.qty_day_old, r.avg_cost,
       r.raw_val + case when r.rn = 1 then r.value_total - sum(r.raw_val) over (partition by r.item_id) else 0 end as value
  from r join items i on i.id = r.item_id join locations l on l.id = r.location_id;

-- One row: ledger, cost table, valuation and GL must all agree.
create view v_inventory_gl_check with (security_invoker = true) as
select led.v as ledger_value, cst.v as item_costs_value, val.v as valuation_value, gl.v as gl_1200_balance,
       led.v - gl.v as ledger_vs_gl, cst.v - gl.v as costs_vs_gl, val.v - gl.v as valuation_vs_gl
  from (select coalesce(sum(value_delta), 0) as v from inventory_transactions) led,
       (select coalesce(sum(value_total), 0) as v from item_costs) cst,
       (select coalesce(sum(value), 0) as v from v_inventory_valuation) val,
       (select coalesce(sum(debit - credit), 0) as v from journal_lines where account_code = '1200') gl;

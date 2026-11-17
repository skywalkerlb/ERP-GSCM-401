-- Keep pickup orders within an active shop's business hours and prevent duplicate
-- lines from bypassing the per-item limit. Future orders may exceed today's stock:
-- they are confirmed demand for MRP and production, not an immediate inventory issue.
create or replace function place_pickup_order(
  p_location_id bigint, p_pickup_at timestamptz, p_lines jsonb, p_notes text default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_cust bigint := my_customer_id();
  v_so bigint;
  v_shop locations%rowtype;
  v_local timestamp := p_pickup_at at time zone 'America/Denver';
begin
  perform _require_role('{customer}');
  if v_cust is null then raise exception 'Sign in with a customer account to place a pickup order.'; end if;
  if p_pickup_at is null or p_pickup_at <= now() then
    raise exception 'Pick a pickup time in the future.'; end if;
  if p_pickup_at > now() + interval '60 days' then
    raise exception 'Pickup orders can be placed up to 60 days ahead.'; end if;

  select * into v_shop from locations where id = p_location_id and kind = 'shop' and is_active;
  if not found then raise exception 'Choose an active shop for pickup.'; end if;
  if extract(dow from v_local)::int = any(v_shop.closed_weekdays) then
    raise exception 'This shop is closed on that day. Choose another pickup day.'; end if;
  if v_local::time < coalesce(v_shop.open_time, '06:00'::time)
     or v_local::time >= coalesce(v_shop.close_time, '18:00'::time) then
    raise exception 'Choose a pickup time during the shop''s opening hours.'; end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item to the order.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) e
     group by (e->>'item_id')::bigint having sum((e->>'qty')::numeric) > 500
  ) then
    raise exception 'For orders over 500 of one item, please call the shop.'; end if;

  v_so := _create_so(v_cust, p_location_id, p_pickup_at, p_lines, 'online', p_notes, null);
  return (select jsonb_build_object('so_id', so.id, 'so_number', so.so_number,
    'total', (select sum(round(qty * unit_price, 2)) from so_lines where so_id = so.id))
    from sales_orders so where so.id = v_so);
end $$;

revoke execute on function place_pickup_order(bigint, timestamptz, jsonb, text) from public, anon;
grant execute on function place_pickup_order(bigint, timestamptz, jsonb, text) to authenticated, service_role;

-- Pickup fulfillment and kit checkout issue fresh stock only. Reserve that same
-- stock across direct sales-order lines and all kits sharing their components.
-- Keep the broader staff availability view's day-old/total semantics unchanged.
create or replace function get_catalog_availability()
returns table (
  location_id bigint, location_code text, location_name text, item_id bigint, sku text, name text,
  category text, list_price numeric, available_qty numeric, in_stock boolean, est_available_date date
)
language sql stable security definer
set search_path = public
as $$
  with fresh as (
    select b.item_id, b.location_id, sum(b.qty_on_hand) as qty
      from inventory_balances b where b.condition = 'fresh' group by 1, 2
  ), open_lines as (
    select sl.item_id, so.location_id, sl.qty - sl.qty_fulfilled as qty, i.item_type
      from sales_orders so join so_lines sl on sl.so_id = so.id
      join items i on i.id = sl.item_id
     where so.status = 'placed' and sl.qty > sl.qty_fulfilled
  ), allocated_stock as (
    select r.item_id, r.location_id, sum(r.qty) as qty from (
      select o.item_id, o.location_id, o.qty from open_lines o where o.item_type <> 'kit'
      union all
      select b.component_item_id, o.location_id, o.qty * b.qty_per
        from open_lines o join bom_lines b on b.parent_item_id = o.item_id where o.item_type = 'kit'
    ) r group by 1, 2
  ), capacity as (
    select l.id as location_id, l.code as location_code, l.name as location_name,
           i.id as item_id, i.sku, i.name, i.category, i.list_price,
           case when i.item_type = 'kit' then coalesce((
             select floor(min(greatest(0, coalesce(cf.qty, 0) - coalesce(ca.qty, 0)) / b.qty_per))
               from bom_lines b
               left join fresh cf on cf.item_id = b.component_item_id and cf.location_id = l.id
               left join allocated_stock ca on ca.item_id = b.component_item_id and ca.location_id = l.id
              where b.parent_item_id = i.id
           ), 0) else greatest(0, coalesce(f.qty, 0) - coalesce(a.qty, 0)) end as qty
      from locations l cross join items i
      left join fresh f on f.item_id = i.id and f.location_id = l.id
      left join allocated_stock a on a.item_id = i.id and a.location_id = l.id
     where l.kind = 'shop' and l.is_active and i.is_sellable and i.is_active
  )
  select c.location_id, c.location_code, c.location_name, c.item_id, c.sku, c.name,
         c.category, c.list_price, c.qty, c.qty > 0,
         case when c.qty > 0 then _today()
              else greatest(a.est_available_date, _today() + 1) end
    from capacity c
    left join v_item_availability a on a.item_id = c.item_id and a.location_id = c.location_id
   order by c.location_name, c.category, c.name
$$;

revoke execute on function get_catalog_availability() from public, anon;
grant execute on function get_catalog_availability() to authenticated, service_role;

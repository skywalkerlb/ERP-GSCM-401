-- Run as postgres after all migrations. Tests use real customer-role authorization;
-- every fixture and posting is rolled back. No hosted dataset or schema reset needed.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify/customer_portal.sql
begin;

do $$
declare
  v_prefix text := 'PORTAL-' || gen_random_uuid()::text;
  v_user uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_customer bigint; v_shop bigint; v_second bigint; v_inactive bigint; v_closed bigint; v_kitchen bigint;
  v_parent bigint; v_component bigint; v_order bigint; v_result jsonb; v_catalog record;
  v_bundle_a bigint; v_bundle_b bigint; v_resale bigint; v_pack bigint; v_shared_order bigint;
  v_day date := (now() at time zone 'America/Denver')::date + 1;
  v_pickup timestamptz; v_count bigint; v_events bigint; v_txns bigint;
  v_denied boolean; v_case record;
begin
  v_pickup := (v_day + time '09:00') at time zone 'America/Denver';
  insert into auth.users(id, email, raw_app_meta_data, raw_user_meta_data) values
    (v_user, v_prefix || '-a@example.invalid', '{}', '{"full_name":"Portal customer","role":"owner"}'),
    (v_other, v_prefix || '-b@example.invalid', '{}', '{}');
  select customer_id into v_customer from profiles where user_id = v_user and role = 'customer';
  if v_customer is null or not exists(select 1 from customers where id = v_customer and auth_user_id = v_user) then
    raise exception 'Public signup must create a linked customer profile, ignoring requested staff roles';
  end if;
  raise notice 'PASS: signup creates a customer identity and cannot self-assign staff access';

  insert into locations(code, name, kind, open_time, close_time) values
    (v_prefix || '-A', 'Portal first shop', 'shop', '06:00', '18:00') returning id into v_shop;
  insert into locations(code, name, kind, open_time, close_time) values
    (v_prefix || '-B', 'Portal second shop', 'shop', '06:00', '18:00') returning id into v_second;
  insert into locations(code, name, kind, is_active) values
    (v_prefix || '-I', 'Portal inactive shop', 'shop', false) returning id into v_inactive;
  insert into locations(code, name, kind, closed_weekdays) values
    (v_prefix || '-C', 'Portal closed shop', 'shop', '{0,1,2,3,4,5,6}') returning id into v_closed;
  insert into locations(code, name, kind) values
    (v_prefix || '-K', 'Portal kitchen', 'kitchen') returning id into v_kitchen;
  insert into items(sku, name, item_type, is_manufactured, is_sellable, list_price)
    values(v_prefix || '-P', 'Portal donut', 'finished', true, true, 3) returning id into v_parent;
  insert into items(sku, name, item_type, is_purchasable, lead_time_days, uom)
    values(v_prefix || '-F', 'Portal flour', 'raw', true, 3, 'lb') returning id into v_component;
  insert into bom_lines(parent_item_id, component_item_id, qty_per) values(v_parent, v_component, 2);
  perform _post_opening(jsonb_build_array(
    jsonb_build_object('item_id',v_parent,'location_id',v_shop,'qty',10,'unit_cost',1),
    jsonb_build_object('item_id',v_parent,'location_id',v_shop,'qty',4,'unit_cost',1,'condition','day_old'),
    jsonb_build_object('item_id',v_parent,'location_id',v_second,'qty',5,'unit_cost',1)), 0, now());
  insert into sales_orders(so_number, customer_id, location_id, requested_for)
    values(v_prefix || '-EXISTING', v_customer, v_shop, v_pickup) returning id into v_order;
  insert into so_lines(so_id, item_id, qty, unit_price) values(v_order, v_parent, 3, 3);

  perform set_config('request.jwt.claims',json_build_object('sub',v_user,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  set local role authenticated;
  select * into v_catalog from get_catalog_availability() where item_id = v_parent and location_id = v_shop;
  if v_catalog.item_id is null or v_catalog.available_qty <> 7 or v_catalog.location_name <> 'Portal first shop' or not v_catalog.in_stock then
    raise exception 'Catalog must show the shop and available stock after confirmed-order allocations';
  end if;
  select * into v_catalog from get_catalog_availability() where item_id = v_parent and location_id = v_second;
  if v_catalog.item_id is null or v_catalog.available_qty <> 5 then raise exception 'Inventory must remain distinct per pickup shop'; end if;
  if exists(select 1 from get_catalog_availability() where location_id in(v_inactive, v_kitchen)) then
    raise exception 'Catalog must exclude inactive shops and kitchens';
  end if;
  if exists(select 1 from items where id in(v_parent,v_component)) then
    raise exception 'Customers must use the public catalog, not staff inventory records';
  end if;
  reset role;
  raise notice 'PASS: customer catalog exposes location availability and allocations without staff inventory access';

  -- Two kit parents and a directly sold component compete for the same fresh
  -- stock. Day-old components must not inflate what fresh-only checkout can use.
  insert into items(sku,name,item_type,is_sellable,is_purchasable,list_price,lead_time_days)
    values(v_prefix||'-R','Portal resale component','resale',true,true,4,3) returning id into v_resale;
  insert into items(sku,name,item_type,is_purchasable,lead_time_days)
    values(v_prefix||'-W','Portal wrapper','packaging',true,2) returning id into v_pack;
  insert into items(sku,name,item_type,is_sellable,list_price)
    values(v_prefix||'-BA','Portal bundle A','kit',true,10) returning id into v_bundle_a;
  insert into items(sku,name,item_type,is_sellable,list_price)
    values(v_prefix||'-BB','Portal bundle B','kit',true,6) returning id into v_bundle_b;
  insert into bom_lines(parent_item_id,component_item_id,qty_per) values
    (v_bundle_a,v_resale,2),(v_bundle_a,v_pack,1),(v_bundle_b,v_resale,1),(v_bundle_b,v_pack,1);
  perform _post_opening(jsonb_build_array(
    jsonb_build_object('item_id',v_resale,'location_id',v_shop,'qty',10,'unit_cost',1),
    jsonb_build_object('item_id',v_resale,'location_id',v_shop,'qty',100,'unit_cost',1,'condition','day_old'),
    jsonb_build_object('item_id',v_resale,'location_id',v_second,'qty',100,'unit_cost',1,'condition','day_old'),
    jsonb_build_object('item_id',v_pack,'location_id',v_shop,'qty',20,'unit_cost',1)),0,now());
  insert into sales_orders(so_number,customer_id,location_id,requested_for)
    values(v_prefix||'-SHARED',v_customer,v_shop,v_pickup) returning id into v_shared_order;
  insert into so_lines(so_id,item_id,qty,qty_fulfilled,unit_price) values
    (v_shared_order,v_bundle_a,3,1,10), (v_shared_order,v_bundle_b,1,0,6), (v_shared_order,v_resale,1,0,4);
  set local role authenticated;
  select * into v_catalog from get_catalog_availability() where item_id=v_bundle_a and location_id=v_shop;
  if v_catalog.item_id is null or v_catalog.available_qty <> 2 then
    raise exception 'Bundle A must use fresh capacity after reservations for both bundles and direct sales';
  end if;
  select * into v_catalog from get_catalog_availability() where item_id=v_bundle_b and location_id=v_shop;
  if v_catalog.item_id is null or v_catalog.available_qty <> 4 then
    raise exception 'Bundle B must share the same fresh component reservations';
  end if;
  select * into v_catalog from get_catalog_availability() where item_id=v_resale and location_id=v_shop;
  if v_catalog.item_id is null or v_catalog.available_qty <> 4 then
    raise exception 'Direct component availability must also subtract kit reservations';
  end if;
  select * into v_catalog from get_catalog_availability() where item_id=v_resale and location_id=v_second;
  if v_catalog.item_id is null or v_catalog.available_qty <> 0 or v_catalog.in_stock
     or v_catalog.est_available_date <= (now() at time zone 'America/Denver')::date then
    raise exception 'Day-old-only stock must not be offered for fresh pickup or imply restock today';
  end if;
  select * into v_catalog from get_catalog_availability() where item_id=v_bundle_a and location_id=v_second;
  if v_catalog.item_id is null or v_catalog.available_qty <> 0 or v_catalog.in_stock then
    raise exception 'Kit components at another shop or in day-old condition must not inflate capacity';
  end if;
  reset role;
  raise notice 'PASS: kit capacity and direct stock share fresh-only reservations across parent BOMs';
  raise notice 'PASS: day-old-only stock is unavailable for fresh pickup and restock remains a future estimate';
  update sales_orders set status='cancelled' where id=v_shared_order;
  set local role authenticated;
  select * into v_catalog from get_catalog_availability() where item_id=v_bundle_a and location_id=v_shop;
  if v_catalog.item_id is null or v_catalog.available_qty <> 5 then
    raise exception 'Cancelling shared kit/component orders must release their reservations';
  end if;
  reset role;
  raise notice 'PASS: cancelling orders releases shared component reservations';

  set local role authenticated;
  v_result := place_pickup_order(v_shop, v_pickup, jsonb_build_array(jsonb_build_object('item_id',v_parent,'qty',2)), 'Portal test pickup');
  reset role;
  v_order := (v_result->>'so_id')::bigint;
  if not exists(select 1 from sales_orders where id=v_order and customer_id=v_customer and status='placed' and channel='online' and location_id=v_shop)
     or (v_result->>'total')::numeric <> 6 then
    raise exception 'Pickup must create an owned, confirmed online order at server prices';
  end if;
  if coalesce((select gross_req from mrp_weekly(v_day,4,false) where item_id=v_component and week_no=1),-1) <> 10 then
    raise exception 'Customer parent orders must explode into component demand for MRP';
  end if;
  raise notice 'PASS: pickup creates an owned confirmed order with BOM component demand';

  -- Backorders are intentional: future demand feeds planning without issuing inventory.
  select count(*) into v_txns from inventory_transactions;
  set local role authenticated;
  perform place_pickup_order(v_shop, v_pickup, jsonb_build_array(jsonb_build_object('item_id',v_parent,'qty',20)));
  reset role;
  if (select count(*) from inventory_transactions) <> v_txns then
    raise exception 'Future pickup must not consume stock before fulfillment';
  end if;
  raise notice 'PASS: future backorders remain supported without premature inventory consumption';

  set local role authenticated;
  v_result := place_pickup_order(v_shop, (v_day+time '06:00') at time zone 'America/Denver',
    jsonb_build_array(jsonb_build_object('item_id',v_parent,'qty',300),jsonb_build_object('item_id',v_parent,'qty',200)));
  reset role;
  if not exists(select 1 from so_lines where so_id=(v_result->>'so_id')::bigint and item_id=v_parent and qty=500)
     or (select count(*) from so_lines where so_id=(v_result->>'so_id')::bigint) <> 1 then
    raise exception 'Opening time and exactly 500 aggregated units must be accepted, with duplicates merged';
  end if;
  raise notice 'PASS: opening time and the exact aggregated item limit are accepted';

  perform set_config('request.jwt.claims',json_build_object('sub',v_other,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_other::text,true);
  set local role authenticated;
  if get_my_orders() <> '[]'::jsonb or exists(select 1 from sales_orders where id=v_order)
     or exists(select 1 from so_lines where so_id=v_order) then
    raise exception 'Another customer must not read this customer''s pickup orders';
  end if;
  v_denied := false;
  begin perform cancel_sales_order(v_order);
  exception when raise_exception then v_denied := sqlerrm = 'Order not found.'; end;
  reset role;
  if not v_denied then raise exception 'Another customer must not cancel this customer''s order'; end if;
  raise notice 'PASS: customer order reads and cancellation are isolated by owner';

  perform set_config('request.jwt.claims',json_build_object('sub',v_user,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  select count(*) into v_count from sales_orders;
  select count(*) into v_events from app_events;
  for v_case in select * from (values
    ('past time',v_shop,now()-interval '1 minute',jsonb_build_array(jsonb_build_object('item_id',v_parent,'qty',1))),
    ('over 60 days',v_shop,now()+interval '61 days',jsonb_build_array(jsonb_build_object('item_id',v_parent,'qty',1))),
    ('before open',v_shop,(v_day+time '05:30') at time zone 'America/Denver',jsonb_build_array(jsonb_build_object('item_id',v_parent,'qty',1))),
    ('at close',v_shop,(v_day+time '18:00') at time zone 'America/Denver',jsonb_build_array(jsonb_build_object('item_id',v_parent,'qty',1))),
    ('closed day',v_closed,v_pickup,jsonb_build_array(jsonb_build_object('item_id',v_parent,'qty',1))),
    ('inactive shop',v_inactive,v_pickup,jsonb_build_array(jsonb_build_object('item_id',v_parent,'qty',1))),
    ('kitchen',v_kitchen,v_pickup,jsonb_build_array(jsonb_build_object('item_id',v_parent,'qty',1))),
    ('missing shop',-1::bigint,v_pickup,jsonb_build_array(jsonb_build_object('item_id',v_parent,'qty',1))),
    ('single overlimit',v_shop,v_pickup,jsonb_build_array(jsonb_build_object('item_id',v_parent,'qty',501))),
    ('duplicate overlimit',v_shop,v_pickup,jsonb_build_array(jsonb_build_object('item_id',v_parent,'qty',300),jsonb_build_object('item_id',v_parent,'qty',201))),
    ('alternate duplicate item ID',v_shop,v_pickup,jsonb_build_array(jsonb_build_object('item_id',v_parent,'qty',300),jsonb_build_object('item_id','0'||v_parent::text,'qty',201))),
    ('empty order',v_shop,v_pickup,'[]'::jsonb),
    ('nonpositive quantity',v_shop,v_pickup,jsonb_build_array(jsonb_build_object('item_id',v_parent,'qty',0)))
  ) as cases(label,shop,pickup,lines) loop
    set local role authenticated;
    v_denied := false;
    begin perform place_pickup_order(v_case.shop,v_case.pickup,v_case.lines);
    exception when raise_exception then v_denied := true; end;
    reset role;
    if not v_denied or (select count(*) from sales_orders) <> v_count
       or (select count(*) from app_events) <> v_events
       or (select count(*) from inventory_transactions) <> v_txns then
      raise exception 'Invalid pickup % must be rejected without mutation',v_case.label;
    end if;
    raise notice 'PASS: rejects % without mutation',v_case.label;
  end loop;

  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  perform set_config('request.jwt.claim.sub','',true);
  set local role anon;
  v_denied := false;
  begin perform get_catalog_availability(); exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Anonymous users must not read the signed-in catalog'; end if;
  v_denied := false;
  begin perform place_pickup_order(v_shop,v_pickup,jsonb_build_array(jsonb_build_object('item_id',v_parent,'qty',1)));
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Anonymous users must not place pickup orders'; end if;
  reset role;
  raise notice 'PASS: anonymous catalog access and pickup ordering are denied';
end $$;

rollback;

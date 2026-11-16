-- Run against a migrated disposable test database: psql -v ON_ERROR_STOP=1 -f this_file.
-- Isolated fixtures; no existing business data is changed after rollback.
begin;
create function pg_temp.assert_mrp(p_week int, p_expected jsonb) returns void
language plpgsql as $$
declare actual jsonb;
begin
  select to_jsonb(m) into actual from public.mrp_weekly('2030-01-07', 4, false) m
   where sku = '__MRP_COMPONENT' and week_no = p_week;
  if actual is null or not actual @> p_expected then
    raise exception 'Week %: expected %, got %', p_week, p_expected, actual;
  end if;
end $$;

do $$
declare
  loc bigint; supplier bigint; component bigint; parent bigint; customer bigint;
  so bigint; po bigint; line bigint; i int; rows_count int;
begin
  insert into locations(code,name,kind) values ('__MRP','MRP test kitchen','kitchen') returning id into loc;
  insert into suppliers(code,name) values ('__MRP','MRP test supplier') returning id into supplier;
  insert into customers(name) values ('MRP test customer') returning id into customer;
  insert into items(sku,name,item_type,is_purchasable,lead_time_days,pack_size,preferred_supplier_id)
    values ('__MRP_COMPONENT','MRP test component','raw',true,3,4,supplier) returning id into component;
  for i in 1..5 loop
    insert into items(sku,name,item_type,is_manufactured,is_sellable,list_price)
      values ('__MRP_PARENT_' || i,'MRP test parent ' || i,'finished',true,true,2) returning id into parent;
    insert into bom_lines(parent_item_id,component_item_id,qty_per) values (parent,component,2);
  end loop;
  -- Last parent drives six outstanding units after partial fulfillment: 6 * 2 = 12.
  insert into sales_orders(so_number,customer_id,location_id,requested_for)
    values ('__MRP_SO',customer,loc,public._ts_on('2030-01-09')) returning id into so;
  insert into so_lines(so_id,item_id,qty,qty_fulfilled,unit_price) values (so,parent,8,2,2);
  perform public._post_opening(jsonb_build_array(jsonb_build_object('item_id',component,'location_id',loc,'qty',5,'unit_cost',1)));
  perform pg_temp.assert_mrp(1,'{"gross_req":12,"beginning_on_hand":5,"net_req":7,"planned_order_qty":8,"projected_on_hand":1,"requirement_date":"2030-01-09","order_by_date":"2030-01-06"}');
  select count(*) into rows_count from mrp_weekly('2030-01-07',4,false) where item_id=component;
  assert rows_count=4, 'Must return all four weeks including zero demand weeks';

  insert into purchase_orders(po_number,supplier_id,ship_to_location_id,status,expected_on)
    values ('__MRP_PO',supplier,loc,'sent','2030-01-08') returning id into po;
  insert into po_lines(po_id,item_id,qty_ordered,qty_received,qty_cancelled,unit_cost,expected_on)
    values (po,component,10,3,5,1,'2030-01-08') returning id into line;
  perform pg_temp.assert_mrp(1,'{"scheduled_receipts":2,"gross_req":12,"net_req":5,"planned_order_qty":8,"projected_on_hand":3}');

  -- Header is early, but line is late: it must not hide the Jan 9 shortage.
  update po_lines set expected_on='2030-01-12',qty_ordered=108 where id=line;
  perform pg_temp.assert_mrp(1,'{"scheduled_receipts":100,"net_req":7,"planned_order_qty":8,"projected_on_hand":101,"requirement_date":"2030-01-09","order_by_date":"2030-01-06"}');
  insert into sales_orders(so_number,customer_id,location_id,requested_for)
    values ('__MRP_SO_2',customer,loc,public._ts_on('2030-01-16')) returning id into so;
  insert into so_lines(so_id,item_id,qty,unit_price) values (so,parent,8,2);
  perform pg_temp.assert_mrp(2,'{"beginning_on_hand":101,"gross_req":16,"net_req":0,"planned_order_qty":0,"projected_on_hand":85,"requirement_date":null,"order_by_date":null}');

  -- A receipt on the requirement date is available that day; pack surplus carries.
  update po_lines set expected_on='2030-01-09',qty_ordered=18 where id=line;
  perform pg_temp.assert_mrp(1,'{"scheduled_receipts":10,"net_req":0,"planned_order_qty":0,"projected_on_hand":3}');
  perform pg_temp.assert_mrp(2,'{"beginning_on_hand":3,"net_req":13,"planned_order_qty":16,"projected_on_hand":3,"order_by_date":"2030-01-13"}');

  -- Draft, cancelled, closed and fully received orders cannot offset demand.
  update purchase_orders set status='draft' where id=po;
  perform pg_temp.assert_mrp(1,'{"scheduled_receipts":0,"net_req":7}');
  update purchase_orders set status='cancelled' where id=po;
  perform pg_temp.assert_mrp(1,'{"scheduled_receipts":0,"net_req":7}');
  update purchase_orders set status='closed' where id=po;
  perform pg_temp.assert_mrp(1,'{"scheduled_receipts":0,"net_req":7}');
  update purchase_orders set status='sent' where id=po;
  update po_lines set qty_received=13 where id=line;
  perform pg_temp.assert_mrp(1,'{"scheduled_receipts":0,"net_req":7}');

  -- Past-due confirmed orders and overdue receipts belong to the first week.
  update sales_orders set requested_for=public._ts_on('2029-12-31') where so_number='__MRP_SO';
  update po_lines set qty_received=3,expected_on='2029-12-31' where id=line;
  perform pg_temp.assert_mrp(1,'{"gross_req":12,"scheduled_receipts":10,"net_req":0}');
  update sales_orders set status='cancelled' where so_number='__MRP_SO';
  perform pg_temp.assert_mrp(1,'{"gross_req":0}');
  update sales_orders set status='fulfilled' where so_number='__MRP_SO_2';
  select count(*) into rows_count from mrp_weekly('2030-01-07',4,false) where item_id=component;
  assert rows_count=0, 'Cancelled and fulfilled sales orders must not create demand';

  -- Upper horizon boundary excludes day 29; day 28 is week 4.
  update sales_orders set status='placed',requested_for=public._ts_on('2030-02-04') where so_number='__MRP_SO_2';
  select count(*) into rows_count from mrp_weekly('2030-01-07',4,false) where item_id=component;
  assert rows_count=0, 'Day 29 must be excluded';
  update sales_orders set requested_for=public._ts_on('2030-02-03') where so_number='__MRP_SO_2';
  perform pg_temp.assert_mrp(4,'{"gross_req":16,"week_start":"2030-01-28","week_end":"2030-02-03"}');

  -- Multiple requirement days: date identifies the first shortage, quantity covers the peak.
  update sales_orders set status='placed',requested_for=public._ts_on('2030-01-08') where so_number='__MRP_SO';
  update sales_orders set requested_for=public._ts_on('2030-01-10') where so_number='__MRP_SO_2';
  update po_lines set qty_ordered=18,expected_on='2030-01-09' where id=line;
  perform pg_temp.assert_mrp(1,'{"gross_req":28,"scheduled_receipts":10,"net_req":13,"planned_order_qty":16,"requirement_date":"2030-01-08","order_by_date":"2030-01-05","projected_on_hand":3}');
  -- Explicitly verify the public report remains an invoker with restricted execution.
  assert not (select prosecdef from pg_proc where oid='mrp_weekly(date,integer,boolean)'::regprocedure);
  assert not has_function_privilege('anon','mrp_weekly(date,integer,boolean)','execute');
  assert has_function_privilege('authenticated','mrp_weekly(date,integer,boolean)','execute');
  raise notice 'MRP planning: BOM explosion, partial fulfillment, 4 weeks, dated/partial receipts, carryover, statuses, overdue, boundaries, peak shortage and privileges passed';
end $$;
rollback;

-- Glazed ERP role, RLS and RPC-permission tests.
-- Run inside a transaction that is always rolled back (scripts/verify/run.mjs does this).
-- Results land in the temp table _rls_results(label, ok, detail); the runner prints PASS/FAIL per row.
-- Requires the schema (and, for the data-dependent tests, a seeded database; those tests record "skipped" otherwise).

create temp table _rls_results (label text, ok boolean, detail text);
create temp table _fx (k text primary key, id uuid, n bigint);
grant all on _fx to public;   -- test roles read fixtures

-- ---------------------------------------------------------------- fixtures (rolled back)
insert into _fx (k, id) values
  ('manager', gen_random_uuid()), ('cashier', gen_random_uuid()), ('baker', gen_random_uuid()),
  ('custA', gen_random_uuid()), ('custB', gen_random_uuid());
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
select id, 'rls-test-' || k || '@example.invalid',
       case when k in ('manager', 'cashier', 'baker') then jsonb_build_object('role', k) else '{}'::jsonb end,
       jsonb_build_object('full_name', 'RLS test ' || k)
  from _fx;

-- a shop + stocked sellable item for the data-dependent tests
insert into _fx (k, n)
select 'shop', b.location_id from inventory_balances b
  join locations l on l.id = b.location_id and l.kind = 'shop'
  join items i on i.id = b.item_id and i.is_sellable and i.item_type = 'finished'
 where b.condition = 'fresh' and b.qty_on_hand >= 5 order by b.qty_on_hand desc limit 1;
insert into _fx (k, n)
select 'item', b.item_id from inventory_balances b
  join items i on i.id = b.item_id and i.is_sellable and i.item_type = 'finished'
 where b.condition = 'fresh' and b.qty_on_hand >= 5 and b.location_id = (select n from _fx where k = 'shop')
 order by b.qty_on_hand desc limit 1;

-- ---------------------------------------------------------------- tiny harness
-- _as(role, uid): switch to a test identity.  Always call reset role before recording a result.
create function pg_temp._claims(p_uid uuid, p_role text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true)
$$;

-- profiles created by the signup trigger
do $$
begin
  insert into _rls_results select 'trigger: staff profiles', (select count(*) from profiles where user_id in (select id from _fx where k in ('manager', 'cashier', 'baker'))) = 3, null;
  insert into _rls_results select 'trigger: customer profile + customers row',
    (select count(*) from profiles p join customers c on c.id = p.customer_id and c.auth_user_id = p.user_id
      where p.role = 'customer' and p.user_id in (select id from _fx where k in ('custA', 'custB'))) = 2, null;
  insert into _rls_results select 'trigger: staff roles are exact',
    (select role::text from profiles where user_id = (select id from _fx where k = 'cashier')) = 'cashier'
    and (select role::text from profiles where user_id = (select id from _fx where k = 'manager')) = 'manager', null;
end $$;

-- ---------------------------------------------------------------- anon
do $$
declare v_ok boolean; v_msg text;
begin
  perform pg_temp._claims(null, 'anon');
  set local role anon;
  begin perform count(*) from items; v_ok := false; v_msg := 'anon read items';
  exception when insufficient_privilege then v_ok := true; v_msg := sqlerrm; end;
  reset role;
  insert into _rls_results values ('anon cannot read tables', v_ok, v_msg);

  set local role anon;
  begin perform get_catalog_availability(); v_ok := false; v_msg := 'anon executed a function';
  exception when insufficient_privilege then v_ok := true; v_msg := sqlerrm; end;
  reset role;
  insert into _rls_results values ('anon cannot execute RPCs', v_ok, v_msg);
end $$;

-- ---------------------------------------------------------------- cashier
do $$
declare
  v_uid uuid := (select id from _fx where k = 'cashier');
  v_shop bigint := (select n from _fx where k = 'shop');
  v_item bigint := (select n from _fx where k = 'item');
  v_ok boolean; v_msg text; v_n int; v_res jsonb; v_sup bigint;
begin
  perform pg_temp._claims(v_uid, 'authenticated');
  set local role authenticated;

  begin perform create_purchase_order((select id from suppliers limit 1), (select id from locations limit 1), '[{"item_id":1,"qty":1}]'::jsonb);
        v_ok := false; v_msg := 'cashier created a PO';
  exception when others then v_ok := sqlerrm like '%cannot do this%'; v_msg := sqlerrm; end;
  reset role; insert into _rls_results values ('cashier cannot create purchase orders', v_ok, v_msg);

  set local role authenticated;
  begin perform record_expense(public._today(), '6000', 10, 'x'); v_ok := false; v_msg := 'cashier recorded an expense';
  exception when others then v_ok := sqlerrm like '%cannot do this%'; v_msg := sqlerrm; end;
  reset role; insert into _rls_results values ('cashier cannot record expenses', v_ok, v_msg);

  set local role authenticated;
  begin insert into items (sku, name, item_type) values ('RLS-X', 'x', 'raw'); v_ok := false; v_msg := 'cashier inserted an item';
  exception when others then v_ok := sqlerrm like '%row-level security%' or sqlerrm like '%permission denied%'; v_msg := sqlerrm; end;
  reset role; insert into _rls_results values ('cashier cannot write master data', v_ok, v_msg);

  set local role authenticated;
  begin insert into sales (receipt_no, location_id, business_date, sold_at) values ('X', 1, public._today(), now());
        v_ok := false; v_msg := 'cashier inserted a sale directly';
  exception when others then v_ok := sqlerrm like '%permission denied%' or sqlerrm like '%row-level security%'; v_msg := sqlerrm; end;
  reset role; insert into _rls_results values ('cashier cannot write sales directly', v_ok, v_msg);

  set local role authenticated;
  begin delete from journal_lines; get diagnostics v_n = row_count; v_ok := false; v_msg := 'cashier deleted journal rows';
  exception when insufficient_privilege then v_ok := true; v_msg := sqlerrm; end;
  reset role; insert into _rls_results values ('cashier cannot touch the journal', v_ok, v_msg);

  set local role authenticated;
  begin update app_settings set ordering_cost_per_po = 999 where id = 1; get diagnostics v_n = row_count;
        v_ok := v_n = 0; v_msg := 'rows updated: ' || v_n;
  exception when others then v_ok := true; v_msg := sqlerrm; end;
  reset role; insert into _rls_results values ('cashier cannot change settings', v_ok, v_msg);

  set local role authenticated;
  begin perform _post_inventory(1, 1, 'fresh', 1, 'opening'); v_ok := false; v_msg := 'cashier called a helper';
  exception when insufficient_privilege then v_ok := true; v_msg := sqlerrm; end;
  reset role; insert into _rls_results values ('cashier cannot call internal helpers', v_ok, v_msg);

  set local role authenticated;
  select count(*) into v_n from items; v_ok := v_n >= 0;
  reset role;
  insert into _rls_results values ('cashier can read items', (select count(*) from items) = 0 or v_n > 0, 'items visible: ' || v_n);

  if v_shop is null then
    insert into _rls_results values ('cashier sale (needs seeded stock)', true, 'skipped: no stocked shop');
  else
    set local role authenticated;
    begin
      v_res := complete_sale(v_shop, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1)), null,
                 '{"method":"card"}'::jsonb, null, 'pos', 1, now() - interval '40 days');
      v_ok := true; v_msg := v_res::text;
    exception when others then v_ok := false; v_msg := sqlerrm; end;
    reset role;
    insert into _rls_results values ('cashier can complete a sale', v_ok, v_msg);
    insert into _rls_results select 'p_at ignored for non-system sessions',
      (select abs(extract(epoch from now() - sold_at)) < 120 and cashier_id = v_uid and channel = 'pos' from sales where id = (v_res->>'sale_id')::bigint), null;
    insert into _rls_results select 'server-side price used',
      (select sl.unit_price = i.list_price from sale_lines sl join items i on i.id = sl.item_id where sl.sale_id = (v_res->>'sale_id')::bigint limit 1), null;

    set local role authenticated;
    begin
      perform complete_sale(v_shop, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1000000)));
      v_ok := false; v_msg := 'oversell allowed';
    exception when others then v_ok := sqlerrm like 'Only % left at %' or sqlerrm like 'No % left at %'; v_msg := sqlerrm; end;
    reset role;
    insert into _rls_results values ('overselling gives a clear message', v_ok, v_msg);

    set local role authenticated;
    begin perform complete_sale(v_shop, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1)), null,
                 '{"method":"cash","tendered":0.01}'::jsonb);
      v_ok := false; v_msg := 'short cash tender accepted';
    exception when others then v_ok := sqlerrm like 'Cash tendered%'; v_msg := sqlerrm; end;
    reset role;
    insert into _rls_results values ('short cash tender is rejected', v_ok, v_msg);
  end if;
end $$;

-- ---------------------------------------------------------------- baker
do $$
declare
  v_uid uuid := (select id from _fx where k = 'baker');
  v_shop bigint := (select n from _fx where k = 'shop');
  v_item bigint := (select n from _fx where k = 'item');
  v_ok boolean; v_msg text; v_mo bigint;
begin
  perform pg_temp._claims(v_uid, 'authenticated');
  if v_shop is not null then
    set local role authenticated;
    begin perform complete_sale(v_shop, jsonb_build_array(jsonb_build_object('item_id', v_item, 'qty', 1)));
      v_ok := false; v_msg := 'baker rang a sale';
    exception when others then v_ok := sqlerrm like '%cannot do this%'; v_msg := sqlerrm; end;
    reset role; insert into _rls_results values ('baker cannot ring sales', v_ok, v_msg);
  end if;
  if exists (select 1 from items i where i.is_manufactured and exists (select 1 from bom_lines b where b.parent_item_id = i.id))
     and exists (select 1 from locations where kind = 'kitchen') then
    set local role authenticated;
    begin v_mo := create_production_order((select i.id from items i where i.is_manufactured and exists (select 1 from bom_lines b where b.parent_item_id = i.id) limit 1), 12, public._today());
      v_ok := true; v_msg := 'mo ' || v_mo;
    exception when others then v_ok := false; v_msg := sqlerrm; end;
    reset role; insert into _rls_results values ('baker can schedule production', v_ok, v_msg);
  end if;
  set local role authenticated;
  begin perform send_purchase_order(1); v_ok := false; v_msg := 'baker sent a PO';
  exception when others then v_ok := sqlerrm like '%cannot do this%'; v_msg := sqlerrm; end;
  reset role; insert into _rls_results values ('baker cannot send purchase orders', v_ok, v_msg);
end $$;

-- ---------------------------------------------------------------- manager
do $$
declare
  v_uid uuid := (select id from _fx where k = 'manager');
  v_ok boolean; v_msg text; v_n int; v_id bigint;
begin
  perform pg_temp._claims(v_uid, 'authenticated');
  set local role authenticated;
  begin insert into suppliers (code, name) values ('RLS', 'RLS test supplier') returning id into v_id; v_ok := true; v_msg := 'ok';
  exception when others then v_ok := false; v_msg := sqlerrm; end;
  reset role; insert into _rls_results values ('manager can write master data', v_ok, v_msg);

  set local role authenticated;
  begin update app_settings set ordering_cost_per_po = 50 where id = 1; get diagnostics v_n = row_count; v_ok := v_n = 1; v_msg := 'rows: ' || v_n;
  exception when others then v_ok := false; v_msg := sqlerrm; end;
  reset role; insert into _rls_results values ('manager can change settings', v_ok, v_msg);
  insert into _rls_results select 'settings edit lands on the activity feed', exists (select 1 from app_events where topic = 'settings.updated' and actor_id = v_uid), null;

  set local role authenticated;
  begin delete from journal_lines; v_ok := false; v_msg := 'manager deleted journal rows';
  exception when insufficient_privilege then v_ok := true; v_msg := sqlerrm; end;
  reset role; insert into _rls_results values ('manager cannot write the journal directly', v_ok, v_msg);

  set local role authenticated;
  begin v_id := record_expense(public._today(), '6100', 100, 'rls test', null); v_ok := true; v_msg := 'expense ' || v_id;
  exception when others then v_ok := false; v_msg := sqlerrm; end;
  reset role; insert into _rls_results values ('manager can record an expense (RPC)', v_ok, v_msg);

  set local role authenticated;
  begin perform record_expense(public._today(), '4000', 100, 'bad account'); v_ok := false; v_msg := 'revenue account accepted';
  exception when others then v_ok := sqlerrm like '%not an expense account%'; v_msg := sqlerrm; end;
  reset role; insert into _rls_results values ('expenses require an expense account', v_ok, v_msg);

  set local role authenticated;
  begin perform pnl(public._today() - 30, public._today()); perform * from v_trial_balance; v_ok := true; v_msg := 'ok';
  exception when others then v_ok := false; v_msg := sqlerrm; end;
  reset role; insert into _rls_results values ('manager can read finance reports', v_ok, v_msg);
end $$;

-- ---------------------------------------------------------------- customers
do $$
declare
  a uuid := (select id from _fx where k = 'custA');
  b uuid := (select id from _fx where k = 'custB');
  v_ok boolean; v_msg text; v_n int; v_res jsonb; v_so bigint;
  v_cat record;
begin
  perform pg_temp._claims(a, 'authenticated');
  set local role authenticated;
  select (select count(*) from items) + (select count(*) from item_costs) + (select count(*) from inventory_transactions)
       + (select count(*) from sales) + (select count(*) from journal_lines) + (select count(*) from suppliers)
       + (select count(*) from v_inventory_valuation) + (select count(*) from v_reorder_analysis)
       + (select count(*) from purchase_orders) + (select count(*) from ap_bills) into v_n;
  reset role;
  insert into _rls_results values ('customer sees no items, costs, ledger, sales, GL or suppliers', v_n = 0, 'rows visible: ' || v_n);

  set local role authenticated;
  select count(*) into v_n from customers; reset role;
  insert into _rls_results values ('customer sees only their own customer row', v_n = 1, 'rows: ' || v_n);

  insert into _rls_results values ('catalog function exposes no cost columns',
    not exists (select 1 from pg_proc where proname = 'get_catalog_availability' and pg_get_function_result(oid) ilike '%cost%'), null);

  set local role authenticated;
  select count(*) into v_n from get_catalog_availability(); reset role;
  insert into _rls_results values ('customer can read the catalog', v_n > 0 or not exists (select 1 from items where is_sellable), 'rows: ' || v_n);

  select location_id, item_id into v_cat from get_catalog_availability() limit 1;
  if v_cat.item_id is not null then
    set local role authenticated;
    begin v_res := place_pickup_order(v_cat.location_id, now() + interval '2 days', jsonb_build_array(jsonb_build_object('item_id', v_cat.item_id, 'qty', 2)), 'rls test');
      v_ok := true; v_msg := v_res::text;
    exception when others then v_ok := false; v_msg := sqlerrm; end;
    reset role; insert into _rls_results values ('customer can place a pickup order', v_ok, v_msg);
    v_so := (v_res->>'so_id')::bigint;

    set local role authenticated;
    begin perform place_pickup_order(v_cat.location_id, now() - interval '1 day', jsonb_build_array(jsonb_build_object('item_id', v_cat.item_id, 'qty', 1)));
      v_ok := false; v_msg := 'past pickup accepted';
    exception when others then v_ok := sqlerrm like '%future%'; v_msg := sqlerrm; end;
    reset role; insert into _rls_results values ('pickup time must be in the future', v_ok, v_msg);

    set local role authenticated;
    select count(*) into v_n from sales_orders; reset role;
    insert into _rls_results values ('customer sees only own orders', v_n = 1, 'orders: ' || v_n);

    set local role authenticated;
    select jsonb_array_length(get_my_orders()) into v_n; reset role;
    insert into _rls_results values ('get_my_orders returns own orders', v_n = 1, 'orders: ' || v_n);

    perform pg_temp._claims(b, 'authenticated');
    set local role authenticated;
    select count(*) into v_n from sales_orders; reset role;
    insert into _rls_results values ('other customer sees none of them', v_n = 0, 'orders: ' || v_n);

    set local role authenticated;
    select count(*) into v_n from so_lines; reset role;
    insert into _rls_results values ('other customer sees none of the lines', v_n = 0, 'lines: ' || v_n);

    set local role authenticated;
    begin perform cancel_sales_order(v_so, 'not mine'); v_ok := false; v_msg := 'cancelled someone else''s order';
    exception when others then v_ok := sqlerrm like '%not found%'; v_msg := sqlerrm; end;
    reset role; insert into _rls_results values ('customer cannot cancel another customer''s order', v_ok, v_msg);

    perform pg_temp._claims(a, 'authenticated');
    set local role authenticated;
    select count(*) into v_n from app_events where topic like 'so.%' and customer_id is not null;
    reset role;
    insert into _rls_results values ('customer sees own order events', v_n >= 1, 'events: ' || v_n);

    set local role authenticated;
    select count(*) into v_n from app_events where topic in ('sale.completed', 'po.created', 'po.received', 'mo.completed');
    reset role;
    insert into _rls_results values ('customer does not see staff events', v_n = 0, 'events: ' || v_n);

    set local role authenticated;
    begin perform cancel_sales_order(v_so, 'changed my mind'); v_ok := true; v_msg := 'ok';
    exception when others then v_ok := false; v_msg := sqlerrm; end;
    reset role; insert into _rls_results values ('customer can cancel their own placed order', v_ok, v_msg);
  end if;

  perform pg_temp._claims(a, 'authenticated');
  set local role authenticated;
  begin perform create_sales_order(1, 1, now(), '[]'::jsonb); v_ok := false; v_msg := 'customer created an order for a customer';
  exception when others then v_ok := sqlerrm like '%cannot do this%'; v_msg := sqlerrm; end;
  reset role; insert into _rls_results values ('customer cannot use staff order creation', v_ok, v_msg);

  set local role authenticated;
  begin perform close_business_day(1); v_ok := false; v_msg := 'customer closed a day';
  exception when others then v_ok := sqlerrm like '%cannot do this%'; v_msg := sqlerrm; end;
  reset role; insert into _rls_results values ('customer cannot close the day', v_ok, v_msg);

  set local role authenticated;
  begin update profiles set role = 'manager' where user_id = a; get diagnostics v_n = row_count; v_ok := v_n = 0; v_msg := 'rows: ' || v_n;
  exception when others then v_ok := true; v_msg := sqlerrm; end;
  reset role;
  insert into _rls_results values ('customer cannot promote themselves', v_ok and (select role from profiles where user_id = a) = 'customer', v_msg);

  set local role authenticated;
  begin update customers set name = 'hacked' where id <> (select my_customer_id()); get diagnostics v_n = row_count; v_ok := v_n = 0;
  exception when others then v_ok := true; end;
  reset role;
  insert into _rls_results values ('customer cannot edit customers', v_ok, null);
end $$;

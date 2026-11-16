-- Run as postgres after all migrations; fixtures and business postings are rolled back.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify/bom_consumption.sql
begin;

do $$
declare
  v_prefix text := 'BOM-TEST-' || gen_random_uuid()::text;
  v_kitchen bigint; v_shop bigint; v_flour bigint; v_sugar bigint;
  v_parent bigint; v_kit bigint; v_mo bigint; v_empty_mo bigint;
  v_customer bigint; v_so bigint; v_sale jsonb;
  v_sales bigint; v_txns bigint; v_journals bigint; v_denied boolean;
begin
  if has_function_privilege('authenticated', '_require_sale_recipe()', 'execute')
     or has_function_privilege('authenticated', '_require_production_recipe()', 'execute')
     or has_function_privilege('anon', '_require_sale_recipe()', 'execute')
     or has_function_privilege('anon', '_require_production_recipe()', 'execute') then
    raise exception 'Internal BOM guards must not be executable by API roles';
  end if;
  raise notice 'PASS: recipe guard functions are private to trigger execution';

  insert into locations(code, name, kind) values(v_prefix || '-K', 'BOM test kitchen', 'kitchen') returning id into v_kitchen;
  insert into locations(code, name, kind) values(v_prefix || '-S', 'BOM test shop', 'shop') returning id into v_shop;
  insert into items(sku, name, item_type, is_purchasable, uom, lead_time_days)
    values(v_prefix || '-F', 'BOM test flour', 'raw', true, 'lb', 3) returning id into v_flour;
  insert into items(sku, name, item_type, is_purchasable, uom, lead_time_days)
    values(v_prefix || '-G', 'BOM test sugar', 'raw', true, 'lb', 2) returning id into v_sugar;
  insert into items(sku, name, item_type, is_manufactured, is_sellable, list_price)
    values(v_prefix || '-P', 'BOM test parent', 'finished', true, true, 3) returning id into v_parent;
  insert into items(sku, name, item_type, is_sellable, list_price)
    values(v_prefix || '-B', 'BOM test bundle', 'kit', true, 9) returning id into v_kit;
  insert into bom_lines(parent_item_id, component_item_id, qty_per) values
    (v_parent, v_flour, 2), (v_parent, v_sugar, 0.5),
    (v_kit, v_flour, 1.5), (v_kit, v_sugar, 0.25);
  perform _post_opening(jsonb_build_array(
    jsonb_build_object('item_id', v_flour, 'location_id', v_kitchen, 'qty', 20, 'unit_cost', 1),
    jsonb_build_object('item_id', v_sugar, 'location_id', v_kitchen, 'qty', 10, 'unit_cost', 2),
    jsonb_build_object('item_id', v_flour, 'location_id', v_shop, 'qty', 10, 'unit_cost', 1),
    jsonb_build_object('item_id', v_sugar, 'location_id', v_shop, 'qty', 4, 'unit_cost', 2)), 0, now());

  v_mo := create_production_order(v_parent, 3, _today(), v_kitchen, null, now());
  perform start_production_order(v_mo, null, now());
  if (select qty_on_hand from inventory_balances where item_id = v_flour and location_id = v_kitchen) <> 14
     or (select qty_on_hand from inventory_balances where item_id = v_sugar and location_id = v_kitchen) <> 8.5
     or (select sum(-qty_delta) from inventory_transactions where ref_type = 'production_order' and ref_id = v_mo and txn_type = 'prod_issue') <> 7.5 then
    raise exception 'Production did not consume parent quantity times recipe quantities';
  end if;
  raise notice 'PASS: production consumes each component quantity per parent';

  v_sale := complete_sale(v_shop, jsonb_build_array(jsonb_build_object('item_id', v_kit, 'qty', 2)), p_at => now());
  if (select qty_on_hand from inventory_balances where item_id = v_flour and location_id = v_shop) <> 7
     or (select qty_on_hand from inventory_balances where item_id = v_sugar and location_id = v_shop) <> 3.5
     or exists(select 1 from inventory_transactions where ref_type = 'sale' and ref_id = (v_sale->>'sale_id')::bigint and item_id = v_kit) then
    raise exception 'Kit sale did not consume its components directly';
  end if;
  raise notice 'PASS: kit sale consumes components, without stocking the kit';

  insert into customers(name) values('BOM test customer') returning id into v_customer;
  v_so := create_sales_order(v_customer, v_shop, now() + interval '1 day',
    jsonb_build_array(jsonb_build_object('item_id', v_kit, 'qty', 1)), p_at => now());
  perform fulfill_sales_order(v_so, p_at => now());
  if (select qty_on_hand from inventory_balances where item_id = v_flour and location_id = v_shop) <> 5.5
     or (select qty_on_hand from inventory_balances where item_id = v_sugar and location_id = v_shop) <> 3.25
     or (select status from sales_orders where id = v_so) <> 'fulfilled' then
    raise exception 'Kit sales-order fulfillment did not consume recipe quantities';
  end if;
  raise notice 'PASS: sales-order fulfillment consumes the kit components';

  v_mo := create_production_order(v_parent, 100, _today(), v_kitchen, null, now());
  select count(*) into v_txns from inventory_transactions;
  select count(*) into v_journals from journal_entries;
  v_denied := false;
  begin
    perform start_production_order(v_mo, null, now());
  exception when raise_exception then
    if sqlerrm not like '%left at%' then raise; end if;
    v_denied := true;
  end;
  if not v_denied or (select status from production_orders where id = v_mo) <> 'planned'
     or (select count(*) from inventory_transactions) <> v_txns
     or (select count(*) from journal_entries) <> v_journals then
    raise exception 'Insufficient production stock did not leave documents and ledgers unchanged';
  end if;
  raise notice 'PASS: insufficient production stock rolls back atomically';

  select count(*) into v_sales from sales;
  v_denied := false;
  begin
    perform complete_sale(v_shop, jsonb_build_array(jsonb_build_object('item_id', v_kit, 'qty', 100)), p_at => now());
  exception when raise_exception then
    if sqlerrm not like '%left at%' then raise; end if;
    v_denied := true;
  end;
  if not v_denied or (select count(*) from sales) <> v_sales
     or (select count(*) from inventory_transactions) <> v_txns
     or (select count(*) from journal_entries) <> v_journals then
    raise exception 'Insufficient kit stock did not leave documents and ledgers unchanged';
  end if;
  raise notice 'PASS: insufficient kit stock rolls back atomically';

  v_empty_mo := create_production_order(v_parent, 1, _today(), v_kitchen, null, now());
  delete from bom_lines where parent_item_id = v_parent;
  v_denied := false;
  begin
    perform start_production_order(v_empty_mo, null, now());
  exception when raise_exception then
    if sqlerrm not like '%recipe (BOM)%' then raise; end if;
    v_denied := true;
  end;
  if not v_denied or (select status from production_orders where id = v_empty_mo) <> 'planned'
     or (select count(*) from inventory_transactions) <> v_txns
     or (select count(*) from journal_entries) <> v_journals then
    raise exception 'Production with a deleted recipe must be rejected without postings';
  end if;
  raise notice 'PASS: production rejects a recipe removed after scheduling';

  v_so := create_sales_order(v_customer, v_shop, now() + interval '1 day',
    jsonb_build_array(jsonb_build_object('item_id', v_kit, 'qty', 1)), p_at => now());
  delete from bom_lines where parent_item_id = v_kit;
  v_denied := false;
  begin
    perform complete_sale(v_shop, jsonb_build_array(jsonb_build_object('item_id', v_kit, 'qty', 1)), p_at => now());
  exception when raise_exception then
    if sqlerrm not like '%recipe (BOM)%' then raise; end if;
    v_denied := true;
  end;
  if not v_denied or (select count(*) from sales) <> v_sales
     or (select count(*) from inventory_transactions) <> v_txns then
    raise exception 'Empty kit recipe must be rejected without sales or inventory postings';
  end if;
  raise notice 'PASS: kit sales reject an empty recipe';

  v_denied := false;
  begin
    perform fulfill_sales_order(v_so, p_at => now());
  exception when raise_exception then
    if sqlerrm not like '%recipe (BOM)%' then raise; end if;
    v_denied := true;
  end;
  if not v_denied or (select status from sales_orders where id = v_so) <> 'placed'
     or (select count(*) from sales) <> v_sales
     or (select count(*) from inventory_transactions) <> v_txns
     or (select count(*) from journal_entries) <> v_journals then
    raise exception 'Empty recipe fulfillment must leave order and ledgers unchanged';
  end if;
  raise notice 'PASS: sales-order fulfillment also rejects an empty kit recipe';
end $$;

rollback;

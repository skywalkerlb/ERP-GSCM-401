-- One-time operation, never a migration or demo-reset replacement.
-- The runner locks all public tables + auth.users and checks the restored backup manifest.
do $$ begin
 if to_regclass('public.businesses') is not null then raise exception 'Legacy global cleanup is retired for multi-business databases.'; end if;
 if current_setting('glazed.cleanup_authorized',true) is distinct from 'wzsbtfzettxpczgulibd' then raise exception 'Verified cleanup runner required.'; end if;
 if (select count(*) from profiles where role='owner')<>1 or not exists(select 1 from business_setup where completed_at is not null and owner_id='62a267bd-8628-4a0e-80f0-4bc52aa5f3a7') then raise exception 'Owner state changed.'; end if;
end $$;
update auth.users set banned_until=now()+interval '100 years' where email=any(current_setting('glazed.sample_emails')::text[]);
delete from auth.refresh_tokens where user_id in (select id::text from auth.users where email=any(current_setting('glazed.sample_emails')::text[]));
delete from auth.sessions where user_id in (select id from auth.users where email=any(current_setting('glazed.sample_emails')::text[]));
truncate app_events, expenses, ap_payments, ap_bills, po_receipt_lines, po_receipts, po_lines, purchase_orders,
 production_defects, production_orders, day_closes, adjustment_lines, inventory_adjustments, transfer_lines, transfers,
 bake_plan_lines, bake_plans, demand_forecasts, forecast_runs, return_lines, returns, sale_lines, sales,
 so_lines, sales_orders, inventory_transactions, inventory_balances, journal_lines, journal_entries,
 promotions, bom_lines, item_suppliers, item_costs, items, suppliers;
update profiles set home_location_id=null;
update customers set home_location_id=null;
update business_setup set location_id=null where id=1;
update profiles set customer_id=null where user_id in (select id from auth.users where email=any(current_setting('glazed.sample_emails')::text[]));
delete from profiles where user_id in (select id from auth.users where email=any(current_setting('glazed.sample_emails')::text[]));
delete from customers c where not exists(select 1 from profiles p where p.customer_id=c.id) and
 (c.auth_user_id is null or c.auth_user_id in (select id from auth.users where email=any(current_setting('glazed.sample_emails')::text[])));
delete from locations;
-- Only this setting differs from schema defaults due to seed. Preserve business identity.
update app_settings set ordering_cost_per_po=45;
delete from app_events;

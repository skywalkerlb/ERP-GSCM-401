-- 0014: auth wiring, row level security, grants, realtime, function privileges.

-- ---------------------------------------------------------------- signup trigger
-- Portal signups become customers. Staff accounts are created by an admin with app_metadata
-- {"role": "manager|cashier|baker", "home_location_code": "PRV"} (app_metadata cannot be set by a signing-up user).
create function handle_new_user() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_role text := new.raw_app_meta_data->>'role';
  v_name text := coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''),
                          split_part(coalesce(new.email, 'customer'), '@', 1));
  v_cust bigint;
  v_loc  bigint;
begin
  if v_role in ('manager', 'cashier', 'baker') then
    select id into v_loc from locations where code = new.raw_app_meta_data->>'home_location_code';
    insert into profiles (user_id, full_name, role, home_location_id)
    values (new.id, v_name, v_role::app_role, v_loc)
    on conflict (user_id) do update set full_name = excluded.full_name, role = excluded.role, home_location_id = excluded.home_location_id;
    return new;
  end if;

  -- link to an existing customer with the same email, otherwise create one
  select id into v_cust from customers
   where new.email is not null and lower(email) = lower(new.email) and auth_user_id is null
   order by id limit 1;
  if v_cust is not null then
    update customers set auth_user_id = new.id where id = v_cust;
  else
    insert into customers (auth_user_id, name, kind, email) values (new.id, v_name, 'retail', new.email)
    returning id into v_cust;
  end if;
  insert into profiles (user_id, full_name, role, customer_id)
  values (new.id, (select name from customers where id = v_cust), 'customer', v_cust)
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Settings edits are written directly by managers; this puts them on the activity feed.
create function _settings_touch() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger app_settings_touch before update on app_settings for each row execute function _settings_touch();

create function _settings_event_after() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into app_events (topic, entity, entity_id, actor_id, summary)
  values ('settings.updated', 'app_settings', 1, auth.uid(), 'Settings updated');
  return null;
end $$;
create trigger app_settings_event after update on app_settings for each row execute function _settings_event_after();

-- ---------------------------------------------------------------- row level security
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- staff read everything operational
do $$
declare t text;
begin
  foreach t in array array[
    'suppliers', 'items', 'item_suppliers', 'bom_lines', 'promotions', 'app_settings', 'gl_accounts',
    'journal_entries', 'journal_lines', 'inventory_transactions', 'inventory_balances', 'item_costs',
    'sales', 'sale_lines', 'returns', 'return_lines', 'forecast_runs', 'demand_forecasts', 'bake_plans',
    'bake_plan_lines', 'transfers', 'transfer_lines', 'inventory_adjustments', 'adjustment_lines', 'day_closes',
    'production_orders', 'production_defects', 'purchase_orders', 'po_lines', 'po_receipts', 'po_receipt_lines',
    'ap_bills', 'ap_payments', 'expenses'
  ] loop
    execute format('create policy staff_select on public.%I for select to authenticated using ((select public.is_staff()))', t);
  end loop;
end $$;

-- managers write master data directly (everything else is RPC-only: no write policies exist)
do $$
declare t text;
begin
  foreach t in array array['locations', 'suppliers', 'items', 'item_suppliers', 'bom_lines', 'customers', 'promotions', 'reason_codes'] loop
    execute format('create policy manager_insert on public.%I for insert to authenticated with check ((select public.auth_role()) = ''manager'')', t);
    execute format('create policy manager_update on public.%I for update to authenticated using ((select public.auth_role()) = ''manager'') with check ((select public.auth_role()) = ''manager'')', t);
    execute format('create policy manager_delete on public.%I for delete to authenticated using ((select public.auth_role()) = ''manager'')', t);
  end loop;
end $$;
create policy manager_update on app_settings for update to authenticated
  using ((select auth_role()) = 'manager') with check ((select auth_role()) = 'manager');
create policy manager_update on profiles for update to authenticated
  using ((select auth_role()) = 'manager') with check ((select auth_role()) = 'manager');

-- any signed-in user may read shops and reason labels (no sensitive columns)
create policy auth_select on locations for select to authenticated using (true);
create policy auth_select on reason_codes for select to authenticated using (true);

-- profiles: your own row, staff see everyone (for presence and activity names)
create policy own_or_staff_select on profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select is_staff()));

-- customers: staff all, a customer only their own record
create policy staff_or_own_select on customers for select to authenticated
  using ((select is_staff()) or id = (select my_customer_id()));

-- sales orders: staff all, customers only their own orders and lines
create policy staff_or_own_select on sales_orders for select to authenticated
  using ((select is_staff()) or customer_id = (select my_customer_id()));
create policy staff_or_own_select on so_lines for select to authenticated
  using ((select is_staff()) or exists (select 1 from sales_orders so where so.id = so_lines.so_id and so.customer_id = (select my_customer_id())));

-- activity feed: staff see all; customers see their own order events and stock pings
create policy staff_or_own_select on app_events for select to authenticated
  using ((select is_staff()) or customer_id = (select my_customer_id()) or topic = 'inventory.changed');

-- ---------------------------------------------------------------- table grants (RLS still decides rows)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on locations, suppliers, items, item_suppliers, bom_lines, customers, promotions, reason_codes to authenticated;
grant update on app_settings, profiles to authenticated;
revoke all on doc_sequences from authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from authenticated;

-- ---------------------------------------------------------------- realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_events') then
      alter publication supabase_realtime add table public.app_events;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------- function privileges
-- 1) nothing for PUBLIC or anon.  2) internal helpers (leading underscore) are not callable by signed-in users,
-- except the pure read helpers that invoker-security views and report functions call.  3) RPCs for authenticated.
revoke execute on all functions in schema public from public, anon;
do $$
declare
  f record;
  v_keep text[] := array['_bdate', '_today', '_ts_on', '_fmt_qty', '_in_season', '_season_start', '_mrp_demand'];
begin
  for f in
    select p.oid, p.proname, p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
     where p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    if f.proname like '\_%' and f.proname <> all (v_keep) or f.proname = 'handle_new_user' then
      execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
      execute format('grant execute on function %s to service_role', f.sig);
    else
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;

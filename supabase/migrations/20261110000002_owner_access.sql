-- Owner manages access through the trusted people function. Admin inherits manager operations.
create unique index profiles_single_owner on public.profiles ((role)) where role = 'owner';

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role in ('owner','admin','manager','cashier','baker') from profiles where user_id = auth.uid()), false) $$;

create or replace function public._require_role(p_roles app_role[]) returns void
language plpgsql stable security definer set search_path = public
as $$
declare v_role app_role;
begin
  if _is_system() then return; end if;
  v_role := auth_role();
  if v_role is null then raise exception 'Sign in to continue.' using errcode = '28000'; end if;
  if v_role in ('owner','admin','manager') or v_role = any(p_roles) then return; end if;
  raise exception 'Your % account cannot do this. Ask the owner for access.', v_role using errcode = '42501';
end $$;

do $$
declare t text;
begin
  foreach t in array array['locations','suppliers','items','item_suppliers','bom_lines','customers','promotions','reason_codes'] loop
    execute format('alter policy manager_insert on public.%I with check ((select public.auth_role()) in (''owner'',''admin'',''manager''))',t);
    execute format('alter policy manager_update on public.%I using ((select public.auth_role()) in (''owner'',''admin'',''manager'')) with check ((select public.auth_role()) in (''owner'',''admin'',''manager''))',t);
    execute format('alter policy manager_delete on public.%I using ((select public.auth_role()) in (''owner'',''admin'',''manager''))',t);
  end loop;
end $$;
alter policy manager_update on public.app_settings
  using ((select auth_role()) in ('owner','admin','manager'))
  with check ((select auth_role()) in ('owner','admin','manager'));
drop policy manager_update on public.profiles;
revoke update on public.profiles from authenticated;

-- Defense in depth: even a future overly broad policy cannot turn profile edits into access grants.
create function public._protect_profile_access() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not _is_system() and
    (new.role is distinct from old.role or new.user_id is distinct from old.user_id
     or new.home_location_id is distinct from old.home_location_id or new.customer_id is distinct from old.customer_id) then
    raise exception 'Only the trusted access service may change account access.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger protect_profile_access before update on public.profiles
for each row execute function public._protect_profile_access();
revoke execute on function public._protect_profile_access() from public,anon,authenticated;
grant execute on function public._protect_profile_access() to service_role;
grant select,insert,update on public.profiles,public.customers to service_role;

-- Public signup remains customer-only. Only trusted app metadata may create ordinary staff;
-- owner is deliberately excluded and bootstrapped separately from a verified account.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role text := new.raw_app_meta_data->>'role';
  v_name text := coalesce(nullif(new.raw_user_meta_data->>'full_name',''),nullif(new.raw_user_meta_data->>'name',''),split_part(coalesce(new.email,'customer'),'@',1));
  v_cust bigint;
  v_loc bigint;
begin
  if v_role in ('admin','manager','cashier','baker') then
    select id into v_loc from locations where code = new.raw_app_meta_data->>'home_location_code';
    insert into profiles(user_id,full_name,role,home_location_id)
    values(new.id,v_name,v_role::app_role,v_loc) on conflict(user_id) do nothing;
    return new;
  end if;
  select id into v_cust from customers where auth_user_id = new.id limit 1;
  if v_cust is null then
    select id into v_cust from customers where new.email is not null and lower(email)=lower(new.email) and auth_user_id is null order by id limit 1 for update;
    if v_cust is not null then
      update customers set auth_user_id=new.id where id=v_cust;
    else
      insert into customers(auth_user_id,name,kind,email) values(new.id,v_name,'retail',new.email) returning id into v_cust;
    end if;
  end if;
  insert into profiles(user_id,full_name,role,customer_id) values(new.id,v_name,'customer',v_cust) on conflict(user_id) do nothing;
  return new;
end $$;

-- Accounts may predate the schema. Reuse the trigger while retaining its customer linkage behavior.
-- Ignore old metadata during backfill: historical users must not silently gain staff permissions.
do $$
declare u record; v_cust bigint; v_name text;
begin
  for u in select a.* from auth.users a where not exists(select 1 from profiles p where p.user_id=a.id) loop
    v_name := coalesce(nullif(u.raw_user_meta_data->>'full_name',''),split_part(coalesce(u.email,'customer'),'@',1));
    select id into v_cust from customers where auth_user_id=u.id limit 1;
    if v_cust is null then
      select id into v_cust from customers where u.email is not null and lower(email)=lower(u.email) and auth_user_id is null order by id limit 1 for update;
      if v_cust is null then
        insert into customers(auth_user_id,name,kind,email) values(u.id,v_name,'retail',u.email) returning id into v_cust;
      else update customers set auth_user_id=u.id where id=v_cust;
      end if;
    end if;
    insert into profiles(user_id,full_name,role,customer_id) values(u.id,v_name,'customer',v_cust);
  end loop;
end $$;

-- Service-only atomic role assignment. Customer demotion must create/reuse the portal linkage.
create function public._set_account_access(p_user uuid,p_role app_role,p_home_location bigint default null) returns void
language plpgsql security definer set search_path = public
as $$
declare p profiles%rowtype; u auth.users%rowtype; v_customer bigint;
begin
  if not _is_system() then raise exception 'Trusted access service required.' using errcode='42501'; end if;
  if p_role not in ('admin','manager','cashier','baker','customer') then raise exception 'Owner assignment is unavailable.' using errcode='42501'; end if;
  select * into p from profiles where user_id=p_user for update;
  if not found then raise exception 'Account profile not found.'; end if;
  if p.role='owner' then raise exception 'Owner access cannot be changed here.' using errcode='42501'; end if;
  if p_home_location is not null and not exists(select 1 from locations where id=p_home_location and is_active) then raise exception 'Choose an active location.'; end if;
  v_customer := p.customer_id;
  if p_role='customer' and v_customer is null then
    select * into strict u from auth.users where id=p_user;
    select id into v_customer from customers where auth_user_id=p_user limit 1;
    if v_customer is null then
      select id into v_customer from customers where u.email is not null and lower(email)=lower(u.email) and auth_user_id is null order by id limit 1 for update;
      if v_customer is null then
        insert into customers(auth_user_id,name,kind,email) values(p_user,coalesce(nullif(p.full_name,''),split_part(coalesce(u.email,'customer'),'@',1)),'retail',u.email) returning id into v_customer;
      else update customers set auth_user_id=p_user where id=v_customer;
      end if;
    end if;
  end if;
  update profiles set role=p_role,home_location_id=p_home_location,customer_id=v_customer where user_id=p_user;
end $$;
revoke execute on function public._set_account_access(uuid,app_role,bigint) from public,anon,authenticated;
grant execute on function public._set_account_access(uuid,app_role,bigint) to service_role;

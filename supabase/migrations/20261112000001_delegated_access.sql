-- Delegated account access is verified inside the same transaction as the change.
create table public.account_access_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  target_id uuid not null,
  previous_role app_role not null,
  new_role app_role not null,
  previous_home_location_id bigint,
  new_home_location_id bigint,
  changed_at timestamptz not null default now()
);
alter table public.account_access_audit enable row level security;
revoke all on public.account_access_audit from public,anon,authenticated;
grant select,insert on public.account_access_audit to service_role;
revoke all on sequence public.account_access_audit_id_seq from public,anon,authenticated;
grant usage on sequence public.account_access_audit_id_seq to service_role;

create function public._account_role_allowed(p_actor app_role,p_role app_role) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(case p_actor
    when 'owner' then p_role in ('admin','manager','cashier','baker','customer')
    when 'admin' then p_role in ('manager','cashier','baker','customer')
    when 'manager' then p_role in ('cashier','baker','customer')
    else false end,false)
$$;
revoke execute on function public._account_role_allowed(app_role,app_role) from public,anon,authenticated;
grant execute on function public._account_role_allowed(app_role,app_role) to service_role;

-- Locks are retained through the enclosing access update transaction. Null target is
-- used only to preauthorize creation before Auth sends a new account invitation.
create function public._authorize_account_access(p_actor uuid,p_user uuid,p_role app_role) returns void
language plpgsql security definer set search_path = public as $$
declare v_actor app_role; v_target app_role;
begin
  if not _is_system() then raise exception 'Trusted access service required.' using errcode='42501'; end if;
  if p_actor is null or p_actor=p_user then raise exception 'You cannot change your own access.' using errcode='42501'; end if;
  perform user_id from profiles where user_id in (p_actor,p_user) order by user_id for update;
  select role into v_actor from profiles where user_id=p_actor;
  if not _account_role_allowed(v_actor,p_role) then raise exception 'Your role cannot assign that access level.' using errcode='42501'; end if;
  if p_user is not null then
    select role into v_target from profiles where user_id=p_user;
    if not found then raise exception 'Account profile not found.'; end if;
    if not _account_role_allowed(v_actor,v_target) then raise exception 'Your role cannot change this account.' using errcode='42501'; end if;
  end if;
end $$;
revoke execute on function public._authorize_account_access(uuid,uuid,app_role) from public,anon,authenticated;
grant execute on function public._authorize_account_access(uuid,uuid,app_role) to service_role;

-- Remove the earlier service entry point, which had no verified actor parameter.
drop function public._set_account_access(uuid,app_role,bigint);
create function public._set_account_access(p_actor uuid,p_user uuid,p_role app_role,p_home_location bigint default null) returns void
language plpgsql security definer set search_path = public
as $$
declare p profiles%rowtype; u auth.users%rowtype; v_customer bigint;
begin
  if not _is_system() then raise exception 'Trusted access service required.' using errcode='42501'; end if;
  perform public._authorize_account_access(p_actor,p_user,p_role);
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
  insert into account_access_audit(actor_id,target_id,previous_role,new_role,previous_home_location_id,new_home_location_id)
  values(p_actor,p_user,p.role,p_role,p.home_location_id,p_home_location);
  update profiles set role=p_role,home_location_id=p_home_location,customer_id=v_customer where user_id=p_user;
end $$;
revoke execute on function public._set_account_access(uuid,uuid,app_role,bigint) from public,anon,authenticated;
grant execute on function public._set_account_access(uuid,uuid,app_role,bigint) to service_role;

-- Own-profile subscriptions refresh the authoritative role immediately; polling remains the fallback.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and
     not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

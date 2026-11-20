-- Trusted People API: each request supplies a verified actor and explicit business.
-- These are deliberately postgres-owned, service-only entry points. Every lookup
-- includes business_id; no request can change a global Auth password or identity.
create function public._tenant_authorize_account_access(p_business_id uuid,p_actor uuid,p_user uuid,p_role public.app_role)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor_role public.app_role; target_role public.app_role;
begin
  if p_actor is null or p_business_id is null or p_actor=p_user then raise exception 'You cannot change your own access.' using errcode='42501'; end if;
  perform set_config('glazed.business_id',p_business_id::text,true);
  perform user_id from public.profiles where business_id=p_business_id and user_id in(p_actor,p_user) order by user_id for update;
  select role into actor_role from public.profiles where business_id=p_business_id and user_id=p_actor;
  if not public._account_role_allowed(actor_role,p_role) then raise exception 'Your role cannot assign that access.' using errcode='42501'; end if;
  if p_user is not null then
    select role into target_role from public.profiles where business_id=p_business_id and user_id=p_user;
    if found and not public._account_role_allowed(actor_role,target_role) then raise exception 'Your role cannot change this membership.' using errcode='42501'; end if;
  end if;
end $$;

create function public._tenant_people_directory(p_business_id uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor_role public.app_role; result jsonb;
begin
  select role into actor_role from public.profiles where business_id=p_business_id and user_id=p_actor;
  if actor_role is null or actor_role not in('owner','admin','manager') then raise exception 'Your role cannot manage people.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'full_name',p.full_name,'role',p.role,'home_location_id',p.home_location_id,
    'username',p.username,'email',case when u.email like '%@users.glazed.invalid' then '' else coalesce(u.email,'') end,
    'status',case when u.email_confirmed_at is not null then 'active' when u.invited_at is not null then 'invited' else 'unconfirmed' end) order by p.full_name,p.user_id),'[]'::jsonb)
  into result from public.profiles p join auth.users u on u.id=p.user_id where p.business_id=p_business_id;
  return result;
end $$;

create function public._tenant_set_account_access(p_business_id uuid,p_actor uuid,p_user uuid,p_role public.app_role,p_home_location bigint default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.profiles%rowtype; account auth.users%rowtype; customer bigint; full_name text;
begin
  perform public._tenant_authorize_account_access(p_business_id,p_actor,p_user,p_role);
  if p_user is null then raise exception 'Choose an account.'; end if;
  select * into strict account from auth.users where id=p_user;
  if p_home_location is not null and not exists(select 1 from public.locations where business_id=p_business_id and id=p_home_location and is_active) then raise exception 'Choose an active location in this business.'; end if;
  select * into prior from public.profiles where business_id=p_business_id and user_id=p_user;
  customer:=prior.customer_id;
  full_name:=coalesce(prior.full_name,nullif(account.raw_user_meta_data->>'full_name',''),split_part(account.email,'@',1));
  if p_role='customer' and customer is null then
    select id into customer from public.customers where business_id=p_business_id and auth_user_id=p_user;
    if customer is null then
      insert into public.customers(business_id,auth_user_id,name,kind,email)
      values(p_business_id,p_user,full_name,'retail',case when account.email like '%@users.glazed.invalid' then null else account.email end) returning id into customer;
    end if;
  end if;
  insert into public.profiles(business_id,user_id,full_name,role,home_location_id,customer_id,username)
  values(p_business_id,p_user,full_name,p_role,p_home_location,customer,case when account.email like '%@users.glazed.invalid' then split_part(account.email,'@',1) else null end)
  on conflict(business_id,user_id) do update set role=excluded.role,home_location_id=excluded.home_location_id,customer_id=excluded.customer_id;
  insert into public.account_access_audit(business_id,actor_id,target_id,previous_role,new_role,previous_home_location_id,new_home_location_id)
  values(p_business_id,p_actor,p_user,coalesce(prior.role,'customer'),p_role,prior.home_location_id,p_home_location);
end $$;

revoke all on function public._tenant_authorize_account_access(uuid,uuid,uuid,public.app_role) from public,anon,authenticated;
revoke all on function public._tenant_people_directory(uuid,uuid) from public,anon,authenticated;
revoke all on function public._tenant_set_account_access(uuid,uuid,uuid,public.app_role,bigint) from public,anon,authenticated;
grant execute on function public._tenant_authorize_account_access(uuid,uuid,uuid,public.app_role) to service_role;
grant execute on function public._tenant_people_directory(uuid,uuid) to service_role;
grant execute on function public._tenant_set_account_access(uuid,uuid,uuid,public.app_role,bigint) to service_role;

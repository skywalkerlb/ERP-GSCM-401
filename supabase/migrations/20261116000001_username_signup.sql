-- Username identities use a reserved, non-deliverable Auth address. It is an
-- internal identifier, never a verified customer contact address.
alter table public.profiles add column username text
  check (username is null or username ~ '^[a-z0-9_]{3,30}$');
create unique index profiles_username_key on public.profiles(username) where username is not null;

-- Preserve any existing canonical username identities without assigning names
-- to legacy email accounts or changing their passwords, roles or customer IDs.
update public.profiles p set username=split_part(u.email,'@',1)
from auth.users u where u.id=p.user_id and u.email ~ '^[a-z0-9_]{3,30}@users[.]glazed[.]invalid$';
-- Canonical reserved identities created before this migration may lack metadata.
-- Populate it before installing the update guard so normal Auth session/password
-- updates remain possible; roles, passwords and business links are unchanged.
update auth.users u set raw_user_meta_data=coalesce(u.raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('username',p.username)
from public.profiles p where p.user_id=u.id and p.username is not null;

create or replace function public._protect_profile_access() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.username is distinct from old.username then
    raise exception 'Usernames cannot be changed.' using errcode='42501';
  end if;
  if not _is_system() and
    (new.role is distinct from old.role or new.user_id is distinct from old.user_id
     or new.home_location_id is distinct from old.home_location_id or new.customer_id is distinct from old.customer_id) then
    raise exception 'Only the trusted access service may change account access.' using errcode='42501';
  end if;
  return new;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := new.raw_app_meta_data->>'role';
  v_username text;
  v_email text := new.email;
  v_name text;
  v_cust bigint;
  v_loc bigint;
begin
  if lower(split_part(coalesce(new.email,''),'@',2))='users.glazed.invalid' then
    v_username := lower(btrim(new.raw_user_meta_data->>'username'));
    if v_username is null or v_username !~ '^[a-z0-9_]{3,30}$'
       or new.email is distinct from v_username||'@users.glazed.invalid' then
      raise exception 'Choose a valid username matching the account identity.' using errcode='23514';
    end if;
    v_email := null;
  end if;
  v_name := coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'),''),nullif(btrim(new.raw_user_meta_data->>'name'),''),v_username,split_part(coalesce(new.email,'customer'),'@',1));
  if v_role in ('admin','manager','cashier','baker') then
    select id into v_loc from locations where code=new.raw_app_meta_data->>'home_location_code';
    insert into profiles(user_id,full_name,role,home_location_id,username)
    values(new.id,v_name,v_role::app_role,v_loc,v_username);
    return new;
  end if;
  -- An email address is no longer proof that a signup owns an existing customer.
  -- Link only by the authenticated user ID; never claim rows by matching email.
  select id into v_cust from customers where auth_user_id=new.id limit 1;
  if v_cust is null then
    insert into customers(auth_user_id,name,kind,email)
    values(new.id,v_name,'retail',v_email) returning id into v_cust;
  end if;
  insert into profiles(user_id,full_name,role,customer_id,username)
  values(new.id,v_name,'customer',v_cust,v_username);
  return new;
end $$;

-- Auth's updateUser API must not rename a username, release it for reuse, or
-- let a legacy account acquire a reserved identifier without creating a profile.
create function public._protect_username_identity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old_reserved boolean; v_new_reserved boolean;
begin
  v_old_reserved := lower(split_part(coalesce(old.email,''),'@',2))='users.glazed.invalid';
  v_new_reserved := lower(split_part(coalesce(new.email,''),'@',2))='users.glazed.invalid';
  if (v_old_reserved or v_new_reserved) and new.email is distinct from old.email then
    raise exception 'Username account identities cannot be changed.' using errcode='23514';
  end if;
  if v_old_reserved and lower(btrim(new.raw_user_meta_data->>'username')) is distinct from split_part(old.email,'@',1) then
    raise exception 'Username account identities cannot be changed.' using errcode='23514';
  end if;
  return new;
end $$;
create trigger protect_username_identity before update on auth.users
for each row execute function public._protect_username_identity();
revoke execute on function public._protect_username_identity() from public,anon,authenticated;
grant execute on function public._protect_username_identity() to service_role;

create or replace function public._set_account_access(p_actor uuid,p_user uuid,p_role app_role,p_home_location bigint default null) returns void
language plpgsql security definer set search_path = public as $$
declare p profiles%rowtype; u auth.users%rowtype; v_customer bigint; v_email text;
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
      v_email := case when lower(split_part(coalesce(u.email,''),'@',2))='users.glazed.invalid' then null else u.email end;
      insert into customers(auth_user_id,name,kind,email)
      values(p_user,coalesce(nullif(p.full_name,''),p.username,split_part(coalesce(u.email,'customer'),'@',1)),'retail',v_email) returning id into v_customer;
    end if;
  end if;
  insert into account_access_audit(actor_id,target_id,previous_role,new_role,previous_home_location_id,new_home_location_id)
  values(p_actor,p_user,p.role,p_role,p.home_location_id,p_home_location);
  update profiles set role=p_role,home_location_id=p_home_location,customer_id=v_customer where user_id=p_user;
end $$;

-- Record authorization attempts, not successful password changes: the Auth API
-- call happens after this transaction and may fail. Passwords are never stored.
create table public.account_password_reset_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  target_id uuid not null,
  attempted_at timestamptz not null default now()
);
alter table public.account_password_reset_audit enable row level security;
revoke all on public.account_password_reset_audit from public,anon,authenticated;
grant select,insert on public.account_password_reset_audit to service_role;
revoke all on sequence public.account_password_reset_audit_id_seq from public,anon,authenticated;
grant usage on sequence public.account_password_reset_audit_id_seq to service_role;

create function public._authorize_password_reset(p_actor uuid,p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_role app_role;
begin
  if not _is_system() then raise exception 'Trusted access service required.' using errcode='42501'; end if;
  if p_user is null then raise exception 'Choose an existing username account.' using errcode='42501'; end if;
  -- Lock before reading the role so a concurrent promotion cannot change the
  -- authorization decision while the attempt is checked and logged.
  perform user_id from profiles where user_id in (p_actor,p_user) order by user_id for update;
  select role into v_role from profiles where user_id=p_user and username is not null;
  if not found then raise exception 'Choose an existing username account.' using errcode='42501'; end if;
  perform _authorize_account_access(p_actor,p_user,v_role);
  insert into account_password_reset_audit(actor_id,target_id) values(p_actor,p_user);
end $$;
revoke execute on function public._authorize_password_reset(uuid,uuid) from public,anon,authenticated;
grant execute on function public._authorize_password_reset(uuid,uuid) to service_role;

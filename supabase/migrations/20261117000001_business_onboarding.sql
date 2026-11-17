-- One installation, one permanent first-owner claim. No setup credentials are stored here.
create table public.business_setup (
  id int primary key check (id=1),
  completed_at timestamptz,
  owner_id uuid, -- Deliberately no cascading FK: deleting the owner must never reopen setup.
  location_id bigint
);
insert into public.business_setup(id,completed_at,owner_id,location_id)
select 1,now(),user_id,home_location_id from public.profiles where role='owner' limit 1;
insert into public.business_setup(id) values(1) on conflict do nothing;
alter table public.business_setup enable row level security;
revoke all on public.business_setup from public,anon,authenticated;

create table public.business_setup_attempts (
  bucket text primary key,
  started_at timestamptz not null,
  attempts int not null
);
alter table public.business_setup_attempts enable row level security;
revoke all on public.business_setup_attempts from public,anon,authenticated;

create function public._business_setup_status() returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if not _is_system() then raise exception 'Trusted setup service required.' using errcode='42501'; end if;
  return exists(select 1 from business_setup where id=1 and completed_at is null)
    and not exists(select 1 from profiles where role='owner');
end $$;

-- Attempts commit before checking the secret in the Edge Function, including failed guesses.
-- Fixed global + per-account windows prevent bypass through multiple accounts or workers.
create function public._business_setup_attempt(p_actor uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_global int; v_user int;
begin
  if not _is_system() then raise exception 'Trusted setup service required.' using errcode='42501'; end if;
  if p_actor is null then return false; end if;
  insert into business_setup_attempts values('global',now(),1)
  on conflict(bucket) do update set
    started_at=case when business_setup_attempts.started_at < now()-interval '15 minutes' then now() else business_setup_attempts.started_at end,
    attempts=case when business_setup_attempts.started_at < now()-interval '15 minutes' then 1 else business_setup_attempts.attempts+1 end
  returning attempts into v_global;
  insert into business_setup_attempts values(p_actor::text,now(),1)
  on conflict(bucket) do update set
    started_at=case when business_setup_attempts.started_at < now()-interval '15 minutes' then now() else business_setup_attempts.started_at end,
    attempts=case when business_setup_attempts.started_at < now()-interval '15 minutes' then 1 else business_setup_attempts.attempts+1 end
  returning attempts into v_user;
  return v_global<=30 and v_user<=5;
end $$;

create function public._complete_business_setup(p_actor uuid,p_business_name text,p_location_id bigint default null,
  p_location_name text default null,p_location_address text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s business_setup%rowtype; p profiles%rowtype; v_location bigint;
begin
  if not _is_system() then raise exception 'Trusted setup service required.' using errcode='42501'; end if;
  select * into strict s from business_setup where id=1 for update;
  select * into strict p from profiles where user_id=p_actor for update;
  if s.completed_at is not null then
    if s.owner_id=p_actor and p.role='owner' then
      return jsonb_build_object('completed',true,'location_id',s.location_id);
    end if;
    raise exception 'Business setup is already complete.' using errcode='23505';
  end if;
  if exists(select 1 from profiles where role='owner') then raise exception 'Business setup is already complete.' using errcode='23505'; end if;
  if not exists(select 1 from auth.users where id=p_actor and email is not null and email_confirmed_at is not null
    and lower(split_part(email,'@',2))<>'users.glazed.invalid') then
    raise exception 'Use an email account to set up the business.' using errcode='42501';
  end if;
  if nullif(btrim(p_business_name),'') is null or length(p_business_name)>120 then raise exception 'Enter a business name up to 120 characters.'; end if;
  if exists(select 1 from locations where is_active) then
    select id into v_location from locations where id=p_location_id and is_active;
    if v_location is null then raise exception 'Choose an existing active location.'; end if;
  else
    if nullif(btrim(p_location_name),'') is null or length(p_location_name)>120 then raise exception 'Enter a shop name up to 120 characters.'; end if;
    if nullif(btrim(p_location_address),'') is null or length(p_location_address)>500 then raise exception 'Enter a shop address up to 500 characters.'; end if;
    insert into locations(code,name,kind,address,tax_rate,created_by)
      values('SHOP-'||substr(gen_random_uuid()::text,1,8),btrim(p_location_name),'shop',btrim(p_location_address),0.0725,p_actor)
      returning id into v_location;
  end if;
  insert into app_settings(id,business_name,updated_by) values(1,btrim(p_business_name),p_actor)
    on conflict(id) do update set business_name=excluded.business_name,updated_by=excluded.updated_by;
  insert into account_access_audit(actor_id,target_id,previous_role,new_role,previous_home_location_id,new_home_location_id)
    values(p_actor,p_actor,p.role,'owner',p.home_location_id,v_location);
  update profiles set role='owner',home_location_id=v_location where user_id=p_actor;
  update business_setup set completed_at=now(),owner_id=p_actor,location_id=v_location where id=1;
  return jsonb_build_object('completed',true,'location_id',v_location);
end $$;

-- Manual/trusted owner assignment also permanently closes registration.
create function public._close_business_setup_on_owner() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.role='owner' then
    update business_setup set completed_at=coalesce(completed_at,now()),owner_id=coalesce(owner_id,new.user_id),
      location_id=coalesce(location_id,new.home_location_id) where id=1;
  end if;
  return new;
end $$;
create trigger close_business_setup_on_owner after insert or update of role on public.profiles
for each row execute function public._close_business_setup_on_owner();

revoke execute on function public._business_setup_status(),public._business_setup_attempt(uuid),
  public._complete_business_setup(uuid,text,bigint,text,text),public._close_business_setup_on_owner() from public,anon,authenticated;
grant execute on function public._business_setup_status(),public._business_setup_attempt(uuid),
  public._complete_business_setup(uuid,text,bigint,text,text) to service_role;

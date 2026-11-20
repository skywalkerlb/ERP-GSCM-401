-- Trusted psql connection only, after migrations. Never expose this through an application endpoint.
-- psql "$DATABASE_URL" -v owner_email='your verified signup email' -f supabase/bootstrap-owner.sql
\set ON_ERROR_STOP on
begin;
select set_config('glazed.owner_email', :'owner_email', true);
do $$
declare v_id uuid;
begin
  if to_regclass('public.businesses') is not null then raise exception 'Legacy owner bootstrap is retired. Use business registration.'; end if;
  if not public._is_system() then raise exception 'Trusted database connection required.'; end if;
  select id into strict v_id from auth.users
    where lower(email)=lower(current_setting('glazed.owner_email')) and email_confirmed_at is not null;
  perform id from public.business_setup where id=1 for update;
  if exists(select 1 from public.business_setup where id=1 and completed_at is not null and owner_id is distinct from v_id) then
    raise exception 'Business setup is permanently closed. Owner transfer requires a separate reviewed operation.';
  end if;
  if exists(select 1 from public.profiles where role='owner' and user_id<>v_id) then
    raise exception 'An owner already exists. Owner transfer requires a separate reviewed operation.';
  end if;
  update public.profiles set role='owner' where user_id=v_id;
  if not found then raise exception 'Missing profile: apply all migrations first.'; end if;
end $$;
commit;

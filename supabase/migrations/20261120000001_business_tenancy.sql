-- Tenant boundary. No data is reset: existing rows become the original business.
create table public.businesses (
  id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 120),
  slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_by uuid references auth.users(id) on delete set null,
  request_id uuid, created_at timestamptz not null default now(), unique(created_by,request_id)
);
insert into public.businesses(id,name,slug)
select '00000000-0000-4000-8000-000000000001',coalesce((select business_name from public.app_settings where id=1),'Glazed'),'glazed';

create function public._active_business_id() returns uuid language plpgsql stable set search_path=public as $$
declare v text;
begin
  v:=nullif(current_setting('glazed.business_id',true),'');
  if v is null then v:=nullif(current_setting('request.headers',true),'')::jsonb->>'x-business-id'; end if;
  return coalesce(nullif(v,'')::uuid,'00000000-0000-4000-8000-000000000001'::uuid);
end $$;
revoke all on function public._active_business_id() from public,anon;
grant execute on function public._active_business_id() to authenticated,service_role;

-- Remember existing foreign keys before replacing them with same-business keys.
create temporary table tenant_fk_manifest on commit drop as
select c.conrelid::regclass::text source_table,c.confrelid::regclass::text target_table,c.conname,
 (select string_agg(quote_ident(a.attname),',' order by k.ord) from unnest(c.conkey) with ordinality k(n,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.n) source_columns,
 (select string_agg(quote_ident(a.attname),',' order by k.ord) from unnest(c.confkey) with ordinality k(n,ord) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.n) target_columns,
 case c.confdeltype when 'c' then 'CASCADE' when 'r' then 'RESTRICT' when 'a' then 'NO ACTION' when 'n' then 'SET NULL' else 'NO ACTION' end on_delete
from pg_constraint c join pg_class a on a.oid=c.conrelid join pg_namespace n on n.oid=a.relnamespace
join pg_class b on b.oid=c.confrelid join pg_namespace m on m.oid=b.relnamespace
where c.contype='f' and n.nspname='public' and m.nspname='public'
 and a.relname not in ('businesses','business_setup','business_setup_attempts')
 and b.relname not in ('businesses','business_setup','business_setup_attempts');

do $$ declare r record; begin
 for r in select tablename from pg_tables where schemaname='public' and tablename not in ('businesses','business_setup','business_setup_attempts') loop
  execute format('alter table public.%I add column business_id uuid not null default ''00000000-0000-4000-8000-000000000001'' references public.businesses(id)',r.tablename);
  execute format('alter table public.%I alter column business_id set default public._active_business_id()',r.tablename);
  execute format('create index on public.%I(business_id)',r.tablename);
 end loop;
 for r in select * from tenant_fk_manifest loop execute format('alter table %s drop constraint %I',r.source_table,r.conname); end loop;
end $$;

-- Natural identifiers, profiles, settings and document counters are local to a business.
alter table public.profiles drop constraint profiles_pkey;
alter table public.profiles add primary key(business_id,user_id);
drop index public.profiles_single_owner;
create unique index profiles_single_owner on public.profiles(business_id) where role='owner';
drop index public.profiles_username_key;
create unique index profiles_username_key on public.profiles(business_id,username) where username is not null;
alter table public.gl_accounts drop constraint gl_accounts_pkey;
alter table public.gl_accounts add primary key(business_id,code);
alter table public.reason_codes drop constraint reason_codes_pkey;
alter table public.reason_codes add primary key(business_id,code);
alter table public.app_settings drop constraint app_settings_pkey;
alter table public.app_settings add primary key(business_id,id);
alter table public.doc_sequences drop constraint doc_sequences_pkey;
alter table public.doc_sequences add primary key(business_id,prefix);
-- Replace remaining globally unique business-data constraints (IDs stay globally unique).
do $$ declare r record; cols text; begin
 for r in select c.oid,c.conrelid::regclass tbl,c.conname,c.conkey from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and c.contype='u' and t.relname<>'businesses' loop
  select string_agg(quote_ident(a.attname),',' order by k.ord) into cols from unnest(r.conkey) with ordinality k(n,ord) join pg_attribute a on a.attrelid=r.tbl and a.attnum=k.n;
  execute format('alter table %s drop constraint %I',r.tbl,r.conname);
  execute format('alter table %s add constraint %I unique(business_id,%s)',r.tbl,r.conname,cols);
 end loop;
 for r in select distinct target_table,target_columns from tenant_fk_manifest loop
  execute format('create unique index on %s(%s,business_id)',r.target_table,r.target_columns);
 end loop;
 for r in select * from tenant_fk_manifest loop
  -- SET NULL must preserve the required tenant ID, so apply it only to original columns.
  execute format('alter table %s add constraint %I foreign key(%s,business_id) references %s(%s,business_id) on delete %s%s',r.source_table,r.conname,r.source_columns,r.target_table,r.target_columns,r.on_delete,case when r.on_delete='SET NULL' then '('||r.source_columns||')' else '' end);
 end loop;
end $$;

-- A trusted, non-login, non-bypass role runs legacy transactional RPCs. Every
-- operational query, including security-definer functions and aggregate views,
-- is constrained by RLS rather than inheriting postgres's bypass privilege.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='glazed_executor') then create role glazed_executor nologin nobypassrls; end if;
 if exists(select 1 from pg_roles where rolname='glazed_executor' and (rolsuper or rolbypassrls or rolcanlogin)) then raise exception 'Unsafe executor role configuration.'; end if;
end $$;
grant glazed_executor to postgres;
grant create on schema public to glazed_executor;
grant usage on schema public,auth to glazed_executor;
grant execute on function auth.uid(),auth.role() to glazed_executor;
grant select,insert,update,delete on all tables in schema public to glazed_executor;
grant usage,select on all sequences in schema public to glazed_executor;
-- Needed for trusted helpers called by transactions; browser roles get no Auth access.
grant select on auth.users to glazed_executor;

create or replace function public.auth_role() returns app_role language sql stable security definer set search_path=public as $$
 select role from public.profiles where user_id=auth.uid() and business_id=public._active_business_id()
$$;
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(public.auth_role() in ('owner','admin','manager','cashier','baker'),false)
$$;
create or replace function public.my_customer_id() returns bigint language sql stable security definer set search_path=public as $$
 select customer_id from public.profiles where user_id=auth.uid() and business_id=public._active_business_id()
$$;
create function public._has_business_membership(p_business uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where business_id=p_business and user_id=auth.uid())
$$;
revoke all on function public._has_business_membership(uuid) from public,anon;
grant execute on function public._has_business_membership(uuid) to authenticated,service_role,glazed_executor;

-- A restrictive policy intersects all existing role/ownership policies. It also
-- checks tenant membership, so a forged header never opens an unrelated business.
do $$ declare r record; begin
 for r in select tablename from pg_tables where schemaname='public' and tablename not in ('businesses','business_setup','business_setup_attempts') loop
  execute format('alter table public.%I enable row level security',r.tablename);
  execute format('create policy tenant_boundary on public.%I as restrictive for all to authenticated using (business_id=(select public._active_business_id()) and (select public._has_business_membership(public._active_business_id()))) with check (business_id=(select public._active_business_id()) and (select public._has_business_membership(public._active_business_id())))',r.tablename);
  execute format('create policy transaction_tenant on public.%I for all to glazed_executor using (business_id=(select public._active_business_id()) and ((select public._is_system()) or (select public._has_business_membership(public._active_business_id())))) with check (business_id=(select public._active_business_id()) and ((select public._is_system()) or (select public._has_business_membership(public._active_business_id()))))',r.tablename);
 end loop;
 for r in select c.oid::regclass rel from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' loop execute format('alter view %s set (security_invoker=true)',r.rel); end loop;
end $$;

-- Never allow the old installation-wide owner bootstrap to create more owners.
create or replace function public._business_setup_status() returns boolean language sql stable security definer set search_path=public as $$ select false $$;
create or replace function public._complete_business_setup(p_actor uuid,p_business_name text,p_location_id bigint default null,p_location_name text default null,p_location_address text default null) returns jsonb language plpgsql security definer set search_path=public as $$ begin raise exception 'Use public business registration.' using errcode='42501'; end $$;
drop trigger if exists close_business_setup_on_owner on public.profiles;

create or replace function public._next_doc_no(p_prefix text) returns text language plpgsql set search_path=public as $$
declare v_no bigint; begin
 insert into doc_sequences(business_id,prefix,next_no) values(_active_business_id(),p_prefix,2)
 on conflict(business_id,prefix) do update set next_no=doc_sequences.next_no+1 returning next_no-1 into v_no;
 return p_prefix||'-'||lpad(v_no::text,5,'0');
end $$;

-- Immutable application defaults are snapshotted once, never copied from another
-- business after registration. They contain no users, stock, or transactional data.
create table public.business_account_defaults as select code,name,type,statement,normal_side from public.gl_accounts;
create table public.business_reason_defaults as select code,category,label from public.reason_codes;
revoke all on public.business_account_defaults,public.business_reason_defaults from public,anon,authenticated,glazed_executor;

-- Freeze a tenant identifier at insert and forbid moving an existing row between
-- businesses. Composite FKs protect every existing relational reference as well.
create function public._protect_business_id() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if tg_op='UPDATE' and new.business_id is distinct from old.business_id then raise exception 'Business records cannot move between businesses.' using errcode='42501'; end if;
 if not _is_system() and new.business_id<>_active_business_id() then raise exception 'Wrong business context.' using errcode='42501'; end if;
 return new;
end $$;
do $$ declare r record; begin
 for r in select tablename from pg_tables where schemaname='public' and tablename not in ('businesses','business_setup','business_setup_attempts','business_account_defaults','business_reason_defaults') loop
  execute format('create trigger protect_business_id before insert or update on public.%I for each row execute function public._protect_business_id()',r.tablename);
 end loop;
end $$;

-- Auth remains a global identity. Public signup always gets customer access only
-- to the original shop; entering another shop explicitly joins that business.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare v_name text; v_username text; v_customer bigint; v_business uuid:='00000000-0000-4000-8000-000000000001'; begin
 if lower(split_part(coalesce(new.email,''),'@',2))='users.glazed.invalid' then
  v_username:=lower(btrim(new.raw_user_meta_data->>'username'));
  if v_username is null or v_username !~ '^[a-z0-9_]{3,30}$' or new.email is distinct from v_username||'@users.glazed.invalid' then raise exception 'Choose a valid username.' using errcode='23514'; end if;
 end if;
 -- This untrusted marker removes default shop access; it never grants a role.
 if new.raw_user_meta_data->>'registration_intent'='business' then return new; end if;
 v_name:=coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'),''),v_username,split_part(coalesce(new.email,'customer'),'@',1));
 insert into public.customers(business_id,auth_user_id,name,kind,email) values(v_business,new.id,v_name,'retail',case when v_username is null then new.email end) returning id into v_customer;
 insert into public.profiles(business_id,user_id,full_name,role,customer_id,username) values(v_business,new.id,v_name,'customer',v_customer,v_username);
 return new;
end $$;

-- Lock down every pre-existing application routine except identity helpers whose
-- narrow postgres-owned reads are necessary to avoid recursive membership RLS.
do $$ declare r record; begin
 for r in select p.oid::regprocedure sig,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') loop
  if r.proname not in ('auth_role','is_staff','my_customer_id','_has_business_membership','handle_new_user','_protect_username_identity','_business_setup_status','_complete_business_setup') then
   execute format('alter function %s owner to glazed_executor',r.sig);
  end if;
  execute format('grant execute on function %s to glazed_executor',r.sig);
 end loop;
end $$;
revoke create on schema public from glazed_executor;
revoke all on function public._protect_business_id() from public,anon,authenticated;
-- A global trusted reset cannot be called from any browser account.
revoke all on function public._reset_demo_data(boolean) from public,anon,authenticated,glazed_executor;

create view public.business_memberships with(security_invoker=true) as select * from public.profiles;
grant select on public.business_memberships to authenticated;
alter table public.businesses enable row level security;
create policy member_business on public.businesses for select to authenticated using(public._has_business_membership(id));
grant select on public.businesses to authenticated;

create function public.resolve_business(p_slug text) returns table(business_id uuid,name text,slug text)
language sql stable security definer set search_path=public as $$ select id,name,slug from public.businesses where slug=p_slug $$;
create function public.list_business_memberships() returns table(business_id uuid,name text,slug text,role app_role,home_location_id bigint,customer_id bigint,user_id uuid,full_name text,username text)
language sql stable security definer set search_path=public as $$
 select p.business_id,b.name,b.slug,p.role,p.home_location_id,p.customer_id,p.user_id,p.full_name,p.username from public.profiles p join public.businesses b on b.id=p.business_id where p.user_id=auth.uid() order by b.created_at,b.id
$$;

create function public.ensure_business_customer() returns public.profiles language plpgsql security definer set search_path=public as $$
declare v_business uuid:=_active_business_id(); v_uid uuid:=auth.uid(); v_profile public.profiles; v_email text; v_name text; v_username text; v_customer bigint;
begin
 if v_uid is null then raise exception 'Sign in to continue.' using errcode='28000'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_business::text||v_uid::text,0));
 select * into v_profile from profiles where business_id=v_business and user_id=v_uid;
 if found then return v_profile; end if;
 if not exists(select 1 from businesses where id=v_business) then raise exception 'Business not found.' using errcode='22023'; end if;
 select email,coalesce(nullif(raw_user_meta_data->>'full_name',''),split_part(email,'@',1)) into v_email,v_name from auth.users where id=v_uid;
 if lower(split_part(v_email,'@',2))='users.glazed.invalid' then v_username:=split_part(v_email,'@',1); v_email:=null; end if;
 insert into customers(business_id,auth_user_id,name,kind,email) values(v_business,v_uid,v_name,'retail',v_email) returning id into v_customer;
 insert into profiles(business_id,user_id,full_name,role,customer_id,username) values(v_business,v_uid,v_name,'customer',v_customer,v_username) returning * into v_profile;
 return v_profile;
end $$;

-- Release switch is server-only. Direct RPC access obeys the same gate as UI.
create table public.platform_settings(id boolean primary key default true check(id),business_registration_enabled boolean not null default false);
insert into public.platform_settings(id) values(true);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from public,anon,authenticated,glazed_executor;
create function public.business_registration_status() returns boolean language sql stable security definer set search_path=public as $$ select business_registration_enabled from platform_settings where id $$;
revoke all on function public.business_registration_status() from public;
grant execute on function public.business_registration_status() to authenticated,anon,service_role;

create function public.create_business(p_name text,p_location_name text,p_location_address text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_business businesses; v_location bigint; v_slug text; v_email text; v_name text; v_prior text;
begin
 if v_uid is null then raise exception 'Sign in to create a business.' using errcode='28000'; end if;
 if not coalesce((select business_registration_enabled from platform_settings where id),false) then raise exception 'Business registration is being prepared. Try again later.' using errcode='55000'; end if;
 select email,coalesce(nullif(raw_user_meta_data->>'full_name',''),split_part(email,'@',1)) into v_email,v_name from auth.users where id=v_uid;
 if v_email is null or lower(split_part(v_email,'@',2))='users.glazed.invalid' then raise exception 'Use an email account to create a business.' using errcode='42501'; end if;
 if p_request_id is null or nullif(btrim(p_name),'') is null or length(p_name)>120 or nullif(btrim(p_location_name),'') is null or length(p_location_name)>120 or nullif(btrim(p_location_address),'') is null or length(p_location_address)>500 then raise exception 'Enter a business name, first shop name and address.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_request_id::text,0));
 select * into v_business from businesses where created_by=v_uid and request_id=p_request_id;
 if not found then
  v_slug:=trim(both '-' from regexp_replace(lower(btrim(p_name)),'[^a-z0-9]+','-','g'));
  if v_slug='' then v_slug:='business'; end if;
  v_slug:=trim(trailing '-' from left(v_slug,80));
  begin
   insert into businesses(name,slug,created_by,request_id) values(btrim(p_name),v_slug,v_uid,p_request_id) returning * into v_business;
  exception when unique_violation then
   v_slug:=v_slug||'-'||replace(gen_random_uuid()::text,'-','');
   insert into businesses(name,slug,created_by,request_id) values(btrim(p_name),v_slug,v_uid,p_request_id) returning * into v_business;
  end;
  v_prior:=current_setting('glazed.business_id',true); perform set_config('glazed.business_id',v_business.id::text,true);
  insert into app_settings(business_id,id,business_name) values(v_business.id,1,v_business.name);
  insert into gl_accounts(business_id,code,name,type,statement,normal_side) select v_business.id,code,name,type,statement,normal_side from business_account_defaults;
  insert into reason_codes(business_id,code,category,label) select v_business.id,code,category,label from business_reason_defaults;
  insert into locations(business_id,code,name,kind,address,tax_rate,open_time,close_time,closed_weekdays) values(v_business.id,'SHOP-1',btrim(p_location_name),'shop',btrim(p_location_address),0.0725,'06:00','18:00','{0}') returning id into v_location;
  insert into profiles(business_id,user_id,full_name,role,home_location_id) values(v_business.id,v_uid,v_name,'owner',v_location);
  perform set_config('glazed.business_id',coalesce(v_prior,''),true);
 end if;
 return (select jsonb_build_object('business_id',b.id,'name',b.name,'slug',b.slug,'role',p.role,'user_id',p.user_id,'full_name',p.full_name,'username',p.username,'home_location_id',p.home_location_id,'customer_id',p.customer_id) from businesses b join profiles p on p.business_id=b.id and p.user_id=v_uid where b.id=v_business.id);
end $$;
revoke all on function public.resolve_business(text),public.list_business_memberships(),public.ensure_business_customer(),public.create_business(text,text,text,uuid) from public,anon;
grant execute on function public.resolve_business(text) to authenticated,anon,service_role;
grant execute on function public.list_business_memberships(),public.ensure_business_customer(),public.create_business(text,text,text,uuid) to authenticated,service_role;

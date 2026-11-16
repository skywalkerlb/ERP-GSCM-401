-- Run as postgres after all migrations. Every fixture and permission probe is rolled back.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify/access_security.sql
begin;
create temp table access_fixtures(k text primary key,id uuid);
grant select on access_fixtures to authenticated;
insert into access_fixtures values ('admin',gen_random_uuid()),('manager',gen_random_uuid()),('customer',gen_random_uuid()),('cashier',gen_random_uuid()),('baker',gen_random_uuid());
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select id,'access-test-'||id||'@example.invalid',case when k='customer' then '{}'::jsonb else jsonb_build_object('role',k) end,'{}'::jsonb from access_fixtures;
-- Existing owner is never altered. Create a fixture owner only when setup has not assigned one.
insert into access_fixtures select 'owner',user_id from profiles where role='owner';
do $$
declare v_id uuid:=gen_random_uuid();
begin
  if not exists(select 1 from access_fixtures where k='owner') then
    insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values(v_id,'access-owner-'||v_id||'@example.invalid','{}','{}');
    update profiles set role='owner' where user_id=v_id;
    insert into access_fixtures values('owner',v_id);
  end if;
end $$;
-- Metadata controlled by the public sign-up user must never grant a role.
do $$
declare v_id uuid:=gen_random_uuid();
begin
  insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values(v_id,'access-spoof-'||v_id||'@example.invalid','{}','{"role":"owner"}');
  if (select role from profiles where user_id=v_id) is distinct from 'customer'::app_role then raise exception 'User metadata granted privileges or customer profile is missing'; end if;
  if (select count(*) from profiles where user_id=v_id)<>1 then raise exception 'Signup did not create exactly one profile'; end if;
  if (select count(*) from customers where auth_user_id=v_id)<>1 then raise exception 'Signup did not create exactly one linked customer'; end if;
  if not exists(select 1 from profiles p join customers c on c.id=p.customer_id and c.auth_user_id=p.user_id where p.user_id=v_id) then raise exception 'Signup customer/profile linkage is broken'; end if;
end $$;
-- Profile writes are forbidden to ALL browser roles, including the owner.
do $$
declare r record; v_denied boolean;
begin
  for r in select * from access_fixtures loop
    perform set_config('request.jwt.claims',json_build_object('sub',r.id,'role','authenticated')::text,true);
    set local role authenticated;
    begin
      update profiles set role='owner' where user_id=r.id;
      v_denied:=false;
    exception when insufficient_privilege then v_denied:=true;
    end;
    reset role;
    if not v_denied then raise exception 'Browser role % could edit profile access',r.k; end if;
    set local role authenticated;
    begin
      perform _set_account_access(r.id,r.id,'admin',null);
      v_denied:=false;
    exception when insufficient_privilege then v_denied:=true;
    end;
    reset role;
    if not v_denied then raise exception 'Browser role % could execute service access RPC',r.k; end if;
  end loop;
end $$;
-- Admin and owner retain manager operational master-data rights.
do $$
declare r record;
begin
  for r in select * from access_fixtures where k in ('owner','admin','manager') loop
    perform set_config('request.jwt.claims',json_build_object('sub',r.id,'role','authenticated')::text,true);
    set local role authenticated;
    if not is_staff() then raise exception 'Missing staff access'; end if;
    insert into reason_codes(code,category,label) values('ACCESS_TEST_'||r.k,'waste','Access verification');
    reset role;
  end loop;
end $$;
-- Staff -> customer -> staff preserves a working customer identity, with no duplicate account.
select public._set_account_access((select id from access_fixtures where k='owner'),(select id from access_fixtures where k='admin'),'customer',null);
do $$
begin
  if not exists(select 1 from profiles p join customers c on p.customer_id=c.id and c.auth_user_id=p.user_id where p.user_id=(select id from access_fixtures where k='admin')) then raise exception 'Customer demotion has no portal identity'; end if;
end $$;
select public._set_account_access((select id from access_fixtures where k='owner'),(select id from access_fixtures where k='admin'),'admin',null);
-- Owner cannot be demoted through the service endpoint's RPC either.
do $$
declare v_denied boolean:=false;
begin
  begin perform public._set_account_access((select id from access_fixtures where k='admin'),(select id from access_fixtures where k='owner'),'admin',null);
  exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Owner could be demoted'; end if;
end $$;
-- Exercise the actual SQL hierarchy, service-only authorization and atomic audit insert.
do $$
declare a record; t record; destination app_role; allowed boolean; succeeded boolean; before_audit bigint; after_audit bigint;
begin
  for a in select * from access_fixtures loop
    for t in select * from access_fixtures loop
      foreach destination in array enum_range(null::app_role) loop
        allowed := a.id<>t.id and
          case a.k when 'owner' then t.k in ('admin','manager','cashier','baker','customer') and destination in ('admin','manager','cashier','baker','customer')
          when 'admin' then t.k in ('manager','cashier','baker','customer') and destination in ('manager','cashier','baker','customer')
          when 'manager' then t.k in ('cashier','baker','customer') and destination in ('cashier','baker','customer') else false end;
        select count(*) into before_audit from account_access_audit;
        succeeded := false;
        begin
          perform _set_account_access(a.id,t.id,destination,null);
          succeeded := true;
        exception when insufficient_privilege then null;
        end;
        if succeeded<>allowed then raise exception 'Hierarchy mismatch: % -> % -> %',a.k,t.k,destination; end if;
        select count(*) into after_audit from account_access_audit;
        if after_audit<>before_audit+(case when allowed then 1 else 0 end) then raise exception 'Audit was not atomic'; end if;
        if allowed then
          if not exists(select 1 from account_access_audit where actor_id=a.id and target_id=t.id and previous_role=t.k::app_role and new_role=destination) then raise exception 'Audit attribution missing'; end if;
          update profiles set role=t.k::app_role where user_id=t.id;
        end if;
      end loop;
    end loop;
  end loop;
end $$;
-- The old actor-free service signature must no longer exist.
do $$ begin
  if to_regprocedure('public._set_account_access(uuid,app_role,bigint)') is not null then raise exception 'Actor-free access bypass remains'; end if;
end $$;
rollback;

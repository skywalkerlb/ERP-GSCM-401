-- Run after all migrations in an isolated migrated database. All fixtures roll back.
begin;
create temp table tenant_test_ids(k text primary key,v text);
grant select on tenant_test_ids to authenticated,service_role;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
 ('a1111111-1111-4111-8111-111111111111','tenant-owner-a@example.invalid',now(),'{}','{"registration_intent":"business"}'),
 ('b1111111-1111-4111-8111-111111111111','tenant-owner-b@example.invalid',now(),'{}','{"registration_intent":"business"}'),
 ('c1111111-1111-4111-8111-111111111111','tenant-customer@example.invalid',now(),'{}','{}');
-- Owner registration does not silently join another business's customer directory.
do $$declare denied boolean:=false; begin
 if exists(select 1 from profiles where user_id in('a1111111-1111-4111-8111-111111111111','b1111111-1111-4111-8111-111111111111')) or exists(select 1 from customers where auth_user_id in('a1111111-1111-4111-8111-111111111111','b1111111-1111-4111-8111-111111111111')) then raise exception 'Owner signup joined original business'; end if;
 perform set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
 begin perform create_business('Closed','Closed','Closed','a2222222-2222-4222-8222-222222222222'); exception when object_not_in_prerequisite_state then denied:=true; end;
 if not denied then raise exception 'Public registration gate bypassed';end if;
end$$;
update platform_settings set business_registration_enabled=true where id;
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
insert into tenant_test_ids select 'a',create_business('Isolation same shop','Shop A','Address A','a2222222-2222-4222-8222-222222222222')->>'business_id';
-- Same request reuses the saved business and location.
do $$begin
 if (create_business('Changed retry','Another shop','Another address','a2222222-2222-4222-8222-222222222222')->>'business_id')<>(select v from tenant_test_ids where k='a') then raise exception 'Create retry made duplicate business'; end if;
end$$;
select set_config('request.jwt.claim.sub','b1111111-1111-4111-8111-111111111111',true);
insert into tenant_test_ids select 'b',create_business('Isolation same shop','Shop B','Address B','b2222222-2222-4222-8222-222222222222')->>'business_id';
do $$begin
 if (select count(distinct slug) from businesses where id in(select v::uuid from tenant_test_ids where k in('a','b')))<>2 then raise exception 'Business slug collision not handled';end if;
end$$;
insert into tenant_test_ids select 'a-location',id::text from locations where business_id=(select v::uuid from tenant_test_ids where k='a');
insert into tenant_test_ids select 'b-location',id::text from locations where business_id=(select v::uuid from tenant_test_ids where k='b');
-- An owner in B may be a cashier in A; role hierarchy is local to each business.
select _tenant_set_account_access((select v::uuid from tenant_test_ids where k='a'),'a1111111-1111-4111-8111-111111111111','b1111111-1111-4111-8111-111111111111','cashier',null);
select _tenant_set_account_access((select v::uuid from tenant_test_ids where k='a'),'a1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111','customer',null);
select set_config('glazed.business_id',(select v from tenant_test_ids where k='a'),true);
with i as (insert into items(sku,name,item_type) values('TENANT-SAME-SKU','A item','raw') returning id) insert into tenant_test_ids select 'a-item',id::text from i;
select set_config('glazed.business_id',(select v from tenant_test_ids where k='b'),true);
with i as (insert into items(sku,name,item_type) values('TENANT-SAME-SKU','B item','raw') returning id) insert into tenant_test_ids select 'b-item',id::text from i;
select set_config('glazed.business_id','',true);
select set_config('request.headers',jsonb_build_object('x-business-id',(select v from tenant_test_ids where k='a'))::text,true);
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
set local role authenticated;
do $$declare n int; denied boolean:=false; r record; begin
 if auth_role()<>'owner' then raise exception 'Owner role missing'; end if;
 if (select count(*) from items where sku='TENANT-SAME-SKU')<>1 or exists(select 1 from items where name='B item') then raise exception 'Item isolation failed'; end if;
 if exists(select 1 from locations where business_id=(select v::uuid from tenant_test_ids where k='b')) then raise exception 'Location isolation failed'; end if;
 if exists(select 1 from profiles where business_id=(select v::uuid from tenant_test_ids where k='b')) then raise exception 'Profile isolation failed'; end if;
 -- The explicit business_id cannot smuggle an otherwise valid B location into A.
 begin insert into items(sku,name,item_type,business_id) values('SPOOF','Spoof','raw',(select v::uuid from tenant_test_ids where k='b')); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Forged insert tenant accepted'; end if;
 denied:=false;
 begin perform save_business_location((select v::bigint from tenant_test_ids where k='b-location'),jsonb_build_object('code','B','name','Changed B','kind','shop','address','B','tax_rate',0.07,'is_active',true,'open_time','06:00','close_time','18:00','closed_weekdays','[]'::jsonb)); exception when others then denied:=true; end;
 if not denied then raise exception 'Crossbusiness location edit accepted'; end if;
 if has_function_privilege('authenticated','public._tenant_set_account_access(uuid,uuid,uuid,public.app_role,bigint)','execute') then raise exception 'Browser may call trusted access API'; end if;
 if has_table_privilege('authenticated','public.platform_settings','update') then raise exception 'Browser can open registration gate';end if;
 if has_function_privilege('authenticated','public._reset_demo_data(boolean)','execute') then raise exception 'Browser may reset data'; end if;
 -- Every tenant table has a restrictive policy; all application views invoke RLS.
 for r in select tablename from pg_tables where schemaname='public' and tablename not in('businesses','business_setup','business_setup_attempts','platform_settings','business_account_defaults','business_reason_defaults') loop
  if not exists(select 1 from pg_policies where schemaname='public' and tablename=r.tablename and policyname='tenant_boundary' and permissive='RESTRICTIVE') then raise exception 'Missing tenant policy on %',r.tablename; end if;
 end loop;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' and not coalesce(c.reloptions,'{}') @> array['security_invoker=true']) then raise exception 'A view can bypass row security'; end if;
end$$;
-- A forged header never creates membership or opens data.
select set_config('request.headers',jsonb_build_object('x-business-id',(select v from tenant_test_ids where k='b'))::text,true);
do $$begin if exists(select 1 from items) or exists(select 1 from locations) or auth_role() is not null then raise exception 'Forged business context leaked data'; end if; end$$;
-- Multiple membership contexts pick the correct role, not the most privileged role.
select set_config('request.jwt.claim.sub','b1111111-1111-4111-8111-111111111111',true);
do $$begin if auth_role()<>'owner' then raise exception 'B owner lost role'; end if; end$$;
select set_config('request.headers',jsonb_build_object('x-business-id',(select v from tenant_test_ids where k='a'))::text,true);
do $$declare denied boolean:=false; begin
 if auth_role()<>'cashier' then raise exception 'Global owner role leaked into cashier membership'; end if;
 begin perform save_business_location(null,jsonb_build_object('code','BAD','name','Bad','kind','shop','address','Bad','tax_rate',0.07,'is_active',true,'open_time','06:00','close_time','18:00','closed_weekdays','[]'::jsonb));exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cashier used owner rights from another business';end if;
end$$;
reset role;
-- Service directory includes only the explicit business even with a spoofed request header.
do $$declare users jsonb; denied boolean:=false; begin
 users:=_tenant_people_directory((select v::uuid from tenant_test_ids where k='b'),'b1111111-1111-4111-8111-111111111111');
 if jsonb_array_length(users)<>1 then raise exception 'Service directory leaked global accounts'; end if;
 begin perform _tenant_people_directory((select v::uuid from tenant_test_ids where k='b'),'a1111111-1111-4111-8111-111111111111'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Service directory accepted foreign actor';end if;
 denied:=false;
 begin perform _tenant_set_account_access((select v::uuid from tenant_test_ids where k='a'),'a1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111','baker',(select v::bigint from tenant_test_ids where k='b-location'));exception when others then denied:=true;end;
 if not denied then raise exception 'Access assignment accepted foreign home location';end if;
 if (select role from profiles where business_id=(select v::uuid from tenant_test_ids where k='b') and user_id='b1111111-1111-4111-8111-111111111111')<>'owner' then raise exception 'Otherbusiness owner role changed';end if;
end$$;
-- Exhaustive service authorization/assignment matrix: 6 actor roles × 6 target
-- roles × 6 requested roles, plus every self-change and new-member invitation.
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
 ('e1111111-1111-4111-8111-111111111111','tenant-matrix-actor@example.invalid',now(),'{}','{"registration_intent":"business"}'),
 ('f1111111-1111-4111-8111-111111111111','tenant-matrix-target@example.invalid',now(),'{}','{"registration_intent":"business"}');
insert into profiles(business_id,user_id,full_name,role)
select v::uuid,u.id,'Matrix member','customer' from tenant_test_ids cross join auth.users u
where k='a' and u.id in('e1111111-1111-4111-8111-111111111111','f1111111-1111-4111-8111-111111111111');
do $$
declare actor_role app_role; target_role app_role; desired app_role;
 actor_id uuid; target_id uuid; a uuid:=(select v::uuid from tenant_test_ids where k='a');
 actor_rank int; target_rank int; desired_rank int; expected boolean; allowed boolean;
 role_rank jsonb:='{"owner":0,"admin":1,"manager":2,"cashier":3,"baker":3,"customer":4}';
begin
 foreach actor_role in array enum_range(null::app_role) loop
  actor_id:=case when actor_role='owner' then 'a1111111-1111-4111-8111-111111111111'::uuid else 'e1111111-1111-4111-8111-111111111111'::uuid end;
  if actor_role<>'owner' then update profiles set role=actor_role where business_id=a and user_id=actor_id;end if;
  actor_rank:=(role_rank->>actor_role::text)::int;
  foreach target_role in array enum_range(null::app_role) loop
   target_id:=case when target_role='owner' then 'a1111111-1111-4111-8111-111111111111'::uuid else 'f1111111-1111-4111-8111-111111111111'::uuid end;
   target_rank:=(role_rank->>target_role::text)::int;
   foreach desired in array enum_range(null::app_role) loop
    if target_role<>'owner' then update profiles set role=target_role where business_id=a and user_id=target_id;end if;
    desired_rank:=(role_rank->>desired::text)::int;
    expected:=actor_role in('owner','admin','manager') and actor_rank<target_rank and actor_rank<desired_rank and actor_id<>target_id;
    allowed:=true;
    begin perform _tenant_authorize_account_access(a,actor_id,target_id,desired);exception when insufficient_privilege then allowed:=false;end;
    if allowed<>expected then raise exception 'Authorization matrix mismatch actor %,target %,desired %,expected %',actor_role,target_role,desired,expected;end if;
    allowed:=true;
    begin perform _tenant_set_account_access(a,actor_id,target_id,desired,null);exception when insufficient_privilege then allowed:=false;end;
    if allowed<>expected then raise exception 'Assignment matrix mismatch actor %,target %,desired %,expected %',actor_role,target_role,desired,expected;end if;
   end loop;
  end loop;
  foreach desired in array enum_range(null::app_role) loop
   allowed:=true;
   begin perform _tenant_authorize_account_access(a,actor_id,actor_id,desired);exception when insufficient_privilege then allowed:=false;end;
   if allowed then raise exception 'Self-change authorized for % to %',actor_role,desired;end if;
   allowed:=true;
   begin perform _tenant_set_account_access(a,actor_id,actor_id,desired,null);exception when insufficient_privilege then allowed:=false;end;
   if allowed then raise exception 'Self-change assigned for % to %',actor_role,desired;end if;
   expected:=actor_role in('owner','admin','manager') and actor_rank<(role_rank->>desired::text)::int;
   allowed:=true;
   begin perform _tenant_authorize_account_access(a,actor_id,null,desired);exception when insufficient_privilege then allowed:=false;end;
   if allowed<>expected then raise exception 'New-member authorization mismatch actor %,desired %',actor_role,desired;end if;
  end loop;
 end loop;
end$$;

-- Stored Realtime rows must match the authorization topic, not merely a topic
-- the actor could authorize separately. Cross-business stored messages stay private.
insert into realtime.messages(extension,topic,payload)
 select 'broadcast','business:'||v||':customer:c1111111-1111-4111-8111-111111111111','{"tenant_isolation_probe":true}'::jsonb
 from tenant_test_ids where k in('a','b');
insert into realtime.messages(extension,topic,payload) values
 ('broadcast','account:c1111111-1111-4111-8111-111111111111:access','{"tenant_access_probe":true}'),
 ('broadcast','account:b1111111-1111-4111-8111-111111111111:access','{"tenant_access_probe":true}');
-- Customer membership sees only its own business records and cannot subscribe to staff events.
select set_config('glazed.business_id','',true);
select set_config('request.jwt.claim.sub','c1111111-1111-4111-8111-111111111111',true);
select set_config('request.headers',jsonb_build_object('x-business-id',(select v from tenant_test_ids where k='a'))::text,true);
set local role authenticated;
do $$declare a text:=(select v from tenant_test_ids where k='a'); b text:=(select v from tenant_test_ids where k='b'); denied boolean:=false; begin
 if (select count(*) from customers)<>1 then raise exception 'Customer read other customers';end if;
 if not can_receive_business_channel('account:c1111111-1111-4111-8111-111111111111:access','broadcast') then raise exception 'Own global access invalidation denied';end if;
 if can_receive_business_channel('account:b1111111-1111-4111-8111-111111111111:access','broadcast') or can_receive_business_channel('account:c1111111-1111-4111-8111-111111111111:access','presence') or can_receive_business_channel('account:c1111111-1111-4111-8111-111111111111:access:extra','broadcast') then raise exception 'Foreign/malformed access invalidation accepted';end if;
 perform set_config('realtime.topic','account:c1111111-1111-4111-8111-111111111111:access',true);
 if (select count(*) from realtime.messages where payload->>'tenant_access_probe'='true')<>1 then raise exception 'Stored global access invalidation leaked another account or denied own probe';end if;

 if can_receive_business_channel('business:'||a||':events','broadcast') or can_receive_business_channel('business:'||a||':presence','presence') then raise exception 'Customer subscribed to staff channel';end if;
 if not can_receive_business_channel('business:'||a||':customer:c1111111-1111-4111-8111-111111111111','broadcast') then raise exception 'Own customer channel denied';end if;
 if can_receive_business_channel('business:'||b||':customer:c1111111-1111-4111-8111-111111111111','broadcast') or can_receive_business_channel('business:bad:events','broadcast') then raise exception 'Foreign or invalid topic accepted';end if;
 perform set_config('realtime.topic','business:'||a||':customer:c1111111-1111-4111-8111-111111111111',true);
 if (select count(*) from realtime.messages where payload->>'tenant_isolation_probe'='true')<>1 then raise exception 'Stored Realtime messages leaked across topic boundary or denied own probe';end if;
 if exists(select 1 from realtime.messages where topic<>'business:'||a||':customer:c1111111-1111-4111-8111-111111111111') then raise exception 'Stored foreign Realtime topic visible';end if;
 begin insert into realtime.messages(extension,topic,payload) values('broadcast','fake','{}');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Client could forge broadcast';end if;
end$$;
reset role;
-- Presence authorization probe may insert only its exact permitted topic.
select set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
set local role authenticated;
do $$declare a text:=(select v from tenant_test_ids where k='a');b text:=(select v from tenant_test_ids where k='b');denied boolean:=false;begin
 perform set_config('realtime.topic','business:'||a||':presence',true);
 insert into realtime.messages(extension,topic,payload) values('presence','business:'||a||':presence','{"tenant_presence_probe":true}');
 if (select count(*) from realtime.messages where payload->>'tenant_presence_probe'='true')<>1 then raise exception 'Own presence authorization probe failed';end if;
 begin insert into realtime.messages(extension,topic,payload) values('presence','business:'||b||':presence','{}');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign-topic presence insert accepted';end if;
end$$;
reset role;
-- Same-business FK guard also applies to trusted imports, independently of RLS.
do $$declare denied boolean:=false; begin
 perform set_config('glazed.business_id',(select v from tenant_test_ids where k='a'),true);
 begin insert into bom_lines(parent_item_id,component_item_id,qty_per) values((select v::bigint from tenant_test_ids where k='a-item'),(select v::bigint from tenant_test_ids where k='b-item'),1);exception when foreign_key_violation then denied:=true;end;
 if not denied then raise exception 'Crossbusiness BOM reference accepted';end if;
end$$;
-- A scoped demo reset must retain B records, identities, businesses and defaults.
select set_config('glazed.business_id',(select v from tenant_test_ids where k='a'),true);
select _reset_demo_data(false);
do $$begin if not exists(select 1 from items where id=(select v::bigint from tenant_test_ids where k='a-item')) then raise exception 'Transactional reset removed master data';end if;end$$;
select _reset_demo_data(true);
do $$begin
 if exists(select 1 from items where business_id=(select v::uuid from tenant_test_ids where k='a')) then raise exception 'Master reset retained selected items';end if;
 if not exists(select 1 from items where id=(select v::bigint from tenant_test_ids where k='b-item')) then raise exception 'Master reset removed another business';end if;
 if not exists(select 1 from profiles where business_id=(select v::uuid from tenant_test_ids where k='b') and role='owner') then raise exception 'Reset removed another membership';end if;
 if not exists(select 1 from auth.users where id='a1111111-1111-4111-8111-111111111111') or (select count(*) from platform_settings)<>1 then raise exception 'Reset affected global identities/platform gate';end if;
end$$;
rollback;

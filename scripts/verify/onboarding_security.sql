-- Trusted connection only; ALL changes, including closed/open setup fixtures, roll back.
begin;
do $$
begin
  if has_function_privilege('anon','public._business_setup_status()','execute')
    or has_function_privilege('authenticated','public._business_setup_attempt(uuid)','execute')
    or has_function_privilege('authenticated','public._complete_business_setup(uuid,text,bigint,text,text)','execute')
    or has_table_privilege('authenticated','public.business_setup','update') then
    raise exception 'Browser roles can access trusted onboarding internals';
  end if;
end $$;
-- Fixtures intentionally exercise an unclaimed installation only within this rollback.
update public.profiles set role='admin' where role='owner';
update public.business_setup set completed_at=null,owner_id=null,location_id=null where id=1;
delete from public.business_setup_attempts;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); loc bigint; outcome jsonb; n bigint; denied boolean;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
  values(a,'setup-'||a||'@example.invalid',now(),'{}','{"role":"owner"}'),
    (b,'setup-'||b||'@example.invalid',now(),'{}','{}');
  if (select role from profiles where user_id=a)<>'customer' then raise exception 'Editable metadata granted owner'; end if;
  if not public._business_setup_status() then raise exception 'Fresh setup unavailable'; end if;
  for i in 1..5 loop
    if not public._business_setup_attempt(a) then raise exception 'Attempt limit too early'; end if;
  end loop;
  if public._business_setup_attempt(a) then raise exception 'Attempt limit missing'; end if;
  select id into loc from locations where is_active limit 1;
  if loc is null then
    insert into locations(code,name,kind) values('SETUP-VERIFY','Verify shop','shop') returning id into loc;
  end if;
  select count(*) into n from locations;
  begin
    perform public._complete_business_setup(a,'',loc);
    denied:=false;
  exception when others then denied:=true;
  end;
  if not denied or exists(select 1 from business_setup where completed_at is not null) then raise exception 'Invalid claim partially committed'; end if;
  outcome:=public._complete_business_setup(a,'Setup verification',loc);
  if not (outcome->>'completed')::boolean or (select role from profiles where user_id=a)<>'owner' then raise exception 'Owner setup incomplete'; end if;
  if (select business_name from app_settings where id=1)<>'Setup verification' then raise exception 'Business name missing'; end if;
  if (select home_location_id from profiles where user_id=a)<>loc then raise exception 'Owner location missing'; end if;
  if public._business_setup_status() then raise exception 'Setup remained open'; end if;
  perform public._complete_business_setup(a,'Retry must not rename',loc);
  if (select count(*) from locations)<>n or (select business_name from app_settings where id=1)<>'Setup verification' then raise exception 'Retry duplicated/changed setup'; end if;
  begin
    perform public._complete_business_setup(b,'Competing claim',loc);
    denied:=false;
  exception when unique_violation then denied:=true;
  end;
  if not denied then raise exception 'Second owner claim succeeded'; end if;
  delete from auth.users where id=a;
  if public._business_setup_status() then raise exception 'Owner deletion reopened setup'; end if;
end $$;
-- With only inactive locations, create a new shop without changing historical locations.
update public.locations set is_active=false;
update public.business_setup set completed_at=null,owner_id=null,location_id=null where id=1;
do $$
declare a uuid:=gen_random_uuid(); outcome jsonb; loc bigint; n bigint; denied boolean;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
    values(a,'setup-new-'||a||'@example.invalid',now(),'{}','{}');
  select count(*) into n from locations;
  begin
    perform public._complete_business_setup(a,'Invalid shop',null,'','Street');
    denied:=false;
  exception when others then denied:=true;
  end;
  if not denied then raise exception 'Blank shop name accepted'; end if;
  begin
    perform public._complete_business_setup(a,'Invalid shop',null,'New shop','');
    denied:=false;
  exception when others then denied:=true;
  end;
  if not denied then raise exception 'Blank shop address accepted'; end if;
  if (select count(*) from locations)<>n or (select role from profiles where user_id=a)<>'customer'
    or exists(select 1 from business_setup where completed_at is not null)
    or (select business_name from app_settings where id=1)<>'Setup verification' then
    raise exception 'Invalid new-shop claim partially committed';
  end if;
  outcome:=public._complete_business_setup(a,'New business',null,'First shop','Main Street');
  loc:=(outcome->>'location_id')::bigint;
  if (select count(*) from locations)<>n+1 then raise exception 'New-shop setup did not add exactly one location'; end if;
  if not exists(select 1 from locations where id=loc and name='First shop' and address='Main Street'
    and kind='shop' and tax_rate=0.0725 and is_active) then raise exception 'New shop defaults incorrect'; end if;
  if (select count(*) from locations where not is_active)<>n then raise exception 'Inactive historical locations changed'; end if;
  if (select home_location_id from profiles where user_id=a)<>loc then raise exception 'New owner location missing'; end if;
  perform public._complete_business_setup(a,'Retry new business',null,'Duplicate','Main Street');
  if (select count(*) from locations)<>n+1 then raise exception 'Retry duplicated first shop'; end if;
end $$;
rollback;

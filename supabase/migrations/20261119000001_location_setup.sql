-- Explicit owner/admin entry point; existing manager tax editing remains supported.
create function public.save_business_location(p_id bigint, p_location jsonb) returns bigint
language plpgsql security definer set search_path=public as $$
declare v public.locations%rowtype; result_id bigint;
begin
  if coalesce(public.auth_role()::text,'') not in ('owner','admin') then
    raise exception 'Only owners and admins can manage locations.' using errcode='42501';
  end if;
  v := jsonb_populate_record(null::public.locations,p_location);
  if nullif(btrim(v.code),'') is null or length(v.code)>40 or nullif(btrim(v.name),'') is null or length(v.name)>120
    or nullif(btrim(v.address),'') is null or length(v.address)>500 or v.kind is null
    or v.tax_rate is null or v.tax_rate<0 or v.tax_rate>0.30 or v.is_active is null
    or (v.open_time is null) <> (v.close_time is null) or v.open_time>=v.close_time
    or v.closed_weekdays is null or exists(select 1 from unnest(v.closed_weekdays) d where d is null or d<0 or d>6)
  then raise exception 'Enter a code, name, address, valid tax rate, weekdays and opening hours.' using errcode='22023'; end if;
  if p_id is null then
    insert into public.locations(code,name,kind,address,tax_rate,open_time,close_time,closed_weekdays,is_active,created_by)
    values(btrim(v.code),btrim(v.name),v.kind,btrim(v.address),v.tax_rate,v.open_time,v.close_time,v.closed_weekdays,v.is_active,auth.uid()) returning id into result_id;
  else
    update public.locations set code=btrim(v.code),name=btrim(v.name),kind=v.kind,address=btrim(v.address),tax_rate=v.tax_rate,
      open_time=v.open_time,close_time=v.close_time,closed_weekdays=v.closed_weekdays,is_active=v.is_active
      where id=p_id returning id into result_id;
    if result_id is null then raise exception 'Location no longer exists.' using errcode='P0002'; end if;
  end if;
  return result_id;
end $$;
revoke all on function public.save_business_location(bigint,jsonb) from public,anon;
grant execute on function public.save_business_location(bigint,jsonb) to authenticated;

-- Realtime authorizes private topics independently of PostgREST business headers.
create function public.can_receive_business_channel(p_topic text, p_extension text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare parts text[]; member_role app_role;
begin
  parts := string_to_array(p_topic, ':');
  -- A global Auth identity may listen only to its own membership-invalidations.
  if array_length(parts,1)=3 and parts[1]='account' and parts[2]=auth.uid()::text
    and parts[3]='access' and p_extension='broadcast' then return true; end if;
  if parts[1] <> 'business' or coalesce(parts[2],'') !~ '^[0-9a-fA-F-]{36}$' then return false; end if;
  begin
    select role into member_role from public.profiles
      where business_id=parts[2]::uuid and user_id=auth.uid();
  exception when invalid_text_representation then return false;
  end;
  if member_role is null then return false; end if;
  if array_length(parts,1)=3 and parts[3]='presence' and p_extension='presence' then
    return member_role <> 'customer';
  end if;
  if p_extension <> 'broadcast' then return false; end if;
  if array_length(parts,1)=3 and parts[3]='events' then return member_role <> 'customer'; end if;
  return array_length(parts,1)=4 and parts[3]='customer' and parts[4]=auth.uid()::text;
end $$;
revoke all on function public.can_receive_business_channel(text,text) from public;
grant execute on function public.can_receive_business_channel(text,text) to authenticated;

-- Restrictive policies also constrain any pre-existing permissive policies.
create policy tenant_channel_receive_guard on realtime.messages as restrictive for select to authenticated
  using (topic=realtime.topic() and public.can_receive_business_channel(realtime.topic(),extension::text));
create policy tenant_channel_receive on realtime.messages for select to authenticated
  using (topic=realtime.topic() and public.can_receive_business_channel(realtime.topic(),extension::text));
create policy tenant_channel_send_guard on realtime.messages as restrictive for insert to authenticated
  with check (topic=realtime.topic() and extension='presence' and public.can_receive_business_channel(realtime.topic(),extension::text));
create policy tenant_channel_presence on realtime.messages for insert to authenticated
  with check (topic=realtime.topic() and extension='presence' and public.can_receive_business_channel(realtime.topic(),extension::text));

create function public.broadcast_business_event() returns trigger
language plpgsql security definer set search_path=public as $$
declare customer_user uuid;
begin
  perform realtime.send(to_jsonb(new),'app-event','business:'||new.business_id||':events',true);
  if new.customer_id is not null then
    select auth_user_id into customer_user from public.customers
      where business_id=new.business_id and id=new.customer_id;
    if customer_user is not null then
      perform realtime.send(to_jsonb(new),'app-event','business:'||new.business_id||':customer:'||customer_user,true);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.broadcast_business_event() from public,anon,authenticated;
create trigger broadcast_business_event after insert on public.app_events
  for each row execute function public.broadcast_business_event();

create function public.broadcast_business_access() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 perform realtime.send(jsonb_build_object('user_id',coalesce(new.user_id,old.user_id)),
  'access-change','account:'||coalesce(new.user_id,old.user_id)||':access',true);
 return coalesce(new,old);
end $$;
revoke all on function public.broadcast_business_access() from public,anon,authenticated;
create trigger broadcast_business_access after insert or update or delete on public.profiles
 for each row execute function public.broadcast_business_access();

-- Trusted seeding remains scoped to one business; global identities never restart.
create or replace function public._reset_demo_data(p_include_master boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare remaining oid[]; candidate oid; v_business uuid:=_active_business_id();
begin
 if not _is_system() then raise exception 'Trusted demo administration required.' using errcode='42501'; end if;
 -- Clear the selected business's nullable document back-links to break cycles.
 update sales_orders set sale_id=null where business_id=v_business;
 update sales set exchange_return_id=null where business_id=v_business;
 -- Browser roles cannot call this helper. CLI reset guards additionally reject
 -- both persistent projects before opening any database connection.
 select array_agg(c.oid) into remaining from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r'
 and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='business_id' and not a.attisdropped)
 and c.relname not in ('businesses','gl_accounts','reason_codes','app_settings','doc_sequences')
 and (p_include_master or c.relname not in ('locations','suppliers','items','item_costs','item_suppliers','bom_lines','customers','profiles','promotions'));
 while coalesce(array_length(remaining,1),0)>0 loop
  select t into candidate from unnest(remaining) t where not exists(
    select 1 from pg_constraint f where f.contype='f' and f.confrelid=t
    and f.conrelid=any(remaining) and f.conrelid<>f.confrelid
    and f.conname not in ('sales_orders_sale_fk','sales_exchange_return_fk')) limit 1;
  if candidate is null then raise exception 'Demo reset dependency cycle; no reset committed.'; end if;
  execute format('delete from %s where business_id=$1',candidate::regclass) using v_business;
  remaining:=array_remove(remaining,candidate);
 end loop;
 if not p_include_master then update item_costs set qty_total=0,value_total=0 where business_id=v_business; end if;
 update doc_sequences set next_no=1 where business_id=v_business;
 delete from app_settings where business_id=v_business;
 insert into app_settings(business_id,id,business_name) select id,1,name from businesses where id=v_business;
end $$;
alter function public._reset_demo_data(boolean) owner to postgres;
revoke all on function public._reset_demo_data(boolean) from public,anon,authenticated,glazed_executor;
grant execute on function public._reset_demo_data(boolean) to service_role;

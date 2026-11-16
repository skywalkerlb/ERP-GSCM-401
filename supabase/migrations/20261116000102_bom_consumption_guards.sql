-- Reject transactions that would make or sell a parent without consuming any recipe.
-- Existing RPCs retain their signatures, grants, authorization and stock/accounting logic.
-- Triggers also cover sales-order fulfillment and exchanges, which share sale_lines.

create function _require_sale_recipe() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from items where id = new.item_id and item_type = 'kit')
     and not exists (select 1 from bom_lines where parent_item_id = new.item_id) then
    raise exception 'Add a recipe (BOM) for this kit before selling it.';
  end if;
  return new;
end $$;

create trigger sale_lines_require_recipe
before insert or update of item_id on sale_lines
for each row execute function _require_sale_recipe();

create function _require_production_recipe() returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- The recipe can have been removed after the order was scheduled.
  if new.status = 'in_progress'
     and not exists (select 1 from bom_lines where parent_item_id = new.item_id) then
    raise exception 'Add a recipe (BOM) for this item before starting production.';
  end if;
  return new;
end $$;

create trigger production_orders_require_recipe
before insert or update of status on production_orders
for each row execute function _require_production_recipe();

revoke all on function _require_sale_recipe(), _require_production_recipe() from public, anon, authenticated;

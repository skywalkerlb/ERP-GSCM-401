-- 0016: admin-only reset used by the seed runner and the demo reset. Not callable through the API.

-- Wipes business data and restarts identities and document numbers.
--   p_include_master = false: keeps locations, suppliers, items, BOMs, customers, promotions (clears transactions only)
--   p_include_master = true : also clears those (and therefore profiles); the seed recreates them and the auth users.
-- Always keeps gl_accounts and reason_codes; resets app_settings to defaults and doc_sequences to 1.
create function _reset_demo_data(p_include_master boolean default false) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not _is_system() then
    raise exception 'Only an admin session can reset demo data.' using errcode = '42501';
  end if;

  truncate table
    app_events, expenses, ap_payments, ap_bills, po_receipt_lines, po_receipts, po_lines, purchase_orders,
    production_defects, production_orders, day_closes, adjustment_lines, inventory_adjustments, transfer_lines, transfers,
    bake_plan_lines, bake_plans, demand_forecasts, forecast_runs, return_lines, returns, sale_lines, sales,
    so_lines, sales_orders, inventory_transactions, inventory_balances, journal_lines, journal_entries
    restart identity cascade;
  update item_costs set qty_total = 0, value_total = 0;

  if p_include_master then
    truncate table promotions, bom_lines, item_suppliers, items, suppliers, customers, locations, profiles restart identity cascade;
  end if;

  update doc_sequences set next_no = 1;
  delete from app_settings;
  insert into app_settings (id) values (1);
end $$;

revoke execute on function _reset_demo_data(boolean) from public, anon, authenticated;
grant execute on function _reset_demo_data(boolean) to service_role;

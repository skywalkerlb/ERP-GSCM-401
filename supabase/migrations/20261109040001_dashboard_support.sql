-- Workstream G (dashboard): GL balance of one account as of the end of a business date.
-- Why: the dashboard "Inventory value" card shows its change since last week. Summing journal lines in the browser
-- would page through thousands of rows on every sale event; this returns one number.
-- Read-only, security invoker (staff only through RLS on journal_lines), signed on the account's debit side
-- (debit - credit), so for 1200 Inventory it is the asset balance.
create function gl_balance_on(p_account text, p_date date)
returns numeric
language sql stable
set search_path = public
as $$
  select coalesce(sum(jl.debit - jl.credit), 0)
    from journal_lines jl
    join journal_entries je on je.id = jl.entry_id
   where jl.account_code = p_account and je.entry_date <= p_date
$$;

revoke execute on function gl_balance_on(text, date) from public, anon;
grant execute on function gl_balance_on(text, date) to authenticated, service_role;

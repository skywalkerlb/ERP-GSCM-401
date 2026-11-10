-- 0003: GL-lite. Chart of accounts, journal, and the balanced-entry constraint trigger.

create table gl_accounts (
  code         text primary key,
  name         text not null,
  type         text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'contra_revenue', 'expense')),
  statement    text not null check (statement in ('balance_sheet', 'income')),
  normal_side  text not null check (normal_side in ('debit', 'credit'))
);

create table journal_entries (
  id           bigint generated always as identity primary key,
  entry_date   date not null,
  source_type  text not null,                  -- sale, return, receipt, ap_payment, production_start, ...
  source_id    bigint,
  memo         text,
  created_at   timestamptz not null default now(),
  created_by   uuid
);
create index journal_entries_date_idx on journal_entries (entry_date);
create index journal_entries_source_idx on journal_entries (source_type, source_id);

create table journal_lines (
  id            bigint generated always as identity primary key,
  entry_id      bigint not null references journal_entries(id) on delete cascade,
  account_code  text   not null references gl_accounts(code),
  location_id   bigint references locations(id),
  debit         numeric(12,2) not null default 0 check (debit  >= 0),
  credit        numeric(12,2) not null default 0 check (credit >= 0),
  check (not (debit > 0 and credit > 0))
);
create index journal_lines_entry_idx on journal_lines (entry_id);
create index journal_lines_account_idx on journal_lines (account_code, entry_id);
create index journal_lines_loc_idx on journal_lines (location_id);

-- Every journal entry must balance (checked when the transaction commits).
create function _check_journal_balanced() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_entry bigint := case when tg_op = 'DELETE' then old.entry_id else new.entry_id end;
  v_diff  numeric;
begin
  select coalesce(sum(debit), 0) - coalesce(sum(credit), 0) into v_diff
    from journal_lines where entry_id = v_entry;
  if v_diff <> 0 then
    raise exception 'Journal entry % is out of balance by %', v_entry, v_diff
      using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger journal_balanced
  after insert or update or delete on journal_lines
  deferrable initially deferred
  for each row execute function _check_journal_balanced();

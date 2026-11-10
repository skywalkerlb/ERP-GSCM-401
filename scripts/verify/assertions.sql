-- Glazed ERP data and security assertions.
-- Each block starts with "-- check: <name>" and is one query. A check PASSES when it returns no rows;
-- every row it returns is a failure (first column is a label). Run with: node scripts/verify/run.mjs
-- Blocks tagged "-- check: <name> [needs-data]" are data-volume checks that only make sense after seeding.

-- check: ledger quantities equal inventory_balances
select 'balance mismatch' as label, coalesce(l.item_id, b.item_id) as item_id, coalesce(l.location_id, b.location_id) as location_id,
       coalesce(l.condition, b.condition) as condition, l.qty as ledger_qty, b.qty_on_hand as balance_qty
  from (select item_id, location_id, condition, sum(qty_delta) as qty from inventory_transactions group by 1, 2, 3) l
  full join (select item_id, location_id, condition, qty_on_hand from inventory_balances where qty_on_hand <> 0) b
    on b.item_id = l.item_id and b.location_id = l.location_id and b.condition = l.condition
 where coalesce(l.qty, 0) <> coalesce(b.qty_on_hand, 0);

-- check: ledger equals item_costs (qty and value, per item)
select 'item_costs mismatch' as label, c.item_id, c.qty_total, l.qty as ledger_qty, c.value_total, l.val as ledger_value
  from item_costs c
  left join (select item_id, sum(qty_delta) as qty, sum(value_delta) as val from inventory_transactions group by 1) l on l.item_id = c.item_id
 where c.qty_total <> coalesce(l.qty, 0) or c.value_total <> coalesce(l.val, 0);

-- check: item_costs qty equals sum of balances
select 'item_costs vs balances' as label, c.item_id, c.qty_total, coalesce(b.qty, 0) as balances_qty
  from item_costs c left join (select item_id, sum(qty_on_hand) as qty from inventory_balances group by 1) b on b.item_id = c.item_id
 where c.qty_total <> coalesce(b.qty, 0);

-- check: ledger value = item_costs = valuation view = GL 1200
select 'inventory vs GL 1200' as label, * from v_inventory_gl_check
 where ledger_vs_gl <> 0 or costs_vs_gl <> 0 or valuation_vs_gl <> 0;

-- check: every journal entry balances
select 'unbalanced entry' as label, entry_id, sum(debit) as debit, sum(credit) as credit
  from journal_lines group by entry_id having sum(debit) <> sum(credit);

-- check: no negative balances or costs
select 'negative balance' as label, item_id, location_id, condition, qty_on_hand from inventory_balances where qty_on_hand < 0
union all
select 'negative item_costs', item_id, null, null, qty_total from item_costs where qty_total < 0
union all
select 'value without quantity', item_id, null, null, value_total from item_costs where qty_total = 0 and value_total <> 0;

-- check: every ledger posting with a GL effect is linked to a journal entry
select 'ledger row without journal' as label, id, txn_type, ref_type, ref_id
  from inventory_transactions
 where journal_entry_id is null and txn_type not in ('transfer_out', 'transfer_in', 'dayold_out', 'dayold_in');

-- check: ledger business_date is the Denver date of txn_at
select 'wrong business date' as label, id, txn_at, business_date
  from inventory_transactions where business_date <> (txn_at at time zone 'America/Denver')::date limit 20;

-- check: AP open bills equal GL 2000
select 'AP vs GL 2000' as label, ap.open_ap, gl.bal as gl_2000
  from (select coalesce(sum(amount - amount_paid), 0) as open_ap from ap_bills) ap,
       (select coalesce(sum(credit - debit), 0) as bal from journal_lines where account_code = '2000') gl
 where ap.open_ap <> gl.bal;

-- check: bill payments add up
select 'bill paid mismatch' as label, b.id, b.amount_paid, coalesce(p.s, 0) as payments
  from ap_bills b left join (select bill_id, sum(amount) as s from ap_payments group by 1) p on p.bill_id = b.id
 where b.amount_paid <> coalesce(p.s, 0);

-- check: GL 4000 equals gross sale lines
select 'GL 4000 vs sale lines' as label, gl.bal as gl_4000, s.gross as sale_lines_gross
  from (select coalesce(sum(credit - debit), 0) as bal from journal_lines where account_code = '4000') gl,
       (select coalesce(sum(line_net + discount_amt), 0) as gross from sale_lines) s
 where gl.bal <> s.gross;

-- check: GL 4100 equals gross value returned
select 'GL 4100 vs return lines' as label, gl.bal, r.v
  from (select coalesce(sum(debit - credit), 0) as bal from journal_lines where account_code = '4100') gl,
       (select coalesce(sum(gross_amt), 0) as v from return_lines) r
 where gl.bal <> r.v;

-- check: GL 4200 equals discounts given less discounts reversed on returns
select 'GL 4200 vs discounts' as label, gl.bal, d.v
  from (select coalesce(sum(debit - credit), 0) as bal from journal_lines where account_code = '4200') gl,
       (select (select coalesce(sum(discount_total), 0) from sales) - (select coalesce(sum(gross_amt - refund_amt), 0) from return_lines) as v) d
 where gl.bal <> d.v;

-- check: GL 5000 equals sale COGS less COGS reversed on returns
select 'GL 5000 vs sale COGS' as label, gl.bal, c.v
  from (select coalesce(sum(debit - credit), 0) as bal from journal_lines where account_code = '5000') gl,
       (select (select coalesce(sum(cogs_total), 0) from sale_lines) - (select coalesce(sum(cost_amt), 0) from return_lines) as v) c
 where gl.bal <> c.v;

-- check: GL 2100 equals tax collected less tax refunded
select 'GL 2100 vs tax' as label, gl.bal, t.v
  from (select coalesce(sum(credit - debit), 0) as bal from journal_lines where account_code = '2100') gl,
       (select (select coalesce(sum(tax_total), 0) from sales) - (select coalesce(sum(tax_refund), 0) from returns) as v) t
 where gl.bal <> t.v;

-- check: GL 1000 equals sales receipts less refunds less payments plus opening cash less expenses
select 'GL 1000 vs documents' as label, gl.bal, d.v
  from (select coalesce(sum(debit - credit), 0) as bal from journal_lines where account_code = '1000') gl,
       (select (select coalesce(sum(debit), 0) from journal_lines jl join journal_entries je on je.id = jl.entry_id
                 where jl.account_code = '1000' and je.source_type = 'opening')
             + (select coalesce(sum(total), 0) from sales)
             - (select coalesce(sum(refund_total), 0) from returns)
             - (select coalesce(sum(amount), 0) from ap_payments)
             - (select coalesce(sum(amount), 0) from expenses) as v) d
 where gl.bal <> d.v;

-- check: WIP equals the value issued to orders still in progress (zero when all are completed)
select 'WIP vs open orders' as label, gl.bal, w.v
  from (select coalesce(sum(debit - credit), 0) as bal from journal_lines where account_code = '1300') gl,
       (select coalesce(sum(issued_value), 0) as v from production_orders where status = 'in_progress') w
 where gl.bal <> w.v;

-- check: completed production orders reconcile (good + scrap = started, defects match)
select 'production order mismatch' as label, po.id, po.mo_number, po.qty_started, po.qty_good, po.qty_scrapped
  from production_orders po
 where po.status = 'completed'
   and (po.qty_good + po.qty_scrapped <> po.qty_started
        or po.qty_scrapped <> coalesce((select sum(qty) from production_defects d where d.mo_id = po.id and d.kind = 'scrap'), 0)
        or po.qty_reworked <> coalesce((select sum(qty) from production_defects d where d.mo_id = po.id and d.kind = 'rework'), 0));

-- check: sale headers equal their lines
select 'sale header mismatch' as label, s.id, s.receipt_no, s.subtotal, l.gross, s.discount_total, l.disc, s.total
  from sales s
  join (select sale_id, sum(round(qty * unit_price, 2)) as gross, sum(discount_amt) as disc from sale_lines group by 1) l on l.sale_id = s.id
 where s.subtotal <> l.gross or s.discount_total <> l.disc or s.total <> s.subtotal - s.discount_total + s.tax_total
    or abs(s.tax_total - round((s.subtotal - s.discount_total) * s.tax_rate, 2)) > 0.01;

-- check: document quantities are consistent
select 'qty_returned over qty' as label, id, qty, qty_returned from sale_lines where qty_returned > qty
union all
select 'po line over-received', id, qty_ordered, qty_received + qty_cancelled from po_lines where qty_received + qty_cancelled > qty_ordered
union all
select 'so line over-fulfilled', id, qty, qty_fulfilled from so_lines where qty_fulfilled > qty;

-- check: purchase order totals and bills agree with receipts
select 'receipt vs bill' as label, r.id as receipt_id, r.amount, b.amount as bill_amount
  from po_receipts r left join ap_bills b on b.receipt_id = r.id
 where r.amount > 0 and (b.id is null or b.amount <> r.amount);

-- check: reference data (accounts, reason codes, settings) present
select 'missing reference data' as label, what
  from (select 'gl accounts' as what where (select count(*) from gl_accounts) < 16
        union all select 'reason codes' where (select count(*) from reason_codes) < 14
        union all select 'app_settings row' where not exists (select 1 from app_settings where id = 1)
        union all select 'tax rate 7.25%' where not exists (select 1 from app_settings where id = 1 and default_tax_rate = 0.0725)) x;

-- check: minimum data counts [needs-data]
select 'data volume' as label, what, have, need
  from (select '>= 25 items' as what, (select count(*) from items) as have, 25 as need
        union all select '>= 5 BOM parents', (select count(distinct parent_item_id) from bom_lines), 5
        union all select '>= 6 suppliers', (select count(*) from suppliers), 6
        union all select '>= 10 customers', (select count(*) from customers), 10
        union all select '4 locations', (select count(*) from locations), 4
        union all select 'history >= 183 days', (select coalesce(max(business_date) - min(business_date) + 1, 0) from sales), 183
        union all select '>= 5000 sales', (select count(*) from sales), 5000) c
 where have < need;

-- check: every item has barcode, cost, and the fields it needs [needs-data]
-- Kits are consumed through their components and intentionally have no stocked item_costs row.
with component_costs as (
  select i.id, coalesce(c.avg_cost, (select min(s.unit_cost) from item_suppliers s where s.item_id=i.id)) as unit_cost
    from items i left join item_costs c on c.item_id=i.id
), effective_costs as (
  select i.id, case when i.item_type='kit' then
    (select sum(b.qty_per*cc.unit_cost) from bom_lines b join component_costs cc on cc.id=b.component_item_id
      where b.parent_item_id=i.id having bool_and(cc.unit_cost is not null))
    else c.unit_cost end as unit_cost
    from items i join component_costs c on c.id=i.id
)
select 'item incomplete' as label, i.sku,
       concat_ws(', ', case when i.barcode is null then 'barcode' end,
                 case when c.unit_cost is null then 'cost' end,
                 case when i.is_sellable and i.list_price is null then 'price' end,
                 case when i.is_purchasable and i.reorder_point <= 0 then 'reorder_point' end,
                 case when i.is_purchasable and i.lead_time_days <= 0 then 'lead_time' end,
                 case when i.is_purchasable and i.preferred_supplier_id is null then 'preferred_supplier' end) as missing
  from items i join effective_costs c on c.id = i.id
 where i.is_active and (i.barcode is null
       or c.unit_cost is null
       or (i.is_sellable and i.list_price is null)
       or (i.is_purchasable and (i.reorder_point <= 0 or i.lead_time_days <= 0 or i.preferred_supplier_id is null)));

-- check: supplier scorecard has keep, watch and replace [needs-data]
select 'missing rating' as label, r.rating
  from (values ('keep'), ('watch'), ('replace')) r(rating)
 where not exists (select 1 from v_supplier_scorecard s where s.rating = r.rating);

-- check: MRP shows at least one planned order in the next 4 weeks [needs-data]
select 'no planned order' as label where not exists (select 1 from mrp_weekly(public._today(), 4, false) where planned_order_qty > 0);

-- check: confirmed future sales orders and open POs exist for the demo [needs-data]
select 'demo future data' as label, what
  from (select 'placed sales orders (>= 10)' as what where (select count(*) from sales_orders where status = 'placed' and requested_for > now()) < 10
        union all select 'open POs (>= 3)' where (select count(*) from purchase_orders where status = 'sent') < 3
        union all select 'open AP bill' where not exists (select 1 from ap_bills where status = 'open')
        union all select 'overdue AP bill' where not exists (select 1 from ap_bills where status = 'open' and due_date < public._today())) x;

-- check: RLS is enabled on every public table
select 'RLS disabled' as label, c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;

-- check: ledger, document and GL tables have no write policies
select 'write policy on protected table' as label, tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
   and tablename in ('inventory_transactions', 'inventory_balances', 'item_costs', 'journal_entries', 'journal_lines', 'gl_accounts',
        'sales', 'sale_lines', 'returns', 'return_lines', 'sales_orders', 'so_lines', 'transfers', 'transfer_lines',
        'inventory_adjustments', 'adjustment_lines', 'day_closes', 'production_orders', 'production_defects', 'purchase_orders',
        'po_lines', 'po_receipts', 'po_receipt_lines', 'ap_bills', 'ap_payments', 'expenses', 'bake_plans', 'bake_plan_lines',
        'forecast_runs', 'demand_forecasts', 'app_events', 'doc_sequences');

-- check: authenticated has no write privileges on protected tables
select 'authenticated can write' as label, c.relname, p.priv
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public' and c.relkind = 'r'
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
 where has_table_privilege('authenticated', c.oid, p.priv)
   and c.relname not in ('locations', 'suppliers', 'items', 'item_suppliers', 'bom_lines', 'customers', 'promotions', 'reason_codes', 'app_settings', 'profiles');

-- check: anon has no access to tables or sequences
select 'anon table privilege' as label, c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public' and c.relkind in ('r', 'v', 'p')
 where has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT')
    or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE');

-- check: anon cannot execute any public function
select 'anon can execute' as label, p.oid::regprocedure::text as function
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
 where p.prokind in ('f', 'p') and has_function_privilege('anon', p.oid, 'EXECUTE')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');

-- check: internal helpers are not executable by signed-in users
select 'helper executable by authenticated' as label, p.oid::regprocedure::text as function
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
 where p.prokind = 'f' and p.proname like '\_%'
   and p.proname not in ('_bdate', '_today', '_ts_on', '_fmt_qty', '_in_season', '_season_start', '_mrp_demand')
   and has_function_privilege('authenticated', p.oid, 'EXECUTE');

-- check: PUBLIC cannot execute any public function
select 'PUBLIC can execute' as label, p.oid::regprocedure::text as function
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
 where p.prokind in ('f', 'p') and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE');

-- check: every public function pins search_path
select 'function without search_path' as label, p.oid::regprocedure::text as function, p.prosecdef as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
 where p.prokind = 'f' and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');

-- check: every view in public is security_invoker
select 'view not security_invoker' as label, c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
 where c.relkind = 'v' and not coalesce('security_invoker=true' = any (c.reloptions), false);

-- check: only app_events is in the realtime publication
select 'unexpected realtime table' as label, schemaname, tablename
  from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename <> 'app_events';

-- check: app_events is in the realtime publication
select 'app_events not published' as label
 where exists (select 1 from pg_publication where pubname = 'supabase_realtime')
   and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'app_events');

-- check: new auth users get a profile (trigger present)
select 'signup trigger missing' as label
 where not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'auth' and c.relname = 'users' and t.tgname = 'on_auth_user_created' and not t.tgisinternal);

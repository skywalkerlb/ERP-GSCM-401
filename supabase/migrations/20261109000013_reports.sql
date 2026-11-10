-- 0013: reports and finance. P&L and turnover read only the journal (and the ledger for per-item turnover).
-- Reporting functions are SECURITY INVOKER: they run under the caller's RLS (staff see data, customers see nothing).

create view v_trial_balance with (security_invoker = true) as
select a.code as account_code, a.name, a.type, a.normal_side,
       coalesce(sum(jl.debit), 0) as debit, coalesce(sum(jl.credit), 0) as credit,
       case when a.normal_side = 'debit' then coalesce(sum(jl.debit - jl.credit), 0)
            else coalesce(sum(jl.credit - jl.debit), 0) end as balance
  from gl_accounts a left join journal_lines jl on jl.account_code = a.code
 group by a.code, a.name, a.type, a.normal_side
 order by a.code;

create view v_ap_open_bills with (security_invoker = true) as
select b.id as bill_id, b.supplier_id, s.name as supplier_name, b.po_id, po.po_number, b.receipt_id, b.bill_date, b.due_date,
       b.amount, b.amount_paid, b.amount - b.amount_paid as balance,
       greatest(0, _today() - b.due_date) as days_overdue, (b.due_date < _today()) as is_overdue
  from ap_bills b
  join suppliers s on s.id = b.supplier_id
  left join purchase_orders po on po.id = b.po_id
 where b.status = 'open' and b.amount > b.amount_paid;

-- Profit and loss from the journal. All amounts are positive magnitudes; line_type says how to show them.
-- line_type: line | subtotal | total | pct
create function pnl(p_from date, p_to date, p_location bigint default null)
returns table (sort_order int, line_key text, label text, account_code text, amount numeric, line_type text)
language sql stable
set search_path = public
as $$
  with a as (
    select jl.account_code as code, coalesce(sum(jl.debit), 0) as d, coalesce(sum(jl.credit), 0) as c
      from journal_lines jl join journal_entries je on je.id = jl.entry_id
     where je.entry_date between p_from and p_to and (p_location is null or jl.location_id = p_location)
     group by 1
  ), v as (
    select coalesce((select c - d from a where code = '4000'), 0) as sales,
           coalesce((select d - c from a where code = '4100'), 0) as ret,
           coalesce((select d - c from a where code = '4200'), 0) as disc,
           coalesce((select d - c from a where code = '5000'), 0) as cogs,
           coalesce((select d - c from a where code = '5100'), 0) as waste,
           coalesce((select d - c from a where code = '5150'), 0) as qual,
           coalesce((select d - c from a where code = '5200'), 0) as scrap,
           coalesce((select d - c from a where code = '5300'), 0) as adj,
           coalesce((select sum(d - c) from a where code like '6%'), 0) as opex
  ), t as (
    select v.*, v.sales - v.ret - v.disc as net,
           v.cogs + v.waste + v.qual + v.scrap + v.adj as costs,
           v.sales - v.ret - v.disc - (v.cogs + v.waste + v.qual + v.scrap + v.adj) as gp
      from v
  )
  select 10, 'gross_sales', 'Gross sales', '4000', t.sales, 'line' from t
  union all select 20, 'returns', 'Less: returns', '4100', t.ret, 'line' from t
  union all select 30, 'discounts', 'Less: discounts', '4200', t.disc, 'line' from t
  union all select 40, 'net_sales', 'Net sales', null, t.net, 'subtotal' from t
  union all select 50, 'cogs', 'Cost of goods sold', '5000', t.cogs, 'line' from t
  union all select 60, 'waste', 'Waste and spoilage', '5100', t.waste, 'line' from t
  union all select 70, 'quality_returns', 'Quality returns', '5150', t.qual, 'line' from t
  union all select 80, 'scrap', 'Production scrap', '5200', t.scrap, 'line' from t
  union all select 90, 'adjustments', 'Inventory adjustments', '5300', t.adj, 'line' from t
  union all select 100, 'total_costs', 'Total cost of sales and losses', null, t.costs, 'subtotal' from t
  union all select 110, 'gross_profit', 'Gross profit', null, t.gp, 'total' from t
  union all select 120, 'gross_margin_pct', 'Gross margin %', null,
         case when t.net <> 0 then round(100 * t.gp / t.net, 1) end, 'pct' from t
  union all select 200 + row_number() over (order by g.code)::int, 'opex_' || g.code, g.name, g.code,
         coalesce((select a.d - a.c from a where a.code = g.code), 0), 'line'
    from gl_accounts g where g.code like '6%'
  union all select 300, 'total_opex', 'Total operating expenses', null, t.opex, 'subtotal' from t
  union all select 310, 'operating_income', 'Operating income', null, t.gp - t.opex, 'total' from t
  order by 1
$$;

-- COGS (net, from the journal) / average inventory. Row with item_id null is the company total.
-- Average inventory = (GL 1200 before p_from + GL 1200 at p_to) / 2. Per-item rows use ledger value_delta.
create function inventory_turnover(p_from date, p_to date)
returns table (item_id bigint, sku text, name text, category text, cogs numeric, avg_inventory numeric, turnover numeric, days_on_hand numeric)
language sql stable
set search_path = public
as $$
  with days as (select (p_to - p_from + 1)::numeric as n),
  gl as (
    select coalesce((select sum(jl.debit - jl.credit) from journal_lines jl join journal_entries je on je.id = jl.entry_id
                      where jl.account_code = '1200' and je.entry_date < p_from), 0) as open_v,
           coalesce((select sum(jl.debit - jl.credit) from journal_lines jl join journal_entries je on je.id = jl.entry_id
                      where jl.account_code = '1200' and je.entry_date <= p_to), 0) as close_v,
           coalesce((select sum(jl.debit - jl.credit) from journal_lines jl join journal_entries je on je.id = jl.entry_id
                      where jl.account_code = '5000' and je.entry_date between p_from and p_to), 0) as cogs
  ), total as (
    select null::bigint as item_id, 'TOTAL'::text as sku, 'All inventory'::text as name, null::text as category,
           gl.cogs, (gl.open_v + gl.close_v) / 2 as avg_inv from gl
  ), per as (
    select i.id as item_id, i.sku, i.name, i.category,
           coalesce(sum(-t.value_delta) filter (where t.business_date between p_from and p_to
                      and t.txn_type in ('sale', 'sale_return', 'prod_issue')), 0) as cogs,
           (coalesce(sum(t.value_delta) filter (where t.business_date < p_from), 0)
            + coalesce(sum(t.value_delta) filter (where t.business_date <= p_to), 0)) / 2 as avg_inv
      from items i left join inventory_transactions t on t.item_id = i.id and t.business_date <= p_to
     group by i.id, i.sku, i.name, i.category
  )
  select u.item_id, u.sku, u.name, u.category, round(u.cogs, 2), round(u.avg_inv, 2),
         case when u.avg_inv > 0 then round(u.cogs / u.avg_inv, 3) end,
         case when u.avg_inv > 0 and u.cogs > 0 then round(days.n / (u.cogs / u.avg_inv), 1) end
    from (select * from total union all select * from per where cogs <> 0 or avg_inv <> 0) u, days
   order by (u.item_id is not null), u.cogs desc
$$;

-- Sales by day or week. Ties to the P&L: returns = gross value returned, discounts = net of reversals.
create function sales_summary(p_from date, p_to date, p_grain text default 'day', p_location bigint default null)
returns table (
  period_start date, period_label text, tickets bigint, units numeric, gross_sales numeric, discounts numeric,
  returns numeric, net_sales numeric, tax numeric, cogs numeric, gross_profit numeric, avg_ticket numeric
)
language sql stable
set search_path = public
as $$
  with g as (select case when p_grain = 'week' then 'week' else 'day' end as grain),
  s as (
    select date_trunc(g.grain, sa.business_date)::date as ps,
           sum(sa.ticket_count) as tickets, sum(sa.subtotal) as gross, sum(sa.discount_total) as disc, sum(sa.tax_total) as tax,
           sum(l.units) as units, sum(l.cogs) as cogs
      from sales sa cross join g
      join lateral (select sum(sl.qty) as units, sum(sl.cogs_total) as cogs from sale_lines sl where sl.sale_id = sa.id) l on true
     where sa.business_date between p_from and p_to and (p_location is null or sa.location_id = p_location)
     group by 1
  ), r as (
    select date_trunc(g.grain, rt.business_date)::date as ps,
           sum(rl.gross_amt) as ret_gross, sum(rl.gross_amt - rl.refund_amt) as disc_rev, sum(rl.cost_amt) as ret_cost
      from returns rt cross join g
      join return_lines rl on rl.return_id = rt.id
     where rt.business_date between p_from and p_to and (p_location is null or rt.location_id = p_location)
     group by 1
  )
  select coalesce(s.ps, r.ps), to_char(coalesce(s.ps, r.ps), 'Mon FMDD'),
         coalesce(s.tickets, 0), coalesce(s.units, 0), coalesce(s.gross, 0),
         coalesce(s.disc, 0) - coalesce(r.disc_rev, 0), coalesce(r.ret_gross, 0),
         coalesce(s.gross, 0) - (coalesce(s.disc, 0) - coalesce(r.disc_rev, 0)) - coalesce(r.ret_gross, 0),
         coalesce(s.tax, 0), coalesce(s.cogs, 0) - coalesce(r.ret_cost, 0),
         coalesce(s.gross, 0) - (coalesce(s.disc, 0) - coalesce(r.disc_rev, 0)) - coalesce(r.ret_gross, 0)
           - (coalesce(s.cogs, 0) - coalesce(r.ret_cost, 0)),
         case when coalesce(s.tickets, 0) > 0
              then round((coalesce(s.gross, 0) - coalesce(s.disc, 0)) / s.tickets, 2) end
    from s full join r on r.ps = s.ps
   order by 1
$$;

create function top_sellers(
  p_from date, p_to date, p_location bigint default null, p_limit int default 10, p_by text default 'revenue'
) returns table (rank int, item_id bigint, sku text, name text, category text, units numeric, revenue numeric, cogs numeric, margin numeric)
language sql stable
set search_path = public
as $$
  select row_number() over (order by case when p_by = 'units' then q.units else q.revenue end desc, q.name)::int,
         q.item_id, q.sku, q.name, q.category, q.units, q.revenue, q.cogs, q.revenue - q.cogs
    from (
      select i.id as item_id, i.sku, i.name, i.category,
             sum(sl.qty - sl.qty_returned) as units,
             round(sum(sl.line_net * (sl.qty - sl.qty_returned) / sl.qty), 2) as revenue,
             round(sum(sl.cogs_total * (sl.qty - sl.qty_returned) / sl.qty), 2) as cogs
        from sale_lines sl
        join sales sa on sa.id = sl.sale_id
        join items i on i.id = sl.item_id
       where sa.business_date between p_from and p_to and (p_location is null or sa.location_id = p_location)
       group by i.id, i.sku, i.name, i.category
    ) q
   order by 1
   limit greatest(p_limit, 1)
$$;

-- Waste at ledger grain (txn_type = waste). cost and qty are positive.
create view v_waste_summary with (security_invoker = true) as
select t.business_date, t.location_id, l.code as location_code, l.name as location_name,
       t.item_id, i.sku, i.name as item_name, i.category,
       t.reason_code, rc.label as reason_label, t.condition,
       -t.qty_delta as qty, -t.value_delta as cost
  from inventory_transactions t
  join items i on i.id = t.item_id
  join locations l on l.id = t.location_id
  left join reason_codes rc on rc.code = t.reason_code
 where t.txn_type = 'waste';

-- Waste dashboard data: totals, % of production cost, by reason / item / location / day.
create function waste_report(p_from date, p_to date, p_location bigint default null) returns jsonb
language sql stable
set search_path = public
as $$
  with w as (
    select * from v_waste_summary where business_date between p_from and p_to and (p_location is null or location_id = p_location)
  ), prod as (
    select t.item_id, sum(t.qty_delta) as qty, sum(t.value_delta) as cost
      from inventory_transactions t
     where t.txn_type = 'prod_receipt' and t.business_date between p_from and p_to
     group by 1
  ), tot as (
    select coalesce(sum(qty), 0) as qty, coalesce(sum(cost), 0) as cost from w
  ), ptot as (select coalesce(sum(cost), 0) as cost, coalesce(sum(qty), 0) as qty from prod)
  select jsonb_build_object(
    'summary', (select jsonb_build_object('waste_qty', tot.qty, 'waste_cost', tot.cost, 'production_cost', ptot.cost,
                  'production_qty', ptot.qty,
                  'waste_pct_of_production_cost', case when ptot.cost > 0 then round(100 * tot.cost / ptot.cost, 2) end) from tot, ptot),
    'by_reason', coalesce((select jsonb_agg(jsonb_build_object('reason_code', x.reason_code, 'label', x.label, 'qty', x.qty, 'cost', x.cost,
                  'pct_of_waste', case when tot.cost > 0 then round(100 * x.cost / tot.cost, 1) end) order by x.cost desc)
                  from (select reason_code, max(reason_label) as label, sum(qty) as qty, sum(cost) as cost from w group by 1) x, tot), '[]'),
    'by_item', coalesce((select jsonb_agg(jsonb_build_object('item_id', x.item_id, 'sku', x.sku, 'name', x.name, 'qty', x.qty, 'cost', x.cost,
                  'produced_qty', coalesce(p.qty, 0), 'produced_cost', coalesce(p.cost, 0),
                  'waste_pct_of_production_cost', case when coalesce(p.cost, 0) > 0 then round(100 * x.cost / p.cost, 2) end) order by x.cost desc)
                  from (select item_id, max(sku) as sku, max(item_name) as name, sum(qty) as qty, sum(cost) as cost from w group by 1) x
                  left join prod p on p.item_id = x.item_id), '[]'),
    'by_location', coalesce((select jsonb_agg(jsonb_build_object('location_id', x.location_id, 'code', x.code, 'name', x.name, 'qty', x.qty, 'cost', x.cost) order by x.cost desc)
                  from (select location_id, max(location_code) as code, max(location_name) as name, sum(qty) as qty, sum(cost) as cost from w group by 1) x), '[]'),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('business_date', x.business_date, 'qty', x.qty, 'cost', x.cost) order by x.business_date)
                  from (select business_date, sum(qty) as qty, sum(cost) as cost from w group by 1) x), '[]')
  )
$$;

-- Forecast accuracy: each (item, shop, day) is scored against the newest run made on or before that day.
-- WAPE = sum|actual - forecast| / sum actual; bias = sum(forecast - actual) / sum actual.
create function forecast_accuracy(p_from date, p_to date, p_location bigint default null) returns jsonb
language sql stable
set search_path = public
as $$
  with f as (
    select distinct on (df.item_id, df.location_id, df.forecast_date)
           df.item_id, df.location_id, df.forecast_date as d, df.qty as forecast
      from demand_forecasts df join forecast_runs fr on fr.id = df.run_id
     where df.forecast_date between p_from and least(p_to, _today() - 1) and fr.as_of <= df.forecast_date
       and (p_location is null or df.location_id = p_location)
     order by df.item_id, df.location_id, df.forecast_date, fr.as_of desc, fr.id desc
  ), act as (
    select sa.location_id, sl.item_id, sa.business_date as d, sum(sl.qty) as actual
      from sales sa join sale_lines sl on sl.sale_id = sa.id
     where sa.business_date between p_from and p_to group by 1, 2, 3
  ), pairs as (
    select f.item_id, f.location_id, f.d, f.forecast, coalesce(a.actual, 0) as actual,
           abs(coalesce(a.actual, 0) - f.forecast) as abs_err
      from f left join act a on a.item_id = f.item_id and a.location_id = f.location_id and a.d = f.d
  )
  select jsonb_build_object(
    'overall', (select jsonb_build_object('n', count(*), 'actual', coalesce(sum(actual), 0), 'forecast', coalesce(sum(forecast), 0),
                  'wape', case when sum(actual) > 0 then round(sum(abs_err) / sum(actual), 4) end,
                  'bias', case when sum(actual) > 0 then round((sum(forecast) - sum(actual)) / sum(actual), 4) end) from pairs),
    'by_item', coalesce((select jsonb_agg(jsonb_build_object('item_id', x.item_id, 'sku', i.sku, 'name', i.name, 'actual', x.actual, 'forecast', x.forecast,
                  'wape', x.wape, 'bias', x.bias) order by i.name)
                  from (select item_id, sum(actual) as actual, sum(forecast) as forecast,
                               case when sum(actual) > 0 then round(sum(abs_err) / sum(actual), 4) end as wape,
                               case when sum(actual) > 0 then round((sum(forecast) - sum(actual)) / sum(actual), 4) end as bias
                          from pairs group by 1) x join items i on i.id = x.item_id), '[]'),
    'by_location', coalesce((select jsonb_agg(jsonb_build_object('location_id', x.location_id, 'code', l.code, 'name', l.name, 'actual', x.actual,
                  'forecast', x.forecast, 'wape', x.wape, 'bias', x.bias) order by l.name)
                  from (select location_id, sum(actual) as actual, sum(forecast) as forecast,
                               case when sum(actual) > 0 then round(sum(abs_err) / sum(actual), 4) end as wape,
                               case when sum(actual) > 0 then round((sum(forecast) - sum(actual)) / sum(actual), 4) end as bias
                          from pairs group by 1) x join locations l on l.id = x.location_id), '[]'),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('date', x.d, 'actual', x.actual, 'forecast', x.forecast, 'wape', x.wape) order by x.d)
                  from (select d, sum(actual) as actual, sum(forecast) as forecast,
                               case when sum(actual) > 0 then round(sum(abs_err) / sum(actual), 4) end as wape
                          from pairs group by 1) x), '[]')
  )
$$;

-- Production KPIs for orders completed in the range (by finish date, Denver time).
create function production_report(p_from date, p_to date) returns jsonb
language sql stable
set search_path = public
as $$
  with mo as (
    select po.*, i.sku, i.name as item_name, (po.finished_at at time zone 'America/Denver')::date as fin_date,
           extract(epoch from (po.finished_at - po.started_at)) / 3600.0 as cycle_hours
      from production_orders po join items i on i.id = po.item_id
     where po.status = 'completed' and (po.finished_at at time zone 'America/Denver')::date between p_from and p_to
  ), kpi as (
    select count(*) as orders, coalesce(sum(qty_planned), 0) as planned, coalesce(sum(qty_started), 0) as started,
           coalesce(sum(qty_good), 0) as good, coalesce(sum(qty_scrapped), 0) as scrapped, coalesce(sum(qty_reworked), 0) as reworked,
           coalesce(sum(issued_value), 0) as issued_value,
           count(*) filter (where fin_date <= due_date) as on_time, avg(cycle_hours) as cycle_hours
      from mo
  ), defects as (
    select d.kind, d.reason_code, rc.label, sum(d.qty) as qty
      from production_defects d join mo on mo.id = d.mo_id left join reason_codes rc on rc.code = d.reason_code
     group by 1, 2, 3
  )
  select jsonb_build_object(
    'summary', (select jsonb_build_object('orders', orders, 'qty_planned', planned, 'qty_started', started, 'qty_good', good,
         'qty_scrapped', scrapped, 'qty_reworked', reworked,
         'yield', case when started > 0 then round(good / started, 4) end,
         'scrap_rate', case when started > 0 then round(scrapped / started, 4) end,
         'first_pass_yield', case when started > 0 then round((good - reworked) / started, 4) end,
         'schedule_attainment', case when planned > 0 then round(good / planned, 4) end,
         'on_time_rate', case when orders > 0 then round(on_time::numeric / orders, 4) end,
         'avg_cycle_hours', round(cycle_hours::numeric, 2),
         'cost_per_dozen', case when good > 0 then round(12 * issued_value / good, 4) end) from kpi),
    'by_item', coalesce((select jsonb_agg(jsonb_build_object('item_id', x.item_id, 'sku', x.sku, 'name', x.item_name, 'orders', x.orders,
         'qty_planned', x.planned, 'qty_started', x.started, 'qty_good', x.good, 'qty_scrapped', x.scrapped, 'qty_reworked', x.reworked,
         'yield', case when x.started > 0 then round(x.good / x.started, 4) end,
         'scrap_rate', case when x.started > 0 then round(x.scrapped / x.started, 4) end,
         'first_pass_yield', case when x.started > 0 then round((x.good - x.reworked) / x.started, 4) end,
         'schedule_attainment', case when x.planned > 0 then round(x.good / x.planned, 4) end,
         'cost_per_dozen', case when x.good > 0 then round(12 * x.issued_value / x.good, 4) end) order by x.item_name)
         from (select item_id, max(sku) as sku, max(item_name) as item_name, count(*) as orders, sum(qty_planned) as planned,
                      sum(qty_started) as started, sum(qty_good) as good, sum(qty_scrapped) as scrapped, sum(qty_reworked) as reworked,
                      sum(issued_value) as issued_value from mo group by 1) x), '[]'),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('date', x.fin_date, 'orders', x.orders, 'qty_started', x.started, 'qty_good', x.good,
         'qty_scrapped', x.scrapped, 'yield', case when x.started > 0 then round(x.good / x.started, 4) end) order by x.fin_date)
         from (select fin_date, count(*) as orders, sum(qty_started) as started, sum(qty_good) as good, sum(qty_scrapped) as scrapped
                 from mo group by 1) x), '[]'),
    'scrap_pareto', coalesce((select jsonb_agg(jsonb_build_object('reason_code', y.reason_code, 'label', y.label, 'qty', y.qty,
         'pct', round(100 * y.qty / nullif(y.total, 0), 1), 'cum_pct', round(100 * y.cum / nullif(y.total, 0), 1)) order by y.qty desc, y.reason_code)
         from (select reason_code, label, qty, sum(qty) over () as total,
                      sum(qty) over (order by qty desc, reason_code) as cum from defects where kind = 'scrap') y), '[]'),
    'rework_pareto', coalesce((select jsonb_agg(jsonb_build_object('reason_code', y.reason_code, 'label', y.label, 'qty', y.qty,
         'pct', round(100 * y.qty / nullif(y.total, 0), 1), 'cum_pct', round(100 * y.cum / nullif(y.total, 0), 1)) order by y.qty desc, y.reason_code)
         from (select reason_code, label, qty, sum(qty) over () as total,
                      sum(qty) over (order by qty desc, reason_code) as cum from defects where kind = 'rework') y), '[]'),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('mo_id', id, 'mo_number', mo_number, 'item_id', item_id, 'sku', sku, 'name', item_name,
         'due_date', due_date, 'finished_at', finished_at, 'qty_planned', qty_planned, 'qty_started', qty_started, 'qty_good', qty_good,
         'qty_scrapped', qty_scrapped, 'qty_reworked', qty_reworked,
         'yield', case when qty_started > 0 then round(qty_good / qty_started, 4) end,
         'cycle_hours', round(cycle_hours::numeric, 2),
         'cost_per_dozen', case when qty_good > 0 then round(12 * issued_value / qty_good, 4) end,
         'on_time', (fin_date <= due_date)) order by finished_at desc) from mo), '[]')
  )
$$;

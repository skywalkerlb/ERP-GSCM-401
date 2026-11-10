-- 0009: purchasing and payables RPCs, auto-replenish, expenses.

create function _create_po(
  p_supplier bigint, p_ship_to bigint, p_lines jsonb, p_notes text, p_source text, p_at timestamptz
) returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_id   bigint;
  v_no   text;
  sup    suppliers%rowtype;
  v_total numeric;
  r      record;
begin
  select * into sup from suppliers where id = p_supplier and is_active;
  if not found then raise exception 'Choose an active supplier.'; end if;
  if not exists (select 1 from locations where id = p_ship_to and is_active) then
    raise exception 'Choose where the order ships to.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item to the purchase order.'; end if;
  if p_source not in ('manual', 'auto_replenish', 'sim') then raise exception 'Unknown PO source.'; end if;

  for r in select (e->>'item_id')::bigint as item_id, (e->>'qty')::numeric as qty
             from jsonb_array_elements(p_lines) e loop
    if r.qty is null or r.qty <= 0 then raise exception 'Quantity must be more than 0.'; end if;
    if not exists (select 1 from item_suppliers where item_id = r.item_id and supplier_id = p_supplier) then
      raise exception '% is not supplied by %.', coalesce((select name from items where id = r.item_id), 'Item ' || r.item_id), sup.name;
    end if;
  end loop;

  v_no := _next_doc_no('PO');
  insert into purchase_orders (po_number, supplier_id, ship_to_location_id, source, created_on, notes, created_at, created_by)
  values (v_no, p_supplier, p_ship_to, p_source, _bdate(_now(p_at)), p_notes, _now(p_at), auth.uid())
  returning id into v_id;

  insert into po_lines (po_id, item_id, qty_ordered, unit_cost)
  select v_id, q.item_id, q.qty, coalesce(q.cost, s.unit_cost)
    from (select (e->>'item_id')::bigint as item_id, sum((e->>'qty')::numeric) as qty,
                 max((e->>'unit_cost')::numeric) as cost
            from jsonb_array_elements(p_lines) e group by 1) q
    join item_suppliers s on s.item_id = q.item_id and s.supplier_id = p_supplier
   order by q.item_id;

  select sum(round(qty_ordered * unit_cost, 2)) into v_total from po_lines where po_id = v_id;
  update purchase_orders set total = v_total where id = v_id;
  perform _emit_event('po.created', 'purchase_order', v_id, p_ship_to, null,
    'Draft ' || v_no || ' created for ' || sup.name || ' ($' || to_char(v_total, 'FM999,990.00') || ')', p_at);
  return v_id;
end $$;

create function create_purchase_order(
  p_supplier bigint, p_ship_to bigint, p_lines jsonb, p_notes text default null,
  p_source text default 'manual', p_at timestamptz default null
) returns bigint
language plpgsql security definer
set search_path = public
as $$
begin
  perform _require_role('{}');
  return _create_po(p_supplier, p_ship_to, p_lines, p_notes, p_source, p_at);
end $$;

create function send_purchase_order(p_po_id bigint, p_at timestamptz default null) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  po   purchase_orders%rowtype;
  sup  suppliers%rowtype;
  v_on date;
  v_exp date;
begin
  perform _require_role('{}');
  select * into po from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found.'; end if;
  if po.status <> 'draft' then raise exception '% is % and cannot be sent.', po.po_number, po.status; end if;
  select * into sup from suppliers where id = po.supplier_id;
  v_on := _bdate(_now(p_at));
  update po_lines l set expected_on = v_on + coalesce(s.quoted_lead_time_days, sup.quoted_lead_time_days)
    from item_suppliers s
   where l.po_id = p_po_id and s.item_id = l.item_id and s.supplier_id = po.supplier_id;
  select max(expected_on) into v_exp from po_lines where po_id = p_po_id;
  update purchase_orders set status = 'sent', sent_on = v_on, expected_on = v_exp, quoted_lead_days = v_exp - v_on
   where id = p_po_id;
  perform _emit_event('po.sent', 'purchase_order', p_po_id, po.ship_to_location_id, null,
    po.po_number || ' sent to ' || sup.name || ', expected ' || to_char(v_exp, 'Mon FMDD'), p_at);
end $$;

-- p_lines: [{po_line_id, qty}]; null receives everything still open.
create function receive_purchase_order(
  p_po_id bigint, p_location_id bigint default null, p_received_on date default null,
  p_lines jsonb default null, p_at timestamptz default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  po       purchase_orders%rowtype;
  sup      suppliers%rowtype;
  v_loc    bigint;
  v_at     timestamptz;
  v_on     date;
  v_rcpt   bigint;
  v_no     text;
  r        record;
  v_val    numeric;
  v_total  numeric := 0;
  v_n      int := 0;
  v_j      bigint;
  v_bill   bigint;
  v_open   int;
begin
  perform _require_role('{baker}');
  select * into po from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found.'; end if;
  if po.status = 'draft' then raise exception 'Send % before receiving against it.', po.po_number; end if;
  if po.status <> 'sent' then raise exception '% is % and has nothing left to receive.', po.po_number, po.status; end if;
  select * into sup from suppliers where id = po.supplier_id;
  v_loc := coalesce(p_location_id, po.ship_to_location_id);
  if not exists (select 1 from locations where id = v_loc and is_active) then raise exception 'Unknown receiving location.'; end if;
  v_at := case when p_at is null and p_received_on is not null and _is_system() then _ts_on(p_received_on, '09:00') else _now(p_at) end;
  v_on := case when _is_system() or p_received_on is null then coalesce(p_received_on, _bdate(v_at)) else least(p_received_on, _today()) end;

  perform _lock_items((select array_agg(distinct item_id) from po_lines where po_id = p_po_id));

  v_no := _next_doc_no('RCV');
  insert into po_receipts (receipt_no, po_id, location_id, received_on, received_at, received_by)
  values (v_no, p_po_id, v_loc, v_on, v_at, auth.uid()) returning id into v_rcpt;

  for r in
    select l.id as line_id, l.item_id, l.unit_cost, l.qty_ordered, l.qty_received, l.qty_cancelled,
           case when p_lines is null then l.qty_ordered - l.qty_received - l.qty_cancelled
                else (select coalesce(sum((e->>'qty')::numeric), 0) from jsonb_array_elements(p_lines) e
                       where (e->>'po_line_id')::bigint = l.id) end as qty
      from po_lines l where l.po_id = p_po_id order by l.item_id, l.id
  loop
    continue when r.qty = 0;
    if r.qty < 0 then raise exception 'Received quantity cannot be negative.'; end if;
    if r.qty > r.qty_ordered - r.qty_received - r.qty_cancelled then
      raise exception 'Only % of % still open on this order.',
        _fmt_qty(r.qty_ordered - r.qty_received - r.qty_cancelled), (select name from items where id = r.item_id); end if;
    select x.value_delta into v_val
      from _post_inventory(r.item_id, v_loc, 'fresh', r.qty, 'receipt_po', r.unit_cost, 'po_receipt', v_rcpt, r.line_id, null, v_at) x;
    insert into po_receipt_lines (receipt_id, po_line_id, qty, unit_cost, value)
    values (v_rcpt, r.line_id, r.qty, r.unit_cost, v_val);
    update po_lines set qty_received = qty_received + r.qty where id = r.line_id;
    v_total := v_total + v_val;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Enter a received quantity for at least one line.'; end if;
  if p_lines is not null and exists (
       select 1 from jsonb_array_elements(p_lines) e where not exists
         (select 1 from po_lines l where l.id = (e->>'po_line_id')::bigint and l.po_id = p_po_id)) then
    raise exception 'A received line is not on this purchase order.'; end if;

  update po_receipts set amount = v_total where id = v_rcpt;
  v_j := _post_journal(v_on, 'receipt', v_rcpt, 'Received ' || po.po_number || ' (' || v_no || ')', jsonb_build_array(
    jsonb_build_object('account', '1200', 'location_id', v_loc, 'debit', v_total, 'credit', 0),
    jsonb_build_object('account', '2000', 'location_id', v_loc, 'debit', 0, 'credit', v_total)));
  update po_receipts set journal_entry_id = v_j where id = v_rcpt;
  update inventory_transactions set journal_entry_id = v_j where ref_type = 'po_receipt' and ref_id = v_rcpt;

  if v_total > 0 then
    insert into ap_bills (supplier_id, po_id, receipt_id, bill_date, due_date, amount)
    values (po.supplier_id, p_po_id, v_rcpt, v_on, v_on + sup.terms_days, v_total) returning id into v_bill;
  end if;

  select count(*) into v_open from po_lines where po_id = p_po_id and qty_received + qty_cancelled < qty_ordered;
  if v_open = 0 then update purchase_orders set status = 'received' where id = p_po_id; end if;

  perform _emit_event('po.received', 'purchase_order', p_po_id, v_loc, null,
    _actor_name() || ' received ' || v_n || case when v_n = 1 then ' line' else ' lines' end || ' from ' || sup.name
      || ' (' || po.po_number || case when v_open > 0 then ', partial' else '' end || ')', p_at);
  perform _emit_inventory_changed(v_loc, p_at);
  return jsonb_build_object('receipt_id', v_rcpt, 'receipt_no', v_no, 'amount', v_total, 'bill_id', v_bill,
    'po_status', (select status from purchase_orders where id = p_po_id));
end $$;

create function close_purchase_order(p_po_id bigint, p_at timestamptz default null) returns void
language plpgsql security definer
set search_path = public
as $$
declare po purchase_orders%rowtype;
begin
  perform _require_role('{}');
  select * into po from purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found.'; end if;
  if po.status in ('closed', 'cancelled') then raise exception '% is already %.', po.po_number, po.status; end if;
  if po.status = 'draft' then
    update purchase_orders set status = 'cancelled' where id = p_po_id;
    perform _emit_event('po.closed', 'purchase_order', p_po_id, po.ship_to_location_id, null, po.po_number || ' cancelled', p_at);
  else
    update po_lines set qty_cancelled = qty_ordered - qty_received where po_id = p_po_id and qty_received + qty_cancelled < qty_ordered;
    update purchase_orders set status = 'closed' where id = p_po_id;
    perform _emit_event('po.closed', 'purchase_order', p_po_id, po.ship_to_location_id, null, po.po_number || ' closed', p_at);
  end if;
end $$;

create function record_ap_payment(
  p_bill_id bigint, p_amount numeric, p_paid_on date default null, p_method text default 'ach', p_at timestamptz default null
) returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  b      ap_bills%rowtype;
  v_on   date := coalesce(p_paid_on, _bdate(_now(p_at)));
  v_id   bigint;
  v_j    bigint;
  v_sup  text;
begin
  perform _require_role('{}');
  select * into b from ap_bills where id = p_bill_id for update;
  if not found then raise exception 'Bill not found.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment must be more than $0.00.'; end if;
  if p_amount > b.amount - b.amount_paid then
    raise exception 'Only $% is still owed on this bill.', to_char(b.amount - b.amount_paid, 'FM999,990.00'); end if;
  insert into ap_payments (bill_id, paid_on, amount, method, created_by)
  values (p_bill_id, v_on, p_amount, coalesce(p_method, 'ach'), auth.uid()) returning id into v_id;
  update ap_bills set amount_paid = amount_paid + p_amount,
                      status = case when amount_paid + p_amount >= amount then 'paid' else 'open' end
   where id = p_bill_id;
  v_j := _post_journal(v_on, 'ap_payment', v_id, 'AP payment', jsonb_build_array(
    jsonb_build_object('account', '2000', 'debit', p_amount, 'credit', 0),
    jsonb_build_object('account', '1000', 'debit', 0, 'credit', p_amount)));
  update ap_payments set journal_entry_id = v_j where id = v_id;
  select name into v_sup from suppliers where id = b.supplier_id;
  perform _emit_event('po.paid', 'ap_payment', v_id, null, null,
    'Paid $' || to_char(p_amount, 'FM999,990.00') || ' to ' || v_sup, p_at);
  return v_id;
end $$;

create function record_expense(
  p_date date, p_account text, p_amount numeric, p_memo text default null,
  p_location_id bigint default null, p_at timestamptz default null
) returns bigint
language plpgsql security definer
set search_path = public
as $$
declare v_id bigint; v_j bigint; v_name text;
begin
  perform _require_role('{}');
  select name into v_name from gl_accounts where code = p_account and type = 'expense';
  if v_name is null then raise exception 'Account % is not an expense account.', p_account; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be more than $0.00.'; end if;
  insert into expenses (expense_date, account_code, amount, memo, location_id, created_by)
  values (coalesce(p_date, _bdate(_now(p_at))), p_account, round(p_amount, 2), p_memo, p_location_id, auth.uid())
  returning id into v_id;
  v_j := _post_journal(coalesce(p_date, _bdate(_now(p_at))), 'expense', v_id, coalesce(p_memo, v_name), jsonb_build_array(
    jsonb_build_object('account', p_account, 'location_id', p_location_id, 'debit', round(p_amount, 2), 'credit', 0),
    jsonb_build_object('account', '1000', 'location_id', p_location_id, 'debit', 0, 'credit', round(p_amount, 2))));
  update expenses set journal_entry_id = v_j where id = v_id;
  perform _emit_event('expense.recorded', 'expense', v_id, p_location_id, null,
    v_name || ' $' || to_char(p_amount, 'FM999,990.00') || ' recorded', p_at);
  return v_id;
end $$;

-- ---------------------------------------------------------------- replenishment
-- Read-only suggestions (security invoker). Sources: reorder point / EOQ analysis and the MRP planned orders.
create function replenish_suggestions(
  p_use_rop boolean default true, p_use_mrp boolean default true, p_horizon_days int default 7
) returns table (
  item_id bigint, sku text, name text, uom text, supplier_id bigint, supplier_name text,
  qty numeric, unit_cost numeric, line_total numeric, source text, rop_qty numeric, mrp_qty numeric,
  order_by_date date, urgency text, has_open_draft boolean
)
language sql stable
set search_path = public
as $$
  with rop as (
    select a.item_id, a.suggested_qty as qty, a.order_by_date, a.urgency
      from v_reorder_analysis a
     where p_use_rop and a.below_rop and a.suggested_qty > 0
  ), mrp as (
    select m.item_id, sum(m.planned_order_qty) as qty, min(m.order_by_date) as order_by_date
      from mrp_weekly(_today(), 4, false) m
     where p_use_mrp and m.planned_order_qty > 0 and m.order_by_date <= _today() + p_horizon_days
     group by m.item_id
  ), ids as (
    select rop.item_id from rop union select mrp.item_id from mrp
  ), base as (
    select i.id as item_id, i.sku, i.name, i.uom, i.pack_size,
           coalesce(i.preferred_supplier_id,
                    (select s.supplier_id from item_suppliers s where s.item_id = i.id order by s.is_preferred desc, s.unit_cost limit 1)) as supplier_id,
           coalesce(rop.qty, 0) as rop_qty, coalesce(mrp.qty, 0) as mrp_qty,
           least(rop.order_by_date, mrp.order_by_date) as order_by_date,
           rop.urgency
      from ids join items i on i.id = ids.item_id
      left join rop on rop.item_id = i.id
      left join mrp on mrp.item_id = i.id
     where i.is_active and i.is_purchasable
  )
  select b.item_id, b.sku, b.name, b.uom, b.supplier_id, sp.name,
         ceil(greatest(b.rop_qty, b.mrp_qty) / coalesce(nullif(s.pack_size, 0), b.pack_size)) * coalesce(nullif(s.pack_size, 0), b.pack_size) as qty,
         s.unit_cost,
         round(ceil(greatest(b.rop_qty, b.mrp_qty) / coalesce(nullif(s.pack_size, 0), b.pack_size)) * coalesce(nullif(s.pack_size, 0), b.pack_size) * s.unit_cost, 2),
         case when b.rop_qty > 0 and b.mrp_qty > 0 then 'rop+mrp' when b.rop_qty > 0 then 'rop' else 'mrp' end,
         b.rop_qty, b.mrp_qty, b.order_by_date,
         coalesce(b.urgency, case when b.order_by_date < _today() then 'late' else 'order_now' end),
         exists (select 1 from po_lines pl join purchase_orders po on po.id = pl.po_id
                  where pl.item_id = b.item_id and po.status = 'draft')
    from base b
    join suppliers sp on sp.id = b.supplier_id
    join item_suppliers s on s.item_id = b.item_id and s.supplier_id = b.supplier_id
   order by sp.name, b.name
$$;

-- Creates draft POs grouped by preferred supplier; skips items that already sit on an open draft.
-- Returns [{po_id, po_number, supplier_id, supplier, total, lines:[{item_id, sku, name, qty, unit_cost, line_total, source}]}]
create function auto_replenish(
  p_use_rop boolean default true, p_use_mrp boolean default true, p_horizon_days int default 7, p_at timestamptz default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_ship   bigint;
  g        record;
  v_po     bigint;
  v_out    jsonb := '[]';
begin
  perform _require_role('{}');
  select id into v_ship from locations where kind = 'kitchen' and is_active order by id limit 1;
  if v_ship is null then raise exception 'Add a kitchen location before running auto-replenish.'; end if;

  for g in
    select supplier_id, supplier_name,
           jsonb_agg(jsonb_build_object('item_id', item_id, 'sku', sku, 'name', name, 'qty', qty, 'unit_cost', unit_cost,
                       'line_total', line_total, 'source', source) order by name) as lines
      from replenish_suggestions(p_use_rop, p_use_mrp, p_horizon_days)
     where not has_open_draft and qty > 0
     group by supplier_id, supplier_name
     order by supplier_name
  loop
    v_po := _create_po(g.supplier_id, v_ship,
              (select jsonb_agg(jsonb_build_object('item_id', (l->>'item_id')::bigint, 'qty', (l->>'qty')::numeric)) from jsonb_array_elements(g.lines) l),
              'Auto-replenish', 'auto_replenish', p_at);
    v_out := v_out || jsonb_build_object(
      'po_id', v_po, 'po_number', (select po_number from purchase_orders where id = v_po),
      'supplier_id', g.supplier_id, 'supplier', g.supplier_name,
      'total', (select total from purchase_orders where id = v_po), 'lines', g.lines);
  end loop;
  return v_out;
end $$;

-- Copies the calculated reorder point onto the item (all purchasable items when p_item_ids is null).
create function apply_computed_reorder_points(p_item_ids bigint[] default null) returns integer
language plpgsql security definer
set search_path = public
as $$
declare v_n int;
begin
  perform _require_role('{}');
  with upd as (
    update items i set reorder_point = round(a.rop_calc, 3)
      from v_reorder_analysis a
     where a.item_id = i.id and (p_item_ids is null or i.id = any (p_item_ids))
    returning i.id)
  select count(*) into v_n from upd;
  perform _emit_event('settings.updated', 'items', null, null, null, 'Reorder points updated for ' || v_n || ' items');
  return v_n;
end $$;

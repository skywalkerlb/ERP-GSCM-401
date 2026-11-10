-- 0007: selling RPCs: POS sale, returns/exchanges, customers, sales orders, customer pickup orders.

create function complete_sale(
  p_location_id bigint,
  p_lines jsonb,
  p_order_discount jsonb default null,
  p_payment jsonb default '{"method":"card"}',
  p_customer_id bigint default null,
  p_channel text default 'pos',
  p_ticket_count int default 1,
  p_at timestamptz default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_channel text := case when p_channel = 'history_batch' and _is_system() then 'history_batch' else 'pos' end;
begin
  perform _require_role('{cashier}');
  return _post_sale(p_location_id, p_lines, p_order_discount, coalesce(p_payment, '{"method":"card"}'),
                    p_customer_id, v_channel, p_at, null, case when v_channel = 'history_batch' then p_ticket_count else 1 end);
end $$;

-- ---------------------------------------------------------------- returns and exchanges
create function process_return(
  p_sale_id bigint,
  p_lines jsonb,
  p_exchange_lines jsonb default null,
  p_refund_method text default 'cash',
  p_at timestamptz default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_at       timestamptz := _now(p_at);
  s          sales%rowtype;
  v_ret      bigint;
  v_no       text;
  r          record;
  t          record;
  sl         sale_lines%rowtype;
  v_ids      bigint[];
  v_net      numeric := 0;
  v_gross    numeric := 0;
  v_disc     numeric := 0;
  v_restock  numeric := 0;
  v_scrap    numeric := 0;
  v_line_net numeric;
  v_line_disc numeric;
  v_line_cost numeric;
  v_back     numeric;
  v_net_total numeric;
  v_prior_net numeric;
  v_prior_tax numeric;
  v_tax      numeric;
  v_total    numeric;
  v_j        bigint;
  v_ex       jsonb;
  v_loc_name text;
  v_rl       bigint;
  v_val      numeric;
  v_method   text := coalesce(p_refund_method, 'cash');
begin
  perform _require_role('{cashier}');
  if v_method not in ('cash', 'card') then raise exception 'Refund method must be cash or card.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Choose at least one item to return.';
  end if;

  select * into s from sales where id = p_sale_id for update;
  if not found then raise exception 'Receipt not found.'; end if;
  select name into v_loc_name from locations where id = s.location_id;

  -- lock items (including kit components) in id order
  select array_agg(distinct x order by x) into v_ids from (
    select sl2.item_id as x from sale_lines sl2 where sl2.sale_id = p_sale_id
    union
    select b.component_item_id from sale_lines sl2
      join items k on k.id = sl2.item_id and k.item_type = 'kit'
      join bom_lines b on b.parent_item_id = k.id where sl2.sale_id = p_sale_id) q;
  perform _lock_items(v_ids);

  v_no := _next_doc_no('RET');
  insert into returns (return_no, sale_id, location_id, refund_method, processed_by, returned_at, business_date, created_by)
  values (v_no, p_sale_id, s.location_id, v_method, auth.uid(), v_at, _bdate(v_at), auth.uid())
  returning id into v_ret;

  for r in
    select (e->>'sale_line_id')::bigint as sale_line_id, (e->>'qty')::numeric as qty,
           coalesce(e->>'disposition', 'restock') as disposition, nullif(e->>'reason_code', '') as reason_code
      from jsonb_array_elements(p_lines) e
     order by 1
  loop
    select * into sl from sale_lines where id = r.sale_line_id and sale_id = p_sale_id for update;
    if not found then raise exception 'Line % is not on receipt %.', r.sale_line_id, s.receipt_no; end if;
    if r.qty is null or r.qty <= 0 then raise exception 'Return quantity must be more than 0.'; end if;
    if r.qty > sl.qty - sl.qty_returned then
      raise exception 'Only % of % can still be returned from this receipt.',
        _fmt_qty(sl.qty - sl.qty_returned), (select name from items where id = sl.item_id);
    end if;
    if r.disposition not in ('restock', 'quality_failure') then
      raise exception 'Disposition must be restock or quality_failure.'; end if;
    if r.disposition = 'quality_failure' and r.reason_code is null then
      raise exception 'Choose a reason for the quality failure.'; end if;
    if r.reason_code is not null and not exists (select 1 from reason_codes where code = r.reason_code and category = 'return') then
      raise exception 'Unknown return reason %.', r.reason_code; end if;

    -- cumulative rounding so that a full return refunds exactly what was charged
    v_line_net  := round(sl.line_net * (sl.qty_returned + r.qty) / sl.qty, 2) - round(sl.line_net * sl.qty_returned / sl.qty, 2);
    v_line_disc := round(sl.discount_amt * (sl.qty_returned + r.qty) / sl.qty, 2) - round(sl.discount_amt * sl.qty_returned / sl.qty, 2);
    v_net   := v_net + v_line_net;
    v_disc  := v_disc + v_line_disc;
    v_gross := v_gross + v_line_net + v_line_disc;

    insert into return_lines (return_id, sale_line_id, item_id, qty, disposition, reason_code, refund_amt, gross_amt)
    values (v_ret, sl.id, sl.item_id, r.qty, r.disposition, r.reason_code, v_line_net, v_line_net + v_line_disc)
    returning id into v_rl;

    -- put stock back at the cost it left at (reverse the original sale postings proportionally)
    v_line_cost := 0;
    for t in select * from inventory_transactions
              where ref_type = 'sale' and ref_id = p_sale_id and ref_line_id = sl.id
              order by id loop
      v_back := round(abs(t.qty_delta) * r.qty / sl.qty, 3);
      continue when v_back = 0;
      select x.value_delta into v_val
        from _post_inventory(t.item_id, s.location_id, t.condition, v_back, 'sale_return', t.unit_cost,
                             'return', v_ret, v_rl, r.reason_code, p_at) x;
      v_line_cost := v_line_cost + v_val;
      v_restock   := v_restock + v_val;
      if r.disposition = 'quality_failure' then
        select o.value_delta into v_val
          from _post_inventory(t.item_id, s.location_id, t.condition, -v_back, 'return_scrap', null,
                               'return', v_ret, v_rl, r.reason_code, p_at) o;
        v_scrap := v_scrap - v_val;
      end if;
    end loop;
    update return_lines set cost_amt = v_line_cost where id = v_rl;
    update sale_lines set qty_returned = qty_returned + r.qty where id = sl.id;
  end loop;

  -- tax comes back in proportion to net refunded (cumulative per receipt so cents never drift)
  v_net_total := s.subtotal - s.discount_total;
  select coalesce(sum(refund_net), 0), coalesce(sum(tax_refund), 0) into v_prior_net, v_prior_tax
    from returns where sale_id = p_sale_id and id <> v_ret;
  v_tax := case when v_net_total = 0 then 0
                else round(s.tax_total * least(v_prior_net + v_net, v_net_total) / v_net_total, 2) - v_prior_tax end;
  v_total := v_net + v_tax;

  update returns set refund_net = v_net, tax_refund = v_tax, refund_total = v_total, net_due = -v_total
   where id = v_ret;

  v_j := _post_journal(_bdate(v_at), 'return', v_ret, 'Return ' || v_no || ' of ' || s.receipt_no, jsonb_build_array(
    jsonb_build_object('account', '4100', 'location_id', s.location_id, 'debit', v_gross, 'credit', 0),
    jsonb_build_object('account', '4200', 'location_id', s.location_id, 'debit', 0, 'credit', v_disc),
    jsonb_build_object('account', '2100', 'location_id', s.location_id, 'debit', v_tax, 'credit', 0),
    jsonb_build_object('account', '1000', 'location_id', s.location_id, 'debit', 0, 'credit', v_total),
    jsonb_build_object('account', '1200', 'location_id', s.location_id, 'debit', v_restock, 'credit', 0),
    jsonb_build_object('account', '5000', 'location_id', s.location_id, 'debit', 0, 'credit', v_restock),
    jsonb_build_object('account', '5150', 'location_id', s.location_id, 'debit', v_scrap, 'credit', 0),
    jsonb_build_object('account', '1200', 'location_id', s.location_id, 'debit', 0, 'credit', v_scrap)));
  update returns set journal_entry_id = v_j where id = v_ret;
  update inventory_transactions set journal_entry_id = v_j where ref_type = 'return' and ref_id = v_ret;

  v_ex := null;
  if p_exchange_lines is not null and jsonb_typeof(p_exchange_lines) = 'array' and jsonb_array_length(p_exchange_lines) > 0 then
    v_ex := _post_sale(s.location_id, p_exchange_lines, null, jsonb_build_object('method', v_method), s.customer_id,
                       'exchange', p_at, null, 1);
    update returns set kind = 'exchange', exchange_sale_id = (v_ex->>'sale_id')::bigint,
                       net_due = (v_ex->>'total')::numeric - v_total
     where id = v_ret;
    update sales set exchange_return_id = v_ret where id = (v_ex->>'sale_id')::bigint;
  end if;

  perform _emit_event('return.processed', 'return', v_ret, s.location_id, s.customer_id,
    _actor_name() || ' processed ' || case when v_ex is null then 'a return' else 'an exchange' end
      || ' at ' || v_loc_name || ' (' || v_no || ')', p_at);
  perform _emit_inventory_changed(s.location_id, p_at);

  return jsonb_build_object('return_id', v_ret, 'return_no', v_no, 'refund_total', v_total,
    'exchange_sale_id', (v_ex->>'sale_id')::bigint,
    'net_due', (select net_due from returns where id = v_ret));
end $$;

-- ---------------------------------------------------------------- customers
create function create_customer(
  p_name text, p_kind text default 'retail', p_email text default null,
  p_phone text default null, p_home_location_id bigint default null
) returns bigint
language plpgsql security definer
set search_path = public
as $$
declare v_id bigint;
begin
  perform _require_role('{cashier}');
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter the customer name.'; end if;
  if p_kind not in ('walk_in', 'retail', 'business') then raise exception 'Customer kind must be retail or business.'; end if;
  insert into customers (name, kind, email, phone, home_location_id, created_by)
  values (trim(p_name), p_kind, nullif(trim(p_email), ''), nullif(trim(p_phone), ''), p_home_location_id, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- sales orders
-- shared insert for staff-created and customer-created orders
create function _create_so(
  p_customer bigint, p_location bigint, p_requested_for timestamptz, p_lines jsonb,
  p_channel text, p_notes text, p_at timestamptz
) returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_so   bigint;
  v_no   text;
  v_loc  locations%rowtype;
  v_cust customers%rowtype;
  v_total numeric;
begin
  select * into v_loc from locations where id = p_location and is_active;
  if not found or v_loc.kind <> 'shop' then raise exception 'Choose a shop for this order.'; end if;
  select * into v_cust from customers where id = p_customer;
  if not found then raise exception 'Choose a customer.'; end if;
  if p_requested_for is null then raise exception 'Choose a pickup or delivery time.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item to the order.'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) e
              where coalesce((e->>'qty')::numeric, 0) <= 0) then
    raise exception 'Quantity must be more than 0.'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) e
              left join items i on i.id = (e->>'item_id')::bigint
              where i.id is null or not i.is_sellable or not i.is_active) then
    raise exception 'One of the items cannot be ordered.'; end if;

  v_no := _next_doc_no('ORD');
  insert into sales_orders (so_number, customer_id, location_id, channel, requested_for, notes, created_at, created_by)
  values (v_no, p_customer, p_location, p_channel, p_requested_for, p_notes, _now(p_at), auth.uid())
  returning id into v_so;

  -- merge duplicate items, price on the server
  insert into so_lines (so_id, item_id, qty, unit_price)
  select v_so, i.id, q.qty, i.list_price
    from (select (e->>'item_id')::bigint as item_id, sum((e->>'qty')::numeric) as qty
            from jsonb_array_elements(p_lines) e group by 1) q
    join items i on i.id = q.item_id
   order by i.id;

  select sum(round(qty * unit_price, 2)) into v_total from so_lines where so_id = v_so;
  perform _emit_event('so.placed', 'sales_order', v_so, p_location, p_customer,
    'Order ' || v_no || ' placed for ' || v_cust.name || ' at ' || v_loc.name
      || ' ($' || to_char(v_total, 'FM999,990.00') || ')', p_at);
  perform _emit_inventory_changed(p_location, p_at);
  return v_so;
end $$;

create function create_sales_order(
  p_customer_id bigint, p_location_id bigint, p_requested_for timestamptz, p_lines jsonb,
  p_channel text default 'counter', p_notes text default null, p_at timestamptz default null
) returns bigint
language plpgsql security definer
set search_path = public
as $$
begin
  perform _require_role('{cashier}');
  if p_channel not in ('counter', 'phone', 'catering', 'online') then
    raise exception 'Order channel must be counter, phone, catering or online.'; end if;
  return _create_so(p_customer_id, p_location_id, p_requested_for, p_lines, p_channel, p_notes, p_at);
end $$;

create function place_pickup_order(
  p_location_id bigint, p_pickup_at timestamptz, p_lines jsonb, p_notes text default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_cust bigint := my_customer_id();
  v_so   bigint;
begin
  perform _require_role('{customer}');
  if v_cust is null then raise exception 'Sign in with a customer account to place a pickup order.'; end if;
  if p_pickup_at is null or p_pickup_at < now() then
    raise exception 'Pick a pickup time in the future.'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_lines, '[]')) e where coalesce((e->>'qty')::numeric, 0) > 500) then
    raise exception 'For orders over 500 of one item, please call the shop.'; end if;
  if p_pickup_at > now() + interval '60 days' then
    raise exception 'Pickup orders can be placed up to 60 days ahead.'; end if;
  v_so := _create_so(v_cust, p_location_id, p_pickup_at, p_lines, 'online', p_notes, null);
  return (select jsonb_build_object('so_id', so.id, 'so_number', so.so_number,
            'total', (select sum(round(qty * unit_price, 2)) from so_lines where so_id = so.id))
            from sales_orders so where so.id = v_so);
end $$;

create function fulfill_sales_order(
  p_so_id bigint, p_payment jsonb default '{"method":"card"}', p_at timestamptz default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  so     sales_orders%rowtype;
  v_lines jsonb;
  v_res  jsonb;
begin
  perform _require_role('{cashier}');
  select * into so from sales_orders where id = p_so_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if so.status <> 'placed' then
    raise exception 'Order % is % and cannot be fulfilled.', so.so_number, so.status; end if;
  select jsonb_agg(jsonb_build_object('item_id', item_id, 'qty', qty - qty_fulfilled, 'condition', 'fresh', 'unit_price', unit_price) order by id)
    into v_lines from so_lines where so_id = p_so_id and qty - qty_fulfilled > 0;
  if v_lines is null then raise exception 'Order % has nothing left to fulfill.', so.so_number; end if;

  v_res := _post_sale(so.location_id, v_lines, null, coalesce(p_payment, '{"method":"card"}'), so.customer_id,
                      'sales_order', p_at, so.id, 1, true);
  update so_lines set qty_fulfilled = qty where so_id = p_so_id;
  update sales_orders set status = 'fulfilled', fulfilled_at = _now(p_at), sale_id = (v_res->>'sale_id')::bigint
   where id = p_so_id;
  perform _emit_event('so.fulfilled', 'sales_order', p_so_id, so.location_id, so.customer_id,
    'Order ' || so.so_number || ' fulfilled', p_at);
  return v_res;
end $$;

create function close_sales_order(p_so_id bigint, p_at timestamptz default null) returns void
language plpgsql security definer
set search_path = public
as $$
declare so sales_orders%rowtype;
begin
  perform _require_role('{cashier}');
  select * into so from sales_orders where id = p_so_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if so.status <> 'fulfilled' then
    raise exception 'Order % must be fulfilled before it can be closed (it is %).', so.so_number, so.status; end if;
  update sales_orders set status = 'closed', closed_at = _now(p_at) where id = p_so_id;
  perform _emit_event('so.closed', 'sales_order', p_so_id, so.location_id, so.customer_id,
    'Order ' || so.so_number || ' closed', p_at);
end $$;

create function cancel_sales_order(p_so_id bigint, p_reason text default null, p_at timestamptz default null) returns void
language plpgsql security definer
set search_path = public
as $$
declare so sales_orders%rowtype;
begin
  if auth_role() = 'customer' then
    select * into so from sales_orders where id = p_so_id and customer_id = my_customer_id() for update;
    if not found then raise exception 'Order not found.'; end if;
  else
    perform _require_role('{cashier}');
    select * into so from sales_orders where id = p_so_id for update;
    if not found then raise exception 'Order not found.'; end if;
  end if;
  if so.status <> 'placed' then
    raise exception 'Order % is % and cannot be cancelled.', so.so_number, so.status; end if;
  update sales_orders set status = 'cancelled', cancelled_reason = nullif(trim(p_reason), '') where id = p_so_id;
  perform _emit_event('so.cancelled', 'sales_order', p_so_id, so.location_id, so.customer_id,
    'Order ' || so.so_number || ' cancelled', p_at);
  perform _emit_inventory_changed(so.location_id, p_at);
end $$;

-- A customer's own orders with line detail (customers cannot read items or locations directly).
create function get_my_orders() returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', so.id, 'so_number', so.so_number, 'status', so.status, 'channel', so.channel,
      'requested_for', so.requested_for, 'fulfilled_at', so.fulfilled_at, 'closed_at', so.closed_at,
      'cancelled_reason', so.cancelled_reason, 'notes', so.notes, 'created_at', so.created_at,
      'location_id', l.id, 'location_name', l.name,
      'total', (select coalesce(sum(round(x.qty * x.unit_price, 2)), 0) from so_lines x where x.so_id = so.id),
      'lines', (select coalesce(jsonb_agg(jsonb_build_object('item_id', x.item_id, 'name', i.name, 'sku', i.sku,
                  'qty', x.qty, 'unit_price', x.unit_price) order by x.id), '[]')
                  from so_lines x join items i on i.id = x.item_id where x.so_id = so.id)
    ) order by so.requested_for desc), '[]'::jsonb)
  from sales_orders so join locations l on l.id = so.location_id
  where so.customer_id = my_customer_id()
$$;

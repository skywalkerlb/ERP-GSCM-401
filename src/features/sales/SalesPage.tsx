import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, DataTable, EmptyState, MoneyCell, PageHeader, Pagination, Select, StatCard, Tabs, TextField, Toolbar, type DataTableColumn, type SortState } from '@/components';
import { useSelectedLocation } from '@/hooks/useLocations';
import { addDays, businessDate, formatDate, formatMoney, formatNumber, formatTime } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { rpcErrorMessage } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import type { SaleChannel } from '@/types/domain';

interface SaleRow {
  id: number;
  receipt_no: string;
  location_id: number;
  business_date: string;
  sold_at: string;
  channel: SaleChannel;
  ticket_count: number;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  payment_method: string;
  locations: { name: string; code: string } | null;
  customers: { name: string } | null;
}

const PAGE_SIZE = 25;
const MAX_ROWS = 1000;
const CHANNEL: Record<SaleChannel, { label: string; tone: 'neutral' | 'info' | 'accent' | 'warning' }> = {
  pos: { label: 'Counter', tone: 'neutral' },
  sales_order: { label: 'Order pickup', tone: 'info' },
  exchange: { label: 'Exchange', tone: 'accent' },
  history_batch: { label: 'Daily batch', tone: 'warning' },
};
const PAYMENT: Record<string, string> = { cash: 'Cash', card: 'Card', other: 'Other' };

type Range = 'today' | '7' | '30' | 'custom';

function rangeDates(range: Exclude<Range, 'custom'>): { from: string; to: string } {
  const today = businessDate();
  if (range === 'today') return { from: today, to: today };
  return { from: addDays(today, range === '7' ? -6 : -29), to: today };
}

export default function SalesPage() {
  const navigate = useNavigate();
  const { locationId, shops } = useSelectedLocation();
  const [range, setRange] = useState<Range>('7');
  const [{ from, to }, setDates] = useState(() => rangeDates('7'));
  const [loc, setLoc] = useState<string>('');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortState | null>(null);

  // Follow the location chosen in the top bar.
  useEffect(() => {
    setLoc(locationId !== null && shops.some((s) => s.id === locationId) ? String(locationId) : '');
  }, [locationId, shops]);
  useEffect(() => setPage(0), [from, to, loc]);

  const salesQ = useQuery({
    queryKey: queryKeys.sales.list({ from, to, loc }),
    enabled: Boolean(from && to && from <= to),
    queryFn: async (): Promise<SaleRow[]> => {
      let q = supabase
        .from('sales')
        .select('id, receipt_no, location_id, business_date, sold_at, channel, ticket_count, subtotal, discount_total, tax_total, total, payment_method, locations(name, code), customers(name)')
        .gte('business_date', from)
        .lte('business_date', to)
        .order('sold_at', { ascending: false })
        .limit(MAX_ROWS);
      if (loc) q = q.eq('location_id', Number(loc));
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as SaleRow[]).map((r) => ({
        ...r,
        subtotal: Number(r.subtotal),
        discount_total: Number(r.discount_total),
        tax_total: Number(r.tax_total),
        total: Number(r.total),
      }));
    },
  });

  const rows = useMemo(() => salesQ.data ?? [], [salesQ.data]);
  const stats = useMemo(() => {
    const tickets = rows.reduce((s, r) => s + r.ticket_count, 0);
    const total = rows.reduce((s, r) => s + r.total, 0);
    return {
      tickets,
      net: rows.reduce((s, r) => s + r.subtotal - r.discount_total, 0),
      tax: rows.reduce((s, r) => s + r.tax_total, 0),
      avg: tickets > 0 ? total / tickets : null,
    };
  }, [rows]);

  // Sort every row first, then page, so a column sorts the whole range and not just one page.
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const key = sort.key as keyof SaleRow;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a[key];
      const y = b[key];
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * dir;
    });
  }, [rows, sort]);
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const isEmpty = !salesQ.isLoading && !salesQ.isError && rows.length === 0;
  const open = (r: SaleRow) => navigate(`/pos/receipt/${r.id}`);

  const columns: DataTableColumn<SaleRow>[] = [
    {
      key: 'receipt_no',
      header: 'Receipt',
      sortable: true,
      render: (r) => (
        <Link className="gz-link gz-mono" to={`/pos/receipt/${r.id}`}>
          {r.receipt_no}
        </Link>
      ),
    },
    {
      key: 'sold_at',
      header: 'Sold',
      sortable: true,
      render: (r) => (r.channel === 'history_batch' ? formatDate(r.business_date) : `${formatDate(r.sold_at)}, ${formatTime(r.sold_at)}`),
    },
    { key: 'shop', header: 'Shop', render: (r) => r.locations?.name ?? '—', sortValue: (r) => r.locations?.name },
    {
      key: 'channel',
      header: 'Type',
      render: (r) => (
        <span className="gz-row" style={{ gap: 'var(--space-2)', flexWrap: 'nowrap' }}>
          <Badge tone={CHANNEL[r.channel]?.tone ?? 'neutral'}>{CHANNEL[r.channel]?.label ?? r.channel}</Badge>
          {r.ticket_count > 1 && <span className="gz-muted text-body-sm">{formatNumber(r.ticket_count)} tickets</span>}
        </span>
      ),
    },
    { key: 'customer', header: 'Customer', render: (r) => r.customers?.name ?? 'Walk-in', sortValue: (r) => r.customers?.name },
    { key: 'payment_method', header: 'Payment', render: (r) => PAYMENT[r.payment_method] ?? r.payment_method },
    { key: 'tax_total', header: 'Tax', align: 'right', sortable: true, render: (r) => <MoneyCell value={r.tax_total} /> },
    { key: 'total', header: 'Total', align: 'right', sortable: true, render: (r) => <MoneyCell value={r.total} strong /> },
  ];

  function chooseRange(next: string) {
    const r = next as Range;
    setRange(r);
    if (r !== 'custom') setDates(rangeDates(r));
  }

  return (
    <>
      <PageHeader
        title="Sales"
        breadcrumb={[{ label: 'Sell' }, { label: 'Sales' }]}
        subtitle="Every receipt, newest first. Open one to reprint it or start a return."
        actions={
          <Button variant={isEmpty ? 'secondary' : 'primary'} icon="cart" onClick={() => navigate('/pos')}>
            Open point of sale
          </Button>
        }
      />

      <div className="gz-stack">
        <div className="gz-grid-stats">
          <StatCard label="Tickets" value={formatNumber(stats.tickets)} icon="receipt" />
          <StatCard label="Net sales" value={formatMoney(stats.net)} icon="money" caption="After discounts, before tax" />
          <StatCard label="Tax collected" value={formatMoney(stats.tax)} icon="bank" />
          <StatCard label="Average ticket" value={stats.avg === null ? '—' : formatMoney(stats.avg)} icon="chart" />
        </div>

        <div>
          <Toolbar>
            <Tabs
              aria-label="Date range"
              items={[
                { value: 'today', label: 'Today' },
                { value: '7', label: 'Last 7 days' },
                { value: '30', label: 'Last 30 days' },
                { value: 'custom', label: 'Custom' },
              ]}
              value={range}
              onChange={chooseRange}
            />
            <TextField
              label="From"
              type="date"
              value={from}
              max={to}
              onChange={(e) => {
                setRange('custom');
                setDates((d) => ({ ...d, from: e.target.value }));
              }}
            />
            <TextField
              label="To"
              type="date"
              value={to}
              min={from}
              onChange={(e) => {
                setRange('custom');
                setDates((d) => ({ ...d, to: e.target.value }));
              }}
            />
            <Select
              label="Shop"
              value={loc}
              onChange={(e) => setLoc(e.target.value)}
              options={[{ value: '', label: 'All shops' }, ...shops.map((s) => ({ value: String(s.id), label: s.name }))]}
            />
          </Toolbar>

          {from > to && (
            <Alert tone="warning" title="The dates are the wrong way round">
              Choose a From date that is on or before the To date.
            </Alert>
          )}
          {salesQ.isError && (
            <Alert tone="danger" title="Could not load sales" action={<Button size="sm" onClick={() => void salesQ.refetch()}>Try again</Button>}>
              {rpcErrorMessage(salesQ.error)}
            </Alert>
          )}

          {isEmpty ? (
            <EmptyState
              icon="receipt"
              title="No sales in this range"
              description="Widen the dates, pick another shop, or ring up the first sale of the day."
              action={
                <Button variant="primary" onClick={() => navigate('/pos')}>
                  Open point of sale
                </Button>
              }
            />
          ) : (
            <>
              <DataTable
                aria-label="Sales"
                columns={columns}
                rows={pageRows}
                loading={salesQ.isLoading}
                onRowClick={open}
                sort={sort}
                onSortChange={(next) => {
                  setSort(next);
                  setPage(0);
                }}
              />
              <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPageChange={setPage} />
              {rows.length >= MAX_ROWS && (
                <p className="text-body-sm gz-muted">Showing the newest {formatNumber(MAX_ROWS)} receipts. Narrow the dates to see the rest.</p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

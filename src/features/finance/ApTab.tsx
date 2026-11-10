import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert } from '@/components/Alert';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { axisProps, chartColor, ChartTooltip, gridProps } from '@/components/charts';
import { ChartCard } from '@/components/ChartCard';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatCard } from '@/components/StatCard';
import { Toolbar } from '@/components/Toolbar';
import { DocNo, MoneyCell } from '@/components/cells';
import { downloadCsv, type CsvColumn } from '@/features/reports/csv';
import { businessDate, daysBetween, formatDate, formatMoney, formatNumber } from '@/lib/format';
import { rpcErrorMessage } from '@/lib/rpc';
import type { ApOpenBill } from '@/types/domain';
import { useApBills } from './api';
import { PayBillDialog } from './dialogs';
import { HowCalculated } from './HowCalculated';

const BUCKETS = [
  { key: 'current', label: 'Not yet due', test: (b: ApOpenBill) => !b.is_overdue },
  { key: 'd30', label: '1 to 30 days late', test: (b: ApOpenBill) => b.is_overdue && b.days_overdue <= 30 },
  { key: 'd60', label: '31 to 60 days late', test: (b: ApOpenBill) => b.is_overdue && b.days_overdue > 30 && b.days_overdue <= 60 },
  { key: 'd60p', label: 'Over 60 days late', test: (b: ApOpenBill) => b.is_overdue && b.days_overdue > 60 },
];

export function ApTab() {
  const q = useApBills();
  const rows = q.data ?? [];
  const [paying, setPaying] = useState<ApOpenBill | null>(null);
  const today = businessDate();
  const open = rows.reduce((s, b) => s + b.balance, 0);
  const overdueRows = rows.filter((b) => b.is_overdue);
  const overdue = overdueRows.reduce((s, b) => s + b.balance, 0);
  const next = rows.filter((b) => !b.is_overdue).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const aging = useMemo(() => BUCKETS.map((k) => ({ name: k.label, balance: rows.filter(k.test).reduce((s, b) => s + b.balance, 0), bills: rows.filter(k.test).length })), [rows]);

  const columns: DataTableColumn<ApOpenBill>[] = [
    { key: 'supplier_name', header: 'Supplier', sortable: true, render: (r) => <Link className="ins-link" to={`/suppliers/${r.supplier_id}`}>{r.supplier_name}</Link> },
    { key: 'po_number', header: 'Purchase order', render: (r) => (r.po_id ? <Link className="ins-link gz-mono" to={`/purchasing/${r.po_id}`}>{r.po_number}</Link> : <DocNo value={r.po_number} />) },
    { key: 'bill_date', header: 'Bill date', sortable: true, render: (r) => formatDate(r.bill_date) },
    { key: 'due_date', header: 'Due', sortable: true, render: (r) => formatDate(r.due_date) },
    { key: 'amount', header: 'Amount', align: 'right', render: (r) => <MoneyCell value={r.amount} /> },
    { key: 'amount_paid', header: 'Paid', align: 'right', render: (r) => <MoneyCell value={r.amount_paid} /> },
    { key: 'balance', header: 'Balance', align: 'right', sortable: true, render: (r) => <MoneyCell value={r.balance} strong /> },
    {
      key: 'days_overdue', header: 'Status', sortable: true,
      render: (r) => (r.is_overdue ? <Badge tone="danger">{`${r.days_overdue} ${r.days_overdue === 1 ? 'day' : 'days'} overdue`}</Badge> : <Badge tone="info">{`Due in ${Math.max(0, daysBetween(today, r.due_date))} days`}</Badge>),
    },
    { key: 'actions', header: '', align: 'right', render: (r) => <Button size="sm" variant="secondary" onClick={() => setPaying(r)}>Record payment</Button> },
  ];
  const csv: CsvColumn<ApOpenBill>[] = [
    { header: 'Supplier', value: (r) => r.supplier_name },
    { header: 'Purchase order', value: (r) => r.po_number },
    { header: 'Bill date', value: (r) => r.bill_date },
    { header: 'Due date', value: (r) => r.due_date },
    { header: 'Amount', value: (r) => r.amount },
    { header: 'Paid', value: (r) => r.amount_paid },
    { header: 'Balance', value: (r) => r.balance },
    { header: 'Days overdue', value: (r) => r.days_overdue },
  ];

  return (
    <div className="gz-stack gz-stack--sm">
      <HowCalculated>
        Receiving a purchase order creates a bill for the received value, due after the supplier&apos;s payment terms. A bill stays open until payments cover its
        amount. Balance is amount less payments, and it is overdue once the due date has passed. Total open bills equal the GL 2000 Accounts payable balance.
      </HowCalculated>
      <Toolbar end={<Button variant="secondary" icon="download" disabled={rows.length === 0} onClick={() => downloadCsv('open-bills', csv, rows)}>Export CSV</Button>}>
        <span className="text-body-sm ins-note">Open bills across all suppliers.</span>
      </Toolbar>
      {q.isError && <Alert tone="danger" title="Could not load open bills">{rpcErrorMessage(q.error)} Refresh the page to try again.</Alert>}
      <div className="gz-grid-stats">
        <StatCard label="Open bills" icon="file" value={formatMoney(open)} caption={`${formatNumber(rows.length)} bills`} />
        <StatCard label="Overdue" icon="alert" tint="butter" value={formatMoney(overdue)} caption={`${formatNumber(overdueRows.length)} overdue bills`} />
        <StatCard label="Next due" icon="calendar" tint="lilac" value={next ? formatDate(next.due_date) : '—'} caption={next ? `${next.supplier_name}, ${formatMoney(next.balance)}` : 'Nothing coming due'} />
        <StatCard label="Largest balance" icon="bank" tint="cocoa" value={formatMoney(rows.reduce((m, b) => Math.max(m, b.balance), 0))} caption="a single open bill" />
      </div>
      <ChartCard
        title="Aging of open bills"
        loading={q.isLoading}
        height="sm"
        summary={overdue > 0 ? `${formatMoney(overdue)} is past due` : 'Nothing is past due'}
        empty={rows.length === 0 && !q.isLoading ? 'No open bills. Every supplier is paid up.' : undefined}
        table={{
          columns: [
            { key: 'name', header: 'Bucket' },
            { key: 'bills', header: 'Bills', align: 'right' },
            { key: 'balance', header: 'Balance', align: 'right', render: (r: { balance: number }) => formatMoney(r.balance) },
          ],
          rows: aging,
          rowKey: 'name',
        }}
      >
        <BarChart data={aging}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="name" {...axisProps} interval={0} />
          <YAxis {...axisProps} tickFormatter={(v: number) => formatMoney(v, { compact: true })} />
          <Tooltip content={<ChartTooltip valueFormatter={(v) => formatMoney(Number(v))} />} cursor={{ fill: 'var(--surface-hover)' }} />
          <Bar dataKey="balance" name="Balance" fill={chartColor(0)} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>
      <DataTable columns={columns} rows={rows} rowKey="bill_id" loading={q.isLoading} density="compact" aria-label="Open bills" empty="No open bills." defaultSort={{ key: 'due_date', dir: 'asc' }} />
      <PayBillDialog bill={paying} onClose={() => setPaying(null)} />
    </div>
  );
}

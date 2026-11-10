import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { Button, Card, ChartCard, ChartTooltip, DataTable, MoneyCell, PageHeader, StatCard, StatusBadge, axisProps, chartColor, gridProps, type DataTableColumn } from '@/components';
import { toNumber, useAppSettings, useScorecard } from '@/features/items/api';
import { ErrorAlert, RatingBadge } from '@/features/items/ui';
import { formatDate, formatMoney, formatNumber, formatPct } from '@/lib/format';
import type { SupplierScorecardRow } from '@/types/domain';

export default function ScorecardPage() {
  const navigate = useNavigate();
  const scoreQ = useScorecard();
  const settingsQ = useAppSettings();
  const rows = useMemo(() => [...(scoreQ.data ?? [])].sort((a, b) => toNumber(b.score, -1) - toNumber(a.score, -1)), [scoreQ.data]);
  const st = settingsQ.data;
  const count = (r: string) => rows.filter((x) => x.rating === r).length;
  const owed = rows.reduce((s, r) => s + toNumber(r.amount_owed), 0);
  const overdue = rows.reduce((s, r) => s + toNumber(r.overdue_amount), 0);

  const columns: DataTableColumn<SupplierScorecardRow>[] = [
    { key: 'name', header: 'Supplier', sortable: true, render: (r) => <Link className="gz-link" to={`/suppliers/${r.supplier_id}`}><strong>{r.name}</strong></Link> },
    { key: 'po_count', header: 'Orders', align: 'right', sortable: true },
    { key: 'on_time', header: 'On-time', align: 'right', sortable: true, sortValue: (r) => r.on_time_rate ?? -1, render: (r) => <span className="gz-num">{formatPct(r.on_time_rate, 0)}</span> },
    {
      key: 'lead', header: 'Lead time, actual vs quoted', align: 'right',
      render: (r) => r.avg_actual_lead_days == null ? <span className="gz-muted">—</span> : (
        <span className="gz-num">{formatNumber(r.avg_actual_lead_days, 1)} vs {formatNumber(r.avg_quoted_lead_days, 1)} days</span>
      ),
    },
    { key: 'fill', header: 'Fill rate', align: 'right', sortable: true, sortValue: (r) => r.fill_rate ?? -1, render: (r) => <span className="gz-num">{formatPct(r.fill_rate, 0)}</span> },
    { key: 'owed', header: 'Amount owed', align: 'right', sortable: true, sortValue: (r) => toNumber(r.amount_owed), render: (r) => <MoneyCell value={r.amount_owed} /> },
    { key: 'due', header: 'Next due', render: (r) => <span className="gz-num">{formatDate(r.next_due_date)}</span> },
    { key: 'overdue', header: 'Overdue', align: 'right', render: (r) => (toNumber(r.overdue_amount) > 0 ? <StatusBadge status="overdue" label={formatMoney(r.overdue_amount)} /> : <span className="gz-muted">None</span>) },
    { key: 'score', header: 'Score', align: 'right', sortable: true, sortValue: (r) => r.score ?? -1, render: (r) => <strong className="gz-num">{r.score == null ? '—' : formatNumber(r.score, 0)}</strong> },
    { key: 'rating', header: 'Rating', render: (r) => <RatingBadge rating={r.rating} /> },
  ];

  const chartData = rows.filter((r) => r.score != null).map((r) => ({ name: r.name, score: Math.round(toNumber(r.score)) }));

  return (
    <div className="gz-stack">
      <PageHeader
        title="Supplier scorecard"
        breadcrumb={[{ label: 'Buy' }, { label: 'Suppliers', to: '/suppliers' }, { label: 'Scorecard' }]}
        subtitle="Delivery, fill and payment performance for every active supplier, from orders sent in the last 180 days."
        actions={<Button onClick={() => navigate('/suppliers')}>All suppliers</Button>}
      />
      {scoreQ.error && <ErrorAlert error={scoreQ.error} onRetry={() => void scoreQ.refetch()} />}

      <div className="gz-grid-stats">
        <StatCard label="Keep" value={String(count('keep'))} icon="checkCircle" tint="mint" caption={st ? `Score ${st.keep_threshold} or more` : undefined} />
        <StatCard label="Watch" value={String(count('watch'))} icon="alert" tint="butter" caption={st ? `Score ${st.watch_threshold} to ${toNumber(st.keep_threshold) - 1}` : undefined} />
        <StatCard label="Replace" value={String(count('replace'))} icon="alert" tint="cocoa" caption={st ? `Score under ${st.watch_threshold}` : undefined} />
        <StatCard label="Owed to suppliers" value={formatMoney(owed)} icon="bank" tint="lilac" caption={overdue > 0 ? `${formatMoney(overdue)} overdue` : 'Nothing overdue'} />
      </div>

      <DataTable<SupplierScorecardRow> aria-label="Supplier scorecard" columns={columns} rows={rows} rowKey="supplier_id" loading={scoreQ.isLoading} onRowClick={(r) => navigate(`/suppliers/${r.supplier_id}`)} empty="No active suppliers yet." />

      <div className="gz-detail">
        <ChartCard
          title="Score by supplier" subtitle="Higher is better. Rating bands come from the thresholds in settings."
          summary={chartData[0] ? `Top score: ${chartData[0].name}, ${chartData[0].score}` : undefined}
          loading={scoreQ.isLoading} empty={chartData.length === 0 ? 'No supplier has enough history to score yet.' : undefined}
          table={{ rowKey: 'name', rows: chartData, columns: [{ key: 'name', header: 'Supplier' }, { key: 'score', header: 'Score', align: 'right' }] }}
        >
          <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...axisProps} interval={0} tickFormatter={(n: string) => (n.length > 14 ? `${n.slice(0, 13)}…` : n)} />
            <YAxis {...axisProps} domain={[0, 100]} width={36} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-hover)' }} />
            <Bar dataKey="score" name="Score" fill={chartColor(0)} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>

        <Card title="How the score works">
          <div className="gz-stack gz-stack--sm text-body-sm">
            <div className="stk-formula">
              <span className="stk-formula__eq">Score = 100 × ({st ? formatPct(st.score_w_ontime, 0) : '…'} on-time + {st ? formatPct(st.score_w_fill, 0) : '…'} fill + {st ? formatPct(st.score_w_lead, 0) : '…'} lead-time)</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
              <li><strong>On-time</strong> is the share of orders whose last delivery arrived on or before the expected date.</li>
              <li><strong>Fill rate</strong> is units received divided by units ordered. Units cancelled when an order is closed count as unfilled.</li>
              <li><strong>Lead-time score</strong> falls as actual lead time passes the quote: 1 − (actual − quoted) / quoted, kept between 0 and 1.</li>
              <li><strong>Rating:</strong> Keep at {st ? st.keep_threshold : '…'} or more, Watch at {st ? st.watch_threshold : '…'} or more, otherwise Replace.</li>
              <li>Amount owed, next due date and overdue come from payables. They are shown but not scored.</li>
            </ul>
            <p className="gz-muted" style={{ margin: 0 }}>Weights and thresholds can be changed in Settings.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

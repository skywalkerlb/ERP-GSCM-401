import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert } from '@/components/Alert';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { Dialog } from '@/components/Dialog';
import { Select } from '@/components/Select';
import { Toolbar } from '@/components/Toolbar';
import { MoneyCell } from '@/components/cells';
import { downloadCsv, type CsvColumn } from '@/features/reports/csv';
import { rangeForPreset, ReportFilters, type RangePreset } from '@/features/reports/ReportFilters';
import { useSelectedLocation } from '@/hooks/useLocations';
import { formatDate, formatMoney, formatNumber, sentenceCase } from '@/lib/format';
import { rpcErrorMessage } from '@/lib/rpc';
import type { TrialBalanceRow } from '@/types/domain';
import { useGlAccounts, useJournalEntry, useJournalLines, useTrialBalance, type JournalLineRow } from './api';
import { HowCalculated } from './HowCalculated';

export function JournalTab() {
  const [params, setParams] = useSearchParams();
  const account = params.get('account') ?? '';
  const defaults = rangeForPreset('30d')!;
  const from = params.get('from') ?? defaults.from;
  const to = params.get('to') ?? defaults.to;
  const preset: RangePreset = 'custom';
  const [openEntry, setOpenEntry] = useState<number | null>(null);
  const { locations } = useSelectedLocation();

  const tb = useTrialBalance();
  const accounts = useGlAccounts();
  const lines = useJournalLines({ account, from, to, limit: 100 });
  const entry = useJournalEntry(openEntry);

  const tbRows = tb.data ?? [];
  const totalDebit = tbRows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = tbRows.reduce((s, r) => s + r.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005;
  const locName = (id: number | null) => (id === null ? '' : locations.find((l) => l.id === id)?.code ?? String(id));
  const acctName = useMemo(() => new Map((accounts.data ?? []).map((a) => [a.code, a.name])), [accounts.data]);

  function update(next: Record<string, string>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.set('tab', 'journal');
    setParams(p, { replace: true });
  }

  const tbColumns: DataTableColumn<TrialBalanceRow>[] = [
    { key: 'account_code', header: 'Account', mono: true, sortable: true },
    { key: 'name', header: 'Name', sortable: true },
    { key: 'type', header: 'Type', render: (r) => sentenceCase(r.type) },
    { key: 'debit', header: 'Debits', align: 'right', render: (r) => <MoneyCell value={r.debit} /> },
    { key: 'credit', header: 'Credits', align: 'right', render: (r) => <MoneyCell value={r.credit} /> },
    { key: 'balance', header: 'Balance', align: 'right', render: (r) => <><MoneyCell value={r.balance} strong /> <span className="text-caption gz-muted">{r.normal_side === 'debit' ? 'Dr' : 'Cr'}</span></> },
  ];
  const lineColumns: DataTableColumn<JournalLineRow>[] = [
    { key: 'entry', header: 'Entry', mono: true, render: (r) => `JE-${String(r.entry_id).padStart(5, '0')}` },
    { key: 'date', header: 'Date', render: (r) => formatDate(r.journal_entries.entry_date) },
    { key: 'source', header: 'Source', render: (r) => `${sentenceCase(r.journal_entries.source_type)}${r.journal_entries.source_id ? ` #${r.journal_entries.source_id}` : ''}` },
    { key: 'memo', header: 'Memo', render: (r) => r.journal_entries.memo ?? '' },
    { key: 'account_code', header: 'Account', render: (r) => <><span className="gz-mono">{r.account_code}</span> <span className="gz-muted">{acctName.get(r.account_code)}</span></> },
    { key: 'location', header: 'Location', render: (r) => locName(r.location_id) },
    { key: 'debit', header: 'Debit', align: 'right', render: (r) => (r.debit ? <MoneyCell value={r.debit} /> : '') },
    { key: 'credit', header: 'Credit', align: 'right', render: (r) => (r.credit ? <MoneyCell value={r.credit} /> : '') },
  ];
  const entryColumns: DataTableColumn<JournalLineRow>[] = [
    { key: 'account_code', header: 'Account', render: (r) => <><span className="gz-mono">{r.account_code}</span> <span className="gz-muted">{acctName.get(r.account_code)}</span></> },
    { key: 'location', header: 'Location', render: (r) => locName(r.location_id) },
    { key: 'debit', header: 'Debit', align: 'right', render: (r) => (r.debit ? <MoneyCell value={r.debit} /> : '') },
    { key: 'credit', header: 'Credit', align: 'right', render: (r) => (r.credit ? <MoneyCell value={r.credit} /> : '') },
  ];
  const csv: CsvColumn<JournalLineRow>[] = [
    { header: 'Entry', value: (r) => r.entry_id },
    { header: 'Date', value: (r) => r.journal_entries.entry_date },
    { header: 'Source type', value: (r) => r.journal_entries.source_type },
    { header: 'Source id', value: (r) => r.journal_entries.source_id },
    { header: 'Memo', value: (r) => r.journal_entries.memo },
    { header: 'Account', value: (r) => r.account_code },
    { header: 'Debit', value: (r) => r.debit },
    { header: 'Credit', value: (r) => r.credit },
  ];

  const entryRows = entry.data ?? [];
  const entryDebit = entryRows.reduce((s, r) => s + r.debit, 0);
  const entryCredit = entryRows.reduce((s, r) => s + r.credit, 0);
  const head = entryRows[0]?.journal_entries;

  return (
    <div className="gz-stack gz-stack--sm">
      <HowCalculated>
        Every sale, return, receipt, production run, waste log and expense posts a journal entry whose debits equal its credits. The trial balance adds every
        line by account; the P&amp;L, inventory value and payables are all read from these same lines. Pick an account (or click one in the trial balance) to
        list the entries behind it, and click an entry to see both sides.
      </HowCalculated>
      {tb.isError && <Alert tone="danger" title="Could not load the trial balance">{rpcErrorMessage(tb.error)} Refresh the page to try again.</Alert>}
      <Card
        title="Trial balance"
        subtitle="All time. Click an account to filter the entries below."
        actions={<Badge tone={balanced ? 'success' : 'danger'}>{balanced ? 'Debits equal credits' : 'Out of balance'}</Badge>}
        padded={false}
      >
        <DataTable
          columns={tbColumns}
          rows={tbRows}
          rowKey="account_code"
          loading={tb.isLoading}
          density="compact"
          aria-label="Trial balance"
          selectedKeys={account ? [account] : []}
          onRowClick={(r) => update({ account: r.account_code === account ? '' : r.account_code })}
        />
        {!tb.isLoading && (
          <p className="text-body-sm ins-note" style={{ padding: 'var(--space-3) var(--space-4)' }}>
            Total debits <strong>{formatMoney(totalDebit)}</strong> and total credits <strong>{formatMoney(totalCredit)}</strong>.
          </p>
        )}
      </Card>
      <Toolbar end={<Button variant="secondary" icon="download" disabled={!lines.data?.rows.length} onClick={() => downloadCsv(`journal-${from}-to-${to}`, csv, lines.data?.rows ?? [])}>Export CSV</Button>}>
        <div className="ins-filters">
          <Select
            label="Account"
            value={account}
            options={[{ value: '', label: 'All accounts' }, ...(accounts.data ?? []).map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))]}
            onChange={(e) => update({ account: e.target.value })}
          />
          <ReportFilters preset={preset} range={{ from, to }} onRangeChange={(_p, r) => update({ from: r.from, to: r.to })} />
        </div>
      </Toolbar>
      {lines.isError && <Alert tone="danger" title="Could not load journal entries">{rpcErrorMessage(lines.error)} Refresh the page to try again.</Alert>}
      <DataTable
        columns={lineColumns}
        rows={lines.data?.rows ?? []}
        rowKey="id"
        loading={lines.isLoading}
        density="compact"
        aria-label="Journal lines"
        onRowClick={(r) => setOpenEntry(r.entry_id)}
        empty="No journal lines for this account and date range."
      />
      {lines.data && lines.data.total > lines.data.rows.length && (
        <p className="text-body-sm ins-note">Showing the newest {formatNumber(lines.data.rows.length)} of {formatNumber(lines.data.total)} lines. Narrow the date range to see older ones.</p>
      )}
      <Dialog
        open={openEntry !== null}
        onClose={() => setOpenEntry(null)}
        size="lg"
        title={openEntry !== null ? `Journal entry JE-${String(openEntry).padStart(5, '0')}` : 'Journal entry'}
        description={head ? `${formatDate(head.entry_date)}. ${sentenceCase(head.source_type)}${head.source_id ? ` #${head.source_id}` : ''}${head.memo ? `. ${head.memo}` : ''}` : undefined}
        footer={<Button variant="secondary" onClick={() => setOpenEntry(null)}>Close</Button>}
      >
        <DataTable columns={entryColumns} rows={entryRows} rowKey="id" loading={entry.isLoading} density="compact" aria-label="Entry lines" />
        {!entry.isLoading && (
          <p className="text-body-sm ins-note" style={{ marginTop: 'var(--space-3)' }}>
            Debits {formatMoney(entryDebit)} and credits {formatMoney(entryCredit)}: {Math.abs(entryDebit - entryCredit) < 0.005 ? 'balanced.' : 'out of balance.'}
          </p>
        )}
      </Dialog>
    </div>
  );
}

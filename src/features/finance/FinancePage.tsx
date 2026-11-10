import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import { Tabs } from '@/components/Tabs';
import '@/features/reports/insights.css';
import { ApTab } from './ApTab';
import { RecordExpenseDialog } from './dialogs';
import { JournalTab } from './JournalTab';
import { PnlTab } from './PnlTab';
import { TurnoverTab } from './TurnoverTab';
import { ValuationTab } from './ValuationTab';

const TABS = [
  { value: 'pnl', label: 'Profit and loss' },
  { value: 'valuation', label: 'Inventory valuation' },
  { value: 'turnover', label: 'Inventory turnover' },
  { value: 'ap', label: 'Accounts payable' },
  { value: 'journal', label: 'Journal and trial balance' },
] as const;

type TabId = (typeof TABS)[number]['value'];

export default function FinancePage() {
  const [params, setParams] = useSearchParams();
  const tab: TabId = TABS.find((t) => t.value === params.get('tab'))?.value ?? 'pnl';
  const [expenseOpen, setExpenseOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Finance"
        breadcrumb={[{ label: 'Insights' }, { label: 'Finance' }]}
        subtitle="Every figure is built from journal entries, and refreshes when anyone sells, returns, produces or receives."
        actions={<Button variant="secondary" icon="plus" onClick={() => setExpenseOpen(true)}>Record expense</Button>}
      />
      <Tabs aria-label="Finance view" items={[...TABS]} value={tab} onChange={(v) => setParams(v === 'pnl' ? {} : { tab: v }, { replace: true })} />
      <div role="tabpanel" style={{ marginTop: 'var(--space-4)' }}>
        {tab === 'pnl' && <PnlTab />}
        {tab === 'valuation' && <ValuationTab />}
        {tab === 'turnover' && <TurnoverTab />}
        {tab === 'ap' && <ApTab />}
        {tab === 'journal' && <JournalTab />}
      </div>
      <RecordExpenseDialog open={expenseOpen} onClose={() => setExpenseOpen(false)} />
    </>
  );
}

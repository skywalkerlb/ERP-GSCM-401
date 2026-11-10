import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs } from '@/components';
import { DayCloseTab } from './DayCloseTab';
import { LogWasteTab } from './LogWasteTab';
import { WasteDashboardTab } from './WasteDashboardTab';

type TabKey = 'close' | 'log' | 'dashboard';
const TABS: Array<{ value: TabKey; label: string }> = [
  { value: 'close', label: 'Day close' },
  { value: 'log', label: 'Log waste' },
  { value: 'dashboard', label: 'Waste dashboard' },
];

export default function FreshnessPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabKey = TABS.some((t) => t.value === raw) ? (raw as TabKey) : 'close';

  return (
    <div className="gz-stack">
      <PageHeader
        title="Freshness and waste"
        breadcrumb={[{ label: 'Make' }, { label: 'Freshness and waste' }]}
        subtitle="Close the day, mark down day-old donuts and log waste."
      />
      <Tabs aria-label="Freshness sections" items={TABS} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} />
      {tab === 'close' && <DayCloseTab />}
      {tab === 'log' && <LogWasteTab />}
      {tab === 'dashboard' && <WasteDashboardTab />}
    </div>
  );
}

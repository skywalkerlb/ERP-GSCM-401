import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs } from '@/components';
import { AccuracyTab } from './AccuracyTab';
import { BakePlanTab } from './BakePlanTab';
import { ForecastTab } from './ForecastTab';

type TabKey = 'forecast' | 'bake' | 'accuracy';
const TABS: Array<{ value: TabKey; label: string }> = [
  { value: 'forecast', label: 'Forecast' },
  { value: 'bake', label: 'Bake plan' },
  { value: 'accuracy', label: 'Accuracy' },
];

export default function ForecastPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabKey = TABS.some((t) => t.value === raw) ? (raw as TabKey) : 'forecast';

  return (
    <div className="gz-stack">
      <PageHeader
        title="Forecast and bake plan"
        breadcrumb={[{ label: 'Make' }, { label: 'Forecast and bake plan' }]}
        subtitle="Expected demand, the bake plan that comes from it, and how accurate past forecasts were."
      />
      <Tabs
        aria-label="Forecast sections"
        items={TABS}
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
      />
      {tab === 'forecast' && <ForecastTab />}
      {tab === 'bake' && <BakePlanTab />}
      {tab === 'accuracy' && <AccuracyTab />}
    </div>
  );
}

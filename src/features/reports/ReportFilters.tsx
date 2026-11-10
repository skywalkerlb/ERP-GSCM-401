import { useMemo } from 'react';
import { Select } from '@/components/Select';
import { TextField } from '@/components/TextField';
import { useSelectedLocation } from '@/hooks/useLocations';
import { addDays, businessDate, startOfWeek } from '@/lib/format';

export interface DateRange {
  from: string;
  to: string;
}

export type RangePreset = '7d' | '30d' | '90d' | 'mtd' | 'lastmonth' | 'week' | 'custom';

const PRESETS: Array<{ value: RangePreset; label: string }> = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'week', label: 'This week' },
  { value: 'mtd', label: 'Month to date' },
  { value: 'lastmonth', label: 'Last month' },
  { value: 'custom', label: 'Custom' },
];

/** First day of the month containing `ymd`. */
export function monthStart(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

/** Last day of the month before the one containing `ymd`. */
export function lastMonthEnd(ymd: string): string {
  return addDays(monthStart(ymd), -1);
}

export function rangeForPreset(preset: RangePreset, today = businessDate()): DateRange | null {
  switch (preset) {
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case '90d':
      return { from: addDays(today, -89), to: today };
    case 'week':
      return { from: startOfWeek(today), to: today };
    case 'mtd':
      return { from: monthStart(today), to: today };
    case 'lastmonth': {
      const end = lastMonthEnd(today);
      return { from: monthStart(end), to: end };
    }
    default:
      return null;
  }
}

/** The period of equal length that ends the day before `range` starts. */
export function previousRange(range: DateRange): DateRange {
  const days = Math.round((new Date(`${range.to}T00:00:00Z`).getTime() - new Date(`${range.from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) };
}

export interface ReportFiltersProps {
  preset: RangePreset;
  range: DateRange;
  onRangeChange: (preset: RangePreset, range: DateRange) => void;
  /** Hide the date controls on tabs that always show right now. */
  showDates?: boolean;
  /** Selected location id as a string; '' means all locations. */
  locationId?: string;
  onLocationChange?: (id: string) => void;
  /** Include the kitchen in the location list (stock views). Shops only otherwise. */
  includeKitchen?: boolean;
}

/** Date range with presets plus a location filter. Both are optional per tab. */
export function ReportFilters({ preset, range, onRangeChange, showDates = true, locationId, onLocationChange, includeKitchen = false }: ReportFiltersProps) {
  const { locations } = useSelectedLocation();
  const options = useMemo(
    () => [
      { value: '', label: 'All locations' },
      ...locations.filter((l) => includeKitchen || l.kind === 'shop').map((l) => ({ value: String(l.id), label: l.name })),
    ],
    [locations, includeKitchen],
  );
  return (
    <>
      {showDates && (
        <>
          <Select
            label="Date range"
            value={preset}
            options={PRESETS}
            onChange={(e) => {
              const p = e.target.value as RangePreset;
              const next = rangeForPreset(p);
              onRangeChange(p, next ?? range);
            }}
          />
          <TextField label="From" type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && onRangeChange('custom', { ...range, from: e.target.value })} />
          <TextField label="To" type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && onRangeChange('custom', { ...range, to: e.target.value })} />
        </>
      )}
      {onLocationChange && <Select label="Location" value={locationId ?? ''} options={options} onChange={(e) => onLocationChange(e.target.value)} />}
    </>
  );
}

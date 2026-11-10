import { sentenceCase } from '@/lib/format';
import { Badge, type BadgeProps } from './Badge';

export type StatusTone = NonNullable<BadgeProps['tone']>;

/**
 * One mapping of status to tone for every module: success = mint, in progress / info = lilac,
 * warning = butter, danger = cherry, accent = cocoa, neutral = inactive.
 */
const TONES: Record<string, StatusTone> = {
  // documents
  draft: 'neutral',
  planned: 'neutral',
  placed: 'info',
  sent: 'info',
  in_progress: 'info',
  in_transit: 'info',
  open: 'info',
  pending: 'info',
  partially_received: 'warning',
  partial: 'warning',
  fulfilled: 'success',
  received: 'success',
  completed: 'success',
  released: 'success',
  paid: 'success',
  posted: 'success',
  ready: 'success',
  closed: 'neutral',
  cancelled: 'neutral',
  void: 'neutral',
  // freshness
  fresh: 'success',
  day_old: 'warning',
  expired: 'danger',
  // stock and planning
  in_stock: 'success',
  low_stock: 'warning',
  backordered: 'warning',
  out_of_stock: 'danger',
  order_now: 'warning',
  late: 'danger',
  overdue: 'danger',
  expedite: 'danger',
  failed: 'danger',
  // supplier rating
  keep: 'success',
  watch: 'warning',
  replace: 'danger',
  // misc
  active: 'success',
  inactive: 'neutral',
  seasonal: 'accent',
  new: 'accent',
};

const LABELS: Record<string, string> = {
  day_old: 'Day-old',
  partially_received: 'Partially received',
  order_now: 'Order now',
};

export function statusTone(status: string): StatusTone {
  return TONES[status.toLowerCase().replace(/[\s-]+/g, '_')] ?? 'neutral';
}

export interface StatusBadgeProps {
  /** Database status such as "in_progress". */
  status: string;
  /** Override the label. Defaults to the status in sentence case. */
  label?: string;
  /** Override the tone only when this module truly needs it. */
  tone?: StatusTone;
}

export function StatusBadge({ status, label, tone }: StatusBadgeProps) {
  const key = status.toLowerCase().replace(/[\s-]+/g, '_');
  return <Badge tone={tone ?? statusTone(key)}>{label ?? LABELS[key] ?? sentenceCase(status)}</Badge>;
}

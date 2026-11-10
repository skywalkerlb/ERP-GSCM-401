import type { ReactNode } from 'react';

/** Series colors in the design system's order. SVG fill and stroke accept CSS variables, so they follow the theme. */
export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
] as const;

export function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length]!;
}

/** Spread onto <XAxis> / <YAxis>: axis text uses `--chart-axis`, lines use `--chart-grid`. */
export const axisProps = {
  tick: { fill: 'var(--chart-axis)' },
  axisLine: { stroke: 'var(--chart-grid)' },
  tickLine: { stroke: 'var(--chart-grid)' },
} as const;

/** Spread onto <CartesianGrid>. */
export const gridProps = { stroke: 'var(--chart-grid)', vertical: false } as const;

interface TooltipEntry {
  name?: string | number;
  value?: number | string | Array<number | string>;
  color?: string;
  dataKey?: string | number;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: ReactNode;
  /** Format each value, for example formatMoney. */
  valueFormatter?: (value: number | string, name: string) => string;
  /** Format the heading, for example formatDate. */
  labelFormatter?: (label: ReactNode) => ReactNode;
}

/** Use as `<Tooltip content={<ChartTooltip valueFormatter={formatMoney} />} />`. */
export function ChartTooltip({ active, payload, label, valueFormatter, labelFormatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="gz-chart-tooltip">
      {label !== undefined && label !== '' && <div className="gz-chart-tooltip__label">{labelFormatter ? labelFormatter(label) : label}</div>}
      {payload.map((p, i) => {
        const name = String(p.name ?? p.dataKey ?? '');
        const raw = Array.isArray(p.value) ? p.value[0] : p.value;
        return (
          <div key={`${name}-${i}`} className="gz-chart-tooltip__row">
            <span className="gz-chart-tooltip__swatch" style={{ background: p.color }} aria-hidden="true" />
            <span>{name}</span>
            <span className="gz-chart-tooltip__value">{valueFormatter && raw !== undefined ? valueFormatter(raw, name) : raw}</span>
          </div>
        );
      })}
    </div>
  );
}

export interface ChartLegendProps {
  items: Array<{ label: string; color?: string }>;
}

/** A word beside each color, so the chart never depends on color alone. */
export function ChartLegend({ items }: ChartLegendProps) {
  return (
    <ul className="gz-chart-legend">
      {items.map((it, i) => (
        <li key={it.label}>
          <span className="gz-chart-tooltip__swatch" style={{ background: it.color ?? chartColor(i) }} aria-hidden="true" />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

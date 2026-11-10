import { cx } from '@/lib/cx';
import { formatItemQty, formatMoney, formatQty, formatUnitCost, type QtyOptions, type Uom } from '@/lib/format';

export interface MoneyCellProps {
  value: number | string | null | undefined;
  /** Keep up to four decimals, for unit costs. */
  unitCost?: boolean;
  /** Key values such as totals. */
  strong?: boolean;
}

/** Right-aligned money with tabular figures. Use in a DataTable column with `align: 'right'`. */
export function MoneyCell({ value, unitCost, strong }: MoneyCellProps) {
  const n = value === null || value === undefined || value === '' ? null : Number(value);
  return <span className={cx('gz-num', strong && 'gz-num--strong', n !== null && n < 0 && 'gz-num--neg')}>{unitCost ? formatUnitCost(value) : formatMoney(value)}</span>;
}

export interface QtyCellProps extends QtyOptions {
  qty: number | string | null | undefined;
  uom?: Uom;
  /** Pass the item to read finished goods in dozens ("14 dozen") and everything else in plain units. */
  item?: { uom?: string | null; item_type?: string | null };
  strong?: boolean;
}

export function QtyCell({ qty, uom = 'each', item, dozens, strong }: QtyCellProps) {
  const text = item ? formatItemQty(qty, item) : formatQty(qty, uom, { dozens });
  const n = qty === null || qty === undefined || qty === '' ? null : Number(qty);
  return <span className={cx('gz-num', strong && 'gz-num--strong', n !== null && n < 0 && 'gz-num--neg')}>{text}</span>;
}

/** A document number such as ORD-00481, in mono. */
export function DocNo({ value }: { value: string | null | undefined }) {
  return <span className="gz-mono">{value ?? '—'}</span>;
}

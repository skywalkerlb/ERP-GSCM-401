import { Alert, Badge, DataTable, MoneyCell, QtyCell, type DataTableColumn } from '@/components';
import { formatMoney, formatQty } from '@/lib/format';
import type { Requirement } from './api';

export interface RequirementsTableProps {
  rows: Requirement[];
  /** Name of the place the stock is checked at, for the warning ("Central Kitchen"). */
  where?: string;
  /** Hide the stock check (for orders already started, where the quantities are what was consumed). */
  showStock?: boolean;
  emptyText?: string;
}

/** BOM components needed for a quantity, against stock on hand, with a warning for shortages. */
export function RequirementsTable({ rows, where, showStock = true, emptyText = 'This item has no recipe yet.' }: RequirementsTableProps) {
  const short = rows.filter((r) => r.short);
  const total = rows.reduce((sum, r) => sum + r.cost, 0);

  const columns: DataTableColumn<Requirement>[] = [
    { key: 'name', header: 'Component', render: (r) => <div><div>{r.name}</div><div className="gz-mono gz-muted text-caption">{r.sku}</div></div> },
    { key: 'required', header: 'Needed', align: 'right', render: (r) => <QtyCell qty={r.required} uom={r.uom} dozens={false} /> },
    ...(showStock
      ? ([
          { key: 'available', header: where ? `On hand at ${where}` : 'On hand', align: 'right', render: (r) => <QtyCell qty={r.available} uom={r.uom} dozens={false} /> },
          {
            key: 'remaining', header: 'Left after', align: 'right',
            render: (r) => <QtyCell qty={r.remaining} uom={r.uom} dozens={false} />,
          },
          {
            key: 'status', header: 'Check',
            render: (r) => (r.short ? <Badge tone="danger">Short {formatQty(r.required - r.available, r.uom, { dozens: false })}</Badge> : <Badge tone="success">Enough</Badge>),
          },
        ] satisfies DataTableColumn<Requirement>[])
      : []),
    { key: 'cost', header: 'Est. cost', align: 'right', render: (r) => <MoneyCell value={r.cost} /> },
  ];

  return (
    <div className="gz-stack gz-stack--sm">
      {showStock && short.length > 0 && (
        <Alert tone="warning" title={`${short.length} ${short.length === 1 ? 'component is' : 'components are'} short`}>
          {short.map((r) => `${r.name} (need ${formatQty(r.required, r.uom, { dozens: false })}, have ${formatQty(r.available, r.uom, { dozens: false })})`).join('; ')}.
          Receive stock or raise a purchase order before starting.
        </Alert>
      )}
      <DataTable columns={columns} rows={rows} rowKey="item_id" density="compact" empty={emptyText} aria-label="Component requirements" />
      {rows.length > 0 && <p className="text-body-sm gz-muted">Estimated component cost at current average cost: {formatMoney(total)}.</p>}
    </div>
  );
}

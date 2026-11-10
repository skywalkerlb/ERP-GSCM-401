import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, Logo, Skeleton, StatusBadge } from '@/components';
import { indexBy, toNumber, useAppSettings, useItemSuppliers, useItems, useSuppliers } from '@/features/items/api';
import { ErrorAlert } from '@/features/items/ui';
import { useLocations } from '@/hooks/useLocations';
import { formatDate, formatMoney, formatNumber, formatUnitCost } from '@/lib/format';
import { estimateExpected, poStatusKey, usePurchaseOrder } from './api';
import '@/features/items/stock.css';

/** Printable purchase order. The app shell is hidden by print.css; only the document prints. */
export default function PurchaseOrderPrintPage() {
  const { id: raw } = useParams();
  const id = Number(raw);
  const navigate = useNavigate();
  const detailQ = usePurchaseOrder(id);
  const suppliersQ = useSuppliers();
  const itemsQ = useItems();
  const suppliedQ = useItemSuppliers();
  const locationsQ = useLocations();
  const settingsQ = useAppSettings();

  const itemMap = useMemo(() => indexBy(itemsQ.data, (i) => i.id), [itemsQ.data]);

  if (detailQ.isLoading) return <Skeleton variant="block" />;
  if (detailQ.error) return <ErrorAlert error={detailQ.error} onRetry={() => void detailQ.refetch()} />;
  const po = detailQ.data?.po;
  if (!po) {
    return <EmptyState icon="bag" title="We could not find that purchase order" action={<Button variant="primary" onClick={() => navigate('/purchasing')}>Back to purchasing</Button>} />;
  }
  const supplier = suppliersQ.data?.find((s) => s.id === po.supplier_id);
  const shipTo = locationsQ.data?.find((l) => l.id === po.ship_to_location_id);
  const supplyOf = (itemId: number) => suppliedQ.data?.find((s) => s.item_id === itemId && s.supplier_id === po.supplier_id);
  const estimated = po.expected_on ? null : estimateExpected(po.lines.map((l) => supplyOf(l.item_id)?.quoted_lead_time_days ?? supplier?.quoted_lead_time_days ?? 0), po.created_on);
  const status = poStatusKey(po);

  return (
    <div className="gz-stack">
      <div className="no-print gz-row" style={{ justifyContent: 'space-between' }}>
        <Button variant="ghost" icon="chevronRight" onClick={() => navigate(`/purchasing/${po.id}`)}>Back to {po.po_number}</Button>
        <Button variant="primary" icon="printer" onClick={() => window.print()}>Print</Button>
      </div>

      <article className="stk-doc" aria-label={`Purchase order ${po.po_number}`}>
        <header className="stk-doc__head">
          <div>
            <Logo />
            <p className="gz-muted text-body-sm" style={{ margin: 'var(--space-2) 0 0' }}>{settingsQ.data?.business_name ?? 'Glazed'}</p>
            {shipTo?.address && <p className="gz-muted text-body-sm" style={{ margin: 0 }}>{shipTo.address}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <h1 className="text-h1 stk-doc__title">Purchase order</h1>
            <p className="gz-mono" style={{ margin: 'var(--space-1) 0' }}>{po.po_number}</p>
            <StatusBadge status={status.status} label={status.label} />
          </div>
        </header>

        <section className="stk-doc__parties">
          <div>
            <div className="stk-doc__label text-label">Supplier</div>
            <p className="stk-doc__party">
              <strong>{supplier?.name ?? '—'}</strong><br />
              {supplier?.contact_name && <>{supplier.contact_name}<br /></>}
              {supplier?.address && <>{supplier.address}<br /></>}
              {supplier?.email && <>{supplier.email}<br /></>}
              {supplier?.phone}
            </p>
          </div>
          <div>
            <div className="stk-doc__label text-label">Ship to</div>
            <p className="stk-doc__party">
              <strong>{shipTo?.name ?? '—'}</strong><br />
              {shipTo?.address}
            </p>
          </div>
        </section>

        <section className="stk-doc__meta">
          <div><div className="stk-doc__label text-label">Order date</div>{formatDate(po.sent_on ?? po.created_on)}</div>
          <div><div className="stk-doc__label text-label">{po.expected_on ? 'Expected delivery' : 'Estimated delivery'}</div>{formatDate(po.expected_on ?? estimated)}</div>
          <div><div className="stk-doc__label text-label">Payment terms</div>{supplier?.terms_label ?? '—'}</div>
        </section>

        <table className="gz-table gz-table--compact" aria-label="Order lines">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">SKU</th>
              <th scope="col">Supplier SKU</th>
              <th scope="col" style={{ textAlign: 'right' }}>Quantity</th>
              <th scope="col" style={{ textAlign: 'right' }}>Unit cost</th>
              <th scope="col" style={{ textAlign: 'right' }}>Line total</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l) => {
              const item = itemMap.get(l.item_id);
              return (
                <tr key={l.id}>
                  <td><strong>{item?.name ?? `Item ${l.item_id}`}</strong></td>
                  <td className="gz-mono">{item?.sku ?? '—'}</td>
                  <td className="gz-mono">{supplyOf(l.item_id)?.supplier_sku ?? '—'}</td>
                  <td style={{ textAlign: 'right' }} className="gz-num">{formatNumber(l.qty_ordered, Number.isInteger(toNumber(l.qty_ordered)) ? 0 : 2)} {item?.uom ?? ''}</td>
                  <td style={{ textAlign: 'right' }} className="gz-num">{formatUnitCost(l.unit_cost)}</td>
                  <td style={{ textAlign: 'right' }} className="gz-num">{formatMoney(toNumber(l.qty_ordered) * toNumber(l.unit_cost))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="stk-total-row"><span>Order total</span><strong>{formatMoney(po.total)}</strong></div>

        <section className="stk-doc__terms text-body-sm">
          <p style={{ margin: 0 }}>
            <strong>Terms.</strong> Payment {supplier?.terms_label ?? 'as agreed'}, counted from the day the goods are received. Please deliver by the date above and confirm any shortage before shipping.
          </p>
          {po.notes && <p style={{ margin: 'var(--space-2) 0 0' }}><strong>Notes.</strong> {po.notes}</p>}
        </section>

        <div className="stk-doc__sign text-body-sm">
          <div>Authorized by</div>
          <div>Supplier acknowledgement</div>
        </div>
      </article>
    </div>
  );
}

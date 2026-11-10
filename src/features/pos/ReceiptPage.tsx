import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, BarcodeLabel, Button, Card, EmptyState, Logo, PageHeader, Skeleton, SkeletonLines, StatusBadge } from '@/components';
import { supabase } from '@/lib/supabase';
import { formatDate, formatMoney, formatNumber, formatPct, formatTime } from '@/lib/format';
import { rpcErrorMessage } from '@/lib/rpc';
import { queryKeys } from '@/lib/queryKeys';
import { useSale, useSellSettings } from './api';
import './pos.css';

const METHOD_LABEL: Record<string, string> = { cash: 'Cash', card: 'Card', other: 'Other' };
const CHANNEL_LABEL: Record<string, string> = {
  pos: 'Counter sale',
  sales_order: 'Order pickup',
  exchange: 'Exchange',
  history_batch: 'Daily batch',
};

export default function ReceiptPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const saleId = Number(id);
  const saleQ = useSale(Number.isFinite(saleId) ? saleId : null);
  const settingsQ = useSellSettings();
  const sale = saleQ.data;

  const cashierQ = useQuery({
    queryKey: queryKeys.profile.scope('name', { id: sale?.cashier_id }),
    enabled: Boolean(sale?.cashier_id),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('full_name').eq('user_id', sale?.cashier_id as string).maybeSingle();
      return (data as { full_name: string | null } | null)?.full_name ?? null;
    },
  });

  const crumbs = [{ label: 'Sell' }, { label: 'Point of sale', to: '/pos' }, { label: 'Receipt' }];

  if (saleQ.isLoading) {
    return (
      <>
        <PageHeader title="Receipt" breadcrumb={crumbs} />
        <Card>
          <SkeletonLines lines={8} />
        </Card>
      </>
    );
  }

  if (saleQ.isError || !sale) {
    return (
      <>
        <PageHeader title="Receipt" breadcrumb={crumbs} />
        {saleQ.isError ? (
          <Alert tone="danger" title="Could not load the receipt" action={<Button size="sm" onClick={() => void saleQ.refetch()}>Try again</Button>}>
            {rpcErrorMessage(saleQ.error)}
          </Alert>
        ) : (
          <EmptyState
            icon="receipt"
            title="That receipt does not exist"
            description="Check the receipt number, or look it up in Sales."
            action={
              <Button variant="primary" onClick={() => navigate('/sales')}>
                Go to sales
              </Button>
            }
          />
        )}
      </>
    );
  }

  const returned = sale.sale_lines.reduce((s, l) => s + l.qty_returned, 0);
  const units = sale.sale_lines.reduce((s, l) => s + l.qty, 0);
  const businessName = settingsQ.data?.business_name ?? 'Glazed';

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Receipt"
          breadcrumb={crumbs}
          subtitle={
            <>
              <span className="gz-mono">{sale.receipt_no}</span> · {formatDate(sale.sold_at)}, {formatTime(sale.sold_at)}
            </>
          }
          actions={
            <>
              <Button icon="printer" onClick={() => window.print()}>
                Print receipt
              </Button>
              <Button icon="undo" onClick={() => navigate(`/returns?receipt=${encodeURIComponent(sale.receipt_no)}`)}>
                Start a return
              </Button>
              <Button variant="primary" icon="plus" onClick={() => navigate('/pos')}>
                New sale
              </Button>
            </>
          }
        />
      </div>

      <div className="receipt-wrap">
        <Card className="receipt">
          <div className="receipt__head">
            <Logo />
            <div className="text-h3">{businessName}</div>
            {sale.locations && (
              <div className="text-body-sm gz-muted">
                {sale.locations.name}
                {sale.locations.address ? `, ${sale.locations.address}` : ''}
              </div>
            )}
          </div>

          <div className="receipt__meta text-body-sm">
            <div>
              <span>Receipt</span>
              <span className="gz-mono">{sale.receipt_no}</span>
            </div>
            <div>
              <span>Date</span>
              <span>
                {formatDate(sale.sold_at)}, {formatTime(sale.sold_at)}
              </span>
            </div>
            {cashierQ.data && (
              <div>
                <span>Served by</span>
                <span>{cashierQ.data}</span>
              </div>
            )}
            {sale.customers && (
              <div>
                <span>Customer</span>
                <span>{sale.customers.name}</span>
              </div>
            )}
          </div>

          <hr className="receipt__rule" />

          <div>
            {sale.sale_lines.map((l) => (
              <div key={l.id} className="receipt__line">
                <span className="text-body-strong">
                  {formatNumber(l.qty, Number.isInteger(l.qty) ? 0 : 2)} x {l.items?.name ?? 'Item'}
                </span>
                <span className="gz-num">{formatMoney(l.qty * l.unit_price)}</span>
                <span className="receipt__sub text-body-sm">
                  {formatMoney(l.unit_price)} each
                  {l.condition === 'day_old' ? ', day-old' : ''}
                  {l.discount_amt > 0 ? `, discount ${formatMoney(-l.discount_amt)}` : ''}
                  {l.qty_returned > 0 ? `, ${formatNumber(l.qty_returned)} returned` : ''}
                </span>
              </div>
            ))}
          </div>

          <hr className="receipt__rule" />

          <dl className="receipt__totals text-body">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatMoney(sale.subtotal)}</dd>
            </div>
            {sale.discount_total > 0 && (
              <div>
                <dt>Discounts</dt>
                <dd>{formatMoney(-sale.discount_total)}</dd>
              </div>
            )}
            <div>
              <dt>Tax ({formatPct(sale.tax_rate, 2)})</dt>
              <dd>{formatMoney(sale.tax_total)}</dd>
            </div>
            <div className="is-total text-h3">
              <dt>Total</dt>
              <dd>{formatMoney(sale.total)}</dd>
            </div>
            <div>
              <dt>{METHOD_LABEL[sale.payment_method] ?? sale.payment_method}</dt>
              <dd>{formatMoney(sale.tendered)}</dd>
            </div>
            {sale.payment_method === 'cash' && (
              <div>
                <dt>Change</dt>
                <dd>{formatMoney(sale.change_due)}</dd>
              </div>
            )}
          </dl>

          <hr className="receipt__rule" />

          <div className="receipt__barcode">
            <BarcodeLabel value={sale.receipt_no} caption={sale.receipt_no} barHeight={56} />
            <div className="text-body-sm gz-muted">Scan this barcode at the counter to start a return.</div>
            <div className="text-body-sm">Thank you for stopping by.</div>
          </div>
        </Card>

        <div className="receipt__side no-print">
          <Card title="Sale details">
            <dl className="pos-totals text-body-sm">
              <div>
                <dt>Type</dt>
                <dd>{CHANNEL_LABEL[sale.channel] ?? sale.channel}</dd>
              </div>
              <div>
                <dt>Items</dt>
                <dd>{formatNumber(units)}</dd>
              </div>
              <div>
                <dt>Payment</dt>
                <dd>{METHOD_LABEL[sale.payment_method] ?? sale.payment_method}</dd>
              </div>
              {sale.sales_order_id && (
                <div>
                  <dt>Order</dt>
                  <dd>
                    <Link className="gz-link" to={`/orders/${sale.sales_order_id}`}>
                      View order
                    </Link>
                  </dd>
                </div>
              )}
              <div>
                <dt>Returns</dt>
                <dd>{returned > 0 ? <StatusBadge status="partial" label={`${formatNumber(returned)} returned`} /> : 'None'}</dd>
              </div>
            </dl>
          </Card>
          {settingsQ.isLoading && <Skeleton />}
        </div>
      </div>
    </>
  );
}

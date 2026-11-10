import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, SkeletonLines } from '@/components';
import { Icon } from '@/components/Icon';
import { round2 } from '@/features/pos/calc';
import { formatMoney, formatNumber } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { rpcErrorMessage } from '@/lib/rpc';
import type { ProcessReturnResult } from '@/types/domain';
import { fetchReturn } from './api';
import './returns.css';

/** What a processed return or exchange did, in plain words, with the accounting effect explained. */
export function ReturnResultCard({ result, onAnother }: { result: ProcessReturnResult; onAnother: () => void }) {
  const q = useQuery({ queryKey: queryKeys.returns.detail(result.return_id), queryFn: () => fetchReturn(result.return_id) });
  const doc = q.data;

  const gross = round2((doc?.return_lines ?? []).reduce((s, l) => s + l.gross_amt, 0));
  const net = doc?.refund_net ?? 0;
  const discountBack = round2(gross - net);
  const cogs = round2((doc?.return_lines ?? []).reduce((s, l) => s + l.cost_amt, 0));
  const failed = (doc?.return_lines ?? []).filter((l) => l.disposition === 'quality_failure');
  const failedUnits = failed.reduce((s, l) => s + l.qty, 0);
  const owes = result.net_due > 0;
  const refunds = result.net_due < 0;

  return (
    <div className="ret-result">
      <Alert tone="success" title={`${result.exchange_sale_id ? 'Exchange' : 'Return'} ${result.return_no} is done`}>
        {result.exchange_sale_id
          ? owes
            ? `Collect ${formatMoney(result.net_due)} from the customer.`
            : refunds
              ? `Give the customer ${formatMoney(-result.net_due)} back.`
              : 'The exchange is even. No money changes hands.'
          : `Give the customer ${formatMoney(result.refund_total)} back.`}
      </Alert>

      <div className="gz-detail">
        <Card title="What happened">
          {q.isLoading ? (
            <SkeletonLines lines={5} />
          ) : q.isError ? (
            <Alert tone="warning" title="The return is saved, but the summary did not load">
              {rpcErrorMessage(q.error)}
            </Alert>
          ) : (
            <ul className="ret-explain text-body">
              <li>
                <span className="ret-explain__icon gz-tint--mint">
                  <Icon name="money" size={14} />
                </span>
                <span>
                  <strong>Refund of {formatMoney(result.refund_total)}.</strong> That is {formatMoney(net)} for the items plus {formatMoney(doc?.tax_refund ?? 0)} of sales tax, paid back by {doc?.refund_method ?? 'cash'}.
                </span>
              </li>
              <li>
                <span className="ret-explain__icon gz-tint--lilac">
                  <Icon name="chart" size={14} />
                </span>
                <span>
                  <strong>Revenue reversed by {formatMoney(gross)}.</strong> Sales come down by the full price of the returned items.
                  {discountBack > 0 ? ` ${formatMoney(discountBack)} of discounts given on them is reversed too, so the customer gets back only what they paid.` : ' No discounts were given on these items.'}
                </span>
              </li>
              <li>
                <span className="ret-explain__icon gz-tint--butter">
                  <Icon name="box" size={14} />
                </span>
                <span>
                  <strong>Cost of goods sold reversed by {formatMoney(cogs)}.</strong> The returned items go back into inventory at the cost they left at, so the cost of making them is no longer counted against the sale.
                  {failedUnits > 0 &&
                    ` ${formatNumber(failedUnits)} failed quality, so they are written off right away as a returns and quality loss and are never put back on sale.`}
                </span>
              </li>
              {result.exchange_sale_id && (
                <li>
                  <span className="ret-explain__icon gz-tint--pink">
                    <Icon name="swap" size={14} />
                  </span>
                  <span>
                    <strong>Replacement items were sold on a new receipt.</strong>{' '}
                    <Link className="gz-link gz-mono" to={`/pos/receipt/${result.exchange_sale_id}`}>
                      {doc?.exchange?.receipt_no ?? 'Open the receipt'}
                    </Link>
                    . {owes ? `The customer pays the ${formatMoney(result.net_due)} difference.` : refunds ? `The shop pays back the ${formatMoney(-result.net_due)} difference.` : 'The two are the same value.'}
                  </span>
                </li>
              )}
            </ul>
          )}
        </Card>

        <Card title="Summary">
          <dl className="ret-sum">
            <div>
              <dt>Return number</dt>
              <dd className="gz-mono">{result.return_no}</dd>
            </div>
            <div>
              <dt>Refund</dt>
              <dd>{formatMoney(result.refund_total)}</dd>
            </div>
            {result.exchange_sale_id && (
              <div className="is-total">
                <dt>{owes ? 'Customer pays' : refunds ? 'Shop refunds' : 'Net due'}</dt>
                <dd className="text-h2">{formatMoney(Math.abs(result.net_due))}</dd>
              </div>
            )}
          </dl>
          <div className="gz-row" style={{ marginTop: 'var(--space-4)' }}>
            <Button variant="primary" onClick={onAnother}>
              Process another return
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

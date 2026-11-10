import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, DataTable, EmptyState, MoneyCell, PageHeader, Select, Tabs, TextField, useToast, type DataTableColumn } from '@/components';
import { fetchSaleByReceipt, invalidateSelling, normalizeReceiptNo, useSellableItems, type SaleDetail, type SellableItem } from '@/features/pos/api';
import { computeTotals, round2, splitMessage } from '@/features/pos/calc';
import { QtyStepper } from '@/features/pos/QtyStepper';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { formatDate, formatMoney, formatNumber, formatPct, formatTime } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { rpc, rpcErrorMessage } from '@/lib/rpc';
import type { ProcessReturnResult, RefundMethod, ReturnDisposition } from '@/types/domain';
import { useRecentReturns, useReturnReasons, type RecentReturn } from './api';
import { ReturnResultCard } from './ReturnResult';
import './returns.css';

const CameraScanner = lazy(() => import('@/components/CameraScanner').then((m) => ({ default: m.CameraScanner })));

type SaleLine = SaleDetail['sale_lines'][number];
interface Pick {
  qty: number;
  disposition: ReturnDisposition;
  reason: string;
}
interface ExchangeLine {
  id: number;
  item: SellableItem;
  qty: number;
}

const EMPTY_PICK: Pick = { qty: 0, disposition: 'restock', reason: '' };

export default function ReturnsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const reasonsQ = useReturnReasons();
  const recentQ = useRecentReturns();
  const itemsQ = useSellableItems();

  const [input, setInput] = useState(params.get('receipt') ?? '');
  const [receipt, setReceipt] = useState(params.get('receipt') ?? '');
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  const [mode, setMode] = useState<'return' | 'exchange'>('return');
  const [method, setMethod] = useState<RefundMethod>('cash');
  const [exchange, setExchange] = useState<ExchangeLine[]>([]);
  const [pickItem, setPickItem] = useState('');
  const [tried, setTried] = useState(false);
  const [result, setResult] = useState<ProcessReturnResult | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoaded, setCameraLoaded] = useState(false);

  const saleQ = useQuery({
    queryKey: queryKeys.sales.scope('receipt', { receipt }),
    enabled: receipt !== '',
    queryFn: () => fetchSaleByReceipt(receipt),
  });
  const sale = saleQ.data ?? null;

  // A new sale starts a fresh form; refunds default to the way the customer paid.
  useEffect(() => {
    setPicks({});
    setExchange([]);
    setMode('return');
    setTried(false);
    if (sale) setMethod(sale.payment_method === 'card' ? 'card' : 'cash');
  }, [sale?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const find = useCallback(
    (text: string) => {
      const code = text.trim();
      if (!code) return;
      const normalized = normalizeReceiptNo(code);
      setInput(normalized);
      setReceipt(normalized);
      setResult(null);
      setParams(normalized ? { receipt: normalized } : {}, { replace: true });
    },
    [setParams],
  );

  useBarcodeScanner({ onScan: find, enabled: !cameraOpen && !result });

  const lines = useMemo(() => sale?.sale_lines ?? [], [sale]);
  const pickOf = (id: number): Pick => picks[id] ?? EMPTY_PICK;
  const setPick = (id: number, change: Partial<Pick>) => setPicks((cur) => ({ ...cur, [id]: { ...(cur[id] ?? EMPTY_PICK), ...change } }));
  const returnable = (l: SaleLine) => Math.max(0, l.qty - l.qty_returned);

  const chosen = lines.filter((l) => pickOf(l.id).qty > 0);
  const missingReason = chosen.filter((l) => pickOf(l.id).disposition === 'quality_failure' && !pickOf(l.id).reason);

  // Estimated refund: the database does the exact math, with the same proportions.
  const refundNet = round2(
    chosen.reduce((s, l) => {
      const q = pickOf(l.id).qty;
      return s + round2((l.line_net * (l.qty_returned + q)) / l.qty) - round2((l.line_net * l.qty_returned) / l.qty);
    }, 0),
  );
  const saleNet = round2((sale?.subtotal ?? 0) - (sale?.discount_total ?? 0));
  const refundTax = saleNet > 0 && sale ? round2((sale.tax_total * refundNet) / saleNet) : 0;
  const refundTotal = round2(refundNet + refundTax);
  const exchangeTotals = computeTotals(exchange.map((x) => ({ qty: x.qty, unitPrice: x.item.list_price, discountPct: 0 })), null, sale?.tax_rate ?? 0);
  const netDue = mode === 'exchange' ? round2(exchangeTotals.total - refundTotal) : -refundTotal;

  const submit = useMutation({
    mutationFn: () =>
      rpc.processReturn({
        sale_id: (sale as SaleDetail).id,
        lines: chosen.map((l) => {
          const p = pickOf(l.id);
          return { sale_line_id: l.id, qty: p.qty, disposition: p.disposition, reason_code: p.reason || null };
        }),
        exchange_lines: mode === 'exchange' && exchange.length > 0 ? exchange.map((x) => ({ item_id: x.item.id, qty: x.qty })) : null,
        refund_method: method,
      }),
    onSuccess: (res) => {
      invalidateSelling(qc);
      toast.success(res.exchange_sale_id ? 'Exchange processed' : 'Return processed', res.return_no);
      setResult(res);
    },
  });

  const problem =
    chosen.length === 0
      ? 'Choose how many of at least one item to return.'
      : missingReason.length > 0
        ? 'Pick a reason for each quality failure.'
        : mode === 'exchange' && exchange.length === 0
          ? 'Add the replacement items, or switch to Return.'
          : null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!problem) submit.mutate();
  }

  function reset() {
    setResult(null);
    setInput('');
    setReceipt('');
    setParams({}, { replace: true });
    submit.reset();
  }

  const items = itemsQ.data ?? [];
  const reasonOptions = [{ value: '', label: 'Choose a reason' }, ...(reasonsQ.data ?? []).map((r) => ({ value: r.code, label: r.label }))];

  const lineColumns: DataTableColumn<SaleLine>[] = [
    {
      key: 'item',
      header: 'Item',
      render: (l) => (
        <div>
          <div className="text-body-strong">
            {l.items?.name ?? 'Item'} {l.condition === 'day_old' && <Badge tone="warning">Day-old</Badge>}
          </div>
          <div className="gz-mono text-caption gz-muted">{formatMoney(l.line_net / l.qty)} each after discounts</div>
        </div>
      ),
    },
    { key: 'sold', header: 'Sold', align: 'right', render: (l) => <span className="gz-num">{formatNumber(l.qty)}</span> },
    { key: 'back', header: 'Already returned', align: 'right', render: (l) => <span className="gz-num">{formatNumber(l.qty_returned)}</span> },
    {
      key: 'qty',
      header: 'Return now',
      align: 'right',
      render: (l) =>
        returnable(l) > 0 ? (
          <QtyStepper size="sm" min={0} max={returnable(l)} label={`Quantity of ${l.items?.name ?? 'item'} to return`} value={pickOf(l.id).qty} onChange={(n) => setPick(l.id, { qty: n })} />
        ) : (
          <span className="gz-muted text-body-sm">Fully returned</span>
        ),
    },
    {
      key: 'disposition',
      header: 'What happens to it',
      render: (l) => (
        <Select
          className="ret-cell-select"
          aria-label={`What happens to ${l.items?.name ?? 'the item'}`}
          value={pickOf(l.id).disposition}
          disabled={pickOf(l.id).qty <= 0}
          onChange={(e) => setPick(l.id, { disposition: e.target.value as ReturnDisposition })}
          options={[
            { value: 'restock', label: 'Restock, can be resold' },
            { value: 'quality_failure', label: 'Quality failure, write off' },
          ]}
        />
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (l) => {
        const p = pickOf(l.id);
        const needs = p.qty > 0 && p.disposition === 'quality_failure';
        return (
          <Select
            className="ret-cell-select"
            aria-label={`Reason for returning ${l.items?.name ?? 'the item'}`}
            value={p.reason}
            disabled={p.qty <= 0}
            required={needs}
            error={tried && needs && !p.reason ? 'Required' : undefined}
            onChange={(e) => setPick(l.id, { reason: e.target.value })}
            options={needs ? reasonOptions : [{ value: '', label: 'No reason' }, ...reasonOptions.slice(1)]}
          />
        );
      },
    },
  ];

  const recentColumns: DataTableColumn<RecentReturn>[] = [
    { key: 'return_no', header: 'Return', render: (r) => <span className="gz-mono">{r.return_no}</span> },
    {
      key: 'receipt',
      header: 'Receipt',
      render: (r) =>
        r.receipt_no ? (
          <Link className="gz-link gz-mono" to={`/pos/receipt/${r.sale_id}`}>
            {r.receipt_no}
          </Link>
        ) : (
          '—'
        ),
    },
    { key: 'kind', header: 'Type', render: (r) => <Badge tone={r.kind === 'exchange' ? 'accent' : 'neutral'}>{r.kind === 'exchange' ? 'Exchange' : 'Return'}</Badge> },
    { key: 'shop', header: 'Shop', render: (r) => r.locations?.name ?? '—' },
    { key: 'units', header: 'Items', align: 'right', render: (r) => <span className="gz-num">{formatNumber(r.units)}</span> },
    { key: 'refund_total', header: 'Refund', align: 'right', render: (r) => <MoneyCell value={r.refund_total} strong /> },
    {
      key: 'net_due',
      header: 'Net due',
      align: 'right',
      render: (r) => (r.kind === 'exchange' ? <MoneyCell value={r.net_due} /> : <span className="gz-muted">—</span>),
    },
    { key: 'returned_at', header: 'When', render: (r) => `${formatDate(r.returned_at)}, ${formatTime(r.returned_at)}` },
  ];

  const submitError = submit.isError ? rpcErrorMessage(submit.error) : null;
  const notFound = receipt !== '' && !saleQ.isLoading && !saleQ.isError && !sale;

  return (
    <>
      <PageHeader
        title="Returns"
        breadcrumb={[{ label: 'Sell' }, { label: 'Returns' }]}
        subtitle="Scan the barcode on the receipt, or type the receipt number."
        actions={
          sale && !result ? (
            <Button variant="primary" type="submit" form="return-form" disabled={submit.isPending}>
              {submit.isPending ? 'Processing' : mode === 'exchange' ? 'Process exchange' : 'Process return'}
            </Button>
          ) : undefined
        }
      />

      <div className="gz-stack">
        {result ? (
          <ReturnResultCard result={result} onAnother={reset} />
        ) : (
          <>
            <Card title="Find the receipt">
              <form
                className="ret-find"
                onSubmit={(e) => {
                  e.preventDefault();
                  find(input);
                }}
              >
                <TextField
                  label="Receipt number"
                  placeholder="RCPT-00123"
                  icon="barcode"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  data-scan-target
                  autoComplete="off"
                  autoFocus
                />
                <Button type="submit" variant={sale ? 'secondary' : 'primary'} icon="search" disabled={!input.trim() || saleQ.isFetching}>
                  {saleQ.isFetching ? 'Looking' : 'Find receipt'}
                </Button>
                <Button
                  icon="camera"
                  onClick={() => {
                    setCameraLoaded(true);
                    setCameraOpen(true);
                  }}
                >
                  Scan with camera
                </Button>
              </form>
              {saleQ.isError && (
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <Alert tone="danger" title="Could not look up that receipt">
                    {rpcErrorMessage(saleQ.error)}
                  </Alert>
                </div>
              )}
              {notFound && (
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <Alert tone="warning" title={`No receipt matches ${receipt}`}>
                    Check the number printed under the barcode. Receipts start with RCPT and then five digits.
                  </Alert>
                </div>
              )}
            </Card>

            {sale && (
              <form id="return-form" className="gz-detail" onSubmit={onSubmit} noValidate>
                <div className="gz-stack">
                  <Card title="Receipt" subtitle="Choose what is coming back.">
                    <dl className="ret-sale text-body-sm">
                      <div>
                        <dt>Receipt</dt>
                        <dd className="gz-mono">{sale.receipt_no}</dd>
                      </div>
                      <div>
                        <dt>Sold</dt>
                        <dd>
                          {formatDate(sale.sold_at)}, {formatTime(sale.sold_at)}
                        </dd>
                      </div>
                      <div>
                        <dt>Shop</dt>
                        <dd>{sale.locations?.name ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>Customer</dt>
                        <dd>{sale.customers?.name ?? 'Walk-in'}</dd>
                      </div>
                      <div>
                        <dt>Paid</dt>
                        <dd>
                          {formatMoney(sale.total)} by {sale.payment_method}
                        </dd>
                      </div>
                    </dl>
                  </Card>

                  <Card title="Items on the receipt" padded={false}>
                    <DataTable aria-label="Items on the receipt" columns={lineColumns} rows={lines} />
                  </Card>

                  <Card title="Return or exchange">
                    <div className="gz-stack gz-stack--sm">
                      <Tabs
                        aria-label="Return or exchange"
                        items={[
                          { value: 'return', label: 'Return for a refund' },
                          { value: 'exchange', label: 'Exchange for other items' },
                        ]}
                        value={mode}
                        onChange={(v) => setMode(v as 'return' | 'exchange')}
                      />
                      <Select
                        label={mode === 'exchange' ? 'Refund or payment method' : 'Refund method'}
                        value={method}
                        onChange={(e) => setMethod(e.target.value as RefundMethod)}
                        options={[
                          { value: 'cash', label: 'Cash' },
                          { value: 'card', label: 'Card' },
                        ]}
                        hint={mode === 'exchange' ? 'Used for any difference, in either direction.' : undefined}
                      />
                      {mode === 'exchange' && (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 'var(--space-3)', alignItems: 'end' }}>
                            <Select
                              label="Replacement item"
                              value={pickItem}
                              onChange={(e) => setPickItem(e.target.value)}
                              options={[{ value: '', label: itemsQ.isLoading ? 'Loading items' : 'Choose an item' }, ...items.map((i) => ({ value: String(i.id), label: `${i.name} (${formatMoney(i.list_price)})` }))]}
                            />
                            <Button
                              icon="plus"
                              disabled={!pickItem}
                              onClick={() => {
                                const item = items.find((i) => String(i.id) === pickItem);
                                if (!item) return;
                                setExchange((cur) => (cur.some((x) => x.item.id === item.id) ? cur.map((x) => (x.item.id === item.id ? { ...x, qty: x.qty + 1 } : x)) : [...cur, { id: item.id, item, qty: 1 }]));
                                setPickItem('');
                              }}
                            >
                              Add item
                            </Button>
                          </div>
                          {exchange.length === 0 ? (
                            <EmptyState icon="swap" title="No replacement items yet" description="Add what the customer is taking instead. They are sold fresh at today's price." />
                          ) : (
                            <DataTable
                              aria-label="Replacement items"
                              density="compact"
                              columns={[
                                { key: 'name', header: 'Item', render: (x: ExchangeLine) => <span className="text-body-strong">{x.item.name}</span> },
                                {
                                  key: 'qty',
                                  header: 'Quantity',
                                  align: 'right',
                                  render: (x: ExchangeLine) => (
                                    <QtyStepper size="sm" label={`Quantity of ${x.item.name}`} value={x.qty} onChange={(n) => setExchange((cur) => cur.map((y) => (y.id === x.id ? { ...y, qty: n } : y)))} />
                                  ),
                                },
                                { key: 'total', header: 'Line total', align: 'right', render: (x: ExchangeLine) => <MoneyCell value={x.qty * x.item.list_price} strong /> },
                                {
                                  key: 'remove',
                                  header: <span className="gz-sr-only">Remove</span>,
                                  align: 'right',
                                  render: (x: ExchangeLine) => <Button size="sm" variant="ghost" icon="x" aria-label={`Remove ${x.item.name}`} onClick={() => setExchange((cur) => cur.filter((y) => y.id !== x.id))} />,
                                },
                              ]}
                              rows={exchange}
                            />
                          )}
                        </>
                      )}
                    </div>
                  </Card>
                </div>

                <div className="gz-stack gz-stack--sm">
                  {submitError && (
                    <Alert tone="danger" title="Could not process this">
                      {splitMessage(submitError).length > 1 ? (
                        <ul className="sell-list">
                          {splitMessage(submitError).map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      ) : (
                        submitError
                      )}
                    </Alert>
                  )}
                  {tried && problem && (
                    <Alert tone="warning" title="Almost there">
                      {problem}
                    </Alert>
                  )}
                  <Card title="Estimated refund">
                    <dl className="ret-sum">
                      <div>
                        <dt>Items</dt>
                        <dd>{formatMoney(refundNet)}</dd>
                      </div>
                      <div>
                        <dt>Tax back ({formatPct(sale.tax_rate, 2)})</dt>
                        <dd>{formatMoney(refundTax)}</dd>
                      </div>
                      <div className={mode === 'return' ? 'is-total' : undefined}>
                        <dt>Refund</dt>
                        <dd className={mode === 'return' ? 'text-h2' : undefined}>{formatMoney(refundTotal)}</dd>
                      </div>
                      {mode === 'exchange' && (
                        <>
                          <div>
                            <dt>Replacement items with tax</dt>
                            <dd>{formatMoney(exchangeTotals.total)}</dd>
                          </div>
                          <div className="is-total">
                            <dt>{netDue > 0 ? 'Customer pays' : netDue < 0 ? 'Shop refunds' : 'Net due'}</dt>
                            <dd className="text-h2">{formatMoney(Math.abs(netDue))}</dd>
                          </div>
                        </>
                      )}
                    </dl>
                    <p className="text-body-sm gz-muted" style={{ marginBottom: 0 }}>
                      This is an estimate. The exact amount is worked out when you process it.
                    </p>
                  </Card>
                </div>
              </form>
            )}

            <section aria-labelledby="recent-returns">
              <h2 id="recent-returns" className="text-h2" style={{ marginBottom: 'var(--space-3)' }}>
                Recent returns
              </h2>
              {!recentQ.isLoading && (recentQ.data ?? []).length === 0 ? (
                <EmptyState icon="undo" title="No returns yet" description="Returns and exchanges show up here as soon as they are processed." />
              ) : (
                <DataTable
                  aria-label="Recent returns"
                  columns={recentColumns}
                  rows={recentQ.data ?? []}
                  loading={recentQ.isLoading}
                  onRowClick={(r) => navigate(`/pos/receipt/${r.sale_id}`)}
                />
              )}
              {recentQ.isError && (
                <Alert tone="danger" title="Could not load recent returns">
                  {rpcErrorMessage(recentQ.error)}
                </Alert>
              )}
            </section>
          </>
        )}
      </div>

      {cameraLoaded && (
        <Suspense fallback={null}>
          <CameraScanner open={cameraOpen} onClose={() => setCameraOpen(false)} onScan={(code) => find(code)} title="Scan the receipt barcode" />
        </Suspense>
      )}
    </>
  );
}

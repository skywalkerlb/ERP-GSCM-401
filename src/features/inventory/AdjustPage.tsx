import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Button, Card, DataTable, EmptyState, MoneyCell, PageHeader, QtyCell, Select, StatusBadge, Tabs, TextField,
} from '@/components';
import {
  STOCK_DOMAINS, costLookup, indexBy, toNumber, useAction, useItemCosts, useItemSuppliers, useItems, useReasonCodes,
} from '@/features/items/api';
import { ErrorAlert, ItemCell, ItemPicker, plural } from '@/features/items/ui';
import { useLocations, useSelectedLocation } from '@/hooks/useLocations';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { rpc } from '@/lib/rpc';
import type { AdjustmentLineInput, Item, PostAdjustmentKind, StockCondition } from '@/types/domain';
import { useAvailability, useRecentAdjustments } from './api';

interface Line { key: string; item: Item; condition: StockCondition; qty: string }
type Mode = 'cycle_count' | 'damage';

export default function AdjustPage() {
  const [params] = useSearchParams();
  const itemsQ = useItems();
  const locationsQ = useLocations();
  const availQ = useAvailability();
  const costsQ = useItemCosts();
  const suppliedQ = useItemSuppliers();
  const reasonsQ = useReasonCodes('adjustment');
  const recentQ = useRecentAdjustments();
  const { locationId } = useSelectedLocation();

  const [mode, setMode] = useState<Mode>('cycle_count');
  const [location, setLocation] = useState<string>('');
  const [lines, setLines] = useState<Record<Mode, Line[]>>({ cycle_count: [], damage: [] });
  const [reason, setReason] = useState<Record<Mode, string>>({ cycle_count: 'COUNT', damage: 'DAMAGE' });
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string; impact: number } | null>(null);
  const preselected = useRef(false);

  useEffect(() => {
    if (!location && (locationId || locationsQ.data?.length)) setLocation(String(locationId ?? locationsQ.data?.[0]?.id ?? ''));
  }, [location, locationId, locationsQ.data]);

  const items = useMemo(() => (itemsQ.data ?? []).filter((i) => i.is_active), [itemsQ.data]);
  const costOf = useMemo(() => costLookup(costsQ.data, suppliedQ.data, itemsQ.data), [costsQ.data, suppliedQ.data, itemsQ.data]);
  const locMap = useMemo(() => indexBy(locationsQ.data, (l) => l.id), [locationsQ.data]);
  const itemMap = useMemo(() => indexBy(itemsQ.data, (i) => i.id), [itemsQ.data]);
  const locId = Number(location);

  const systemQty = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of availQ.data ?? []) {
      if (a.location_id !== locId) continue;
      m.set(`${a.item_id}:fresh`, toNumber(a.on_hand_fresh));
      m.set(`${a.item_id}:day_old`, toNumber(a.on_hand_day_old));
    }
    return m;
  }, [availQ.data, locId]);

  const reasonOptions = useMemo(
    () => (reasonsQ.data ?? []).map((r) => ({ value: r.code, label: `${r.label} (${r.code})` })),
    [reasonsQ.data],
  );

  function addItem(item: Item) {
    setDone(null);
    setError(null);
    setLines((cur) => {
      const list = cur[mode];
      const key = `${item.id}:fresh`;
      if (list.some((l) => l.key === key)) return cur;
      // A count starts blank so the person types what they counted; damage starts at one.
      return { ...cur, [mode]: [...list, { key, item, condition: 'fresh' as StockCondition, qty: mode === 'damage' ? '1' : '' }] };
    });
  }

  useEffect(() => {
    const wanted = Number(params.get('item'));
    if (preselected.current || !wanted || !itemsQ.data) return;
    const hit = itemsQ.data.find((i) => i.id === wanted);
    if (hit) {
      preselected.current = true;
      addItem(hit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, itemsQ.data]);

  const current = lines[mode];
  const patch = (key: string, p: Partial<Line>) =>
    setLines((cur) => ({ ...cur, [mode]: cur[mode].map((l) => (l.key === key ? { ...l, ...p, key: p.condition ? `${l.item.id}:${p.condition}` : l.key } : l)) }));

  const computed = current.map((l) => {
    const sys = systemQty.get(`${l.item.id}:${l.condition}`) ?? 0;
    const entered = l.qty.trim() === '' ? null : toNumber(l.qty);
    const delta = entered === null ? null : mode === 'cycle_count' ? entered - sys : -entered;
    const value = delta === null ? 0 : delta * costOf(l.item.id);
    const invalid = entered !== null && (entered < 0 || (mode === 'damage' && entered > sys + 1e-9));
    return { line: l, sys, entered, delta, value, invalid };
  });
  const usable = computed.filter((c) => c.entered !== null && !c.invalid);
  const totalImpact = usable.reduce((s, c) => s + c.value, 0);

  const post = useAction(
    (v: { location: number; kind: PostAdjustmentKind; lines: AdjustmentLineInput[]; note: string | null }) => rpc.postAdjustment(v),
    { invalidate: STOCK_DOMAINS, errorTitle: 'Could not post the adjustment' },
  );

  async function submit() {
    if (!locId) return setError('Choose the location you are counting.');
    if (usable.length === 0) return setError(mode === 'cycle_count' ? 'Enter a counted quantity for at least one item.' : 'Add an item and the quantity that was damaged.');
    if (computed.some((c) => c.invalid)) return setError('Fix the quantities marked in red. Damage cannot be more than what is on hand.');
    setError(null);
    const payload: AdjustmentLineInput[] = usable.map((c) => ({
      item_id: c.line.item.id,
      condition: c.line.condition,
      reason_code: reason[mode],
      ...(mode === 'cycle_count' ? { counted_qty: c.entered! } : { qty_delta: c.delta! }),
    }));
    try {
      await post.mutateAsync({ location: locId, kind: mode, lines: payload, note: note.trim() || null });
      setDone({ title: mode === 'cycle_count' ? `Count posted for ${plural(payload.length, 'item')}` : `Damage recorded for ${plural(payload.length, 'item')}`, impact: totalImpact });
      setLines((cur) => ({ ...cur, [mode]: [] }));
      setNote('');
    } catch {
      /* the toast already says what went wrong */
    }
  }

  const impactTone = totalImpact < 0 ? 'warning' : 'success';
  return (
    <div className="gz-stack">
      <PageHeader
        title="Adjust stock"
        breadcrumb={[{ label: 'Stock' }, { label: 'Inventory', to: '/inventory' }, { label: 'Adjust stock' }]}
        subtitle="Count what is on the shelf, or record damaged stock. Every change posts to the ledger at average cost."
        actions={<Button variant="primary" icon="check" onClick={() => void submit()} disabled={post.isPending || usable.length === 0}>{post.isPending ? 'Posting' : mode === 'cycle_count' ? 'Post count' : 'Record damage'}</Button>}
      />
      {itemsQ.error && <ErrorAlert error={itemsQ.error} onRetry={() => void itemsQ.refetch()} />}
      {done && (
        <Alert tone="success" title={done.title}>
          Net value impact {formatMoney(done.impact)}. {done.impact < 0 ? 'This is booked as an inventory loss.' : done.impact > 0 ? 'This is booked as an inventory gain.' : 'The counts matched the system.'}
        </Alert>
      )}

      <div className="gz-detail">
        <div className="gz-stack">
          <Card>
            <div className="gz-stack gz-stack--sm">
              <Tabs
                aria-label="Adjustment type" value={mode} onChange={(v) => { setMode(v as Mode); setError(null); setDone(null); }}
                items={[{ value: 'cycle_count', label: 'Cycle count' }, { value: 'damage', label: 'Damage' }]}
              />
              <div className="gz-form-grid">
                <Select
                  label="Location" value={location} onChange={(e) => setLocation(e.target.value)}
                  options={(locationsQ.data ?? []).map((l) => ({ value: String(l.id), label: l.name }))}
                />
                <Select
                  label="Reason code" value={reason[mode]} onChange={(e) => setReason((r) => ({ ...r, [mode]: e.target.value }))}
                  options={reasonOptions.length ? reasonOptions : [{ value: reason[mode], label: reason[mode] }]}
                />
              </div>
              <ItemPicker
                items={items} onPick={addItem} continuous
                label={mode === 'cycle_count' ? 'Scan an item to count it' : 'Scan a damaged item'}
                hint="Click the box, then scan the barcode. Or type a name to search."
                renderMeta={(i) => `${formatNumber((systemQty.get(`${i.id}:fresh`) ?? 0) + (systemQty.get(`${i.id}:day_old`) ?? 0))} in system`}
              />
            </div>
          </Card>

          <Card title={mode === 'cycle_count' ? 'Counted items' : 'Damaged items'} padded={false}>
            <DataTable
              aria-label="Adjustment lines" rowKey="key" density="compact" loading={availQ.isLoading}
              rows={computed}
              empty={<EmptyState icon="scan" title="Nothing scanned yet" description={mode === 'cycle_count' ? 'Scan an item, then type what you counted. The variance shows right away.' : 'Scan a damaged item, then enter how many were damaged.'} />}
              columns={[
                { key: 'item', header: 'Item', render: (c) => <ItemCell item={c.line.item} /> },
                {
                  key: 'condition', header: 'Stock',
                  render: (c) =>
                    c.line.item.item_type === 'finished' ? (
                      <Select
                        aria-label={`Stock condition for ${c.line.item.name}`} className="stk-cell-select" value={c.line.condition}
                        onChange={(e) => patch(c.line.key, { condition: e.target.value as StockCondition })}
                        options={[{ value: 'fresh', label: 'Fresh' }, { value: 'day_old', label: 'Day-old' }]}
                      />
                    ) : (
                      <StatusBadge status="fresh" />
                    ),
                },
                { key: 'sys', header: 'In system', align: 'right', render: (c) => <QtyCell qty={c.sys} item={c.line.item} /> },
                {
                  key: 'qty', header: mode === 'cycle_count' ? 'Counted' : 'Damaged', align: 'right',
                  render: (c) => (
                    <TextField
                      aria-label={`${mode === 'cycle_count' ? 'Counted' : 'Damaged'} quantity for ${c.line.item.name}`} className="stk-cell-input"
                      type="number" inputMode="decimal" min={0} step="any" value={c.line.qty}
                      onChange={(e) => patch(c.line.key, { qty: e.target.value })}
                      error={c.invalid ? (mode === 'damage' ? `Only ${formatNumber(c.sys)} here` : 'Enter 0 or more') : undefined}
                    />
                  ),
                },
                ...(mode === 'cycle_count'
                  ? [{
                      key: 'variance', header: 'Variance', align: 'right' as const,
                      render: (c: (typeof computed)[number]) =>
                        c.delta === null ? <span className="gz-muted">—</span> : (
                          <span className="gz-num" style={{ color: c.delta < 0 ? 'var(--danger)' : undefined, fontWeight: 600 }}>{c.delta > 0 ? '+' : ''}{formatNumber(c.delta, Number.isInteger(c.delta) ? 0 : 2)}</span>
                        ),
                    }]
                  : []),
                { key: 'value', header: 'Value impact', align: 'right', render: (c) => (c.delta === null ? <span className="gz-muted">—</span> : <MoneyCell value={c.value} />) },
                { key: 'remove', header: '', align: 'right', render: (c) => <Button size="sm" variant="ghost" icon="trash" aria-label={`Remove ${c.line.item.name}`} onClick={() => setLines((cur) => ({ ...cur, [mode]: cur[mode].filter((l) => l.key !== c.line.key) }))} /> },
              ]}
            />
            {computed.length > 0 && (
              <div className="stk-total-row">
                <span>Net value impact</span>
                <strong style={{ color: totalImpact < 0 ? 'var(--danger)' : undefined }}>{formatMoney(totalImpact)}</strong>
              </div>
            )}
          </Card>
          {error && <Alert tone="danger" title={error} />}
        </div>

        <div className="gz-stack">
          <Card title="Before you post">
            <div className="gz-stack gz-stack--sm">
              <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example, Tuesday walk-in freezer count" />
              <Alert tone={impactTone} title={`Value impact ${formatMoney(totalImpact)}`}>
                {usable.length === 0
                  ? 'Add items to see what this adjustment is worth.'
                  : `${plural(usable.length, 'line')} at ${locMap.get(locId)?.name ?? 'this location'}, valued at weighted-average cost. ${totalImpact < 0 ? 'Losses post to inventory adjustments.' : 'Gains post to inventory adjustments.'}`}
              </Alert>
              {mode === 'cycle_count' && <p className="gz-muted text-body-sm">Counting an item sets the system quantity to your count. The difference is the variance. Zero-variance counts are recorded too.</p>}
            </div>
          </Card>
        </div>
      </div>

      <Card title="Recent adjustments" subtitle="The last counts and damage entries across all locations." padded={false}>
        {recentQ.error ? <ErrorAlert error={recentQ.error} /> : (
          <DataTable
            aria-label="Recent adjustments" rowKey="id" density="compact" loading={recentQ.isLoading} rows={recentQ.data ?? []}
            empty="No adjustments yet."
            columns={[
              { key: 'adj_no', header: 'Adjustment', mono: true },
              { key: 'kind', header: 'Type', render: (a) => (a.kind === 'cycle_count' ? 'Cycle count' : 'Damage') },
              { key: 'loc', header: 'Location', render: (a) => locMap.get(a.location_id)?.name ?? '—' },
              {
                key: 'items', header: 'Items',
                render: (a) => a.lines.slice(0, 2).map((l) => itemMap.get(l.item_id)?.name ?? `Item ${l.item_id}`).join(', ') + (a.lines.length > 2 ? ` and ${a.lines.length - 2} more` : '') || '—',
              },
              { key: 'posted', header: 'Posted', render: (a) => <span className="gz-num">{formatDateTime(a.posted_at)}</span> },
              { key: 'value', header: 'Value impact', align: 'right', render: (a) => <MoneyCell value={a.value} /> },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

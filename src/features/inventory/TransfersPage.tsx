import { useMemo, useState } from 'react';
import {
  Alert, Badge, Button, Checkbox, ConfirmDialog, DataTable, Dialog, EmptyState, PageHeader, QtyCell, Select, StatusBadge, Tabs, TextField,
  Toolbar, type DataTableColumn,
} from '@/components';
import { toNumber, useAction, useItems, STOCK_DOMAINS, indexBy } from '@/features/items/api';
import { ErrorAlert, ItemCell, ItemPicker, plural } from '@/features/items/ui';
import { useLocations, useSelectedLocation } from '@/hooks/useLocations';
import { useRole } from '@/hooks/useRole';
import { formatDateTime, formatNumber } from '@/lib/format';
import { rpc } from '@/lib/rpc';
import type { Item, StockCondition, TransferLineInput } from '@/types/domain';
import { useAvailability, useTransfers, type TransferView } from './api';

type Tab = 'all' | 'planned' | 'completed' | 'cancelled';

export default function TransfersPage() {
  const { hasRole } = useRole();
  const canWrite = hasRole('manager', 'cashier', 'baker');
  const transfersQ = useTransfers();
  const locationsQ = useLocations();
  const itemsQ = useItems();
  const [tab, setTab] = useState<Tab>('all');
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<TransferView | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'complete' | 'cancel'; transfer: TransferView } | null>(null);

  const locMap = useMemo(() => indexBy(locationsQ.data, (l) => l.id), [locationsQ.data]);
  const itemMap = useMemo(() => indexBy(itemsQ.data, (i) => i.id), [itemsQ.data]);
  const transfers = transfersQ.data ?? [];
  const counts = useMemo(() => ({
    all: transfers.length,
    planned: transfers.filter((t) => t.status === 'planned').length,
    completed: transfers.filter((t) => t.status === 'completed').length,
    cancelled: transfers.filter((t) => t.status === 'cancelled').length,
  }), [transfers]);
  const shown = tab === 'all' ? transfers : transfers.filter((t) => t.status === tab);

  const complete = useAction((id: number) => rpc.completeTransfer({ id }), {
    invalidate: STOCK_DOMAINS, success: 'Transfer completed. Stock has moved.', errorTitle: 'Could not complete the transfer',
  });
  const cancel = useAction((id: number) => rpc.cancelTransfer({ id }), {
    invalidate: STOCK_DOMAINS, success: 'Transfer cancelled.', errorTitle: 'Could not cancel the transfer',
  });

  const columns: DataTableColumn<TransferView>[] = [
    { key: 'trf_no', header: 'Transfer', mono: true, sortable: true },
    {
      key: 'route', header: 'From and to',
      render: (t) => <span><strong>{locMap.get(t.from_location_id)?.name ?? '—'}</strong> to {locMap.get(t.to_location_id)?.name ?? '—'}</span>,
    },
    { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
    {
      key: 'lines', header: 'Lines',
      render: (t) => (
        <span>
          {plural(t.lines.length, 'line')}
          <span className="stk-sub text-body-sm">
            {t.lines.slice(0, 2).map((l) => itemMap.get(l.item_id)?.name ?? `Item ${l.item_id}`).join(', ')}
            {t.lines.length > 2 ? ` and ${t.lines.length - 2} more` : ''}
          </span>
        </span>
      ),
    },
    { key: 'source', header: 'Source', render: (t) => (t.bake_plan_id ? <Badge tone="accent">Bake plan</Badge> : <span className="gz-muted">Manual</span>) },
    { key: 'created_at', header: 'Created', sortable: true, render: (t) => <span className="gz-num">{formatDateTime(t.created_at)}</span> },
    { key: 'completed_at', header: 'Completed', render: (t) => <span className="gz-num">{formatDateTime(t.completed_at)}</span> },
    {
      key: 'actions', header: '', align: 'right',
      render: (t) =>
        t.status === 'planned' && canWrite ? (
          <span className="gz-row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
            <Button size="sm" onClick={() => setConfirm({ kind: 'complete', transfer: t })}>Complete</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'cancel', transfer: t })}>Cancel</Button>
          </span>
        ) : null,
    },
  ];

  return (
    <div className="gz-stack">
      <PageHeader
        title="Transfers"
        breadcrumb={[{ label: 'Stock' }, { label: 'Inventory', to: '/inventory' }, { label: 'Transfers' }]}
        subtitle="Move stock between the kitchen and the shops. Releasing a bake plan creates planned transfers for you."
        actions={canWrite ? <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New transfer</Button> : undefined}
      />
      {transfersQ.error && <ErrorAlert error={transfersQ.error} onRetry={() => void transfersQ.refetch()} />}
      {counts.planned > 0 && (
        <Alert tone="info" title={`${plural(counts.planned, 'transfer')} waiting to be completed`}>
          Planned transfers do not move stock until someone completes them. Complete them once the trays are on the truck.
        </Alert>
      )}
      <div>
        <Toolbar>
          <Tabs
            aria-label="Transfer status" value={tab} onChange={(v) => setTab(v as Tab)}
            items={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'planned', label: 'Planned', count: counts.planned },
              { value: 'completed', label: 'Completed', count: counts.completed },
              { value: 'cancelled', label: 'Cancelled', count: counts.cancelled },
            ]}
          />
        </Toolbar>
        <DataTable<TransferView>
          aria-label="Transfers" columns={columns} rows={shown} loading={transfersQ.isLoading}
          onRowClick={setViewing} defaultSort={{ key: 'created_at', dir: 'desc' }}
          empty={<EmptyState icon="swap" title="No transfers here yet" description="Create a transfer to move stock, or release a bake plan to plan the morning run." />}
        />
      </div>

      {creating && <NewTransferDialog onClose={() => setCreating(false)} />}

      <Dialog
        open={viewing !== null} onClose={() => setViewing(null)} size="md"
        title={viewing ? `Transfer ${viewing.trf_no}` : 'Transfer'}
        description={viewing ? `${locMap.get(viewing.from_location_id)?.name ?? ''} to ${locMap.get(viewing.to_location_id)?.name ?? ''}` : undefined}
        footer={<Button onClick={() => setViewing(null)}>Close</Button>}
      >
        {viewing && (
          <DataTable
            aria-label="Transfer lines" rowKey="id" density="compact" rows={viewing.lines}
            columns={[
              { key: 'item', header: 'Item', render: (l) => <ItemCell item={itemMap.get(l.item_id)} /> },
              { key: 'condition', header: 'Stock', render: (l) => <StatusBadge status={l.condition} /> },
              { key: 'qty', header: 'Quantity', align: 'right', render: (l) => <QtyCell qty={l.qty} item={itemMap.get(l.item_id)} /> },
            ]}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'complete' ? `Complete ${confirm.transfer.trf_no}?` : `Cancel ${confirm?.transfer.trf_no ?? 'transfer'}?`}
        confirmLabel={confirm?.kind === 'complete' ? 'Complete transfer' : 'Cancel transfer'}
        cancelLabel="Keep it"
        tone={confirm?.kind === 'cancel' ? 'danger' : 'primary'}
        onConfirm={async () => {
          if (!confirm) return;
          if (confirm.kind === 'complete') await complete.mutateAsync(confirm.transfer.id).catch(() => undefined);
          else await cancel.mutateAsync(confirm.transfer.id).catch(() => undefined);
        }}
      >
        {confirm?.kind === 'complete'
          ? `This moves ${plural(confirm.transfer.lines.length, 'line')} from ${locMap.get(confirm.transfer.from_location_id)?.name ?? 'the source'} to ${locMap.get(confirm.transfer.to_location_id)?.name ?? 'the destination'} at cost. If something is short you will see which items.`
          : 'No stock moves. The transfer is marked cancelled and cannot be completed later.'}
      </ConfirmDialog>
    </div>
  );
}

interface DraftLine { key: string; item: Item; condition: StockCondition; qty: string }

function NewTransferDialog({ onClose }: { onClose: () => void }) {
  const locationsQ = useLocations();
  const itemsQ = useItems();
  const availQ = useAvailability();
  const { locationId } = useSelectedLocation();
  const locations = locationsQ.data ?? [];
  const kitchen = locations.find((l) => l.kind === 'kitchen');
  const firstShop = locations.find((l) => l.kind === 'shop');
  const [from, setFrom] = useState<string>(String(kitchen?.id ?? locationId ?? ''));
  const [to, setTo] = useState<string>(String(firstShop?.id ?? ''));
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [moveNow, setMoveNow] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const create = useAction(
    (v: { from: number; to: number; lines: TransferLineInput[]; complete: boolean }) => rpc.createTransfer(v),
    {
      invalidate: STOCK_DOMAINS,
      success: (_id, v) => (v.complete ? 'Transfer completed. Stock has moved.' : 'Transfer planned. Complete it when the stock leaves.'),
      errorTitle: 'Could not create the transfer',
      onSuccess: onClose,
    },
  );

  const fromId = Number(from);
  const onHand = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of availQ.data ?? []) {
      if (a.location_id !== fromId) continue;
      m.set(`${a.item_id}:fresh`, toNumber(a.on_hand_fresh));
      m.set(`${a.item_id}:day_old`, toNumber(a.on_hand_day_old));
    }
    return m;
  }, [availQ.data, fromId]);
  const activeItems = useMemo(() => (itemsQ.data ?? []).filter((i) => i.is_active), [itemsQ.data]);

  function addItem(item: Item) {
    setError(null);
    setLines((cur) => {
      const key = `${item.id}:fresh`;
      const hit = cur.find((l) => l.key === key);
      if (hit) return cur.map((l) => (l.key === key ? { ...l, qty: String(toNumber(l.qty) + 1) } : l));
      return [...cur, { key, item, condition: 'fresh', qty: '1' }];
    });
  }

  function setCondition(line: DraftLine, condition: StockCondition) {
    setLines((cur) => cur.map((l) => (l.key === line.key ? { ...l, condition, key: `${l.item.id}:${condition}` } : l)));
  }

  function submit() {
    const payload: TransferLineInput[] = lines
      .map((l) => ({ item_id: l.item.id, qty: toNumber(l.qty), condition: l.condition }))
      .filter((l) => l.qty > 0);
    if (!from || !to) return setError('Choose where the stock comes from and where it is going.');
    if (from === to) return setError('Choose two different locations.');
    if (payload.length === 0) return setError('Add at least one item with a quantity above zero.');
    setError(null);
    create.mutate({ from: Number(from), to: Number(to), lines: payload, complete: moveNow });
  }

  const locOptions = locations.map((l) => ({ value: String(l.id), label: l.name }));
  return (
    <Dialog
      open onClose={onClose} size="lg" title="New transfer" description="Scan items to add them, then set quantities."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={create.isPending}>{create.isPending ? 'Working' : moveNow ? 'Move stock' : 'Plan transfer'}</Button>
        </>
      }
    >
      <div className="gz-stack gz-stack--sm">
        <div className="gz-form-grid">
          <Select label="From" value={from} onChange={(e) => setFrom(e.target.value)} options={locOptions} />
          <Select label="To" value={to} onChange={(e) => setTo(e.target.value)} options={locOptions} />
        </div>
        <ItemPicker
          items={activeItems} onPick={addItem} continuous
          renderMeta={(i) => `${formatNumber((onHand.get(`${i.id}:fresh`) ?? 0) + (onHand.get(`${i.id}:day_old`) ?? 0))} on hand`}
        />
        <DataTable<DraftLine>
          aria-label="Transfer lines" rowKey="key" density="compact" rows={lines}
          empty="Scan or search for an item to start."
          columns={[
            { key: 'item', header: 'Item', render: (l) => <ItemCell item={l.item} /> },
            {
              key: 'condition', header: 'Stock',
              render: (l) =>
                l.item.item_type === 'finished' ? (
                  <Select
                    aria-label={`Stock condition for ${l.item.name}`} className="stk-cell-select" value={l.condition}
                    onChange={(e) => setCondition(l, e.target.value as StockCondition)}
                    options={[{ value: 'fresh', label: 'Fresh' }, { value: 'day_old', label: 'Day-old' }]}
                  />
                ) : (
                  <StatusBadge status="fresh" />
                ),
            },
            { key: 'have', header: 'On hand', align: 'right', render: (l) => <QtyCell qty={onHand.get(`${l.item.id}:${l.condition}`) ?? 0} item={l.item} /> },
            {
              key: 'qty', header: 'Move', align: 'right',
              render: (l) => (
                <TextField
                  aria-label={`Quantity to move for ${l.item.name}`} className="stk-cell-input" type="number" inputMode="decimal" min={0} step="any"
                  value={l.qty} onChange={(e) => setLines((cur) => cur.map((x) => (x.key === l.key ? { ...x, qty: e.target.value } : x)))}
                  error={toNumber(l.qty) > (onHand.get(`${l.item.id}:${l.condition}`) ?? 0) && moveNow ? 'Only ' + formatNumber(onHand.get(`${l.item.id}:${l.condition}`) ?? 0) + ' here' : undefined}
                />
              ),
            },
            {
              key: 'remove', header: '', align: 'right',
              render: (l) => <Button size="sm" variant="ghost" icon="trash" aria-label={`Remove ${l.item.name}`} onClick={() => setLines((cur) => cur.filter((x) => x.key !== l.key))} />,
            },
          ]}
        />
        <Checkbox label="Move the stock now. Leave unchecked to plan it and complete it later." checked={moveNow} onChange={(e) => setMoveNow(e.target.checked)} />
        {error && <Alert tone="danger" title={error} />}
      </div>
    </Dialog>
  );
}

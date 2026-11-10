import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, DataTable, EmptyState, MoneyCell, QtyCell, Select, StatusBadge, TextField, useToast, type DataTableColumn } from '@/components';
import { invalidateMake, useAvailability, useItems, useReasonCodes } from '@/features/production/api';
import { useLocations, useSelectedLocation } from '@/hooks/useLocations';
import { useRole } from '@/hooks/useRole';
import { formatDate, formatNumber } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { rpc, rpcErrorMessage } from '@/lib/rpc';
import { canCall, type StockCondition, type WasteLineInput, type WasteSummaryRow } from '@/types/domain';
import { getRecentWaste } from './api';

interface PendingLine { item_id: number; name: string; condition: StockCondition; qty: number; reason_code: string; reasonLabel: string }

export function LogWasteTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { role } = useRole();
  const { data: locations = [] } = useLocations();
  const { locationId: selectedLocationId } = useSelectedLocation();
  const itemsQ = useItems();
  const availQ = useAvailability();
  const reasons = useReasonCodes(['waste']);
  const recent = useQuery({ queryKey: queryKeys.freshness.scope('recent-waste'), queryFn: () => getRecentWaste(15) });

  const [locationText, setLocationText] = useState('');
  const [itemText, setItemText] = useState('');
  const [condition, setCondition] = useState<StockCondition>('fresh');
  const [qtyText, setQtyText] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<PendingLine[]>([]);

  const locationId = Number(locationText || selectedLocationId || locations[0]?.id || 0);
  const wasteItems = (itemsQ.data ?? []).filter((i) => i.is_active && (i.item_type === 'finished' || i.item_type === 'raw' || i.item_type === 'packaging' || i.item_type === 'resale'));
  const item = wasteItems.find((i) => String(i.id) === itemText) ?? null;
  const canDayOld = item?.item_type === 'finished';
  const cond: StockCondition = canDayOld ? condition : 'fresh';
  const reasonOptions = reasons.data ?? [];
  const reasonCode = reasonText || reasonOptions[0]?.code || '';
  const reasonLabel = reasonOptions.find((r) => r.code === reasonCode)?.label ?? reasonCode;

  const avail = (availQ.data ?? []).find((a) => a.item_id === item?.id && a.location_id === locationId);
  const onHand = avail ? Number((cond === 'day_old' ? avail.on_hand_day_old : avail.on_hand_fresh) ?? 0) : null;
  const qty = Number(qtyText);
  const qtyError = qtyText !== '' && !(qty > 0) ? 'Enter a quantity above 0.' : onHand !== null && qty > onHand ? `Only ${formatNumber(onHand)} on hand here.` : undefined;

  const currentLine = (): PendingLine | null =>
    item && qty > 0 && reasonCode && !qtyError
      ? { item_id: item.id, name: item.name, condition: cond, qty, reason_code: reasonCode, reasonLabel }
      : null;

  const addLine = () => {
    const l = currentLine();
    if (!l) return;
    setLines((cur) => [...cur, l]);
    setQtyText('');
  };

  const log = useMutation({
    mutationFn: () => {
      const all = [...lines, ...(currentLine() ? [currentLine()!] : [])];
      const payload: WasteLineInput[] = all.map((l) => ({ item_id: l.item_id, qty: l.qty, reason_code: l.reason_code, condition: l.condition }));
      return rpc.logWaste({ location: locationId, lines: payload, note: note.trim() || null });
    },
    onSuccess: () => {
      invalidateMake(qc);
      toast.success('Waste logged', 'It now counts toward the waste dashboard and the books.');
      setLines([]);
      setQtyText('');
      setNote('');
    },
    onError: (e) => toast.error('Could not log the waste', rpcErrorMessage(e)),
  });

  const ready = lines.length > 0 || currentLine() !== null;
  const mayLog = canCall(role, 'log_waste');

  const recentCols: DataTableColumn<WasteSummaryRow & { rowId: string }>[] = [
    { key: 'business_date', header: 'Day', render: (r) => formatDate(r.business_date) },
    { key: 'item_name', header: 'Item' },
    { key: 'location_name', header: 'Location' },
    { key: 'condition', header: 'Condition', render: (r) => <StatusBadge status={r.condition} /> },
    { key: 'reason_label', header: 'Reason', render: (r) => r.reason_label ?? r.reason_code ?? '—' },
    { key: 'qty', header: 'Units', align: 'right', render: (r) => <QtyCell qty={r.qty} uom="each" dozens={false} /> },
    { key: 'cost', header: 'Cost', align: 'right', render: (r) => <MoneyCell value={r.cost} /> },
  ];

  return (
    <div className="gz-detail">
      <Card title="Log waste" subtitle="Record donuts or ingredients that cannot be sold or used. Stock and the books update right away.">
        <div className="gz-stack gz-stack--sm">
          <div className="gz-form-grid">
            <Select
              label="Location"
              value={String(locationId || '')}
              onChange={(e) => setLocationText(e.target.value)}
              options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
            />
            <Select
              label="Item"
              value={itemText}
              onChange={(e) => setItemText(e.target.value)}
              options={[{ value: '', label: 'Choose an item' }, ...wasteItems.map((i) => ({ value: String(i.id), label: i.name }))]}
            />
            <Select
              label="Condition"
              value={cond}
              onChange={(e) => setCondition(e.target.value as StockCondition)}
              disabled={!canDayOld}
              hint={canDayOld ? undefined : 'Only finished donuts can be day-old.'}
              options={[{ value: 'fresh', label: 'Fresh' }, { value: 'day_old', label: 'Day-old' }]}
            />
            <TextField
              label="Quantity (units)"
              type="number"
              min={1}
              step={1}
              value={qtyText}
              onChange={(e) => setQtyText(e.target.value)}
              error={qtyError}
              hint={!qtyError && item && onHand !== null ? `${formatNumber(onHand)} ${cond === 'day_old' ? 'day-old' : 'fresh'} on hand here` : undefined}
            />
            <Select
              label="Reason"
              value={reasonCode}
              onChange={(e) => setReasonText(e.target.value)}
              options={reasonOptions.length ? reasonOptions.map((r) => ({ value: r.code, label: r.label })) : [{ value: '', label: 'Loading reasons' }]}
            />
            <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened" />
          </div>

          <div className="gz-row">
            <Button size="lg" icon="plus" disabled={currentLine() === null} onClick={addLine}>Add another line</Button>
          </div>

          {lines.length > 0 && (
            <DataTable
              columns={[
                { key: 'name', header: 'Item' },
                { key: 'condition', header: 'Condition', render: (l: PendingLine) => <StatusBadge status={l.condition} /> },
                { key: 'reasonLabel', header: 'Reason' },
                { key: 'qty', header: 'Units', align: 'right', render: (l: PendingLine) => formatNumber(l.qty) },
                {
                  key: 'remove', header: '', align: 'right',
                  render: (l: PendingLine) => (
                    <Button variant="ghost" size="sm" icon="trash" aria-label={`Remove ${l.name}`} onClick={() => setLines((cur) => cur.filter((x) => x !== l))} />
                  ),
                },
              ]}
              rows={lines.map((l, i) => ({ ...l, rowId: i }))}
              rowKey="rowId"
              density="compact"
              aria-label="Waste lines to log"
            />
          )}

          <div className="gz-row">
            {mayLog ? (
              <Button variant="primary" size="lg" icon="trash" disabled={!ready || log.isPending || !locationId} onClick={() => log.mutate()}>
                {log.isPending ? 'Logging' : 'Log waste'}
              </Button>
            ) : (
              <p className="gz-muted">Your role cannot log waste. Ask a manager.</p>
            )}
          </div>
        </div>
      </Card>

      <Card title="Recently logged" padded={false}>
        <DataTable
          columns={recentCols}
          rows={(recent.data ?? []).map((r, i) => ({ ...r, rowId: `${i}-${r.business_date}-${r.item_id}-${r.location_id}-${r.condition}-${r.reason_code}` }))}
          rowKey="rowId"
          loading={recent.isLoading}
          density="compact"
          aria-label="Recent waste"
          empty={<EmptyState icon="leaf" title="No waste logged" description="Nothing wasted lately. Nice work." />}
        />
      </Card>
    </div>
  );
}

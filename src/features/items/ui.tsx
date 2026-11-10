import { useCallback, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, CameraScanner, Icon, StatusBadge, TextField, useToast } from '@/components';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { daysBetween, businessDate } from '@/lib/format';
import { rpcErrorMessage } from '@/lib/rpc';
import type { Item, SupplierRating } from '@/types/domain';
import './stock.css';

/** Shown when a query fails. Says what happened and offers a retry. */
export function ErrorAlert({ error, onRetry, title = 'We could not load this screen' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <Alert
      tone="danger"
      title={title}
      action={onRetry ? <Button size="sm" onClick={onRetry}>Try again</Button> : undefined}
    >
      {rpcErrorMessage(error)}
    </Alert>
  );
}

/** Item name in strong text with the SKU in mono beneath. Links to the item page when `to` is true. */
export function ItemCell({ item, to = false }: { item: Pick<Item, 'id' | 'name' | 'sku'> | undefined; to?: boolean }) {
  if (!item) return <span className="gz-muted">Unknown item</span>;
  const name = to ? (
    <Link className="gz-link stk-item__name" to={`/inventory/${item.id}`}>{item.name}</Link>
  ) : (
    <span className="stk-item__name">{item.name}</span>
  );
  return (
    <span className="stk-item">
      {name}
      <span className="stk-item__sub gz-mono text-body-sm">{item.sku}</span>
    </span>
  );
}

/** Label and value pairs. */
export function KeyValue({ rows, align = 'right' }: { rows: Array<[label: string, value: ReactNode]>; align?: 'left' | 'right' }) {
  return (
    <dl className={align === 'left' ? 'stk-dl stk-dl--left' : 'stk-dl'}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const RATING_LABEL: Record<SupplierRating, string> = { keep: 'Keep', watch: 'Watch', replace: 'Replace', unrated: 'Not rated yet' };

/** Keep = success, Watch = warning, Replace = danger. */
export function RatingBadge({ rating }: { rating: SupplierRating | string | null | undefined }) {
  const key = (rating ?? 'unrated') as SupplierRating;
  return <StatusBadge status={key} label={RATING_LABEL[key] ?? 'Not rated yet'} />;
}

export function sourceLabel(source: string): string {
  if (source === 'auto_replenish') return 'Auto-replenish';
  if (source === 'sim') return 'History';
  return 'Manual';
}

/** Days from today to a business date. Negative when the date is past. */
export function daysFromToday(ymd: string | null | undefined): number | null {
  return ymd ? daysBetween(businessDate(), ymd) : null;
}

/** "Late" badge with the number of days when an open order is past its expected date. */
export function LateBadge({ expectedOn, open }: { expectedOn: string | null | undefined; open: boolean }) {
  const d = daysFromToday(expectedOn);
  if (!open || d === null || d >= 0) return null;
  return <Badge tone="danger">{`${Math.abs(d)} ${Math.abs(d) === 1 ? 'day' : 'days'} late`}</Badge>;
}

/** On time, early or late for a received date against an expected date. */
export function TimelinessBadge({ expectedOn, receivedOn }: { expectedOn: string | null | undefined; receivedOn: string | null | undefined }) {
  if (!expectedOn || !receivedOn) return null;
  const late = daysBetween(expectedOn, receivedOn);
  if (late <= 0) return <Badge tone="success">{late < 0 ? `${-late} ${-late === 1 ? 'day' : 'days'} early` : 'On time'}</Badge>;
  return <Badge tone="danger">{`${late} ${late === 1 ? 'day' : 'days'} late`}</Badge>;
}

export interface ItemPickerProps {
  items: readonly Item[];
  onPick: (item: Item) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  /** Items to leave out of the suggestions. */
  exclude?: ReadonlySet<number>;
  /** Right-aligned detail for each suggestion, for example stock on hand. */
  renderMeta?: (item: Item) => ReactNode;
  /** Keep the camera open between scans. */
  continuous?: boolean;
  /** Called when a barcode is scanned that is not in `items`. Defaults to a warning toast. */
  onUnknown?: (code: string) => void;
}

/**
 * Search by name, SKU or barcode. A keyboard scanner or the camera picks an item by barcode straight away;
 * typing shows matches to choose from. Click the field first so the scanner types into it.
 */
export function ItemPicker({ items, onPick, label = 'Scan or search for an item', hint, disabled, exclude, renderMeta, continuous, onUnknown }: ItemPickerProps) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [camera, setCamera] = useState(false);

  const byCode = useMemo(() => {
    const m = new Map<string, Item>();
    for (const i of items) {
      m.set(i.sku.toLowerCase(), i);
      if (i.barcode) m.set(i.barcode.toLowerCase(), i);
    }
    return m;
  }, [items]);

  const unknown = useCallback(
    (code: string) => {
      if (onUnknown) onUnknown(code);
      else toast.warning('Barcode not recognized', `No item matches ${code}. Check the label and try again.`);
    },
    [onUnknown, toast],
  );

  const handleCode = useCallback(
    (raw: string) => {
      const code = raw.trim();
      setText('');
      if (!code) return;
      const hit = byCode.get(code.toLowerCase());
      if (hit) onPick(hit);
      else unknown(code);
    },
    [byCode, onPick, unknown],
  );

  useBarcodeScanner({ onScan: handleCode, enabled: !disabled });

  const q = text.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    return items
      .filter((i) => !exclude?.has(i.id) && (i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || (i.barcode ?? '').toLowerCase().includes(q)))
      .slice(0, 6);
  }, [items, q, exclude]);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    e.preventDefault();
    const code = text.trim();
    if (!code) return;
    const exact = byCode.get(code.toLowerCase());
    const hit = exact ?? matches[0];
    if (hit) {
      setText('');
      onPick(hit);
    } else unknown(code);
  }

  return (
    <div className="stk-picker">
      <div className="gz-row" style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }}>
        <TextField
          data-scan-target
          label={label}
          hint={hint}
          icon="scan"
          value={text}
          disabled={disabled}
          autoComplete="off"
          placeholder="Barcode, SKU or name"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          style={{ minWidth: 0 }}
          className="stk-toolbar-field"
        />
        <Button icon="camera" onClick={() => setCamera(true)} disabled={disabled}>Use camera</Button>
      </div>
      {matches.length > 0 && (
        <ul className="app-results" aria-label="Matching items">
          {matches.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => { setText(''); onPick(i); }}>
                <span className="stk-item">
                  <span className="stk-item__name">{i.name}</span>
                  <span className="stk-item__sub gz-mono text-body-sm">{i.sku}</span>
                </span>
                {renderMeta ? <span className="gz-muted gz-num">{renderMeta(i)}</span> : <Icon name="plus" size={16} />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <CameraScanner open={camera} onClose={() => setCamera(false)} onScan={handleCode} continuous={continuous} title="Scan an item" />
    </div>
  );
}

/** Plain-text summary used in confirm dialogs and toasts. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

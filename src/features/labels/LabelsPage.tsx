import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, BarcodeLabel, Button, Card, Checkbox, DataTable, EmptyState, MoneyCell, PageHeader, Select, TextField, type DataTableColumn } from '@/components';
import { formatMoney, formatNumber } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { rpcErrorMessage } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import type { ItemType } from '@/types/domain';
import './labels.css';

/** Avery 5160: 3 columns by 10 rows. */
const PER_PAGE = 30;
const MAX_COPIES = 60;

interface LabelItem {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  barcode: string | null;
  list_price: number | null;
  item_type: ItemType;
  is_sellable: boolean;
}

const codeOf = (i: LabelItem) => i.barcode || i.sku;

/** The page size is a global print rule, so it is only added while this screen is open. */
function usePrintPageSize() {
  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-labels-page', '');
    style.textContent = '@page { size: 8.5in 11in; margin: 0; }';
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
}

function clampInt(text: string, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(text));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export default function LabelsPage() {
  usePrintPageSize();
  const itemsQ = useQuery({
    queryKey: queryKeys.items.scope('labels'),
    staleTime: 60_000,
    queryFn: async (): Promise<LabelItem[]> => {
      const { data, error } = await supabase
        .from('items')
        .select('id, sku, name, category, barcode, list_price, item_type, is_sellable')
        .eq('is_active', true)
        .order('name');
      if (error) throw new Error(error.message);
      return ((data ?? []) as LabelItem[]).map((i) => ({ ...i, list_price: i.list_price === null ? null : Number(i.list_price) }));
    },
  });

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [onlySellable, setOnlySellable] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [copiesText, setCopiesText] = useState('1');
  const [startText, setStartText] = useState('1');

  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c)))].sort(), [items]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        (!onlySellable || i.is_sellable) &&
        (!category || i.category === category) &&
        (!q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || (i.barcode ?? '').toLowerCase().includes(q)),
    );
  }, [items, search, category, onlySellable]);

  const copies = clampInt(copiesText, 1, MAX_COPIES, 1);
  const start = clampInt(startText, 1, PER_PAGE, 1);
  const picked = useMemo(() => items.filter((i) => selected.has(i.id)), [items, selected]);
  const total = picked.length * copies;
  const pages = useMemo(() => {
    const cells: Array<LabelItem | null> = [...Array.from({ length: start - 1 }, () => null), ...picked.flatMap((i) => Array.from({ length: copies }, () => i))];
    const out: Array<Array<LabelItem | null>> = [];
    for (let p = 0; p < cells.length; p += PER_PAGE) out.push(cells.slice(p, p + PER_PAGE));
    return out;
  }, [picked, copies, start]);

  const allShownPicked = shown.length > 0 && shown.every((i) => selected.has(i.id));
  function toggle(id: number, on: boolean) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleShown(on: boolean) {
    setSelected((cur) => {
      const next = new Set(cur);
      for (const i of shown) {
        if (on) next.add(i.id);
        else next.delete(i.id);
      }
      return next;
    });
  }

  const columns: DataTableColumn<LabelItem>[] = [
    {
      key: 'pick',
      header: <Checkbox aria-label="Select all shown items" checked={allShownPicked} onChange={(e) => toggleShown(e.target.checked)} />,
      width: 'var(--space-12)',
      render: (i) => <Checkbox aria-label={`Print labels for ${i.name}`} checked={selected.has(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} />,
    },
    { key: 'name', header: 'Item', render: (i) => <span className="text-body-strong">{i.name}</span> },
    { key: 'sku', header: 'SKU', render: (i) => <span className="gz-mono">{i.sku}</span> },
    { key: 'category', header: 'Category', render: (i) => i.category ?? '—' },
    { key: 'code', header: 'Barcode on label', render: (i) => <span className="gz-mono">{codeOf(i)}</span> },
    { key: 'price', header: 'Price', align: 'right', render: (i) => (i.list_price === null ? <span className="gz-muted">Not for sale</span> : <MoneyCell value={i.list_price} />) },
  ];

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={'Barcode Labels' /* ds-exception: User-requested page-name capitalization. */}
          breadcrumb={[{ label: 'Stock' }, { label: 'Inventory', to: '/inventory' }, { label: 'Barcode Labels' /* ds-exception: User-requested page-name capitalization. */ }]}
          subtitle="Print Code 128 labels on Avery 5160 sheets (30 per page). The POS and receiving scan these."
          actions={
            <Button variant="primary" icon="printer" disabled={total === 0} onClick={() => window.print()}>
              {total === 0 ? 'Print labels' : `Print ${formatNumber(total)} ${total === 1 ? 'label' : 'labels'}`}
            </Button>
          }
        />

        <div className="gz-stack">
          {itemsQ.isError && (
            <Alert tone="danger" title="Could not load items" action={<Button size="sm" onClick={() => void itemsQ.refetch()}>Try again</Button>}>
              {rpcErrorMessage(itemsQ.error)}
            </Alert>
          )}

          <Card title="Choose items">
            <div className="gz-stack gz-stack--sm">
              <div className="lbl-controls">
                <TextField className="lbl-grow" label="Search" icon="search" placeholder="Name, SKU or barcode" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
                <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={[{ value: '', label: 'All categories' }, ...categories]} />
                <Checkbox label="Only items for sale" checked={onlySellable} onChange={(e) => setOnlySellable(e.target.checked)} />
              </div>
              <div className="lbl-summary">
                <span className="text-body-sm gz-muted">
                  {formatNumber(shown.length)} shown, {formatNumber(picked.length)} selected
                </span>
                <span className="gz-row">
                  <Button size="sm" onClick={() => toggleShown(true)} disabled={shown.length === 0}>
                    Select all shown
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
                    Clear selection
                  </Button>
                </span>
              </div>
              <div className="lbl-pick">
                <DataTable aria-label="Items to label" columns={columns} rows={shown} loading={itemsQ.isLoading} density="compact" empty="No items match. Clear the search or choose another category." />
              </div>
            </div>
          </Card>

          <Card title="Print settings">
            <div className="lbl-controls">
              <TextField
                label="Copies of each label"
                type="number"
                min={1}
                max={MAX_COPIES}
                value={copiesText}
                onChange={(e) => setCopiesText(e.target.value)}
                hint={`Up to ${MAX_COPIES}.`}
              />
              <TextField
                label="Start at label"
                type="number"
                min={1}
                max={PER_PAGE}
                value={startText}
                onChange={(e) => setStartText(e.target.value)}
                hint="Reuse a partly used sheet by skipping labels."
              />
              <div className="text-body-sm gz-muted">
                {total > 0
                  ? `${formatNumber(picked.length)} ${picked.length === 1 ? 'item' : 'items'} x ${formatNumber(copies)} = ${formatNumber(total)} labels on ${formatNumber(pages.length)} ${pages.length === 1 ? 'page' : 'pages'}.`
                  : 'Select at least one item to see the sheet.'}
              </div>
            </div>
            <Alert tone="info" title="For a scannable print">
              In the print dialog, set Margins to None and Scale to 100 percent, and load Avery 5160 label paper. Bars print black on white whatever theme you use.
            </Alert>
          </Card>
        </div>

        <h2 className="text-h2" style={{ margin: 'var(--space-8) 0 var(--space-3)' }}>
          Preview
        </h2>
      </div>

      {pages.length === 0 ? (
        <div className="no-print">
          <EmptyState icon="tag" title="No labels yet" description="Tick the items you want above and the sheet appears here, ready to print." />
        </div>
      ) : (
        <div className="lbl-scroll">
          <div className="lbl-sheet">
            {pages.map((cells, p) => (
              <div key={p} className="lbl-page" aria-label={`Label sheet ${p + 1} of ${pages.length}`}>
                {cells.map((item, c) =>
                  item ? (
                    <div key={c} className="lbl">
                      <div className="lbl__head text-caption">
                        <span className="lbl__name">{item.name}</span>
                        {item.list_price !== null && <span className="lbl__price">{formatMoney(item.list_price)}</span>}
                      </div>
                      <BarcodeLabel value={codeOf(item)} caption={false} barHeight={44} />
                      <div className="lbl__sku text-caption">{item.sku}</div>
                    </div>
                  ) : (
                    <div key={c} className="lbl lbl--blank" aria-hidden="true" />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

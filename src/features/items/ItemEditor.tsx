import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Checkbox, DataTable, Dialog, EmptyState, MoneyCell, Select, Tabs, TextField } from '@/components';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { rpc, views } from '@/lib/rpc';
import { formatNumber, formatUnitCost } from '@/lib/format';
import type { BomLine, Item, ItemSupplier, ItemType, Supplier, Uom } from '@/types/domain';
import {
  ITEM_TYPE_LABELS, MASTER_DOMAINS, addBomLine, deleteItemSupplier, indexBy, nextBarcode, removeBomLine, saveItem, setPreferredSupplier,
  toNumber, updateBomLine, upsertItemSupplier, useAction, useBomLines, useItemCosts, useItemSuppliers, useItems, useSuppliers,
} from './api';
import { ItemCell, ItemPicker, plural } from './ui';

type Tab = 'details' | 'suppliers' | 'recipe';
const TYPES: ItemType[] = ['raw', 'packaging', 'finished', 'resale', 'kit'];

interface Props {
  /** An item id, 'new', or null when closed. */
  target: number | 'new' | null;
  onClose: () => void;
  onCreated: (id: number) => void;
  categories: string[];
}

export function ItemEditor({ target, onClose, onCreated, categories }: Props) {
  const itemsQ = useItems();
  if (target === null) return null;
  const item = target === 'new' ? null : itemsQ.data?.find((i) => i.id === target) ?? null;
  if (target !== 'new' && !item) return null;
  return <Editor key={target} item={item} onClose={onClose} onCreated={onCreated} categories={categories} />;
}

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));
const numOrNull = (v: string) => (v.trim() === '' ? null : toNumber(v));
const MD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function Editor({ item, onClose, onCreated, categories }: { item: Item | null; onClose: () => void; onCreated: (id: number) => void; categories: string[] }) {
  const itemsQ = useItems();
  const suppliersQ = useSuppliers();
  const analysisQ = useQuery({
    queryKey: queryKeys.items.scope('reorder-one', { id: item?.id }),
    enabled: Boolean(item),
    queryFn: async () => (await views.reorderAnalysis({ item_id: item!.id }))[0] ?? null,
  });
  const [tab, setTab] = useState<Tab>('details');
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState(() => ({
    name: item?.name ?? '', sku: item?.sku ?? '', category: item?.category ?? '', barcode: item?.barcode ?? '',
    item_type: (item?.item_type ?? 'raw') as ItemType, uom: (item?.uom ?? 'each') as Uom, list_price: str(item?.list_price),
    is_sellable: item?.is_sellable ?? false, is_purchasable: item?.is_purchasable ?? true, is_manufactured: item?.is_manufactured ?? false,
    reorder_point: str(item?.reorder_point ?? 0), safety_stock_override: str(item?.safety_stock_override), lead_time_days: str(item?.lead_time_days ?? 0),
    preferred_supplier_id: str(item?.preferred_supplier_id), pack_size: str(item?.pack_size ?? 1), shelf_life_days: str(item?.shelf_life_days),
    season_start_md: item?.season_start_md ?? '', season_end_md: item?.season_end_md ?? '', is_active: item?.is_active ?? true,
  }));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((c) => ({ ...c, [k]: v }));
  const text = (k: keyof typeof f) => ({ value: String(f[k]), onChange: (e: { target: { value: string } }) => set(k, e.target.value as never) });

  const hasBom = useBomLines().data?.some((b) => b.parent_item_id === item?.id) ?? false;
  const showRecipe = Boolean(item) && (f.item_type === 'finished' || f.item_type === 'kit' || hasBom);

  const save = useAction(
    () => saveItem(item?.id ?? null, {
      name: f.name.trim(), sku: f.sku.trim().toUpperCase(), category: f.category.trim() || null, barcode: f.barcode.trim() || null,
      item_type: f.item_type, uom: f.uom, list_price: numOrNull(f.list_price), is_sellable: f.is_sellable, is_purchasable: f.is_purchasable,
      is_manufactured: f.is_manufactured, reorder_point: toNumber(f.reorder_point), safety_stock_override: numOrNull(f.safety_stock_override),
      lead_time_days: Math.round(toNumber(f.lead_time_days)), preferred_supplier_id: f.preferred_supplier_id ? Number(f.preferred_supplier_id) : null,
      pack_size: toNumber(f.pack_size, 1), shelf_life_days: f.shelf_life_days.trim() === '' ? null : Math.round(toNumber(f.shelf_life_days)),
      season_start_md: f.season_start_md.trim() || null, season_end_md: f.season_end_md.trim() || null, is_active: f.is_active,
    }),
    {
      invalidate: MASTER_DOMAINS, errorTitle: 'Could not save the item',
      success: item ? 'Item saved.' : 'Item created. Add its suppliers and recipe next.',
      onSuccess: (id) => { if (!item) { onCreated(id); } },
    },
  );

  const applyRop = useAction(() => rpc.applyComputedReorderPoints({ item_ids: [item!.id] }), {
    invalidate: MASTER_DOMAINS, errorTitle: 'Could not apply the reorder point', success: 'Reorder point updated from the computed value.',
    onSuccess: () => { if (analysisQ.data) set('reorder_point', String(Math.round(toNumber(analysisQ.data.rop_calc) * 1000) / 1000)); void analysisQ.refetch(); },
  });

  function submit() {
    if (!f.name.trim()) return setError('Enter the item name.');
    if (!f.sku.trim()) return setError('Enter a SKU, for example FLR-001.');
    if (f.is_sellable && numOrNull(f.list_price) === null) return setError('A sellable item needs a list price.');
    if (toNumber(f.pack_size, 0) <= 0) return setError('Pack size must be above 0.');
    for (const k of ['season_start_md', 'season_end_md'] as const) if (f[k].trim() && !MD.test(f[k].trim())) return setError('Season dates use month and day, like 09-15.');
    if (Boolean(f.season_start_md.trim()) !== Boolean(f.season_end_md.trim())) return setError('Enter both season dates, or leave both blank.');
    setError(null);
    save.mutate(undefined);
  }

  const computed = analysisQ.data ? toNumber(analysisQ.data.rop_calc) : null;
  const supplierOptions = [{ value: '', label: 'No preferred supplier' }, ...(suppliersQ.data ?? []).map((s) => ({ value: String(s.id), label: s.name }))];

  return (
    <Dialog
      open onClose={onClose} size="lg" title={item ? item.name : 'New item'} description={item ? `${item.sku} · ${ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}` : 'Fill in the basics, then add suppliers and a recipe.'}
      footer={
        <>
          <Button variant={tab === 'details' ? 'ghost' : 'secondary'} onClick={onClose} disabled={save.isPending}>{tab === 'details' ? 'Cancel' : 'Done'}</Button>
          {tab === 'details' && <Button variant="primary" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Saving' : item ? 'Save item' : 'Create item'}</Button>}
        </>
      }
    >
      <div className="gz-stack gz-stack--sm">
        <Tabs
          aria-label="Item sections" value={tab} onChange={(v) => setTab(v as Tab)}
          items={[{ value: 'details', label: 'Details' }, ...(item ? [{ value: 'suppliers', label: 'Suppliers' }] : []), ...(showRecipe ? [{ value: 'recipe', label: 'Recipe' }] : [])]}
        />
        {tab === 'details' && (
          <>
            <div className="gz-form-grid">
              <TextField label="Name" required {...text('name')} />
              <TextField label="SKU" required {...text('sku')} hint="Shown in mono on labels and orders" />
              <TextField label="Category" list="item-categories" {...text('category')} />
              <Select label="Item type" value={f.item_type} onChange={(e) => set('item_type', e.target.value as ItemType)} options={TYPES.map((t) => ({ value: t, label: ITEM_TYPE_LABELS[t] ?? t }))} />
              <TextField
                label="Barcode" {...text('barcode')} hint={'Code 128, printed from Barcode Labels' /* ds-exception: User-requested page-name capitalization. */}
                suffix={<Button size="sm" variant="ghost" onClick={() => set('barcode', nextBarcode(itemsQ.data ?? []))}>Generate</Button>}
              />
              <Select label="Unit of measure" value={f.uom} onChange={(e) => set('uom', e.target.value as Uom)} options={[{ value: 'each', label: 'Each' }, { value: 'lb', label: 'Pounds' }, { value: 'gal', label: 'Gallons' }]} />
              <TextField label="List price" type="number" min={0} step="0.01" {...text('list_price')} suffix="USD" hint="Needed for anything sold" />
              <TextField label="Pack size" type="number" min={0} step="any" {...text('pack_size')} hint="Orders round up to this" />
              <TextField label="Lead time" type="number" min={0} step={1} {...text('lead_time_days')} suffix="days" />
              <Select label="Preferred supplier" value={f.preferred_supplier_id} onChange={(e) => set('preferred_supplier_id', e.target.value)} options={supplierOptions} />
              <TextField label="Reorder point (stored)" type="number" min={0} step="any" {...text('reorder_point')} />
              <TextField label="Safety stock override" type="number" min={0} step="any" {...text('safety_stock_override')} hint="Leave blank to calculate it" />
              <TextField label="Shelf life" type="number" min={0} step={1} {...text('shelf_life_days')} suffix="days" />
              <div className="gz-form-grid">
                <TextField label="Season starts" placeholder="MM-DD" {...text('season_start_md')} />
                <TextField label="Season ends" placeholder="MM-DD" {...text('season_end_md')} />
              </div>
            </div>
            {item && (
              <Alert
                tone={computed !== null && Math.abs(computed - toNumber(f.reorder_point)) > Math.max(1, toNumber(f.reorder_point) * 0.1) ? 'warning' : 'info'}
                title={computed === null ? 'No computed reorder point' : `Computed reorder point ${formatNumber(computed, 1)}, stored ${formatNumber(toNumber(item.reorder_point), 1)}`}
                action={computed !== null ? <Button size="sm" onClick={() => applyRop.mutate(undefined)} disabled={applyRop.isPending}>Apply computed ROP</Button> : undefined}
              >
                {computed === null
                  ? 'Only active purchased items are analysed. Mark this item purchasable and give it a supplier.'
                  : `From usage of ${formatNumber(analysisQ.data!.avg_daily_usage, 1)} a day over a ${formatNumber(analysisQ.data!.lead_time_days, 1)} day lead time, plus ${formatNumber(analysisQ.data!.safety_stock, 1)} safety stock. The stored value is what the shop uses until you apply the computed one.`}
              </Alert>
            )}
            <div className="gz-row">
              <Checkbox label="Sold to customers" checked={f.is_sellable} onChange={(e) => set('is_sellable', e.target.checked)} />
              <Checkbox label="Bought from suppliers" checked={f.is_purchasable} onChange={(e) => set('is_purchasable', e.target.checked)} />
              <Checkbox label="Made in the kitchen" checked={f.is_manufactured} onChange={(e) => set('is_manufactured', e.target.checked)} />
              <Checkbox label="Active" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            </div>
            <datalist id="item-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            {error && <Alert tone="danger" title={error} />}
          </>
        )}
        {tab === 'suppliers' && item && <SuppliersTab item={item} suppliers={suppliersQ.data ?? []} />}
        {tab === 'recipe' && item && <RecipeTab item={item} />}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- suppliers tab
function SuppliersTab({ item, suppliers }: { item: Item; suppliers: Supplier[] }) {
  const suppliedQ = useItemSuppliers();
  const mine = (suppliedQ.data ?? []).filter((s) => s.item_id === item.id);
  const free = suppliers.filter((s) => s.is_active && !mine.some((m) => m.supplier_id === s.id));
  const [newSupplier, setNewSupplier] = useState('');
  const [newCost, setNewCost] = useState('');
  const supplierMap = useMemo(() => indexBy(suppliers, (s) => s.id), [suppliers]);

  const add = useAction(
    () => upsertItemSupplier({ item_id: item.id, supplier_id: Number(newSupplier), supplier_sku: null, unit_cost: toNumber(newCost), quoted_lead_time_days: null, pack_size: toNumber(item.pack_size, 1), is_preferred: mine.length === 0 }),
    { invalidate: MASTER_DOMAINS, errorTitle: 'Could not add the supplier', success: 'Supplier added.', onSuccess: () => { setNewSupplier(''); setNewCost(''); } },
  );
  const prefer = useAction((supplierId: number) => setPreferredSupplier(item.id, supplierId), { invalidate: MASTER_DOMAINS, errorTitle: 'Could not change the preferred supplier', success: 'Preferred supplier updated.' });

  return (
    <div className="gz-stack gz-stack--sm">
      <DataTable<ItemSupplier>
        aria-label="Suppliers for this item" rowKey="supplier_id" density="compact" rows={mine} loading={suppliedQ.isLoading}
        empty={<EmptyState icon="building" title="No supplier yet" description="Add one below so this item can go on a purchase order." />}
        columns={[
          { key: 'supplier', header: 'Supplier', render: (s) => <strong>{supplierMap.get(s.supplier_id)?.name ?? `Supplier ${s.supplier_id}`}</strong> },
          { key: 'edit', header: 'Cost, SKU, lead time, pack', render: (s) => <SupplierRowEditor row={s} /> },
          { key: 'pref', header: '', render: (s) => (s.is_preferred ? <Badge tone="accent">Preferred</Badge> : <Button size="sm" variant="ghost" onClick={() => prefer.mutate(s.supplier_id)}>Make preferred</Button>) },
        ]}
      />
      <div className="gz-row" style={{ alignItems: 'flex-end' }}>
        <Select label="Add a supplier" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} options={[{ value: '', label: free.length ? 'Choose a supplier' : 'All suppliers are linked' }, ...free.map((s) => ({ value: String(s.id), label: s.name }))]} />
        <TextField label="Unit cost" type="number" min={0} step="0.0001" value={newCost} onChange={(e) => setNewCost(e.target.value)} suffix="USD" />
        <Button onClick={() => add.mutate(undefined)} disabled={!newSupplier || newCost === '' || add.isPending}>Add supplier</Button>
      </div>
      <p className="gz-muted text-body-sm" style={{ margin: 0 }}>The preferred supplier is who auto-replenish and the material plan order from.</p>
    </div>
  );
}

function SupplierRowEditor({ row }: { row: ItemSupplier }) {
  const [cost, setCost] = useState(String(toNumber(row.unit_cost)));
  const [sku, setSku] = useState(row.supplier_sku ?? '');
  const [lead, setLead] = useState(str(row.quoted_lead_time_days));
  const [pack, setPack] = useState(String(toNumber(row.pack_size, 1)));
  useEffect(() => { setCost(String(toNumber(row.unit_cost))); setSku(row.supplier_sku ?? ''); setLead(str(row.quoted_lead_time_days)); setPack(String(toNumber(row.pack_size, 1))); }, [row]);
  const dirty = toNumber(cost) !== toNumber(row.unit_cost) || sku !== (row.supplier_sku ?? '') || lead !== str(row.quoted_lead_time_days) || toNumber(pack) !== toNumber(row.pack_size);
  const save = useAction(
    () => upsertItemSupplier({ ...row, unit_cost: toNumber(cost), supplier_sku: sku.trim() || null, quoted_lead_time_days: lead.trim() === '' ? null : Math.round(toNumber(lead)), pack_size: toNumber(pack, 1) }),
    { invalidate: MASTER_DOMAINS, errorTitle: 'Could not save', success: 'Supplier terms saved.' },
  );
  const remove = useAction(() => deleteItemSupplier(row.item_id, row.supplier_id), { invalidate: MASTER_DOMAINS, errorTitle: 'Could not remove the supplier', success: 'Supplier removed from this item.' });
  return (
    <span className="gz-row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
      <TextField aria-label="Unit cost" className="stk-cell-input" type="number" min={0} step="0.0001" value={cost} onChange={(e) => setCost(e.target.value)} />
      <TextField aria-label="Supplier SKU" className="stk-cell-input" placeholder="Their SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
      <TextField aria-label="Lead time in days" className="stk-cell-input" type="number" min={0} step={1} placeholder="Lead days" value={lead} onChange={(e) => setLead(e.target.value)} />
      <TextField aria-label="Pack size" className="stk-cell-input" type="number" min={0} step="any" value={pack} onChange={(e) => setPack(e.target.value)} />
      <Button size="sm" onClick={() => save.mutate(undefined)} disabled={!dirty || save.isPending}>Save</Button>
      <Button size="sm" variant="ghost" icon="trash" aria-label="Remove supplier" onClick={() => remove.mutate(undefined)} disabled={remove.isPending} />
    </span>
  );
}

// ---------------------------------------------------------------- recipe tab
function RecipeTab({ item }: { item: Item }) {
  const itemsQ = useItems();
  const bomQ = useBomLines();
  const costsQ = useItemCosts();
  const lines = (bomQ.data ?? []).filter((b) => b.parent_item_id === item.id);
  const itemMap = useMemo(() => indexBy(itemsQ.data, (i) => i.id), [itemsQ.data]);
  const costMap = useMemo(() => indexBy(costsQ.data, (c) => c.item_id), [costsQ.data]);
  const [pending, setPending] = useState<Item | null>(null);
  const [qty, setQty] = useState('1');
  const exclude = useMemo(() => new Set([item.id, ...lines.map((l) => l.component_item_id)]), [item.id, lines]);
  const candidates = useMemo(() => (itemsQ.data ?? []).filter((i) => i.is_active && i.is_purchasable), [itemsQ.data]);
  const rolled = lines.reduce((s, l) => s + toNumber(l.qty_per) * toNumber(costMap.get(l.component_item_id)?.avg_cost), 0);

  const add = useAction(() => addBomLine(item.id, pending!.id, toNumber(qty)), {
    invalidate: MASTER_DOMAINS, errorTitle: 'Could not add the component', success: 'Component added to the recipe.', onSuccess: () => { setPending(null); setQty('1'); },
  });

  return (
    <div className="gz-stack gz-stack--sm">
      <DataTable<BomLine>
        aria-label="Recipe" rowKey="id" density="compact" rows={lines} loading={bomQ.isLoading}
        empty={<EmptyState icon="layers" title="No components yet" description="Add the ingredients or parts that go into one of these." />}
        columns={[
          { key: 'component', header: 'Component', render: (b) => <ItemCell item={itemMap.get(b.component_item_id)} /> },
          { key: 'qty', header: 'Quantity per', render: (b) => <QtyEditor line={b} uom={itemMap.get(b.component_item_id)?.uom ?? ''} /> },
          { key: 'cost', header: 'Cost per unit made', align: 'right', render: (b) => <MoneyCell value={toNumber(b.qty_per) * toNumber(costMap.get(b.component_item_id)?.avg_cost)} unitCost /> },
          { key: 'remove', header: '', align: 'right', render: (b) => <RemoveLine id={b.id} name={itemMap.get(b.component_item_id)?.name ?? 'component'} /> },
        ]}
      />
      <p className="gz-muted text-body-sm" style={{ margin: 0 }}>Rolled-up cost of one {item.name.toLowerCase()}: <strong>{formatUnitCost(rolled)}</strong> at average cost.</p>
      {pending ? (
        <div className="gz-row" style={{ alignItems: 'flex-end' }}>
          <TextField label={`Quantity of ${pending.name} per ${item.name.toLowerCase()}`} type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} suffix={pending.uom} />
          <Button onClick={() => add.mutate(undefined)} disabled={add.isPending || toNumber(qty) <= 0}>Add to recipe</Button>
          <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
        </div>
      ) : (
        <ItemPicker items={candidates} exclude={exclude} onPick={setPending} label="Add a component" hint="Scan or search for an ingredient, packaging or part." />
      )}
      <span className="gz-muted text-body-sm">{plural(lines.length, 'component')}</span>
    </div>
  );
}

function QtyEditor({ line, uom }: { line: BomLine; uom: string }) {
  const [v, setV] = useState(String(toNumber(line.qty_per)));
  useEffect(() => setV(String(toNumber(line.qty_per))), [line.qty_per]);
  const save = useAction(() => updateBomLine(line.id, toNumber(v)), { invalidate: MASTER_DOMAINS, errorTitle: 'Could not save the quantity', success: 'Quantity saved.' });
  return (
    <span className="gz-row" style={{ gap: 'var(--space-2)' }}>
      <TextField aria-label="Quantity per" className="stk-cell-input" type="number" min={0} step="any" value={v} onChange={(e) => setV(e.target.value)} suffix={uom} />
      <Button size="sm" onClick={() => save.mutate(undefined)} disabled={save.isPending || toNumber(v) <= 0 || toNumber(v) === toNumber(line.qty_per)}>Save</Button>
    </span>
  );
}

function RemoveLine({ id, name }: { id: number; name: string }) {
  const remove = useAction(() => removeBomLine(id), { invalidate: MASTER_DOMAINS, errorTitle: 'Could not remove the component', success: 'Component removed.' });
  return <Button size="sm" variant="ghost" icon="trash" aria-label={`Remove ${name}`} onClick={() => remove.mutate(undefined)} disabled={remove.isPending} />;
}

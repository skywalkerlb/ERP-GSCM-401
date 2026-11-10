import { useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/Alert';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Checkbox } from '@/components/Checkbox';
import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { SkeletonLines } from '@/components/Skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import '@/features/reports/insights.css';
import { useLocations } from '@/hooks/useLocations';
import { formatNumber, formatPct } from '@/lib/format';
import { rpcErrorMessage } from '@/lib/rpc';
import type { AppSettings, PeriodicReviewRow, ReorderAnalysisRow, SupplierScorecardRow } from '@/types/domain';
import { useAppSettings, useSaveSettings, type SaveSettingsResult, type SettingsPatch } from './api';

/* ------------------------------------------------------------------ form model */

interface FormState {
  ordering_cost_per_po: string;
  holding_pct: string;
  service_level_z: string;
  usage_window_days: string;
  review_period_days: string;
  use_actual_lead_time: boolean;
  bake_buffer_pct: string;
  day_old_markdown_pct: string;
  w_ontime: string;
  w_fill: string;
  w_lead: string;
  keep_threshold: string;
  watch_threshold: string;
  default_tax_pct: string;
  business_name: string;
}

/** Same defaults as the seed (supabase migration 0002). */
const DEFAULTS: AppSettings = {
  id: 1, ordering_cost_per_po: 45, holding_cost_rate_annual: 0.25, service_level_z: 1.65, usage_window_days: 90, review_period_days: 7,
  use_actual_lead_time: false, bake_buffer_pct: 0.08, day_old_markdown_pct: 0.5, score_w_ontime: 0.4, score_w_fill: 0.35, score_w_lead: 0.25,
  keep_threshold: 90, watch_threshold: 75, default_tax_rate: 0.0725, timezone: 'America/Denver', business_name: 'Glazed', updated_at: '',
};

const pct = (fraction: number) => String(Math.round(fraction * 10000) / 100);
const str = (n: number) => String(n);

function toForm(s: AppSettings): FormState {
  return {
    ordering_cost_per_po: str(s.ordering_cost_per_po), holding_pct: pct(s.holding_cost_rate_annual), service_level_z: str(s.service_level_z),
    usage_window_days: str(s.usage_window_days), review_period_days: str(s.review_period_days), use_actual_lead_time: s.use_actual_lead_time,
    bake_buffer_pct: pct(s.bake_buffer_pct), day_old_markdown_pct: pct(s.day_old_markdown_pct), w_ontime: pct(s.score_w_ontime), w_fill: pct(s.score_w_fill),
    w_lead: pct(s.score_w_lead), keep_threshold: str(s.keep_threshold), watch_threshold: str(s.watch_threshold), default_tax_pct: pct(s.default_tax_rate),
    business_name: s.business_name,
  };
}

type Errors = Partial<Record<keyof FormState | 'weights', string>>;

function num(v: string): number {
  return v.trim() === '' ? NaN : Number(v);
}

function validate(f: FormState): Errors {
  const e: Errors = {};
  const range = (key: keyof FormState, lo: number, hi: number, msg: string, integer = false) => {
    const n = num(f[key] as string);
    if (!Number.isFinite(n) || n < lo || n > hi || (integer && !Number.isInteger(n))) e[key] = msg;
  };
  range('ordering_cost_per_po', 0, 100000, 'Enter a cost of $0.00 or more.');
  range('holding_pct', 0.01, 100, 'Enter a rate above 0% and up to 100%.');
  range('service_level_z', 0.01, 4, 'Enter a z value between 0.01 and 4. Use 1.65 for about a 95% service level.');
  range('usage_window_days', 7, 365, 'Enter a whole number of days from 7 to 365.', true);
  range('review_period_days', 1, 90, 'Enter a whole number of days from 1 to 90.', true);
  range('bake_buffer_pct', 0, 100, 'Enter a percentage from 0 to 100.');
  range('day_old_markdown_pct', 0, 100, 'Enter a percentage from 0 to 100.');
  range('w_ontime', 0, 100, 'Enter a percentage from 0 to 100.');
  range('w_fill', 0, 100, 'Enter a percentage from 0 to 100.');
  range('w_lead', 0, 100, 'Enter a percentage from 0 to 100.');
  range('keep_threshold', 0, 100, 'Enter a score from 0 to 100.');
  range('watch_threshold', 0, 100, 'Enter a score from 0 to 100.');
  range('default_tax_pct', 0, 30, 'Enter a tax rate from 0% to 30%.');
  if (!e.w_ontime && !e.w_fill && !e.w_lead) {
    const sum = num(f.w_ontime) + num(f.w_fill) + num(f.w_lead);
    if (Math.abs(sum - 100) > 0.01) e.weights = `The three weights add up to ${formatNumber(sum, 2)}%. Make them add up to 100%.`;
  }
  if (!e.keep_threshold && !e.watch_threshold && num(f.watch_threshold) >= num(f.keep_threshold)) {
    e.watch_threshold = 'Set the watch threshold below the keep threshold.';
  }
  if (f.business_name.trim() === '') e.business_name = 'Enter the business name.';
  return e;
}

const r4 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

function toSettings(f: FormState): Required<SettingsPatch> {
  return {
    ordering_cost_per_po: num(f.ordering_cost_per_po), holding_cost_rate_annual: r4(num(f.holding_pct) / 100), service_level_z: num(f.service_level_z),
    usage_window_days: num(f.usage_window_days), review_period_days: num(f.review_period_days), use_actual_lead_time: f.use_actual_lead_time,
    bake_buffer_pct: r4(num(f.bake_buffer_pct) / 100), day_old_markdown_pct: r4(num(f.day_old_markdown_pct) / 100),
    score_w_ontime: r4(num(f.w_ontime) / 100), score_w_fill: r4(num(f.w_fill) / 100), score_w_lead: r4(num(f.w_lead) / 100),
    keep_threshold: num(f.keep_threshold), watch_threshold: num(f.watch_threshold), default_tax_rate: r4(num(f.default_tax_pct) / 100),
    business_name: f.business_name.trim(),
  };
}

/** What each setting feeds, so the presenter can say what a change should move. */
const AFFECTS: Record<keyof Required<SettingsPatch>, { label: string; drives: string }> = {
  ordering_cost_per_po: { label: 'Ordering cost per PO', drives: 'economic order quantity (EOQ) and suggested order quantities' },
  holding_cost_rate_annual: { label: 'Annual holding cost rate', drives: 'economic order quantity (EOQ) and suggested order quantities' },
  service_level_z: { label: 'Service level (z)', drives: 'safety stock, reorder points and periodic review order-up-to levels' },
  usage_window_days: { label: 'Usage window', drives: 'average daily usage, safety stock, reorder points and EOQ' },
  review_period_days: { label: 'Review period', drives: 'periodic review order-up-to levels' },
  use_actual_lead_time: { label: 'Use actual lead time', drives: 'the lead time behind safety stock, reorder points and order-by dates' },
  bake_buffer_pct: { label: 'Bake buffer', drives: 'the quantities in newly built bake plans' },
  day_old_markdown_pct: { label: 'Day-old markdown', drives: 'the day-old price at the register' },
  score_w_ontime: { label: 'On-time weight', drives: 'supplier scores and keep, watch or replace ratings' },
  score_w_fill: { label: 'Fill rate weight', drives: 'supplier scores and keep, watch or replace ratings' },
  score_w_lead: { label: 'Lead time weight', drives: 'supplier scores and keep, watch or replace ratings' },
  keep_threshold: { label: 'Keep threshold', drives: 'supplier ratings' },
  watch_threshold: { label: 'Watch threshold', drives: 'supplier ratings' },
  default_tax_rate: { label: 'Default tax rate', drives: 'the default for new locations; registers use each location rate below' },
  business_name: { label: 'Business name', drives: 'the name shown on receipts and documents' },
};

/** Standard normal CDF (Abramowitz and Stegun 7.1.26), for the service level hint. */
function serviceLevel(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}

/* ------------------------------------------------------------------ page */

export default function SettingsPage() {
  const toast = useToast();
  const settings = useAppSettings();
  const locations = useLocations();
  const save = useSaveSettings();
  const shops = useMemo(() => (locations.data ?? []).filter((l) => l.kind === 'shop'), [locations.data]);

  const [form, setForm] = useState<FormState | null>(null);
  const [locTax, setLocTax] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [result, setResult] = useState<{ data: SaveSettingsResult; changed: string[] } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load the form once the settings arrive, and again after a save so it shows what the database holds.
  useEffect(() => {
    if (settings.data) setForm(toForm(settings.data));
  }, [settings.data]);
  useEffect(() => {
    setLocTax(Object.fromEntries(shops.map((l) => [l.id, pct(l.tax_rate ?? 0)])));
  }, [shops]);

  const original = settings.data ? toForm(settings.data) : null;
  const dirtySettings = Boolean(form && original && (Object.keys(form) as Array<keyof FormState>).some((k) => form[k] !== original[k]));
  const dirtyLocations = shops.filter((l) => locTax[l.id] !== undefined && locTax[l.id] !== pct(l.tax_rate ?? 0));
  const dirty = dirtySettings || dirtyLocations.length > 0;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    if (errors.weights && (key === 'w_ontime' || key === 'w_fill' || key === 'w_lead')) setErrors((e) => ({ ...e, weights: undefined }));
  }

  function resetDefaults() {
    setForm(toForm({ ...DEFAULTS, business_name: form?.business_name ?? DEFAULTS.business_name }));
    setErrors({});
  }

  function onSave() {
    if (!form || !settings.data) return;
    const errs = validate(form);
    for (const l of dirtyLocations) {
      const n = num(locTax[l.id] ?? '');
      if (!Number.isFinite(n) || n < 0 || n > 30) errs[`tax_${l.id}` as keyof Errors] = 'Enter a tax rate from 0% to 30%.';
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaveError(null);

    const next = toSettings(form);
    const prev = toSettings(toForm(settings.data));
    const keys = (Object.keys(next) as Array<keyof typeof next>).filter((k) => next[k] !== prev[k]);
    const patch = Object.fromEntries(keys.map((k) => [k, next[k]])) as SettingsPatch;
    const locationTax = dirtyLocations.map((l) => ({ id: l.id, tax_rate: r4(num(locTax[l.id]!) / 100) }));
    const changed = [...keys.map((k) => AFFECTS[k].label), ...dirtyLocations.map((l) => `${l.name} tax rate`)];

    save.mutate(
      { patch, locationTax },
      {
        onSuccess: (data) => {
          setResult({ data, changed });
          toast.success('Settings saved', 'The numbers that depend on them were recalculated.');
        },
        onError: (e) => setSaveError(rpcErrorMessage(e)),
      },
    );
  }

  const changedKeys = useMemo(() => {
    if (!form || !settings.data) return [];
    const next = toSettings(form);
    const prev = toSettings(toForm(settings.data));
    return (Object.keys(next) as Array<keyof typeof next>).filter((k) => next[k] !== prev[k]);
  }, [form, settings.data]);

  const zNum = form ? num(form.service_level_z) : NaN;

  return (
    <>
      <PageHeader
        title="Settings"
        breadcrumb={[{ label: 'Setup' }, { label: 'Settings' }]}
        subtitle="Costs, service levels and planning rules. Saving recalculates reorder points, order quantities and supplier scores straight away."
        actions={
          <>
            <Button variant="secondary" onClick={resetDefaults} disabled={!form}>Reset to defaults</Button>
            <Button variant="primary" onClick={onSave} disabled={!dirty || save.isPending}>{save.isPending ? 'Saving…' : 'Save changes'}</Button>
          </>
        }
      />
      <div className="gz-stack">
        {settings.isError && <Alert tone="danger" title="Could not load settings">{rpcErrorMessage(settings.error)} Refresh the page to try again.</Alert>}
        {saveError && <Alert tone="danger" title="Settings were not saved">{saveError}</Alert>}
        {result && <ImpactCard result={result.data} changed={result.changed} />}
        {changedKeys.length > 0 && !result && (
          <Alert tone="info" title="Unsaved changes">
            {`This will change ${[...new Set(changedKeys.map((k) => AFFECTS[k].drives))].join('; ')}.`}
          </Alert>
        )}
        {!form ? (
          <Card><SkeletonLines lines={6} /></Card>
        ) : (
          <>
            <Card title="Ordering costs" subtitle="Drive the economic order quantity (EOQ): the order size that balances ordering against holding stock.">
              <div className="gz-form-grid">
                <TextField label="Ordering cost per purchase order" type="number" inputMode="decimal" min="0" step="0.01" value={form.ordering_cost_per_po} onChange={(e) => set('ordering_cost_per_po', e.target.value)} error={errors.ordering_cost_per_po} hint="Cost of placing and receiving one PO, in dollars." />
                <TextField label="Annual holding cost rate" type="number" inputMode="decimal" min="0" step="0.5" value={form.holding_pct} suffix="%" onChange={(e) => set('holding_pct', e.target.value)} error={errors.holding_pct} hint="Share of an item's cost it costs to keep it for a year." />
              </div>
            </Card>
            <Card title="Demand and service level" subtitle="Drive safety stock, reorder points (ROP) and the periodic review.">
              <div className="gz-form-grid">
                <TextField label="Service level (z)" type="number" inputMode="decimal" min="0" step="0.01" value={form.service_level_z} onChange={(e) => set('service_level_z', e.target.value)} error={errors.service_level_z} hint={Number.isFinite(zNum) ? `About a ${formatPct(serviceLevel(zNum), 1)} chance of not running out during lead time.` : undefined} />
                <TextField label="Usage window" type="number" inputMode="numeric" min="7" step="1" value={form.usage_window_days} suffix="days" onChange={(e) => set('usage_window_days', e.target.value)} error={errors.usage_window_days} hint="How many past days of sales set average daily usage." />
                <TextField label="Review period" type="number" inputMode="numeric" min="1" step="1" value={form.review_period_days} suffix="days" onChange={(e) => set('review_period_days', e.target.value)} error={errors.review_period_days} hint="Days between periodic reviews." />
                <div className="gz-stack gz-stack--sm">
                  <Checkbox label="Use actual lead time" checked={form.use_actual_lead_time} onChange={(e) => set('use_actual_lead_time', e.target.checked)} />
                  <p className="text-body-sm ins-note">Plan with the lead time suppliers really deliver in, instead of the lead time on the item.</p>
                </div>
              </div>
            </Card>
            <Card title="Baking and freshness">
              <div className="gz-form-grid">
                <TextField label="Bake buffer" type="number" inputMode="decimal" min="0" step="0.5" value={form.bake_buffer_pct} suffix="%" onChange={(e) => set('bake_buffer_pct', e.target.value)} error={errors.bake_buffer_pct} hint="Extra baked above the forecast in each new bake plan." />
                <TextField label="Day-old markdown" type="number" inputMode="decimal" min="0" step="1" value={form.day_old_markdown_pct} suffix="%" onChange={(e) => set('day_old_markdown_pct', e.target.value)} error={errors.day_old_markdown_pct} hint="Price cut on yesterday's donuts at the register." />
              </div>
            </Card>
            <Card title="Supplier scorecard" subtitle="The score is 100 times the weighted on-time rate, fill rate and lead time score.">
              <div className="gz-form-grid">
                <TextField label="On-time weight" type="number" inputMode="decimal" min="0" step="1" value={form.w_ontime} suffix="%" onChange={(e) => set('w_ontime', e.target.value)} error={errors.w_ontime} />
                <TextField label="Fill rate weight" type="number" inputMode="decimal" min="0" step="1" value={form.w_fill} suffix="%" onChange={(e) => set('w_fill', e.target.value)} error={errors.w_fill} />
                <TextField label="Lead time weight" type="number" inputMode="decimal" min="0" step="1" value={form.w_lead} suffix="%" onChange={(e) => set('w_lead', e.target.value)} error={errors.w_lead} hint={errors.weights ? undefined : 'The three weights must add up to 100%.'} />
                <div />
                <TextField label="Keep threshold" type="number" inputMode="decimal" min="0" step="1" value={form.keep_threshold} suffix="points" onChange={(e) => set('keep_threshold', e.target.value)} error={errors.keep_threshold} hint="Scores at or above this are rated keep." />
                <TextField label="Watch threshold" type="number" inputMode="decimal" min="0" step="1" value={form.watch_threshold} suffix="points" onChange={(e) => set('watch_threshold', e.target.value)} error={errors.watch_threshold} hint="Scores at or above this are watch; below it, replace." />
              </div>
              {errors.weights && <div className="gz-field is-error" style={{ marginTop: 'var(--space-3)' }}><div className="gz-field__error">{errors.weights}</div></div>}
            </Card>
            <Card title="Tax and business" subtitle="Registers charge the tax rate of the location where the sale happens.">
              <div className="gz-form-grid">
                <TextField label="Business name" value={form.business_name} onChange={(e) => set('business_name', e.target.value)} error={errors.business_name} />
                <TextField label="Default tax rate" type="number" inputMode="decimal" min="0" step="0.01" value={form.default_tax_pct} suffix="%" onChange={(e) => set('default_tax_pct', e.target.value)} error={errors.default_tax_pct} hint="Starting rate for a new location." />
                {shops.map((l) => (
                  <TextField
                    key={l.id}
                    label={`${l.name} tax rate`}
                    type="number" inputMode="decimal" min="0" step="0.01" suffix="%"
                    value={locTax[l.id] ?? ''}
                    onChange={(e) => {
                      setLocTax((t) => ({ ...t, [l.id]: e.target.value }));
                      setErrors((er) => ({ ...er, [`tax_${l.id}`]: undefined }));
                    }}
                    error={(errors as Record<string, string | undefined>)[`tax_${l.id}`]}
                    hint="Applies to new sales here. Past receipts keep the rate they were charged."
                  />
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ what changed */

interface ItemDiff {
  item_id: number;
  name: string;
  sku: string;
  eoqBefore: number | null;
  eoqAfter: number | null;
  ropBefore: number;
  ropAfter: number;
  ssBefore: number;
  ssAfter: number;
  sugBefore: number;
  sugAfter: number;
  size: number;
}

interface SupplierDiff {
  supplier_id: number;
  name: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  ratingBefore: string;
  ratingAfter: string;
}

const differs = (a: number | null, b: number | null, eps = 0.05) => (a === null || b === null ? a !== b : Math.abs(a - b) > eps);

function diffItems(before: ReorderAnalysisRow[], after: ReorderAnalysisRow[]): ItemDiff[] {
  const prev = new Map(before.map((r) => [r.item_id, r]));
  const out: ItemDiff[] = [];
  for (const a of after) {
    const b = prev.get(a.item_id);
    if (!b) continue;
    if (differs(a.eoq, b.eoq) || differs(a.rop_calc, b.rop_calc) || differs(a.safety_stock, b.safety_stock) || differs(a.suggested_qty, b.suggested_qty)) {
      const rel = (x: number, y: number) => (y ? Math.abs(x - y) / Math.abs(y) : x ? 1 : 0);
      out.push({
        item_id: a.item_id, name: a.name, sku: a.sku, eoqBefore: b.eoq, eoqAfter: a.eoq, ropBefore: b.rop_calc, ropAfter: a.rop_calc,
        ssBefore: b.safety_stock, ssAfter: a.safety_stock, sugBefore: b.suggested_qty, sugAfter: a.suggested_qty,
        size: Math.max(rel(a.eoq ?? 0, b.eoq ?? 0), rel(a.rop_calc, b.rop_calc), rel(a.safety_stock, b.safety_stock)),
      });
    }
  }
  return out.sort((x, y) => y.size - x.size);
}

function diffSuppliers(before: SupplierScorecardRow[], after: SupplierScorecardRow[]): SupplierDiff[] {
  const prev = new Map(before.map((r) => [r.supplier_id, r]));
  const out: SupplierDiff[] = [];
  for (const a of after) {
    const b = prev.get(a.supplier_id);
    if (!b) continue;
    if (differs(a.score, b.score, 0.005) || a.rating !== b.rating) {
      out.push({ supplier_id: a.supplier_id, name: a.name, scoreBefore: b.score, scoreAfter: a.score, ratingBefore: b.rating, ratingAfter: a.rating });
    }
  }
  return out;
}

const fromTo = (a: number | null, b: number | null, d = 1) => `${formatNumber(a, d)} to ${formatNumber(b, d)}`;

function ImpactCard({ result, changed }: { result: SaveSettingsResult; changed: string[] }) {
  const items = useMemo(() => diffItems(result.before.reorder, result.after.reorder), [result]);
  const suppliers = useMemo(() => diffSuppliers(result.before.scorecard, result.after.scorecard), [result]);
  const reviewChanged = useMemo(() => {
    const prev = new Map(result.before.review.map((r: PeriodicReviewRow) => [r.item_id, r]));
    return result.after.review.filter((a) => {
      const b = prev.get(a.item_id);
      return b && differs(a.order_up_to_level, b.order_up_to_level);
    }).length;
  }, [result]);
  const eoqChanged = items.filter((i) => differs(i.eoqBefore, i.eoqAfter)).length;
  const ropChanged = items.filter((i) => differs(i.ropBefore, i.ropAfter)).length;
  const belowBefore = result.before.reorder.filter((r) => r.below_rop).length;
  const belowAfter = result.after.reorder.filter((r) => r.below_rop).length;

  const itemCols: DataTableColumn<ItemDiff>[] = [
    { key: 'name', header: 'Item', render: (r) => <>{r.name} <span className="gz-mono gz-muted">{r.sku}</span></> },
    { key: 'eoq', header: 'EOQ', align: 'right', render: (r) => fromTo(r.eoqBefore, r.eoqAfter) },
    { key: 'ss', header: 'Safety stock', align: 'right', render: (r) => fromTo(r.ssBefore, r.ssAfter) },
    { key: 'rop', header: 'Reorder point', align: 'right', render: (r) => fromTo(r.ropBefore, r.ropAfter) },
    { key: 'sug', header: 'Suggested order', align: 'right', render: (r) => fromTo(r.sugBefore, r.sugAfter, 0) },
  ];
  const supCols: DataTableColumn<SupplierDiff>[] = [
    { key: 'name', header: 'Supplier' },
    { key: 'score', header: 'Score', align: 'right', render: (r) => fromTo(r.scoreBefore, r.scoreAfter) },
    { key: 'rating', header: 'Rating', render: (r) => (r.ratingBefore === r.ratingAfter ? <StatusBadge status={r.ratingAfter} /> : <span className="gz-row"><StatusBadge status={r.ratingBefore} /> to <StatusBadge status={r.ratingAfter} /></span>) },
  ];

  return (
    <Card title="What this changed" subtitle={`Saved: ${changed.length ? changed.join(', ') : 'no changes'}.`} actions={<Badge tone="success">Recalculated</Badge>}>
      <div className="gz-stack gz-stack--sm">
        <p className="text-body">
          {`${formatNumber(eoqChanged)} order ${eoqChanged === 1 ? 'quantity' : 'quantities'} (EOQ), ${formatNumber(ropChanged)} reorder ${ropChanged === 1 ? 'point' : 'points'}, ${formatNumber(reviewChanged)} periodic review ${reviewChanged === 1 ? 'level' : 'levels'} and ${formatNumber(suppliers.length)} supplier ${suppliers.length === 1 ? 'score' : 'scores'} moved. Items at or below reorder point: ${formatNumber(belowBefore)} before, ${formatNumber(belowAfter)} now.`}
        </p>
        {items.length > 0 && (
          <>
            <h3 className="text-h3">Order quantities and reorder points</h3>
            <DataTable columns={itemCols} rows={items.slice(0, 12)} rowKey="item_id" density="compact" aria-label="Items that changed" />
            {items.length > 12 && <p className="text-body-sm ins-note">{`Showing the 12 biggest moves of ${formatNumber(items.length)}.`}</p>}
          </>
        )}
        {suppliers.length > 0 && (
          <>
            <h3 className="text-h3">Supplier scores</h3>
            <DataTable columns={supCols} rows={suppliers} rowKey="supplier_id" density="compact" aria-label="Suppliers that changed" />
          </>
        )}
        {items.length === 0 && suppliers.length === 0 && reviewChanged === 0 && (
          <p className="text-body-sm ins-note">None of the saved settings feed reorder points or supplier scores, so those numbers stayed the same.</p>
        )}
      </div>
    </Card>
  );
}

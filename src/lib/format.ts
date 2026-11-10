/**
 * Formatters for the Glazed voice (see design-system/DESIGN_SYSTEM.md, "Content and voice").
 * Money $342.75, dates Nov 9, 2026, times 9:00 AM, quantities "14 dozen".
 * Business dates and times always use America/Denver, never the browser zone.
 */

export const BUSINESS_TZ = 'America/Denver';
const LOCALE = 'en-US';
const EMPTY = '—';

type DateInput = Date | string | number | null | undefined;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Turns a Date, ISO timestamp or `YYYY-MM-DD` business date into a Date. Returns null when invalid. */
function toDate(value: DateInput): { date: Date; dateOnly: boolean } | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    // A business date has no time zone. Pin it to UTC midnight and format it in UTC so it never shifts a day.
    return { date: new Date(`${value}T00:00:00Z`), dateOnly: true };
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : { date, dateOnly: false };
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function dtf(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, options);
    fmtCache.set(key, f);
  }
  return f;
}

/** Nov 9, 2026 */
export function formatDate(value: DateInput): string {
  const d = toDate(value);
  if (!d) return EMPTY;
  const tz = d.dateOnly ? 'UTC' : BUSINESS_TZ;
  return dtf(`date-${tz}`, { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric' }).format(d.date);
}

/** Mon, Nov 9 */
export function formatWeekday(value: DateInput): string {
  const d = toDate(value);
  if (!d) return EMPTY;
  const tz = d.dateOnly ? 'UTC' : BUSINESS_TZ;
  return dtf(`wd-${tz}`, { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(d.date);
}

/** 9:00 AM (timestamps only; a date-only value has no time) */
export function formatTime(value: DateInput): string {
  const d = toDate(value);
  if (!d || d.dateOnly) return EMPTY;
  return dtf('time', { timeZone: BUSINESS_TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(d.date);
}

/** Nov 9, 2026, 9:00 AM */
export function formatDateTime(value: DateInput): string {
  const d = toDate(value);
  if (!d) return EMPTY;
  if (d.dateOnly) return formatDate(value);
  return `${formatDate(value)}, ${formatTime(value)}`;
}

/** "5 min ago", "2 hr ago", then falls back to the date. */
export function formatRelative(value: DateInput, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return EMPTY;
  const seconds = Math.round((now.getTime() - d.date.getTime()) / 1000);
  if (seconds < 45) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return formatDate(value);
}

const moneyFmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyCompactFmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const unitCostFmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });

function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** $342.75 (two decimals). Postgres numeric columns arrive as strings; both work. */
export function formatMoney(value: number | string | null | undefined, opts: { compact?: boolean } = {}): string {
  const n = num(value);
  if (n === null) return EMPTY;
  return opts.compact ? moneyCompactFmt.format(n) : moneyFmt.format(n);
}

/** Unit costs keep up to four decimals ($0.2917) but never fewer than two. */
export function formatUnitCost(value: number | string | null | undefined): string {
  const n = num(value);
  return n === null ? EMPTY : unitCostFmt.format(n);
}

/** 12,480 or 12,480.5 when `decimals` is set. */
export function formatNumber(value: number | string | null | undefined, decimals = 0): string {
  const n = num(value);
  if (n === null) return EMPTY;
  return n.toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** 12.4%. Pass a fraction (0.124) by default, or `{ scale: 'percent' }` when the value is already 12.4. */
export function formatPct(value: number | string | null | undefined, decimals = 1, opts: { scale?: 'fraction' | 'percent' } = {}): string {
  const n = num(value);
  if (n === null) return EMPTY;
  const pct = opts.scale === 'percent' ? n : n * 100;
  return `${pct.toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}

export type Uom = 'each' | 'lb' | 'gal' | (string & {});

export interface QtyOptions {
  /** Show whole dozens as "14 dozen". Defaults to true for uom "each". Pass false for items that are not donuts. */
  dozens?: boolean;
}

/**
 * Quantity in the unit the shop uses.
 * 168 each -> "14 dozen"; 6 each -> "6"; 12.5 lb -> "12.5 lb"; 3 gal -> "3 gal".
 */
export function formatQty(qty: number | string | null | undefined, uom: Uom = 'each', opts: QtyOptions = {}): string {
  const n = num(qty);
  if (n === null) return EMPTY;
  const dozens = opts.dozens ?? uom === 'each';
  if (uom === 'each') {
    if (dozens && n !== 0 && Number.isInteger(n) && n % 12 === 0) return `${formatNumber(n / 12)} dozen`;
    return formatNumber(n, Number.isInteger(n) ? 0 : 2);
  }
  const text = formatNumber(n, Number.isInteger(n) ? 0 : 2);
  return `${text} ${uom}`;
}

/** Like formatQty, but only finished goods (donuts) read in dozens. */
export function formatItemQty(qty: number | string | null | undefined, item: { uom?: string | null; item_type?: string | null }): string {
  return formatQty(qty, item.uom ?? 'each', { dozens: item.item_type === 'finished' });
}

/** Document numbers such as ORD-00481 render in mono; this normalizes the text. */
export function docNo(value: string | null | undefined): string {
  return value ? value.toUpperCase() : EMPTY;
}

/** "ava thompson" -> "AT" */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** "in_progress" -> "In progress" */
export function sentenceCase(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Business-date helpers (America/Denver)                              */
/* ------------------------------------------------------------------ */

const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Today's business date as `YYYY-MM-DD` in America/Denver. */
export function businessDate(at: Date | string | number = new Date()): string {
  const d = at instanceof Date ? at : new Date(at);
  return ymdFmt.format(d);
}

/** Adds whole days to a `YYYY-MM-DD` business date. */
export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday, for a `YYYY-MM-DD` business date. */
export function weekdayIndex(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

/** Monday of the week containing `ymd`. */
export function startOfWeek(ymd: string): string {
  const idx = weekdayIndex(ymd);
  return addDays(ymd, idx === 0 ? -6 : 1 - idx);
}

/** `YYYY-MM-DD` dates from `from` to `to`, inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The business date and 24h time parts for "now" in Denver (for date-time inputs). */
export function businessNowParts(at: Date = new Date()): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { date: businessDate(at), hour: get('hour'), minute: get('minute') };
}

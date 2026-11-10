// Calendar-date helpers. A "date" is always a YYYY-MM-DD string in the business time zone (America/Denver).

export const TZ = 'America/Denver';

export function dayNum(d: string): number {
  const [y, m, dd] = d.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, dd) / 86400000);
}
export function fromDayNum(n: number): string {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}
export function addDays(d: string, n: number): string {
  return fromDayNum(dayNum(d) + n);
}
export function diffDays(a: string, b: string): number {
  return dayNum(a) - dayNum(b);
}
/** 0 = Sunday ... 6 = Saturday */
export function dow(d: string): number {
  return (dayNum(d) + 4) % 7;
}
export function md(d: string): string {
  return d.slice(5);
}
export function year(d: string): number {
  return Number(d.slice(0, 4));
}
export function month(d: string): number {
  return Number(d.slice(5, 7));
}
export function dayOfMonth(d: string): number {
  return Number(d.slice(8, 10));
}
export function monthsBetween(a: string, b: string): number {
  return diffDays(b, a) / 30.4375;
}
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const off = (weekday - dow(first) + 7) % 7;
  return addDays(first, off + 7 * (n - 1));
}
export function range(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; diffDays(to, d) >= 0; d = addDays(d, 1)) out.push(d);
  return out;
}
export function todayDenver(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function yesterdayDenver(now = new Date()): string {
  return addDays(todayDenver(now), -1);
}
/** Postgres-parsable timestamptz literal for a Denver wall-clock time (no JS time-zone math needed). */
export function ts(date: string, minute: number): string {
  const h = Math.floor(minute / 60);
  const m = Math.floor(minute % 60);
  return `${date} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00 ${TZ}`;
}
/** True when md falls in [start, end] (handles windows that wrap the new year). */
export function inWindow(mdStr: string, start: string, end: string): boolean {
  return start <= end ? mdStr >= start && mdStr <= end : mdStr >= start || mdStr <= end;
}
export function fmtMoney(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

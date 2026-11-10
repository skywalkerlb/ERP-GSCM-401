import { BUSINESS_TZ } from '@/lib/format';

const dtfCache = new Map<number, Intl.DateTimeFormat>();
function zoneFormatter(): Intl.DateTimeFormat {
  let f = dtfCache.get(0);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    dtfCache.set(0, f);
  }
  return f;
}

/** Milliseconds the business zone is ahead of UTC at instant `t` (negative for Denver). */
function offsetMs(t: number): number {
  const parts = zoneFormatter().formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(t / 1000) * 1000;
}

/**
 * A business-zone wall clock time as an ISO timestamp.
 * `zonedIso('2026-11-10', '09:30')` is 9:30 AM in Denver, whatever zone the browser is in.
 */
export function zonedIso(ymd: string, hhmm: string): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const [hh, mm] = hhmm.split(':').map(Number) as [number, number];
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wall - offsetMs(wall);
  guess = wall - offsetMs(guess);
  return new Date(guess).toISOString();
}

/** Wall clock date and time (`YYYY-MM-DD`, `HH:MM`) in the business zone for an ISO timestamp. */
export function zonedParts(iso: string | Date): { date: string; time: string } {
  const parts = zoneFormatter().formatToParts(typeof iso === 'string' ? new Date(iso) : iso);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/** "06:00:00" -> minutes after midnight. */
export function minutesOf(time: string | null | undefined, fallback: number): number {
  if (!time) return fallback;
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** "HH:MM" slots from `open` to `close` (inclusive of open, exclusive of close), every `step` minutes. */
export function timeSlots(open: string | null | undefined, close: string | null | undefined, step = 30): string[] {
  const from = minutesOf(open, 6 * 60);
  const to = minutesOf(close, 18 * 60);
  const out: string[] = [];
  for (let m = from; m < to; m += step) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return out;
}

/** "09:30" -> "9:30 AM" */
export function slotLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

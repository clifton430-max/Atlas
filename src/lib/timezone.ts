/**
 * Minimal IANA-timezone helpers built on Intl (no external tz database).
 */

/** Offset (ms) of `timeZone` from UTC at instant `utcMs`. */
export function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Convert a local wall-clock date/time in `timeZone` to a UTC ISO string. */
export function zonedLocalToUtcIso(date: string, time: string, timeZone: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let utc = guess - zoneOffsetMs(guess, timeZone);
  // Second pass handles DST transitions between guess and result.
  utc = guess - zoneOffsetMs(utc, timeZone);
  return new Date(utc).toISOString();
}

/** Today's date (YYYY-MM-DD) in `timeZone`, offset by `days`. */
export function localDateIn(timeZone: string, days = 0, now = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = fmt.format(now); // en-CA -> YYYY-MM-DD
  const [y, m, d] = today.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

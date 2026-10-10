/**
 * Display formatting for event data. Times are always rendered in the event's
 * own timezone (with the zone named) so "8:00 PM" means local venue time.
 * Unknown values render as explicit "unknown" text, never as defaults.
 */
import type { AtlasEvent } from './types';

export function formatPriceRange(e: Pick<AtlasEvent, 'priceMin' | 'priceMax' | 'currency'>): string {
  if (e.priceMin == null && e.priceMax == null) return 'Price unknown';
  const fmt = (n: number) => {
    if (!e.currency) return n.toFixed(2);
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: e.currency }).format(n);
    } catch {
      return `${n.toFixed(2)} ${e.currency}`;
    }
  };
  if (e.priceMin != null && e.priceMax != null && e.priceMax !== e.priceMin) {
    return `${fmt(e.priceMin)} – ${fmt(e.priceMax)}`;
  }
  return fmt((e.priceMin ?? e.priceMax)!);
}

/** Format an instant in an IANA zone, e.g. "Sat, Oct 10, 8:00 PM EDT". */
export function formatInstant(iso: string | null, timeZone: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      timeZone: timeZone ?? undefined, timeZoneName: 'short',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/** Format the event start, falling back to provider local date/time when no instant exists. */
export function formatEventStart(e: AtlasEvent): string {
  const instant = formatInstant(e.startsAt, e.timezone);
  if (instant) return instant;
  if (e.startLocalDate) {
    const date = new Date(`${e.startLocalDate}T00:00:00`);
    const dateText = Number.isNaN(date.getTime())
      ? e.startLocalDate
      : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return e.startLocalTime
      ? `${dateText}, ${formatLocalTime(e.startLocalTime)} (local)`
      : `${dateText} (time unknown)`;
  }
  return 'Start time unknown';
}

/** "20:30:00" -> "8:30 PM" without any timezone conversion (wall-clock time). */
export function formatLocalTime(t: string | null): string {
  if (!t) return 'Unknown';
  const [h, m] = t.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 'Unknown';
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatRelative(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return d.toLocaleDateString();
}

export function eventLocationLine(e: AtlasEvent): string {
  return [e.venueName, e.address, e.city, e.region].filter(Boolean).join(', ') || 'Location unknown';
}

/**
 * Discover filter logic (pure functions, unit-tested in tests/unit/filters.test.ts).
 *
 * Composition: category AND price AND date AND event-time AND venue-hours.
 * Within a dimension, selections are OR'ed (e.g. two price bands).
 *
 * Unknown-value policy (documented in README "Filters"):
 *   - No filter active in a dimension  -> events with unknown values are shown.
 *   - Filter active, value unknown      -> event is EXCLUDED, unless the matching
 *     "include unknown" option is explicitly on. We never claim an event matches
 *     a filter when the data needed to decide is missing.
 *   - Unknown price is never treated as free.
 *
 * Price bands are non-overlapping and use the MINIMUM verified price:
 *   $0–$5, >$5–$10, >$10–$30, >$30.
 *   (Currency is not converted; bands apply to the event's own currency amount.)
 *
 * Times are evaluated in the event's own timezone. Time windows may cross
 * midnight (e.g. 22:00–02:00). Event-time windows are inclusive at both ends.
 * Venue hours match when the venue's open interval [open, close) overlaps the
 * selected window at any point; open == close is treated as open 24 hours.
 */
import type { AtlasEvent } from '@/lib/types';

export type PriceBand = 'p0_5' | 'p5_10' | 'p10_30' | 'p30_plus';

export const PRICE_BANDS: { id: PriceBand; label: string }[] = [
  { id: 'p0_5', label: '$0 – $5' },
  { id: 'p5_10', label: 'Over $5 – $10' },
  { id: 'p10_30', label: 'Over $10 – $30' },
  { id: 'p30_plus', label: 'Over $30' },
];

export interface TimeWindow {
  /** "HH:MM" 24-hour local time */
  from: string;
  /** "HH:MM" 24-hour local time; may be earlier than `from` (crosses midnight) */
  to: string;
}

export interface DiscoverFilters {
  categories: string[];
  priceBands: PriceBand[];
  includeUnknownPrice: boolean;
  /** Inclusive local-date range "YYYY-MM-DD" (either bound optional). */
  dateFrom: string | null;
  dateTo: string | null;
  /** Window for the event's local START time. */
  eventTime: TimeWindow | null;
  /** Window during which the venue must be open. */
  venueHours: TimeWindow | null;
  /** Include events whose date/time/venue-hours are unknown when those filters are active. */
  includeUnknownTime: boolean;
}

export const EMPTY_FILTERS: DiscoverFilters = {
  categories: [],
  priceBands: [],
  includeUnknownPrice: false,
  dateFrom: null,
  dateTo: null,
  eventTime: null,
  venueHours: null,
  includeUnknownTime: false,
};

export function activeFilterCount(f: DiscoverFilters): number {
  return (
    (f.categories.length ? 1 : 0) +
    (f.priceBands.length ? 1 : 0) +
    (f.dateFrom || f.dateTo ? 1 : 0) +
    (f.eventTime ? 1 : 0) +
    (f.venueHours ? 1 : 0)
  );
}

// ---------------------------------------------------------------------------
// Price
// ---------------------------------------------------------------------------
export function priceBandOf(minPrice: number | null): PriceBand | null {
  if (minPrice == null || !Number.isFinite(minPrice) || minPrice < 0) return null;
  if (minPrice <= 5) return 'p0_5';
  if (minPrice <= 10) return 'p5_10';
  if (minPrice <= 30) return 'p10_30';
  return 'p30_plus';
}

/** Minimum verified price; if only a max is known we still cannot verify the minimum. */
export function verifiedMinPrice(e: Pick<AtlasEvent, 'priceMin'>): number | null {
  return e.priceMin;
}

export function matchesPrice(e: AtlasEvent, f: DiscoverFilters): boolean {
  if (f.priceBands.length === 0) return true;
  const band = priceBandOf(verifiedMinPrice(e));
  if (band == null) return f.includeUnknownPrice;
  return f.priceBands.includes(band);
}

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------
export function matchesCategory(e: AtlasEvent, f: DiscoverFilters): boolean {
  if (f.categories.length === 0) return true;
  return e.category != null && f.categories.includes(e.category);
}

// ---------------------------------------------------------------------------
// Local date / time helpers
// ---------------------------------------------------------------------------

/** "HH:MM[:SS]" -> minutes since midnight, or null if malformed. */
export function parseTimeOfDay(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

/**
 * Local wall-clock {date, minutes} of an event's start in its own timezone.
 * Prefers provider-supplied local values; otherwise converts the instant using
 * the event timezone. Without a timezone we cannot know local time -> null.
 */
export function localStart(e: AtlasEvent): { date: string | null; minutes: number | null } {
  let date = e.startLocalDate;
  let minutes = parseTimeOfDay(e.startLocalTime);
  if ((date == null || minutes == null) && e.startsAt && e.timezone) {
    const d = new Date(e.startsAt);
    if (!Number.isNaN(d.getTime())) {
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: e.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(d);
        const get = (type: string) => parts.find((p) => p.type === type)?.value;
        date ??= `${get('year')}-${get('month')}-${get('day')}`;
        minutes ??= Number(get('hour')) * 60 + Number(get('minute'));
      } catch {
        /* invalid timezone -> stays unknown */
      }
    }
  }
  return { date, minutes };
}

/** Inclusive membership test for a window that may cross midnight. */
export function minuteInWindow(minute: number, w: TimeWindow): boolean {
  const from = parseTimeOfDay(w.from);
  const to = parseTimeOfDay(w.to);
  if (from == null || to == null) return true; // malformed window = no constraint
  if (from <= to) return minute >= from && minute <= to;
  return minute >= from || minute <= to;
}

/** Split a circular [start, end) interval (minutes) into linear segments on [0, 1440). */
function segments(start: number, end: number): [number, number][] {
  const s = start % 1440;
  const e = end % 1440;
  if (s === e) return [[0, 1440]]; // full day
  if (s < e) return [[s, e]];
  return [[s, 1440], [0, e]];
}

/**
 * Does the venue's open interval [open, close) overlap the inclusive window
 * [from, to]? Both may cross midnight.
 */
export function venueOpenDuring(open: number, close: number, w: TimeWindow): boolean {
  const from = parseTimeOfDay(w.from);
  const to = parseTimeOfDay(w.to);
  if (from == null || to == null) return true;
  const windowSegs = segments(from, (to + 1) % 1440 === from ? from : to + 1); // inclusive end
  const venueSegs = segments(open, close);
  return windowSegs.some(([a1, a2]) => venueSegs.some(([b1, b2]) => a1 < b2 && b1 < a2));
}

export function matchesDate(e: AtlasEvent, f: DiscoverFilters): boolean {
  if (!f.dateFrom && !f.dateTo) return true;
  const { date } = localStart(e);
  if (!date) return f.includeUnknownTime;
  if (f.dateFrom && date < f.dateFrom) return false;
  if (f.dateTo && date > f.dateTo) return false;
  return true;
}

export function matchesEventTime(e: AtlasEvent, f: DiscoverFilters): boolean {
  if (!f.eventTime) return true;
  const { minutes } = localStart(e);
  if (minutes == null) return f.includeUnknownTime;
  return minuteInWindow(minutes, f.eventTime);
}

export function matchesVenueHours(e: AtlasEvent, f: DiscoverFilters): boolean {
  if (!f.venueHours) return true;
  const open = parseTimeOfDay(e.venueOpenTime);
  const close = parseTimeOfDay(e.venueCloseTime);
  if (open == null || close == null) return f.includeUnknownTime;
  return venueOpenDuring(open, close, f.venueHours);
}

/** Apply every Discover filter (AND across dimensions). */
export function applyDiscoverFilters(events: AtlasEvent[], f: DiscoverFilters): AtlasEvent[] {
  return events.filter(
    (e) =>
      matchesCategory(e, f) &&
      matchesPrice(e, f) &&
      matchesDate(e, f) &&
      matchesEventTime(e, f) &&
      matchesVenueHours(e, f),
  );
}

/** Distinct, sorted categories present in the loaded events. */
export function categoriesOf(events: AtlasEvent[]): string[] {
  return [...new Set(events.map((e) => e.category).filter((c): c is string => !!c))].sort();
}

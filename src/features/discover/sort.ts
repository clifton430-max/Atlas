/**
 * Sorting for the Discover lists (pure; unit-tested). Sorting changes only the
 * order of the lists — never which items are shown on the map.
 *
 *   soonest  events by start time (unknown last); places keep prominence order
 *   nearest  straight-line distance from the shared location (needs location)
 *   price    events by lowest verified price (unknown last; never treated as free)
 *   name     A–Z
 */
import type { AtlasEvent } from '@/lib/types';
import { haversineMeters } from '@/features/places/geo';

export type DiscoverSort = 'soonest' | 'nearest' | 'price' | 'name';
export const SORT_OPTIONS: { id: DiscoverSort; label: string }[] = [
  { id: 'soonest', label: 'Soonest' },
  { id: 'nearest', label: 'Nearest' },
  { id: 'price', label: 'Lowest price' },
  { id: 'name', label: 'Name (A–Z)' },
];

type Loc = { latitude: number; longitude: number } | null;
const last = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? Number.POSITIVE_INFINITY : n);
const dist = (from: Loc, p: { latitude: number | null; longitude: number | null }) =>
  from && p.latitude != null && p.longitude != null ? haversineMeters(from, { latitude: p.latitude, longitude: p.longitude }) : null;

export function sortEvents(events: AtlasEvent[], sort: DiscoverSort, from: Loc): AtlasEvent[] {
  const time = (e: AtlasEvent) => last(e.startsAt ? Date.parse(e.startsAt) : null);
  const byName = (a: AtlasEvent, b: AtlasEvent) => a.name.localeCompare(b.name);
  const cmp: Record<DiscoverSort, (a: AtlasEvent, b: AtlasEvent) => number> = {
    soonest: (a, b) => time(a) - time(b) || byName(a, b),
    nearest: (a, b) => last(dist(from, a)) - last(dist(from, b)) || time(a) - time(b),
    price: (a, b) => last(a.priceMin) - last(b.priceMin) || time(a) - time(b),
    name: byName,
  };
  // Without a location "nearest" can't be computed; keep the default order.
  const key = sort === 'nearest' && !from ? 'soonest' : sort;
  return [...events].sort(cmp[key]);
}

/** Places arrive in prominence order (OSM rank); only name/nearest reorder them. */
export function sortPlaces<P extends { name: string; latitude: number; longitude: number }>(places: P[], sort: DiscoverSort, from: Loc): P[] {
  if (sort === 'name') return [...places].sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'nearest' && from) return [...places].sort((a, b) => last(dist(from, a)) - last(dist(from, b)));
  return places;
}

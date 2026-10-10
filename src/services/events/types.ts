/**
 * Event provider abstraction. UI code depends only on this interface, never
 * on Ticketmaster directly, so providers can be swapped or combined.
 */
import type { AtlasEvent } from '@/lib/types';

export interface BBox { west: number; south: number; east: number; north: number }

export interface EventSearchQuery {
  bbox: BBox;
  keyword?: string;
  category?: string;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * Where results came from. The UI labels anything other than 'live' so
 * development or cached data is never mistaken for a fresh live listing.
 */
export type EventDataSource = 'live' | 'database' | 'dev-fixture';

export interface EventSearchResult {
  events: AtlasEvent[];
  source: EventDataSource;
  /** Human-readable explanation when not live (e.g. provider not configured). */
  notice?: string;
}

export interface EventProvider {
  readonly id: string;
  search(query: EventSearchQuery, signal?: AbortSignal): Promise<EventSearchResult>;
  getById(id: string): Promise<AtlasEvent | null>;
}

/** Normalize a MapLibre bounds box: clamp to valid ranges and unwrap world copies. */
export function normalizeBBox(b: BBox): BBox {
  const south = Math.max(-90, Math.min(90, b.south));
  const north = Math.max(-90, Math.min(90, b.north));
  let { west, east } = b;
  if (east - west >= 360 || west < -180 || east > 180) {
    if (east - west >= 360) {
      west = -180;
      east = 180;
    } else {
      // Viewport crosses the antimeridian or a world copy; fall back to full longitude span.
      const wrap = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
      west = wrap(west);
      east = wrap(east);
      if (west > east) {
        west = -180;
        east = 180;
      }
    }
  }
  return { west, south, east, north };
}

export function inBBox(e: { latitude: number | null; longitude: number | null }, b: BBox): boolean {
  return e.latitude != null && e.longitude != null &&
    e.latitude >= b.south && e.latitude <= b.north &&
    e.longitude >= b.west && e.longitude <= b.east;
}

export function matchesKeyword(e: AtlasEvent, keyword: string | undefined): boolean {
  const k = keyword?.trim().toLowerCase();
  if (!k) return true;
  return [e.name, e.venueName, e.city, e.category, e.genre, e.address]
    .some((v) => v?.toLowerCase().includes(k));
}

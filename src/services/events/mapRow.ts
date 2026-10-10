/** Map a public.events row (snake_case) to the AtlasEvent domain type. */
import type { AtlasEvent } from '@/lib/types';

export type EventRow = Record<string, unknown>;

const s = (v: unknown) => (typeof v === 'string' ? v : null);
const n = (v: unknown) => {
  if (v == null) return null;
  const x = typeof v === 'string' ? Number(v) : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
};

export function eventFromRow(r: EventRow): AtlasEvent {
  return {
    id: String(r.id),
    provider: String(r.provider),
    externalId: String(r.external_id),
    name: String(r.name),
    description: s(r.description),
    imageUrl: s(r.image_url),
    category: s(r.category),
    genre: s(r.genre),
    venueName: s(r.venue_name),
    address: s(r.address),
    city: s(r.city),
    region: s(r.region),
    country: s(r.country),
    latitude: n(r.latitude),
    longitude: n(r.longitude),
    startsAt: s(r.starts_at),
    endsAt: s(r.ends_at),
    startLocalDate: s(r.start_local_date),
    startLocalTime: s(r.start_local_time),
    timezone: s(r.timezone),
    venueOpenTime: s(r.venue_open_time),
    venueCloseTime: s(r.venue_close_time),
    priceMin: n(r.price_min),
    priceMax: n(r.price_max),
    currency: s(r.currency),
    ticketUrl: s(r.ticket_url),
    sourceUrl: s(r.source_url),
    sourceName: s(r.source_name),
    status: s(r.status),
    isDevFixture: r.is_dev_fixture === true,
    lastCheckedAt: s(r.last_checked_at),
  };
}

export const EVENT_COLUMNS =
  'id, provider, external_id, name, description, image_url, category, genre, venue_name, address, city, region, country, latitude, longitude, starts_at, ends_at, start_local_date, start_local_time, timezone, venue_open_time, venue_close_time, price_min, price_max, currency, ticket_url, source_url, source_name, status, is_dev_fixture, last_checked_at';

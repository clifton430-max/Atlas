/**
 * Ticketmaster Discovery API v2 -> Atlas normalized event rows.
 *
 * Pure TypeScript with no Deno/browser APIs so it can be imported by both the
 * `discover-events` Edge Function and the Vitest unit tests.
 *
 * Honesty rules applied here:
 *   - Missing or invalid values become null; nothing is inferred or defaulted.
 *   - Venue opening/closing hours: Ticketmaster only exposes free-text box-office
 *     notes (boxOfficeInfo.openHoursDetail), which are NOT parsed — the fields
 *     stay null rather than guessing.
 *   - Event end is only set when Ticketmaster provides one; never derived from start.
 *   - Coordinates must parse to valid lat/lng or the event is stored unmapped.
 *   - Prices come from priceRanges only; absent -> null (unknown, not free).
 *   - URLs must be https.
 */

export const TICKETMASTER_PROVIDER = 'ticketmaster';
export const TICKETMASTER_BASE_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

/** Column shape of public.events used for upserts (snake_case). */
export interface EventRowInput {
  provider: string;
  external_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string | null;
  genre: string | null;
  venue_name: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  starts_at: string | null;
  ends_at: string | null;
  start_local_date: string | null;
  start_local_time: string | null;
  timezone: string | null;
  venue_open_time: string | null;
  venue_close_time: string | null;
  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  ticket_url: string | null;
  source_url: string | null;
  source_name: string | null;
  status: string | null;
  is_dev_fixture: boolean;
  last_checked_at: string;
}

/* Minimal structural types for the parts of the TM payload we read. */
interface TmImage { url?: string; width?: number; height?: number; ratio?: string }
interface TmClassification { segment?: { name?: string }; genre?: { name?: string } }
interface TmVenue {
  name?: string;
  address?: { line1?: string };
  city?: { name?: string };
  state?: { stateCode?: string; name?: string };
  country?: { countryCode?: string };
  postalCode?: string;
  location?: { latitude?: string | number; longitude?: string | number };
  timezone?: string;
}
interface TmDateParts { localDate?: string; localTime?: string; dateTime?: string; dateTBD?: boolean; timeTBA?: boolean; noSpecificTime?: boolean }
export interface TmEvent {
  id?: string;
  name?: string;
  url?: string;
  info?: string;
  description?: string;
  pleaseNote?: string;
  images?: TmImage[];
  classifications?: TmClassification[];
  dates?: { start?: TmDateParts; end?: TmDateParts; timezone?: string; status?: { code?: string } };
  priceRanges?: { min?: number; max?: number; currency?: string }[];
  _embedded?: { venues?: TmVenue[] };
}

const str = (v: unknown, max = 2000): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
};

const meaningful = (v: unknown): string | null => {
  const s = str(v, 120);
  return s && s.toLowerCase() !== 'undefined' ? s : null;
};

export function httpsUrl(v: unknown): string | null {
  const s = str(v, 2000);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const isoInstant = (v: unknown): string | null => {
  const s = str(v, 64);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const localDate = (v: unknown): string | null => {
  const s = str(v, 10);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const localTime = (v: unknown): string | null => {
  const s = str(v, 8);
  return s && /^\d{2}:\d{2}(:\d{2})?$/.test(s) ? s : null;
};

function pickImage(images: TmImage[] | undefined): string | null {
  if (!images?.length) return null;
  const sorted = [...images]
    .filter((i) => httpsUrl(i.url))
    .sort((a, b) => {
      const ra = a.ratio === '16_9' ? 1 : 0;
      const rb = b.ratio === '16_9' ? 1 : 0;
      if (ra !== rb) return rb - ra;
      return (b.width ?? 0) - (a.width ?? 0);
    });
  // Prefer a reasonably sized image (not the multi-megabyte original).
  const sized = sorted.find((i) => (i.width ?? 0) <= 1200) ?? sorted[0];
  return sized ? httpsUrl(sized.url) : null;
}

/** Combine price ranges in a single currency. Mixed currencies -> first currency only. */
function prices(ranges: TmEvent['priceRanges']): { min: number | null; max: number | null; currency: string | null } {
  const valid = (ranges ?? []).filter((r) => num(r.min) != null || num(r.max) != null);
  if (!valid.length) return { min: null, max: null, currency: null };
  const currency = str(valid[0].currency, 3)?.toUpperCase() ?? null;
  const same = valid.filter((r) => (str(r.currency, 3)?.toUpperCase() ?? null) === currency);
  const mins = same.map((r) => num(r.min)).filter((n): n is number => n != null && n >= 0);
  const maxs = same.map((r) => num(r.max)).filter((n): n is number => n != null && n >= 0);
  const min = mins.length ? Math.min(...mins) : null;
  let max = maxs.length ? Math.max(...maxs) : null;
  if (min != null && max != null && max < min) max = min;
  return { min, max, currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null };
}

export function normalizeTicketmasterEvent(raw: TmEvent, checkedAt: string): EventRowInput | null {
  const externalId = str(raw.id, 200);
  const name = str(raw.name, 300);
  if (!externalId || !name) return null;

  const venue = raw._embedded?.venues?.[0];
  let lat = num(venue?.location?.latitude);
  let lng = num(venue?.location?.longitude);
  const validCoords = lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    && !(lat === 0 && lng === 0); // (0,0) is a common "missing" sentinel
  if (!validCoords) {
    lat = null;
    lng = null;
  }

  const start = raw.dates?.start;
  const end = raw.dates?.end;
  const { min, max, currency } = prices(raw.priceRanges);
  const classification = raw.classifications?.[0];
  const ticketUrl = httpsUrl(raw.url);

  let startsAt = start?.dateTBD || start?.timeTBA || start?.noSpecificTime ? null : isoInstant(start?.dateTime);
  let endsAt = end?.noSpecificTime ? null : isoInstant(end?.dateTime);
  if (startsAt && endsAt && endsAt < startsAt) endsAt = null;
  if (start?.dateTBD) startsAt = null;

  return {
    provider: TICKETMASTER_PROVIDER,
    external_id: externalId,
    name,
    description: str(raw.description, 4000) ?? str(raw.info, 4000) ?? null,
    image_url: pickImage(raw.images),
    category: meaningful(classification?.segment?.name),
    genre: meaningful(classification?.genre?.name),
    venue_name: str(venue?.name, 200),
    address: str(venue?.address?.line1, 300),
    city: str(venue?.city?.name, 120),
    region: str(venue?.state?.stateCode, 80) ?? str(venue?.state?.name, 80),
    country: str(venue?.country?.countryCode, 2),
    postal_code: str(venue?.postalCode, 20),
    latitude: lat,
    longitude: lng,
    starts_at: startsAt,
    ends_at: endsAt,
    start_local_date: start?.dateTBD ? null : localDate(start?.localDate),
    start_local_time: start?.timeTBA || start?.noSpecificTime ? null : localTime(start?.localTime),
    timezone: str(raw.dates?.timezone, 64) ?? str(venue?.timezone, 64),
    venue_open_time: null,
    venue_close_time: null,
    price_min: min,
    price_max: max,
    currency,
    ticket_url: ticketUrl,
    source_url: ticketUrl,
    source_name: 'Ticketmaster',
    status: str(raw.dates?.status?.code, 40),
    is_dev_fixture: false,
    last_checked_at: checkedAt,
  };
}

/** Bounding box in degrees. */
export interface BBox { west: number; south: number; east: number; north: number }

export function isValidBBox(b: unknown): b is BBox {
  if (!b || typeof b !== 'object') return false;
  const { west, south, east, north } = b as Record<string, unknown>;
  return [west, south, east, north].every((v) => typeof v === 'number' && Number.isFinite(v))
    && (south as number) >= -90 && (north as number) <= 90 && (south as number) < (north as number)
    && (west as number) >= -180 && (east as number) <= 180;
}

/** Center + radius (km, capped) covering a bounding box, for TM's latlong/radius search. */
export function bboxToRadiusQuery(b: BBox): { lat: number; lng: number; radiusKm: number } {
  const lat = (b.south + b.north) / 2;
  const lng = (b.west + b.east) / 2;
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.north - lat);
  const dLng = toRad(b.east - lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(b.north)) * Math.sin(dLng / 2) ** 2;
  const dist = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  return { lat, lng, radiusKm: Math.max(1, Math.min(300, Math.ceil(dist))) };
}

export interface TicketmasterQuery {
  bbox: BBox;
  keyword?: string | null;
  category?: string | null;
  startDate?: string | null; // YYYY-MM-DD
  endDate?: string | null;
  page?: number;
}

export function buildTicketmasterUrl(apiKey: string, q: TicketmasterQuery): string {
  const { lat, lng, radiusKm } = bboxToRadiusQuery(q.bbox);
  const params = new URLSearchParams({
    apikey: apiKey,
    latlong: `${lat.toFixed(4)},${lng.toFixed(4)}`,
    radius: String(radiusKm),
    unit: 'km',
    size: '100',
    sort: 'date,asc',
    page: String(Math.max(0, Math.min(9, q.page ?? 0))),
  });
  const keyword = q.keyword?.trim();
  if (keyword) params.set('keyword', keyword.slice(0, 100));
  if (q.category?.trim()) params.set('classificationName', q.category.trim().slice(0, 60));
  if (q.startDate && /^\d{4}-\d{2}-\d{2}$/.test(q.startDate)) params.set('startDateTime', `${q.startDate}T00:00:00Z`);
  if (q.endDate && /^\d{4}-\d{2}-\d{2}$/.test(q.endDate)) params.set('endDateTime', `${q.endDate}T23:59:59Z`);
  return `${TICKETMASTER_BASE_URL}?${params.toString()}`;
}

/** Stable cache key: bbox rounded to ~0.05° so tiny pans reuse a recent fetch. */
export function cacheKeyFor(q: TicketmasterQuery): string {
  const r = (n: number) => (Math.round(n * 20) / 20).toFixed(2);
  return [
    r(q.bbox.west), r(q.bbox.south), r(q.bbox.east), r(q.bbox.north),
    (q.keyword ?? '').trim().toLowerCase(), (q.category ?? '').trim().toLowerCase(),
    q.startDate ?? '', q.endDate ?? '', q.page ?? 0,
  ].join('|');
}

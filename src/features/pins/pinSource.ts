/**
 * Source metadata preserved on pins — ONE normalization path for every way a
 * pin is created (Discover place/event, search result, marker, shared copy).
 *
 * `PinSource` is a small, versioned, validated snapshot of what a reliable
 * source said about the place when it was saved (OpenStreetMap tags,
 * Wikimedia Commons image credit, Ticketmaster ids). It is stored separately
 * from everything the user writes (title override, note, groups, appearance,
 * meetups), so editing a pin never erases it.
 *
 * Rules (mirrored by public.pin_source_valid() in the database):
 *   - only the keys below; strings length-limited; no nested arbitrary objects;
 *   - website / image URLs must be https (images only from Wikimedia);
 *   - total size ≤ 4 KB.
 * Unknown values are omitted — never invented.
 */
import { normalizeEmail, normalizeWebsite } from '../../../supabase/functions/_shared/osm';
import type { AtlasEvent } from '@/lib/types';
import { CATEGORY_BY_ID } from '@/features/places/categories';
import type { PlaceDetails } from '@/features/places/placeDetails';
import { osmUrl, parsePlaceRef, type Place } from '@/features/places/types';

export type PinSourceProvider = 'osm' | 'ticketmaster' | 'dev-fixture';
export type Wheelchair = 'yes' | 'limited' | 'no' | 'designated';

export interface PinSourceImage {
  thumbUrl: string;
  sourcePage: string;
  license?: string;
  artist?: string;
}

export interface PinSource {
  v: 1;
  provider: PinSourceProvider;
  /** e.g. "osm:node/123" or the Atlas event id. */
  providerId: string;
  name?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  address?: string;
  /** Verbatim (e.g. OSM opening_hours) — never interpreted. */
  openingHours?: string;
  website?: string;
  phone?: string;
  email?: string;
  wheelchair?: Wheelchair;
  image?: PinSourceImage;
  /** When the snapshot was taken (ISO). */
  capturedAt: string;
}

const LIMITS: Record<string, number> = {
  providerId: 100, name: 200, category: 60, subcategory: 80, description: 1000, address: 300,
  openingHours: 300, website: 500, phone: 40, email: 120, capturedAt: 40,
};
const KEYS = new Set(['v', 'provider', 'image', 'wheelchair', ...Object.keys(LIMITS)]);
const WIKIMEDIA = /^https:\/\/(upload|thumb|commons)\.wikimedia\.org\//;

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim(); // eslint-disable-line no-control-regex
  return s ? s.slice(0, max) : undefined;
};

/** Strict validation/cleanup; returns null when the input isn't a usable source. */
export function sanitizePinSource(input: unknown): PinSource | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  if (o.v !== 1 || !['osm', 'ticketmaster', 'dev-fixture'].includes(o.provider as string)) return null;
  const providerId = str(o.providerId, LIMITS.providerId);
  if (!providerId) return null;
  const out: PinSource = { v: 1, provider: o.provider as PinSourceProvider, providerId, capturedAt: str(o.capturedAt, 40) ?? new Date().toISOString() };
  for (const k of ['name', 'category', 'subcategory', 'description', 'address', 'openingHours', 'phone'] as const) {
    const v = str(o[k], LIMITS[k]);
    if (v) out[k] = v;
  }
  const website = normalizeWebsite(str(o.website, LIMITS.website) ?? null);
  if (website) out.website = website;
  const email = normalizeEmail(str(o.email, LIMITS.email) ?? null);
  if (email) out.email = email;
  if (['yes', 'limited', 'no', 'designated'].includes(o.wheelchair as string)) out.wheelchair = o.wheelchair as Wheelchair;
  const img = o.image as Record<string, unknown> | undefined;
  if (img && typeof img === 'object' && typeof img.thumbUrl === 'string' && WIKIMEDIA.test(img.thumbUrl)
    && typeof img.sourcePage === 'string' && /^https:\/\/commons\.wikimedia\.org\//.test(img.sourcePage)) {
    out.image = { thumbUrl: img.thumbUrl.slice(0, 500), sourcePage: img.sourcePage.slice(0, 500) };
    const license = str(img.license, 60);
    const artist = str(img.artist, 200);
    if (license) out.image.license = license;
    if (artist) out.image.artist = artist;
  }
  // Unknown keys are dropped; the whole thing must stay small.
  for (const k of Object.keys(out)) if (!KEYS.has(k)) delete (out as unknown as Record<string, unknown>)[k];
  return JSON.stringify(out).length <= 4000 ? out : null;
}

/** OSM place (+ verified details when loaded) -> PinSource. */
export function placeToPinSource(place: Place, details?: PlaceDetails | null): PinSource {
  const cat = CATEGORY_BY_ID[place.categoryId];
  return sanitizePinSource({
    v: 1, provider: 'osm', providerId: place.ref, capturedAt: new Date().toISOString(),
    name: details?.name ?? place.name,
    category: cat?.label, subcategory: place.subcategoryLabel,
    description: details?.description, address: details?.address, openingHours: details?.openingHours,
    website: details?.website, phone: details?.phone, email: details?.email, wheelchair: details?.wheelchair ?? undefined,
    image: details?.image ? { thumbUrl: details.image.thumbUrl, sourcePage: details.image.sourcePage, license: details.image.license, artist: details.image.artist } : undefined,
  })!;
}

/** A geocoder (Photon / OSM) search hit -> PinSource, when it identifies an OSM element. */
export function searchResultToPinSource(r: { osmRef: string | null; name: string; detail: string; kind: string | null }, details?: PlaceDetails | null): PinSource | null {
  if (!r.osmRef || !parsePlaceRef(r.osmRef)) return null;
  return sanitizePinSource({
    v: 1, provider: 'osm', providerId: r.osmRef, capturedAt: new Date().toISOString(),
    name: details?.name ?? r.name, subcategory: r.kind?.replace(/_/g, ' '),
    address: details?.address ?? (r.detail || undefined), openingHours: details?.openingHours,
    description: details?.description, website: details?.website, phone: details?.phone, email: details?.email,
    wheelchair: details?.wheelchair ?? undefined,
    image: details?.image ? { thumbUrl: details.image.thumbUrl, sourcePage: details.image.sourcePage, license: details.image.license, artist: details.image.artist } : undefined,
  });
}

/** Event -> PinSource (the official schedule itself stays in public.events). */
export function eventToPinSource(e: AtlasEvent): PinSource {
  return sanitizePinSource({
    v: 1, provider: e.isDevFixture ? 'dev-fixture' : 'ticketmaster', providerId: e.id, capturedAt: new Date().toISOString(),
    name: e.name, category: e.category ?? undefined, subcategory: e.genre ?? undefined,
    description: e.description ?? undefined, address: [e.venueName, e.address, e.city].filter(Boolean).join(', ') || undefined,
    website: e.ticketUrl ?? undefined,
  })!;
}

/** Public page for the source, for "View source" links. */
export function sourceUrl(s: PinSource): string | null {
  const ref = s.provider === 'osm' ? parsePlaceRef(s.providerId) : null;
  return ref ? osmUrl(ref) : null;
}

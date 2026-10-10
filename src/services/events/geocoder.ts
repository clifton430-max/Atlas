/**
 * Place/address search via a Photon-compatible geocoder (default: the public
 * komoot instance, OpenStreetMap data). Used for searching cities, addresses
 * and places, and for reverse-geocoding a clicked point into an address hint.
 * Callers must debounce; results are cached briefly in memory.
 */
import { env } from '@/lib/env';
import { isValidLatLng } from '@/lib/validation';

export interface PlaceResult {
  id: string;
  name: string;
  /** Secondary line: street / city / country. */
  detail: string;
  latitude: number;
  longitude: number;
  kind: string | null;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | number | undefined>;
}

const cache = new Map<string, { at: number; results: PlaceResult[] }>();
const TTL = 5 * 60 * 1000;

function toPlace(f: PhotonFeature, i: number): PlaceResult | null {
  const [lng, lat] = f.geometry?.coordinates ?? [];
  if (!isValidLatLng(lat, lng)) return null;
  const p = f.properties ?? {};
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const name = String(p.name ?? (street || p.city || 'Unnamed place'));
  const detail = [street && street !== name ? street : null, p.city ?? p.county, p.state, p.country]
    .filter(Boolean).join(', ');
  return {
    id: `${p.osm_type ?? 'x'}${p.osm_id ?? i}`,
    name,
    detail,
    latitude: lat as number,
    longitude: lng as number,
    kind: (p.osm_value as string) ?? null,
  };
}

export async function searchPlaces(
  query: string,
  opts: { near?: { latitude: number; longitude: number }; signal?: AbortSignal; limit?: number } = {},
): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q, limit: String(opts.limit ?? 5) });
  if (opts.near) {
    params.set('lat', opts.near.latitude.toFixed(3));
    params.set('lon', opts.near.longitude.toFixed(3));
  }
  const key = params.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.results;

  const res = await fetch(`${env.geocoderUrl}?${key}`, { signal: opts.signal });
  if (!res.ok) throw new Error('Place search is unavailable right now.');
  const body = (await res.json()) as { features?: PhotonFeature[] };
  const results = (body.features ?? []).map(toPlace).filter((r): r is PlaceResult => r !== null);
  cache.set(key, { at: Date.now(), results });
  return results;
}

/** Best-effort address for a coordinate; null when unknown. */
export async function reverseGeocode(latitude: number, longitude: number, signal?: AbortSignal): Promise<string | null> {
  const base = env.geocoderUrl.replace(/\/api\/?$/, '/reverse');
  try {
    const res = await fetch(`${base}?lat=${latitude}&lon=${longitude}&limit=1`, { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { features?: PhotonFeature[] };
    const place = body.features?.[0] ? toPlace(body.features[0], 0) : null;
    if (!place) return null;
    return [place.name, place.detail].filter(Boolean).join(', ');
  } catch {
    return null;
  }
}

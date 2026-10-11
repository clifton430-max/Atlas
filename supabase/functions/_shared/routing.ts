/**
 * Routing helpers for the `route` Edge Function (pure TypeScript; unit-tested).
 *
 * Provider: OSRM. Default instance is FOSSGIS's public routing.openstreetmap.de
 * (car / foot profiles, OpenStreetMap data), which allows light, identified use
 * with attribution. Set the ROUTING_BASE_URL secret to a dedicated OSRM server
 * for production volume.
 *
 * Honesty: only what OSRM returns is reported (network distance and its
 * duration estimate). No accessibility guarantees are made.
 */
export type TravelMode = 'walking' | 'driving';
export interface LatLng { lat: number; lng: number }
export interface RouteRequest { from: LatLng; to: LatLng; mode: TravelMode }
export interface RouteResult {
  mode: TravelMode;
  distanceMeters: number;
  durationSeconds: number;
  /** [lng, lat] pairs along the route (GeoJSON LineString coordinates). */
  geometry: [number, number][];
  provider: string;
  attribution: string;
}

export const DEFAULT_ROUTING_BASE = 'https://routing.openstreetmap.de';
const PROFILE_PATH: Record<TravelMode, string> = { driving: 'routed-car', walking: 'routed-foot' };
/** Refuse absurd requests before they reach the provider. */
export const MAX_STRAIGHT_KM: Record<TravelMode, number> = { walking: 150, driving: 1500 };

const okLatLng = (p: unknown): p is LatLng => {
  const o = p as LatLng;
  return !!o && typeof o.lat === 'number' && typeof o.lng === 'number' && Number.isFinite(o.lat) && Number.isFinite(o.lng)
    && Math.abs(o.lat) <= 90 && Math.abs(o.lng) <= 180;
};

export function haversineKm(a: LatLng, b: LatLng): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}

export function parseRouteRequest(body: unknown): RouteRequest | { error: string } {
  const b = body as Record<string, unknown> | null;
  if (!b || !okLatLng(b.from) || !okLatLng(b.to)) return { error: 'invalid_coordinates' };
  if (b.mode !== 'walking' && b.mode !== 'driving') return { error: 'invalid_mode' };
  const req = { from: { lat: b.from.lat, lng: b.from.lng }, to: { lat: b.to.lat, lng: b.to.lng }, mode: b.mode } as RouteRequest;
  if (haversineKm(req.from, req.to) > MAX_STRAIGHT_KM[req.mode]) return { error: 'too_far' };
  return req;
}

export function osrmUrl(base: string, r: RouteRequest): string {
  const coords = `${r.from.lng.toFixed(6)},${r.from.lat.toFixed(6)};${r.to.lng.toFixed(6)},${r.to.lat.toFixed(6)}`;
  // OSRM ignores the profile segment; routing.openstreetmap.de selects the profile by path.
  return `${base.replace(/\/$/, '')}/${PROFILE_PATH[r.mode]}/route/v1/driving/${coords}?overview=simplified&geometries=geojson&alternatives=false&steps=false`;
}

/** Parse an OSRM response; null when OSRM found no route. Throws on malformed data. */
export function parseOsrm(json: unknown, mode: TravelMode): RouteResult | null {
  const j = json as { code?: string; routes?: { distance?: unknown; duration?: unknown; geometry?: { type?: string; coordinates?: unknown } }[] };
  if (j?.code === 'NoRoute' || j?.code === 'NoSegment') return null;
  if (j?.code !== 'Ok') throw new Error(`osrm ${String(j?.code ?? 'unknown').slice(0, 30)}`);
  const r = j.routes?.[0];
  if (!r) return null;
  const coords = r.geometry?.type === 'LineString' && Array.isArray(r.geometry.coordinates) ? r.geometry.coordinates : null;
  if (typeof r.distance !== 'number' || typeof r.duration !== 'number' || !coords || coords.length < 2
    || !coords.every((c) => Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number')) {
    throw new Error('osrm malformed');
  }
  return {
    mode, distanceMeters: Math.round(r.distance), durationSeconds: Math.round(r.duration),
    geometry: (coords as [number, number][]).slice(0, 5000),
    provider: 'OSRM', attribution: 'Route © OpenStreetMap contributors, OSRM',
  };
}

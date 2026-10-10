/**
 * A public place (point of interest) from OpenStreetMap, as delivered by the
 * basemap vector tiles. Distinct from events (public.events) and from
 * user-owned pins. Only fields present in the data are filled; details such
 * as address, hours, website and images are loaded on demand from the
 * place-details Edge Function and may be unavailable.
 */
import type { CategoryId } from './categories';

export type OsmType = 'node' | 'way' | 'relation';

export interface Place {
  /** Stable reference, e.g. "osm:node/123456". */
  ref: string;
  osmType: OsmType;
  osmId: number;
  name: string;
  /** Raw OSM tag value, e.g. "restaurant", "viewpoint". */
  subclass: string;
  categoryId: CategoryId;
  subcategoryLabel: string;
  latitude: number;
  longitude: number;
}

/**
 * OpenMapTiles/Planetiler encode the OSM element in the feature id as
 * osm_id * 10 + type (1 = node, 2 = way, 3 = relation). Verified against the
 * OSM API during the audit. Returns null for ids that don't decode.
 */
export function decodeOsmFeatureId(id: unknown): { osmType: OsmType; osmId: number } | null {
  const n = typeof id === 'string' ? Number(id) : id;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 10) return null;
  const typeCode = n % 10;
  const osmId = Math.floor(n / 10);
  const osmType = typeCode === 1 ? 'node' : typeCode === 2 ? 'way' : typeCode === 3 ? 'relation' : null;
  return osmType && osmId > 0 ? { osmType, osmId } : null;
}

export function placeRef(osmType: OsmType, osmId: number) {
  return `osm:${osmType}/${osmId}`;
}

export function parsePlaceRef(ref: string): { osmType: OsmType; osmId: number } | null {
  const m = /^osm:(node|way|relation)\/(\d{1,15})$/.exec(ref);
  return m ? { osmType: m[1] as OsmType, osmId: Number(m[2]) } : null;
}

export function osmUrl(p: Pick<Place, 'osmType' | 'osmId'>) {
  return `https://www.openstreetmap.org/${p.osmType}/${p.osmId}`;
}

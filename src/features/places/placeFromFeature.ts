import type { MapGeoJSONFeature } from 'maplibre-gl';
import { categorizeSubclass } from './categories';
import { decodeOsmFeatureId, placeRef, type Place } from './types';
import { isValidLatLng } from '@/lib/validation';

/** Convert a basemap POI feature into a Place; null if it lacks a valid id, name, category or coordinates. */
export function placeFromFeature(f: Pick<MapGeoJSONFeature, 'id' | 'properties' | 'geometry'>): Place | null {
  const decoded = decodeOsmFeatureId(f.id);
  const name = typeof f.properties?.name === 'string' ? f.properties.name.trim() : '';
  const subclass = String(f.properties?.subclass ?? '');
  const cat = categorizeSubclass(subclass);
  if (!decoded || !name || !cat || f.geometry.type !== 'Point') return null;
  const [lng, lat] = f.geometry.coordinates as [number, number];
  if (!isValidLatLng(lat, lng)) return null;
  return {
    ref: placeRef(decoded.osmType, decoded.osmId), ...decoded, name, subclass,
    categoryId: cat.category.id, subcategoryLabel: cat.sub.label,
    // Tile coordinates are quantized (~1 m at z14); round to 6 dp.
    latitude: Math.round(lat * 1e6) / 1e6, longitude: Math.round(lng * 1e6) / 1e6,
  };
}

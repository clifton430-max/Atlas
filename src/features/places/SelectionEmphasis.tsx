/**
 * Selected-place emphasis (Discover).
 *
 *   1. A soft halo at the selected item's coordinates (CSS animation, so the
 *      global reduced-motion rule turns it into a static ring).
 *   2. Real geometry when available: if the selected point lies inside an OSM
 *      building footprint from the basemap tiles, that footprint is
 *      highlighted with a fading glow + outline (2D), and the same building's
 *      3D extrusion is tinted (3D). Nothing is drawn when no footprint
 *      contains the point — no geometry is ever invented.
 *
 * Purely visual: pointer-events none, drawn under markers and labels.
 */
import { useEffect } from 'react';
import type { GeoJSONSource } from 'maplibre-gl';
import { MapMarker } from '@/features/map/MapMarker';
import { useMapInstance } from '@/features/map/MapContext';
import { PLACES_LAYER } from '@/features/map/atlasStyle';
import { BUILDINGS_3D, buildingColor } from '@/features/map/cityStyle';
import type { AtlasEvent } from '@/lib/types';
import type { Place } from './types';

const SRC = 'atlas-emphasis';
const FILL = 'atlas-emphasis-fill';
const LINE = 'atlas-emphasis-line';
const ACCENT = '#2f5bea';

export function SelectionEmphasis({ event, place }: { event: AtlasEvent | null; place: Place | null }) {
  const { map, styleVersion } = useMapInstance();
  const lat = event?.latitude ?? place?.latitude ?? null;
  const lng = event?.longitude ?? place?.longitude ?? null;

  useEffect(() => {
    if (!map || styleVersion === 0) return;
    if (!map.getSource(SRC)) {
      map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      const before = map.getLayer(PLACES_LAYER) ? PLACES_LAYER : undefined;
      map.addLayer({ id: FILL, type: 'fill', source: SRC, paint: { 'fill-color': ACCENT, 'fill-opacity': 0, 'fill-opacity-transition': { duration: 450 } } }, before);
      map.addLayer({ id: LINE, type: 'line', source: SRC, paint: { 'line-color': ACCENT, 'line-width': 2.5, 'line-opacity': 0, 'line-opacity-transition': { duration: 450 } } }, before);
    }
    return () => {
      if (!map.getStyle()) return;
      for (const l of [LINE, FILL]) if (map.getLayer(l)) map.removeLayer(l);
      if (map.getSource(SRC)) map.removeSource(SRC);
    };
  }, [map, styleVersion]);

  useEffect(() => {
    if (!map || styleVersion === 0 || !map.getSource(SRC)) return;
    const src = map.getSource(SRC) as GeoJSONSource;
    const tint = (id: number | string | null) => {
      if (map.getLayer(BUILDINGS_3D)) map.setPaintProperty(BUILDINGS_3D, 'fill-extrusion-color', buildingColor(id));
    };
    const clear = () => {
      tint(null);
      src.setData({ type: 'FeatureCollection', features: [] });
      if (map.getLayer(FILL)) map.setPaintProperty(FILL, 'fill-opacity', 0);
      if (map.getLayer(LINE)) map.setPaintProperty(LINE, 'line-opacity', 0);
    };
    if (lat == null || lng == null) return clear();
    let cancelled = false;
    // Query once the map has settled at the selection (it may be easing there).
    const apply = () => {
      if (cancelled || !map.getSource(SRC)) return;
      const pt = map.project([lng, lat]);
      const buildingLayers = (map.getStyle()?.layers ?? []).filter((l) => 'source-layer' in l && l['source-layer'] === 'building').map((l) => l.id);
      const hit = buildingLayers.length ? map.queryRenderedFeatures(pt, { layers: buildingLayers })[0] : undefined;
      if (!hit || (hit.geometry.type !== 'Polygon' && hit.geometry.type !== 'MultiPolygon')) return clear();
      src.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: hit.geometry, properties: {} }] });
      if (hit.id != null) tint(hit.id);
      map.setPaintProperty(FILL, 'fill-opacity', 0.22);
      map.setPaintProperty(LINE, 'line-opacity', 0.9);
    };
    clear();
    if (map.isMoving()) map.once('moveend', () => map.once('idle', apply));
    else map.once('idle', apply);
    map.triggerRepaint();
    return () => { cancelled = true; };
  }, [map, styleVersion, lat, lng]);

  if (lat == null || lng == null) return null;
  return (
    <MapMarker latitude={lat} longitude={lng} zIndex={0} interactive={false}>
      <span aria-hidden data-testid="selection-halo" className="pointer-events-none relative block size-14">
        <span className="absolute inset-0 rounded-full bg-accent/20 ring-2 ring-accent/60 atlas-halo" />
      </span>
    </MapMarker>
  );
}

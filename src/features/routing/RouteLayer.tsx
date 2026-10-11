/** Draws the selected route (real OSRM geometry) under labels and markers. */
import { useEffect } from 'react';
import type { GeoJSONSource } from 'maplibre-gl';
import { useMapInstance } from '@/features/map/MapContext';
import { useDrawnRoute } from './routeStore';

const SRC = 'atlas-route';
const CASING = 'atlas-route-casing';
const LINE = 'atlas-route-line';

export function RouteLayer() {
  const { map, styleVersion } = useMapInstance();
  const route = useDrawnRoute();

  useEffect(() => {
    if (!map || styleVersion === 0) return;
    if (!map.getSource(SRC)) {
      map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      const before = map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
      map.addLayer({ id: CASING, type: 'line', source: SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 8 } }, before);
      map.addLayer({ id: LINE, type: 'line', source: SRC, layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#2f5bea', 'line-width': 4.5 } }, before);
    }
    // Walking routes are dotted, driving routes solid (shape cue, not colour alone).
    map.setPaintProperty(LINE, 'line-dasharray', route?.mode === 'walking' ? [1, 1.6] : [1, 0]);
    (map.getSource(SRC) as GeoJSONSource).setData(route
      ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { mode: route.mode }, geometry: { type: 'LineString', coordinates: route.geometry } }] }
      : { type: 'FeatureCollection', features: [] });
  }, [map, styleVersion, route]);

  return null;
}

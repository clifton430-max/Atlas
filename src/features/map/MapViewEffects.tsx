/**
 * Keeps the injected city layers in sync with the view preferences:
 *   - 3D buildings follow the 2D/3D mode, tree canopies follow the trees toggle
 *     (the style transform reads the same preferences when a style loads);
 *   - day/night: at night a blue "dusk" tint is drawn over the ground and
 *     buildings (below labels and markers) and the building light turns cool.
 */
import { useEffect } from 'react';
import type { LightSpecification } from 'maplibre-gl';
import { useMapInstance } from './MapContext';
import { BUILDINGS_3D, DAY_LIGHT, TREES_LAYER, TREES_LAYER_WOOD } from './cityStyle';
import { useIsNight } from './lighting';
import { useTreesEnabled, useViewMode } from './viewPrefs';

export const NIGHT_TINT = 'atlas-night-tint';
const NIGHT_LIGHT: LightSpecification = { anchor: 'viewport', color: '#9fb4ff', intensity: 0.2, position: [1.15, 200, 40] };
const WORLD = { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] } };

export function MapViewEffects() {
  const { map, styleVersion } = useMapInstance();
  const mode = useViewMode();
  const trees = useTreesEnabled();
  const night = useIsNight();

  useEffect(() => {
    if (!map || styleVersion === 0 || !map.getLayer(BUILDINGS_3D)) return;
    map.setLayoutProperty(BUILDINGS_3D, 'visibility', mode === '3d' ? 'visible' : 'none');
  }, [map, styleVersion, mode]);

  useEffect(() => {
    if (!map || styleVersion === 0) return;
    for (const id of [TREES_LAYER, TREES_LAYER_WOOD]) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', trees ? 'visible' : 'none');
  }, [map, styleVersion, trees]);

  useEffect(() => {
    if (!map || styleVersion === 0 || !map.getLayer(BUILDINGS_3D)) return; // OpenMapTiles styles only
    if (!map.getSource(NIGHT_TINT)) map.addSource(NIGHT_TINT, { type: 'geojson', data: WORLD });
    if (!map.getLayer(NIGHT_TINT)) {
      const firstLabel = map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
      map.addLayer({ id: NIGHT_TINT, type: 'fill', source: NIGHT_TINT, paint: { 'fill-color': '#101c3f', 'fill-opacity': 0, 'fill-opacity-transition': { duration: 600 } } }, firstLabel);
    }
    map.setPaintProperty(NIGHT_TINT, 'fill-opacity', night ? 0.36 : 0);
    map.setLight(night ? NIGHT_LIGHT : DAY_LIGHT);
  }, [map, styleVersion, night]);

  return null;
}

/**
 * Discover place markers: the injected `atlas-places` symbol layer (see
 * map/atlasStyle.ts) driven by the visible categories/subcategories. Real
 * OpenStreetMap POIs from the basemap tiles; no extra provider requests.
 * Leaving Discover resets the filter so places never leak into Personal or
 * Collaboration map contexts.
 */
import { useEffect, useRef } from 'react';
import type { MapLayerMouseEvent } from 'maplibre-gl';
import { useMapInstance } from '@/features/map/MapContext';
import { uiStore } from '@/app/store';
import { NO_PLACES_FILTER, PLACES_LAYER, osmFeatureId, placeIconSize, placesFilter } from '@/features/map/atlasStyle';
import type { Place } from './types';
import { placeFromFeature } from './placeFromFeature';

export function PlacesLayer({ subclasses, excludeFeatureIds = [], selected, onSelect, onHover }: {
  subclasses: string[];
  /** Feature ids not to draw (places saved on the open map, shown as droplets). */
  excludeFeatureIds?: number[];
  /** Selected place: its pin is drawn larger (selected state). */
  selected: Place | null;
  onSelect: (p: Place) => void;
  onHover: (p: Place | null) => void;
}) {
  const { map, styleVersion } = useMapInstance();
  const cb = useRef({ onSelect, onHover });
  cb.current = { onSelect, onHover };
  const key = `${subclasses.join('|')}#${excludeFeatureIds.join(',')}`;

  useEffect(() => {
    if (!map || styleVersion === 0 || !map.getLayer(PLACES_LAYER)) return;
    map.setFilter(PLACES_LAYER, placesFilter(subclasses, excludeFeatureIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, styleVersion, key]);

  const selectedId = selected ? osmFeatureId(selected.osmType, selected.osmId) : null;
  useEffect(() => {
    if (!map || styleVersion === 0 || !map.getLayer(PLACES_LAYER)) return;
    map.setLayoutProperty(PLACES_LAYER, 'icon-size', placeIconSize(selectedId));
  }, [map, styleVersion, selectedId]);

  useEffect(() => {
    if (!map || styleVersion === 0 || !map.getLayer(PLACES_LAYER)) return;
    let hovered: string | null = null;
    const onClick = (e: MapLayerMouseEvent) => {
      // While placing a pin or monument, a click chooses a location instead.
      const ui = uiStore.get();
      if (ui.placingPin || ui.movingPinId || ui.placingMonument) return;
      // Event pins and clusters are drawn above places: a click on an overlap belongs to the event.
      const above = ['discover-points', 'discover-clusters'].filter((l) => map.getLayer(l));
      if (above.length && map.queryRenderedFeatures(e.point, { layers: above }).length) return;
      const p = e.features?.[0] && placeFromFeature(e.features[0]);
      if (p) cb.current.onSelect(p);
    };
    const onMove = (e: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer';
      const p = e.features?.[0] && placeFromFeature(e.features[0]);
      if (p && p.ref !== hovered) {
        hovered = p.ref;
        cb.current.onHover(p);
      }
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
      hovered = null;
      cb.current.onHover(null);
    };
    map.on('click', PLACES_LAYER, onClick);
    map.on('mousemove', PLACES_LAYER, onMove);
    map.on('mouseleave', PLACES_LAYER, onLeave);
    return () => {
      map.off('click', PLACES_LAYER, onClick);
      map.off('mousemove', PLACES_LAYER, onMove);
      map.off('mouseleave', PLACES_LAYER, onLeave);
      if (map.getStyle() && map.getLayer(PLACES_LAYER)) map.setFilter(PLACES_LAYER, NO_PLACES_FILTER);
    };
  }, [map, styleVersion]);

  return null;
}

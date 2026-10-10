/**
 * Discover event markers as a clustered GeoJSON layer (WebGL) — efficient for
 * hundreds of events. Each event is drawn with its event-type icon and color
 * (Ticketmaster segment; generic style when the segment is unknown; grey
 * "sample" style for development fixtures). Events without verified
 * coordinates are never mapped. Clusters expand on click; points select the
 * event; hover reports the event for the preview card. Re-attaches after a
 * style change (styleVersion).
 */
import { useEffect, useRef } from 'react';
import type * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { useMapInstance } from '@/features/map/MapContext';
import { eventVisual } from '@/features/places/categories';
import { DEV_FIXTURE_MARKER, MARKER_TIP_PAD } from '@/features/places/markerImages';
import type { AtlasEvent } from '@/lib/types';

const SRC = 'discover-events';
const L_CLUSTER = 'discover-clusters';
const L_COUNT = 'discover-cluster-count';
const L_SAVED = 'discover-saved';
const L_POINT = 'discover-points';
const L_SELECTED = 'discover-selected';
export const EVENT_POINT_LAYER = L_POINT;

function toGeoJSON(events: AtlasEvent[], savedIds: Set<string>): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: events
      .filter((e) => e.latitude != null && e.longitude != null)
      .map((e) => ({
        type: 'Feature',
        id: e.id,
        geometry: { type: 'Point', coordinates: [e.longitude!, e.latitude!] },
        properties: {
          id: e.id, name: e.name, saved: savedIds.has(e.id) ? 1 : 0,
          icon: e.isDevFixture ? DEV_FIXTURE_MARKER : eventVisual(e.category).key,
        },
      })),
  };
}

function ensureLayers(map: maplibregl.Map) {
  if (map.getSource(SRC)) return;
  map.addSource(SRC, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster: true,
    clusterRadius: 44,
    clusterMaxZoom: 14,
  });
  map.addLayer({
    id: L_CLUSTER, type: 'circle', source: SRC, filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#171717',
      'circle-opacity': 0.88,
      'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffffff',
    },
  });
  map.addLayer({
    id: L_COUNT, type: 'symbol', source: SRC, filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['Noto Sans Bold'] },
    paint: { 'text-color': '#ffffff' },
  });
  // A dark ring on the ground under events you've already saved (shape cue, not just color).
  map.addLayer({
    id: L_SAVED, type: 'circle', source: SRC, filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'saved'], 1]],
    paint: { 'circle-radius': 9, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 3, 'circle-stroke-color': '#171717', 'circle-pitch-alignment': 'map' },
  });
  // Selected: a blue ring on the ground at the pin's tip (drawn under the pin).
  map.addLayer({
    id: L_SELECTED, type: 'circle', source: SRC, filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-color': 'rgba(47,91,234,0.18)',
      'circle-radius': 13,
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#2f5bea',
      'circle-pitch-alignment': 'map',
    },
  });
  // Teardrop pins, tip on the coordinate.
  map.addLayer({
    id: L_POINT, type: 'symbol', source: SRC, filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-anchor': 'bottom',
      'icon-offset': [0, MARKER_TIP_PAD],
      'icon-size': 0.95,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
}

export function DiscoverLayer({ events, savedIds, selectedId, onSelect, onHover }: {
  events: AtlasEvent[];
  savedIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const { map, styleVersion } = useMapInstance();
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;

  // Attach source/layers (and again after style reloads); detach on unmount so
  // Discover markers never appear in other contexts.
  useEffect(() => {
    // styleVersion > 0 means a 'style.load' has happened for the current style.
    if (!map || styleVersion === 0) return;
    ensureLayers(map);

    const onPoint = (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id;
      if (typeof id === 'string') onSelect(id);
    };
    const onCluster = async (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const src = map.getSource(SRC) as GeoJSONSource | undefined;
      if (!f || !src) return;
      const zoom = await src.getClusterExpansionZoom(f.properties?.cluster_id);
      map.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom });
    };
    // Hover: report only when the hovered event changes (no work per pixel).
    let hovered: string | null = null;
    const onMove = (e: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer';
      const id = e.features?.[0]?.properties?.id;
      if (typeof id === 'string' && id !== hovered) {
        hovered = id;
        hoverRef.current(id);
      }
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
      hovered = null;
      hoverRef.current(null);
    };
    const pointer = () => (map.getCanvas().style.cursor = 'pointer');
    const reset = () => (map.getCanvas().style.cursor = '');

    map.on('click', L_POINT, onPoint);
    map.on('click', L_CLUSTER, onCluster);
    map.on('mousemove', L_POINT, onMove);
    map.on('mouseleave', L_POINT, onLeave);
    map.on('mouseenter', L_CLUSTER, pointer);
    map.on('mouseleave', L_CLUSTER, reset);
    return () => {
      map.off('click', L_POINT, onPoint);
      map.off('click', L_CLUSTER, onCluster);
      map.off('mousemove', L_POINT, onMove);
      map.off('mouseleave', L_POINT, onLeave);
      map.off('mouseenter', L_CLUSTER, pointer);
      map.off('mouseleave', L_CLUSTER, reset);
      reset();
      if (!map.getStyle()) return;
      for (const l of [L_SELECTED, L_POINT, L_SAVED, L_COUNT, L_CLUSTER]) if (map.getLayer(l)) map.removeLayer(l);
      if (map.getSource(SRC)) map.removeSource(SRC);
    };
  }, [map, styleVersion, onSelect]);

  useEffect(() => {
    if (!map || styleVersion === 0) return;
    (map.getSource(SRC) as GeoJSONSource | undefined)?.setData(toGeoJSON(events, savedIds));
  }, [map, events, savedIds, styleVersion]);

  useEffect(() => {
    if (!map || styleVersion === 0 || !map.getLayer(L_SELECTED)) return;
    map.setFilter(L_SELECTED, ['==', ['get', 'id'], selectedId ?? '']);
    // Selected pin is drawn larger and on top.
    map.setLayoutProperty(L_POINT, 'icon-size', ['case', ['==', ['get', 'id'], selectedId ?? ''], 1.2, 0.95]);
    map.setLayoutProperty(L_POINT, 'symbol-sort-key', ['case', ['==', ['get', 'id'], selectedId ?? ''], 1, 0]);
  }, [map, selectedId, styleVersion, events]);

  return null;
}

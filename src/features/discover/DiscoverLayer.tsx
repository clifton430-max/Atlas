/**
 * Discover event markers as a clustered GeoJSON layer (WebGL) — efficient for
 * hundreds of events. Events without verified coordinates are never mapped.
 * Clusters expand on click; points select the event. Re-attaches after a
 * style change (styleVersion).
 */
import { useEffect } from 'react';
import type * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { useMapInstance } from '@/features/map/MapContext';
import type { AtlasEvent } from '@/lib/types';

const SRC = 'discover-events';
const L_CLUSTER = 'discover-clusters';
const L_COUNT = 'discover-cluster-count';
const L_POINT = 'discover-points';
const L_SELECTED = 'discover-selected';

function toGeoJSON(events: AtlasEvent[], savedIds: Set<string>): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: events
      .filter((e) => e.latitude != null && e.longitude != null)
      .map((e) => ({
        type: 'Feature',
        id: e.id,
        geometry: { type: 'Point', coordinates: [e.longitude!, e.latitude!] },
        properties: { id: e.id, name: e.name, dev: e.isDevFixture ? 1 : 0, saved: savedIds.has(e.id) ? 1 : 0 },
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
  map.addLayer({
    id: L_POINT, type: 'circle', source: SRC, filter: ['!', ['has', 'point_count']],
    paint: {
      // Dev fixtures are drawn hollow-gray so they don't read as live data.
      'circle-color': ['case', ['==', ['get', 'dev'], 1], '#a3a3a3', '#2f5bea'],
      'circle-radius': 8,
      'circle-stroke-width': ['case', ['==', ['get', 'saved'], 1], 4, 2.5],
      'circle-stroke-color': ['case', ['==', ['get', 'saved'], 1], '#171717', '#ffffff'],
    },
  });
  map.addLayer({
    id: L_SELECTED, type: 'circle', source: SRC, filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-color': 'rgba(0,0,0,0)',
      'circle-radius': 14,
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#2f5bea',
    },
  });
}

export function DiscoverLayer({ events, savedIds, selectedId, onSelect }: {
  events: AtlasEvent[];
  savedIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { map, styleVersion } = useMapInstance();

  // Attach source/layers (and again after style reloads); detach on unmount so
  // Discover markers never appear in other contexts.
  useEffect(() => {
    // styleVersion > 0 means a 'style.load' has happened for the current style.
    // (map.isStyleLoaded() is false while tiles stream in, so it can't be used here.)
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
    const pointer = () => (map.getCanvas().style.cursor = 'pointer');
    const reset = () => (map.getCanvas().style.cursor = '');

    map.on('click', L_POINT, onPoint);
    map.on('click', L_CLUSTER, onCluster);
    for (const l of [L_POINT, L_CLUSTER]) {
      map.on('mouseenter', l, pointer);
      map.on('mouseleave', l, reset);
    }
    return () => {
      map.off('click', L_POINT, onPoint);
      map.off('click', L_CLUSTER, onCluster);
      for (const l of [L_POINT, L_CLUSTER]) {
        map.off('mouseenter', l, pointer);
        map.off('mouseleave', l, reset);
      }
      reset();
      if (!map.getStyle()) return;
      for (const l of [L_SELECTED, L_POINT, L_COUNT, L_CLUSTER]) if (map.getLayer(l)) map.removeLayer(l);
      if (map.getSource(SRC)) map.removeSource(SRC);
    };
  }, [map, styleVersion, onSelect]);

  useEffect(() => {
    if (!map || styleVersion === 0) return;
    (map.getSource(SRC) as GeoJSONSource | undefined)?.setData(toGeoJSON(events, savedIds));
  }, [map, events, savedIds, styleVersion]);

  useEffect(() => {
    if (map && styleVersion > 0 && map.getLayer(L_SELECTED)) map.setFilter(L_SELECTED, ['==', ['get', 'id'], selectedId ?? '']);
  }, [map, selectedId, styleVersion, events]);

  return null;
}

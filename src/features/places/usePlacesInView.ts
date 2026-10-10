/**
 * Places currently in view, read from the already-loaded basemap tiles and kept
 * in sync with the map (refreshes when the map settles or categories change).
 * The list and the markers come from the same features, so they always agree.
 */
import { useEffect, useMemo, useState } from 'react';
import { useUi } from '@/app/store';
import { useMapInstance } from '@/features/map/MapContext';
import { PLACES_LAYER, PLACES_MIN_ZOOM, PLACES_SOURCE, placesFilter } from '@/features/map/atlasStyle';
import { placeFromFeature } from './placeFromFeature';
import type { Place } from './types';

export interface PlacesInView {
  places: Place[];
  /** False when the current map style has no POI data. */
  supported: boolean;
  /** True when zoomed out too far for places to be shown. */
  tooFarOut: boolean;
  truncated: boolean;
}

const LIMIT = 250;

export function usePlacesInView(subclasses: string[]): PlacesInView {
  const { map, styleVersion } = useMapInstance();
  const bbox = useUi((s) => s.bbox);
  const keyword = useUi((s) => s.discoverKeyword).trim().toLowerCase();
  const [tick, setTick] = useState(0);
  const key = subclasses.join('|');

  // Re-read after tiles finish loading (idle), not on every frame.
  useEffect(() => {
    if (!map) return;
    const onIdle = () => setTick((t) => t + 1);
    map.on('idle', onIdle);
    return () => { map.off('idle', onIdle); };
  }, [map]);

  return useMemo(() => {
    const supported = !!map && styleVersion > 0 && !!map.getLayer(PLACES_LAYER);
    const tooFarOut = !!map && map.getZoom() < PLACES_MIN_ZOOM;
    if (!map || !supported || !bbox || tooFarOut || subclasses.length === 0) return { places: [], supported, tooFarOut, truncated: false };
    const feats = map.querySourceFeatures(PLACES_SOURCE, { sourceLayer: 'poi', filter: placesFilter(subclasses) });
    const byRef = new Map<string, Place & { rank: number }>();
    for (const f of feats) {
      const p = placeFromFeature(f);
      if (!p || byRef.has(p.ref)) continue;
      if (p.latitude < bbox.south || p.latitude > bbox.north || p.longitude < bbox.west || p.longitude > bbox.east) continue;
      if (keyword && !`${p.name} ${p.subcategoryLabel}`.toLowerCase().includes(keyword)) continue;
      byRef.set(p.ref, { ...p, rank: Number(f.properties?.rank ?? 99) });
    }
    const sorted = [...byRef.values()].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    return { places: sorted.slice(0, LIMIT).map(({ rank: _r, ...p }) => p), supported, tooFarOut, truncated: sorted.length > LIMIT };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, styleVersion, bbox, key, keyword, tick]);
}

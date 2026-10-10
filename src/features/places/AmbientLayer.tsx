/**
 * Optional ambient map life (every map context, zoom >= 14):
 *   - small cars on real major/minor roads, trains on mapped surface rail and
 *     people on mapped footpaths (including park paths). Geometry comes from
 *     the basemap tiles; the motion and vehicle sizes are decorative — this is
 *     NOT real-time traffic, transit or crowd data, and the UI says so.
 *   - Vehicles are drawn as low 3D boxes (fill-extrusion), so real buildings
 *     correctly hide them; they are exaggerated in size to stay visible.
 *   - At night (see map/lighting.ts) a static warm glow marks real night-time
 *     venues from the tiles. The glow is not motion, so it also shows under
 *     reduced motion.
 *
 * Performance & comfort:
 *   - ≤ 16 agents in ONE GeoJSON source, updated ~15 fps from a single rAF loop;
 *   - paused while the map moves, the tab is hidden, or zoomed out; pause and
 *     0.5×/1×/2× speed from the "Map animations" pill;
 *   - disabled by the animations switch / Settings or prefers-reduced-motion;
 *   - auto-disables for the session if frames become slow;
 *   - never interactive, drawn under markers and labels.
 */
import { useEffect } from 'react';
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import { useMapInstance } from '@/features/map/MapContext';
import { PLACES_LAYER, PLACES_SOURCE } from '@/features/map/atlasStyle';
import { NIGHT_TINT } from '@/features/map/MapViewEffects';
import { useIsNight } from '@/features/map/lighting';
import { boxAround, getAmbientPlayback, LIMITS, makeAgent, poseAt, useAmbientEnabled, useReducedMotion, type Agent, type AgentKind } from './ambient';

const SRC = 'atlas-ambient';
const LAYER = 'atlas-ambient';
const GLOW = 'atlas-night-glow';
const MIN_ZOOM = 14;
const FRAME_MS = 66;
const ROAD = ['primary', 'secondary', 'tertiary', 'trunk', 'minor'];
const NIGHT_VENUES = ['bar', 'pub', 'nightclub', 'restaurant', 'cinema', 'theatre', 'biergarten'];
const CAR_COLORS = ['#e4572e', '#2f5bea', '#f2c14e', '#ffffff', '#4caf50', '#8e44ad'];

let autoDisabled = false;

/** Insert below the first label layer (and below the night tint), so labels and markers stay on top. */
function belowLabels(map: MLMap): string | undefined {
  if (map.getLayer(NIGHT_TINT)) return NIGHT_TINT;
  return map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
}

function sampleAgents(map: MLMap): Agent[] {
  const b = map.getBounds();
  const inView = ([x, y]: number[]) => x >= b.getWest() && x <= b.getEast() && y >= b.getSouth() && y <= b.getNorth();
  const lines = (classes: string[], kind: AgentKind): Agent[] => {
    const feats = map.querySourceFeatures(PLACES_SOURCE, { sourceLayer: 'transportation', filter: ['in', ['get', 'class'], ['literal', classes]] });
    const out: Agent[] = [];
    let seed = 1;
    for (const f of feats) {
      if (kind === 'train' && f.properties?.brunnel === 'tunnel') continue; // only visible rail
      const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
      for (const p of parts) {
        if (!(p as number[][]).some(inView)) continue;
        const a = makeAgent(kind, p as [number, number][], seed++);
        if (a) out.push(a);
      }
    }
    // Prefer longer lines (smoother motion), keep it sparse.
    return out.sort((x, y) => y.length - x.length).slice(0, LIMITS[kind]);
  };
  return [...lines(ROAD, 'car'), ...lines(['rail'], 'train'), ...lines(['path'], 'walker')];
}

/** Metres per CSS pixel at the map centre (512 px tiles). */
const metresPerPixel = (map: MLMap) => (40_075_016.686 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());

export function AmbientLayer() {
  const { map, styleVersion } = useMapInstance();
  const enabled = useAmbientEnabled();
  const reduced = useReducedMotion();
  const night = useIsNight();
  const active = enabled && !reduced && !autoDisabled;

  // Static night glow at real venues (colour only, no motion).
  useEffect(() => {
    if (!map || styleVersion === 0 || !night || !map.getSource(PLACES_SOURCE)) return;
    map.addLayer({
      id: GLOW, type: 'circle', source: PLACES_SOURCE, 'source-layer': 'poi', minzoom: MIN_ZOOM,
      filter: ['all', ['has', 'name'], ['in', ['get', 'subclass'], ['literal', NIGHT_VENUES]]],
      paint: { 'circle-radius': 18, 'circle-color': '#fbbf24', 'circle-opacity': 0.32, 'circle-blur': 1, 'circle-pitch-alignment': 'map' },
    }, map.getLayer(PLACES_LAYER) ? PLACES_LAYER : undefined);
    return () => {
      if (map.getStyle() && map.getLayer(GLOW)) map.removeLayer(GLOW);
    };
  }, [map, styleVersion, night]);

  useEffect(() => {
    if (!map || styleVersion === 0 || !active || !map.getSource(PLACES_SOURCE)) return;
    map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: LAYER, type: 'fill-extrusion', source: SRC, minzoom: MIN_ZOOM,
      paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 1 },
    }, belowLabels(map));

    let agents: Agent[] = [];
    let unit = 1; // metres per "vehicle unit" (≈ 14 px), set on resample
    let raf = 0;
    let last = 0;
    let running = false;
    // Simulated clock: advances by real frame time x speed, and not at all while paused.
    let simT = 0;
    let prevFrame = 0;
    const slow: number[] = [];

    const feature = (a: Agent, i: number, t: number) => {
      const { position, heading } = poseAt(a, t);
      const [len, wid, h, b, c] = a.kind === 'train' ? [unit * 4.2, unit * 0.55, unit * 0.5, 0, '#e8eef9']
        : a.kind === 'car' ? [unit, unit * 0.48, unit * 0.36, 0, CAR_COLORS[i % CAR_COLORS.length]]
          : [unit * 0.3, unit * 0.3, unit * 0.55, 0, ['#ef6f6c', '#3d7dd8', '#f4b942', '#7b5ea7'][i % 4]];
      return { type: 'Feature' as const, properties: { c, h, b }, geometry: { type: 'Polygon' as const, coordinates: [boxAround(position, heading, len, wid)] } };
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      // Performance guard: consistently slow frames -> switch ambience off.
      if (last) {
        slow.push(now - last > 200 ? 1 : 0);
        if (slow.length > 45) slow.shift();
        if (slow.length === 45 && slow.reduce((x, y) => x + y, 0) > 20) { autoDisabled = true; stop(); clear(); return; }
      }
      last = now;
      const { paused, speed } = getAmbientPlayback();
      const dt = prevFrame ? Math.min(now - prevFrame, 250) / 1000 : 0;
      prevFrame = now;
      if (paused) return;
      simT += dt * speed;
      (map.getSource(SRC) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: agents.map((a, i) => feature(a, i, simT)) });
    };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    const clear = () => (map.getSource(SRC) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
    const resume = () => {
      if (document.hidden || map.getZoom() < MIN_ZOOM) { stop(); clear(); return; }
      agents = sampleAgents(map);
      unit = Math.max(5, metresPerPixel(map) * 14);
      if (!running) { running = true; last = 0; prevFrame = 0; raf = requestAnimationFrame(tick); }
    };
    const onMoveStart = () => stop();
    const onVis = () => (document.hidden ? stop() : resume());

    // Resample geometry only after the view changes (never per frame: our own
    // setData repaints would otherwise fire 'idle' continuously).
    map.on('movestart', onMoveStart);
    map.on('moveend', resume);
    map.once('idle', resume);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      map.off('movestart', onMoveStart);
      map.off('moveend', resume);
      map.off('idle', resume);
      document.removeEventListener('visibilitychange', onVis);
      if (!map.getStyle()) return;
      if (map.getLayer(LAYER)) map.removeLayer(LAYER);
      if (map.getSource(SRC)) map.removeSource(SRC);
    };
  }, [map, styleVersion, active]);

  return null;
}

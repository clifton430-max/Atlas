/**
 * Applies a SkinTheme to the live MapLibre style and restores the original
 * (city) style exactly. Every overridden property's original value is recorded
 * the first time it is changed, so restoring never guesses. Colour changes use
 * MapLibre's paint transitions, which is what makes switching worlds a smooth
 * cartographic cross-fade instead of a reload.
 */
import type { Map as MLMap, LayerSpecification } from 'maplibre-gl';
import type { SkinTheme, Texture } from '@/features/collectibles/skins';
import { BUILDINGS_3D, TREES_LAYER, TREES_LAYER_WOOD } from './cityStyle';

type Kind = 'paint' | 'layout';
interface Saved { kind: Kind; layer: string; prop: string; value: unknown }
const originals = new WeakMap<MLMap, Map<string, Saved>>();
// MapLibre types property names as unions; themes address them dynamically.
type AnyMap = { getPaintProperty(l: string, p: string): unknown; getLayoutProperty(l: string, p: string): unknown; setPaintProperty(l: string, p: string, v: unknown): void; setLayoutProperty(l: string, p: string, v: unknown): void };
const dyn = (m: MLMap) => m as unknown as AnyMap;
const GRATICULE = 'atlas-skin-graticule';
const FONTS: Record<SkinTheme['font'], string[]> = { regular: ['Noto Sans Regular'], bold: ['Noto Sans Bold'], italic: ['Noto Sans Italic'] };

function set(map: MLMap, kind: Kind, layer: string, prop: string, value: unknown) {
  if (!map.getLayer(layer)) return;
  let saved = originals.get(map);
  if (!saved) originals.set(map, (saved = new Map()));
  const key = `${kind}|${layer}|${prop}`;
  if (!saved.has(key)) saved.set(key, { kind, layer, prop, value: kind === 'paint' ? dyn(map).getPaintProperty(layer, prop) : dyn(map).getLayoutProperty(layer, prop) });
  try {
    if (kind === 'paint') dyn(map).setPaintProperty(layer, prop, value);
    else dyn(map).setLayoutProperty(layer, prop, value);
  } catch { /* property not applicable to this style's layer */ }
}

const sl = (l: LayerSpecification) => ('source-layer' in l ? l['source-layer'] : undefined);
const isOurs = (id: string) => id.startsWith('atlas-') || id.startsWith('discover-');

export function applyTheme(map: MLMap, th: SkinTheme) {
  const layers = map.getStyle()?.layers ?? [];
  for (const l of layers) {
    const src = sl(l);
    const id = l.id;
    if (l.type === 'background') {
      set(map, 'paint', id, 'background-color', th.background);
      if (th.texture) { ensureTexture(map, th.texture); set(map, 'paint', id, 'background-pattern', `atlas-tex-${th.texture}`); }
      else set(map, 'paint', id, 'background-pattern', undefined);
    } else if (l.type === 'fill' && !isOurs(id)) {
      if (src === 'water') set(map, 'paint', id, 'fill-color', th.water);
      else if (src === 'landuse') set(map, 'paint', id, 'fill-color', th.land);
      else if (src === 'park') set(map, 'paint', id, 'fill-color', th.park);
      else if (src === 'landcover') set(map, 'paint', id, 'fill-color', /wood|forest/.test(id) ? th.wood : th.park);
      else if (src === 'building') { set(map, 'paint', id, 'fill-color', th.building); set(map, 'paint', id, 'fill-outline-color', th.building); }
    } else if (l.type === 'line' && !isOurs(id)) {
      if (src === 'waterway') set(map, 'paint', id, 'line-color', th.water);
      else if (src === 'boundary') set(map, 'paint', id, 'line-color', th.boundary);
      else if (src === 'transportation') {
        const c = /rail|transit/.test(id) ? th.rail : /casing/.test(id) ? th.road.casing : /motorway|trunk/.test(id) ? th.road.motorway
          : /major|primary|secondary/.test(id) ? th.road.major : /path|pier|track/.test(id) ? th.road.path : th.road.minor;
        set(map, 'paint', id, 'line-color', c);
      }
    } else if (l.type === 'symbol' && 'layout' in l && l.layout?.['text-field'] !== undefined && id !== 'atlas-places') {
      set(map, 'paint', id, 'text-color', th.label);
      set(map, 'paint', id, 'text-halo-color', th.halo);
      set(map, 'layout', id, 'text-font', FONTS[th.font]);
    }
  }
  set(map, 'paint', 'atlas-grass', 'fill-color', th.park);
  if (map.getLayer(BUILDINGS_3D)) {
    const [low, mid, tall] = th.extrusion;
    set(map, 'paint', BUILDINGS_3D, 'fill-extrusion-color', ['step', ['coalesce', ['get', 'render_height'], 0], low, 18, mid, 60, tall]);
  }
  for (const id of [TREES_LAYER, TREES_LAYER_WOOD]) set(map, 'paint', id, 'fill-opacity', th.noTrees ? 0 : ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 0.9]);
  setGraticule(map, th.graticule ?? null);
}

/** Put every recorded property back exactly as it was. */
export function restoreTheme(map: MLMap) {
  const saved = originals.get(map);
  if (saved) {
    for (const s of saved.values()) {
      if (!map.getLayer(s.layer)) continue;
      try {
        if (s.kind === 'paint') dyn(map).setPaintProperty(s.layer, s.prop, s.value);
        else dyn(map).setLayoutProperty(s.layer, s.prop, s.value);
      } catch { /* layer changed */ }
    }
    saved.clear();
  }
  setGraticule(map, null);
}

/** Forget recorded originals (after a style reload they no longer apply). */
export function resetThemeState(map: MLMap) { originals.get(map)?.clear(); }

function setGraticule(map: MLMap, color: string | null) {
  if (!color) {
    if (map.getLayer(GRATICULE)) map.removeLayer(GRATICULE);
    if (map.getSource(GRATICULE)) map.removeSource(GRATICULE);
    return;
  }
  if (!map.getSource(GRATICULE)) {
    const features = [];
    for (let lng = -180; lng <= 180; lng += 1) features.push({ type: 'Feature' as const, properties: { major: lng % 10 === 0 }, geometry: { type: 'LineString' as const, coordinates: [[lng, -85], [lng, 85]] } });
    for (let lat = -80; lat <= 80; lat += 1) features.push({ type: 'Feature' as const, properties: { major: lat % 10 === 0 }, geometry: { type: 'LineString' as const, coordinates: [[-180, lat], [180, lat]] } });
    map.addSource(GRATICULE, { type: 'geojson', data: { type: 'FeatureCollection', features } });
  }
  if (!map.getLayer(GRATICULE)) {
    const firstSymbol = map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
    map.addLayer({ id: GRATICULE, type: 'line', source: GRATICULE, paint: { 'line-color': color, 'line-width': ['case', ['get', 'major'], 1.4, 0.6], 'line-dasharray': [4, 3] } }, firstSymbol);
  } else map.setPaintProperty(GRATICULE, 'line-color', color);
}

/** Background textures, generated in-browser (no image assets). */
function ensureTexture(map: MLMap, tex: Texture) {
  const id = `atlas-tex-${tex}`;
  if (map.hasImage(id)) return;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const base: Record<Texture, string> = { parchment: '#e6c891', paper: '#ece4d2', stars: '#0b1030', linen: '#e4d9bd' };
  ctx.fillStyle = base[tex];
  ctx.fillRect(0, 0, S, S);
  if (tex === 'stars') {
    for (let i = 0; i < 70; i++) { ctx.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.7})`; const r = rnd() < 0.1 ? 1.4 : 0.7; ctx.beginPath(); ctx.arc(rnd() * S, rnd() * S, r, 0, Math.PI * 2); ctx.fill(); }
  } else if (tex === 'linen') {
    for (let i = 0; i < S; i += 2) { ctx.fillStyle = `rgba(90,70,40,${0.03 + rnd() * 0.04})`; ctx.fillRect(i, 0, 1, S); ctx.fillRect(0, i, S, 1); }
  } else {
    for (let i = 0; i < 2600; i++) { const v = tex === 'parchment' ? 90 : 120; ctx.fillStyle = `rgba(${v},${v - 30},${v - 60},${rnd() * (tex === 'parchment' ? 0.09 : 0.05)})`; ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); }
    if (tex === 'parchment') for (let i = 0; i < 6; i++) { const g = ctx.createRadialGradient(rnd() * S, rnd() * S, 0, rnd() * S, rnd() * S, 30 + rnd() * 40); g.addColorStop(0, 'rgba(120,70,20,0.10)'); g.addColorStop(1, 'rgba(120,70,20,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, S, S); }
  }
  map.addImage(id, ctx.getImageData(0, 0, S, S));
}

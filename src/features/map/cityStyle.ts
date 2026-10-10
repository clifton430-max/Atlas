/**
 * "Illustrated city" look, applied to the basemap style before it is
 * committed (see atlasStyle.injectAtlasLayers). Everything is drawn from the
 * REAL vector-tile geometry; only colours and tree symbols are decorative:
 *
 *   - Warm palette (default Light/Positron style only, matched by layer id).
 *   - 3D buildings: OSM footprints extruded to their mapped heights
 *     (`render_height` / `render_min_height`; OpenMapTiles estimates a height
 *     from building levels or uses a default when none is mapped). Facade
 *     colours vary decoratively by height band and feature id.
 *   - Real green areas drawn green (OpenMapTiles `landcover` grass: parks,
 *     gardens, meadows — Positron doesn't draw them).
 *   - Decorative tree canopies as a fill pattern, ONLY inside mapped parks,
 *     gardens, nature reserves and woods. They mark "green area", not
 *     individual real trees.
 *   - A warm directional light for the extrusions.
 *
 * The legend (MapLegend) states which parts are real and which decorative.
 */
import type { ExpressionSpecification, FillLayerSpecification, LayerSpecification, LightSpecification, StyleSpecification } from 'maplibre-gl';

export const BUILDINGS_3D = 'atlas-buildings-3d';
export const TREES_LAYER = 'atlas-trees';
export const TREES_LAYER_WOOD = 'atlas-trees-wood';
export const TREE_PATTERN = 'atlas-tree-pattern';
export const GRASS_LAYER = 'atlas-grass';
const SELECTED_BUILDING = '#2f5bea';
export const DAY_LIGHT: LightSpecification = { anchor: 'viewport', color: '#fff6e8', intensity: 0.28, position: [1.15, 200, 40] };

/** Positron layer id -> paint overrides (warm, illustrated palette). */
const WARM_POSITRON: Record<string, Record<string, unknown>> = {
  background: { 'background-color': '#f1ece2' },
  park: { 'fill-color': '#cfe6b6', 'fill-opacity': 1 },
  landcover_wood: { 'fill-color': '#bcdca2', 'fill-opacity': 1 },
  water: { 'fill-color': '#8ecbe8' },
  waterway: { 'line-color': '#8ecbe8' },
  landuse_residential: { 'fill-color': '#ece5d7' },
  building: { 'fill-color': '#e6ddcd', 'fill-outline-color': '#d5c9b4' },
  highway_path: { 'line-color': '#e3d7c1' },
  highway_minor: { 'line-color': '#ffffff' },
  highway_major_casing: { 'line-color': '#e0d4bf' },
  highway_major_inner: { 'line-color': '#ffffff' },
  highway_motorway_casing: { 'line-color': '#e8c98a' },
  highway_motorway_inner: { 'line-color': '#fbe6b2' },
  highway_motorway_bridge_casing: { 'line-color': '#e8c98a' },
  highway_motorway_bridge_inner: { 'line-color': '#fbe6b2' },
  railway: { 'line-color': '#b9ae9c' },
  railway_transit: { 'line-color': '#b9ae9c' },
  railway_service: { 'line-color': '#c9bfae' },
};

/** Heuristic: the stock OpenFreeMap Positron style (it has no `name`). */
export function isPositron(style: StyleSpecification): boolean {
  const ids = new Set(style.layers.map((l) => l.id));
  return ids.has('highway_major_subtle') && ids.has('landuse_residential') && ids.has('building');
}

const idIndex: ExpressionSpecification = ['%', ['to-number', ['id'], 0], 4];
const pick = (colors: [string, string, string, string]): ExpressionSpecification =>
  ['match', idIndex, 0, colors[0], 1, colors[1], 2, colors[2], colors[3]];

/** Decorative facade colours by height band; the selected building (feature id) is highlighted. */
export function buildingColor(selectedId: number | string | null): ExpressionSpecification {
  const palette: ExpressionSpecification = ['step', ['coalesce', ['get', 'render_height'], 0],
    pick(['#f6e4cb', '#efcfaa', '#f4d9bd', '#e8bf98']), // low-rise: cream, sand, peach, terracotta
    18, pick(['#f3e6d1', '#e9d5b9', '#f5ecdd', '#e2cdae']), // mid-rise: warm stone
    60, pick(['#a8cdf0', '#93bfe9', '#b7d6f3', '#8ab6e2']), // towers: blue glass
  ];
  return selectedId == null ? palette : ['case', ['==', ['id'], selectedId], SELECTED_BUILDING, palette];
}

function buildingsLayer(visible: boolean): LayerSpecification {
  return {
    id: BUILDINGS_3D,
    type: 'fill-extrusion',
    source: 'openmaptiles',
    'source-layer': 'building',
    minzoom: 14,
    layout: { visibility: visible ? 'visible' : 'none' },
    paint: {
      'fill-extrusion-color': buildingColor(null),
      // Grow in between z14 and z14.6 so buildings don't pop.
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.6, ['coalesce', ['get', 'render_height'], 0]],
      'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.6, ['coalesce', ['get', 'render_min_height'], 0]],
      'fill-extrusion-opacity': 0.94,
      'fill-extrusion-vertical-gradient': true,
    },
  };
}

function treeLayers(visible: boolean): LayerSpecification[] {
  const paint: FillLayerSpecification['paint'] = {
    'fill-pattern': TREE_PATTERN,
    'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 0.95],
  };
  const layout: FillLayerSpecification['layout'] = { visibility: visible ? 'visible' : 'none' };
  const polygon: ExpressionSpecification = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
  return [
    { id: TREES_LAYER, type: 'fill', source: 'openmaptiles', 'source-layer': 'park', minzoom: 13, filter: polygon, layout, paint },
    { id: TREES_LAYER_WOOD, type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', minzoom: 13,
      filter: ['all', polygon, ['any', ['==', ['get', 'class'], 'wood'], ['match', ['get', 'subclass'], ['park', 'garden'], true, false]]], layout, paint },
  ];
}

/**
 * Apply the city look to an OpenMapTiles-based style. Pre-existing extrusion
 * layers (e.g. Liberty's) are replaced by ours so buildings aren't drawn twice.
 */
export function applyCityStyle(style: StyleSpecification, opts: { buildings3d: boolean; trees: boolean }): StyleSpecification {
  const warm = isPositron(style);
  let layers = style.layers
    .filter((l) => !(l.type === 'fill-extrusion' && 'source-layer' in l && l['source-layer'] === 'building'))
    .map((l) => (warm && WARM_POSITRON[l.id] ? { ...l, paint: { ...(('paint' in l && l.paint) || {}), ...WARM_POSITRON[l.id] } } as LayerSpecification : l));

  // Green areas and trees go under water (parks often contain ponds) and roads; buildings under all labels.
  const grass: LayerSpecification[] = warm ? [{
    id: GRASS_LAYER, type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
    filter: ['==', ['get', 'class'], 'grass'], paint: { 'fill-color': '#cfe6b6', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.4, 12, 1] },
  }] : [];
  const below = (sl: string) => layers.findIndex((l) => 'source-layer' in l && l['source-layer'] === sl);
  const firstWater = below('water');
  const firstRoad = below('transportation');
  const r = firstWater >= 0 ? firstWater : firstRoad >= 0 ? firstRoad : layers.length;
  layers = [...layers.slice(0, r), ...grass, ...treeLayers(opts.trees), ...layers.slice(r)];
  const firstSymbol = layers.findIndex((l) => l.type === 'symbol');
  const at = firstSymbol < 0 ? layers.length : firstSymbol;
  layers = [...layers.slice(0, at), buildingsLayer(opts.buildings3d), ...layers.slice(at)];

  return { ...style, layers, light: DAY_LIGHT };
}

/** Repeating canopy tile for the decorative tree pattern (drawn once per style). */
export function treePatternImage(): ImageData | null {
  const S = 40;
  const c = document.createElement('canvas');
  c.width = c.height = S * 2;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.scale(2, 2);
  const tree = (x: number, y: number, r: number) => {
    ctx.fillStyle = 'rgba(46,94,48,0.28)'; // soft shadow
    ctx.beginPath(); ctx.ellipse(x + r * 0.35, y + r * 0.45, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6fae5a';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8cc472'; // highlight
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.55, 0, Math.PI * 2); ctx.fill();
  };
  tree(9, 10, 5.5); tree(28, 7, 4.5); tree(19, 24, 6); tree(34, 30, 5); tree(6, 33, 4);
  return ctx.getImageData(0, 0, S * 2, S * 2);
}

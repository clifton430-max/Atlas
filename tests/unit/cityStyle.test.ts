import { describe, expect, it } from 'vitest';
import type { StyleSpecification } from 'maplibre-gl';
import { applyCityStyle, BUILDINGS_3D, buildingColor, GRASS_LAYER, isPositron, TREES_LAYER, TREES_LAYER_WOOD } from '@/features/map/cityStyle';

const src = { openmaptiles: { type: 'vector', url: 'https://example.invalid' } } as StyleSpecification['sources'];
const fill = (id: string, sl: string) => ({ id, type: 'fill', source: 'openmaptiles', 'source-layer': sl, paint: { 'fill-color': '#000' } });
const positron = {
  version: 8, sources: src, layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#fff' } },
    fill('park', 'park'), fill('water', 'water'), fill('landuse_residential', 'landuse'), fill('building', 'building'),
    { id: 'highway_major_subtle', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
    { id: 'label_city', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place' },
  ],
} as unknown as StyleSpecification;
const liberty = {
  version: 8, sources: src, layers: [
    fill('park', 'park'), fill('water', 'water'), fill('building', 'building'),
    { id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building' },
    { id: 'road', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
    { id: 'label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place' },
  ],
} as unknown as StyleSpecification;
const ids = (s: StyleSpecification) => s.layers.map((l) => l.id);

describe('city style transform', () => {
  it('detects the default Positron style only', () => {
    expect(isPositron(positron)).toBe(true);
    expect(isPositron(liberty)).toBe(false);
  });

  it('adds 3D buildings below all labels and green/trees below water', () => {
    const out = ids(applyCityStyle(positron, { buildings3d: true, trees: true }));
    expect(out.indexOf(BUILDINGS_3D)).toBeLessThan(out.indexOf('label_city'));
    expect(out.indexOf(BUILDINGS_3D)).toBeGreaterThan(out.indexOf('building'));
    for (const l of [GRASS_LAYER, TREES_LAYER, TREES_LAYER_WOOD]) expect(out.indexOf(l)).toBeLessThan(out.indexOf('water'));
  });

  it('extrudes real heights only (render_height / render_min_height)', () => {
    const b = applyCityStyle(positron, { buildings3d: true, trees: true }).layers.find((l) => l.id === BUILDINGS_3D)!;
    expect(b.type).toBe('fill-extrusion');
    expect(JSON.stringify((b as { paint: unknown }).paint)).toContain('render_height');
    expect(JSON.stringify((b as { paint: unknown }).paint)).toContain('render_min_height');
  });

  it('trees are limited to mapped parks, gardens, nature reserves and woods', () => {
    const s = applyCityStyle(positron, { buildings3d: true, trees: true });
    const park = s.layers.find((l) => l.id === TREES_LAYER) as { 'source-layer': string };
    const wood = s.layers.find((l) => l.id === TREES_LAYER_WOOD) as { filter: unknown; 'source-layer': string };
    expect(park['source-layer']).toBe('park');
    expect(wood['source-layer']).toBe('landcover');
    expect(JSON.stringify(wood.filter)).toMatch(/"wood".*"park","garden"/);
  });

  it('respects the 2D and trees-off preferences via visibility', () => {
    const s = applyCityStyle(positron, { buildings3d: false, trees: false });
    const vis = (id: string) => (s.layers.find((l) => l.id === id) as { layout?: { visibility?: string } }).layout?.visibility;
    expect(vis(BUILDINGS_3D)).toBe('none');
    expect(vis(TREES_LAYER)).toBe('none');
  });

  it('replaces an existing extrusion (no double buildings) and leaves non-Positron colours alone', () => {
    const s = applyCityStyle(liberty, { buildings3d: true, trees: true });
    expect(ids(s)).not.toContain('building-3d');
    expect(ids(s).filter((x) => x === BUILDINGS_3D)).toHaveLength(1);
    expect(ids(s)).not.toContain(GRASS_LAYER);
    expect((s.layers.find((l) => l.id === 'park') as unknown as { paint: Record<string, string> }).paint['fill-color']).toBe('#000');
  });

  it('highlights only the selected building id', () => {
    expect(JSON.stringify(buildingColor(null))).not.toContain('case');
    expect(JSON.stringify(buildingColor(123))).toContain('["==",["id"],123]');
  });
});

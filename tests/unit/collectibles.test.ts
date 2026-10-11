import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MONUMENTS, RARITIES, SKINS } from '@/features/collectibles/catalog';
import { PERSONAL_DEFAULT, SKIN_THEMES, skinThemeFor } from '@/features/collectibles/skins';
import { applyTheme, restoreTheme } from '@/features/map/themeApplier';

/** Parse the JSON chunk of a binary glTF file. */
function glbJson(path: string) {
  const buf = readFileSync(path);
  expect(buf.toString('ascii', 0, 4)).toBe('glTF');
  expect(buf.readUInt32LE(4)).toBe(2); // glTF 2.0
  expect(buf.readUInt32LE(8)).toBe(buf.length);
  const len = buf.readUInt32LE(12);
  expect(buf.toString('ascii', 16, 20)).toBe('JSON');
  return JSON.parse(buf.toString('utf8', 20, 20 + len)) as { meshes: unknown[]; materials: { pbrMetallicRoughness?: { baseColorFactor?: number[] } }[] };
}

describe('collectible catalog and 3D assets', () => {
  it('has ≥5 monuments and ≥5 skins per regular rarity and exactly ONE of each at Celestial', () => {
    for (const r of RARITIES.filter((x) => x !== 'celestial')) {
      expect(MONUMENTS.filter((m) => m.rarity === r).length, r).toBeGreaterThanOrEqual(5);
      expect(SKINS.filter((s) => s.rarity === r).length, r).toBeGreaterThanOrEqual(5);
    }
    expect(MONUMENTS.filter((m) => m.rarity === 'celestial').map((m) => m.id)).toEqual(['farnese-atlas']);
    expect(SKINS.filter((s) => s.rarity === 'celestial').map((s) => s.id)).toEqual(['atlas-of-the-heavens']);
    expect(RARITIES.at(-1)).toBe('celestial'); // ranks above Mythic
    expect(new Set(MONUMENTS.map((m) => m.id)).size).toBe(MONUMENTS.length);
    expect(new Set(SKINS.map((m) => m.id)).size).toBe(SKINS.length);
  });

  it('real landmarks have verified Wikidata ids and coordinates; fictional ones have none and say so', () => {
    for (const m of MONUMENTS) {
      if (m.fictional) {
        expect(m.wikidata, m.id).toBeNull();
        expect(m.latitude, m.id).toBeNull();
        expect(m.region).toBe('Atlas Originals');
        expect(m.description).toMatch(/^Fictional/);
        continue;
      }
      expect(m.wikidata, m.id).toMatch(/^Q\d+$/);
      expect(Math.abs(m.latitude!), m.id).toBeLessThanOrEqual(90);
      expect(Math.abs(m.longitude!), m.id).toBeLessThanOrEqual(180);
    }
  });

  it('every monument is a real, coloured binary glTF model (not a placeholder)', () => {
    for (const m of MONUMENTS) {
      const path = `public${m.model.file}`;
      expect(existsSync(path), path).toBe(true);
      const j = glbJson(path);
      expect(j.meshes.length, m.id).toBeGreaterThan(0);
      const colors = new Set(j.materials.map((x) => JSON.stringify(x.pbrMetallicRoughness?.baseColorFactor?.map((c) => c.toFixed(2)))));
      expect(colors.size, `${m.id} should have several coloured materials`).toBeGreaterThanOrEqual(3);
      expect(m.model.triangles).toBeGreaterThan(300);
    }
  });
});

describe('map skins', () => {
  it('every skin has a real theme and no two skins share a palette', () => {
    for (const s of SKINS) expect(skinThemeFor(s.defId), s.id).not.toBeNull();
    const sig = Object.values(SKIN_THEMES).map((t) => [t.background, t.land, t.water, t.road.major, t.label, t.font].join('|'));
    expect(new Set(sig).size).toBe(Object.keys(SKIN_THEMES).length);
    expect(Object.keys(SKIN_THEMES)).toHaveLength(SKINS.length);
  });

  it('applies to the live style and restores the exact original values', () => {
    const paint: Record<string, Record<string, unknown>> = {
      background: { 'background-color': '#f1ece2' }, water: { 'fill-color': '#8ecbe8' }, highway_minor: { 'line-color': '#fff' },
      label_city: { 'text-color': '#000', 'text-halo-color': '#fff' },
    };
    const layout: Record<string, Record<string, unknown>> = { label_city: { 'text-font': ['Noto Sans Regular'], 'text-field': '{name}' } };
    const layers = [
      { id: 'background', type: 'background' }, { id: 'water', type: 'fill', 'source-layer': 'water' },
      { id: 'highway_minor', type: 'line', 'source-layer': 'transportation' }, { id: 'label_city', type: 'symbol', 'source-layer': 'place', layout: layout.label_city },
    ];
    const before = JSON.stringify({ paint, layout });
    const map = {
      getStyle: () => ({ layers }), getLayer: (id: string) => layers.find((l) => l.id === id),
      getPaintProperty: (l: string, p: string) => paint[l]?.[p], getLayoutProperty: (l: string, p: string) => layout[l]?.[p],
      setPaintProperty: (l: string, p: string, v: unknown) => { (paint[l] ??= {})[p] = v; },
      setLayoutProperty: (l: string, p: string, v: unknown) => { (layout[l] ??= {})[p] = v; },
      getSource: () => null, removeLayer() {}, removeSource() {}, addSource() {}, addLayer() {}, hasImage: () => true, addImage() {},
    };
    applyTheme(map as never, SKIN_THEMES['midnight-navigator']);
    expect(paint.background['background-color']).toBe('#141b33');
    expect(paint.water['fill-color']).toBe('#0b1226');
    expect(paint.label_city['text-color']).toBe('#e8ecff');
    applyTheme(map as never, PERSONAL_DEFAULT); // switching skins keeps the first originals
    restoreTheme(map as never);
    // Properties that were undefined originally come back as undefined.
    const clean = JSON.parse(JSON.stringify({ paint, layout }));
    expect(JSON.stringify(clean)).toBe(before);
  });
});

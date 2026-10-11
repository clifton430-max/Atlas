/**
 * Collectible catalog (client view). The SAME data seeds public.collectible_defs
 * (migration 0017); tests/db/collectibles.test.ts asserts they match. Which
 * reward a roll gives is decided only by the server.
 *
 * Monument models: ORIGINAL procedural miniatures built by
 * scripts/models/build.mjs (three.js primitives -> binary glTF in
 * public/models/monuments). No third-party meshes or textures. Landmarks were
 * chosen whose designs are in the public domain (ancient sites, or designers
 * who died more than 70 years ago). Coordinates and Wikidata ids were verified
 * against Wikidata (P625) on 2026-10-10 (catalog v1) and 2026-10-11 (v2).
 *
 * "Atlas Originals" are FICTIONAL monuments invented for Atlas (`fictional`):
 * they have no real location and the UI always says so.
 *
 * Celestial is the tier above Mythic: exactly ONE reward per crate.
 */
import data from './catalog.data.json';
import manifest from './models.manifest.json';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'celestial';
export type CrateKind = 'monument' | 'skin';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'celestial'];

/** Colour + label per rarity (always shown with text; colour is never the only cue). */
export const RARITY: Record<Rarity, { label: string; color: string; soft: string; ink: string }> = {
  common: { label: 'Common', color: '#7d8590', soft: '#eef0f2', ink: '#3b4148' },
  uncommon: { label: 'Uncommon', color: '#2f9e44', soft: '#e6f6ea', ink: '#1d5f2a' },
  rare: { label: 'Rare', color: '#2f6fea', soft: '#e8effd', ink: '#1d48a3' },
  epic: { label: 'Epic', color: '#8a3ffc', soft: '#f1e8ff', ink: '#5a1fb5' },
  legendary: { label: 'Legendary', color: '#e8890c', soft: '#fff2df', ink: '#8a4d00' },
  mythic: { label: 'Mythic', color: '#e0245e', soft: '#ffe6ee', ink: '#9b0f3d' },
  // Above Mythic: midnight blue and starlight gold (always shown with its name).
  celestial: { label: 'Celestial', color: '#c9a227', soft: '#f6f0dc', ink: '#2a2470' },
};

export interface MonumentDef {
  id: string; defId: string; name: string; rarity: Rarity; region: string;
  /** Real landmarks only (null for fictional Atlas Originals). */
  wikidata: string | null;
  latitude: number | null; longitude: number | null; description: string;
  /** Invented for Atlas — not a real place. */
  fictional: boolean;
  model: { file: string; bytes: number; triangles: number; version: string };
  /** Model units (normalized height = 1) -> metres at scale 1: the LARGEST dimension spans `sizeMeters`. */
  heightMeters: number;
  /** Largest dimension in metres at scale 1 (miniatures are oversized to read on the map). */
  sizeMeters: number;
  attribution: string;
}
export interface SkinDef { id: string; defId: string; name: string; rarity: Rarity; description: string }

type Manifest = Record<string, { file: string; bytes: number; triangles: number; sha256: string; size: { x: number; y: number; z: number } }>;
const m = manifest as Manifest;
/** Largest dimension in metres at scale 1, growing with rarity. */
const SIZE: Record<Rarity, number> = { common: 70, uncommon: 80, rare: 90, epic: 100, legendary: 115, mythic: 130, celestial: 150 };

export const MONUMENTS: MonumentDef[] = data.monuments.map((x) => ({
  ...x, rarity: x.rarity as Rarity, defId: `monument:${x.id}`, fictional: 'fictional' in x && x.fictional === true,
  wikidata: x.wikidata ?? null, latitude: x.latitude ?? null, longitude: x.longitude ?? null,
  model: { file: m[x.id].file, bytes: m[x.id].bytes, triangles: m[x.id].triangles, version: m[x.id].sha256 },
  sizeMeters: SIZE[x.rarity as Rarity],
  heightMeters: SIZE[x.rarity as Rarity] / Math.max(1, m[x.id].size.x, m[x.id].size.z),
  attribution: 'fictional' in x && x.fictional ? 'Original Atlas miniature of a fictional monument (procedural model, scripts/models).' : 'Original Atlas miniature (procedural model, scripts/models). Landmark location: Wikidata.',
}));
export const SKINS: SkinDef[] = data.skins.map((x) => ({ ...x, rarity: x.rarity as Rarity, defId: `skin:${x.id}` }));

export const MONUMENT_BY_DEF = new Map(MONUMENTS.map((x) => [x.defId, x]));
export const SKIN_BY_DEF = new Map(SKINS.map((x) => [x.defId, x]));
export const defName = (defId: string) => MONUMENT_BY_DEF.get(defId)?.name ?? SKIN_BY_DEF.get(defId)?.name ?? defId;
export const defRarity = (defId: string): Rarity | null => MONUMENT_BY_DEF.get(defId)?.rarity ?? SKIN_BY_DEF.get(defId)?.rarity ?? null;

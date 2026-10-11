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
 * against Wikidata (P625) on 2026-10-10.
 */
import data from './catalog.data.json';
import manifest from './models.manifest.json';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type CrateKind = 'monument' | 'skin';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

/** Colour + label per rarity (always shown with text; colour is never the only cue). */
export const RARITY: Record<Rarity, { label: string; color: string; soft: string; ink: string }> = {
  common: { label: 'Common', color: '#7d8590', soft: '#eef0f2', ink: '#3b4148' },
  uncommon: { label: 'Uncommon', color: '#2f9e44', soft: '#e6f6ea', ink: '#1d5f2a' },
  rare: { label: 'Rare', color: '#2f6fea', soft: '#e8effd', ink: '#1d48a3' },
  epic: { label: 'Epic', color: '#8a3ffc', soft: '#f1e8ff', ink: '#5a1fb5' },
  legendary: { label: 'Legendary', color: '#e8890c', soft: '#fff2df', ink: '#8a4d00' },
  mythic: { label: 'Mythic', color: '#e0245e', soft: '#ffe6ee', ink: '#9b0f3d' },
};

export interface MonumentDef {
  id: string; defId: string; name: string; rarity: Rarity; region: string; wikidata: string;
  latitude: number; longitude: number; description: string;
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
const SIZE: Record<Rarity, number> = { common: 70, uncommon: 80, rare: 90, epic: 100, legendary: 115, mythic: 130 };

export const MONUMENTS: MonumentDef[] = data.monuments.map((x) => ({
  ...x, rarity: x.rarity as Rarity, defId: `monument:${x.id}`,
  model: { file: m[x.id].file, bytes: m[x.id].bytes, triangles: m[x.id].triangles, version: m[x.id].sha256 },
  sizeMeters: SIZE[x.rarity as Rarity],
  heightMeters: SIZE[x.rarity as Rarity] / Math.max(1, m[x.id].size.x, m[x.id].size.z),
  attribution: 'Original Atlas miniature (procedural model, scripts/models). Landmark location: Wikidata.',
}));
export const SKINS: SkinDef[] = data.skins.map((x) => ({ ...x, rarity: x.rarity as Rarity, defId: `skin:${x.id}` }));

export const MONUMENT_BY_DEF = new Map(MONUMENTS.map((x) => [x.defId, x]));
export const SKIN_BY_DEF = new Map(SKINS.map((x) => [x.defId, x]));
export const defName = (defId: string) => MONUMENT_BY_DEF.get(defId)?.name ?? SKIN_BY_DEF.get(defId)?.name ?? defId;
export const defRarity = (defId: string): Rarity | null => MONUMENT_BY_DEF.get(defId)?.rarity ?? SKIN_BY_DEF.get(defId)?.rarity ?? null;

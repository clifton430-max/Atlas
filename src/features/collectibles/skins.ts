/**
 * Map skins: real cartographic themes applied to the live MapLibre style of a
 * PERSONAL map (never to Discover or collaboration maps).
 *
 * A theme changes paint/layout properties of the loaded basemap layers,
 * classified generically by layer type and OpenMapTiles source-layer, so it
 * works with every supported basemap style (Light/Positron, Bright, Liberty):
 * background, land use, water, parks/green, woods, flat buildings and 3D
 * buildings, road hierarchy (minor / major / motorway / casings), rail,
 * boundaries, label colour/halo and label typography (the OpenFreeMap glyph
 * server offers Noto Sans Regular / Bold / Italic). Effects that MapLibre can
 * really render: background textures (generated in-browser), a decorative
 * graticule grid, and a vignette overlay. Nothing else is claimed.
 */
export type LabelFont = 'regular' | 'bold' | 'italic';
export type Texture = 'parchment' | 'paper' | 'stars' | 'linen';

export interface SkinTheme {
  id: string;
  background: string;
  land: string;
  water: string;
  park: string;
  wood: string;
  building: string;
  extrusion: [low: string, mid: string, tall: string];
  road: { minor: string; major: string; motorway: string; casing: string; path: string };
  rail: string;
  boundary: string;
  label: string;
  halo: string;
  font: LabelFont;
  /** Optional effects (all render for real; listed in the skin card). */
  texture?: Texture;
  graticule?: string;
  vignette?: string;
  /** Hide decorative tree canopies (e.g. star charts). */
  noTrees?: boolean;
  /**
   * Animated atmosphere drawn over the map while the skin is on (CSS only,
   * never interactive; a still frame under reduced motion).
   */
  overlay?: SkinOverlay;
}
export type SkinOverlay = 'aurora' | 'embers' | 'fireflies' | 'sparkle' | 'petals' | 'heavens';

const t = (id: string, x: Omit<SkinTheme, 'id'>): SkinTheme => ({ id, ...x });

/** The default look of My Maps when no skin is equipped ("the personal world"). */
export const PERSONAL_DEFAULT = t('personal-default', {
  background: '#ece4d2', land: '#e6dcc6', water: '#5c9fb2', park: '#b9cf9d', wood: '#a8c48c', building: '#d9ccb2',
  extrusion: ['#e8dcc4', '#ddd0b6', '#9fb7c6'],
  road: { minor: '#f7f1e3', major: '#fffaf0', motorway: '#e9c27c', casing: '#c7b797', path: '#cdbd9c' },
  rail: '#8c7f6a', boundary: '#6b5f9e', label: '#2f2a55', halo: '#f4eedf', font: 'regular', texture: 'paper',
});

export const SKIN_THEMES: Record<string, SkinTheme> = {
  'coastal-explorer': t('coastal-explorer', {
    background: '#f4ead2', land: '#efe3c4', water: '#39b5c9', park: '#bfe0a0', wood: '#a9d38a', building: '#e8dbbf',
    extrusion: ['#fbeed6', '#f3e1c2', '#9fd3e0'], road: { minor: '#ffffff', major: '#ffffff', motorway: '#ffd27a', casing: '#d8c7a2', path: '#e3d1a8' },
    rail: '#8a8f99', boundary: '#2b8aa0', label: '#11536a', halo: '#ffffff', font: 'regular',
  }),
  'classic-road-atlas': t('classic-road-atlas', {
    background: '#fbf8ef', land: '#f6f1e3', water: '#9ccbe8', park: '#cfe5b4', wood: '#bcd9a0', building: '#e7e1d2',
    extrusion: ['#efe9db', '#e3dccb', '#c9d3dc'], road: { minor: '#ffffff', major: '#f9d648', motorway: '#d7382f', casing: '#9c9481', path: '#c5bca8' },
    rail: '#555555', boundary: '#9a3fa8', label: '#222222', halo: '#ffffff', font: 'bold',
  }),
  'soft-terrain': t('soft-terrain', {
    background: '#ece8df', land: '#e4dfd2', water: '#a9c3c7', park: '#c8d4b3', wood: '#b6c6a0', building: '#d9d2c3',
    extrusion: ['#e3ddcf', '#d8d1c1', '#bfc8c8'], road: { minor: '#f5f2ea', major: '#f7f3ea', motorway: '#e6cfa4', casing: '#cfc6b3', path: '#d4cab5' },
    rail: '#9b948a', boundary: '#a59a8a', label: '#5d574d', halo: '#f2eee5', font: 'regular',
  }),
  'ocean-cartographer': t('ocean-cartographer', {
    background: '#e7efe9', land: '#e1ebe2', water: '#1f5f8b', park: '#bcd7c0', wood: '#a7c9ad', building: '#d3ded6',
    extrusion: ['#dde8e0', '#cfdcd3', '#86aac2'], road: { minor: '#f4f8f5', major: '#ffffff', motorway: '#9ec3dc', casing: '#7d98aa', path: '#9bb3bf' },
    rail: '#33536b', boundary: '#1f5f8b', label: '#123a57', halo: '#eef4f0', font: 'regular', graticule: '#1f5f8b33',
  }),
  'woodland-trails': t('woodland-trails', {
    background: '#e3e6d2', land: '#dde2c9', water: '#5d8aa6', park: '#9dbb7a', wood: '#6f9a58', building: '#cfc8b0',
    extrusion: ['#d8d0b5', '#c9bf9f', '#9fae96'], road: { minor: '#f1ecdb', major: '#f6efd9', motorway: '#d9b06b', casing: '#8f7a55', path: '#8a6a3f' },
    rail: '#5c5240', boundary: '#4f6b3a', label: '#2f3d22', halo: '#eef0e1', font: 'regular', texture: 'linen',
  }),
  'desert-expedition': t('desert-expedition', {
    background: '#f1d9a9', land: '#ebcf98', water: '#3fa7b5', park: '#c9cf8a', wood: '#b4bd77', building: '#e2c18c',
    extrusion: ['#f0d1a0', '#e6c088', '#d8a46b'], road: { minor: '#f8ead0', major: '#fbe6c2', motorway: '#c0582f', casing: '#b98a52', path: '#c99a5e' },
    rail: '#7a5233', boundary: '#a2522c', label: '#5a3216', halo: '#f8e7c6', font: 'bold',
  }),
  'midnight-navigator': t('midnight-navigator', {
    background: '#141b33', land: '#18213d', water: '#0b1226', park: '#1c3a3a', wood: '#1a3334', building: '#222c4c',
    extrusion: ['#2a355a', '#303d66', '#3c5a8f'], road: { minor: '#3a4670', major: '#f2a93b', motorway: '#ffcf5c', casing: '#0e1428', path: '#4b5788' },
    rail: '#6a77a8', boundary: '#8f86ff', label: '#e8ecff', halo: '#0b1020', font: 'regular', noTrees: true,
  }),
  'vintage-survey': t('vintage-survey', {
    background: '#efe3c3', land: '#eadcb7', water: '#b6c9bd', park: '#d8d7a8', wood: '#c9c996', building: '#ddcca5',
    extrusion: ['#e7d6b0', '#dcc89d', '#c9b68d'], road: { minor: '#f6ecd2', major: '#f3e4c2', motorway: '#c99b63', casing: '#7a5b3a', path: '#8b6b45' },
    rail: '#4a3a28', boundary: '#7a3b2e', label: '#4a3320', halo: '#f2e6c8', font: 'italic', texture: 'paper',
  }),
  'alpine-explorer': t('alpine-explorer', {
    background: '#f3f6f8', land: '#eef2f5', water: '#7fb6d9', park: '#cfe1d1', wood: '#a9c8b2', building: '#dde3e8',
    extrusion: ['#f1f4f7', '#e2e8ee', '#b8c8d6'], road: { minor: '#ffffff', major: '#ffffff', motorway: '#6f8aa3', casing: '#9fb0bf', path: '#a7b6c3' },
    rail: '#4f5d6b', boundary: '#4f6f8f', label: '#24384d', halo: '#ffffff', font: 'regular',
  }),
  'golden-cartography': t('golden-cartography', {
    background: '#123329', land: '#16392e', water: '#0c2620', park: '#1f4a37', wood: '#1d4433', building: '#20473a',
    extrusion: ['#2a5444', '#2f5d4b', '#3e6f5a'], road: { minor: '#9c8448', major: '#d4b45f', motorway: '#f0cf72', casing: '#0c2620', path: '#7f6a3a' },
    rail: '#c9a95a', boundary: '#e2c06b', label: '#f3dc9a', halo: '#0d2a21', font: 'italic', graticule: '#d4b45f40', noTrees: true,
  }),
  'imperial-atlas': t('imperial-atlas', {
    background: '#f6efe1', land: '#f2e8d6', water: '#7d9fb4', park: '#cfd7ae', wood: '#bfcb9d', building: '#e6d6c0',
    extrusion: ['#efe2cc', '#e5d3b8', '#c7a07a'], road: { minor: '#fffaf0', major: '#f2d7b0', motorway: '#a3263a', casing: '#8a6a3e', path: '#b08d5a' },
    rail: '#5a2a2a', boundary: '#a3263a', label: '#5a1a24', halo: '#fbf4e6', font: 'bold', vignette: 'rgba(122,32,48,0.22)',
  }),
  'celestial-routes': t('celestial-routes', {
    background: '#0b1030', land: '#121a44', water: '#070b22', park: '#1a2756', wood: '#18234f', building: '#1c2655',
    extrusion: ['#232f66', '#283673', '#34478c'], road: { minor: '#36448a', major: '#8fa6ff', motorway: '#d6deff', casing: '#070b22', path: '#4652a0' },
    rail: '#8fa6ff', boundary: '#b9a6ff', label: '#e3e8ff', halo: '#070b22', font: 'italic', texture: 'stars', graticule: '#8fa6ff55', noTrees: true,
  }),
  'royal-treasure-map': t('royal-treasure-map', {
    background: '#e4c690', land: '#dfbf85', water: '#7aa6a1', park: '#c5c27f', wood: '#b2b06b', building: '#d4b07a',
    extrusion: ['#dcb982', '#cfa86c', '#b98d55'], road: { minor: '#ecd5a6', major: '#b5442e', motorway: '#8f2a1c', casing: '#6a4422', path: '#8a5a2e' },
    rail: '#4a2c16', boundary: '#8f2a1c', label: '#3f2410', halo: '#ead2a0', font: 'italic', texture: 'parchment', vignette: 'rgba(70,40,14,0.35)',
  }),
  'deep-sea-navigator': t('deep-sea-navigator', {
    background: '#04161f', land: '#06212c', water: '#020c12', park: '#0a3b3e', wood: '#08353a', building: '#0b2c37',
    extrusion: ['#0f3a46', '#124654', '#17647a'], road: { minor: '#11505c', major: '#22d3c5', motorway: '#7df9e9', casing: '#020c12', path: '#147a80' },
    rail: '#3ee6d5', boundary: '#22d3c5', label: '#bffaf3', halo: '#02121a', font: 'regular', graticule: '#22d3c533', noTrees: true,
  }),
  'ancient-world-atlas': t('ancient-world-atlas', {
    background: '#e8d6b4', land: '#e2cda6', water: '#93a9a0', park: '#c4c08f', wood: '#b4b07d', building: '#d8c19b',
    extrusion: ['#dfc8a0', '#d3b98d', '#bf9f74'], road: { minor: '#efe0c2', major: '#c78a5a', motorway: '#9a5a36', casing: '#8a6a48', path: '#a07a52' },
    rail: '#5a4632', boundary: '#8a4a3a', label: '#5a3e26', halo: '#ecdcbc', font: 'italic', texture: 'linen', vignette: 'rgba(90,62,38,0.25)',
  }),
  'living-parchment': t('living-parchment', {
    background: '#ecd7aa', land: '#e8d09e', water: '#86aeb0', park: '#c9c88d', wood: '#b6b678', building: '#dcc08e',
    extrusion: ['#e4c995', '#d8b982', '#c4a06a'], road: { minor: '#f3e3bf', major: '#8a3b22', motorway: '#6a2414', casing: '#5a3a1e', path: '#7a4a24' },
    rail: '#3a2410', boundary: '#6a2414', label: '#3a220e', halo: '#f0dcb0', font: 'italic', texture: 'parchment', graticule: '#6a3a1a55', vignette: 'rgba(80,46,18,0.4)',
  }),
  'astral-cartographer': t('astral-cartographer', {
    background: '#170b2e', land: '#22113f', water: '#0d0620', park: '#2f1a52', wood: '#2a174a', building: '#2b1850',
    extrusion: ['#3a2366', '#452b78', '#6a45b8'], road: { minor: '#4a2f80', major: '#c58bff', motorway: '#ffd1ff', casing: '#0d0620', path: '#5a3a96' },
    rail: '#c58bff', boundary: '#ff9bd2', label: '#f3e6ff', halo: '#0d0620', font: 'italic', texture: 'stars', graticule: '#c58bff4d', vignette: 'rgba(10,0,30,0.45)', noTrees: true,
  }),
  'worldmakers-atlas': t('worldmakers-atlas', {
    background: '#f1e2bd', land: '#e9d3a0', water: '#2f6f8f', park: '#7fb069', wood: '#5f9a55', building: '#d8b98a',
    extrusion: ['#e6c793', '#d9b27a', '#4f8aa8'], road: { minor: '#f7ead0', major: '#d4a017', motorway: '#b8860b', casing: '#6a4a1e', path: '#a8823a' },
    rail: '#5a3a14', boundary: '#b8860b', label: '#3a2a10', halo: '#f6e9c8', font: 'bold', texture: 'parchment', graticule: '#b8860b4d', vignette: 'rgba(120,80,10,0.3)',
  }),
};

// ---- Catalog v2 skins ------------------------------------------------------
Object.assign(SKIN_THEMES, {
  'paper-sketch': t('paper-sketch', {
    background: '#f7f6f2', land: '#f2f1ec', water: '#d9dfe3', park: '#e4e8dc', wood: '#d8ddd0', building: '#e6e4de',
    extrusion: ['#efeeea', '#e4e2dc', '#d3d6da'], road: { minor: '#ffffff', major: '#ffffff', motorway: '#c9c9c9', casing: '#8a8a8a', path: '#b5b5b5' },
    rail: '#6b6b6b', boundary: '#8a8a8a', label: '#3a3a3a', halo: '#f7f6f2', font: 'italic', texture: 'paper',
  }),
  'mint-transit': t('mint-transit', {
    background: '#eef7f2', land: '#e6f2ec', water: '#9fd8e0', park: '#bfe6cf', wood: '#a8dbbd', building: '#dcebe3',
    extrusion: ['#e4f1ea', '#d6e8de', '#a9d6c7'], road: { minor: '#ffffff', major: '#ffffff', motorway: '#2bb673', casing: '#b6d3c5', path: '#c4ddd0' },
    rail: '#e94e3c', boundary: '#4a9c7d', label: '#1f4f3e', halo: '#ffffff', font: 'bold',
  }),
  'harvest-fields': t('harvest-fields', {
    background: '#f3e7c4', land: '#ecdcaf', water: '#6fa8b8', park: '#c7c770', wood: '#9fae5c', building: '#e0cc9c',
    extrusion: ['#ead6a6', '#dfc58f', '#b9a670'], road: { minor: '#faf2da', major: '#fbedc7', motorway: '#c98b2e', casing: '#a8894f', path: '#b9975a' },
    rail: '#6e5a32', boundary: '#8a6b2e', label: '#4d3b16', halo: '#f8efd4', font: 'regular', texture: 'linen',
  }),
  'cherry-blossom': t('cherry-blossom', {
    background: '#fdf0f3', land: '#fbe6ec', water: '#9ec9e6', park: '#f6c6d6', wood: '#eeaec4', building: '#f3dde3',
    extrusion: ['#f8e4ea', '#f1d2dc', '#c9b8e6'], road: { minor: '#ffffff', major: '#ffffff', motorway: '#e88aa8', casing: '#d6b0bd', path: '#e3bfcb' },
    rail: '#8e6a78', boundary: '#c76b8e', label: '#6b2b44', halo: '#fff7f9', font: 'italic', overlay: 'petals',
  }),
  'nordic-frost': t('nordic-frost', {
    background: '#eef3f7', land: '#e7eef4', water: '#7fa9c9', park: '#d3e3e8', wood: '#bfd4dc', building: '#dde6ee',
    extrusion: ['#e9f0f5', '#dbe5ed', '#b4c9da'], road: { minor: '#ffffff', major: '#ffffff', motorway: '#9bb8d3', casing: '#a9bccb', path: '#b8c9d6' },
    rail: '#5f7486', boundary: '#6f8fae', label: '#2a3e52', halo: '#f7fafc', font: 'regular', texture: 'linen',
  }),
  'terracotta-villa': t('terracotta-villa', {
    background: '#f5e6d3', land: '#f0dcc4', water: '#3d8fb0', park: '#b7c98a', wood: '#94ae6b', building: '#e3b896',
    extrusion: ['#ecc4a2', '#e0a982', '#c97c56'], road: { minor: '#fbf1e4', major: '#fff3e0', motorway: '#c45a32', casing: '#b88b66', path: '#c79a72' },
    rail: '#6e4a33', boundary: '#a64b2a', label: '#5a2a14', halo: '#fbf0e2', font: 'bold',
  }),
  blueprint: t('blueprint', {
    background: '#1d4f91', land: '#1f5499', water: '#163f75', park: '#2a5fa3', wood: '#2a5fa3', building: '#2c62a8',
    extrusion: ['#2f67ae', '#3570b8', '#4b86cc'], road: { minor: '#9cc3f0', major: '#d6e8ff', motorway: '#ffffff', casing: '#1a467f', path: '#7aaae0' },
    rail: '#d6e8ff', boundary: '#ffffff', label: '#ffffff', halo: '#1d4f91', font: 'regular', graticule: '#ffffff40', noTrees: true,
  }),
  'autumn-ember': t('autumn-ember', {
    background: '#f6e3cc', land: '#f0d6b6', water: '#4f7f99', park: '#e09a4f', wood: '#c4682e', building: '#e2c09c',
    extrusion: ['#ebc9a1', '#dfb184', '#b5764a'], road: { minor: '#fbefe0', major: '#fff1dc', motorway: '#b8441f', casing: '#a87a52', path: '#b9864f' },
    rail: '#5c3a22', boundary: '#9b3d1a', label: '#4d2410', halo: '#fbeedd', font: 'italic', texture: 'linen',
  }),
  'tropical-lagoon': t('tropical-lagoon', {
    background: '#fff6dd', land: '#f8ecc6', water: '#00b3c6', park: '#6fd08c', wood: '#3fb46a', building: '#f2e2b8',
    extrusion: ['#fbe7bf', '#f4d79f', '#5fd3dd'], road: { minor: '#ffffff', major: '#ffffff', motorway: '#ff7a59', casing: '#e1c98f', path: '#e6c98a' },
    rail: '#6f6a52', boundary: '#00a0b0', label: '#00525c', halo: '#ffffff', font: 'bold',
  }),
  'neon-metropolis': t('neon-metropolis', {
    background: '#0d0b1e', land: '#141030', water: '#08061a', park: '#1b1640', wood: '#1b1640', building: '#1d1842',
    extrusion: ['#251d55', '#30256b', '#ff2fb3'], road: { minor: '#2b2366', major: '#00e5ff', motorway: '#ff2fb3', casing: '#08061a', path: '#3a2f80' },
    rail: '#ffe14d', boundary: '#ff2fb3', label: '#e8f9ff', halo: '#0d0b1e', font: 'bold', vignette: 'rgba(120,0,90,0.35)', noTrees: true, overlay: 'sparkle',
  }),
  'jade-dynasty': t('jade-dynasty', {
    background: '#e3efe4', land: '#d7e8d9', water: '#2f7f74', park: '#8fc4a0', wood: '#5f9f7a', building: '#c9dccb',
    extrusion: ['#d0e3d2', '#b9d4be', '#3f8f78'], road: { minor: '#f4faf4', major: '#d4af37', motorway: '#b03a2e', casing: '#5e7f68', path: '#8aa68f' },
    rail: '#2a4a3a', boundary: '#b03a2e', label: '#1d3d30', halo: '#eef6ef', font: 'regular', texture: 'linen', graticule: '#2f7f7433',
  }),
  'arctic-aurora': t('arctic-aurora', {
    background: '#0b1a2a', land: '#11253a', water: '#071321', park: '#163246', wood: '#163246', building: '#1a3149',
    extrusion: ['#1f3b56', '#264766', '#5fd3c2'], road: { minor: '#2a4a68', major: '#7fe3d0', motorway: '#b9f6ff', casing: '#071321', path: '#2f5a78' },
    rail: '#9fd6ff', boundary: '#7fe3d0', label: '#e6fbff', halo: '#071321', font: 'italic', texture: 'stars', vignette: 'rgba(0,20,40,0.4)', noTrees: true, overlay: 'aurora',
  }),
  'volcanic-forge': t('volcanic-forge', {
    background: '#1b1414', land: '#241a19', water: '#120c0c', park: '#2e2220', wood: '#2e2220', building: '#2c201e',
    extrusion: ['#3a2a27', '#4a3430', '#ff5a1f'], road: { minor: '#4a2a1e', major: '#ff7a1a', motorway: '#ffcf33', casing: '#120c0c', path: '#5a3324' },
    rail: '#ff7a1a', boundary: '#ff5a1f', label: '#ffe7d1', halo: '#120c0c', font: 'bold', vignette: 'rgba(80,10,0,0.45)', noTrees: true, overlay: 'embers',
  }),
  'sunken-atlantis': t('sunken-atlantis', {
    background: '#0f3b4a', land: '#14505f', water: '#0a2a36', park: '#1d6a6a', wood: '#1d6a6a', building: '#1a5c6a',
    extrusion: ['#1f6c7a', '#26808c', '#7fe0d0'], road: { minor: '#2c7f8a', major: '#9ff0e0', motorway: '#e8d48a', casing: '#0a2a36', path: '#3a8f96' },
    rail: '#e8d48a', boundary: '#9ff0e0', label: '#e6fffb', halo: '#0a2a36', font: 'italic', graticule: '#9ff0e033', vignette: 'rgba(0,30,40,0.45)', noTrees: true, overlay: 'sparkle',
  }),
  'samurai-ink': t('samurai-ink', {
    background: '#f4efe3', land: '#efe8d8', water: '#4a4a4a', park: '#d8d2c2', wood: '#c4bdab', building: '#e2dccd',
    extrusion: ['#ebe5d6', '#dcd5c4', '#6a6a6a'], road: { minor: '#ffffff', major: '#2b2b2b', motorway: '#b3241f', casing: '#2b2b2b', path: '#7a7a7a' },
    rail: '#2b2b2b', boundary: '#b3241f', label: '#1a1a1a', halo: '#f4efe3', font: 'bold', texture: 'paper', vignette: 'rgba(40,30,20,0.25)',
  }),
  'dragons-hoard': t('dragons-hoard', {
    background: '#2a0f12', land: '#3a1418', water: '#1a0709', park: '#4a1c1e', wood: '#4a1c1e', building: '#4a1a1e',
    extrusion: ['#5a2024', '#6e262a', '#d4af37'], road: { minor: '#6e2a2c', major: '#d4af37', motorway: '#ffd966', casing: '#1a0709', path: '#7a3a2c' },
    rail: '#d4af37', boundary: '#ffd966', label: '#ffe9a8', halo: '#1a0709', font: 'bold', texture: 'linen', graticule: '#d4af3740', vignette: 'rgba(40,0,0,0.5)', noTrees: true, overlay: 'sparkle',
  }),
  'eternal-garden': t('eternal-garden', {
    background: '#e7f3dc', land: '#dcedcb', water: '#4fa3b8', park: '#7fc56a', wood: '#4f9f4a', building: '#d4e2c0',
    extrusion: ['#dbe9c8', '#c8dcb0', '#8fc79a'], road: { minor: '#f7fbef', major: '#fff8dd', motorway: '#e8b84a', casing: '#93ad7c', path: '#a9bf8a' },
    rail: '#4a5a3a', boundary: '#6f9a4a', label: '#24401c', halo: '#f2f9ea', font: 'italic', vignette: 'rgba(20,60,20,0.25)', overlay: 'fireflies',
  }),
  'clockmakers-chart': t('clockmakers-chart', {
    background: '#e9dcc0', land: '#e2d1ad', water: '#5c7f8a', park: '#c2bd8a', wood: '#a8a26e', building: '#d6c29a',
    extrusion: ['#dfc9a0', '#cfb684', '#b87333'], road: { minor: '#f5ecd7', major: '#c9a227', motorway: '#b87333', casing: '#6a5432', path: '#9a7f4c' },
    rail: '#4a3a22', boundary: '#b87333', label: '#3a2c14', halo: '#f2e8d2', font: 'italic', texture: 'parchment', graticule: '#6a543266', vignette: 'rgba(70,45,15,0.35)',
  }),
  // Celestial (the one top-tier skin): Atlas holds up the heavens.
  'atlas-of-the-heavens': t('atlas-of-the-heavens', {
    background: '#070a24', land: '#0f1438', water: '#05071a', park: '#161d4a', wood: '#161d4a', building: '#151b46',
    extrusion: ['#1c2458', '#252f6e', '#f2c94c'], road: { minor: '#2a3478', major: '#f2c94c', motorway: '#fff1b8', casing: '#05071a', path: '#3a4590' },
    rail: '#c9b6ff', boundary: '#f2c94c', label: '#fff4cf', halo: '#05071a', font: 'italic', texture: 'stars', graticule: '#f2c94c59', vignette: 'rgba(5,5,30,0.55)', noTrees: true, overlay: 'heavens',
  }),
} satisfies Record<string, SkinTheme>);

export const skinThemeFor = (defId: string | null | undefined): SkinTheme | null =>
  defId ? SKIN_THEMES[defId.replace(/^skin:/, '')] ?? null : null;

/** Short, honest list of what a skin changes (shown on its card). */
export function skinFeatures(th: SkinTheme): string[] {
  const out = ['Land, water, parks & buildings', 'Road hierarchy & rail', `${th.font === 'italic' ? 'Italic' : th.font === 'bold' ? 'Bold' : 'Regular'} labels`];
  if (th.texture) out.push(`${th.texture[0].toUpperCase()}${th.texture.slice(1)} texture`);
  if (th.graticule) out.push('Navigation grid');
  if (th.vignette) out.push('Vignette');
  if (th.overlay) out.push(OVERLAY_LABEL[th.overlay]);
  return out;
}

export const OVERLAY_LABEL: Record<SkinOverlay, string> = {
  aurora: 'Animated aurora', embers: 'Rising embers', fireflies: 'Drifting fireflies', sparkle: 'Twinkling sparkles',
  petals: 'Falling petals', heavens: 'Living star sky with aurora and shooting stars',
};

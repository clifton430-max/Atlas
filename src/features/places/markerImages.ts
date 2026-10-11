/**
 * Marker images for MapLibre symbol layers.
 *
 * Discovery markers (places and events nobody has saved yet) are SMALL round
 * category badges: a coloured disc with a white rim and a white glyph (Lucide
 * icon geometry) — colour AND glyph identify the category, and they stay
 * small so the map remains readable. Saved and custom pins are the larger
 * droplet markers (pins/DropletMarker.tsx), drawn as HTML so they can carry
 * images, hover cards and selection states.
 *
 * Badges are centred on the coordinate (icon-anchor "center"). Rendered once
 * per style at 2x.
 */
import type { IconNode } from 'lucide';
import type * as maplibregl from 'maplibre-gl';
import { allMarkerKeys } from './categories';
import { TREE_PATTERN, treePatternImage } from '@/features/map/cityStyle';

/** Badge box in CSS px (the disc is a little smaller, leaving room for the shadow). */
export const BADGE = 26;
const RATIO = 2;

function glyph(icon: IconNode): string {
  return icon.map(([tag, attrs]) =>
    `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ')}/>`).join('');
}

/** Small round discovery badge. */
export function badgeSvg(color: string, icon: IconNode): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE * RATIO}" height="${BADGE * RATIO}" viewBox="0 0 ${BADGE} ${BADGE}">`
    + `<circle cx="13" cy="14" r="10.5" fill="rgba(0,0,0,0.22)"/>`
    + `<circle cx="13" cy="13" r="10.5" fill="${color}" stroke="#ffffff" stroke-width="2"/>`
    + `<g transform="translate(7.6 7.6) scale(0.45)" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${glyph(icon)}</g>`
    + '</svg>';
}

function rasterize(svg: string, size: number): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image(size * RATIO, size * RATIO);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = size * RATIO;
      c.height = size * RATIO;
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('no 2d context'));
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, c.width, c.height));
    };
    img.onerror = () => reject(new Error('marker icon failed to render'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

const DEV_KEY = 'event-dev';

/** Register every category image on the current style (idempotent). */
export async function ensureMarkerImages(map: maplibregl.Map): Promise<void> {
  if (!map.hasImage(TREE_PATTERN)) {
    const tree = treePatternImage();
    if (tree) map.addImage(TREE_PATTERN, tree, { pixelRatio: 2 });
  }
  const entries = [...allMarkerKeys(), { key: DEV_KEY, color: '#a3a3a3', icon: allMarkerKeys().find((k) => k.key === 'event-unknown')!.icon }];
  await Promise.all(entries.map(async ({ key, color, icon }) => {
    if (map.hasImage(key)) return;
    try {
      const data = await rasterize(badgeSvg(color, icon), BADGE);
      if (!map.hasImage(key)) map.addImage(key, data, { pixelRatio: RATIO });
    } catch {
      /* a missing icon simply isn't drawn */
    }
  }));
}

export const DEV_FIXTURE_MARKER = DEV_KEY;

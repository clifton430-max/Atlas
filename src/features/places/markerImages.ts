/**
 * Category marker images for MapLibre symbol layers: a colored teardrop pin
 * with a white glyph (Lucide icon geometry) — color AND glyph identify the
 * category. The tip sits MARKER_TIP_PAD px above the image's bottom edge;
 * layers use icon-anchor "bottom" with icon-offset [0, MARKER_TIP_PAD] so the
 * tip is exactly on the real coordinate. Rendered once per style at 2x.
 */
import type { IconNode } from 'lucide';
import type * as maplibregl from 'maplibre-gl';
import { allMarkerKeys } from './categories';
import { TREE_PATTERN, treePatternImage } from '@/features/map/cityStyle';

const W = 36; // CSS px
const H = 48;
const RATIO = 2;
/** Transparent space below the pin tip (keeps the tip inside the hit box). */
export const MARKER_TIP_PAD = 3;

const PIN = 'M18 45C18 45 4.5 30.5 4.5 18.5a13.5 13.5 0 1 1 27 0C31.5 30.5 18 45 18 45Z';

function svgFor(color: string, icon: IconNode): string {
  const body = icon.map(([tag, attrs]) =>
    `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ')}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * RATIO}" height="${H * RATIO}" viewBox="0 0 ${W} ${H}">`
    // soft contact shadow, then the pin with a white rim
    + `<ellipse cx="18" cy="45" rx="5" ry="1.8" fill="rgba(0,0,0,0.22)"/>`
    + `<path d="${PIN}" transform="translate(0 1)" fill="rgba(0,0,0,0.16)"/>`
    + `<path d="${PIN}" fill="${color}" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round"/>`
    + `<g transform="translate(10 10.5) scale(0.6667)" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</g>`
    + '</svg>';
}

function rasterize(svg: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image(W * RATIO, H * RATIO);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = W * RATIO;
      c.height = H * RATIO;
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
      const data = await rasterize(svgFor(color, icon));
      if (!map.hasImage(key)) map.addImage(key, data, { pixelRatio: RATIO });
    } catch {
      /* a missing icon falls back to the circle underneath */
    }
  }));
}

export const DEV_FIXTURE_MARKER = DEV_KEY;

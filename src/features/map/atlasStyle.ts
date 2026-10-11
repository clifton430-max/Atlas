/**
 * Atlas layers injected into the basemap style BEFORE it is committed.
 *
 * Why inject: MapLibre only parses vector-tile source layers referenced by
 * the style. The OpenMapTiles `poi` layer isn't used by the stock style, and
 * adding a layer for it later does not re-parse tiles that are already loaded
 * (verified during the audit). Injecting up front makes every tile carry POIs;
 * category visibility is then driven by setFilter, which does re-parse.
 *
 * The same transform applies the illustrated city look (cityStyle.ts).
 *
 * Styles without the OpenMapTiles source (custom VITE_MAP_STYLE_URL) are left
 * untouched; place categories then report "not supported with this map style".
 */
import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import { PLACE_CATEGORIES } from '@/features/places/categories';
import { MARKER_TIP_PAD } from '@/features/places/markerImages';
import { applyCityStyle } from './cityStyle';
import { getTreesEnabled, getViewMode } from './viewPrefs';

export const PLACES_LAYER = 'atlas-places';
export const PLACES_SOURCE = 'openmaptiles';
export const PLACES_MIN_ZOOM = 13;

/** Filter that shows nothing (used outside Discover / when all places hidden). */
export const NO_PLACES_FILTER: ExpressionSpecification = ['in', ['get', 'subclass'], ['literal', ['__none__']]];

export function placesFilter(subclasses: string[]): ExpressionSpecification {
  return ['all', ['has', 'name'], ['in', ['get', 'subclass'], ['literal', subclasses.length ? subclasses : ['__none__']]]];
}

/** subclass -> marker image key (matches markerImages.allMarkerKeys). */
function iconExpression(): ExpressionSpecification {
  const pairs: string[] = [];
  const seen = new Set<string>();
  for (const c of PLACE_CATEGORIES) {
    for (const s of c.subcategories) {
      for (const m of s.match) {
        if (seen.has(m)) continue;
        seen.add(m);
        pairs.push(m, `place-${c.id}-${s.id}`);
      }
    }
  }
  return ['match', ['get', 'subclass'], ...pairs, ''] as unknown as ExpressionSpecification;
}

/** OpenMapTiles feature id for an OSM element (see places/types.ts decodeOsmFeatureId). */
export function osmFeatureId(osmType: 'node' | 'way' | 'relation', osmId: number): number {
  return osmId * 10 + (osmType === 'node' ? 1 : osmType === 'way' ? 2 : 3);
}

/** Place pin size by zoom; the selected place (feature id) is drawn larger. */
export function placeIconSize(selectedFeatureId: number | null): ExpressionSpecification {
  const sel: ExpressionSpecification = ['==', ['id'], selectedFeatureId ?? -1];
  return ['interpolate', ['linear'], ['zoom'], 13, ['case', sel, 0.95, 0.68], 16, ['case', sel, 1.15, 0.85]];
}

export function supportsPlaces(style: StyleSpecification | null | undefined): boolean {
  return !!style?.sources?.[PLACES_SOURCE];
}

export function injectAtlasLayers(_prev: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification {
  if (!supportsPlaces(next)) return next;
  // City look: warm palette, 3D buildings, decorative trees (see cityStyle.ts).
  const city = applyCityStyle({ ...next, layers: next.layers.filter((l) => !l.id.startsWith('atlas-')) },
    { buildings3d: getViewMode() === '3d', trees: getTreesEnabled() });
  const layers = [...city.layers];
  layers.push({
    id: PLACES_LAYER,
    type: 'symbol',
    source: PLACES_SOURCE,
    'source-layer': 'poi',
    minzoom: PLACES_MIN_ZOOM,
    filter: NO_PLACES_FILTER,
    layout: {
      'icon-image': iconExpression(),
      'icon-anchor': 'bottom',
      'icon-offset': [0, MARKER_TIP_PAD],
      'icon-size': placeIconSize(null),
      'icon-allow-overlap': false,
      'icon-padding': 2,
      // More important places (lower rank) win label/icon collisions.
      'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
      'text-field': ['step', ['zoom'], '', 16, ['get', 'name']],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-offset': [0, 0.35],
      'text-anchor': 'top',
      'text-optional': true,
      'text-max-width': 9,
    },
    paint: {
      'text-color': '#404040',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.4,
    },
  });
  // Paint changes (e.g. switching between Discover and a skinned personal map)
  // cross-fade; instant under reduced motion.
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return { ...city, layers, transition: { duration: reduce ? 0 : 650, delay: 0 } };
}

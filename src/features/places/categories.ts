/**
 * Discover categories — the single source of truth for category labels,
 * colors, icons, subcategories and how they map onto real data:
 *
 *   'events'  -> Ticketmaster events (public.events), subcategories = segments.
 *   all other -> OpenStreetMap points of interest from the basemap's vector
 *                tiles (OpenMapTiles `poi` layer, already downloaded with the
 *                map — no extra provider requests). Matching uses the POI's
 *                `subclass`, which carries the raw OSM tag value.
 *
 * Colors are always paired with an icon and a text label; color is never the
 * only identifier. Category styling applies to Discover markers only and
 * never overrides user-customized personal pins or image markers.
 */
import type { IconNode } from 'lucide';
import {
  Binoculars, Castle, Clapperboard, Coffee, Dumbbell, Film, Flower2, GalleryVerticalEnd, IceCreamCone, Landmark,
  Library, Martini, Music, Palette, PartyPopper, PawPrint, Sandwich, Sparkles, Theater, Ticket, TreePine, Trophy,
  Utensils, Croissant, Mountain, Volleyball, Drama, Waves, Beer, Disc3,
} from 'lucide';

export type CategoryId = 'events' | 'food' | 'pastimes' | 'parks' | 'scenic' | 'nightlife' | 'attractions' | 'arts' | 'sports';

export interface Subcategory {
  id: string;
  label: string;
  /** For places: OSM subclass values. For events: Ticketmaster segment names. */
  match: string[];
  color?: string;
  icon?: IconNode;
}

export interface Category {
  id: CategoryId;
  label: string;
  color: string;
  icon: IconNode;
  source: 'events' | 'places';
  subcategories: Subcategory[];
}

export const CATEGORIES: Category[] = [
  {
    id: 'events', label: 'Events', color: '#2f5bea', icon: Ticket, source: 'events',
    // Event types are color-coded only where Ticketmaster supplies a segment.
    subcategories: [
      { id: 'music', label: 'Music', match: ['Music'], color: '#7e22ce', icon: Music },
      { id: 'sports', label: 'Sports', match: ['Sports'], color: '#15803d', icon: Trophy },
      { id: 'arts-theatre', label: 'Arts & Theatre', match: ['Arts & Theatre'], color: '#be123c', icon: Drama },
      { id: 'film', label: 'Film', match: ['Film'], color: '#a16207', icon: Film },
      { id: 'misc', label: 'Other events', match: ['Miscellaneous'], color: '#2f5bea', icon: Ticket },
    ],
  },
  {
    id: 'food', label: 'Food & Drink', color: '#c2410c', icon: Utensils, source: 'places',
    subcategories: [
      { id: 'restaurants', label: 'Restaurants', match: ['restaurant'] },
      { id: 'cafes', label: 'Cafés', match: ['cafe'], icon: Coffee },
      { id: 'fast-food', label: 'Fast food', match: ['fast_food', 'food_court'], icon: Sandwich },
      { id: 'bakeries', label: 'Bakeries', match: ['bakery', 'pastry'], icon: Croissant },
      { id: 'ice-cream', label: 'Ice cream', match: ['ice_cream'], icon: IceCreamCone },
    ],
  },
  {
    id: 'parks', label: 'Parks & Outdoors', color: '#15803d', icon: TreePine, source: 'places',
    subcategories: [
      { id: 'parks', label: 'Parks', match: ['park', 'dog_park'] },
      { id: 'gardens', label: 'Gardens', match: ['garden'], icon: Flower2 },
      { id: 'nature', label: 'Nature reserves', match: ['nature_reserve'] },
      { id: 'beaches', label: 'Beaches', match: ['beach', 'beach_resort'], icon: Waves },
      { id: 'playgrounds', label: 'Playgrounds', match: ['playground'] },
    ],
  },
  {
    id: 'arts', label: 'Arts & Culture', color: '#7e22ce', icon: Palette, source: 'places',
    subcategories: [
      { id: 'museums', label: 'Museums', match: ['museum'], icon: Landmark },
      { id: 'galleries', label: 'Galleries', match: ['gallery', 'art_gallery'], icon: GalleryVerticalEnd },
      { id: 'public-art', label: 'Public art', match: ['artwork'] },
      { id: 'theatres', label: 'Theatres & concert halls', match: ['theatre', 'concert_hall', 'arts_centre'], icon: Theater },
      { id: 'libraries', label: 'Libraries', match: ['library'], icon: Library },
    ],
  },
  {
    id: 'scenic', label: 'Scenic Views', color: '#0e7490', icon: Binoculars, source: 'places',
    subcategories: [
      { id: 'viewpoints', label: 'Viewpoints', match: ['viewpoint'] },
      { id: 'peaks', label: 'Peaks', match: ['peak', 'volcano'], icon: Mountain },
    ],
  },
  {
    id: 'nightlife', label: 'Nightlife', color: '#4338ca', icon: Martini, source: 'places',
    subcategories: [
      { id: 'bars', label: 'Bars', match: ['bar'], icon: Martini },
      { id: 'pubs', label: 'Pubs & beer gardens', match: ['pub', 'biergarten'], icon: Beer },
      { id: 'clubs', label: 'Nightclubs', match: ['nightclub'], icon: PartyPopper },
      { id: 'music-venues', label: 'Music venues', match: ['music_venue'], icon: Disc3 },
    ],
  },
  {
    id: 'attractions', label: 'Tourist Attractions', color: '#a16207', icon: Landmark, source: 'places',
    subcategories: [
      { id: 'attractions', label: 'Attractions', match: ['attraction'] },
      { id: 'monuments', label: 'Monuments & memorials', match: ['monument', 'memorial'] },
      { id: 'historic', label: 'Castles & historic sites', match: ['castle', 'ruins', 'fort', 'archaeological_site'], icon: Castle },
      { id: 'zoos', label: 'Zoos & aquariums', match: ['zoo', 'aquarium'], icon: PawPrint },
    ],
  },
  {
    id: 'pastimes', label: 'Things to Do', color: '#db2777', icon: Sparkles, source: 'places',
    subcategories: [
      { id: 'cinemas', label: 'Cinemas', match: ['cinema'], icon: Clapperboard },
      { id: 'games', label: 'Bowling, arcades & escape rooms', match: ['bowling_alley', 'amusement_arcade', 'escape_game', 'miniature_golf'] },
      { id: 'theme-parks', label: 'Theme & water parks', match: ['theme_park', 'water_park'] },
    ],
  },
  {
    id: 'sports', label: 'Sports', color: '#4d7c0f', icon: Trophy, source: 'places',
    subcategories: [
      { id: 'stadiums', label: 'Stadiums', match: ['stadium'] },
      { id: 'sports-centres', label: 'Sports centres & gyms', match: ['sports_centre', 'fitness_centre'], icon: Dumbbell },
      { id: 'pools', label: 'Swimming', match: ['swimming_pool', 'swimming_area'], icon: Waves },
      { id: 'courts', label: 'Courts & pitches', match: ['pitch'], icon: Volleyball },
    ],
  },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CategoryId, Category>;
export const PLACE_CATEGORIES = CATEGORIES.filter((c) => c.source === 'places');

/** Drop subcategory picks that no longer exist (e.g. saved before categories changed). */
export function sanitizeSubFilters(subs: Partial<Record<string, string[]>>): Partial<Record<CategoryId, string[]>> {
  const out: Partial<Record<CategoryId, string[]>> = {};
  for (const c of CATEGORIES) {
    const known = (subs[c.id] ?? []).filter((id) => c.subcategories.some((x) => x.id === id));
    if (known.length) out[c.id] = known;
  }
  return out;
}

/** Resolve a POI subclass to its category and subcategory (or null when unsupported). */
export function categorizeSubclass(subclass: string | null | undefined): { category: Category; sub: Subcategory } | null {
  if (!subclass) return null;
  for (const c of PLACE_CATEGORIES) {
    const sub = c.subcategories.find((s) => s.match.includes(subclass));
    if (sub) return { category: c, sub };
  }
  return null;
}

/** Resolve a Ticketmaster segment to the event subcategory (null when unknown). */
export function eventSubcategory(segment: string | null | undefined): Subcategory | null {
  if (!segment) return null;
  return CATEGORY_BY_ID.events.subcategories.find((s) => s.match.includes(segment)) ?? null;
}

/** Visual for an event marker: segment color/icon when known, otherwise the generic event style. */
export function eventVisual(segment: string | null | undefined): { color: string; icon: IconNode; key: string; label: string } {
  const sub = eventSubcategory(segment);
  return sub
    ? { color: sub.color!, icon: sub.icon!, key: `event-${sub.id}`, label: sub.label }
    : { color: CATEGORY_BY_ID.events.color, icon: Ticket, key: 'event-unknown', label: 'Event (type unknown)' };
}

/** Visual for a place marker (subcategory icon when defined, category color always). */
export function placeVisual(subclass: string | null | undefined): { color: string; icon: IconNode; key: string; label: string; categoryId: CategoryId } | null {
  const hit = categorizeSubclass(subclass);
  if (!hit) return null;
  return { color: hit.category.color, icon: hit.sub.icon ?? hit.category.icon, key: `place-${hit.category.id}-${hit.sub.id}`, label: hit.sub.label, categoryId: hit.category.id };
}

/** All POI subclasses that belong to the given visible categories/subcategories. */
export function subclassesFor(visible: CategoryId[], subFilters: Partial<Record<CategoryId, string[]>>): string[] {
  const out: string[] = [];
  for (const c of PLACE_CATEGORIES) {
    if (!visible.includes(c.id)) continue;
    const chosen = subFilters[c.id];
    for (const s of c.subcategories) if (!chosen?.length || chosen.includes(s.id)) out.push(...s.match);
  }
  return [...new Set(out)];
}

/** Every icon image key the map may request (for pre-registration). */
export function allMarkerKeys(): { key: string; color: string; icon: IconNode }[] {
  const out: { key: string; color: string; icon: IconNode }[] = [];
  for (const s of CATEGORY_BY_ID.events.subcategories) out.push({ key: `event-${s.id}`, color: s.color!, icon: s.icon! });
  out.push({ key: 'event-unknown', color: CATEGORY_BY_ID.events.color, icon: Ticket });
  for (const c of PLACE_CATEGORIES) for (const s of c.subcategories) out.push({ key: `place-${c.id}-${s.id}`, color: c.color, icon: s.icon ?? c.icon });
  return out;
}

/**
 * Category look for droplet pins that have no custom colour or icon: a saved
 * place keeps the category it had on the map (a restaurant stays a red
 * droplet with a fork and knife), a saved event its event-type colour.
 * Derived from the pin's validated source snapshot — never from its title.
 */
import type { IconNode } from 'lucide';
import { CATEGORIES, eventVisual } from '@/features/places/categories';
import type { AtlasEvent } from '@/lib/types';
import type { PinSource } from './pinSource';

export interface PinGlyph { color: string; icon: IconNode; label: string }

export function pinGlyph(p: { source?: PinSource | null; event?: AtlasEvent | null }): PinGlyph | null {
  if (p.event) {
    const v = eventVisual(p.event.category);
    return { color: v.color, icon: v.icon, label: v.label };
  }
  const s = p.source;
  if (!s || s.provider !== 'osm' || !s.category) return null;
  const cat = CATEGORIES.find((c) => c.source === 'places' && c.label === s.category);
  if (!cat) return null;
  const sub = cat.subcategories.find((x) => x.label === s.subcategory);
  return { color: cat.color, icon: sub?.icon ?? cat.icon, label: sub?.label ?? cat.label };
}
